import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption } from '../lib/bit.js';

// An electron, as a wavepacket, meets a wall it doesn't have the energy to
// climb, and some of it comes out the other side anyway. The time-dependent
// Schrödinger equation, in atomic units (ħ = mₑ = 1, length 0.0529 nm, energy
// 27.2 eV):
//
//     i ∂ψ/∂t = −½ ∂²ψ/∂x² + V(x) ψ,     V = V₀ on 0 ≤ x + a/2 < a, else 0
//
// solved by the split-step Fourier method: half a step of V (a phase), a full
// step of −½∂² (a phase in momentum space, via FFT), half a step of V. Each
// step is exactly unitary, so the total probability stays 1 (shown).
//
// The packet: Gaussian, width σ = 8, momentum k₀ = 1, so E = k₀²/2 = 0.5
// (13.6 eV) against V₀ = 0.6 (16.3 eV). Classically it bounces, every time.
// Quantum mechanically a plane wave of energy E gets through with
//
//     T = [1 + V₀² sinh²(κa) / (4E(V₀ − E))]⁻¹,    κ = √(2(V₀ − E))
//
// and a packet with the average of T over its spread of momenta, ⟨T⟩. Each
// loop the wall gets thicker, a = 1, 2, 3, 4 (0.05 to 0.21 nm), and the
// simulation's transmitted probability is shown next to ⟨T⟩. Checked in Node
// on this grid (N = 2048, dx = 0.25, dt = 0.05): 0.718 vs 0.721, 0.350 vs
// 0.352, 0.159 vs 0.161, 0.077 vs 0.078. (The barrier has to cover exactly
// a/dx grid cells, or the simulated wall is thinner than the label says.)
//
// The punchline readout is the same physics for a person: the chance of
// walking through a 10 cm wall, at 70 kg and 1 J short of what it would take,
// is e^(−2κd) with κ = √(2mΔE)/ħ, which is 10^(−9.7 × 10³³).
//
// Drawn: ψ as a curve in 3D (real part up, imaginary part sideways, colour
// = phase), |ψ|² as a translucent curtain, and the wall as a pane of glass.

const N = 2048;
const LX = 512;
const DX = LX / N;
const DT = 0.05;
const K0 = 1;
const SIGMA = 8;
const X0 = -45;
const V0 = 0.6;
const E = (K0 * K0) / 2;
const WIDTHS = [1, 2, 3, 4];
const RUN_T = 100;               // atomic time units per run
const RUN_S = 11;                // seconds per run on screen
const GAP_S = 1.5;               // pause between runs
const PERIOD = WIDTHS.length * (RUN_S + GAP_S);
const VIEW = 60;                 // show −60 … 60
const SCALE = 0.1;               // world units per bohr
const Y0 = 1.5;
const AMP = 4;                   // world units per unit of ψ
const CURTAIN = 22;              // world units per unit of |ψ|²
const BOHR_NM = 0.0529177;

// Plane-wave transmission, and its average over the packet's momenta.
function planeT(k, a) {
  const e = (k * k) / 2;
  if (Math.abs(e - V0) < 1e-12) return 1 / (1 + (V0 * a * a) / 2);
  if (e < V0) {
    const q = Math.sqrt(2 * (V0 - e));
    return 1 / (1 + (V0 * V0 * Math.sinh(q * a) ** 2) / (4 * e * (V0 - e)));
  }
  const q = Math.sqrt(2 * (e - V0));
  return 1 / (1 + (V0 * V0 * Math.sin(q * a) ** 2) / (4 * e * (e - V0)));
}
function packetT(a) {
  let s = 0;
  let w = 0;
  for (let k = K0 - 6 / SIGMA; k <= K0 + 6 / SIGMA; k += 2e-4) {
    const p = Math.exp(-2 * SIGMA * SIGMA * (k - K0) ** 2);
    s += p * planeT(k, a);
    w += p;
  }
  return s / w;
}
const THEORY = WIDTHS.map(packetT);

