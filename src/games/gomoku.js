// Gomoku: five in a row (or more) on a 13 × 13 board. Black (player 1) moves
// first. Sized down from the usual 15 × 15 so it's comfortable on a phone.
//
// State: { cells: Int8Array(169) indexed r * 13 + c, turn, count, last, winner, line: [index] }
//
// The AI can't look at all 169 moves at every step, so it only considers
// empty points within two of a stone, best-looking first (the ones that make
// or block the longest open lines), capped at 12.

export const SIZE = 13;
const N = SIZE * SIZE;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
const MAX_CANDIDATES = 12;

export function newGame() {
  return { cells: new Int8Array(N), turn: 1, count: 0, last: -1, winner: 0, line: [] };
}

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function fiveThrough(cells, index) {
  const p = cells[index];
  const r0 = Math.floor(index / SIZE);
  const c0 = index % SIZE;
  for (const [dr, dc] of DIRS) {
    const line = [index];
    for (const sign of [1, -1]) {
      let r = r0 + sign * dr;
      let c = c0 + sign * dc;
      while (inside(r, c) && cells[r * SIZE + c] === p) {
        line.push(r * SIZE + c);
        r += sign * dr;
        c += sign * dc;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

// How good a run of `len` stones is, given how many of its ends are open.
function runValue(len, openEnds) {
  if (len >= 5) return 1e6;
  if (openEnds === 0) return 0;
  if (len === 4) return openEnds === 2 ? 1e5 : 1e4;
  if (len === 3) return openEnds === 2 ? 5e3 : 300;
  if (len === 2) return openEnds === 2 ? 200 : 20;
  return openEnds === 2 ? 5 : 1;
}

// The value of every run of `player`'s stones on the board.
function lineScore(cells, player) {
  let total = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (cells[r * SIZE + c] !== player) continue;
        const pr = r - dr;
        const pc = c - dc;
        if (inside(pr, pc) && cells[pr * SIZE + pc] === player) continue; // not the start of a run
        let len = 0;
        let rr = r;
        let cc = c;
        while (inside(rr, cc) && cells[rr * SIZE + cc] === player) {
          len++;
          rr += dr;
          cc += dc;
        }
        const openStart = inside(pr, pc) && cells[pr * SIZE + pc] === 0;
        const openEnd = inside(rr, cc) && cells[rr * SIZE + cc] === 0;
        total += runValue(len, openStart + openEnd);
      }
    }
  }
  return total;
}

// How much a stone at `index` would extend `player`'s lines (for move ordering).
function pointValue(cells, index, player) {
  const r0 = Math.floor(index / SIZE);
  const c0 = index % SIZE;
  let v = 0;
  for (const [dr, dc] of DIRS) {
    let len = 1;
    let open = 0;
    for (const sign of [1, -1]) {
      let r = r0 + sign * dr;
      let c = c0 + sign * dc;
      while (inside(r, c) && cells[r * SIZE + c] === player) {
        len++;
        r += sign * dr;
        c += sign * dc;
      }
      if (inside(r, c) && cells[r * SIZE + c] === 0) open++;
    }
    v += runValue(len, open);
  }
  return v;
}

export const game = {
  id: 'gomoku',
  toMove: (s) => s.turn,
  moves(s) {
    if (s.count === 0) return [Math.floor(N / 2)];
    const near = new Set();
    for (let i = 0; i < N; i++) {
      if (!s.cells[i]) continue;
      const r0 = Math.floor(i / SIZE);
      const c0 = i % SIZE;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (inside(r, c) && s.cells[r * SIZE + c] === 0) near.add(r * SIZE + c);
        }
      }
    }
    const me = s.turn;
    return [...near]
      .map((i) => [i, pointValue(s.cells, i, me) + 0.9 * pointValue(s.cells, i, 3 - me)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CANDIDATES)
      .map(([i]) => i);
  },
  play(s, index) {
    const cells = s.cells.slice();
    cells[index] = s.turn;
    const line = fiveThrough(cells, index);
    return { cells, turn: 3 - s.turn, count: s.count + 1, last: index, winner: line ? s.turn : 0, line: line || [] };
  },
  outcome(s) {
    if (s.winner) return { winner: s.winner };
    if (s.count === N) return { winner: 0 };
    return null;
  },
  // My lines minus theirs; theirs count a bit more, because they move next.
  evaluate(s, player) {
    return lineScore(s.cells, player) - 1.2 * lineScore(s.cells, 3 - player);
  },
};

export function describeMove(after, index, sides) {
  const who = sides[3 - after.turn];
  const col = 'ABCDEFGHJKLMN'[index % SIZE];
  return `${who} played ${col}${SIZE - Math.floor(index / SIZE)}`;
}
