import { phaseOf } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Soap Film Colours. A soap film 3 cm across, held upright, draining. Light reflects off its front and back
// surfaces; the two reflections interfere. Going through the film and back adds a path 2nh (n = 1.33, h the film's
// thickness), and the front reflection is flipped (a half-wave shift), so the reflected light at wavelength λ is
//     I(λ) = 4R sin²(2πnh/λ),   R = ((n − 1)/(n + 1))² = 0.020
// The colour of each pixel is that spectrum, 31 wavelengths from 400 to 700 nm, turned into a colour with the
// CIE 1931 colour-matching functions (the multi-lobe Gaussian fits of Wyman, Sloan and Shirley, 2013).
// Real reflectance tops out at 8%; the picture is scaled so that a thick film looks a light grey.
// Drainage: liquid flows down between the surfaces like syrup between two plates (surfaces that don't move, the
// slowest case). Mass balance then gives a self-similar solution, worked out here, not quoted:
//     flux q = ρ g h³ / 12η,   ∂h/∂t + ∂q/∂z = 0   →   h(z, t) = 2 √(η z / (ρ g t))
// with z the depth below the top, η = 1.0 mPa·s (water), ρg = 9800 N/m³. So the top thins first and the colour
// bands creep downward; where the film is thinner than about 30 nm it reflects a fifth or less of its brightest, in
// every colour, and looks black: black film.
// Real soap films drain faster than this (their surfaces stretch and flow, and thin patches rise from the edges:
// "marginal regeneration"); the slow swirls added to the thickness (±6%) stand in for that, and are not computed.
// see docs/wiki/sketches/soapFilmColours.md

const LOOP = 40;
const ETA = 1.0e-3, RHOG = 9800, SIZE = 0.03;
const thickness = (z, tSec) => 2 * Math.sqrt((ETA * z) / (RHOG * tSec));   // metres
const minutesAt = (t) => 10 ** (0 + 2.25 * phaseOf(t, LOOP));              // 1 → 178 minutes, evenly in log time

