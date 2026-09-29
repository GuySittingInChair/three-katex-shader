import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// A pendulum wave: fifteen pendulums whose lengths are tuned so that, in the
// same 40 seconds, pendulum i swings exactly 34 + i times. Each is simple
// harmonic (small angles):
//
//     θ_i(t) = θ₀ cos(2π (34 + i) t / 40),   L_i = g (40 / (2π (34 + i)))²
//
// Neighbours drift apart by one swing per 40 s, so the row shows travelling
// waves, then two interleaved rows (at t = 20 s every other pendulum is in
// step), three rows, apparent chaos, and at t = 40 s every whole-number count
// lines them all up again: the loop is exact, not approximate.
// Lengths run from 17 cm to 34 cm (drawn 9× larger).

const COUNT = 15;
const PERIOD = 40;
const FIRST = 34;
const G = 9.81;
const DRAW_SCALE = 9;
const SPACING = 0.42;
const BAR_Y = 1.9;

const lengthOf = (i) => G * (PERIOD / (TAU * (FIRST + i))) ** 2;
const xOf = (i) => (i - (COUNT - 1) / 2) * SPACING;

export default {
  name: 'Pendulum Wave',
  description:
    'Fifteen pendulums tuned so pendulum i swings exactly 34 + i times in 40 seconds. They drift through ' +
    'travelling waves, two and three interleaved rows and apparent chaos, then line up again exactly as the loop ' +
    'ends. The equation shows the time t live.',
  tags: ['physics', 'oscillation', 'waves', 'pendulum'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    return { t: p * PERIOD };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\theta_i(t) &= \\theta_0\\cos\\!\\Big(2\\pi\\,\\frac{(34+i)\\,t}{40}\\Big),\\quad i = 0,\\dots,14 \\\\' +
    'L_i &= g\\,\\Big(\\frac{40}{2\\pi(34+i)}\\Big)^{2} \\\\' +
    `t &= ${hl(m.t, 1)}\\ \\text{s of } 40,\\quad \\theta_0 = ${hl(params.amplitude, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 4 },
    amplitude: { value: 0.38, min: 0.1, max: 0.6 },
  },

  setup(ctx) {
    // From above and in front: each swing reads as up/down on screen, so the snake shows.
    ctx.camera.position.set(0, 5.4, 4.6);
    ctx.controls?.target.set(0, 0.2, 0);
    ctx.controls?.update();
    ctx.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242c, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 5);
    ctx.scene.add(sun);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(COUNT * SPACING + 0.4, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.6, roughness: 0.35 })
    );
    bar.position.y = BAR_Y;
    ctx.scene.add(bar);

    const strings = createFatLines({ maxSegments: COUNT, width: 1.2 });
    ctx.scene.add(strings.object);

    const ballGeo = new THREE.SphereGeometry(0.15, 24, 16);
    const bobs = [];
    for (let i = 0; i < COUNT; i++) {
      const color = new THREE.Color().setHSL(0.55 + (0.35 * i) / (COUNT - 1), 0.55, 0.55);
      const bob = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.4 }));
      ctx.scene.add(bob);
      bobs.push(bob);
    }
    return { bar, strings, bobs, ballGeo, stringColor: new THREE.Color(0x8d96a8), pivot: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { t } = ctx.motion;
    const theta0 = ctx.params.amplitude;
    const { width, height } = ctx.size;
    state.strings.setResolution(width, height);
    state.strings.reset();
    for (let i = 0; i < COUNT; i++) {
      const theta = theta0 * Math.cos((TAU * (FIRST + i) * t) / PERIOD);
      const L = lengthOf(i) * DRAW_SCALE;
      state.pivot.set(xOf(i), BAR_Y, 0);
      const bob = state.bobs[i];
      bob.position.set(xOf(i), BAR_Y - L * Math.cos(theta), L * Math.sin(theta));
      state.strings.push(state.pivot, bob.position, state.stringColor);
    }
    state.strings.commit();
  },

  dispose(ctx, state) {
    state.strings.dispose();
    state.ballGeo.dispose();
    state.bar.geometry.dispose();
    state.bar.material.dispose();
    for (const b of state.bobs) b.material.dispose();
  },
};
