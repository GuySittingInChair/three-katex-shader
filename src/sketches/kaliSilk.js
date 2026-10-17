import { TAU } from '../lib/motion.js';

// Kali Silk: a different Kali set in every patch of the screen.
//
// Kali Drift runs one fractal, p ↦ |p| / |p|^α − c, with the same c and α for
// every pixel, so every line belongs to the same tidy family. Here c and α are
// fields: a smooth noise field n(z) (fractal Brownian motion, drifting slowly)
// picks them per point,
//
//     c(z) = c + k (n(z) − ½),     α(z) = α + 1.5 k (n₁(z) − n₂(z)),
//
// and the start point is warped by the same field. Neighbouring pixels run
// nearly the same fractal, so the lines stay continuous, but across the screen
// they bend, split and wander like threads in loose silk.
//
// The glow sums every pass near a line through the orbit point, and the line
// turns by the golden angle (≈ 137.5°) each step, so no two steps glow against
// the same direction. Hues come from the noise field and the step, on a palette
// that drifts on its own clock.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 59;

export default {
  name: 'Kali Silk',
  description:
    "Kali's fractal with c and α chosen per point by a drifting noise field, so every patch of the screen runs " +
    'a slightly different set and the lines bend and wander like loose silk threads.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'domain warping', 'quasi-periodic', 'random'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.8 + 0.2 * s(1, 1.9) + 0.07 * s(R3, 0.3),
      cy: 0.6 + 0.14 * s(PHI, 0.5) + 0.06 * s(R2 * PHI, 2.2),
      alpha: 2.1 + 0.3 * s(R2, 2.4) + 0.1 * s(PHI * R3, 1.4),
      theta: 0.7 * s(1 / PHI, 1.6),
      zoom: Math.exp(0.35 + 0.4 * s(1 / R3, 0.8)),
      hue: ((t * W * 0.8) / TAU) % 1,
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|p|}{|p|^{\\alpha(z)}} - c(z) \\\\` +
    `c(z) &= (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) + ${hl(params.warp, 2)}\\,\\big(n(z) - \\tfrac12\\big),\\quad n = \\text{fbm}(1.3z + vt) \\\\` +
    `\\alpha(z) &= ${hl(m.alpha, 2)} + 1.5\\cdot${hl(params.warp, 2)}\\,\\big(n_1(z) - n_2(z)\\big) \\\\` +
    '\\text{glow} &= \\textstyle\\sum_i \\Big(\\frac{w}{|p_i \\cdot u_i|(1+0.6i) + w}\\Big)^2,\\quad u_i = (\\cos 137.5^\\circ i,\\ \\sin 137.5^\\circ i)' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    warp: { value: 0.35, min: 0, max: 1, step: 0.01 },
    iterations: { value: 11, min: 4, max: 20, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform vec2 uC;
    uniform float uAlpha;
    uniform float uTheta;
    uniform float uZoom;
    uniform float uHue;
    uniform float uClock;
    uniform float uWarp;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.03 + 1.7) + 0.2 * noise(p * 4.01 + 3.1); }

    vec3 shade(vec2 z, vec2 n) {
      vec2 c = uC + uWarp * (n - 0.5);
      float alpha = uAlpha + uWarp * 1.5 * (n.x - n.y);
      vec2 p = uZoom * (rot(uTheta) * (z + uWarp * 0.8 * (n - 0.5)));
      vec3 col = vec3(0.0);
      float r1 = 0.0;
      for (int i = 0; i < 20; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * alpha) - c;
        if (i == 0) r1 = length(p);
        float a = 2.39996 * fi + uTheta * 2.0;          // golden angle: a new direction every step
        float d = min(abs(dot(p, vec2(cos(a), sin(a)))), abs(length(p) - 0.6 - 0.4 * n.x)) * (1.0 + 0.6 * fi);
        float w = 0.014;
        float g = w / (d + w);
        col += rainbow(uHue + 0.9 * n.x - 0.6 * n.y + 0.17 * fi) * g * g * exp(-0.14 * fi) * 1.8;
      }
      vec3 back = rainbow(uHue + 0.5 + 1.2 * n.y + 0.1 * log(r1 + 0.05)) * 0.11;
      return back + uGlow * col;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z0 = (frag - 0.5 * uResolution) * px;
      // The field that picks each patch's fractal (smooth, so once per pixel is enough).
      vec2 fz = z0 * 1.3 + 0.3 * vec2(sin(uClock * 0.029), cos(uClock * 0.037));
      vec2 n = vec2(fbm(fz + vec2(0.0, uClock * 0.045)), fbm(fz + vec2(5.2, 1.3) - uClock * 0.038));
      vec3 col = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5;
        col += shade((frag + o - 0.5 * uResolution) * px, n);
      }
      col *= 0.25;

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
      uAlpha: { value: 2.1 },
      uTheta: { value: 0 },
      uZoom: { value: 2 },
      uHue: { value: 0 },
      uClock: { value: 0 },
      uWarp: { value: 0.35 },
      uIterations: { value: 11 },
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
    u.uHue.value = m.hue;
    u.uClock.value = m.clock;
    u.uWarp.value = ctx.params.warp;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
