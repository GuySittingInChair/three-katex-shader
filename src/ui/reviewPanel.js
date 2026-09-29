import { listPending, review, reviewSound, onAuthChange, isAdmin } from '../core/community.js';
import { soundUrl } from '../core/sounds.js';
import { compileSketch } from '../core/sketchCompiler.js';
import { addSketch, getSketchById, updateSketch, sketches } from '../core/registry.js';
import { communityId } from '../core/communitySketches.js';

// Admin-only queue of pending guide notes and shared sketches. Everything is
// shown as text; a pending sketch only runs if the admin presses Preview.
export function createReviewPanel(container, manager, { toggleButton, onReviewed, toast }) {
  container.innerHTML = `
    <div class="params-panel-header">
      <div class="params-panel-title">Review</div>
      <button type="button" class="params-panel-reset" data-role="refresh">Refresh</button>
    </div>
    <div class="explain-hint">Guide notes, shared sketches and sketch sounds wait here until you approve them. Read a sketch's code before previewing it: previewing runs it in your logged-in browser.</div>
    <div class="review-list" data-role="list"></div>
  `;
  container.classList.add('review-panel');
  const list = container.querySelector('[data-role="list"]');

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function button(label, cls, onClick) {
    const b = el('button', `review-btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  const audio = (path) => {
    const a = document.createElement('audio');
    a.controls = true;
    a.preload = 'none';
    a.src = soundUrl(path);
    return a;
  };

  async function decide(table, id, status) {
    try {
      if (table === 'sounds') await reviewSound(id, status);
      else await review(table, id, status);
      toast?.(status === 'approved' ? 'Approved' : 'Rejected');
      onReviewed?.();
      await render();
    } catch (err) {
      toast?.(`Couldn't update: ${err.message}`);
    }
  }

  function preview(row) {
    if (!window.confirm(`Run "${row.name}" by @${row.author?.username}? Only do this after reading its code.`)) return;
    try {
      const id = communityId(row);
      const def = {
        ...compileSketch(row.code),
        community: { id: row.id, author: row.author?.username ?? 'someone', status: 'pending', mine: false },
      };
      if (getSketchById(id)) updateSketch(id, def);
      else addSketch(def, id);
      onReviewed?.();
      manager.goTo(sketches.findIndex((s) => s.id === id));
    } catch (err) {
      toast?.(`Doesn't compile: ${err.message}`);
    }
  }

  async function render() {
    list.textContent = 'Loading…';
    let pending;
    try {
      pending = await listPending();
    } catch (err) {
      list.textContent = `Couldn't load: ${err.message}`;
      return;
    }
    const count = pending.notes.length + pending.sketches.length + pending.sounds.length;
    toggleButton.textContent = count ? `🛡 Review (${count})` : '🛡 Review';
    list.textContent = '';
    if (!count) list.append(el('p', 'explain-hint', 'Nothing waiting.'));

    for (const note of pending.notes) {
      const card = el('div', 'review-card');
      card.append(
        el('div', 'review-meta', `Guide note · ${note.sketch_id || 'general'} · @${note.author?.username ?? '?'}`),
        el('div', 'review-body', note.body)
      );
      if (note.audio_path) card.append(audio(note.audio_path));
      const row = el('div', 'review-actions');
      row.append(
        button('Approve', 'approve', () => decide('guide_notes', note.id, 'approved')),
        button('Reject', 'reject', () => decide('guide_notes', note.id, 'rejected'))
      );
      card.append(row);
      list.append(card);
    }

    for (const snd of pending.sounds) {
      const card = el('div', 'review-card');
      card.append(el('div', 'review-meta', `Sound for “${snd.name}” · @${snd.author?.username ?? '?'}`), audio(snd.sound_path));
      const row = el('div', 'review-actions');
      row.append(
        button('Approve', 'approve', () => decide('sounds', snd.id, 'approved')),
        button('Reject', 'reject', () => decide('sounds', snd.id, 'rejected'))
      );
      card.append(row);
      list.append(card);
    }

    for (const sk of pending.sketches) {
      const card = el('div', 'review-card');
      const code = el('pre', 'review-code');
      code.append(el('code', '', sk.code));
      card.append(
        el('div', 'review-meta', `Sketch · ${sk.name} (${sk.category || 'Uncategorized'}) · @${sk.author?.username ?? '?'}`),
        code
      );
      const row = el('div', 'review-actions');
      row.append(
        button('Preview', '', () => preview(sk)),
        button('Approve', 'approve', () => decide('shared_sketches', sk.id, 'approved')),
        button('Reject', 'reject', () => decide('shared_sketches', sk.id, 'rejected'))
      );
      card.append(row);
      list.append(card);
    }
  }

  container.querySelector('[data-role="refresh"]').addEventListener('click', render);

  onAuthChange(() => {
    toggleButton.classList.toggle('hidden', !isAdmin());
    if (isAdmin()) render();
    else container.classList.add('hidden');
  });

  return { show: render };
}
