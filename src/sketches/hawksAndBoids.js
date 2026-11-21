import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Hawks and Boids. Craig Reynolds's flocking rules (1987): each bird ("boid") looks only at neighbours within a
// short range and steers by three rules,
//     separation: don't crowd them;   alignment: fly the way they fly;   cohesion: drift towards their middle,
// and a flock appears with no leader. Here three hawks hunt it. A boid that sees a hawk (within 3 times its normal
// range) adds a fourth, stronger rule: flee, straight away from it. Each hawk chases the nearest boid, a little
// faster than a boid can fly but worse at turning; it catches anything it touches, and the caught boid rejoins at a
// random edge (no boids are harmed in the making of this equation).
// Live, measured from the simulation: polarisation, |average heading| (1 = everyone flying the same way, 0 = all
// directions), and how many boids are caught. Watch the flock split around a hawk and close up behind it: the
// "fountain" escape seen in real fish schools.
// see docs/wiki/sketches/hawksAndBoids.md

const NB = 260, NH = 3;
const W = 16, H = 10;                                   // world size; it wraps round at the edges
const R = 0.75, SEP = 0.32;                             // neighbour range, personal space
const VMAX = 2.2, HAWK_V = 2.6, TURN = 3.2, HAWK_TURN = 1.6;
const K = { sep: 2.2, ali: 1.0, coh: 0.6, flee: 6.0 };

function start(seed) {
  const r = rng(seed);
  const boid = () => { const a = r() * TAU; return { x: r() * W, y: r() * H, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5 }; };
  return { r, boids: Array.from({ length: NB }, boid), hawks: Array.from({ length: NH }, boid), caught: 0, t: 0, flash: [] };
}
const wrapD = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
function steer(o, ax, ay, vmax, turn, dt) {
  o.vx += Math.max(-turn, Math.min(turn, ax)) * dt; o.vy += Math.max(-turn, Math.min(turn, ay)) * dt;
  const v = Math.hypot(o.vx, o.vy) || 1e-9;
  if (v > vmax) { o.vx *= vmax / v; o.vy *= vmax / v; }
  if (v < vmax * 0.4) { o.vx *= (vmax * 0.4) / v; o.vy *= (vmax * 0.4) / v; }
  o.x = (o.x + o.vx * dt + W) % W; o.y = (o.y + o.vy * dt + H) % H;
}
function stepWorld(S, dt) {
  const { boids, hawks } = S;
  for (const b of boids) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0, fx = 0, fy = 0;
    for (const o of boids) {
      if (o === b) continue;
      const dx = wrapD(o.x - b.x, W), dy = wrapD(o.y - b.y, H), d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      n++; ax += o.vx; ay += o.vy; cx += dx; cy += dy;
      if (d2 < SEP * SEP) { const d = Math.sqrt(d2) || 1e-6; sx -= dx / d / d; sy -= dy / d / d; }
    }
    for (const h of hawks) {
      const dx = wrapD(h.x - b.x, W), dy = wrapD(h.y - b.y, H), d = Math.hypot(dx, dy);
      if (d < 3 * R) { fx -= (dx / d) * (3 * R - d); fy -= (dy / d) * (3 * R - d); }
    }
    let gx = K.sep * sx * 0.05 + K.flee * fx, gy = K.sep * sy * 0.05 + K.flee * fy;
    if (n) { gx += K.ali * (ax / n - b.vx) + K.coh * (cx / n); gy += K.ali * (ay / n - b.vy) + K.coh * (cy / n); }
    steer(b, gx, gy, VMAX, TURN * 4, dt);
  }
  for (const h of hawks) {
    let best = null, bd = Infinity;
    for (const b of boids) { const dx = wrapD(b.x - h.x, W), dy = wrapD(b.y - h.y, H), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [dx, dy, b]; } }
    if (!best) continue;
    const [dx, dy, prey] = best, d = Math.sqrt(bd) || 1e-6;
    steer(h, (dx / d) * HAWK_V * 3 - h.vx, (dy / d) * HAWK_V * 3 - h.vy, HAWK_V, HAWK_TURN * 4, dt);
    if (d < 0.12) {
      S.caught++;
      S.flash.push({ x: prey.x, y: prey.y, t: S.t });
      const edge = S.r() < 0.5;
      prey.x = edge ? 0 : S.r() * W; prey.y = edge ? S.r() * H : 0;
    }
  }
  S.t += dt;
  S.flash = S.flash.filter((f) => S.t - f.t < 0.8);
}

