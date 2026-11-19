# Motion and the live equation

**In one sentence:** `motion` turns the clock into a handful of numbers, and `latex` shows those same
numbers inside the equation on screen, so the equation and the picture always agree.

**Picture it:** a music box. A drum turns at a steady speed, and pins on the drum decide which note plays
when. `motion` is the drum: given the time, it says exactly where everything should be. Since it only
depends on the time, the animation repeats perfectly, like the tune.

**Why sketches need it:** the site's idea is that each animation *is* an equation. So the movement is written as
"time in, numbers out": give `motion` the number of seconds since the sketch started, and it hands back
the numbers for that moment (how twisted, how far along). Those same numbers move the picture *and* fill
in the equation, so the equation on screen is the real recipe for what you are watching. It isn't a
decoration.

**Where you'll see it:** 101 sketches have a `motion` field. 164 have a `latex` field.

## `motion`: time in, numbers out

From `src/sketches/bezierDeCasteljau.js`, which draws a curve that twists and untwists:

```js
motion(t) {
  const p = phaseOf(t, PERIOD);
  const kappa = KAPPA_MAX * 0.5 * (1 - Math.cos(TAU * p));
  const s = 0.5 * (1 - Math.cos(3 * TAU * p));
  ...
  return { kappa, s, ... };
},
```

- `motion(t)`: `t` is the sketch's clock, in seconds.
- `phaseOf(t, PERIOD)` says how far through the loop we are (the *phase*, as in the phases of the
  Moon), from 0 (start) to almost 1 (end). `PERIOD` is
  18, so the loop lasts 18 seconds. It comes from `src/lib/motion.js`.
- `kappa` is how twisted the curve is. `Math.cos` is a [wave-maker](sine-and-cosine.md), so
  `1 - Math.cos(...)` goes smoothly from 0 up to 2 and back to 0
  once per loop, so `kappa` rises from 0 to its largest (0.9) and falls again.
- `s` does the same, but three times per loop (the `3`), sweeping a dot along the curve and back.
- `return { kappa, s, ... }` hands the numbers over. The app stores them in `ctx.motion` so `update` can
  use them.

## `latex`: the equation on screen

A `latex` field is either fixed text, or instructions that build the text afresh on every frame. The
instructions get three things: the sliders (`p`), a highlighter (`hl`) and the motion numbers (`m`).

```js
latex: (p, hl, m) =>
  ...
  `s=\\tfrac12(1-\\cos3\\omega t)=${hl(m.s, 2)} \\\\` +
```

- `(p, hl, m) =>` means "given these three things, build the following text".
- `s=\\tfrac12(1-\\cos3\\omega t)` is LaTeX for "s = ½(1 − cos 3ωt)". The doubled backslashes are how
  a single backslash is written inside JavaScript text.
- `${hl(m.s, 2)}` drops in the current value of `s`, rounded to 2 decimal places and coloured yellow.
- `\\\\` starts a new line of the equation.

So the screen shows something like **s = ½(1 − cos 3ωt) = 0.73**, and the 0.73 changes as the dot moves.

Fixed text is simpler. From `src/sketches/bifurcationDiagram.js`:

```js
latex: 'x_{n+1} = r\\,x_n(1-x_n),\\quad r \\in [2.4,\\ 4.0]',
```

This always shows the same equation: x₍ₙ₊₁₎ = r xₙ(1 − xₙ), with r between 2.4 and 4.0. In words: "next
year's population is this year's, times r, times the room left to grow". It's the
[Bifurcation Diagram](sketches/bifurcationDiagram.md)'s rule.

**Try this:** in `bezierDeCasteljau.js`, change `const PERIOD = 18;` to `const PERIOD = 36;`. The whole
loop runs at half speed. The equation's numbers still match the picture exactly, because both come from
the same `motion`.

**Related:** animation and timing *(planned)* · [The sketch format: every field](sketch-format.md) ·
[Params: the sliders](params.md) · `docs/guide.md` section 4 (LaTeX cheat sheet)
