import { TAU, smooth } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Cascading Blackout. A toy power grid: 7 power stations and 17 towns joined by 43 lines. Every machine on an AC
// grid spins in step with the 50 Hz rhythm; each node here has a phase angle θ and a speed ω (its frequency
// minus 50 Hz), and obeys the swing equation (the standard "Kuramoto-like" grid model, Filatrella et al. 2008):
//     dθᵢ/dt = ωᵢ,   dωᵢ/dt = Pᵢ − α ωᵢ − Σⱼ K sin(θᵢ − θⱼ)        (Pᵢ: +1 a station, −7/17 a town)
// Power flows along a line in proportion to sin(θᵢ − θⱼ). Each line has a capacity: its normal flow times the
// "spare capacity" slider. A protection relay opens a line that stays over capacity for 0.3 s.
// At 4 s the busiest line fails. Its power has to go some other way, overloading neighbours, which fail too …
// Islands cut off with more stations than towns speed up; islands with more towns slow down: blackout.
// Checked in Node (same grid, same numbers): spare capacity 1.4 → 15 of 43 lines lost; 2 → 8; 3 → only the
// first one. Units are scaled (K = 2.2, α = 0.6); the cascade, not the megawatts, is the point.
// see docs/wiki/sketches/cascadingBlackout.md

const K = 2.2, ALPHA = 0.6, DT = 0.01, TRIP_AT = 4, RELAY = 0.3, RUN = 30;

function makeGrid(seed) {
  const r = rng(seed), C = 6, R = 4, nodes = [], edges = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) nodes.push({ x: x + (r() - 0.5) * 0.5, y: y + (r() - 0.5) * 0.5, P: 0 });
  const id = (x, y) => y * C + x;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    if (x < C - 1) edges.push([id(x, y), id(x + 1, y)]);
    if (y < R - 1) edges.push([id(x, y), id(x, y + 1)]);
  }
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(r() * (C - 1)), y = Math.floor(r() * (R - 1));
    edges.push(r() < 0.5 ? [id(x, y), id(x + 1, y + 1)] : [id(x + 1, y), id(x, y + 1)]);
  }
  const order = nodes.map((_, i) => i).sort(() => r() - 0.5), stations = order.slice(0, 7);
  nodes.forEach((n, i) => (n.P = stations.includes(i) ? 1 : -7 / (nodes.length - 7)));
  return { nodes, edges };
}

const GRID = makeGrid(1);
const N = GRID.nodes.length;
const LIVE = { lost: 0, spread: 0, dark: 0, t: 0 };

function startRun(margin) {
  const th = new Float64Array(N), om = new Float64Array(N), a = new Float64Array(N);
  const lines = GRID.edges.map(([i, j]) => ({ i, j, on: true, cap: 0, over: 0, flow: 0, off: -1 }));
  const sim = { th, om, a, lines, t: 0, n: 0, margin, worst: 0 };
  for (let s = 0; s < 4000; s++) advance(sim, false);       // settle to the steady state first
  sim.t = 0; sim.n = 0;
  lines.forEach((l) => (l.cap = margin * Math.max(Math.abs(l.flow), 0.15 * K)));
  lines.forEach((l, k) => { if (Math.abs(l.flow) > Math.abs(lines[sim.worst].flow)) sim.worst = k; });
  return sim;
}

function advance(sim, protect = true) {
  const { th, om, a, lines } = sim;
  for (let i = 0; i < N; i++) a[i] = GRID.nodes[i].P - ALPHA * om[i];
  for (const l of lines) {
    l.flow = l.on ? K * Math.sin(th[l.i] - th[l.j]) : 0;
    a[l.i] -= l.flow; a[l.j] += l.flow;
  }
  for (let i = 0; i < N; i++) { om[i] += a[i] * DT; th[i] += om[i] * DT; }
  sim.n++; sim.t = sim.n * DT;               // whole steps, so every run is exactly the same
  if (!protect) return;
  if (sim.n === Math.round(TRIP_AT / DT)) { lines[sim.worst].on = false; lines[sim.worst].off = sim.t; }
  for (const l of lines) {
    if (!l.on) continue;
    if (Math.abs(l.flow) > l.cap) { l.over += DT; if (l.over > RELAY) { l.on = false; l.off = sim.t; } } else l.over = 0;
  }
}

