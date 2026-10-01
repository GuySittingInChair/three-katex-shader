import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// A quantum state is a unit vector in a Hilbert space, and time moves it by
// a unitary map: a rotation that never changes its length. For a particle in
// the harmonic well V = x²/2 (units ħ = m = ω = 1) the natural axes are the
// energy states φₙ (Hermite functions, φ₀ ∝ e^{−x²/2}), with energies n + ½.
// In those axes time does the simplest thing possible: each coordinate just
// turns its phase at its own rate,
//
//     ψ(x, t) = Σ cₙ e^{−i(n+½)t} φₙ(x)
//
// so every |cₙ| stays put and ‖ψ‖² = Σ |cₙ|² = 1 forever. With
// cₙ = e^{−α²/2} αⁿ/√n! (a coherent state) those spinning phases add up to a
// Gaussian lump that swings back and forth like a classical ball,
// ⟨x⟩ = √2 α cos t (all checked by summing 30 terms on a grid: norm 1.00000,
// ⟨x⟩ matches to 4 decimals).
//
// Top: |ψ|² (gold), Re ψ (blue), Im ψ (pink), in the well. Bottom: the
// coordinates c₀ … c₁₅ as arrows, each turning at rate n + ½. Loop (16 s):
// t from 0 to 4π (two swings; the ½ in the phase makes ψ itself repeat
// after 4π, |ψ|² after 2π).

const PERIOD = 16;
const N = 40; // terms summed
const SHOWN = 16; // phasors drawn
const SAMPLES = 260;
const XR = 6.2; // x range ±
const XS = 0.6;
const TOP = 0.15; // the top plot's baseline
const ROW_Y = -2.45;

// Hermite functions φ₀ … φ_{N−1} at x, by the stable three-term recurrence.
function hermite(x, out) {
  out[0] = Math.pow(Math.PI, -0.25) * Math.exp((-x * x) / 2);
  out[1] = Math.SQRT2 * x * out[0];
  for (let n = 1; n < N - 1; n++) out[n + 1] = Math.sqrt(2 / (n + 1)) * x * out[n] - Math.sqrt(n / (n + 1)) * out[n - 1];
  return out;
}

function coefficients(alpha) {
  const c = new Float64Array(N);
  let log = 0; // log of αⁿ/√n!
  for (let n = 0; n < N; n++) {
    if (n > 0) log += Math.log(alpha) - 0.5 * Math.log(n);
    c[n] = Math.exp(-alpha * alpha / 2 + log);
  }
  return c;
}

