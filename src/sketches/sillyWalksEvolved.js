import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Silly Walks, Evolved: a genetic algorithm teaching blobs to move. Each creature is 4 nodes joined by 6 springy
// muscles. Its genes say where the nodes start, how grippy each one is on the ground (0 slides like ice, 1 sticks
// like glue), and how much and when each muscle stretches and shrinks (one beat every 1.2 s).
// Physics: a simple model, not a realistic body. Verlet steps at 60 a second, gravity 9.8 m/s², 1% air drag,
// soft springs (they pull 12% of the way to their length, twice a step, so no muscle can kick infinitely hard),
// and a floor where a node keeps (1 − grip) of its sideways motion.
// Evolution: 40 creatures, each tried for 10 s; score = how far its middle moved to the right. The best 20 survive
// and each has one child with every gene nudged at random by up to 12% of its range. Repeat.
// Checked in Node (three seeds): the best of generation 1 manages 1–4 m; by generation 40, 11–17 m in 10 s, mostly by
// hopping (the soft muscles were added because with stiff ones evolution found a way to fly).
// see docs/wiki/sketches/sillyWalksEvolved.md

const PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
const DT = 1 / 60, BEAT = 1.2, TRIAL = 10, POP = 40, ITER = 2, STIFF = 0.12, NUDGE = 0.12;
const RUN = 100;                 // seconds before evolution starts again from scratch

function randomGenes(r) {
  return {
    nodes: Array.from({ length: 4 }, () => [r() * 1.6 - 0.8, r() * 1.2, r()]),
    muscles: PAIRS.map(() => [0.3 * r(), r() * TAU]),
  };
}
function child(gn, r) {
  const n = (x, lo, hi) => Math.min(hi, Math.max(lo, x + (r() - 0.5) * 2 * NUDGE * (hi - lo)));
  return {
    nodes: gn.nodes.map(([x, y, f]) => [n(x, -0.8, 0.8), n(y, 0, 1.2), n(f, 0, 1)]),
    muscles: gn.muscles.map(([a, p]) => [n(a, 0, 0.35), (p + (r() - 0.5) * 2 * NUDGE * TAU + TAU) % TAU]),
  };
}
function body(gn) {
  const P = gn.nodes.map(([x, y]) => ({ x, y: y + 0.05, px: x, py: y + 0.05 }));
  const L = PAIRS.map(([a, b]) => Math.max(0.15, Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y)));
  return { P, L, t: 0, air: 0, steps: 0 };
}
function physicsStep(gn, b) {
  const { P, L } = b;
  b.t += DT;
  for (const p of P) {
    const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy - 9.8 * DT * DT;
  }
  for (let it = 0; it < ITER; it++) PAIRS.forEach(([i, j], k) => {
    const [amp, ph] = gn.muscles[k];
    const rest = L[k] * (1 + amp * Math.sin((TAU * b.t) / BEAT + ph));
    const A = P[i], B = P[j], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6, f = (0.5 * STIFF * (d - rest)) / d;
    A.x += dx * f; A.y += dy * f; B.x -= dx * f; B.y -= dy * f;
  });
  P.forEach((p, i) => {
    if (p.y < 0) { p.y = 0; p.py = Math.min(p.py, 0); const grip = gn.nodes[i][2]; p.x = p.px + (p.x - p.px) * (1 - grip); }
  });
  b.steps++;
  if (P.every((p) => p.y > 0.01)) b.air++;
}
const middle = (b) => b.P.reduce((s, p) => s + p.x, 0) / 4;
function score(gn) {
  const b = body(gn), x0 = middle(b);
  for (let s = 0; s < TRIAL / DT; s++) physicsStep(gn, b);
  return middle(b) - x0;
}

function newEvolution(seed) {
  const r = rng(seed);
  return { r, pop: Array.from({ length: POP }, () => randomGenes(r)), scores: [], gen: 0, champs: [], best: [] };
}
// Score a few creatures; when a whole generation is scored, breed the next.
function evolveSome(E, count) {
  for (let q = 0; q < count; q++) {
    E.scores.push(score(E.pop[E.scores.length]));
    if (E.scores.length === POP) {
      const ranked = E.pop.map((gn, i) => ({ gn, f: E.scores[i] })).sort((a, b) => b.f - a.f);
      E.gen++;
      E.champs.push(ranked[0].gn);
      E.best.push(ranked[0].f);
      const keep = ranked.slice(0, POP / 2).map((s) => s.gn);
      E.pop = [...keep, ...keep.map((gn) => child(gn, E.r))];
      E.scores = [];
    }
  }
}

const LIVE = { gen: 0, best: 0, first: 0, hop: 0 };

