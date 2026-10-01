import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// A function is a vector. In the Hilbert space L²[−π, π] the inner product is
//
//     ⟨f, g⟩ = ∫ f(x) g(x) dx,   ‖f‖² = ⟨f, f⟩
//
// and eₙ = sin(nx)/√π are orthonormal: ⟨eₘ, eₙ⟩ = 1 if m = n, else 0. The
// best approximation of f using e₁ … e_N is its orthogonal projection,
//
//     S_N = Σ ⟨eₙ, f⟩ eₙ
//
// For the square wave f = sign(x), cₙ = ⟨eₙ, f⟩ = 4/(n√π) for odd n and 0
// for even n. Each new term is perpendicular to everything before it, so
// lengths add like Pythagoras: ‖S_N‖² = Σ cₙ², and the error
// ‖f − S_N‖² = ‖f‖² − ‖S_N‖² only shrinks. The sines are a complete basis,
// so it shrinks to 0 (Parseval: Σ cₙ² = ‖f‖² = 2π, checked numerically),
// and yet the peak never comes down: the partial sums overshoot the jump by
// about 9% however many terms you add (the Gibbs phenomenon; max S_N = 1.179
// at N = 41, checked). Converging in norm is not converging at every point.
//
// The bars below are the coordinates cₙ; the bar on the right is Σ cₙ²
// against ‖f‖². Loop (30 s): add terms up to n = 41, then take them away.

const PERIOD = 30;
const TERMS = 21; // odd n = 1 … 41
const SAMPLES = 360;
const XS = 1.12; // x → screen
const YS = 1.15;
const TOP = 0.7; // the plot's axis height
const BAR_Y = -2.85;
const BAR_H = 1.6;
const NORM2 = 2 * Math.PI;

const coef = (j) => 4 / ((2 * j + 1) * Math.sqrt(Math.PI)); // c for n = 2j + 1
const basis = (j, x) => Math.sin((2 * j + 1) * x) / Math.sqrt(Math.PI);

export default {
  name: 'Fourier Projection',
  description:
    'Functions are vectors: a square wave built by projecting it onto orthonormal sine waves, one perpendicular ' +
    'direction at a time. The error’s length only shrinks, to zero (Parseval), yet the overshoot at the jump ' +
    'never goes away (Gibbs). The bars are the coordinates ⟨eₙ, f⟩. The terms, ‖S_N‖² and the error are live.',
  tags: ['hilbert space', 'fourier series', 'orthogonal projection', 'parseval', 'functional analysis'],
  category: 'Functional Analysis',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    // Slow at first (the first few terms matter most), then quicker; back down at the end.
    const up = p < 0.8 ? Math.pow(p / 0.8, 1.7) : 1 - smooth((p - 0.8) / 0.2);
    const real = 1 + (TERMS - 1) * up;
    const full = Math.min(TERMS, Math.floor(real));
    const w = full < TERMS ? smooth((real - full) * 1.4) : 0; // the newest term eases in
    let energy = 0;
    for (let j = 0; j < full; j++) energy += coef(j) ** 2;
    if (full < TERMS) energy += (w * coef(full)) ** 2;
    // The overshoot: the partial sum's highest point (it's on the first lobe, 0 < x ≤ π/2).
    let peak = 0;
    for (let i = 1; i <= 400; i++) {
      const x = (Math.PI / 2) * (i / 400);
      let s = full < TERMS ? w * coef(full) * basis(full, x) : 0;
      for (let j = 0; j < full; j++) s += coef(j) * basis(j, x);
      peak = Math.max(peak, s);
    }
    return { full, w, n: 2 * full - 1 + (w > 0.5 ? 2 : 0), energy, error: NORM2 - energy, peak };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'S_N &= \\sum_{n \\le N} \\langle e_n, f\\rangle\\, e_n,\\quad e_n = \\tfrac{\\sin nx}{\\sqrt\\pi},\\quad \\langle e_n, f\\rangle = \\tfrac{4}{n\\sqrt\\pi}\\ (n\\text{ odd}) \\\\' +
    `N &= ${hl(m.n, 0)},\\quad \\|S_N\\|^2 = ${hl(m.energy, 3)},\\quad \\|f - S_N\\|^2 = ${hl(m.error, 3)} \\\\` +
    `\\|f\\|^2 &= 2\\pi = ${hl(NORM2, 3)} = \\textstyle\\sum c_n^2 \\ \\text{(Parseval)},\\quad \\max S_N = ${hl(m.peak, 3)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8.2);
    const lines = createFatLines({ maxSegments: SAMPLES * 3 + 40, width: 2 });
    const bars = createFatLines({ maxSegments: TERMS + 4, width: 9 });
    ctx.scene.add(lines.object, bars.object);
    return {
      lines,
      bars,
      aspect: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      axis: new THREE.Color(0x3a4254),
      target: new THREE.Color(0x8d96a8),
      sum: new THREE.Color(0x7cc4ff),
      term: new THREE.Color(0xef6fa0).multiplyScalar(0.75),
      bar: new THREE.Color(0xffd166),
      barNew: new THREE.Color(0xef6fa0),
      total: new THREE.Color(0x7cc4ff),
      empty: new THREE.Color(0x232a38),
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
    const P = (x, y, v) => v.set(x * XS, TOP + y * YS, 0);

    lines.reset();
    lines.push(P(-Math.PI, 0, a), P(Math.PI, 0, b), state.axis);
    lines.push(P(0, -1.3, a), P(0, 1.3, b), state.axis);
    // The target: the square wave.
    lines.push(P(-Math.PI, -1, a), P(0, -1, b), state.target);
    lines.push(P(0, -1, a), P(0, 1, b), state.target);
    lines.push(P(0, 1, a), P(Math.PI, 1, b), state.target);

    const value = (x) => {
      let s = 0;
      for (let j = 0; j < m.full; j++) s += coef(j) * basis(j, x);
      if (m.full < TERMS) s += m.w * coef(m.full) * basis(m.full, x);
      return s;
    };
    let prevX = -Math.PI;
    let prevS = value(prevX);
    let prevT = m.full < TERMS ? m.w * coef(m.full) * basis(m.full, prevX) : 0;
    for (let i = 1; i <= SAMPLES; i++) {
      const x = -Math.PI + (2 * Math.PI * i) / SAMPLES;
      const s = value(x);
      lines.push(P(prevX, prevS, a), P(x, s, b), state.sum);
      if (m.full < TERMS && m.w > 0.01) {
        const tv = m.w * coef(m.full) * basis(m.full, x);
        lines.push(P(prevX, prevT, a), P(x, tv, b), state.term);
        prevT = tv;
      }
      prevX = x;
      prevS = s;
    }
    lines.commit();

    // |cₙ| for each odd n, and the running total of cₙ² against ‖f‖².
    const scale = BAR_H / coef(0);
    const x0 = -3.5;
    const dx = 6.0 / TERMS;
    bars.reset();
    for (let j = 0; j < TERMS; j++) {
      const k = j < m.full ? 1 : j === m.full ? m.w : 0;
      const x = x0 + j * dx;
      const h = Math.max(0.02, coef(j) * k * scale);
      bars.push(a.set(x, BAR_Y, 0), b.set(x, BAR_Y + h, 0), j === m.full ? state.barNew : state.bar);
    }
    const tx = 3.3;
    bars.push(a.set(tx, BAR_Y, 0), b.set(tx, BAR_Y + BAR_H, 0), state.empty);
    bars.push(a.set(tx, BAR_Y, 0), b.set(tx, BAR_Y + (BAR_H * m.energy) / NORM2, 0), state.total);
    bars.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.bars.dispose();
  },
};
