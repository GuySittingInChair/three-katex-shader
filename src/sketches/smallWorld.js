import { TAU, phaseOf, smooth } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Six Degrees of Poop: the Watts–Strogatz small world (Nature, 1998). 100 people stand in a ring, each
// friends with the 2 on either side (k = 4 friends each). Then every friendship is rewired, with probability p,
// to a random person anywhere in the ring. Two numbers are measured live, from the actual network:
//     C = how often two of my friends are also friends with each other (clustering), averaged over everyone
//     L = the average number of handshakes between two people (path length), by breadth-first search
// Watts and Strogatz's surprise: a handful of shortcuts collapse L while C hardly moves. Checked in Node for this
// ring and these random draws: at p = 0.01, L falls to 0.61 of its starting value while C keeps 0.93 of its own.
// A rumour (who blocked the office toilet) starts at the top every few seconds and travels one handshake at a
// time, so you can watch how many steps it needs to reach everybody.
// see docs/wiki/sketches/smallWorld.md

const N = 100;
const K = 2;                      // friends on each side
const PERIOD = 44;                // p sweeps 10⁻⁴ → 1 → 10⁻⁴
const HOP = 0.32;                 // seconds per handshake for the rumour
const RUMOUR_EVERY = 6;

// Every friendship gets a fixed random number u and a fixed list of possible new partners, so as p grows the
// same links rewire in the same order: the network changes smoothly instead of reshuffling every frame.
const draw = rng(7);
const BASE = [];
for (let i = 0; i < N; i++) for (let j = 1; j <= K; j++) BASE.push({ a: i, b: (i + j) % N, u: draw(), cand: Array.from({ length: 12 }, () => Math.floor(draw() * N)) });

function network(p) {
  const adj = Array.from({ length: N }, () => new Set());
  for (const e of BASE) { adj[e.a].add(e.b); adj[e.b].add(e.a); }
  const edges = [];
  for (const e of BASE) {
    if (e.u < p) {
      const t = e.cand.find((c) => c !== e.a && !adj[e.a].has(c));
      if (t !== undefined) {
        adj[e.a].delete(e.b); adj[e.b].delete(e.a);
        adj[e.a].add(t); adj[t].add(e.a);
        edges.push([e.a, t, 1]);
        continue;
      }
    }
    edges.push([e.a, e.b, 0]);
  }
  return { adj, edges };
}

// Hops from one person to everyone (breadth-first search: everyone 1 handshake away, then 2, …).
function hops(adj, s) {
  const d = new Int32Array(N).fill(-1);
  d[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v); }
  return d;
}

function measure(adj) {
  let C = 0;
  for (let i = 0; i < N; i++) {
    const nb = [...adj[i]], k = nb.length;
    if (k < 2) continue;
    let links = 0;
    for (let x = 0; x < k; x++) for (let y = x + 1; y < k; y++) if (adj[nb[x]].has(nb[y])) links++;
    C += links / ((k * (k - 1)) / 2);
  }
  let sum = 0, pairs = 0;
  for (let s = 0; s < N; s++) {
    const d = hops(adj, s);
    for (let v = 0; v < N; v++) if (v !== s && d[v] > 0) { sum += d[v]; pairs++; }
  }
  return { C: C / N, L: sum / pairs };
}

const START = measure(network(0).adj);   // C = 0.5, L = 12.88 for the plain ring
// Numbers measured by update() for the equation.
const LIVE = { stats: null, shortcuts: 0, reach: null };

