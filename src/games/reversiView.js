import { SIZE, legalMoves } from './reversi.js';

// Reversi board in SVG. Tap a marked square to play. Captured discs flip: each
// one's width shrinks to zero, it changes colour, and widens again, staggered
// outward from the disc just placed.
const NS = 'http://www.w3.org/2000/svg';
const CELL = 100;
const R = 40;

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
const center = (i) => [CELL * (i % SIZE) + CELL / 2, CELL * Math.floor(i / SIZE) + CELL / 2];

let boards = 0;

export function createReversiView(container, { onMove }) {
  // Gradient ids must be unique per board: with two boards on a page (play
  // and watch), a duplicate id would resolve to the other, possibly hidden,
  // board's gradient and the discs would vanish.
  const uid = `rv${++boards}`;
  const FILL = { 1: `url(#${uid}-black)`, 2: `url(#${uid}-white)` };
  const W = CELL * SIZE;
  const svg = el('svg', { viewBox: `0 0 ${W} ${W}`, class: 'game-board rv-board', role: 'img' });
  svg.setAttribute('aria-label', 'Reversi board');
  const defs = el('defs');
  for (const [id, a, b] of [
    [`${uid}-black`, '#4a4f5c', '#15171c'],
    [`${uid}-white`, '#ffffff', '#c9ced8'],
  ]) {
    const g = el('radialGradient', { id, cx: '35%', cy: '30%', r: '75%' });
    g.append(el('stop', { offset: '0%', 'stop-color': a }), el('stop', { offset: '100%', 'stop-color': b }));
    defs.append(g);
  }
  svg.append(defs, el('rect', { width: W, height: W, rx: 14, fill: '#1f6b4a' }));
  for (let k = 1; k < SIZE; k++) {
    svg.append(
      el('line', { x1: CELL * k, y1: 0, x2: CELL * k, y2: W, stroke: '#0f4430', 'stroke-width': 3 }),
      el('line', { x1: 0, y1: CELL * k, x2: W, y2: CELL * k, stroke: '#0f4430', 'stroke-width': 3 })
    );
  }
  for (const [x, y] of [
    [2, 2],
    [6, 2],
    [2, 6],
    [6, 6],
  ]) svg.append(el('circle', { cx: CELL * x, cy: CELL * y, r: 7, fill: '#0f4430' }));
  const hints = el('g');
  const discs = el('g');
  svg.append(hints, discs);
  container.append(svg);

  let interactive = false;
  let current = null;
  let humanSide = 1;

  svg.addEventListener('click', (e) => {
    if (!interactive || !current) return;
    const rect = svg.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE);
    if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return;
    const index = r * SIZE + c;
    if (legalMoves(current.cells, current.turn).includes(index)) onMove(index);
  });

  function drawHints() {
    hints.textContent = '';
    if (!interactive || !current || current.turn !== humanSide) return;
    for (const i of legalMoves(current.cells, current.turn)) {
      const [x, y] = center(i);
      hints.append(el('circle', { cx: x, cy: y, r: 11, fill: 'rgba(255,255,255,0.28)' }));
    }
  }

  // Draws `state`; if `animate`, the newest disc appears and its captures flip.
  function render(state, { animate = false } = {}) {
    current = state;
    discs.textContent = '';
    const flipped = new Set(animate ? state.flipped : []);
    const flipping = [];
    for (let i = 0; i < 64; i++) {
      const v = state.cells[i];
      if (!v) continue;
      const [x, y] = center(i);
      const d = el('ellipse', { cx: x, cy: y, rx: R, ry: R, fill: FILL[flipped.has(i) ? 3 - v : v] });
      if (flipped.has(i)) flipping.push({ d, v, i });
      discs.append(d);
      if (i === state.last) discs.append(el('circle', { cx: x, cy: y, r: 7, fill: v === 1 ? '#e8ecf4' : '#20232b' }));
    }
    drawHints();
    if (!flipping.length) return Promise.resolve();

    const [lx, ly] = center(state.last);
    const DURATION = 320;
    const start = performance.now();
    const delayOf = (i) => {
      const [x, y] = center(i);
      return Math.hypot(x - lx, y - ly) * 0.35;
    };
    return new Promise((resolve) => {
      function step(now) {
        let running = false;
        for (const { d, v, i } of flipping) {
          const f = Math.max(0, Math.min(1, (now - start - delayOf(i)) / DURATION));
          if (f < 1) running = true;
          d.setAttribute('rx', R * Math.abs(Math.cos(Math.PI * f)));
          d.setAttribute('fill', FILL[f < 0.5 ? 3 - v : v]);
        }
        if (running) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  return {
    render,
    setInteractive(on, side) {
      interactive = on;
      if (side) humanSide = side;
      drawHints();
    },
  };
}
