// Reads the small header at the top of each wiki page (docs/wiki/**/*.md):
//
//   ---
//   summary: One line for small spaces (hover cards, search, previews, RSS).
//   added: 2026-11-20   (the day the page first appeared; dates the RSS feed)
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
    // `added:` in the header wins: Vercel builds from a shallow git clone, where
    // every page would otherwise look new.
    const git = dates ? gitDates(root, file) : {};
    const added = meta.added ? `${meta.added}T12:00:00Z` : git.added || null;
    out[slug] = { title, summary: meta.summary || '', tags: meta.tags || [], added, updated: git.updated || null };
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

// RSS 2.0 feed of new wiki content (walkthroughs and wiki entries), newest
// first, dated by when each page first appeared in git. Built into the site
// as /feed.xml (vite.config.js).
const SITE = 'https://aiship.lol';
const xml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const NOT_IN_FEED = new Set(['README', 'glossary', '_survey']);

export function buildFeed(meta) {
  const items = Object.entries(meta)
    .filter(([slug, m]) => !NOT_IN_FEED.has(slug) && m.added)
    .sort((a, b) => b[1].added.localeCompare(a[1].added) || a[0].localeCompare(b[0]));
  const link = (slug) => `${SITE}/wiki/${slug}`;
  const kind = (slug) => (slug.startsWith('sketches/') ? 'Walkthrough' : 'Wiki');
  const newest = items.length ? new Date(items[0][1].added) : new Date(0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>aiship: new walkthroughs and wiki pages</title>
    <link>${SITE}/wiki</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Plain-English explanations of the animated maths, physics and astronomy on aiship, as they are written.</description>
    <language>en</language>
    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>
${items
  .map(([slug, m]) => `    <item>
      <title>${xml(`${kind(slug)}: ${m.title.replace(/: in plain English$/, '')}`)}</title>
      <link>${link(slug)}</link>
      <guid isPermaLink="true">${link(slug)}</guid>
      <pubDate>${new Date(m.added).toUTCString()}</pubDate>
      <description>${xml(m.summary)}</description>
${m.tags.map((t) => `      <category>${xml(t)}</category>\n`).join('')}    </item>`)
  .join('\n')}
  </channel>
</rss>
`;
}
