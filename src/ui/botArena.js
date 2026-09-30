import {
  STARTERS,
  REFERENCE_DEPTHS,
  MOVE_LIMIT_MS,
  createBotPlayer,
  createReferencePlayer,
  playGame,
  runTournament,
  RULES,
} from '../games/arena.js';
import {
  listBots,
  saveBot,
  deleteBot,
  getStandings,
  publishStandings,
  getUser,
  isAdmin,
  onAuthChange,
} from '../core/community.js';
import { promptSignIn } from './signIn.js';

// The "Bots" tab of a game: official standings (and running the tournament
// yourself), writing and testing your own bot, and watching any two players.

const DRAFT_KEY = (game) => `aiship:bot-draft:${game}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Cancelled extends Error {}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createBotArena(container, { game, title, makeView, sides }) {
  container.innerHTML = `
    <p class="page-lede">Write a bot that plays ${title}: a JavaScript function <code>chooseMove(state, api)</code> that returns a move.
      Bots run sealed off (no network, no access to the page), get ${MOVE_LIMIT_MS / 1000} seconds per move, and lose if they error,
      run out of time or play an illegal move. <code>Math.random</code> is seeded, so a tournament gives the same result every time it's run.</p>
    <div class="arena-grid">
      <section class="arena-card">
        <h2>Standings</h2>
        <p class="arena-muted" data-role="published"></p>
        <div data-role="standings"></div>
        <div class="arena-row">
          <button type="button" class="btn btn-ghost" data-role="run">Run the tournament here</button>
          <button type="button" class="btn btn-primary hidden" data-role="publish">Publish these standings</button>
        </div>
        <p class="arena-muted" data-role="progress"></p>
        <ul class="arena-notes" data-role="notes"></ul>
      </section>
      <section class="arena-card">
        <h2>Your bot</h2>
        <div class="arena-row">
          <select data-role="mine" aria-label="Your bots"></select>
          <input data-role="name" maxlength="60" placeholder="Bot name" aria-label="Bot name" />
        </div>
        <textarea data-role="code" spellcheck="false" aria-label="Bot code"></textarea>
        <div class="arena-row">
          <select data-role="opponent" aria-label="Test against"></select>
          <button type="button" class="btn btn-ghost" data-role="test">Test (2 games)</button>
        </div>
        <div class="arena-row">
          <button type="button" class="btn btn-primary" data-role="save">Save and submit for review</button>
          <button type="button" class="btn btn-ghost hidden" data-role="delete">Delete</button>
          <button type="button" class="btn btn-ghost" data-role="reset">Start from the example</button>
        </div>
        <p class="arena-status" data-role="status" aria-live="polite"></p>
      </section>
    </div>
    <section class="arena-card arena-watch">
      <h2>Watch a game</h2>
      <div class="arena-row">
        <select data-role="watch-a" aria-label="Moves first"></select>
        <span class="arena-muted">vs</span>
        <select data-role="watch-b" aria-label="Moves second"></select>
        <button type="button" class="btn btn-ghost" data-role="watch">Watch</button>
      </div>
      <div class="arena-row">
        <select data-role="watch-speed" aria-label="Speed">
          <option value="1600">Slow · 1.6 s a move</option>
          <option value="900" selected>Normal · 0.9 s a move</option>
          <option value="350">Fast · 0.35 s a move</option>
        </select>
        <button type="button" class="btn btn-ghost" data-role="watch-pause" disabled>Pause</button>
      </div>
      <p class="arena-muted" data-role="watch-move"></p>
      <p class="arena-status" data-role="watch-status" aria-live="polite"></p>
      <div class="game-board-wrap" data-role="watch-board"></div>
    </section>
  `;
  const $ = (r) => container.querySelector(`[data-role="${r}"]`);
  const code = $('code');
  const nameInput = $('name');
  const mineSelect = $('mine');
  const setStatus = (t) => ($('status').textContent = t);

  // ---- draft ----
  try {
    code.value = localStorage.getItem(DRAFT_KEY(game)) || STARTERS[game];
  } catch {
    code.value = STARTERS[game];
  }
  code.addEventListener('input', () => {
    try {
      localStorage.setItem(DRAFT_KEY(game), code.value);
    } catch {
      /* not kept */
    }
  });
  code.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = code;
    code.setRangeText('  ', a, b, 'end');
  });
  $('reset').addEventListener('click', () => {
    if (!window.confirm('Replace the editor with the example bot?')) return;
    code.value = STARTERS[game];
    code.dispatchEvent(new Event('input'));
  });

  // ---- who can play ----
  let bots = []; // from the database
  const references = REFERENCE_DEPTHS[game].map((d) => ({
    key: `ref-${d}`,
    id: `ref-${d}`,
    name: `Reference · depth ${d}`,
    author: null,
    kind: 'reference',
    fresh: () => createReferencePlayer(game, d),
  }));
  const fromBot = (b) => ({
    key: `bot-${b.id}`,
    id: b.id,
    name: b.name,
    author: b.author?.username ?? null,
    kind: 'bot',
    status: b.status,
    fresh: () => createBotPlayer(game, { name: b.name, code: b.code, author: b.author?.username, id: b.id }),
  });
  const editorEntrant = () => ({
    key: 'editor',
    id: 'editor',
    name: nameInput.value.trim() || 'Your code',
    author: null,
    kind: 'bot',
    fresh: () => createBotPlayer(game, { name: nameInput.value.trim() || 'Your code', code: code.value }),
  });
  const approved = () => bots.filter((b) => b.status === 'approved').map(fromBot);
  function everyone() {
    const me = getUser()?.id;
    const own = bots.filter((b) => b.user_id === me && b.status !== 'approved').map(fromBot);
    return [editorEntrant(), ...references, ...approved(), ...own];
  }
  const label = (e) =>
    e.key === 'editor'
      ? 'Your code (the editor)'
      : `${e.name}${e.author ? ` · @${e.author}` : ''}${e.status === 'pending' ? ' (waiting for review)' : ''}`;

  function fillSelect(select, list, keep) {
    const before = select.value;
    select.textContent = '';
    for (const e of list) select.add(new Option(label(e), e.key));
    select.value = list.some((e) => e.key === before) ? before : keep ?? list[0]?.key;
  }
  function refreshSelects() {
    const all = everyone();
    fillSelect($('opponent'), all.filter((e) => e.key !== 'editor'), references[1]?.key);
    fillSelect($('watch-a'), all, 'editor');
    fillSelect($('watch-b'), all, references[0]?.key);
    const me = getUser()?.id;
    const mine = bots.filter((b) => b.user_id === me);
    const before = mineSelect.value;
    mineSelect.textContent = '';
    mineSelect.add(new Option('New bot', ''));
    for (const b of mine) mineSelect.add(new Option(`${b.name}${b.status === 'pending' ? ' (waiting for review)' : ''}`, b.id));
    mineSelect.value = mine.some((b) => b.id === before) ? before : '';
    $('delete').classList.toggle('hidden', !mineSelect.value);
  }
  const find = (key) => everyone().find((e) => e.key === key);

  mineSelect.addEventListener('change', () => {
    const b = bots.find((x) => x.id === mineSelect.value);
    if (b) {
      nameInput.value = b.name;
      code.value = b.code;
    } else {
      nameInput.value = '';
    }
    $('delete').classList.toggle('hidden', !b);
  });

  async function loadBots() {
    try {
      bots = await listBots(game);
    } catch {
      bots = []; // bots table not set up yet
    }
    refreshSelects();
  }

  // ---- test your bot ----
  $('test').addEventListener('click', async () => {
    const opponent = find($('opponent').value);
    if (!opponent) return;
    const btn = $('test');
    btn.disabled = true;
    const lines = [];
    for (const [k, youFirst] of [
      [1, true],
      [2, false],
    ]) {
      setStatus(`Game ${k} of 2…`);
      const you = editorEntrant().fresh();
      const them = opponent.fresh();
      const r = await playGame(game, youFirst ? you : them, youFirst ? them : you, { seed: 7 + k });
      const yourSide = youFirst ? 1 : 2;
      const verdict = r.winner === 0 ? 'drew' : r.winner === yourSide ? 'won' : 'lost';
      const why = r.reason === 'won' || r.reason === 'draw' ? '' : ` (${r.reason})`;
      lines.push(`Game ${k}, you as ${sides[yourSide]}: you ${verdict} in ${r.moves.length} moves${why}.`);
    }
    setStatus(lines.join('  '));
    btn.disabled = false;
  });

  // ---- save ----
  $('save').addEventListener('click', async () => {
    if (!getUser()) return promptSignIn('login');
    const name = nameInput.value.trim();
    if (!name) return setStatus('Give your bot a name first.');
    try {
      const row = await saveBot({ id: mineSelect.value || null, game, name, code: code.value });
      await loadBots();
      mineSelect.value = row.id;
      $('delete').classList.remove('hidden');
      setStatus(row.status === 'approved' ? 'Saved. It’s in the arena.' : 'Saved. It joins the arena once it has been reviewed.');
    } catch (err) {
      setStatus(`Couldn't save: ${err.message}`);
    }
  });
  $('delete').addEventListener('click', async () => {
    const b = bots.find((x) => x.id === mineSelect.value);
    if (!b || !window.confirm(`Delete “${b.name}”?`)) return;
    try {
      await deleteBot(b.id);
      await loadBots();
      setStatus('Deleted.');
    } catch (err) {
      setStatus(`Couldn't delete: ${err.message}`);
    }
  });

  // ---- standings ----
  function drawTable(rows, into) {
    into.textContent = '';
    if (!rows?.length) return;
    const table = el('table', 'game-table');
    const head = el('tr');
    for (const h of ['#', 'Bot', 'Won', 'Lost', 'Drawn', 'Points']) head.append(el('th', null, h));
    table.append(head);
    rows.forEach((r, i) => {
      const tr = el('tr');
      const who = el('td');
      who.append(el('span', null, r.name));
      if (r.author) {
        const a = el('a', 'arena-author', ` @${r.author}`);
        a.href = `/u/${encodeURIComponent(r.author)}`;
        a.setAttribute('data-link', '');
        who.append(a);
      }
      if (r.kind === 'reference') who.append(el('span', 'arena-muted', ' built-in'));
      tr.append(el('td', null, String(i + 1)), who);
      for (const v of [r.wins, r.losses, r.draws, r.points]) tr.append(el('td', null, String(v)));
      table.append(tr);
    });
    into.append(table);
  }

  async function loadStandings() {
    try {
      const s = await getStandings(game);
      if (s) {
        $('published').textContent = `Official results, published ${new Date(s.published_at).toLocaleDateString()}.`;
        drawTable(s.results, $('standings'));
      } else {
        $('published').textContent = 'No official results yet. Run the tournament to see how the bots stack up.';
      }
    } catch {
      $('published').textContent = 'No official results yet.';
    }
  }

  let lastRun = null;
  $('run').addEventListener('click', async () => {
    const entrants = [...references, ...approved()];
    const btn = $('run');
    btn.disabled = true;
    $('notes').textContent = '';
    const { table, notes } = await runTournament(game, entrants, {
      onProgress: (k, n, what) => {
        $('progress').textContent = k < n ? `Game ${k + 1} of ${n}: ${what}` : `Finished: ${n} games.`;
      },
    });
    lastRun = table;
    $('published').textContent = 'Your run (every pair plays twice, each side going first once; win = 1, draw = ½):';
    drawTable(table, $('standings'));
    for (const n of notes.slice(0, 12)) $('notes').append(el('li', null, n));
    $('publish').classList.toggle('hidden', !isAdmin());
    btn.disabled = false;
  });
  $('publish').addEventListener('click', async () => {
    if (!lastRun) return;
    try {
      await publishStandings(game, lastRun);
      $('publish').classList.add('hidden');
      await loadStandings();
    } catch (err) {
      $('progress').textContent = `Couldn't publish: ${err.message}`;
    }
  });

  // ---- watch ----
  const watchView = makeView($('watch-board'), { onMove: () => {} });
  let watching = 0;
  let paused = false;
  const pauseBtn = $('watch-pause');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  });
  // e.g. "Move 12 · black played d3 · Black 10, White 14"
  const describe = (state, move, n) => `Move ${n} · ${RULES[game].describeMove(state, move, sides)}`;
  $('watch').addEventListener('click', async () => {
    const a = find($('watch-a').value);
    const b = find($('watch-b').value);
    if (!a || !b) return;
    const mine = ++watching;
    paused = false;
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = false;
    const status = $('watch-status');
    status.textContent = `${label(a)} (${sides[1]}) vs ${label(b)} (${sides[2]})`;
    try {
      let n = 0;
      watchView.render(RULES[game].newGame());
      const r = await playGame(game, a.fresh(), b.fresh(), {
        seed: 42,
        onMove: async (state, move) => {
          // Hold a move that arrives while paused until Resume.
          while (paused) {
            if (mine !== watching) throw new Cancelled();
            await sleep(50);
          }
          if (mine !== watching) throw new Cancelled();
          await watchView.render(state, { drop: true, animate: true });
          $('watch-move').textContent = describe(state, move, ++n);
          const until = performance.now() + Number($('watch-speed').value);
          while (performance.now() < until || paused) {
            if (mine !== watching) throw new Cancelled();
            await sleep(50);
          }
        },
      });
      pauseBtn.disabled = true;
      if (mine !== watching) return;
      if (r.state) await watchView.render(r.state);
      const winner = r.winner === 0 ? 'Draw' : `${r.winner === 1 ? a.name : b.name} wins`;
      status.textContent = `${winner}${r.reason === 'won' || r.reason === 'draw' ? '' : `: ${r.reason}`} (${r.moves.length} moves).`;
    } catch (err) {
      if (!(err instanceof Cancelled)) status.textContent = `Stopped: ${err.message}`;
    }
  });

  onAuthChange(() => loadBots());
  loadBots();
  loadStandings();

  return {
    // Stop any game being watched when leaving the tab.
    stop: () => {
      watching++;
    },
  };
}
