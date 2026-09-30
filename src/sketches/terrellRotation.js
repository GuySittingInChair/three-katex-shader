import { TAU, phaseOf } from '../lib/motion.js';

// What a cube moving near light speed actually looks like, ray-traced per
// pixel. Special relativity says a moving object is contracted along its
// motion by 1/γ (the faint wireframe is that contracted box, where it "is"
// right now). But light from its far parts left earlier than light from its
// near parts, and for a camera that's what counts: the cube doesn't look
// squashed, it looks turned, showing the face that points away from you
// (Terrell and Penrose, 1959). The effect is exact for spheres: a moving
// sphere still has a circular outline (checked numerically to 0.02%).
//
// How it's traced: the light reaching the camera at the moment t = 0 from
// sky direction d, followed back in the cube's own rest frame, is the ray
// through the camera's event along (γ(dₓ + β), d_y, d_z). The cube sits still
// in that frame, at x' = γx₀, so each pixel is a plain ray–box test. Light
// from it is Doppler-shifted by
//
//     D = 1 / (γ (1 + β dₓ))
//
// bluer and brighter where it's coming toward you, redder and dimmer going
// away. Loop (16 s): the cube swings left and right, fastest in the middle.
// The wireframe runs ahead of the image by the distance it covered while
// the light was on its way.

const PERIOD = 16;
const SWING = 3;
const CY = -1.8; // the cube's height and distance, as in the shader
const CZ = 7;

