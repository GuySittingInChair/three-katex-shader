import { phaseOf, smooth } from '../lib/motion.js';

// Radian628's fold, with a curved mirror.
//
// The Radian628 fractal repeats   p ↦ |p| − c,  scale, rotate,  + ∫ sin(kp + t) dp.
// The |p| is a mirror: it reflects every point onto the positive side of the
// axes. Here the mirror can be *any curve* g(p) = 0:
//
//     p ↦ p + (|g| − g) ∇g / |∇g|²
//
// For the line g = x that is exactly x ↦ |x|; for a curve it reflects the
// inside of the shape onto the outside, across the curve (to first order: g
// is used as a distance, g/|∇g|). Repeating it with Radian628's scale, turn
// and integral warp grows the fractal *on* the shape, with smaller copies of
// it echoing along its own edge.
//
// The mirrors are shapes from other sketches, as implicit curves:
//   Hopf link     (|p − c₁| − r)(|p − c₂| − r) = 0           two fibres, each through the other's centre
//   trefoil       (x² + y²)² = a(x³ − 3xy²)                  the shadow of the trefoil knot (rose r = a cos 3θ)
//   lemniscate    (x² + y²)² = a²(x² − y²)                   the figure-eight (Möbius strip's shadow)
//   cardioid      (x² + y² − ax)² = a²(x² + y²)              the Mandelbrot set's main bulb
//   deltoid       (x² + y²)² + 18a²(x² + y²) − 27a⁴ = 8a(x³ − 3xy²)
//
// Loop (30 s, 6 s per shape): hold a shape, then slide to the next one, g =
// (1 − s) g_A + s g_B (both scaled to distances first, so the curve in between
// is a real blend of the two). The axis mirror |·| is kept *after* the curved
// one, so the echoes grow symmetrically all round the shape. μ fades the
// curved mirror in at the start of each loop (μ = 0 is plain Radian628) and
// out again at the end, so the loop closes.

const PERIOD = 30;
const SHAPES = [
  { name: 'Hopf link', tex: '(|p-c_1|-r)(|p-c_2|-r)' },
  { name: 'trefoil', tex: '(x^2+y^2)^2 - a(x^3-3xy^2)' },
  { name: 'lemniscate', tex: '(x^2+y^2)^2 - a^2(x^2-y^2)' },
  { name: 'cardioid', tex: '(x^2+y^2-ax)^2 - a^2(x^2+y^2)' },
  { name: 'deltoid', tex: '(x^2+y^2)^2 + 18a^2(x^2+y^2) - 27a^4 - 8a(x^3-3xy^2)' },
];

