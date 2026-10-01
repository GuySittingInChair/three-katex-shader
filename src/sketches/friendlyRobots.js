import { phaseOf } from '../lib/motion.js';

// Two pairs of robot friends, holding hands, fall into a black hole (motors
// off, so they fall freely). Same exact physics as the rubber duck: falling
// from rest at r₀ = 12 Rs, r = r₀(1 + cos η)/2 in proper time
// τ = √(r₀³/(8M))(η + sin η), and the gap between neighbours obeys the
// geodesic deviation equation,
//
//     d²ξ∥/dτ² = +(2M/r³) ξ∥,   d²ξ⊥/dτ² = −(M/r³) ξ⊥
//
// whose exact solutions here are
//
//     ξ⊥/ξ₀ = r/r₀,   ξ∥/ξ₀ = (1 + cos η)/2 + ¾ sin η (η + sin η)/(1 + cos η)
//
// (checked against direct integration to 6 decimals). So which way they
// end up depends on how they were holding hands. The pair falling one
// behind the other is pulled apart, 7.8× by the horizon. The pair falling
// side by side is pushed together, to 1/12 of the gap: both fall toward the
// same point, the centre, so their paths converge. The side-by-side friends
// get a forced hug.
//
// Distances are drawn hugely enlarged (the robots too); the ratios are
// exact for any small separation. Loop (16 s): the fall, then they're gone.

const PERIOD = 16;
const FALL = 0.8;
const R0 = 12;
const ETA_H = 2 * Math.acos(Math.sqrt(1 / R0));
const SPREAD = 0.42; // the two pairs fall along directions 180° ± 24°

