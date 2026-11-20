// Reads the small header at the top of each wiki page (docs/wiki/**/*.md):
//
//   ---
//   summary: One line for small spaces (hover cards, search, previews, RSS).
//   tags: astronomy, data
//   ---
//
// The page itself has no length limit; anything shown in a small space uses
// `summary` instead. Shared by the Vite build (virtual:wiki-meta), the RSS
// feed and the tests. Node only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { wikiCodeBlocks, findQuote } from '../src/core/codeQuote.js';

export function parseFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (!kv) throw new Error(`bad header line: "${line}"`);
    meta[kv[1]] = kv[1] === 'tags' ? kv[2].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : kv[2].trim();
  }
  return { meta, body: md.slice(m[0].length).replace(/^\n+/, '') };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.md') ? [p] : [];
  });
}

// Dates a page was first added and last changed, from git (null outside git).
function gitDates(root, file) {
  try {
    const out = execFileSync('git', ['log', '--follow', '--format=%cI', '--', path.relative(root, file)], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(Boolean);
    return out.length ? { added: out[out.length - 1], updated: out[0] } : { added: null, updated: null };
  } catch {
    return { added: null, updated: null };
  }
}

// { slug: { title, summary, tags, added, updated } } for every wiki page.
export function readWikiMeta(root, { dates = true } = {}) {
  const wikiDir = path.join(root, 'docs/wiki');
  const out = {};
  for (const file of walk(wikiDir).sort()) {
    const slug = path.relative(wikiDir, file).replace(/\\/g, '/').replace(/\.md$/, '');
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const title = (/^# (.+)$/m.exec(body)?.[1] || slug).trim();
    out[slug] = { title, summary: meta.summary || '', tags: meta.tags || [], ...(dates ? gitDates(root, file) : {}) };
  }
  return out;
}

// Where every wiki code block comes from: { slug: [{ index, file, start, end } | { index, file: null }] }.
// Line numbers are the file's own (as on GitHub). Blocks that aren't quotes
// (shell commands, maths, old code) are { index, file: null, quote: false }.
export function readWikiQuotes(root) {
  const readSrc = (p) => {
    const f = path.join(root, p);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f, 'utf8') : null;
  };
  const resolve = (n) =>
    n.startsWith('src/') || n.startsWith('tools/')
      ? [n]
      : ['sketches', 'lib', 'core', 'ui'].map((d) => `src/${d}/${n}`).filter((p) => readSrc(p) != null);
  const wikiDir = path.join(root, 'docs/wiki');
  const out = {};
  for (const file of walk(wikiDir).sort()) {
    const slug = path.relative(wikiDir, file).replace(/\\/g, '/').replace(/\.md$/, '');
    const { body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    out[slug] = wikiCodeBlocks(body, slug, resolve).map((b) => {
      if (!b.quote) return { index: b.index, file: null, quote: false };
      const hit = findQuote(b, readSrc);
      return hit ? { index: b.index, file: hit.file, start: hit.start, end: hit.end, code: b.code } : { index: b.index, file: null };
    });
  }
  return out;
}
