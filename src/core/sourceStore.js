// Raw source text of each sketch file, for display/editing in the code panel.
const rawModules = import.meta.glob('../sketches/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function idFromPath(path) {
  return path.split('/').pop().replace('.js', '');
}

const originalSource = {};
for (const [path, src] of Object.entries(rawModules)) {
  originalSource[idFromPath(path)] = src;
}

const EDIT_KEY = 'tks:code-edits';
// id -> the exact code last written to src/sketches/<id>.js by the dev server.
const SYNCED_KEY = 'tks:disk-synced';
// id -> the exact code last filed under recovered/ (a copy kept without
// overwriting the sketch's file), so boot doesn't file it again every time.
const RECOVERED_KEY = 'tks:disk-recovered';

function loadMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function saveMap(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the disk copy is the one that matters.
  }
}

const edits = loadMap(EDIT_KEY);
const synced = loadMap(SYNCED_KEY);
const recovered = loadMap(RECOVERED_KEY);

// Strips `import` lines and turns `export default {...}` into `return {...}`
// so the source can run as a plain function body (see sketchCompiler.js).
export function toEditable(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .join('\n')
    .replace(/export\s+default/, 'return');
}

// On boot, an edit is redundant once the file on disk says the same thing, or
// once we wrote it to disk earlier and the file has since moved on (git
// checkout, hand edit): the file is the source of truth, so drop the browser
// copy. Edits never written to disk (older sessions, or a server without
// persistence) are kept — diskSync.js carries those over.
function pruneEditsFoundOnDisk() {
  let changed = false;
  for (const id of Object.keys(edits)) {
    if (originalSource[id] === undefined) continue; // custom sketch, no file yet
    const onDisk = toEditable(originalSource[id]).trim() === edits[id].trim();
    if (onDisk || synced[id] === edits[id]) {
      delete edits[id];
      delete synced[id];
      changed = true;
    }
  }
  if (changed) {
    saveMap(EDIT_KEY, edits);
    saveMap(SYNCED_KEY, synced);
  }
}

pruneEditsFoundOnDisk();

export function getEditableSource(id) {
  if (edits[id]) return edits[id];
  return toEditable(originalSource[id] || '');
}

export function hasEdit(id) {
  return Boolean(edits[id]);
}

export function saveEdit(id, code) {
  edits[id] = code;
  saveMap(EDIT_KEY, edits);
}

export function resetEdit(id) {
  delete edits[id];
  delete synced[id];
  delete recovered[id];
  saveMap(EDIT_KEY, edits);
  saveMap(SYNCED_KEY, synced);
  saveMap(RECOVERED_KEY, recovered);
}

// True if this sketch has a file in src/sketches/ as of page load.
export function hasSourceFile(id) {
  return originalSource[id] !== undefined;
}

export function markSynced(id, code) {
  synced[id] = code;
  saveMap(SYNCED_KEY, synced);
}

export function markRecovered(id, code) {
  recovered[id] = code;
  saveMap(RECOVERED_KEY, recovered);
}

// Edits the disk has never seen, minus ones already filed under recovered/.
export function getPendingDiskEdits() {
  return Object.entries(edits).filter(([id, code]) => synced[id] !== code && recovered[id] !== code);
}

// True if the file on disk was written from the code panel this session (or
// an earlier one) — i.e. it may differ from what was there at page load.
export function wasWrittenToDisk(id) {
  return synced[id] !== undefined;
}

// All saved sources, keyed by sketch id — used to replay both edits to
// built-in sketches and entirely custom ones back into the registry on boot.
export function getStoredEdits() {
  return { ...edits };
}
