import { sketches } from '../core/registry.js';
import { TAXONOMY, getGroupForCategory } from '../core/taxonomy.js';
import { isAdmin } from '../core/community.js';
import { isPublished, setPublished } from '../core/sketchSettings.js';

// Filterable grid of sketch cards: the landing page's gallery, the viewer's
// picker and profiles. Shows published sketches; drafts appear under their
// own "Drafts" chip for the admin (and for the author of a pending shared
// sketch), and the admin gets a publish toggle on each card.
// Thumbnails come from public/thumbs/<id>.jpg (tools/thumbnails.mjs); a
// sketch without one gets a generated gradient.

const hue = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const canSeeDraft = (s) => isAdmin() || Boolean(s.community?.mine);

export function createSketchGrid(
  container,
  { onPick, getCurrentId = () => null, filter = () => true, controls = true, showDrafts = () => false, mixDrafts = false } = {}
) {
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
    if (!isPublished(s)) return 'Drafts';
    return s.community ? 'Community' : getGroupForCategory(s.category || 'Uncategorized');
  }

  // Everything this grid could show, before chips and search.
  function candidates() {
    return sketches.filter((s) => filter(s) && (isPublished(s) || (showDrafts() && canSeeDraft(s))));
  }

  function renderChips(pool) {
    const used = new Set(pool.map(groupOf));
    const groups = ['All', ...TAXONOMY.map((g) => g.group), 'Community', 'Drafts'].filter(
      (g) => g === 'All' || used.has(g)
    );
    if (!groups.includes(group)) group = 'All';
    chips.textContent = '';
    for (const g of groups) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chip${g === group ? ' active' : ''}${g === 'Drafts' ? ' chip-drafts' : ''}`;
      b.textContent = g;
      b.addEventListener('click', () => {
        group = g;
        render();
      });
      chips.append(b);
    }
  }

  function card(s) {
    const published = isPublished(s);
    const b = document.createElement('div');
    b.className = `sketch-card${s.id === getCurrentId() ? ' current' : ''}${published ? '' : ' draft'}`;
    b.style.setProperty('--h', hue(s.id));
    b.tabIndex = 0;
    b.setAttribute('role', 'button');

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
    const pending = s.community?.status === 'pending' ? ' · waiting for review' : '';
    meta.textContent = s.community ? `by @${s.community.author}${pending}` : s.category || 'Uncategorized';
    if (!published) meta.textContent = `Draft · ${meta.textContent}`;

    b.append(thumb, name, meta);

    // Publishing a built-in sketch; shared ones are approved in Review.
    if (isAdmin() && !s.community) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'card-publish';
      toggle.textContent = published ? 'Unpublish' : 'Publish';
      toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        toggle.disabled = true;
        try {
          await setPublished(s.id, !published);
        } catch (err) {
          toggle.textContent = 'Failed';
          toggle.title = err.message;
        }
      });
      thumb.append(toggle);
    }

    const open = () => onPick?.(s.id);
    b.addEventListener('click', open);
    b.addEventListener('keydown', (e) => {
      if (e.target === b && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open();
      }
    });
    return b;
  }

  function render() {
    const pool = candidates();
    renderChips(pool);
    const q = search.value.trim().toLowerCase();
    const shown = pool.filter((s) => {
      const g = groupOf(s);
      if (group === 'All' ? g === 'Drafts' && !mixDrafts : g !== group) return false;
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
