import * as THREE from 'three';
import { phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// The brachistochrone race. Three beads start at rest at A = (0, 0) and slide
// without friction to B = (π, −2) along different wires. A bead that has
// dropped h has speed √(2gh), so a wire's travel time is
//
//     T = ∫ ds / √(2gh)
//
// computed here numerically along each wire (g = 1, so it runs in slow
// motion). The cycloid x = r(θ − sin θ), y = −r(1 − cos θ) with r = 1 is the
// fastest possible path: T = π√(r/g) = 3.14. The straight line is shortest but
// slowest (3.72). "Drop and glide" (a quarter circle straight down, then
// flat) leads for most of the race and still loses, by 0.05 (3.19).
// The integration was checked against both exact answers.
//
// Loop: a short pause, the race, then the finish times, and again.

const G = 1;
const A = [0, 0];
const B = [Math.PI, -2];
const TABLE = 40000;
const LEAD = 0.8;
const HOLD = 2.6;

const WIRES = [
  {
    name: 'cycloid',
    color: 0x7cfc93,
    at: (u) => {
      const th = Math.PI * u;
      return [th - Math.sin(th), -(1 - Math.cos(th))];
    },
  },
  {
    name: 'drop and glide',
    color: 0xff9f5a,
    at: (u) => {
      const arc = Math.PI;
      const flat = Math.PI - 2;
      const d = u * (arc + flat);
      if (d < arc) {
        const a = d / 2;
        return [2 - 2 * Math.cos(a), -2 * Math.sin(a)];
      }
      return [2 + (d - arc), -2];
    },
  },
  { name: 'straight line', color: 0x7cc4ff, at: (u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u] },
];

// Time taken to reach each of TABLE + 1 evenly spaced parameter values.
function timeTable(at) {
  const ts = new Float64Array(TABLE + 1);
  let prev = at(0);
  for (let i = 1; i <= TABLE; i++) {
    const cur = at(i / TABLE);
    const mid = at((i - 0.5) / TABLE);
    const ds = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    ts[i] = ts[i - 1] + ds / Math.sqrt(2 * G * Math.max(-mid[1], 1e-12));
    prev = cur;
  }
  return ts;
}
for (const w of WIRES) {
  w.ts = timeTable(w.at);
  w.T = w.ts[TABLE];
}
const RACE = Math.max(...WIRES.map((w) => w.T));
const PERIOD = LEAD + RACE + HOLD;

function positionAt(wire, t) {
  if (t >= wire.T) return wire.at(1);
  const ts = wire.ts;
  let lo = 0;
  let hi = TABLE;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - ts[lo]) / (ts[hi] - ts[lo]);
  return wire.at((lo + f) / TABLE);
}

const OFFSET = [-Math.PI / 2, 1];
const SCALE = 1.7;
const toScene = ([x, y], v) => v.set((x + OFFSET[0]) * SCALE, (y + OFFSET[1]) * SCALE, 0);

export default {
  name: 'Brachistochrone Race',
  description:
    'Three beads race from the same point to the same point along different frictionless wires. The straight ' +
    'line is shortest and slowest, a steep drop leads most of the way and still loses, and the cycloid, the ' +
    'fastest possible path, wins. The race clock and each finish time are shown live.',
  tags: ['physics', 'calculus of variations', 'cycloid', 'gravity'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    return { t: Math.max(0, p * PERIOD - LEAD) };
  },

  latex: (params, hl, m) => {
    const finish = (w) => (m.t >= w.T ? hl(w.T, 2) : '\\cdots');
    return (
      '\\begin{aligned}' +
      'T &= \\int \\frac{ds}{\\sqrt{2gh}},\\quad \\text{cycloid: } x = r(\\theta - \\sin\\theta),\\ y = -r(1-\\cos\\theta) \\\\' +
      `t &= ${hl(Math.min(m.t, RACE), 2)}:\\quad \\text{cycloid } ${finish(WIRES[0])},\\ \\text{drop and glide } ${finish(
        WIRES[1]
      )},\\ \\text{line } ${finish(WIRES[2])}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, -0.2, 6);
    const wires = createFatLines({ maxSegments: WIRES.length * 200 + 2, width: 2.2 });
    const beads = createDots({ maxPoints: WIRES.length + 2 });
    ctx.scene.add(wires.object, beads.object);
    const colors = WIRES.map((w) => new THREE.Color(w.color));
    return { wires, beads, colors, a: new THREE.Vector3(), b: new THREE.Vector3(), mark: new THREE.Color(0xdfe6ee) };
  },

  update(ctx, state) {
    const { wires, beads, colors, a, b } = state;
    const { width, height } = ctx.size;
    wires.setResolution(width, height);
    beads.setCamera(ctx.camera, height);

    wires.reset();
    WIRES.forEach((w, i) => {
      const dim = colors[i].clone().multiplyScalar(0.45);
      let prev = toScene(w.at(0), a).clone();
      for (let j = 1; j <= 200; j++) {
        toScene(w.at(j / 200), b);
        wires.push(prev, b, dim);
        prev.copy(b);
      }
    });
    wires.commit();

    beads.reset();
    beads.push(toScene(A, a), state.mark, 0.06);
    beads.push(toScene(B, a), state.mark, 0.06);
    WIRES.forEach((w, i) => {
      beads.push(toScene(positionAt(w, ctx.motion.t), a), colors[i], 0.13);
    });
    beads.commit();
  },

  dispose(ctx, state) {
    state.wires.dispose();
    state.beads.dispose();
  },
};