export default {
  name: 'Terrell Rotation',
  description:
    'A cube flying past at up to 95% of light speed, ray-traced as you would actually see it. It isn’t squashed, ' +
    'it looks rotated, showing its back face, because light from its far side left earlier. The faint wireframe ' +
    'is the Lorentz-contracted box. Doppler colours it blue coming, red going. β and the apparent turn are live.',
  tags: ['relativity', 'terrell', 'lorentz contraction', 'doppler', 'ray tracing'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params = {}) {
    const top = params.topSpeed ?? 0.95;
    const p = phaseOf(t, PERIOD);
    const beta = top * Math.cos(TAU * p);
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    // Keep what you see on screen: the light arriving now left the cube when
    // it was at xa, a light-travel time |E| ago, so it has since moved β|E|.
    const xa = SWING * Math.sin(TAU * p);
    const x0 = xa + beta * Math.hypot(xa, CY, CZ);
    return { x0, beta, gamma, turn: (Math.asin(Math.abs(beta)) * 180) / Math.PI };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\vec d_{\\text{rest}} &= \\big(\\gamma(d_x + \\beta),\\ d_y,\\ d_z\\big),\\quad D = \\frac{1}{\\gamma\\,(1 + \\beta\\,d_x)} \\\\' +
    `\\beta &= ${hl(m.beta, 2)},\\quad \\gamma = ${hl(m.gamma, 2)},\\quad \\text{length } \\tfrac1\\gamma = ${hl(1 / m.gamma, 2)} \\\\` +
    `\\text{apparent turn} &\\approx \\arcsin|\\beta| = ${hl(m.turn, 0)}^\\circ` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    topSpeed: { value: 0.95, min: 0, max: 0.97 },
    wireframe: { value: 1, min: 0, max: 1, step: 1 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uX0;
    uniform float uBeta;
    uniform float uWire;
    varying vec2 vUv;

    const float A = 1.2;          // half the cube's side
    const vec3 C0 = vec3(0.0, -1.8, 7.0);

    // Slab test; returns (tNear, tFar) and the entry face's normal.
    vec2 box(vec3 o, vec3 d, vec3 c, vec3 h, out vec3 n) {
      vec3 inv = 1.0 / d;
      vec3 t0 = (c - h - o) * inv;
      vec3 t1 = (c + h - o) * inv;
      vec3 lo = min(t0, t1);
      vec3 hi = max(t0, t1);
      float tn = max(max(lo.x, lo.y), lo.z);
      float tf = min(min(hi.x, hi.y), hi.z);
      n = tn == lo.x ? vec3(-sign(d.x), 0.0, 0.0) : tn == lo.y ? vec3(0.0, -sign(d.y), 0.0) : vec3(0.0, 0.0, -sign(d.z));
      return vec2(tn, tf);
    }

    vec3 blackbody(float T) {
      T = clamp(T, 1000.0, 40000.0) / 100.0;
      float r = T <= 66.0 ? 1.0 : clamp(1.2929 * pow(T - 60.0, -0.1332), 0.0, 1.0);
      float g = T <= 66.0 ? clamp(0.3901 * log(T) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(T - 60.0, -0.0755), 0.0, 1.0);
      float b = T >= 66.0 ? 1.0 : (T <= 19.0 ? 0.0 : clamp(0.5432 * log(T - 10.0) - 1.1963, 0.0, 1.0));
      return vec3(r, g, b);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.8 * uResolution.y / uResolution.x);
      vec3 d = normalize(vec3(uv * 1.5 * fit + vec2(0.0, -0.22), 1.0));   // looking a little down
      float beta = uBeta;
      float gamma = inversesqrt(1.0 - beta * beta);

      vec3 col = mix(vec3(0.012, 0.014, 0.024), vec3(0.025, 0.03, 0.05), vUv.y);

      // The cube as seen: rest frame, aberrated ray.
      vec3 dr = vec3(gamma * (d.x + beta), d.y, d.z);
      vec3 c = vec3(gamma * uX0, C0.yz);
      vec3 n;
      vec2 t = box(vec3(0.0), dr, c, vec3(A), n);
      if (t.x < t.y && t.x > 0.0) {
        vec3 p = dr * t.x - c;                        // point on the cube, cube coordinates
        vec2 f = abs(n.x) > 0.5 ? p.yz : abs(n.y) > 0.5 ? p.xz : p.xy;
        vec2 cell = floor(f / A * 2.0);
        float check = mod(cell.x + cell.y, 2.0);
        vec3 tint = abs(n.x) > 0.5 ? vec3(0.95, 0.55, 0.7) : abs(n.y) > 0.5 ? vec3(1.0, 0.85, 0.55) : vec3(0.6, 0.78, 1.0);
        if (n.x > 0.5 || n.z > 0.5) tint = vec3(0.6, 1.0, 0.72);   // the faces pointing away from a cube at rest
        float light = 0.55 + 0.45 * max(dot(n, normalize(vec3(-0.3, 0.8, -0.5))), 0.0);
        float D = 1.0 / (gamma * (1.0 + beta * d.x));
        vec3 shift = blackbody(6500.0 * D) / blackbody(6500.0);
        float I = 1.6 * pow(D, 1.5) * light * (0.6 + 0.4 * check);   // softened from D³ so the receding cube stays visible
        I = I / (1.0 + 0.5 * I);
        col = tint * shift * I * 0.85;
      }

      // Where the cube "is" now: contracted by 1/γ along x, drawn as a faint wireframe.
      if (uWire > 0.5) {
        vec3 h = vec3(A / gamma, A, A);
        vec3 cl = vec3(uX0, C0.yz);
        vec3 m;
        vec2 s = box(vec3(0.0), d, cl, h, m);
        if (s.x < s.y && s.x > 0.0) {
          for (int k = 0; k < 2; k++) {
            vec3 q = abs(d * (k == 0 ? s.x : s.y) - cl) / h;
            vec3 e = 1.0 - q;
            float mid = e.x + e.y + e.z - min(min(e.x, e.y), e.z) - max(max(e.x, e.y), e.z);
            col += vec3(0.75, 0.8, 0.9) * smoothstep(0.035, 0.0, mid) * (k == 0 ? 0.35 : 0.15);
          }
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uX0: { value: 0 }, uBeta: { value: 0 }, uWire: { value: 1 } };
  },

  update(ctx, state) {
    const u = state.uniforms;
    u.uX0.value = ctx.motion.x0;
    u.uBeta.value = ctx.motion.beta;
    u.uWire.value = ctx.params.wireframe;
  },
};
