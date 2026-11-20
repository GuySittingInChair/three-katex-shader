// Code notes: hand-written explanations of a sketch's code, line by line and
// piece by piece, kept in docs/wiki/code/<sketchId>.md. Plain JS, no DOM: the
// browser uses it to make code clickable, tests/codeNotes.test.mjs uses it to
// fail the build when a note points at code that no longer exists.
//
// The file format (it also reads as an ordinary wiki page):
//
//   ---
//   summary: …
//   added: 2026-11-20
//   sketch: gradientPlane
//   ---
//   # Gradient Plane: the code, line by line
//
//   ## Symbols                          ← optional: the equation's symbols
//   ### `t` {#t}                        ← how the symbol is written, then its id
//   What t means in the equation. …
//
//   ## Lines
//   ### `vec2 uv = vUv * uScale;`        ← a line, quoted exactly (a trailing
//   What this line does, and why.          // comment may be left off)
//   symbol: t                           ← optional: the symbol this line computes
//   #### `uScale`                        ← a piece inside that line
//   What this piece is, and why it's here.
//
// A line may need "..." to stand for a long middle part: `const x = f(...);`.
// Explanations are Markdown and may link wiki pages, e.g. [uniforms](../uniforms.md).

import { locateQuote } from './codeQuote.js';

const HEADER = /^---\n[\s\S]*?\n---\n+/;
// A heading that is one code span: `x`, or ``x`` when x itself contains a backtick
// (Markdown pads those with a space, which is trimmed). -> [all, text, id]
const code = (s) => {
  const m = /^(`+)(.+?)\1(?:\s*\{#([\w-]+)\})?\s*$/.exec(s.trim());
  return m && [m[0], m[2].trim(), m[3]];
};

export function parseCodeNotes(md) {
  const sketch = /^sketch:\s*([\w-]+)\s*$/m.exec((HEADER.exec(md) || [''])[0])?.[1] || null;
  const body = md.replace(HEADER, '');
  const notes = { sketch, title: (/^# (.+)$/m.exec(body) || [])[1] || '', symbols: [], lines: [], problems: [] };
  let section = null;
  let current = null; // the line or symbol or piece whose text we're collecting
  let line = null; // the latest line note, which pieces belong to
  const flush = () => {
    if (!current) return;
    const text = current.bodyLines.join('\n').trim();
    const sym = /^symbol:\s*([\w-]+)\s*$/m.exec(text);
    if (sym) current.symbol = sym[1];
    current.body = text.replace(/^symbol:\s*[\w-]+\s*$/m, '').trim();
    delete current.bodyLines;
    current = null;
  };
  for (const raw of body.split('\n')) {
    const h2 = /^## (.+)$/.exec(raw);
    const h3 = /^### (.+)$/.exec(raw);
    const h4 = /^#### (.+)$/.exec(raw);
    if (h2) {
      flush();
      section = /symbol/i.test(h2[1]) ? 'symbols' : /line/i.test(h2[1]) ? 'lines' : null;
      line = null;
    } else if (h3 && section) {
      flush();
      const m = code(h3[1]);
      if (!m) {
        notes.problems.push(`heading is not a single code span: ${h3[1]}`);
        continue;
      }
      if (section === 'symbols') {
        if (!m[2]) notes.problems.push(`symbol ${m[1]} has no {#id}`);
        current = { id: m[2] || m[1], tex: m[1], bodyLines: [] };
        notes.symbols.push(current);
      } else {
        current = line = { text: m[1], pieces: [], bodyLines: [] };
        notes.lines.push(current);
      }
    } else if (h4 && section === 'lines' && line) {
      flush();
      const m = code(h4[1]);
      if (!m) {
        notes.problems.push(`piece heading is not a single code span: ${h4[1]}`);
        continue;
      }
      if (!line.text.includes(m[1])) notes.problems.push(`piece \`${m[1]}\` is not inside \`${line.text}\``);
      current = { text: m[1], bodyLines: [] };
      line.pieces.push(current);
    } else if (current) {
      current.bodyLines.push(raw);
    }
  }
  flush();
  for (const l of notes.lines) {
    if (!l.body) notes.problems.push(`no explanation for \`${l.text}\``);
    for (const p of l.pieces) if (!p.body) notes.problems.push(`no explanation for piece \`${p.text}\``);
    if (l.symbol && !notes.symbols.some((s) => s.id === l.symbol)) notes.problems.push(`\`${l.text}\` names symbol ${l.symbol}, which isn't listed`);
  }
  return notes;
}

// Where each note sits in `source` (the text the reader sees).
// -> [{ note, line (1-based), pieces: [{ piece, start, end }] }] and the notes that weren't found.
export function placeCodeNotes(notes, source) {
  const lines = source.split('\n');
  const placed = [];
  const missing = [];
  for (const note of notes.lines) {
    // The code panel shows `export default {` as `return {` (see toEditable in sourceStore.js).
    const hit = locateQuote(note.text, source) || (/^export default\b/.test(note.text) && locateQuote(note.text.replace(/^export default/, 'return'), source));
    if (!hit) {
      missing.push(note.text);
      continue;
    }
    const n = hit.start;
    const text = lines[n - 1];
    const pieces = [];
    for (const piece of note.pieces) {
      const at = text.indexOf(piece.text);
      if (at === -1) missing.push(`${note.text} → ${piece.text}`);
      else pieces.push({ piece, start: at, end: at + piece.text.length });
    }
    placed.push({ note, line: n, pieces });
  }
  return { placed, missing };
}

// \htmlData{sym=kappa}{\kappa} marks a symbol in a sketch's equation so it can
// be clicked. Recorded clips (MathJax) and the symbol list don't know the
// command, so they get the plain symbol back.
export const stripSymbolMarks = (tex) => (tex || '').replace(/\\htmlData\{sym=[\w-]+\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
