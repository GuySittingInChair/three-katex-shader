import { COLS, ROWS, winningLine } from './connectFour.js';

// Connect Four board in SVG. Tiles sit behind a blue board with round holes,
// so they show through; a dropped tile falls under gravity, y = y₀ + ½gt²,
// and bounces once (keeping 25% of its speed). Tap or click anywhere in a
// column to drop there.
const NS = 'http://www.w3.org/2000/svg';
const CELL = 100;
const TOP = 60; // room above the board for the preview tile
const G = 5200; // board units per second²
const COLORS = { 1: '#ffd166', 2: '#ef476f' };

const cx = (c) => CELL / 2 + CELL * c;
const cy = (r) => TOP + CELL * (ROWS - 1 - r) + CELL / 2;

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

let boards = 0;

export function createConnectFourView(container, { onMove }) {
  const uid = `c4-holes-${++boards}`; // unique per board, or a second board's mask would point at the first
  const W = CELL * COLS;
  const H = TOP + CELL * ROWS;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'game-board c4-board', role: 'img' });
  svg.setAttribute('aria-label', 'Connect Four board');

  const defs = el('defs');
  const mask = el('mask', { id: uid });
  mask.append(el('rect', { x: 0, y: TOP, width: W, height: H - TOP, fill: 'white' }));
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) mask.append(el('circle', { cx: cx(c), cy: cy(r), r: 40, fill: 'black' }));
  }
  defs.append(mask);

  const tiles = el('g');
  const preview = el('circle', { r: 40, cy: TOP / 2 + 4, opacity: 0, class: 'c4-preview' });
  const board = el('rect', { x: 0, y: TOP, width: W, height: H - TOP, rx: 18, fill: '#2848b8', mask: `url(#${uid})` });
  const hover = el('rect', { y: TOP, width: CELL, height: H - TOP, fill: 'white', opacity: 0, 'pointer-events': 'none' });
  svg.append(defs, tiles, board, hover, preview);
  container.append(svg);

  let interactive = false;
  let humanColor = COLORS[1];
  let current = null;

  function columnAt(evt) {
    const rect = svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
  }
  function showHover(c) {
    const open = interactive && current && current.heights[c] < ROWS;
    preview.setAttribute('opacity', open ? 0.85 : 0);
    hover.setAttribute('opacity', open ? 0.06 : 0);
    preview.setAttribute('cx', cx(c));
    preview.setAttribute('fill', humanColor);
    hover.setAttribute('x', CELL * c);
  }
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') showHover(columnAt(e));
  });
  svg.addEventListener('pointerleave', () => {
    preview.setAttribute('opacity', 0);
    hover.setAttribute('opacity', 0);
  });
  svg.addEventListener('click', (e) => {
    if (!interactive) return;
    const c = columnAt(e);
    if (current && current.heights[c] < ROWS) onMove(c);
  });

  function tile(c, r, player) {
    return el('circle', { cx: cx(c), cy: cy(r), r: 40, fill: COLORS[player], class: 'c4-tile', 'data-cell': c * ROWS + r });
  }

  // Draws `state`; if `drop`, the last tile falls in from above.
  function render(state, { drop = false } = {}) {
    current = state;
    tiles.textContent = '';
    let falling = null;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = state.cells[c * ROWS + r];
        if (!v) continue;
        const t = tile(c, r, v);
        if (drop && c * ROWS + r === state.last) falling = t;
        tiles.append(t);
      }
    }
    if (state.winner && state.last >= 0) {
      const line = winningLine(state, Math.floor(state.last / ROWS), state.last % ROWS);
      for (const [c, r] of line || []) tiles.querySelector(`[data-cell="${c * ROWS + r}"]`)?.classList.add('c4-win');
    }
    if (!falling) return Promise.resolve();

    const target = Number(falling.getAttribute('cy'));
    const start = TOP / 2;
    return new Promise((resolve) => {
      let y = start;
      let v = 0;
      let bounced = false;
      let last = performance.now();
      falling.setAttribute('cy', start);
      function step(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        v += G * dt;
        y += v * dt;
        if (y >= target) {
          y = target;
          if (!bounced && v > 400) {
            v = -0.25 * v;
            bounced = true;
          } else {
            falling.setAttribute('cy', target);
            return resolve();
          }
        }
        falling.setAttribute('cy', y);
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  return {
    render,
    setInteractive(on, side) {
      interactive = on;
      if (side) humanColor = COLORS[side];
      if (!on) {
        preview.setAttribute('opacity', 0);
        hover.setAttribute('opacity', 0);
      }
    },
    colors: COLORS,
  };
}
