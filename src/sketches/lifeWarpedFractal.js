import * as THREE from 'three';

const LIFE_SIZE = 64;
const LIFE_CELLS = LIFE_SIZE * LIFE_SIZE;
let life = new Uint8Array(LIFE_CELLS);
const lifeDisplay = new Uint8Array(LIFE_CELLS);

function seedLife() {
  for (let i = 0; i < LIFE_CELLS; i++) life[i] = Math.random() < 0.25 ? 1 : 0;
}

function countNeighbors(x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + LIFE_SIZE) % LIFE_SIZE;
      const ny = (y + dy + LIFE_SIZE) % LIFE_SIZE;
      n += life[ny * LIFE_SIZE + nx];
    }
  }
  return n;
}

function stepLife() {
  const next = new Uint8Array(LIFE_CELLS);
  for (let y = 0; y < LIFE_SIZE; y++) {
    for (let x = 0; x < LIFE_SIZE; x++) {
      const idx = y * LIFE_SIZE + x;
      const n = countNeighbors(x, y);
      const alive = life[idx];
      next[idx] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
    }
  }
  life = next;
}

function writeLifeDisplay() {
  for (let i = 0; i < LIFE_CELLS; i++) lifeDisplay[i] = life[i] ? 255 : 0;
}

export default {
  name: 'Life-Warped Fractal',
  description: 'A Radian628-style domain-warped fractal whose fold scale, spin, and warp amplitude are driven cell-by-cell by a live Conway\'s Game of Life board — gliders and oscillators visibly reshape the fractal as they move through it.',
  tags: ['fractal', 'cellular-automata', 'game-of-life', 'glsl', 'integral', 'hybrid'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\text{alive}(\\mathbf{x}) \\to \\{\\text{fold scale},\\ \\text{spin},\\ \\text{warp}\\}',

  params: {
    genRate: { value: 6, min: 1, max: 20, step: 1 },
    iterations: { value: 14.0, min: 4.0, max: 26.0, step: 1.0 },
    lifeInfluence: { value: 0.35, min: 0.0, max: 0.8, step: 0.02 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform sampler2D uLife;
    uniform float uIterations;
    uniform float uLifeInfluence;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      // The Life board is sampled once per pixel and used as a switch that
      // retunes the fractal's own fold — not just recolored on top of it.
      float life = texture2D(uLife, vUv).r;

      float angle = uTime * 0.05 + life * 1.2;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      float scale = 1.08 + life * uLifeInfluence;

      for (float i = 0.0; i < 26.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.15;
        p *= scale;
        p *= rot;

        vec2 intTerm = spatialTrigIntegral(p, 2.5 + sin(uTime * 0.2), uTime * 0.5);
        p += intTerm * (0.06 + life * 0.08);
      }

      vec2 colorIntR = spatialTrigIntegral(p + vec2(0.2, 0.0), 3.0, uTime * 0.4);
      vec2 colorIntG = spatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
      vec2 colorIntB = spatialTrigIntegral(p + vec2(0.4, 0.2), 5.0, uTime * 0.2);

      vec3 color = vec3(
        length(p + colorIntR),
        length(p + colorIntG),
        length(p + colorIntB)
      );
      color = sin(color * 67.0) * 0.5 + 0.5;

      // Warm tint wherever the fractal is currently sitting under a living cell.
      color = mix(color, color * vec3(1.25, 0.95, 0.6) + vec3(0.05, 0.0, 0.0), life * 0.6);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    seedLife();
    writeLifeDisplay();
    const texture = new THREE.DataTexture(lifeDisplay, LIFE_SIZE, LIFE_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return {
      uLife: { value: texture },
      uIterations: { value: 14.0 },
      uLifeInfluence: { value: 0.35 },
    };
  },

  setup() {
    return { genTimer: 0 };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uLifeInfluence.value = ctx.params.lifeInfluence;

    state.genTimer += ctx.delta;
    const genInterval = 1 / ctx.params.genRate;
    while (state.genTimer >= genInterval) {
      state.genTimer -= genInterval;
      stepLife();
    }
    writeLifeDisplay();
    state.uniforms.uLife.value.image.data = lifeDisplay;
    state.uniforms.uLife.value.needsUpdate = true;
  },
};
