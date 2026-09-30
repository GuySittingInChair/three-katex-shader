import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// The twin paradox on a Minkowski diagram (time up, space across, c = 1).
// One twin stays home (x = 0) for T = 10 years. The other flies out at speed
// β for 5 years (our time) and straight back. Clocks tick along each
// worldline: a clock moving at β runs slow by γ = 1/√(1 − β²), so the
// traveller ages only
//
//     τ = ∫ √(1 − β²) dt = T/γ
//
// (checked by integrating: 8, 6 and 3.12 years for β = 0.6, 0.8, 0.95). The
// dots are one year of each twin's own time. The dashed lines are the
// traveller's "now", t − βx = const: at the turnaround they swing from
// slope β to −β, skipping over years of the home twin's life. That jump is
// where the missing time goes.
//
// Loop: three trips, at β = 0.6, 0.8 and 0.95; each plays the 10 years, then
// holds on the reunion.

const T = 10;
const TRIP = 7; // seconds per trip
const HOLD = 1.6;
const SPEEDS = [0.6, 0.8, 0.95];
const PERIOD = TRIP * SPEEDS.length;
const SCALE = 0.72;
const Y0 = -3.6;

const P = (t, x, v) => v.set(x * SCALE * 0.9 - 1.3, Y0 + t * SCALE, 0);

export default {
  name: 'Twin Paradox',
  description:
    'Two twins on a spacetime diagram: one stays home, one flies out and back near light speed. Dots mark a year ' +
    'of each twin’s own time; the traveller comes back younger by exactly T(1 − 1/γ). The dashed lines are the ' +
    'traveller’s “now”, which jumps at the turnaround. Three trips, at 60%, 80% and 95% of light speed.',
  tags: ['relativity', 'minkowski', 'time dilation', 'proper time'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const trip = Math.min(SPEEDS.length - 1, Math.floor(p * SPEEDS.length));
    const within = p * PERIOD - trip * TRIP;
    const now = Math.min(T, (within / (TRIP - HOLD)) * T);
    const beta = SPEEDS[trip];
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    return { trip, beta, gamma, now, tauHome: now, tauTravel: now / gamma };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\tau &= \\int \\sqrt{1-\\beta^2}\\,dt = \\frac{T}{\\gamma},\\quad \\gamma = \\frac{1}{\\sqrt{1-\\beta^2}} \\\\' +
    `\\beta &= ${hl(m.beta, 2)},\\quad \\gamma = ${hl(m.gamma, 2)},\\quad t = ${hl(m.now, 1)}\\ \\text{yr} \\\\` +
    `&\\text{home twin aged } ${hl(m.tauHome, 1)},\\ \\text{traveller aged } ${hl(m.tauTravel, 1)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 7.2);
    const lines = createFatLines({ maxSegments: 400, width: 2.4 });
    const faint = createFatLines({ maxSegments: 400, width: 1.1 });
    const dots = createDots({ maxPoints: 64 });
    ctx.scene.add(faint.object, lines.object, dots.object);
    return {
      lines,
      faint,
      dots,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      home: new THREE.Color(0x7cc4ff),
      away: new THREE.Color(0xef6fa0),
      light: new THREE.Color(0xffd166).multiplyScalar(0.55),
      axis: new THREE.Color(0x3a4254),
      now: new THREE.Color(0xdfe6ee),
    };
  },

  update(ctx, state) {
    const { lines, faint, dots, a, b } = state;
    const { beta, gamma, now } = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    faint.setResolution(width, height);
    dots.setCamera(ctx.camera, height);
    const half = T / 2;
    const xAt = (t) => (t <= half ? beta * t : beta * (T - t)); // the traveller's position

    faint.reset();
    faint.push(P(0, -0.3, a), P(0, 5.2, b), state.axis); // x axis
    // Light from home at t = 0, for scale.
    faint.push(P(0, 0, a), P(5.2, 5.2, b), state.light);
    // The traveller's lines of "now" (dashed): through each of their year marks.
    for (let k = 1; k * gamma < T; k++) {
      const t = k * gamma; // lab time of their k-th birthday
      const x = xAt(t);
      const slope = t <= half ? beta : -beta; // t − t₀ = slope (x − x₀)
      for (let d = 0; d < 12; d += 2) {
        const x0 = x - (d / 12) * x;
        const x1 = x - ((d + 1) / 12) * x;
        faint.push(P(t + slope * (x0 - x), x0, a), P(t + slope * (x1 - x), x1, b), state.away.clone().multiplyScalar(0.55));
      }
    }
    faint.commit();

    lines.reset();
    lines.push(P(0, 0, a), P(Math.min(now, T), 0, b), state.home);
    const steps = 80;
    for (let j = 0; j < steps; j++) {
      const t0 = (now * j) / steps;
      const t1 = (now * (j + 1)) / steps;
      lines.push(P(t0, xAt(t0), a), P(t1, xAt(t1), b), state.away);
    }
    lines.commit();

    dots.reset();
    for (let k = 1; k <= Math.floor(now + 1e-9); k++) dots.push(P(k, 0, a), state.home, 0.07);
    for (let k = 1; k * gamma <= now + 1e-9; k++) dots.push(P(k * gamma, xAt(k * gamma), a), state.away, 0.07);
    dots.push(P(now, 0, a), state.now, 0.11);
    dots.push(P(now, xAt(now), a), state.now, 0.11);
    dots.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.faint.dispose();
    state.dots.dispose();
  },
};
