import { phaseOf, smooth } from '../lib/motion.js';

// Shape Mirror, through a prism.
//
// Same curved mirror as radian628ShapeMirror.js,
//
//     p ↦ p + (|g| − g) ∇g / |∇g|²
//
// across the Hopf link, trefoil, lemniscate, cardioid and deltoid, but with two
// changes to Radian628's step:
//
//   1. The axis mirror |p| (a 2-fold fold: four quadrants onto one) becomes a
//      kaleidoscope of N mirrors through the origin, folding the angle into one
//      wedge of width π/N:
//          φ ↦ | (φ mod 2π/N) − π/N |
//      N = 2 is |p| again, up to a turn. The loop walks N = 3 → 4 → 5 → 6 → 3 so the echoes
//      come in triangles, squares, pentagons, hexagons (the slide between two
//      counts blends the two folds, since a fractional N leaves a seam).
//   2. The integral warp is crossed: x is pushed by ∫ sin(k y + t) and y by
//      ∫ sin(k x + t), which shears the echoes into swirls where the original
//      only stretched them.
//
// Colour: each glow is coloured by the orbit's angle as well as its depth, on a
// full-saturation rainbow palette, then tone-mapped by its brightest channel
// so the hues stay saturated instead of washing to white.

const PERIOD = 30;
const SHAPES = [
  { name: 'Hopf link', tex: '(|p-c_1|-r)(|p-c_2|-r)' },
  { name: 'trefoil', tex: '(x^2+y^2)^2 - a(x^3-3xy^2)' },
  { name: 'lemniscate', tex: '(x^2+y^2)^2 - a^2(x^2-y^2)' },
  { name: 'cardioid', tex: '(x^2+y^2-ax)^2 - a^2(x^2+y^2)' },
  { name: 'deltoid', tex: '(x^2+y^2)^2 + 18a^2(x^2+y^2) - 27a^4 - 8a(x^3-3xy^2)' },
];
const FOLDS = [3, 4, 5, 6, 3]; // mirrors in the kaleidoscope while each shape holds (wraps to the first)

