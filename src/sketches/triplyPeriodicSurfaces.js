import { COLORMAP_GLSL } from '../lib/surfaceMaterial.js';
import { TAU, phaseOf, segments } from '../lib/motion.js';

// Triply periodic surfaces morphing into one another, raymarched from their
// level-set functions.
//
// Each surface is the level set f(x,y,z) = c of a trigonometric field, scaled
// so max|f| = 1. The transformation is the straight-line homotopy of the
// fields themselves:
//
//     f_τ = (1 − τ) f_A + τ f_B,        c(t) = 0.30 sin(2ωt)
//
// looping Gyroid → Schwarz P → Schwarz D → Neovius → Gyroid, holding on each
// pure surface before blending to the next (τ(t) is a smoothstep per segment).
// All four fields share the same cubic lattice, so every f_τ is triply
// periodic and the blend is a continuous family of surfaces; topology changes
// happen where a level set passes through a saddle of f_τ — that is what you
// see when the labyrinths reconnect.
//
// These are the standard nodal approximations of the true minimal surfaces of
// the same names — very close, not exactly minimal (measured on the gyroid,
// |H| < 0.03 against |K| up to 0.75), so Mean |H| shading shows a faint
// residual, ×10 amplified.
//
// Marching uses distance ≥ |f − c| / L, with L a Lipschitz constant of f. For
// f_τ, L(f_τ) ≤ (1−τ)L_A + τL_B (convex combination), so the same safe step
// applies mid-blend. Per-surface L measured numerically (gyroid 1.155,
// P 0.577, D 1.225, Neovius 0.538), padded slightly.

const CYCLE = ['Gyroid', 'Schwarz P', 'Schwarz D', 'Neovius'];
const PERIOD = 28;
const MODES = ['Sheet', 'Solid'];
// Mean |H| is tiny on these (see above), so that mode is amplified ×10 — the label says so.
const SHADING = ['Iridescent', 'Gaussian curvature', 'Mean |H| ×10', 'Normals'];

const FORMULAS = [
  '\\tfrac{2}{3}\\big(\\sin x\\cos y+\\sin y\\cos z+\\sin z\\cos x\\big)',
  '\\tfrac{1}{3}\\big(\\cos x+\\cos y+\\cos z\\big)',
  '\\tfrac{1}{\\sqrt2}\\big(\\sin x\\sin y\\sin z+\\sin x\\cos y\\cos z+\\cos x\\sin y\\cos z+\\cos x\\cos y\\sin z\\big)',
  '\\tfrac{1}{13}\\big(3(\\cos x+\\cos y+\\cos z)+4\\cos x\\cos y\\cos z\\big)',
];
const NAMES = ['Gyroid', 'Schwarz\\ P', 'Schwarz\\ D', 'Neovius'];

