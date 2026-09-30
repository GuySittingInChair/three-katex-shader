// Ultimate tic-tac-toe: nine small boards in a 3 × 3 grid. Win a small board
// with three in a row; win the game with three small boards in a row. The
// catch: the cell you play in sends your opponent to the matching small
// board (top-right cell → top-right board). If that board is already
// decided, they may play anywhere. X (player 1) goes first.
//
// State: { cells: Int8Array(81) indexed board * 9 + cell, boards: Int8Array(9)
//          (0 open, 1 / 2 won, 3 drawn), forced: board | -1, turn, last, winner }

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const CELL_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // centre, corners, edges
const WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

function lineWinner(get) {
  for (const [a, b, c] of LINES) {
    const v = get(a);
    if ((v === 1 || v === 2) && v === get(b) && v === get(c)) return v;
  }
  return 0;
}

export function newGame() {
  return { cells: new Int8Array(81), boards: new Int8Array(9), forced: -1, turn: 1, last: -1, winner: 0 };
}

export function openBoards(s) {
  if (s.forced >= 0 && s.boards[s.forced] === 0) return [s.forced];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => s.boards[b] === 0);
}

// Two of mine and an empty spot in a line: a threat.
function threats(get, player) {
  let n = 0;
  for (const [a, b, c] of LINES) {
    const vs = [get(a), get(b), get(c)];
    if (vs.filter((v) => v === player).length === 2 && vs.includes(0)) n++;
  }
  return n;
}

export const game = {
  id: 'ultimate-ttt',
  toMove: (s) => s.turn,
  moves(s) {
    const out = [];
    for (const b of openBoards(s)) {
      for (const c of CELL_ORDER) if (s.cells[b * 9 + c] === 0) out.push(b * 9 + c);
    }
    return out;
  },
  play(s, index) {
    const cells = s.cells.slice();
    const boards = s.boards.slice();
    cells[index] = s.turn;
    const b = Math.floor(index / 9);
    const local = lineWinner((k) => cells[b * 9 + k]);
    if (local) boards[b] = local;
    else if ([0, 1, 2, 3, 4, 5, 6, 7, 8].every((k) => cells[b * 9 + k] !== 0)) boards[b] = 3;
    const winner = lineWinner((k) => boards[k]);
    return { cells, boards, forced: index % 9, turn: 3 - s.turn, last: index, winner };
  },
  outcome(s) {
    if (s.winner) return { winner: s.winner };
    if (openBoards(s).length === 0) return { winner: 0 };
    return null;
  },
  // Small boards won (the centre board most), threats to win the big board,
  // and threats and good cells inside the small boards still open.
  evaluate(s, player) {
    const opp = 3 - player;
    let score = 0;
    for (let b = 0; b < 9; b++) {
      if (s.boards[b] === player) score += 60 * WEIGHT[b];
      else if (s.boards[b] === opp) score -= 60 * WEIGHT[b];
      else if (s.boards[b] === 0) {
        const get = (k) => s.cells[b * 9 + k];
        score += WEIGHT[b] * (6 * threats(get, player) - 6 * threats(get, opp));
        for (let k = 0; k < 9; k++) {
          if (get(k) === player) score += WEIGHT[k];
          else if (get(k) === opp) score -= WEIGHT[k];
        }
      }
    }
    const big = (k) => (s.boards[k] === 3 ? -1 : s.boards[k]);
    score += 150 * (threats(big, player) - threats(big, opp));
    return score;
  },
};

const NAMES = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom', 'bottom-right'];
export function describeMove(after, index, sides) {
  const who = sides[3 - after.turn];
  const b = Math.floor(index / 9);
  const won = after.boards[b] === 3 - after.turn ? `, winning the ${NAMES[b]} board` : '';
  return `${who} played in the ${NAMES[b]} board${won}`;
}
