import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption } from '../lib/bit.js';

// Three double pendulums on one axle, released together from the same
// angles, except that each tip starts one atom's width (10⁻¹⁰ m) away from
// the next. Light rods, equal bobs (m₁ = m₂ = m, ℓ₁ = ℓ₂ = ℓ = 30 cm):
//
//     L = T − V = mℓ²(θ̇₁² + ½θ̇₂² + θ̇₁θ̇₂ cos(θ₁ − θ₂)) + mgℓ(2 cos θ₁ + cos θ₂)
//
// whose Euler–Lagrange equations are integrated with RK4 at h = 2 × 10⁻⁴ s.
// Released from (θ₁, θ₂) = (2.4, 2.0) rad, the gap between neighbours grows
// about e^{1.6 t}: 10⁻⁶ rad at 2.9 s, 0.1 rad at 12.6 s, 1 rad at 14.6 s.
// Checked in Node at h = 2×10⁻⁴, 10⁻⁴ and 5×10⁻⁵ s: the same times to the
// hundredth of a second, and energy constant to 10⁻⁹ J. So the divergence is
// the pendulum, not the arithmetic. That's chaos: the equations are exact
// and deterministic, and still useless for prediction after ~12 s, because
// nobody can set a pendulum up to better than an atom.
//
// The same goes for the computer. The integrator's own error, measured by
// comparing h = 2 × 10⁻⁴ with h = 10⁻⁴ from the same start, reaches 0.1 rad
// at 16.4 s, four seconds after the atom does. Past that, each path drawn is
// a genuine double-pendulum motion, but no longer the exact one for these
// starting angles. The caption says so.
//
// The LEDs on the tips (red, green, blue) leave trails, like a long-exposure
// photograph, and the light adds: while the three paths coincide the trail
// is white, and it splits into colours exactly when they stop agreeing.
// Loop (30 s): 25 s of motion in real time, a 4 s rewind (the equations are
// time-reversible; the rewind replays the recorded motion), 1 s held still.

const G = 9.81;
const L = 0.3;
const M = 1;
const H = 2e-4;
const START = [2.4, 2.0];
const ATOM = 1e-10;
const EPS = ATOM / L;                    // θ₂ offset that moves the tip one atom
const RUN = 25;
const REWIND = 4;
const PERIOD = 30;
const RATE = 240;                        // stored samples per second
const COLORS = [new THREE.Color(1.4, 0.25, 0.18), new THREE.Color(0.3, 1.3, 0.35), new THREE.Color(0.35, 0.55, 1.5)];
const PIVOT = new THREE.Vector3(0, 0.78, 0);
const ARITHMETIC_HORIZON = 16.4;         // s, see above
const SPACING = 0.022;                   // the three pendulums sit 2.2 cm apart on the axle

