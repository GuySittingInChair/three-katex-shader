// The beginner wiki (docs/wiki): every page has a summary for small spaces,
// and every link between pages lands on a page that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readWikiMeta, parseFrontmatter } from '../tools/wikiMeta.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const meta = readWikiMeta(ROOT, { dates: false });
const slugs = Object.keys(meta);
const read = (slug) => parseFrontmatter(fs.readFileSync(path.join(ROOT, 'docs/wiki', `${slug}.md`), 'utf8')).body;

test('every wiki page has the date it was added (it dates the RSS feed)', () => {
  const bad = slugs.filter((s) => !/^\d{4}-\d{2}-\d{2}T/.test(meta[s].added || ''));
  assert.deepEqual(bad, []);
});

test('every wiki page has a one-line summary', () => {
  const missing = slugs.filter((s) => !meta[s].summary);
  assert.deepEqual(missing, []);
  for (const s of slugs) assert.ok(!meta[s].summary.includes('\n'), `${s}: summary must be one line`);
});

test('every link between wiki pages lands on a page that exists', () => {
  const broken = [];
  for (const s of slugs) {
    const dir = path.posix.dirname(s);
    for (const [, href] of read(s).matchAll(/\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      const target = path.posix.normalize(path.posix.join(dir, href)).replace(/\.md$/, '');
      if (!meta[target]) broken.push(`${s} → ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every code concept in src/core/wiki.js names a real wiki page', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/core/wiki.js'), 'utf8');
  const pages = [...src.matchAll(/\{ page: '([\w/-]+)'/g)].map((m) => m[1]);
  assert.ok(pages.length > 10);
  assert.deepEqual(pages.filter((p) => !meta[p]), []);
});

// Same rule as glossaryId in src/core/wiki.js.
const glossaryId = (term) =>
  term.replace(/\(.*?\)/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('every link to a glossary word lands on that word', () => {
  const ids = new Set([...read('glossary').matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => glossaryId(m[1])));
  const bad = [];
  for (const s of slugs) {
    if (s === 'README' || s === 'glossary') continue;
    for (const [all, text, hash] of read(s).matchAll(/\[([^\]]*)\]\((?:\.\.\/)*glossary\.md(?:#([^)]*))?\)/g)) {
      if (/^glossary$/i.test(text) && !hash) continue; // a link to the glossary page itself
      if (!hash || !ids.has(hash)) bad.push(`${s}: ${all}`);
    }
  }
  assert.deepEqual(bad, []);
});

// Every code block in the wiki quotes real code, exactly (see src/core/codeQuote.js
// for what counts: "..." marks skipped lines, a trailing // comment may be left off).
// Change a quoted line in a sketch and this fails until the page is updated.
import { wikiCodeBlocks, findQuote } from '../src/core/codeQuote.js';

const readSrc = (p) => (fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : null);
const resolveName = (n) =>
  n.startsWith('src/') || n.startsWith('tools/')
    ? [n]
    : ['sketches', 'lib', 'core', 'ui'].map((d) => `src/${d}/${n}`).filter((p) => readSrc(p) != null);

test('every code block in the wiki matches the code it quotes', () => {
  const stale = [];
  let checked = 0;
  for (const s of slugs) {
    for (const b of wikiCodeBlocks(read(s), s, resolveName)) {
      if (!b.quote) continue;
      checked++;
      if (!findQuote(b, readSrc)) stale.push(`${s}, block ${b.index + 1}: ${b.code.split('\n')[0].trim().slice(0, 80)}`);
    }
  }
  assert.ok(checked > 100, `only ${checked} blocks checked`);
  assert.deepEqual(stale, []);
});
