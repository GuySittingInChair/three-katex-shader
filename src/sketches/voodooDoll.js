import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGlow } from '../lib/glow.js';
import { caption, mood, inUnits, beat } from '../lib/bit.js';

// A burlap voodoo doll you can stick pins in. Everything the doll does is
// computed, in SI units, on a 2 mm grid over its silhouette (30 cm tall).
//
// Shape. A stuffed fabric tube is round, whatever its width. Solve
// ∇²φ = −1 inside the outline (φ = 0 on the seam); for a long tube of
// half-width a that gives φ = (a² − x²)/2, so h = √(2φ) = √(a² − x²) is
// exactly a circle. The doll is h = 0.6 √(2φ) (a little flattened), front at
// +h and back at −h, sewn together along the outline.
//
// The skin. Each face is a membrane under tension T resting on stuffing
// (a Winkler foundation, stiffness k per area), displaced inward by w:
//
//     ρ w_tt = T ∇²w − k w − γ w_t + f
//
// T = 40 N/m, k = 2.2 × 10⁵ N/m³ (so a dent spreads over ℓ = √(T/k) = 13.5 mm),
// ρ = 4 kg/m² (fabric plus the stuffing that moves with it), γ = 470 N·s/m³
// (a quarter of critical). Explicit, 0.4 ms steps (waves travel at
// √(T/ρ) = 3.2 m/s, so a ring from a puncture crosses the doll in a tenth of
// a second; the speed slider slows time down to watch it).
//
// The pin (Okamura, Simone & O'Leary, IEEE TBME 2004: a needle's force is
// stiffness until puncture, then friction + cutting):
//   1. Press: the tip pushes a dent of depth δ. For a flat indenter of
//      radius a on this membrane the exact force is
//          F = πa²k δ + 2πT δ (a/ℓ) K₁(a/ℓ) / K₀(a/ℓ)
//      (outside the tip w = δ K₀(r/ℓ)/K₀(a/ℓ), modified Bessel functions).
//      The simulation measures F from the grid (F = Σ (k w − T∇²w + γ w_t) dA
//      under the tip) and shows it beside the formula. On a 2 mm grid the
//      13-node tip of radius 4 mm acts like a disk of a = 3.535 mm (solved
//      offline: an infinite grid, SOR to convergence, matched to the
//      formula); near a seam the boundary stiffens it, which shows.
//   2. Puncture at F_p ≈ 2.2 N (burlap varies, ±15%). The dent is released
//      and rings out as a wave.
//   3. Insertion: friction grows with depth, f = μ s (μ = 30 N/m), and drags
//      the fabric in after it (it tents).
// Every force on the doll also turns it: τ = r × F into a damped torsional
// spring (I = 3 × 10⁻³ kg·m², κ = 1.5 N·m/rad, ζ = 0.12).
//
// The pain is a heat equation on the doll, fed by the needle's power:
//     u_t = D ∇²u − u/τ + η F·v      (D = 1.2 cm²/s, τ = 4 s, η = 1 ow/mJ)
// plus a steady ache of 2 ow/s per pin left in. That's the joke, and only
// the noun: the equation is an ordinary diffusion with decay.
//
// Click (or touch, in hand mode) and hold to push a pin in; release early
// and it backs out unpunctured. Idle for a few seconds and the doll pokes
// itself; after ten pins they all pop out and it starts again.

// Grid over the silhouette, metres.
const DX = 0.002;
const X0 = -0.135;
const Y0 = -0.172;
const NX = 136;
const NY = 166;
const W = (NX - 1) * DX;
const HT = (NY - 1) * DX;
const PUFF = 0.6;

// Membrane.
const T_TEN = 40;
const K_FND = 2.2e5;
const ELL = Math.sqrt(T_TEN / K_FND);
const RHO = 4;
const GAMMA = 470;
const DT = 4e-4;

// Needle.
const TIP_R = 0.004;
const A_EFF = 0.003535;
const FP = 2.2;
const MU = 30;
const V_APPROACH = 0.25;
const V_PRESS = 0.06;
const V_INSERT = 0.12;
const S_MIN = 0.012;
const S_MAX = 0.03;
const PIN_LEN = 0.042;

// Rocking.
const INERTIA = 3e-3;
const KAPPA = 1.5;
const ZETA = 0.12;

// Pain.
const DIFF = 1.2e-4;
const TAU = 4;
const ETA = 1000;                        // ow per joule (1 ow/mJ)
const ACHE = 2;                          // ow/s per pin
const PAIN_SIGMA = 0.005;
const PAIN_SCALE = 2.5e4;                // ow/m² that glows at half strength

const MAX_PINS = 14;
const AUTO_PINS = 10;
const IDLE = 4;
const SCALE = 10;                        // scene units per metre

const HEAD_COLORS = [0xff3355, 0xffc040, 0x40e0ff, 0xd060ff, 0x60ff90, 0xff7a30];
const AUTO_TARGETS = [
  [0.022, 0.024], [-0.012, 0.112], [-0.02, -0.022], [0.084, 0.014], [-0.03, -0.1],
  [0.012, 0.05], [-0.086, 0.01], [0.034, -0.11], [0.02, 0.09], [-0.004, -0.045],
];

// ---- shape ----------------------------------------------------------------

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const capsule = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax, py = y - ay, qx = bx - ax, qy = by - ay;
  const t = Math.max(0, Math.min(1, (px * qx + py * qy) / (qx * qx + qy * qy)));
  return Math.hypot(px - qx * t, py - qy * t) - r;
};
const ellipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

