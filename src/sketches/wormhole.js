import { TAU, phaseOf } from '../lib/motion.js';

// A traversable (Ellis / Morris–Thorne) wormhole joining two universes, traced
// per pixel. Space around it is
//
//     ds² = −dt² + dℓ² + (b² + ℓ²) dΩ²
//
// with ℓ running from −∞ (universe B) through the throat (ℓ = 0, radius b = 1)
// to +∞ (universe A). Light moves in a plane through the wormhole's centre;
// with impact parameter h its path obeys
//
//     d²ℓ/dλ² = h²ℓ / (b² + ℓ²)²,   dφ/dλ = h / (b² + ℓ²)
//
// Rays with h < b pass through the throat into the other universe; h > b
// turn back (checked numerically: h = 0.95 goes through, 1.05 turns back).
// Each pixel steps its ray (RK4) until it's far out in one universe or the
// other and shows that universe's sky in the direction it's heading: A has
// cool stars and a blue grid, B warm stars and an orange grid, so the
// lensing shows as bent grid lines and a ring where the two meet.
//
// Loop (24 s): the camera flies in from ℓ = 9, through the throat to ℓ = −9
// in universe B, and backs out again, always facing the same way.

const PERIOD = 24;

export default {
  name: 'Wormhole',
  description:
    'A traversable wormhole joining two universes, traced per pixel with general relativity. Light passing ' +
    'closer than the throat goes through to the other universe’s sky; the rest is bent around it. The camera ' +
    'flies through and back. Its position ℓ is shown live.',
  tags: ['general relativity', 'wormhole', 'ray tracing', 'lensing'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    return { ell: 9 * Math.cos(TAU * p) };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'ds^2 &= -dt^2 + d\\ell^2 + (b^2 + \\ell^2)\\,d\\Omega^2 \\\\' +
    '\\frac{d^2\\ell}{d\\lambda^2} &= \\frac{h^2\\,\\ell}{(b^2+\\ell^2)^2},\\quad \\text{through the throat iff } h < b \\\\' +
    `\\ell_{\\text{camera}} &= ${hl(m.ell, 1)}\\ \\text{(${m.ell >= 0 ? 'universe A' : 'universe B'})}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    quality: { value: 220, min: 100, max: 400, step: 10 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uEll;
    uniform float uSteps;
    varying vec2 vUv;

    const float B = 1.0;     // throat radius
    const float FAR = 30.0;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.11, 0.23, 0.37));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float stars(vec3 d, float density) {
      vec3 q = d * 150.0;
      vec3 cell = floor(q);
      return step(1.0 - density, hash(cell)) * smoothstep(0.55, 0.0, length(fract(q) - 0.5)) * (0.4 + 0.6 * hash(cell + 3.0));
    }
    float grid(vec3 d) {
      float lat = asin(clamp(d.y, -1.0, 1.0));
      float lon = atan(d.x, d.z);
      float gl = abs(fract(lat / 0.2618 + 0.5) - 0.5);   // every 15°
      float gn = abs(fract(lon / 0.2618 + 0.5) - 0.5);
      return smoothstep(0.022, 0.0, min(gl, gn));
    }
    vec3 skyA(vec3 d) {
      float neb = pow(max(0.0, 0.5 + 0.5 * d.x * d.y + 0.3 * d.z), 3.0) * 0.12;
      return vec3(0.75, 0.85, 1.0) * stars(d, 0.02) + vec3(0.16, 0.3, 0.55) * grid(d) * 0.4 + vec3(0.1, 0.18, 0.4) * neb;
    }
    vec3 skyB(vec3 d) {
      float glow = 0.12 + 0.9 * pow(0.5 + 0.5 * d.z, 6.0);          // a warm nebula straight through the throat
      return vec3(1.0, 0.8, 0.55) * stars(d, 0.03) + vec3(0.55, 0.3, 0.12) * grid(d) * 0.4 + vec3(0.3, 0.13, 0.05) * glow;
    }

    float accel(float l, float h) {
      float r2 = B * B + l * l;
      return h * h * l / (r2 * r2);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      // Camera frame: forward is decreasing ℓ (towards the throat, while in A).
      vec3 d = normalize(vec3(uv * 1.1, 1.0));          // z = forward
      float along = d.z;                                 // component along −e_ℓ
      vec2 sideways = d.xy;
      float st = length(sideways);
      vec2 tdir = st > 1e-6 ? sideways / st : vec2(1.0, 0.0);

      float l = uEll;
      float r0 = sqrt(B * B + l * l);
      float h = r0 * st;                                 // impact parameter
      float dl = -along;                                 // dℓ/dλ
      float phi = 0.0;
      for (int i = 0; i < 400; i++) {
        if (float(i) >= uSteps || abs(l) > FAR) break;
        float step = 0.03 + 0.06 * abs(l);
        float k1l = dl;                 float k1v = accel(l, h);
        float k2l = dl + 0.5*step*k1v;  float k2v = accel(l + 0.5*step*k1l, h);
        float k3l = dl + 0.5*step*k2v;  float k3v = accel(l + 0.5*step*k2l, h);
        float k4l = dl + step*k3v;      float k4v = accel(l + step*k3l, h);
        phi += step * h / (B * B + l * l);
        l += step / 6.0 * (k1l + 2.0*k2l + 2.0*k3l + k4l);
        dl += step / 6.0 * (k1v + 2.0*k2v + 2.0*k3v + k4v);
      }
      // Where the ray ends up on the sky: angle φ around from the camera's own
      // position, in the ray's plane. Written in camera axes: in A "outward"
      // is behind the camera (it faces the throat), in B it is ahead.
      // Far out, space is flat again and an outgoing ray is still a little off
      // radial, by asin(h/r); add that so wide-angle rays land where they're going.
      if (dl > 0.0 == l > 0.0) phi += asin(min(h / sqrt(B * B + l * l), 1.0));
      vec3 dir = normalize(vec3(sin(phi) * tdir, cos(phi)));
      if (l > 0.0) dir.z = -dir.z;
      vec3 col = l > 0.0 ? skyA(dir) : skyB(dir);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uEll: { value: 9 }, uSteps: { value: 220 } };
  },

  update(ctx, state) {
    state.uniforms.uEll.value = ctx.motion.ell;
    state.uniforms.uSteps.value = ctx.params.quality;
  },
};
