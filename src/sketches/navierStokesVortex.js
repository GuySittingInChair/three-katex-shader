import * as THREE from 'three';

// A real 2D incompressible Navier–Stokes solver — Jos Stam's semi-Lagrangian
// "Stable Fluids" method (SIGGRAPH '99): diffuse, project (Gauss–Seidel
// pressure solve to remove divergence), advect, project again. Vorticity
// confinement is layered on top to keep the vortex crisp instead of
// dissipating into mush after a few seconds, the way a naive solver would.
// Boundaries are periodic (the grid wraps), matching the toroidal indexing
// already used by gameOfLife.js and reactionDiffusion.js in this project.

const N = 72; // grid is N×N; a "Stable Fluids" step here costs roughly N²×150 flops
const CELLS = N * N;
const ITER_DIFFUSE = 8;
const ITER_PROJECT = 40; // under-converges below ~30 at this N — the pressure solve needs the headroom
const ITER_DYE_DIFFUSE = 3;
const DYE_FADE = 0.996; // slow decay so continuous injection reaches equilibrium, not saturation
// Continuous stirring pumps energy in forever with nowhere for it to leave
// (viscosity alone is far too weak to balance it) — without this the vortex
// spins up, drifts off-center, and disintegrates within a few seconds.
const VELOCITY_DRAG = 0.985;

let vx, vy, vx0, vy0;
let dyeR, dyeG, dyeB, dyeR0, dyeG0, dyeB0;
let pressure, divergence, curl;
let display;

function seed() {
  vx = new Float32Array(CELLS);
  vy = new Float32Array(CELLS);
  vx0 = new Float32Array(CELLS);
  vy0 = new Float32Array(CELLS);
  dyeR = new Float32Array(CELLS);
  dyeG = new Float32Array(CELLS);
  dyeB = new Float32Array(CELLS);
  dyeR0 = new Float32Array(CELLS);
  dyeG0 = new Float32Array(CELLS);
  dyeB0 = new Float32Array(CELLS);
  pressure = new Float32Array(CELLS);
  divergence = new Float32Array(CELLS);
  curl = new Float32Array(CELLS);
  display = new Uint8Array(CELLS * 4);
  for (let i = 3; i < display.length; i += 4) display[i] = 255; // opaque alpha
}

// Wraps (x,y) onto the toroidal grid and returns its flat index.
function IDX(x, y) {
  x = ((x % N) + N) % N;
  y = ((y % N) + N) % N;
  return y * N + x;
}

function copyInto(dst, src) {
  dst.set(src);
}

// Implicit diffusion via Gauss–Seidel relaxation — unconditionally stable,
// unlike an explicit finite-difference step, so the sim can't blow up
// however coarse a frame's dt gets.
function diffuse(field, field0, rate, dt, iters) {
  const a = dt * rate * N * N;
  const invA = 1 / (1 + 4 * a);
  for (let k = 0; k < iters; k++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const sum =
          field[IDX(x - 1, y)] + field[IDX(x + 1, y)] + field[IDX(x, y - 1)] + field[IDX(x, y + 1)];
        field[i] = (field0[i] + a * sum) * invA;
      }
    }
  }
}

// Semi-Lagrangian advection: for each cell, trace backward along the
// velocity field and bilinearly sample where the fluid "came from". This is
// the trick (Stam '99) that makes advection stable at any timestep.
function advect(field, field0, velX, velY, dt) {
  const dt0 = dt * N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let px = ((x - dt0 * velX[i]) % N + N) % N;
      let py = ((y - dt0 * velY[i]) % N + N) % N;

      const x0 = Math.floor(px), x1 = (x0 + 1) % N;
      const y0 = Math.floor(py), y1 = (y0 + 1) % N;
      const sx1 = px - x0, sx0 = 1 - sx1;
      const sy1 = py - y0, sy0 = 1 - sy1;

      field[i] =
        sx0 * (sy0 * field0[y0 * N + x0] + sy1 * field0[y1 * N + x0]) +
        sx1 * (sy0 * field0[y0 * N + x1] + sy1 * field0[y1 * N + x1]);
    }
  }
}

