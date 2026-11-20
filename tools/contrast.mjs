// WCAG AA contrast check of the site's interface, in every colour palette.
//
//   npx vite preview --port 4719      (after npm run build)
//   node tools/contrast.mjs            BASE_URL=... to point elsewhere
//
// Opens real pages in headless Firefox, and for every visible piece of text
// works out its colour and the colour actually behind it (stacking any
// see-through backgrounds), then reports anything under AA: 4.5:1 for normal
// text, 3:1 for large text (24px+, or 18.66px+ bold). Text drawn over the
// animation itself is skipped (the art behind it moves), and so is text in
// disabled controls (WCAG exempts it).
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:4719';
const FIREFOX = process.env.FIREFOX || '/run/current-system/sw/bin/firefox';
const PALETTES = (process.env.PALETTES || 'classic,space,dusk,paper').split(',');
const VIEWS = [
  ['wiki walkthrough', '/wiki/sketches/gameOfLife'],
  ['wiki home', '/wiki'],
  ['glossary', '/wiki/glossary#golden-angle'],
  ['sketches', '/sketches'],
  ['astronomy', '/astronomy'],
  ['games', '/games'],
  ['connect four', '/games/connect-four'],
  ['code panel', '/s/gameOfLife#L93-96'],
  ['explain panel', '/s/boidsFlock', '#explain-toggle'],
  ['params panel', '/s/boidsFlock', '#params-toggle'],
  ['more menu', '/s/boidsFlock', '#more-toggle'],
];

function audit() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const viewer = document.body.dataset.page === 'viewer';
  // The background behind `el`, stacking see-through layers; null if it reaches the animation.
  const behind = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      // In the sketch viewer the animation covers the page background: text
      // with nothing solid behind it sits on the moving art, so skip it.
      if (viewer && (n === document.body || n === document.documentElement) && !layers.some((l) => l.a >= 0.9)) return null;
      const ncs = getComputedStyle(n);
      // A gradient counts as its faintest colour stop (the worst case).
      const stops = [...ncs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]));
      if (stops.length) layers.push(stops.reduce((a, b) => (b.a < a.a ? b : a)));
      const bg = parse(ncs.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 0.999) break;
      }
    }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
    if (base.a < 1) base = over(base, { r: 255, g: 255, b: 255, a: 1 });
    if (!layers.length || layers[layers.length - 1].a < 0.999) {
      const body = parse(getComputedStyle(document.body).backgroundColor);
      if (body && body.a > 0) base = over(body, base);
    }
    return layers.reverse().reduce((acc, l) => over(l, acc), base);
  };
  const fails = [];
  let checked = 0;
  // Text drawn by CSS (line numbers: content: attr(data-n)) isn't in the page
  // text, so check those ::before boxes too.
  for (const el of document.querySelectorAll('.code-line, .wiki-code .wl[data-n]')) {
    const ps = getComputedStyle(el, '::before');
    if (!ps.content || ps.content === 'none' || el.offsetParent === null) continue;
    const fg0 = parse(ps.color), bg = behind(el);
    if (!fg0 || !bg) continue;
    const c = ratio(over(fg0, bg), bg);
    checked++;
    if (c < 4.5) fails.push({ ratio: +c.toFixed(2), need: 4.5, el: el.className + '::before (line number)', text: el.dataset.ln || el.dataset.n });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (el.closest('[hidden], .hidden, .katex, canvas, svg, .game-board-wrap, .sketch-thumb')) continue;
    if (el.closest('button:disabled, [aria-disabled="true"], select:disabled, input:disabled')) continue;
    let op = 1;
    for (let n = el; n; n = n.parentElement) op *= +getComputedStyle(n).opacity;
    const fg0 = parse(cs.color);
    const bg = behind(el);
    if (!fg0 || !bg) continue;
    const fg = over({ ...fg0, a: fg0.a * op }, bg);
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const c = ratio(fg, bg);
    checked++;
    if (c < need) {
      const id = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '');
      fails.push({ ratio: +c.toFixed(2), need, el: id(el), text: t.textContent.trim().slice(0, 40) });
    }
  }
  return { checked, fails };
}

const browser = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true });
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
for (const pal of PALETTES) {
  for (const [w, h] of [[1280, 860], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    for (const [name, url, click] of VIEWS) {
      const [path, hash] = url.split('#');
      await page.goto(`${BASE}${path}?palette=${pal}${hash ? '#' + hash : ''}`, { waitUntil: 'load' });
      await wait(1400);
      if (click) {
        const vis = await page.evaluate((sel) => { const b = document.querySelector(sel); return !!(b && b.offsetParent); }, click);
        if (!vis) continue; // e.g. phone layouts reach it another way
        await page.click(click);
        await wait(1200);
      }
      const { checked, fails } = await page.evaluate(audit);
      const uniq = [...new Map(fails.map((f) => [f.el + f.ratio, f])).values()];
      if (uniq.length) {
        failures += uniq.length;
        console.log(`✖ ${pal} · ${name} · ${w}px: ${uniq.length} of ${checked} text styles below AA`);
        for (const f of uniq.slice(0, 40)) console.log(`    ${f.ratio}:1 (needs ${f.need}) ${f.el} "${f.text}"`);
      } else console.log(`✔ ${pal} · ${name} · ${w}px: ${checked} text styles, all AA`);
    }
  }
}
await browser.close();
process.exitCode = failures ? 1 : 0;
