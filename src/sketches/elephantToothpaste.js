import * as THREE from 'three';
import { TAU, phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { caption, inUnits, beat } from '../lib/bit.js';

// Elephant's toothpaste: 50 mL of 30 % hydrogen peroxide, a squirt of dish
// soap and a splash of potassium iodide in a 1 L measuring cylinder. Iodide
// catalyses the decomposition
//
//     2 H₂O₂ → 2 H₂O + O₂,      rate = k [I⁻][H₂O₂]
//
// and with [I⁻] constant (it's a catalyst) that's first order:
//
//     ξ(t) = 1 − e^{−kt},      k = 0.6 s⁻¹ (half-life 1.2 s)
//
// ξ is the fraction of peroxide used up. The soap traps the oxygen as foam.
// All amounts follow from ξ:
//
//     n₀ = 50 mL × 1.11 g/mL × 0.30 / 34.01 g/mol = 0.4895 mol H₂O₂
//     V_O₂ = ½ n₀ ξ RT/P = 5.99 ξ L                 (25 °C, 1 atm)
//     V_foam = V_O₂ / φ = 6.65 ξ L,   φ = 0.9 gas by volume
//     Q = 98.0 kJ/mol × n₀ ξ = 48.0 ξ kJ            (ΔH = −98.0 kJ/mol H₂O₂)
//
// The foam is drawn as a tube the width of the cylinder (r = 3.25 cm), so its
// length is exactly V_foam / πr²: 2.0 m of foam by the end. If no heat
// escaped, the 70 g of liquid would warm by 164 °C. It can't: it hits 100 °C
// at ξ = 0.457 (about 1 s in) and the remaining heat boils off 11.5 g of
// water as steam, which is why the real demo steams.
//
// Joke unit: an elephant has four molars in use at a time, each about the
// size of a brick. Budgeting 0.5 L of toothpaste per molar, one elephant
// takes 2 L. (The budget is ours; the four molars are real.)
//
// Loop (20 s): 2 s of setup and pouring, 12 s of reaction in real time,
// 2 s of standing there, then 4 s of rewind, which is not physics.

const PERIOD = 20;
const T_START = 2;            // reaction begins (s into the loop)
const T_HOLD = 16;            // rewind begins
const K = 0.6;                // s⁻¹
const N0 = (50 * 1.11 * 0.3) / 34.015;
const V_O2_MAX = (N0 / 2) * 0.082057 * 298.15;  // L
const PHI = 0.9;
const V_FOAM_MAX = V_O2_MAX / PHI;               // L
const Q_MAX = 98.0 * N0;                         // kJ
const MASS = 70;                                 // g of liquid
const C_P = 4.18;                                // J/(g K)
const L_VAP = 2257;                              // J/g
const PER_ELEPHANT = 2;                          // L: 4 molars × 0.5 L

// Scene units: 1 unit = 10 cm. The bench top is y = 0.
const R_IN = 0.325;
const R_OUT = 0.345;
const FLOOR = 0.15;                               // thickness of the cylinder's foot
const AREA_L_PER_UNIT = Math.PI * R_IN * R_IN;   // litres per unit of length: πr² × 1 L/unit³ = 0.332 L
const Y_LIQUID = FLOOR + 0.07 / AREA_L_PER_UNIT;  // 70 mL in the bottom
const Y_MOUTH = FLOOR + 1.0 / AREA_L_PER_UNIT;    // 1000 mL at the rim

// Reaction time τ (seconds since the iodide went in) at loop time t.
function reactionTime(t) {
  if (t < T_START) return 0;
  if (t < T_HOLD) return t - T_START;
  return (T_HOLD - T_START) * (1 - smooth((t - T_HOLD) / (PERIOD - T_HOLD)));
}

// --- The path the foam follows ------------------------------------------
// Up the cylinder, out of the mouth, over in a half loop, down to the bench,
// then coiling round the cylinder's foot. Sampled once as a polyline with
// parallel-transported frames, so the foam's stripes never twist.
function buildPath() {
  const pts = [];
  const add = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
  const step = 0.02;
  const yTop = Y_MOUTH + 0.55;
  for (let y = Y_LIQUID; y < yTop; y += step) add(0, y, 0);
  const ra = 0.62;
  for (let a = Math.PI; a > 0; a -= step / ra) add(ra + ra * Math.cos(a), yTop + ra * Math.sin(a), 0);
  const x = 2 * ra;
  const rb = 0.45;
  const yLow = 0.36 + rb;
  for (let y = yTop; y > yLow; y -= step) add(x, y, 0);
  for (let a = 0; a < Math.PI / 2; a += step / rb) add(x, yLow - rb * Math.sin(a), rb - rb * Math.cos(a));
  const r0 = Math.hypot(x, rb);
  const th0 = Math.atan2(rb, x);
  for (let th = th0; th < th0 + 3 * TAU; ) {
    const r = r0 + (0.7 * (th - th0)) / TAU;
    add(r * Math.cos(th), 0.36 + 0.06 * (th - th0) / TAU, r * Math.sin(th));
    th += step / r;
  }
  // Arc length, tangents, and frames by parallel transport.
  const n = pts.length;
  const s = new Float32Array(n);
  const T = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) s[i] = s[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  const N = [new THREE.Vector3(1, 0, 0)];
  for (let i = 1; i < n; i++) {
    const v = N[i - 1].clone();
    v.addScaledVector(T[i], -v.dot(T[i])).normalize();
    N.push(v);
  }
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]));
  return { pts, s, T, N, B, length: s[n - 1] };
}

