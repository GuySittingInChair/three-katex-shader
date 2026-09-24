import { sketches, updateSketch, addSketch, getGroupedCategories } from '../core/registry.js';
import { getEditableSource, saveEdit, resetEdit, hasEdit, wasWrittenToDisk } from '../core/sourceStore.js';
import { persistSketch, trashSketch } from '../core/diskSync.js';
import { compileSketch } from '../core/sketchCompiler.js';
import { getUser, shareSketch, updateSharedSketch } from '../core/community.js';
import { shaderStarterSource, geometryStarterSource } from '../core/starterTemplates.js';
import { getGroupForCategory, getAllCategories } from '../core/taxonomy.js';
import { streamChat } from '../core/aiClient.js';

// GLSL preprocessor lines start with '#' too (#define, #ifdef, ...) — these
// are real code, not an instruction comment, so a '#'-triggered generation
// must not mistake one for the other.
const GLSL_DIRECTIVE = /^\s*#\s*(define|undef|if|ifdef|ifndef|elif|else|endif|version|extension|pragma|line|error)\b/i;

// Finds the '// instruction' or '# instruction' comment line the cursor is
// currently on, if any. Returns its text bounds and indentation so the
// generated code can be spliced in at exactly that spot.
function commentInstructionAt(text, cursorPos) {
  const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1;
  const nextBreak = text.indexOf('\n', cursorPos);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);

  const m = line.match(/^(\s*)(\/\/|#)\s*(.+?)\s*$/);
  if (!m) return null;
  if (m[2] === '#' && GLSL_DIRECTIVE.test(line)) return null;

  return { lineEnd, indent: m[1], instruction: m[3], line };
}

function extractFirstCodeBlock(text) {
  const m = text.match(/```(?:js|javascript|glsl|jsx)?\n([\s\S]*?)```/);
  return m ? m[1].replace(/\n$/, '') : null;
}

// Annotate/Extract are supposed to hand back a complete, compilable sketch
// — not just a fenced block containing *something*. A local 8B model will
// sometimes ignore that instruction and reply with a bare fragment (just
// the changed part, or an explanation with code-looking text in it), which
// looks like success (a code block was found) right up until Run throws.
// Catching that here, before it ever touches the editor, is cheap insurance.
function validateFullSketch(code) {
  try {
    compileSketch(code);
    return null;
  } catch (err) {
    return err.message;
  }
}

// --- Extract Params: structured-output candidate finding + deterministic
// code editing. The model only ever has to emit a small JSON list (proven
// reliable — see below); every actual text edit is done here in plain JS,
// so the model's well-documented unreliability at faithfully reproducing
// an entire file never gets a chance to corrupt anything. Scoped to GLSL
// literals in shader-mode sketches: promoting one to a uniform is safe
// everywhere (update() always has `ctx` in scope), unlike a 3D sketch's
// standalone point-generator functions, which would need restructuring
// into a closure first — that's still a by-hand job (see Enneper/Möbius).

const EXTRACT_CANDIDATES_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          snippet: { type: 'string' },
          literal: { type: 'string' },
          min: { type: 'number' },
          max: { type: 'number' },
        },
        required: ['name', 'snippet', 'literal', 'min', 'max'],
      },
    },
  },
  required: ['candidates'],
};

const EXTRACT_SYSTEM_PROMPT =
  'You find hardcoded numeric literals inside a GLSL fragment/vertex shader (embedded as a JS template ' +
  'string) that are MEANINGFUL MATH COEFFICIENTS — exponents, scale factors, frequencies, term weights, ' +
  "anything that would visibly change the shader's look if tuned. Do NOT pick loop bounds, array/iteration " +
  'counts, swizzle components, or anything already driven by an existing uniform. Pick at most 6.\n\n' +
  'For each: `name` is a short camelCase identifier; `snippet` is the exact short line of GLSL it appears ' +
  'in, copied verbatim character-for-character from the source (used to locate it — must match exactly); ' +
  '`literal` is the exact numeric text as written (e.g. "6.0", not "6"); `min` and `max` must differ from ' +
  'each other and from the current value, spanning a genuinely useful range around it (roughly half to ' +
  '2-3x for a positive scale, or a symmetric range for something that could go negative).';

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Locates a `key: \`...\`` GLSL template literal's body range. Assumes no
// interior backtick/${} — true of every shader string in this project.
function findShaderBlock(source, key) {
  const m = source.match(new RegExp(`${key}\\s*:\\s*\``));
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const bodyEnd = source.indexOf('`', bodyStart);
  return bodyEnd === -1 ? null : { bodyStart, bodyEnd };
}

