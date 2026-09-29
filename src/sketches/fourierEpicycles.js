import * as THREE from 'three';
import { TAU, phaseOf, smooth } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// Fourier epicycles: a chain of circles, each spinning at a whole-number
// speed k, whose tip traces a closed curve:
//
//     z(τ) = Σ_{k=−24}^{24} c_k e^{ikτ}
//
// c_k are the discrete Fourier coefficients of a heart (a_k) and a five-point
// star (b_k), 512 samples each; with |k| ≤ 24 the heart is exact and the
// star's corners round off by about 1% (checked numerically). The loop blends
// the coefficients, c_k = (1 − s) a_k + s b_k, so the same 49 circles
// smoothly change what they draw. Circles are chained slowest first.
//
// Loop (24 s): the pen goes round four times (τ: 0 → 8π). Heart · heart →
//   star (s: 0 → 1) · star · star → heart.

const PERIOD = 24;
const TURNS = 4;
const K = 24;
const SAMPLES = 512;
const SIZE = 2.7;
const CIRCLE_SEGMENTS = 40;
const CURVE_SAMPLES = 360;

function heart(t) {
  return [
    (16 * Math.sin(t) ** 3) / 17,
    (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.12,
  ];
}
function star(t) {
  const f = ((t / TAU) * 10) % 10;
  const k = Math.floor(f);
  const w = f - k;
  const vertex = (j) => {
    const a = Math.PI / 2 + (j * TAU) / 10;
    const r = j % 2 ? 0.42 : 1;
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  const A = vertex(k);
  const B = vertex((k + 1) % 10);
  return [A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w];
}

// Coefficients ordered 0, 1, −1, 2, −2, …: { k, re, im }.
function coefficients(shape) {
  const pts = Array.from({ length: SAMPLES }, (_, j) => shape((TAU * j) / SAMPLES));
  const order = [0];
  for (let k = 1; k <= K; k++) order.push(k, -k);
  return order.map((k) => {
    let re = 0;
    let im = 0;
    pts.forEach(([x, y], j) => {
      const a = (-TAU * k * j) / SAMPLES;
      re += x * Math.cos(a) - y * Math.sin(a);
      im += x * Math.sin(a) + y * Math.cos(a);
    });
    return { k, re: (re / SAMPLES) * SIZE, im: (im / SAMPLES) * SIZE };
  });
}
const HEART = coefficients(heart);
const STAR = coefficients(star);

function blendAt(s) {
  return HEART.map((a, i) => ({ k: a.k, re: a.re + (STAR[i].re - a.re) * s, im: a.im + (STAR[i].im - a.im) * s }));
}
function evaluate(c, tau) {
  let x = 0;
  let y = 0;
  for (const { k, re, im } of c) {
    const cs = Math.cos(k * tau);
    const sn = Math.sin(k * tau);
    x += re * cs - im * sn;
    y += re * sn + im * cs;
  }
  return [x, y];
}

export default {
  name: 'Fourier Epicycles',
  description:
    'A chain of 49 spinning circles, each turning at a whole-number speed, whose tip draws a heart. Blending ' +
    'their Fourier coefficients turns the same chain into one that draws a star, and back. The equation shows ' +
    'the pen angle τ and the blend s live.',
  tags: ['fourier', 'epicycles', 'complex numbers', 'series'],
  category: 'Waves',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const s = p < 0.25 ? 0 : p < 0.5 ? smooth((p - 0.25) / 0.25) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.25);
    return { tau: TAU * TURNS * p, s };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'z(\\tau) &= \\sum_{k=-24}^{24} c_k\\,e^{ik\\tau},\\quad c_k = (1-s)\\,a_k + s\\,b_k \\\\' +
    `\\tau &= ${hl(m.tau % TAU, 2)},\\quad s = ${hl(m.s, 2)}\\quad \\text{(}a_k\\text{: heart, } b_k\\text{: star)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 7.5);
    const circles = createFatLines({ maxSegments: HEART.length * (CIRCLE_SEGMENTS + 1), width: 1 });
    const curve = createFatLines({ maxSegments: CURVE_SAMPLES * 2, width: 2.4 });
    const pen = createDots({ maxPoints: 1 });
    ctx.scene.add(circles.object, curve.object, pen.object);
    return {
      circles,
      curve,
      pen,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      ring: new THREE.Color(0x3a4a66),
      arm: new THREE.Color(0x8fa4c8),
      ghost: new THREE.Color(0x2c3240),
      trail: new THREE.Color(),
      penColor: new THREE.Color(0xffd166),
    };
  },

  update(ctx, state) {
    const { circles, curve, pen, a, b } = state;
    const { tau, s } = ctx.motion;
    const c = blendAt(s);
    const { width, height } = ctx.size;
    circles.setResolution(width, height);
    curve.setResolution(width, height);
    pen.setCamera(ctx.camera, height);

    // The chain of circles at the current angle.
    circles.reset();
    let x = c[0].re;
    let y = c[0].im;
    for (let i = 1; i < c.length; i++) {
      const { k, re, im } = c[i];
      const r = Math.hypot(re, im);
      if (r > 0.004) {
        for (let j = 0; j < CIRCLE_SEGMENTS; j++) {
          const a0 = (TAU * j) / CIRCLE_SEGMENTS;
          const a1 = (TAU * (j + 1)) / CIRCLE_SEGMENTS;
          a.set(x + r * Math.cos(a0), y + r * Math.sin(a0), 0);
          b.set(x + r * Math.cos(a1), y + r * Math.sin(a1), 0);
          circles.push(a, b, state.ring);
        }
      }
      const nx = x + re * Math.cos(k * tau) - im * Math.sin(k * tau);
      const ny = y + re * Math.sin(k * tau) + im * Math.cos(k * tau);
      a.set(x, y, 0);
      b.set(nx, ny, 0);
      circles.push(a, b, state.arm);
      x = nx;
      y = ny;
    }
    circles.commit();

    // The whole curve faintly, and the last stretch the pen drew brightly.
    curve.reset();
    let prev = evaluate(c, 0);
    for (let j = 1; j <= CURVE_SAMPLES; j++) {
      const next = evaluate(c, (TAU * j) / CURVE_SAMPLES);
      a.set(prev[0], prev[1], 0);
      b.set(next[0], next[1], 0);
      curve.push(a, b, state.ghost);
      prev = next;
    }
    const TRAIL = 0.75 * TAU;
    prev = evaluate(c, tau - TRAIL);
    for (let j = 1; j <= CURVE_SAMPLES; j++) {
      const f = j / CURVE_SAMPLES;
      const next = evaluate(c, tau - TRAIL * (1 - f));
      a.set(prev[0], prev[1], 0);
      b.set(next[0], next[1], 0);
      state.trail.setHSL(0.93 - 0.15 * s, 0.75, 0.2 + 0.45 * f);
      curve.push(a, b, state.trail); // push copies the colour
      prev = next;
    }
    curve.commit();

    pen.reset();
    a.set(x, y, 0);
    pen.push(a, state.penColor, 0.07);
    pen.commit();
  },

  dispose(ctx, state) {
    state.circles.dispose();
    state.curve.dispose();
    state.pen.dispose();
  },
};
