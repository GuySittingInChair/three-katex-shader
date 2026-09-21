import * as THREE from 'three';

const SIZE = 72;
const CELLS = SIZE * SIZE;
const CENTER = Math.floor(SIZE / 2);
const MAX_WALKERS = 40;
const MAX_TICK_FOR_HUE = SIZE * 6; // rough normalizer for age-based coloring

let occupied = new Uint8Array(CELLS);
let age = new Float32Array(CELLS); // tick at which each cell stuck, 0 = unoccupied
const display = new Uint8Array(CELLS * 2); // R = occupied, G = radius-normalized age
let walkers = [];
let tick = 0;
let stuckCount = 0;

function reset() {
  occupied.fill(0);
  age.fill(0);
  walkers = [];
  tick = 0;
  stuckCount = 1;
  occupied[CENTER * SIZE + CENTER] = 1;
  age[CENTER * SIZE + CENTER] = 0;
}

function spawnWalker() {
  // Spawn on a circle near the edge so walkers drift inward toward the cluster.
  const angle = Math.random() * Math.PI * 2;
  const radius = SIZE * 0.42;
  const x = Math.round(CENTER + Math.cos(angle) * radius);
  const y = Math.round(CENTER + Math.sin(angle) * radius);
  walkers.push({
    x: Math.min(SIZE - 1, Math.max(0, x)),
    y: Math.min(SIZE - 1, Math.max(0, y)),
  });
}

function isAdjacentToCluster(x, y) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
    if (occupied[ny * SIZE + nx]) return true;
  }
  return false;
}

function tickSim(spawnRate) {
  tick++;
  if (stuckCount < CELLS * 0.55 && walkers.length < MAX_WALKERS) {
    for (let i = 0; i < spawnRate && walkers.length < MAX_WALKERS; i++) spawnWalker();
  }

  const stillWalking = [];
  for (const w of walkers) {
    const dir = Math.floor(Math.random() * 4);
    let { x, y } = w;
    if (dir === 0) x++;
    else if (dir === 1) x--;
    else if (dir === 2) y++;
    else y--;

    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue; // wandered off, discard

    if (isAdjacentToCluster(x, y) && !occupied[y * SIZE + x]) {
      const idx = y * SIZE + x;
      occupied[idx] = 1;
      age[idx] = tick;
      stuckCount++;
      continue; // walker consumed, don't push back into stillWalking
    }

    w.x = x;
    w.y = y;
    stillWalking.push(w);
  }
  walkers = stillWalking;
}

function writeDisplay() {
  for (let i = 0; i < CELLS; i++) {
    display[i * 2] = occupied[i] ? 255 : 0;
    display[i * 2 + 1] = occupied[i] ? Math.min(255, Math.round((age[i] / MAX_TICK_FOR_HUE) * 255)) : 0;
  }
}

export default {
  name: 'Diffusion-Limited Aggregation',
  description: 'Random walkers stick on contact with a growing cluster — the branching pattern behind coral, lightning, and mineral deposits.',
  tags: ['growth', 'random-walk', 'fractal'],
  category: 'Growth',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'P(\\text{stick at } x) = 1 \\ \\text{if } x \\ \\text{adjacent to cluster, else walker takes a random step}',

  params: {
    speed: { value: 8, min: 1, max: 20 },
    spawnRate: { value: 2, min: 1, max: 6 },
  },

  fragmentShader: `
    uniform sampler2D uField;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 texel = texture2D(uField, vUv).rg;
      float occ = texel.r;
      float ageNorm = texel.g;
      vec2 centered = vUv - 0.5;
      float radiusHue = length(centered) * 1.6;
      float hue = fract(ageNorm * 0.6 + radiusHue + uTime * 0.01);
      vec3 clusterColor = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
      vec3 bg = vec3(0.02, 0.02, 0.05);
      gl_FragColor = vec4(mix(bg, clusterColor, occ), 1.0);
    }
  `,

  uniforms() {
    reset();
    writeDisplay();
    const texture = new THREE.DataTexture(display, SIZE, SIZE, THREE.RGFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return { uField: { value: texture } };
  },

  setup() {
    return { accum: 0 };
  },

  update(ctx, state) {
    state.accum += ctx.delta * ctx.params.speed;
    let stepped = false;
    while (state.accum >= 1) {
      state.accum -= 1;
      tickSim(Math.round(ctx.params.spawnRate));
      stepped = true;
    }
    if (stepped) {
      writeDisplay();
      state.uniforms.uField.value.image.data = display;
      state.uniforms.uField.value.needsUpdate = true;
    }
  },
};