function insertUniformDecl(source, bodyStart, bodyEnd, declLine) {
  const body = source.slice(bodyStart, bodyEnd);
  const matches = [...body.matchAll(/^[ \t]*uniform\s+\w+\s+\w+\s*;.*$/gm)];
  const insertAt = matches.length ? bodyStart + matches[matches.length - 1].index + matches[matches.length - 1][0].length : bodyStart;
  return source.slice(0, insertAt) + `\n    ${declLine}` + source.slice(insertAt);
}

function insertAfterMatch(source, pattern, line, indent = '    ') {
  const m = source.match(pattern);
  if (!m) return null;
  const insertAt = m.index + m[0].length;
  return source.slice(0, insertAt) + `\n${indent}${line}` + source.slice(insertAt);
}

// Finds exactly where `literal` sits inside the one place `snippet` occurs
// in `source` — refusing anything ambiguous (snippet not unique, literal
// not unique within it) or unsafe (literal is only part of a larger
// numeric token, e.g. matching "6" inside "6.28" and corrupting it).
function locateLiteral(source, snippet, literal) {
  if (source.split(snippet).length - 1 !== 1) return null;
  if (!snippet.includes(literal)) return null;
  if (snippet.indexOf(literal) !== snippet.lastIndexOf(literal)) return null;

  const litIdxInSnippet = snippet.indexOf(literal);
  const before = snippet[litIdxInSnippet - 1];
  const after = snippet[litIdxInSnippet + literal.length];
  const isNumChar = (c) => c !== undefined && /[0-9.]/.test(c);
  if (isNumChar(before) || isNumChar(after)) return null;

  return source.indexOf(snippet) + litIdxInSnippet;
}

