import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Double Slit, With Eraser. A wave (light, or electrons: the maths is the same) comes from the left, passes two
// slits and spreads. Each slit is modelled as 5 point sources across its width (Huygens: every point of a gap
// sends out a fresh ripple), so the pattern has the right single-slit envelope as well as the two-slit fringes.
// Units: wavelengths. Slits 6 apart, each 1.5 wide, screen 60 away.
// Particles arrive one at a time, at random, with probability |ψ|² at each point of the screen.
// Act 1, no detector:           P(y) ∝ |ψ₁ + ψ₂|²                fringes
// Act 2, which-path detector:   P(y) ∝ |ψ₁|² + |ψ₂|²              no fringes: knowing the path destroys them
// Act 3, the eraser: the path record is read in a way that can't tell the slits apart, giving + or −:
//     P(y, +) ∝ |ψ₁ + ψ₂|² / 2,  P(y, −) ∝ |ψ₁ − ψ₂|² / 2           fringes and anti-fringes
// Their sum is still Act 2's pattern: the eraser never changes where particles land, only how they can be sorted
// afterwards (as in Kim et al., 1999). Sorting by the result brings the fringes back, each subset on its own.
// see docs/wiki/sketches/doubleSlitEraser.md

const D = 6, WIDTH = 1.5, L = 60, SUBS = 5;
const ACT = 22;
const RATE = 70;                 // particles a second
const BINS = 240, YMAX = 30;     // the screen runs from −30 to +30 wavelengths
const FW = 220, FH = 132;        // field picture size
const FX0 = -8, FX1 = L, FY = 22; // field picture covers x from −8 to 60, y from −22 to 22

// The two slits' sources, and each slit's complex amplitude at a point (sum over its sources, e^{ikr}/√r).
const SRC = [-1, 1].map((sgn) => Array.from({ length: SUBS }, (_, q) => (sgn * D) / 2 + (q / (SUBS - 1) - 0.5) * WIDTH));
function slitWave(s, x, y) {
  let re = 0, im = 0;
  for (const sy of SRC[s]) {
    const r = Math.hypot(x, y - sy), ph = TAU * r, a = 1 / Math.sqrt(Math.max(r, 0.3)) / SUBS;
    re += a * Math.cos(ph); im += a * Math.sin(ph);
  }
  return [re, im];
}

// Screen probabilities and the two slits' fields, worked out the first time the sketch opens.
let SCREEN = null, CDF = null, FIELD = null;
const screenOdds = () => {
  const both = new Float64Array(BINS), sum = new Float64Array(BINS), minus = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    const y = -YMAX + ((b + 0.5) / BINS) * 2 * YMAX;
    const [a, c] = slitWave(0, L, y), [d, e] = slitWave(1, L, y);
    both[b] = (a + d) ** 2 + (c + e) ** 2;
    minus[b] = (a - d) ** 2 + (c - e) ** 2;
    sum[b] = a * a + c * c + d * d + e * e;
  }
  return { both, sum, minus };
};
const cdf = (p) => { const c = new Float64Array(p.length); let s = 0; p.forEach((v, i) => (c[i] = s += v)); return c.map((v) => v / s); };
const pick = (c, u) => { let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; } return lo; };

// The static field of each slit over the picture (complex), so each frame only has to turn the phase.
const slitFields = () => [0, 1].map((s) => {
  const re = new Float32Array(FW * FH), im = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = FX0 + ((i + 0.5) / FW) * (FX1 - FX0), y = FY - ((j + 0.5) / FH) * 2 * FY;
    if (x <= 0) continue;
    const [a, b] = slitWave(s, x, y);
    re[j * FW + i] = a; im[j * FW + i] = b;
  }
  return { re, im };
});

const LIVE = { n: 0, plus: 0, minus: 0 };

