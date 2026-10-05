import * as THREE from 'three';
import { phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { caption, beat } from '../lib/bit.js';

// Liesegang rings: a drop of silver nitrate in the middle of a dish of gel
// that contains potassium dichromate. Silver ions diffuse outwards, meet
// dichromate, and silver dichromate precipitates, but not evenly: in rings,
// with clear gaps between them. Raphael Liesegang, 1896.
//
// The model (Keller & Rubinow, 1981), radial, in dimensionless units:
//
//     ∂a/∂t = ∇²a − k a b           a: silver (outer electrolyte), held at a₀ in the well
//     ∂b/∂t = ∇²b − k a b           b: dichromate (inner electrolyte), b₀ in the gel
//     ∂c/∂t = D_c ∇²c + k a b − G   c: dissolved silver dichromate
//     ∂d/∂t = G                     d: precipitate (doesn't move)
//
//     G = λc  if c > c* (nucleation) or d > 0 and c > c_s (growth on what's there)
//
// with a₀ = 2, b₀ = 0.1, k = 2000, D_c = 0.1, c* = 0.08, c_s = 0.01, λ = 1000.
// The product has to supersaturate to c* before it precipitates; once a ring
// has formed it soaks up the product around it, so the next ring can only
// form further out. That gives the two empirical laws, which the readouts
// check live:
//
//     spacing law (Jablczynski, 1923):  x_{n+1}/x_n → 1 + p      (here 1.06–1.12)
//     time law:                          x_n / √t_n → const       (here → 1.9)
//
// Checked in Node before porting: 21 rings, those ratios and that constant.
// Explicit finite differences in r (with the (1/r)∂/∂r term), dr = 0.62/240,
// dt = 0.2 dr². The dish wall at r = 0.62 lets nothing through. The rings stop
// about two thirds of the way out: the dichromate, which also diffuses, has
// all been drawn into the reaction and used up, which is also why the orange
// gel fades to pale, from a halo just ahead of the front outwards.
//
// Real units: a 9 cm dish and silver's diffusivity, 1.6 × 10⁻⁹ m²/s, make the
// whole run about 2.3 days. It's simulated once, in the first second, and
// replayed after that.

const N = 240;
const R_DISH = 0.62;
const DR = R_DISH / N;
const DT = 0.2 * DR * DR;
const R_WELL = 0.04;
const K = 2000;
const DC = 0.1;
const A0 = 2;
const B0 = 0.1;
const C_STAR = 0.08;
const C_SOL = 0.01;
const LAMBDA = 1000;
const T_END = 0.06;
const DAYS = (0.045 ** 2 / 1.6e-9) * (T_END / R_DISH ** 2) / 86400;   // ≈ 2.3

const PERIOD = 30;
const GROW = 26;          // seconds of the loop spent growing
const SNAPSHOTS = 520;

// The simulation, advanced on demand and recorded, so later loops replay it.
function createSim() {
  const a = new Float64Array(N);
  const b = new Float64Array(N).fill(B0);
  const c = new Float64Array(N);
  const d = new Float32Array(N);
  const na = new Float64Array(N);
  const nb = new Float64Array(N);
  const nc = new Float64Array(N);
  const born = new Float64Array(N).fill(-1);
  const snapD = new Float32Array(SNAPSHOTS * N);
  const snapB = new Float32Array(SNAPSHOTS * N);
  const snapS = new Float32Array(SNAPSHOTS);   // peak supersaturation c/c* ahead of the rings
  let t = 0;
  let recorded = 0;
  const lap = (u, i) => {
    const r = (i + 0.5) * DR;
    const um = i > 0 ? u[i - 1] : u[i];
    const up = i < N - 1 ? u[i + 1] : u[i];
    return (up - 2 * u[i] + um) / (DR * DR) + (up - um) / (2 * DR * r);
  };
  function step() {
    for (let i = 0; i < N; i++) {
      if ((i + 0.5) * DR < R_WELL) {
        na[i] = A0;
        nb[i] = 0;
        nc[i] = 0;
        continue;
      }
      const rx = K * a[i] * b[i];
      const g = c[i] > C_STAR || (d[i] > 0 && c[i] > C_SOL) ? LAMBDA * c[i] : 0;
      na[i] = a[i] + DT * (lap(a, i) - rx);
      nb[i] = b[i] + DT * (lap(b, i) - rx);
      nc[i] = c[i] + DT * (DC * lap(c, i) + rx - g);
      if (g > 0 && d[i] === 0) born[i] = t;
      d[i] += DT * g;
    }
    a.set(na);
    b.set(nb);
    c.set(nc);
    t += DT;
  }
  function record() {
    snapD.set(d, recorded * N);
    for (let i = 0; i < N; i++) snapB[recorded * N + i] = b[i] / B0;   // dichromate left, 0..1
    let s = 0;
    for (let i = 0; i < N; i++) if (d[i] === 0) s = Math.max(s, c[i] / C_STAR);
    snapS[recorded] = s;
    recorded++;
  }
  record();
  return {
    // Simulate up to time τ, for at most `budgetMs`.
    advance(tau, budgetMs) {
      const start = performance.now();
      while (recorded < SNAPSHOTS && recorded <= (tau / T_END) * (SNAPSHOTS - 1)) {
        const next = (recorded / (SNAPSHOTS - 1)) * T_END;
        while (t < next) step();
        record();
        if (performance.now() - start > budgetMs) break;
      }
    },
    // The latest recorded state at or before τ.
    frame(tau) {
      const idx = Math.min(recorded - 1, Math.floor((tau / T_END) * (SNAPSHOTS - 1)));
      return { idx, d: snapD.subarray(idx * N, idx * N + N), b: snapB.subarray(idx * N, idx * N + N), S: snapS[idx], tau: (idx / (SNAPSHOTS - 1)) * T_END };
    },
    // Rings born by time τ: [{ x (inner edge), t (birth) }], innermost first.
    rings(tau) {
      const out = [];
      for (let i = 1; i < N; i++) {
        if (born[i] >= 0 && born[i] <= tau && !(born[i - 1] >= 0 && born[i - 1] <= tau)) out.push({ x: (i + 0.5) * DR, t: born[i] });
      }
      return out;
    },
  };
}

// The gel: a standard physical material whose colour is looked up from the
// simulated profiles by radius, with a little angular wobble so the rings
// look grown rather than drawn.
function gelMaterial(profile) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uProfile = { value: profile };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDisc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisc = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uProfile;
        varying vec2 vDisc;
        float hash1(float n) { return fract(sin(n) * 43758.5453); }
        float wobble(float ang) {
          float w = 0.0;
          for (int i = 1; i <= 5; i++) {
            float f = float(i * 3);
            w += sin(ang * f + hash1(f) * 6.28) / f;
          }
          return w;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float rr = length(vDisc) / ${(DISH_R - 0.0003).toFixed(5)};      // 0 at the centre, 1 at the dish wall
          float ang = atan(vDisc.y, vDisc.x);
          rr *= 1.0 + 0.012 * wobble(ang);
          vec2 pr = texture2D(uProfile, vec2(clamp(rr, 0.0, 1.0), 0.5)).rg * vec2(4.0, 1.0);   // r: precipitate (÷4), g: dichromate left
          vec3 gel = vec3(0.95, 0.5, 0.08);                 // dichromate: orange
          vec3 spent = vec3(0.93, 0.88, 0.72);              // dichromate used up: pale
          vec3 ppt = vec3(0.36, 0.07, 0.03);                // silver dichromate: dark red-brown
          vec3 col = mix(spent, gel, smoothstep(0.05, 0.9, pr.g));
          col = mix(col, ppt, smoothstep(0.02, 0.45, pr.r));
          if (rr < ${(R_WELL / R_DISH).toFixed(4)}) col = vec3(0.85, 0.87, 0.88);   // the well of silver nitrate
          diffuseColor.rgb *= col;
        }`);
  };
  return mat;
}

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 54px sans-serif';
  g.fillText('AgNO₃', 40, 90);
  g.font = '32px sans-serif';
  g.fillText('Silver nitrate 0.5 M', 40, 145);
  g.fillStyle = '#b3261e';
  g.font = 'bold 26px sans-serif';
  g.fillText('⚠ stains skin black', 40, 205);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Scene units are metres here: the dish is 9 cm across.
const DISH_R = 0.045;
const GEL_H = 0.004;

export default {
  name: 'Liesegang Rings',
  description:
    'A drop of silver nitrate spreads through a dish of dichromate gel, and silver dichromate precipitates in ' +
    'rings instead of evenly, because the product has to supersaturate before it can come out. Simulated ' +
    '(Keller–Rubinow model), with the spacing law and the time law checked live. Two days in 26 seconds.',
  tags: ['chemistry', 'reaction-diffusion', 'precipitation', 'pattern formation', 'liesegang', 'realistic', 'humor'],
  category: 'Chemistry',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return {
      loopT,
      tau: T_END * clamp01(loopT / GROW),
      // Filled in by update() from the simulation.
      days: 0, rings: 0, ratio: 0, timeLaw: 0, S: 0, newRing: 0, dichromate: 1,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT >= PERIOD - 1.2
      ? `New dish. That one took ${DAYS.toFixed(1)} days; we sped it up ${Math.round((DAYS * 86400) / GROW / 100) * 100} times.`
      : m.newRing
        ? `Ring ${m.rings}. It could not hold it in any more.`
        : m.dichromate < 0.03
          ? 'Out of dichromate. No more rings. Everyone is sitting very still.'
        : m.S > 0.6
          ? 'Supersaturating. The solution is holding it in.'
          : beat(m.loopT, [[0, 'A drop of silver nitrate, minding its own business.'], [2, 'Diffusing. Nothing to report.']]);
    return (
      '\\begin{aligned}' +
      '\\partial_t a &= \\nabla^2 a - kab,\\quad \\partial_t b = \\nabla^2 b - kab,\\quad \\partial_t c = D_c\\nabla^2 c + kab - G \\\\' +
      `G &= \\lambda c\\ \\text{ if } c > c^*\\ \\text{or}\\ (d > 0,\\ c > c_s),\\quad c/c^* = ${hl(m.S, 2)} \\\\` +
      `\\text{ring } n &= ${hl(m.rings, 0)},\\quad \\frac{x_{n}}{x_{n-1}} = ${hl(m.ratio, 3)},\\quad \\frac{x_n}{\\sqrt{t_n}} = ${hl(m.timeLaw, 3)} \\\\` +
      `t &= ${hl(m.days, 1)}\\ \\text{days} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.005;
    ctx.camera.far = 50;
    const env = createEnvironment(ctx, { preset: 'lab', fov: 38, shadowRadius: 0.4, vignette: 0.45, exposure: 0.62 });
    // Brighter, closer ceiling light for a small subject.
    env.sun.shadow.camera.near = 0.05;
    env.sun.shadow.camera.far = 10;
    env.sun.shadow.camera.updateProjectionMatrix();
    env.sun.position.set(0.6, 2.2, 0.9);
    ctx.camera.position.set(0.0, 0.17, 0.16);
    ctx.controls?.target.set(0.0, 0.0, -0.005);
    ctx.controls?.update();
    const { scene } = ctx;

    // A sheet of white paper under the dish, as you would, to see the rings.
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.21, 0.297).rotateX(-Math.PI / 2).rotateY(0.15),
      new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.9 })
    );
    paper.position.y = 0.0005;
    paper.receiveShadow = true;
    scene.add(paper);

    // Glass petri dish: a lathe of the base and wall.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.002, ior: 1.5, transparent: true, side: THREE.DoubleSide,
    });
    const prof = [
      [0.0001, 0.001], [DISH_R, 0.001], [DISH_R + 0.0012, 0.0025], [DISH_R + 0.0012, 0.014], [DISH_R, 0.014],
      [DISH_R - 0.0002, 0.0028], [0.0001, 0.0028],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const dish = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), glass);
    dish.castShadow = true;
    scene.add(dish);

    // The gel, coloured from the simulation.
    // 8-bit, so linear filtering works everywhere (float textures can't be
    // filtered on many phones). Precipitate is stored ÷ 4.
    const profileData = new Uint8Array(N * 4);
    const profile = new THREE.DataTexture(profileData, N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    profile.magFilter = THREE.LinearFilter;
    profile.minFilter = THREE.LinearFilter;
    profile.needsUpdate = true;
    const gel = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R - 0.0003, DISH_R - 0.0003, GEL_H, 128, 1), gelMaterial(profile));
    gel.position.y = 0.0028 + GEL_H / 2;
    gel.receiveShadow = true;
    scene.add(gel);

    // A brown bottle of the stuff, for scale and for honesty.
    const bottle = new THREE.Group();
    const brown = new THREE.MeshPhysicalMaterial({ color: 0x5a2a0a, roughness: 0.08, transmission: 0.3, thickness: 0.004, clearcoat: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.09, 48), brown);
    body.position.y = 0.045;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.02, 32), brown);
    neck.position.y = 0.1;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 32), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    cap.position.y = 0.119;
    const labelTex = labelTexture();
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0284, 0.0284, 0.045, 48, 1, true, -1.1, 2.2),
      new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.7 })
    );
    label.position.y = 0.045;
    label.rotation.y = Math.PI / 2 - 0.4;
    for (const m of [body, neck, cap, label]) {
      m.castShadow = true;
      bottle.add(m);
    }
    bottle.position.set(0.1, 0, -0.12);
    scene.add(bottle);

    return { env, sim: createSim(), profile, profileData, labelTex, lastRings: 0, lastRingAt: -10 };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    state.sim.advance(m.tau, 6);
    const f = state.sim.frame(m.tau);

    // Washing up: the rings fade during the last second of the loop.
    const wash = 1 - smooth((m.loopT - (PERIOD - 1.2)) / 1.0);
    // Rings in the model are a cell or two wide; real ones are bands. Spread
    // each over ±2 cells for drawing, and darken so thin ones still show.
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = -2; j <= 2; j++) sum += f.d[Math.min(N - 1, Math.max(0, i + j))];
      state.profileData[4 * i] = Math.min(255, (sum / 5 / 4) * 255 * 2.5 * wash);
      state.profileData[4 * i + 1] = Math.min(255, (1 - (1 - f.b[i]) * wash) * 255);
    }
    state.profile.needsUpdate = true;

    const rings = state.sim.rings(f.tau);
    const n = rings.length;
    if (n > state.lastRings) state.lastRingAt = m.loopT;
    if (m.loopT < 0.5) state.lastRingAt = -10;
    state.lastRings = n;
    m.rings = n;
    m.ratio = n >= 2 ? rings[n - 1].x / rings[n - 2].x : 0;
    m.timeLaw = n >= 1 ? rings[n - 1].x / Math.sqrt(rings[n - 1].t) : 0;
    m.S = f.S;
    m.dichromate = f.b.reduce((x, y) => Math.max(x, y), 0);
    m.days = (f.tau / T_END) * DAYS;
    m.newRing = m.loopT - state.lastRingAt < 0.9 ? 1 : 0;
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.profile.dispose();
    state.labelTex.dispose();
  },
};
