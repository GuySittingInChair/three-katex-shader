import { sketches, updateSketch, addSketch, getGroupedCategories } from '../core/registry.js';
import { getEditableSource, saveEdit, resetEdit, hasEdit, wasWrittenToDisk } from '../core/sourceStore.js';
import { persistSketch, trashSketch } from '../core/diskSync.js';
import { compileSketch } from '../core/sketchCompiler.js';
import { getUser, shareSketch, updateSharedSketch } from '../core/community.js';
import { shaderStarterSource, geometryStarterSource } from '../core/starterTemplates.js';
import { getGroupForCategory, getAllCategories } from '../core/taxonomy.js';

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
    // Opens the "+ New Sketch" form (used by "Write a new sketch" on a profile).
    startNew() {
      newForm.classList.remove('hidden');
      newName.focus();
    },
  };
}
