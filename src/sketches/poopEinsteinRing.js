import * as THREE from 'three';
import { TAU, phaseOf, smooth } from '../lib/motion.js';

// A poop drifts behind a robot of 10¹² solar masses, and general relativity
// does the rest, per pixel, with no shortcuts. Angles are in units of the
// robot's Einstein radius θ_E. Light we see arriving from x left the poop's
// plane at
//
//     y = x − x / |x|²                 (point-mass lens equation)
//
// so every pixel just asks what is at y: the poop, or the wallpaper of tiny
// poops covering the sky behind it (lensed too; the whole sky bends).
// Gravity doesn't care what the light came off (lensing is achromatic, the
// equivalence principle), so the poop gets the same treatment as a quasar.
//
// The images sit where Fermat's arrival-time surface
//
//     τ(x) = ½ |x − β|² − ln |x|
//
// is stationary (its faint contours are drawn): x± = (β ± √(β² + 4)) / 2
// along the poop's direction, the outer one a minimum (green ring), the inner
// one a saddle (pink ring), which is why it shows up flipped. Each image is
// magnified by μ± = ¼(β/√(β²+4) + √(β²+4)/β ± 2), and the inner one arrives
// later by
//
//     Δt = (4GM/c³) [½ β √(β²+4) + ln((√(β²+4) + β)/(√(β²+4) − β))]
//
// with 4GM/c³ = 228.03 days for 10¹² M☉ (ignoring the lens's (1 + z), as
// the robot has not disclosed its redshift). All of it checked numerically:
// stationary points to 10⁻¹⁶, μ± and Δτ against a direct calculation.
//
// Loop (24 s): the poop sweeps behind the robot, closest at β = 0.06, where
// it becomes a ring. It turns twice. The robot blinks.

const PERIOD = 24;
const REACH = 1.9;
const MISS = 0.06;
const DAYS = (4 * 1.32712440018e20 * 1e12) / 299792458 ** 3 / 86400; // 4GM/c³ for 10¹² M☉, in days

