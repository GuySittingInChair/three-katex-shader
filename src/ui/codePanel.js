import { sketches, updateSketch, addSketch, getGroupedCategories } from '../core/registry.js';
import { getEditableSource, saveEdit, resetEdit, hasEdit, wasWrittenToDisk } from '../core/sourceStore.js';
import { persistSketch, trashSketch } from '../core/diskSync.js';
import { compileSketch } from '../core/sketchCompiler.js';
import { getUser, shareSketch, updateSharedSketch } from '../core/community.js';
import { shaderStarterSource, geometryStarterSource } from '../core/starterTemplates.js';
import { getGroupForCategory, getAllCategories } from '../core/taxonomy.js';
import katex from 'katex';
import { lineTerms, commentStart, similarLines, walkthroughSlug, wikiUrl, wikiMeta, hasCodeNotes, loadCodeNotes } from '../core/wiki.js';
import { placeCodeNotes } from '../core/codeNotes.js';
import { cardHtml, noteHtml } from './noteCard.js';
import { fileLineNumbers } from '../core/sourceStore.js';
import { wikiRefsFor } from './wikiCode.js';

export function createCodePanel(container, manager, { onShared, onShowSymbol = () => {} } = {}) {
  container.innerHTML = `
    <div class="code-panel-tabs"></div>
    <div class="code-panel-list"></div>
    <div class="code-panel-header">
      <button class="code-panel-new" type="button">+ New Sketch</button>
      <button class="code-panel-reset" type="button" title="Discard edits, reload original source">Reset</button>
    </div>
    <div class="code-panel-new-form hidden">
      <input class="code-panel-new-name" type="text" placeholder="Name" />
      <input class="code-panel-new-category" type="text" placeholder="Category" list="code-panel-category-options" />
      <datalist id="code-panel-category-options"></datalist>
      <select class="code-panel-new-mode">
        <option value="shader">Shader (fullscreen fragment shader)</option>
        <option value="3d">3D Geometry (mesh + orbit controls)</option>
      </select>
      <div class="code-panel-new-actions">
        <button class="code-panel-new-create" type="button">Create</button>
        <button class="code-panel-new-cancel" type="button">Cancel</button>
      </div>
    </div>
    <div class="code-view-bar">
      <div class="code-view-toggle" role="tablist">
        <button type="button" class="code-view-btn active" data-view="read" title="Click any underlined code to learn what it does">Read</button>
        <button type="button" class="code-view-btn" data-view="edit">Edit</button>
      </div>
      <a class="code-view-walk hidden" data-link>Plain-English walkthrough →</a>
    </div>
    <div class="code-read" tabindex="0"></div>
    <div class="code-term-card hidden" role="dialog" aria-label="What this code does"></div>
    <textarea class="code-panel-editor hidden" spellcheck="false"></textarea>
    <div class="code-panel-footer">
      <button class="code-panel-run" type="button">Run &#9654; (Ctrl+Enter)</button>
      <button class="code-panel-share" type="button" title="Share this sketch on the site. Others see it after it has been reviewed.">⇪ Share</button>
      <span class="code-panel-status"></span>
    </div>
  `;

  const tabsEl = container.querySelector('.code-panel-tabs');
  const listEl = container.querySelector('.code-panel-list');
  const editor = container.querySelector('.code-panel-editor');
  const runBtn = container.querySelector('.code-panel-run');
  const shareBtn = container.querySelector('.code-panel-share');
  const resetBtn = container.querySelector('.code-panel-reset');
  const status = container.querySelector('.code-panel-status');
  const readEl = container.querySelector('.code-read');
  const card = container.querySelector('.code-term-card');
  const walkLink = container.querySelector('.code-view-walk');
  const viewBtns = container.querySelectorAll('.code-view-btn');
  let view = 'read';

  const newBtn = container.querySelector('.code-panel-new');
  const newForm = container.querySelector('.code-panel-new-form');
  const newName = container.querySelector('.code-panel-new-name');
  const newCategory = container.querySelector('.code-panel-new-category');
  const categoryOptions = container.querySelector('#code-panel-category-options');
  const newMode = container.querySelector('.code-panel-new-mode');
  const newCreate = container.querySelector('.code-panel-new-create');
  const newCancel = container.querySelector('.code-panel-new-cancel');

  let activeGroup = 'All';
  let activeCategory = null; // null = every category within activeGroup
  let currentId = sketches[manager.currentIndex]?.id;

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `code-panel-status${kind ? ` ${kind}` : ''}`;
  }

  // Follows up a status line once the dev server has answered: the edit is
  // already applied and in localStorage, so a failed disk write is a warning.
  function reportDiskSave(id, result, what) {
    if (result.ok) {
      setStatus(`✓ ${what} · saved to ${result.path}`, 'ok');
    } else if (result.error) {
      setStatus(`✓ ${what} · browser only, not saved to disk: ${result.error}`, 'ok');
    }
  }

  function loadIntoEditor(id) {
    editor.value = getEditableSource(id);
    setStatus(hasEdit(id) ? 'edited (previously applied)' : '');
    const walk = walkthroughSlug(id);
    walkLink.classList.toggle('hidden', !walk);
    if (walk) walkLink.href = wikiUrl(walk);
    if (view === 'read') renderRead();
  }

  // --- Read view: the code with every recognised piece clickable ---
  // see docs/wiki/README.md: each term opens a card naming its wiki page,
  // plus the same kind of line in other sketches.
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let lineTermsCache = [];
  // Code notes for the sketch on show (docs/wiki/code/<id>.md): line n -> { note, pieces }.
  let notes = null;
  let notesId = null;
  let notesAt = new Map();
  const symTex = (id) => notes?.symbols.find((x) => x.id === id)?.tex;
  const texHtml = (tex) => {
    try {
      return katex.renderToString(tex, { throwOnError: true });
    } catch {
      return esc(tex);
    }
  };

  // Which note card is open, so a re-render (notes arriving, the sketch
  // reloading) can bring it back instead of silently dropping it.
  let openState = null;

  function renderRead() {
    const keep = openState;
    hideCard();
    if (notesId !== currentId) {
      openState = null;
      notesId = currentId;
      notes = null;
      notesAt = new Map();
      if (hasCodeNotes(currentId)) {
        const id = currentId;
        loadCodeNotes(id).then((n) => {
          if (id !== currentId || !n) return;
          notes = n;
          if (view === 'read') renderRead();
        });
      }
    }
    const lines = editor.value.split('\n');
    notesAt = new Map();
    if (notes) for (const pl of placeCodeNotes(notes, editor.value).placed) notesAt.set(pl.line, pl);
    // Clickable pieces: noted pieces first, then concept words that don't overlap them.
    lineTermsCache = lines.map((l, i) => {
      const pl = notesAt.get(i + 1);
      const pieces = (pl?.pieces || []).map((p) => ({ start: p.start, end: p.end, note: pl.note, piece: p.piece }));
      const concepts = lineTerms(l).filter((t) => !pieces.some((p) => t.start < p.end && p.start < t.end));
      return [...pieces, ...concepts].sort((a, b) => a.start - b.start);
    });
    const fileNums = fileLineNumbers(currentId, editor.value);
    const wikiRefs = wikiRefsFor(currentId, editor.value);
    const explained = new Set(wikiRefs.flatMap((r) => r.lines));
    const refsAt = new Map();
    for (const r of wikiRefs) refsAt.set(r.start, [...(refsAt.get(r.start) || []), r]);
    readEl.innerHTML = lines
      .map((line, i) => {
        const cut = commentStart(line);
        let html = '';
        let at = 0;
        // Plain text from..to, with any part past the comment start dimmed.
        const plain = (from, to) => {
          let out = '';
          if (from < Math.min(to, cut)) out += esc(line.slice(from, Math.min(to, cut)));
          if (to > Math.max(from, cut)) out += `<span class="tok-comment">${esc(line.slice(Math.max(from, cut), to))}</span>`;
          return out;
        };
        lineTermsCache[i].forEach((t, k) => {
          html += plain(at, t.start);
          const cls = t.piece ? 'code-term code-note-piece' : t.see ? 'code-term code-term-see' : 'code-term';
          const inComment = t.start >= cut ? ' tok-comment' : '';
          html += `<button type="button" class="${cls}${inComment}" data-line="${i}" data-term="${k}">${esc(line.slice(t.start, t.end))}</button>`;
          at = t.end;
        });
        html += plain(at, line.length);
        const n = i + 1;
        // see docs/wiki/README.md: lines a wiki page explains link back to it.
        const refs = (refsAt.get(n) || [])
          .map((r) => `<a class="code-wiki-ref" data-link href="${esc(r.href)}">📖 Explained in “${esc(r.title)}” →</a>`)
          .join('');
        const pl = notesAt.get(n);
        const cls = `code-line${explained.has(n) ? ' code-line-wiki' : ''}${pl ? ' code-line-note' : ''}`;
        // data-n: position in the panel; data-ln: the file's own line number
        // (as on GitHub), shown in the margin. They differ by the hidden import lines.
        const ln = fileNums ? fileNums[i] : n;
        // A noted line is itself a button (keyboard: Tab to it, Enter to open).
        // data-syms: the equation symbols this line (or a piece of it) works out.
        const syms = pl ? [...new Set([pl.note.symbol, ...pl.note.pieces.map((p) => p.symbol)].filter(Boolean))] : [];
        const noteAttrs = pl ? ` tabindex="0" role="button" aria-label="What line ${ln} does"${syms.length ? ` data-syms="${esc(syms.join(' '))}"` : ''}` : '';
        return `${refs ? `<div class="code-wiki-refs">${refs}</div>` : ''}<div class="${cls}" data-n="${n}" data-ln="${ln}"${noteAttrs}>${html || ' '}</div>`;
      })
      .join('');
    if (keep && notesId === currentId) {
      if (keep.symbol) openSymbolCard(keep.symbol);
      else if (keep.line) openLineCard(keep.line);
    }
  }

  // Hide the card without forgetting what was open (used while re-rendering).
  function hideCard() {
    card.classList.add('hidden');
    readEl.querySelector('.code-term.open')?.classList.remove('open');
    readEl.querySelectorAll('.note-open, .code-line-sym').forEach((x) => x.classList.remove('note-open', 'code-line-sym'));
  }
  // Close it for good (the × button, Esc, clicking the same thing again).
  function closeCard() {
    const wasOpen = !card.classList.contains('hidden');
    hideCard();
    openState = null;
    if (wasOpen) onShowSymbol(null);
  }

  const lnOf = (n) => readEl.querySelector(`.code-line[data-n="${n}"]`)?.dataset.ln || n;
  const allCode = () => ({ href: wikiUrl(`code/${currentId}`), text: "All of this sketch's code, explained" });

  // The card for a noted line (n = the panel's line number).
  function openLineCard(n) {
    const pl = notesAt.get(n);
    if (!pl) return;
    openState = { line: n };
    readEl.querySelectorAll('.note-open').forEach((x) => x.classList.remove('note-open'));
    readEl.querySelector(`.code-line[data-n="${n}"]`)?.classList.add('note-open');
    const sym = pl.note.symbol;
    card.innerHTML = cardHtml({
      kicker: `Line ${lnOf(n)}`,
      code: pl.note.text,
      html: noteHtml(pl.note.body, currentId),
      symbol: sym ? { id: sym } : null,
      more: [allCode()],
    });
    card.classList.remove('hidden');
    card.scrollTop = 0;
    if (sym) onShowSymbol(sym);
  }

  // The card for one of the equation's symbols, with its lines lit up.
  function openSymbolCard(id) {
    const s = notes?.symbols.find((x) => x.id === id);
    openState = { symbol: id };
    readEl.querySelectorAll('.code-line-sym').forEach((x) => x.classList.remove('code-line-sym'));
    const lines = [...readEl.querySelectorAll(`.code-line[data-syms~="${CSS.escape(id)}"]`)];
    lines.forEach((x) => x.classList.add('code-line-sym'));
    if (!s) return;
    const where = lines.map((x) => x.dataset.ln);
    card.innerHTML = cardHtml({
      kicker: 'Symbol',
      tex: texHtml(s.tex),
      html: noteHtml(s.body, currentId) + (where.length ? `<p class="note-where">Worked out in line${where.length > 1 ? 's' : ''} ${where.join(', ')} (lit up).</p>` : ''),
      more: [allCode()],
    });
    card.classList.remove('hidden');
    card.scrollTop = 0;
    // Scroll once the card is showing (it takes room from the code view).
    if (lines[0]) requestAnimationFrame(() => lines[0].scrollIntoView({ block: 'center' }));
  }

  function openCard(btn) {
    const term = lineTermsCache[+btn.dataset.line]?.[+btn.dataset.term];
    if (!term) return;
    if (term.piece) {
      openState = null;
      readEl.querySelector('.code-term.open')?.classList.remove('open');
      btn.classList.add('open');
      card.innerHTML = cardHtml({
        kicker: `In line ${lnOf(+btn.dataset.line + 1)}`,
        code: term.piece.text,
        html: noteHtml(term.piece.body, currentId),
        symbol: term.piece.symbol || term.note.symbol ? { id: term.piece.symbol || term.note.symbol } : null,
        more: [allCode()],
      });
      card.classList.remove('hidden');
      card.scrollTop = 0;
      if (term.piece.symbol || term.note.symbol) onShowSymbol(term.piece.symbol || term.note.symbol);
      return;
    }
    readEl.querySelector('.code-term.open')?.classList.remove('open');
    btn.classList.add('open');
    if (term.see) {
      card.innerHTML = `<div class="code-term-head"><strong>Wiki page</strong><button type="button" class="code-term-close" aria-label="Close">×</button></div>
        <p>This comment points to the page that explains the code below it.</p>
        <a class="code-term-wiki" data-link href="${wikiUrl(term.page)}">Read “${esc(wikiMeta[term.page]?.title || term.page)}” →</a>`;
    } else {
      // A spread of 8 first; "Show all" lists every sketch (nothing is cut off).
      const { total, picks: few } = similarLines(term, currentId, 8);
      const item = (h) => `<li><button type="button" class="code-term-similar" data-id="${esc(h.id)}" data-line="${h.line}" title="${esc(h.text)}">
            <span class="code-term-similar-name">${esc(h.name)} · line ${h.line}</span>
            <code>${esc(h.text)}</code></button></li>`;
      const list = few.map(item).join('') +
        (total > few.length ? `<li><button type="button" class="code-term-more">Show all ${total} →</button></li>` : '');
      card.innerHTML = `<div class="code-term-head"><strong>${esc(term.concept.label)}</strong>
          <code class="code-term-text">${esc(term.text)}</code>
          <button type="button" class="code-term-close" aria-label="Close">×</button></div>
        <p>${esc(term.concept.blurb)}</p>
        <a class="code-term-wiki" data-link href="${wikiUrl(term.concept.page)}">Read the wiki page →</a>
        ${total ? `<div class="code-term-similar-head">Similar lines in ${total} other sketch${total === 1 ? '' : 'es'}:</div><ul>${list}</ul>` : ''}`;
    }
    card.classList.remove('hidden');
    card.scrollTop = 0;
  }

  // Jump to a line in this panel's read view and flash it.
  // `n` is the file's own line number (as shown in the margin).
  function showLine(n) {
    const el = readEl.querySelector(`.code-line[data-ln="${n}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  readEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-term');
    if (btn) {
      if (btn.classList.contains('open')) closeCard();
      else openCard(btn);
      return;
    }
    if (e.target.closest('a')) return;
    const line = e.target.closest('.code-line-note');
    if (line) openLineCard(+line.dataset.n);
  });
  readEl.addEventListener('keydown', (e) => {
    const line = e.target.closest?.('.code-line-note');
    if (line && e.target === line && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openLineCard(+line.dataset.n);
    }
  });
  // Esc closes the card wherever keyboard focus is, while the panel is open.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.classList.contains('hidden') && !container.classList.contains('hidden')) {
      e.stopPropagation();
      closeCard();
    }
  }, true);
  card.addEventListener('click', (e) => {
    if (e.target.closest('.code-term-close')) return closeCard();
    const symBtn = e.target.closest('.note-symbol');
    if (symBtn) return onShowSymbol(symBtn.dataset.sym, { pulse: true });
    if (e.target.closest('.code-term-wiki')) return; // the page-wide router follows the link
    if (e.target.closest('.code-term-more')) {
      const btn = readEl.querySelector('.code-term.open');
      const term = btn && lineTermsCache[+btn.dataset.line]?.[+btn.dataset.term];
      if (term) {
        const { picks } = similarLines(term, currentId);
        card.querySelector('ul').innerHTML = picks
          .map((h) => `<li><button type="button" class="code-term-similar" data-id="${esc(h.id)}" data-line="${h.line}" title="${esc(h.text)}">
            <span class="code-term-similar-name">${esc(h.name)} · line ${h.line}</span>
            <code>${esc(h.text)}</code></button></li>`)
          .join('');
      }
      return;
    }
    const hit = e.target.closest('.code-term-similar');
    if (hit) {
      const line = +hit.dataset.line;
      selectSketch(hit.dataset.id, { jump: true });
      requestAnimationFrame(() => showLine(line));
    }
  });

  function setView(next) {
    view = next;
    viewBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === next));
    editor.classList.toggle('hidden', next !== 'edit');
    readEl.classList.toggle('hidden', next !== 'read');
    if (next === 'read') renderRead();
    else {
      closeCard();
      editor.focus();
    }
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  function selectSketch(id, { jump = false } = {}) {
    currentId = id;
    loadIntoEditor(id);
    renderList();
    if (jump) {
      const idx = sketches.findIndex((s) => s.id === id);
      if (idx !== -1) manager.goTo(idx);
    }
  }

  function renderTabs() {
    const grouped = getGroupedCategories();

    if (activeGroup !== 'All' && !grouped.some((g) => g.group === activeGroup)) {
      activeGroup = 'All';
      activeCategory = null;
    }
    const currentGroup = grouped.find((g) => g.group === activeGroup);
    if (activeCategory && !(currentGroup && currentGroup.categories.includes(activeCategory))) {
      activeCategory = null;
    }

    tabsEl.innerHTML = '';

    const groupRow = document.createElement('div');
    groupRow.className = 'code-panel-tab-row';
    ['All', ...grouped.map((g) => g.group)].forEach((group) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-panel-tab' + (group === activeGroup ? ' active' : '');
      btn.textContent = group;
      btn.addEventListener('click', () => {
        activeGroup = group;
        activeCategory = null;
        renderTabs();
        renderList();
      });
      groupRow.appendChild(btn);
    });
    tabsEl.appendChild(groupRow);

    if (currentGroup && currentGroup.categories.length) {
      const subRow = document.createElement('div');
      subRow.className = 'code-panel-tab-row code-panel-tab-row-sub';
      ['All', ...currentGroup.categories].forEach((cat) => {
        const isActive = cat === 'All' ? !activeCategory : cat === activeCategory;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-panel-tab code-panel-tab-sub' + (isActive ? ' active' : '');
        btn.textContent = cat;
        btn.addEventListener('click', () => {
          activeCategory = cat === 'All' ? null : cat;
          renderTabs();
          renderList();
        });
        subRow.appendChild(btn);
      });
      tabsEl.appendChild(subRow);
    }

    categoryOptions.innerHTML = '';
    getAllCategories().forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      categoryOptions.appendChild(opt);
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const filtered = sketches.filter((s) => {
      const cat = s.category || 'Uncategorized';
      if (activeCategory) return cat === activeCategory;
      if (activeGroup !== 'All') return getGroupForCategory(cat) === activeGroup;
      return true;
    });
    filtered.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'code-panel-list-item' + (s.id === currentId ? ' active' : '');

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'code-panel-list-open';
      // Shared sketches' names and categories are typed by strangers: text, never HTML.
      const nameEl = document.createElement('span');
      nameEl.className = 'code-panel-list-name';
      nameEl.textContent = s.community ? `${s.name} · @${s.community.author}` : s.name;
      const catEl = document.createElement('span');
      catEl.className = 'code-panel-list-cat';
      catEl.textContent = s.community?.status === 'pending' ? 'pending review' : s.category || 'Uncategorized';
      openBtn.append(nameEl, catEl);
      openBtn.addEventListener('click', () => selectSketch(s.id, { jump: true }));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'code-panel-list-delete';
      deleteBtn.title = `Delete "${s.name}"`;
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSketch(s.id, s.name);
      });

      item.appendChild(openBtn);
      item.appendChild(deleteBtn);
      listEl.appendChild(item);
    });
  }

  function deleteSketch(id, name) {
    if (sketches.length <= 1) {
      setStatus('✗ can’t delete the only sketch left', 'error');
      return;
    }
    const undo = import.meta.env.DEV
      ? 'Its file is moved to .trash/ so you can get it back.'
      : "This can't be undone.";
    if (!window.confirm(`Delete "${name}"? ${undo}`)) return;

    manager.removeSketch(id);
    resetEdit(id);
    trashSketch(id);
    refresh();

    const nowCurrent = sketches[manager.currentIndex];
    if (nowCurrent) selectSketch(nowCurrent.id);
    setStatus(`✓ deleted "${name}"`, 'ok');
  }

  function refresh() {
    renderTabs();
    renderList();
  }

  refresh();
  loadIntoEditor(currentId);

  function run() {
    const id = currentId;
    try {
      const def = compileSketch(editor.value);
      const code = editor.value;
      updateSketch(id, def);
      saveEdit(id, code);
      if (sketches[manager.currentIndex]?.id === id) {
        manager.reload();
      }
      refresh();
      setStatus('✓ applied', 'ok');
      persistSketch(id, code).then((result) => reportDiskSave(id, result, 'applied'));
    } catch (err) {
      setStatus(`✗ ${err.message}`, 'error');
    }
  }

  resetBtn.addEventListener('click', () => {
    const id = currentId;
    const fileWasRewritten = wasWrittenToDisk(id);
    resetEdit(id);
    loadIntoEditor(id);
    // The file was overwritten by an earlier Run; put back what it held at page load.
    if (fileWasRewritten) {
      const code = editor.value;
      if (code) persistSketch(id, code).then((result) => reportDiskSave(id, result, 'reset'));
    }
  });

  runBtn.addEventListener('click', run);

  // --- Generate: expand a "// instruction" comment into code, in place ---
  // Mirrors the AI panel's model/errors, but targets one spot in the editor
  // instead of a chat reply, and never touches anything outside that spot.
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });

  // --- New sketch form ---
  newBtn.addEventListener('click', () => {
    newName.value = '';
    newCategory.value = activeCategory || '';
    newForm.classList.remove('hidden');
    newName.focus();
  });
  newCancel.addEventListener('click', () => newForm.classList.add('hidden'));

  newCreate.addEventListener('click', () => {
    const name = newName.value.trim();
    if (!name) {
      setStatus('✗ new sketch needs a name', 'error');
      return;
    }
    const category = newCategory.value.trim() || 'Uncategorized';
    const source =
      newMode.value === 'shader'
        ? shaderStarterSource(name, category)
        : geometryStarterSource(name, category);

    try {
      const def = compileSketch(source);
      const entry = addSketch(def);
      saveEdit(entry.id, source);
      persistSketch(entry.id, source).then((result) => reportDiskSave(entry.id, result, 'created'));
      newForm.classList.add('hidden');
      activeGroup = getGroupForCategory(category);
      activeCategory = category;
      refresh();
      selectSketch(entry.id, { jump: true });
      setStatus('✓ created', 'ok');
    } catch (err) {
      setStatus(`✗ ${err.message}`, 'error');
    }
  });

  // Shares the editor's code: a sketch you already shared is updated (and
  // goes back for review), anything else becomes a new shared sketch.
  shareBtn.addEventListener('click', async () => {
    if (!getUser()) {
      setStatus('Log in to share (top right)', 'error');
      return;
    }
    let def;
    try {
      def = compileSketch(editor.value);
    } catch (err) {
      setStatus(`✗ fix this before sharing: ${err.message}`, 'error');
      return;
    }
    const shared = sketches.find((s) => s.id === currentId)?.community;
    const payload = { name: def.name, category: def.category || 'Uncategorized', code: editor.value };
    shareBtn.disabled = true;
    try {
      const row = shared?.mine ? await updateSharedSketch(shared.id, payload) : await shareSketch(payload);
      setStatus(
        row.status === 'approved'
          ? '✓ shared and published'
          : '✓ shared: it appears for everyone once it has been reviewed',
        'ok'
      );
      onShared?.();
    } catch (err) {
      setStatus(`✗ couldn't share: ${err.message}`, 'error');
    } finally {
      shareBtn.disabled = false;
    }
  });

  // Keep the panel in sync when the sketch changes via arrow keys.
  manager.onChange((sketch) => {
    if (currentId !== sketch.id) selectSketch(sketch.id);
    else renderList();
  });

  return {
    refresh,
    // Shows sketch `id`'s lines start..end (the file's own numbering) in the
    // read view, highlighted. Used by "Open these lines in the code panel".
    // Lights up the lines that work out equation symbol `id` and explains it.
    async showSymbol(id) {
      if (currentId !== manager.getCurrent().id) selectSketch(manager.getCurrent().id);
      setView('read');
      if (!notes && hasCodeNotes(currentId)) {
        notes = await loadCodeNotes(currentId);
        renderRead();
      }
      openSymbolCard(id);
    },
    showLines(id, start, end = start) {
      if (currentId !== id) selectSketch(id);
      setView('read');
      readEl.querySelectorAll('.code-line-hl').forEach((el) => el.classList.remove('code-line-hl'));
      for (let n = start; n <= end; n++) readEl.querySelector(`.code-line[data-ln="${n}"]`)?.classList.add('code-line-hl');
      requestAnimationFrame(() => showLine(start));
    },
    // Opens the "+ New Sketch" form (used by "Write a new sketch" on a profile).
    startNew() {
      newForm.classList.remove('hidden');
      newName.focus();
    },
  };
}
