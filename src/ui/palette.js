// Colour palettes for the site's interface (not the sketches: their art keeps
// its own colours). The colours themselves are CSS variables in style.css:
// :root is "Classic", and :root[data-palette='<id>'] blocks hold the others.
// The choice is remembered in this browser; ?palette=<id> in the address
// previews one without remembering it.

export const PALETTES = [
  { id: 'classic', name: 'Classic', note: 'near-black and white' },
  { id: 'space', name: 'Deep Space', note: 'indigo, violet and gold' },
  { id: 'dusk', name: 'Dusk', note: 'plum and coral' },
  { id: 'paper', name: 'Paper', note: 'light and warm' },
];
const KEY = 'tks:palette';
const known = (id) => PALETTES.some((p) => p.id === id);

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current = 'classic';
const listeners = new Set();

export function applyPalette(id, { remember = true } = {}) {
  if (!known(id)) id = 'classic';
  current = id;
  if (id === 'classic') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
  // The browser's own bar colour (phones) follows the page background.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0b0b0f');
  if (remember) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* not remembered: private window or storage blocked */
    }
  }
  listeners.forEach((fn) => fn(id));
}

export function initPalette() {
  const fromUrl = new URLSearchParams(location.search).get('palette');
  if (known(fromUrl)) applyPalette(fromUrl, { remember: false });
  else applyPalette(stored() || 'classic', { remember: false });
}

// A labelled <select> that switches the palette; every copy stays in step.
export function paletteSelect() {
  const label = document.createElement('label');
  label.className = 'palette-pick';
  label.innerHTML = '<span>Colours</span>';
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Colour palette');
  for (const p of PALETTES) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    o.title = p.note;
    sel.append(o);
  }
  sel.value = current;
  sel.addEventListener('change', () => applyPalette(sel.value));
  const sync = (id) => (sel.isConnected ? (sel.value = id) : listeners.delete(sync));
  listeners.add(sync);
  label.append(sel);
  return label;
}
