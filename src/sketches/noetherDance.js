import * as THREE from 'three';
import { TAU } from '../lib/motion.js';

// A robot floating in empty space, dancing, with nothing to push against.
// Space looks the same in every direction, so by Noether's theorem its
// angular momentum about its centre of mass is conserved, and it started
// at L = 0:
//
//     L = θ̇ I(ψ) + Σ mₖ (qₖ × q̇ₖ) = 0      (qₖ: body and hands, relative to the centre of mass)
//
// so whenever the arms swing one way, the body turns the other:
//
//     θ̇ = −Σ mₖ (qₖ × q̇ₖ) / I(ψ)
//
// Here's the joke: L stays exactly 0, but the robot still turns. Because
// I(ψ) changes as the arms move, a dance move that ends where it started
// leaves the body rotated (the trick a falling cat uses to land on its
// feet, and astronauts use to turn around). The move's size is tuned when
// the sketch loads, by bisection, so that 24 moves make exactly one full
// turn. Checked separately in the world frame: L = 0 and the total momentum
// is 0, to the accuracy of a finite difference (10⁻¹¹).
//
// Model: a body (mass 4, own inertia 0.5) with two heavy hands (mass 1
// each) on massless arms of length 0.9, shoulders at (±0.55, 0.25).
// Loop (36 s): 24 moves, one full turn.

const MOVES = 24;
const MOVE = 1.5; // seconds per dance move
const PERIOD = MOVES * MOVE;
const MB = 4;
const IB = 0.5;
const MH = 1;
const ARM = 0.9;
const SH = [
  [-0.55, 0.25],
  [0.55, 0.25],
];

// Joint angles (body frame) during a move, u ∈ [0, 2π): the arms trace a loop.
const joints = (u, A) => [Math.PI + A * Math.sin(u), A * Math.cos(u)];

// Body-frame positions of the body centre and both hands, relative to the centre of mass.
function config(u, A) {
  const [a0, a1] = joints(u, A);
  const h0 = [SH[0][0] + ARM * Math.cos(a0), SH[0][1] + ARM * Math.sin(a0)];
  const h1 = [SH[1][0] + ARM * Math.cos(a1), SH[1][1] + ARM * Math.sin(a1)];
  const M = MB + 2 * MH;
  const cx = (MH * (h0[0] + h1[0])) / M;
  const cy = (MH * (h0[1] + h1[1])) / M;
  return [
    [-cx, -cy],
    [h0[0] - cx, h0[1] - cy],
    [h1[0] - cx, h1[1] - cy],
  ];
}
const MASSES = [MB, MH, MH];

// The two halves of L (per unit u): spin = θ' I(ψ), dance = Σ m q × q'.
function momentum(u, A) {
  const h = 1e-5;
  const a = config(u - h, A);
  const b = config(u + h, A);
  const q = config(u, A);
  let I = IB;
  let dance = 0;
  for (let k = 0; k < 3; k++) {
    const vx = (b[k][0] - a[k][0]) / (2 * h);
    const vy = (b[k][1] - a[k][1]) / (2 * h);
    I += MASSES[k] * (q[k][0] ** 2 + q[k][1] ** 2);
    dance += MASSES[k] * (q[k][0] * vy - q[k][1] * vx);
  }
  return { I, dance, rate: -dance / I };
}

// θ over one move (Simpson's rule), and the net turn.
const STEPS = 480;
function integrate(A) {
  const table = new Float64Array(STEPS + 1);
  const du = TAU / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const u = i * du;
    table[i + 1] = table[i] + (du / 6) * (momentum(u, A).rate + 4 * momentum(u + du / 2, A).rate + momentum(u + du, A).rate);
  }
  return table;
}

// Tune the move so that MOVES of them make exactly one turn.
let lo = 0.5;
let hi = 2.2;
const goal = TAU / MOVES;
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2;
  const t = integrate(mid);
  if (Math.abs(t[STEPS]) < goal) lo = mid;
  else hi = mid;
}
const AMP = (lo + hi) / 2;
const TABLE = integrate(AMP);
const PER_MOVE = TABLE[STEPS];

