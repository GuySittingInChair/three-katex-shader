import { quotes } from 'virtual:wiki-meta';
import wikiMeta from 'virtual:wiki-meta';
import { locateQuote } from '../core/codeQuote.js';
import { sketches } from '../core/registry.js';
import { wikiUrl } from '../core/wiki.js';

// Going back and forth between the wiki and the code it talks about.
//
// On a wiki page, every code block gets numbered lines ("Line 3" on the page
// means the line numbered 3; "..." lines, which mark skipped code, get no
// number) and a bar naming the file it comes from, with links that open those
// exact lines in the code panel or on GitHub.
//
// In the code panel, lines that a wiki page explains are marked, with a link
// back to the block on that page. Which file and lines each block quotes is
// worked out at build time (tools/wikiMeta.js); tests/wiki.test.mjs fails if
// a quote stops matching its file.

const REPO = 'https://github.com/GuySittingInChair/three-katex-shader/blob/main/';
const isGap = (line) => /^\s*(?:\.\.\.|…)\s*$/.test(line);
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sketchOf = (file) => /^src\/sketches\/([\w-]+)\.js$/.exec(file || '')?.[1];

export function decorateWikiCode(root, slug) {
  const pres = [...root.querySelectorAll('pre')];
  const info = quotes[slug] || [];
  if (pres.length !== info.length) {
    console.warn(`wiki ${slug}: ${pres.length} code blocks on the page, ${info.length} known`);
    return;
  }
  pres.forEach((pre, i) => {
    pre.id = `code-${i + 1}`;
    const code = pre.querySelector('code');
    if (code) {
      let n = 0;
      const lines = code.textContent.replace(/\n$/, '').split('\n');
      code.innerHTML = lines
        .map((l) =>
          !l.trim() || isGap(l)
            ? `<span class="wl wl-skip">${esc(l) || ' '}</span>`
            : `<span class="wl" data-n="${++n}">${esc(l)}</span>`
        )
        .join(''); // each line is its own block, so no newlines between them
      pre.classList.add('wiki-code');
    }
    const q = info[i];
    if (!q?.file) return;
    const bar = document.createElement('div');
    bar.className = 'wiki-code-src';
    const id = sketchOf(q.file);
    const panel = id && sketches.some((s) => s.id === id);
    const range = q.start === q.end ? `#L${q.start}` : `#L${q.start}-L${q.end}`;
    bar.innerHTML =
      `<span>From <code>${esc(q.file)}</code></span>` +
      (panel
        ? `<a data-link href="/s/${id}#L${q.start}-${q.end}">Open these lines in the code panel →</a>`
        : '') +
      `<a href="${REPO}${q.file}${range}" target="_blank" rel="noopener">On GitHub</a>`;
    pre.before(bar);
  });
}

// For the code panel: the wiki blocks quoting sketch `id`, located in `text`
// (what the panel shows). -> [{ start, end, lines, slug, title, href }]
export function wikiRefsFor(id, text) {
  const file = `src/sketches/${id}.js`;
  const refs = [];
  for (const [slug, blocks] of Object.entries(quotes)) {
    for (const b of blocks) {
      if (b.file !== file) continue;
      const hit = locateQuote(b.code, text);
      if (hit) refs.push({ ...hit, slug, title: wikiMeta[slug]?.title || slug, href: `${wikiUrl(slug)}#code-${b.index + 1}` });
    }
  }
  return refs.sort((a, b) => a.start - b.start);
}
