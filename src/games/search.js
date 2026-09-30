// A game-playing AI that works for any two-player, turn-based game with this
// shape (see connectFour.js, reversi.js):
//
//   game.toMove(state)            → 1 or 2
//   game.moves(state)             → legal moves, best-looking first
//   game.play(state, move)        → the next state (a new object)
//   game.outcome(state)           → null while the game is on, else { winner: 0 | 1 | 2 } (0 = draw)
//   game.evaluate(state, player)  → how good the position looks for `player` (heuristic)
//
// Negamax with alpha-beta pruning: a position is worth the best of what each
// move leads to, seen from the other side (hence the minus signs); a branch is
// abandoned as soon as it can't change the answer. Games with extra turns
// (Mancala) are handled too: when the same player moves again, the child's
// value counts for them directly, without the sign flip. Iterative deepening searches
// 1, 2, 3, … moves ahead until the depth limit or the time runs out, keeping
// the best move from the deepest search that finished.

export const WIN = 1_000_000;

class OutOfTime extends Error {}

export function chooseMove(game, state, { depth = 4, timeMs = 1000, randomness = 0 } = {}) {
  const moves = game.moves(state);
  if (moves.length === 1) return { move: moves[0], depth: 0, score: 0 };

  // Easy levels: sometimes just play something legal.
  if (randomness > 0 && Math.random() < randomness) {
    return { move: moves[Math.floor(Math.random() * moves.length)], depth: 0, score: 0, random: true };
  }

  const deadline = performance.now() + timeMs;
  let nodes = 0;

  function negamax(s, d, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new OutOfTime();
    const out = game.outcome(s);
    if (out) {
      if (out.winner === 0) return 0;
      // Prefer quick wins and slow losses.
      return out.winner === game.toMove(s) ? WIN - ply : -(WIN - ply);
    }
    if (d === 0) return game.evaluate(s, game.toMove(s));
    let best = -Infinity;
    const me = game.toMove(s);
    for (const m of game.moves(s)) {
      const child = game.play(s, m);
      const v =
        game.toMove(child) === me
          ? negamax(child, d - 1, alpha, beta, ply + 1)
          : -negamax(child, d - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  let result = { move: moves[0], depth: 0, score: 0 };
  let order = moves.slice();
  for (let d = 1; d <= depth; d++) {
    try {
      let bestMove = order[0];
      let bestScore = -Infinity;
      let alpha = -Infinity;
      const scored = [];
      const me = game.toMove(state);
      for (const m of order) {
        const child = game.play(state, m);
        const v =
          game.toMove(child) === me
            ? negamax(child, d - 1, alpha, Infinity, 1)
            : -negamax(child, d - 1, -Infinity, -alpha, 1);
        scored.push([m, v]);
        if (v > bestScore) {
          bestScore = v;
          bestMove = m;
        }
        if (v > alpha) alpha = v;
      }
      result = { move: bestMove, depth: d, score: bestScore, nodes };
      // Search the best moves first next time round: more pruning.
      order = scored.sort((a, b) => b[1] - a[1]).map(([m]) => m);
      if (Math.abs(bestScore) > WIN - 1000) break; // a forced win or loss is already found
    } catch (err) {
      if (err instanceof OutOfTime) break;
      throw err;
    }
  }
  return result;
}

// The five levels, the same for every game (a game can scale depth).
export const LEVELS = [
  { name: 'Beginner', depth: 1, timeMs: 200, randomness: 0.5 },
  { name: 'Casual', depth: 2, timeMs: 300, randomness: 0.15 },
  { name: 'Club', depth: 4, timeMs: 600, randomness: 0 },
  { name: 'Expert', depth: 6, timeMs: 1000, randomness: 0 },
  { name: 'Grandmaster', depth: 12, timeMs: 1800, randomness: 0 },
];
