import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Prisoner's Dilemma Turf War: Nowak and May's spatial game (Nature, 1992). Every square of a 99 × 99 board is a
// player that either cooperates or defects. Each round it plays every neighbour (8 around it) and itself:
//     cooperator meets cooperator: 1 point each;  defector meets cooperator: b points (cooperator gets 0);
//     anyone meets a defector: 0
// then every player copies the strategy of whoever scored most in its neighbourhood (itself included).
// Colours, as in their paper: blue stayed a cooperator, red stayed a defector, yellow just turned defector,
// green just turned cooperator.
// Act 1: one defector in a sea of cooperators, b = 1.85: a perfectly symmetric, ever-changing kaleidoscope.
// Act 2: 10% defectors scattered at random: shifting borders, cooperators holding about 31% of the board.
// Checked in Node: the act-1 pattern stays mirror-symmetric for 200 rounds; act 2 (b = 1.9, rounds 100–400)
// averages 0.313 cooperators, between 0.25 and 0.36.
// see docs/wiki/sketches/prisonersTurfWar.md

const N = 99;
const ACT = 30;               // seconds per act
const RATE = 6;               // rounds a second

function pdRound(S, b, out, score) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += 1 - S[((y + dy + N) % N) * N + ((x + dx + N) % N)];
    score[y * N + x] = S[y * N + x] ? b * c : c;        // 1 = defector; c = cooperators met, itself included
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = -1, s = S[y * N + x];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = ((y + dy + N) % N) * N + ((x + dx + N) % N);
      if (score[j] > best) { best = score[j]; s = S[j]; }
    }
    out[y * N + x] = s;
  }
}

function setUp(act, seed) {
  const S = new Uint8Array(N * N);
  if (act === 0) S[49 * N + 49] = 1;
  else { const r = rng(seed); for (let i = 0; i < N * N; i++) S[i] = r() < 0.1 ? 1 : 0; }
  return { S, prev: S.slice(), next: new Uint8Array(N * N), score: new Float32Array(N * N), rounds: 0, history: [] };
}

const LIVE = { coop: 1, rounds: 0, avg: null };

export default {
  name: "Prisoner's Dilemma Turf War",
  description:
    'Ten thousand players on a board, each cooperating or cheating, each copying whichever neighbour did best. One ' +
    'cheater in a sea of cooperators grows a perfectly symmetric kaleidoscope that never settles; a scattering of ' +
    'cheaters makes shifting borders where cooperators hold about a third of the land. Nowak and May, 1992.',
  tags: ['game theory', 'prisoners dilemma', 'evolution', 'cooperation', 'cellular automata', 'nowak may'],
  category: 'Biology',
  mode: '3d',

  motion(t) {
    const cycle = Math.floor(t / (2 * ACT)), inCycle = t % (2 * ACT);
    return { act: inCycle < ACT ? 0 : 1, cycle, tAct: inCycle % ACT };
  },

  latex: (params, hl, m) => {
    const b = params.b ?? 1.85;
    const line = m.act === 0
      ? 'One cheater. Everyone else nice. This goes on forever.'
      : LIVE.coop < 0.05 ? 'Cheaters everywhere. Nobody is getting any points.'
      : 'Cooperators survive in clumps: inside a clump, being nice pays.';
    return (
      '\\begin{aligned}' +
      '&\\begin{array}{c|cc} & \\text{meets C} & \\text{meets D} \\\\ \\hline \\text{C gets} & 1 & 0 \\\\ \\text{D gets} & b & 0 \\end{array}' +
      `\\quad b = ${hl(b, 2)} \\\\` +
      `&\\text{round } ${LIVE.rounds}:\\ \\text{cooperators } ${hl(LIVE.coop * 100, 1)}\\% ` +
      (LIVE.avg != null ? `\\ \\ (\\text{average } ${hl(LIVE.avg * 100, 1)}\\%)` : '') + ' \\\\' +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    b: { value: 1.85, min: 1.0, max: 2.6, step: 0.01 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.55 });
    const img = document.createElement('canvas');
    img.width = img.height = N;
    const ig = img.getContext('2d');
    return { stage, img, ig, data: ig.createImageData(N, N), key: '', game: null };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, b = ctx.params.b ?? 1.85;
    const key = `${m.cycle}:${m.act}`;
    if (key !== state.key) { state.key = key; state.game = setUp(m.act, m.cycle + 3); }
    const G = state.game;
    const want = Math.floor(m.tAct * RATE);
    while (G.rounds < want) {
      G.prev.set(G.S);
      pdRound(G.S, b, G.next, G.score);
      [G.S, G.next] = [G.next, G.S];
      G.rounds++;
      const coop = 1 - G.S.reduce((s, v) => s + v, 0) / (N * N);
      G.history.push(coop);
    }
    LIVE.rounds = G.rounds;
    LIVE.coop = G.history.length ? G.history[G.history.length - 1] : 1 - G.S.reduce((s, v) => s + v, 0) / (N * N);
    LIVE.avg = m.act === 1 && G.history.length > 60 ? G.history.slice(40).reduce((s, v) => s + v, 0) / (G.history.length - 40) : null;

    // Paint: blue C→C, red D→D, yellow C→D, green D→C.
    const px = state.data.data;
    for (let i = 0; i < N * N; i++) {
      const was = G.prev[i], now = G.S[i];
      const c = !was && !now ? [40, 110, 255] : was && now ? [235, 50, 60] : !was && now ? [255, 215, 50] : [60, 230, 110];
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
    state.ig.putImageData(state.data, 0, 0);
    const sq = state.stage.square(10);
    g.imageSmoothingEnabled = false;
    g.drawImage(state.img, sq.x, sq.y, sq.s, sq.s);
    g.font = state.stage.font(12);
    g.fillStyle = 'rgba(210,220,240,0.75)';
    g.textAlign = 'left';
    g.fillText('blue: nice   red: cheat   yellow: just turned cheat   green: just turned nice', sq.x, sq.y + sq.s + 18);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
