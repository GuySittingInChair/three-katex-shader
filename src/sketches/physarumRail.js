import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Slime Mould Rail Planner. In 2010 Tero and colleagues (Science 327, 439) put oat flakes on a wet dish in the
// pattern of the cities around Tokyo and let the slime mould Physarum polycephalum find them; it grew a network of
// tubes that looked a lot like the real railway. This sketch uses Jeff Jones's agent model of the mould (2010):
// thousands of particles, each one
//     sniffs the trail at three points ahead (left, centre, right, SO = 9 cells out, ±45°),
//     turns towards the strongest smell (by 45°), steps forward one cell and adds to the trail;
// while the trail itself spreads out (3 × 3 average) and fades (10% a step). The towns keep adding smell too, like
// food. Only one particle fits in a cell (one that would bump into another stays put and faces a random way), so
// they can't all pile onto one trail. Nobody plans the network; it is what the trail keeps.
// The town positions are approximate (to a couple of km). There is no sea or mountains here: the real experiment
// shone light on those areas to keep the mould off; this one is free to cross Tokyo Bay.
// see docs/wiki/sketches/physarumRail.md

const S = 240;                       // trail grid, S × S cells, 150 km across
const KM = 150 / S;
const AGENTS = 9000;
const SO = 9, SA = Math.PI / 4, RA = Math.PI / 4, DEPOSIT = 5, DECAY = 0.1, FOOD = 6;
const RUN = 48;                      // seconds per run, then it starts over
const STEPS_PER_FRAME = 2;
// [name, latitude, longitude], approximate town centres
const TOWNS = [
  ['Tokyo', 35.681, 139.767], ['Yokohama', 35.466, 139.622], ['Kawasaki', 35.531, 139.697], ['Chiba', 35.613, 140.113],
  ['Saitama', 35.906, 139.624], ['Hachiōji', 35.656, 139.339], ['Machida', 35.542, 139.446], ['Tachikawa', 35.698, 139.414],
  ['Kawagoe', 35.925, 139.486], ['Tokorozawa', 35.799, 139.469], ['Kashiwa', 35.868, 139.976], ['Funabashi', 35.694, 139.983],
  ['Narita', 35.776, 140.318], ['Tsukuba', 36.083, 140.077], ['Kamakura', 35.319, 139.547], ['Yokosuka', 35.281, 139.672],
  ['Odawara', 35.256, 139.155], ['Atsugi', 35.443, 139.362], ['Kisarazu', 35.376, 139.917], ['Kumagaya', 36.147, 139.389],
];
// km east and north of 35.8° N, 139.8° E (one degree of longitude is 90.4 km at this latitude, of latitude 111 km)
const CELL = TOWNS.map(([, la, lo]) => [Math.round(S / 2 + ((lo - 139.8) * 90.4) / KM), Math.round(S / 2 - ((la - 35.8) * 111.0) / KM)]);

// The shortest network of straight lines joining every town (a minimum spanning tree, by Prim's method), in km.
const MST = (() => {
  const n = CELL.length, inTree = [0], d = CELL.map(([x, y]) => Math.hypot(x - CELL[0][0], y - CELL[0][1]) * KM);
  let total = 0;
  while (inTree.length < n) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!inTree.includes(i) && (best < 0 || d[i] < d[best])) best = i;
    total += d[best];
    inTree.push(best);
    for (let i = 0; i < n; i++) d[i] = Math.min(d[i], Math.hypot(CELL[i][0] - CELL[best][0], CELL[i][1] - CELL[best][1]) * KM);
  }
  return total;
})();

const LIVE = { linked: 0, tube: 0 };

function fresh(seed) {
  const r = rng(seed);
  const ag = new Float32Array(AGENTS * 3);
  for (let i = 0; i < AGENTS; i++) {
    const [tx, ty] = CELL[Math.floor(r() * CELL.length)];
    ag[i * 3] = tx + (r() - 0.5) * 8; ag[i * 3 + 1] = ty + (r() - 0.5) * 8; ag[i * 3 + 2] = r() * TAU;
  }
  const taken = new Uint8Array(S * S);
  for (let i = 0; i < AGENTS; i++) taken[Math.floor(ag[i * 3 + 1]) * S + Math.floor(ag[i * 3])] = 1;
  return { ag, trail: new Float32Array(S * S), tmp: new Float32Array(S * S), r, seed, taken };
}

function stepMould(m) {
  const { ag, trail, tmp, r, taken } = m;
  const at = (x, y) => { const i = Math.floor(x), j = Math.floor(y); return i < 0 || j < 0 || i >= S || j >= S ? -1 : trail[j * S + i]; };
  for (let k = 0; k < AGENTS; k++) {
    let x = ag[k * 3], y = ag[k * 3 + 1], h = ag[k * 3 + 2];
    const F = at(x + SO * Math.cos(h), y + SO * Math.sin(h));
    const L = at(x + SO * Math.cos(h - SA), y + SO * Math.sin(h - SA));
    const R = at(x + SO * Math.cos(h + SA), y + SO * Math.sin(h + SA));
    if (F > L && F > R) { /* keep going */ } else if (F < L && F < R) h += r() < 0.5 ? -RA : RA;
    else if (L < R) h += RA;
    else if (R < L) h -= RA;
    // One particle per cell (Jones's rule): if the cell ahead is taken, stay put and face a random way.
    const nx = x + Math.cos(h), ny = y + Math.sin(h);
    const from = Math.floor(y) * S + Math.floor(x), to = Math.floor(ny) * S + Math.floor(nx);
    if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1 || (to !== from && taken[to])) h = r() * TAU;
    else { taken[from] = 0; taken[to] = 1; x = nx; y = ny; trail[to] += DEPOSIT; }
    ag[k * 3] = x; ag[k * 3 + 1] = y; ag[k * 3 + 2] = h;
  }
  for (const [tx, ty] of CELL) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) trail[(ty + dy) * S + tx + dx] += FOOD;
  // spread out (average of the 3 × 3 neighbourhood) and fade
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(S - 1, Math.max(0, y + dy)) * S; for (let dx = -1; dx <= 1; dx++) s += trail[yy + Math.min(S - 1, Math.max(0, x + dx))]; }
    tmp[y * S + x] = (s / 9) * (1 - DECAY);
  }
  m.trail = tmp; m.tmp = trail;
}

