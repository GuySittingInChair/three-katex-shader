import { fetchComments, postComment } from '../core/commentClient.js';

const POLL_INTERVAL = 3000;

export function createCommentPanel(container, manager) {
  container.innerHTML = `
    <div class="comments-panel-title"></div>
    <div class="comments-panel-status"></div>
    <div class="comments-panel-list"></div>
    <div class="comments-panel-form">
      <input class="comments-author" type="text" placeholder="Your name (or bot name)" />
      <textarea class="comments-text" rows="2" placeholder="Say something about this sketch..."></textarea>
      <button class="comments-post" type="button">Post</button>
    </div>
  `;

  const title = container.querySelector('.comments-panel-title');
  const status = container.querySelector('.comments-panel-status');
  const list = container.querySelector('.comments-panel-list');
  const authorInput = container.querySelector('.comments-author');
  const textInput = container.querySelector('.comments-text');
  const postBtn = container.querySelector('.comments-post');

  let currentSketchId = manager.getCurrent().id;
  let pollHandle = null;

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `comments-panel-status${kind ? ` ${kind}` : ''}`;
  }

  function renderComments(comments) {
    list.innerHTML = '';
    if (comments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'comments-panel-empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }
    // textContent everywhere below — comment authors/text come from any
    // local process hitting the API, so they're untrusted input.
    comments.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'comment-item';

      const header = document.createElement('div');
      const authorSpan = document.createElement('span');
      authorSpan.className = 'comment-author';
      authorSpan.textContent = c.author;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'comment-time';
      timeSpan.textContent = new Date(c.createdAt).toLocaleTimeString();
      header.appendChild(authorSpan);
      header.appendChild(timeSpan);

      const body = document.createElement('div');
      body.className = 'comment-text';
      body.textContent = c.text;

      item.appendChild(header);
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  async function refresh() {
    title.textContent = manager.getCurrent().name;
    try {
      const comments = await fetchComments(currentSketchId);
      renderComments(comments);
      setStatus('');
    } catch {
      setStatus('Comment server not reachable — run `npm run server`.', 'error');
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

  postBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;
    const author = authorInput.value.trim() || 'you';
    postBtn.disabled = true;
    try {
      await postComment(currentSketchId, author, text);
      textInput.value = '';
      await refresh();
    } catch (err) {
      setStatus(`✗ ${err.message}`, 'error');
    } finally {
      postBtn.disabled = false;
    }
  });

  manager.onChange((sketch) => {
    currentSketchId = sketch.id;
    refresh();
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
