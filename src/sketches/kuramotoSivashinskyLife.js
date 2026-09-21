import * as THREE from 'three';

const SIZE = 96;
const CELLS = SIZE * SIZE;
let H = new Float32Array(CELLS);
let LIFE = new Uint8Array(CELLS);
const display = new Uint8Array(CELLS);
const lifeDisplay = new Uint8Array(CELLS);

const CLAMP = 4.0;
const DISPLAY_RANGE = 2.2;

function seed() {
  for (let i = 0; i < CELLS; i++) H[i] = (Math.random() - 0.5) * 0.2;
  for (let i = 0; i < CELLS; i++) LIFE[i] = Math.random() < 0.22 ? 1 : 0;
}

function countNeighbors(x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + SIZE) % SIZE;
      const ny = (y + dy + SIZE) % SIZE;
      n += LIFE[ny * SIZE + nx];
    }
  }
  return n;
}

function stepLife() {
  const next = new Uint8Array(CELLS);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = y * SIZE + x;
      const n = countNeighbors(x, y);
      const alive = LIFE[idx];
      next[idx] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
    }
  }
  LIFE = next;
}

// 5-point Laplacian on a periodic (toroidal) grid.
function laplacian(field, out, invDxSq) {
  for (let y = 0; y < SIZE; y++) {
    const yUp = ((y - 1 + SIZE) % SIZE) * SIZE;
    const yDown = ((y + 1) % SIZE) * SIZE;
    const yRow = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const xLeft = (x - 1 + SIZE) % SIZE;
      const xRight = (x + 1) % SIZE;
      const c = field[yRow + x];
      out[yRow + x] = (field[yUp + x] + field[yDown + x] + field[yRow + xLeft] + field[yRow + xRight] - 4 * c) * invDxSq;
    }
  }
}

// Same Kuramoto–Sivashinsky step as the base sketch, plus a forcing term:
// wherever the independently-evolving Life board is alive, a constant
// source is added to h each step. Life supplies structured, self-organizing
// "fuel"; the KS dynamics fold, stretch, and eventually dissolve it into
// the surrounding chaos — order continuously being fed into and consumed
// by turbulence.
function step(dt, dx, drive) {
  const invDxSq = 1 / (dx * dx);
  const lap = new Float32Array(CELLS);
  const lap2 = new Float32Array(CELLS);
  laplacian(H, lap, invDxSq);
  laplacian(lap, lap2, invDxSq);

  const invDx = 1 / dx;
  const next = new Float32Array(CELLS);
  let mean = 0;
  for (let y = 0; y < SIZE; y++) {
    const yUp = ((y - 1 + SIZE) % SIZE) * SIZE;
    const yDown = ((y + 1) % SIZE) * SIZE;
    const yRow = y * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const xLeft = (x - 1 + SIZE) % SIZE;
      const xRight = (x + 1) % SIZE;
      const idx = yRow + x;
      const gx = (H[yRow + xRight] - H[yRow + xLeft]) * 0.5 * invDx;
      const gy = (H[yDown + x] - H[yUp + x]) * 0.5 * invDx;
      const gradSq = gx * gx + gy * gy;
      const dh = -lap[idx] - lap2[idx] - 0.5 * gradSq + drive * LIFE[idx];
      let nh = H[idx] + dt * dh;
      if (nh > CLAMP) nh = CLAMP;
      else if (nh < -CLAMP) nh = -CLAMP;
      next[idx] = nh;
      mean += nh;
    }
  }
  mean /= CELLS;
  for (let i = 0; i < CELLS; i++) next[i] -= mean;
  H = next;
}

function writeDisplay() {
  for (let i = 0; i < CELLS; i++) {
    const v = H[i] / DISPLAY_RANGE;
    const clamped = v < -1 ? -1 : v > 1 ? 1 : v;
    display[i] = Math.round((clamped * 0.5 + 0.5) * 255);
    lifeDisplay[i] = LIFE[i] ? 255 : 0;
  }
}

export default {
  name: 'Kuramoto–Sivashinsky — Life-Seeded',
  description: 'The Kuramoto–Sivashinsky chaos field, continuously fed by a Conway\'s Game of Life board evolving underneath it — Life\'s gliders and blinkers inject structured "fuel" that the PDE folds, stretches, and dissolves back into turbulence.',
  tags: ['pde', 'chaos', 'simulation', 'cellular-automata', 'game-of-life', 'hybrid'],
  category: 'Chaos',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\partial_t h = -\\nabla^2 h - \\nabla^4 h - \\tfrac{1}{2}|\\nabla h|^2 + \\varepsilon\\cdot\\text{alive}(\\mathbf{x})',

  params: {
    dt: { value: 0.04, min: 0.005, max: 0.1, step: 0.005 },
    spacing: { value: 1.3, min: 0.7, max: 2.2, step: 0.05 },
    speed: { value: 3, min: 1, max: 8, step: 1 },
    drive: { value: 0.35, min: 0.0, max: 1.2, step: 0.02 },
    genRate: { value: 4, min: 1, max: 15, step: 1 },
  },

  fragmentShader: `
    uniform sampler2D uField;
    uniform sampler2D uLife;
    varying vec2 vUv;

    void main() {
      float v = texture2D(uField, vUv).r;
      float life = texture2D(uLife, vUv).r;

      vec3 deep   = vec3(0.02, 0.03, 0.10);
      vec3 low    = vec3(0.05, 0.22, 0.45);
      vec3 mid    = vec3(0.85, 0.78, 0.55);
      vec3 high   = vec3(0.95, 0.45, 0.08);
      vec3 hottest = vec3(0.55, 0.02, 0.05);

      vec3 color;
      if (v < 0.35) color = mix(deep, low, v / 0.35);
      else if (v < 0.55) color = mix(low, mid, (v - 0.35) / 0.2);
      else if (v < 0.8) color = mix(mid, high, (v - 0.55) / 0.25);
      else color = mix(high, hottest, (v - 0.8) / 0.2);

      // Cool bright seam over cells the Life board currently occupies.
      color = mix(color, vec3(0.55, 0.98, 0.9), life * 0.75);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    seed();
    writeDisplay();
    const texture = new THREE.DataTexture(display, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const lifeTexture = new THREE.DataTexture(lifeDisplay, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    lifeTexture.magFilter = THREE.LinearFilter;
    lifeTexture.minFilter = THREE.LinearFilter;
    lifeTexture.wrapS = THREE.RepeatWrapping;
    lifeTexture.wrapT = THREE.RepeatWrapping;
    lifeTexture.needsUpdate = true;

    return { uField: { value: texture }, uLife: { value: lifeTexture } };
  },

  setup() {
    return { genTimer: 0 };
  },

  update(ctx, state) {
    state.genTimer += ctx.delta;
    const genInterval = 1 / ctx.params.genRate;
    while (state.genTimer >= genInterval) {
      state.genTimer -= genInterval;
      stepLife();
    }

    const substeps = Math.round(ctx.params.speed);
    for (let i = 0; i < substeps; i++) {
      step(ctx.params.dt, ctx.params.spacing, ctx.params.drive);
    }
    writeDisplay();
    state.uniforms.uField.value.image.data = display;
    state.uniforms.uField.value.needsUpdate = true;
    state.uniforms.uLife.value.image.data = lifeDisplay;
    state.uniforms.uLife.value.needsUpdate = true;
  },
};
