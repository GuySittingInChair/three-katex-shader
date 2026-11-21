import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Schlieren: seeing hot air. Warm air is thinner than cool air, so light bends slightly passing through it:
// air's refractive index follows its density, n − 1 = Kρ (the Gladstone–Dale law, K ≈ 2.26×10⁻⁴ m³/kg), and density
// falls as temperature rises (ρ = p / RT). A schlieren camera focuses light through the air onto a knife edge; light
// bent one way is blocked, the other way passes, so the picture's brightness shows ∂n/∂x, how fast the index
// changes from left to right. A colour schlieren uses a colour filter instead of the edge: the hue shows which way
// the light was bent, the strength how much.
// The air here is a real fluid simulation ("stable fluids", Stam 1999) on a 128 × 128 grid: buoyancy pushes warm
// air up (Boussinesq: ∂v/∂t gains βT), the flow carries the heat along, and a pressure step keeps the air from being
// squeezed (∇·u = 0, 30 Jacobi sweeps a step). A little vorticity confinement (Fedkiw et al. 2001) keeps the small
// swirls that a coarse grid would smear out. A candle and a mug of tea heat it from below. The units are scaled; the
// shape of the flow, not its exact speed, is the point.
// see docs/wiki/sketches/schlierenPlume.md

const N = 128;
const DT = 0.12, BUOY = 0.55, COOL = 0.004, CONFINE = 0.18, ITERS = 30;
const LOOP = 36;
const at = (i, j) => j * N + i;

function makeAir() {
  const z = () => new Float32Array(N * N);
  return { u: z(), v: z(), T: z(), u2: z(), v2: z(), T2: z(), p: z(), div: z(), curl: z(), t: 0 };
}
function sample(f, x, y) {
  x = Math.max(0.5, Math.min(N - 1.5, x)); y = Math.max(0.5, Math.min(N - 1.5, y));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  return (f[at(i, j)] * (1 - fx) + f[at(i + 1, j)] * fx) * (1 - fy) + (f[at(i, j + 1)] * (1 - fx) + f[at(i + 1, j + 1)] * fx) * fy;
}
function stepAir(A) {
  const { u, v, T, u2, v2, T2, p, div, curl } = A;
  A.t += DT;
  // heat: a candle flame (small, hot, flickering) and a mug of tea (wide, gentle); j counts up from the floor
  const flick = 1 + 0.3 * Math.sin(A.t * 7.1) + 0.2 * Math.sin(A.t * 12.7);
  for (let j = 4; j < 8; j++) for (let i = 60; i < 68; i++) { T[at(i, j)] = Math.max(T[at(i, j)], 1.0 * flick); v[at(i, j)] += 0.3; }
  for (let j = 14; j < 16; j++) for (let i = 20; i < 40; i++) T[at(i, j)] = Math.max(T[at(i, j)], 0.35);
  // buoyancy, and a little heat lost to the room
  for (let k = 0; k < N * N; k++) { v[k] += DT * BUOY * T[k]; T[k] *= 1 - COOL; }
  // vorticity confinement: push swirls to stay swirly
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) curl[at(i, j)] = (v[at(i + 1, j)] - v[at(i - 1, j)] - u[at(i, j + 1)] + u[at(i, j - 1)]) * 0.5;
  for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
    const gx = (Math.abs(curl[at(i + 1, j)]) - Math.abs(curl[at(i - 1, j)])) * 0.5, gy = (Math.abs(curl[at(i, j + 1)]) - Math.abs(curl[at(i, j - 1)])) * 0.5;
    const len = Math.hypot(gx, gy) + 1e-6, w = curl[at(i, j)];
    u[at(i, j)] += DT * CONFINE * (gy / len) * w;
    v[at(i, j)] -= DT * CONFINE * (gx / len) * w;
  }
  // carry everything along the flow (semi-Lagrangian: look back along the velocity)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = at(i, j), x = i - DT * u[k] * N * 0.08, y = j - DT * v[k] * N * 0.08;
    u2[k] = sample(u, x, y); v2[k] = sample(v, x, y); T2[k] = sample(T, x, y);
  }
  A.u = u2; A.u2 = u; A.v = v2; A.v2 = v; A.T = T2; A.T2 = T;
  // keep the air from being squeezed: remove the divergence (pressure by Jacobi sweeps)
  const U = A.u, V = A.v;
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { div[at(i, j)] = -0.5 * (U[at(i + 1, j)] - U[at(i - 1, j)] + V[at(i, j + 1)] - V[at(i, j - 1)]); p[at(i, j)] = 0; }
  for (let it = 0; it < ITERS; it++) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++)
    p[at(i, j)] = (div[at(i, j)] + p[at(i - 1, j)] + p[at(i + 1, j)] + p[at(i, j - 1)] + p[at(i, j + 1)]) / 4;
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    U[at(i, j)] -= 0.5 * (p[at(i + 1, j)] - p[at(i - 1, j)]);
    V[at(i, j)] -= 0.5 * (p[at(i, j + 1)] - p[at(i, j - 1)]);
  }
  // walls: no air through the edges
  for (let q = 0; q < N; q++) { U[at(0, q)] = U[at(N - 1, q)] = 0; V[at(q, 0)] = V[at(q, N - 1)] = 0; }
}