export default {
  name: 'Silly Walks, Evolved',
  description:
    'Forty wobbly blobs, each a few springy muscles and some feet of varying grip. The ones that get furthest in ten ' +
    'seconds have children with slightly scrambled genes; the rest are forgotten. Within a few dozen generations the ' +
    'flailing turns into hopping, scooting and lunging: a genetic algorithm, racing its own ancestors.',
  tags: ['genetic algorithm', 'evolution', 'locomotion', 'soft body', 'physics', 'humor'],
  category: 'Biology',
  mode: '3d',

  motion(t) {
    return { run: Math.floor(t / RUN), tRun: t % RUN };
  },

  latex: (params, hl) => {
    const line = LIVE.gen < 2
      ? 'Generation 1. Nobody has the faintest idea what legs are for.'
      : LIVE.hop > 0.4 ? `Generation ${LIVE.gen} has discovered hopping. It is not elegant.`
      : LIVE.hop > 0.1 ? `Generation ${LIVE.gen} lunges, mostly forwards.` : `Generation ${LIVE.gen} scoots. The floor is not impressed.`;
    return (
      '\\begin{aligned}' +
      '&\\text{score} = x_{\\text{middle}}(10\\,\\text{s}) - x_{\\text{middle}}(0) \\\\' +
      '&\\text{best 20 of 40 survive; each child: every gene} \\pm 12\\% \\\\' +
      `&\\text{generation } ${hl(LIVE.gen, 0)}:\\ \\text{best } ${hl(LIVE.best, 1)}\\ \\text{m in 10 s}\\quad (\\text{gen 1: } ${hl(LIVE.first, 1)}\\ \\text{m}) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.8 });
    return { stage, run: -1, E: null, lanes: [] };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion;
    if (m.run !== state.run) { state.run = m.run; state.E = newEvolution(m.run + 11); state.lanes = []; }
    const E = state.E;
    // One creature per frame (about 1.5 generations a second), faster with the speed slider.
    state.owed = (state.owed || 0) + (ctx.params.speed ?? 1);
    evolveSome(E, Math.floor(state.owed));
    state.owed -= Math.floor(state.owed);
    LIVE.gen = E.gen; LIVE.best = E.best[E.best.length - 1] ?? 0; LIVE.first = E.best[0] ?? 0;

    // Three lanes race the champions of generation 1, generation 10 and the latest generation, replaying each
    // one's 10 s trial in real time, then starting the race again.
    if (E.champs.length && (!state.lanes.length || state.lanes[0].b.t >= TRIAL)) {
      const pick = [0, Math.min(9, E.champs.length - 1), E.champs.length - 1];
      state.lanes = pick.map((gi) => ({ gi, gn: E.champs[gi], b: body(E.champs[gi]) }));
      state.lanes.forEach((L) => (L.x0 = middle(L.b)));
    }
    const steps = Math.round((ctx.delta * (ctx.params.speed ?? 1)) / DT);
    for (const L of state.lanes) for (let s = 0; s < steps && L.b.t < TRIAL; s++) physicsStep(L.gn, L.b);
    const latest = state.lanes[2];
    if (latest) LIVE.hop = latest.b.steps ? latest.b.air / latest.b.steps : 0;

    const a = state.stage.area;
    const laneH = (a.h * 0.72) / 3;
    const lead = Math.max(0, ...state.lanes.map((L) => middle(L.b) - L.x0));
    const ppm = Math.min(laneH / 2.2, a.w / 12);               // pixels per metre
    const view = Math.max(0, lead - (a.w / ppm) * 0.6);         // the camera follows the leader
    state.lanes.forEach((L, k) => {
      const base = a.y + laneH * (k + 0.92);
      const X = (x) => a.x + (x - L.x0 - view) * ppm + 20, Y = (y) => base - y * ppm;
      // ground with a tick every metre
      g.strokeStyle = 'rgba(120,140,180,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(a.x, base); g.lineTo(a.x + a.w, base); g.stroke();
      g.font = state.stage.font(10); g.fillStyle = 'rgba(160,175,205,0.6)'; g.textAlign = 'center';
      for (let mtr = Math.ceil(view - 1); mtr < view + a.w / ppm; mtr++) {
        const x = X(L.x0 + mtr);
        if (x < a.x || x > a.x + a.w) continue;
        g.beginPath(); g.moveTo(x, base); g.lineTo(x, base + (mtr % 5 ? 4 : 9)); g.stroke();
        if (mtr % 5 === 0 && k === 2) g.fillText(`${mtr} m`, x, base + 20);   // distances under the bottom lane only
      }
      // muscles: brighter while shortening
      const P = L.b.P;
      PAIRS.forEach(([i, j], q) => {
        const [amp, ph] = L.gn.muscles[q];
        const pull = Math.cos((TAU * L.b.t) / BEAT + ph) * amp * 3;
        g.strokeStyle = `rgb(${Math.round(150 + 100 * Math.max(0, -pull))},${Math.round(170 + 60 * Math.max(0, pull))},255)`;
        g.lineWidth = 2 + 3 * amp * 6;
        g.beginPath(); g.moveTo(X(P[i].x), Y(P[i].y)); g.lineTo(X(P[j].x), Y(P[j].y)); g.stroke();
      });
      // feet: orange = grippy, pale = slippery
      P.forEach((p, i) => {
        const grip = L.gn.nodes[i][2];
        g.fillStyle = `rgb(255,${Math.round(240 - 120 * grip)},${Math.round(220 - 200 * grip)})`;
        g.beginPath(); g.arc(X(p.x), Y(p.y), 4 + 3 * grip, 0, TAU); g.fill();
      });
      g.textAlign = 'left'; g.font = state.stage.font(12); g.fillStyle = 'rgba(220,225,240,0.85)';
      g.fillText(`generation ${L.gi + 1} champion: ${(middle(L.b) - L.x0).toFixed(1)} m`, a.x, base - laneH * 0.78);
    });

    // Best score per generation.
    const cx = a.x, cy = a.y + a.h, cw = a.w * 0.5, ch = a.h * 0.14, B = E.best;
    if (B.length > 1) {
      const top = Math.max(...B, 1);
      g.strokeStyle = 'rgba(255,209,102,0.9)'; g.lineWidth = 1.6;
      g.beginPath();
      B.forEach((f, i) => { const x = cx + (i / (B.length - 1)) * cw, y = cy - (f / top) * ch; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      g.fillStyle = 'rgba(255,209,102,0.8)'; g.font = state.stage.font(11);
      g.fillText('best distance, generation by generation', cx, cy - ch - 6);
    }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