// Applies one candidate to `source`, returning the fully-wired result (new
// uniform declared, literal replaced, params/uniforms()/update() entries
// added) or { applied: false, reason } if anything about it looks unsafe.
function applyExtractedCandidate(source, candidate, existingNames) {
  const { name, snippet, literal } = candidate || {};
  if (typeof name !== 'string' || !/^[a-z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return { applied: false, reason: 'invalid or missing name' };
  }
  if (existingNames.has(name)) return { applied: false, reason: 'name collides with an existing param' };
  if (typeof snippet !== 'string' || typeof literal !== 'string') {
    return { applied: false, reason: 'missing snippet/literal' };
  }

  let lo = Number(candidate.min), hi = Number(candidate.max);
  const value = parseFloat(literal);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(value)) {
    return { applied: false, reason: 'non-numeric range or literal' };
  }
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi - lo < 1e-9) {
    // Degenerate range (model set min===max) — synthesize a usable one
    // around the value rather than reject an otherwise-good candidate.
    const span = Math.max(Math.abs(value) * 1.5, 0.5);
    lo = value - span;
    hi = value + span;
  }

  const litStart = locateLiteral(source, snippet, literal);
  if (litStart == null) return { applied: false, reason: 'snippet/literal not uniquely or safely located' };

  const frag = findShaderBlock(source, 'fragmentShader');
  const vert = findShaderBlock(source, 'vertexShader');
  const inRange = (block) => block && litStart >= block.bodyStart && litStart < block.bodyEnd;
  const targetKey = inRange(frag) ? 'fragmentShader' : inRange(vert) ? 'vertexShader' : null;
  if (!targetKey) {
    return { applied: false, reason: 'not inside a shader string (only GLSL uniforms are auto-extracted)' };
  }

  const uniformName = 'u' + capitalize(name);
  let next = source.slice(0, litStart) + uniformName + source.slice(litStart + literal.length);

  const target = findShaderBlock(next, targetKey); // re-locate post-edit
  next = insertUniformDecl(next, target.bodyStart, target.bodyEnd, `uniform float ${uniformName};`);

  const trimNum = (n) => String(Number(n.toFixed(4)));
  const withParam = insertAfterMatch(
    next,
    /params\s*:\s*\{/,
    `${name}: { value: ${literal}, min: ${trimNum(lo)}, max: ${trimNum(hi)} },`,
    '    '
  );
  if (!withParam) return { applied: false, reason: 'could not find params object to extend' };

  // uniforms() is called with no arguments (see SketchRunner.build()) — it
  // seeds the material's initial value, not a live one, so this must be the
  // literal, never `ctx.params.x` (ctx isn't in scope here; only update() below
  // receives it — every existing sketch already follows exactly this split).
  const withUniformsEntry = insertAfterMatch(
    withParam,
    /uniforms\s*\(\s*\)\s*\{[\s\S]*?return\s*\{/,
    `${uniformName}: { value: ${literal} },`,
    '      '
  );
  if (!withUniformsEntry) return { applied: false, reason: 'could not find uniforms() to extend' };

  const withUpdateLine = insertAfterMatch(
    withUniformsEntry,
    /update\s*\(\s*ctx\s*,\s*state\s*\)\s*\{/,
    `state.uniforms.${uniformName}.value = ctx.params.${name};`,
    '    '
  );
  if (!withUpdateLine) return { applied: false, reason: 'could not find update() to extend' };

  return { applied: true, source: withUpdateLine };
}

export function createCodePanel(container, manager, { onShared } = {}) {
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
    <textarea class="code-panel-editor" spellcheck="false"></textarea>
    <div class="code-panel-footer">
      <button class="code-panel-run" type="button">Run &#9654; (Ctrl+Enter)</button>
      <button class="code-panel-generate" type="button" title="Put the cursor on a '// instruction' comment line and expand it into code (Ctrl+Shift+G)">✨ Generate</button>
      <button class="code-panel-annotate" type="button" title="Ask the local AI to walk through this sketch with inline commentary, notebook-style (Ctrl+Shift+A)">🪶 Annotate</button>
      <button class="code-panel-extract" type="button" title="Ask the local AI to find hardcoded math constants and turn them into real, adjustable params (Ctrl+Shift+E)">🔬 Extract Params</button>
      <button class="code-panel-share" type="button" title="Share this sketch on the site. Others see it after it has been reviewed.">⇪ Share</button>
      <span class="code-panel-status"></span>
    </div>
  `;

  const tabsEl = container.querySelector('.code-panel-tabs');
  const listEl = container.querySelector('.code-panel-list');
  const editor = container.querySelector('.code-panel-editor');
  const runBtn = container.querySelector('.code-panel-run');
  const generateBtn = container.querySelector('.code-panel-generate');
  const annotateBtn = container.querySelector('.code-panel-annotate');
  const extractBtn = container.querySelector('.code-panel-extract');
  const shareBtn = container.querySelector('.code-panel-share');
  const resetBtn = container.querySelector('.code-panel-reset');
  const status = container.querySelector('.code-panel-status');

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
  let aiBusy = false; // guards generate/annotate against overlapping calls

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
  }

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
  async function generateFromComment() {
    if (aiBusy) return;
    const hit = commentInstructionAt(editor.value, editor.selectionStart);
    if (!hit) {
      setStatus("✗ put the cursor on a '// instruction' (or '# instruction') comment line first", 'error');
      return;
    }

    aiBusy = true;
    generateBtn.disabled = true;
    annotateBtn.disabled = true;
    extractBtn.disabled = true;
    setStatus(`✨ generating "${hit.instruction}"...`, '');

    try {
      const sketch = manager.getCurrent();
      const reply = await streamChat(
        [
          {
            role: 'system',
            content:
              'You are a code-completion engine embedded in a Three.js/GLSL creative-coding editor. ' +
              'You are given a full sketch source and one instruction comment inside it. Reply with ONLY ' +
              'the code that comment is asking for — the snippet that replaces it, not the whole file — ' +
              'matching the surrounding indentation and the language at that point (JS, or GLSL if inside ' +
              'a fragmentShader/vertexShader template string). Add brief inline comments explaining any ' +
              'non-obvious step, the way a well-annotated Jupyter notebook cell walks through what it does. ' +
              'Reply with exactly one fenced code block and nothing else.',
          },
          {
            role: 'user',
            content: `Sketch "${sketch.name}" (mode: ${sketch.mode}), full current source:\n\n\`\`\`js\n${editor.value}\n\`\`\`\n\nExpand this comment, found in the source above, into code: "${hit.instruction}"`,
          },
        ],
        () => {}
      );

      const code = extractFirstCodeBlock(reply);
      if (!code) throw new Error('model reply had no code block');

      const indented = code
        .split('\n')
        .map((l) => hit.indent + l)
        .join('\n');
      const value = editor.value;
      editor.value = value.slice(0, hit.lineEnd) + '\n' + indented + value.slice(hit.lineEnd);
      const cursor = hit.lineEnd + 1 + indented.length;
      editor.setSelectionRange(cursor, cursor);
      editor.focus();
      setStatus('✓ generated — review and hit Run to apply', 'ok');
    } catch (err) {
      setStatus(
        `✗ ${err.message} — is \`ollama serve\` running and \`npm run server\` up?`,
        'error'
      );
    } finally {
      aiBusy = false;
      generateBtn.disabled = false;
      annotateBtn.disabled = false;
      extractBtn.disabled = false;
    }
  }

  // --- Annotate: same code, walked through with explanatory comments ---
  async function annotate() {
    if (aiBusy) return;
    aiBusy = true;
    generateBtn.disabled = true;
    annotateBtn.disabled = true;
    extractBtn.disabled = true;
    setStatus('🪶 annotating...', '');

    try {
      const sketch = manager.getCurrent();
      const reply = await streamChat(
        [
          {
            role: 'system',
            content:
              'You are a code-documentation assistant embedded in a Three.js/GLSL creative-coding editor. ' +
              'Given a sketch\'s full source, return the exact same code — same logic and structure, nothing ' +
              'added or removed functionally — with concise explanatory comments woven through it, the way ' +
              "a well-annotated Jupyter notebook walks through what each part of a cell does. Comment the " +
              '"why", not just restate the "what". CRITICAL: your reply replaces the ENTIRE file — every ' +
              'field (name, description, category, mode, params, setup, update, dispose) must be present, ' +
              'not just the parts you commented. Reply with exactly one fenced code block and nothing else.',
          },
          { role: 'user', content: `Annotate this "${sketch.name}" sketch:\n\n\`\`\`js\n${editor.value}\n\`\`\`` },
        ],
        () => {}
      );

      const code = extractFirstCodeBlock(reply);
      if (!code) throw new Error('model reply had no code block');
      const invalidReason = validateFullSketch(code);
      if (invalidReason) throw new Error(`model reply wasn't a complete sketch (${invalidReason}) — nothing changed`);
      editor.value = code;
      setStatus('✓ annotated — review and hit Run to apply', 'ok');
    } catch (err) {
      setStatus(
        `✗ ${err.message} — is \`ollama serve\` running and \`npm run server\` up?`,
        'error'
      );
    } finally {
      aiBusy = false;
      generateBtn.disabled = false;
      annotateBtn.disabled = false;
      extractBtn.disabled = false;
    }
  }

  // --- Extract Params: turn hardcoded math literals into real params ---
  // The hard part of this isn't finding numbers in the source — regex
  // does that fine — it's telling a meaningful coefficient (an exponent,
  // a scale factor, a term weight) apart from a structural constant (a
  // loop bound, an array size, a swizzle index) that would just be a
  // useless or actively broken slider. That judgment call is handed to
  // the model rather than hand-coded as a heuristic.
  async function extractParams() {
    if (aiBusy) return;
    const sketch = manager.getCurrent();
    if (sketch.mode !== 'shader') {
      setStatus(
        "✗ auto-extract only handles shader-mode sketches for now — this one's coefficients live in a " +
          'plain JS function outside setup(), which needs restructuring into a closure by hand (see Enneper/Möbius)',
        'error'
      );
      return;
    }

    aiBusy = true;
    generateBtn.disabled = true;
    annotateBtn.disabled = true;
    extractBtn.disabled = true;
    setStatus('🔬 finding candidates...', '');

    try {
      const reply = await streamChat(
        [
          { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
          { role: 'user', content: `Find extractable coefficients in this "${sketch.name}" sketch:\n\n${editor.value}` },
        ],
        () => {},
        EXTRACT_CANDIDATES_SCHEMA
      );

      let parsed;
      try {
        parsed = JSON.parse(reply);
      } catch {
        throw new Error('model reply was not valid JSON (unexpected — structured output should guarantee this)');
      }
      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      if (!candidates.length) throw new Error('model found no extractable candidates in this sketch');

      const existingNames = new Set(Object.keys(manager.getParamsSchema()));
      let source = editor.value;
      const applied = [];
      const skipped = [];
      for (const candidate of candidates) {
        const result = applyExtractedCandidate(source, candidate, existingNames);
        if (result.applied) {
          source = result.source;
          existingNames.add(candidate.name);
          applied.push(candidate.name);
        } else {
          skipped.push(`${candidate?.name || '?'} (${result.reason})`);
        }
      }

      if (!applied.length) throw new Error(`no candidates could be safely applied — ${skipped.join('; ')}`);

      const invalidReason = validateFullSketch(source);
      if (invalidReason) throw new Error(`applying candidates broke compilation (${invalidReason}) — nothing changed`);

      editor.value = source;
      const skippedNote = skipped.length ? ` (skipped ${skipped.length}: ${skipped.join('; ')})` : '';
      setStatus(`✓ extracted ${applied.length}: ${applied.join(', ')}${skippedNote} — review, then Run to apply`, 'ok');
    } catch (err) {
      setStatus(
        `✗ ${err.message} — is \`ollama serve\` running and \`npm run server\` up?`,
        'error'
      );
    } finally {
      aiBusy = false;
      generateBtn.disabled = false;
      annotateBtn.disabled = false;
      extractBtn.disabled = false;
    }
  }

  generateBtn.addEventListener('click', generateFromComment);
  annotateBtn.addEventListener('click', annotate);
  extractBtn.addEventListener('click', extractParams);

  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      generateFromComment();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      annotate();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      extractParams();
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
      setStatus('Sign in with GitHub to share (button at the top right)', 'error');
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
    // Drops code (e.g. from the AI panel) into the editor for the
    // currently-open sketch. Left un-applied until the user hits Run, so
    // an AI suggestion never overwrites a sketch without a review step.
    setEditorContent(source) {
      editor.value = source;
      setStatus('AI code inserted — review and hit Run to apply', 'ok');
    },
  };
}
