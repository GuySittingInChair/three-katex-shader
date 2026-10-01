import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';

// The 2-D Ising model, where every spin is a robot that is either happy
// (s = +1) or sad (s = −1). Each robot wants to match its four neighbours:
//
//     H = −J Σ⟨ij⟩ sᵢ sⱼ,   P(state) ∝ e^{−H/T}        (J = k_B = 1)
//
// and the temperature T sets how much it cares. Simulated with Metropolis:
// pick a robot, flip its mood if that lowers the energy, otherwise flip it
// anyway with probability e^{−ΔE/T}. Hot: moods are random. Cold: everyone
// agrees. In between there is a sharp phase transition, solved exactly by
// Onsager (1944):
//
//     T_c = 2 / ln(1 + √2) = 2.269
//     |m| = (1 − sinh⁻⁴(2/T))^{1/8} below T_c, 0 above   (Yang, 1952)
//     u = −coth(2/T) [1 + (2/π)(2 tanh²(2/T) − 1) K(k)],  k = 2 sinh(2/T)/cosh²(2/T)
//
// and the live readouts put the simulation next to them (checked: on a
// 64 × 64 lattice they agree to 3 decimals away from T_c; near T_c a finite
// lattice smears the transition, as it should). Near T_c the clusters of
// agreement get huge and slow ("critical slowing down"): the mood takes
// ages to make up its mind. Cooled quickly, it can get stuck in stripes of
// opposing moods, which is also physics.
//
// The ring around the board is the mood ring: its colour is the overall
// mood m. Loop (48 s): hot → cold → hot, lingering near T_c. The robots
// themselves are simulated, not a closed-form loop.

const PERIOD = 48;
const L = 48;
const N = L * L;
const TC = 2 / Math.log(1 + Math.SQRT2);
const SWEEPS_PER_SECOND = 200;

