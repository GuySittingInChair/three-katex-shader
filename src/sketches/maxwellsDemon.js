import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Maxwell's Demon (1867). A box of gas split by a wall with a tiny door. A demon watches each molecule arrive: it lets
// fast ones through to the right and slow ones through to the left, and bounces everything else. The right side
// heats up, the left cools, with no work done on the gas: the second law of thermodynamics, apparently, broken.
// The gas here: 160 hard discs (mass 1, k = 1, so a side's temperature is its mean kinetic energy, T = ⟨v²⟩/2 in 2-D)
// bouncing elastically off each other and the walls, starting at T = 1. "Fast" means faster than the starting median
// speed, √(2 ln 2) ≈ 1.18 for this 2-D gas.
// The gas's entropy is measured live (ideal 2-D gas: S/k = Σ over the sides of N ln(A/N) + N ln T, plus constants that
// cancel), and so is the demon's memory: one bit per decision (let through or bounce back).
// The resolution (Szilard 1929, Landauer 1961, Bennett 1982): a demon with a finite memory must eventually erase it,
// and erasing one bit produces at least k ln 2 of entropy. So the gas's entropy drop is never more than ln 2 per bit:
//     −ΔS_gas / k ≤ (bits recorded) × ln 2
// Both sides of that are shown; the right one wins by a mile.
// see docs/wiki/sketches/maxwellsDemon.md

const N = 160, RAD = 0.012, W = 2, H = 1, GAP = 0.06;
const RUN = 40, SUB = 4, DT = 0.0035;

function entropy(ps) {
  let s = 0;
  for (const side of [0, 1]) {
    const q = ps.filter((p) => (p.x < W / 2) === (side === 0));
    if (!q.length) continue;
    const T = q.reduce((t, p) => t + (p.vx * p.vx + p.vy * p.vy) / 2, 0) / q.length;
    s += q.length * Math.log(W / 2 / q.length) + q.length * Math.log(T);
  }
  return s;
}

function startGas(seed) {
  const r = rng(seed), ps = [];
  while (ps.length < N) {
    const x = RAD + r() * (W - 2 * RAD), y = RAD + r() * (H - 2 * RAD);
    if (Math.abs(x - W / 2) < 2 * RAD || ps.some((p) => Math.hypot(p.x - x, p.y - y) < 2.2 * RAD)) continue;
    // a 2-D Maxwell speed at T = 1: speed √(−2 ln u), random direction
    const v = Math.sqrt(-2 * Math.log(1 - r())), a = r() * TAU;
    ps.push({ x, y, vx: v * Math.cos(a), vy: v * Math.sin(a), flash: 0 });
  }
  const speeds = ps.map((p) => Math.hypot(p.vx, p.vy)).sort((p, q) => p - q);
  return { ps, vStar: speeds[N / 2], bits: 0, S0: entropy(ps), t: 0, door: 0 };
}

function stepGas(G) {
  const { ps } = G;
  for (const p of ps) {
    const ox = p.x;
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (p.x < RAD) { p.x = RAD; p.vx = Math.abs(p.vx); }
    if (p.x > W - RAD) { p.x = W - RAD; p.vx = -Math.abs(p.vx); }
    if (p.y < RAD) { p.y = RAD; p.vy = Math.abs(p.vy); }
    if (p.y > H - RAD) { p.y = H - RAD; p.vy = -Math.abs(p.vy); }
    // the dividing wall
    const crossed = (ox < W / 2) !== (p.x < W / 2);
    if (crossed) {
      let through = false;
      if (Math.abs(p.y - H / 2) < GAP) {
        // the demon decides: one bit of memory either way
        G.bits++;
        const fast = Math.hypot(p.vx, p.vy) > G.vStar, goingRight = p.vx > 0;
        through = goingRight ? fast : !fast;
        if (through) { G.door = 1; p.flash = 1; }
      }
      if (!through) { p.x = ox; p.vx = -p.vx; }
    }
    p.flash *= 0.95;
  }
  // collisions between discs: equal masses swap their velocity components along the line between centres
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = ps[i], b = ps[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 > 4 * RAD * RAD || (a.x < W / 2) !== (b.x < W / 2)) continue;
    const d = Math.sqrt(d2) || 1e-9, nx = dx / d, ny = dy / d, rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel >= 0) continue;                       // already moving apart
    a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny;
  }
  G.t += DT;
  G.door *= 0.9;
}

const LIVE = { TL: 1, TR: 1, NL: 0, NR: 0, bits: 0, dS: 0 };