export default {
  name: 'Cascading Blackout',
  description:
    'A toy power grid where every station and town spins in step. At 4 seconds the busiest line fails; its power ' +
    'reroutes, overloads the neighbours, and they fail too. Islands with too few power stations slow down and go ' +
    'dark. Turn up the spare capacity and the cascade stops early: the swing equation, simulated live.',
  tags: ['networks', 'power grid', 'swing equation', 'kuramoto', 'synchronization', 'cascade', 'blackout'],
  category: 'Graphs & Networks',
  mode: '3d',

  motion(t) {
    return { run: Math.floor(t / RUN), tRun: t % RUN };
  },

  latex: (params, hl, m) => {
    const line = m.tRun < TRIP_AT
      ? 'Everything spinning in step. Nobody notices the grid.'
      : LIVE.dark > 0 ? `${LIVE.dark} towns in the dark. Somebody is noticing the grid.`
      : LIVE.lost > 1 ? 'Lines failing. The power is looking for another way round.' : 'One line down. The rest are coping.';
    return (
      '\\begin{aligned}' +
      '\\ddot\\theta_i &= P_i - \\alpha\\,\\dot\\theta_i - \\sum_j K \\sin(\\theta_i - \\theta_j) \\\\' +
      `\\text{spare capacity} &= ${hl(params.margin ?? 1.4, 2)}\\times\\ \\text{normal flow} \\\\` +
      `\\text{lines lost} &= ${hl(LIVE.lost, 0)} / ${GRID.edges.length} \\\\` +
      `\\text{frequency spread} &= ${hl(LIVE.spread, 2)}\\quad \\text{(0 = all in step)} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    margin: { value: 1.4, min: 1.1, max: 3, step: 0.05 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 1.0 });
    return { stage, run: -1, sim: null, margin: 0 };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, margin = ctx.params.margin ?? 1.4;
    if (m.run !== state.run || margin !== state.margin) { state.run = m.run; state.margin = margin; state.sim = startRun(margin); }
    const sim = state.sim;
    while (sim.t < m.tRun) advance(sim);
    const om = sim.om;
    LIVE.lost = sim.lines.filter((l) => !l.on).length;
    LIVE.spread = Math.max(...om) - Math.min(...om);
    LIVE.dark = GRID.nodes.filter((n, i) => n.P < 0 && om[i] < -0.2).length;

    // Layout: the grid's 6 × 4 lattice, fitted into the clear area.
    const a = state.stage.area, sx = a.w / 6.4, sy = a.h / 4.4, s = Math.min(sx, sy);
    const ox = a.x + (a.w - 5 * s) / 2, oy = a.y + (a.h - 3 * s) / 2;
    const P = (n) => [ox + n.x * s, oy + n.y * s];
    g.lineCap = 'round';
    for (const l of sim.lines) {
      const [x0, y0] = P(GRID.nodes[l.i]), [x1, y1] = P(GRID.nodes[l.j]);
      if (!l.on) {
        // A failed line: a flash of sparks, then a faint dashed ghost.
        const since = sim.t - l.off, f = Math.exp(-since * 3);
        g.setLineDash([4, 6]);
        g.strokeStyle = `rgba(${Math.round(120 + 135 * f)},${Math.round(60 + 140 * f)},${Math.round(60 + 60 * f)},${0.25 + 0.75 * f})`;
        g.lineWidth = 1 + 4 * f;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.setLineDash([]);
        continue;
      }
      const load = Math.min(1.2, Math.abs(l.flow) / l.cap);     // 1 = at capacity
      const hot = smooth(Math.max(0, (load - 0.6) / 0.4));
      g.strokeStyle = `rgb(${Math.round(90 + 165 * hot)},${Math.round(170 - 90 * hot)},${Math.round(255 - 200 * hot)})`;
      g.lineWidth = 1.5 + 5 * Math.min(1, Math.abs(l.flow) / K);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      // Moving dots show which way the power flows, faster for more power.
      const dir = Math.sign(l.flow), speed = Math.abs(l.flow) * 0.8;
      for (let q = 0; q < 3; q++) {
        let u = (((sim.t * speed + q / 3) % 1) + 1) % 1;
        if (dir < 0) u = 1 - u;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath(); g.arc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 1.8, 0, TAU); g.fill();
      }
    }
    // Stations (squares) and towns (circles): white when in step, red when slowing (blackout), blue when racing.
    GRID.nodes.forEach((n, i) => {
      const [x, y] = P(n), w = om[i];
      const slow = Math.min(1, Math.max(0, -w / 0.4)), fast = Math.min(1, Math.max(0, w / 0.4));
      const lit = n.P < 0 ? 1 - slow * 0.85 : 1;
      // in step: warm white; slowing: fading towards dark red-brown; racing: blue
      const base = [255 * lit, 235 * lit * (1 - 0.4 * slow), 190 * lit * (1 - 0.6 * slow)];
      const c3 = base.map((v, q) => Math.round(v + ([120, 180, 255][q] - v) * fast));
      g.fillStyle = `rgb(${c3[0]},${c3[1]},${c3[2]})`;
      const r = n.P > 0 ? s * 0.09 : s * 0.06;
      g.beginPath();
      if (n.P > 0) g.rect(x - r, y - r, 2 * r, 2 * r); else g.arc(x, y, r, 0, TAU);
      g.fill();
    });
    g.font = state.stage.font(12);
    g.fillStyle = 'rgba(200,210,230,0.7)';
    g.textAlign = 'left';
    g.fillText('■ power station   ● town   red: slowing down (dark)   blue: racing', a.x, a.y + a.h + 4);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
