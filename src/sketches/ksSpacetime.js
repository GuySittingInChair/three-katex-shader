import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { createFatLines } from '../lib/fatLines.js';
import { createKS1D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// The Kuramoto–Sivashinsky equation in one dimension,
//
//     u_t = −u u_x − u_xx − u_xxxx,     periodic on a box of length L,
//
// drawn as a landscape of its own history: across is x, the newest moment
// is at the front, the past recedes, height is u. Solved pseudo-spectrally
// with ETDRK4 (src/lib/kuramotoSivashinsky.js), N = 128, h = 0.1.
//
// A wave e^{ikx} grows at rate k² − k⁴, so only 0 < k < 1 is unstable; in a
// box of length L the allowed waves are k = 2πn/L, and the number of
// unstable ones is ⌊L/2π⌋. That one number organises everything, and the
// loop walks L through it, from a fresh small disturbance each time:
//
//     L = 5     0 unstable modes: it dies away
//     L = 12    1: a single cell that travels sideways at constant shape
//     L = 16    2: steady cells
//     L = 22    3: already chaotic (the famous small chaotic box)
//     L = 100   15: spatiotemporal chaos, never repeating, never blowing up
//
// Checked in Node from the same start: energy ⟨u²⟩ at L = 12 constant to
// 10⁻¹³ while the profile moves (a travelling wave); at 16 constant and
// motionless; at 22 and 100 fluctuating by 28% and 12%. The readout's
// "regime" is measured the same way, live, not looked up. The mean of u is
// conserved (the equation is a derivative), shown to stay at 0.

const N = 128;
const H = 0.1;
const BOXES = [5, 12, 16, 22, 100];
const SEG = 15;                       // seconds per box
const PERIOD = SEG * BOXES.length;
const UNITS_PER_S = 10;               // KS time per second on screen
const ROW_EVERY = 0.5;                // KS time between history rows
const ROWS = 200;
const WIDTH = 8;
const DEPTH = 10;
const HEIGHT = 0.3;

// A tiny number as LaTeX: 3 × 10^{-17}, or 0.
const sci = (x) => {
  if (!x) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toFixed(0)} \\times 10^{${e}}`;
};

function colour(u, out) {
  // Low-key diverging map: deep blue < 0 < warm amber.
  const t = Math.tanh(u / 1.8);
  const mid = [0.42, 0.42, 0.45];
  const lo = [0.05, 0.16, 0.42];
  const hi = [0.85, 0.42, 0.08];
  const end = t < 0 ? lo : hi;
  const a = Math.abs(t);
  return out.setRGB(mid[0] + (end[0] - mid[0]) * a, mid[1] + (end[1] - mid[1]) * a, mid[2] + (end[2] - mid[2]) * a);
}

export default {
  name: 'Kuramoto–Sivashinsky Spacetime',
  description:
    'The 1D Kuramoto–Sivashinsky equation sculpted as a landscape of its history. As the box grows, the number ' +
    'of unstable modes ⌊L/2π⌋ goes 0, 1, 2, 3, 15, and the behaviour goes: decay, a travelling cell, steady ' +
    'cells, chaos, full spatiotemporal chaos. Solved with ETDRK4; the regime is measured live.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'spectral methods', 'spacetime', 'realistic', 'humor'],
  category: 'Chaos',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    const box = Math.min(BOXES.length - 1, Math.floor(loopT / SEG));
    const local = loopT - box * SEG;
    return {
      loop: Math.floor(t / PERIOD),
      box,
      L: BOXES[box],
      local,
      modes: Math.floor(BOXES[box] / (2 * Math.PI)),
      // Filled in by update().
      energy: 0, mean: 0, regime: 'settling',
    };
  },

  latex: (params, hl, m) => {
    const line = {
      settling: `New box, L = ${m.L}. Settling in.`,
      decayed: 'No unstable modes: everything dies away. Peaceful. Boring.',
      steady: 'Steady cells, holding perfectly still. That takes effort.',
      travelling: 'One cell, travelling sideways forever. It has places to be.',
      chaotic: m.L < 40 ? 'L = 22: a small box, and already chaos.' : 'Spatiotemporal chaos: never repeats, never blows up.',
    }[m.regime];
    const kList = Array.from({ length: Math.min(m.modes, 4) }, (_, i) => ((2 * Math.PI * (i + 1)) / m.L).toFixed(2)).join(', ');
    return (
      '\\begin{aligned}' +
      'u_t &= -u u_x - u_{xx} - u_{xxxx},\\quad e^{ikx} \\text{ grows at } k^2 - k^4 \\\\' +
      `L &= ${m.L},\\quad \\lfloor L/2\\pi \\rfloor = ${hl(m.modes, 0)}\\ \\text{unstable}${m.modes ? `\\ (k = ${kList}${m.modes > 4 ? ', \\dots' : ''})` : ''} \\\\` +
      `\\langle u^2 \\rangle &= ${hl(m.energy, 3)},\\quad \\textstyle\\int u\\,dx = ${sci(m.mean)},\\quad \\text{regime (measured): } \\text{${m.regime}} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const env = createEnvironment(ctx, { preset: 'studio', fov: 38, cycSize: 18, cycBack: 7, shadowRadius: 9, exposure: 0.85 });
    ctx.camera.position.set(-5.2, 5.4, 9.5);
    ctx.controls?.target.set(0, 0.2, -3.5);
    ctx.controls?.update();

    const C = N + 1;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(C * ROWS * 3);
    const col = new Float32Array(C * ROWS * 3);
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < C - 1; c++) {
      const a = r * C + c;
      idx.push(a, a + C, a + 1, a + 1, a + C, a + C + 1);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide }));
    land.castShadow = true;
    land.receiveShadow = true;
    land.frustumCulled = false;
    land.position.y = 0.9;
    ctx.scene.add(land);

    const front = createFatLines({ maxSegments: N, width: 3 });
    ctx.scene.add(front.object);

    return {
      env, land, geo, pos, col, front,
      history: [], key: null, ks: null, simT: 0, rowT: 0, energies: [], lastRow: null, moves: [],
      c: new THREE.Color(), a: new THREE.Vector3(), b: new THREE.Vector3(),
    };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    const key = `${m.loop}:${m.box}`;
    if (state.key !== key) {
      // A new box: a fresh solver and a small, fixed disturbance.
      state.key = key;
      state.ks = createKS1D(N, m.L, H);
      state.ks.set(Array.from({ length: N }, (_, i) => {
        const x = (m.L * i) / N;
        return 0.1 * Math.cos((2 * Math.PI * x) / m.L) + 0.05 * Math.sin((4 * Math.PI * x) / m.L + 1) + 0.02 * Math.cos((6 * Math.PI * x) / m.L + 2);
      }));
      state.simT = 0;
      state.rowT = 0;
      state.energies = [];
      state.moves = [];
      state.lastRow = null;
    }
    // Advance to where the clock says, a bounded amount per frame.
    const target = m.local * UNITS_PER_S;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 40) {
      state.ks.step();
      state.simT += H;
      if (state.simT >= state.rowT + ROW_EVERY) {
        state.rowT += ROW_EVERY;
        const u = Float64Array.from(state.ks.u());
        state.history.unshift(u);
        if (state.history.length > ROWS) state.history.pop();
        const e = u.reduce((s, v) => s + v * v, 0) / N;
        state.energies.push(e);
        if (state.lastRow) state.moves.push(Math.sqrt(u.reduce((s, v, i) => s + (v - state.lastRow[i]) ** 2, 0) / N));
        state.lastRow = u;
        if (state.energies.length > 40) state.energies.shift();
        if (state.moves.length > 40) state.moves.shift();
      }
    }

    // Measured regime, from the last 40 rows (20 time units).
    const u = state.ks.u();
    m.energy = u.reduce((s, v) => s + v * v, 0) / N;
    m.mean = u.reduce((s, v) => s + v, 0) / N || 0;
    if (state.simT < 70 || state.energies.length < 40) m.regime = 'settling';
    else {
      const es = state.energies;
      const mean = es.reduce((a, b) => a + b, 0) / es.length;
      const sd = Math.sqrt(es.reduce((a, b) => a + (b - mean) ** 2, 0) / es.length);
      const move = state.moves.reduce((a, b) => a + b, 0) / state.moves.length;
      m.regime = mean < 1e-6 ? 'decayed' : sd / mean > 0.02 ? 'chaotic' : move > 0.01 ? 'travelling' : 'steady';
    }

    // The landscape: newest row at the front (z = 0), older rows behind.
    const C = N + 1;
    const { pos, col, c } = state;
    for (let r = 0; r < ROWS; r++) {
      const row = state.history[r];
      const z = -(r / (ROWS - 1)) * DEPTH;
      for (let j = 0; j < C; j++) {
        const v = row ? row[j % N] : 0;
        const k = r * C + j;
        pos[3 * k] = (j / N - 0.5) * WIDTH;
        pos[3 * k + 1] = HEIGHT * v;
        pos[3 * k + 2] = z;
        colour(v, c);
        const fade = row ? 1 : 0.4;
        col[3 * k] = c.r * fade;
        col[3 * k + 1] = c.g * fade;
        col[3 * k + 2] = c.b * fade;
      }
    }
    state.geo.attributes.position.needsUpdate = true;
    state.geo.attributes.color.needsUpdate = true;
    state.geo.computeVertexNormals();

    // The present moment, as a bright line along the front edge.
    const fl = state.front;
    fl.setResolution(ctx.size.width, ctx.size.height);
    fl.reset();
    for (let j = 0; j < N; j++) {
      state.a.set((j / N - 0.5) * WIDTH, 0.9 + HEIGHT * u[j] + 0.02, 0.01);
      state.b.set(((j + 1) / N - 0.5) * WIDTH, 0.9 + HEIGHT * u[(j + 1) % N] + 0.02, 0.01);
      fl.push(state.a, state.b, c.setRGB(1.6, 1.4, 1.0));
    }
    fl.commit();
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.front.dispose();
  },
};