export default {
  name: 'Double Slit, With Eraser',
  description:
    'Particles go through two slits one at a time and still build up stripes: each one is a wave that went through ' +
    'both. Switch on a detector that records which slit and the stripes vanish. Erase that record and they come back, ' +
    'but only when you sort the particles by what the eraser said; all together, nothing changed.',
  tags: ['quantum mechanics', 'double slit', 'interference', 'quantum eraser', 'waves', 'probability'],
  category: 'Waves',
  mode: '3d',

  motion(t) {
    const cyc = Math.floor(t / (3 * ACT)), u = t % (3 * ACT);
    return { act: Math.floor(u / ACT), tAct: u % ACT, cyc, t };
  },

  latex: (params, hl, m) => {
    const rows = [
      ['P(y) \\propto |\\psi_1 + \\psi_2|^2', 'No detector. Each particle went through both slits. Nobody asked which.'],
      ['P(y) \\propto |\\psi_1|^2 + |\\psi_2|^2', 'Detector on. Every particle now has a slit on file. Stripes gone.'],
      ['P_\\pm(y) \\propto \\tfrac12|\\psi_1 \\pm \\psi_2|^2', 'Record erased. Sort by + or −: stripes and anti-stripes. Add them: no stripes.'],
    ][m.act];
    return (
      '\\begin{aligned}' +
      `&${rows[0]} \\\\` +
      `&\\text{particles: } ${hl(LIVE.n, 0)}` + (m.act === 2 ? `\\quad (+\\!: ${LIVE.plus},\\ -\\!: ${LIVE.minus})` : '') + ' \\\\' +
      '&\\text{slits } 6\\lambda \\text{ apart, screen } 60\\lambda \\text{ away} \\\\' +
      `& ${caption(rows[1])}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    if (!SCREEN) { SCREEN = screenOdds(); CDF = { both: cdf(SCREEN.both), sum: cdf(SCREEN.sum) }; FIELD = slitFields(); }
    const stage = createStage(ctx, { glow: 0.7 });
    const img = document.createElement('canvas');
    img.width = FW; img.height = FH;
    const ig = img.getContext('2d');
    return { stage, img, ig, data: ig.createImageData(FW, FH), key: '', hits: [], made: 0, r: rng(1) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    const key = `${m.cyc}:${m.act}`;
    if (key !== state.key) { state.key = key; state.hits = []; state.made = 0; state.r = rng(m.cyc * 3 + m.act + 1); }
    // New particles, drawn from the act's probability.
    const want = Math.floor(m.tAct * RATE);
    while (state.made < want) {
      state.made++;
      const r = state.r;
      if (m.act === 0) state.hits.push({ b: pick(CDF.both, r()), y: r(), s: 0 });
      else {
        const b = pick(CDF.sum, r());
        // In act 3, the eraser's answer: + with chance |ψ₁+ψ₂|² / (2(|ψ₁|²+|ψ₂|²)) at this point, otherwise −.
        const s = m.act === 2 ? (r() < SCREEN.both[b] / (2 * SCREEN.sum[b]) ? 1 : -1) : 0;
        state.hits.push({ b, y: r(), s });
      }
    }
    LIVE.n = state.hits.length;
    LIVE.plus = state.hits.filter((h) => h.s === 1).length;
    LIVE.minus = state.hits.filter((h) => h.s === -1).length;

    // The wave: act 1 the real part of ψ₁ + ψ₂ (gold crests, blue troughs); acts 2 and 3 each slit's own ripples,
    // green and magenta, which no longer add as waves because each is tagged with its slit.
    const w = TAU * m.t * 0.8, cw = Math.cos(w), sw = Math.sin(w);
    const px = state.data.data, F0 = FIELD[0], F1 = FIELD[1];
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const k = j * FW + i, x = FX0 + ((i + 0.5) / FW) * (FX1 - FX0);
      let rr = 0, gg = 0, bb = 0;
      if (x <= 0) {
        const v = Math.cos(TAU * x - w) * 0.6;                // the plane wave coming in
        rr = 255 * Math.max(0, v); gg = 200 * Math.max(0, v); bb = 255 * Math.max(0, -v) * 0.8;
      } else if (m.act === 0) {
        const v = (F0.re[k] + F1.re[k]) * cw + (F0.im[k] + F1.im[k]) * sw;
        rr = 420 * Math.max(0, v); gg = 330 * Math.max(0, v); bb = 420 * Math.max(0, -v);
      } else {
        const v0 = F0.re[k] * cw + F0.im[k] * sw, v1 = F1.re[k] * cw + F1.im[k] * sw;
        gg = 380 * Math.abs(v0); rr = 380 * Math.abs(v1); bb = 330 * Math.abs(v1);
      }
      px[k * 4] = Math.min(255, rr); px[k * 4 + 1] = Math.min(255, gg); px[k * 4 + 2] = Math.min(255, bb); px[k * 4 + 3] = 255;
    }
    state.ig.putImageData(state.data, 0, 0);

    // Layout: field on the left 70% of the area, screen and its tally on the right.
    const fw = a.w * 0.66, fh = Math.min(a.h, fw * (FH / FW) * 1.25), fy = a.y + (a.h - fh) / 2;
    g.imageSmoothingEnabled = true;
    g.drawImage(state.img, a.x, fy, fw, fh);
    const X = (x) => a.x + ((x - FX0) / (FX1 - FX0)) * fw, Y = (y) => fy + fh / 2 - (y / FY) * (fh / 2);
    // the barrier, with its two gaps, and a detector lamp beside each slit in acts 2–3
    g.fillStyle = 'rgb(70,75,95)';
    const bx = X(0) - 3;
    const gaps = [[-D / 2 - WIDTH / 2, -D / 2 + WIDTH / 2], [D / 2 - WIDTH / 2, D / 2 + WIDTH / 2]];
    let yPrev = FY;
    for (const [lo, hi] of [...gaps].reverse()) { g.fillRect(bx, Y(yPrev), 6, Y(hi) - Y(yPrev)); yPrev = lo; }
    g.fillRect(bx, Y(yPrev), 6, Y(-FY) - Y(yPrev));
    if (m.act > 0) {
      const blink = 0.6 + 0.4 * Math.sin(m.t * 9);
      [[-D / 2, 'rgb(90,255,140)'], [D / 2, 'rgb(255,90,230)']].forEach(([y, c]) => { g.fillStyle = c; g.globalAlpha = m.act === 1 ? blink : 0.35; g.beginPath(); g.arc(bx - 8, Y(y), 4, 0, TAU); g.fill(); });
      g.globalAlpha = 1;
    }
    // The screen: a strip of dots where particles landed, and a histogram growing to its right.
    const sx = a.x + fw + 8, sw2 = a.w - fw - 8;
    const SY = (b) => fy + fh / 2 - ((-YMAX + ((b + 0.5) / BINS) * 2 * YMAX) / FY) * (fh / 2);
    g.fillStyle = 'rgb(30,32,44)';
    g.fillRect(sx, fy, 10, fh);
    const tallyP = new Float32Array(BINS), tallyM = new Float32Array(BINS);
    for (const h of state.hits) {
      const y = SY(h.b) + (h.y - 0.5) * ((2 * YMAX) / BINS / FY) * (fh / 2);
      if (y < fy || y > fy + fh) continue;
      g.fillStyle = h.s === 1 ? 'rgba(255,210,90,0.9)' : h.s === -1 ? 'rgba(90,220,255,0.9)' : 'rgba(255,245,220,0.85)';
      g.fillRect(sx + 1 + ((h.b * 7919) % 8), y, 1.6, 1.6);
      if (h.s === -1) tallyM[h.b]++; else tallyP[h.b]++;
    }
    const smooth3 = (t, b) => (t[Math.max(0, b - 1)] + t[b] + t[Math.min(BINS - 1, b + 1)]) / 3;
    const top = Math.max(4, ...Array.from({ length: BINS }, (_, b) => smooth3(tallyP, b) + smooth3(tallyM, b)));
    const bar = (t, col, stack) => {
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let b = 0; b < BINS; b++) {
        const y = SY(b);
        if (y < fy || y > fy + fh) continue;
        const v = smooth3(t, b) + (stack ? smooth3(stack, b) : 0);
        const x = sx + 14 + (v / top) * (sw2 - 18);
        if (b) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    };
    if (m.act === 2) { bar(tallyP, 'rgba(255,210,90,0.95)'); bar(tallyM, 'rgba(90,220,255,0.95)'); bar(tallyP, 'rgba(220,220,230,0.5)', tallyM); }
    else bar(tallyP, 'rgba(255,240,210,0.95)');
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.75)'; g.textAlign = 'left';
    g.fillText(m.act === 2 ? 'gold: eraser said +   blue: eraser said −   grey: both' : 'where particles landed', sx, fy + fh + 16);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
