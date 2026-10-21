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

// Lays out the card for a w × h frame: em size, margins, the widest the
// equation may get.
function layout(w, h) {
  const short = Math.min(w, h);
  const em = Math.round(Math.max(14, short * 0.04));
  const pad = Math.round(em * 0.6);
  const margin = Math.round(short * 0.045);
  return { em, pad, margin, maxW: w - 2 * margin - 2 * pad };
}

// One LaTeX string → a decoded <img> at exactly the pixel size it is drawn at.
async function rasterise(toSvg, tex, em, maxW) {
  let svg = toSvg(tex);
  const vb = svg.match(/viewBox="([-\d.\s]+)"/);
  if (!vb) return null;
  const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);
  // viewBox units are 1/1000 em. Shrink to fit the frame (clipped is worse than small).
  let k = em / 1000;
  if (vw * k > maxW) k = Math.max((em / 1000) * 0.3, maxW / vw);
  const width = Math.max(1, Math.round(vw * k));
  const height = Math.max(1, Math.round(vh * k));
  svg = svg
    .replace(/ width="[^"]*"/, ` width="${width}"`)
    .replace(/ height="[^"]*"/, ` height="${height}"`)
    .replace(/ style="[^"]*"/, ` style="color:${INK}"`);
  if (/merror/.test(svg)) return null; // LaTeX MathJax doesn't know: better no card than red error text
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

  const keyOf = (tex, w, h) => `${layout(w, h).em}|${tex}`;

  async function render(tex, w, h) {
    const key = keyOf(tex, w, h);
    if (current?.key === key) return;
    if (!tex) {
      current = null;
      return;
    }
    try {
      toSvg ??= await loadMathJax();
      const { em, maxW } = layout(w, h);
      const out = await rasterise(toSvg, tex, em, maxW);
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
      const tall = h > w * 1.3;
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
