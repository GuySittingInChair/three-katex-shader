// How much of each sketch's code has a hand-written explanation (docs/wiki/code/<id>.md).
//   node tools/code-notes-coverage.mjs           all sketches, worst-covered walkthrough sketches first
//   node tools/code-notes-coverage.mjs --md      the same as a Markdown table
// A line counts if a note explains it; blank lines, comments and lone brackets don't count.
import fs from 'node:fs';
import path from 'node:path';
import { parseCodeNotes, placeCodeNotes } from '../src/core/codeNotes.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rows = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/sketches')).filter((x) => x.endsWith('.js')).sort()) {
  const id = f.replace(/\.js$/, '');
  const src = fs.readFileSync(path.join(ROOT, 'src/sketches', f), 'utf8');
  const lines = src.split('\n');
  const counted = lines.map((l) => l.trim()).filter((t) => t && !/^(\/\/|\/\*|\*|import\s)/.test(t) && !/^[\]})`;,(]+$/.test(t)).length;
  const notesFile = path.join(ROOT, 'docs/wiki/code', `${id}.md`);
  let covered = 0;
  let pieces = 0;
  if (fs.existsSync(notesFile)) {
    const notes = parseCodeNotes(fs.readFileSync(notesFile, 'utf8'));
    const { placed } = placeCodeNotes(notes, src);
    covered = new Set(placed.map((p) => p.line)).size;
    pieces = placed.reduce((a, p) => a + p.pieces.length, 0);
  }
  const walk = fs.existsSync(path.join(ROOT, 'docs/wiki/sketches', `${id}.md`));
  rows.push({ id, walk, counted, covered, pieces, pct: counted ? Math.round((100 * covered) / counted) : 0 });
}
rows.sort((a, b) => (b.walk - a.walk) || (a.pct - b.pct) || a.id.localeCompare(b.id));
const withNotes = rows.filter((r) => r.covered);
if (process.argv.includes('--md')) {
  console.log('| Sketch | Walkthrough | Lines explained | Pieces explained |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.walk ? 'yes' : ''} | ${r.covered} of ${r.counted} (${r.pct}%) | ${r.pieces} |`);
} else {
  for (const r of rows) console.log(`${r.walk ? 'W' : ' '} ${String(r.pct).padStart(3)}%  ${String(r.covered).padStart(3)}/${String(r.counted).padEnd(4)} ${r.id}`);
}
console.log(`\n${withNotes.length} of ${rows.length} sketches have code notes; ${rows.filter((r) => r.walk).length} have walkthroughs.`);
