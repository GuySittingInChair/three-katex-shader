import { listComments, addComment, deleteComment, onAuthChange, getUser, isAdmin } from '../core/community.js';
import { promptSignIn } from './signIn.js';

const POLL_INTERVAL = 8000;

export function createCommentPanel(container, manager) {
  container.innerHTML = `
    <div class="comments-panel-title"></div>
    <div class="comments-panel-status"></div>
    <div class="comments-panel-list"></div>
    <div class="comments-panel-form">
      <textarea class="comments-text" rows="3" maxlength="2000" placeholder="Say something about this sketch..."></textarea>
      <button class="comments-post" type="button">Post</button>
    </div>
    <button class="comments-signin" type="button">Sign in to comment</button>
  `;

  const title = container.querySelector('.comments-panel-title');
  const status = container.querySelector('.comments-panel-status');
  const list = container.querySelector('.comments-panel-list');
  const form = container.querySelector('.comments-panel-form');
  const textInput = container.querySelector('.comments-text');
  const postBtn = container.querySelector('.comments-post');
  const signInBtn = container.querySelector('.comments-signin');

  let currentSketchId = manager.getCurrent().id;
  let pollHandle = null;
  let lastRendered = '';

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `comments-panel-status${kind ? ` ${kind}` : ''}`;
  }

  // textContent throughout: comments are written by strangers.
  function renderComments(comments) {
    const signature = JSON.stringify([getUser()?.id, comments.map((c) => c.id)]);
    if (signature === lastRendered) return;
    lastRendered = signature;
    list.innerHTML = '';
    if (comments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'comments-panel-empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }
    const me = getUser()?.id;
    comments.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'comment-item';

      const header = document.createElement('div');
      header.className = 'comment-header';
      if (c.author?.avatar_url) {
        const img = document.createElement('img');
        img.className = 'comment-avatar';
        img.src = c.author.avatar_url;
        img.alt = '';
        header.appendChild(img);
      }
      const authorSpan = document.createElement('span');
      authorSpan.className = 'comment-author';
      authorSpan.textContent = c.author?.username ?? 'someone';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'comment-time';
      timeSpan.textContent = new Date(c.created_at).toLocaleString();
      header.append(authorSpan, timeSpan);

      if (c.user_id === me || isAdmin()) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'comment-delete';
        del.title = 'Delete comment';
        del.textContent = '×';
        del.addEventListener('click', async () => {
          if (!window.confirm('Delete this comment?')) return;
          try {
            await deleteComment(c.id);
            await refresh();
          } catch (err) {
            setStatus(`✗ ${err.message}`, 'error');
          }
        });
        header.appendChild(del);
      }

      const body = document.createElement('div');
      body.className = 'comment-text';
      body.textContent = c.body;

      item.append(header, body);
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }

  async function refresh() {
    title.textContent = `Comments · ${manager.getCurrent().name}`;
    try {
      renderComments(await listComments(currentSketchId));
      if (status.classList.contains('error')) setStatus('');
    } catch (err) {
      setStatus(`Couldn't load comments: ${err.message}`, 'error');
    }
  }

  function startPolling() {
    stopPolling();
    refresh();
    pollHandle = setInterval(refresh, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = null;
  }

  onAuthChange((user) => {
    form.classList.toggle('hidden', !user);
    signInBtn.classList.toggle('hidden', Boolean(user));
    lastRendered = '';
    if (pollHandle) refresh();
  });

  signInBtn.addEventListener('click', () => promptSignIn());

  postBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;
    postBtn.disabled = true;
    try {
      await addComment(currentSketchId, text);
      textInput.value = '';
      await refresh();
      setStatus('');
    } catch (err) {
      setStatus(`✗ ${err.message}`, 'error');
    } finally {
      postBtn.disabled = false;
    }
  });

  manager.onChange((sketch) => {
    currentSketchId = sketch.id;
    lastRendered = '';
    if (pollHandle) refresh(); // only while the panel is open
  });

  return {
    show() {
      startPolling();
    },
    hide() {
      stopPolling();
    },
  };
}
