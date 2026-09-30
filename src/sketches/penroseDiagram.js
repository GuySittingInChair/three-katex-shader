import * as THREE from 'three';
import { phaseOf, smooth, lerp } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Squeezing all of Minkowski spacetime into a diamond. In light-cone
// coordinates u = t + x, v = t − x, the map
//
//     T = (arctan(s u) + arctan(s v)) / s,   X = (arctan(s u) − arctan(s v)) / s
//
// is the identity (up to a factor 2) as s → 0 and, at s = 1, the Penrose
// compactification: the entire infinite plane lands inside |T| + |X| < π
// (checked numerically out to t, x = ±10⁴). Because it only reshapes u and v
// separately, light rays (u or v constant) stay at 45° the whole time: the
// map preserves the light cones, which is what makes Penrose diagrams useful.
// Lines of constant t (our "now") and constant x (clocks at rest) bend toward
// the corners: i⁰ (spatial infinity) left and right, i⁺ / i⁻ (the far future
// and past) top and bottom, and the edges 𝓘⁺ / 𝓘⁻ where light goes and comes from.
//
// Loop (20 s): flat → diamond, hold, back.

const PERIOD = 20;
const LINES = [-6, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 6];
const SAMPLES = 160;
const EXTENT = 60; // how far each line is drawn (it maps inside the diamond anyway)

const f = (s, w) => Math.atan(s * w) / s;

export default {
  name: 'Minkowski → Penrose',
  description:
    'All of infinite flat spacetime squeezed into a diamond. Lines of constant time and constant position bend ' +
    'toward the corners (the far future, the far past, spatial infinity) while light rays stay at 45° throughout, ' +
    'which is what makes Penrose diagrams useful. The squeeze s is shown live.',
  tags: ['relativity', 'minkowski', 'penrose', 'conformal', 'infinity'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const k = p < 0.4 ? smooth(p / 0.4) : p < 0.6 ? 1 : 1 - smooth((p - 0.6) / 0.4);
    return { s: lerp(0.02, 1, k) };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'T &= \\tfrac1s\\big(\\arctan s(t+x) + \\arctan s(t-x)\\big) \\\\' +
    'X &= \\tfrac1s\\big(\\arctan s(t+x) - \\arctan s(t-x)\\big) \\\\' +
    `s &= ${hl(m.s, 2)}` +
    (m.s > 0.99 ? '\\quad\\text{Penrose diagram: } |T| + |X| < \\pi' : '') +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 7);
    const lines = createFatLines({ maxSegments: LINES.length * 2 * SAMPLES + 12 * SAMPLES + 8, width: 1.6 });
    ctx.scene.add(lines.object);
    return {
      lines,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      time: new THREE.Color(0x7cc4ff),
      space: new THREE.Color(0xef6fa0),
      light: new THREE.Color(0xffd166),
      edge: new THREE.Color(0x8d96a8),
      timeDim: new THREE.Color(0x7cc4ff).multiplyScalar(0.5),
      spaceDim: new THREE.Color(0xef6fa0).multiplyScalar(0.5),
    };
  },

  update(ctx, state) {
    const { lines, a, b } = state;
    const { s } = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    // Keep it on screen: the flat picture spans about ±2·6, the diamond ±π.
    const view = lerp(0.3, 1.0, Math.min(1, s * 1.4));
    const P = (t, x, v) => {
      const U = f(s, t + x);
      const V = f(s, t - x);
      return v.set((U - V) * 0.5 * view, (U + V) * 0.5 * view, 0);
    };
    // Parameter spacing that's fine near the middle and sparse far out.
    const param = (j) => {
      const q = (2 * j) / SAMPLES - 1;
      return EXTENT * Math.sign(q) * q * q;
    };

    lines.reset();
    for (const c of LINES) {
      const nowColor = c === 0 ? state.space : state.spaceDim;
      const clockColor = c === 0 ? state.time : state.timeDim;
      for (let j = 0; j < SAMPLES; j++) {
        lines.push(P(c, param(j), a), P(c, param(j + 1), b), nowColor); // t = c
        lines.push(P(param(j), c, a), P(param(j + 1), c, b), clockColor); // x = c
      }
    }
    // Light rays: t ± x = const, straight at 45° all along.
    for (const c of [-3, -1, 1, 3]) {
      for (const sign of [1, -1]) {
        for (let j = 0; j < SAMPLES; j++) {
          const w0 = param(j);
          const w1 = param(j + 1);
          lines.push(P(c / 2 + w0 / 2, sign * (c / 2 - w0 / 2), a), P(c / 2 + w1 / 2, sign * (c / 2 - w1 / 2), b), state.light);
        }
      }
    }
    // The diamond's edge, once it's nearly there.
    if (s > 0.95) {
      const k = Math.PI * 0.5 * view;
      const corners = [
        [0, k],
        [k, 0],
        [0, -k],
        [-k, 0],
      ];
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = corners[i];
        const [x1, y1] = corners[(i + 1) % 4];
        lines.push(a.set(x0, y0, 0), b.set(x1, y1, 0), state.edge);
      }
    }
    lines.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
  },
};
