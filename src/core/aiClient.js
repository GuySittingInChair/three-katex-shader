const API_BASE = 'http://localhost:4000';

// Streams a chat completion from the local server's Ollama proxy. Calls
// onToken(text) as each content fragment arrives, and resolves with the
// full assembled reply once Ollama reports done.
//
// `format` is an optional JSON Schema — pass one to force the reply to be
// valid JSON matching it (Ollama's structured/constrained output), instead
// of hoping free-form prompting produces something parseable. The model
// becomes unable to wrap the answer in markdown/prose/multiple blocks; it
// can literally only emit a JSON value shaped like the schema.
export async function streamChat(messages, onToken, format) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, ...(format ? { format } : {}) }),
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server responded ${res.status}`);
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
