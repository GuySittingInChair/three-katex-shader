import { TAU, phaseOf, smooth } from '../lib/motion.js';

// The hydrogen atom, raymarched through its probability cloud. Each
// stationary state ψ just rotates its phase at a rate set by its energy
// Eₙ = −1/(2n²) (atomic units), so on its own its cloud |ψ|² never moves.
// Mix two of them,
//
//     Ψ = cos α ψₐ + sin α e^{−iΔE t} ψ_b
//
// and the cloud beats: |Ψ|² = cos²α ψₐ² + sin²α ψ_b² + 2 sin α cos α ψₐψ_b cos(ΔE t),
// sloshing back and forth at the frequency of the light the atom would emit
// jumping between them (1s ↔ 2p is Lyman-α). Colour shows the phase of Ψ
// relative to ψₐ. The states are the exact normalized ones (checked: each
// integrates to 1 and each pair to 0):
//
//     ψ₁ₛ = e^{−r}/√π,   ψ₂ₚ = z e^{−r/2} / (4√(2π)),   ψ₃d = (3z² − r²) e^{−r/3} / (81√(6π))
//
// Loop (36 s): 1s → 2p → 3d → 1s, each hand-over a superposition that beats
// three times while α sweeps from 0 to 90°. The view zooms to the cloud's size.

const PERIOD = 36;
const BEATS = 3;
const STATES = [
  { name: '1s', n: 1, size: 4.5 },
  { name: '2p_z', n: 2, size: 13 },
  { name: '3d_{z^2}', n: 3, size: 24 },
];

export default {
  name: 'Hydrogen Orbitals',
  description:
    'The electron cloud of hydrogen, raymarched on the GPU from its exact wavefunctions. A single orbital sits ' +
    'still; a mix of two beats at the frequency of the light emitted jumping between them. It hands over ' +
    '1s → 2p → 3d → 1s. The mix angle, the energies and the beat are shown live.',
  tags: ['quantum', 'hydrogen', 'orbitals', 'superposition', 'raymarching'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const seg = Math.min(2, Math.floor(p * 3));
    const local = p * 3 - seg;
    const a = STATES[seg];
    const b = STATES[(seg + 1) % 3];
    const alpha = (Math.PI / 2) * smooth(local);
    const Ea = -1 / (2 * a.n * a.n);
    const Eb = -1 / (2 * b.n * b.n);
    return {
      ia: seg,
      ib: (seg + 1) % 3,
      alpha,
      deg: (alpha * 180) / Math.PI,
      beat: TAU * BEATS * local,
      Ea,
      Eb,
      dE: Math.abs(Eb - Ea),
      size: a.size + (b.size - a.size) * Math.sin(alpha) ** 2,
      turn: TAU * p,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `\\Psi &= \\cos\\alpha\\,\\psi_{${STATES[m.ia].name}} + \\sin\\alpha\\,e^{-i\\,\\Delta E\\,t}\\,\\psi_{${STATES[m.ib].name}},\\quad \\alpha = ${hl(m.deg, 0)}^\\circ \\\\` +
    `E_n &= -\\frac{1}{2n^2}:\\quad ${hl(m.Ea, 3)},\\ ${hl(m.Eb, 3)},\\quad \\Delta E = ${hl(m.dE, 3)} \\\\` +
    '|\\Psi|^2 &= \\cos^2\\!\\alpha\\,\\psi_a^2 + \\sin^2\\!\\alpha\\,\\psi_b^2 + \\sin 2\\alpha\\;\\psi_a\\psi_b\\cos(\\Delta E\\,t)' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    brightness: { value: 1, min: 0.3, max: 3 },
    quality: { value: 90, min: 40, max: 160, step: 10 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uA;
    uniform float uB;
    uniform float uAlpha;
    uniform float uBeat;
    uniform float uSize;
    uniform float uTurn;
    uniform float uBright;
    uniform float uSteps;
    varying vec2 vUv;

    const float PI = 3.14159265;

    float psi(float k, vec3 p) {
      float r = length(p);
      if (k < 0.5) return exp(-r) / sqrt(PI);
      if (k < 1.5) return p.z * exp(-0.5 * r) / (4.0 * sqrt(2.0 * PI));
      return (3.0 * p.z * p.z - r * r) * exp(-r / 3.0) / (81.0 * sqrt(6.0 * PI));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.8 * uResolution.y / uResolution.x);
      // Camera circles the atom, a little above its equator; z (the orbitals' axis) is up.
      float R = uSize;
      vec3 cam = 2.6 * R * vec3(cos(uTurn), sin(uTurn), 0.35);
      vec3 fwd = normalize(-cam);
      vec3 right = normalize(cross(fwd, vec3(0.0, 0.0, 1.0)));
      vec3 up = cross(right, fwd);
      vec3 d = normalize(fwd + (uv.x * right + uv.y * up) * 0.95 * fit);

      // March through the sphere of radius R around the nucleus.
      float b = dot(cam, d);
      float disc = b * b - dot(cam, cam) + R * R;
      vec3 col = vec3(0.0);
      if (disc > 0.0) {
        float t0 = -b - sqrt(disc);
        float t1 = -b + sqrt(disc);
        float ds = (t1 - t0) / uSteps;
        float ca = cos(uAlpha), sa = sin(uAlpha);
        for (int i = 0; i < 160; i++) {
          if (float(i) >= uSteps) break;
          vec3 p = cam + d * (t0 + (float(i) + 0.5) * ds);
          float a = ca * psi(uA, p);
          float bb = sa * psi(uB, p);
          float re = a + bb * cos(uBeat);
          float im = -bb * sin(uBeat);
          float rho = re * re + im * im;
          // Phase of Ψ relative to ψ_a: blue in phase, pink opposite, gold in between.
          float ph = atan(im, re);
          vec3 hue = mix(vec3(0.95, 0.42, 0.62), vec3(0.45, 0.72, 1.0), 0.5 + 0.5 * cos(ph));
          hue = mix(hue, vec3(1.0, 0.82, 0.4), 0.45 * abs(sin(ph)));
          col += hue * rho * ds;
        }
      }
      // ∫|Ψ|² dV = 1, so a column through a cloud of size R is about 1/R².
      col *= R * R * 3.0 * uBright;
      col = col / (1.0 + max(max(col.r, col.g), col.b));
      col += vec3(0.01, 0.012, 0.02);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uA: { value: 0 },
      uB: { value: 1 },
      uAlpha: { value: 0 },
      uBeat: { value: 0 },
      uSize: { value: 4.5 },
      uTurn: { value: 0 },
      uBright: { value: 1 },
      uSteps: { value: 90 },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    u.uA.value = m.ia;
    u.uB.value = m.ib;
    u.uAlpha.value = m.alpha;
    u.uBeat.value = m.beat;
    u.uSize.value = m.size;
    u.uTurn.value = m.turn;
    u.uBright.value = ctx.params.brightness;
    u.uSteps.value = ctx.params.quality;
  },
};
