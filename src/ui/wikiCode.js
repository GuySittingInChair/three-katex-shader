import { quotes } from 'virtual:wiki-meta';
import wikiMeta from 'virtual:wiki-meta';
import { locateQuote } from '../core/codeQuote.js';
import { sketches } from '../core/registry.js';
import { wikiUrl, loadCodeNotes, notesNameFor } from '../core/wiki.js';
import { cardHtml, noteHtml, floatingCard } from './noteCard.js';

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
    const notesName = notesNameFor(q.file);
    if (notesName) loadCodeNotes(notesName).then((n) => n && clickableLines(pre, n, notesName));
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

// Lines and pieces of a wiki code block that the sketch's code notes explain
// become clickable, opening the same card as in the code panel.
function clickableLines(pre, notes, notesName) {
  const sketchId = notes.sketch; // null when the notes explain a data script
  for (const span of pre.querySelectorAll('.wl[data-n]')) {
    const text = span.textContent;
    const note = notes.lines.find((l) => locateQuote(l.text, text));
    if (!note) continue;
    span.classList.add('code-line-note');
    span.tabIndex = 0;
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `What line ${span.dataset.n} does`);
    span._note = note;
    // Pieces: wrap each one's first appearance in the line.
    let html = esc(text);
    for (const piece of note.pieces) {
      const at = html.indexOf(esc(piece.text));
      if (at === -1) continue;
      const k = note.pieces.indexOf(piece);
      html = `${html.slice(0, at)}<button type="button" class="code-term code-note-piece" data-piece="${k}">${esc(piece.text)}</button>${html.slice(at + esc(piece.text).length)}`;
    }
    span.innerHTML = html;
  }
  const open = (anchor, note, piece) => {
    const sym = piece?.symbol || note.symbol;
    floatingCard().show(
      anchor,
      cardHtml({
        kicker: piece ? `In line ${anchor.closest('.wl')?.dataset.n}` : `Line ${anchor.dataset.n}`,
        code: piece ? piece.text : note.text,
        html: noteHtml((piece || note).body, notesName),
        more: [
          ...(sym && sketchId ? [{ href: `/s/${sketchId}#sym=${sym}`, text: 'See it in the equation, in the sketch' }] : []),
          { href: wikiUrl(`code/${notesName}`), text: sketchId ? "All of this sketch's code, explained" : 'All of this file, explained' },
        ],
      })
    );
  };
  pre.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-note-piece');
    const line = e.target.closest('.code-line-note');
    if (!line) return;
    if (btn) open(btn, line._note, line._note.pieces[+btn.dataset.piece]);
    else open(line, line._note, null);
  });
  pre.addEventListener('keydown', (e) => {
    const line = e.target.closest?.('.code-line-note');
    if (line && e.target === line && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open(line, line._note, null);
    }
  });
}
