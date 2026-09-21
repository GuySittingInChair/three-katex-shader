// Turns the code panel's "editable source" back into a real sketch module.
//
// The panel edits a sketch as a plain function body: sourceStore.toEditable()
// strips every `import` line and rewrites `export default` to `return`, and
// sketchCompiler passes the helper names in as parameters. Saving to disk is
// the inverse:
//
//   - the sketch file's own single-line imports are kept (new sketches have none);
//   - any helper the body uses that isn't imported yet gets one added import
//     line from core/sketchHelpers.js (one line, so toEditable strips it again);
//   - the last column-0 `return` becomes `export default`.
//
// Pure functions, no Vite — so they can be tested from node directly.

import { transformSync } from 'esbuild';

const IMPORT_LINE = /^\s*import\s/;

// Names bound by single-line imports: `import * as X`, `import D`, `import { a, b as c }`.
function importedNames(lines) {
  const names = new Set();
  for (const line of lines) {
    const ns = line.match(/import\s+\*\s+as\s+(\w+)/);
    if (ns) names.add(ns[1]);
    const def = line.match(/import\s+(\w+)\s*(?:,|from)/);
    if (def) names.add(def[1]);
    const named = line.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const bound = part.trim().split(/\s+as\s+/).pop();
        if (bound) names.add(bound);
      }
    }
  }
  return names;
}

// Helper names, read from the `export { ... }` block of core/sketchHelpers.js.
export function parseHelperNames(helpersSource) {
  const block = helpersSource.match(/export\s*\{([^}]*)\}/);
  if (!block) throw new Error('sketchHelpers.js has no export { ... } block');
  return block[1].split(',').map((n) => n.trim()).filter(Boolean);
}

// existingFile: the current text of src/sketches/<id>.js, or null for a new sketch.
// Returns the module text; throws with a readable message if it wouldn't parse.
export function editableToModule(existingFile, editable, helperNames) {
  const keptImports = existingFile ? existingFile.split('\n').filter((l) => IMPORT_LINE.test(l)) : [];
  const body = editable.split('\n').filter((l) => !IMPORT_LINE.test(l)).join('\n');

  const returns = [...body.matchAll(/^return\b/gm)];
  if (!returns.length) {
    throw new Error('no top-level `return {` found — put the sketch object in a `return` at the start of a line');
  }
  const at = returns[returns.length - 1].index;
  const moduleBody = body.slice(0, at) + 'export default' + body.slice(at + 'return'.length);

  // Scan for helper use ignoring comments, template-literal text (GLSL), '…'/"…"
  // strings, `.property` names and object keys. Only the `${…}` code inside a
  // template counts: `${lerp(…)}` is real, the word "TAU" in shader text is not.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:[^`\\]|\\.)*`/g, (tpl) => [...tpl.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' '))
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
    .replace(/(^|[{,])(\s*)\w+(\s*:)/gm, '$1$2_$3'); // object keys, e.g. `segments: [200, 100]`
  const uses = (n) => new RegExp(`(?<![.\\w$])${n}(?![\\w$])`).test(code);
  const declared = (n) => new RegExp(`\\b(?:const|let|var|function|class)\\s+${n}\\b`).test(body);
  const have = importedNames(keptImports);
  const needed = helperNames.filter((n) => !have.has(n) && uses(n) && !declared(n));
  const lines = [...keptImports];
  if (needed.length) lines.push(`import { ${needed.join(', ')} } from '../core/sketchHelpers.js';`);

  const text = (lines.length ? lines.join('\n') + '\n\n' : '') + moduleBody.trim() + '\n';
  try {
    transformSync(text, { loader: 'js', format: 'esm' });
  } catch (err) {
    throw new Error(`generated module doesn't parse: ${err.errors?.[0]?.text || err.message}`);
  }
  return text;
}
