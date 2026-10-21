// Draws the live equation (and an optional "sketch name · aiship.lol" tag) on
// top of recorded frames, so a clip carries the maths and not just the picture.
//
// The on-screen equation is KaTeX HTML, which a canvas can't draw. Rasterising
// HTML through an SVG <foreignObject> taints the canvas in Safari (and needs the
// KaTeX fonts inlined), so for the video the same LaTeX goes through MathJax's
// SVG output instead: plain paths, no fonts, no foreignObject, safe to draw
// everywhere. MathJax is loaded only the first time a clip needs it.
//
// Sizes are in output pixels: draw(ctx, w, h) lays the card out for a w × h
// frame, so the panel's small preview just scales the context down.

let mathjaxPromise = null;
function loadMathJax() {
  mathjaxPromise ??= Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
  ]).then(([{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }]) => {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document('', {
      // No 'require'/'autoload': they would try to fetch more code at render time.
      InputJax: new TeX({ packages: AllPackages.filter((p) => p !== 'require' && p !== 'autoload') }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    return (tex) => adaptor.innerHTML(doc.convert(tex, { display: false }));
  });
  return mathjaxPromise;
}

// Card style, matching #math-overlay on screen.
const CARD_BG = 'rgba(0, 0, 0, 0.45)';
const INK = '#ffffff';

// Vertical clips (9:16): narrow, so the card uses the full width and the
// equation gets reflowed onto more, shorter rows (see reflow()).
const isTall = (w, h) => h > w * 1.3;

// Lays out the card for a w × h frame: em size, margins, the largest the
// equation may get.
function layout(w, h) {
  const short = Math.min(w, h);
  const tall = isTall(w, h);
  const em = Math.round(Math.max(14, short * (tall ? 0.052 : 0.04)));
  const pad = Math.round(em * (tall ? 0.45 : 0.6));
  const margin = Math.round(short * (tall ? 0.03 : 0.045));
  return { em, pad, margin, tall, maxW: w - 2 * margin - 2 * pad, maxH: h * (tall ? 0.36 : 0.45) };
}

// `s` split at every top-level match of `re` (outside {…} and nested environments).
function splitTop(s, re) {
  const parts = [];
  let depth = 0;
  let envDepth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '{' || s[i + 1] === '}')) { i++; continue; }
    if (s.startsWith('\\begin{', i)) envDepth++; // rows of a nested cases/array stay whole
    else if (s.startsWith('\\end{', i)) envDepth--;
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && envDepth === 0) {
      const m = re.exec(s.slice(i));
      if (m && m.index === 0) {
        parts.push(s.slice(start, i));
        i += m[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(s.slice(start));
  return parts;
}

// A grey bit.js caption longer than ~34 characters becomes several caption rows.
const CAPTION = /^(\s*&?\s*)(\\textcolor\{[^}]*\}\{\\small\\textit\{)([^{}]*)(\}\})\s*$/;
function wrapCaption(row) {
  const m = row.match(CAPTION);
  if (!m || m[3].length <= 34) return [row];
  const lines = [];
  let line = '';
  for (const word of m[3].split(' ')) {
    if (line && (line + ' ' + word).length > 34) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => `& ${m[2]}${l}${m[4]}`);
}

// The same equation on narrower rows: each row breaks at its top-level \quad
// (or `,\ \ `) gaps (the continuation indented under the right-hand side), and long
// captions wrap. Works on a top-level aligned block or a single line.
export function reflow(tex) {
  const env = tex.match(/^\s*\\begin\{aligned\}([\s\S]*)\\end\{aligned\}\s*$/);
  const rows = env ? splitTop(env[1], /^\\\\/) : [tex];
  const out = [];
  for (const row of rows) {
    if (!row.trim()) continue;
    if (CAPTION.test(row)) {
      out.push(...wrapCaption(row));
      continue;
    }
    const pieces = splitTop(row, /^(?:,?\s*\\q?quad(?![a-zA-Z])|,\s*\\ \\ )/).filter((p) => p.trim());
    pieces.forEach((p, i) => {
      if (i === 0) out.push(env ? p : `& ${p}`);
      else out.push(`& \\quad ${p.replace(/&/g, '')}`);
    });
  }
  return `\\begin{aligned}${out.join(' \\\\ ')}\\end{aligned}`;
}

// One LaTeX string → a decoded <img> at exactly the pixel size it is drawn at.
// In vertical frames the reflowed version is tried too, and the bigger one wins.
async function rasterise(toSvg, tex, { em, maxW, maxH, tall }) {
  let best = null;
  for (const source of tall ? [tex, reflow(tex)] : [tex]) {
    let svg;
    try {
      svg = toSvg(source);
    } catch {
      continue;
    }
    if (/merror/.test(svg)) continue;
    const vb = svg.match(/viewBox="([-\d.\s]+)"/);
    if (!vb) continue;
    const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);
    // viewBox units are 1/1000 em. Shrink to fit the frame (clipped is worse than small).
    const k = Math.min(em / 1000, maxW / vw, maxH / vh);
    if (!best || k > best.k * 1.02) best = { svg, vw, vh, k };
  }
  if (!best) return null; // LaTeX MathJax doesn't know: better no card than red error text
  let { svg } = best;
  const { vw, vh, k } = best;
  const width = Math.max(1, Math.round(vw * k));
  const height = Math.max(1, Math.round(vh * k));
  svg = svg
    .replace(/ width="[^"]*"/, ` width="${width}"`)
    .replace(/ height="[^"]*"/, ` height="${height}"`)
    .replace(/ style="[^"]*"/, ` style="color:${INK}"`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function createEquationLayer() {
  let toSvg = null;
  let current = null; // { key, img, width, height } — what draw() shows
  let pending = null; // key being rendered
  let failed = false;

  const keyOf = (tex, w, h) => `${w}x${h}|${tex}`;

  async function render(tex, w, h) {
    const key = keyOf(tex, w, h);
    if (current?.key === key) return;
    if (!tex) {
      current = null;
      return;
    }
    try {
      toSvg ??= await loadMathJax();
      const out = await rasterise(toSvg, tex, layout(w, h));
      current = out ? { key, ...out } : null;
    } catch (err) {
      if (!failed) console.warn('Equation layer: could not render the equation', err);
      failed = true;
      current = null;
    }
  }

  return {
    // Load MathJax ahead of the first frame, so a clip doesn't open without its equation.
    warm: () => loadMathJax().then((fn) => { toSvg = fn; }),

    // Awaitable: the next draw() shows exactly this equation (smooth mode, frame by frame).
    prepare: render,

    // Fire-and-forget: start rendering this equation; draw() keeps showing the
    // previous one until it's ready (live mode and the preview).
    request(tex, w, h) {
      const key = keyOf(tex, w, h);
      if (current?.key === key || pending === key) return;
      if (pending) return; // one at a time; the next frame asks again with the newest string
      pending = key;
      render(tex, w, h).finally(() => { pending = null; });
    },

    // opts: { equation: 'top'|'bottom'|'off', tag: string|null }
    draw(ctx, w, h, { equation = 'top', tag = null } = {}) {
      const { em, pad, margin } = layout(w, h);
      // Vertical clips: keep clear of the strips that TikTok/Reels/Shorts cover
      // with their own buttons and caption.
      const tall = isTall(w, h);
      const bottom = equation === 'bottom';
      const fs = Math.round(em * 0.6);
      const gap = Math.round(em * 0.6);
      // The block (card, then tag under it; tag over it at the bottom) hangs
      // from `top` or stands on `foot`.
      const top = tall ? Math.round(h * 0.11) : margin;
      const foot = h - (tall ? Math.round(h * 0.22) : margin);
      const card = equation !== 'off' && current ? { w: current.width + 2 * pad, h: current.height + 2 * pad } : null;
      ctx.save();
      if (card) {
        const x = Math.round((w - card.w) / 2);
        const y = bottom ? foot - card.h : top;
        ctx.fillStyle = CARD_BG;
        roundRect(ctx, x, y, card.w, card.h, Math.round(em * 0.55));
        ctx.fill();
        ctx.drawImage(current.img, x + pad, y + pad, current.width, current.height);
      }
      if (tag) {
        ctx.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = bottom ? 'bottom' : 'top';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = Math.round(fs * 0.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        const y = bottom ? foot - (card ? card.h + gap : 0) : top + (card ? card.h + gap : 0);
        ctx.fillText(tag, w / 2, y, w - 2 * margin);
      }
      ctx.restore();
    },
  };
}
