import * as THREE from 'three';

const SIZE = 64;
let grid = new Uint8Array(SIZE * SIZE);
let neighborCount = new Uint8Array(SIZE * SIZE);

function randomize() {
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.35 ? 255 : 0;
}

function step() {
  const next = new Uint8Array(SIZE * SIZE);
  const nextNeighbors = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + SIZE) % SIZE;
          const ny = (y + dy + SIZE) % SIZE;
          if (grid[ny * SIZE + nx]) n++;
        }
      }
      const idx = y * SIZE + x;
      const alive = grid[idx] > 0;
      next[idx] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 255 : 0;
      nextNeighbors[idx] = n;
    }
  }
  grid = next;
  neighborCount = nextNeighbors;
}

export default {
  name: "Conway's Game of Life",
  description: 'The classic cellular automaton: birth on 3 neighbors, survival on 2 or 3, death otherwise.',
  tags: ['cellular-automata', 'simulation', 'grid'],
  category: 'Cellular Automata',
  mode: 'shader',
  shaderLang: 'glsl',
  latex:
    's_{t+1}(x,y) = \\begin{cases} 1 & n=3 \\\\ s_t(x,y) & n=2 \\\\ 0 & \\text{otherwise} \\end{cases},\\quad n = \\sum_{\\text{8 neighbors}} s_t',

  params: {
    speed: { value: 10, min: 1, max: 30 },
  },

  fragmentShader: `
    uniform sampler2D uGrid;
    uniform sampler2D uNeighbors;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      float alive = texture2D(uGrid, vUv).r;
      float n = texture2D(uNeighbors, vUv).r * 8.0;
      float hue = fract(n / 8.0 + uTime * 0.02);
      vec3 aliveColor = 0.55 + 0.45 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
      vec3 deadColor = vec3(0.03, 0.03, 0.07);
      gl_FragColor = vec4(mix(deadColor, aliveColor, alive), 1.0);
    }
  `,

  uniforms() {
    randomize();
    step(); // populate an initial neighbor count so frame 0 isn't blank
    const gridTexture = new THREE.DataTexture(grid, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    gridTexture.magFilter = THREE.NearestFilter;
    gridTexture.minFilter = THREE.NearestFilter;
    gridTexture.needsUpdate = true;

    const neighborTexture = new THREE.DataTexture(neighborCount, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    neighborTexture.magFilter = THREE.NearestFilter;
    neighborTexture.minFilter = THREE.NearestFilter;
    neighborTexture.needsUpdate = true;

    return { uGrid: { value: gridTexture }, uNeighbors: { value: neighborTexture } };
  },

  setup() {
    return { accum: 0 };
  },

  update(ctx, state) {
    state.accum += ctx.delta * ctx.params.speed;
    while (state.accum >= 1) {
      state.accum -= 1;
      step();
      state.uniforms.uGrid.value.image.data = grid;
      state.uniforms.uGrid.value.needsUpdate = true;
      state.uniforms.uNeighbors.value.image.data = neighborCount;
      state.uniforms.uNeighbors.value.needsUpdate = true;
    }
  },
};
