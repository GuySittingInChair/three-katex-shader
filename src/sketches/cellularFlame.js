import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createKS2D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// A flame front wrinkling into cells, alone in the dark. This is the job the
// Kuramoto–Sivashinsky equation was derived for: Sivashinsky (1977) showed
// that the position φ of a weakly unstable premixed flame front obeys
//
//     φ_t + ∇²φ + ∇⁴φ + ½|∇φ|² = 0
//
// (in units set by the flame's own thickness and speed). The ∇² term is the
// instability (a flat flame wants to wrinkle), ∇⁴ stops it at small scales,
// and ½|∇φ|² is the flame burning along its own normal, which folds the
// wrinkles into cells with sharp creases. Lean hydrogen flames really do
// look like this.
//
// Solved pseudo-spectrally with ETDRK4 on a 64 × 64 periodic grid, L = 60
// (src/lib/kuramotoSivashinsky.js).
//
// Two readouts, both measured live:
//   • speed. Averaging the equation over the domain, the ∇ terms vanish and
//     d⟨φ⟩/dt = −½⟨|∇φ|²⟩: a wrinkled flame advances faster than a flat one,
//     because wrinkles add area and area burns fuel. Both sides are shown;
//     checked in Node they agree to three decimals.
//   • cell size, from the peak of the curvature spectrum, next to linear
//     theory's fastest-growing wavelength 2π√2 = 8.9. They're close but not
//     equal (6–8 here): the nonlinearity keeps re-splitting the cells.
//
// Drawn as a thin glowing sheet: brighter where you look along it (more
// glowing gas along the line of sight, as with real thin flames), brightest
// at the creases between cells, with bloom, and a faint reflection on a
// black floor. Loop (45 s): lit flat, wrinkles, cells, relit.

const N = 64;
const LBOX = 60;
const H = 0.1;
const PERIOD = 45;
const UNITS_PER_S = 4;
const SIZE = 6;                 // world units across
const RADIUS = 2.9;             // the glowing disc
const LIFT = 0.03;              // world height per unit of φ
const Y = 1.0;

const VERT = `
  attribute float aCrease;
  attribute float aHeight;
  varying float vCrease;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vR;
  void main() {
    vCrease = aCrease;
    vHeight = aHeight;
    vR = length(position.xz);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  uniform float uOn;
  uniform float uGain;
  varying float vCrease;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vR;
  void main() {
    float along = 1.0 / (abs(dot(normalize(vNormal), vView)) + 0.18);
    float crease = smoothstep(0.1, 1.0, vCrease);
    float rim = smoothstep(${RADIUS.toFixed(2)}, ${(RADIUS * 0.72).toFixed(2)}, vR);
    // Deep blue sheet, violet where it bulges, white-cyan creases (bright
    // enough to bloom).
    vec3 sheet = mix(vec3(0.05, 0.12, 0.75), vec3(0.35, 0.12, 0.85), smoothstep(-0.3, 0.6, vHeight));
    vec3 col = sheet * (0.16 + 0.07 * along) + vec3(0.35, 0.65, 1.3) * crease * (0.22 + 0.12 * along);
    gl_FragColor = vec4(col * rim * uOn * uGain, 1.0);
  }
`;

