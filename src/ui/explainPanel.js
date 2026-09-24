import katex from 'katex';
import { marked } from 'marked';
import guideSource from '../../docs/guide.md?raw';

// Right-docked reading panel built entirely from docs/guide.md:
//   • "This sketch" — the symbols in the live equation, looked up in the guide's
//     tables (any table with a "LaTeX" / "You write" column), the sketch's
//     latex source as typed, and the guide section whose body names
//     `File: \`src/sketches/<id>.js\`` as that sketch's walkthrough.
//   • "Guide" — the whole document.
// Edit the guide and the panel follows; nothing is duplicated here.

const slug = (text) =>
  text.toLowerCase().trim().replace(/[^\p{L}\p{N}\- _]/gu, '').replace(/ /g, '-');

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseSections(md) {
  const sections = [];
  let current = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) sections.push((current = { heading: line.slice(3).trim(), lines: [line] }));
    else current?.lines.push(line);
  }
  return sections.map((s) => {
    const body = s.lines.join('\n');
    const file = /^File: `src\/sketches\/([\w-]+)\.js`/m.exec(body);
    return { heading: s.heading, body, sketchId: file?.[1] ?? null };
  });
}

// Every glossary row, keyed by the LaTeX it explains. A key is a command
// (`\theta`, `\mathbb{R}`) or, for snippets like `S^3` / `e^{i\alpha}`, the
// literal text before the first backslash. A command belongs first to a row
// where it leads a snippet (so `\mathrm` means "upright label", not the
// θᵢ^Fib row that merely uses it); other rows only fill gaps.
function parseGlossary(md) {
  const primary = new Map();
  const secondary = new Map();
  const lines = md.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('|') || !/^\|[\s|:-]+\|$/.test(lines[i + 1].trim())) continue;
    const header = splitRow(lines[i]);
    const col = (re) => header.findIndex((h) => re.test(h));
    const texCol = col(/^(latex|you write)/i);
    if (texCol === -1) continue;
    const cheatSheet = /^you write/i.test(header[texCol]);
    const shownCol = col(/^you get/i);
    const nameCol = col(/^(name|read as)/i);
    const meaningCol = col(/meaning|notes/i);
    const codeCol = col(/^code/i);

    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
      // The cheat sheet writes LaTeX as it appears in a JS string (doubled
      // backslashes); show everything here as KaTeX itself receives it.
      const cells = splitRow(lines[j]).map((c) =>
        cheatSheet ? c.replace(/`[^`]+`/g, (m) => m.replace(/\\\\/g, '\\')) : c
      );
      const entry = {
        shown: cells[shownCol === -1 ? 0 : shownCol] ?? '',
        name: nameCol !== -1 ? cells[nameCol] ?? '' : cheatSheet ? cells[shownCol] ?? '' : '',
        meaning: meaningCol === -1 ? '' : cells[meaningCol] ?? '',
        tex: cells[texCol] ?? '',
        code: codeCol === -1 ? '' : cells[codeCol] ?? '',
        snippets: [],
      };
      for (const [, snippet] of entry.tex.matchAll(/`([^`]+)`/g)) {
        entry.snippets.push(snippet);
        const commands = snippet.match(/\\(?:mathbb|mathbf|operatorname)\{[^}]*\}|\\[a-zA-Z]+/g) || [];
        commands.forEach((c, k) => {
          const map = k === 0 ? primary : secondary;
          if (!map.has(c)) map.set(c, entry);
        });
        let literal = snippet.split('\\')[0].trim();
        if (cheatSheet && /^[a-z][_^]/.test(literal)) literal = literal[1]; // `x_i`, `x^2` explain any sub/superscript
        if ((literal.length >= 3 || literal === '_' || literal === '^') && !primary.has(literal)) {
          primary.set(literal, entry);
        }
      }
      i = j;
    }
  }
  for (const [k, v] of secondary) if (!primary.has(k)) primary.set(k, v);
  return primary;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matchSymbols(glossary, tex) {
  const hits = [];
  for (const [key, entry] of glossary) {
    const re = new RegExp(escapeRe(key) + (/[a-zA-Z]$/.test(key) ? '(?![a-zA-Z])' : ''));
    const m = re.exec(tex);
    if (m) hits.push({ key, entry, at: m.index });
  }
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set();
  return hits.filter(({ entry }) => !seen.has(entry) && seen.add(entry));
}

function withHeadingIds(root) {
  root.querySelectorAll('h1, h2, h3, h4').forEach((h) => (h.id = slug(h.textContent)));
  return root;
}

const inline = (md) => marked.parseInline(md);

// The symbol drawn by KaTeX from the snippet that contains it; spacing
// commands draw nothing, so those fall back to the guide's own wording.
const glyphCache = new Map();
function glyph(entry, key) {
  const snippet = entry.snippets.find((s) => s.includes(key)) ?? entry.snippets[0];
  const id = `${snippet}\u0000${entry.shown}`;
  if (!glyphCache.has(id)) {
    let html = '';
    try {
      html = katex.renderToString(snippet, { throwOnError: true });
      const probe = document.createElement('div');
      probe.innerHTML = html;
      if (!probe.querySelector('.katex-html')?.textContent.trim()) html = '';
    } catch {
      html = '';
    }
    glyphCache.set(id, html || `<span class="explain-symbol-words">${inline(entry.shown)}</span>`);
  }
  return glyphCache.get(id);
}