const LIVE = { pol: 0, caught: 0, minutes: 0 };

export default {
  name: 'Hawks and Boids',
  description:
    'Two hundred and sixty birds following three simple rules (don\'t crowd, fly the same way, stay together) make a ' +
    'flock with no leader. Add three hawks, and a fourth rule for the birds: flee. The flock splits around each attack ' +
    'and closes up behind it. Reynolds\'s boids, with predators.',
  tags: ['emergence', 'boids', 'flocking', 'predator prey', 'agent-based', 'collective behaviour'],
  category: 'Emergence',
  mode: '3d',

  motion(t) {
    return { t };
  },

  latex: (params, hl) =>
    '\\begin{aligned}' +
    '\\dot{\\mathbf v} &= k_s\\,\\text{separate} + k_a\\,\\text{align} + k_c\\,\\text{cohere} + k_f\\,\\text{flee} \\\\' +
    `\\text{polarisation} &= \\left|\\langle \\hat{\\mathbf v} \\rangle\\right| = ${hl(LIVE.pol, 2)} \\\\` +
    `\\text{caught} &= ${hl(LIVE.caught, 0)} \\\\` +
    `& ${caption(LIVE.pol > 0.8 ? 'Flying as one. The hawks find this rude.' : LIVE.pol < 0.4 ? 'Scattered. Every bird for itself, briefly.' : 'Splitting and regrouping around the hawks.')}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.8 }), world: start(4) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const a = state.stage.area, S = state.world;
    const dt = Math.min(0.05, ctx.delta) * (ctx.params.speed ?? 1);
    for (let k = 0; k < 2; k++) stepWorld(S, dt / 2);
    let hx = 0, hy = 0;
    for (const b of S.boids) { const v = Math.hypot(b.vx, b.vy) || 1; hx += b.vx / v; hy += b.vy / v; }
    LIVE.pol = Math.hypot(hx, hy) / NB; LIVE.caught = S.caught;

    const sc = Math.min(a.w / W, a.h / H), ox = a.x + (a.w - W * sc) / 2, oy = a.y + (a.h - H * sc) / 2;
    g.strokeStyle = 'rgba(120,140,190,0.25)'; g.lineWidth = 1; g.strokeRect(ox, oy, W * sc, H * sc);
    // boids: small arrows, coloured by heading
    for (const b of S.boids) {
      const v = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / v, uy = b.vy / v, x = ox + b.x * sc, y = oy + b.y * sc, s = sc * 0.11;
      const hue = Math.atan2(uy, ux);
      g.fillStyle = `rgb(${Math.round(150 + 100 * Math.cos(hue))},${Math.round(190 + 60 * Math.cos(hue - 2.1))},${Math.round(220 + 35 * Math.cos(hue + 2.1))})`;
      g.beginPath(); g.moveTo(x + ux * s * 1.6, y + uy * s * 1.6); g.lineTo(x - ux * s - uy * s * 0.7, y - uy * s + ux * s * 0.7); g.lineTo(x - ux * s + uy * s * 0.7, y - uy * s - ux * s * 0.7); g.closePath(); g.fill();
    }
    // hawks: bigger, red, with their hunting range
    for (const h of S.hawks) {
      const v = Math.hypot(h.vx, h.vy) || 1, ux = h.vx / v, uy = h.vy / v, x = ox + h.x * sc, y = oy + h.y * sc, s = sc * 0.28;
      g.strokeStyle = 'rgba(255,90,80,0.18)'; g.beginPath(); g.arc(x, y, 3 * R * sc, 0, TAU); g.stroke();
      g.fillStyle = 'rgb(255,90,70)';
      g.beginPath(); g.moveTo(x + ux * s * 1.6, y + uy * s * 1.6); g.lineTo(x - ux * s - uy * s * 0.9, y - uy * s + ux * s * 0.9); g.lineTo(x - ux * s * 0.4, y - uy * s * 0.4); g.lineTo(x - ux * s + uy * s * 0.9, y - uy * s - ux * s * 0.9); g.closePath(); g.fill();
    }
    for (const f of S.flash) {
      const u = (S.t - f.t) / 0.8;
      g.strokeStyle = `rgba(255,230,160,${1 - u})`; g.lineWidth = 2;
      g.beginPath(); g.arc(ox + f.x * sc, oy + f.y * sc, 4 + u * 20, 0, TAU); g.stroke();
    }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
