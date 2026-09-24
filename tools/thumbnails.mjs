// Captures a gallery thumbnail for every sketch into public/thumbs/<id>.jpg.
//
//   npm run dev            (in another terminal)
//   npm run thumbs         all sketches
//   npm run thumbs -- hopfFibration boysSurface    just these
//
// Drives Firefox headless (FIREFOX=/path/to/firefox to override) at each
// sketch's /s/<id> page with the controls hidden, after letting it animate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/thumbs');
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const FIREFOX = process.env.FIREFOX || '/run/current-system/sw/bin/firefox';
const SETTLE_MS = Number(process.env.SETTLE_MS || 3500);

const all = fs
  .readdirSync(path.join(ROOT, 'src/sketches'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 500 });

let failed = 0;
for (const [i, id] of ids.entries()) {
  try {
    await page.goto(`${BASE}/s/${encodeURIComponent(id)}`, { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    // Set after the app has started (it resets the view on load).
    await page.evaluate(() => {
      document.body.dataset.view = 'clean';
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 78 });
    console.log(`[${i + 1}/${ids.length}] ${id}`);
  } catch (err) {
    failed++;
    console.warn(`[${i + 1}/${ids.length}] ${id} FAILED: ${err.message}`);
  }
}
await browser.close();
if (failed) process.exitCode = 1;