// Find the sample at arc length `x` (binary search, then lerp).
function samplePath(path, x, out) {
  const { s } = path;
  let lo = 0;
  let hi = s.length - 1;
  x = Math.min(Math.max(x, 0), s[hi]);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] < x) lo = mid;
    else hi = mid;
  }
  const f = (x - s[lo]) / Math.max(1e-9, s[hi] - s[lo]);
  out.p.lerpVectors(path.pts[lo], path.pts[hi], f);
  out.n.lerpVectors(path.N[lo], path.N[hi], f).normalize();
  out.b.lerpVectors(path.B[lo], path.B[hi], f).normalize();
}

// Smooth bumpy noise, so the foam is lumpy and the lumps ride along with it.
const hash = (i, j) => {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
function noise(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
  return a + (b - a) * sy;
}

const RINGS = 420;
const SIDES = 40;

function cylinderProfile() {
  // Lathe outline of a measuring cylinder: foot, wall, rim with a lip.
  const p = [];
  p.push(new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0.62, 0.06));
  p.push(new THREE.Vector2(R_OUT, 0.1), new THREE.Vector2(R_OUT, Y_MOUTH - 0.02));
  p.push(new THREE.Vector2(R_OUT + 0.03, Y_MOUTH), new THREE.Vector2(R_IN, Y_MOUTH + 0.01));
  p.push(new THREE.Vector2(R_IN, FLOOR), new THREE.Vector2(0.0001, FLOOR));
  return p;
}

