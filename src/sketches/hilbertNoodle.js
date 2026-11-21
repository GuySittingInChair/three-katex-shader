import { smooth, TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Hilbert's Infinite Noodle. David Hilbert (1891) found a curve that, refined over and over, passes through every
// point of a square: a line that fills an area. At order n it visits all 4ⁿ cells of a 2ⁿ × 2ⁿ grid, one step to a
// neighbouring cell at a time (each step 1/2ⁿ of the side), so its length in a unit square is exactly
//     L(n) = (4ⁿ − 1) / 2ⁿ ≈ 2ⁿ,   which grows without limit; the limit curve fills the square (dimension 2).
// Each order is built from four copies of the one before, turned and joined; in this animation every point of order n
// grows out of its "parent" (the order n − 1 point whose cell it is in), so you can watch each corner split in four.
// The colour runs along the curve from start to end. Because the curve never jumps, points close together along it
// are close together in the square ("locality"); that is why Hilbert curves are used to store maps and images so that
// neighbours stay neighbours on disk. (The reverse isn't always true: two neighbouring cells can be far apart along
// the curve, across one of its big folds.)
// see docs/wiki/sketches/hilbertNoodle.md

const MAX = 7, HOLD = 2.2, GROW = 2.6, LOOP = MAX * (HOLD + GROW);

// Index d (0 … 4ⁿ − 1) along an order-n curve → cell (x, y). The standard bit-twiddling algorithm.
function cellOf(n, d) {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < 1 << n; s <<= 1) {
    const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
    x += s * rx; y += s * ry; t >>= 2;
  }
  return [x, y];
}
const CURVES = Array.from({ length: MAX + 1 }, (_, n) => {
  const m = 4 ** n, pts = new Float32Array(m * 2), side = 2 ** n;
  for (let d = 0; d < m; d++) { const [x, y] = cellOf(n, d); pts[d * 2] = (x + 0.5) / side; pts[d * 2 + 1] = (y + 0.5) / side; }
  return pts;
});
const lengthOf = (n) => (4 ** n - 1) / 2 ** n;
const hue = (u) => {
  const c = (o) => Math.round(255 * Math.max(0, Math.min(1, 0.55 + 0.45 * Math.cos(TAU * (u * 0.9 + o)))));
  return `rgb(${c(0)},${c(0.33)},${c(0.67)})`;
};

export default {
  name: "Hilbert's Infinite Noodle",
  description:
    'A single line that, folded finer and finer, passes through every point of a square. Each order is four copies of ' +
    'the last, joined; every corner splits into four as you watch. Its length doubles each time, so drawn on a one-metre ' +
    'tile, order 20 would be a noodle over a thousand kilometres long. Hilbert, 1891.',
  tags: ['space-filling curve', 'hilbert curve', 'fractals', 'locality', 'recursion', 'humor'],
  category: 'Geometry',
  mode: '3d',

  motion(t) {
    const u = t % LOOP, step = HOLD + GROW;
    const k = Math.floor(u / step), w = u - k * step;
    // order k + 1 grows out of order k, then holds
    return { n: k + 1, grow: w < GROW ? smooth(w / GROW) : 1, tracer: (t * 0.035) % 1 };
  },

  latex: (params, hl, m) => {
    const n = m.n;
    return (
      '\\begin{aligned}' +
      `n &= ${n}:\\quad 4^{${n}} = ${(4 ** n).toLocaleString('en')}\\ \\text{cells visited} \\\\` +
      `L(n) &= \\frac{4^n - 1}{2^n} = ${hl(lengthOf(n), 2)}\\ \\text{m on a 1 m tile} \\\\` +
      `L(20) &= ${hl(lengthOf(20) / 1000, 0)}\\ \\text{km} \\\\` +
      `& ${caption(n < 4 ? 'A noodle, folded.' : n < MAX ? 'Still one noodle. No gaps, no crossings, no shortcuts.' : 'Order 7: 16,384 cells. Order infinity: every point. Bring a big pot.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.7 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    const sq = state.stage.square(30), S = sq.s;
    const X = (u) => sq.x + u * S, Y = (v) => sq.y + (1 - v) * S;
    const now = CURVES[m.n], prev = CURVES[m.n - 1], count = 4 ** m.n;
    const px = (d, q) => {
      const parent = Math.floor(d / 4);
      return prev[parent * 2 + q] + (now[d * 2 + q] - prev[parent * 2 + q]) * m.grow;
    };
    g.lineWidth = Math.max(1, 3.2 - m.n * 0.35);
    g.lineJoin = 'round';
    const chunks = 96;                                      // draw in coloured stretches
    for (let c = 0; c < chunks; c++) {
      const d0 = Math.floor((c / chunks) * count), d1 = Math.min(count - 1, Math.floor(((c + 1) / chunks) * count));
      g.strokeStyle = hue(c / chunks);
      g.beginPath();
      for (let d = d0; d <= d1; d++) (d === d0 ? g.moveTo(X(px(d, 0)), Y(px(d, 1))) : g.lineTo(X(px(d, 0)), Y(px(d, 1))));
      g.stroke();
    }
    // The tracer: a point moving steadily along the curve, and the same point on the straightened-out line below.
    const d = Math.min(count - 1, Math.floor(m.tracer * count));
    g.fillStyle = 'white';
    g.beginPath(); g.arc(X(px(d, 0)), Y(px(d, 1)), 5, 0, TAU); g.fill();
    const ly = sq.y + S + 14, lh = 8;
    for (let c = 0; c < chunks; c++) { g.fillStyle = hue(c / chunks); g.fillRect(sq.x + (c / chunks) * S, ly, S / chunks + 1, lh); }
    g.fillStyle = 'white'; g.fillRect(sq.x + m.tracer * S - 1.5, ly - 4, 3, lh + 8);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.75)'; g.textAlign = 'left';
    g.fillText('the same noodle, pulled straight', sq.x, ly + lh + 14);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
