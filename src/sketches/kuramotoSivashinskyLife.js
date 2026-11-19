import * as THREE from 'three';

// The Kuramoto–Sivashinsky flame (see kuramotoSivashinsky.js), fed by a Game
// of Life board: wherever a Life square is alive, a steady push `drive` is
// added to h_t. Life supplies structured "fuel"; the flame folds, stretches
// and dissolves it.
//
// 2026-11-18: the equation now runs on the stable spectral solver in a worker
// (src/lib/ksWorker.js); the old square-by-square stepping froze after about
// 50 seconds. see docs/wiki/sketches/kuramotoSivashinsky-fix.md

const SIZE = 128;
const CELLS = SIZE * SIZE;
const DISPLAY_RANGE = 9;
let LIFE = new Uint8Array(CELLS);

// see docs/wiki/sketches/gameOfLife.md
function seedLife() {
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

export default {
  name: 'Kuramoto–Sivashinsky — Life-Seeded',
  description: 'The Kuramoto–Sivashinsky chaos field, continuously fed by a Conway\'s Game of Life board evolving underneath it — Life\'s gliders and blinkers inject structured "fuel" that the PDE folds, stretches, and dissolves back into turbulence.',
  tags: ['pde', 'chaos', 'simulation', 'cellular-automata', 'game-of-life', 'hybrid'],
  category: 'Chaos',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\partial_t h = -\\nabla^2 h - \\nabla^4 h - \\tfrac{1}{2}|\\nabla h|^2 + \\varepsilon\\cdot\\text{alive}(\\mathbf{x})',

  params: {
    dt: { value: 0.1, min: 0.02, max: 0.15, step: 0.01 },
    spacing: { value: 0.9, min: 0.5, max: 1.05, step: 0.05 },
    speed: { value: 6, min: 1, max: 15, step: 1 },
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
    const make = (fill) => {
      const t = new THREE.DataTexture(new Uint8Array(CELLS).fill(fill), SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
      return t;
    };
    return { uField: { value: make(128) }, uLife: { value: make(0) } };
  },

  setup(ctx) {
    seedLife();
    const worker = new Worker(new URL('../lib/ksWorker.js', import.meta.url), { type: 'module' });
    const sim = { latest: null, sent: '', genTimer: 0, lifeDirty: true };
    worker.onmessage = (e) => (sim.latest = e.data);
    worker.postMessage({ type: 'init', size: SIZE, params: paramsFor(ctx) });
    return { worker, sim };
  },

  update(ctx, state) {
    const { sim, worker } = state;
    sim.genTimer += ctx.delta;
    const genInterval = 1 / ctx.params.genRate;
    while (sim.genTimer >= genInterval) {
      sim.genTimer -= genInterval;
      stepLife();
      sim.lifeDirty = true;
    }
    if (sim.lifeDirty) {
      sim.lifeDirty = false;
      worker.postMessage({ type: 'force', force: Float32Array.from(LIFE) });
      const lifeTexture = state.uniforms.uLife.value;
      for (let i = 0; i < CELLS; i++) lifeTexture.image.data[i] = LIFE[i] ? 255 : 0;
      lifeTexture.needsUpdate = true;
    }

    const p = paramsFor(ctx);
    const key = JSON.stringify(p);
    if (key !== sim.sent) {
      sim.sent = key;
      worker.postMessage({ type: 'params', params: p });
    }
    if (sim.latest) {
      const texture = state.uniforms.uField.value;
      const out = texture.image.data;
      for (let i = 0; i < CELLS; i++) {
        const v = sim.latest[i] / DISPLAY_RANGE;
        out[i] = Math.round(((v < -1 ? -1 : v > 1 ? 1 : v) * 0.5 + 0.5) * 255);
      }
      texture.needsUpdate = true;
      sim.latest = null;
    }
  },

  dispose(ctx, state) {
    state.worker.terminate();
  },
};

function paramsFor(ctx) {
  return { dt: ctx.params.dt, spacing: ctx.params.spacing, speed: ctx.params.speed, drive: ctx.params.drive };
}
