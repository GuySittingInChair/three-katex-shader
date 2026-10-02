import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';

// A robot sneezes on another robot, and the incompressible Navier–Stokes
// equations take it from there:
//
//     ∂u/∂t + (u·∇)u = −∇p + ν∇²u,   ∇·u = 0
//
// solved on a 96 × 64 grid with Stam's "stable fluids" scheme: diffuse
// (implicit), project (make it divergence-free by solving for the
// pressure), advect (trace back along the flow), project again. The green
// stuff is a dye carried by the flow; the faint pink and blue edges are the
// vorticity ω = ∇ × u, spinning one way or the other. The victim's head is a
// solid obstacle (the flow inside it is held at zero, a simple
// approximation), so the cloud splats on his face rather than passing
// through.
//
// The grid is fixed to the real world: a cell is 4 mm (the 2 cm mouth is 5
// cells) and a step is 0.48 ms, so the sliders are in real units. Sneeze
// speed U in m/s; viscosity ν as a multiple of air's (1.5 × 10⁻⁵ m²/s). The
// Reynolds number Re = UD/ν is then the true one for the fluid you've
// picked. Real air at 10 m/s would be Re ≈ 13,000, too fine for a grid this
// coarse, so the slider starts at 10× air (still thinner-feeling than it
// sounds: olive oil is about 5× air) and goes up to about 300× air, which is
// in honey territory. The simulation adds some numerical viscosity of its
// own on top, so treat the low end as "at least this viscous".
//
// Loop (10 s): ah… ah… (the sneezer leans back) CHOO, then the cloud
// drifts toward the other robot, who gets nervous, and then gets hit, or
// doesn't. Simulated, not a closed-form loop; it resets each loop.

const PERIOD = 10;
const NX = 96;
const NY = 64;
const W = NX + 2;
const SIZE = W * (NY + 2);
const MOUTH_X = 20; // the jet starts here (cells)
const MOUTH_Y = 32;
const JET_D = 5; // cells: the 2 cm mouth
const METRES_PER_CELL = 0.004;
const SECONDS_PER_STEP = 0.00048;
const NU_AIR = 1.5e-5;
const STEPS_PER_SECOND = 60; // of animation time
const CHOO_START = 2.3; // seconds into the loop
const CHOO_END = 2.9;
// The victim: head centre and half-size in cells (drawn at 7 cells per unit, head 0.9 × 0.8).
const VX = 76;
const VY = MOUTH_Y;
const VHX = 6;
const VHY = 5;
const FACE_M = (VX - VHX - 1 - MOUTH_X) * METRES_PER_CELL; // mouth to his face

const IX = (i, j) => i + W * j;
const inHead = (i, j) => Math.abs(i - VX) <= VHX && Math.abs(j - VY) <= VHY;
const HEAD = [];
for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) if (inHead(i, j)) HEAD.push(IX(i, j));

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

// The victim's head: no flow inside it.
function solidHead(u, v) {
  for (const n of HEAD) {
    u[n] = 0;
    v[n] = 0;
  }
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
  relax(b, x, x0, rate, 1 + 4 * rate, Math.min(20, 4 + Math.ceil(rate * 40)));
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
  solidHead(u, v);
}

// One step. jetU: the sneeze's speed in cells per step (0 when not sneezing); nu: cells² per step.
function step(f, jetU, nu, wobble) {
  const { u, v, u0, v0, dye, dye0 } = f;
  if (jetU > 0) {
    // The sneeze: a jet out of the mouth, with a little wobble so it isn't perfectly straight.
    for (let j = MOUTH_Y - 2; j <= MOUTH_Y + 2; j++) {
      for (let i = MOUTH_X; i < MOUTH_X + 3; i++) {
        const n = IX(i, j);
        u[n] = jetU;
        v[n] = jetU * wobble;
        dye[n] = Math.min(1.5, dye[n] + 0.5);
      }
    }
  }
  u0.set(u);
  v0.set(v);
  diffuse(1, u, u0, nu);
  diffuse(2, v, v0, nu);
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
  return { u: a(), v: a(), u0: a(), v0: a(), dye: a(), dye0: a(), p: a(), div: a(), steps: 0, chooStep: -1, front: 0, frontSpeed: 0, hitStep: -1, hitAt: 0 };
}

