// Client half of vite.config.js's sketch-persist plugin: sketches edited or
// created in the code panel are written to src/sketches/*.js (where git can
// see them) instead of living only in this browser's localStorage.
//
// Every call resolves to { ok, ... } and never throws. Off the dev server
// (a hosted build, or a dev server started before the plugin existed) the
// fetch just fails and the panel keeps working from localStorage as before.

import { getPendingDiskEdits, hasSourceFile, markRecovered, markSynced } from './sourceStore.js';

const ENABLED = import.meta.env.DEV;

async function call(method, id, { code, recover = false } = {}) {
  if (!ENABLED) return { ok: false, error: 'not running under the dev server' };
  try {
    const res = await fetch(`/__sketches/${encodeURIComponent(id)}${recover ? '?recover=1' : ''}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: code === undefined ? undefined : JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: `dev server has no sketch persistence (HTTP ${res.status}) — restart npm run dev` };
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Writes the code panel's source for `id` to src/sketches/<id>.js.
export async function persistSketch(id, code) {
  const result = await call('POST', id, { code });
  if (result.ok) markSynced(id, code);
  return result;
}

// Moves the sketch's file to .trash/ (recoverable). No-op if it has no file.
export function trashSketch(id) {
  return call('DELETE', id);
}

// Carries edits that only ever lived in this browser over to disk: brand-new
// sketches become new files; edits to an existing file are filed under
// recovered/ rather than overwriting it (the file may be newer than the edit).
export async function syncPendingToDisk() {
  if (!ENABLED) return;
  let saved = 0;
  let filed = 0;
  for (const [id, code] of getPendingDiskEdits()) {
    if (hasSourceFile(id)) {
      const r = await call('POST', id, { code, recover: true });
      if (r.ok) {
        markRecovered(id, code);
        filed++;
      } else if (r.error) {
        console.warn(`[sketches] couldn't file "${id}" under recovered/: ${r.error}`);
        return; // server not persisting; don't spam one warning per sketch
      }
    } else {
      const r = await persistSketch(id, code);
      if (r.ok) saved++;
      else {
        console.warn(`[sketches] couldn't save "${id}" to disk: ${r.error}`);
        if (/restart npm run dev|Failed to fetch/.test(r.error || '')) return;
      }
    }
  }
  if (saved || filed) {
    console.info(`[sketches] carried over from browser storage: ${saved} saved to src/sketches/, ${filed} filed under recovered/`);
  }
}
