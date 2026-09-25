import { sketches } from '../core/registry.js';
import { TAXONOMY, getGroupForCategory } from '../core/taxonomy.js';

// Filterable grid of sketch cards, used by the landing page's gallery and the
// viewer's sketch picker. Thumbnails come from public/thumbs/<id>.jpg
// (tools/thumbnails.mjs); a sketch without one gets a generated gradient.

const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function createSketchGrid(container, { onPick, getCurrentId = () => null, filter = () => true, controls = true } = {}) {
  container.classList.add('sketch-grid-wrap');
  container.innerHTML = `
    <div class="grid-controls">
      <div class="chips" role="tablist"></div>
      <input class="grid-search" type="search" placeholder="Search sketches" aria-label="Search sketches" />
    </div>
    <div class="sketch-grid"></div>
    <p class="grid-empty hidden">No sketches match.</p>
  `;
  const chips = container.querySelector('.chips');
  const search = container.querySelector('.grid-search');
  const grid = container.querySelector('.sketch-grid');
  const empty = container.querySelector('.grid-empty');
  let group = 'All';

  function groupOf(s) {
    return s.community ? 'Community' : getGroupForCategory(s.category || 'Uncategorized');
  }

  function renderChips() {
    const used = new Set(sketches.filter(filter).map(groupOf));
    const groups = ['All', ...TAXONOMY.map((g) => g.group), 'Community'].filter((g) => g === 'All' || used.has(g));
    if (!groups.includes(group)) group = 'All';
    chips.textContent = '';
    for (const g of groups) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chip${g === group ? ' active' : ''}`;
      b.textContent = g;
      b.addEventListener('click', () => {
        group = g;
        render();
      });
      chips.append(b);
    }
  }

  function card(s) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sketch-card${s.id === getCurrentId() ? ' current' : ''}`;
    b.style.setProperty('--h', hue(s.id));

    const thumb = document.createElement('div');
    thumb.className = 'sketch-thumb';
    if (!s.community) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = `/thumbs/${encodeURIComponent(s.id)}.jpg`;
      img.addEventListener('error', () => img.remove());
      thumb.append(img);
    }

    const name = document.createElement('span');
    name.className = 'sketch-card-name';
    name.textContent = s.name;
    const meta = document.createElement('span');
    meta.className = 'sketch-card-meta';
    meta.textContent = s.community
      ? `by @${s.community.author}${s.community.status === 'pending' ? ' · pending review' : ''}`
      : s.category || 'Uncategorized';

    b.append(thumb, name, meta);
    b.addEventListener('click', () => onPick?.(s.id));
    return b;
  }

  function render() {
    renderChips();
    const q = search.value.trim().toLowerCase();
    const shown = sketches.filter((s) => {
      if (!filter(s)) return false;
      if (group !== 'All' && groupOf(s) !== group) return false;
      if (!q) return true;
      return [s.name, s.category, ...(s.tags || [])].some((t) => String(t || '').toLowerCase().includes(q));
    });
    grid.textContent = '';
    shown.forEach((s) => grid.append(card(s)));
    empty.classList.toggle('hidden', shown.length > 0);
  }

  if (!controls) container.querySelector('.grid-controls').classList.add('hidden');
  search.addEventListener('input', render);
  render();
  return { refresh: render };
}