export default {
  name: 'Soap Film Colours',
  description:
    'A soap film draining under gravity, coloured by real thin-film interference: light bouncing off its front and ' +
    'back surfaces, every wavelength added up and turned into a colour. The top thins first, bands of colour creep ' +
    'down, and where it gets thinner than about 30 nanometres, a twentieth of a wavelength of light, it looks black.',
  tags: ['optics', 'thin film', 'interference', 'soap bubble', 'colour science', 'drainage'],
  category: 'Optics',
  mode: 'shader',

  motion(t) {
    const minutes = minutesAt(t);
    const s = minutes * 60;
    return { minutes, top: thickness(0.001, s) * 1e9, mid: thickness(0.015, s) * 1e9, bottom: thickness(0.029, s) * 1e9 };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'I(\\lambda) &= 4R\\,\\sin^2\\!\\left(\\frac{2\\pi n h}{\\lambda}\\right),\\quad n = 1.33 \\\\' +
    'h(z,t) &= 2\\sqrt{\\frac{\\eta z}{\\rho g t}} \\\\' +
    `t &= ${hl(m.minutes, 0)}\\ \\text{min}:\\ h = ${hl(m.top, 0)},\\ ${hl(m.mid, 0)},\\ ${hl(m.bottom, 0)}\\ \\text{nm} \\\\` +
    '&\\textcolor{#9aa3b2}{\\small\\text{(1 mm from the top, the middle, the bottom)}} \\\\' +
    `& ${caption(m.top < 40 ? 'Black film at the top: too thin to reflect. Very nearly popped.' : 'Thinning from the top: the film, measuring itself in wavelengths.')}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  uniforms() {
    return { uSeconds: { value: 60 }, uSwirl: { value: 0 } };
  },

  update(ctx, state) {
    state.uniforms.uSeconds.value = ctx.motion.minutes * 60;
    state.uniforms.uSwirl.value = ctx.motionTime;
  },

  fragmentShader: /* glsl */ `
    uniform vec2 uResolution;
    uniform float uSeconds, uSwirl;
    varying vec2 vUv;

    // CIE 1931 colour matching, Wyman et al. (2013) piecewise Gaussian fits
    float g1(float x, float mu, float s1, float s2) { float t = (x - mu) / (x < mu ? s1 : s2); return exp(-0.5 * t * t); }
    vec3 cmf(float l) {
      return vec3(
        1.056 * g1(l, 599.8, 37.9, 31.0) + 0.362 * g1(l, 442.0, 16.0, 26.7) - 0.065 * g1(l, 501.1, 20.4, 26.2),
        0.821 * g1(l, 568.8, 46.9, 40.5) + 0.286 * g1(l, 530.9, 16.3, 31.1),
        1.217 * g1(l, 437.0, 11.8, 36.0) + 0.681 * g1(l, 459.0, 26.0, 13.8));
    }
    vec3 xyzToRgb(vec3 c) {
      return vec3(3.2406 * c.x - 1.5372 * c.y - 0.4986 * c.z, -0.9689 * c.x + 1.8758 * c.y + 0.0415 * c.z, 0.0557 * c.x - 0.2040 * c.y + 1.0570 * c.z);
    }
    // The film's colour at thickness h (nm): sum over 31 wavelengths of sin²(2πnh/λ) × the colour matching.
    vec3 filmColour(float h) {
      vec3 xyz = vec3(0.0), white = vec3(0.0);
      for (int i = 0; i < 31; i++) {
        float l = 400.0 + 10.0 * float(i);
        float s = sin(6.2831853 * 1.33 * h / l);
        vec3 c = cmf(l);
        xyz += s * s * c;
        white += c;
      }
      vec3 rgb = max(xyzToRgb(xyz / white.y), 0.0);       // a thick film averages sin² = 1/2
      return pow(rgb * 1.1, vec3(1.0 / 2.2));             // brightened a little, then encoded for the screen
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    void main() {
      vec2 px = vUv * uResolution;
      bool wide = uResolution.x > 1.25 * uResolution.y;
      float R = wide ? 0.3 * uResolution.y : min(0.4 * uResolution.x, 0.22 * uResolution.y);
      vec2 c = wide ? vec2(0.26 * uResolution.x, 0.56 * uResolution.y) : vec2(0.5 * uResolution.x, 0.42 * uResolution.y);
      vec2 q = (px - c) / R;                              // −1 … 1 across the film
      vec3 col = vec3(0.012, 0.014, 0.022);
      float d = length(q);
      if (d < 1.0) {
        float z = (1.0 - q.y) * 0.5 * ${SIZE.toFixed(3)};  // metres below the top
        float h = 2.0 * sqrt(${ETA.toExponential(2)} * max(z, 1e-6) / (${RHOG.toFixed(1)} * uSeconds)) * 1e9;
        float sw = noise(q * 3.0 + vec2(0.0, -uSwirl * 0.05)) + 0.5 * noise(q * 7.0 + vec2(uSwirl * 0.03, 0.0));
        h *= 1.0 + 0.06 * (sw - 0.75) / 0.75;
        col = filmColour(h);
        col *= smoothstep(1.0, 0.985, d);
      }
      // the wire loop
      col = mix(col, vec3(0.55, 0.58, 0.66), smoothstep(0.012, 0.0, abs(d - 1.006)));
      // the colour scale: thickness 0 → 1500 nm under the film, the tick marks every 250 nm
      vec2 sp = (px - vec2(c.x - R, c.y - R * 1.32)) / vec2(2.0 * R, R * 0.09);
      if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0) col = filmColour(sp.x * 1500.0);
      if (sp.x > 0.0 && sp.x < 1.0 && sp.y < 0.0 && sp.y > -0.35 && fract(sp.x * 6.0 + 0.5) > 0.5 - 0.01 && fract(sp.x * 6.0 + 0.5) < 0.5 + 0.01) col = vec3(0.6);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
