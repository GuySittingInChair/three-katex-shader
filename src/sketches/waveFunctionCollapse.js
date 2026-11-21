import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Wave Function Collapse (Maxim Gumin, 2016): a way to make patterns that obey local rules, used in games to build
// levels and towns. The name borrows from quantum mechanics, loosely: every cell starts as a "superposition" of all
// the tiles it could be, and collapses one at a time.
// Tiles: 16 pipe pieces, one for each way the four sides (north, east, south, west) can have a pipe or not. Rule:
// touching sides must agree (pipe meets pipe, blank meets blank). Weights make some tiles commoner (blank 6,
// straight 3, corner 3, T-junction 1, cross 0.5, dead end 0.4).
// Loop: pick the undecided cell with the least uncertainty, its Shannon entropy
//     H = log Σw − (Σ w log w) / Σw        over the tiles still possible there
// (ties broken at random); collapse it to one tile, chosen at random by weight; then propagate: neighbours drop any
// tile that no longer fits, and their neighbours, and so on. With all 16 tiles allowed it can never get stuck.
// see docs/wiki/sketches/waveFunctionCollapse.md

const TILES = [];
for (let m = 0; m < 16; m++) {
  const n = [m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];   // N, E, S, W
  const c = n[0] + n[1] + n[2] + n[3];
  const straight = c === 2 && n[0] === n[2];
  TILES.push({ n, w: c === 0 ? 6 : c === 1 ? 0.4 : c === 2 ? 3 : c === 3 ? 1 : 0.5, straight });
}
const DIRS = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];   // dx, dy, my side, their side
const RATE = 30;                    // cells collapsed a second
const HOLD = 4;

function entropy(opts) {
  let s = 0, sl = 0;
  for (const t of opts) { const w = TILES[t].w; s += w; sl += w * Math.log(w); }
  return Math.log(s) - sl / s;
}

function newWorld(cols, rows, seed) {
  const cells = Array.from({ length: cols * rows }, () => TILES.map((_, i) => i));
  return { cols, rows, cells, r: rng(seed), done: 0, choices: 0, last: -1, born: new Float32Array(cols * rows).fill(-1), t: 0 };
}

function collapseOne(W) {
  const { cells, cols, rows, r } = W;
  let best = -1, bestH = Infinity;
  for (let k = 0; k < cells.length; k++) {
    if (cells[k].length < 2) continue;
    const h = entropy(cells[k]) + r() * 1e-3;
    if (h < bestH) { bestH = h; best = k; }
  }
  if (best < 0) return false;
  // weighted random choice among what is still possible
  const opts = cells[best], total = opts.reduce((s, t) => s + TILES[t].w, 0);
  let x = r() * total, pickT = opts[opts.length - 1];
  for (const t of opts) { x -= TILES[t].w; if (x <= 0) { pickT = t; break; } }
  cells[best] = [pickT];
  W.last = best; W.born[best] = W.t;
  // propagate
  const stack = [best];
  while (stack.length) {
    const k = stack.pop(), x0 = k % cols, y0 = Math.floor(k / cols);
    for (const [dx, dy, mine, theirs] of DIRS) {
      const x1 = x0 + dx, y1 = y0 + dy;
      if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) continue;
      const j = y1 * cols + x1;
      const can = new Set(cells[k].map((t) => TILES[t].n[mine]));          // what my side can be
      const kept = cells[j].filter((t) => can.has(TILES[t].n[theirs]));
      if (kept.length < cells[j].length) {
        cells[j] = kept;
        if (kept.length === 1 && W.born[j] < 0) W.born[j] = W.t;
        stack.push(j);
      }
    }
  }
  return true;
}

const LIVE = { decided: 0, total: 1, H: 0, choices: 0 };

