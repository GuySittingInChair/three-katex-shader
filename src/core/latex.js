// Turns a sketch's `latex` field into the KaTeX source for the *current*
// param values, so the overlay equation moves with the sliders.
//
// `latex` can be either:
//   • a string with `{{paramKey}}` placeholders — each is replaced by that
//     param's live value, highlighted. Unknown keys are left untouched, so
//     ordinary LaTeX that happens to contain `{{…}}` still renders as-is.
//   • a function `(params, hl, motion) => string` for anything a template
//     can't express (derived values, picking a different formula per mode).
//     `hl(value, digits?)` formats a number and highlights it. `motion` is
//     the sketch's live `motion(t)` output, so an animated equation can show
//     the exact numbers the animation is using this frame.

// `{{key}}` placeholders resolve from params first, then from motion.
//
// A param declaring `options` (see paramsPanel) renders as its label, not
// its index, so `{{shading}}` reads "Gaussian curvature", not "1".

const HIGHLIGHT = '#ffd166';

export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '?';
  const s = Number(value).toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

export function highlight(value, digits = 3) {
  return `\\textcolor{${HIGHLIGHT}}{${formatNumber(value, digits)}}`;
}

export function resolveLatex(sketch, values, motion) {
  const src = sketch?.latex;
  if (!src) return '';
  const params = values || {};

  if (typeof src === 'function') {
    try {
      return String(src(params, highlight, motion || {}) ?? '');
    } catch {
      return ''; // a broken latex function shouldn't take the overlay (or the frame) down
    }
  }

  const schema = sketch.params || {};
  return src.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (motion && key in motion && !(key in params)) return highlight(motion[key]);
    if (!(key in params)) return match;
    const options = schema[key]?.options;
    if (options) {
      const label = options[Math.round(params[key])] ?? '?';
      return `\\textcolor{${HIGHLIGHT}}{\\text{${label}}}`;
    }
    return highlight(params[key]);
  });
}
