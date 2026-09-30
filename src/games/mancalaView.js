import { PITS, STORE } from './mancala.js';

// Mancala board in SVG. The player at the bottom sows left to right along the
// bottom row into the store on the right, then the top row runs right to left
// into the other store on the left. Tap one of your (glowing) pits to sow it;
// seeds then drop into each pit in turn.
const NS = 'http://www.w3.org/2000/svg';
const W = 960;
const H = 380;
const PIT_W = 110;
const PIT_X0 = 150;
const SEED_COLORS = ['#ffd166', '#ef476f', '#7cc4ff', '#7cfc93', '#c4a6ff', '#ff9f5a'];

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMancalaView(container, { onMove }) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'game-board mc-board', role: 'img' });
  svg.setAttribute('aria-label', 'Mancala board');
  svg.append(el('rect', { x: 4, y: 4, width: W - 8, height: H - 8, rx: 60, fill: '#6b3f1f', stroke: '#3f2410', 'stroke-width': 6 }));
  const layer = el('g');
  svg.append(layer);
  container.append(svg);

  let bottom = 1; // which player's row is at the bottom
  let interactive = false;
  let human = 1;
  let pits = null;
  let turn = 1;

  // Centre of pit i (0–13) for the current orientation.
  function pos(i) {
    const rowOwner = i <= 6 ? 1 : 2;
    const onBottom = rowOwner === bottom;
    if (i === STORE[1] || i === STORE[2]) return { x: onBottom ? W - 70 : 70, y: H / 2, store: true };
    const k = rowOwner === 1 ? i : i - 7; // 0–5 along the owner's direction of play
    const x = onBottom ? PIT_X0 + k * PIT_W + PIT_W / 2 : PIT_X0 + (PITS - 1 - k) * PIT_W + PIT_W / 2;
    return { x, y: onBottom ? 262 : 118, store: false };
  }

  // Seeds laid out in a small spiral (pits) or a grid (stores).
  function seedsIn(g, i, n) {
    const { x, y, store } = pos(i);
    for (let k = 0; k < n; k++) {
      let dx;
      let dy;
      if (store) {
        const col = k % 4;
        const row = Math.floor(k / 4);
        dx = (col - 1.5) * 17;
        dy = (row - 5.5) * 17;
      } else {
        const a = k * 2.4;
        const r = 7 * Math.sqrt(k);
        dx = r * Math.cos(a);
        dy = r * Math.sin(a);
      }
      g.append(el('circle', { cx: x + dx, cy: y + dy, r: 8, fill: SEED_COLORS[(i * 7 + k) % SEED_COLORS.length], stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.5 }));
    }
  }

  function draw(counts, highlight = -1) {
    layer.textContent = '';
    for (let i = 0; i < 14; i++) {
      const { x, y, store } = pos(i);
      const mine = !store && interactive && turn === human && (human === 1 ? i < 6 : i >= 7 && i < 13) && counts[i] > 0;
      const hole = store
        ? el('rect', { x: x - 48, y: 40, width: 96, height: H - 80, rx: 48, fill: '#4a2a12' })
        : el('ellipse', { cx: x, cy: y, rx: 46, ry: 50, fill: '#4a2a12' });
      if (mine) hole.setAttribute('class', 'mc-playable');
      if (i === highlight) {
        hole.setAttribute('stroke', '#ffd166');
        hole.setAttribute('stroke-width', 5);
      }
      hole.dataset.pit = i;
      layer.append(hole);
      const g = el('g', { 'pointer-events': 'none' });
      seedsIn(g, i, Math.min(counts[i], store ? 48 : 20));
      layer.append(g);
      const label = el('text', {
        x,
        y: store ? H - 14 : y < H / 2 ? 38 : H - 26,
        'text-anchor': 'middle',
        fill: '#f2e1c8',
        'font-size': 26,
        'font-weight': 700,
        'pointer-events': 'none',
      });
      label.textContent = counts[i];
      layer.append(label);
    }
  }

  svg.addEventListener('click', (e) => {
    const pit = e.target?.dataset?.pit;
    if (!interactive || pit === undefined) return;
    const i = Number(pit);
    if (turn === human && (human === 1 ? i < 6 : i >= 7 && i < 13) && pits[i] > 0) onMove(i);
  });

  async function render(state, { animate = false } = {}) {
    turn = state.turn;
    if (animate && pits && state.sown.length) {
      const counts = Array.from(pits);
      counts[state.from] = 0;
      const step = Math.max(70, Math.min(160, 1600 / state.sown.length));
      for (const i of state.sown) {
        counts[i]++;
        draw(counts, i);
        await sleep(step);
      }
    }
    pits = state.pits.slice();
    draw(pits);
  }

  return {
    render,
    setInteractive(on, side) {
      interactive = on;
      if (side) human = side;
      if (pits) draw(pits);
    },
    // Put `side`'s row at the bottom (the human's, when playing).
    setSide(side) {
      bottom = side;
      if (pits) draw(pits);
    },
  };
}
