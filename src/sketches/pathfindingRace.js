import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Pathfinding Race: Dijkstra vs A*. The same maze twice; a mouse in the top-left corner, cheese bottom-right.
// Dijkstra (1956) explores outwards in rings, always taking the closest unexplored cell first (here every step costs
// 1, so it is the same as breadth-first search). A* (Hart, Nilsson and Raphael, 1968) does the same but ranks cells by
//     f = g + h,   g = steps taken so far,   h = an estimate of the steps left
// with h = the Manhattan distance (across plus down, ignoring walls). Because h never overestimates, A* still finds a
// shortest path, but it looks in the promising direction first and explores fewer cells. Both expand one cell per
// tick; the counts of cells explored are the score. Ties in f go to the larger g (deeper first), the usual choice.
// Mazes: a randomised depth-first "recursive backtracker", then 12% of the remaining inner walls knocked out so there
// are loops and more than one route.
// see docs/wiki/sketches/pathfindingRace.md

const COLS = 31, ROWS = 21, RATE = 40, HOLD = 4;

function makeMaze(seed) {
  const r = rng(seed);
  // walls[k] bit 1 = east wall, bit 2 = south wall
  const walls = new Uint8Array(COLS * ROWS).fill(3), seen = new Uint8Array(COLS * ROWS);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const k = stack[stack.length - 1], x = k % COLS, y = (k - x) / COLS;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < COLS && b < ROWS && !seen[b * COLS + a]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(r() * nb.length)], j = ny * COLS + nx;
    if (nx > x) walls[k] &= ~1; else if (nx < x) walls[j] &= ~1; else if (ny > y) walls[k] &= ~2; else walls[j] &= ~2;
    seen[j] = 1;
    stack.push(j);
  }
  for (let k = 0; k < COLS * ROWS; k++) {
    const x = k % COLS, y = (k - x) / COLS;
    if (x < COLS - 1 && walls[k] & 1 && r() < 0.12) walls[k] &= ~1;
    if (y < ROWS - 1 && walls[k] & 2 && r() < 0.12) walls[k] &= ~2;
  }
  return walls;
}
function neighbours(walls, k) {
  const x = k % COLS, y = (k - x) / COLS, out = [];
  if (x < COLS - 1 && !(walls[k] & 1)) out.push(k + 1);
  if (x > 0 && !(walls[k - 1] & 1)) out.push(k - 1);
  if (y < ROWS - 1 && !(walls[k] & 2)) out.push(k + COLS);
  if (y > 0 && !(walls[k - COLS] & 2)) out.push(k - COLS);
  return out;
}
const GOAL = COLS * ROWS - 1;
const manhattan = (k) => { const x = k % COLS, y = (k - x) / COLS; return COLS - 1 - x + (ROWS - 1 - y); };

// One search, advanced a cell at a time. A tiny array-based priority queue is plenty for 651 cells.
function newSearch(walls, useH) {
  const g = new Int32Array(COLS * ROWS).fill(-1), from = new Int32Array(COLS * ROWS).fill(-1), closed = new Uint8Array(COLS * ROWS);
  g[0] = 0;
  return { walls, useH, g, from, closed, open: [0], explored: 0, done: false, path: null };
}
function expand(S) {
  if (S.done || !S.open.length) return;
  let bi = 0;
  const f = (k) => S.g[k] + (S.useH ? manhattan(k) : 0);
  for (let i = 1; i < S.open.length; i++) {
    const a = S.open[i], b = S.open[bi];
    if (f(a) < f(b) || (f(a) === f(b) && S.g[a] > S.g[b])) bi = i;
  }
  const k = S.open.splice(bi, 1)[0];
  if (S.closed[k]) return;
  S.closed[k] = 1; S.explored++;
  if (k === GOAL) {
    S.done = true; S.path = [];
    for (let c = GOAL; c >= 0; c = S.from[c]) S.path.push(c);
    return;
  }
  for (const j of neighbours(S.walls, k)) {
    if (S.closed[j]) continue;
    if (S.g[j] < 0 || S.g[k] + 1 < S.g[j]) { S.g[j] = S.g[k] + 1; S.from[j] = k; S.open.push(j); }
  }
}

const LIVE = { d: 0, a: 0, dLen: null, aLen: null };

