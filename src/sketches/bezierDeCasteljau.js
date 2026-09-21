import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// A quartic Bézier curve, built the way de Casteljau does it: repeated linear
// interpolation of the control polygon at one parameter s, until a single
// point is left.
//
//   P⁰ᵢ = Pᵢ,     Pᵏᵢ = (1 − s) Pᵏ⁻¹ᵢ + s Pᵏ⁻¹ᵢ₊₁,     B(s) = P⁴₀
//
// which unrolls to the Bernstein form  B(s) = Σ bᵢ(s) Pᵢ,  bᵢ = C(4,i)(1−s)^(4−i) sⁱ.
// The five bᵢ are non-negative and sum to 1 (a convex combination, so the curve
// stays inside the polygon's hull); on screen they are the live weights of the
// five control points at the current s.
//
// Motion (loop of PERIOD seconds): the polygon starts as a planar zig-zag and
// each successive control point is rotated a further κ about the x-axis,
//
//   Pᵢ = (xᵢ, yᵢ cos iκ, yᵢ sin iκ),    κ(t) = K · ½(1 − cos ωt)
//
// so the curve unwinds from a plane into a twisted space curve and back.
// Meanwhile s sweeps 0 → 1 → 0 three times per loop, s = ½(1 − cos 3ωt).

const PERIOD = 18;
const DEGREE = 4;
const X = [-1.8, -0.9, 0, 0.9, 1.8];
const Y = [-0.8, 1.1, -0.2, 1.1, -0.8];
const KAPPA_MAX = 0.9;
const CURVE_SAMPLES = 128;

const binom = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

const bernstein = (s) =>
  Array.from({ length: DEGREE + 1 }, (_, i) => binom(DEGREE, i) * (1 - s) ** (DEGREE - i) * s ** i);

const controlPoint = (i, kappa) => [X[i], Y[i] * Math.cos(i * kappa), Y[i] * Math.sin(i * kappa)];

function evalBezier(s, kappa) {
  const b = bernstein(s);
  const out = [0, 0, 0];
  for (let i = 0; i <= DEGREE; i++) {
    const p = controlPoint(i, kappa);
    for (let d = 0; d < 3; d++) out[d] += b[i] * p[d];
  }
  return out;
}

const col = (r, g, b) => new THREE.Color(r, g, b);
const POLYGON = col(0.36, 0.4, 0.5);
const LEVELS = [col(0.14, 0.52, 0.58), col(0.74, 0.55, 0.2), col(0.78, 0.32, 0.4)];
const POINT = col(0.95, 0.76, 0.42);
const CURVE_A = col(0.25, 0.5, 0.8);
const CURVE_B = col(0.68, 0.38, 0.72);

export default {
  name: 'De Casteljau Bézier',
  description:
    'A quartic Bézier curve constructed by de Casteljau’s repeated interpolation of its control polygon, ' +
    'while the polygon itself unwinds from a plane into a twist: control point i is rotated by iκ(t) about ' +
    'the x-axis. The parameter s(t) sweeps the curve; the equation shows the Bernstein weights bᵢ(s) — ' +
    'the live coefficients of the five control points, always summing to 1 — and the resulting point B(s).',
  tags: ['spline', 'bezier', 'interpolation'],
  category: 'Splines',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: {
    speed: { value: 1, min: 0, max: 4 },
    width: { value: 3, min: 1, max: 8 },
  },

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const kappa = KAPPA_MAX * 0.5 * (1 - Math.cos(TAU * p));
    const s = 0.5 * (1 - Math.cos(3 * TAU * p));
    const b = bernstein(s);
    const B = evalBezier(s, kappa);
    return { kappa, s, b0: b[0], b1: b[1], b2: b[2], b3: b[3], b4: b[4], Bx: B[0], By: B[1], Bz: B[2] };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    '\\mathbf B(s) &= \\sum_{i=0}^{4} b_i(s)\\,\\mathbf P_i,\\qquad b_i=\\tbinom4i(1-s)^{4-i}s^i,\\qquad ' +
    `s=\\tfrac12(1-\\cos3\\omega t)=${hl(m.s, 2)} \\\\` +
    '\\mathbf P_i &= (x_i,\\ y_i\\cos i\\kappa,\\ y_i\\sin i\\kappa),\\qquad ' +
    `\\kappa=${KAPPA_MAX}\\cdot\\tfrac12(1-\\cos\\omega t)=${hl(m.kappa, 2)} \\\\` +
    `b &= (${hl(m.b0, 2)},\\ ${hl(m.b1, 2)},\\ ${hl(m.b2, 2)},\\ ${hl(m.b3, 2)},\\ ${hl(m.b4, 2)}),\\qquad \\textstyle\\sum b_i=1 \\\\` +
    `\\mathbf B &= (${hl(m.Bx, 2)},\\ ${hl(m.By, 2)},\\ ${hl(m.Bz, 2)})` +
    '\\end{aligned}',

  setup(ctx) {
    ctx.camera.position.set(2.3, 1.5, 3.3);
    const curve = createFatLines({ maxSegments: CURVE_SAMPLES, width: ctx.params.width });
    const construction = createFatLines({ maxSegments: 16, width: Math.max(1, ctx.params.width * 0.5) });
    const dots = createDots({ maxPoints: 16 });
    ctx.scene.add(curve.object, construction.object, dots.object);
    return { curve, construction, dots, tmp: new THREE.Color() };
  },

  update(ctx, state) {
    const { curve, construction, dots, tmp } = state;
    const { kappa, s } = ctx.motion;
    const { width, height } = ctx.size;
    for (const l of [curve, construction]) l.setResolution(width, height);
    dots.setCamera(ctx.camera, height);
    curve.setWidth(ctx.params.width);
    construction.setWidth(Math.max(1, ctx.params.width * 0.5));

    // de Casteljau: level k has DEGREE+1-k points.
    let level = Array.from({ length: DEGREE + 1 }, (_, i) => new THREE.Vector3(...controlPoint(i, kappa)));

    construction.reset();
    dots.reset();
    for (let k = 0; k <= DEGREE; k++) {
      const color = k === 0 ? POLYGON : k < DEGREE ? LEVELS[k - 1] : POINT;
      for (let i = 0; i < level.length; i++) {
        if (i + 1 < level.length) construction.push(level[i], level[i + 1], color);
        dots.push(level[i], k === 0 ? color.clone().multiplyScalar(1.7) : color, k === DEGREE ? 0.09 : k === 0 ? 0.07 : 0.05);
      }
      if (k < DEGREE) level = level.slice(0, -1).map((p, i) => p.clone().lerp(level[i + 1], s));
    }
    construction.commit();
    dots.commit();

    // The curve; the stretch already swept (u ≤ s) is bright, the rest dim.
    curve.reset();
    let prev = new THREE.Vector3(...evalBezier(0, kappa));
    for (let j = 1; j <= CURVE_SAMPLES; j++) {
      const u = j / CURVE_SAMPLES;
      const next = new THREE.Vector3(...evalBezier(u, kappa));
      tmp.copy(CURVE_A).lerp(CURVE_B, u).multiplyScalar(u <= s ? 1 : 0.4);
      curve.push(prev, next, tmp.clone());
      prev = next;
    }
    curve.commit();
  },

  dispose(ctx, state) {
    state.curve.dispose();
    state.construction.dispose();
    state.dots.dispose();
  },
};