function deriv(s) {
  const [t1, t2, w1, w2] = s;
  const d = t1 - t2;
  const den = 3 * M - M * Math.cos(2 * d);
  const a1 = (-3 * M * G * Math.sin(t1) - M * G * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * M * (w2 * w2 * L + w1 * w1 * L * Math.cos(d))) / (L * den);
  const a2 = (2 * Math.sin(d) * (2 * M * w1 * w1 * L + 2 * M * G * Math.cos(t1) + M * w2 * w2 * L * Math.cos(d))) / (L * den);
  return [w1, w2, a1, a2];
}
function rk4(s, h) {
  const add = (x, k, c) => [x[0] + c * k[0], x[1] + c * k[1], x[2] + c * k[2], x[3] + c * k[3]];
  const k1 = deriv(s);
  const k2 = deriv(add(s, k1, h / 2));
  const k3 = deriv(add(s, k2, h / 2));
  const k4 = deriv(add(s, k3, h));
  return [0, 1, 2, 3].map((i) => s[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
const energy = ([t1, t2, w1, w2]) =>
  M * L * L * (w1 * w1 + 0.5 * w2 * w2 + w1 * w2 * Math.cos(t1 - t2)) - M * G * L * (2 * Math.cos(t1) + Math.cos(t2));

// Integrate all three once and store (θ₁, θ₂, θ̇₁, θ̇₂) at RATE Hz. Done the
// first time it's needed, not when the site loads.
let TRAJ = null;
const integrate = () => {
  const samples = RUN * RATE + 1;
  const out = [0, 1, 2].map(() => new Float64Array(samples * 4));
  const offsets = [0, EPS, 2 * EPS];
  const per = Math.round(1 / (RATE * H));
  out.forEach((arr, p) => {
    let s = [START[0], START[1] + offsets[p], 0, 0];
    for (let i = 0; i < samples; i++) {
      arr.set(s, 4 * i);
      for (let j = 0; j < per; j++) s = rk4(s, H);
    }
  });
  return out;
};
const E0 = energy([START[0], START[1], 0, 0]);

// State at time t, by cubic Hermite interpolation (it has the derivatives).
function stateAt(p, t) {
  const x = Math.min(Math.max(t, 0), RUN) * RATE;
  const i = Math.min(Math.floor(x), RUN * RATE - 1);
  const u = x - i;
  TRAJ ??= integrate();
  const a = TRAJ[p];
  const h = 1 / RATE;
  const herm = (y0, y1, d0, d1) => {
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * d0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * d1;
  };
  const lin = (k) => a[4 * i + k] + (a[4 * (i + 1) + k] - a[4 * i + k]) * u;
  return [herm(a[4 * i], a[4 * i + 4], a[4 * i + 2], a[4 * i + 6]), herm(a[4 * i + 1], a[4 * i + 5], a[4 * i + 3], a[4 * i + 7]), lin(2), lin(3)];
}

// The stored sample nearest t: exact integrator output, for the energy check
// (interpolating between samples would add its own error).
function sampleAt(p, t) {
  TRAJ ??= integrate();
  const i = Math.round(Math.min(Math.max(t, 0), RUN) * RATE);
  return Array.from(TRAJ[p].subarray(4 * i, 4 * i + 4));
}
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

function tips(s, z, out1, out2) {
  out1.set(PIVOT.x + L * Math.sin(s[0]), PIVOT.y - L * Math.cos(s[0]), z);
  out2.set(out1.x + L * Math.sin(s[1]), out1.y - L * Math.cos(s[1]), z);
}

export default {
  name: 'Double Pendulum',
  description:
    'Three double pendulums released together, their tips one atom apart. For about 12 seconds they are ' +
    'identical; then chaos takes them apart. The equations are exact (RK4, energy constant to 10⁻⁹ J); the ' +
    'gap grows like e^(1.6t), shown live in atom widths. LEDs on the tips draw long-exposure trails.',
  tags: ['physics', 'chaos', 'lagrangian mechanics', 'lyapunov', 'pendulum', 'realistic', 'humor'],
  category: 'Chaos',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    // Forward in real time, then a rewind, then held at the start.
    const time = loopT < RUN ? loopT : loopT < RUN + REWIND ? RUN * (1 - smooth((loopT - RUN) / REWIND)) : 0;
    const s = [0, 1, 2].map((p) => stateAt(p, time));
    const gap = Math.max(Math.hypot(wrap(s[1][0] - s[0][0]), wrap(s[1][1] - s[0][1])), 1e-300);
    // Tip-to-tip distance between pendulums 1 and 2, in metres (ignoring the axle spacing).
    const x = (q) => L * (Math.sin(q[0]) + Math.sin(q[1]));
    const y = (q) => -L * (Math.cos(q[0]) + Math.cos(q[1]));
    const tipGap = Math.max(Math.hypot(x(s[1]) - x(s[0]), y(s[1]) - y(s[0])), ATOM * 1e-3);
    return {
      loopT,
      time,
      rewinding: loopT >= RUN && loopT < RUN + REWIND ? 1 : 0,
      t1: wrap(s[0][0]),
      t2: wrap(s[0][1]),
      logGap: Math.log10(gap),
      logAtoms: Math.log10(tipGap / ATOM),
      lambda: time > 1 ? Math.log(gap / EPS) / time : 0,
      dE: energy(sampleAt(0, time)) - E0,
    };
  },

  latex: (params, hl, m) => {
    const line = m.rewinding
      ? 'Rewinding. The equations run backwards just fine. Starting three pendulums within an atom of each other is the hard part.'
      : m.loopT >= RUN
        ? 'Holding them still, one atom apart. Releasing.'
        : m.logGap < -6
          ? 'Three identical pendulums. Nothing to see here.'
          : m.logGap < -3
            ? 'Still identical to the eye: the trail is white. The maths disagrees.'
            : m.logGap < -1
              ? 'Small creative differences.'
              : m.time < ARITHMETIC_HORIZON
                ? 'They are no longer on speaking terms.'
                : 'From here even my arithmetic is guessing. A real pendulum\'s would be too.';
    return (
      '\\begin{aligned}' +
      'L &= m\\ell^2\\big(\\dot\\theta_1^2 + \\tfrac12\\dot\\theta_2^2 + \\dot\\theta_1\\dot\\theta_2\\cos(\\theta_1 - \\theta_2)\\big) + mg\\ell\\,(2\\cos\\theta_1 + \\cos\\theta_2) \\\\' +
      `\\theta_1 &= ${hl(m.t1, 2)},\\quad \\theta_2 = ${hl(m.t2, 2)},\\quad t = ${hl(m.time, 1)}\\,\\text{s},\\quad E - E_0 = ${hl(m.dE * 1e9, 2)} \\times 10^{-9}\\,\\text{J} \\\\` +
      `|\\Delta\\theta| &= 10^{${hl(m.logGap, 1)}}\\,\\text{rad} \\approx |\\Delta\\theta_0|\\,e^{\\lambda t},\\quad \\lambda = ${hl(m.lambda, 2)}\\,\\text{s}^{-1} \\\\` +
      `\\text{tips apart} &= 10^{${hl(m.logAtoms, 1)}}\\ \\text{atom widths}\\ \\ \\textcolor{#9aa3b2}{(1 = 10^{-10}\\,\\text{m})} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 2 },
    trail: { value: 2.5, min: 0, max: 8 },
  },

  setup(ctx) {
    ctx.camera.near = 0.01;
    const env = createEnvironment(ctx, {
      preset: 'lab', fov: 40, exposure: 0.6, sunIntensity: 0.12, hemi: 0.03, shadowRadius: 1.2, vignette: 0.6,
    });
    // Lights down, for the long exposure.
    ctx.scene.environmentIntensity = 0.08;
    ctx.camera.position.set(0.12, 0.6, 2.05);
    ctx.controls?.target.set(0, 0.52, 0);
    ctx.controls?.update();
    const { scene } = ctx;

    const alu = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.6, roughness: 0.4 });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    // The stand: a heavy base, two posts, and the axle.
    add(new THREE.BoxGeometry(0.5, 0.025, 0.22), dark, 0, 0.0125, -0.04);
    // One post behind, so nothing stands between you and the pendulums.
    add(new THREE.BoxGeometry(0.03, 0.82, 0.03), alu, 0, 0.41 + 0.0125, -0.1);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 16).rotateX(Math.PI / 2), alu, PIVOT.x, PIVOT.y, -0.045);

    // Three pendulums: two flat aluminium bars each, a bearing at each joint,
    // a small housing with an LED at the tip.
    const barGeo = new THREE.BoxGeometry(0.014, L + 0.02, 0.005);
    const bearingGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.008, 24).rotateX(Math.PI / 2);
    const ledGeo = new THREE.SphereGeometry(0.006, 16, 12);
    const pendulums = [0, 1, 2].map((p) => {
      const z = (p - 1) * SPACING;
      const upper = add(barGeo, alu, 0, 0, z);
      const lower = add(barGeo, alu, 0, 0, z);
      const joint = add(bearingGeo, dark, 0, 0, z);
      add(bearingGeo, dark, PIVOT.x, PIVOT.y, z);
      const led = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: COLORS[p], emissiveIntensity: 6 }));
      scene.add(led);
      const glow = new THREE.PointLight(COLORS[p], 0.12, 2.5, 2);
      scene.add(glow);
      return { z, upper, lower, joint, led, glow };
    });

    // Added like light, as on a long exposure: faint is dark, overlaps brighten.
    const trails = createFatLines({ maxSegments: 3 * RATE * 8, width: 2.2 });
    Object.assign(trails.object.material, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    scene.add(trails.object);

    return {
      env, pendulums, trails, barGeo, bearingGeo, ledGeo, alu, dark,
      a: new THREE.Vector3(), b: new THREE.Vector3(), pa: new THREE.Vector3(), pb: new THREE.Vector3(), col: new THREE.Color(),
    };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const { time } = ctx.motion;
    const { a, b, pa, pb, col } = state;

    state.pendulums.forEach((pen, p) => {
      const s = stateAt(p, time);
      tips(s, pen.z, a, b);
      // Each bar's centre is the midpoint of its two ends; it hangs at angle θ.
      pen.upper.position.set((PIVOT.x + a.x) / 2, (PIVOT.y + a.y) / 2, pen.z);
      pen.upper.rotation.z = s[0];
      pen.lower.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, pen.z + 0.006);
      pen.lower.rotation.z = s[1];
      pen.joint.position.copy(a);
      pen.led.position.set(b.x, b.y, pen.z + 0.006);
      pen.glow.position.copy(pen.led.position);
    });

    // Long-exposure trails: the last `trail` seconds of each tip, fading.
    const tr = state.trails;
    tr.setResolution(ctx.size.width, ctx.size.height);
    tr.reset();
    const span = Math.min(ctx.params.trail, time);
    const n = Math.floor(span * 120);
    if (!ctx.motion.rewinding && n > 1) {
      state.pendulums.forEach((pen, p) => {
        for (let k = 0; k < n; k++) {
          const t0 = time - span + (k / n) * span;
          const t1 = time - span + ((k + 1) / n) * span;
          tips(stateAt(p, t0), pen.z + 0.006, pa, a);
          tips(stateAt(p, t1), pen.z + 0.006, pb, b);
          col.copy(COLORS[p]).multiplyScalar(((k + 1) / n) ** 1.5);
          tr.push(a, b, col);
        }
      });
    }
    tr.commit();
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.trails.dispose();
    for (const x of [state.barGeo, state.bearingGeo, state.ledGeo, state.alu, state.dark]) x.dispose();
  },
};