// Which towns are joined to Tokyo by trail thicker than `level` (a flood fill along the tubes), and the tubes' area.
function survey(trail, level) {
  const seen = new Uint8Array(S * S), q = [CELL[0][1] * S + CELL[0][0]];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % S, y = (i - x) / S;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, j = yy * S + xx;
      if (xx >= 0 && yy >= 0 && xx < S && yy < S && !seen[j] && trail[j] > level) { seen[j] = 1; q.push(j); }
    }
  }
  let tube = 0;
  for (let i = 0; i < S * S; i++) if (trail[i] > level) tube++;
  return { linked: CELL.filter(([x, y]) => seen[y * S + x]).length, tube: tube * KM * KM };
}

export default {
  name: 'Slime Mould Rail Planner',
  description:
    'Nine thousand blind particles, each following its nose up a trail of slime, and twenty towns around Tokyo as ' +
    'food. Nobody plans anything, yet a network of tubes appears, joining the towns: Jeff Jones\'s model of the ' +
    'slime mould that Tero and colleagues set loose on a map of Tokyo in 2010.',
  tags: ['networks', 'slime mould', 'physarum', 'agent-based', 'emergence', 'transport', 'humor'],
  category: 'Graphs & Networks',
  mode: '3d',

  motion(t) {
    return { run: Math.floor(t / RUN), tRun: t % RUN };
  },

  latex: (params, hl, m) => {
    const line = LIVE.linked >= TOWNS.length
      ? 'Every town joined. No engineers were consulted.'
      : m.tRun < 6 ? 'Mould spreading out. It is looking for oats.' : 'Tubes that carry more get thicker; the rest fade.';
    return (
      '\\begin{aligned}' +
      '&\\text{each particle: sniff left, ahead, right;} \\\\' +
      '&\\text{turn to the strongest; step; leave slime} \\\\' +
      '&c \\leftarrow (1 - 0.1)\\,\\overline{c}_{3\\times3}\\quad \\text{(slime spreads and fades)} \\\\' +
      `&\\text{towns joined to Tokyo: } ${hl(LIVE.linked, 0)} / ${TOWNS.length} \\\\` +
      `&\\text{shortest straight-line network: } ${hl(MST, 0)}\\ \\text{km} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.7 });
    const img = document.createElement('canvas');
    img.width = img.height = S;
    const ig = img.getContext('2d');
    return { stage, mould: fresh(1), run: 0, img, ig, data: ig.createImageData(S, S), frame: 0 };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion;
    if (m.run !== state.run) { state.run = m.run; state.mould = fresh(m.run + 1); }
    const steps = ctx.params.speed === 0 ? 0 : STEPS_PER_FRAME;
    for (let s = 0; s < steps; s++) stepMould(state.mould);
    const trail = state.mould.trail;
    if (++state.frame % 15 === 0) {
      // "Joined" means linked by trail thicker than 90% of the map; brightness is scaled to the thickest 1%.
      const sorted = Float32Array.from(trail).sort();
      state.p99 = sorted[Math.floor(S * S * 0.99)] || 1;
      Object.assign(LIVE, survey(trail, sorted[Math.floor(S * S * 0.9)]));
    }
    const top = state.p99 || 10;

    // Trail as a glowing amber picture, brighter where thicker (square root, so faint trails still show).
    const px = state.data.data;
    for (let i = 0; i < S * S; i++) {
      const v = Math.min(1, Math.sqrt(trail[i] / (top * 1.6)));
      px[i * 4] = 255 * Math.min(1, v * 1.3);
      px[i * 4 + 1] = 200 * v * v;
      px[i * 4 + 2] = 60 * v * v * v + 10 * v;
      px[i * 4 + 3] = 255;
    }
    state.ig.putImageData(state.data, 0, 0);
    const sq = state.stage.square(10);
    g.imageSmoothingEnabled = true;
    g.drawImage(state.img, sq.x, sq.y, sq.s, sq.s);

    // Towns, with names.
    const k = sq.s / S;
    g.font = state.stage.font(11);
    g.textAlign = 'left';
    TOWNS.forEach(([name], i) => {
      const x = sq.x + CELL[i][0] * k, y = sq.y + CELL[i][1] * k;
      g.fillStyle = i === 0 ? '#ffffff' : '#bfe6ff';
      g.beginPath(); g.arc(x, y, i === 0 ? 4 : 2.8, 0, TAU); g.fill();
      g.fillStyle = 'rgba(190,220,255,0.7)';
      g.fillText(name, x + 5, y - 4);
    });
    // Scale bar: 20 km.
    g.strokeStyle = 'rgba(200,210,230,0.6)'; g.lineWidth = 1.5;
    const bar = (20 / 150) * sq.s;
    g.beginPath(); g.moveTo(sq.x + 8, sq.y + sq.s - 10); g.lineTo(sq.x + 8 + bar, sq.y + sq.s - 10); g.stroke();
    g.fillStyle = 'rgba(200,210,230,0.7)'; g.fillText('20 km', sq.x + 8, sq.y + sq.s - 15);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
