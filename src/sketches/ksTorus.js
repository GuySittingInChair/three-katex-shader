import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { phaseOf, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createKS2D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// The 2D Kuramoto–Sivashinsky equation, u_t = −∇²u − ∇⁴u − ½|∇u|², on its
// natural home. A periodic rectangle (whatever flows off the right edge
// comes back on the left, and the same top to bottom) is a torus: glue the
// left edge to the right and you get a tube, glue the tube's ends and you
// get a doughnut. So the field is drawn on one.
//
// What's drawn is the curvature −∇²u, not u itself: u's energy is mostly in
// its longest waves (gentle tilts across the whole torus), while the cells
// are in its curvature. The surface bulges out over each cell and creases
// in between.
//
// The rectangle is 80 × 32 (128 × 64 grid points), close to the torus's
// own proportions (ring radius 2, tube radius 0.8: circumferences 12.6 and
// 5.0), so the cells aren't stretched much. Solved pseudo-spectrally with
// ETDRK4, h = 0.25 (src/lib/kuramotoSivashinsky.js).
//
// Readouts: the mean of u falls at exactly ½⟨|∇u|²⟩ (averaging the equation
// kills the derivatives), measured both ways; and the cell size from the
// curvature spectrum, against linear theory's 2π√2 = 8.9.
// Loop (60 s): from almost flat, cells appear, multiply and churn.

const NX = 128;
const NY = 64;
const LX = 80;
const LY = 32;
const H = 0.25;
const PERIOD = 60;
const UNITS_PER_S = 6;
const R = 2;
const r = 0.8;
const AMP = 0.02;

const LOW = new THREE.Color(0.01, 0.05, 0.12);
const MID = new THREE.Color(0.04, 0.32, 0.4);
const HIGH = new THREE.Color(0.98, 0.82, 0.55);

export default {
  name: 'Kuramoto–Sivashinsky on a Torus',
  description:
    'A periodic rectangle is a torus, so here is the 2D Kuramoto–Sivashinsky equation living on one: the surface ' +
    'bulges where u is high and dips where it is low, wrinkling into churning cells. Glossy, glowing, and solved ' +
    'with ETDRK4.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'torus', 'topology', 'glow'],
  category: 'Chaos',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return {
      loop: Math.floor(t / PERIOD),
      loopT,
      fade: smooth(loopT / 1.5) * (1 - smooth((loopT - (PERIOD - 1.5)) / 1.5)),
      grad2: 0, rate: 0, cell: 0,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT > PERIOD - 1.5
      ? 'Smoothing it out to start again.'
      : m.grad2 < 0.05
        ? 'A smooth torus, very slightly unstable.'
        : 'The square with its edges glued: what leaves one side comes back on the other.';
    return (
      '\\begin{aligned}' +
      'u_t &= -\\nabla^2 u - \\nabla^4 u - \\tfrac12|\\nabla u|^2 \\ \\ \\text{on } [0, 80) \\times [0, 32) \\text{, edges glued} \\\\' +
      `\\frac{d\\langle u\\rangle}{dt} &= ${hl(m.rate, 3)},\\quad -\\tfrac12\\langle|\\nabla u|^2\\rangle = ${hl(-0.5 * m.grad2, 3)} \\\\` +
      `\\text{cells} &= ${m.cell ? hl(m.cell, 1) : '\\text{--}'}\\ \\ (\\text{theory: } 2\\pi\\sqrt2 = 8.9) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    relief: { value: 1, min: 0, max: 2.5 },
  },

  setup(ctx) {
    const { scene, renderer } = ctx;
    scene.background = new THREE.Color(0x05060a);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.3;
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.4);
    rim.position.set(-4, 1, -3);
    scene.add(key, rim);

    const glow = createGlow(ctx, { fov: 38, strength: 0.45, threshold: 0.85, exposure: 1.0, vignette: 0.6 });
    ctx.camera.position.set(0, 6.6, 7.4);
    ctx.controls?.target.set(0, -0.2, 0);
    ctx.controls?.update();

    // A (NX+1) × (NY+1) grid wrapped round the torus; the last row and
    // column repeat the first, so the seam closes.
    const C = NX + 1;
    const Rw = NY + 1;
    const pos = new Float32Array(C * Rw * 3);
    const col = new Float32Array(C * Rw * 3);
    const idx = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * C + i;
      idx.push(a, a + 1, a + C, a + 1, a + C + 1, a + C);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.15,
    });
    const torus = new THREE.Mesh(geo, mat);
    torus.frustumCulled = false;
    scene.add(torus);

    // Precomputed directions round the torus.
    const base = new Float32Array(C * Rw * 3);
    const normal = new Float32Array(C * Rw * 3);
    for (let j = 0; j < Rw; j++) for (let i = 0; i < C; i++) {
      const th = (i / NX) * Math.PI * 2;
      const ph = (j / NY) * Math.PI * 2;
      const k = 3 * (j * C + i);
      base.set([(R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)], k);
      normal.set([Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)], k);
    }
    return { glow, pmrem, envTarget, torus, geo, mat, base, normal, key: null, ks: null, simT: 0, c: new THREE.Color() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    if (state.key !== m.loop) {
      state.key = m.loop;
      state.ks = createKS2D([NX, NY], [LX, LY], H);
      state.ks.set(Array.from({ length: NX * NY }, () => (Math.random() - 0.5) * 0.02));
      state.simT = 0;
    }
    const target = m.loopT * UNITS_PER_S;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 3) {
      const before = state.ks.mean();
      state.ks.step();
      state.simT += H;
      state.rate = (state.ks.mean() - before) / H;
    }
    m.rate = state.rate ?? 0;
    m.grad2 = state.ks.meanGrad2();
    m.cell = m.grad2 > 0.3 ? (2 * Math.PI) / state.ks.spectrumPeak() : 0;

    // The curvature −∇²u on the grid (periodic), which shows the cells.
    const u = state.ks.u();
    const at = (x, y) => u[((y + NY) % NY) * NX + ((x + NX) % NX)];
    const dx2 = (LX / NX) ** 2;
    const dy2 = (LY / NY) ** 2;
    const curv = state.curv || (state.curv = new Float32Array(NX * NY));
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const c0 = 2 * at(x, y);
      curv[y * NX + x] = -((at(x + 1, y) + at(x - 1, y) - c0) / dx2 + (at(x, y + 1) + at(x, y - 1) - c0) / dy2);
    }
    // Soften it a little (a [1 2 1]/4 blur each way): on the inside of the
    // tube the grid spacing is about the bump height, and sharp creases
    // would fold the surface through itself.
    const tmp = state.tmp || (state.tmp = new Float32Array(NX * NY));
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      tmp[y * NX + x] = 0.25 * curv[y * NX + ((x + NX - 1) % NX)] + 0.5 * curv[y * NX + x] + 0.25 * curv[y * NX + ((x + 1) % NX)];
    }
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      curv[y * NX + x] = 0.25 * tmp[((y + NY - 1) % NY) * NX + x] + 0.5 * tmp[y * NX + x] + 0.25 * tmp[((y + 1) % NY) * NX + x];
    }
    const C = NX + 1;
    const pos = state.geo.attributes.position.array;
    const col = state.geo.attributes.color.array;
    const { base, normal, c } = state;
    const amp = AMP * ctx.params.relief * m.fade;
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const v = curv[(j % NY) * NX + (i % NX)];
      const k = 3 * (j * C + i);
      // Soft-clamped, so the sharpest creases don't spear out of the surface.
      const d = 3 * Math.tanh(v / 3) * amp;
      pos[k] = base[k] + normal[k] * d;
      pos[k + 1] = base[k + 1] + normal[k + 1] * d;
      pos[k + 2] = base[k + 2] + normal[k + 2] * d;
      const t = 0.5 + 0.5 * Math.tanh((v * m.fade) / 2.0);
      if (t < 0.5) c.copy(LOW).lerp(MID, t * 2);
      else c.copy(MID).lerp(HIGH, (t - 0.5) * 2);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
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
    state.geo.dispose();
    state.mat.dispose();
  },
};
