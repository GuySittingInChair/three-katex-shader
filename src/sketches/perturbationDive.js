import * as THREE from 'three';
import { phaseOf, smooth } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// A dive 30 decades into the Mandelbrot set, on a GPU whose numbers run out at about 7 digits.
//
// The modern trick (K. I. Martin's SuperFractalThing, 2013; Kalles Fraktaler; Zhuoran's rebasing, 2021):
// perturbation. Don't iterate each pixel's c directly. Iterate one reference point c₀ exactly, and for each
// pixel c = c₀ + δc iterate only the difference δₙ = zₙ − Zₙ:
//
//     Z_{n+1} = Zₙ² + c₀,        δ_{n+1} = 2Zₙδₙ + δₙ² + δc
//
// That is exact algebra (subtract one recurrence from the other). The point is the sizes: Zₙ is of order 1
// and δc is of order the screen width, 10⁻³⁰ at the bottom, which float32 holds fine (it goes down to
// 10⁻³⁸). Only Zₙ needed precision, and it is computed once, here, in JavaScript.
//
// Rebasing (Zhuoran): if the pixel's orbit zₙ = Zₙ + δₙ comes closer to 0 than δₙ is big, the reference is a
// bad guide from there on; restart it at Z₀ = 0 with δ := zₙ. Keeps everything glitch-free.
//
// The target is a Misiurewicz point, which makes the reference orbit exact and endless. c₀ = M₅,₂ ≈
// −1.25558 + 0.40204i is the c whose critical orbit 0, c₀, c₀² + c₀, ... lands after 5 steps on a 2-cycle:
// Z₇ = Z₅. Found by Newton's method on (Z_{k+p} − Z_k)/(Z_{k+p−1} − Z_{k−1}) (dividing out the
// lower-preperiod roots) and recomputed at load. So the reference table is just Z₀ … Z₆, and the index wraps
// 7 → 5 forever; there is nothing to run out of.
//
// And the picture never runs out either. Tan Lei (1990): near a Misiurewicz point the set is asymptotically
// self-similar, with the factor λ = (f²)'(Z₅) = 4 Z₅ Z₆ ≈ 1.906 e^{122°i}, the multiplier of the cycle. Zoom
// in ×1.906 and turn 122° and you see the same picture again. Set `co-rotate` to turn the camera with it:
// deep down the picture then stands still while the numbers fall.
//
// The iterations needed grow only linearly with depth: k + p log(1/width)/log|λ|, about 300 at 10⁻³⁰.
//
// Shading: smooth iteration count ν = n + 1 − log₂ log|z| through a palette, plus the distance estimate
// d = |z| ln|z| / |dz/dc| (with dz/dc carried as a scaled derivative, D = s·dz/dc, D' = 2zD + s, so
// nothing overflows) for the glowing filaments, and the classic "normal map" light from u = z/(dz/dc).
// Four samples per pixel.

const K = 5;
const P = 2;
const PERIOD = 76;
const DIVE = 60;          // seconds going down
const HOLD = 6;
const E_MAX = 30;         // decades
const W0 = 3.2;           // starting width
const UNIVERSE = 8.8e26;  // m, diameter of the observable universe

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];

function orbit(c, n) {
  let z = [0, 0];
  let dz = [0, 0];
  const Z = [z];
  const D = [dz];
  for (let i = 1; i <= n; i++) {
    dz = [2 * (z[0] * dz[0] - z[1] * dz[1]) + 1, 2 * (z[0] * dz[1] + z[1] * dz[0])];
    z = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]];
    Z.push(z);
    D.push(dz);
  }
  return { Z, D };
}

// Newton's method for the Misiurewicz point M_{K,P} near the guess.
function misiurewicz(guess) {
  let c = guess;
  for (let it = 0; it < 100; it++) {
    const { Z, D } = orbit(c, K + P);
    const r = csub(cdiv(csub(D[K + P], D[K]), csub(Z[K + P], Z[K])), cdiv(csub(D[K + P - 1], D[K - 1]), csub(Z[K + P - 1], Z[K - 1])));
    const step = cdiv([1, 0], r);
    c = csub(c, step);
    if (Math.hypot(step[0], step[1]) < 1e-17) break;
  }
  return c;
}