export default {
  name: 'Noether’s Dancing Robot',
  description:
    'A robot dancing in empty space with nothing to push on. Noether’s theorem says its angular momentum stays ' +
    '0, and it does, exactly: every swing of the arms is cancelled by the body. Yet each dance move leaves it ' +
    'turned 15°, the falling-cat trick, so 24 moves make a full turn. Both halves of L are shown live.',
  tags: ['noether', 'angular momentum', 'conservation', 'geometric phase', 'falling cat', 'robots'],
  category: 'Physics',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = (((t / PERIOD) % 1) + 1) % 1;
    const n = Math.floor(p * MOVES);
    const f = p * MOVES - n;
    const u = TAU * f;
    const i = Math.min(STEPS - 1, Math.floor(f * STEPS));
    const w = f * STEPS - i;
    const theta = n * PER_MOVE + TABLE[i] * (1 - w) + TABLE[i + 1] * w;
    const m = momentum(u, AMP);
    const perSecond = TAU / MOVE; // du/dt
    const spin = m.rate * perSecond * m.I;
    const dance = m.dance * perSecond;
    const deg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
    return { u, theta, n, spin, dance, total: spin + dance, deg: deg > 359.95 ? 0 : deg };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'L &= \\underbrace{\\dot\\theta\\, I(\\psi)}_{\\text{spin}} + \\underbrace{\\textstyle\\sum_k m_k\\, \\vec q_k \\times \\dot{\\vec q}_k}_{\\text{dance}} = 0 \\quad\\text{(Noether)} \\\\' +
    `\\text{spin} &= ${hl(m.spin, 3)},\\quad \\text{dance} = ${hl(m.dance, 3)},\\quad L = ${hl(m.total, 3)} \\\\` +
    `\\theta &= ${hl(m.deg, 1)}^\\circ,\\quad \\text{move } ${m.n + 1}/${MOVES},\\quad \\Delta\\theta_{\\text{move}} = ${hl((Math.abs(PER_MOVE) * 180) / Math.PI, 3)}^\\circ` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uTheta;
    uniform vec2 uBody;
    uniform vec2 uHand0;
    uniform vec2 uHand1;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }
    float box(vec2 p, vec2 h, float r) {
      vec2 d = abs(p) - h + r;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    float segment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
    }
    vec2 rot(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float fit = max(1.0, 0.8 * uResolution.y / uResolution.x);
      vec2 x = uv * 5.0 * fit + vec2(0.0, -0.15);   // world units; the centre of mass is at 0
      float px = 5.0 * fit / uResolution.y;

      // Fixed stars, so you can see it turn.
      vec2 sq = uv * 40.0;
      vec3 col = vec3(0.01, 0.012, 0.022) + vec3(0.7, 0.75, 0.9) * step(0.975, hash(floor(sq))) * smoothstep(0.35, 0.0, length(fract(sq) - 0.5)) * 0.5;
      // The centre of mass: a faint cross.
      col += vec3(0.3) * smoothstep(px, 0.0, min(abs(x.x), abs(x.y))) * step(max(abs(x.x), abs(x.y)), 0.12);

      // Arms (drawn in the world frame from the shoulders to the hands).
      vec2 s0 = uBody + rot(vec2(-0.55, 0.25), uTheta);
      vec2 s1 = uBody + rot(vec2(0.55, 0.25), uTheta);
      float arms = min(segment(x, s0, uHand0), segment(x, s1, uHand1)) - 0.05;
      col = mix(col, vec3(0.55, 0.6, 0.68), smoothstep(px, -px, arms));

      // The body, in its own frame.
      vec2 p = rot(x - uBody, -uTheta);
      float stalk = box(p - vec2(0.0, 0.62), vec2(0.03, 0.14), 0.02);
      float bulb = length(p - vec2(0.0, 0.8)) - 0.08;
      col = mix(col, vec3(0.6, 0.65, 0.72), smoothstep(px, -px, stalk));
      col = mix(col, vec3(0.95, 0.3, 0.25), smoothstep(px, -px, bulb));
      float head = box(p, vec2(0.55, 0.48), 0.14);
      vec3 metal = mix(vec3(0.5, 0.55, 0.63), vec3(0.85, 0.88, 0.93), smoothstep(-0.5, 0.5, p.y));
      col = mix(col, metal, smoothstep(px, -px, head));
      col = mix(col, vec3(0.2, 0.23, 0.3), smoothstep(2.0 * px, 0.0, abs(head)));
      float eyes = min(box(p - vec2(-0.22, 0.14), vec2(0.11, 0.1), 0.04), box(p - vec2(0.22, 0.14), vec2(0.11, 0.1), 0.04));
      col = mix(col, vec3(0.37, 0.95, 1.0), smoothstep(px, -px, eyes));
      float mouth = box(p - vec2(0.0, -0.2), vec2(0.28, 0.08), 0.03);
      float gaps = smoothstep(px * 2.0, 0.0, abs(fract((p.x + 0.28) * 7.0) - 0.5) / 7.0);
      col = mix(col, mix(vec3(0.9, 0.93, 0.96), vec3(0.25, 0.28, 0.35), gaps), smoothstep(px, -px, mouth));

      // Heavy hands.
      float hands = min(length(x - uHand0), length(x - uHand1)) - 0.14;
      col = mix(col, vec3(1.0, 0.82, 0.4), smoothstep(px, -px, hands));

      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uTheta: { value: 0 },
      uBody: { value: new THREE.Vector2() },
      uHand0: { value: new THREE.Vector2() },
      uHand1: { value: new THREE.Vector2() },
    };
  },

  update(ctx, state) {
    const u = state.uniforms;
    const m = ctx.motion;
    const q = config(m.u, AMP);
    const c = Math.cos(m.theta);
    const s = Math.sin(m.theta);
    const world = (v, out) => out.set(c * v[0] - s * v[1], s * v[0] + c * v[1]);
    world(q[0], u.uBody.value);
    world(q[1], u.uHand0.value);
    world(q[2], u.uHand1.value);
    u.uTheta.value = m.theta;
  },
};
