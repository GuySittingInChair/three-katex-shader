// "This is unclear" feedback for wiki pages. Highlight a sentence, press the
// button that pops up, say what's wrong, and it opens a GitHub issue with the
// page, section and sentence filled in (label: wiki-feedback). There's no
// backend; the issue tracker is the inbox.
// see docs/wiki/README.md

const REPO = 'https://github.com/GuySittingInChair/three-katex-shader';
const SITE = 'https://aiship.lol';
const MAX_QUOTE = 1500;

export function attachWikiFeedback(root, getSlug) {
  const float = document.createElement('button');
  float.type = 'button';
  float.className = 'wiki-fb-float hidden';
  float.textContent = '💬 This is unclear';
  document.body.appendChild(float);

  const form = document.createElement('div');
  form.className = 'wiki-fb-form hidden';
  form.innerHTML = `
    <h3>What's wrong with this explanation?</h3>
    <label>The bit that's unclear <span class="explain-hint">(optional)</span>
      <textarea data-f="quote" rows="3"></textarea></label>
    <label>Why it's bad: what confused you, what's wrong, what you expected
      <textarea data-f="why" rows="5" placeholder="e.g. I don't know what a Laplacian is, and the sentence assumes I do."></textarea></label>
    <p class="explain-hint">This opens a GitHub issue in a new tab with everything filled in. Press
      <b>Submit new issue</b> there. Issues on this repo are public.</p>
    <div class="wiki-fb-actions">
      <button type="button" class="btn" data-f="cancel">Cancel</button>
      <button type="button" class="btn btn-primary" data-f="send">Open the issue →</button>
    </div>`;
  document.body.appendChild(form);
  const quoteBox = form.querySelector('[data-f="quote"]');
  const whyBox = form.querySelector('[data-f="why"]');
  let section = '';

  // The heading above a node: which part of the page the sentence is in.
  function headingFor(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (!el || !root.contains(el)) return null;
    const heads = [...root.querySelectorAll('h1, h2, h3, h4')];
    let found = null;
    for (const h of heads) {
      if (h === el || h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
    }
    // Walkthroughs label their parts with bold lead-ins ("**What you see:**"),
    // not headings: prefer the nearest one above, if it's below the heading.
    let block = el;
    while (block.parentElement && block.parentElement !== root) block = block.parentElement;
    for (let b = block; b; b = b.previousElementSibling) {
      if (b === found) break;
      const lead = b.tagName === 'P' && b.firstElementChild?.tagName === 'STRONG' && b.firstChild === b.firstElementChild
        ? b.firstElementChild.textContent.trim() : '';
      if (lead.endsWith(':')) return { textContent: `${found ? `${found.textContent.trim()} › ` : ''}${lead.slice(0, -1)}`, id: found?.id };
    }
    return found;
  }

  function selectionInRoot() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const text = sel.toString().trim();
    return text ? { text, range } : null;
  }

  function placeFloat() {
    const s = getSlug() && root.isConnected && root.offsetParent !== null ? selectionInRoot() : null;
    if (!s) { float.classList.add('hidden'); return; }
    const r = s.range.getBoundingClientRect();
    float.classList.remove('hidden');
    const w = float.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top > 50 ? r.top - 42 : r.bottom + 8;
    float.style.left = `${left}px`;
    float.style.top = `${top}px`;
  }

  function open(quote, near) {
    const h = headingFor(near);
    section = h ? { text: h.textContent.trim(), id: h.id } : null;
    quoteBox.value = quote.slice(0, MAX_QUOTE);
    whyBox.value = '';
    float.classList.add('hidden');
    form.classList.remove('hidden');
    whyBox.focus();
  }

  function close() { form.classList.add('hidden'); }

  function send() {
    const slug = getSlug() || 'README';
    const quote = quoteBox.value.trim();
    const why = whyBox.value.trim();
    if (!why) { whyBox.focus(); whyBox.classList.add('wiki-fb-need'); return; }
    const path = slug === 'README' ? '/wiki' : `/wiki/${slug}`;
    const link = `${SITE}${path}${section?.id ? `#${section.id}` : ''}`;
    const short = quote ? `"${quote.replace(/\s+/g, ' ').slice(0, 50)}${quote.length > 50 ? '…' : ''}"` : 'unclear explanation';
    const body = [
      `**Page:** [${path}](${link}) (\`docs/wiki/${slug}.md\`)`,
      section ? `**Section:** ${section.text}` : null,
      '',
      quote ? `**The bit that's unclear:**\n\n${quote.split('\n').map((l) => `> ${l}`).join('\n')}\n` : null,
      `**Why it's a bad explanation:**\n\n${why}`,
    ].filter((x) => x !== null).join('\n');
    const url = `${REPO}/issues/new?` + new URLSearchParams({
      title: `Wiki: ${slug.replace(/^sketches\//, '')} — ${short}`,
      body,
      labels: 'wiki-feedback',
    });
    window.open(url, '_blank', 'noopener');
    close();
  }

  // Keep the selection alive while the button is pressed.
  float.addEventListener('mousedown', (e) => e.preventDefault());
  float.addEventListener('click', () => {
    const s = selectionInRoot();
    if (s) open(s.text, s.range.startContainer);
  });
  form.querySelector('[data-f="cancel"]').addEventListener('click', close);
  form.querySelector('[data-f="send"]').addEventListener('click', send);
  whyBox.addEventListener('input', () => whyBox.classList.remove('wiki-fb-need'));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  });

  document.addEventListener('selectionchange', () => requestAnimationFrame(placeFloat));
  window.addEventListener('scroll', placeFloat, true);
  window.addEventListener('resize', placeFloat);

  // A plain button at the end of the page, for "the whole thing is confusing".
  function footer() {
    const p = document.createElement('p');
    p.className = 'wiki-fb-footer';
    p.innerHTML = `<button type="button" class="btn">💬 Something here unclear?</button>
      <span class="explain-hint">Or highlight the exact sentence and press the button that appears.</span>`;
    p.querySelector('button').addEventListener('click', () => open('', null));
    return p;
  }

  return { footer, close };
}