// Onsager's exact results.
const agm = (a, b) => {
  for (let i = 0; i < 40; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return a;
};
const ellipticK = (k) => Math.PI / (2 * agm(1, Math.sqrt(Math.max(1e-300, 1 - k * k))));
const exactM = (T) => (T >= TC ? 0 : Math.pow(1 - Math.pow(Math.sinh(2 / T), -4), 1 / 8));
const exactU = (T) => {
  const b = 1 / T;
  const k = (2 * Math.sinh(2 * b)) / Math.cosh(2 * b) ** 2;
  const f = 2 * Math.tanh(2 * b) ** 2 - 1;
  return -(1 / Math.tanh(2 * b)) * (1 + (2 / Math.PI) * f * (Math.abs(f) < 1e-12 ? 0 : ellipticK(k)));
};

export default {
  name: 'Ising Mood Ring',
  description:
    'A lattice of robots, each happy or sad, each wanting to match its neighbours: the 2-D Ising model. Hot, ' +
    'moods are random; cold, everyone agrees; in between there is a sharp phase transition at T = 2.269, solved ' +
    'exactly by Onsager. The live mood and energy are shown next to his exact answers. The ring is the mood ring.',
  tags: ['ising model', 'statistical mechanics', 'phase transition', 'monte carlo', 'onsager', 'robots'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const c = Math.cos(TAU * phaseOf(t, PERIOD));
    const T = TC + 1.15 * Math.sign(c) * Math.abs(c) ** 1.6; // 3.42 → 1.12 → 3.42, slow near T_c
    // The simulation's numbers are filled in by update(); these are placeholders.
    return { T, exactM: exactM(T), exactU: exactU(T), simM: 0, simAbsM: 0, simU: 0 };
  },

  latex: (params, hl, m) => {
    const mood = m.simM > 0.3 ? '\\textcolor{#ffd166}{\\text{happy}}' : m.simM < -0.3 ? '\\textcolor{#7cc4ff}{\\text{sad}}' : '\\text{undecided}';
    return (
      '\\begin{aligned}' +
      'H &= -\\sum_{\\langle ij\\rangle} s_i s_j,\\quad P \\propto e^{-H/T},\\quad T_c = \\frac{2}{\\ln(1+\\sqrt2)} = 2.269 \\\\' +
      `T &= ${hl(m.T, 2)}${m.T < TC ? ' < T_c' : ' > T_c'},\\quad \\text{mood } m = ${hl(m.simM, 2)}\\ (${mood}) \\\\` +
      `|m| &= ${hl(m.simAbsM, 3)}\\ \\text{(robots)},\\ ${hl(m.exactM, 3)}\\ \\text{(Onsager)} \\\\` +
      `u &= ${hl(m.simU, 3)}\\ \\text{(robots)},\\ ${hl(m.exactU, 3)}\\ \\text{(Onsager)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform sampler2D uSpins;
    uniform float uMood;
    varying vec2 vUv;

    const float L = ${L.toFixed(1)};

    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }

    // One robot face in a unit cell; happy = 1 smiles, happy = 0 frowns.
    vec3 face(vec2 f, float happy, float aa) {
      vec3 skin = happy > 0.5 ? vec3(1.0, 0.8, 0.32) : vec3(0.38, 0.55, 0.9);
      vec3 ink = happy > 0.5 ? vec3(0.35, 0.2, 0.05) : vec3(0.06, 0.1, 0.25);
      vec3 col = vec3(0.025, 0.03, 0.045);
      // Antenna.
      float stalk = box(f - vec2(0.5, 0.86), vec2(0.03, 0.08), 0.01);
      float bulb = length(f - vec2(0.5, 0.94)) - 0.05;
      col = mix(col, skin * 0.8, smoothstep(aa, -aa, min(stalk, bulb)));
      // Head.
      float head = box(f - vec2(0.5, 0.46), vec2(0.38, 0.33), 0.1);
      col = mix(col, skin, smoothstep(aa, -aa, head));
      // Eyes.
      float eyes = min(length(f - vec2(0.36, 0.55)), length(f - vec2(0.64, 0.55))) - 0.065;
      col = mix(col, ink, smoothstep(aa, -aa, eyes));
      // Mouth: the bottom of a circle (smile) or the top of one (frown).
      vec2 c = happy > 0.5 ? vec2(0.5, 0.44) : vec2(0.5, 0.2);
      float arc = abs(length(f - c) - 0.16) - 0.035;
      float half_ = happy > 0.5 ? step(f.y, c.y - 0.03) : step(c.y + 0.03, f.y);
      col = mix(col, ink, smoothstep(aa, -aa, arc) * half_);
      return col;
    }

    void main() {
      vec2 px = vUv * uResolution;
      // A square board, clear of the header and the toolbar; on wide screens
      // it moves left, out from under the equations.
      bool wide = uResolution.x > 1.3 * uResolution.y;
      float side = min(uResolution.x * 0.92, uResolution.y * (wide ? 0.64 : 0.72));
      float left = wide ? max(0.06 * uResolution.x, 0.3 * uResolution.x - 0.5 * side) : 0.5 * (uResolution.x - side);
      vec2 origin = vec2(left, 0.46 * uResolution.y - 0.5 * side);
      vec2 g = (px - origin) / side * L;              // lattice coordinates
      vec3 col = vec3(0.012, 0.014, 0.024);

      // The mood ring: a band around the board, coloured by the overall mood.
      vec2 rel = (px - origin) / side - 0.5;
      float frame = box(rel, vec2(0.5 + 0.03), 0.04);
      vec3 ringCol = mix(vec3(0.38, 0.55, 0.9), vec3(1.0, 0.8, 0.32), 0.5 + 0.5 * uMood);
      ringCol = mix(vec3(0.55, 0.45, 0.65), ringCol, abs(uMood));   // undecided: murky purple
      float edge = 1.5 / side;
      col = mix(col, ringCol, smoothstep(edge, -edge, abs(frame) - 0.012));

      if (g.x >= 0.0 && g.y >= 0.0 && g.x < L && g.y < L) {
        vec2 cell = floor(g);
        float s = texture2D(uSpins, (cell + 0.5) / L).r;
        float aa = 1.2 * L / side;                    // about a pixel, in cell units
        col = face(fract(g), step(0.5, s), aa);
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    const data = new Uint8Array(N);
    const tex = new THREE.DataTexture(data, L, L, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return { uSpins: { value: tex }, uMood: { value: 0 } };
  },

  setup() {
    // Start hot: random moods.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const spins = new Int8Array(N);
    for (let i = 0; i < N; i++) spins[i] = rand() < 0.5 ? 1 : -1;
    return { spins, rand, owed: 0, avgM: 0, avgAbsM: 0, avgU: 0, primed: false };
  },

  update(ctx, state) {
    const { spins, rand } = state;
    const m = ctx.motion;
    const T = m.T;
    // Metropolis sweeps, a fixed number per second of motion time (capped per frame).
    state.owed += Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1) * SWEEPS_PER_SECOND;
    const sweeps = Math.floor(state.owed);
    state.owed -= sweeps;
    const p4 = Math.exp(-4 / T);
    const p8 = Math.exp(-8 / T);
    for (let k = 0; k < sweeps; k++) {
      for (let parity = 0; parity < 2; parity++) {
        for (let y = 0; y < L; y++) {
          const up = ((y + 1) % L) * L;
          const down = ((y + L - 1) % L) * L;
          const row = y * L;
          for (let x = (y + parity) % 2; x < L; x += 2) {
            const i = row + x;
            const nb = spins[row + ((x + 1) % L)] + spins[row + ((x + L - 1) % L)] + spins[up + x] + spins[down + x];
            const dE = 2 * spins[i] * nb; // −8, −4, 0, 4 or 8
            if (dE <= 0 || rand() < (dE === 4 ? p4 : p8)) spins[i] = -spins[i];
          }
        }
      }
    }

    // Magnetization and energy per robot, smoothed over about a second.
    let sum = 0;
    let bonds = 0;
    const data = state.uniforms.uSpins.value.image.data;
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        const s = spins[y * L + x];
        sum += s;
        bonds += s * (spins[y * L + ((x + 1) % L)] + spins[((y + 1) % L) * L + x]);
        data[y * L + x] = s > 0 ? 255 : 0;
      }
    }
    state.uniforms.uSpins.value.needsUpdate = true;
    const mag = sum / N;
    const u = -bonds / N;
    const a = state.primed ? 1 - Math.exp(-ctx.delta / 0.8) : 1;
    state.primed = true;
    state.avgM += a * (mag - state.avgM);
    state.avgAbsM += a * (Math.abs(mag) - state.avgAbsM);
    state.avgU += a * (u - state.avgU);
    m.simM = state.avgM;
    m.simAbsM = state.avgAbsM;
    m.simU = state.avgU;
    state.uniforms.uMood.value = state.avgM;
  },

  dispose(ctx, state) {
    state.uniforms?.uSpins.value.dispose();
  },
};
