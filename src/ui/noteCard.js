import { renderWiki } from '../core/wiki.js';

// One card for every "what does this do?" on the site: a line or piece of code,
// a symbol in the equation, or a concept word. The code panel shows it in its
// own card slot; wiki pages and the equation show it floating next to what was
// clicked (a sheet along the bottom on phones). Same look everywhere: the
// .code-term-card styles in style.css.

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Markdown from a code-notes file -> HTML with its wiki links pointed at the site.
export const noteHtml = (md, sketchId) => renderWiki(md, `code/${sketchId}`);

// The card's inner HTML.
//   kicker: small label ("Line 24", "In line 24", "Symbol")
//   code:   the code or symbol being explained (shown in monospace)
//   html:   the explanation
//   symbol: { id, label } this code works out, shown as a button
//   more:   [{ href, text }] extra links
export function cardHtml({ kicker, code, tex, html, symbol, more = [] }) {
  const head = `<div class="code-term-head">
      <strong>${esc(kicker)}</strong>
      ${code ? `<code class="code-term-text">${esc(code)}</code>` : ''}${tex ? `<span class="code-term-text">${tex}</span>` : ''}
      <button type="button" class="code-term-close" aria-label="Close">×</button>
    </div>`;
  const sym = symbol
    ? `<button type="button" class="note-symbol" data-sym="${esc(symbol.id)}">Show ${symbol.label ? esc(symbol.label) : 'it'} in the equation</button>`
    : '';
  const links = more.map((m) => `<a class="code-term-wiki" data-link href="${esc(m.href)}">${esc(m.text)} →</a>`).join(' ');
  return `${head}<div class="note-body">${html || ''}</div>${sym}${links ? `<div class="note-links">${links}</div>` : ''}`;
}

// A floating card (wiki pages, the equation). Returns { show(anchor, html), close() }.
let floating = null;
export function floatingCard() {
  if (floating) return floating;
  const el = document.createElement('div');
  el.className = 'code-term-card note-float hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'What this does');
  document.body.append(el);
  let returnFocus = null;
  const close = () => {
    if (el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    document.querySelectorAll('.note-open').forEach((n) => n.classList.remove('note-open'));
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
    anchorEl = null;
  };
  let anchorEl = null;
  function show(anchor, html) {
    el.innerHTML = html;
    el.classList.remove('hidden');
    returnFocus = anchor;
    anchorEl = anchor;
    anchor.classList?.add('note-open');
    place();
    el.querySelector('.code-term-close')?.focus({ preventScroll: true });
  }
  // Next to the anchor (flipped above it if there's no room below); a bottom sheet on phones.
  function place() {
    const anchor = anchorEl;
    if (!anchor || el.classList.contains('hidden')) return;
    const phone = window.matchMedia('(max-width: 720px)').matches;
    el.classList.toggle('note-sheet', phone);
    if (phone) {
      el.style.left = el.style.top = '';
    } else {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(420, window.innerWidth - 24);
      el.style.width = `${w}px`;
      const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      const below = r.bottom + 8;
      el.style.left = `${left}px`;
      el.style.top = `${below}px`;
      // Flip above if it would run off the bottom.
      const h = el.offsetHeight;
      if (below + h > window.innerHeight - 12) el.style.top = `${Math.max(12, r.top - h - 8)}px`;
    }
  }
  // Follow the anchor when the page scrolls or the window changes size.
  window.addEventListener('scroll', place, { capture: true, passive: true });
  window.addEventListener('resize', place);
  el.addEventListener('click', (e) => {
    if (e.target.closest('.code-term-close')) close();
    else if (e.target.closest('a[data-link]')) close(); // the router follows the link
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.classList.contains('hidden') && !el.contains(e.target) && !e.target.closest('.note-open, [data-note], [data-sym]')) close();
  });
  floating = { el, show, close };
  return floating;
}

