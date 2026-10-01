import * as THREE from 'three';
import { TAU, phaseOf, smooth } from '../lib/motion.js';

// How much can you store in a pile of poop? Bekenstein's bound: anything of
// energy E inside radius R holds at most
//
//     I ≤ 2π R E / (ħ c ln 2) bits
//
// (a fundamental limit, not an engineering one). Take a tonne of poop
// (E = mc²) and squeeze it. The bound shrinks with R: 2.6 × 10⁴⁶ bits at a
// metre. You can't beat it by squeezing harder: at R = 2GM/c² the pile is a
// black hole, and a black hole's entropy, A/(4 ℓ_P²) = 4πGM²/(ħc), is
// exactly the bound (both 3.827307 × 10²² bits here; checked numerically).
// Black holes are the hard drives that hit the limit.
//
// Then it evaporates. Hawking: a black hole glows at T = ħc³/(8πGMk_B),
// hotter as it shrinks, and loses mass faster and faster, M ∝ (1 − t/t_end)^{1/3},
// with t_end = 5120πG²M³/(ħc⁴) (the textbook estimate, photons only). For
// a tonne: 1.2 × 10²⁰ K, gone in 84 nanoseconds. The poops flying out are
// an artist's impression: each carries 1/36 of the energy, released at the
// right moments, but real Hawking radiation is photons and other particles,
// not poop.
//
// Loop (32 s): squeeze (log scale, 1 m down to 1.5 × 10⁻²⁴ m), black hole,
// evaporation (slowed down about 10⁸ times), gone.

const PERIOD = 32;
const HBAR = 1.054571817e-34;
const C = 299792458;
const G = 6.6743e-11;
const KB = 1.380649e-23;
const M0 = 1000; // kg
const RS = (2 * G * M0) / C ** 2;
const LOG_RS = Math.log10(RS);
const T_END = (5120 * Math.PI * G ** 2 * M0 ** 3) / (HBAR * C ** 4);
const BITS_PER_METRE = (2 * Math.PI * M0 * C) / (HBAR * Math.LN2); // I = this × R
const S_BH_BITS = (4 * Math.PI * G * M0 * M0) / (HBAR * C * Math.LN2);
const PARTICLES = 36;
const SQUEEZE = 0.42;
const FORMED = 0.5;
const EVAP = 0.9;

const sci = (hl, x) => {
  const n = Math.floor(Math.log10(x));
  return `${hl(x / 10 ** n, 2)}\\times 10^{${n}}`;
};

function poopTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default {
  name: 'Poop Hard Drive Black Hole',
  description:
    'A tonne of poop is squeezed while Bekenstein’s bound on how many bits it could store shrinks with it. You ' +
    'can’t beat the bound: at its Schwarzschild radius the pile becomes a black hole whose entropy equals it ' +
    'exactly. Then it Hawking-evaporates in 84 nanoseconds. Every number is live.',
  tags: ['bekenstein bound', 'black hole', 'entropy', 'hawking radiation', 'information', 'poop'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const squeeze = smooth(Math.min(1, p / SQUEEZE));
    const logR = LOG_RS * squeeze;
    const stage = p < SQUEEZE ? 0 : p < FORMED ? 1 : p < EVAP ? 2 : 3;
    const tau = Math.max(0, (p - FORMED) / (EVAP - FORMED)); // fraction of the lifetime (goes past 1 after)
    const mass = stage < 2 ? 1 : stage === 2 ? Math.cbrt(1 - tau) : 0;
    return {
      stage,
      squeeze,
      R: 10 ** logR,
      bits: BITS_PER_METRE * 10 ** logR,
      tau,
      mass,
      temp: mass > 0 ? (HBAR * C ** 3) / (8 * Math.PI * G * M0 * mass * KB) : 0,
      nsLeft: stage < 2 ? T_END * 1e9 : Math.max(0, T_END * 1e9 * (1 - Math.min(1, tau))),
      flash: Math.max(0, 1 - Math.abs(p - SQUEEZE) * 60) + Math.max(0, 1 - Math.abs(p - EVAP) * 40),
    };
  },

  latex: (params, hl, m) => {
    const head = 'I &\\le \\frac{2\\pi R E}{\\hbar c \\ln 2}\\ \\text{bits},\\quad E = mc^2,\\quad m = 1\\ \\text{tonne of poop} \\\\';
    let body;
    if (m.stage === 0) {
      body = `R &= ${sci(hl, m.R)}\\ \\text{m},\\quad I_{\\text{max}} = ${sci(hl, m.bits)}\\ \\text{bits}`;
    } else if (m.stage === 1) {
      body =
        `R &= R_s = \\tfrac{2GM}{c^2} = ${sci(hl, RS)}\\ \\text{m}:\\ \\text{a black hole} \\\\` +
        `I_{\\text{max}} &= ${sci(hl, BITS_PER_METRE * RS)} = \\tfrac{S_{BH}}{k_B \\ln 2} = ${sci(hl, S_BH_BITS)}\\ \\text{bits}`;
    } else if (m.stage === 2) {
      body =
        `T_H &= \\frac{\\hbar c^3}{8\\pi G M k_B} = ${sci(hl, m.temp)}\\ \\text{K} \\\\` +
        `M &= ${hl(M0 * m.mass, 0)}\\ \\text{kg},\\quad \\text{gone in } ${hl(m.nsLeft, 1)}\\ \\text{ns}`;
    } else {
      body = '&\\text{evaporated in } 84\\ \\text{ns} \\\\ &\\text{(real Hawking radiation is not poop)}';
    }
    return '\\begin{aligned}' + head + body + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uPoop;
    uniform float uStage;
    uniform float uSqueeze;
    uniform float uMass;
    uniform float uTau;
    uniform float uFlash;
    uniform float uTempLog;
    varying vec2 vUv;

    const int PARTICLES = ${PARTICLES};

    float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
    float hash2(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }
    vec4 poop(vec2 q) {
      if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
      return texture2D(uPoop, q);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.8 * uResolution.y / uResolution.x);
      vec2 x = uv * 2.0 * fit + vec2(0.0, 0.08);
      vec3 col = vec3(0.01, 0.012, 0.02);
      vec2 sq = uv * 50.0;
      col += vec3(0.6, 0.65, 0.8) * step(0.975, hash2(floor(sq))) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5)) * 0.4;
      float r = length(x);

      if (uStage < 0.5) {
        // The pile: poops packed into a disc that shrinks (and packs tighter) as it's squeezed.
        float R = mix(0.62, 0.28, uSqueeze);
        float tile = R / 4.0;
        vec2 q = x / tile;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 cell = floor(q);
        vec2 centre = (cell + 0.5 - vec2(0.5 * mod(cell.y, 2.0), 0.0)) * tile;
        if (length(centre) < R) {
          vec4 pp = poop((fract(q) - 0.5) / 1.15 + 0.5);
          col = mix(col, pp.rgb * (1.0 + 0.8 * uSqueeze * uSqueeze), pp.a);
        }
      } else if (uStage < 2.5) {
        // The black hole: shrinks as it loses mass; its glow gets hotter (bluer).
        float rb = 0.26 * uMass;
        float heat = clamp(uTempLog, 0.0, 1.0);
        vec3 glow = mix(vec3(1.0, 0.55, 0.2), vec3(0.6, 0.75, 1.0), heat);
        col += glow * exp(-pow((r - 1.5 * rb) / (0.06 + 0.4 * rb), 2.0)) * (0.5 + 1.5 * heat);
        col = mix(col, vec3(0.0), smoothstep(rb + 0.004, rb - 0.004, r));
      }

      // Hawking poops: particle i leaves once the hole has lost (i + ½)/N of its mass.
      if (uStage > 1.5) {
        for (int i = 0; i < PARTICLES; i++) {
          float f = (float(i) + 0.5) / float(PARTICLES);
          float born = 1.0 - pow(1.0 - f, 3.0);             // M ∝ (1 − τ)^{1/3}
          float age = uTau - born;
          if (age < 0.0) continue;
          float ang = 6.2831853 * hash(float(i) + 1.0);
          vec2 at = (0.26 * pow(max(1.0 - born, 0.0), 1.0 / 3.0) + age * (1.4 + hash(float(i) + 7.0))) * vec2(cos(ang), sin(ang));
          float s = 0.09;
          vec4 pp = poop((x - at) / s + 0.5);
          col = mix(col, pp.rgb, pp.a);
        }
      }

      col += vec3(1.0, 0.95, 0.85) * uFlash * exp(-r * r * 3.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uPoop: { value: poopTexture() },
      uStage: { value: 0 },
      uSqueeze: { value: 0 },
      uMass: { value: 1 },
      uTau: { value: 0 },
      uFlash: { value: 0 },
      uTempLog: { value: 0 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    u.uStage.value = m.stage;
    u.uSqueeze.value = m.squeeze;
    u.uMass.value = m.mass;
    u.uTau.value = m.tau;
    u.uFlash.value = m.flash;
    // How hot, on a log scale from the starting temperature to 100× it.
    u.uTempLog.value = m.mass > 0 ? Math.log10(1 / m.mass) / 2 : 1;
  },

  dispose(ctx, state) {
    state.uniforms?.uPoop.value.dispose();
  },
};
