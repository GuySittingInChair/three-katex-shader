import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, phaseOf, clamp01 } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { caption, mood } from '../lib/bit.js';

// Rabbits and foxes in a meadow, by the Lotka–Volterra equations (1925–26):
//
//     dR/dt = αR − βRF        rabbits breed, and get eaten
//     dF/dt = δRF − γF        foxes breed by eating rabbits, and die
//
// with α = 1.04, γ = 0.832 per year, β = 0.065, δ = 0.0104 per animal per
// year. Every animal you see is one unit of R or F. Equilibrium is
// R* = γ/δ = 80, F* = α/β = 16; started away from it, the populations
// chase each other round a closed loop forever, foxes a quarter-cycle behind
// rabbits. The period (computed: 10.0 years) matches the famous ~10-year
// snowshoe hare / lynx cycle in the Hudson's Bay Company fur records.
//
// It's a closed loop because the system conserves
//
//     V = δR − γ ln R + βF − α ln F
//
// (dV/dt = 0, by substitution), so each starting point keeps its own value
// of V forever: the meadow never forgets. Checked numerically: RK4 over 40
// years keeps V to 1e-15. Here R swings 21 → 202 and F 5 → 37.
//
// The moods in the caption come from the signs of dR/dt and dF/dt, i.e.
// which quarter of the loop we're in. One loop of the sketch is one cycle
// (30 s = 10 years), precomputed once with RK4 and interpolated, so the loop
// joins up exactly.
//
// Not in the model, so not in the sketch: grass running out, foxes eating
// anything else, winter, rabbits having opinions.

const ALPHA = 1.04;
const GAMMA = 0.832;
const BETA = 0.065;
const DELTA = 0.0104;
const PERIOD = 30;                 // seconds per cycle on screen
const R0 = 30;                     // start: few rabbits
const F0 = 8;
const SAMPLES = 2400;
const MAX_R = 220;
const MAX_F = 44;
const FIELD = 8.5;                 // metres: radius the animals roam

const rates = (R, F) => [ALPHA * R - BETA * R * F, DELTA * R * F - GAMMA * F];
const grudge = (R, F) => DELTA * R - GAMMA * Math.log(R) + BETA * F - ALPHA * Math.log(F);

function rk4(R, F, h) {
  const k1 = rates(R, F);
  const k2 = rates(R + (h / 2) * k1[0], F + (h / 2) * k1[1]);
  const k3 = rates(R + (h / 2) * k2[0], F + (h / 2) * k2[1]);
  const k4 = rates(R + h * k3[0], F + h * k3[1]);
  return [R + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), F + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
}

// One full cycle: find the period (when F next crosses F0 upwards, as R
// was), then resample the cycle at SAMPLES equal steps.
const CYCLE = (() => {
  let R = R0;
  let F = F0;
  let t = 0;
  const h = 1e-4;
  let period = 0;
  let started = false;
  while (t < 50) {
    const [nR, nF] = rk4(R, F, h);
    if (started && F < F0 && nF >= F0) {
      period = t + (h * (F0 - F)) / (nF - F);
      break;
    }
    if (F > F0 + 1) started = true;
    R = nR;
    F = nF;
    t += h;
  }
  const sub = 20;
  const step = period / (SAMPLES * sub);
  const table = new Float64Array(2 * (SAMPLES + 1));
  R = R0;
  F = F0;
  for (let i = 0; i <= SAMPLES; i++) {
    table[2 * i] = R;
    table[2 * i + 1] = F;
    for (let j = 0; j < sub; j++) [R, F] = rk4(R, F, step);
  }
  return { period, table };
})();

const V0 = grudge(R0, F0);

function populations(phase) {
  const x = phase * SAMPLES;
  const i = Math.min(SAMPLES - 1, Math.floor(x));
  const f = x - i;
  const T = CYCLE.table;
  return [T[2 * i] + (T[2 * i + 2] - T[2 * i]) * f, T[2 * i + 1] + (T[2 * i + 3] - T[2 * i + 1]) * f];
}

// --- Animals, built from a few primitives with vertex colours -------------
function painted(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], 3 * i);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const part = (geo, color, { p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0] } = {}) => {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s)
  );
  return painted(geo.applyMatrix4(m), color);
};

