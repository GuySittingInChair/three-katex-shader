import * as THREE from 'three';

const SIZE = 80;
const CELLS = SIZE * SIZE;
let U = new Float32Array(CELLS);
let V = new Float32Array(CELLS);
const display = new Uint8Array(CELLS);

function seed() {
  U.fill(1.0);
  V.fill(0.0);
  const patches = 5;
  for (let p = 0; p < patches; p++) {
    const cx = Math.floor(SIZE / 2 + (Math.random() - 0.5) * SIZE * 0.3);
    const cy = Math.floor(SIZE / 2 + (Math.random() - 0.5) * SIZE * 0.3);
    const r = 3 + Math.floor(Math.random() * 3);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = (cx + dx + SIZE) % SIZE;
        const y = (cy + dy + SIZE) % SIZE;
        const idx = y * SIZE + x;
        U[idx] = 0.5;
        V[idx] = 1.0;
      }
    }
  }
}

function laplacian(field, x, y) {
  const up = field[((y - 1 + SIZE) % SIZE) * SIZE + x];
  const down = field[((y + 1) % SIZE) * SIZE + x];
  const left = field[y * SIZE + ((x - 1 + SIZE) % SIZE)];
  const right = field[y * SIZE + ((x + 1) % SIZE)];
  return up + down + left + right - 4 * field[y * SIZE + x];
}

function step(feed, kill) {
  const Du = 0.16;
  const Dv = 0.08;
  const dt = 1.0;
  const nextU = new Float32Array(CELLS);
  const nextV = new Float32Array(CELLS);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = y * SIZE + x;
      const u = U[idx];
      const v = V[idx];
      const uvv = u * v * v;
      const lapU = laplacian(U, x, y);
      const lapV = laplacian(V, x, y);
      let nu = u + (Du * lapU - uvv + feed * (1 - u)) * dt;
      let nv = v + (Dv * lapV + uvv - (feed + kill) * v) * dt;
      nextU[idx] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
      nextV[idx] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
    }
  }
  U = nextU;
  V = nextV;
}

function writeDisplay() {
  for (let i = 0; i < CELLS; i++) {
    const value = U[i] - V[i];
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    display[i] = Math.round(clamped * 255);
  }
}

export default {
  name: 'Reaction-Diffusion',
  description: 'Gray-Scott two-chemical reaction-diffusion — coral and mitosis-like patterns emerging from a PDE.',
  tags: ['reaction-diffusion', 'simulation', 'gray-scott'],
  category: 'Reaction-Diffusion',
  mode: 'shader',
  shaderLang: 'glsl',
  latex:
    '\\partial_t u = D_u \\nabla^2 u - uv^2 + f(1-u), \\quad \\partial_t v = D_v \\nabla^2 v + uv^2 - (f{+}k)v',

  params: {
    feed: { value: 0.0367, min: 0.01, max: 0.09 },
    kill: { value: 0.0649, min: 0.03, max: 0.07 },
    speed: { value: 6, min: 1, max: 12 },
  },

  fragmentShader: `
    uniform sampler2D uField;
    varying vec2 vUv;

    void main() {
      float v = texture2D(uField, vUv).r;
      vec3 low = vec3(0.02, 0.03, 0.08);
      vec3 mid = vec3(0.1, 0.4, 0.55);
      vec3 high = vec3(0.95, 0.85, 0.55);
      vec3 color = v < 0.5 ? mix(low, mid, v * 2.0) : mix(mid, high, (v - 0.5) * 2.0);
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
      step(ctx.params.feed, ctx.params.kill);
    }
    writeDisplay();
    state.uniforms.uField.value.image.data = display;
    state.uniforms.uField.value.needsUpdate = true;
  },
};
