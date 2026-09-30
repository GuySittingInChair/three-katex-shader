import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';

// Gravitational lensing by a point mass, per pixel. Angles are measured in
// units of the Einstein radius θ_E. Light we see arriving from direction x
// actually left the source plane at
//
//     y = x − x / |x|²          (the lens equation)
//
// so each pixel just asks what the background galaxy looks like at y. A
// source at distance β from the line of sight makes two images, at
//
//     x± = (β ± √(β² + 4)) / 2
//
// one outside the ring, one inside and flipped. Lensing keeps surface
// brightness, so the images are stretched rather than brightened, and their
// total magnification is μ = (β² + 2) / (β √(β² + 4)) (both checked against a
// numerical solve). When the galaxy sits right behind the lens (β → 0) the
// two arcs close into an Einstein ring.
//
// Loop (24 s): the galaxy drifts behind the lens (a fuzzy orange elliptical
// in front) and back out, passing β = 0.06 at closest.

const PERIOD = 24;
const REACH = 1.9;
const MISS = 0.06;

export default {
  name: 'Einstein Ring',
  description:
    'A distant spiral galaxy drifts behind a massive foreground galaxy, whose gravity bends its light into two ' +
    'stretched images that close into a ring when they line up. Traced per pixel from the lens equation. The ' +
    'offset β, the image positions and the magnification μ are shown live.',
  tags: ['general relativity', 'lensing', 'einstein ring', 'astronomy'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const c = Math.cos(TAU * p);
    const sx = REACH * (0.3 * c + 0.7 * c ** 3); // lingers near the lens
    const sy = MISS + 0.25 * c * c;
    const beta = Math.hypot(sx, sy);
    const root = Math.sqrt(beta * beta + 4);
    return {
      sx,
      sy,
      beta,
      outer: (beta + root) / 2,
      inner: (beta - root) / 2,
      mu: (beta * beta + 2) / (beta * root),
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\vec y &= \\vec x - \\theta_E^2\\,\\frac{\\vec x}{|\\vec x|^2} \\\\' +
    `\\beta &= ${hl(m.beta, 2)}\\,\\theta_E,\\quad x_\\pm = \\tfrac12\\big(\\beta \\pm \\sqrt{\\beta^2+4}\\big) = ${hl(m.outer, 2)},\\ ${hl(m.inner, 2)} \\\\` +
    `\\mu &= \\frac{\\beta^2+2}{\\beta\\sqrt{\\beta^2+4}} = ${hl(m.mu, 1)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    galaxySize: { value: 0.42, min: 0.1, max: 0.7 },
    guide: { value: 1, min: 0, max: 1, step: 1 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uSrc;
    uniform float uSize;
    uniform float uGuide;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }

    // A face-on-ish spiral: warm core, bluish arms.
    vec3 galaxy(vec2 q) {
      float c = cos(0.7), s = sin(0.7);
      q = mat2(c, -s, s, c) * q;
      q.y /= 0.6;
      float r = length(q);
      float a = atan(q.y, q.x);
      float arms = 0.5 + 0.5 * cos(2.0 * a - 5.0 * log(r + 0.02) + 0.3 * uTime);
      float core = exp(-r * 9.0);
      float disk = exp(-r * 2.6) * (0.25 + 0.75 * arms * arms);
      return vec3(1.0, 0.86, 0.66) * core * 1.4 + vec3(0.45, 0.62, 1.0) * disk * 0.9;
    }

    float stars(vec2 y) {
      vec2 q = y * 9.0;
      vec2 cell = floor(q);
      float h = hash(cell);
      return step(0.94, h) * smoothstep(0.3, 0.0, length(fract(q) - 0.5)) * (0.3 + 0.7 * hash(cell + 5.0));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.75 * uResolution.y / uResolution.x);   // keep the ring on narrow screens
      vec2 x = uv * 5.0 * fit;
      float r2 = max(dot(x, x), 1e-5);
      vec2 y = x - x / r2;                                             // θ_E = 1

      vec3 col = vec3(0.012, 0.014, 0.024);
      col += vec3(0.7, 0.75, 0.85) * stars(y) * 0.5;
      col += galaxy((y - uSrc) / uSize);

      // The lens: a foreground elliptical galaxy, drawn unlensed on top.
      float rl = length(x * vec2(1.0, 1.25));
      col += vec3(1.0, 0.62, 0.3) * (exp(-rl * 3.2) * 0.55 + exp(-rl * 14.0) * 0.5);

      // Dashed guide at the Einstein radius.
      float ring = smoothstep(0.018 * fit, 0.0, abs(sqrt(r2) - 1.0));
      float dash = step(0.5, fract(atan(x.y, x.x) * 12.0 / 6.2831853));
      col += vec3(0.5, 0.55, 0.65) * ring * dash * 0.22 * uGuide;

      col = col / (1.0 + 0.6 * max(max(col.r, col.g), col.b));   // tone-map
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uSrc: { value: new THREE.Vector2(REACH, MISS + 0.25) }, uSize: { value: 0.42 }, uGuide: { value: 1 } };
  },

  update(ctx, state) {
    const u = state.uniforms;
    u.uSrc.value.set(ctx.motion.sx, ctx.motion.sy);
    u.uSize.value = ctx.params.galaxySize;
    u.uGuide.value = ctx.params.guide;
  },
};
