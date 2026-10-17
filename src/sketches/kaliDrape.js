import { TAU } from '../lib/motion.js';

// Kali Drape: Kali Silk woven into cloth, folding under a moving light.
//
// As in Kali Silk, every patch of the screen runs its own Kali set
// p ↦ |p| / |p|^α − c, with c and α picked per point by a noise field. Here
// that field is also the cloth's height:
//
//     H(z) = fbm(0.6 z + 1.6 q(z)),   q(z) = fbm(0.6 z + v t)
//
// (noise warped by noise, so the folds bunch and twist instead of rolling in
// even waves). Three things follow from H:
//   • the threads are pulled along the slope, z ↦ z + k ∇H, so they bunch in
//     the folds the way real fabric does;
//   • the cloth is lit: its normal is (−∇H, 1), a light circles overhead, and
//     the folds get a soft diffuse shade and a narrow sheen;
//   • the sheen's colour comes from the slope direction (thin-film style), so
//     the highlights shift through the rainbow as the folds move.
// There are two thread layers, warp and weft: the second runs a quarter turn
// round from the first in its own hues, so they cross like a weave.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 59;

export default {
  name: 'Kali Drape',
  description:
    'Kali Silk woven into cloth: two layers of wandering Kali threads (warp and weft) on a sheet whose folds ' +
    'move under a circling light, with an iridescent sheen that shifts colour along the folds.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'domain warping', 'lighting', 'quasi-periodic', 'random'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.8 + 0.2 * s(1, 0.7) + 0.07 * s(R3, 2.5),
      cy: 0.6 + 0.14 * s(PHI, 1.9) + 0.06 * s(R2 * PHI, 0.6),
      alpha: 2.1 + 0.3 * s(R2, 1.2) + 0.1 * s(PHI * R3, 0.3),
      theta: 0.7 * s(1 / PHI, 2.2),
      zoom: Math.exp(0.3 + 0.35 * s(1 / R3, 1.7)),
      hue: ((t * W * 0.8) / TAU) % 1,
      light: (t * TAU) / 23, // the light goes round once every 23 s
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|p|}{|p|^{\\alpha(z)}} - c(z),\\quad z \\mapsto z + ${hl(params.folds, 2)}\\,\\nabla H \\\\` +
    `H(z) &= \\text{fbm}\\big(0.6z + 1.6\\,q(z)\\big),\\quad q = \\text{fbm}(0.6z + vt) \\\\` +
    `c(z) &= (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) + ${hl(params.warp, 2)}\\,\\big(H, q\\big) - \\tfrac12 \\\\` +
    `\\text{light} &= \\big(0.45 + 0.55\\,\\hat n\\cdot\\hat\\ell\\big) + \\text{sheen}\\,(\\hat n\\cdot\\hat h)^{60},\\quad \\hat n \\propto (-\\nabla H, 1),\\ \\angle\\hat\\ell = ${hl(((m.light % TAU) * 180) / Math.PI, 0)}^\\circ` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    warp: { value: 0.35, min: 0, max: 1, step: 0.01 },
    folds: { value: 1, min: 0, max: 2.5, step: 0.05 },
    sheen: { value: 1, min: 0, max: 2.5, step: 0.05 },
    weave: { value: 0.5, min: 0, max: 1, step: 0.01 },
    iterations: { value: 10, min: 4, max: 18, step: 1 },
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
    uniform float uLight;
    uniform float uClock;
    uniform float uWarp;
    uniform float uFolds;
    uniform float uSheen;
    uniform float uWeave;
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

    // The cloth: q is the slow field, H the height (noise warped by noise).
    vec2 cloth(vec2 z) {
      vec2 fz = z * 0.6 + 0.3 * vec2(sin(uClock * 0.029), cos(uClock * 0.037));
      float q = fbm(fz + vec2(0.0, uClock * 0.045));
      float H = fbm(fz + 1.6 * vec2(q, fbm(fz + vec2(5.2, 1.3) - uClock * 0.038)) + vec2(1.7, 9.2));
      return vec2(H, q);
    }

    // One layer of threads: Silk's per-point Kali, its trap lines turned by turn0.
    vec3 threads(vec2 z, vec2 n, float turn0, float hue0) {
      vec2 c = uC + uWarp * (n - 0.5);
      float alpha = uAlpha + uWarp * 1.5 * (n.x - n.y);
      vec2 p = uZoom * (rot(uTheta + turn0) * (z + uWarp * 0.8 * (n - 0.5)));
      vec3 col = vec3(0.0);
      for (int i = 0; i < 18; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * alpha) - c;
        float a = 2.39996 * fi + uTheta * 2.0 + turn0;
        float d = min(abs(dot(p, vec2(cos(a), sin(a)))), abs(length(p) - 0.6 - 0.4 * n.x)) * (1.0 + 0.6 * fi);
        float g = 0.014 / (d + 0.014);
        col += rainbow(hue0 + 0.9 * n.x - 0.6 * n.y + 0.17 * fi) * g * g * exp(-0.14 * fi) * 1.8;
      }
      return col;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z0 = (frag - 0.5 * uResolution) * px;

      // The cloth's height and slope (smooth, so once per pixel is enough).
      float e = 0.01;
      vec2 n = cloth(z0);
      vec2 grad = vec2(cloth(z0 + vec2(e, 0.0)).x - n.x, cloth(z0 + vec2(0.0, e)).x - n.x) / e;
      vec2 pull = uFolds * 0.08 * grad;                    // threads bunch along the folds

      vec3 warp = vec3(0.0), weft = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5;
        vec2 z = (frag + o - 0.5 * uResolution) * px + pull;
        warp += threads(z, n, 0.0, uHue);
        if (uWeave > 0.01) weft += threads(z * 1.07, n.yx, 1.5708, uHue + 0.33);
      }
      warp *= 0.25; weft *= 0.25;
      // over-under: the weft shows where it is brighter, the warp elsewhere, with a soft cross-fade
      float over = smoothstep(-0.15, 0.15, dot(weft - warp, vec3(0.333)));
      vec3 thr = mix(warp + 0.25 * weft * uWeave, weft * uWeave + 0.25 * warp, over * uWeave * 0.7);

      // Light the cloth.
      vec3 nrm = normalize(vec3(-grad * uFolds * 0.5, 1.0));
      vec3 L = normalize(vec3(cos(uLight), sin(uLight), 1.1));
      vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
      float diff = 0.45 + 0.55 * max(dot(nrm, L), 0.0);
      float spec = pow(max(dot(nrm, Hv), 0.0), 60.0);
      vec3 film = rainbow(uHue + 0.5 + 0.25 * atan(grad.y, grad.x) / 3.14159 + 0.6 * n.x);   // iridescent sheen

      vec3 back = rainbow(uHue + 0.5 + 1.2 * n.y) * 0.07;
      vec3 col = (back + uGlow * thr) * diff + film * spec * 0.22 * uSheen + thr * spec * 0.5 * uSheen;

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
      uLight: { value: 0 },
      uClock: { value: 0 },
      uWarp: { value: 0.35 },
      uFolds: { value: 1 },
      uSheen: { value: 1 },
      uWeave: { value: 0.5 },
      uIterations: { value: 10 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    const P = ctx.params;
    u.uC.value = [m.cx, m.cy];
    u.uAlpha.value = m.alpha;
    u.uTheta.value = m.theta;
    u.uZoom.value = m.zoom;
    u.uHue.value = m.hue;
    u.uLight.value = m.light;
    u.uClock.value = m.clock;
    u.uWarp.value = P.warp;
    u.uFolds.value = P.folds;
    u.uSheen.value = P.sheen;
    u.uWeave.value = P.weave;
    u.uIterations.value = P.iterations;
    u.uGlow.value = P.glow;
    u.uSat.value = P.saturation;
  },
};
