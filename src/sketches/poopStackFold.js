import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// A tower of poops on a springy hinge, on a base you slowly tilt back and
// forth: a fold catastrophe, with hysteresis. Let θ be the tower's lean
// relative to the base and α the base's tilt, so the tower leans θ + α
// from vertical. In units of the hinge stiffness k, its energy is
//
//     V(θ) = ½ θ² + λ cos(θ + α),    λ = mgh / k
//
// (spring, plus the height of its centre of mass). It rests where
// V′(θ) = θ − λ sin(θ + α) = 0 and that rest is stable while
// V″(θ) = 1 − λ cos(θ + α) > 0. This tower is top-heavy (λ = 1.2 > 1), so
// upright is unstable and it leans to one side. Tilt the base against the
// lean and the resting point slides up the side of its well until, at
//
//     |α| = √(λ² − 1) − arccos(1/λ) = 4.45°      (where V′ = V″ = 0)
//
// the well disappears and the tower snaps over to the other side (formula
// checked against tracking the equilibrium numerically, to 5 decimals). To
// snap back you have to tilt past −4.45°: the jumps happen at different
// places going and coming back, which is hysteresis.
//
// Left: the tower. Top right: V(θ) right now (stretched vertically to fit;
// the wells are shallow), with the ball at the tower's θ. Bottom right: every resting lean θ against the tilt α (stable solid,
// unstable dim), the S-curve whose two folds are the snaps. Between snaps
// the tower is simulated as a damped spring (it wobbles), so the readouts
// are live. Loop (20 s): the base tilts to ±11.5° and back.

const PERIOD = 20;
const LAMBDA = 1.2;
const TILT = 0.2;
const FOLD = Math.sqrt(LAMBDA ** 2 - 1) - Math.acos(1 / LAMBDA); // 0.0776 rad
const POOPS = 4;
const OMEGA = 5; // wobble rate, rad/s
const DAMP = 3;

const V = (th, a) => 0.5 * th * th + LAMBDA * Math.cos(th + a);
const curvature = (th, a) => 1 - LAMBDA * Math.cos(th + a);

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
  return tex;
}

