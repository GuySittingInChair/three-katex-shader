import * as THREE from 'three';
import { phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Infinitely many perpendicular directions, and what that does to
// convergence. In L²[−π, π] the waves eₙ = sin(nx)/√π are orthonormal:
// each has length 1 and any two are √2 apart (checked numerically), so the
// sequence e₁, e₂, e₃, … never settles down, and no part of it does either.
// In finite dimensions that can't happen to points on a sphere; here the
// unit sphere has room for infinitely many points all √2 apart.
//
// Yet measured against any fixed g, eₙ fades to nothing:
//
//     ⟨eₙ, g⟩ → 0   for every g   (Bessel: Σ |⟨eₙ, g⟩|² ≤ ‖g‖²)
//
// because faster and faster wiggles cancel themselves out when multiplied by
// a fixed shape. That is weak convergence to 0 without norm convergence. For
// g(x) = x/π, ⟨eₙ, g⟩ = 2(−1)ⁿ⁺¹/(n√π) (checked).
//
// Top: g (gold) and the moving unit vector (blue); it turns from eₙ to eₙ₊₁
// through cos θ eₙ + sin θ eₙ₊₁, which keeps its length exactly 1.
// Middle: their product, whose area is ⟨v, g⟩. Bottom: for each n, ‖eₙ‖ = 1
// (dim) and |⟨eₙ, g⟩|/‖g‖ (gold). Loop (40 s): n climbs to 24 and back.

const PERIOD = 40;
const TOP_N = 24;
const SAMPLES = 400;
const XS = 1.12;
const Y_TOP = 1.0;
const Y_MID = -0.9;
const BAR_Y = -2.95;
const BAR_H = 1.15;
const G_NORM = Math.sqrt((2 * Math.PI) / 3);
const SQRT_PI = Math.sqrt(Math.PI);

const g = (x) => x / Math.PI;
const e = (n, x) => Math.sin(n * x) / SQRT_PI;
const coef = (n) => (2 * (n % 2 ? 1 : -1)) / (n * SQRT_PI); // ⟨eₙ, g⟩

export default {
  name: 'Weak ≠ Strong Convergence',
  description:
    'In infinite dimensions a sequence can fade away without getting shorter. The waves sin(nx) all have length ' +
    '1 and stay √2 apart, yet their overlap with any fixed function g shrinks to 0, because fast wiggles cancel. ' +
    'Middle: the product whose area is the overlap. n, ⟨eₙ, g⟩ and ‖eₙ‖ are live.',
  tags: ['hilbert space', 'weak convergence', 'orthonormal basis', 'bessel inequality', 'functional analysis'],
  category: 'Functional Analysis',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const tri = p < 0.5 ? p * 2 : 2 - p * 2;
    const s = 1 + (TOP_N - 1) * tri;
    const n = Math.min(TOP_N - 1, Math.floor(s));
    // Hold on each eₙ, then turn to the next.
    const theta = (Math.PI / 2) * smooth(clamp01((s - n - 0.3) / 0.7));
    const inner = Math.cos(theta) * coef(n) + Math.sin(theta) * coef(n + 1);
    return { n, theta, inner, shown: theta < Math.PI / 4 ? n : n + 1 };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'v &= \\cos\\theta\\, e_n + \\sin\\theta\\, e_{n+1},\\quad e_n = \\tfrac{\\sin nx}{\\sqrt\\pi},\\quad \\|v\\| = 1,\\quad \\|e_n - e_m\\| = \\sqrt2 \\\\' +
    `n &= ${hl(m.shown, 0)},\\quad \\langle v, g\\rangle = \\int v\\,g\\,dx = ${hl(m.inner, 3)} \\to 0 \\\\` +
    `g &= \\tfrac{x}{\\pi},\\quad \\langle e_n, g\\rangle = \\frac{2(-1)^{n+1}}{n\\sqrt\\pi},\\quad \\textstyle\\sum_n \\langle e_n, g\\rangle^2 = \\|g\\|^2 = \\frac{2\\pi}{3}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8.2);
    const lines = createFatLines({ maxSegments: SAMPLES * 3 + 20, width: 2 });
    const bars = createFatLines({ maxSegments: TOP_N * 2 + 2, width: 6 });
    ctx.scene.add(lines.object, bars.object);
    return {
      lines,
      bars,
      aspect: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      axis: new THREE.Color(0x3a4254),
      g: new THREE.Color(0xffd166),
      v: new THREE.Color(0x7cc4ff),
      pos: new THREE.Color(0x7ee0a8).multiplyScalar(0.55),
      neg: new THREE.Color(0xef6fa0).multiplyScalar(0.55),
      unit: new THREE.Color(0x2a3446),
      unitNow: new THREE.Color(0x7cc4ff).multiplyScalar(0.6),
      bar: new THREE.Color(0xffd166).multiplyScalar(0.7),
      barNow: new THREE.Color(0xffd166),
    };
  },

  update(ctx, state) {
    const { lines, bars, a, b } = state;
    const m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    bars.setResolution(width, height);
    const aspect = width / height;
    if (aspect !== state.aspect) {
      state.aspect = aspect;
      // Fit the drawing (about ±3.9 × ±3.3, plus room for the toolbar) to the screen.
      const tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
      ctx.camera.position.setLength(Math.max(4.3, 4.2 / aspect) / tan);
    }
    const ca = Math.cos(m.theta);
    const sa = Math.sin(m.theta);
    const v = (x) => ca * e(m.n, x) + sa * e(m.n + 1, x);
    const X = (x) => x * XS;

    lines.reset();
    lines.push(a.set(X(-Math.PI), Y_TOP, 0), b.set(X(Math.PI), Y_TOP, 0), state.axis);
    lines.push(a.set(X(-Math.PI), Y_MID, 0), b.set(X(Math.PI), Y_MID, 0), state.axis);
    let px = -Math.PI;
    let pv = v(px);
    for (let i = 1; i <= SAMPLES; i++) {
      const x = -Math.PI + (2 * Math.PI * i) / SAMPLES;
      const vx = v(x);
      lines.push(a.set(X(px), Y_TOP + pv * 1.6, 0), b.set(X(x), Y_TOP + vx * 1.6, 0), state.v);
      // The product v·g, filled: its signed area is the inner product.
      const prod = vx * g(x) * 1.6;
      if (i % 2 === 0) lines.push(a.set(X(x), Y_MID, 0), b.set(X(x), Y_MID + prod, 0), prod >= 0 ? state.pos : state.neg);
      px = x;
      pv = vx;
    }
    lines.push(a.set(X(-Math.PI), Y_TOP + g(-Math.PI) * 0.9, 0), b.set(X(Math.PI), Y_TOP + g(Math.PI) * 0.9, 0), state.g);
    lines.commit();

    // ‖eₙ‖ = 1 for every n, against |⟨eₙ, g⟩| / ‖g‖ shrinking like 1/n.
    bars.reset();
    const x0 = -3.45;
    const dx = 6.9 / TOP_N;
    for (let k = 1; k <= TOP_N; k++) {
      const x = x0 + (k - 0.5) * dx;
      const now = k === m.shown;
      bars.push(a.set(x - dx * 0.18, BAR_Y, 0), b.set(x - dx * 0.18, BAR_Y + BAR_H, 0), now ? state.unitNow : state.unit);
      const h = Math.max(0.015, (Math.abs(coef(k)) / G_NORM) * BAR_H);
      bars.push(a.set(x + dx * 0.18, BAR_Y, 0), b.set(x + dx * 0.18, BAR_Y + h, 0), now ? state.barNow : state.bar);
    }
    bars.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.bars.dispose();
  },
};
