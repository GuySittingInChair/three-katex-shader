import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createKS2D } from '../lib/kuramotoSivashinsky.js';
import { caption } from '../lib/bit.js';

// A soap film whose thickness ripples by the Kuramoto–Sivashinsky equation,
// coloured by real thin-film interference.
//
// KS isn't only for flames: it's also the long-wave equation for thin
// liquid films (Sivashinsky & Michelson, 1980), where u is a thickness
// perturbation. Here the film's thickness is
//
//     d(x, y) = d_drain(y) + a·u(x, y)
//
// with d_drain growing from 0 at the top to ~900 nm at the bottom (real
// films drain under gravity, thinnest at the top) and u the 2D KS field.
//
// The colour is computed, not painted. Light reflects off the front of the
// film (with a half-wave phase flip) and off the back (without), and the
// two waves interfere:
//
//     R(λ) = 2r² (1 − cos(4π n d / λ)),   n = 1.33,  r = (n − 1)/(n + 1)
//
// evaluated at 16 wavelengths from 400 to 700 nm and turned into colour
// with the CIE 1931 colour-matching functions (Wyman, Sloan & Shirley's
// analytic fit) and the XYZ → sRGB matrix. So where the film is very thin
// it reflects almost nothing and goes black: the "black film" you see at
// the top of a soap film just before it pops.
//
// KS solved with ETDRK4 (src/lib/kuramotoSivashinsky.js): 128 × 128, L = 100
// on a computer, 64 × 64, L = 50 on a phone. Loop (50 s).

const PHONE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const N = PHONE ? 64 : 128;
const LBOX = PHONE ? 50 : 100;
const H = 0.25;
const PERIOD = 50;
const UNITS_PER_S = 5;
const NM_PER_U = 9;

const FRAG = `
  uniform vec2 uResolution;
  uniform sampler2D uField;
  uniform float uFade;
  uniform float uNmPerU;
  uniform float uTime;
  varying vec2 vUv;

  float lobe(float l, float mu, float s1, float s2) {
    float t = (l - mu) / (l < mu ? s1 : s2);
    return exp(-0.5 * t * t);
  }
  // CIE 1931 colour matching functions, analytic fit (Wyman, Sloan & Shirley 2013).
  vec3 cie(float l) {
    float x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
    float y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
    float z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
    return vec3(x, y, z);
  }

  vec3 filmColour(float d) {
    const float n = 1.33;
    const float r = (n - 1.0) / (n + 1.0);
    vec3 xyz = vec3(0.0);
    float norm = 0.0;
    for (int i = 0; i < 16; i++) {
      float l = 400.0 + 300.0 * (float(i) + 0.5) / 16.0;
      vec3 c = cie(l);
      float R = 2.0 * r * r * (1.0 - cos(12.566371 * n * d / l));
      xyz += R * c;
      norm += c.y;
    }
    xyz /= norm;
    vec3 rgb = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570) * xyz;
    return max(rgb, 0.0);
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    // The film: a disc, a little left of centre on wide screens.
    vec2 c = aspect > 1.3 ? vec2(-0.2 * aspect + 0.02, -0.03) : vec2(0.0, -0.06);
    float rad = min(0.36, 0.44 * aspect);
    vec2 q = (p - c) / rad;                 // -1..1 across the film
    float rr = length(q);
    vec3 col = vec3(0.0);
    if (rr < 1.0) {
      vec2 uv = q * 0.5 + 0.5;
      float u = texture2D(uField, uv).r;
      float drain = 900.0 * pow(clamp(0.5 - 0.5 * q.y, 0.0, 1.0), 1.6);   // thin at the top
      float d = max(0.0, drain + uNmPerU * u * smoothstep(0.0, 0.25, drain / 900.0 + 0.1));
      // White light reflected off the film: 9× the film's tiny reflectance.
      col = filmColour(d) * 9.0;
      // A soft window highlight sliding over the curved film.
      vec2 g = vec2(dFdx(u), dFdy(u)) * 6.0;
      float sheen = exp(-8.0 * dot(q - vec2(-0.35, 0.4) + g, q - vec2(-0.35, 0.4) + g));
      col += vec3(0.25) * sheen * filmColour(d + 40.0);
      // The meniscus at the rim: thicker, catching the light.
      col += vec3(0.6, 0.62, 0.65) * smoothstep(0.93, 1.0, rr) * 0.5;
      col *= smoothstep(1.0, 0.985, rr);
    }
    gl_FragColor = vec4(col * uFade, 1.0);
  }
`;

function toHalf(src, dst) {
  for (let i = 0; i < src.length; i++) dst[i] = THREE.DataUtils.toHalfFloat(src[i]);
}

export default {
  name: 'Kuramoto–Sivashinsky Soap Film',
  description:
    'A soap film whose thickness ripples by the Kuramoto–Sivashinsky equation, coloured by real thin-film ' +
    'interference: reflectance computed at 16 wavelengths and turned into colour with the CIE colour-matching ' +
    'functions. Thin at the top, where it goes black, as real films do before they pop.',
  tags: ['pde', 'chaos', 'kuramoto-sivashinsky', 'optics', 'interference', 'soap film', 'glow'],
  category: 'Optics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return { loop: Math.floor(t / PERIOD), loopT, fade: smooth(loopT / 1.5) * (1 - smooth((loopT - (PERIOD - 1.5)) / 1.5)) };
  },

  latex: (params, hl, m) => {
    const line = m.loopT > PERIOD - 1.5
      ? 'Pop. New film.'
      : 'Thinnest at the top, where it turns black: the last thing a soap film does before it pops.';
    return (
      '\\begin{aligned}' +
      'u_t &= -\\nabla^2 u - \\nabla^4 u - \\tfrac12|\\nabla u|^2,\\quad d = d_{\\text{drain}}(y) + a\\,u \\\\' +
      'R(\\lambda) &= 2r^2\\Big(1 - \\cos\\frac{4\\pi n d}{\\lambda}\\Big),\\quad n = 1.33,\\ \\lambda \\in [400, 700]\\,\\text{nm} \\\\' +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    ripple: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: FRAG,

  uniforms() {
    const data = new Uint16Array(N * N);
    const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return { uField: { value: tex }, uFade: { value: 0 }, uNmPerU: { value: NM_PER_U } };
  },

  setup(ctx) {
    const glow = createGlow(ctx, { strength: 0.35, threshold: 0.8, exposure: 1.0, vignette: 0.45 });
    return { glow, key: null, ks: null, simT: 0, centred: new Float32Array(N * N) };
  },

  update(ctx, state) {
    const m = ctx.motion;
    if (state.key !== m.loop) {
      state.key = m.loop;
      state.ks = createKS2D(N, LBOX, H);
      state.ks.set(Array.from({ length: N * N }, () => (Math.random() - 0.5) * 0.5));
      state.simT = 0;
      // Run ahead a little so the film starts with ripples.
      for (let i = 0; i < 80; i++) state.ks.step();
    }
    const target = m.loopT * UNITS_PER_S;
    let guard = 0;
    while (state.simT + H / 2 < target && guard++ < 2) {
      state.ks.step();
      state.simT += H;
    }
    const u = state.ks.u();
    const mean = state.ks.mean();
    for (let i = 0; i < u.length; i++) state.centred[i] = u[i] - mean;
    const tex = state.uniforms.uField.value;
    toHalf(state.centred, tex.image.data);
    tex.needsUpdate = true;
    state.uniforms.uFade.value = m.fade;
    state.uniforms.uNmPerU.value = NM_PER_U * ctx.params.ripple;
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.uniforms.uField.value.dispose();
  },
};
