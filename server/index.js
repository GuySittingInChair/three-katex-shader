import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'comments.json');
const PORT = 4000;
const OLLAMA_URL = 'http://localhost:11434';
// qwen2.5-coder:7b isn't pulled on this machine; qwen3:8b is (tool/thinking
// capable, decent at code) so it's the working default. Swap back to a
// coder model with `ollama pull qwen2.5-coder:7b` if you'd rather have that.
const DEFAULT_MODEL = 'qwen3:8b';

function loadComments() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveComments(comments) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(comments, null, 2));
}

let comments = loadComments();
let nextId = comments.reduce((max, c) => Math.max(max, c.id), 0) + 1;

const app = express();
app.use(express.json());

// Local dev tool, no auth — allow the Vite app (different port) to call it.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/comments', (req, res) => {
  const { sketchId } = req.query;
  const result = sketchId ? comments.filter((c) => c.sketchId === sketchId) : comments;
  res.json(result);
});

app.post('/comments', (req, res) => {
  const { sketchId, author, text } = req.body || {};
  if (!sketchId || !text) {
    return res.status(400).json({ error: 'sketchId and text are required' });
  }
  const comment = {
    id: nextId++,
    sketchId: String(sketchId),
    author: author ? String(author).slice(0, 60) : 'anonymous',
    text: String(text).slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  saveComments(comments);
  res.status(201).json(comment);
});

app.delete('/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  const idx = comments.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = comments.splice(idx, 1);
  saveComments(comments);
  res.json(removed);
});

// Proxies chat to a local Ollama daemon (localhost:11434) and streams its
// NDJSON response straight through — Ollama's own CORS defaults don't allow
// the Vite origin, so the browser talks to this server instead, same as
// the comments API above.
app.post('/ai/chat', async (req, res) => {
  const { messages, model, format } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `format` (a JSON Schema, or the literal "json") turns on Ollama's
      // structured/constrained output — the model becomes unable to emit
      // anything but a JSON value matching that schema, no matter what
      // prose or markdown wrapper it might otherwise reach for.
      body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, stream: true, ...(format ? { format } : {}) }),
    });
  } catch (err) {
    return res.status(502).json({ error: `Ollama not reachable at ${OLLAMA_URL}: ${err.message}` });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return res.status(502).json({ error: `Ollama responded ${upstream.status}: ${detail.slice(0, 300)}` });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  Readable.fromWeb(upstream.body).pipe(res);
});

app.listen(PORT, () => {
  console.log(`Comment server listening on http://localhost:${PORT}`);
});
