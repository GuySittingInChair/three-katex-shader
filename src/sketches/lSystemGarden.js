import { TAU, smooth } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// L-System Botanical Garden. Six plants, each grown from one short rewriting rule (a Lindenmayer system).
// Start with a word, replace every letter by its rule, again and again; then read the word as drawing
// instructions for a pen ("turtle"): F = draw forward, + = turn left by δ, − = turn right, [ = remember where you
// are (a branch starts), ] = go back there (the branch ends); X draws nothing but grows into more plant.
// The six rules, angles and generations are the six plants of Prusinkiewicz and Lindenmayer, "The Algorithmic
// Beauty of Plants" (1990), figure 1.24. Expanded in Node: 3,125, 3,125, 4,096, 4,118, 4,118 and 1,488 strokes.
// Added here: growth from the ground up (a stroke appears once growth reaches its distance from the root), wind
// (every turn is bent a little more the further out it is, swaying in time), and droop (tropism: every stroke
// turns towards the ground by an amount proportional to how sideways it points, as in ABOP section 2.2).
// see docs/wiki/sketches/lSystemGarden.md

const PLANTS = [
  { axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, n: 5, delta: 25.7, hue: [120, 230, 150] },
  { axiom: 'F', rules: { F: 'F[+F]F[-F][F]' }, n: 5, delta: 20, hue: [170, 240, 120] },
  { axiom: 'F', rules: { F: 'FF-[-F+F+F]+[+F-F-F]' }, n: 4, delta: 22.5, hue: [110, 220, 200] },
  { axiom: 'X', rules: { X: 'F[+X]F[-X]+X', F: 'FF' }, n: 7, delta: 20, hue: [200, 240, 110] },
  { axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' }, n: 7, delta: 25.7, hue: [140, 250, 170] },
  { axiom: 'X', rules: { X: 'F-[[X]+X]+F[+FX]-X', F: 'FF' }, n: 5, delta: 22.5, hue: [230, 220, 120] },
];
const LOOP = 36;

// The words are expanded the first time the sketch opens (they are long: up to 13,956 letters).
function grow() {
  if (PLANTS[0].word) return;
  for (const p of PLANTS) {
  let s = p.axiom;
  for (let i = 0; i < p.n; i++) s = [...s].map((c) => p.rules[c] ?? c).join('');
  p.word = s;
  p.strokes = [...s].filter((c) => c === 'F').length;
  // Each stroke's distance from the root (in strokes), for growing from the ground up.
  const dist = [], stack = [];
  let d = 0;
  for (const c of s) {
    if (c === 'F') { d++; dist.push(d); } else if (c === '[') stack.push(d); else if (c === ']') d = stack.pop();
  }
  p.dist = dist;
  p.maxDist = Math.max(...dist);
  }
}

// Walks the word with a turtle and calls out(x0, y0, x1, y1, depth) for each stroke grown so far.
function turtle(p, grow, wind, droop, t, out) {
  const delta = (p.delta * Math.PI) / 180;
  let x = 0, y = 0, a = -Math.PI / 2, depth = 0, k = 0;
  const stack = [];
  const reach = grow * p.maxDist;
  for (const c of p.word) {
    if (c === 'F') {
      const dd = p.dist[k++];
      if (dd - 1 > reach) continue;
      const frac = Math.min(1, reach - (dd - 1));
      // droop (tropism): turn towards straight down by e·(H × T); with H at angle a (y down) and T straight
      // down, H × T = cos a: nothing for a stroke pointing up or down, most for one pointing sideways
      a += droop * 0.02 * Math.cos(a);
      // wind: bend more at the tips, swaying in time and travelling up the plant
      const sway = wind * 0.006 * dd * Math.sin(t * 1.3 - dd * 0.05);
      const nx = x + Math.cos(a + sway) * frac, ny = y + Math.sin(a + sway) * frac;
      out(x, y, nx, ny, depth);
      x = nx; y = ny;
    } else if (c === '+') a -= delta;
    else if (c === '-') a += delta;
    else if (c === '[') { stack.push([x, y, a, depth]); depth++; }
    else if (c === ']') [x, y, a, depth] = stack.pop();
  }
}

const LIVE = { strokes: 0 };

export default {
  name: 'L-System Botanical Garden',
  description:
    'Six plants, each grown from a single rewriting rule: replace every F by F[+F]F[−F]F, five times over, then read ' +
    'the result as pen strokes. Thousands of branches from one line of text. They grow from the ground up, sway in ' +
    'the wind and droop under gravity. The six classic plants of Prusinkiewicz and Lindenmayer.',
  tags: ['l-system', 'lindenmayer', 'plants', 'fractals', 'grammar', 'turtle graphics', 'growth'],
  category: 'Biology',
  mode: '3d',

  motion(t) {
    const u = (t % LOOP) / LOOP;
    const grow = u < 0.42 ? smooth(u / 0.42) : u < 0.9 ? 1 : 1 - smooth((u - 0.9) / 0.1);
    return { grow, feature: Math.floor(t / 6) % PLANTS.length, t };
  },

  latex: (params, hl, m) => {
    const p = PLANTS[m.feature];
    if (!p.word) return '\\text{planting…}';
    const rules = Object.entries(p.rules).map(([k, v]) => `${k} \\to \\texttt{${v.replace(/\[/g, '{[}').replace(/\]/g, '{]}')}}`).join(',\\ ');
    const fRule = p.rules.F;
    const fs = fRule ? [...fRule].filter((c) => c === 'F').length : 0;
    return (
      '\\begin{aligned}' +
      `&\\text{plant ${m.feature + 1}: axiom } \\texttt{${p.axiom}},\\ \\delta = ${p.delta}^\\circ,\\ ${p.n}\\ \\text{generations} \\\\` +
      `&${rules} \\\\` +
      `&\\text{strokes} = ${p.axiom === 'F' ? `${fs}^{${p.n}} = ` : ''}${hl(p.strokes, 0)}\\quad \\text{(word: ${p.word.length} letters)} \\\\` +
      `&\\text{grown so far: } ${hl(LIVE.strokes, 0)}\\ \\text{strokes in the garden} \\\\` +
      `& ${caption(m.grow < 1 ? 'Growing. No gardener involved, only a find-and-replace.' : 'Fully grown. Watered entirely with string substitution.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    wind: { value: 1, min: 0, max: 4 },
    droop: { value: 0.4, min: 0, max: 3 },
  },

  setup(ctx) {
    grow();
    return { stage: createStage(ctx, { glow: 0.6 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    const wind = ctx.params.wind ?? 1, droop = ctx.params.droop ?? 0.4;
    const cols = state.stage.wide ? 6 : 3, rows = state.stage.wide ? 1 : 2;
    const cw = a.w / cols, rh = a.h / rows;
    let drawn = 0;
    // ground
    g.strokeStyle = 'rgba(140,110,80,0.5)'; g.lineWidth = 2;
    PLANTS.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const baseX = a.x + cw * (col + 0.5), baseY = a.y + rh * (row + 1) - 6;
      g.beginPath(); g.moveTo(baseX - cw * 0.42, baseY); g.lineTo(baseX + cw * 0.42, baseY); g.stroke();
    });
    g.lineCap = 'round';
    PLANTS.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const baseX = a.x + cw * (col + 0.5), baseY = a.y + rh * (row + 1) - 6;
      // size: full-grown height fits the row (measured once, without wind)
      if (!p.size) {
        let minY = 0, minX = 0, maxX = 0;
        turtle(p, 1, 0, 0, 0, (x0, y0, x1, y1) => { minY = Math.min(minY, y1); minX = Math.min(minX, x1); maxX = Math.max(maxX, x1); });
        p.size = { h: -minY, w: maxX - minX, mid: (maxX + minX) / 2 };
      }
      const k = Math.min((rh * 0.9) / p.size.h, (cw * 0.95) / p.size.w);
      const featured = i === m.feature;
      const [r0, g0, b0] = p.hue;
      // strokes batched by branch depth: trunk warm brown, tips in the plant's colour
      const paths = [];
      turtle(p, m.grow, wind, droop, m.t, (x0, y0, x1, y1, depth) => {
        (paths[depth] ||= []).push(baseX + (x0 - p.size.mid) * k, baseY + y0 * k, baseX + (x1 - p.size.mid) * k, baseY + y1 * k);
        drawn++;
      });
      paths.forEach((segs, depth) => {
        if (!segs) return;
        const f = Math.min(1, depth / 5);
        const bright = featured ? 1 : 0.7;
        g.strokeStyle = `rgb(${Math.round((150 + (r0 - 150) * f) * bright)},${Math.round((110 + (g0 - 110) * f) * bright)},${Math.round((70 + (b0 - 70) * f) * bright)})`;
        g.lineWidth = Math.max(0.6, 2.4 - depth * 0.4);
        g.beginPath();
        for (let q = 0; q < segs.length; q += 4) { g.moveTo(segs[q], segs[q + 1]); g.lineTo(segs[q + 2], segs[q + 3]); }
        g.stroke();
      });
      g.fillStyle = featured ? 'rgba(255,230,150,0.95)' : 'rgba(180,190,210,0.6)';
      g.font = state.stage.font(12);
      g.textAlign = 'center';
      g.fillText(String(i + 1), baseX, baseY + 16);
    });
    LIVE.strokes = drawn;
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