export default {
  name: 'Six Degrees of Poop',
  description:
    'A hundred people in a ring, each friends with their four nearest neighbours. Rewire a few friendships at random ' +
    'and the number of handshakes between any two people collapses, while friend groups stay just as tight: the ' +
    'Watts–Strogatz small world, measured live. A rumour about the office toilet shows how fast news now travels.',
  tags: ['networks', 'small world', 'watts-strogatz', 'graph theory', 'six degrees', 'humor'],
  category: 'Graphs & Networks',
  mode: '3d',

  motion(t) {
    const ph = phaseOf(t, PERIOD);
    const tri = ph < 0.5 ? smooth(Math.min(1, ph / 0.42)) : smooth(Math.min(1, (1 - ph) / 0.42));
    const p = 10 ** (-4 + 4 * tri);
    return { p, rumour: (t % RUMOUR_EVERY) / HOP };
  },

  latex: (params, hl, m) => {
    const s = LIVE.stats || START;
    const reach = LIVE.reach;
    const line = reach == null ? '' : reach.all
      ? `The rumour reached all 100 people in ${reach.max} handshakes.`
      : `The rumour has reached ${reach.n} of 100 people.`;
    return (
      '\\begin{aligned}' +
      `p &= ${hl(m.p, 4)}\\quad \\text{(chance each friendship is rewired)} \\\\` +
      `C/C_0 &= ${hl(s.C / START.C, 2)}\\quad \\text{(my friends know each other)} \\\\` +
      `L/L_0 &= ${hl(s.L / START.L, 2)}\\quad L = ${hl(s.L, 1)}\\ \\text{handshakes on average} \\\\` +
      `& ${LIVE.shortcuts}\\ \\text{shortcuts out of } ${BASE.length}\\ \\text{friendships} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.9 });
    return { stage, key: -1, net: null, d: null };
  },

  update(ctx, state) {
    const { g, w, h } = state.stage.begin(ctx);
    const m = ctx.motion;
    // Rebuild only when the set of rewired friendships changes.
    const key = BASE.reduce((n, e) => n + (e.u < m.p ? 1 : 0), 0);
    if (key !== state.key) {
      state.key = key;
      state.net = network(m.p);
      state.d = hops(state.net.adj, 0);
      LIVE.stats = measure(state.net.adj);
      LIVE.shortcuts = state.net.edges.filter((e) => e[2]).length;
    }
    const { edges } = state.net, d = state.d;
    const sq = state.stage.square(20);
    const cx = sq.x + sq.s / 2, cy = sq.y + sq.s / 2, R = sq.s * 0.44;
    const pos = (i) => { const a = (i / N) * TAU - Math.PI / 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
    const front = m.rumour;                       // how many handshakes the rumour has travelled
    let reached = 0, maxd = 0;
    for (let i = 0; i < N; i++) { if (d[i] >= 0 && d[i] <= front) reached++; maxd = Math.max(maxd, d[i]); }
    LIVE.reach = { n: reached, all: reached === N, max: maxd };

    // Friendships: neighbours along the ring faint blue; shortcuts gold, curving through the middle.
    g.lineCap = 'round';
    for (const [a, b, cut] of edges) {
      const [x0, y0] = pos(a), [x1, y1] = pos(b);
      const lit = d[a] >= 0 && d[b] >= 0 && Math.max(d[a], d[b]) <= front;   // the rumour has crossed it
      g.lineWidth = cut ? 1.6 : 1.2;
      g.strokeStyle = lit ? (cut ? 'rgba(255,150,80,0.95)' : 'rgba(255,120,90,0.55)') : cut ? 'rgba(255,209,102,0.55)' : 'rgba(110,150,230,0.35)';
      g.beginPath();
      g.moveTo(x0, y0);
      if (cut) g.quadraticCurveTo(cx + (x0 + x1 - 2 * cx) * 0.15, cy + (y0 + y1 - 2 * cy) * 0.15, x1, y1);
      else g.lineTo(x1, y1);
      g.stroke();
    }
    // People: lit up as the rumour reaches them, brightest the moment it arrives.
    const rad = Math.max(2.5, R * 0.022);
    for (let i = 0; i < N; i++) {
      const [x, y] = pos(i);
      const since = front - d[i];
      const heard = d[i] >= 0 && since >= 0;
      const flash = heard ? Math.exp(-since * 1.5) : 0;
      g.fillStyle = heard ? `rgb(255,${Math.round(150 + 80 * flash)},${Math.round(90 + 120 * flash)})` : 'rgb(120,150,210)';
      g.beginPath();
      g.arc(x, y, rad * (1 + 0.8 * flash) * (i === 0 ? 1.6 : 1), 0, TAU);
      g.fill();
    }
    // Handshake count, written next to the source.
    g.font = state.stage.font(14);
    g.fillStyle = 'rgba(220,225,240,0.75)';
    g.textAlign = 'center';
    g.fillText('rumour starts here', cx, cy - R - rad * 4);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};

