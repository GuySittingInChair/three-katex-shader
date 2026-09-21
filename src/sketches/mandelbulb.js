import { TAU } from '../lib/motion.js';

// The Mandelbulb with its exponent driven by an integral of its rate:
//
//     z_{n+1} = z_n^{p(t)} + c,      p(t) = p(0) + ∫₀ᵗ ṗ(s) ds
//     ṗ(t) = A ω cos(ωt + φ₀)   ⇒   p(t) = 6 + A sin(ωt + φ₀),   A = 3.2
//
// p(0) = 8 (the classic bulb); the exponent then swings between 2.8 and 9.2 and
// the whole shape follows it — lobes appear and dissolve as p changes. (Closed
// form in code so the loop never drifts; the integral is what the overlay shows.)
//
// Colour is an orbit trap: each hit is coloured by how close its escape orbit
// came to the origin, mapped through a low-key palette, and the result is
// tone-mapped so bright surfaces roll off instead of clipping.

const PERIOD = 30;
const AMPLITUDE = 3.2;
const PHASE0 = Math.asin((8 - 6) / AMPLITUDE); // so that p(0) = 8
const PALETTES = ['Ember', 'Deep sea', 'Verdigris', 'Ultraviolet'];

export default {
  name: 'Mandelbulb',
  description:
    'Raymarched Mandelbulb whose exponent is driven as an integral of its rate, p(t) = p(0) + ∫ṗ ds, sweeping ' +
    '2.8 → 9.2 → 2.8 so the lobes grow and dissolve; the running values are shown live. Coloured by orbit trap ' +
    'through a low-key palette and tone-mapped, so it stays dark and detailed instead of blowing out.',
  tags: ['fractal', 'raymarch', 'homotopy'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const w = TAU / PERIOD;
    return {
      power: 6 + AMPLITUDE * Math.sin(w * t + PHASE0),
      dpdt: AMPLITUDE * w * Math.cos(w * t + PHASE0),
    };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    'z_{n+1} &= z_n^{\\,p(t)} + c,\\quad z,c\\in\\mathbb R^3\\ \\text{(spherical power)} \\\\' +
    `p(t) &= 8 + \\int_0^t \\dot p(s)\\,ds,\\quad \\dot p = ${AMPLITUDE}\\,\\omega\\cos(\\omega t+\\varphi_0) = ${hl(m.dpdt, 2)} \\\\` +
    `&\\Rightarrow\\ p = 6 + ${AMPLITUDE}\\sin(\\omega t+\\varphi_0) = ${hl(m.power, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 4 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uPower;
    uniform float uPalette;
    varying vec2 vUv;

    float gTrap;   // orbit trap from the last DE call: min |z|^2 along the orbit

    float mandelbulbDE(vec3 pos) {
      vec3 z = pos;
      float dr = 1.0;
      float r = 0.0;
      float trap = 1e9;
      for (int i = 0; i < 8; i++) {
        r = length(z);
        if (r > 2.0) break;
        float theta = acos(clamp(z.z / r, -1.0, 1.0));
        float phi = atan(z.y, z.x);
        dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;
        float zr = pow(r, uPower);
        theta *= uPower;
        phi *= uPower;
        z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
        z += pos;
        trap = min(trap, dot(z, z));
      }
      gTrap = trap;
      return 0.5 * log(r) * r / dr;
    }

    // Low-key three-stop ramps: shadow -> body -> highlight.
    vec3 ramp(vec3 a, vec3 b, vec3 c, float t) {
      return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
    }
    vec3 palette(float t) {
      int id = int(uPalette + 0.5);
      if (id == 1) return ramp(vec3(0.02, 0.05, 0.09), vec3(0.05, 0.36, 0.44), vec3(0.62, 0.84, 0.80), t);
      if (id == 2) return ramp(vec3(0.04, 0.06, 0.05), vec3(0.10, 0.40, 0.34), vec3(0.85, 0.55, 0.32), t);
      if (id == 3) return ramp(vec3(0.04, 0.02, 0.10), vec3(0.33, 0.12, 0.58), vec3(0.90, 0.46, 0.74), t);
      return ramp(vec3(0.06, 0.04, 0.05), vec3(0.50, 0.13, 0.06), vec3(0.93, 0.55, 0.16), t);
    }

    mat3 rotateY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
    }
    mat3 rotateX(float a) {
      float c = cos(a), s = sin(a);
      return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      // Fixed three-quarter view: the exponent is what moves.
      mat3 view = rotateY(0.7) * rotateX(-0.35);
      vec3 ro = view * vec3(0.0, 0.0, 2.7);
      vec3 rd = view * normalize(vec3(uv, -1.6));

      vec3 bg = mix(vec3(0.012, 0.014, 0.024), vec3(0.03, 0.03, 0.05), 1.0 - length(uv) * 0.5);
      vec3 color = bg;

      float t = 0.0;
      float glow = 0.0;
      bool hit = false;
      int steps = 0;
      for (int i = 0; i < 64; i++) {
        steps = i;
        vec3 p = ro + rd * t;
        float d = mandelbulbDE(p);
        glow += 0.003 / (0.03 + d * d * 10.0);
        if (d < 0.001) { hit = true; break; }
        t += d * 0.6;
        if (t > 6.0) break;
      }

      if (hit) {
        vec3 p = ro + rd * t;
        mandelbulbDE(p);                                   // refresh gTrap at the hit point
        float trap = gTrap;

        const vec2 e = vec2(0.0015, 0.0);
        vec3 n = normalize(vec3(
          mandelbulbDE(p + e.xyy) - mandelbulbDE(p - e.xyy),
          mandelbulbDE(p + e.yxy) - mandelbulbDE(p - e.yxy),
          mandelbulbDE(p + e.yyx) - mandelbulbDE(p - e.yyx)));

        vec3 base = palette(clamp(sqrt(trap) * 0.95, 0.0, 1.0));
        vec3 l = normalize(view * vec3(0.5, 0.75, 0.6));
        float diff = 0.18 + 0.82 * max(dot(n, l), 0.0);
        float ao = clamp(1.0 - 1.3 * float(steps) / 64.0, 0.0, 1.0);   // crevices take more steps
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.18;

        color = base * diff * ao + palette(0.9) * rim;
        color = mix(color, bg, 1.0 - exp(-0.02 * t * t));  // depth fade
      }

      color += glow * palette(0.75) * 0.22;                // faint halo, tinted
      color = 1.0 - exp(-color * 1.25);                    // tone map: roll off, never clip
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uPower: { value: 8.0 }, uPalette: { value: 0 } };
  },

  update(ctx, state) {
    state.uniforms.uPower.value = ctx.motion.power;
    state.uniforms.uPalette.value = ctx.params.palette;
  },
};