function sdf(x, y) {
  const ax = Math.abs(x);
  let d = ellipse(x, y, 0, 0.098, 0.047, 0.045);
  d = smin(d, ellipse(x, y, 0, 0, 0.052, 0.068), 0.02);
  d = smin(d, capsule(ax, y, 0.035, 0.035, 0.105, 0.005, 0.024), 0.02);
  d = smin(d, capsule(ax, y, 0.026, -0.045, 0.038, -0.135, 0.027), 0.016);
  return d;
}

// ---- modified Bessel functions K₀, K₁ (Abramowitz & Stegun 9.8.1–9.8.8) ----

function besselK(x) {
  let k0, k1;
  if (x <= 2) {
    const t = (x / 3.75) ** 2;
    const i0 = 1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    const i1 = x * (0.5 + t * (0.87890594 + t * (0.51498869 + t * (0.15084934 + t * (0.02658733 + t * (0.00301532 + t * 0.00032411))))));
    const u = (x * x) / 4;
    k0 = -Math.log(x / 2) * i0 + (-0.57721566 + u * (0.4227842 + u * (0.23069756 + u * (0.0348859 + u * (0.00262698 + u * (0.0001075 + u * 0.0000074))))));
    k1 = Math.log(x / 2) * i1 + (1 / x) * (1 + u * (0.15443144 + u * (-0.67278579 + u * (-0.18156897 + u * (-0.01919402 + u * (-0.00110404 + u * -0.00004686))))));
  } else {
    const u = 2 / x;
    const e = Math.exp(-x) / Math.sqrt(x);
    k0 = e * (1.25331414 + u * (-0.07832358 + u * (0.02189568 + u * (-0.01062446 + u * (0.00587872 + u * (-0.0025154 + u * 0.00053208))))));
    k1 = e * (1.25331414 + u * (0.23498619 + u * (-0.0365562 + u * (0.01504268 + u * (-0.00780353 + u * (0.00325614 + u * -0.00068245))))));
  }
  return [k0, k1];
}
const [K0A, K1A] = besselK(A_EFF / ELL);
// Force per metre of dent for the flat tip (see top).
const STIFF = Math.PI * A_EFF * A_EFF * K_FND + 2 * Math.PI * T_TEN * (A_EFF / ELL) * (K1A / K0A);

// ---- textures ---------------------------------------------------------------

function burlapCanvas(front) {
  const cw = 1024;
  const ch = Math.round((cw * HT) / W);
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d');
  const px = cw / W;                       // pixels per metre
  const toPx = (x, y) => [(x - X0) * px, ch - (y - Y0) * px];
  g.fillStyle = '#24170d';
  g.fillRect(0, 0, cw, ch);
  // Plain weave: warp and weft threads every 3 mm, each a little uneven in
  // shade and width, passing over and under alternately.
  const pitch = 0.003 * px;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = Math.ceil(cw / pitch) + 1;
  const rows = Math.ceil(ch / pitch) + 1;
  const shadeV = Array.from({ length: cols }, () => 0.75 + 0.35 * rnd());
  const shadeH = Array.from({ length: rows }, () => 0.75 + 0.35 * rnd());
  const thread = (x, y, along, l) => {
    // One thread crossing: a rounded bar, lighter on its crown.
    const len = pitch * 1.05;
    const wid = pitch * (0.62 + 0.12 * rnd());
    const [bw, bh] = along === 'v' ? [wid, len] : [len, wid];
    const grad = along === 'v'
      ? g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0)
      : g.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
    const c = (k) => `rgb(${Math.round(176 * l * k)},${Math.round(134 * l * k)},${Math.round(84 * l * k)})`;
    grad.addColorStop(0, c(0.55));
    grad.addColorStop(0.5, c(1.05));
    grad.addColorStop(1, c(0.55));
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(x - bw / 2, y - bh / 2, bw, bh, Math.min(bw, bh) * 0.45);
    g.fill();
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * pitch;
    const y = (j + 0.5) * pitch;
    // Draw the under-thread first, then the over-thread on top.
    if ((i + j) % 2 === 0) {
      thread(x, y, 'h', shadeH[j]);
      thread(x, y, 'v', shadeV[i]);
    } else {
      thread(x, y, 'v', shadeV[i]);
      thread(x, y, 'h', shadeH[j]);
    }
  }
  if (!front) return cv;

  // Felt heart, with a running stitch round it.
  const heart = (s) => {
    g.beginPath();
    for (let k = 0; k <= 80; k++) {
      const t = (k / 80) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const [qx, qy] = toPx(0.022 + hx * s, 0.026 + hy * s);
      if (k) g.lineTo(qx, qy); else g.moveTo(qx, qy);
    }
    g.closePath();
  };
  heart(0.0011);
  g.fillStyle = '#a3121f';
  g.fill();
  heart(0.00088);
  g.setLineDash([10, 8]);
  g.lineWidth = 3;
  g.strokeStyle = '#f2d9b0';
  g.stroke();
  g.setLineDash([]);

  // One stitched X eye; the other eye is a button (3D).
  g.strokeStyle = '#1b0f0a';
  g.lineCap = 'round';
  g.lineWidth = 7;
  const [ex, ey] = toPx(0.017, 0.106);
  const e = 0.0075 * px;
  g.beginPath();
  g.moveTo(ex - e, ey - e); g.lineTo(ex + e, ey + e);
  g.moveTo(ex + e, ey - e); g.lineTo(ex - e, ey + e);
  g.stroke();
  // Stitched mouth: a line with cross stitches.
  g.lineWidth = 5;
  const [m0x, my] = toPx(-0.02, 0.08);
  const [m1x] = toPx(0.02, 0.08);
  g.beginPath();
  g.moveTo(m0x, my); g.quadraticCurveTo((m0x + m1x) / 2, my + 10, m1x, my);
  g.stroke();
  g.lineWidth = 4;
  for (let k = 0; k <= 6; k++) {
    const x = m0x + ((m1x - m0x) * k) / 6;
    const y = my + 10 * (1 - ((2 * k) / 6 - 1) ** 2) * 0.5;
    g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
  }
  return cv;
}

