import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Riemann Zeta Zero Hunter. The zeta function ζ(s) = 1 + 1/2ˢ + 1/3ˢ + … (continued beyond where that sum works) holds
// the secret of how prime numbers are spread out. Its most important zeros all seem to lie on one line, the critical
// line Re(s) = ½: that guess is the Riemann hypothesis (1859), still unproved, with a million-dollar Clay Millennium
// Prize waiting.
// This sketch walks up the critical line, s = ½ + it for t from 0 to 50, and draws where ζ(s) lands in the complex
// plane. The curve loops and swirls, and every time it passes exactly through 0, that t is a zero.
// ζ is computed by Euler–Maclaurin summation: the first 49 terms directly, then the rest of the infinite sum
// estimated by an integral plus 8 Bernoulli-number corrections. Checked in Node: ζ(2) = π²/6 to 16 digits, and the
// zeros found (by sign changes of the real function Z(t) = e^{iθ(t)} ζ(½ + it)) are 14.134725, 21.022040,
// 25.010858, 30.424876, 32.935062, 37.586178, 40.918719, 43.327073, 48.005151, 49.773832: the published values to
// every digit shown.
// see docs/wiki/sketches/zetaZeroHunter.md

const T_MAX = 50, DT = 0.01, SWEEP = 40, LOOP = 46;
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const npow = (n, s) => { const l = Math.log(n), mg = Math.exp(-s[0] * l), an = -s[1] * l; return [mg * Math.cos(an), mg * Math.sin(an)]; };
const B2K = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510];
function zeta(s, N = 50, M = 8) {
  const sum = [0, 0];
  for (let n = 1; n < N; n++) { const p = npow(n, s); sum[0] += p[0]; sum[1] += p[1]; }
  const Ns = npow(N, s), tail = cdiv(cmul(Ns, [N, 0]), [s[0] - 1, s[1]]);
  sum[0] += tail[0] + Ns[0] / 2; sum[1] += tail[1] + Ns[1] / 2;
  let poch = s.slice(), fact = 2, Np = cmul(Ns, [1 / N, 0]);
  for (let k = 1; k <= M; k++) {
    const term = cmul([B2K[k - 1] / fact, 0], cmul(poch, Np));
    sum[0] += term[0]; sum[1] += term[1];
    poch = cmul(poch, cmul([s[0] + 2 * k - 1, s[1]], [s[0] + 2 * k, s[1]]));
    fact *= (2 * k + 1) * (2 * k + 2);
    Np = cmul(Np, [1 / (N * N), 0]);
  }
  return sum;
}
const theta = (t) => (t / 2) * Math.log(t / TAU) - t / 2 - Math.PI / 8 + 1 / (48 * t) + 7 / (5760 * t ** 3);
const realZ = (t) => { const z = zeta([0.5, t]), th = theta(t); return z[0] * Math.cos(th) - z[1] * Math.sin(th); };

// The whole curve and the zeros along it (bisection on sign changes of Z), worked out the first time the sketch
// opens (not when the site loads).
let PATH = null, ZEROS = [];
const makePath = () => {
  const n = Math.round(T_MAX / DT), pts = new Float32Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) { const z = zeta([0.5, i * DT]); pts[i * 2] = z[0]; pts[i * 2 + 1] = z[1]; }
  return pts;
};
const findZeros = () => {
  const out = [];
  let prev = realZ(1);
  for (let t = 1.01; t <= T_MAX; t += 0.01) {
    const z = realZ(t);
    if (Math.sign(z) !== Math.sign(prev)) {
      let a = t - 0.01, b = t;
      for (let i = 0; i < 50; i++) { const mid = (a + b) / 2; if (Math.sign(realZ(mid)) === Math.sign(realZ(a))) a = mid; else b = mid; }
      out.push((a + b) / 2);
    }
    prev = z;
  }
  return out;
};