export default {
  name: 'Friendly Robots Fall In',
  description:
    'Two pairs of robot friends hold hands and fall into a black hole. Tidal forces, solved exactly, pull the ' +
    'pair falling one behind the other 7.8× apart by the horizon, and squeeze the pair falling side by side to ' +
    '1/12 of the gap: a forced hug. Both friendship distances are live.',
  tags: ['general relativity', 'black hole', 'tidal forces', 'geodesic deviation', 'robots'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const eta = ETA_H * Math.min(p / FALL, 1);
    const r = (R0 / 2) * (1 + Math.cos(eta));
    const apart = (1 + Math.cos(eta)) / 2 + (0.75 * Math.sin(eta) * (eta + Math.sin(eta))) / (1 + Math.cos(eta));
    return { r, apart, together: r / R0, gone: p >= FALL };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\ddot\\xi_\\parallel &= +\\frac{2M}{r^3}\\,\\xi_\\parallel,\\quad \\ddot\\xi_\\perp = -\\frac{M}{r^3}\\,\\xi_\\perp \\\\' +
    `r &= ${hl(m.r, 2)}\\,R_s \\\\` +
    `\\text{one behind the other: } &${hl(m.apart, 2)}\\ \\text{m apart (from 1 m)} \\\\` +
    `\\text{side by side: } &${hl(m.together, 3)}\\ \\text{m apart (from 1 m)}` +
    (m.gone ? ' \\\\ &\\textcolor{#ff6b6b}{\\text{gone (together, at least)}}' : '') +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uR;
    uniform float uApart;
    uniform float uTogether;
    uniform float uView;
    uniform float uFade;
    varying vec2 vUv;

    const float SPREAD = ${SPREAD.toFixed(3)};

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }
    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    float segment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
    }

    // A robot of size s at c, head pointing along 'up'. Returns colour with alpha.
    vec4 robot(vec2 x, vec2 c, vec2 up, float s, vec3 eye, float px) {
      vec2 side = vec2(up.y, -up.x);
      vec2 p = vec2(dot(x - c, side), dot(x - c, up)) / s;
      float a = px / s;
      vec4 col = vec4(0.0);
      float stalk = box(p - vec2(0.0, 0.62), vec2(0.03, 0.14), 0.02);
      float bulb = length(p - vec2(0.0, 0.8)) - 0.09;
      col = mix(col, vec4(0.6, 0.65, 0.72, 1.0), smoothstep(a, -a, stalk));
      col = mix(col, vec4(0.95, 0.3, 0.25, 1.0), smoothstep(a, -a, bulb));
      float head = box(p, vec2(0.5, 0.45), 0.13);
      vec3 metal = mix(vec3(0.5, 0.55, 0.63), vec3(0.85, 0.88, 0.93), smoothstep(-0.5, 0.5, p.y));
      col = mix(col, vec4(metal, 1.0), smoothstep(a, -a, head));
      float eyes = min(box(p - vec2(-0.2, 0.12), vec2(0.1, 0.09), 0.04), box(p - vec2(0.2, 0.12), vec2(0.1, 0.09), 0.04));
      col.rgb = mix(col.rgb, eye, smoothstep(a, -a, eyes));
      float smile = abs(length(p - vec2(0.0, -0.05)) - 0.22) - 0.04;
      col.rgb = mix(col.rgb, vec3(0.2, 0.23, 0.3), smoothstep(a, -a, smile) * step(p.y, -0.1));
      return col;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 1.15 * uResolution.y / uResolution.x);
      vec2 x = uv * 2.0 * uView * fit;
      float px = 2.0 * uView * fit / uResolution.y;
      float r = length(x);

      vec2 sq = uv * 60.0;
      vec3 col = vec3(0.01, 0.012, 0.02) + vec3(0.7, 0.75, 0.9) * step(0.97, hash(floor(sq))) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5)) * 0.4;

      float s = 0.1 * uView;             // robot size: constant on screen
      float gap = 2.6 * s;               // their starting gap, drawn
      vec4 rb;
      for (int k = 0; k < 2; k++) {
        float ang = 3.14159265 + (k == 0 ? SPREAD : -SPREAD);
        vec2 out_ = vec2(cos(ang), sin(ang));       // away from the hole
        vec2 across = vec2(-out_.y, out_.x);
        vec2 c = uR * out_;
        // Pair 0 falls one behind the other; pair 1 side by side.
        vec2 off = k == 0 ? out_ * gap * uApart * 0.5 : across * gap * uTogether * 0.5;
        vec2 a = c - off, b = c + off;
        // Holding hands: an arm between them, thinner as it stretches.
        float w = 0.05 * s / sqrt(k == 0 ? uApart : 1.0);
        col = mix(col, vec3(0.55, 0.6, 0.68), smoothstep(px, -px, segment(x, a, b) - w) * uFade);
        vec3 eye = k == 0 ? vec3(0.37, 0.95, 1.0) : vec3(1.0, 0.55, 0.75);
        rb = robot(x, a, out_, s, eye, px);
        col = mix(col, rb.rgb, rb.a * uFade);
        rb = robot(x, b, out_, s, eye, px);
        col = mix(col, rb.rgb, rb.a * uFade);
      }

      // The photon sphere (dashed) and the horizon.
      float dash = step(0.5, fract(atan(x.y, x.x) * 24.0 / 6.2831853));
      col += vec3(1.0, 0.6, 0.25) * smoothstep(1.5 * px, 0.0, abs(r - 1.5)) * dash * 0.45;
      col = mix(col, vec3(0.0), smoothstep(1.0 + px, 1.0 - px, r));
      col += vec3(0.35, 0.2, 0.1) * smoothstep(2.0 * px, 0.0, abs(r - 1.0)) * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uR: { value: R0 },
      uApart: { value: 1 },
      uTogether: { value: 1 },
      uView: { value: 13 },
      uFade: { value: 1 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    u.uR.value = m.r;
    u.uApart.value = m.apart;
    u.uTogether.value = m.together;
    u.uView.value = 2.4 + 0.9 * m.r;
    u.uFade.value = m.gone ? 0 : 1;
  },
};