// ---- seam -----------------------------------------------------------------

// The outline (sdf = 0) by marching squares, chained into one loop.
function outline() {
  const val = (i, j) => sdf(X0 + i * DX, Y0 + j * DX);
  const segs = new Map();
  const pt = new Map();
  const edgePoint = (i, j, horiz) => {
    const key = `${i},${j},${horiz ? 'h' : 'v'}`;
    if (!pt.has(key)) {
      const a = val(i, j);
      const b = horiz ? val(i + 1, j) : val(i, j + 1);
      const t = a / (a - b);
      pt.set(key, [X0 + (i + (horiz ? t : 0)) * DX, Y0 + (j + (horiz ? 0 : t)) * DX]);
    }
    return key;
  };
  const link = (p, q) => {
    if (!segs.has(p)) segs.set(p, []);
    if (!segs.has(q)) segs.set(q, []);
    segs.get(p).push(q);
    segs.get(q).push(p);
  };
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const c = [val(i, j), val(i + 1, j), val(i + 1, j + 1), val(i, j + 1)];
    const crossings = [];
    if ((c[0] < 0) !== (c[1] < 0)) crossings.push(edgePoint(i, j, true));
    if ((c[1] < 0) !== (c[2] < 0)) crossings.push(edgePoint(i + 1, j, false));
    if ((c[3] < 0) !== (c[2] < 0)) crossings.push(edgePoint(i, j + 1, true));
    if ((c[0] < 0) !== (c[3] < 0)) crossings.push(edgePoint(i, j, false));
    if (crossings.length === 2) link(crossings[0], crossings[1]);
  }
  const start = segs.keys().next().value;
  const loop = [pt.get(start)];
  let prev = null;
  let cur = start;
  for (;;) {
    const next = segs.get(cur).find((n) => n !== prev);
    if (!next || next === start) break;
    loop.push(pt.get(next));
    prev = cur;
    cur = next;
  }
  return loop;
}

// ---- sketch ---------------------------------------------------------------

// Wide screens: off-centre and a little from the side, clear of the
// equation. Tall screens: centred, below the equation.
function frame(ctx) {
  const tall = ctx.size.width < ctx.size.height;
  const target = tall ? new THREE.Vector3(0, 0.35, 0) : new THREE.Vector3(0.95, 0.12, 0);
  ctx.camera.position.copy(target).add(tall ? new THREE.Vector3(0.7, 0.35, 4.2) : new THREE.Vector3(1.5, 0.6, 7.4));
  if (ctx.controls) {
    ctx.controls.target.copy(target);
    ctx.controls.update();
  } else {
    ctx.camera.lookAt(target);
  }
}

