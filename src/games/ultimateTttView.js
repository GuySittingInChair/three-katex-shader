import { openBoards } from './ultimateTtt.js';

// Ultimate tic-tac-toe in SVG: nine small boards in a big grid. The boards you
// may play in glow; a won board is covered by a big X or O.
const NS = 'http://www.w3.org/2000/svg';
const SIZE = 900;
const BOARD = 300;
const PAD = 16;
const CELL = (BOARD - 2 * PAD) / 3;
const COLOR = { 1: '#7cc4ff', 2: '#ff9f5a' };

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
const origin = (b) => [(b % 3) * BOARD + PAD, Math.floor(b / 3) * BOARD + PAD];

function mark(g, player, cx, cy, r, width, opacity = 1) {
  if (player === 1) {
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
    ]) {
      g.append(el('line', { x1: cx - r * dx, y1: cy - r * dy, x2: cx + r * dx, y2: cy + r * dy, stroke: COLOR[1], 'stroke-width': width, 'stroke-linecap': 'round', opacity }));
    }
  } else {
    g.append(el('circle', { cx, cy, r, fill: 'none', stroke: COLOR[2], 'stroke-width': width, opacity }));
  }
}

export function createUltimateTttView(container, { onMove }) {
  const svg = el('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'game-board ut-board', role: 'img' });
  svg.setAttribute('aria-label', 'Ultimate tic-tac-toe board');
  svg.append(el('rect', { width: SIZE, height: SIZE, rx: 18, fill: '#141821' }));
  const layer = el('g');
  svg.append(layer);
  container.append(svg);

  let interactive = false;
  let human = 1;
  let current = null;

  function draw(state) {
    layer.textContent = '';
    const allowed = new Set(interactive && state.turn === human ? openBoards(state) : []);
    for (let b = 0; b < 9; b++) {
      const [ox, oy] = origin(b);
      if (allowed.has(b)) {
        layer.append(el('rect', { x: ox - 8, y: oy - 8, width: BOARD - 2 * PAD + 16, height: BOARD - 2 * PAD + 16, rx: 12, fill: 'rgba(255, 209, 102, 0.12)', stroke: 'rgba(255, 209, 102, 0.55)', 'stroke-width': 3 }));
      }
      for (let k = 1; k < 3; k++) {
        layer.append(
          el('line', { x1: ox + k * CELL, y1: oy + 6, x2: ox + k * CELL, y2: oy + 3 * CELL - 6, stroke: '#3a4254', 'stroke-width': 4, 'stroke-linecap': 'round' }),
          el('line', { x1: ox + 6, y1: oy + k * CELL, x2: ox + 3 * CELL - 6, y2: oy + k * CELL, stroke: '#3a4254', 'stroke-width': 4, 'stroke-linecap': 'round' })
        );
      }
      for (let c = 0; c < 9; c++) {
        const v = state.cells[b * 9 + c];
        const cx = ox + (c % 3) * CELL + CELL / 2;
        const cy = oy + Math.floor(c / 3) * CELL + CELL / 2;
        if (b * 9 + c === state.last) layer.append(el('rect', { x: cx - CELL / 2 + 4, y: cy - CELL / 2 + 4, width: CELL - 8, height: CELL - 8, rx: 8, fill: 'rgba(255,255,255,0.08)' }));
        if (v) mark(layer, v, cx, cy, CELL * 0.28, 9, state.boards[b] ? 0.35 : 1);
      }
      const center = [ox + (BOARD - 2 * PAD) / 2, oy + (BOARD - 2 * PAD) / 2];
      if (state.boards[b] === 1 || state.boards[b] === 2) mark(layer, state.boards[b], center[0], center[1], BOARD * 0.36, 22, 0.9);
      else if (state.boards[b] === 3) layer.append(el('rect', { x: ox, y: oy, width: 3 * CELL, height: 3 * CELL, rx: 10, fill: 'rgba(150,160,180,0.18)' }));
    }
    for (let k = 1; k < 3; k++) {
      layer.append(
        el('line', { x1: k * BOARD, y1: 10, x2: k * BOARD, y2: SIZE - 10, stroke: '#8d96a8', 'stroke-width': 6, 'stroke-linecap': 'round' }),
        el('line', { x1: 10, y1: k * BOARD, x2: SIZE - 10, y2: k * BOARD, stroke: '#8d96a8', 'stroke-width': 6, 'stroke-linecap': 'round' })
      );
    }
  }

  svg.addEventListener('click', (e) => {
    if (!interactive || !current || current.turn !== human) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    const b = Math.floor(y / BOARD) * 3 + Math.floor(x / BOARD);
    const [ox, oy] = origin(b);
    const cx = Math.floor((x - ox) / CELL);
    const cy = Math.floor((y - oy) / CELL);
    if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return;
    const index = b * 9 + cy * 3 + cx;
    if (openBoards(current).includes(b) && current.cells[index] === 0) onMove(index);
  });

  return {
    render(state) {
      current = state;
      draw(state);
      return new Promise((r) => setTimeout(r, 120));
    },
    setInteractive(on, side) {
      interactive = on;
      if (side) human = side;
      if (current) draw(current);
    },
  };
}
