import { TAU, smooth } from '../lib/motion.js';

// Kali Ink: Kali Scribble drawn by a nervous hand on breathing paper, in ink that bleeds.
//
// The step is Kali's p ↦ |R_i p + s_i| / |p|^α − c with a random turn R_i and
// an off-centre mirror shift s_i for every step i (as in Kali Tangle), but all
// of the random numbers come from a seed, and every `reseed` seconds the seed
// moves on. So the picture is never the same family twice: it is re-dealt, not
// just drifted.
//
// Each random number follows a Catmull-Rom curve through its values for seeds
// k−1, k, k+1, k+2, so it moves on with no jumps and no stops. How the deal
// behaves depends on the period T, so that a fast reseed still looks continuous:
//   • blend: each re-deal takes `blend` seconds (its own setting); the picture
//     holds still for the rest of the period, and when blend ≥ T it never
//     holds, it just keeps flowing;
//   • step size: under 6 s each deal moves only T/6 of a full re-deal, on top
//     of a slow deal every 9 s, so the picture changes at the same rate however
//     fast the reseed: a short T just makes the motion wigglier, not faster;
//   • flow: the pen breaks and the line directions move sqrt(6/T) times
//     faster (up to 5×), so everything keeps pace.
//
// The strokes are ink, not glow:
//   • the distance to each step's trap line is jittered by 3-octave noise,
//     d ↦ |d + j (1 + 0.15 i)(fbm(18 p) − ½)|: jagged, scratchy edges rather
//     than a smooth wobble, and shakier the deeper the step (the hand tires on
//     the fine detail);
//   • ink bleed: each colour channel gets its own small noise offset on that
//     distance, so the dye separates at the edges of a stroke like fountain-pen
//     ink in paper fibres;
//   • a second, coarser noise lifts the pen: a stroke only shows where
//     n(4 p + …) > ½, so lines break into dashes and scraps;
//   • each stroke gets its own random hue from the seed (not a steady
//     progression), so neighbouring strokes clash.
// And the paper: a slow, low-frequency warp under everything (it breathes),
// and a sub-pixel shudder re-hashed 12 times a second (line boil, as in
// hand-drawn animation, where every frame is traced again).

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 61;

