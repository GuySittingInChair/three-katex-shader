---
summary: A wrinkling flame front that never settles, drawn as a seething honeycomb.
added: 2026-11-18
---

# Kuramoto–Sivashinsky: in plain English

File: `src/sketches/kuramotoSivashinsky.js` · Mode: shader · Category: Chaos

**What you see:** a seething honeycomb. Rounded dark-blue cells, like bubbles in a pan of boiling porridge,
are packed together and walled in glowing sand and orange, with rivers of deep red where the ridges are
highest. The cells never stop: they swell, split, get squeezed out and merge, and the red rivers wander across
the screen. It never settles and never repeats.

**The idea behind it:** look closely at the edge of a gas flame, or a thin film of liquid running down a
window, and it isn't smooth. It wrinkles, and the wrinkles never stop changing. In the 1970s Yoshiki Kuramoto
(studying chemical waves) and Gregory Sivashinsky (studying flames) found the same short equation for both.
It's now the textbook example of *spatiotemporal chaos*: a pattern that's messy in space *and* never repeats
in time.

The sketch treats the screen as a landscape of hills and holes: a height `h` at every point. Three pushes act
on it, and they're the three parts of the equation on screen:
1. **−∇²h: bumps grow.** ∇² (the *Laplacian*) measures how different a spot is from the average of its
   neighbours. Normally nature *smooths* differences away, like heat spreading out. The minus sign does the
   opposite: big gentle bumps get bigger.
2. **−∇⁴h: tiny wrinkles are flattened.** The Laplacian of the Laplacian. It acts like stiffness, so very fine
   crinkles die out. Between these two, one bump size grows best, and that sets the cells' size.
3. **−½|∇h|²: slopes sink.** |∇h| is how steep the ground is. Steep places get pulled down, which folds the
   growing bumps into sharp-edged cells.

**Where the data comes from:** no data. It starts as faint random ripples.

**How it's built:**
- The landscape is 128 × 128 squares, wrapping round at the edges like the board in [Game of
  Life](gameOfLife.md).
- The maths runs in `src/lib/ksSpectral.js`, inside a *worker*: a helper that runs alongside the page, so the
  heavy sums never make the animation stutter.
- About 30 times a second the worker sends the heights back. They go into a [DataTexture](../textures.md), and
  a [fragment shader](../shaders.md) colours them with a five-colour [colour scale](../colour-scales.md).

**A tour of the file:** the solver doesn't work square by square. It treats the landscape as a mix of waves,
like a chord is a mix of notes, and handles each wave on its own. In `ksSpectral.js`:

```js
lin[y * N + x] = k2 - k2 * k2;
```

For each wave, pushes 1 and 2 combine into one number: how fast that wave grows (or shrinks). `k2` is how
short the wave is; long waves grow, short ones shrink, fast.

```js
aRe[i] = -0.5 * (aRe[i] * aRe[i] + bRe[i] * bRe[i]) + (force ? drive * force[i] : 0);
```

Push 3, worked out back on the landscape: `aRe` and `bRe` are the slopes across and up, so this is −½ ×
steepness². (`force` is for the [Life-Seeded](kuramotoSivashinskyLife.md) version; here it's empty.)

**This sketch used to freeze.** Until 2026-11-18 it worked square by square, needed a safety limit to stop it
exploding, and the limit froze it solid after about 50 seconds. Fixing that turned up a second, sneakier bug.
Both are explained on [their own page](kuramotoSivashinsky-fix.md).

**Numbers worth knowing:**
- **16,384** squares (128 × 128).
- **6** units of simulated time per second (the **Speed** slider, 1 to 15), taken in steps of **0.1**
  (**Dt**).
- **About 10 squares**: the width of the bump size that grows fastest, at the default **Spacing** of 0.9
  between squares. So about 13 cells fit across the screen.
- **±4, ±12**: how high the landscape typically goes, and at most.

**Try this (funky):** drag **Spacing** down to 0.5. The same equation now covers a smaller patch of landscape,
so the cells look about twice as big: fat, wobbling bubbles. Then push **Speed** to 15 and watch them boil.

**Words on this page:** [chaos](../glossary.md#chaos), [Laplacian](../glossary.md#laplacian), [Fourier
transform](../glossary.md#fourier-transform), [Web Worker](../glossary.md#web-worker),
[DataTexture](../glossary.md#datatexture), [colour scale](../glossary.md#colour-scale)
