import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';

// A robot sneezes, and the incompressible Navier–Stokes equations take it
// from there:
//
//     ∂u/∂t + (u·∇)u = −∇p + ν∇²u,   ∇·u = 0
//
// solved on a 128 × 64 grid with Stam's "stable fluids" scheme: diffuse
// (implicit), project (make it divergence-free by solving for the
// pressure), advect (trace back along the flow), project again. The green
// stuff is a dye carried by the flow; the faint pink and blue edges are
// the vorticity ω = ∇ × u, spinning one way or the other.
//
// Honest numbers. A real sneeze, with a jet speed of about U = 10 m/s from
// a mouth D = 2 cm wide, in air (ν = 1.5 × 10⁻⁵ m²/s), has Reynolds number
// Re = UD/ν ≈ 13,000. A grid this size can't resolve that; this one runs at
// Re = 300 (plus some numerical viscosity), so it's a gentler, more viscous
// sneeze with the same overall look: a jet that rolls up into a vortex
// pair and slows down. The readouts convert the simulation to metres and
// milliseconds using U and D (that conversion is only as good as the
// simulation's Re), and track the front of the cloud and how long it
// would take to reach the camera at the right edge, 0.43 m away.
//
// Loop (9 s): ah… ah… (the robot leans back, eyes squeezed) CHOO, then the
// cloud drifts. Simulated, not a closed-form loop; it resets each loop.

const PERIOD = 9;
const NX = 128;
const NY = 64;
const W = NX + 2;
const SIZE = W * (NY + 2);
const MOUTH_X = 20; // the jet starts here (cells)
const MOUTH_Y = 32;
const JET_U = 1.2; // cells per step
const JET_D = 5; // cells
const VISC = 0.02; // cells² per step → Re = 1.2 × 5 / 0.02 = 300
const STEPS_PER_SECOND = 60;
const CHOO_START = 2.3; // seconds into the loop
const CHOO_END = 2.9;
// Converting to the real world: one cell is D/JET_D, one step is (D/JET_D)/(U/JET_U).
const U_REAL = 10;
const D_REAL = 0.02;
const METRES_PER_CELL = D_REAL / JET_D;
const SECONDS_PER_STEP = METRES_PER_CELL / (U_REAL / JET_U);
const CAMERA_M = (NX - MOUTH_X) * METRES_PER_CELL;

const IX = (i, j) => i + W * j;

// Walls on all four sides: b = 1 flips u at the left/right walls, b = 2 flips v at the top/bottom.
function setBoundary(b, x) {
  for (let i = 1; i <= NX; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  for (let j = 1; j <= NY; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
  x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
  x[IX(0, NY + 1)] = 0.5 * (x[IX(1, NY + 1)] + x[IX(0, NY)]);
  x[IX(NX + 1, 0)] = 0.5 * (x[IX(NX, 0)] + x[IX(NX + 1, 1)]);
  x[IX(NX + 1, NY + 1)] = 0.5 * (x[IX(NX, NY + 1)] + x[IX(NX + 1, NY)]);
}

// Gauss–Seidel for (1 + 4a) x − a Σ neighbours = x0 (implicit diffusion, and the pressure solve).
function relax(b, x, x0, a, c, iters) {
  for (let k = 0; k < iters; k++) {
    for (let j = 1; j <= NY; j++) {
      for (let i = 1; i <= NX; i++) {
        const n = IX(i, j);
        x[n] = (x0[n] + a * (x[n - 1] + x[n + 1] + x[n - W] + x[n + W])) / c;
      }
    }
    setBoundary(b, x);
  }
}

function diffuse(b, x, x0, rate) {
  relax(b, x, x0, rate, 1 + 4 * rate, 6); // a small rate: converges in a few sweeps
}

// Semi-Lagrangian advection: each cell takes the value from where the flow came from.
function advect(b, d, d0, u, v) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      const x = Math.min(NX + 0.5, Math.max(0.5, i - u[n]));
      const y = Math.min(NY + 0.5, Math.max(0.5, j - v[n]));
      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      const s1 = x - i0;
      const t1 = y - j0;
      d[n] =
        (1 - s1) * ((1 - t1) * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) +
        s1 * ((1 - t1) * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
    }
  }
  setBoundary(b, d);
}

// Remove the divergent part: solve ∇²p = ∇·u, then u −= ∇p.
function project(u, v, p, div) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      div[n] = -0.5 * (u[n + 1] - u[n - 1] + v[n + W] - v[n - W]);
      p[n] = 0;
    }
  }
  setBoundary(0, div);
  setBoundary(0, p);
  relax(0, p, div, 1, 4, 24);
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      u[n] -= 0.5 * (p[n + 1] - p[n - 1]);
      v[n] -= 0.5 * (p[n + W] - p[n - W]);
    }
  }
  setBoundary(1, u);
  setBoundary(2, v);
}

