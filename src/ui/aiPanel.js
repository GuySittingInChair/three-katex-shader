import { streamChat } from '../core/aiClient.js';
import { getEditableSource } from '../core/sourceStore.js';

const MODEL_LABEL = 'qwen3:8b (local)';
const MAX_HISTORY = 12; // trailing messages kept, not counting the system prompt

const SYSTEM_PROMPT = (sketch, source) => `You are a coding assistant embedded in a Three.js/WebGL creative-coding \
tool called three-katex-shader. Sketches are plain JS objects (mode 'shader' \
or '3d') with a fragmentShader (GLSL) or a THREE.js setup()/update()/dispose() \
lifecycle — see the current sketch's source below for the exact shape to follow.

The user is currently viewing "${sketch.name}" (category: ${sketch.category || 'Uncategorized'}). \
Its current editable source is:

\`\`\`js
${source}
\`\`\`

When you suggest a code change, reply with the FULL replacement source in a single \
fenced \`\`\`js code block (same shape as above: a single \`return { ... }\` sketch object) \
so it can be dropped straight into the editor. Keep prose brief.`;

function extractCodeBlocks(text) {
  const blocks = [];
  const re = /```(?:js|javascript|glsl)?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) blocks.push(m[1].trim());
  return blocks;
}

export function createAiPanel(container, manager, { onInsertCode } = {}) {
  container.innerHTML = `
    <div class="ai-panel-title">Local AI · ${MODEL_LABEL}</div>
    <div class="ai-panel-status"></div>
    <div class="ai-panel-list"></div>
    <div class="ai-panel-form">
      <textarea class="ai-panel-input" rows="2" placeholder="Ask about this sketch, or request a change..."></textarea>
      <button class="ai-panel-send" type="button">Send</button>
    </div>
  `;

  const status = container.querySelector('.ai-panel-status');
  const list = container.querySelector('.ai-panel-list');
  const input = container.querySelector('.ai-panel-input');
  const sendBtn = container.querySelector('.ai-panel-send');

  // Conversation sent to the model. A fresh system prompt (with the
  // sketch's current source) is rebuilt on every send, so edits made
  // in-between messages are never stale.
  let history = [];
  let sending = false;

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `ai-panel-status${kind ? ` ${kind}` : ''}`;
  }

  function addMessage(role) {
    const item = document.createElement('div');
    item.className = `ai-message ai-message-${role}`;
    const body = document.createElement('div');
    body.className = 'ai-message-text';
    item.appendChild(body);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    return { item, body };
  }

  function renderCodeActions(item, text) {
    item.querySelectorAll('.ai-message-insert').forEach((btn) => btn.remove());
    for (const code of extractCodeBlocks(text)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-message-insert';
      btn.textContent = 'Insert into editor';
      btn.addEventListener('click', () => onInsertCode?.(code));
      item.appendChild(btn);
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text || sending) return;

    const sketch = manager.getCurrent();
    const source = getEditableSource(sketch.id);

    input.value = '';
    sending = true;
    sendBtn.disabled = true;
    setStatus('thinking...', '');

    addMessage('user').body.textContent = text;
    history.push({ role: 'user', content: text });
    history = history.slice(-MAX_HISTORY);

    const { item, body } = addMessage('assistant');

    try {
      const reply = await streamChat(
        [{ role: 'system', content: SYSTEM_PROMPT(sketch, source) }, ...history],
        (piece) => {
          body.textContent += piece;
          list.scrollTop = list.scrollHeight;
        }
      );
      history.push({ role: 'assistant', content: reply });
      renderCodeActions(item, reply);
      setStatus('');
    } catch (err) {
      setStatus(
        `✗ ${err.message} — is \`ollama serve\` running with qwen2.5-coder:7b pulled, and \`npm run server\` up?`,
        'error'
      );
      if (!body.textContent) item.remove();
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });

  // Fresh conversation each time the user switches sketches — the system
  // prompt is rebuilt from the new sketch anyway, so stale history would
  // just confuse the model.
  manager.onChange(() => {
    history = [];
    list.innerHTML = '';
    setStatus('');
  });

  return {};
}
