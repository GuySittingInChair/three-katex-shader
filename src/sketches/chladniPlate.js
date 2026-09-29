import { phaseOf, smooth } from '../lib/motion.js';

// Chladni figures: sand on a vibrating square plate gathers on the lines that
// stay still (the nodal lines, where the displacement u = 0). For a square
// plate, Chladni's patterns are well described by
//
//     u_{n,m}^± (x, y) = cos(nπx) cos(mπy) ± cos(mπx) cos(nπy),   x, y ∈ [−1, 1]
//
// The loop slides the plate from one mode to the next, u = (1 − s) u_A + s u_B:
// while the frequency changes the sand jumps about (it's shaken off the old
// lines), then it settles onto the new ones. Sand shows where |u| is small:
// brightness exp(−(u / 0.07)²), as grains.
//
// Loop (24 s, 6 s per figure): hold · slide to the next mode (s: 0 → 1) while
//   the sand scatters and resettles · hold. Four figures, then back to the first.

const PERIOD = 24;
const MODES = [
  [2, 5, -1],
  [3, 7, 1],
  [1, 4, 1],
  [4, 9, -1],
];
const name = ([n, m, sign]) => `u_{${n},${m}}^{${sign > 0 ? '+' : '-'}}`;

export default {
  name: 'Chladni Plate',
  description:
    'Sand on a vibrating square plate gathers on the lines that stay still. As the plate slides from one ' +
    'vibration mode to the next, the sand is shaken loose and settles into the new figure. The equation shows ' +
    'the two modes and the blend s live.',
  tags: ['waves', 'standing waves', 'acoustics', 'nodal lines'],
  category: 'Waves',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const a = Math.floor(p * MODES.length) % MODES.length;
    const x = p * MODES.length - Math.floor(p * MODES.length);
    const moving = x >= 0.55 && x < 0.8;
    const s = x < 0.55 ? 0 : moving ? smooth((x - 0.55) / 0.25) : 1;
    const settle = moving ? 1 - Math.sin((Math.PI * (x - 0.55)) / 0.25) : 1;
    return { a, b: (a + 1) % MODES.length, s, settle };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'u_{n,m}^{\\pm} &= \\cos(n\\pi x)\\cos(m\\pi y) \\pm \\cos(m\\pi x)\\cos(n\\pi y) \\\\' +
    `u &= (1-s)\\,${name(MODES[m.a])} + s\\,${name(MODES[m.b])},\\quad s = ${hl(m.s, 2)} \\\\` +
    '&\\text{sand collects where } u = 0' +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    lineWidth: { value: 0.07, min: 0.02, max: 0.2 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec3 uA;       // n, m, sign
    uniform vec3 uB;
    uniform float uS;
    uniform float uSettle; // 1 = settled on the nodal lines, 0 = shaken loose
    uniform float uEps;
    varying vec2 vUv;

    const float PI = 3.14159265;
    float mode(vec3 k, vec2 p) {
      return cos(k.x * PI * p.x) * cos(k.y * PI * p.y) + k.z * cos(k.y * PI * p.x) * cos(k.x * PI * p.y);
    }
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float side = min(uResolution.x, uResolution.y) * 0.84;
      vec2 p = (frag - 0.5 * uResolution) / (0.5 * side); // the plate is [-1, 1]^2

      vec3 bg = vec3(0.028, 0.032, 0.042);
      vec2 edge = abs(p);
      if (max(edge.x, edge.y) > 1.0) {
        float rim = smoothstep(1.035, 1.0, max(edge.x, edge.y));
        gl_FragColor = vec4(mix(bg, vec3(0.32, 0.34, 0.4), rim), 1.0);
        return;
      }

      float u = mix(mode(uA, p), mode(uB, p), uS);
      float onLine = exp(-pow(u / uEps, 2.0));

      // Grains: a fixed speckle once settled; they jump about while shaken.
      vec2 cell = floor(frag / 1.7);
      float jitter = (1.0 - uSettle) * floor(uTime * 16.0);
      float grain = hash(cell + vec2(1.3, 2.7) * jitter);
      float density = mix(0.07, onLine, uSettle);
      float sand = step(grain, density * 0.92);

      vec3 plate = vec3(0.12, 0.13, 0.16) * (0.85 + 0.15 * (1.0 - 0.5 * length(p)));
      vec3 sandCol = vec3(0.9, 0.81, 0.6) * (0.72 + 0.28 * hash(cell + 3.1));
      gl_FragColor = vec4(mix(plate, sandCol, sand), 1.0);
    }
  `,

  uniforms() {
    return {
      uA: { value: MODES[0].slice() },
      uB: { value: MODES[1].slice() },
      uS: { value: 0 },
      uSettle: { value: 1 },
      uEps: { value: 0.07 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uA.value = MODES[m.a];
    u.uB.value = MODES[m.b];
    u.uS.value = m.s;
    u.uSettle.value = m.settle;
    u.uEps.value = ctx.params.lineWidth;
  },
};
