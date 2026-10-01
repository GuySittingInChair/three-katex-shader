import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';

// A rubber duck falls feet-first into a black hole of 10 solar masses and
// gets spaghettified. Everything shown is exact for a non-spinning
// (Schwarzschild) hole; lengths are in Schwarzschild radii, Rs = 2GM/c².
//
// Falling from rest at r₀ = 12 Rs, the duck's distance from the hole
// follows a cycloid in its own (proper) time τ:
//
//     r = r₀ (1 + cos η)/2,   τ = √(r₀³/(8M)) (η + sin η)        (M = GM/c² = Rs/2)
//
// Neighbouring bits of a freely falling duck drift apart by the geodesic
// deviation equation,
//
//     d²ξ∥/dτ² = +(2M/r³) ξ∥   (stretched along the fall)
//     d²ξ⊥/dτ² = −(M/r³) ξ⊥    (squeezed across it)
//
// which for a duck starting at rest has closed-form solutions:
//
//     S⊥ = r/r₀
//     S∥ = (1 + cos η)/2 + ¾ sin η (η + sin η)/(1 + cos η)
//
// (all checked against a direct numerical integration, to 6 decimals). By
// the horizon the duck is 7.8 times longer and 12 times thinner, for any
// mass of hole: the shape change doesn't depend on M. What M decides is
// whether the rubber can resist. Across a 10 cm duck the tidal pull is
// 2GM·L/r³: 600 g at the start and a million g at the horizon of a
// 10 M☉ hole, so here the duck is treated as free-falling duck dust. (For
// the 4-million-M☉ hole at the centre of the Milky Way it would be 6 × 10⁻⁶ g
// at the horizon, and the duck would cross it intact.)
//
// The duck is drawn hugely enlarged (a real one is 3 × 10⁻⁶ Rs long); the
// stretch factors are the same for any small duck. The view zooms in as it
// falls. The stars are decoration; for real lensing, see Black Hole Lensing.
//
// Loop (18 s): the fall, in slow motion (the whole thing takes 6.4 ms of
// the duck's time), then the duck is gone. Each loop it falls from a
// slightly different direction.

const PERIOD = 18;
const FALL = 0.8;                                  // fraction of the loop spent falling
const R0 = 12;                                     // start radius, Rs
const M = 0.5;                                     // GM/c² in Rs
const K = Math.sqrt(R0 ** 3 / (8 * M));            // τ = K (η + sin η), in Rs/c
const ETA_H = 2 * Math.acos(Math.sqrt(1 / R0));    // η at the horizon (r = 1)
const TAU_H = K * (ETA_H + Math.sin(ETA_H));       // proper time to the horizon, Rs/c
const GM_SI = 10 * 1.32712440018e20;               // 10 M☉, m³/s²
const C = 299792458;
const RS_SI = (2 * GM_SI) / C ** 2;                // 29.5 km
const DUCK_M = 0.1;                                // a 10 cm duck

// Write x as a × 10ⁿ for the equations.
const sci = (hl, x) => {
  const n = Math.floor(Math.log10(x));
  return `${hl(x / 10 ** n, 1)}\\times 10^{${n}}`;
};

function duckTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.scale(2, 2);

  // Body
  const bodyGrad = g.createRadialGradient(64, 80, 10, 64, 80, 50);
  bodyGrad.addColorStop(0, '#ffe566');
  bodyGrad.addColorStop(1, '#f0c020');
  g.fillStyle = bodyGrad;
  g.beginPath();
  g.ellipse(64, 85, 48, 38, 0, 0, TAU);
  g.fill();
  g.strokeStyle = '#c09010';
  g.lineWidth = 2.5;
  g.stroke();

  // Head
  g.beginPath();
  g.ellipse(64, 48, 28, 26, 0, 0, TAU);
  g.fill();
  g.stroke();

  // Beak
  g.fillStyle = '#ff8c00';
  g.beginPath();
  g.moveTo(64, 52);
  g.quadraticCurveTo(90, 48, 96, 58);
  g.quadraticCurveTo(90, 68, 64, 62);
  g.closePath();
  g.fill();
  g.strokeStyle = '#c06000';
  g.stroke();

  // Eyes
  for (const x of [52, 76]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, 42, 7, 8, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(x + 1.5, 43, 3.5, 0, TAU);
    g.fill();
  }

  // Wing
  g.strokeStyle = '#c09010';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(40, 85, 18, 12, -0.4, 0.2 * Math.PI, 1.1 * Math.PI);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default {
  name: 'Spaghettification of a Rubber Duck',
  description:
    'A rubber duck falls into a 10-solar-mass black hole. Tidal forces from the geodesic deviation equation, ' +
    'solved exactly, stretch it 7.8× along the fall and squeeze it 12× across by the horizon. The tidal pull ' +
    'across the duck (in g) and the proper time it has left (in milliseconds) are live.',
  tags: ['general relativity', 'black hole', 'spaghettification', 'tidal forces', 'geodesic deviation', 'rubber duck'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const u = Math.min(p / FALL, 1);
    // Step η evenly (slow motion that speeds up less near the end than real time would).
    const eta = ETA_H * u;
    const r = (R0 / 2) * (1 + Math.cos(eta));
    const tau = K * (eta + Math.sin(eta));
    const stretch = (1 + Math.cos(eta)) / 2 + (0.75 * Math.sin(eta) * (eta + Math.sin(eta))) / (1 + Math.cos(eta));
    const squeeze = r / R0;
    // A different direction each loop: a hash of the loop number.
    const loop = Math.floor(t / PERIOD);
    const h = Math.abs(Math.sin(loop * 12.9898 + 78.233) * 43758.5453) % 1;
    return {
      r,
      stretch,
      squeeze,
      gone: p >= FALL,
      angle: Math.PI + 0.9 * (h - 0.5), // in from the left, give or take 25°
      tidalG: (2 * GM_SI * DUCK_M) / (r * RS_SI) ** 3 / 9.80665,
      msLeft: ((TAU_H - tau) * RS_SI * 1000) / C,
      fade: p >= FALL ? 0 : 1,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    '\\frac{d^2\\xi_\\parallel}{d\\tau^2} &= +\\frac{2GM}{r^3}\\,\\xi_\\parallel,\\quad \\frac{d^2\\xi_\\perp}{d\\tau^2} = -\\frac{GM}{r^3}\\,\\xi_\\perp \\\\' +
    `r &= ${hl(m.r, 2)}\\,R_s,\\quad S_\\parallel = ${hl(m.stretch, 2)},\\quad S_\\perp = \\tfrac{r}{r_0} = ${hl(m.squeeze, 3)} \\\\` +
    (m.gone
      ? '&\\textcolor{#ff6b6b}{\\text{the duck has crossed the horizon}}'
      : `\\Delta a_{10\\,\\text{cm}} &= ${sci(hl, m.tidalG)}\\,g,\\quad \\tau_{\\text{left}} = ${hl(m.msLeft, 2)}\\,\\text{ms}` +
        (m.stretch > 4 ? ' \\\\ &\\textcolor{#ff6b6b}{\\text{the duck is now a noodle}}' : '')) +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    duckSize: { value: 0.38, min: 0.2, max: 0.7 },
    stars: { value: 1, min: 0, max: 1, step: 1 },
    photonSphere: { value: 1, min: 0, max: 1, step: 1 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uDuck;
    uniform float uR;
    uniform float uStretch;
    uniform float uSqueeze;
    uniform float uAngle;
    uniform float uSize;
    uniform float uView;
    uniform float uFade;
    uniform float uStars;
    uniform float uPhoton;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }

    vec4 duck(vec2 q) {
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
      return texture2D(uDuck, q);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 1.15 * uResolution.y / uResolution.x);   // keep the start on narrow screens
      vec2 x = uv * 2.0 * uView * fit;            // in Rs; the view zooms in as the duck falls
      float r = length(x);
      float px = 2.0 * uView * fit / uResolution.y; // one pixel, in Rs

      vec3 col = vec3(0.01, 0.012, 0.02);

      // Stars (decoration, fixed on screen).
      if (uStars > 0.5) {
        vec2 sq = uv * 60.0;
        float st = step(0.97, hash(floor(sq))) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5));
        col += vec3(0.7, 0.75, 0.9) * st * 0.45;
      }

      // The photon sphere, r = 1.5 Rs, where light can circle the hole (dashed).
      if (uPhoton > 0.5) {
        float dash = step(0.5, fract(atan(x.y, x.x) * 24.0 / 6.2831853));
        col += vec3(1.0, 0.6, 0.25) * smoothstep(1.5 * px, 0.0, abs(r - 1.5)) * dash * 0.5;
      }

      // The duck, centred at its current radius. Its head points away from
      // the hole; it's stretched by S∥ along the fall and squeezed by S⊥ across.
      vec2 outward = vec2(cos(uAngle), sin(uAngle));
      vec2 d = x - uR * vec2(cos(uAngle), sin(uAngle));
      vec2 across = vec2(-outward.y, outward.x);
      float size = uSize * uView / 2.6;           // drawn size, constant on screen before stretching
      vec2 q = vec2(dot(d, across) / (uSqueeze * size), dot(d, outward) / (uStretch * size)) + 0.5;
      vec4 dd = duck(q) * uFade;
      // Once it's long enough, it glows a little with pride.
      float proud = smoothstep(4.0, 7.8, uStretch);
      col += vec3(1.0, 0.85, 0.3) * proud * 0.12 * exp(-length(d) / (uStretch * size));
      col = mix(col, dd.rgb, dd.a);

      // The horizon, r = Rs: nothing gets back out, so anything inside is black.
      float inside = smoothstep(1.0 + px, 1.0 - px, r);
      col = mix(col, vec3(0.0), inside);
      col += vec3(0.35, 0.2, 0.1) * smoothstep(2.0 * px, 0.0, abs(r - 1.0)) * 0.6;

      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uDuck: { value: duckTexture() },
      uR: { value: R0 },
      uStretch: { value: 1 },
      uSqueeze: { value: 1 },
      uAngle: { value: Math.PI },
      uSize: { value: 0.38 },
      uView: { value: 13 },
      uFade: { value: 1 },
      uStars: { value: 1 },
      uPhoton: { value: 1 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    u.uR.value = m.r;
    u.uStretch.value = m.stretch;
    u.uSqueeze.value = m.squeeze;
    u.uAngle.value = m.angle;
    u.uSize.value = ctx.params.duckSize;
    u.uView.value = 2.4 + 0.9 * m.r;           // half-height of the view, in Rs
    u.uFade.value = m.fade;
    u.uStars.value = ctx.params.stars;
    u.uPhoton.value = ctx.params.photonSphere;
  },

  dispose(ctx, state) {
    state.uniforms?.uDuck.value.dispose();
  },
};