function step(f, jet, wobble) {
  const { u, v, u0, v0, dye, dye0 } = f;
  if (jet > 0) {
    // The sneeze: a jet out of the mouth, with a little wobble so it isn't perfectly straight.
    for (let j = MOUTH_Y - 2; j <= MOUTH_Y + 2; j++) {
      for (let i = MOUTH_X; i < MOUTH_X + 3; i++) {
        const n = IX(i, j);
        u[n] = JET_U * jet;
        v[n] = JET_U * jet * wobble;
        dye[n] = Math.min(1.5, dye[n] + 0.6 * jet);
      }
    }
  }
  u0.set(u);
  v0.set(v);
  diffuse(1, u, u0, VISC);
  diffuse(2, v, v0, VISC);
  project(u, v, f.p, f.div);
  u0.set(u);
  v0.set(v);
  advect(1, u, u0, u0, v0);
  advect(2, v, v0, u0, v0);
  project(u, v, f.p, f.div);
  dye0.set(dye);
  advect(0, dye, dye0, u, v);
}

function fresh() {
  const a = () => new Float32Array(SIZE);
  return { u: a(), v: a(), u0: a(), v0: a(), dye: a(), dye0: a(), p: a(), div: a(), steps: 0, front: 0, frontSpeed: 0 };
}