// The poop, drawn on a canvas (not from an emoji font, so it looks the same everywhere).
function poopTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const tier = (cx, cy, rx, ry) => {
    const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, '#c98a4b');
    grad.addColorStop(1, '#8e5a2a');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#4e2e12';
    g.lineWidth = 3;
    g.stroke();
  };
  tier(64, 100, 52, 20);
  tier(64, 76, 40, 17);
  tier(64, 54, 28, 14);
  g.fillStyle = '#b37440';
  g.beginPath();
  g.moveTo(52, 46);
  g.quadraticCurveTo(60, 20, 76, 22);
  g.quadraticCurveTo(70, 34, 76, 46);
  g.closePath();
  g.fill();
  g.stroke();
  for (const x of [50, 78]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, 72, 9, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(x + 2, 74, 5, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.strokeStyle = '#3a200c';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(64, 88, 15, 0.12 * Math.PI, 0.88 * Math.PI);
  g.closePath();
  g.fill();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: lensing makes neighbouring pixels sample far-apart texels,
  // and mip selection would smear seams into the tiled wallpaper.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default {
  name: 'Einstein Ring of Poop',
  description:
    'A poop passes behind a robot of a trillion solar masses, and general relativity bends it into an Einstein ' +
    'ring, per pixel, exactly. The wallpaper of tiny poops behind them bends too. Faint lines are Fermat’s ' +
    'arrival-time surface; the second poop image arrives months late, and the equations say exactly how late.',
  tags: ['general relativity', 'lensing', 'einstein ring', 'poop', 'fermat principle', 'time delay'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const c = Math.cos(TAU * p);
    const sx = REACH * (0.3 * c + 0.7 * c ** 3); // lingers near the robot
    const sy = MISS + 0.25 * c * c;
    const beta = Math.hypot(sx, sy);
    const root = Math.sqrt(beta * beta + 4);
    const outer = (beta + root) / 2;
    const inner = (beta - root) / 2; // negative: the other side of the robot
    const blinkAt = (q) => Math.max(0, 1 - Math.abs(p - q) * 90);
    return {
      sx,
      sy,
      beta,
      outer,
      inner,
      muOuter: 0.25 * (beta / root + root / beta + 2),
      muInner: 0.25 * (beta / root + root / beta - 2),
      delay: DAYS * (0.5 * beta * root + Math.log((root + beta) / (root - beta))),
      spin: 2 * TAU * p,
      blink: Math.max(blinkAt(0.13), blinkAt(0.19), blinkAt(0.61), blinkAt(0.88)),
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\vec y &= \\vec x - \\frac{\\vec x}{|\\vec x|^2},\\quad \\tau(\\vec x) = \\tfrac12|\\vec x - \\vec\\beta|^2 - \\ln|\\vec x| \\\\' +
    `\\beta &= ${hl(m.beta, 2)}\\,\\theta_E,\\quad M_{\\text{robot}} = 10^{12}\\,M_\\odot \\\\` +
    `\\mu &= ${hl(m.muOuter, 2)}\\ (\\textcolor{#7ee0a8}{\\text{min}}),\\ ${hl(m.muInner, 2)}\\ (\\textcolor{#ef6fa0}{\\text{saddle}}) \\\\` +
    '\\Delta t &= \\tfrac{4GM}{c^3}\\Big[\\tfrac12\\beta\\sqrt{\\beta^2+4} + \\ln\\tfrac{\\sqrt{\\beta^2+4}+\\beta}{\\sqrt{\\beta^2+4}-\\beta}\\Big] \\\\' +
    `&= ${hl(m.delay, 0)}\\ \\text{days until the second poop}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    poopSize: { value: 0.42, min: 0.15, max: 0.8 },
    wallpaper: { value: 1, min: 0, max: 1, step: 1 },
    fermat: { value: 1, min: 0, max: 1, step: 1 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uPoop;
    uniform vec2 uSrc;
    uniform float uSize;
    uniform float uSpin;
    uniform float uBlink;
    uniform vec2 uImgOuter;
    uniform vec2 uImgInner;
    uniform float uWall;
    uniform float uFermat;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }

    // The poop texture at local coordinates q ∈ [0, 1]² (transparent outside).
    vec4 poop(vec2 q) {
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
      return texture2D(uPoop, q);
    }

    // Signed distance to a rounded box.
    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }

    // The robot (in front of everything, so not lensed). p in units of θ_E.
    vec4 robot(vec2 p) {
      p /= 0.3;
      vec4 c = vec4(0.0);
      // Antenna and its bulb.
      float stalk = box(p - vec2(0.0, 0.92), vec2(0.035, 0.2), 0.02);
      float bulb = length(p - vec2(0.0, 1.15)) - 0.11;
      c = mix(c, vec4(0.6, 0.65, 0.72, 1.0), smoothstep(0.02, 0.0, stalk));
      c = mix(c, vec4(0.95, 0.3, 0.25, 1.0), smoothstep(0.02, 0.0, bulb));
      // Head.
      float head = box(p, vec2(0.9, 0.75), 0.25);
      vec3 metal = mix(vec3(0.55, 0.6, 0.68), vec3(0.85, 0.88, 0.93), smoothstep(-0.8, 0.8, p.y));
      c = mix(c, vec4(metal, 1.0), smoothstep(0.02, 0.0, head));
      c.rgb = mix(c.rgb, vec3(0.2, 0.23, 0.3), smoothstep(0.035, 0.0, abs(head)) * c.a);
      // Eyes (they blink).
      for (int k = 0; k < 2; k++) {
        vec2 e = p - vec2(k == 0 ? -0.38 : 0.38, 0.18);
        float eye = box(e, vec2(0.2, 0.17 * (1.0 - 0.9 * uBlink)), 0.06);
        c.rgb = mix(c.rgb, vec3(0.37, 0.95, 1.0), smoothstep(0.02, 0.0, eye));
      }
      // Teeth.
      float mouth = box(p - vec2(0.0, -0.38), vec2(0.5, 0.13), 0.05);
      float gaps = smoothstep(0.03, 0.0, abs(fract((p.x + 0.5) * 4.0) - 0.5) * 0.25 - 0.01);
      c.rgb = mix(c.rgb, mix(vec3(0.9, 0.93, 0.96), vec3(0.25, 0.28, 0.35), gaps), smoothstep(0.02, 0.0, mouth));
      return c;
    }

    float ring(vec2 x, vec2 at, float r) {
      return smoothstep(0.012, 0.0, abs(length(x - at) - r));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.75 * uResolution.y / uResolution.x);   // keep the ring on narrow screens
      vec2 x = uv * 5.0 * fit;
      float r2 = max(dot(x, x), 1e-5);
      vec2 y = x - x / r2;                                             // θ_E = 1

      vec3 col = vec3(0.012, 0.014, 0.024);

      // The wallpaper: a sky tiled with small poops, every other one missing, all lensed.
      vec2 q = y * 1.7 + vec2(0.11, 0.37);
      vec2 cell = floor(q);
      if (uWall > 0.5 && hash(cell) > 0.45) {
        vec2 local = (fract(q) - 0.5) / 0.62 + 0.5;
        vec4 tp = poop(local);
        col = mix(col, tp.rgb * 0.16, tp.a);
      }
      // Faint stars between them.
      vec2 sq = y * 9.0;
      float st = step(0.965, hash(floor(sq))) * smoothstep(0.3, 0.0, length(fract(sq) - 0.5));
      col += vec3(0.6, 0.65, 0.75) * st * 0.35;

      // The poop itself, spinning.
      vec2 d = (y - uSrc) / uSize;
      float cs = cos(uSpin), sn = sin(uSpin);
      vec4 pp = poop(mat2(cs, sn, -sn, cs) * d + 0.5);
      col = mix(col, pp.rgb, pp.a);

      // Fermat's arrival-time surface τ(x) = ½|x − β|² − ln|x|: contour lines.
      if (uFermat > 0.5) {
        float tau = 0.5 * dot(x - uSrc, x - uSrc) - 0.5 * log(r2);
        float f = tau * 2.5;
        float line = 1.0 - smoothstep(0.0, 1.3, abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-4));
        col += vec3(0.25, 0.55, 0.6) * line * 0.16 * smoothstep(0.3, 0.6, sqrt(r2));
        // The stationary points: the images.
        col += vec3(0.49, 0.88, 0.66) * ring(x, uImgOuter, 0.16) * 0.8;
        col += vec3(0.94, 0.44, 0.63) * ring(x, uImgInner, 0.16) * 0.8;
      }

      // The robot, in front.
      vec4 rb = robot(x);
      col += vec3(0.25, 0.4, 0.55) * exp(-r2 * 9.0) * 0.25;            // it is very heavy
      col = mix(col, rb.rgb, rb.a);

      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uPoop: { value: poopTexture() },
      uSrc: { value: new THREE.Vector2(REACH, MISS + 0.25) },
      uSize: { value: 0.42 },
      uSpin: { value: 0 },
      uBlink: { value: 0 },
      uImgOuter: { value: new THREE.Vector2() },
      uImgInner: { value: new THREE.Vector2() },
      uWall: { value: 1 },
      uFermat: { value: 1 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    u.uSrc.value.set(m.sx, m.sy);
    // Images lie on the line through the robot and the poop, either side.
    u.uImgOuter.value.set(m.sx, m.sy).multiplyScalar(m.outer / m.beta);
    u.uImgInner.value.set(m.sx, m.sy).multiplyScalar(m.inner / m.beta);
    u.uSize.value = ctx.params.poopSize;
    u.uSpin.value = m.spin;
    u.uBlink.value = smooth(m.blink);
    u.uWall.value = ctx.params.wallpaper;
    u.uFermat.value = ctx.params.fermat;
  },

  dispose(ctx, state) {
    state.uniforms?.uPoop.value.dispose();
  },
};
