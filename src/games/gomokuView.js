import { SIZE } from './gomoku.js';

// Gomoku board in SVG: stones sit on the intersections of a 13 × 13 grid.
// Tap near an intersection to play there.
const NS = 'http://www.w3.org/2000/svg';
const GAP = 60;
const MARGIN = 40;
const W = MARGIN * 2 + GAP * (SIZE - 1);

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}
const at = (i) => [MARGIN + (i % SIZE) * GAP, MARGIN + Math.floor(i / SIZE) * GAP];

let boards = 0;

export function createGomokuView(container, { onMove }) {
  const uid = `gm${++boards}`;
  const FILL = { 1: `url(#${uid}-black)`, 2: `url(#${uid}-white)` };
  const svg = el('svg', { viewBox: `0 0 ${W} ${W}`, class: 'game-board gm-board', role: 'img' });
  svg.setAttribute('aria-label', 'Gomoku board');
  const defs = el('defs');
  for (const [id, a, b] of [
    [`${uid}-black`, '#50555f', '#111317'],
    [`${uid}-white`, '#ffffff', '#c8ccd4'],
  ]) {
    const g = el('radialGradient', { id, cx: '35%', cy: '30%', r: '75%' });
    g.append(el('stop', { offset: '0%', 'stop-color': a }), el('stop', { offset: '100%', 'stop-color': b }));
    defs.append(g);
  }
  svg.append(defs, el('rect', { width: W, height: W, rx: 16, fill: '#d6a560' }));
  for (let k = 0; k < SIZE; k++) {
    const p = MARGIN + k * GAP;
    svg.append(
      el('line', { x1: MARGIN, y1: p, x2: W - MARGIN, y2: p, stroke: '#6b4a1c', 'stroke-width': 2.5 }),
      el('line', { x1: p, y1: MARGIN, x2: p, y2: W - MARGIN, stroke: '#6b4a1c', 'stroke-width': 2.5 })
    );
  }
  for (const i of [3 * SIZE + 3, 3 * SIZE + 9, 6 * SIZE + 6, 9 * SIZE + 3, 9 * SIZE + 9]) {
    const [x, y] = at(i);
    svg.append(el('circle', { cx: x, cy: y, r: 6, fill: '#6b4a1c' }));
  }
  const stones = el('g');
  const preview = el('circle', { r: 25, opacity: 0, 'pointer-events': 'none' });
  svg.append(stones, preview);
  container.append(svg);

  let interactive = false;
  let human = 1;
  let current = null;

  function pointAt(e) {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * W;
    const c = Math.round((x - MARGIN) / GAP);
    const r = Math.round((y - MARGIN) / GAP);
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1;
  }
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const i = pointAt(e);
    const ok = interactive && current && current.turn === human && i >= 0 && !current.cells[i];
    preview.setAttribute('opacity', ok ? 0.5 : 0);
    if (ok) {
      const [x, y] = at(i);
      preview.setAttribute('cx', x);
      preview.setAttribute('cy', y);
      preview.setAttribute('fill', FILL[human]);
    }
  });
  svg.addEventListener('pointerleave', () => preview.setAttribute('opacity', 0));
  svg.addEventListener('click', (e) => {
    if (!interactive || !current || current.turn !== human) return;
    const i = pointAt(e);
    if (i >= 0 && !current.cells[i]) onMove(i);
  });

  function render(state) {
    current = state;
    stones.textContent = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = state.cells[i];
      if (!v) continue;
      const [x, y] = at(i);
      stones.append(el('circle', { cx: x, cy: y, r: 26, fill: FILL[v], stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 1.5 }));
      if (i === state.last) stones.append(el('circle', { cx: x, cy: y, r: 7, fill: '#ef476f' }));
    }
    if (state.line?.length) {
      const pts = state.line.map(at).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [a, b] = [pts[0], pts[pts.length - 1]];
      stones.append(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#ef476f', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0.85 }));
    }
    preview.setAttribute('opacity', 0);
    return new Promise((r) => setTimeout(r, 120));
  }

  return {
    render,
    setInteractive(on, side) {
      interactive = on;
      if (side) human = side;
      if (!on) preview.setAttribute('opacity', 0);
    },
  };
}
