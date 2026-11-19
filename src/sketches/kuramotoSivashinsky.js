import * as THREE from 'three';

// The Kuramoto–Sivashinsky equation, h_t = −∇²h − ∇⁴h − ½|∇h|², on a 128 × 128
// grid that wraps round at the edges.
//
// 2026-11-18 rewrite. The old version stepped the equation square by square
// with Euler's method; its shortest waves blew up, and a ±4 clamp held it
// together but froze the pattern after about 50 seconds. Now a spectral
// solver (src/lib/ksSpectral.js) runs in a worker (src/lib/ksWorker.js):
// see docs/wiki/sketches/kuramotoSivashinsky-fix.md for what went wrong.

const SIZE = 128;
const CELLS = SIZE * SIZE;
// Heights run about ±12 (typically ±4); this many either side fills the colour scale.
const DISPLAY_RANGE = 9;

// see docs/wiki/colour-scales.md: heights → 0..255 for the shader's colour ramp.
function writeDisplay(field, display) {
  for (let i = 0; i < CELLS; i++) {
    const v = field[i] / DISPLAY_RANGE;
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
    dt: { value: 0.1, min: 0.02, max: 0.15, step: 0.01 },
    spacing: { value: 0.9, min: 0.5, max: 1.05, step: 0.05 },
    speed: { value: 6, min: 1, max: 15, step: 1 },
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
    const display = new Uint8Array(CELLS).fill(128);
    const texture = new THREE.DataTexture(display, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { uField: { value: texture } };
  },

  // see docs/wiki/js-promises-and-fetch.md (a worker is a helper running alongside the page)
  setup(ctx) {
    const worker = new Worker(new URL('../lib/ksWorker.js', import.meta.url), { type: 'module' });
    const sim = { latest: null, sent: '' };
    worker.onmessage = (e) => (sim.latest = e.data);
    worker.postMessage({ type: 'init', size: SIZE, params: paramsFor(ctx) });
    return { worker, sim };
  },

  update(ctx, state) {
    const p = paramsFor(ctx);
    const key = JSON.stringify(p);
    if (key !== state.sim.sent) {
      state.sim.sent = key;
      state.worker.postMessage({ type: 'params', params: p });
    }
    if (state.sim.latest) {
      const texture = state.uniforms.uField.value;
      writeDisplay(state.sim.latest, texture.image.data);
      texture.needsUpdate = true;
      state.sim.latest = null;
    }
  },

  dispose(ctx, state) {
    state.worker.terminate();
  },
};

function paramsFor(ctx) {
  return { dt: ctx.params.dt, spacing: ctx.params.spacing, speed: ctx.params.speed };
}
