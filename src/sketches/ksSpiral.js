import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { phaseOf, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createKS1D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// The 1D Kuramoto–Sivashinsky equation, u_t = −u u_x − u_xx − u_xxxx, is
// usually solved on a periodic line, and a periodic line is a circle. So
// here space goes round and time goes inward: the present is the outer
// rim, and each moment sinks toward the centre as the next one arrives,
// fading into the dark, like looking down a tunnel of time.
//
// L = 64, so ⌊L/2π⌋ = 10 waves fit that can grow (k = 2πn/L < 1), enough
// for steady spatiotemporal chaos: cells are born at the centre, drift,
// merge and split as they stream outward, and never repeat. Solved with
// ETDRK4, N = 128, h = 0.25 (src/lib/kuramotoSivashinsky.js). The mean of
// u is conserved (the equation is a derivative), shown.
// Loop (60 s): from a nearly flat start, the pattern grows and fills the disc.

const N = 128;
const L = 64;
const H = 0.25;
const PERIOD = 60;
const UNITS_PER_S = 8;
const ROW_EVERY = 0.5;
const ROWS = 220;
const R0 = 0.35;
const R1 = 3.4;
const RELIEF = 0.035;
const DEPTH = 3.2;

const STOPS = [
  [-2.5, new THREE.Color(0.02, 0.03, 0.1)],
  [-0.8, new THREE.Color(0.1, 0.12, 0.42)],
  [0.4, new THREE.Color(0.62, 0.14, 0.42)],
  [1.6, new THREE.Color(0.95, 0.45, 0.16)],
  [2.6, new THREE.Color(1.0, 0.78, 0.45)],
];
function colour(u, out) {
  if (u <= STOPS[0][0]) return out.copy(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i][0]) {
      const t = (u - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]);
      return out.copy(STOPS[i - 1][1]).lerp(STOPS[i][1], t);
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}

const sci = (x) => {
  if (!x) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toFixed(0)} \\times 10^{${e}}`;
};

export default {
  name: 'Kuramoto–Sivashinsky Spiral',
  description:
    'The 1D Kuramoto–Sivashinsky equation on its natural home, a circle: space goes round, time sinks inward, ' +
    'and spatiotemporal chaos spirals down a tunnel of its own past. Ten unstable waves, ETDRK4, glowing.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'spacetime', 'glow'],
  category: 'Chaos',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return {
      loop: Math.floor(t / PERIOD),
      loopT,
      fade: smooth(loopT / 1) * (1 - smooth((loopT - (PERIOD - 1.5)) / 1.5)),
      energy: 0, mean: 0,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT > PERIOD - 1.5
      ? 'Fresh vinyl.'
      : m.energy < 0.05
        ? 'Nearly flat. Ten waves fit; all of them are about to grow.'
        : 'A periodic line is a circle: space goes round, time sinks inward.';
    return (
      '\\begin{aligned}' +
      'u_t &= -u u_x - u_{xx} - u_{xxxx},\\quad x \\in [0, 64) \\text{ round the circle} \\\\' +
      `\\lfloor L/2\\pi \\rfloor &= 10 \\text{ unstable waves},\\quad \\langle u^2 \\rangle = ${hl(m.energy, 3)},\\quad \\textstyle\\int u\\,dx = ${sci(m.mean)} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    relief: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const { scene, renderer } = ctx;
    scene.background = new THREE.Color(0x030308);
    scene.fog = new THREE.Fog(0x030308, 8.5, 13.5);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.35;
    const key = new THREE.DirectionalLight(0xffeedd, 1.8);
    key.position.set(-3, 6, 3);
    scene.add(key);
    const glow = createGlow(ctx, { fov: 40, strength: 0.6, threshold: 0.8, exposure: 1.05, vignette: 0.6 });
    ctx.camera.position.set(0, 8.8, 5.4);
    ctx.controls?.target.set(0, -0.8, 0.3);
    ctx.controls?.update();

    const C = N + 1;
    const pos = new Float32Array(C * ROWS * 3);
    const col = new Float32Array(C * ROWS * 3);
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < N; c++) {
      const a = r * C + c;
      idx.push(a, a + 1, a + C, a + 1, a + C + 1, a + C);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(geo, mat);
    disc.frustumCulled = false;
    scene.add(disc);

    // Precomputed directions: angle round the circle, radius for each row.
    const cos = Float32Array.from({ length: C }, (_, i) => Math.cos((i / N) * Math.PI * 2));
    const sin = Float32Array.from({ length: C }, (_, i) => Math.sin((i / N) * Math.PI * 2));
    return { glow, pmrem, envTarget, disc, geo, mat, cos, sin, history: [], key: null, ks: null, simT: 0, rowT: 0, c: new THREE.Color() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    if (state.key !== m.loop) {
      state.key = m.loop;
      state.ks = createKS1D(N, L, H);
      state.ks.set(Array.from({ length: N }, (_, i) => 0.05 * Math.cos((2 * Math.PI * i) / N * 3 + 0.4) + 0.01 * Math.sin((2 * Math.PI * i) / N * 7)));
      state.simT = 0;
      state.rowT = 0;
      state.history = [];
    }
    const target = m.loopT * UNITS_PER_S;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 20) {
      state.ks.step();
      state.simT += H;
      if (state.simT >= state.rowT + ROW_EVERY) {
        state.rowT += ROW_EVERY;
        state.history.unshift(Float32Array.from(state.ks.u()));
        if (state.history.length > ROWS) state.history.pop();
      }
    }
    const u = state.ks.u();
    m.energy = u.reduce((s, v) => s + v * v, 0) / N;
    m.mean = u.reduce((s, v) => s + v, 0) / N || 0;
    m.fadeIn = m.fade;

    // Rings: the present at the rim, older moments further in.
    const C = N + 1;
    const pos = state.geo.attributes.position.array;
    const col = state.geo.attributes.color.array;
    const { cos, sin, c } = state;
    const relief = RELIEF * ctx.params.relief;
    for (let r = 0; r < ROWS; r++) {
      const row = state.history[r];
      const radius = R1 - (R1 - R0) * (r / (ROWS - 1));
      // The oldest rings fade into the dark at the centre.
      const edge = (1 - smooth((r - ROWS * 0.45) / (ROWS * 0.55))) * m.fade;
      for (let i = 0; i < C; i++) {
        const v = row ? row[i % N] : 0;
        const k = 3 * (r * C + i);
        pos[k] = radius * cos[i];
        // The past sinks as it moves inward: a funnel into the fog.
        pos[k + 1] = v * relief * edge - DEPTH * (r / (ROWS - 1)) ** 1.6;
        pos[k + 2] = radius * sin[i];
        colour(v, c);
        col[k] = c.r * (row ? edge : 0);
        col[k + 1] = c.g * (row ? edge : 0);
        col[k + 2] = c.b * (row ? edge : 0);
      }
    }
    state.geo.attributes.position.needsUpdate = true;
    state.geo.attributes.color.needsUpdate = true;
    state.geo.computeVertexNormals();
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.envTarget.dispose();
    state.pmrem.dispose();
    ctx.scene.environment = null;
    ctx.scene.fog = null;
    state.geo.dispose();
    state.mat.dispose();
  },
};
