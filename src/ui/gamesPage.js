import * as connectFour from '../games/connectFour.js';
import * as reversi from '../games/reversi.js';
import { createConnectFourView } from '../games/connectFourView.js';
import { createReversiView } from '../games/reversiView.js';
import * as mancala from '../games/mancala.js';
import * as ultimateTtt from '../games/ultimateTtt.js';
import * as gomoku from '../games/gomoku.js';
import { createMancalaView } from '../games/mancalaView.js';
import { createUltimateTttView } from '../games/ultimateTttView.js';
import { createGomokuView } from '../games/gomokuView.js';
import { LEVELS } from '../games/search.js';
import { recordGameResult, getLeaderboard, getMyGameRecord, onAuthChange, getUser } from '../core/community.js';
import { promptSignIn } from './signIn.js';
import { createBotArena } from './botArena.js';

// /games: the list. /games/<id>: play one against the built-in AI (five
// levels, running in a worker), with your record and a leaderboard.

const GAMES = {
  'connect-four': {
    title: 'Connect Four',
    blurb: 'Drop tiles into the columns. Four in a row, any direction, wins.',
    rules: connectFour,
    view: createConnectFourView,
    sides: { 1: 'yellow', 2: 'red' },
    howTo: 'Tap a column to drop a tile.',
  },
  reversi: {
    title: 'Reversi',
    blurb: 'Trap the other side’s discs between yours to flip them. Most discs at the end wins.',
    rules: reversi,
    view: createReversiView,
    sides: { 1: 'black', 2: 'white' },
    howTo: 'Tap a marked square. Black moves first.',
  },
  mancala: {
    title: 'Mancala',
    blurb: 'Sow seeds around the board. End in your store to go again, land in an empty pit of yours to capture.',
    rules: mancala,
    view: createMancalaView,
    sides: { 1: 'player 1', 2: 'player 2' },
    howTo: 'Tap one of your glowing pits (the bottom row).',
  },
  'ultimate-ttt': {
    title: 'Ultimate Tic-Tac-Toe',
    blurb: 'Nine boards in one. Win three small boards in a row. Where you play decides which board your opponent must play in next.',
    rules: ultimateTtt,
    view: createUltimateTttView,
    sides: { 1: 'X', 2: 'O' },
    howTo: 'Tap a cell in a glowing board.',
  },
  gomoku: {
    title: 'Gomoku',
    blurb: 'Five in a row wins, on a 13 × 13 board. Simple rules, sharp tactics.',
    rules: gomoku,
    view: createGomokuView,
    sides: { 1: 'black', 2: 'white' },
    howTo: 'Tap an intersection. Black moves first.',
  },
};