const C0 = misiurewicz([-1.2555819767538616, 0.4020388592658135]);
const REF = orbit(C0, K + P).Z;               // Z₀ … Z₇, with Z₇ = Z₅
const LAMBDA = cmul([2 * REF[K][0], 2 * REF[K][1]], [2 * REF[K + 1][0], 2 * REF[K + 1][1]]);
const LAM_ABS = Math.hypot(LAMBDA[0], LAMBDA[1]);
const LAM_ARG = Math.atan2(LAMBDA[1], LAMBDA[0]);
const CYCLE_ERR = Math.hypot(REF[K + P][0] - REF[K][0], REF[K + P][1] - REF[K][1]);

const SCALES = [
  [1e25, 'a galaxy cluster'], [1e21, 'a galaxy'], [1e16, 'a few light years'], [1e12, 'the solar system'],
  [1e8, 'the Earth–Moon distance'], [1e6, 'a country'], [1e3, 'a town'], [30, 'a house'], [1, 'a person'], [1e-2, 'a fingertip'],
  [3e-4, 'a grain of sand'],
];
// The listed size nearest in log scale.
const sizeName = (m) => {
  let best = SCALES[0];
  for (const e of SCALES) if (Math.abs(Math.log(m / e[0])) < Math.abs(Math.log(m / best[0]))) best = e;
  return best[1];
};

const PALETTES = ['Nebula', 'Gold leaf', 'Ice'];

