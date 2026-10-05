// The house formula for a funny sketch. A bit is
//
//     a true equation  ×  an absurd noun,  told deadpan.
//
// 1. Straight man. The system, the equation and every number on screen are
//    real and checked. The joke never gets to bend the physics.
// 2. Casting. Swap the textbook noun for an absurd one that still fits the
//    maths (spins → robot moods, a test mass → a rubber duck), or keep the
//    noun and swap the unit (litres → elephants brushed).
// 3. Feelings from derivatives. Name the actors' moods from the signs of
//    real rates (ẋ > 0: "thriving"). Captions are computed, not scripted, so
//    the joke is true on every frame.             → mood()
// 4. Punchline readout. One live number converts a real result into a
//    ridiculous unit, with the conversion shown.   → inUnits()
// 5. Own the reset. Real processes don't loop; give the loop's reset its own
//    beat ("rewinding; entropy briefly ignored").  → beat()
//
// All of these return LaTeX for a sketch's `latex()`.

// KaTeX \text{} chokes on a few characters; escape them.
const escapeText = (s) => s.replace(/([#%&_$])/g, '\\$1').replace(/~/g, '\\textasciitilde{}');

// A caption line in the equation: small, grey and deadpan.
export const caption = (s) => (s ? `\\textcolor{#9aa3b2}{\\small\\textit{${escapeText(s)}}}` : '');

// Rule 3: pick a caption from the signs of some rates.
//     mood([dRabbits, dFoxes], { '++': 'everyone thriving', '+-': ..., '-+': ..., '--': ... })
// A rate within ±eps counts as '0', and a key may use '*' to match any sign.
export function mood(rates, table, eps = 1e-9) {
  const key = rates.map((r) => (r > eps ? '+' : r < -eps ? '-' : '0')).join('');
  for (const [pattern, text] of Object.entries(table)) {
    if (pattern.length === key.length && [...pattern].every((c, i) => c === '*' || c === key[i])) return text;
  }
  return '';
}

// Rule 4: a real quantity in an absurd unit, with the conversion shown.
//     inUnits(hl, 6.3, { per: 2, of: 'L', name: 'elephants brushed' })
//     → "= 3.2\ \text{elephants brushed}\ \ (1 = 2\,\text{L})"
export function inUnits(hl, value, { per, of, name, digits = 1 }) {
  return `${hl(value / per, digits)}\\ \\text{${escapeText(name)}}\\ \\ \\textcolor{#9aa3b2}{(1 = ${per}\\,\\text{${escapeText(of)}})}`;
}

// Rule 5 (and any other timed line): the caption whose start time has most
// recently passed.   beat(t, [[0, 'Step 1 ...'], [2, 'Step 2 ...'], [16, 'Rewinding.']])
export function beat(t, beats) {
  let text = '';
  for (const [start, s] of beats) if (t >= start) text = s;
  return text;
}