const LIVE = { mode: 0, maxT: 0 };

export default {
  name: 'Schlieren: Seeing Hot Air',
  description:
    'Hot air bends light, very slightly. A schlieren camera turns that bending into brightness, so the invisible ' +
    'plumes above a candle and a mug of tea show up as rippling smoke-like shapes. The air is a live fluid simulation; ' +
    'the picture shows exactly what the camera would: how fast the air\'s refractive index changes across it.',
  tags: ['optics', 'schlieren', 'refraction', 'fluid simulation', 'convection', 'buoyancy'],
  category: 'Optics',
  mode: '3d',

  motion(t) {
    return { mode: Math.floor(t / (LOOP / 2)) % 2 };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'n - 1 &= K\\rho,\\quad \\rho = \\frac{p}{RT} \\\\' +
    (m.mode === 0
      ? '\\text{brightness} &\\propto \\frac{\\partial n}{\\partial x}\\quad \\text{(knife edge)} \\\\'
      : '\\text{hue} &= \\text{direction of } \\nabla n,\\ \\text{strength} = |\\nabla n|\\quad \\text{(colour)} \\\\') +
    '\\frac{\\partial \\mathbf{u}}{\\partial t} &= -(\\mathbf{u}\\cdot\\nabla)\\mathbf{u} - \\nabla p + \\beta T\\,\\hat{\\mathbf{y}},\\quad \\nabla\\cdot\\mathbf{u} = 0 \\\\' +
    `& ${caption(m.mode === 0 ? 'Knife-edge schlieren: the air you were breathing all along.' : 'Colour schlieren: the same air, now with opinions about direction.')}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.5 });
    const img = document.createElement('canvas');
    img.width = img.height = N;
    const ig = img.getContext('2d');
    return { stage, img, ig, data: ig.createImageData(N, N), air: makeAir() };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, A = state.air;
    const steps = ctx.params.speed === 0 ? 0 : Math.max(1, Math.round(ctx.params.speed ?? 1));
    for (let s = 0; s < steps; s++) stepAir(A);
    // The picture: n falls as T rises, so ∂n/∂x ∝ −∂T/∂x. Row 0 of the grid is the floor, drawn at the bottom.
    const T = A.T, px = state.data.data;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const gx = -(T[at(i + 1, j)] - T[at(i - 1, j)]) * 0.5, gy = -(T[at(i, j + 1)] - T[at(i, j - 1)]) * 0.5;
      const k = ((N - 1 - j) * N + i) * 4;
      if (m.mode === 0) {
        const b = Math.max(0, Math.min(255, 128 + 900 * gx));
        px[k] = b; px[k + 1] = b; px[k + 2] = b;
      } else {
        const mag = Math.min(1, Math.hypot(gx, gy) * 9), h = Math.atan2(gy, gx);
        px[k] = 255 * mag * (0.5 + 0.5 * Math.cos(h)); px[k + 1] = 255 * mag * (0.5 + 0.5 * Math.cos(h - TAU / 3)); px[k + 2] = 255 * mag * (0.5 + 0.5 * Math.cos(h + TAU / 3));
      }
      px[k + 3] = 255;
    }
    state.ig.putImageData(state.data, 0, 0);
    const sq = state.stage.square(10);
    g.imageSmoothingEnabled = true;
    g.save();
    g.beginPath(); g.arc(sq.x + sq.s / 2, sq.y + sq.s / 2, sq.s / 2, 0, TAU); g.clip();   // the round field of view
    g.drawImage(state.img, sq.x, sq.y, sq.s, sq.s);
    g.restore();
    g.strokeStyle = 'rgba(180,190,210,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(sq.x + sq.s / 2, sq.y + sq.s / 2, sq.s / 2, 0, TAU); g.stroke();
    // the candle and the mug, as dark silhouettes (they are solid, so a schlieren shows them black)
    const k = sq.s / N, gy0 = sq.y + sq.s;
    g.fillStyle = m.mode === 0 ? 'rgb(10,10,14)' : 'rgb(4,4,6)';
    g.fillRect(sq.x + 62 * k, gy0 - 4 * k, 4 * k, 4 * k);
    g.fillRect(sq.x + 20 * k, gy0 - 14 * k, 20 * k, 14 * k);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.75)'; g.textAlign = 'center';
    g.fillText('mug of tea', sq.x + 30 * k, gy0 + 14);
    g.fillText('candle', sq.x + 64 * k, gy0 + 14);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