export default {
  name: "Elephant's Toothpaste",
  description:
    'Hydrogen peroxide meets potassium iodide in a measuring cylinder and becomes two metres of foam. First-order ' +
    'kinetics, ξ = 1 − e^(−kt), sets everything: the oxygen made, the foam (drawn exactly as long as its volume), ' +
    'the heat, the steam. Plus how many elephants that would brush.',
  tags: ['chemistry', 'kinetics', 'catalysis', 'thermochemistry', 'realistic', 'humor'],
  category: 'Chemistry',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    const tau = reactionTime(loopT);
    const xi = 1 - Math.exp(-K * tau);
    const q = Q_MAX * xi * 1000;                                 // J
    const temp = Math.min(100, 25 + q / (MASS * C_P));
    const steam = Math.max(0, (q - MASS * C_P * 75) / L_VAP);
    return {
      loopT,
      tau,
      xi,
      nH2O2: N0 * (1 - xi),
      vO2: V_O2_MAX * xi,
      vFoam: V_FOAM_MAX * xi,
      temp,
      steam,
      rewinding: loopT >= T_HOLD ? 1 : 0,
    };
  },

  latex: (params, hl, m) => {
    const line = beat(m.loopT, [
      [0, 'Step 1: 50 mL of 30 % hydrogen peroxide, minding its own business.'],
      [0.8, "Step 2: potassium iodide, the elephant's dentist."],
      [T_START + 0.3, 'The iodide is not used up. It just makes everyone else hurry.'],
      [T_START + 1.0, 'Now boiling. The toothpaste is also a kettle.'],
      [T_START + 5, 'Reaction 95 % done. Nobody asked the elephant.'],
      [T_HOLD, 'Rewinding. (Entropy, briefly ignored. This part is not physics.)'],
    ]);
    return (
      '\\begin{aligned}' +
      '2\\,\\mathrm{H_2O_2} &\\xrightarrow{\\ \\mathrm{I^-}\\ } 2\\,\\mathrm{H_2O} + \\mathrm{O_2}\\uparrow,\\qquad' +
      ` \\xi = 1 - e^{-kt} = ${hl(m.xi, 3)},\\ \\ t = ${hl(m.tau, 1)}\\,\\text{s} \\\\` +
      `n_{\\mathrm{H_2O_2}} &= n_0 (1-\\xi) = ${hl(m.nH2O2, 3)}\\,\\text{mol},\\quad ` +
      `V_{\\mathrm{O_2}} = \\tfrac12 n_0 \\xi \\tfrac{RT}{P} = ${hl(m.vO2, 2)}\\,\\text{L} \\\\` +
      `V_\\text{foam} &= V_{\\mathrm{O_2}}/\\varphi = ${hl(m.vFoam, 2)}\\,\\text{L} = ` +
      inUnits(hl, m.vFoam, { per: PER_ELEPHANT, of: 'L', name: 'elephants brushed', digits: 2 }) +
      ' \\\\' +
      `T &= ${hl(m.temp, 0)}\\,^\\circ\\text{C},\\quad \\text{steam} = ${hl(m.steam, 1)}\\,\\text{g} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    ctx.camera.near = 0.05;
    const env = createEnvironment(ctx, { preset: 'lab', fov: 40, shadowRadius: 4, vignette: 0.4 });
    ctx.camera.position.set(4.2, 4.4, 8.6);
    ctx.controls?.target.set(0.4, 2.1, 0);
    ctx.controls?.update();
    const { scene } = ctx;

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.05, ior: 1.47,
      transparent: true, side: THREE.DoubleSide, envMapIntensity: 1.2,
    });

    // The measuring cylinder, with a graduation line every 100 mL.
    const cylinder = new THREE.Mesh(new THREE.LatheGeometry(cylinderProfile(), 64), glass);
    cylinder.castShadow = true;
    scene.add(cylinder);
    const markMat = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.6 });
    for (let ml = 100; ml <= 1000; ml += 100) {
      const y = FLOOR + ml / 1000 / AREA_L_PER_UNIT;
      const mark = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + 0.002, R_OUT + 0.002, 0.008, 24, 1, true, -0.5, 1), markMat);
      mark.position.y = y;
      scene.add(mark);
    }

    // The peroxide, soap and colouring in the bottom.
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(R_IN - 0.005, R_IN - 0.005, Y_LIQUID - FLOOR, 40),
      new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, roughness: 0.1, transmission: 0.6, thickness: 0.6 })
    );
    liquid.position.y = (Y_LIQUID + FLOOR) / 2;
    scene.add(liquid);

    // A small beaker of potassium iodide solution that tips into the cylinder.
    const beaker = new THREE.Group();
    const beakerGlass = new THREE.Mesh(
      new THREE.LatheGeometry(
        [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.22, 0.42), new THREE.Vector2(0.25, 0.45), new THREE.Vector2(0.21, 0.43), new THREE.Vector2(0.21, 0.02), new THREE.Vector2(0.0001, 0.02)],
        40
      ),
      glass
    );
    beakerGlass.castShadow = true;
    const ki = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.205, 0.2, 32).translate(0, 0.1, 0),
      new THREE.MeshPhysicalMaterial({ color: 0xd9a64a, roughness: 0.1, transmission: 0.5, thickness: 0.4 })
    );
    ki.position.y = 0.02;
    beakerGlass.position.set(-0.25, -0.45, 0);    // so the group's origin is the pouring lip
    ki.position.x = -0.25;
    ki.position.y -= 0.45;
    beaker.add(beakerGlass, ki);
    beaker.position.set(-0.1, Y_MOUTH + 0.85, 0);
    scene.add(beaker);
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.012, 1, 10).translate(0, -0.5, 0),
      ki.material
    );
    scene.add(stream);

    // The foam: a tube along the path, rebuilt every frame.
    const path = buildPath();
    const pos = new Float32Array((RINGS + 1) * (SIDES + 1) * 3);
    const col = new Float32Array((RINGS + 1) * (SIDES + 1) * 3);
    const index = [];
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = i * (SIDES + 1) + j;
        const b = a + SIDES + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const foamGeo = new THREE.BufferGeometry();
    foamGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    foamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    foamGeo.setIndex(index);
    const foam = new THREE.Mesh(
      foamGeo,
      new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: 0.62, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xffffff,
        clearcoat: 0.25, clearcoatRoughness: 0.4,
      })
    );
    foam.castShadow = true;
    foam.receiveShadow = true;
    foam.frustumCulled = false;
    scene.add(foam);

    // Steam: soft sprites drifting up off the foam.
    const puff = document.createElement('canvas');
    puff.width = puff.height = 64;
    const pg = puff.getContext('2d');
    const grad = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad;
    pg.fillRect(0, 0, 64, 64);
    const puffTex = new THREE.CanvasTexture(puff);
    const steam = [];
    for (let i = 0; i < 40; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData = { u: Math.random(), phase: Math.random(), drift: Math.random() * TAU };
      scene.add(sp);
      steam.push(sp);
    }

    return {
      env, path, foam, ki, foamGeo, pos, col, beaker, stream, steam, puffTex,
      frame: { p: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() },
      tmp: new THREE.Vector3(),
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    state.env.update(ctx);

    // The pour: tip the beaker 0.6–1.6 s, stream 1.0–2.0 s, tip back by 3 s.
    const tip = smooth((m.loopT - 0.4) / 0.8) * (1 - smooth((m.loopT - 2.2) / 0.9));
    state.beaker.rotation.z = -1.9 * tip;
    state.ki.scale.y = Math.max(0.05, 1 - smooth((m.loopT - 1.0) / 1.0));
    const pouring = m.loopT > 1.0 && m.loopT < 2.05;
    state.stream.visible = pouring;
    if (pouring) {
      state.stream.position.copy(state.beaker.position);
      state.stream.scale.set(1, state.beaker.position.y - Y_LIQUID, 1);
    }

    // The foam, from the liquid surface to its tip.
    const len = (m.vFoam / AREA_L_PER_UNIT);
    const { path, pos, col, frame, tmp } = state;
    const cream = [0.93, 0.86, 0.66];        // tinted by a little free iodine
    const stripes = [[0.95, 0.35, 0.55], [0.25, 0.75, 0.8], [0.98, 0.82, 0.25]];
    let k = 0;
    for (let i = 0; i <= RINGS; i++) {
      const s = (len * i) / RINGS;
      samplePath(path, s, frame);
      const matter = len - s;                // which parcel of foam this is: rides along with the flow
      const inside = s < Y_MOUTH - Y_LIQUID;
      const tipTaper = Math.sqrt(clamp01((len - s) / 0.28));
      const base = (inside ? R_IN - 0.006 : R_IN * 1.08) * tipTaper;
      for (let j = 0; j <= SIDES; j++) {
        const a = (j / SIDES) * TAU;
        const lump = inside ? 0 : 0.16 * (noise(matter * 4, j * 0.5) - 0.5) + 0.07 * (noise(matter * 15, j * 1.4) - 0.5) + 0.03 * (noise(matter * 45, j * 3.1) - 0.5);
        const r = base * (1 + lump);
        tmp.copy(frame.p).addScaledVector(frame.n, r * Math.cos(a)).addScaledVector(frame.b, r * Math.sin(a));
        pos[3 * k] = tmp.x;
        pos[3 * k + 1] = tmp.y;
        pos[3 * k + 2] = tmp.z;
        // Food-colouring stripes along the length, three of them, a bit ragged.
        const band = (a / TAU) * 6 + 0.5 * (noise(matter * 3, 1.3) - 0.5);
        const which = ((Math.floor(band) % 6) + 6) % 6;
        const f = band - Math.floor(band);
        const w = which % 2 === 0 ? Math.min(clamp01((f - 0.15) / 0.2), clamp01((0.85 - f) / 0.2)) : 0;
        const stripe = stripes[(which / 2) % 3] || cream;
        const shade = 0.88 + 0.12 * noise(matter * 30, j * 2.3);
        const c0 = (cream[0] + (stripe[0] - cream[0]) * w) * shade;
        const c1 = (cream[1] + (stripe[1] - cream[1]) * w) * shade;
        const c2 = (cream[2] + (stripe[2] - cream[2]) * w) * shade;
        col[3 * k] = c0;
        col[3 * k + 1] = c1;
        col[3 * k + 2] = c2;
        k++;
      }
    }
    state.foamGeo.attributes.position.needsUpdate = true;
    state.foamGeo.attributes.color.needsUpdate = true;
    state.foamGeo.computeVertexNormals();
    state.foam.visible = len > 0.01;

    // Steam, once the foam has hit 100 °C and is outside the cylinder.
    const steaming = m.temp >= 99.5 && !m.rewinding ? 1 : 0;
    for (const sp of state.steam) {
      const d = sp.userData;
      const life = (ctx.time * 0.25 + d.phase) % 1;
      samplePath(path, (Y_MOUTH - Y_LIQUID) + d.u * Math.max(0, len - (Y_MOUTH - Y_LIQUID)), frame);
      sp.position.copy(frame.p);
      sp.position.y += 0.3 + life * 1.6;
      sp.position.x += 0.2 * Math.sin(d.drift + life * 3);
      const sc = 0.25 + life * 0.9;
      sp.scale.set(sc, sc, 1);
      const outside = len > Y_MOUTH - Y_LIQUID + 0.3;
      sp.material.opacity = steaming * (outside ? 1 : 0) * 0.16 * Math.sin(Math.PI * life);
    }
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.puffTex.dispose();
    for (const sp of state.steam) sp.material.dispose();
  },
};
