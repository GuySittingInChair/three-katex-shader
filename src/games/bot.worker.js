// Runs one community bot, sealed off. Before the bot's code is even compiled,
// everything that could reach the network or storage is removed from this
// worker, Math.random is replaced by a seeded generator (so a bot plays the
// same way every time and tournaments can be re-run by anyone), and the
// worker's own messaging is tucked away where the bot can't reach it. The
// site's Content-Security-Policy (vercel.json) also blocks any outside
// connection. The page kills the worker if a move takes too long.
//
// In:  { type: 'init', game, code, seed, me }  →  out: { type: 'ready' } | { type: 'error', message }
// In:  { type: 'move', state }                 →  out: { type: 'move', move } | { type: 'error', message }
import { game as connectFour, COLS, ROWS } from './connectFour.js';
import { game as reversi, SIZE } from './reversi.js';
import { game as mancala, PITS, STORE } from './mancala.js';
import { game as ultimateTtt } from './ultimateTtt.js';
import { game as gomoku, SIZE as GOMOKU_SIZE } from './gomoku.js';

const RULES = Object.fromEntries([connectFour, reversi, mancala, ultimateTtt, gomoku].map((g) => [g.id, g]));
const CONSTANTS = {
  [connectFour.id]: { COLS, ROWS },
  [reversi.id]: { SIZE },
  [mancala.id]: { PITS, STORE },
  [ultimateTtt.id]: {},
  [gomoku.id]: { SIZE: GOMOKU_SIZE },
};
const reply = self.postMessage.bind(self);

for (const name of [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'importScripts',
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'postMessage',
  'close',
]) {
  // Remove it all the way up the prototype chain (or the bot could call e.g.
  // WorkerGlobalScope.prototype.fetch), then pin an undefined on the worker itself.
  for (let o = self; o; o = Object.getPrototypeOf(o)) {
    try {
      delete o[name];
    } catch {
      /* not deletable here */
    }
  }
  try {
    Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
  } catch {
    /* already gone */
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let chooseMove = null;
let api = null;

function handle({ data }) {
  try {
    if (data.type === 'init') {
      const rules = RULES[data.game];
      const random = mulberry32(data.seed);
      Math.random = random;
      api = Object.freeze({
        me: data.me,
        game: data.game,
        moves: (s) => rules.moves(s),
        play: (s, m) => rules.play(s, m),
        outcome: (s) => rules.outcome(s),
        random,
        ...CONSTANTS[data.game],
      });
      // The bot's code defines chooseMove(state, api).
      chooseMove = new Function(`"use strict";\n${data.code}\n;return typeof chooseMove === 'function' ? chooseMove : null;`)();
      if (!chooseMove) throw new Error('Define a function called chooseMove(state, api)');
      reply({ type: 'ready' });
    } else if (data.type === 'move') {
      reply({ type: 'move', move: chooseMove(data.state, api) });
    }
  } catch (err) {
    reply({ type: 'error', message: String(err?.message ?? err).slice(0, 300) });
  }
}
self.addEventListener('message', handle);
