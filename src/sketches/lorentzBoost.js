import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// Minkowski spacetime and the Lorentz boost. Time t runs up, space x across,
// in units where light moves one unit of x per unit of t (c = 1), so light
// travels on the 45° lines: the light cone.
//
// A moving observer (speed β) measures their own time t' and position x':
//
//     t' = γ(t − βx),   x' = γ(x − βt),   γ = 1/√(1 − β²)
//
// Writing β = tanh φ (φ is the rapidity), γ = cosh φ and this is a
// hyperbolic rotation. Their grid (their clocks' worldlines and their lines
// of "same moment") scissors toward the light cone as β grows; the light cone
// itself never moves, because everyone measures the same speed of light.
// The dots sit at fixed places in the observer's grid; in our diagram they
// slide along the hyperbolas t² − x² = constant, the quantity every observer
// agrees on (checked numerically: unchanged to 10⁻¹⁵).
//
// Loop (16 s): φ = 1.3 sin(2πp), so β swings between ±0.86.

const PERIOD = 16;
const RANGE = 3.2;
const SCALE = 1.15;
const GRID = [-3, -2, -1, 0, 1, 2, 3];
const SAMPLES = 60;

export default {
  name: 'Lorentz Boost',
  description:
    'Minkowski spacetime: a moving observer’s clocks and lines of “same moment” scissor toward the light cone as ' +
    'their speed β changes, while the light cone stays put. Events slide along hyperbolas t² − x² = const, the ' +
    'quantity every observer agrees on. β, γ and the rapidity φ are shown live.',
  tags: ['relativity', 'minkowski', 'spacetime', 'lorentz'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const phi = 1.3 * Math.sin(TAU * phaseOf(t, PERIOD));
    return { phi, beta: Math.tanh(phi), gamma: Math.cosh(phi) };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    "t' &= \\gamma\\,(t - \\beta x),\\quad x' = \\gamma\\,(x - \\beta t),\\quad \\gamma = \\frac{1}{\\sqrt{1-\\beta^2}} \\\\" +
    "t'^2 - x'^2 &= t^2 - x^2 \\\\" +
    `\\beta &= \\tanh\\varphi = ${hl(m.beta, 2)},\\quad \\gamma = \\cosh\\varphi = ${hl(m.gamma, 2)},\\quad \\varphi = ${hl(m.phi, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 7.4);
    const fixed = createFatLines({ maxSegments: 4 * SAMPLES * 2 + 60, width: 1.2 });
    const moving = createFatLines({ maxSegments: GRID.length * 2 + 4, width: 1.8 });
    const cone = createFatLines({ maxSegments: 2, width: 3 });
    const dots = createDots({ maxPoints: 32 });
    ctx.scene.add(fixed.object, moving.object, cone.object, dots.object);
    return {
      fixed,
      moving,
      cone,
      dots,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      colors: {
        axis: new THREE.Color(0x3a4254),
        hyper: new THREE.Color(0x2e3a52),
        light: new THREE.Color(0xffd166),
        time: new THREE.Color(0x7cc4ff),
        space: new THREE.Color(0xef6fa0),
        timeDim: new THREE.Color(0x7cc4ff).multiplyScalar(0.45),
        spaceDim: new THREE.Color(0xef6fa0).multiplyScalar(0.45),
        dot: new THREE.Color(0xdfe6ee),
      },
    };
  },

  update(ctx, state) {
    const { fixed, moving, cone, dots, a, b, colors } = state;
    const { beta, gamma } = ctx.motion;
    const { width, height } = ctx.size;
    for (const l of [fixed, moving, cone]) l.setResolution(width, height);
    dots.setCamera(ctx.camera, height);
    const P = (t, x, v) => v.set(x * SCALE, t * SCALE, 0);
    // An event with the moving observer's coordinates (t', x'), in ours.
    const lab = (tp, xp) => [gamma * (tp + beta * xp), gamma * (xp + beta * tp)];
    const clip = (t, x) => Math.abs(t) <= RANGE && Math.abs(x) <= RANGE;
    // The part of the segment (t0, x0)–(t1, x1) inside the diagram's square (Liang–Barsky).
    const pushClipped = (lines, t0, x0, t1, x1, color) => {
      let lo = 0;
      let hi = 1;
      const dt = t1 - t0;
      const dx = x1 - x0;
      for (const [p, q] of [
        [-dt, t0 + RANGE],
        [dt, RANGE - t0],
        [-dx, x0 + RANGE],
        [dx, RANGE - x0],
      ]) {
        if (p === 0) {
          if (q < 0) return;
        } else {
          const r = q / p;
          if (p < 0) lo = Math.max(lo, r);
          else hi = Math.min(hi, r);
        }
      }
      if (lo >= hi) return;
      lines.push(P(t0 + lo * dt, x0 + lo * dx, a), P(t0 + hi * dt, x0 + hi * dx, b), color);
    };

    // Our axes and the hyperbolas t² − x² = ±1, ±4.
    fixed.reset();
    fixed.push(P(-RANGE, 0, a), P(RANGE, 0, b), colors.axis);
    fixed.push(P(0, -RANGE, a), P(0, RANGE, b), colors.axis);
    for (const k of [1, 2]) {
      for (const sign of [1, -1]) {
        for (const timelike of [true, false]) {
          let prev = null;
          for (let j = 0; j <= SAMPLES; j++) {
            const eta = -2.2 + (4.4 * j) / SAMPLES;
            const [t, x] = timelike ? [sign * k * Math.cosh(eta), k * Math.sinh(eta)] : [k * Math.sinh(eta), sign * k * Math.cosh(eta)];
            const inside = clip(t, x);
            if (prev && inside) fixed.push(P(prev[0], prev[1], a), P(t, x, b), colors.hyper);
            prev = inside ? [t, x] : null;
          }
        }
      }
    }
    fixed.commit();

    // The moving observer's grid: their clocks (x' = const) and "now" lines (t' = const).
    moving.reset();
    for (const k of GRID) {
      const [t0, x0] = lab(-8, k);
      const [t1, x1] = lab(8, k);
      pushClipped(moving, t0, x0, t1, x1, k === 0 ? colors.time : colors.timeDim);
      const [s0, y0] = lab(k, -8);
      const [s1, y1] = lab(k, 8);
      pushClipped(moving, s0, y0, s1, y1, k === 0 ? colors.space : colors.spaceDim);
    }
    moving.commit();

    cone.reset();
    cone.push(P(-RANGE, -RANGE, a), P(RANGE, RANGE, b), colors.light);
    cone.push(P(-RANGE, RANGE, a), P(RANGE, -RANGE, b), colors.light);
    cone.commit();

    // Events at fixed primed coordinates: they ride the hyperbolas.
    dots.reset();
    for (const [tp, xp] of [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 2],
      [0, 1],
      [0, 2],
      [-1, 0],
      [-2, 1],
      [2, -1],
      [-1, -2],
    ]) {
      const [t, x] = lab(tp, xp);
      if (clip(t, x)) dots.push(P(t, x, a), colors.dot, 0.07);
    }
    dots.commit();
  },

  dispose(ctx, state) {
    state.fixed.dispose();
    state.moving.dispose();
    state.cone.dispose();
    state.dots.dispose();
  },
};
