import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Snowflake Growth: Clifford Reiter's cellular model of a snow crystal (Chaos, Solitons & Fractals, 2005). A grid of
// hexagonal cells, each holding an amount of water s. A cell with s ≥ 1 is ice. Every step:
//   • a cell is "receptive" if it is ice or touches ice; receptive cells keep their water and gain γ more (vapour
//     freezing on);
//   • every other cell's water diffuses: u ← u + (α/2)(ū − u), ū the average of its six neighbours;
//   • far away (the grid's edge) the air keeps a fixed vapour level β.
// Only three numbers (α, β, γ), yet it grows six-armed crystals with side branches, because a tip that pokes out
// reaches fresher vapour than the hollows behind it and grows faster still.
// The three flakes here use α = 1 and (β, γ) = (0.4, 0.0001), (0.35, 0.001), (0.8, 0.002). Measured in Node (161 × 161
// grid, grown to 70 cells across a half): the first two fill 21% and 30% of the hexagon they reach, thin branching
// arms; the third, with more vapour, fills 31% but grows ten times faster. Higher β (0.95) fills 58%, nearly a plate.
// The faint blue halo is the vapour, drawn down around the crystal as it freezes on.
// see docs/wiki/sketches/snowflakeGrowth.md

const N = 161, ALPHA = 1;
const FLAKES = [[0.4, 0.0001], [0.35, 0.001], [0.8, 0.002]];
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const HOLD = 4;                      // seconds to admire each finished flake

function makeFlake(which) {
  const [beta, gamma] = FLAKES[which];
  const s = new Float32Array(N * N).fill(beta);
  s[(N >> 1) * N + (N >> 1)] = 1;
  return { which, beta, gamma, s, u: new Float32Array(N * N), v: new Float32Array(N * N), steps: 0, radius: 0, done: 0 };
}
function stepFlake(F) {
  const { s, u, v, beta, gamma } = F;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let rec = s[k] >= 1;
    if (!rec) for (const [di, dj] of NB) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < N && jj < N && s[jj * N + ii] >= 1) { rec = true; break; }
    }
    if (rec) { u[k] = 0; v[k] = s[k] + gamma; } else { u[k] = s[k]; v[k] = 0; }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (i === 0 || j === 0 || i === N - 1 || j === N - 1) { s[k] = beta; continue; }
    let sum = 0;
    for (const [di, dj] of NB) sum += u[(j + dj) * N + i + di];
    s[k] = u[k] + (ALPHA / 2) * (sum / 6 - u[k]) + v[k];
    if (s[k] >= 1) {
      const q = i - (N >> 1), r = j - (N >> 1);
      F.radius = Math.max(F.radius, (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2);   // hex distance from the centre
    }
  }
  F.steps++;
}
const iceCount = (F) => F.s.reduce((n, x) => n + (x >= 1 ? 1 : 0), 0);

const LIVE = { which: 0, steps: 0, radius: 0, fill: 0 };

export default {
  name: 'Snowflake Growth',
  description:
    'A snowflake grown from three numbers. Each hexagonal cell holds some water; cells touching ice catch a little more, ' +
    'the rest let their vapour spread out. Arms that poke out reach fresher vapour and grow faster, so six-fold stars ' +
    'with side branches appear on their own: Clifford Reiter\'s cellular model, 2005.',
  tags: ['snowflake', 'crystal growth', 'cellular automata', 'hexagonal grid', 'diffusion', 'chemistry'],
  category: 'Chemistry',
  mode: '3d',

  motion(t) {
    return { t };
  },

  latex: (params, hl) => {
    const [beta, gamma] = FLAKES[LIVE.which];
    return (
      '\\begin{aligned}' +
      '&\\text{receptive (ice or touching ice): } s \\leftarrow s + \\gamma \\\\' +
      '&\\text{otherwise: } u \\leftarrow u + \\tfrac{\\alpha}{2}(\\bar u - u),\\quad \\text{ice when } s \\ge 1 \\\\' +
      `&\\alpha = 1,\\ \\beta = ${beta},\\ \\gamma = ${gamma} \\\\` +
      `&\\text{step } ${hl(LIVE.steps, 0)}:\\ \\text{arm length } ${hl(LIVE.radius, 0)}\\ \\text{cells},\\ \\text{fills } ${hl(LIVE.fill * 100, 0)}\\%\\ \\text{of its hexagon} \\\\` +
      `& ${caption(LIVE.radius > 70 ? 'Finished. No two alike, except these, which are exactly symmetric.' : 'Growing. Tips reach fresh vapour first, so tips win.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.9 });
    return { stage, flake: makeFlake(0), img: null, ig: null, data: null, look: null, lookKey: '' };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    let F = state.flake;
    const speed = ctx.params.speed ?? 1;
    if (F.radius >= 72) {
      F.done += ctx.delta * speed;
      if (F.done > HOLD) F = state.flake = makeFlake((F.which + 1) % FLAKES.length);
    } else {
      const steps = Math.round(2 * speed);
      for (let s = 0; s < steps && F.radius < 72; s++) stepFlake(F);
    }
    LIVE.which = F.which; LIVE.steps = F.steps; LIVE.radius = F.radius;
    LIVE.fill = F.radius ? iceCount(F) / (3 * F.radius * (F.radius + 1) + 1) : 1;

    // Each pixel of the picture looks up its hexagonal cell (worked out once per picture size).
    const sq = state.stage.square(4), P = Math.max(64, Math.min(520, Math.round(sq.s)));
    if (state.lookKey !== String(P)) {
      state.lookKey = String(P);
      state.img = document.createElement('canvas'); state.img.width = state.img.height = P;
      state.ig = state.img.getContext('2d'); state.data = state.ig.createImageData(P, P);
      state.look = new Int32Array(P * P);
      const span = N * 0.92;                               // cells across the picture
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        // picture → axial hex coordinates (pointy-top layout), then round to the nearest cell
        const fx = (x / P - 0.5) * span, fy = (y / P - 0.5) * span;
        const r = (2 / Math.sqrt(3)) * fy, q = fx - r / 2;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        const i = rq + (N >> 1), j = rr + (N >> 1), hexDist = (Math.abs(rq) + Math.abs(rr) + Math.abs(rq + rr)) / 2;
        // only a hexagon round the centre is shown (the grid itself is a diamond, which would look odd)
        state.look[y * P + x] = i >= 0 && j >= 0 && i < N && j < N && hexDist < N / 2 - 3 ? j * N + i : -1;
      }
    }
    const px = state.data.data, s = F.s, beta = F.beta;
    for (let p = 0; p < P * P; p++) {
      const k = state.look[p], o = p * 4;
      if (k < 0) { px[o] = px[o + 1] = px[o + 2] = 4; px[o + 3] = 255; continue; }
      const w = s[k];
      if (w >= 1) {
        // ice: brighter where more water has piled up, showing the ridges inside the crystal
        const d = Math.min(1, (w - 1) * 2.5);
        px[o] = 150 + 105 * d; px[o + 1] = 200 + 55 * d; px[o + 2] = 255;
      } else {
        // vapour: a faint blue, darker where the crystal has drawn it down
        const dep = Math.max(0, Math.min(1, (beta - w) / beta));
        px[o] = 6 + 30 * dep; px[o + 1] = 10 + 50 * dep; px[o + 2] = 22 + 110 * dep;
      }
      px[o + 3] = 255;
    }
    state.ig.putImageData(state.data, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(state.img, sq.x, sq.y, sq.s, sq.s);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.75)'; g.textAlign = 'left';
    g.fillText(`flake ${F.which + 1} of 3`, sq.x, sq.y + sq.s + 14);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
