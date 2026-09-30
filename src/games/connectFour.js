// Connect Four: 7 columns × 6 rows; drop a tile into a column and it falls
// to the lowest empty cell. Four in a row (any direction) wins.
//
// State: { cells: Int8Array(42) indexed c * 6 + r (r = 0 is the bottom),
//          heights: Int8Array(7), turn: 1 | 2, count, last: index | -1, winner: 0 | 1 | 2 }

export const COLS = 7;
export const ROWS = 6;
const CENTER_FIRST = [3, 2, 4, 1, 5, 0, 6];
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function newGame() {
  return { cells: new Int8Array(COLS * ROWS), heights: new Int8Array(COLS), turn: 1, count: 0, last: -1, winner: 0 };
}

const at = (s, c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : s.cells[c * ROWS + r]);

// The four cells of a win through (c, r), or null.
export function winningLine(s, c, r) {
  const p = at(s, c, r);
  if (p <= 0) return null;
  for (const [dc, dr] of DIRS) {
    const line = [[c, r]];
    for (const sign of [1, -1]) {
      let k = 1;
      while (at(s, c + sign * dc * k, r + sign * dr * k) === p) {
        line.push([c + sign * dc * k, r + sign * dr * k]);
        k++;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export const game = {
  id: 'connect-four',
  toMove: (s) => s.turn,
  moves: (s) => CENTER_FIRST.filter((c) => s.heights[c] < ROWS),
  play(s, c) {
    const r = s.heights[c];
    const cells = s.cells.slice();
    const heights = s.heights.slice();
    cells[c * ROWS + r] = s.turn;
    heights[c] = r + 1;
    const next = { cells, heights, turn: 3 - s.turn, count: s.count + 1, last: c * ROWS + r, winner: 0 };
    if (winningLine(next, c, r)) next.winner = s.turn;
    return next;
  },
  outcome(s) {
    if (s.winner) return { winner: s.winner };
    if (s.count === COLS * ROWS) return { winner: 0 };
    return null;
  },
  // Every group of four cells that isn't blocked counts: two of mine +2,
  // three of mine +5, and the same against me for the opponent; centre
  // column tiles +3 each (they take part in the most lines).
  evaluate(s, player) {
    const opp = 3 - player;
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
      const v = s.cells[3 * ROWS + r];
      if (v === player) score += 3;
      else if (v === opp) score -= 3;
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        for (const [dc, dr] of DIRS) {
          const ec = c + 3 * dc;
          const er = r + 3 * dr;
          if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
          let mine = 0;
          let theirs = 0;
          for (let k = 0; k < 4; k++) {
            const v = s.cells[(c + k * dc) * ROWS + (r + k * dr)];
            if (v === player) mine++;
            else if (v === opp) theirs++;
          }
          if (theirs === 0) score += mine === 3 ? 5 : mine === 2 ? 2 : 0;
          else if (mine === 0) score -= theirs === 3 ? 5 : theirs === 2 ? 2 : 0;
        }
      }
    }
    return score;
  },
};