export default {
  name: 'Radian628 — Shape Mirror',
  description:
    "Radian628's fractal folds space in a mirror (p ↦ |p|). Here the mirror is a curve instead: the Hopf link, " +
    'the trefoil, the lemniscate, the cardioid and the deltoid, so the fractal grows on each shape and on smaller ' +
    'copies of it, and morphs as the mirror slides from one shape to the next.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'implicit curve', 'reflection'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const x = p * SHAPES.length;
    const a = Math.floor(x) % SHAPES.length;
    const local = x - Math.floor(x);
    const s = smooth((local - 0.6) / 0.35); // hold 60 %, slide, settle
    // The axis mirror melts into the curved one over the first 4 s of the loop
    // and comes back over the last 2 s, so the loop closes on plain Radian628.
    const tl = p * PERIOD;
    const mu = Math.min(smooth(tl / 4), smooth((PERIOD - tl) / 2));
    return { a, b: (a + 1) % SHAPES.length, s, mu, theta: 0.35 * Math.sin((2 * Math.PI * p) * 2) + 0.12 };
  },

  latex: (params, hl, m) => {
    const A = SHAPES[m.a];
    const B = SHAPES[m.b];
    const g = m.s < 0.02 ? `g_{\\text{${A.name}}}` : m.s > 0.98 ? `g_{\\text{${B.name}}}` :
      `(1-s)\\,g_{\\text{${A.name}}} + s\\,g_{\\text{${B.name}}},\\ s=${hl(m.s, 2)}`;
    const shown = m.s > 0.5 ? B : A;
    return (
      '\\begin{aligned}' +
      `p &\\mapsto \\Big|\\,p + \\mu\\,(|g|-g)\\tfrac{\\nabla g}{|\\nabla g|^2}\\Big|,\\quad \\mu = ${hl(m.mu, 2)} \\\\` +
      `p &\\mapsto ${hl(params.scale, 2)}\\,R_{${hl(m.theta, 2)}}(p - c) - \\tfrac{0.08}{k}\\cos(kp + t) \\\\` +
      `g &= ${g} \\\\` +
      `g_{\\text{${shown.name}}} &= ${shown.tex}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    iterations: { value: 9, min: 3, max: 16, step: 1 },
    scale: { value: 1.32, min: 1.05, max: 1.8, step: 0.01 },
    glow: { value: 1, min: 0.2, max: 2.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform int uA;
    uniform int uB;
    uniform float uS;
    uniform float uMu;
    uniform float uTheta;
    uniform float uIterations;
    uniform float uScale;
    uniform float uGlow;
    varying vec2 vUv;

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

    vec2 trigIntegral(vec2 p, float k, float phase) {
      return -cos(p * k + phase) / k;      // ∫ sin(k p + phase) dp
    }

    vec3 palette(float t) {                // deep teal → violet → ember, kept below white
      return 0.5 + 0.45 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) * 0.7 + t + vec3(0.55, 0.6, 0.75)));
    }

    void main() {
      vec2 frag = vUv * uResolution;
      vec2 p = (frag - 0.5 * uResolution) / (0.5 * min(uResolution.x, uResolution.y)) * 1.25;

      float c = cos(uTheta), sn = sin(uTheta);
      mat2 rot = mat2(c, -sn, sn, c);
      float k = 2.4 + 0.6 * sin(uTime * 0.13);

      vec3 col = vec3(0.0);
      float trap = 1e9;
      float zoom = 1.0;                     // how much the orbit has been magnified so far
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uIterations) break;
        vec3 ga = shapeG(uA, p);
        vec3 gb = shapeG(uB, p);
        vec3 g = mix(ga, gb, uS);
        vec2 n = normalize(g.yz + 1e-6);

        // Glow where the orbit passes the mirror: |g| / zoom is the distance in screen units.
        float d = abs(g.x) / zoom;
        trap = min(trap, d);
        float w = exp(-0.22 * float(i));
        col += uGlow * w * palette(0.09 * float(i) + 0.15 * uS + 0.2 * float(uA)) * 0.0045 / (d + 0.004);

        // The curved mirror across g = 0 (faded in by μ), then Radian628's axis mirror.
        vec2 curved = p + (abs(g.x) - g.x) * n;
        p = abs(mix(p, curved, uMu));

        p = uScale * (rot * (p - vec2(0.18, 0.1)));
        p += 0.08 * trigIntegral(p, k, uTime * 0.5);
        zoom *= uScale;
      }

      // Radian628's own banding, dimmed, as the body of the fractal.
      float band = 0.5 + 0.5 * sin(length(p) * 9.0 - uTime * 0.6);
      vec3 body = palette(0.5 + 0.1 * length(p)) * band * 0.10 * exp(-0.15 * length(p));
      col += body;

      // Tone map (no blown-out white) and a vignette.
      col = 1.0 - exp(-col * 1.1);
      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.6 * dot(v, v);
      gl_FragColor = vec4(pow(col, vec3(0.95)), 1.0);
    }
  `,

  uniforms() {
    return {
      uA: { value: 0 },
      uB: { value: 1 },
      uS: { value: 0 },
      uMu: { value: 0 },
      uTheta: { value: 0.12 },
      uIterations: { value: 9 },
      uScale: { value: 1.32 },
      uGlow: { value: 1 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uA.value = m.a;
    u.uB.value = m.b;
    u.uS.value = m.s;
    u.uMu.value = m.mu;
    u.uTheta.value = m.theta;
    u.uIterations.value = ctx.params.iterations;
    u.uScale.value = ctx.params.scale;
    u.uGlow.value = ctx.params.glow;
  },
};