export default {
  name: 'Riemann Zeta Zero Hunter',
  description:
    'Walk up the critical line, s = ½ + it, and draw where the Riemann zeta function lands. The curve loops and ' +
    'swirls, and every so often it passes exactly through zero. Those are the zeros the Riemann hypothesis is about: ' +
    'all found so far sit on this one line, and nobody has proved they all must.',
  tags: ['riemann zeta', 'riemann hypothesis', 'complex analysis', 'prime numbers', 'number theory'],
  category: 'Number Theory',
  mode: '3d',

  motion(t) {
    const u = t % LOOP;
    return { tLine: Math.min(T_MAX, (u / SWEEP) * T_MAX) };
  },

  latex: (params, hl, m) => {
    if (!PATH) return '\\text{walking up the critical line…}';
    const k = Math.round(m.tLine / DT), re = PATH[k * 2], im = PATH[k * 2 + 1];
    const found = ZEROS.filter((z) => z <= m.tLine);
    const near = ZEROS.find((z) => Math.abs(z - m.tLine) < 0.25);
    const list = found.slice(-3).map((z) => z.toFixed(6)).join(',\\ ');
    return (
      '\\begin{aligned}' +
      '\\zeta(s) &= \\sum_{n=1}^{\\infty} \\frac{1}{n^s},\\quad s = \\tfrac12 + it \\\\' +
      `t &= ${hl(m.tLine, 2)}:\\ \\zeta = ${hl(re, 3)} ${im < 0 ? '-' : '+'} ${hl(Math.abs(im), 3)}\\,i \\\\` +
      `&\\text{zeros found: } ${found.length}` + (list ? `\\ \\ (\\dots ${list})` : '') + ' \\\\' +
      `& ${caption(near ? 'Through zero. Another one on the line. Still no proof.' : found.length >= 10 ? 'Ten for ten on the line. Trillions checked by computers since. Prize unclaimed.' : 'Hunting along the critical line.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    if (!PATH) { PATH = makePath(); ZEROS = findZeros(); }
    return { stage: createStage(ctx, { glow: 1.0 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    const wide = state.stage.wide;
    // complex plane panel (re from −1.6 to 3.6, im −2.6 … 2.6) and a thin strip showing the critical line
    const pw = wide ? a.w * 0.78 : a.w, ph = wide ? a.h : a.h * 0.82;
    const sc = Math.min(pw / 5.4, ph / 5.4), ox = a.x + pw / 2 - 1.0 * sc, oy = a.y + ph / 2;
    const X = (re) => ox + re * sc, Y = (im) => oy - im * sc;
    g.strokeStyle = 'rgba(120,140,190,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(-1.6), Y(0)); g.lineTo(X(3.6), Y(0)); g.moveTo(X(0), Y(-2.6)); g.lineTo(X(0), Y(2.6)); g.stroke();
    g.font = state.stage.font(11); g.fillStyle = 'rgba(200,210,230,0.6)'; g.textAlign = 'left';
    g.fillText('real', X(3.1), Y(0) - 6); g.fillText('imaginary', X(0) + 6, Y(2.45));
    // the curve so far, fading from old (dim) to new (bright)
    const k = Math.round(m.tLine / DT);
    g.lineWidth = 1.6; g.lineJoin = 'round';
    const chunk = 40;
    for (let c = 0; c * chunk < k; c++) {
      const i0 = c * chunk, i1 = Math.min(k, i0 + chunk), age = (k - i1) / 1500;
      g.strokeStyle = `rgba(${Math.round(120 + 135 * Math.max(0, 1 - age))},${Math.round(170 + 50 * Math.max(0, 1 - age))},255,${Math.max(0.25, 1 - age)})`;
      g.beginPath();
      for (let i = i0; i <= i1; i++) (i === i0 ? g.moveTo(X(PATH[i * 2]), Y(PATH[i * 2 + 1])) : g.lineTo(X(PATH[i * 2]), Y(PATH[i * 2 + 1])));
      g.stroke();
    }
    // the origin glows when the curve passes through it
    const near = ZEROS.reduce((b, z) => Math.min(b, Math.abs(z - m.tLine)), 9);
    const flash = Math.exp(-near * 6);
    g.fillStyle = `rgba(255,210,100,${0.4 + 0.6 * flash})`;
    g.beginPath(); g.arc(X(0), Y(0), 4 + 10 * flash, 0, TAU); g.fill();
    g.fillStyle = 'white';
    g.beginPath(); g.arc(X(PATH[k * 2]), Y(PATH[k * 2 + 1]), 4, 0, TAU); g.fill();
    // the critical line: t going up, a mark at every zero found
    const lx = wide ? a.x + a.w * 0.92 : a.x + a.w * 0.5, ly0 = wide ? a.y + a.h : a.y + a.h, lh = wide ? a.h : a.h * 0.12;
    if (wide) {
      g.strokeStyle = 'rgba(200,210,230,0.5)'; g.beginPath(); g.moveTo(lx, ly0); g.lineTo(lx, ly0 - lh); g.stroke();
      const T = (t) => ly0 - (t / T_MAX) * lh;
      g.fillStyle = 'rgba(200,210,230,0.7)'; g.textAlign = 'right';
      g.fillText('Re(s) = ½', lx - 6, ly0 - lh - 6);
      for (const z of ZEROS) if (z <= m.tLine) { g.fillStyle = 'rgb(255,210,100)'; g.beginPath(); g.arc(lx, T(z), 3.5, 0, TAU); g.fill(); g.fillStyle = 'rgba(220,225,240,0.7)'; g.fillText(z.toFixed(2), lx - 8, T(z) + 4); }
      g.fillStyle = 'white'; g.fillRect(lx - 5, T(m.tLine) - 1, 10, 2);
    } else {
      const T = (t) => a.x + (t / T_MAX) * a.w;
      g.strokeStyle = 'rgba(200,210,230,0.5)'; g.beginPath(); g.moveTo(a.x, ly0 - 6); g.lineTo(a.x + a.w, ly0 - 6); g.stroke();
      for (const z of ZEROS) if (z <= m.tLine) { g.fillStyle = 'rgb(255,210,100)'; g.beginPath(); g.arc(T(z), ly0 - 6, 3.5, 0, TAU); g.fill(); }
      g.fillStyle = 'white'; g.fillRect(T(m.tLine) - 1, ly0 - 11, 2, 10);
    }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
