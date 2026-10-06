import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { createKS2D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// A flat flame on a burner, wrinkling into cells. This is the job the
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
// (src/lib/kuramotoSivashinsky.js), shown on a 6 cm burner, so one unit is
// a millimetre.
//
// Two readouts, both measured live:
//   • speed. Averaging the equation over the burner, the ∇ terms vanish and
//     d⟨φ⟩/dt = −½⟨|∇φ|²⟩: a wrinkled flame advances faster than a flat one,
//     because wrinkles add area and area burns fuel. Both sides are shown;
//     checked in Node they agree to three decimals.
//   • cell size, from the peak of the curvature spectrum, next to linear
//     theory's fastest-growing wavelength 2π√2 = 8.9. They're close but not
//     equal (6–8 here): the nonlinearity keeps re-splitting the cells.
//
// Drawn: the flame as a thin glowing sheet (brighter where you look along
// it, as real thin flames are, and brightest at the creases between cells),
// over a sintered bronze plug, water-cooling coils, a stainless body.
// Loop (45 s): lit flat, wrinkles, cells, relit.

const N = 64;
const LBOX = 60;
const H = 0.1;
const PERIOD = 45;
const UNITS_PER_S = 4;
const R_BURNER = 0.03;         // m
const PLUG_Y = 0.12;
const FLAME_Y = PLUG_Y + 0.007;
const LIFT = 0.0004;           // m of flame height per unit of φ

const VERT = `
  attribute float aCrease;
  varying float vCrease;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vR;
  void main() {
    vCrease = aCrease;
    vR = length(position.xz);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  uniform float uOn;
  varying float vCrease;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vR;
  void main() {
    // A thin sheet looks brighter seen edge-on: more glowing gas along the sightline.
    float along = 1.0 / (abs(dot(normalize(vNormal), vView)) + 0.22);
    float crease = 0.35 + 1.4 * smoothstep(0.15, 1.0, vCrease);
    float rim = smoothstep(${R_BURNER.toFixed(4)}, ${(R_BURNER * 0.9).toFixed(4)}, vR);
    float I = 0.3 * along * crease * rim * uOn;
    vec3 blue = vec3(0.12, 0.28, 1.0);
    vec3 col = mix(blue, vec3(0.55, 0.7, 1.0), clamp(I - 0.8, 0.0, 1.0)) * I;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function noiseTexture(size, a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  for (let i = 0; i < size * size; i++) {
    const t = Math.random() ** 2;
    img.data[4 * i] = 255 * (ca.r + (cb.r - ca.r) * t);
    img.data[4 * i + 1] = 255 * (ca.g + (cb.g - ca.g) * t);
    img.data[4 * i + 2] = 255 * (ca.b + (cb.b - ca.b) * t);
    img.data[4 * i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default {
  name: 'Cellular Flame',
  description:
    'A flat flame on a burner wrinkles into cells: the 2D Kuramoto–Sivashinsky equation, which Sivashinsky derived ' +
    'for exactly this. Live: the wrinkled flame advancing faster, d⟨φ⟩/dt = −½⟨|∇φ|²⟩ (both sides measured), and ' +
    'the cell size against linear theory.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'combustion', 'flame', 'realistic', 'humor'],
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
      ? 'Relighting. Please stand back.'
      : m.grad2 < 0.02
        ? 'Lit. Perfectly flat. Enjoy it; it will not last.'
        : m.growing
          ? 'Wrinkling. Each wrinkle adds area, and area burns fuel.'
          : 'Cellular, and permanently undecided.';
    return (
      '\\begin{aligned}' +
      '\\varphi_t &+ \\nabla^2\\varphi + \\nabla^4\\varphi + \\tfrac12|\\nabla\\varphi|^2 = 0 \\\\' +
      `\\frac{d\\langle\\varphi\\rangle}{dt} &= ${hl(m.rate, 3)},\\quad -\\tfrac12\\langle|\\nabla\\varphi|^2\\rangle = ${hl(-0.5 * m.grad2, 3)} \\\\` +
      `\\text{cells} &= ${m.cell ? hl(m.cell, 1) : '\\text{--}'}\\,\\text{mm}\\ \\ (\\text{theory: } 2\\pi\\sqrt2 = 8.9) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.005;
    const env = createEnvironment(ctx, {
      preset: 'lab', fov: 36, exposure: 0.65, sunIntensity: 0.12, hemi: 0.03, shadowRadius: 0.4, vignette: 0.6,
    });
    ctx.scene.environmentIntensity = 0.12;
    ctx.camera.position.set(0.02, 0.165, 0.2);
    ctx.controls?.target.set(0, 0.118, 0);
    ctx.controls?.update();
    const { scene } = ctx;

    // The burner: stainless body, sintered bronze plug, copper cooling coil, gas inlet.
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.28 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xc46a3c, metalness: 1, roughness: 0.32 });
    const bronzeMap = noiseTexture(256, 0x6d5530, 0xa8874f);
    const bronze = new THREE.MeshStandardMaterial({ map: bronzeMap, metalness: 0.6, roughness: 0.85 });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    add(new THREE.CylinderGeometry(0.042, 0.046, PLUG_Y - 0.002, 64), steel, 0, (PLUG_Y - 0.002) / 2, 0);
    add(new THREE.CylinderGeometry(R_BURNER, R_BURNER, 0.004, 64), bronze, 0, PLUG_Y - 0.002, 0);
    for (let i = 0; i < 3; i++) {
      add(new THREE.TorusGeometry(0.0365, 0.0028, 12, 64).rotateX(Math.PI / 2), copper, 0, PLUG_Y - 0.004 - i * 0.0058, 0);
    }
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 16).rotateZ(Math.PI / 2), steel, 0.085, 0.03, 0);

    // The flame sheet.
    const geo = new THREE.PlaneGeometry(LBOX * 0.001, LBOX * 0.001, N, N).rotateX(-Math.PI / 2);
    geo.setAttribute('aCrease', new THREE.BufferAttribute(new Float32Array((N + 1) * (N + 1)), 1).setUsage(THREE.DynamicDrawUsage));
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const flameMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uOn: { value: 0 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const flame = new THREE.Mesh(geo, flameMat);
    flame.position.y = FLAME_Y;
    flame.frustumCulled = false;
    scene.add(flame);

    // Its blue light on the burner.
    const glow = new THREE.PointLight(0x5577ff, 0, 0.5, 2);
    glow.position.set(0, FLAME_Y + 0.01, 0);
    scene.add(glow);

    return { env, flame, geo, flameMat, glow, bronzeMap, steel, copper, bronze, key: null, ks: null, simT: 0, lastGrad: [] };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    if (state.key !== m.loop) {
      state.key = m.loop;
      state.ks = createKS2D(N, LBOX, H);
      state.ks.set(Array.from({ length: N * N }, () => (Math.random() - 0.5) * 0.02));
      state.simT = 0;
      state.lastGrad = [];
    }
    const target = Math.max(0, m.loopT - 0.5) * UNITS_PER_S;
    let rate = 0;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 6) {
      const before = state.ks.mean();
      state.ks.step();
      state.simT += H;
      rate = (state.ks.mean() - before) / H;
    }
    if (guard > 0) m.rate = rate;
    else m.rate = state.prevRate ?? 0;
    state.prevRate = m.rate;
    m.grad2 = state.ks.meanGrad2();
    state.lastGrad.push(m.grad2);
    if (state.lastGrad.length > 90) state.lastGrad.shift();
    m.growing = state.lastGrad.length < 90 || m.grad2 > 1.15 * state.lastGrad[0] ? 1 : 0;
    m.cell = m.grad2 > 0.3 ? (2 * Math.PI) / state.ks.spectrumPeak() : 0;

    // Heights and creases onto the sheet. The grid is periodic; vertex
    // column/row N repeats column/row 0.
    const u = state.ks.u();
    const mean = state.ks.mean();
    const pos = state.geo.attributes.position.array;
    const crease = state.geo.attributes.aCrease.array;
    const at = (x, y) => u[((y + N) % N) * N + ((x + N) % N)];
    // Curvature on a fixed scale (not normalised per frame, which would
    // blow the initial noise up into fake cells).
    const lap = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      lap[y * N + x] = at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1) - 4 * at(x, y);
    }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      const x = i % N;
      const y = j % N;
      pos[3 * k + 1] = (at(x, y) - mean) * LIFT * m.on;
      // Creases: the sharp folds between cells, where curvature is largest.
      crease[k] = Math.min(1, Math.abs(lap[y * N + x]) / 2.5);
    }
    state.geo.attributes.position.needsUpdate = true;
    state.geo.attributes.aCrease.needsUpdate = true;
    state.geo.computeVertexNormals();
    state.flameMat.uniforms.uOn.value = m.on;
    state.glow.intensity = 0.15 * m.on * (1 + Math.min(1, m.grad2 / 3));
  },

  dispose(ctx, state) {
    state.env.dispose();
    for (const x of [state.geo, state.flameMat, state.bronzeMap, state.steel, state.copper, state.bronze]) x.dispose();
  },
};
