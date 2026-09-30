// Runs the game AI off the main thread, so the board stays responsive while
// it thinks. Message in: { id, game, state, level }; out: { id, move, depth, score }.
import { chooseMove, LEVELS } from './search.js';
import { game as connectFour } from './connectFour.js';
import { game as reversi } from './reversi.js';
import { game as mancala } from './mancala.js';
import { game as ultimateTtt } from './ultimateTtt.js';
import { game as gomoku } from './gomoku.js';

const GAMES = Object.fromEntries([connectFour, reversi, mancala, ultimateTtt, gomoku].map((g) => [g.id, g]));

self.onmessage = ({ data }) => {
  const { id, game, state, level, options } = data;
  // `options` (depth, timeMs, randomness) for the arena's fixed-depth reference players.
  const result = chooseMove(GAMES[game], state, options ?? LEVELS[level]);
  self.postMessage({ id, move: result.move, depth: result.depth, score: result.score });
};