export default {
  name: 'Cellular Flame',
  description:
    'A flame front wrinkling into glowing cells: the 2D Kuramoto–Sivashinsky equation, which Sivashinsky derived ' +
    'for exactly this. Live: the wrinkled flame advancing faster, d⟨φ⟩/dt = −½⟨|∇φ|²⟩ (both sides measured), and ' +
    'the cell size against linear theory.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'combustion', 'flame', 'glow', 'humor'],
  category: 'Chaos',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return {
      loop: Math.floor(t / PERIOD),
      loopT,
      on: smooth(loopT / 1.2) * (1 - smooth((loopT - (PERIOD - 1.5)) / 1.2)),
      // Filled in by update().
      grad2: 0, rate: 0, cell: 0, growing: 1,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT > PERIOD - 1.5
      ? 'Relighting.'
      : m.grad2 < 0.02
        ? 'Lit. Perfectly flat. Enjoy it; it will not last.'
        : m.growing
          ? 'Wrinkling. Each wrinkle adds area, and area burns fuel.'
          : 'Cellular, and permanently undecided.';
    return (
      '\\begin{aligned}' +
      '\\varphi_t &+ \\nabla^2\\varphi + \\nabla^4\\varphi + \\tfrac12|\\nabla\\varphi|^2 = 0 \\\\' +
      `\\frac{d\\langle\\varphi\\rangle}{dt} &= ${hl(m.rate, 3)},\\quad -\\tfrac12\\langle|\\nabla\\varphi|^2\\rangle = ${hl(-0.5 * m.grad2, 3)} \\\\` +
      `\\text{cells} &= ${m.cell ? hl(m.cell, 1) : '\\text{--}'}\\ \\ (\\text{theory: } 2\\pi\\sqrt2 = 8.9) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    glow: { value: 1, min: 0, max: 2.5 },
  },

  setup(ctx) {
    ctx.scene.background = new THREE.Color(0x020308);
    const glow = createGlow(ctx, { fov: 40, strength: 0.8, threshold: 0.6, exposure: 1.0, vignette: 0.55 });
    ctx.camera.position.set(0.4, 2.9, 7.6);
    ctx.controls?.target.set(0, 0.85, 0);
    ctx.controls?.update();

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2);
    const count = (N + 1) * (N + 1);
    geo.setAttribute('aCrease', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const material = (gain) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uOn: { value: 0 }, uGain: { value: gain } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const flameMat = material(1);
    const flame = new THREE.Mesh(geo, flameMat);
    flame.position.y = Y;
    flame.frustumCulled = false;
    ctx.scene.add(flame);
    // The same sheet, upside down under a black glossy floor: a faint reflection.
    const mirrorMat = material(0.08);
    const mirror = new THREE.Mesh(geo, mirrorMat);
    mirror.scale.y = -1;
    mirror.position.y = -Y;
    mirror.frustumCulled = false;
    ctx.scene.add(mirror);

    return { glow, flame, geo, flameMat, mirrorMat, key: null, ks: null, simT: 0, lastGrad: [], lap: new Float32Array(N * N) };
  },

  update(ctx, state) {
    const m = ctx.motion;
    state.glow.strength = 0.8 * ctx.params.glow;
    if (state.key !== m.loop) {
      state.key = m.loop;
      state.ks = createKS2D(N, LBOX, H);
      state.ks.set(Array.from({ length: N * N }, () => (Math.random() - 0.5) * 0.02));
      state.simT = 0;
      state.lastGrad = [];
    }
    const target = Math.max(0, m.loopT - 0.5) * UNITS_PER_S;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 6) {
      const before = state.ks.mean();
      state.ks.step();
      state.simT += H;
      state.rate = (state.ks.mean() - before) / H;
    }
    m.rate = state.rate ?? 0;
    m.grad2 = state.ks.meanGrad2();
    state.lastGrad.push(m.grad2);
    if (state.lastGrad.length > 90) state.lastGrad.shift();
    m.growing = state.lastGrad.length < 90 || m.grad2 > 1.15 * state.lastGrad[0] ? 1 : 0;
    m.cell = m.grad2 > 0.3 ? (2 * Math.PI) / state.ks.spectrumPeak() : 0;

    // Heights and creases onto the sheet (periodic: row/column N repeats 0).
    const u = state.ks.u();
    const mean = state.ks.mean();
    const at = (x, y) => u[((y + N) % N) * N + ((x + N) % N)];
    const lap = state.lap;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      lap[y * N + x] = at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1) - 4 * at(x, y);
    }
    const pos = state.geo.attributes.position.array;
    const crease = state.geo.attributes.aCrease.array;
    const height = state.geo.attributes.aHeight.array;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      const x = i % N;
      const y = j % N;
      const h = (at(x, y) - mean) * m.on;
      pos[3 * k + 1] = h * LIFT;
      height[k] = h * 0.1;
      // Creases: the sharp folds between cells, where curvature is largest
      // (on a fixed scale, so the flat start doesn't sparkle with noise).
      crease[k] = Math.min(1, Math.abs(lap[y * N + x]) / 2.5);
    }
    for (const a of ['position', 'aCrease', 'aHeight']) state.geo.attributes[a].needsUpdate = true;
    state.geo.computeVertexNormals();
    state.flameMat.uniforms.uOn.value = m.on;
    state.mirrorMat.uniforms.uOn.value = m.on;
  },

  dispose(ctx, state) {
    state.glow.dispose();
    for (const x of [state.geo, state.flameMat, state.mirrorMat]) x.dispose();
  },
};