export default {
  name: 'Navier–Stokes of a Sneeze',
  description:
    'A robot sneezes on another robot and the incompressible Navier–Stokes equations take over: the jet rolls ' +
    'into a vortex pair and splats on his face (he is not pleased). Sliders set the sneeze speed and the ' +
    'viscosity, from 10× air to honey; the true Reynolds number and the time to impact are live.',
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
    return { s, ah: s < CHOO_START ? ah : after, choo, frontM: 0, eta: Infinity, hitMs: -1, started: s >= CHOO_START };
  },

  latex: (params, hl, m) => {
    const U = params.sneezeSpeed;
    const nu = params.viscosity * NU_AIR;
    const re = (U * JET_D * METRES_PER_CELL) / nu;
    const reAir = (U * JET_D * METRES_PER_CELL) / NU_AIR;
    let story;
    if (m.s < 1.2) story = '\\text{ah}\\ldots';
    else if (m.s < CHOO_START) story = '\\text{ah}\\ldots\\ \\text{ah}\\ldots';
    else if (m.s < 3.2) story = '\\textbf{CHOO}';
    else if (m.hitMs >= 0) story = `\\text{direct hit, } ${hl(m.hitMs, 0)}\\ \\text{ms after the sneeze. ew.}`;
    else if (Number.isFinite(m.eta)) story = `\\text{front at } ${hl(m.frontM, 2)}\\ \\text{m; at this speed it hits him in } ${hl(m.eta, 0)}\\ \\text{ms}`;
    else story = `\\text{front at } ${hl(m.frontM, 2)}\\ \\text{m: stalled, he's safe}`;
    return (
      '\\begin{aligned}' +
      '\\partial_t \\vec u + (\\vec u\\cdot\\nabla)\\vec u &= -\\nabla p + \\nu\\nabla^2\\vec u,\\quad \\nabla\\cdot\\vec u = 0 \\\\' +
      `U &= ${hl(U, 0)}\\,\\tfrac{\\text{m}}{\\text{s}},\\quad \\nu = ${hl(params.viscosity, 0)}\\times\\nu_{\\text{air}} \\\\` +
      `\\mathrm{Re} &= \\tfrac{UD}{\\nu} = ${hl(re, 0)}\\ \\ (\\text{air would be } ${hl(reAir, 0)}) \\\\` +
      `&${story}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    sneezeSpeed: { value: 15, min: 3, max: 25, step: 1 },
    viscosity: { value: 25, min: 10, max: 300, step: 1 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uField;
    uniform float uAh;
    uniform float uChoo;
    uniform float uNervous;
    uniform float uHit;
    uniform float uSinceHit;
    varying vec2 vUv;

    const vec2 GRID = vec2(${NX.toFixed(1)}, ${NY.toFixed(1)});
    const vec2 MOUTH = vec2(${MOUTH_X.toFixed(1)}, ${MOUTH_Y.toFixed(1)});
    const vec2 VICTIM = vec2(${VX.toFixed(1)}, ${VY.toFixed(1)});

    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    float segment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
    }
    vec2 rot(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }

    // A robot head in profile, facing +x, in head units (p), with a pixel of 'a'.
    vec3 head(vec3 col, vec2 p, float a, vec3 tint) {
      float stalk = box(p - vec2(0.0, 1.05), vec2(0.05, 0.25), 0.03);
      col = mix(col, vec3(0.6, 0.65, 0.72), smoothstep(a, -a, stalk));
      col = mix(col, vec3(0.95, 0.3, 0.25), smoothstep(a, -a, length(p - vec2(0.0, 1.35)) - 0.15));
      float h = box(p, vec2(0.9, 0.8), 0.25);
      vec3 metal = mix(vec3(0.5, 0.55, 0.63), vec3(0.85, 0.88, 0.93), smoothstep(-0.8, 0.8, p.y));
      col = mix(col, metal * tint, smoothstep(a, -a, h));
      return col;
    }

    void main() {
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
      }
      vec2 fr = abs(g - GRID * 0.5) - GRID * 0.5;
      col += vec3(0.15, 0.17, 0.22) * smoothstep(0.35, 0.0, abs(max(fr.x, fr.y)));
      float a = 1.5 / (7.0 * cellPx);                       // about a pixel, in head units
      vec3 ink = vec3(0.08, 0.06, 0.08);

      // ---- The sneezer: leans back for "ah", snaps forward for "CHOO".
      float lean = 0.35 * uAh - 0.25 * uChoo;
      vec2 p = rot(g - (MOUTH + vec2(-8.0, 0.0)), -lean) / 7.0;
      col = head(col, p, a, vec3(1.0));
      float open = 1.0 - 0.85 * uAh;
      col = mix(col, vec3(0.37, 0.95, 1.0), smoothstep(a, -a, box(p - vec2(0.45, 0.25), vec2(0.18, 0.16 * open), 0.05)));
      col = mix(col, ink, smoothstep(a, -a, box(p - vec2(0.75, -0.3), vec2(0.18, 0.05 + 0.22 * max(uChoo, 0.4 * uAh)), 0.04)));

      // ---- The victim, facing the sneezer (mirrored). He shakes his head after the hit.
      float shake = 0.35 * sin(uSinceHit * 45.0) * exp(-uSinceHit * 2.5) * uHit;
      vec2 q = (g - VICTIM - vec2(shake, 0.0)) / 7.0;
      q.x = -q.x;
      col = head(col, q, a, mix(vec3(1.0), vec3(0.75, 1.0, 0.55), 0.6 * uHit));   // turning green
      // Eye: normal, wide when nervous, squeezed shut (">") when hit.
      vec2 e = q - vec2(0.45, 0.25);
      if (uHit > 0.5) {
        float chevron = min(segment(e, vec2(-0.12, 0.12), vec2(0.1, 0.0)), segment(e, vec2(-0.12, -0.12), vec2(0.1, 0.0))) - 0.045;
        col = mix(col, ink, smoothstep(a, -a, chevron));
      } else {
        float wide = 1.0 + 0.5 * uNervous;
        col = mix(col, vec3(0.37, 0.95, 1.0), smoothstep(a, -a, box(e, vec2(0.15, 0.16) * wide, 0.06)));
        col = mix(col, ink, smoothstep(a, -a, length(e - vec2(-0.05 * uNervous, 0.0)) - 0.06 * wide));
      }
      // Mouth: a flat line, a worried "o", or a wobbly grimace with the tongue out.
      vec2 mth = q - vec2(0.6, -0.35);
      if (uHit > 0.5) {
        float wave = abs(mth.y - 0.06 * sin(mth.x * 28.0 + uSinceHit * 6.0)) - 0.04;
        col = mix(col, ink, smoothstep(a, -a, max(wave, abs(mth.x) - 0.28)));
        float tongue = length((mth - vec2(0.08, -0.12)) / vec2(0.1, 0.14)) - 1.0;
        col = mix(col, vec3(0.95, 0.45, 0.55), smoothstep(0.08, -0.08, tongue));
      } else if (uNervous > 0.3) {
        col = mix(col, ink, smoothstep(a, -a, abs(length(mth) - 0.1) - 0.035));
      } else {
        col = mix(col, ink, smoothstep(a, -a, box(mth, vec2(0.22, 0.03), 0.02)));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    const data = new Uint8Array(NX * NY * 4);
    const tex = new THREE.DataTexture(data, NX, NY, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return {
      uField: { value: tex },
      uAh: { value: 0 },
      uChoo: { value: 0 },
      uNervous: { value: 0 },
      uHit: { value: 0 },
      uSinceHit: { value: 0 },
    };
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
    const jetU = (ctx.params.sneezeSpeed * SECONDS_PER_STEP) / METRES_PER_CELL; // m/s → cells per step
    const nu = (ctx.params.viscosity * NU_AIR * SECONDS_PER_STEP) / METRES_PER_CELL ** 2; // m²/s → cells² per step

    state.owed += Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1) * STEPS_PER_SECOND;
    const n = Math.min(4, Math.floor(state.owed));
    state.owed -= Math.floor(state.owed);
    for (let k = 0; k < n; k++) {
      if (m.choo > 0 && f.chooStep < 0) f.chooStep = f.steps;
      step(f, jetU * m.choo, nu, 0.12 * Math.sin(f.steps * 0.35));
      f.steps++;
    }

    // Readouts and the picture: the cloud's front, and whether it has reached his face.
    const data = state.uniforms.uField.value.image.data;
    let front = 0;
    let onFace = 0;
    for (let j = 1; j <= NY; j++) {
      for (let i = 1; i <= NX; i++) {
        const c = IX(i, j);
        const w = 0.5 * (f.v[c + 1] - f.v[c - 1] - (f.u[c + W] - f.u[c - W]));
        if (f.dye[c] > 0.08 && i >= front && i < VX - VHX) {
          const next = f.dye[c + 1];
          front = Math.max(front, next < 0.08 ? i + (f.dye[c] - 0.08) / (f.dye[c] - next) : i + 1);
        }
        if (i >= VX - VHX - 3 && i < VX - VHX && Math.abs(j - VY) <= VHY) onFace = Math.max(onFace, f.dye[c]);
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
    if (f.hitStep < 0 && onFace > 0.12 && f.chooStep >= 0) {
      f.hitStep = f.steps;
      f.hitAt = m.s;
    }
    m.frontM = Math.min(frontM, FACE_M);
    m.hitMs = f.hitStep >= 0 ? (f.hitStep - f.chooStep) * SECONDS_PER_STEP * 1000 : -1;
    m.eta = f.hitStep < 0 && f.frontSpeed > 0.05 ? ((FACE_M - frontM) / f.frontSpeed) * 1000 : Infinity;

    const u = state.uniforms;
    u.uAh.value = m.ah;
    u.uChoo.value = m.choo;
    u.uHit.value = f.hitStep >= 0 ? 1 : 0;
    u.uSinceHit.value = f.hitStep >= 0 ? m.s - f.hitAt : 0;
    // Nervous as the cloud closes in (within 6 cm).
    u.uNervous.value = f.chooStep >= 0 ? Math.max(0, Math.min(1, 1 - (FACE_M - frontM) / 0.06)) : 0;
  },

  dispose(ctx, state) {
    state.uniforms?.uField.value.dispose();
  },
};
