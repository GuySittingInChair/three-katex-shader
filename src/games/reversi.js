// Reversi (Othello): 8 × 8. Place a disc so that it traps a straight line of
// the opponent's discs between it and one of yours; the trapped discs flip.
// If you can't move you pass; when neither player can, most discs wins.
// Black (1) moves first.
//
// State: { cells: Int8Array(64) indexed r * 8 + c, turn: 1 | 2, passes, last, flipped: [index] }

export const SIZE = 8;
const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export function newGame() {
  const cells = new Int8Array(64);
  cells[27] = 2;
  cells[28] = 1;
  cells[35] = 1;
  cells[36] = 2;
  return { cells, turn: 1, passes: 0, last: -1, flipped: [] };
}

// The discs a move at `index` would flip for `player` (empty if illegal).
export function flipsFor(cells, index, player) {
  if (cells[index] !== 0) return [];
  const r0 = Math.floor(index / SIZE);
  const c0 = index % SIZE;
  const opp = 3 - player;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === opp) {
      run.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
    if (run.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === player) out.push(...run);
  }
  return out;
}

export function legalMoves(cells, player) {
  const out = [];
  for (let i = 0; i < 64; i++) if (cells[i] === 0 && flipsFor(cells, i, player).length) out.push(i);
  return out;
}

export function count(cells) {
  let black = 0;
  let white = 0;
  for (const v of cells) {
    if (v === 1) black++;
    else if (v === 2) white++;
  }
  return { black, white };
}

// Corners are gold, the squares next to them are traps, edges are good.
const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];

export const game = {
  id: 'reversi',
  toMove: (s) => s.turn,
  moves(s) {
    const ms = legalMoves(s.cells, s.turn);
    if (ms.length === 0) return [-1]; // pass
    return ms.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  },
  play(s, index) {
    if (index === -1) return { cells: s.cells, turn: 3 - s.turn, passes: s.passes + 1, last: -1, flipped: [] };
    const cells = s.cells.slice();
    const flipped = flipsFor(cells, index, s.turn);
    cells[index] = s.turn;
    for (const f of flipped) cells[f] = s.turn;
    return { cells, turn: 3 - s.turn, passes: 0, last: index, flipped };
  },
  outcome(s) {
    const over =
      s.passes >= 2 ||
      (legalMoves(s.cells, s.turn).length === 0 && legalMoves(s.cells, 3 - s.turn).length === 0);
    if (!over) return null;
    const { black, white } = count(s.cells);
    return { winner: black === white ? 0 : black > white ? 1 : 2 };
  },
  // Square weights, plus having more moves than the opponent (mobility);
  // late in the game, the disc count itself.
  evaluate(s, player) {
    const opp = 3 - player;
    let score = 0;
    let filled = 0;
    let discs = 0;
    for (let i = 0; i < 64; i++) {
      const v = s.cells[i];
      if (v) filled++;
      if (v === player) {
        score += WEIGHTS[i];
        discs++;
      } else if (v === opp) {
        score -= WEIGHTS[i];
        discs--;
      }
    }
    const mobility = legalMoves(s.cells, player).length - legalMoves(s.cells, opp).length;
    return score + 5 * mobility + (filled > 52 ? 10 * discs : 0);
  },
};

export function describeMove(after, index, sides) {
  const who = sides[3 - after.turn];
  const where = index === -1 ? 'passed' : `played ${'abcdefgh'[index % 8]}${Math.floor(index / 8) + 1}`;
  const { black, white } = count(after.cells);
  return `${who} ${where} · Black ${black}, White ${white}`;
}

export function summary(s) {
  const { black, white } = count(s.cells);
  return `Black ${black}, White ${white}`;
}
