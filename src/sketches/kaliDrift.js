import { TAU } from '../lib/motion.js';

// Kali's set, drifting and never repeating.
//
// Kali's fractal (the "Kaliset") repeats one step:
//
//     p ↦ |p| / |p|^α − c
//
// The |p| is the axis mirror (as in Radian628), and p/|p|² is an inversion in
// the unit circle: everything inside the circle is thrown outside and back. With
// α = 2 it is the classic set; α between 1.5 and 2.8 changes how hard the
// inversion pulls, from soft lace to sharp crystal.
//
// No loop: c, α, the turn θ and the zoom all move on sines whose frequencies are
// in irrational ratio (1, φ, √2, √3, ...), so the parameter point never comes
// back to where it was. It wanders a box of (c, α) that was checked to stay
// busy (no escaping to black, no collapsing to a single fixed point), and the
// palette's hue drifts on its own irrational clock too.
//
// Colour comes from the whole orbit, not only near-misses: every pixel gets a
// hue from the average of log|p| along its orbit (so there is no empty black),
// and orbit traps (closest pass to the axes and to the unit circle) add the
// bright filaments on top.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 47; // base angular frequency: the slowest drift takes ~47 s

export default {
  name: 'Kali Drift',
  description:
    "Kali's fractal p ↦ |p|/|p|^α − c: a mirror and an inversion in the unit circle, repeated. c, α, the turn and " +
    'the zoom drift on clocks in irrational ratio, so the picture never repeats.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'quasi-periodic', 'orbit trap'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.8 + 0.28 * s(1) + 0.1 * s(R3, 2.1),
      cy: 0.62 + 0.18 * s(PHI, 1.3) + 0.08 * s(R2 * PHI, 0.4),
      alpha: 2.15 + 0.5 * s(R2, 0.7) + 0.15 * s(PHI * R3, 2.9),
      theta: 0.6 * s(1 / PHI, 2.6) + 0.25 * s(R3 / PHI, 1.1),
      zoom: Math.exp(0.35 + 0.6 * s(1 / R3, 4.0) + 0.15 * s(R2 * R3, 0.9)),
      hue: (t * W * 0.6 / TAU) % 1,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|p|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `c(t) &= c_0 + \\textstyle\\sum_k a_k \\sin(\\omega_k t + \\phi_k),\\quad \\omega_k \\propto 1,\\ \\varphi,\\ \\sqrt2,\\ \\sqrt3 \\\\` +
    `p_0 &= ${hl(m.zoom, 2)}\\,R_{${hl(m.theta, 2)}}\\,z \\\\` +
    '\\text{hue} &= \\tfrac1n\\textstyle\\sum \\log|p_i|,\\quad \\text{glow} = \\min_i \\min(|x_i|, |y_i|, \\big||p_i|-1\\big|)' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    iterations: { value: 12, min: 4, max: 32, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uC;
    uniform float uAlpha;
    uniform float uTheta;
    uniform float uZoom;
    uniform float uHue;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    vec3 rainbow(float t) {
      return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667)));
    }

    // One sample: the orbit of z, coloured by the depth of its closest pass.
    vec3 shade(vec2 z) {
      float c = cos(uTheta), s = sin(uTheta);
      vec2 p = uZoom * (mat2(c, -s, s, c) * z);
      float best = 1e9, bestI = 0.0, r1 = 0.0;
      for (int i = 0; i < 32; i++) {
        if (float(i) >= uIterations) break;
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * uAlpha) - uC;
        float r = length(p);
        if (i == 0) r1 = r;
        // Closest pass to the mirror axes or the inversion circle. Deep passes
        // count for less, so the picture is drawn by the first few levels and
        // the chaos underneath stays a fine texture instead of grain.
        float d = min(min(abs(p.x), abs(p.y)), abs(r - 1.0)) * (1.0 + 0.8 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.035 / (best + 0.035);
      // Each level gets its own hue; the backdrop is a smooth wash from the first step.
      vec3 lines = rainbow(uHue + 0.14 * bestI + 0.05 * r1) * g * g * 1.6;
      vec3 back = rainbow(uHue + 0.5 + 0.12 * log(r1 + 0.05)) * 0.14;
      return back + uGlow * lines;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec3 col = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5 ;
        col += shade((frag + o - 0.5 * uResolution) * px);
      }
      col *= 0.25;

      // Saturation, then compress by the brightest channel so hues survive.
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
      uC: { value: [0.78, 0.52] },
      uAlpha: { value: 2 },
      uTheta: { value: 0 },
      uZoom: { value: 2 },
      uHue: { value: 0 },
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
    u.uHue.value = m.hue;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
