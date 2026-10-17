import { TAU } from '../lib/motion.js';

// Kali Tangle: Kali Drift with the tidiness taken out.
//
// Kali Drift's lines look neat for two reasons: every step folds with the same
// mirror |p| (so the picture is mirror-symmetric), and the glow measures the
// closest pass to the same three curves every time (the two axes and the unit
// circle). Here both are randomised per step:
//
//     p ↦ |R_i p + s_i| / |p|^α − c,     R_i = rotation by a_i(t)
//
// each step i turns by its own random angle a_i, which drifts at its own random
// rate, and folds about a mirror shifted off-centre by s_i (the inversion still
// measures |p| from the centre, so no symmetry survives), and each step has its own trap: a random line (direction b_i, offset o_i)
// and a random circle. Every pass near a trap adds a strand in that step's own
// random hue (they are summed, not just the closest kept), so the strands cross
// and tangle like loose thread. c, α, the turn and the zoom drift on clocks in
// irrational ratio, as in Kali Drift, so it never repeats.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 53;

export default {
  name: 'Kali Tangle',
  description:
    "Kali's fractal with a random turn before every fold and a random line and circle to glow against at every " +
    'step, so the neat mirror lines come loose into a drifting tangle of coloured strands.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'quasi-periodic', 'orbit trap', 'random'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.78 + 0.22 * s(1, 0.4) + 0.08 * s(R3, 1.1),
      cy: 0.6 + 0.16 * s(PHI, 2.3) + 0.06 * s(R2 * PHI, 0.9),
      alpha: 2.05 + 0.4 * s(R2, 1.7) + 0.12 * s(PHI * R3, 0.2),
      theta: 0.8 * s(1 / PHI, 0.6),
      zoom: Math.exp(0.4 + 0.45 * s(1 / R3, 2.0)),
      hue: ((t * W * 0.7) / TAU) % 1,
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `p &\\mapsto \\frac{|R_{a_i} p + s_i|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `a_i(t) &= ${hl(params.chaos, 2)}\\,\\big(2\\pi\\,h(i) + \\omega_i t\\big),\\quad \\omega_i = 2h(i')-1 \\\\` +
    `d_i &= \\min\\big(|p_i\\cdot n_{b_i} - o_i|,\\ \\big||p_i - q_i| - \\rho_i\\big|\\big)\\,(1 + 0.7\\,i) \\\\` +
    '\\text{colour} &= \\textstyle\\sum_i \\text{rainbow}(h_i)\\,\\Big(\\frac{w}{d_i + w}\\Big)^2 e^{-0.12 i}' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    chaos: { value: 0.6, min: 0, max: 1, step: 0.01 },
    iterations: { value: 12, min: 4, max: 24, step: 1 },
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
    uniform float uChaos;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float h(float n) { return fract(sin(n * 127.1 + 4.7) * 43758.5453); }

    vec3 shade(vec2 z) {
      z += 0.06 * uChaos * sin(z.yx * 3.1 + vec2(uClock * 0.21, uClock * 0.17));   // a slow wobble
      z += 0.35 * vec2(sin(uClock * 0.031), cos(uClock * 0.023 + 1.0));   // pan, so the centre isn't always mid-screen
      vec2 p = uZoom * (rot(uTheta) * z);
      vec3 col = vec3(0.0);
      float r1 = 0.0;
      for (int i = 0; i < 24; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        // Each step turns by its own random angle, drifting at its own random rate.
        p = rot(uChaos * (6.2831 * h(fi + 0.13) + uClock * 0.25 * (2.0 * h(fi + 0.71) - 1.0))) * p;
        // ...and folds about a mirror shifted off the centre by its own random amount,
        // while the inversion still measures |p| from the centre: no symmetry survives.
        float r2 = max(dot(p, p), 1e-6);
        vec2 sh = uChaos * 0.45 * (vec2(h(fi + 31.7), h(fi + 37.3)) - 0.5) * vec2(sin(uClock * 0.05 * (1.0 + h(fi + 41.0))), 1.0);
        p = abs(p + sh) / pow(r2, 0.5 * uAlpha) - uC;
        if (i == 0) r1 = length(p);
        // This step's own trap: a random line and a random circle.
        float b = 6.2831 * h(fi + 3.7) + uClock * 0.07 * (2.0 * h(fi + 5.1) - 1.0);
        float dl = abs(dot(p, vec2(cos(b), sin(b))) - (h(fi + 9.2) - 0.5) * 1.2);
        vec2 q = (vec2(h(fi + 11.3), h(fi + 13.9)) - 0.5) * 1.6;
        float dc = abs(length(p - q) - 0.25 - 0.55 * h(fi + 17.1));
        float d = min(dl, dc) * (1.0 + 0.7 * fi);
        float w = 0.012 + 0.018 * h(fi + 21.0);
        float hue = uHue + h(fi * 1.37 + (dl < dc ? 0.0 : 40.0));
        float g = w / (d + w);
        float ink = 0.55 + 0.45 * sin(dot(p, vec2(5.3, 3.1)) * (1.0 + h(fi + 45.0)) + fi);   // strands thicken and thin
        col += rainbow(hue) * g * g * ink * exp(-0.12 * fi) * 2.4;
      }
      vec3 back = rainbow(uHue + 0.5 + 0.12 * log(r1 + 0.05)) * 0.12;
      return back + uGlow * col;
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
      uC: { value: [0.78, 0.6] },
      uAlpha: { value: 2 },
      uTheta: { value: 0 },
      uZoom: { value: 2 },
      uHue: { value: 0 },
      uClock: { value: 0 },
      uChaos: { value: 0.6 },
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
    u.uClock.value = m.clock;
    u.uChaos.value = ctx.params.chaos;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
  },
};