export function createExplainPanel(container, manager, { onVisibilityChange } = {}) {
  const sections = parseSections(guideSource);
  const glossary = parseGlossary(guideSource);

  container.innerHTML = `
    <div class="params-panel-header">
      <div class="params-panel-title">Explain · <span data-role="name"></span></div>
      <div class="explain-tabs">
        <button type="button" class="explain-tab" data-tab="sketch">This sketch</button>
        <button type="button" class="explain-tab" data-tab="guide">Guide</button>
      </div>
    </div>
    <div class="explain-body" data-view="sketch">
      <p class="explain-description" data-role="description"></p>
      <h3>Symbols in the equation</h3>
      <p class="explain-hint">In the order they appear. “Type” is what goes in the LaTeX string (double each backslash inside JavaScript).</p>
      <div class="explain-symbols" data-role="symbols"></div>
      <details class="explain-source">
        <summary>The equation’s source, as typed in the sketch</summary>
        <pre><code data-role="source"></code></pre>
      </details>
      <div class="explain-doc" data-role="walkthrough"></div>
    </div>
    <div class="explain-body explain-doc hidden" data-view="guide"></div>
  `;
  container.classList.add('explain-panel');
  const $ = (r) => container.querySelector(`[data-role="${r}"]`);
  const views = {
    sketch: container.querySelector('[data-view="sketch"]'),
    guide: container.querySelector('[data-view="guide"]'),
  };

  views.guide.innerHTML = marked.parse(guideSource);
  withHeadingIds(views.guide);

  let tab = 'sketch';
  function showTab(name) {
    tab = name;
    for (const [key, el] of Object.entries(views)) el.classList.toggle('hidden', key !== name);
    container.querySelectorAll('.explain-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  }
  container.querySelectorAll('.explain-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab('sketch');

  // In-page links (the guide's contents, cross-references) scroll the Guide
  // view instead of touching the app's URL.
  container.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const target = views.guide.querySelector(`[id="${CSS.escape(decodeURIComponent(a.hash.slice(1)))}"]`);
    if (!target) return;
    showTab('guide');
    target.scrollIntoView({ block: 'start' });
  });

  let tex = '';
  let lastSignature = null;
  let sketchDirty = true;

  function renderSymbols() {
    const hits = matchSymbols(glossary, tex);
    const signature = hits.map((h) => h.key).join(' ');
    if (signature === lastSignature) return;
    lastSignature = signature;
    const list = $('symbols');
    if (!hits.length) {
      list.innerHTML = '<p class="explain-hint">No equation, or none of its symbols are in the guide yet.</p>';
      return;
    }
    list.innerHTML = hits
      .map(({ key, entry }) => {
        const title = [entry.name, entry.meaning].filter(Boolean).map(inline).join(' — ');
        const code = entry.code && entry.code !== '—' ? `<span>code: ${inline(entry.code)}</span>` : '';
        return `
          <div class="explain-symbol">
            <div class="explain-symbol-glyph">${glyph(entry, key)}</div>
            <div class="explain-symbol-text">
              <div>${title}</div>
              <div class="explain-symbol-type"><span>type: ${inline(entry.tex)}</span>${code}</div>
            </div>
          </div>`;
      })
      .join('');
  }

  function renderSketch() {
    sketchDirty = false;
    const sketch = manager.getCurrent();
    $('name').textContent = sketch.name;
    $('description').textContent = sketch.description || '';
    $('source').textContent = typeof sketch.latex === 'function' ? sketch.latex.toString() : sketch.latex || '(none)';

    const section = sections.find((s) => s.sketchId === sketch.id);
    const walk = $('walkthrough');
    if (section) {
      walk.innerHTML = marked.parse(section.body);
      withHeadingIds(walk);
    } else {
      walk.innerHTML = `<h3>Walkthrough</h3><p class="explain-hint">No walkthrough for this sketch yet. Add a section to <code>docs/guide.md</code> containing the line <code>File: \`src/sketches/${sketch.id}.js\`</code> and it will appear here.</p>`;
    }
    lastSignature = null;
    renderSymbols();
    views.sketch.scrollTop = 0;
  }

  const isOpen = () => !container.classList.contains('hidden');

  function setOpen(open) {
    container.classList.toggle('hidden', !open);
    document.body.classList.toggle('explain-open', open);
    if (open && sketchDirty) renderSketch();
    onVisibilityChange?.(open);
  }

  manager.onChange(() => {
    sketchDirty = true;
    if (isOpen()) renderSketch();
  });

  return {
    isOpen,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen(!isOpen()),
    setLatex(next) {
      tex = next || '';
      if (isOpen() && !sketchDirty) renderSymbols();
    },
  };
}