export default {
  name: 'Voodoo Doll',
  description:
    'Click and hold to stick a pin in a burlap voodoo doll. The fabric is a tensioned membrane on stuffing: it dents ' +
    'exactly as the Bessel-function indentation law says, punctures at about 2 N, rings, tents round the pin, and ' +
    'the pain spreads by a heat equation. Somewhere, someone says ow.',
  tags: ['physics', 'membrane', 'bessel', 'needle', 'diffusion', 'interactive', 'humor', 'glow'],
  category: 'Physics',

  mode: '3d',
  controls: 'orbit',

  motion() {
    return { phase: 'idle', delta: 0, F: 0, Fth: 0, Fp: 0, dp: 0, ow: 0, dOw: 0, work: 0, pins: 0, since: 99, eject: -1, edge: false };
  },

  latex: (params, hl, m) => {
    let needle;
    if (m.phase === 'press') {
      needle =
        `\\delta = ${hl(m.delta * 1000, 1)}\\,\\text{mm}:\\ \\ F = ${hl(m.F, 2)}\\,\\text{N}` +
        `\\ \\ (\\text{law: } ${hl(m.Fth, 2)}\\,\\text{N})`;
    } else if (m.Fp) {
      needle =
        `\\text{pop at } F_p = ${hl(m.Fp, 2)}\\,\\text{N},\\ \\delta = ${hl(m.dp * 1000, 1)}\\,\\text{mm}` +
        `\\ \\ (\\text{law: } ${hl(STIFF * m.dp, 2)}\\,\\text{N})`;
    } else {
      needle = '\\text{press and hold to push a pin in}';
    }
    const line =
      beat(m.eject, [[0, 'Pins out. The doll forgives you at a rate of 1/τ.']]) ||
      (m.since < 0.7 ? 'Pop: the burlap gives way.' : '') ||
      (m.phase === 'press' && m.edge ? 'Stiffer than the formula: the seam is near, and the formula assumes no seam.' : '') ||
      mood([m.dOw], {
        '+': 'Somewhere, someone says "ow".',
        '-': 'Somewhere, someone feels oddly better.',
        '0': 'The doll waits. It has no choice.',
      }, 0.05);
    return (
      '\\begin{aligned}' +
      '\\rho\\,w_{tt} &= T\\nabla^2 w - k\\,w - \\gamma\\,w_t + f \\quad (T = 40\\,\\tfrac{\\text{N}}{\\text{m}},\\ \\ell = \\sqrt{T/k} = 13.5\\,\\text{mm}) \\\\' +
      'F &= \\pi a^2 k\\,\\delta + 2\\pi T\\delta\\,\\tfrac{a}{\\ell}\\tfrac{K_1(a/\\ell)}{K_0(a/\\ell)} \\\\' +
      `& ${needle} \\\\` +
      `u_t &= D\\nabla^2 u - u/\\tau + \\eta\\,\\mathbf F\\cdot\\mathbf v,\\quad \\textstyle\\iint u\\,dA = ${hl(m.ow, 1)}\\ \\text{ow} \\\\` +
      `\\text{work} &= ${inUnits(hl, m.work * 1000, { per: 1, of: 'mJ', name: 'papercuts' })} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0.05, max: 2 },
    glow: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const { scene, renderer, camera } = ctx;
    scene.background = new THREE.Color(0x07040a);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.25;
    // Raking light, so the stuffing's curvature (and every dent) shows.
    const key = new THREE.DirectionalLight(0xffb070, 3.2);
    key.position.set(-5, 3.5, 2.2);
    const rim = new THREE.DirectionalLight(0x9a6bff, 2.4);
    rim.position.set(4, 1.5, -3);
    const fill = new THREE.DirectionalLight(0x40c8c0, 0.6);
    fill.position.set(3, -2, 3);
    scene.add(key, rim, fill);

    const glow = createGlow(ctx, { fov: 34, strength: 0.6, threshold: 0.9, exposure: 1.0, vignette: 0.7 });
    frame(ctx);
    if (ctx.controls) {
      ctx.controls.minAzimuthAngle = -1.1;
      ctx.controls.maxAzimuthAngle = 1.1;
      ctx.controls.minPolarAngle = 0.9;
      ctx.controls.maxPolarAngle = 2.2;
      ctx.controls.update();
    }

    // Grid: signed distance, interior mask, φ from ∇²φ = −1 by SOR.
    const N = NX * NY;
    const dist = new Float32Array(N);
    const inside = new Uint8Array(N);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const q = j * NX + i;
      dist[q] = sdf(X0 + i * DX, Y0 + j * DX);
      if (dist[q] < -0.35 * DX && i > 0 && j > 0 && i < NX - 1 && j < NY - 1) inside[q] = 1;
    }
    const interior = [];
    for (let q = 0; q < N; q++) if (inside[q]) interior.push(q);
    const nodes = Int32Array.from(interior);
    const phi = new Float64Array(N);
    for (let it = 0; it < 1500; it++) {
      for (const q of nodes) {
        const s = phi[q - 1] + phi[q + 1] + phi[q - NX] + phi[q + NX];
        phi[q] += 1.94 * ((s + DX * DX) / 4 - phi[q]);
      }
    }
    const h = new Float32Array(N);
    for (const q of nodes) h[q] = PUFF * Math.sqrt(2 * phi[q]);

    // Mesh vertices: every node within a cell of the outline; nodes on or
    // outside the outline are slid onto it (h = 0 there: the seam).
    const vid = new Int32Array(N).fill(-1);
    const vx = [];
    const vy = [];
    const vnode = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const q = j * NX + i;
      if (dist[q] > 1.2 * DX) continue;
      let x = X0 + i * DX;
      let y = Y0 + j * DX;
      if (!inside[q]) {
        const e = 1e-4;
        const gx = (sdf(x + e, y) - sdf(x - e, y)) / (2 * e);
        const gy = (sdf(x, y + e) - sdf(x, y - e)) / (2 * e);
        const gl = Math.hypot(gx, gy) || 1;
        const d = sdf(x, y);
        x -= (d * gx) / (gl * gl);
        y -= (d * gy) / (gl * gl);
      }
      vid[q] = vx.length;
      vx.push(x);
      vy.push(y);
      vnode.push(q);
    }
    const nv = vx.length;
    const idx = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = vid[j * NX + i], b = vid[j * NX + i + 1], c = vid[(j + 1) * NX + i + 1], d = vid[(j + 1) * NX + i];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      if (!inside[j * NX + i] && !inside[j * NX + i + 1] && !inside[(j + 1) * NX + i + 1] && !inside[(j + 1) * NX + i]) continue;
      idx.push(a, b, c, a, c, d);
    }
    const uv = new Float32Array(nv * 2);
    for (let v = 0; v < nv; v++) {
      uv[2 * v] = (vx[v] - X0) / W;
      uv[2 * v + 1] = (vy[v] - Y0) / HT;
    }
    const pain = new THREE.BufferAttribute(new Float32Array(nv), 1).setUsage(THREE.DynamicDrawUsage);

    const painUniform = { value: 1 };
    const makeMaterial = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const bump = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex, bumpMap: bump, bumpScale: 1.4, roughness: 0.92,
        sheen: 1, sheenColor: new THREE.Color(0xffd2a0), sheenRoughness: 0.45,
      });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uPainGain = painUniform;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', 'attribute float pain;\nvarying float vPain;\n#include <common>')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPain = pain;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', 'varying float vPain;\nuniform float uPainGain;\n#include <common>')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float pe = vPain / (vPain + 1.0);
            vec3 pc = mix(vec3(0.55, 0.01, 0.05), vec3(1.0, 0.32, 0.04), smoothstep(0.35, 0.85, pe));
            pc = mix(pc, vec3(1.0, 0.75, 0.3), smoothstep(0.8, 0.98, pe));
            float weave = 1.0 - 0.6 * clamp(dot(diffuseColor.rgb, vec3(0.33)) * 2.2, 0.0, 1.0);
            totalEmissiveRadiance += pc * pe * uPainGain * (0.9 + 1.6 * weave);`
          );
      };
      return { mat, tex, bump };
    };

    const doll = new THREE.Group();
    doll.scale.setScalar(SCALE);
    scene.add(doll);
    const faces = [1, -1].map((side) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) {
        pos[3 * v] = vx[v];
        pos[3 * v + 1] = vy[v];
        pos[3 * v + 2] = side * h[vnode[v]];
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('pain', pain);
      geo.setIndex(side > 0 ? idx : idx.map((_, k) => idx[k - (k % 3) + 2 - (k % 3)]));
      geo.computeVertexNormals();
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.25);
      const { mat, tex, bump } = makeMaterial(burlapCanvas(side > 0));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.userData.side = side;
      doll.add(mesh);
      return {
        side, geo, mat, tex, bump, mesh,
        w: new Float32Array(N), v: new Float32Array(N), f: new Float32Array(N),
        lock: new Float32Array(N).fill(-1), active: true, dirty: true,
      };
    });

    // Seam: a twine bead along the outline, plus cross stitches over it.
    const loop = outline();
    const hAt = (x, y) => {
      const fx = (x - X0) / DX, fy = (y - Y0) / DX;
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      const q = j * NX + i;
      return (h[q] * (1 - tx) + h[q + 1] * tx) * (1 - ty) + (h[q + NX] * (1 - tx) + h[q + NX + 1] * tx) * ty;
    };
    const seamCurve = new THREE.CatmullRomCurve3(loop.filter((_, k) => k % 2 === 0).map(([x, y]) => new THREE.Vector3(x, y, 0)), true);
    const twine = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.85 });
    const thread = new THREE.MeshStandardMaterial({ color: 0x8a1420, roughness: 0.6, emissive: 0x3a0308 });
    const bead = new THREE.Mesh(new THREE.TubeGeometry(seamCurve, 900, 0.0014, 6, true), twine);
    doll.add(bead);
    const seamLen = seamCurve.getLength();
    const stitchGeos = [];
    const nStitch = Math.floor(seamLen / 0.0055);
    for (let s = 0; s < nStitch; s++) {
      const u = s / nStitch;
      const p = seamCurve.getPointAt(u);
      const tng = seamCurve.getTangentAt(u);
      const nrm = new THREE.Vector3(-tng.y, tng.x, 0);
      if (sdf(p.x + nrm.x * 0.002, p.y + nrm.y * 0.002) > 0) nrm.negate();
      const a = p.clone().addScaledVector(nrm, 0.0035).addScaledVector(tng, -0.0012);
      const b = p.clone().addScaledVector(nrm, 0.0035).addScaledVector(tng, 0.0012);
      a.z = hAt(a.x, a.y) + 0.0004;
      b.z = -hAt(b.x, b.y) - 0.0004;
      const mid = p.clone().addScaledVector(nrm, -0.0016);
      stitchGeos.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 8, 0.0006, 4, false));
    }
    const stitches = new THREE.Mesh(mergeGeometries(stitchGeos), thread);
    stitchGeos.forEach((g) => g.dispose());
    doll.add(stitches);

    // Button eye.
    const eyeQ = Math.round((0.106 - Y0) / DX) * NX + Math.round((-0.017 - X0) / DX);
    const button = new THREE.Group();
    const buttonMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.15, clearcoat: 1, metalness: 0.1 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.0022, 32), buttonMat);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0011, 8, 32), buttonMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.0011;
    const holeMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7 });
    for (const [hx, hz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.0026, 8), holeMat);
      hole.position.set(hx * 0.0019, 0, hz * 0.0019);
      button.add(hole);
    }
    button.add(disc, lip);
    doll.add(button);
    const eyeNormal = new THREE.Vector3(
      -(h[eyeQ + 1] - h[eyeQ - 1]) / (2 * DX), -(h[eyeQ + NX] - h[eyeQ - NX]) / (2 * DX), 1,
    ).normalize();
    button.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eyeNormal);

    // Soft halo behind the doll.
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uGain: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec2 vUv; uniform float uGain;
          void main(){ float r = length(vUv - 0.5) * 2.0;
            vec3 c = mix(vec3(0.14, 0.045, 0.19), vec3(0.3, 0.04, 0.07), uGain) * exp(-r * r * 5.0);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    halo.position.set(0, 0, -3);
    scene.add(halo);

    // Pins.
    const shaftGeo = new THREE.CylinderGeometry(0.0006, 0.0006, PIN_LEN, 8).translate(0, PIN_LEN / 2, 0);
    const tipGeo = new THREE.ConeGeometry(0.0006, 0.002, 8).rotateX(Math.PI).translate(0, -0.001, 0);
    const headGeo = new THREE.SphereGeometry(0.0032, 20, 14).translate(0, PIN_LEN, 0);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.22 });
    const headMats = HEAD_COLORS.map((c) => new THREE.MeshPhysicalMaterial({
      color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.12, clearcoat: 1,
    }));

    // The tip: interior nodes within TIP_R of the centre node.
    const tipOffsets = [];
    const rc = Math.ceil(TIP_R / DX);
    for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
      if (Math.hypot(di, dj) * DX <= TIP_R + 1e-9) tipOffsets.push(dj * NX + di);
    }
    const painOffsets = [];
    const pr = Math.ceil((3 * PAIN_SIGMA) / DX);
    for (let dj = -pr; dj <= pr; dj++) for (let di = -pr; di <= pr; di++) {
      const r2 = (di * di + dj * dj) * DX * DX;
      if (r2 <= 9 * PAIN_SIGMA * PAIN_SIGMA) {
        painOffsets.push([dj * NX + di, Math.exp(-r2 / (2 * PAIN_SIGMA * PAIN_SIGMA)) / (2 * Math.PI * PAIN_SIGMA * PAIN_SIGMA)]);
      }
    }

    const state = {
      glow, pmrem, envTarget, doll, faces, nodes, inside, h, vnode, nv, pain, painUniform,
      u: new Float32Array(N), u2: new Float32Array(N),
      tipOffsets, painOffsets, button, eyeQ, halo, bead, stitches, twine, thread, buttonMat, holeMat,
      shaftGeo, tipGeo, headGeo, steel, headMats,
      pins: [], pokes: [], lastUser: -99, nextAuto: 1.5, autoCount: 0, eject: -1,
      theta: new THREE.Vector3(), omega: new THREE.Vector3(), torque: new THREE.Vector3(),
      readout: { phase: 'idle', delta: 0, F: 0, Fth: 0, Fp: 0, dp: 0, ow: 0, dOw: 0, work: 0, since: 99, edge: false },
      clock: 0, owPrev: 0, owRate: 0, colorIdx: 0,
      raycaster: new THREE.Raycaster(),
    };

    // SketchRunner keeps a shallow copy of what setup() returns, so the
    // pointer handlers act on whichever object update() is handed (bind()).
    let S = state;
    state.bind = (s) => { S = s; };
    const startPoke = (ray, auto, pointerId) => {
      S.raycaster.ray.copy(ray);
      const hit = S.raycaster.intersectObjects(faces.map((f) => f.mesh), false)[0];
      if (!hit) return false;
      const face = faces.find((f) => f.mesh === hit.object);
      const p = doll.worldToLocal(hit.point.clone());
      let q = Math.round((p.y - Y0) / DX) * NX + Math.round((p.x - X0) / DX);
      if (!inside[q]) return false;
      // Keep the tip clear of the seam (its nodes must all be interior).
      if (tipOffsets.some((o) => !inside[q + o])) return false;
      // One needle per spot.
      const qi = q % NX, qj = Math.floor(q / NX);
      if (S.pokes.some((k) => k.face === face && Math.hypot(k.q % NX - qi, Math.floor(k.q / NX) - qj) < 6)) return false;
      // The hand comes in from above and to the right of your eye, so the
      // pin is seen side-on instead of end-on.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const world = ray.direction.clone().addScaledVector(up, -0.55).addScaledVector(right, -0.3).normalize();
      const inv = new THREE.Matrix4().copy(doll.matrixWorld).invert();
      const dir = world.transformDirection(inv).normalize();
      if (dir.z * face.side > -0.25) return false;          // too glancing
      const head = new THREE.Mesh(S.headGeo, headMats[S.colorIdx++ % headMats.length]);
      const pin = new THREE.Group();
      pin.add(new THREE.Mesh(S.shaftGeo, steel), new THREE.Mesh(S.tipGeo, steel), head);
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      doll.add(pin);
      const entry = new THREE.Vector3(X0 + (q % NX) * DX, Y0 + Math.floor(q / NX) * DX, face.side * h[q]);
      S.pokes.push({
        pin, face, q, dir, entry, s: -0.03, phase: 'approach', auto, pointerId, holding: true,
        Fp: FP * (0.85 + 0.3 * Math.random()), F: 0, force: 0, power: 0, t: 0,
        hold: auto ? 0.15 + Math.random() * 0.5 : 0,
      });
      return true;
    };
    state.startPoke = startPoke;

    // Pointer: a press on the doll pokes; anywhere else orbits.
    const el = renderer.domElement;
    const ndc = new THREE.Vector2();
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const rc2 = new THREE.Raycaster();
      rc2.setFromCamera(ndc, camera);
      if (startPoke(rc2.ray, false, e.pointerId)) {
        S.lastUser = S.clock;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    const onUp = (e) => {
      for (const k of S.pokes) if (!k.auto && k.pointerId === e.pointerId) k.holding = false;
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    state.onDown = onDown;
    state.onUp = onUp;
    return state;
  },

  update(ctx, state) {
    state.bind(state);
    const dtFrame = Math.min(ctx.delta, 1 / 20) * ctx.params.speed;
    state.clock += Math.min(ctx.delta, 1 / 20);
    const { faces, nodes, h, u, tipOffsets } = state;
    const R = state.readout;
    state.painUniform.value = ctx.params.glow;
    state.glow.strength = 0.6 * Math.min(ctx.params.glow, 1.3);

    // Autopilot when nobody has touched it for a while.
    if (!state.pokes.length && state.eject < 0 && state.clock - state.lastUser > IDLE && state.clock > state.nextAuto) {
      if (state.autoCount >= AUTO_PINS) {
        state.eject = 0;
      } else {
        const [tx, ty] = AUTO_TARGETS[state.autoCount % AUTO_TARGETS.length];
        const qi = Math.round((ty - Y0) / DX) * NX + Math.round((tx - X0) / DX);
        const target = state.doll.localToWorld(new THREE.Vector3(tx + (Math.random() - 0.5) * 0.006, ty + (Math.random() - 0.5) * 0.006, h[qi]));
        const from = ctx.camera.position.clone().lerp(new THREE.Vector3(target.x * 1.6, target.y * 1.3 + 0.5, ctx.camera.position.z), 0.5);
        const ray = new THREE.Ray(from, target.clone().sub(from).normalize());
        state.startPoke(ray, true);
        state.autoCount++;               // a miss (say, the seam) just skips that spot
        state.nextAuto = state.clock + 1.6 + Math.random() * 1.2;
      }
    }

    // Eject: all pins fly out, then a fresh start.
    if (state.eject >= 0) {
      if (state.eject === 0) {
        for (const p of state.pins) {
          p.vel = p.dir.clone().multiplyScalar(-0.5 - Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, 0));
          p.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
        }
      }
      state.eject += dtFrame;
      for (const p of state.pins) {
        p.vel.y -= 9.8 * dtFrame;
        p.pin.position.addScaledVector(p.vel, dtFrame);
        p.pin.rotation.x += p.spin.x * dtFrame;
        p.pin.rotation.y += p.spin.y * dtFrame;
        p.pin.rotation.z += p.spin.z * dtFrame;
      }
      if (state.eject > 1.6) {
        for (const p of state.pins) state.doll.remove(p.pin);
        state.pins = [];
        state.autoCount = 0;
        state.eject = -1;
        state.nextAuto = state.clock + 1.5;
      }
    }

    // ---- needles ----
    const pokes = state.pokes;
    for (const poke of pokes) {
      const face = poke.face;
      const dz = Math.abs(poke.dir.z);
      poke.t += dtFrame;
      poke.force = 0;                    // along the needle, N
      poke.power = 0;                    // F·v, W
      if (poke.auto && poke.t > poke.hold + 0.3) poke.holding = false;
      if (poke.phase === 'approach') {
        poke.s += V_APPROACH * dtFrame;
        if (poke.s >= 0) { poke.s = 0; poke.phase = 'press'; }
      } else if (poke.phase === 'press') {
        if (!poke.holding && poke.s > 0) poke.phase = 'retract';
        else poke.s += V_PRESS * dtFrame;
      } else if (poke.phase === 'retract') {
        poke.s -= V_APPROACH * dtFrame;
      } else if (poke.phase === 'insert') {
        if ((poke.holding || poke.s < S_MIN) && poke.s < S_MAX) {
          poke.s = Math.min(S_MAX, poke.s + V_INSERT * dtFrame);
          poke.force = MU * poke.s;
          poke.power = poke.force * V_INSERT;
        } else {
          poke.phase = 'rest';
        }
      }
      poke.delta = Math.max(0, poke.s * dz);
      // The tip holds the dent while pressing; friction drags the fabric in
      // while inserting.
      const lockVal = poke.phase === 'press' || poke.phase === 'retract' ? poke.delta : -1;
      const fArea = poke.phase === 'insert' ? (poke.force * dz) / (tipOffsets.length * DX * DX) : 0;
      for (const o of tipOffsets) {
        face.lock[poke.q + o] = lockVal;
        face.f[poke.q + o] = fArea;
      }
      face.active = true;
    }
    const lead = pokes[pokes.length - 1];
    R.phase = lead ? lead.phase : 'idle';
    R.delta = lead ? lead.delta : 0;

    // ---- membranes ----
    const steps = Math.ceil(dtFrame / DT - 1e-6);
    const dt = steps ? dtFrame / steps : 0;
    const c2 = T_TEN / (DX * DX);
    const damp = 1 / (1 + (GAMMA * dt) / RHO);
    for (const face of faces) {
      if (!face.active) continue;
      const { w, v, f, lock } = face;
      for (let s = 0; s < steps; s++) {
        for (let n = 0; n < nodes.length; n++) {
          const q = nodes[n];
          const lap = w[q - 1] + w[q + 1] + w[q - NX] + w[q + NX] - 4 * w[q];
          v[q] = (v[q] + (dt / RHO) * (c2 * lap - K_FND * w[q] + f[q])) * damp;
        }
        for (let n = 0; n < nodes.length; n++) {
          const q = nodes[n];
          w[q] += dt * v[q];
          if (lock[q] >= 0 && w[q] < lock[q]) { v[q] = 0; w[q] = lock[q]; }
        }
      }
      let maxW = 0;
      for (let n = 0; n < nodes.length; n++) maxW = Math.max(maxW, Math.abs(w[nodes[n]]), Math.abs(v[nodes[n]]) * 0.01);
      face.dirty = true;
      if (maxW < 1e-7 && !pokes.some((k) => k.face === face)) {
        face.active = false;
        w.fill(0);
        v.fill(0);
      }
    }

    // ---- reaction under each tip, puncture, pins ----
    for (const poke of [...pokes]) {
      const dz = Math.abs(poke.dir.z);
      if (poke.phase === 'press' || poke.phase === 'retract') {
        const { w, v, lock } = poke.face;
        let F = 0;
        for (const o of tipOffsets) {
          const q = poke.q + o;
          if (w[q] > lock[q] + 1e-9) continue;            // not touching
          const lap = (w[q - 1] + w[q + 1] + w[q - NX] + w[q + NX] - 4 * w[q]) / (DX * DX);
          F += (K_FND * w[q] - T_TEN * lap + GAMMA * v[q]) * DX * DX;
        }
        poke.F = Math.max(0, F);
        poke.force = poke.F / dz;
        poke.power = poke.phase === 'press' ? poke.F * V_PRESS * dz : 0;
        if (poke === lead) {
          R.F = poke.F;
          R.Fth = STIFF * poke.delta;
          R.edge = poke.F > 1.15 * R.Fth && poke.delta > 0.002;
        }
        if (poke.phase === 'press' && poke.F >= poke.Fp) {
          poke.phase = 'insert';
          R.Fp = poke.F;
          R.dp = poke.delta;
          R.since = 0;
          for (const o of tipOffsets) lock[poke.q + o] = -1;
        }
      }
      // The pin rides the surface once it is through.
      const tip = poke.entry.clone().addScaledVector(poke.dir, poke.s);
      if (poke.phase === 'insert' || poke.phase === 'rest') tip.z -= poke.face.side * poke.face.w[poke.q];
      poke.pin.position.copy(tip);
      R.work += poke.power * dtFrame;
      if (poke.phase === 'retract' && poke.s <= -0.03) {
        state.doll.remove(poke.pin);
        for (const o of tipOffsets) poke.face.lock[poke.q + o] = -1;
        pokes.splice(pokes.indexOf(poke), 1);
      } else if (poke.phase === 'rest') {
        for (const o of tipOffsets) poke.face.f[poke.q + o] = 0;
        pokes.splice(pokes.indexOf(poke), 1);
        state.pins.push(poke);
        if (state.pins.length > MAX_PINS) state.doll.remove(state.pins.shift().pin);
      }
    }
    R.since += dtFrame;
    for (const p of state.pins) {
      if (state.eject >= 0) break;
      const tip = p.entry.clone().addScaledVector(p.dir, p.s);
      tip.z -= p.face.side * p.face.w[p.q];
      p.pin.position.copy(tip);
    }

    // ---- rocking: τ = r × F ----
    state.torque.set(0, 0, 0);
    const tq = new THREE.Vector3();
    for (const poke of pokes) {
      if (poke.force > 0) state.torque.add(tq.crossVectors(poke.entry, poke.dir).multiplyScalar(poke.force));
    }
    const wn = Math.sqrt(KAPPA / INERTIA);
    const rockSteps = Math.ceil(dtFrame / 0.002);
    for (let s = 0; s < rockSteps; s++) {
      const hs = dtFrame / rockSteps;
      state.omega.addScaledVector(state.torque, hs / INERTIA)
        .addScaledVector(state.theta, (-KAPPA / INERTIA) * hs)
        .multiplyScalar(1 / (1 + 2 * ZETA * wn * hs));
      state.theta.addScaledVector(state.omega, hs);
    }
    state.doll.rotation.set(state.theta.x, state.theta.y, state.theta.z);

    // ---- pain: u_t = D∇²u − u/τ + sources ----
    const src = state.u2;
    const addSources = () => {
      for (const poke of pokes) {
        if (poke.power <= 0) continue;
        for (const [o, g] of state.painOffsets) if (state.inside[poke.q + o]) src[poke.q + o] += ETA * poke.power * g;
      }
      if (state.eject >= 0) return;
      for (const p of state.pins) {
        for (const [o, g] of state.painOffsets) if (state.inside[p.q + o]) src[p.q + o] += ACHE * g;
      }
    };
    src.fill(0);
    addSources();
    const pSteps = Math.ceil(dtFrame / 0.006 - 1e-6);
    const pdt = pSteps ? dtFrame / pSteps : 0;
    let total = 0;
    for (let s = 0; s < pSteps; s++) {
      // Zero-flux at the seam: outside neighbours mirror the node.
      for (let n = 0; n < nodes.length; n++) {
        const q = nodes[n];
        const uq = u[q];
        const l = (state.inside[q - 1] ? u[q - 1] : uq) + (state.inside[q + 1] ? u[q + 1] : uq) +
          (state.inside[q - NX] ? u[q - NX] : uq) + (state.inside[q + NX] ? u[q + NX] : uq) - 4 * uq;
        src[q] = uq + pdt * ((DIFF * l) / (DX * DX) - uq / TAU) + pdt * src[q];
      }
      for (let n = 0; n < nodes.length; n++) {
        const q = nodes[n];
        u[q] = src[q];
        src[q] = 0;
      }
      if (s < pSteps - 1) addSources();
    }
    for (let n = 0; n < nodes.length; n++) total += u[nodes[n]];
    total *= DX * DX;
    if (dtFrame > 0) {
      const rate = (total - state.owPrev) / dtFrame;
      state.owRate += (rate - state.owRate) * Math.min(1, dtFrame * 4);
    }
    state.owPrev = total;
    R.ow = total;
    R.dOw = state.owRate;

    // ---- geometry ----
    const pa = state.pain.array;
    for (let k = 0; k < state.nv; k++) pa[k] = u[state.vnode[k]] / PAIN_SCALE;
    state.pain.needsUpdate = true;
    for (const face of faces) {
      if (!face.dirty) continue;
      const pos = face.geo.attributes.position.array;
      for (let k = 0; k < state.nv; k++) {
        const q = state.vnode[k];
        pos[3 * k + 2] = face.side * Math.max(h[q] - face.w[q], -0.6 * h[q]);
      }
      face.geo.attributes.position.needsUpdate = true;
      face.geo.computeVertexNormals();
      face.dirty = face.active;
    }
    state.button.position.set(-0.017, 0.106, h[state.eyeQ] - faces[0].w[state.eyeQ] + 0.0009);
    state.halo.material.uniforms.uGain.value = total / (total + 60);

    Object.assign(ctx.motion, R, { pins: state.pins.length, eject: state.eject });
  },

  resize(ctx) {
    frame(ctx);
  },

  dispose(ctx, state) {
    const el = ctx.renderer.domElement;
    el.removeEventListener('pointerdown', state.onDown, { capture: true });
    window.removeEventListener('pointerup', state.onUp);
    window.removeEventListener('pointercancel', state.onUp);
    state.glow.dispose();
    state.envTarget.dispose();
    state.pmrem.dispose();
    ctx.scene.environment = null;
    for (const f of state.faces) {
      f.geo.dispose(); f.mat.dispose(); f.tex.dispose(); f.bump.dispose();
    }
    state.shaftGeo.dispose(); state.tipGeo.dispose(); state.headGeo.dispose();
    state.steel.dispose();
    state.headMats.forEach((m) => m.dispose());
  },
};