export default {
  name: 'Coherent State',
  description:
    'A quantum state is a unit vector, and time just rotates it. In the energy basis of a harmonic well each ' +
    'coordinate cₙ only turns its phase, at rate n + ½; the arrows below never change length, so ‖ψ‖ stays 1. ' +
    'Yet the phases add up to a wave packet swinging like a ball. ⟨x⟩, ‖ψ‖² and the energy are live.',
  tags: ['hilbert space', 'quantum', 'unitary', 'harmonic oscillator', 'coherent state'],
  category: 'Functional Analysis',
  mode: '3d',
  controls: 'orbit',

  motion(t, params = {}) {
    const alpha = params.alpha ?? 2;
    const time = 2 * TAU * phaseOf(t, PERIOD);
    const c = coefficients(alpha);
    let norm = 0;
    for (let n = 0; n < N; n++) norm += c[n] * c[n];
    return { time, alpha, norm, mean: Math.SQRT2 * alpha * Math.cos(time), energy: alpha * alpha + 0.5 };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\psi(x,t) &= \\sum_n c_n\\, e^{-i(n+\\frac12)t}\\, \\varphi_n(x),\\quad c_n = e^{-\\alpha^2/2}\\frac{\\alpha^n}{\\sqrt{n!}} \\\\' +
    `\\|\\psi\\|^2 &= \\sum_n |c_n|^2 = ${hl(m.norm, 5)},\\quad \\langle H\\rangle = \\alpha^2 + \\tfrac12 = ${hl(m.energy, 2)} \\\\` +
    `t &= ${hl(m.time, 2)},\\quad \\langle x\\rangle = \\sqrt2\\,\\alpha\\cos t = ${hl(m.mean, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    alpha: { value: 2, min: 0, max: 2.6 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8.2);
    const lines = createFatLines({ maxSegments: SAMPLES * 4 + 80, width: 2 });
    const rings = createFatLines({ maxSegments: SHOWN * 32 + SHOWN * 3, width: 1.6 });
    ctx.scene.add(lines.object, rings.object);
    return {
      lines,
      rings,
      aspect: 0,
      phi: new Float64Array(N),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      axis: new THREE.Color(0x3a4254),
      well: new THREE.Color(0x2e3a52),
      dens: new THREE.Color(0xffd166),
      densFill: new THREE.Color(0xffd166).multiplyScalar(0.22),
      re: new THREE.Color(0x7cc4ff),
      im: new THREE.Color(0xef6fa0),
      ring: new THREE.Color(0x2a3242),
      arrow: new THREE.Color(0x7ee0a8),
    };
  },

  update(ctx, state) {
    const { lines, rings, a, b, phi } = state;
    const m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    rings.setResolution(width, height);
    const aspect = width / height;
    if (aspect !== state.aspect) {
      state.aspect = aspect;
      // Fit the drawing (about ±3.9 × ±3.3, plus room for the toolbar) to the screen.
      const tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
      ctx.camera.position.setLength(Math.max(4.3, 4.2 / aspect) / tan);
    }
    const c = coefficients(m.alpha);
    const P = (x, y, v) => v.set(x * XS, TOP + y, 0);

    lines.reset();
    lines.push(P(-XR, 0, a), P(XR, 0, b), state.axis);
    // The well, V = x²/2, drawn small.
    for (let i = 0; i < 60; i++) {
      const x0 = -XR + (2 * XR * i) / 60;
      const x1 = -XR + (2 * XR * (i + 1)) / 60;
      lines.push(P(x0, 0.06 * x0 * x0, a), P(x1, 0.06 * x1 * x1, b), state.well);
    }
    let prev = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const x = -XR + (2 * XR * i) / SAMPLES;
      hermite(x, phi);
      let re = 0;
      let im = 0;
      for (let n = 0; n < N; n++) {
        const ph = -(n + 0.5) * m.time;
        re += c[n] * Math.cos(ph) * phi[n];
        im += c[n] * Math.sin(ph) * phi[n];
      }
      const d = (re * re + im * im) * 2.6;
      if (i % 2 === 0) lines.push(P(x, 0, a), P(x, d, b), state.densFill);
      if (prev) {
        lines.push(P(prev.x, prev.d, a), P(x, d, b), state.dens);
        lines.push(P(prev.x, prev.re, a), P(x, re * 1.7, b), state.re);
        lines.push(P(prev.x, prev.im, a), P(x, im * 1.7, b), state.im);
      }
      prev = { x, d, re: re * 1.7, im: im * 1.7 };
    }
    lines.commit();

    // The coordinates cₙ e^{−i(n+½)t} as arrows in their own little circles.
    rings.reset();
    const R = 0.24;
    const gap = 7.2 / SHOWN;
    const cmax = Math.max(...c);
    for (let n = 0; n < SHOWN; n++) {
      const cx = -3.6 + gap * (n + 0.5);
      for (let k = 0; k < 32; k++) {
        const t0 = (TAU * k) / 32;
        const t1 = (TAU * (k + 1)) / 32;
        rings.push(a.set(cx + R * Math.cos(t0), ROW_Y + R * Math.sin(t0), 0), b.set(cx + R * Math.cos(t1), ROW_Y + R * Math.sin(t1), 0), state.ring);
      }
      const len = (c[n] / cmax) * R; // to scale, the largest filling its circle
      const ph = -(n + 0.5) * m.time;
      const ex = cx + len * Math.cos(ph);
      const ey = ROW_Y + len * Math.sin(ph);
      if (len > 0.004) {
        rings.push(a.set(cx, ROW_Y, 0), b.set(ex, ey, 0), state.arrow);
        // Arrowhead.
        for (const s of [-1, 1]) {
          const back = ph + Math.PI + s * 0.5;
          const hl = Math.min(0.08, len * 0.5);
          rings.push(a.set(ex, ey, 0), b.set(ex + hl * Math.cos(back), ey + hl * Math.sin(back), 0), state.arrow);
        }
      }
    }
    rings.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.rings.dispose();
  },
};
