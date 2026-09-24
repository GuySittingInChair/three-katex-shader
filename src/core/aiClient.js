// Under `npm run dev` the browser goes through the local server's Ollama proxy
// (server/index.js). A hosted build has no server, so it talks to the
// visitor's own Ollama directly; that only works once Ollama allows this
// site's origin (OLLAMA_ORIGINS — see README).
export const DEFAULT_MODEL = 'qwen3:8b';

const VIA_SERVER = import.meta.env.DEV;
const SERVER_CHAT = 'http://localhost:4000/ai/chat';
const OLLAMA_CHAT = 'http://localhost:11434/api/chat';

function unreachableMessage() {
  if (VIA_SERVER) {
    return `Local server not reachable — run \`npm run dev:all\` (or \`npm run server\`) with \`ollama serve\` running and ${DEFAULT_MODEL} pulled.`;
  }
  return (
    `Couldn't reach Ollama on this computer (localhost:11434). The AI panel runs on your own machine: ` +
    `install Ollama, run \`ollama pull ${DEFAULT_MODEL}\`, set OLLAMA_ORIGINS=${location.origin} and restart Ollama. ` +
    `If your browser asks to allow access to your local network, allow it. Setup steps are in the README.`
  );
}

// Streams a chat completion. Calls onToken(text) as each content fragment
// arrives, and resolves with the full assembled reply once Ollama reports done.
//
// `format` is an optional JSON Schema — pass one to force the reply to be
// valid JSON matching it (Ollama's structured/constrained output), instead
// of hoping free-form prompting produces something parseable. The model
// becomes unable to wrap the answer in markdown/prose/multiple blocks; it
// can literally only emit a JSON value shaped like the schema.
export async function streamChat(messages, onToken, format) {
  const body = VIA_SERVER
    ? { messages, ...(format ? { format } : {}) }
    : { model: DEFAULT_MODEL, messages, stream: true, ...(format ? { format } : {}) };

  let res;
  try {
    res = await fetch(VIA_SERVER ? SERVER_CHAT : OLLAMA_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(unreachableMessage());
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server responded ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      const chunk = JSON.parse(line);
      if (chunk.error) throw new Error(chunk.error);
      const piece = chunk.message?.content || '';
      if (piece) {
        full += piece;
        onToken(piece);
      }
    }
  }

  return full;
}