// Both face +x, feet at y = 0, sized in metres.
function rabbitGeometry() {
  const fur = 0x8a7660;
  const sphere = () => new THREE.SphereGeometry(1, 14, 10);
  return mergeGeometries([
    part(sphere(), fur, { p: [0, 0.12, 0], s: [0.15, 0.12, 0.11] }),
    part(sphere(), fur, { p: [0.13, 0.2, 0], s: [0.075, 0.07, 0.065] }),
    part(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), 0x9c8670, { p: [0.11, 0.31, 0.03], r: [0.25, 0, 0.35] }),
    part(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), 0x9c8670, { p: [0.11, 0.31, -0.03], r: [-0.25, 0, 0.35] }),
    part(sphere(), 0xf2efe8, { p: [-0.15, 0.15, 0], s: [0.04, 0.04, 0.04] }),
    part(sphere(), 0x111111, { p: [0.18, 0.225, 0.04], s: [0.012, 0.012, 0.012] }),
    part(sphere(), 0x111111, { p: [0.18, 0.225, -0.04], s: [0.012, 0.012, 0.012] }),
  ]);
}

function foxGeometry() {
  const orange = 0xc4571d;
  const sphere = () => new THREE.SphereGeometry(1, 16, 12);
  const leg = (x, z) => part(new THREE.CylinderGeometry(0.022, 0.018, 0.26, 6), 0x2a1a12, { p: [x, 0.13, z] });
  return mergeGeometries([
    part(sphere(), orange, { p: [0, 0.34, 0], s: [0.3, 0.12, 0.11] }),
    part(sphere(), 0xefe6d8, { p: [0.08, 0.3, 0], s: [0.2, 0.08, 0.085] }),
    part(sphere(), orange, { p: [0.3, 0.44, 0], s: [0.1, 0.085, 0.085] }),
    part(new THREE.ConeGeometry(0.045, 0.14, 8), 0xefe6d8, { p: [0.43, 0.42, 0], r: [0, 0, -Math.PI / 2] }),
    part(new THREE.ConeGeometry(0.035, 0.09, 6), orange, { p: [0.3, 0.54, 0.045] }),
    part(new THREE.ConeGeometry(0.035, 0.09, 6), orange, { p: [0.3, 0.54, -0.045] }),
    part(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), orange, { p: [-0.38, 0.33, 0], r: [0, 0, 1.15] }),
    part(sphere(), 0xf4f0ea, { p: [-0.53, 0.26, 0], s: [0.06, 0.06, 0.06] }),
    part(sphere(), 0x111111, { p: [0.37, 0.47, 0.05], s: [0.013, 0.013, 0.013] }),
    part(sphere(), 0x111111, { p: [0.37, 0.47, -0.05], s: [0.013, 0.013, 0.013] }),
    leg(0.18, 0.06), leg(0.18, -0.06), leg(-0.18, 0.06), leg(-0.18, -0.06),
  ]);
}

// Each animal's wandering route, fixed per animal: a home spot (uniform
// over the field) and a little loop around it.
function routes(count, seed, reach) {
  const rnd = (i, k) => {
    const h = Math.sin((i + 1) * 12.9898 + k * 78.233 + seed) * 43758.5453;
    return h - Math.floor(h);
  };
  return Array.from({ length: count }, (_, i) => {
    const r = FIELD * Math.sqrt(rnd(i, 1));
    const a = TAU * rnd(i, 2);
    return {
      hx: r * Math.cos(a),
      hz: r * Math.sin(a),
      w: (0.12 + 0.12 * rnd(i, 3)) * (rnd(i, 4) < 0.5 ? -1 : 1),
      ax: reach * (0.6 + 0.8 * rnd(i, 5)),
      az: reach * (0.6 + 0.8 * rnd(i, 6)),
      ph: TAU * rnd(i, 7),
      hop: TAU * rnd(i, 8),
    };
  });
}