// Helmholtz decomposition: solves a pressure Poisson equation and subtracts
// its gradient off the velocity field, leaving it divergence-free —
// "incompressible" is enforced right here.
function project(velX, velY, p, div, iters) {
  const h = 1 / N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      div[i] =
        -0.5 * h * (velX[IDX(x + 1, y)] - velX[IDX(x - 1, y)] + velY[IDX(x, y + 1)] - velY[IDX(x, y - 1)]);
      p[i] = 0;
    }
  }
  for (let k = 0; k < iters; k++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        p[i] = (div[i] + p[IDX(x - 1, y)] + p[IDX(x + 1, y)] + p[IDX(x, y - 1)] + p[IDX(x, y + 1)]) / 4;
      }
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      velX[i] -= (0.5 * (p[IDX(x + 1, y)] - p[IDX(x - 1, y)])) / h;
      velY[i] -= (0.5 * (p[IDX(x, y + 1)] - p[IDX(x, y - 1)])) / h;
    }
  }
}

// Vorticity confinement (Fedkiw et al. 2001): finds the local spin at every
// cell, then pushes fluid toward the cores of that spin. Without this a
// vortex quietly smooths itself away within a couple of seconds; with it,
// the swirl stays sharp indefinitely.
function vorticityConfinement(velX, velY, dt, eps) {
  if (eps <= 0) return;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      curl[i] =
        (velY[IDX(x + 1, y)] - velY[IDX(x - 1, y)]) * 0.5 -
        (velX[IDX(x, y + 1)] - velX[IDX(x, y - 1)]) * 0.5;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const gx = (Math.abs(curl[IDX(x + 1, y)]) - Math.abs(curl[IDX(x - 1, y)])) * 0.5;
      const gy = (Math.abs(curl[IDX(x, y + 1)]) - Math.abs(curl[IDX(x, y - 1)])) * 0.5;
      const len = Math.sqrt(gx * gx + gy * gy) + 1e-5;
      const nx = gx / len, ny = gy / len;
      const w = curl[i];
      velX[i] += eps * w * ny * dt;
      velY[i] -= eps * w * nx * dt;
    }
  }
}

// The engine that keeps one vortex alive at the grid's center: a tangential
// force, strongest at the core and fading outward, exactly like a hand
// slowly stirring a cup — this is the "spinning vortex" the equations wind
// dye around.
function addStir(velX, velY, dt, strength) {
  const cx = N / 2, cy = N / 2;
  const coreR = N * 0.16; // tight — a wide core spreads the spin into a diffuse regional swirl, not one sharp vortex
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 0.5) continue;
      const falloff = Math.exp(-(r * r) / (2 * coreR * coreR));
      const i = y * N + x;
      velX[i] += (strength * falloff * -dy) / r * dt;
      velY[i] += (strength * falloff * dx) / r * dt;
    }
  }
}

// Three colored ink sources orbit the vortex core, continuously feeding it
// fresh dye — without this the field would eventually blend to a flat
// average color instead of staying visually alive.
const DYE_SOURCES = [
  { r: 1.0, g: 0.3, b: 0.15, offset: 0 },
  { r: 0.15, g: 0.75, b: 1.0, offset: (2 * Math.PI) / 3 },
  { r: 1.0, g: 0.85, b: 0.2, offset: (4 * Math.PI) / 3 },
];
function addDyeSources(dt, t) {
  const cx = N / 2, cy = N / 2;
  const orbitR = N * 0.22; // just outside the stir core, where shear winds it fastest
  const sigma = 2.2;
  const amount = 14 * dt;
  for (const src of DYE_SOURCES) {
    const angle = t * 0.18 + src.offset;
    const cxi = Math.round(cx + Math.cos(angle) * orbitR);
    const cyi = Math.round(cy + Math.sin(angle) * orbitR);
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        if (w < 0.01) continue;
        const i = IDX(cxi + dx, cyi + dy);
        dyeR[i] += src.r * amount * w;
        dyeG[i] += src.g * amount * w;
        dyeB[i] += src.b * amount * w;
      }
    }
  }
}

function packDisplay() {
  for (let i = 0; i < CELLS; i++) {
    display[i * 4] = Math.min(255, dyeR[i] * 255);
    display[i * 4 + 1] = Math.min(255, dyeG[i] * 255);
    display[i * 4 + 2] = Math.min(255, dyeB[i] * 255);
  }
}

