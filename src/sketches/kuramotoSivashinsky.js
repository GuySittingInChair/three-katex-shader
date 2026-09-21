import * as THREE from 'three';

const SIZE = 96;
const CELLS = SIZE * SIZE;
let H = new Float32Array(CELLS);
const display = new Uint8Array(CELLS);

const CLAMP = 4.0;
const DISPLAY_RANGE = 2.2;

function seed() {
  for (let i = 0; i < CELLS; i++) H[i] = (Math.random() - 0.5) * 0.2;
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

// One explicit-Euler step of h_t = -∇²h - ∇⁴h - ½|∇h|², the "conserved"
// Kuramoto–Sivashinsky form used for flame-front / thin-film instabilities:
// the ∇²h term is anti-diffusive (it destabilizes short wavelengths), the
// ∇⁴h term is the hyperdiffusion that re-stabilizes them, and the gradient
// term is what folds the growing wrinkles into cells.
function step(dt, dx) {
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
      const dh = -lap[idx] - lap2[idx] - 0.5 * gradSq;
      let nh = H[idx] + dt * dh;
      if (nh > CLAMP) nh = CLAMP;
      else if (nh < -CLAMP) nh = -CLAMP;
      next[idx] = nh;
      mean += nh;
    }
  }
  // The equation has no term pinning the mean (a constant shift has zero
  // gradient/Laplacian) — recenter each step so it can't drift or overflow.
  mean /= CELLS;
  for (let i = 0; i < CELLS; i++) next[i] -= mean;
  H = next;
}

function writeDisplay() {
  for (let i = 0; i < CELLS; i++) {
    const v = H[i] / DISPLAY_RANGE;
    const clamped = v < -1 ? -1 : v > 1 ? 1 : v;
    display[i] = Math.round((clamped * 0.5 + 0.5) * 255);
  }
}

export default {
  name: 'Kuramoto–Sivashinsky',
  description: 'The canonical PDE for spatiotemporal chaos — a flame-front-like height field that anti-diffuses at long wavelengths, hyperdiffuses at short ones, and folds itself into ceaselessly wrinkling cells.',
  tags: ['pde', 'chaos', 'simulation', 'flame-front'],
  category: 'Chaos',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\partial_t h = -\\nabla^2 h - \\nabla^4 h - \\tfrac{1}{2}|\\nabla h|^2',

  params: {
    dt: { value: 0.04, min: 0.005, max: 0.1, step: 0.005 },
    spacing: { value: 1.3, min: 0.7, max: 2.2, step: 0.05 },
    speed: { value: 3, min: 1, max: 8, step: 1 },
  },

  fragmentShader: `
    uniform sampler2D uField;
    varying vec2 vUv;

    void main() {
      float v = texture2D(uField, vUv).r;

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
    return { uField: { value: texture } };
  },

  setup() {
    return {};
  },

  update(ctx, state) {
    const substeps = Math.round(ctx.params.speed);
    for (let i = 0; i < substeps; i++) {
      step(ctx.params.dt, ctx.params.spacing);
    }
    writeDisplay();
    state.uniforms.uField.value.image.data = display;
    state.uniforms.uField.value.needsUpdate = true;
  },
};
