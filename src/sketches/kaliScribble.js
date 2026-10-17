import { TAU, smooth } from '../lib/motion.js';

// Kali Scribble: Kali's fractal drawn by a shaky hand, re-rolled every few seconds.
//
// The step is Kali's p ↦ |R_i p + s_i| / |p|^α − c with a random turn R_i and
// an off-centre mirror shift s_i for every step i (as in Kali Tangle), but all
// of the random numbers come from a seed, and every `reseed` seconds the seed
// moves on: the turns, shifts, traps and colours slide from one random set to
// the next over the last quarter of each period. So the picture is never the
// same family twice: it is re-dealt, not just drifted.
//
// The strokes are ink, not glow:
//   • the distance to each step's trap line is jittered by value noise,
//     d ↦ |d + j (n(18 p) − ½)|, so the line wobbles like a pen;
//   • a second, coarser noise lifts the pen: a stroke only shows where
//     n(4 p + …) > ½, so lines break into dashes and scraps;
//   • each stroke gets its own random hue from the seed (not a steady
//     progression), so neighbouring strokes clash.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 61;

export default {
  name: 'Kali Scribble',
  description:
    "Kali's fractal drawn in jittery, broken neon strokes, each a random colour, with the random turns, mirrors " +
    'and traps re-dealt every few seconds so it never settles into one family of shapes.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'orbit trap', 'random'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params = {}) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    const period = params.reseed ?? 9;
    const x = t / period;
    const k = Math.floor(x);
    return {
      cx: 0.8 + 0.2 * s(1, 2.7) + 0.07 * s(R3, 1.5),
      cy: 0.6 + 0.15 * s(PHI, 0.1) + 0.06 * s(R2 * PHI, 1.8),
      alpha: 2.05 + 0.35 * s(R2, 0.4) + 0.1 * s(PHI * R3, 2.6),
      theta: 0.6 * s(1 / PHI, 0.9),
      zoom: Math.exp(0.4 + 0.35 * s(1 / R3, 1.2)),
      seedA: k % 997,
      seedB: (k + 1) % 997,
      mix: smooth((x - k - 0.75) / 0.25),
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|R_{a_i} p + s_i|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `(a_i, s_i, h_i) &= (1-\\mu)\\,\\text{rand}_{${m.seedA}}(i) + \\mu\\,\\text{rand}_{${m.seedB}}(i),\\quad \\mu = ${hl(m.mix, 2)} \\\\` +
    `d_i &= \\big|\\,p_i\\cdot n_i - o_i + ${hl(params.jitter, 2)}\\,(\\text{noise}(18p_i) - \\tfrac12)\\big| \\\\` +
    '\\text{ink} &= \\textstyle\\sum_i \\text{rainbow}(h_i)\\,\\Big(\\frac{w}{d_i(1+0.6i) + w}\\Big)^2\\,[\\text{noise}(4p_i) > \\tfrac12]' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    reseed: { value: 9, min: 3, max: 30, step: 0.5 },
    jitter: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    breaks: { value: 0.5, min: 0, max: 1, step: 0.01 },
    iterations: { value: 12, min: 4, max: 20, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform vec2 uC;
    uniform float uAlpha;
    uniform float uTheta;
    uniform float uZoom;
    uniform float uSeedA;
    uniform float uSeedB;
    uniform float uMix;
    uniform float uClock;
    uniform float uJitter;
    uniform float uBreaks;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float h(float n) { return fract(sin(n * 127.1 + 4.7) * 43758.5453); }
    // A random number for step i, slid from seed A's set to seed B's.
    float rs(float i, float k) { return mix(h(i * 13.7 + k + uSeedA * 71.3), h(i * 13.7 + k + uSeedB * 71.3), uMix); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    vec3 shade(vec2 z) {
      z += 0.3 * vec2(sin(uClock * 0.027), cos(uClock * 0.033 + 2.0));
      vec2 p = uZoom * (rot(uTheta) * z);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 20; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        p = rot(6.2831 * rs(fi, 0.1) * 0.6) * p;
        float r2 = max(dot(p, p), 1e-6);
        vec2 sh = 0.4 * (vec2(rs(fi, 0.2), rs(fi, 0.3)) - 0.5);
        p = abs(p + sh) / pow(r2, 0.5 * uAlpha) - uC;
        // a shaky line: random direction and offset, wobbled by noise
        float b = 6.2831 * rs(fi, 0.4) + uClock * 0.05;
        float d = dot(p, vec2(cos(b), sin(b))) - (rs(fi, 0.5) - 0.5) * 1.2;
        d = abs(d + uJitter * 0.06 * (noise(p * 18.0 + fi * 7.1) - 0.5)) * (1.0 + 0.6 * fi);
        float pen = smoothstep(0.5 * uBreaks - 0.08, 0.5 * uBreaks + 0.08, noise(p * 4.0 + vec2(fi * 3.3, uClock * 0.15)));
        float w = 0.008 + 0.016 * rs(fi, 0.6);
        float g = w / (d + w);
        // each stroke its own random hue: blend the two seeds' colours, not their hue numbers
        vec3 ink = mix(rainbow(h(fi * 5.1 + uSeedA * 3.7)), rainbow(h(fi * 5.1 + uSeedB * 3.7)), uMix);
        col += ink * g * g * pen * exp(-0.12 * fi) * 2.6;
      }
      return col * uGlow;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec3 col = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5;
        col += shade((frag + o - 0.5 * uResolution) * px);
      }
      col *= 0.25;
      // dark paper with a faint grain
      vec2 z = (frag - 0.5 * uResolution) * px;
      col += vec3(0.035, 0.02, 0.05) * (0.7 + 0.6 * noise(z * 60.0)) + vec3(0.02, 0.0, 0.04) * noise(z * 2.0 + uClock * 0.02);

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      float m = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.4 * m)) / max(m, 1e-4);

      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.45 * dot(v, v);
      gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
    }
  `,

  uniforms() {
    return {
      uC: { value: [0.8, 0.6] },
      uAlpha: { value: 2 },
      uTheta: { value: 0 },
      uZoom: { value: 2 },
      uSeedA: { value: 0 },
      uSeedB: { value: 1 },
      uMix: { value: 0 },
      uClock: { value: 0 },
      uJitter: { value: 0.5 },
      uBreaks: { value: 0.5 },
      uIterations: { value: 12 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uC.value = [m.cx, m.cy];
    u.uAlpha.value = m.alpha;
    u.uTheta.value = m.theta;
    u.uZoom.value = m.zoom;
    u.uSeedA.value = m.seedA;
    u.uSeedB.value = m.seedB;
    u.uMix.value = m.mix;
    u.uClock.value = m.clock;
    u.uJitter.value = ctx.params.jitter;
    u.uBreaks.value = ctx.params.breaks;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