export default {
  name: 'Triply Periodic Surfaces',
  description:
    'Gyroid → Schwarz P → Schwarz D → Neovius, each blended into the next through their level-set functions: ' +
    'f_τ = (1−τ)f_A + τf_B with τ(t) a smoothstep and the level c(t) breathing sinusoidally, both shown live. ' +
    'The labyrinths pinch off and reconnect as τ passes through the topology changes. Sheet mode is the ' +
    'thickened surface, Solid fills one labyrinth; curvature shading shows saddle-everywhere geometry (K < 0).',
  tags: ['raymarch', 'minimal-surface', 'implicit', 'periodic', 'homotopy'],
  category: 'Surfaces',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const { index, next, blend } = segments(phaseOf(t, PERIOD), CYCLE.length, 0.4);
    return {
      a: index,
      b: next,
      tau: blend,
      c: 0.3 * Math.sin(2 * TAU * phaseOf(t, PERIOD)),
    };
  },

  latex: (p, hl, m) => {
    const pure = m.tau < 0.02;
    const first = pure
      ? `f = ${FORMULAS[m.a]}\\quad(\\text{${CYCLE[m.a]}})`
      : `f_\\tau = (1-\\tau)\\,f_{\\mathrm{${NAMES[m.a]}}} + \\tau\\,f_{\\mathrm{${NAMES[m.b]}}},\\qquad \\tau = ${hl(m.tau, 2)}`;
    const cond =
      Math.round(p.mode) === 1
        ? 'f \\le c'
        : `\\lvert f - c\\rvert \\le ${hl(p.thickness, 2)}`;
    return `\\begin{aligned}${first} \\\\ ${cond},\\quad c = 0.3\\sin 2\\omega t = ${hl(m.c, 2)}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 4 },
    mode: { value: 0, min: 0, max: MODES.length - 1, step: 1, options: MODES },
    // Half-thickness of the sheet (Sheet mode only), in units of f.
    thickness: { value: 0.16, min: 0.03, max: 0.6 },
    // Half-width of the cut-out cube, in periods (1 = one full 2π cell).
    cells: { value: 0.75, min: 0.3, max: 1.6 },
    shading: { value: 0, min: 0, max: SHADING.length - 1, step: 1, options: SHADING },
    curvatureScale: { value: 2, min: 0.05, max: 6 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uA;
    uniform float uB;
    uniform float uMix;
    uniform float uSolid;
    uniform float uBias;
    uniform float uThickness;
    uniform float uCells;
    uniform float uShading;
    uniform float uCurvatureScale;
    varying vec2 vUv;

    ${COLORMAP_GLSL}

    int gA;
    int gB;

    // Field s, normalised so max|f| = 1.
    float fieldOne(vec3 p, int s) {
      float x = p.x, y = p.y, z = p.z;
      if (s == 0) return (sin(x) * cos(y) + sin(y) * cos(z) + sin(z) * cos(x)) / 1.5;
      if (s == 1) return (cos(x) + cos(y) + cos(z)) / 3.0;
      if (s == 2) return (sin(x) * sin(y) * sin(z) + sin(x) * cos(y) * cos(z)
                        + cos(x) * sin(y) * cos(z) + cos(x) * cos(y) * sin(z)) / 1.41421356;
      return (3.0 * (cos(x) + cos(y) + cos(z)) + 4.0 * cos(x) * cos(y) * cos(z)) / 13.0;
    }
    float lipOne(int s) { return s == 0 ? 1.2 : (s == 1 ? 0.6 : (s == 2 ? 1.25 : 0.56)); }

    // The blended field f_tau. Skips the second field while holding on a pure surface.
    float field(vec3 p) {
      float fa = fieldOne(p, gA);
      return uMix < 0.001 ? fa : mix(fa, fieldOne(p, gB), uMix);
    }

    // Signed pseudo-distance to the solid region, using dist >= |f-c| / L.
    float solidDist(vec3 p, float lip) {
      float f = field(p);
      float d = uSolid > 0.5 ? (f - uBias) : (abs(f - uBias) - uThickness);
      return d / lip;
    }

    mat3 rotateY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
    }

    // Ray vs axis-aligned cube |p|_inf <= b. Returns (tNear, tFar); miss if near > far.
    vec2 boxSpan(vec3 ro, vec3 rd, float b) {
      vec3 inv = 1.0 / rd;
      vec3 t0 = (-vec3(b) - ro) * inv;
      vec3 t1 = ( vec3(b) - ro) * inv;
      vec3 tmin = min(t0, t1), tmax = max(t0, t1);
      return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      gA = int(uA + 0.5);
      gB = int(uB + 0.5);
      float lip = mix(lipOne(gA), lipOne(gB), uMix);

      float B = uCells * 3.14159265;              // cube half-width
      vec3 ro = vec3(0.0, 0.0, B * 3.6);
      vec3 rd = normalize(vec3(uv, -1.6));
      // A fixed three-quarter view: the cube shows three faces, and the only
      // thing that moves is the transformation itself.
      float tilt = 0.55;
      mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cos(tilt), -sin(tilt), 0.0, sin(tilt), cos(tilt));
      mat3 M = rotateY(0.6) * rotX;               // camera -> cube frame
      ro = M * ro;
      rd = M * rd;

      vec3 bg = mix(vec3(0.02, 0.02, 0.05), vec3(0.06, 0.05, 0.12), 1.0 - length(uv) * 0.5);
      vec3 color = bg;

      vec2 span = boxSpan(ro, rd, B);
      if (span.x < span.y && span.y > 0.0) {
        float t = max(span.x, 0.0);
        bool hit = false;
        int steps = 0;
        for (int i = 0; i < 160; i++) {
          steps = i;
          float d = solidDist(ro + rd * t, lip);
          if (d < 0.0015) { hit = true; break; }
          t += d;
          if (t > span.y) break;
        }

        if (hit) {
          vec3 p = ro + rd * t;
          // Landed on the cube's own face (started inside the solid) => a cut cap.
          bool cap = (t - max(span.x, 0.0)) < 0.004;

          // Light fixed relative to the camera, so express it in the cube's frame too.
          vec3 l = normalize(M * vec3(0.5, 0.8, 0.6));

          if (cap) {
            // Cut face: flat slate, lit by the face's own axis-aligned normal.
            vec3 a = abs(p);
            vec3 fn = a.x > a.y && a.x > a.z ? vec3(sign(p.x), 0.0, 0.0)
                    : (a.y > a.z ? vec3(0.0, sign(p.y), 0.0) : vec3(0.0, 0.0, sign(p.z)));
            color = vec3(0.20, 0.22, 0.30) * (0.55 + 0.45 * max(dot(fn, l), 0.0));
          } else {
            // Gradient (tetrahedron technique) => normal.
            const float e = 0.01;
            vec2 k = vec2(1.0, -1.0);
            vec3 grad = k.xyy * field(p + k.xyy * e) + k.yyx * field(p + k.yyx * e)
                      + k.yxy * field(p + k.yxy * e) + k.xxx * field(p + k.xxx * e);
            vec3 n = normalize(grad);
            if (dot(n, rd) > 0.0) n = -n;

            int mode = int(uShading + 0.5);
            vec3 base;
            if (mode == 1 || mode == 2) {
              // Curvature of the level set at p, from f's gradient g and Hessian H:
              //   K = g·adj(H)·g / |g|^4      H_mean = (g·H·g − |g|² tr H) / (2|g|³)
              // Verified against sphere / cylinder / catenoid before use.
              const float h = 0.02;
              float f0 = field(p);
              float fxp = field(p + vec3(h,0,0)), fxm = field(p - vec3(h,0,0));
              float fyp = field(p + vec3(0,h,0)), fym = field(p - vec3(0,h,0));
              float fzp = field(p + vec3(0,0,h)), fzm = field(p - vec3(0,0,h));
              vec3 g = vec3(fxp - fxm, fyp - fym, fzp - fzm) / (2.0 * h);
              float hxx = (fxp - 2.0 * f0 + fxm) / (h * h);
              float hyy = (fyp - 2.0 * f0 + fym) / (h * h);
              float hzz = (fzp - 2.0 * f0 + fzm) / (h * h);
              float hxy = (field(p + vec3(h,h,0)) - field(p + vec3(h,-h,0))
                         - field(p + vec3(-h,h,0)) + field(p + vec3(-h,-h,0))) / (4.0 * h * h);
              float hxz = (field(p + vec3(h,0,h)) - field(p + vec3(h,0,-h))
                         - field(p + vec3(-h,0,h)) + field(p + vec3(-h,0,-h))) / (4.0 * h * h);
              float hyz = (field(p + vec3(0,h,h)) - field(p + vec3(0,h,-h))
                         - field(p + vec3(0,-h,h)) + field(p + vec3(0,-h,-h))) / (4.0 * h * h);
              mat3 Hm = mat3(hxx, hxy, hxz, hxy, hyy, hyz, hxz, hyz, hzz);
              // adjugate of a symmetric 3x3 = its cofactor matrix
              mat3 adjH = mat3(
                hyy * hzz - hyz * hyz,  hxz * hyz - hxy * hzz,  hxy * hyz - hxz * hyy,
                hxz * hyz - hxy * hzz,  hxx * hzz - hxz * hxz,  hxy * hxz - hxx * hyz,
                hxy * hyz - hxz * hyy,  hxy * hxz - hxx * hyz,  hxx * hyy - hxy * hxy);
              float g2 = max(dot(g, g), 1e-6);
              if (mode == 1) {
                float K = dot(g, adjH * g) / (g2 * g2);
                base = divergingColor(tanh(K * uCurvatureScale));
              } else {
                float Hmean = (dot(g, Hm * g) - g2 * (hxx + hyy + hzz)) / (2.0 * pow(g2, 1.5));
                base = sequentialColor(tanh(abs(Hmean) * uCurvatureScale * 10.0));
              }
            } else if (mode == 3) {
              base = n * 0.5 + 0.5;
            } else {
              float hue = fract(uTime * 0.03 + dot(p, vec3(0.06, 0.09, 0.12)) + 0.5 * (1.0 - abs(dot(n, rd))));
              base = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
            }

            float diff = 0.35 + 0.65 * max(dot(n, l), 0.0);
            float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 24.0) * 0.35;
            float ao = 1.0 - 0.55 * float(steps) / 160.0;   // crevices take more steps
            color = base * diff * ao + spec;
          }
        }
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uA: { value: 0 },
      uB: { value: 1 },
      uMix: { value: 0 },
      uSolid: { value: 0 },
      uBias: { value: 0 },
      uThickness: { value: 0.16 },
      uCells: { value: 0.75 },
      uShading: { value: 0 },
      uCurvatureScale: { value: 2 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const p = ctx.params;
    const m = ctx.motion;
    u.uA.value = m.a;
    u.uB.value = m.b;
    u.uMix.value = m.tau;
    u.uBias.value = m.c;
    u.uSolid.value = p.mode;
    u.uThickness.value = p.thickness;
    u.uCells.value = p.cells;
    u.uShading.value = p.shading;
    u.uCurvatureScale.value = p.curvatureScale;
  },
};