// You, through a wall: log₁₀ of e^(−2κd).
const HBAR = 1.054571817e-34;
const YOU = { m: 70, d: 0.1, dE: 1 };
const LOG10_YOU = (-2 * YOU.d * Math.sqrt(2 * YOU.m * YOU.dE)) / HBAR / Math.LN10;

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function createSim() {
  const x = Float64Array.from({ length: N }, (_, i) => -LX / 2 + i * DX);
  const kin = Float64Array.from({ length: N }, (_, i) => {
    const k = ((2 * Math.PI) / LX) * (i < N / 2 ? i : i - N);
    return (-k * k * DT) / 2;
  });
  const kc = Float64Array.from(kin, Math.cos);
  const ks = Float64Array.from(kin, Math.sin);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const vc = new Float64Array(N);
  const vs = new Float64Array(N);
  const sim = { x, re, im, a: 0, t: 0, run: -1 };
  const rotate = (c, s) => {
    for (let i = 0; i < N; i++) {
      const a = re[i];
      const b = im[i];
      re[i] = a * c[i] - b * s[i];
      im[i] = a * s[i] + b * c[i];
    }
  };
  sim.reset = (run) => {
    sim.run = run;
    sim.a = WIDTHS[run];
    sim.t = 0;
    let norm = 0;
    for (let i = 0; i < N; i++) {
      // The wall covers exactly a/dx cells.
      const inWall = x[i] >= -sim.a / 2 - 1e-9 && x[i] < sim.a / 2 - 1e-9;
      vc[i] = Math.cos((-(inWall ? V0 : 0) * DT) / 2);
      vs[i] = Math.sin((-(inWall ? V0 : 0) * DT) / 2);
      const g = Math.exp(-((x[i] - X0) ** 2) / (4 * SIGMA * SIGMA));
      re[i] = g * Math.cos(K0 * x[i]);
      im[i] = g * Math.sin(K0 * x[i]);
      norm += g * g * DX;
    }
    const s = 1 / Math.sqrt(norm);
    for (let i = 0; i < N; i++) { re[i] *= s; im[i] *= s; }
  };
  sim.stepTo = (run, t) => {
    if (run !== sim.run || t < sim.t - DT) sim.reset(run);
    let guard = 0;
    while (sim.t + DT / 2 < t && guard++ < 400) {
      rotate(vc, vs);
      fft(re, im, false);
      rotate(kc, ks);
      fft(re, im, true);
      rotate(vc, vs);
      sim.t += DT;
    }
  };
  sim.probabilities = () => {
    let left = 0;
    let inside = 0;
    let right = 0;
    for (let i = 0; i < N; i++) {
      const p = (re[i] * re[i] + im[i] * im[i]) * DX;
      if (x[i] < -sim.a / 2 - 1e-9) left += p;
      else if (x[i] < sim.a / 2 - 1e-9) inside += p;
      else right += p;
    }
    return { left, inside, right, total: left + inside + right };
  };
  return sim;
}

const results = WIDTHS.map(() => null);