export default {
  name: 'Radian628 — Prism Mirror',
  description:
    'Shape Mirror through a prism: the curved mirror still grows the fractal on the Hopf link, trefoil, ' +
    'lemniscate, cardioid and deltoid, but the axis fold becomes a kaleidoscope of 3 to 6 mirrors and the ' +
    'integral warp is crossed into swirls, in full rainbow colour.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'implicit curve', 'reflection', 'kaleidoscope'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const x = p * SHAPES.length;
    const a = Math.floor(x) % SHAPES.length;
    const local = x - Math.floor(x);
    const s = smooth((local - 0.6) / 0.35); // hold 60 %, slide, settle
    // The kaleidoscope changes its mirror count along with the shape. A
    // fractional N would leave a seam, so the two whole folds are blended.
    const na = FOLDS[a], nb = FOLDS[(a + 1) % FOLDS.length];
    const tl = p * PERIOD;
    const mu = Math.min(smooth(tl / 4), smooth((PERIOD - tl) / 2));
    return { a, b: (a + 1) % SHAPES.length, s, mu, na, nb, hue: p, theta: 0.3 * Math.sin(2 * Math.PI * p * 2) + 0.1 };
  },

  latex: (params, hl, m) => {
    const A = SHAPES[m.a];
    const B = SHAPES[m.b];
    const g = m.s < 0.02 ? `g_{\\text{${A.name}}}` : m.s > 0.98 ? `g_{\\text{${B.name}}}` :
      `(1-s)\\,g_{\\text{${A.name}}} + s\\,g_{\\text{${B.name}}},\\ s=${hl(m.s, 2)}`;
    const shown = m.s > 0.5 ? B : A;
    const N = m.s < 0.02 ? `N = ${m.na}` : m.s > 0.98 ? `N = ${m.nb}` :
      `K = (1-s)K_{${m.na}} + s\\,K_{${m.nb}}`;
    return (
      '\\begin{aligned}' +
      `p &\\mapsto K_N\\Big(p + \\mu\\,(|g|-g)\\tfrac{\\nabla g}{|\\nabla g|^2}\\Big),\\quad \\mu = ${hl(m.mu, 2)} \\\\` +
      `K_N &: \\varphi \\mapsto \\big|(\\varphi \\bmod \\tfrac{2\\pi}{N}) - \\tfrac{\\pi}{N}\\big|,\\quad ${N} \\\\` +
      `p &\\mapsto ${hl(params.scale, 2)}\\,R_{${hl(m.theta, 2)}}(p - c) - \\tfrac{0.09}{k}\\cos(k\\,p_{yx} + t) \\\\` +
      `g &= ${g} \\\\` +
      `g_{\\text{${shown.name}}} &= ${shown.tex}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    iterations: { value: 9, min: 3, max: 16, step: 1 },
    scale: { value: 1.36, min: 1.05, max: 1.8, step: 0.01 },
    glow: { value: 1, min: 0.2, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform int uA;
    uniform int uB;
    uniform float uS;
    uniform float uMu;
    uniform float uNA;
    uniform float uNB;
    uniform float uHue;
    uniform float uTheta;
    uniform float uIterations;
    uniform float uScale;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    const float PI = 3.14159265;

    // The five mirrors, each an implicit polynomial f(p) = 0, about unit size.
    float shapeF(int i, vec2 p) {
      float x = p.x, y = p.y, r2 = dot(p, p);
      if (i == 0) {                        // Hopf link: two circles, each through the other's centre
        float r = 0.62;
        return (length(p - vec2(-0.31, 0.0)) - r) * (length(p - vec2(0.31, 0.0)) - r);
      }
      if (i == 1) return r2 * r2 - 0.95 * (x * x * x - 3.0 * x * y * y);          // trefoil rose
      if (i == 2) return r2 * r2 - 1.0 * (x * x - y * y);                          // lemniscate, a = 1
      if (i == 3) {                        // cardioid, a = 0.62, centred
        float a = 0.62;
        vec2 q = vec2(x + 0.5 * a, y);
        float u = dot(q, q) - a * q.x;
        return u * u - a * a * dot(q, q);
      }
      float a = 0.34;                      // deltoid
      return r2 * r2 + 18.0 * a * a * r2 - 27.0 * a * a * a * a - 8.0 * a * (x * x * x - 3.0 * x * y * y);
    }

    // f as a distance: g = f / |∇f| (first order), and its unit normal.
    vec3 shapeG(int i, vec2 p) {
      const float e = 1e-3;
      float f = shapeF(i, p);
      vec2 grad = vec2(shapeF(i, p + vec2(e, 0.0)) - shapeF(i, p - vec2(e, 0.0)),
                       shapeF(i, p + vec2(0.0, e)) - shapeF(i, p - vec2(0.0, e))) / (2.0 * e);
      float len = max(length(grad), 1e-4);
      return vec3(f / len, grad / len);
    }

    // Kaleidoscope of N mirrors through the origin: fold the angle into [0, π/N].
    vec2 kaleido(vec2 p, float n) {
      float w = 2.0 * PI / n;
      float phi = atan(p.y, p.x);
      phi = abs(mod(phi, w) - 0.5 * w);
      return length(p) * vec2(cos(phi), sin(phi));
    }

    // Crossed integral warp: x by ∫ sin(k y + t) dy, y by ∫ sin(k x + t) dx.
    vec2 crossIntegral(vec2 p, float k, float phase) {
      return -cos(p.yx * k + phase) / k;
    }

    // Full-saturation rainbow (cosine palette with 120° phase offsets).
    vec3 rainbow(float t) {
      return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667)));
    }

    void main() {
      vec2 frag = vUv * uResolution;
      vec2 p = (frag - 0.5 * uResolution) / (0.5 * min(uResolution.x, uResolution.y)) * 1.25;

      float c = cos(uTheta), sn = sin(uTheta);
      mat2 rot = mat2(c, -sn, sn, c);
      float k = 2.2 + 0.7 * sin(uTime * 0.11);

      vec3 col = vec3(0.0);
      float zoom = 1.0;
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uIterations) break;
        vec3 g = mix(shapeG(uA, p), shapeG(uB, p), uS);
        vec2 n = normalize(g.yz + 1e-6);

        // Glow where the orbit passes the mirror, hued by depth and by where on
        // the curve it passes (the orbit's angle), so each echo gets its own band.
        float d = abs(g.x) / zoom;
        float w = exp(-0.2 * float(i));
        float hue = uHue + 0.11 * float(i) + 0.5 * atan(p.y, p.x) / PI;
        col += uGlow * w * rainbow(hue) * 0.005 / (d + 0.004);

        vec2 curved = p + (abs(g.x) - g.x) * n;
        vec2 q = mix(p, curved, uMu);
        p = mix(kaleido(q, uNA), kaleido(q, uNB), uS);

        p = uScale * (rot * (p - vec2(0.2, 0.08)));
        p += 0.09 * crossIntegral(p, k, uTime * 0.45);
        zoom *= uScale;
      }

      // The body: Radian628's banding in the complementary hue, over a deep indigo.
      float r = length(p);
      float band = 0.5 + 0.5 * sin(r * 8.0 - uTime * 0.7);
      vec3 body = rainbow(uHue + 0.5 + 0.08 * r) * band * 0.16 * exp(-0.14 * r);
      col += body + vec3(0.02, 0.008, 0.05);

      // Saturation, then tone map by the brightest channel: the hue survives,
      // only the brightness is compressed (no wash to white).
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      float m = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.2 * m)) / max(m, 1e-4);

      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.55 * dot(v, v);
      gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
    }
  `,

  uniforms() {
    return {
      uA: { value: 0 },
      uB: { value: 1 },
      uS: { value: 0 },
      uMu: { value: 0 },
      uNA: { value: 3 },
      uNB: { value: 4 },
      uHue: { value: 0 },
      uTheta: { value: 0.1 },
      uIterations: { value: 9 },
      uScale: { value: 1.36 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uA.value = m.a;
    u.uB.value = m.b;
    u.uS.value = m.s;
    u.uMu.value = m.mu;
    u.uNA.value = m.na;
    u.uNB.value = m.nb;
    u.uHue.value = m.hue;
    u.uTheta.value = m.theta;
    u.uIterations.value = ctx.params.iterations;
    u.uScale.value = ctx.params.scale;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