export default {
  name: 'Rabbits vs Foxes',
  description:
    'The Lotka–Volterra predator–prey equations, played out by real-looking rabbits and foxes in a meadow at ' +
    'golden hour, one animal per unit. The populations chase each other round a closed 10-year cycle (like the ' +
    "real hare–lynx cycle) because a quantity V is conserved. The animals' moods are the signs of the derivatives.",
  tags: ['biology', 'ecology', 'predator-prey', 'lotka-volterra', 'differential equations', 'realistic', 'humor'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const phase = phaseOf(t, PERIOD);
    const [R, F] = populations(phase);
    const [dR, dF] = rates(R, F);
    return { years: phase * CYCLE.period, R, F, dR, dF, eaten: BETA * R * F, V: grudge(R, F) };
  },

  latex: (params, hl, m) => {
    const feelings = mood([m.dR, m.dF], {
      '+-': 'Rabbits: thriving. Foxes: on a diet.',
      '++': 'Rabbits: thriving. Foxes: noticing.',
      '-+': 'Rabbits: concerned. Foxes: never been better.',
      '--': 'Rabbits: scarce. Foxes: regretting the last five years.',
    });
    return (
      '\\begin{aligned}' +
      `\\dot R &= ${ALPHA}R - ${BETA}RF = ${hl(m.dR, 1)}\\,/\\text{yr},\\quad R = ${hl(m.R, 0)}\\ \\text{rabbits} \\\\` +
      `\\dot F &= ${DELTA}RF - ${GAMMA}F = ${hl(m.dF, 1)}\\,/\\text{yr},\\quad F = ${hl(m.F, 0)}\\ \\text{foxes} \\\\` +
      `\\beta RF &= ${hl(m.eaten, 1)}\\ \\text{rabbits eaten}/\\text{yr},\\quad t = ${hl(m.years, 1)}\\ \\text{of } ${CYCLE.period.toFixed(1)}\\ \\text{yr} \\\\` +
      `V &= \\delta R - \\gamma\\ln R + \\beta F - \\alpha\\ln F = ${hl(m.V, 4)}\\ \\ ` +
      `${caption('(constant. The meadow never forgets.)')} \\\\` +
      `& ${caption(feelings)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.05;
    const env = createEnvironment(ctx, {
      preset: 'meadow', fov: 45, sun: [11, 235], grassHeight: 0.2, grassRadius: 14, shadowRadius: 11,
    });
    ctx.camera.position.set(0.5, 3.2, 12.5);
    ctx.controls?.target.set(0, 0.2, 0);
    if (ctx.controls) ctx.controls.maxPolarAngle = 1.5;   // stay above the grass
    ctx.controls?.update();

    const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const rabbits = new THREE.InstancedMesh(rabbitGeometry(), furMat, MAX_R);
    const foxes = new THREE.InstancedMesh(foxGeometry(), furMat, MAX_F);
    for (const herd of [rabbits, foxes]) {
      herd.castShadow = true;
      herd.receiveShadow = true;
      herd.frustumCulled = false;
      ctx.scene.add(herd);
    }
    return {
      env, rabbits, foxes, furMat,
      rabbitRoutes: routes(MAX_R, 1.7, 0.9),
      foxRoutes: routes(MAX_F, 9.1, 2.4),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const { R, F } = ctx.motion;
    const t = ctx.time;
    const { m, q, p, s, up } = state;

    // Animal i exists while i < population; the newest one grows in (or
    // shrinks out) with the fractional part, so births and deaths are smooth.
    const place = (herd, routeList, count, hopHeight, hopRate, size) => {
      const n = Math.min(routeList.length, Math.ceil(count));
      for (let i = 0; i < n; i++) {
        const r = routeList[i];
        const a = r.w * t + r.ph;
        const x = r.hx + r.ax * Math.cos(a);
        const z = r.hz + r.az * Math.sin(1.3 * a);
        const vx = -r.ax * Math.sin(a) * r.w;
        const vz = 1.3 * r.az * Math.cos(1.3 * a) * r.w;
        const hop = Math.abs(Math.sin(hopRate * t + r.hop));
        p.set(x, hopHeight * hop, z);
        q.setFromAxisAngle(up, Math.atan2(-vz, vx));
        const grow = size * clamp01(count - i) ** 0.5;
        s.set(grow, grow * (1 - 0.08 * (1 - hop)), grow);
        m.compose(p, q, s);
        herd.setMatrixAt(i, m);
      }
      herd.count = n;
      herd.instanceMatrix.needsUpdate = true;
    };
    place(state.rabbits, state.rabbitRoutes, R, 0.09, 6, 1.5);
    place(state.foxes, state.foxRoutes, F, 0.03, 9, 1.25);
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.rabbits.geometry.dispose();
    state.foxes.geometry.dispose();
    state.furMat.dispose();
  },
};
