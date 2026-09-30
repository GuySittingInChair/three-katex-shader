// Runs the game AI off the main thread, so the board stays responsive while
// it thinks. Message in: { id, game, state, level }; out: { id, move, depth, score }.
import { chooseMove, LEVELS } from './search.js';
import { game as connectFour } from './connectFour.js';
import { game as reversi } from './reversi.js';

const GAMES = { [connectFour.id]: connectFour, [reversi.id]: reversi };

self.onmessage = ({ data }) => {
  const { id, game, state, level, options } = data;
  // `options` (depth, timeMs, randomness) for the arena's fixed-depth reference players.
  const result = chooseMove(GAMES[game], state, options ?? LEVELS[level]);
  self.postMessage({ id, move: result.move, depth: result.depth, score: result.score });
};