export default {
  name: 'Navier–Stokes of a Sneeze',
  description:
    'A robot sneezes and the incompressible Navier–Stokes equations take over: the jet rolls up into a vortex ' +
    'pair and slows. Solved on a grid with the stable-fluids method. The readouts give the real sneeze’s ' +
    'Reynolds number, the simulation’s, the peak vorticity, and how long until the cloud reaches the camera.',
  tags: ['navier-stokes', 'fluid dynamics', 'vorticity', 'reynolds number', 'robots', 'sneeze'],
  category: 'Fluid Flow',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = phaseOf(t, PERIOD) * PERIOD;
    const ah = Math.min(1, Math.max(0, (s - 0.3) / (CHOO_START - 0.3))); // leaning back
    const choo = s >= CHOO_START && s < CHOO_END ? Math.sin((Math.PI * (s - CHOO_START)) / (CHOO_END - CHOO_START)) : 0;
    const after = s >= CHOO_START ? Math.max(0, 1 - (s - CHOO_START) / 0.8) : 0;
    // Simulation readouts are filled in by update(); placeholders here.
    return { s, ah: s < CHOO_START ? ah : after, choo, frontM: 0, eta: Infinity, vort: 0, started: s >= CHOO_START };
  },

  latex: (params, hl, m) => {
    const phase = m.s < 1.2 ? '\\text{ah}\\ldots' : m.s < CHOO_START ? '\\text{ah}\\ldots\\ \\text{ah}\\ldots' : m.s < 3.2 ? '\\textbf{CHOO}' : '';
    let travel = '';
    if (m.started) {
      travel = `\\text{front} &= ${hl(m.frontM, 2)}\\ \\text{m},\\quad ` + (Number.isFinite(m.eta) ? `\\text{at this speed, at the camera in } ${hl(m.eta, 0)}\\ \\text{ms}` : m.frontM >= CAMERA_M - 0.01 ? '\\text{it reached the camera}' : '\\text{stalled: the camera is safe}');
    }
    return (
      '\\begin{aligned}' +
      '\\partial_t \\vec u + (\\vec u\\cdot\\nabla)\\vec u &= -\\nabla p + \\nu\\nabla^2\\vec u,\\quad \\nabla\\cdot\\vec u = 0 \\\\' +
      `\\mathrm{Re} &= \\tfrac{UD}{\\nu} = ${hl((U_REAL * D_REAL) / 1.5e-5, 0)}\\ \\text{(real)},\\ ${hl((JET_U * JET_D) / VISC, 0)}\\ \\text{(grid)},\\quad |\\omega|_{\\text{max}} = ${hl(m.vort, 0)}\\,\\text{s}^{-1} \\\\` +
      (travel ? travel + ' \\\\' : '') +
      `&${phase}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uField;
    uniform float uAh;
    uniform float uChoo;
    varying vec2 vUv;

    const vec2 GRID = vec2(${NX.toFixed(1)}, ${NY.toFixed(1)});
    const vec2 MOUTH = vec2(${MOUTH_X.toFixed(1)}, ${MOUTH_Y.toFixed(1)});

    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    vec2 rot(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }

    void main() {
      // The grid fills the width (2 : 1), centred.
      float cellPx = min(uResolution.x / GRID.x, uResolution.y * 0.8 / GRID.y);
      vec2 origin = 0.5 * (uResolution - GRID * cellPx);
      vec2 g = (vUv * uResolution - origin) / cellPx;       // grid coordinates
      vec3 col = vec3(0.012, 0.014, 0.022);
      if (g.x >= 0.0 && g.y >= 0.0 && g.x <= GRID.x && g.y <= GRID.y) {
        col = vec3(0.02, 0.024, 0.035);
        vec4 f = texture2D(uField, g / GRID);
        float dye = f.r;
        float w = (f.g - 0.5) * 2.0;                          // vorticity, −1 … 1
        vec3 slime = mix(vec3(0.35, 0.55, 0.15), vec3(0.75, 0.95, 0.4), dye);
        col = mix(col, slime, clamp(dye * 1.4, 0.0, 0.92));
        col += (w > 0.0 ? vec3(0.9, 0.35, 0.6) : vec3(0.3, 0.55, 1.0)) * abs(w) * 0.35;
        // The camera, at the right edge.
        col += vec3(0.5, 0.5, 0.6) * smoothstep(0.6, 0.0, abs(g.x - GRID.x + 1.0)) * step(abs(g.y - MOUTH.y), 10.0);
      }
      // Frame.
      vec2 fr = abs(g - GRID * 0.5) - GRID * 0.5;
      col += vec3(0.15, 0.17, 0.22) * smoothstep(0.35, 0.0, abs(max(fr.x, fr.y)));

      // The robot's head, just behind the mouth; it leans back for "ah" and snaps forward for "CHOO".
      float lean = 0.35 * uAh - 0.25 * uChoo;
      vec2 p = rot(g - (MOUTH + vec2(-8.0, 0.0)), -lean) / 7.0;
      float head = box(p, vec2(0.9, 0.8), 0.25);
      vec3 metal = mix(vec3(0.5, 0.55, 0.63), vec3(0.85, 0.88, 0.93), smoothstep(-0.8, 0.8, p.y));
      float a = 1.5 / (7.0 * cellPx);                     // about a pixel, in head units
      col = mix(col, metal, smoothstep(a, -a, head));
      float stalk = box(p - vec2(0.0, 1.05), vec2(0.05, 0.25), 0.03);
      col = mix(col, vec3(0.6, 0.65, 0.72), smoothstep(a, -a, stalk));
      col = mix(col, vec3(0.95, 0.3, 0.25), smoothstep(a, -a, length(p - vec2(0.0, 1.35)) - 0.15));
      // Eyes: squeezed shut for "ah".
      float open = 1.0 - 0.85 * uAh;
      float eye = box(p - vec2(0.45, 0.25), vec2(0.18, 0.16 * open), 0.05);
      col = mix(col, vec3(0.37, 0.95, 1.0), smoothstep(a, -a, eye));
      // Mouth: a slot that opens for the sneeze.
      float mouth = box(p - vec2(0.75, -0.3), vec2(0.18, 0.05 + 0.22 * max(uChoo, 0.4 * uAh)), 0.04);
      col = mix(col, vec3(0.08, 0.06, 0.08), smoothstep(a, -a, mouth));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    const data = new Uint8Array(NX * NY * 4);
    const tex = new THREE.DataTexture(data, NX, NY, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { uField: { value: tex }, uAh: { value: 0 }, uChoo: { value: 0 } };
  },

  setup() {
    return { fluid: fresh(), owed: 0, lastS: 0 };
  },

  update(ctx, state) {
    const m = ctx.motion;
    // A new loop: a fresh, still room.
    if (m.s < state.lastS) state.fluid = fresh();
    state.lastS = m.s;
    const f = state.fluid;

    state.owed += Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1) * STEPS_PER_SECOND;
    const n = Math.min(4, Math.floor(state.owed));
    state.owed -= Math.floor(state.owed);
    for (let k = 0; k < n; k++) {
      step(f, m.choo, 0.12 * Math.sin(f.steps * 0.35));
      f.steps++;
    }

    // Readouts: peak vorticity, and the cloud's front (rightmost column with dye).
    const data = state.uniforms.uField.value.image.data;
    let vmax = 0;
    let front = 0;
    for (let j = 1; j <= NY; j++) {
      for (let i = 1; i <= NX; i++) {
        const c = IX(i, j);
        const w = 0.5 * (f.v[c + 1] - f.v[c - 1] - (f.u[c + W] - f.u[c - W])); // per step
        vmax = Math.max(vmax, Math.abs(w));
        // The front: the furthest point where the dye crosses 0.08, to a fraction of a cell.
        if (f.dye[c] > 0.08 && i >= front) {
          const next = f.dye[c + 1];
          front = Math.max(front, next < 0.08 ? i + (f.dye[c] - 0.08) / (f.dye[c] - next) : i + 1);
        }
        const o = ((j - 1) * NX + (i - 1)) * 4;
        data[o] = Math.min(255, f.dye[c] * 255);
        data[o + 1] = Math.max(0, Math.min(255, 128 + w * 2500));
        data[o + 3] = 255;
      }
    }
    state.uniforms.uField.value.needsUpdate = true;
    const frontM = Math.max(0, front - MOUTH_X) * METRES_PER_CELL;
    if (n > 0) {
      const speed = (frontM - f.front) / (n * SECONDS_PER_STEP); // m/s
      f.frontSpeed += 0.04 * (speed - f.frontSpeed);
      f.front = frontM;
    }
    m.frontM = frontM;
    m.vort = vmax / SECONDS_PER_STEP;
    m.eta = f.frontSpeed > 0.05 && frontM < CAMERA_M - 0.01 ? ((CAMERA_M - frontM) / f.frontSpeed) * 1000 : Infinity;
    state.uniforms.uAh.value = m.ah;
    state.uniforms.uChoo.value = m.choo;
  },

  dispose(ctx, state) {
    state.uniforms?.uField.value.dispose();
  },
};
