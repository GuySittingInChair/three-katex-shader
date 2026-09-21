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

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(EDIT_KEY)) || {};
  } catch {
    return {};
  }
}

const edits = loadEdits();

// Strips `import` lines and turns `export default {...}` into `return {...}`
// so the source can run as a plain function body (see sketchCompiler.js).
export function toEditable(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .join('\n')
    .replace(/export\s+default/, 'return');
}

export function getEditableSource(id) {
  if (edits[id]) return edits[id];
  return toEditable(originalSource[id] || '');
}

export function hasEdit(id) {
  return Boolean(edits[id]);
}

export function saveEdit(id, code) {
  edits[id] = code;
  localStorage.setItem(EDIT_KEY, JSON.stringify(edits));
}

export function resetEdit(id) {
  delete edits[id];
  localStorage.setItem(EDIT_KEY, JSON.stringify(edits));
}

// All saved sources, keyed by sketch id — used to replay both edits to
// built-in sketches and entirely custom ones back into the registry on boot.
export function getStoredEdits() {
  return { ...edits };
}
