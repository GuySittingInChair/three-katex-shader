// Finds a piece of quoted code inside a source file, so the wiki can link a
// code block to the exact lines it quotes, and the code panel can link those
// lines back. Quotes are matched by their text, never by a stored line
// number, so they keep working when lines are added elsewhere in the file;
// tests/wiki.test.mjs fails if a quote no longer matches at all.
//
// A quote may skip lines with a line that is only "..." (or "…"), and may
// shorten a line with "..." inside it: `const x = f(...);` matches any line
// containing "const x = f(" then ");". A trailing // comment may be left off.
// Indentation and blank lines are ignored. Lines that are skipped must be
// marked with "...": a quote never implies two lines are next to each other
// when they aren't.
// Plain JS, no DOM: used by the browser and by node tests.

const isGap = (line) => /^\s*(?:\.\.\.|…)\s*$/.test(line);
const norm = (line) => line.trim().replace(/\s+/g, ' ');

// Does source line `src` match quoted line `q`?
function lineMatches(src, q) {
  const full = norm(src);
  // A quote may leave off a line's trailing // comment.
  const bare = full.replace(/\s*(?<![:'"`\\])\/\/.*$/, '');
  if (!q.includes('...') && !q.includes('…')) return full === q || bare === q;
  const s = full;
  const parts = q.split(/\.\.\.|…/).map((p) => p.trim()).filter(Boolean);
  let at = 0;
  for (const p of parts) {
    const i = s.indexOf(p, at);
    if (i === -1) return false;
    at = i + p.length;
  }
  return parts.length > 0;
}

// -> { start, end, lines } (1-based line numbers in `source`), or null.
// `lines` lists every source line the quote actually shows.
export function locateQuote(quote, source) {
  const src = source.split('\n');
  // Segments: runs of quoted lines between "..." gaps, blank lines dropped.
  const segments = [[]];
  for (const raw of quote.split('\n')) {
    if (isGap(raw)) {
      if (segments[segments.length - 1].length) segments.push([]);
    } else if (raw.trim()) segments[segments.length - 1].push(norm(raw));
  }
  if (!segments[segments.length - 1].length) segments.pop();
  if (!segments.length) return null;

  // Lines of `seg` matched starting exactly at source line i (blank source
  // lines between them are skipped), or null.
  const placeAt = (seg, i) => {
    const hit = [];
    let j = i;
    for (const q of seg) {
      while (j < src.length && !src[j].trim()) j++;
      if (j >= src.length || !lineMatches(src[j], q)) return null;
      hit.push(j + 1);
      j++;
    }
    return hit;
  };
  // Every start for the first segment is tried, so a common line (`}`)
  // doesn't lock the search onto the wrong place; later segments take their
  // earliest match after the one before.
  for (let first = 0; first < src.length; first++) {
    const lines = placeAt(segments[0], first);
    if (!lines) continue;
    let ok = true;
    for (let k = 1; k < segments.length && ok; k++) {
      let hit = null;
      for (let i = lines[lines.length - 1]; i < src.length && !hit; i++) hit = placeAt(segments[k], i);
      if (hit) lines.push(...hit);
      else ok = false;
    }
    if (ok) return { start: lines[0], end: lines[lines.length - 1], lines };
  }
  return null;
}

// The code blocks of a wiki page's Markdown, each with the files it might
// quote, most likely first: files named since the previous block, the page's
// own sketch, the previous block's file, then every other file the page
// names. A file name is `src/.../x.js`, or a bare `x.js` (resolved by the
// caller's `resolve`, which knows which files exist).
// -> [{ index, lang, code, candidates: [path] }]
const FILE_RE = /`((?:src\/(?:sketches|lib|core|ui)\/[\w/.-]+|tools\/[\w/.-]+|[\w-]+)\.(?:m?js|py))`/g;
// Blocks that aren't quotes of our code: shell commands, maths, plain text.
export const NOT_CODE = new Set(['', 'text', 'bash', 'sh', 'shell', 'latex', 'tex', 'math']);

export function wikiCodeBlocks(md, pageSlug, resolve = (name) => [name]) {
  const own = /^sketches\/([\w-]+?)(?:-physics|-fix)?$/.exec(pageSlug || '');
  const ownFile = own ? `src/sketches/${own[1]}.js` : null;
  const names = (text) => [...text.matchAll(FILE_RE)].flatMap((m) => resolve(m[1]));
  const everywhere = names(md);
  const blocks = [];
  // Fenced blocks, also indented ones inside a list item.
  const re = /^( *)```(\w*)\n([\s\S]*?)^\1```/gm;
  let last = 0;
  let prev = [];
  let m;
  while ((m = re.exec(md))) {
    const before = md.slice(last, m.index);
    // `<!-- not a quote -->` right before a block marks code that isn't in the
    // project any more (e.g. the old version a fix page describes).
    const optOut = /<!--\s*not a quote\b[^>]*-->\s*$/.test(before);
    const near = names(before).reverse();
    const candidates = [...new Set([...near, ownFile, ...prev, ...everywhere].filter(Boolean))];
    const [, indent, lang, raw] = m;
    const code = raw.replace(/\n$/, '').split('\n').map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join('\n');
    const quote = !optOut && !NOT_CODE.has(lang);
    blocks.push({ index: blocks.length, lang, code, candidates, quote });
    prev = candidates;
    last = m.index + m[0].length;
  }
  return blocks;
}

// The first candidate file whose text contains the quote.
// `read(path)` returns the file's text or null. -> { file, start, end, lines } | null
export function findQuote(block, read) {
  for (const file of block.candidates) {
    const text = read(file);
    const hit = text != null && locateQuote(block.code, text);
    if (hit) return { file, ...hit };
  }
  return null;
}