export default {
  name: 'Wave Function Collapse',
  description:
    'A grid where every square could be any of sixteen pipe pieces. Pick the square with the fewest options left, ' +
    'decide it, and cross off whatever no longer fits next door. Repeat, and a tidy plumbing system grows with no plan ' +
    'at all: the procedural-generation trick game designers call Wave Function Collapse.',
  tags: ['algorithms', 'wave function collapse', 'procedural generation', 'constraint solving', 'entropy', 'tiles'],
  category: 'Algorithms',
  mode: '3d',

  motion(t) {
    return { t };
  },

  latex: (params, hl) => {
    const L = LIVE;
    return (
      '\\begin{aligned}' +
      'H &= \\log\\textstyle\\sum w - \\frac{\\sum w \\log w}{\\sum w} \\\\' +
      `&\\text{decided: } ${hl(L.decided, 0)} / ${L.total}\\quad \\text{choices made: } ${hl(L.choices, 0)} \\\\` +
      `&\\text{least uncertain cell left: } H = ${hl(L.H, 2)} \\\\` +
      `& ${caption(L.decided < L.total ? 'Every square is all possible pipes until someone looks. Then it isn\'t.' : 'Done. No plumber was consulted at any stage.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.9 }), world: null, key: '', seed: 1, owed: 0 };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const a = state.stage.area;
    const cell = Math.max(14, Math.min(a.w / 34, a.h / 22));
    const cols = Math.floor(a.w / cell), rows = Math.floor(a.h / cell);
    const key = `${cols}x${rows}`;
    if (key !== state.key) { state.key = key; state.world = newWorld(cols, rows, state.seed); }
    let W = state.world;
    const dt = ctx.delta * (ctx.params.speed ?? 1);
    W.t += dt;
    if (W.done) { W.done += dt; if (W.done > HOLD) { state.seed++; W = state.world = newWorld(cols, rows, state.seed); } }
    else {
      state.owed += dt * RATE;
      while (state.owed >= 1) { state.owed--; if (collapseOne(W)) W.choices++; else { W.done = 1e-6; break; } }
    }
    const decided = W.cells.filter((c) => c.length === 1).length;
    LIVE.choices = W.choices;
    LIVE.decided = decided; LIVE.total = W.cells.length;
    LIVE.H = W.cells.reduce((m, c) => (c.length > 1 ? Math.min(m, entropy(c)) : m), Infinity);
    if (!Number.isFinite(LIVE.H)) LIVE.H = 0;

    const ox = a.x + (a.w - cols * cell) / 2, oy = a.y + (a.h - rows * cell) / 2;
    const maxH = entropy(TILES.map((_, i) => i));
    g.lineCap = 'round';
    for (let k = 0; k < W.cells.length; k++) {
      const x = ox + (k % cols) * cell, y = oy + Math.floor(k / cols) * cell, c = W.cells[k];
      if (c.length > 1) {
        // undecided: a soft glow, brighter the more uncertain
        const u = entropy(c) / maxH;
        g.fillStyle = `rgba(80,110,200,${0.08 + 0.22 * u})`;
        g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        continue;
      }
      const T = TILES[c[0]], age = W.t - W.born[k], fresh = Math.exp(-age * 3);
      g.fillStyle = `rgba(20,24,40,${0.9})`; g.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      g.strokeStyle = `rgb(${Math.round(120 + 135 * fresh)},${Math.round(210 + 45 * fresh)},${Math.round(255)})`;
      g.lineWidth = Math.max(2, cell * 0.22);
      const cx = x + cell / 2, cy = y + cell / 2;
      g.beginPath();
      T.n.forEach((on, side) => {
        if (!on) return;
        const [dx, dy] = DIRS[side];
        g.moveTo(cx, cy); g.lineTo(cx + (dx * cell) / 2, cy + (dy * cell) / 2);
      });
      g.stroke();
      const count = T.n[0] + T.n[1] + T.n[2] + T.n[3];
      if (count === 1 || count >= 3) { g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(cx, cy, cell * (count === 1 ? 0.18 : 0.15), 0, TAU); g.fill(); }
    }
    if (W.last >= 0 && !W.done) {
      const x = ox + (W.last % cols) * cell, y = oy + Math.floor(W.last / cols) * cell;
      g.strokeStyle = 'rgba(255,220,120,0.9)'; g.lineWidth = 2; g.strokeRect(x, y, cell, cell);
    }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