export default {
  name: 'Kali Ink',
  description:
    'Kali Scribble by a nervous hand: scratchy fBm strokes that get shakier on the deeper steps, ink that bleeds ' +
    'into its colour channels, a line-boil shudder and paper that slowly breathes underneath.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'fbm', 'orbit trap', 'random', 'hand-drawn'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params = {}) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    const period = params.reseed ?? 9;
    const x = t / period;
    const k = Math.floor(x);
    const blend = params.blend ?? 2.25;
    const hold = Math.min(0.98, Math.max(0, 1 - blend / period)); // the part of each period spent holding still
    const lin = Math.min(1, Math.max(0, (x - k - hold) / (1 - hold)));
    const u = lin + (smooth(lin) - lin) * Math.min(1, hold / 0.3); // eased while holding, linear (C¹ with Catmull-Rom) when not
    const seeds = (j) => [j - 1, j, j + 1, j + 2].map((v) => ((v % 997) + 997) % 997);
    const ks = Math.floor(t / 9);
    return {
      cx: 0.8 + 0.2 * s(1, 2.7) + 0.07 * s(R3, 1.5),
      cy: 0.6 + 0.15 * s(PHI, 0.1) + 0.06 * s(R2 * PHI, 1.8),
      alpha: 2.05 + 0.35 * s(R2, 0.4) + 0.1 * s(PHI * R3, 2.6),
      theta: 0.6 * s(1 / PHI, 0.9),
      zoom: Math.exp(0.4 + 0.35 * s(1 / R3, 1.2)),
      k: k % 997,
      seeds: seeds(k),
      u,
      slowSeeds: seeds(ks),
      slowU: t / 9 - ks,
      amp: Math.min(1, Math.max(0.01, period / 6)),
      flow: Math.min(5, Math.max(1, Math.sqrt(6 / period))),
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|R_{a_i} p + s_i|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `(a_i, s_i, h_i) &= \\text{CR}\\big(\\text{rand}_{${m.k}-1\\,..\\,${m.k}+2}(i),\\ u = ${hl(m.u, 2)}\\big)\\ \\text{step } ${hl(m.amp, 2)} \\\\` +
    `d_i &= \\big|\\,p_i\\cdot n_i - o_i + ${hl(params.jitter, 2)}\\,(1 + 0.15\\,i)\\,(\\text{fbm}_3(18p_i) - \\tfrac12) + \\beta_{rgb}\\big| \\\\` +
    '\\text{ink} &= \\textstyle\\sum_i \\text{rainbow}(h_i)\\,\\Big(\\frac{w}{d_i(1+0.6i) + w}\\Big)^2\\,[\\text{noise}(4p_i) > \\tfrac12]' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    reseed: { value: 9, min: 0.1, max: 300, step: 0.05 },
    blend: { value: 2.25, min: 0.05, max: 60, step: 0.05 },
    jitter: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    bleed: { value: 1, min: 0, max: 3, step: 0.05 },
    shudder: { value: 1, min: 0, max: 4, step: 0.05 },
    breathe: { value: 1, min: 0, max: 3, step: 0.05 },
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
    uniform vec4 uS;              // seeds k−1 .. k+2
    uniform float uU;
    uniform vec4 uSlowS;          // the slow (9 s) deal
    uniform float uSlowU;
    uniform float uAmp;
    uniform float uFlow;
    uniform float uClock;
    uniform float uJitter;
    uniform float uBleed;
    uniform float uShudder;
    uniform float uBreathe;
    uniform float uBreaks;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float h(float n) { return fract(sin(n * 127.1 + 4.7) * 43758.5453); }
    // Catmull-Rom through four values: passes through b at u = 0 and c at u = 1, smooth across.
    float cr(float a, float b, float c, float d, float u) {
      return b + 0.5 * u * (c - a + u * (2.0 * a - 5.0 * b + 4.0 * c - d + u * (3.0 * (b - c) + d - a)));
    }
    vec3 crv(vec3 a, vec3 b, vec3 c, vec3 d, float u) {
      return b + 0.5 * u * (c - a + u * (2.0 * a - 5.0 * b + 4.0 * c - d + u * (3.0 * (b - c) + d - a)));
    }
    float seq(float n, vec4 S, float u) {
      return cr(h(n + S.x * 71.3), h(n + S.y * 71.3), h(n + S.z * 71.3), h(n + S.w * 71.3), u);
    }
    // A random number for step i: the fast deal, a step of size uAmp from the slow one.
    float rs(float i, float k) {
      float n = i * 13.7 + k;
      float fast = seq(n, uS, uU);
      return uAmp > 0.999 ? fast : mix(seq(n, uSlowS, uSlowU), fast, uAmp);
    }
    vec3 inkOf(float fi, vec4 S, float u) {
      float n = fi * 5.1;
      return crv(rainbow(h(n + S.x * 3.7)), rainbow(h(n + S.y * 3.7)), rainbow(h(n + S.z * 3.7)), rainbow(h(n + S.w * 3.7)), u);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    // three octaves, for scratchy edges (centred on ½)
    float fbm3(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.13 + 5.1) + 0.2 * noise(p * 4.37 + 9.7); }

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
        float b = 6.2831 * rs(fi, 0.4) + uClock * 0.05 * uFlow;
        float d = dot(p, vec2(cos(b), sin(b))) - (rs(fi, 0.5) - 0.5) * 1.2;
        d += uJitter * (1.0 + 0.15 * fi) * 0.06 * (fbm3(p * 18.0 + fi * 7.1) - 0.5);   // scratchy, and the hand tires
        // ink bleed: each channel's edge sits a little differently
        vec2 pb = p * 30.0 + fi * 2.3;
        vec3 dc = abs(d + uBleed * 0.012 * (vec3(noise(pb), noise(pb + 17.1), noise(pb + 31.7)) - 0.5)) * (1.0 + 0.6 * fi);
        float pen = smoothstep(0.5 * uBreaks - 0.08, 0.5 * uBreaks + 0.08, noise(p * 4.0 + vec2(fi * 3.3, uClock * 0.15 * uFlow)));
        float w = 0.008 + 0.016 * rs(fi, 0.6);
        vec3 g = w / (dc + w * vec3(1.0, 1.0 + 0.25 * uBleed, 1.0 + 0.5 * uBleed));
        // each stroke its own random hue: blend the seeds' colours, not their hue numbers
        vec3 ink = inkOf(fi, uS, uU);
        if (uAmp < 0.999) ink = mix(inkOf(fi, uSlowS, uSlowU), ink, uAmp);
        ink = clamp(ink, 0.0, 1.0);
        col += ink * g * g * pen * exp(-0.12 * fi) * 2.6;
      }
      return col * uGlow;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z0 = (frag - 0.5 * uResolution) * px;
      // the paper breathes: a slow, low-frequency warp (smooth, so once per pixel)
      vec2 breathe = uBreathe * 0.05 * (vec2(fbm3(z0 * 1.1 + vec2(0.0, uClock * 0.06)), fbm3(z0 * 1.1 + vec2(4.3, 1.9) - uClock * 0.05)) - 0.5);
      // line boil: a sub-pixel shudder, re-hashed 12 times a second
      float frame = floor(uClock * 12.0);
      vec2 shudder = uShudder * 0.8 * px * (vec2(hash(vec2(frame, 3.1)), hash(vec2(frame, 7.7))) - 0.5);
      vec3 col = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5;
        col += shade((frag + o - 0.5 * uResolution) * px + breathe + shudder);
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
      uS: { value: [996, 0, 1, 2] },
      uU: { value: 0 },
      uSlowS: { value: [996, 0, 1, 2] },
      uSlowU: { value: 0 },
      uAmp: { value: 1 },
      uFlow: { value: 1 },
      uClock: { value: 0 },
      uJitter: { value: 0.5 },
      uBleed: { value: 1 },
      uShudder: { value: 1 },
      uBreathe: { value: 1 },
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
    u.uS.value = m.seeds;
    u.uU.value = m.u;
    u.uSlowS.value = m.slowSeeds;
    u.uSlowU.value = m.slowU;
    u.uAmp.value = m.amp;
    u.uFlow.value = m.flow;
    u.uClock.value = m.clock;
    u.uJitter.value = ctx.params.jitter;
    u.uBleed.value = ctx.params.bleed;
    u.uShudder.value = ctx.params.shudder;
    u.uBreathe.value = ctx.params.breathe;
    u.uBreaks.value = ctx.params.breaks;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
