// Players and matches for the bot arena.
//
// A player is { name, init(me, seed) → Promise, move(state) → Promise<move>, dispose() }.
// Community bots run in a sealed worker (bot.worker.js) with a time limit per
// move; the reference players are the built-in search at a fixed depth with
// no time limit and no randomness, so everything is repeatable: the same
// tournament gives the same results on any computer (unless a bot times out).
import * as connectFour from './connectFour.js';
import * as reversi from './reversi.js';

export const RULES = { 'connect-four': connectFour, reversi };
export const MOVE_LIMIT_MS = 2000;
export const REFERENCE_DEPTHS = { 'connect-four': [2, 4, 7], reversi: [2, 3, 5] };

export const STARTERS = {
  'connect-four': `// Return the column (0–6) to drop your tile in.
// state.cells[c * 6 + r] is 0 (empty), 1 or 2; r = 0 is the bottom row.
// api.me is your player number; api.moves(state) lists legal columns,
// centre first; api.play(state, move) gives the next state;
// api.outcome(state) is null, or { winner: 0 | 1 | 2 } (0 = draw).
function chooseMove(state, api) {
  const moves = api.moves(state);

  // 1. Win right now if we can.
  for (const m of moves) {
    if (api.outcome(api.play(state, m))?.winner === api.me) return m;
  }
  // 2. Block the other player's immediate win.
  const them = 3 - api.me;
  for (const m of moves) {
    if (api.outcome(api.play({ ...state, turn: them }, m))?.winner === them) return m;
  }
  // 3. Otherwise, the most central column.
  return moves[0];
}
`,
  reversi: `// Return the square (0–63, row * 8 + column) to play, or -1 to pass.
// state.cells[i] is 0 (empty), 1 (black) or 2 (white). api.me is you;
// api.moves(state) lists legal squares ([-1] if you must pass);
// api.play(state, move) gives the next state (next.flipped = discs flipped);
// api.outcome(state) is null, or { winner: 0 | 1 | 2 }.
function chooseMove(state, api) {
  const moves = api.moves(state);

  // Corners can never be flipped back: take one whenever we can.
  const corner = moves.find((m) => [0, 7, 56, 63].includes(m));
  if (corner !== undefined) return corner;

  // Otherwise flip as many discs as possible.
  let best = moves[0];
  let most = -1;
  for (const m of moves) {
    const flipped = api.play(state, m).flipped.length;
    if (flipped > most) {
      most = flipped;
      best = m;
    }
  }
  return best;
}
`,
};

export class Forfeit extends Error {}

export function createBotPlayer(game, { name, code, author = null, id = null }) {
  let worker = null;
  let pending = null;
  const fail = (message) => {
    worker?.terminate();
    worker = null;
    pending?.reject(new Forfeit(message));
    pending = null;
  };
  const send = (msg, timeoutMs) =>
    new Promise((resolve, reject) => {
      pending = { resolve, reject };
      const timer = setTimeout(() => fail(`took longer than ${timeoutMs / 1000} s`), timeoutMs);
      pending.timer = timer;
      worker.postMessage(msg);
    });
  return {
    name,
    author,
    id,
    kind: 'bot',
    init(me, seed) {
      worker?.terminate();
      worker = new Worker(new URL('./bot.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!pending) return;
        clearTimeout(pending.timer);
        const p = pending;
        pending = null;
        if (data.type === 'error') p.reject(new Forfeit(`error: ${data.message}`));
        else p.resolve(data.move);
      };
      worker.onerror = (e) => fail(`crashed: ${e.message || 'unknown error'}`);
      return send({ type: 'init', game, code, seed, me }, 5000);
    },
    move(state) {
      if (!worker) return Promise.reject(new Forfeit('not running'));
      return send({ type: 'move', state }, MOVE_LIMIT_MS);
    },
    dispose() {
      worker?.terminate();
      worker = null;
    },
  };
}

// The built-in search at a fixed depth, via the shared AI worker.
let aiWorker = null;
let aiRequest = 0;
function askReference(game, state, depth) {
  aiWorker ??= new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
  const id = ++aiRequest;
  return new Promise((resolve) => {
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      aiWorker.removeEventListener('message', onMessage);
      resolve(data.move);
    };
    aiWorker.addEventListener('message', onMessage);
    aiWorker.postMessage({ id, game, state, options: { depth, timeMs: 1e9, randomness: 0 } });
  });
}

export function createReferencePlayer(game, depth) {
  return {
    name: `Reference · depth ${depth}`,
    author: null,
    id: `ref-${depth}`,
    kind: 'reference',
    init: () => Promise.resolve(),
    move: (state) => askReference(game, state, depth),
    dispose() {},
  };
}

// One game. Player 1 moves first. Returns { winner: 0 | 1 | 2, reason, moves: [move] }.
// A player that errors, runs out of time or plays an illegal move loses.
export async function playGame(game, p1, p2, { seed = 1, onMove } = {}) {
  const rules = RULES[game];
  const players = { 1: p1, 2: p2 };
  const moves = [];
  for (const me of [1, 2]) {
    try {
      await players[me].init(me, (seed * 7919 + me) >>> 0);
    } catch (err) {
      return { winner: 3 - me, reason: `${players[me].name} didn't start: ${err.message}`, moves };
    }
  }
  let state = rules.newGame();
  try {
    for (let ply = 0; ply < 200; ply++) {
      const out = rules.game.outcome(state);
      if (out) return { winner: out.winner, reason: out.winner ? 'won' : 'draw', moves, state };
      const me = state.turn;
      const legal = rules.game.moves(state);
      let move;
      try {
        move = await players[me].move(state);
      } catch (err) {
        return { winner: 3 - me, reason: `${players[me].name} forfeited (${err.message})`, moves, state };
      }
      if (!legal.includes(move)) {
        return { winner: 3 - me, reason: `${players[me].name} played an illegal move (${JSON.stringify(move)})`, moves, state };
      }
      moves.push(move);
      state = rules.game.play(state, move);
      await onMove?.(state, move);
    }
    return { winner: 0, reason: 'too long', moves, state };
  } finally {
    p1.dispose();
    p2.dispose();
  }
}

// Every pair plays twice, each side going first once. Win = 1 point, draw = ½.
export async function runTournament(game, entrants, { onProgress } = {}) {
  const table = entrants.map((e) => ({ id: e.id, name: e.name, author: e.author, kind: e.kind, wins: 0, losses: 0, draws: 0, points: 0 }));
  const pairs = [];
  for (let i = 0; i < entrants.length; i++) {
    for (let j = 0; j < entrants.length; j++) if (i !== j) pairs.push([i, j]);
  }
  const notes = [];
  for (const [k, [i, j]] of pairs.entries()) {
    onProgress?.(k, pairs.length, `${entrants[i].name} vs ${entrants[j].name}`);
    const result = await playGame(game, entrants[i].fresh(), entrants[j].fresh(), { seed: 1000 + k });
    const [a, b] = [table[i], table[j]];
    if (result.winner === 0) {
      a.draws++;
      b.draws++;
      a.points += 0.5;
      b.points += 0.5;
    } else {
      const [w, l] = result.winner === 1 ? [a, b] : [b, a];
      w.wins++;
      w.points++;
      l.losses++;
    }
    if (result.reason !== 'won' && result.reason !== 'draw') notes.push(result.reason);
  }
  onProgress?.(pairs.length, pairs.length, 'done');
  table.sort((x, y) => y.points - x.points || y.wins - x.wins || x.name.localeCompare(y.name));
  return { table, notes };
}