export default {
  name: 'Quantum Tunnelling',
  description:
    'An electron wavepacket meets a wall it has too little energy to climb, and part of it comes out the other ' +
    'side. The Schrödinger equation, solved exactly on a grid; each loop the wall gets thicker, and the ' +
    'transmitted probability is checked live against the exact formula. Also: your odds of doing the same.',
  tags: ['quantum mechanics', 'schrodinger equation', 'tunnelling', 'fft', 'wavefunction', 'realistic', 'humor'],
  category: 'Physics',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    const run = Math.min(WIDTHS.length - 1, Math.floor(loopT / (RUN_S + GAP_S)));
    const local = loopT - run * (RUN_S + GAP_S);
    return {
      run,
      a: WIDTHS[run],
      local,
      pausing: local >= RUN_S ? 1 : 0,
      simT: (Math.min(local, RUN_S) / RUN_S) * RUN_T,
      theory: THEORY[run],
      // Filled in by update() from the simulation.
      left: 1, inside: 0, right: 0, total: 1,
    };
  },

  latex: (params, hl, m) => {
    const nm = (m.a * BOHR_NM).toFixed(2);
    const line = m.pausing
      ? m.run === WIDTHS.length - 1
        ? 'Back to the thin wall.'
        : 'Next wall: 0.05 nm thicker.'
      : m.inside > 1e-3 || (m.right > 1e-3 && m.simT < 70)
        ? 'It is trying the wall.'
        : m.right > 1e-3
          ? `${Math.round(m.right * 100)}% of it went through. It did not climb anything.`
          : 'An electron at 13.6 eV walks toward a 16.3 eV wall. Classically, this is where the story ends.';
    const done = results.map((r, i) => (r === null ? null : `${WIDTHS[i]}{:}\\ ${r.toFixed(3)}`)).filter(Boolean).join(',\\ ');
    return (
      '\\begin{aligned}' +
      'i\\,\\partial_t\\psi &= -\\tfrac12\\partial_x^2\\psi + V\\psi,\\quad E = 0.5 < V_0 = 0.6\\ \\ (13.6 < 16.3\\ \\text{eV}) \\\\' +
      `a &= ${m.a}\\ (${nm}\\,\\text{nm}),\\quad P_{\\text{through}} = ${hl(m.right, 3)},\\quad \\langle T\\rangle = ${hl(m.theory, 3)},\\quad \\textstyle\\int|\\psi|^2 = ${m.total.toFixed(4)} \\\\` +
      `T &= \\Big[1 + \\tfrac{V_0^2 \\sinh^2 \\kappa a}{4E(V_0 - E)}\\Big]^{-1}${done ? `,\\quad \\text{so far: } ${done}` : ''} \\\\` +
      `\\text{you, through a wall} &\\approx e^{-2\\kappa d} = 10^{${(LOG10_YOU / 1e33).toFixed(1)} \\times 10^{33}}\\ \\ \\textcolor{#9aa3b2}{(70\\,\\text{kg},\\ 10\\,\\text{cm},\\ 1\\,\\text{J short})} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const env = createEnvironment(ctx, { preset: 'studio', fov: 40, cycSize: 16, cycBack: 4, shadowRadius: 8, vignette: 0.5 });
    ctx.camera.position.set(-1.5, 3.6, 12.5);
    ctx.controls?.target.set(0.6, 1.2, 0);
    ctx.controls?.update();
    const { scene } = ctx;
    results.fill(null);

    // The wall: a pane of glass, as thick as a (to scale), taller than the wave.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xbfe0ff, roughness: 0.05, transmission: 0.92, thickness: 0.3, ior: 1.45, transparent: true,
    });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 3.4, 2.4), glass);
    wall.position.y = 1.7;
    wall.castShadow = true;
    scene.add(wall);

    // The x-axis: a thin dark rod the wave winds around.
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 2 * VIEW * SCALE, 8).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x555a66, roughness: 0.5 })
    );
    axis.position.y = Y0;
    scene.add(axis);

    // ψ itself, and the |ψ|² curtain under it.
    const M = Math.round((2 * VIEW) / DX);
    const curve = createFatLines({ maxSegments: M, width: 2.6 });
    scene.add(curve.object);
    const curtainPos = new Float32Array((M + 1) * 2 * 3);
    const curtainCol = new Float32Array((M + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i < M; i++) {
      const a = 2 * i;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const curtainGeo = new THREE.BufferGeometry();
    curtainGeo.setAttribute('position', new THREE.BufferAttribute(curtainPos, 3).setUsage(THREE.DynamicDrawUsage));
    curtainGeo.setAttribute('color', new THREE.BufferAttribute(curtainCol, 3).setUsage(THREE.DynamicDrawUsage));
    curtainGeo.setIndex(idx);
    const curtain = new THREE.Mesh(
      curtainGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
    );
    curtain.castShadow = true;
    curtain.frustumCulled = false;
    scene.add(curtain);

    return {
      env, sim: createSim(), wall, curve, curtain, curtainGeo, curtainPos, curtainCol, M,
      i0: Math.round((LX / 2 - VIEW) / DX), lastRun: -1,
      p: new THREE.Vector3(), q: new THREE.Vector3(), c: new THREE.Color(), c2: new THREE.Color(),
    };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    const { sim, p, q, c, c2 } = state;
    sim.stepTo(m.run, m.simT);
    const pr = sim.probabilities();
    Object.assign(m, pr);
    if (m.pausing) results[m.run] = pr.right;

    state.wall.scale.x = m.a * SCALE;

    const { re, im, x } = sim;
    const color = (i, out) => {
      const phase = Math.atan2(im[i], re[i]) / (2 * Math.PI) + 0.5;
      return out.setHSL(phase, 0.85, 0.55);
    };
    const curve = state.curve;
    curve.setResolution(ctx.size.width, ctx.size.height);
    curve.reset();
    for (let j = 0; j <= state.M; j++) {
      const i = state.i0 + j;
      const X = x[i] * SCALE;
      const amp = Math.hypot(re[i], im[i]);
      color(i, c);
      // Faint where there's nothing, so the empty axis doesn't glow.
      c.multiplyScalar(Math.min(1.4, 0.15 + amp * 9));
      state.curtainPos.set([X, Y0, 0, X, Y0 + amp * amp * CURTAIN, 0], 6 * j);
      state.curtainCol.set([c.r, c.g, c.b, c.r, c.g, c.b], 6 * j);
      if (j > 0) {
        const k = i - 1;
        p.set(x[k] * SCALE, Y0 + re[k] * AMP, im[k] * AMP);
        q.set(X, Y0 + re[i] * AMP, im[i] * AMP);
        color(k, c2).multiplyScalar(Math.min(1.4, 0.15 + Math.hypot(re[k], im[k]) * 9));
        curve.push(p, q, c2, c);
      }
    }
    curve.commit();
    state.curtainGeo.attributes.position.needsUpdate = true;
    state.curtainGeo.attributes.color.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.curve.dispose();
  },
};
