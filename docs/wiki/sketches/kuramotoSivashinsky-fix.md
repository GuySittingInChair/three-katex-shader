---
summary: Why the Kuramoto–Sivashinsky sketch froze, and how a better solver fixed it.
---

# Kuramoto–Sivashinsky: the bug that froze the flame

Before 2026-11-18, [this sketch](kuramotoSivashinsky.md)'s honeycomb churned, slowed, and by about 50
seconds had almost stopped. The real equation never settles. There were two problems, one hiding behind
the other.

A reminder: the sketch is a landscape of heights, and three *pushes* (forces) change it every moment:
**bumps grow**, **tiny wrinkles are flattened**, and **slopes sink**.

## Problem 1: strides that overshoot

A computer can't run time smoothly. It takes steps: "here's how fast each height is changing right now;
move it that much; repeat." That's *Euler's method*, and the old sketch used it square by square.

Picture walking downhill in fog, striding whichever way is downhill where you stand. In a
narrow, steep gully, your stride carries you past the bottom and up the other side; the next stride
overshoots further; soon you're flung out. The "tiny wrinkles are flattened" push
makes the finest wrinkles a very steep gully, and the heights raced off towards a billion.

Someone had added a safety limit: no height past ±4. That stopped the explosion, but about 400 squares
got stuck pressed against the limit, and those stuck ridges pinned the whole pattern. That was the freeze.

**The fix:** stop treating the landscape as squares and treat it as a stack of waves.

Think of a graphic equaliser on a stereo: it splits a song into slow, deep bass waves, middle waves, and
fast, fine treble waves, each with its own slider. Any landscape can be split the
same way, into broad gentle swells, medium ripples and fine crinkles. Added back together, they give the
landscape exactly. That splitting is called a *Fourier transform*.

For a single wave, the first two pushes don't need a stride at all: each wave
grows or shrinks by a fixed percentage per second, depending only on how fine it is. The new code works
out that exact percentage for every wave, once:

```js
for (let i = 0; i < size; i++) { E[i] = Math.exp(dt * lin[i]); E2[i] = Math.exp(0.5 * dt * lin[i]); }
```

`lin[i]` is wave number `i`'s growth rate, `dt` the length of one step, and `size` how many waves there
are. `Math.exp` is the calculator's "compound growth" button: give it a growth rate and a time, and it tells
you how many times bigger (or smaller) something ends up. So `E` is each wave's exact growth over one step:
no striding, nothing to overshoot. The third push,
"slopes sink", is gentle enough to stride through, using a careful stride that tests the ground four times and
averages before each step.

## Problem 2: the ghost twin

With that fix the flame ran well, then exploded after almost exactly 300 units of simulated time (about
50 seconds of watching), every time.

In the computer's wave list, each wave is written down **twice**, like a cheque with the amount in both
figures and words. The two copies must agree. Each copy is worked out by its own long sum, and computers
round every sum by about 1 part in 10 million billion, so the copies drift a whisker apart.

The landscape on screen is made from what the two copies *agree on*. Where they disagree is a ghost: it
isn't part of the landscape at all. Now look at what each push works on:
- **"Slopes sink"** is worked out from the landscape: turn the waves back into heights, measure the
  steepness. The ghost isn't in the landscape, so this push never sees it and never calms it.
- **"Bumps grow"** is applied straight to every entry in the wave list, ghost included. So the ghost
  grows, like compound interest: about 2.7 times bigger every 4 units of time. From a whisker to a
  monster takes about 74 of those: 4 × 74 ≈ 300. That's the 300.

**The fix:** after every step, make each pair agree again:

```js
const r = 0.5 * (hRe[i] + hRe[j]), m = 0.5 * (hIm[i] - hIm[j]);
```

`i` and `j` are the two copies of one wave. Each copy is two numbers (a wave's size and its position
along, stored as `hRe` and `hIm`). Average the two copies and write the result into both, so the ghost is erased the moment it appears.

**Checked:** it ran for 20 minutes, and about 7 minutes at each end of the sliders, without slowing.

**Words on this page:** [Euler's method](../glossary.md#euler-s-method), [Fourier transform](../glossary.md#fourier-transform),
[rounding error](../glossary.md#rounding-error), [clamp](../glossary.md#clamp)
