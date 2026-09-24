import { addSketch, updateSketch, getSketchById } from './registry.js';
import { compileSketch } from './sketchCompiler.js';
import { hasEdit } from './sourceStore.js';
import { listSharedSketches, onAuthChange, getUser } from './community.js';

// Shared sketches from the database join the sketch list. A sketch is code
// that runs with this page's full access (including the visitor's session),
// so only two kinds ever run automatically: ones the admin approved, and the
// visitor's own. Everything else pending is reviewed as text in the Review
// panel first (and the admin sees all pending rows, so the filter matters).

export const communityId = (row) => `community-${row.id.slice(0, 8)}`;

export function createCommunitySketches(manager, { onListChange } = {}) {
  const registered = new Set();

  function register(row, me) {
    const id = communityId(row);
    const meta = {
      id: row.id,
      author: row.author?.username ?? 'someone',
      status: row.status,
      mine: row.user_id === me,
    };
    const existing = getSketchById(id);
    if (existing && hasEdit(id)) {
      existing.community = meta; // the author's local edits win over the shared copy
    } else {
      const def = { ...compileSketch(row.code), community: meta };
      if (existing) updateSketch(id, def);
      else addSketch(def, id);
    }
    registered.add(id);
  }

  async function load(user) {
    let rows;
    try {
      rows = await listSharedSketches();
    } catch (err) {
      console.warn(`[community] couldn't load shared sketches: ${err.message}`);
      return;
    }
    const me = user?.id;
    const allowed = rows.filter((r) => r.status === 'approved' || r.user_id === me);
    const keep = new Set(allowed.map(communityId));

    for (const id of [...registered]) {
      if (keep.has(id)) continue;
      registered.delete(id);
      if (getSketchById(id)) manager.removeSketch(id);
    }
    for (const row of allowed) {
      try {
        register(row, me);
      } catch (err) {
        console.warn(`[community] skipped "${row.name}": ${err.message}`);
      }
    }
    // Appended after the built-in sketches (not re-sorted), so the index of
    // whatever is on screen stays valid.
    onListChange?.();
  }

  onAuthChange((user) => load(user));

  return {
    reload: () => load(getUser()),
  };
}