export default {
  name: 'Pathfinding Race',
  description:
    'Two mice, one maze, one piece of cheese. Dijkstra searches outwards evenly in every direction; A* adds a guess of ' +
    'the distance left and heads the right way first. Both are guaranteed to find a shortest route, and they do, the ' +
    'same length, but watch how much of the maze each has to search to be sure.',
  tags: ['algorithms', 'pathfinding', 'a-star', 'dijkstra', 'graph search', 'maze'],
  category: 'Algorithms',
  mode: '3d',

  motion(t) {
    return { t };
  },

  latex: (params, hl) => {
    const L = LIVE;
    const line = L.dLen != null && L.aLen != null ? `Same route length (${L.aLen - 1} steps). A* looked at ${Math.round((100 * L.a) / L.d)}% as many cells.` : 'Searching. Dijkstra is thorough. A* has a hunch.';
    return (
      '\\begin{aligned}' +
      'f(n) &= g(n) + h(n),\\quad h = |\\Delta x| + |\\Delta y| \\\\' +
      `\\text{Dijkstra} &: ${hl(L.d, 0)}\\ \\text{cells explored}` + (L.dLen != null ? `,\\ \\text{route } ${L.dLen - 1}` : '') + ' \\\\' +
      `\\text{A}^* &: ${hl(L.a, 0)}\\ \\text{cells explored}` + (L.aLen != null ? `,\\ \\text{route } ${L.aLen - 1}` : '') + ' \\\\' +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.8 }), seed: 0, race: null, owed: 0 };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const a = state.stage.area, dt = ctx.delta * (ctx.params.speed ?? 1);
    if (!state.race) { state.seed++; const walls = makeMaze(state.seed); state.race = { walls, D: newSearch(walls, false), A: newSearch(walls, true), hold: 0 }; }
    const R = state.race;
    if (R.D.done && R.A.done) { R.hold += dt; if (R.hold > HOLD) state.race = null; }
    state.owed += dt * RATE;
    while (state.owed >= 1) { state.owed--; expand(R.D); expand(R.A); }
    LIVE.d = R.D.explored; LIVE.a = R.A.explored;
    LIVE.dLen = R.D.path ? R.D.path.length : null; LIVE.aLen = R.A.path ? R.A.path.length : null;
    if (!state.race) { state.stage.end(); return; }

    // two mazes, side by side on wide screens, stacked on phones
    const wide = state.stage.wide;
    const pw = wide ? a.w / 2 - 8 : a.w, ph = wide ? a.h - 20 : a.h / 2 - 20;
    const cs = Math.min(pw / COLS, ph / ROWS);
    [[R.D, 'Dijkstra', 0], [R.A, 'A*', 1]].forEach(([S, name, i]) => {
      const ox = wide ? a.x + i * (a.w / 2 + 8) : a.x + (a.w - COLS * cs) / 2, oy = wide ? a.y + 18 : a.y + 18 + i * (a.h / 2);
      for (let k = 0; k < COLS * ROWS; k++) {
        const x = ox + (k % COLS) * cs, y = oy + Math.floor(k / COLS) * cs;
        if (S.closed[k]) {
          const u = Math.min(1, S.g[k] / 60);
          g.fillStyle = `rgba(${Math.round(60 + 80 * u)},${Math.round(90 + 60 * (1 - u))},${Math.round(200 - 60 * u)},0.55)`;
          g.fillRect(x, y, cs, cs);
        } else if (S.g[k] >= 0) { g.fillStyle = 'rgba(255,210,100,0.35)'; g.fillRect(x, y, cs, cs); }
      }
      if (S.path) {
        g.strokeStyle = 'rgb(255,215,110)'; g.lineWidth = Math.max(2, cs * 0.35); g.lineJoin = 'round';
        g.beginPath();
        S.path.forEach((k, q) => { const x = ox + (k % COLS + 0.5) * cs, y = oy + (Math.floor(k / COLS) + 0.5) * cs; if (q) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      g.strokeStyle = 'rgba(200,210,235,0.85)'; g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < COLS * ROWS; k++) {
        const x = ox + (k % COLS) * cs, y = oy + Math.floor(k / COLS) * cs;
        if (R.walls[k] & 1) { g.moveTo(x + cs, y); g.lineTo(x + cs, y + cs); }
        if (R.walls[k] & 2) { g.moveTo(x, y + cs); g.lineTo(x + cs, y + cs); }
      }
      g.rect(ox, oy, COLS * cs, ROWS * cs);
      g.stroke();
      g.font = state.stage.font(12); g.fillStyle = 'rgba(220,225,240,0.9)'; g.textAlign = 'left';
      g.fillText(`${name}: ${S.explored} cells`, ox, oy - 5);
      g.fillStyle = 'white'; g.beginPath(); g.arc(ox + cs / 2, oy + cs / 2, cs * 0.3, 0, 6.283); g.fill();
      g.fillStyle = 'rgb(255,200,60)'; g.beginPath(); g.arc(ox + (COLS - 0.5) * cs, oy + (ROWS - 0.5) * cs, cs * 0.32, 0, 6.283); g.fill();
    });
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
