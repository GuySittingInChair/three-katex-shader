// Mancala (Kalah, six pits, four seeds each). Pits 0–5 are player 1's (left
// to right along the bottom), 6 is player 1's store; pits 7–12 are player 2's
// (right to left along the top), 13 is player 2's store.
//
// Pick up every seed in one of your pits and sow them one per pit,
// anticlockwise, into your own store but never the opponent's. Last seed in
// your store: move again. Last seed in one of your own empty pits, opposite
// a non-empty pit: capture both into your store. When one side's pits are
// all empty, the other side keeps what's left on theirs; the bigger store wins.
//
// State: { pits: Int8Array(14), turn: 1 | 2, sown: [pit indices, in order], captured: pit | -1, from: pit | -1 }

export const PITS = 6;
export const STORE = { 1: 6, 2: 13 };
const own = (player, i) => (player === 1 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
const opposite = (i) => 12 - i;

export function newGame() {
  const pits = new Int8Array(14);
  for (let i = 0; i < 14; i++) if (i !== 6 && i !== 13) pits[i] = 4;
  return { pits, turn: 1, sown: [], captured: -1, from: -1 };
}

function sideSum(pits, player) {
  let s = 0;
  const start = player === 1 ? 0 : 7;
  for (let i = start; i < start + PITS; i++) s += pits[i];
  return s;
}

export const game = {
  id: 'mancala',
  toMove: (s) => s.turn,
  moves(s) {
    const start = s.turn === 1 ? 0 : 7;
    const out = [];
    for (let i = start; i < start + PITS; i++) if (s.pits[i] > 0) out.push(i);
    // Moves that end in the store (another turn) first: better pruning.
    const store = STORE[s.turn];
    return out.sort((a, b) => ((store - b + 14) % 14 === s.pits[b] % 13) - ((store - a + 14) % 14 === s.pits[a] % 13));
  },
  play(s, from) {
    const pits = s.pits.slice();
    const me = s.turn;
    const skip = STORE[3 - me];
    let seeds = pits[from];
    pits[from] = 0;
    let i = from;
    const sown = [];
    while (seeds > 0) {
      i = (i + 1) % 14;
      if (i === skip) continue;
      pits[i]++;
      sown.push(i);
      seeds--;
    }
    let captured = -1;
    if (own(me, i) && pits[i] === 1 && pits[opposite(i)] > 0) {
      pits[STORE[me]] += pits[opposite(i)] + 1;
      captured = opposite(i);
      pits[opposite(i)] = 0;
      pits[i] = 0;
    }
    // Game over: whoever still has seeds keeps them.
    if (sideSum(pits, 1) === 0 || sideSum(pits, 2) === 0) {
      for (const p of [1, 2]) {
        const start = p === 1 ? 0 : 7;
        for (let k = start; k < start + PITS; k++) {
          pits[STORE[p]] += pits[k];
          pits[k] = 0;
        }
      }
    }
    const again = i === STORE[me];
    return { pits, turn: again ? me : 3 - me, sown, captured, from };
  },
  outcome(s) {
    if (sideSum(s.pits, 1) !== 0 && sideSum(s.pits, 2) !== 0) return null;
    const a = s.pits[6];
    const b = s.pits[13];
    return { winner: a === b ? 0 : a > b ? 1 : 2 };
  },
  // Store difference, plus a little for seeds still on your side.
  evaluate(s, player) {
    const opp = 3 - player;
    return 4 * (s.pits[STORE[player]] - s.pits[STORE[opp]]) + (sideSum(s.pits, player) - sideSum(s.pits, opp));
  },
};

export function describeMove(after, from, sides) {
  const who = sides[from < 6 ? 1 : 2];
  const pit = from < 6 ? from + 1 : from - 6;
  let text = `${who} sowed pit ${pit}`;
  if (after.captured >= 0) text += ' and captured';
  if (after.turn === (from < 6 ? 1 : 2) && !game.outcome(after)) text += ', and goes again';
  return `${text} · stores ${after.pits[6]}–${after.pits[13]}`;
}

export function summary(s, sides, human) {
  if (human) return `your store ${s.pits[STORE[human]]}, computer ${s.pits[STORE[3 - human]]}`;
  return `${sides[1]} ${s.pits[6]}, ${sides[2]} ${s.pits[13]}`;
}
