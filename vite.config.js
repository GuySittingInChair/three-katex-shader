import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { editableToModule, parseHelperNames } from './tools/sketchFiles.js';

// Dev-only persistence for the code panel. Without this, sketches you create
// or edit in the browser live only in that browser's localStorage (per
// origin, so localhost:5173 and 127.0.0.1:5173 don't even share it). With it,
// they're written to real files that git can track:
//
//   POST   /__sketches/<id>            save   -> src/sketches/<id>.js
//   POST   /__sketches/<id>?recover=1  keep a copy that must NOT overwrite the
//                                      file -> recovered/<id>.<stamp>.js
//   DELETE /__sketches/<id>            move   -> .trash/<id>.<stamp>.js
//
// Nothing is ever deleted: overwrites are atomic renames, and "delete" moves
// the file. `vite build` / a hosted copy has none of this and falls back to
// localStorage (see src/core/diskSync.js).

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKETCH_DIR = path.join(ROOT, 'src/sketches');
const HELPERS_FILE = path.join(ROOT, 'src/core/sketchHelpers.js');
const RECOVERED_DIR = path.join(ROOT, 'recovered');
const TRASH_DIR = path.join(ROOT, '.trash');

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_BODY = 2 * 1024 * 1024;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

// Vite's dev server answers cross-origin requests, so any web page could try
// to POST JS into src/. Only same-origin requests to a local host get through.
function sameOriginLocal(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // curl / non-browser; a page can't omit Origin on POST
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function sketchPersist() {
  // Files this endpoint just overwrote. The running page already has the new
  // definition, so Vite's own hot-update for them would only force a reload.
  const ownWrites = new Set();

  return {
    name: 'sketch-persist',
    apply: 'serve',

    handleHotUpdate({ file }) {
      if (ownWrites.delete(file)) return [];
    },

    configureServer(server) {
      server.middlewares.use('/__sketches', async (req, res) => {
        try {
          if (!sameOriginLocal(req)) return send(res, 403, { ok: false, error: 'cross-origin request refused' });

          const url = new URL(req.url, 'http://local');
          const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
          if (!ID.test(id)) return send(res, 400, { ok: false, error: 'bad sketch id' });
          const file = path.join(SKETCH_DIR, `${id}.js`);
          const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

          if (req.method === 'DELETE') {
            if (existing === null) return send(res, 200, { ok: true, trashed: false });
            fs.mkdirSync(TRASH_DIR, { recursive: true });
            const dest = path.join(TRASH_DIR, `${id}.${stamp()}.js`);
            fs.renameSync(file, dest);
            return send(res, 200, { ok: true, trashed: true, path: path.relative(ROOT, dest) });
          }

          if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
          const { code } = await readJson(req);
          if (typeof code !== 'string' || !code.trim()) return send(res, 400, { ok: false, error: 'no code' });
          const helperNames = parseHelperNames(fs.readFileSync(HELPERS_FILE, 'utf8'));

          if (url.searchParams.has('recover')) {
            // Must never fail: fall back to the raw editable text.
            let dest;
            try {
              dest = path.join(RECOVERED_DIR, `${id}.${stamp()}.js`);
              writeAtomic(dest, editableToModule(existing, code, helperNames));
            } catch {
              dest = path.join(RECOVERED_DIR, `${id}.${stamp()}.txt`);
              writeAtomic(dest, code);
            }
            return send(res, 200, { ok: true, path: path.relative(ROOT, dest) });
          }

          let text;
          try {
            text = editableToModule(existing, code, helperNames);
          } catch (err) {
            return send(res, 422, { ok: false, error: err.message });
          }
          if (existing !== null) {
            ownWrites.add(file);
            setTimeout(() => ownWrites.delete(file), 3000);
          }
          writeAtomic(file, text);
          return send(res, 200, { ok: true, path: path.relative(ROOT, file), created: existing === null });
        } catch (err) {
          return send(res, 500, { ok: false, error: err.message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [sketchPersist()],
});