export default {
  name: 'Navier–Stokes Vortex',
  description:
    "A real 2D incompressible Navier–Stokes solver — Jos Stam's semi-Lagrangian 'Stable Fluids' method, " +
    'with vorticity confinement — stirred into one persistent spinning vortex that winds colored dye into ' +
    'spiraling, spaghetti-like filaments.',
  tags: ['fluid', 'navier-stokes', 'simulation', 'vortex'],
  category: 'Fluid Flow',
  mode: 'shader',
  shaderLang: 'glsl',
  latex:
    '\\partial_t \\mathbf{u} + (\\mathbf{u}\\cdot\\nabla)\\mathbf{u} = -\\nabla p + \\nu\\nabla^2\\mathbf{u}, \\quad \\nabla\\cdot\\mathbf{u} = 0',

  params: {
    stir: { value: 6, min: 0, max: 15 },
    confinement: { value: 1.0, min: 0, max: 6 },
    viscosity: { value: 0.0002, min: 0, max: 0.001 },
    dyeDiffusion: { value: 0.00004, min: 0, max: 0.001 },
    speed: { value: 1, min: 1, max: 3, step: 1 },
  },

  fragmentShader: `
    uniform sampler2D uField;
    varying vec2 vUv;

    void main() {
      vec3 dye = texture2D(uField, vUv).rgb;
      // Reinhard tonemap so accumulating dye glows instead of clipping to white.
      vec3 color = dye / (1.0 + dye);
      color = pow(color, vec3(0.8));
      vec3 bg = vec3(0.02, 0.015, 0.035);
      gl_FragColor = vec4(bg + color, 1.0);
    }
  `,

  uniforms() {
    seed();
    const texture = new THREE.DataTexture(display, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return { uField: { value: texture } };
  },

  setup() {
    return { simTime: 0 };
  },

  update(ctx, state) {
    const dt = 1 / 60; // fixed sim step — a stable, repeatable swirl regardless of frame-rate hiccups
    const substeps = Math.round(ctx.params.speed);

    for (let s = 0; s < substeps; s++) {
      state.simTime += dt;

      addStir(vx, vy, dt, ctx.params.stir);
      vorticityConfinement(vx, vy, dt, ctx.params.confinement);

      copyInto(vx0, vx);
      diffuse(vx, vx0, ctx.params.viscosity, dt, ITER_DIFFUSE);
      copyInto(vy0, vy);
      diffuse(vy, vy0, ctx.params.viscosity, dt, ITER_DIFFUSE);
      project(vx, vy, pressure, divergence, ITER_PROJECT);

      copyInto(vx0, vx);
      copyInto(vy0, vy);
      advect(vx, vx0, vx0, vy0, dt);
      advect(vy, vy0, vx0, vy0, dt);
      project(vx, vy, pressure, divergence, ITER_PROJECT);

      // Continuous stirring has no natural sink in a periodic domain — drag
      // it off here, or the vortex spins up and drifts apart within seconds.
      for (let i = 0; i < CELLS; i++) {
        vx[i] *= VELOCITY_DRAG;
        vy[i] *= VELOCITY_DRAG;
      }

      addDyeSources(dt, state.simTime);

      copyInto(dyeR0, dyeR);
      diffuse(dyeR, dyeR0, ctx.params.dyeDiffusion, dt, ITER_DYE_DIFFUSE);
      copyInto(dyeG0, dyeG);
      diffuse(dyeG, dyeG0, ctx.params.dyeDiffusion, dt, ITER_DYE_DIFFUSE);
      copyInto(dyeB0, dyeB);
      diffuse(dyeB, dyeB0, ctx.params.dyeDiffusion, dt, ITER_DYE_DIFFUSE);

      copyInto(dyeR0, dyeR);
      advect(dyeR, dyeR0, vx, vy, dt);
      copyInto(dyeG0, dyeG);
      advect(dyeG, dyeG0, vx, vy, dt);
      copyInto(dyeB0, dyeB);
      advect(dyeB, dyeB0, vx, vy, dt);

      for (let i = 0; i < CELLS; i++) {
        dyeR[i] *= DYE_FADE;
        dyeG[i] *= DYE_FADE;
        dyeB[i] *= DYE_FADE;
      }
    }

    packDisplay();
    state.uniforms.uField.value.image.data = display;
    state.uniforms.uField.value.needsUpdate = true;
  },
};