export default {
  name: 'Perturbation Dive',
  description:
    'A dive 30 decades into the Mandelbrot set using perturbation theory, the trick behind modern deep-zoom ' +
    'renderers: one exact reference orbit, and every pixel only tracks its tiny difference from it, which ' +
    'ordinary GPU floats can hold. The target is a Misiurewicz point, where the set repeats itself forever: ' +
    'zoom ×1.906 and turn 122° and the picture comes back (Tan Lei, 1990).',
  tags: ['fractal', 'mandelbrot', 'perturbation', 'deep-zoom', 'misiurewicz', 'modern'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params) {
    const ph = phaseOf(t, PERIOD) * PERIOD;
    let E;
    if (ph < DIVE) E = E_MAX * smooth(ph / DIVE);
    else if (ph < DIVE + HOLD) E = E_MAX;
    else E = E_MAX * (1 - smooth((ph - DIVE - HOLD) / (PERIOD - DIVE - HOLD)));
    const width = W0 * 10 ** -E;
    const zoomedBy = Math.log(W0 / width);
    const coRot = params?.corotate ? (LAM_ARG / Math.log(LAM_ABS)) * zoomedBy : 0;
    return {
      E,
      width,
      rot: coRot + 0.02 * t,
      iters: Math.min(1400, Math.round(140 + 1.6 * P * Math.log(4 / width) / Math.log(LAM_ABS))),
      meters: UNIVERSE * (width / W0),
      diving: ph < DIVE ? 1 : 0,
      rising: ph >= DIVE + HOLD ? 1 : 0,
      ph,
    };
  },

  latex: (params, hl, m) => {
    const exp = Math.floor(Math.log10(m.width));
    const mant = m.width / 10 ** exp;
    const line = m.rising
      ? 'Back up 30 decades. Nothing was lost on the way down.'
      : m.E < 4.5
        ? 'So far any renderer could do this.'
        : m.E < 13
          ? 'Float32 gave up at 10⁻⁵. The δ’s are 10⁻' + Math.round(m.E) + ' and float32 holds them happily.'
          : m.E < 29.5
            ? 'Float64 gave up at 10⁻¹³ too. Same picture, turned: Tan Lei promised.'
            : 'If the whole set were as wide as the observable universe, the screen is now a grain of sand.';
    return (
      '\\begin{aligned}' +
      `Z_{n+1} &= Z_n^2 + c_0,\\quad c_0 = M_{5,2},\\ Z_7 = Z_5\\ (\\text{exact, }|Z_7 - Z_5| = ${CYCLE_ERR.toExponential(0).replace('e', '\\times10^{') + '}'}) \\\\` +
      '\\delta_{n+1} &= 2Z_n\\delta_n + \\delta_n^2 + \\delta c,\\qquad z_n = Z_n + \\delta_n \\\\' +
      `\\text{width} &= ${hl(mant, 2)}\\times10^{${exp}},\\quad n_{\\text{max}} = ${hl(m.iters, 0)} \\\\` +
      `\\lambda &= 4Z_5Z_6 = ${LAM_ABS.toFixed(3)}\\,e^{${Math.round((LAM_ARG * 180) / Math.PI)}^\\circ i}:\\ \\text{zoom}\\times${LAM_ABS.toFixed(3)},\\ \\text{turn } ${Math.round((LAM_ARG * 180) / Math.PI)}^\\circ \\Rightarrow \\text{same picture} \\\\` +
      `\\text{set} &= \\text{universe} \\Rightarrow \\text{screen} = ${hl(m.meters / 10 ** Math.floor(Math.log10(m.meters)), 1)}\\times10^{${Math.floor(Math.log10(m.meters))}}\\,\\text{m}\\ (\\text{${sizeName(m.meters)}}) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
    corotate: { value: 0, min: 0, max: 1, step: 1, options: ['off', 'on'] },
  },

  fragmentShader: `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime, uScale, uRot, uIters, uPalette;
    uniform sampler2D uRef;
    varying vec2 vUv;

    vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
    vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
    vec2 ref(int m) { return texelFetch(uRef, ivec2(m, 0), 0).xy; }

    vec3 palette(float t, int k) {
      if (k == 1) return vec3(0.55, 0.38, 0.16) + vec3(0.45, 0.35, 0.2) * cos(6.2831 * (t + vec3(0.0, 0.08, 0.2)));
      if (k == 2) return vec3(0.45, 0.6, 0.75) + vec3(0.35, 0.3, 0.25) * cos(6.2831 * (t + vec3(0.55, 0.5, 0.42)));
      return vec3(0.5, 0.35, 0.55) + vec3(0.45, 0.35, 0.4) * cos(6.2831 * (t + vec3(0.0, 0.25, 0.5)));
    }

    // One sample: returns colour.
    vec3 sampleAt(vec2 px) {
      float c = cos(uRot), s = sin(uRot);
      vec2 off = px - 0.5 * uResolution;
      vec2 dc = vec2(c * off.x - s * off.y, s * off.x + c * off.y) * uScale;
      vec2 d = vec2(0.0);
      vec2 D = vec2(0.0);           // uScale · dz/dc
      vec2 z = vec2(0.0);
      int m = 0;
      int n = 0;
      bool escaped = false;
      int maxN = int(uIters);
      for (int i = 0; i < 1400; i++) {
        if (i >= maxN) break;
        vec2 Z = ref(m);
        z = Z + d;
        D = 2.0 * cmul(z, D) + vec2(uScale, 0.0);
        d = 2.0 * cmul(Z, d) + cmul(d, d) + dc;
        m++;
        if (m == ${K + P}) m = ${K};
        z = ref(m) + d;
        n = i + 1;
        if (dot(z, z) > 1e6) { escaped = true; break; }
        if (dot(z, z) < dot(d, d)) { d = z; m = 0; }   // rebase
      }
      int k = int(uPalette + 0.5);
      if (!escaped) return vec3(0.01, 0.008, 0.02);
      float r = length(z);
      float nu = float(n) + 1.0 - log2(log(r));
      float de = r * log(r) / length(D);                // distance to the set, in pixels
      vec2 u = cdiv(z, D);
      u /= length(u);
      float light = 0.5 + 0.5 * dot(u, normalize(vec2(-0.7, 0.7)));
      float t = 0.11 * sqrt(nu) + 0.03 * uTime;
      vec3 col = palette(t, k) * (0.25 + 0.75 * light);
      float edge = exp(-de * 0.9);                       // glowing filaments
      col = mix(col * smoothstep(0.0, 6.0, de) * 0.9 + col * 0.12, vec3(1.0, 0.93, 0.8), edge * 0.85);
      return col;
    }

    void main() {
      vec2 p = vUv * uResolution;
      vec3 col = sampleAt(p + vec2(-0.25, -0.125)) + sampleAt(p + vec2(0.125, -0.25))
               + sampleAt(p + vec2(0.25, 0.125)) + sampleAt(p + vec2(-0.125, 0.25));
      col *= 0.25;
      col = col / (1.0 + 0.35 * col);   // gentle roll-off, no clipping
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.5 * dot(q, q);
      gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
    }
  `,

  uniforms() {
    const data = new Float32Array(4 * (K + P + 1));
    REF.forEach((z, i) => data.set([z[0], z[1], 0, 1], 4 * i));
    const tex = new THREE.DataTexture(data, K + P + 1, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return {
      uRef: { value: tex },
      uScale: { value: 1 },
      uRot: { value: 0 },
      uIters: { value: 200 },
      uPalette: { value: 0 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    // Width spans the shorter screen side.
    const { width, height } = ctx.size;
    u.uScale.value = m.width / Math.min(width, height);
    u.uRot.value = m.rot;
    u.uIters.value = m.iters;
    u.uPalette.value = ctx.params.palette;
  },

  dispose(ctx, state) {
    state.uniforms.uRef.value.dispose();
  },
};