export default {
  name: 'Poop Tower Catastrophe',
  description:
    'A top-heavy tower of poops on a springy hinge, on a base that slowly tilts. The tower clings to its lean ' +
    'until its energy well vanishes at a 4.45° tilt (a fold catastrophe), then snaps over, and won’t snap back ' +
    'until you tilt past the other fold: hysteresis. Its energy landscape and the S-shaped fold diagram are live.',
  tags: ['catastrophe theory', 'fold', 'bifurcation', 'hysteresis', 'stability', 'poop'],
  category: 'Dynamical Systems',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const alpha = TILT * Math.sin(TAU * phaseOf(t, PERIOD));
    // The tower's lean comes from the simulation in update(); placeholders here.
    return { alpha, theta: 0, curv: 1 };
  },

  latex: (params, hl, m) => {
    const deg = (x) => (x * 180) / Math.PI;
    const warn = m.curv < 0 ? ' \\quad \\textcolor{#ff6b6b}{\\text{snapping!}}' : m.curv < 0.12 ? ' \\quad \\textcolor{#ff6b6b}{\\text{about to snap}}' : '';
    return (
      '\\begin{aligned}' +
      `V(\\theta) &= \\tfrac12\\theta^2 + \\lambda\\cos(\\theta+\\alpha),\\quad \\lambda = \\tfrac{mgh}{k} = ${LAMBDA} \\\\` +
      `\\alpha &= ${hl(deg(m.alpha), 1)}^\\circ,\\quad \\theta = ${hl(deg(m.theta), 1)}^\\circ,\\quad V''(\\theta) = ${hl(m.curv, 3)}${warn} \\\\` +
      `\\text{snaps at } |\\alpha| &= \\sqrt{\\lambda^2-1} - \\arccos\\tfrac1\\lambda = ${hl(deg(FOLD), 2)}^\\circ` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8);
    const lines = createFatLines({ maxSegments: 900, width: 2 });
    const thick = createFatLines({ maxSegments: 4, width: 7 });
    const dots = createDots({ maxPoints: 8 });
    const tex = poopTexture();
    const sprites = [];
    for (let i = 0; i < POOPS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      s.scale.set(0.72, 0.72, 1);
      sprites.push(s);
      ctx.scene.add(s);
    }
    ctx.scene.add(lines.object, thick.object, dots.object);
    // Start resting on its right-hand lean.
    let th = 1;
    for (let i = 0; i < 50; i++) th -= (th - LAMBDA * Math.sin(th)) / (1 - LAMBDA * Math.cos(th));
    return {
      lines,
      thick,
      dots,
      tex,
      sprites,
      th,
      om: 0,
      aspect: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      axis: new THREE.Color(0x3a4254),
      plate: new THREE.Color(0x8d96a8),
      spring: new THREE.Color(0x7cc4ff),
      curve: new THREE.Color(0x7cc4ff),
      stable: new THREE.Color(0xffd166),
      unstable: new THREE.Color(0xffd166).multiplyScalar(0.3),
      fold: new THREE.Color(0xef6fa0),
      ball: new THREE.Color(0xef6fa0),
    };
  },

  update(ctx, state) {
    const { lines, thick, dots, a, b } = state;
    const m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    thick.setResolution(width, height);
    dots.setCamera(ctx.camera, height);
    const aspect = width / height;
    if (aspect !== state.aspect) {
      state.aspect = aspect;
      const tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
      ctx.camera.position.setLength(Math.max(3.8, 4.3 / aspect) / tan);
    }

    // The tower: a damped spring in its potential, a few small steps per frame.
    const dt = Math.min(0.05, ctx.delta) * (ctx.params.speed ?? 1);
    const n = Math.max(1, Math.ceil(dt / 0.004));
    for (let i = 0; i < n; i++) {
      const acc = -OMEGA * OMEGA * (state.th - LAMBDA * Math.sin(state.th + m.alpha)) - DAMP * state.om;
      state.om += acc * (dt / n);
      state.th += state.om * (dt / n);
    }
    m.theta = state.th;
    m.curv = curvature(state.th, m.alpha);

    // ---- The tower, on the left.
    const px = -2.25;
    const py = -1.7;
    const lean = state.th + m.alpha; // from vertical
    thick.reset();
    const ca = Math.cos(m.alpha);
    const sa = Math.sin(m.alpha);
    thick.push(a.set(px - 1.3 * ca, py + 1.3 * sa, 0), b.set(px + 1.3 * ca, py - 1.3 * sa, 0), state.plate);
    thick.commit();
    lines.reset();
    // The hinge spring: a little zigzag at the foot.
    for (let k = 0; k < 6; k++) {
      const x0 = px - 0.18 + k * 0.06;
      lines.push(a.set(x0, py + (k % 2 ? 0.1 : 0.02), 0), b.set(x0 + 0.06, py + (k % 2 ? 0.02 : 0.1), 0), state.spring);
    }
    state.sprites.forEach((s, i) => {
      const r = 0.36 + i * 0.58;
      s.position.set(px + r * Math.sin(lean), py + 0.06 + r * Math.cos(lean), 0.01 * i);
      s.material.rotation = -lean;
    });

    // ---- Top right: the energy landscape right now.
    const X0 = 0.4;
    const XW = 3.4;
    const thetaRange = 1.7;
    const VY0 = 0.15;
    const VS = 0.75;
    const Vx = (th) => X0 + ((th + thetaRange) / (2 * thetaRange)) * XW;
    lines.push(a.set(X0, VY0, 0), b.set(X0 + XW, VY0, 0), state.axis);
    // The wells are shallow, so the plot is stretched to fill its box (only the shape matters).
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i <= 120; i++) {
      const v = V(-thetaRange + (2 * thetaRange * i) / 120, m.alpha);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const Vy = (v) => VY0 + 0.15 + (VS * 1.6 * (v - vmin)) / (vmax - vmin);
    let prev = null;
    for (let i = 0; i <= 120; i++) {
      const th = -thetaRange + (2 * thetaRange * i) / 120;
      const y = Vy(V(th, m.alpha));
      if (prev) lines.push(a.set(prev[0], prev[1], 0), b.set(Vx(th), y, 0), state.curve);
      prev = [Vx(th), y];
    }
    dots.reset();
    dots.push(a.set(Vx(state.th), Vy(V(state.th, m.alpha)) + 0.1, 0), state.ball, 0.09);

    // ---- Bottom right: resting leans θ against the tilt α (the S-curve and its folds).
    const BY = -1.55;
    const BH = 1.0; // half-height, for θ ∈ [−λ, λ]
    const Bx = (al) => X0 + XW / 2 + (al / (TILT * 1.15)) * (XW / 2);
    const By = (th) => BY + (th / LAMBDA) * BH;
    lines.push(a.set(X0, BY, 0), b.set(X0 + XW, BY, 0), state.axis);
    lines.push(a.set(Bx(0), BY - BH, 0), b.set(Bx(0), BY + BH, 0), state.axis);
    prev = null;
    for (let i = 0; i <= 200; i++) {
      const th = -LAMBDA + (2 * LAMBDA * i) / 200;
      const al = Math.asin(Math.max(-1, Math.min(1, th / LAMBDA))) - th; // resting tilt for this lean
      const ok = Math.abs(al) <= TILT * 1.15;
      if (prev && ok && prev[2]) {
        const c = curvature(th, al) > 0 ? state.stable : state.unstable;
        lines.push(a.set(prev[0], prev[1], 0), b.set(Bx(al), By(th), 0), c);
      }
      prev = [Bx(al), By(th), ok];
    }
    // The folds, and where we are.
    const thF = Math.sqrt(LAMBDA ** 2 - 1);
    dots.push(a.set(Bx(-FOLD), By(thF), 0), state.fold, 0.07);
    dots.push(a.set(Bx(FOLD), By(-thF), 0), state.fold, 0.07);
    dots.push(a.set(Bx(m.alpha), By(state.th), 0), state.ball, 0.09);
    lines.commit();
    dots.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.thick.dispose();
    state.dots.dispose();
    state.tex.dispose();
    state.sprites.forEach((s) => s.material.dispose());
  },
};