const PREFS_KEY = 'aiship:games';
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGamesPage(container) {
  container.innerHTML = `
    <div class="page-inner games-inner">
      <header class="page-head">
        <a class="brand" href="/" data-link>aiship</a>
        <nav class="page-nav">
          <a href="/sketches" data-link>Sketches</a>
          <a href="/games" data-link>Games</a>
        </nav>
      </header>
      <section data-role="list">
        <h1 class="page-title">Games</h1>
        <p class="page-lede">Play against the computer. It thinks by searching ahead through the moves (minimax with alpha-beta pruning); higher levels look further.</p>
        <div class="game-cards"></div>
      </section>
      <section data-role="play" class="hidden">
        <div class="game-head">
          <h1 class="page-title" data-role="title"></h1>
          <p class="page-lede" data-role="blurb"></p>
          <div class="game-tabs" role="tablist">
            <button type="button" class="chip active" data-tab="play" role="tab">Play</button>
            <button type="button" class="chip" data-tab="bots" role="tab">Bots</button>
          </div>
        </div>
        <div data-role="play-pane">
        <div class="game-controls">
          <div class="level-picker" role="radiogroup" aria-label="AI level"></div>
          <div class="game-buttons">
            <select data-role="side" aria-label="Who goes first"></select>
            <button type="button" class="btn btn-ghost" data-role="undo">Undo</button>
            <button type="button" class="btn btn-primary" data-role="new">New game</button>
          </div>
        </div>
        <p class="game-status" data-role="status" aria-live="polite"></p>
        <div class="game-board-wrap" data-role="board"></div>
        <div class="game-side">
          <section>
            <h2>Your record</h2>
            <div data-role="record"></div>
          </section>
          <section>
            <h2>Leaderboard · <span data-role="board-level"></span></h2>
            <div data-role="leaderboard"></div>
          </section>
        </div>
        </div>
        <div data-role="bots-pane" class="hidden"></div>
      </section>
    </div>
  `;
  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const prefs = loadPrefs();

  // ---- the list ----
  const cards = container.querySelector('.game-cards');
  for (const [id, def] of Object.entries(GAMES)) {
    const a = document.createElement('a');
    a.className = 'game-card';
    a.href = `/games/${id}`;
    a.setAttribute('data-link', '');
    const art = document.createElement('div');
    art.className = `game-card-art game-art-${id}`;
    const title = document.createElement('h2');
    title.textContent = def.title;
    const blurb = document.createElement('p');
    blurb.textContent = def.blurb;
    a.append(art, title, blurb);
    cards.append(a);
  }

  // ---- playing ----
  const worker = new Worker(new URL('../games/ai.worker.js', import.meta.url), { type: 'module' });
  let requestId = 0;
  function askAI(gameId, state, level) {
    const id = ++requestId;
    return new Promise((resolve) => {
      const onMessage = ({ data }) => {
        if (data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        resolve(data);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, game: gameId, state, level });
    });
  }

  let gameId = null;
  let def = null;
  let view = null;
  let state = null;
  let history = [];
  let human = 1;
  let level = 2;
  let busy = false;
  let usedUndo = false;
  let recorded = false;
  let session = 0; // bumps on every new game, so a stale AI reply is ignored

  const levelPicker = container.querySelector('.level-picker');
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${i + 1} · ${L.name}`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => {
      if (level === i) return;
      level = i;
      prefs[`${gameId}:level`] = i;
      savePrefs(prefs);
      renderLevel();
      newGame();
    });
    levelPicker.append(b);
  });
  function renderLevel() {
    [...levelPicker.children].forEach((b, i) => {
      b.classList.toggle('active', i === level);
      b.setAttribute('aria-checked', String(i === level));
    });
    $('board-level').textContent = `Level ${level + 1}`;
    refreshBoards();
  }

  const sideSelect = $('side');
  sideSelect.addEventListener('change', () => {
    human = Number(sideSelect.value);
    prefs[`${gameId}:side`] = human;
    savePrefs(prefs);
    newGame();
  });

  const setStatus = (text) => ($('status').textContent = text);

  function describeTurn() {
    const out = def.rules.game.outcome(state);
    if (out) {
      if (out.winner === 0) return 'Draw.';
      return out.winner === human ? 'You win!' : 'The computer wins.';
    }
    if (state.turn === human) return `Your move (${def.sides[human]}). ${def.howTo}`;
    return 'The computer is thinking…';
  }

  function extra() {
    const text = def.rules.summary?.(state, def.sides, human);
    return text ? `  ·  ${text}` : '';
  }

  async function finishIfOver() {
    const out = def.rules.game.outcome(state);
    if (!out || recorded) return Boolean(out);
    recorded = true;
    view.setInteractive(false);
    const outcome = out.winner === 0 ? 'draw' : out.winner === human ? 'win' : 'loss';
    setStatus(describeTurn() + extra() + (outcome === 'win' && usedUndo ? '  (Undo was used, so it isn’t counted.)' : ''));
    if (outcome === 'win' && usedUndo) return true;
    if (getUser()) {
      try {
        await recordGameResult({ game: gameId, level: level + 1, outcome, moves: history.length - 1 });
        refreshBoards();
      } catch {
        /* results table not set up yet, or offline: just not saved */
      }
    } else if (outcome === 'win') {
      setStatus(`${describeTurn()}${extra()}  Log in to get on the leaderboard.`);
    }
    return true;
  }

  async function apply(next, animateOpts) {
    state = next;
    history.push(state);
    await view.render(state, animateOpts);
  }

  async function aiTurn() {
    const mine = session;
    busy = true;
    view.setInteractive(false);
    setStatus(describeTurn() + extra());
    while (!def.rules.game.outcome(state) && state.turn !== human) {
      const [reply] = await Promise.all([askAI(gameId, state, level), sleep(350)]);
      if (mine !== session) return;
      await apply(def.rules.game.play(state, reply.move), { drop: true, animate: true });
      if (mine !== session) return;
    }
    busy = false;
    await humanTurn();
  }

  async function humanTurn() {
    if (await finishIfOver()) return;
    // Reversi: no legal move means you pass.
    if (def.rules.game.moves(state)[0] === -1) {
      setStatus('You have no moves, so you pass.');
      await sleep(900);
      await apply(def.rules.game.play(state, -1));
      return aiTurn();
    }
    setStatus(describeTurn() + extra());
    view.setInteractive(true, human);
  }

  async function onMove(move) {
    if (busy || state.turn !== human) return;
    busy = true;
    view.setInteractive(false);
    await apply(def.rules.game.play(state, move), { drop: true, animate: true });
    busy = false;
    if (await finishIfOver()) return;
    aiTurn();
  }

  function newGame() {
    session++;
    busy = false;
    usedUndo = false;
    recorded = false;
    state = def.rules.newGame();
    history = [state];
    view.setSide?.(human);
    view.render(state);
    if (state.turn === human) humanTurn();
    else aiTurn();
  }

  $('new').addEventListener('click', newGame);
  $('undo').addEventListener('click', async () => {
    if (busy) return;
    // Back to your previous turn.
    let i = history.length - 2;
    while (i >= 0 && history[i].turn !== human) i--;
    if (i < 0) return;
    usedUndo = true;
    recorded = false;
    session++;
    history = history.slice(0, i + 1);
    state = history[i];
    await view.render(state);
    humanTurn();
  });

  // ---- record and leaderboard ----
  async function refreshBoards() {
    if (!gameId) return;
    const recordEl = $('record');
    const boardEl = $('leaderboard');
    if (!getUser()) {
      recordEl.innerHTML = '';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost';
      b.textContent = 'Log in to save your results';
      b.addEventListener('click', () => promptSignIn('login'));
      recordEl.append(b);
    } else {
      try {
        const rows = await getMyGameRecord(gameId);
        recordEl.textContent = '';
        const table = document.createElement('table');
        table.className = 'game-table';
        table.innerHTML = '<tr><th>Level</th><th>Won</th><th>Lost</th><th>Drawn</th></tr>';
        LEVELS.forEach((L, i) => {
          const mine = rows.filter((r) => r.level === i + 1);
          const tr = document.createElement('tr');
          for (const v of [`${i + 1} · ${L.name}`, ...['win', 'loss', 'draw'].map((o) => mine.filter((r) => r.outcome === o).length)]) {
            const td = document.createElement('td');
            td.textContent = v;
            tr.append(td);
          }
          table.append(tr);
        });
        recordEl.append(table);
      } catch {
        recordEl.textContent = 'Results aren’t being saved yet.';
      }
    }
    try {
      const rows = await getLeaderboard(gameId, level + 1);
      boardEl.textContent = '';
      if (!rows.length) {
        boardEl.textContent = 'Nobody has beaten this level yet. Be first.';
        return;
      }
      const ol = document.createElement('ol');
      ol.className = 'leaderboard';
      for (const r of rows) {
        const li = document.createElement('li');
        const who = document.createElement('a');
        who.href = `/u/${encodeURIComponent(r.username)}`;
        who.setAttribute('data-link', '');
        who.textContent = `@${r.username}`;
        const score = document.createElement('span');
        score.textContent = `${r.wins} won · ${r.losses} lost${r.draws ? ` · ${r.draws} drawn` : ''}`;
        li.append(who, score);
        ol.append(li);
      }
      boardEl.append(ol);
    } catch {
      boardEl.textContent = 'The leaderboard isn’t set up yet.';
    }
  }
  onAuthChange(() => refreshBoards());

  // ---- tabs: play against the AI, or the bot arena ----
  let arena = null;
  function showTab(tab) {
    for (const b of container.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
    $('play-pane').classList.toggle('hidden', tab !== 'play');
    $('bots-pane').classList.toggle('hidden', tab !== 'bots');
    if (tab === 'bots' && !arena) {
      arena = createBotArena($('bots-pane'), { game: gameId, title: def.title, makeView: def.view, sides: def.sides });
    }
    if (tab !== 'bots') arena?.stop();
  }
  for (const b of container.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

  function show(id) {
    const known = id && GAMES[id];
    $('list').classList.toggle('hidden', Boolean(known));
    $('play').classList.toggle('hidden', !known);
    if (!known) {
      gameId = null;
      session++;
      document.title = 'Games · aiship';
      return;
    }
    if (gameId === id) return;
    gameId = id;
    arena?.stop();
    arena = null;
    $('bots-pane').textContent = '';
    def = GAMES[id];
    document.title = `${def.title} · aiship`;
    $('title').textContent = def.title;
    $('blurb').textContent = def.blurb;
    sideSelect.textContent = '';
    for (const side of [1, 2]) {
      sideSelect.add(new Option(`You play ${def.sides[side]}${side === 1 ? ' (you go first)' : ' (computer goes first)'}`, String(side)));
    }
    human = prefs[`${id}:side`] ?? 1;
    sideSelect.value = String(human);
    level = prefs[`${id}:level`] ?? 1;
    const holder = $('board');
    holder.textContent = '';
    view = def.view(holder, { onMove });
    renderLevel();
    showTab('play');
    newGame();
  }

  return { show };
}