export default {
  name: "Maxwell's Demon",
  description:
    'A box of gas with a wall and a tiny door, and a demon who only lets fast molecules go right and slow ones go left. ' +
    'One side heats up, the other cools, and the gas\'s entropy falls: the second law, broken? The demon has to remember ' +
    'every decision, and forgetting costs more entropy than it saved. Both tallies, live.',
  tags: ['thermodynamics', 'entropy', 'maxwells demon', 'landauer', 'information', 'statistical mechanics', 'humor'],
  category: 'Physics',
  mode: '3d',

  motion(t) {
    return { cyc: Math.floor(t / RUN), tRun: t % RUN };
  },

  latex: (params, hl, m) => {
    const L = LIVE;
    const line = m.tRun > RUN - 3 ? 'Memory full. Erasing it. Entropy collects.'
      : L.TR > L.TL * 1.05 ? 'Hot side hotter. The demon is pleased.' : 'Sorting. One bit per decision.';
    return (
      '\\begin{aligned}' +
      `T_{\\text{left}} &= ${hl(L.TL, 2)},\\quad T_{\\text{right}} = ${hl(L.TR, 2)} \\\\` +
      `-\\Delta S_{\\text{gas}}/k &= ${hl(L.dS, 1)} \\\\` +
      `\\text{bits} \\times \\ln 2 &= ${L.bits} \\times 0.693 = ${hl(L.bits * Math.LN2, 0)} \\\\` +
      `&-\\Delta S_{\\text{gas}}/k \\le \\text{bits}\\times\\ln 2\\quad (\\text{Landauer}) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.9 }), cyc: -1, gas: null };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    if (m.cyc !== state.cyc) { state.cyc = m.cyc; state.gas = startGas(m.cyc + 5); }
    const G = state.gas;
    const steps = Math.round(SUB * (ctx.params.speed ?? 1));
    for (let s = 0; s < steps; s++) stepGas(G);
    const left = G.ps.filter((p) => p.x < W / 2), right = G.ps.filter((p) => p.x >= W / 2);
    const temp = (q) => (q.length ? q.reduce((t, p) => t + (p.vx * p.vx + p.vy * p.vy) / 2, 0) / q.length : 0);
    Object.assign(LIVE, { TL: temp(left), TR: temp(right), NL: left.length, NR: right.length, bits: G.bits, dS: G.S0 - entropy(G.ps) });

    const sc = Math.min(a.w / (W * 1.05), (a.h * 0.8) / H), bx = a.x + (a.w - W * sc) / 2, by = a.y + (a.h * 0.8 - H * sc) / 2;
    const X = (x) => bx + x * sc, Y = (y) => by + (H - y) * sc;
    // each half tinted by its temperature: cool blue to hot orange
    const tint = (T) => { const u = Math.max(0, Math.min(1, (T - 0.7) / 0.6)); return `rgba(${Math.round(40 + 140 * u)},${Math.round(60 + 20 * u)},${Math.round(140 - 100 * u)},0.25)`; };
    g.fillStyle = tint(LIVE.TL); g.fillRect(X(0), Y(H), (W / 2) * sc, H * sc);
    g.fillStyle = tint(LIVE.TR); g.fillRect(X(W / 2), Y(H), (W / 2) * sc, H * sc);
    g.strokeStyle = 'rgba(200,210,230,0.8)'; g.lineWidth = 2; g.strokeRect(X(0), Y(H), W * sc, H * sc);
    // the wall and its door (glowing when it just opened)
    g.beginPath(); g.moveTo(X(W / 2), Y(H)); g.lineTo(X(W / 2), Y(H / 2 + GAP)); g.moveTo(X(W / 2), Y(H / 2 - GAP)); g.lineTo(X(W / 2), Y(0)); g.stroke();
    g.strokeStyle = `rgba(255,220,120,${0.2 + 0.8 * G.door})`; g.lineWidth = 3;
    g.beginPath(); g.moveTo(X(W / 2), Y(H / 2 + GAP)); g.lineTo(X(W / 2), Y(H / 2 - GAP)); g.stroke();
    // the molecules, coloured by speed
    for (const p of G.ps) {
      const v = Math.hypot(p.vx, p.vy), u = Math.min(1, v / 2.5);
      g.fillStyle = p.flash > 0.2 ? 'rgb(255,255,255)' : `rgb(${Math.round(80 + 175 * u)},${Math.round(150 + 40 * u - 60 * u * u)},${Math.round(255 - 200 * u)})`;
      g.beginPath(); g.arc(X(p.x), Y(p.y), Math.max(2, RAD * sc), 0, TAU); g.fill();
    }
    // the demon, perched on the wall: two eyes that look at the door
    const dx = X(W / 2), dy = Y(H) - 16;
    g.fillStyle = 'rgb(200,60,90)'; g.beginPath(); g.arc(dx, dy, 10, 0, TAU); g.fill();
    g.fillStyle = 'white'; [-4, 4].forEach((o) => { g.beginPath(); g.arc(dx + o, dy + 1, 3, 0, TAU); g.fill(); });
    g.fillStyle = 'black'; [-4, 4].forEach((o) => { g.beginPath(); g.arc(dx + o, dy + 2.5, 1.4, 0, TAU); g.fill(); });
    // its notebook: one tick per bit, in rows
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.8)'; g.textAlign = 'left';
    g.fillText(`the demon's memory: ${G.bits} bits`, X(0), Y(0) + 18);
    const per = 120, nb = Math.min(G.bits, per * 6);
    g.fillStyle = 'rgba(255,220,120,0.7)';
    for (let q = 0; q < nb; q++) g.fillRect(X(0) + (q % per) * ((W * sc) / per), Y(0) + 24 + Math.floor(q / per) * 4, Math.max(1, (W * sc) / per - 1), 2.5);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
