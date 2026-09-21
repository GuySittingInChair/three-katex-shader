import { compileSketch } from './sketchCompiler.js';
import { getStoredEdits } from './sourceStore.js';
import { TAXONOMY } from './taxonomy.js';

const modules = import.meta.glob('../sketches/*.js', { eager: true });

export const sketches = Object.entries(modules)
  .map(([path, mod]) => ({
    id: path.split('/').pop().replace('.js', ''),
    ...mod.default,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function getSketchById(id) {
  return sketches.find((s) => s.id === id);
}

// Replaces a sketch definition in place (same array position) so live edits
// take effect without re-running import.meta.glob discovery.
export function updateSketch(id, def) {
  const idx = sketches.findIndex((s) => s.id === id);
  if (idx === -1) return;
  sketches[idx] = { id, ...def };
}

function slugify(name) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const existing = new Set(sketches.map((s) => s.id));
  let id = base || 'sketch';
  let n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  return id;
}

// Registers a brand-new sketch (created in the code panel, not a file on
// disk). Pass explicitId when restoring one that already had an id assigned
// (see hydrateFromStorage below) — otherwise a fresh unique id is slugified
// from the name.
export function addSketch(def, explicitId) {
  const entry = { id: explicitId || slugify(def.name), ...def };
  sketches.push(entry);
  return entry;
}

export function getCategories() {
  return Array.from(new Set(sketches.map((s) => s.category || 'Uncategorized'))).sort();
}

// Groups the categories currently in use under the taxonomy's top-level
// groups (see core/taxonomy.js), preserving taxonomy order. Any in-use
// category the taxonomy doesn't know about (e.g. a custom one typed into
// the new-sketch form) lands under Experiments. Groups with nothing in
// them are omitted.
export function getGroupedCategories() {
  const used = new Set(sketches.map((s) => s.category || 'Uncategorized'));
  const known = new Set(TAXONOMY.flatMap((g) => g.categories));

  const groups = TAXONOMY.map(({ group, categories }) => ({
    group,
    categories: categories.filter((c) => used.has(c)),
  }));

  const leftover = Array.from(used).filter((c) => !known.has(c)).sort();
  if (leftover.length) {
    const experiments = groups.find((g) => g.group === 'Experiments');
    experiments.categories.push(...leftover);
  }

  return groups.filter((g) => g.categories.length > 0);
}

// Removes a sketch by id, splicing it out of the shared array. Returns the
// removed index, or -1 if not found.
export function removeSketch(id) {
  const idx = sketches.findIndex((s) => s.id === id);
  if (idx === -1) return -1;
  sketches.splice(idx, 1);
  return idx;
}

// Replays saved sources from localStorage on boot: reapplies edits made to
// built-in sketches, and re-registers sketches created entirely in the code
// panel (which have no backing file, so they'd otherwise vanish on reload).
function hydrateFromStorage() {
  const stored = getStoredEdits();
  for (const [id, source] of Object.entries(stored)) {
    try {
      const def = compileSketch(source);
      if (sketches.some((s) => s.id === id)) {
        updateSketch(id, def);
      } else {
        addSketch(def, id);
      }
    } catch {
      // Skip anything that no longer compiles rather than breaking startup.
    }
  }
}

hydrateFromStorage();
