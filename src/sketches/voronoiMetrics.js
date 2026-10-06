import { TAU, phaseOf, segments } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Voronoi cells under different ideas of distance. Each cell is everything
// closer to its seed than to any other, where "closer" is measured by the
// p-norm
//
//     d_p(x, y) = (|Δx|^p + |Δy|^p)^{1/p}
//
// and p is what changes:
//
//     p = 1   taxicab: you walk the streets, so a "circle" is a diamond
//     p = 2   Euclid: as the crow flies, circles are circles
//     p = ∞   chessboard: max(|Δx|, |Δy|), how far a king walks; circles are squares
//     p < 1   not a distance any more: the triangle inequality fails
//             (going via a corner can be shorter than going straight)
//
// At p = 1 (and ∞) a "boundary" can be a whole region rather than a line:
// where |Δx| = |Δy| from two seeds, a quarter-plane of points can be exactly
// equally far from both. Those show as black patches. They're correct.
//
// The thin outline around each seed is that seed's "unit circle" in the
// current p, scaled down: the shape every cell boundary is made from. Cell
// borders are where the nearest and second-nearest seeds are equally far.
// Loop (40 s): p = 2 → 1 → 0.5 → 1 → 2 → 6 → ∞ → 2, interpolated in log p,
// while the seeds drift on closed Lissajous paths.

const PERIOD = 40;
const STOPS = [2, 1, 0.5, 1, 2, 6, 60];   // 60 stands for ∞ (max of the two)
const SEEDS = 26;

export default {
  name: 'Voronoi Metrics',
  description:
    'Voronoi cells where the idea of distance itself changes: taxicab (diamonds), Euclidean (circles), ' +
    'chessboard (squares), and p < 1, which is not a distance at all. d = (|Δx|^p + |Δy|^p)^(1/p), p shown live.',
  tags: ['voronoi', 'metric', 'p-norm', 'geometry', 'shader'],
  category: 'Geometry',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const phase = phaseOf(t, PERIOD);
    const { index, next, blend } = segments(phase, STOPS.length, 0.45);
    const a = Math.log(STOPS[index]);
    const b = Math.log(STOPS[next]);
    return { p: Math.exp(a + (b - a) * blend), phase };
  },

  latex: (params, hl, m) => {
    const inf = m.p > 40;
    const pTex = inf ? '\\infty' : hl(m.p, 2);
    const line = inf
      ? 'Chessboard distance: how far a king walks.'
      : Math.abs(m.p - 1) < 0.03
        ? 'Taxicab: you cannot cut across the block. The black patches are real: there, two seeds are exactly as far.'
        : Math.abs(m.p - 2) < 0.03
          ? 'Euclid. As the crow flies.'
          : m.p < 0.97
            ? 'Not a distance any more: the triangle inequality fails. The cells do not mind.'
            : 'Changing what "near" means.';
    return (
      '\\begin{aligned}' +
      `d_p(\\mathbf x, \\mathbf y) &= \\big(|\\Delta x|^p + |\\Delta y|^p\\big)^{1/p},\\quad p = ${pTex} \\\\` +
      'V_i &= \\{\\mathbf x : d_p(\\mathbf x, \\mathbf s_i) \\le d_p(\\mathbf x, \\mathbf s_j)\\ \\text{for all } j\\} \\\\' +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uP;
    uniform float uPhase;
    varying vec2 vUv;

    const int SEEDS = ${SEEDS};
    const float TAU = 6.2831853;

    float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

    vec2 seed(int i, vec2 extent) {
      float f = float(i);
      vec2 home = (vec2(hash(f + 1.0), hash(f + 7.3)) * 2.0 - 1.0) * extent * 0.85;
      // Whole numbers of turns per loop, so the paths close.
      float a = TAU * uPhase;
      vec2 wob = vec2(sin(a * (1.0 + floor(hash(f + 3.1) * 3.0)) + TAU * hash(f + 5.0)),
                      sin(a * (1.0 + floor(hash(f + 4.7) * 3.0)) + TAU * hash(f + 9.0)));
      return home + 0.12 * wob;
    }

    float dist(vec2 d) {
      d = abs(d);
      if (uP > 40.0) return max(d.x, d.y);
      // (x^p + y^p)^(1/p), scaled by the larger component so pow never overflows.
      float m = max(max(d.x, d.y), 1e-6);
      return m * pow(pow(d.x / m, uP) + pow(d.y / m, uP), 1.0 / uP);
    }

    vec3 palette(float t) {
      return 0.42 + 0.3 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
    }

    void main() {
      float aspect = uResolution.x / uResolution.y;
      vec2 extent = vec2(aspect, 1.0);
      vec2 x = (vUv * 2.0 - 1.0) * extent;
      float px = 2.0 / uResolution.y;

      float d1 = 1e9, d2 = 1e9;
      int i1 = 0;
      vec2 s1 = vec2(0.0);
      for (int i = 0; i < SEEDS; i++) {
        vec2 s = seed(i, extent);
        float d = dist(x - s);
        if (d < d1) { d2 = d1; d1 = d; i1 = i; s1 = s; }
        else if (d < d2) { d2 = d; }
      }

      vec3 col = palette(hash(float(i1) + 0.5)) * (0.55 + 0.45 * exp(-3.0 * d1));
      // Border: nearest and second-nearest equally far.
      float border = smoothstep(2.5 * px, 0.5 * px, d2 - d1);
      col = mix(col, vec3(0.03, 0.03, 0.05), border);
      // The seed's unit "circle" in this p, radius 0.09.
      float ring = abs(d1 - 0.09);
      col = mix(col, vec3(1.0, 0.95, 0.85), smoothstep(1.6 * px, 0.4 * px, ring) * 0.85);
      col = mix(col, vec3(1.0), smoothstep(5.0 * px, 3.5 * px, length(x - s1)));
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uP: { value: 2 }, uPhase: { value: 0 } };
  },

  update(ctx, state) {
    state.uniforms.uP.value = ctx.motion.p;
    state.uniforms.uPhase.value = ctx.motion.phase;
  },
};
