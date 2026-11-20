// Code notes (docs/wiki/code/<sketchId>.md) must point at code that exists:
// every line and piece they explain must still be in the sketch, and every
// equation symbol they explain must be marked in the sketch's equation.
// Change a sketch line that has a note and this fails until the note is updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseCodeNotes, placeCodeNotes, stripSymbolMarks } from '../src/core/codeNotes.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'docs/wiki/code');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.md')) : [];

test('there are code notes to check', () => {
  assert.ok(files.length > 0);
});

for (const f of files) {
  test(`code notes ${f} match the sketch`, () => {
    const notes = parseCodeNotes(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.deepEqual(notes.problems, [], 'format problems');
    assert.ok(notes.file, 'the header needs sketch: <id> or file: <path>');
    if (notes.sketch) assert.equal(notes.sketch, f.replace(/\.md$/, ''), 'a sketch’s notes file must be named after the sketch');
    const srcPath = path.join(ROOT, notes.file);
    assert.ok(fs.existsSync(srcPath), `no file ${notes.file}`);
    const src = fs.readFileSync(srcPath, 'utf8');
    const { missing } = placeCodeNotes(notes, src);
    assert.deepEqual(missing, [], 'notes pointing at code that is no longer there');
    const used = new Set(notes.lines.flatMap((l) => [l.symbol, ...l.pieces.map((p) => p.symbol)]).filter(Boolean));
    for (const s of notes.symbols) {
      assert.ok(src.includes(`\\\\htmlData{sym=${s.id}}`), `symbol ${s.id} isn't marked in the sketch's equation`);
      assert.ok(used.has(s.id), `symbol ${s.id} isn't linked to any line or piece (add "symbol: ${s.id}" under one)`);
    }
  });
}

test('symbol marks are removed for clips and the symbol list', () => {
  assert.equal(stripSymbolMarks('\\htmlData{sym=c}{c}(\\htmlData{sym=t}{t}) + \\htmlData{sym=phi}{\\phi}'), 'c(t) + \\phi');
  assert.equal(stripSymbolMarks('\\htmlData{sym=k}{\\tfrac{1}{2}}'), '\\tfrac{1}{2}');
  assert.equal(stripSymbolMarks('\\htmlData{sym=b}{b_{\\text{shadow}}} = 1'), 'b_{\\text{shadow}} = 1');
  assert.equal(stripSymbolMarks('\\htmlData{sym=d}{\\textcolor{#ffd166}{18}}M'), '\\textcolor{#ffd166}{18}M');
  assert.equal(stripSymbolMarks('\\htmlData{sym=x}{\\{a\\}} b'), '\\{a\\} b');
});
