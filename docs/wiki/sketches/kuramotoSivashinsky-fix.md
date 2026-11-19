# Kuramoto–Sivashinsky: the bug that froze the flame

This page goes with [the Kuramoto–Sivashinsky walkthrough](kuramotoSivashinsky.md). It explains, in plain
words, what was wrong with the sketch before 2026-11-18, and how it was fixed. There were two problems,
one hiding behind the other.

## What you saw

A honeycomb that churned for the first few seconds, slowed down, and by about 50 seconds had almost
stopped. Measured: it moved about 1% as much as at the start, and stayed that way. The real equation never
settles, so that was wrong.

## Problem 1: small steps in a straight line

A computer can't run time smoothly. It takes steps: "here's how fast each height is changing right now;
move it that much for a moment; repeat." That's *Euler's method*, and the old sketch used it square by
square.

Picture walking downhill in fog, taking a stride in whatever direction is downhill where you stand. On a
gentle slope, fine. In a narrow, steep gully, your stride carries you past the bottom and up the other
side, steeper; the next stride overshoots further; soon you're flung out. The "tiny wrinkles are
flattened" push makes the shortest wrinkles a very steep gully. On top of that, the old way of measuring
slopes, square by square, kept feeding those shortest wrinkles. Even with much smaller strides, the
heights raced off towards a billion.

Someone had added a safety limit: no height past ±4. That stopped the explosion, but about 400 squares
got stuck pressed against the limit, and those stuck ridges pinned the whole pattern in place. That was
the freeze.

**The fix:** treat the landscape as a mix of waves instead of squares (that's a *Fourier transform*, the
same idea as a graphic equaliser splitting music into bass, middle and treble). For a single wave, the
two smooth pushes become one exact number: "this wave grows or shrinks by this much." The new code
applies that exactly, so even the steepest gully can't make it overshoot:

```js
for (let i = 0; i < size; i++) { E[i] = Math.exp(dt * lin[i]); E2[i] = Math.exp(0.5 * dt * lin[i]); }
```

`Math.exp` works out exactly how much each wave grows or shrinks in one step (and in half a step). The
remaining push, "slopes sink", is stepped with a careful four-stage method instead of one stride. No
safety limit needed.

## Problem 2: the ghost twin

With the fix in, the flame ran beautifully, then exploded after almost exactly 300 units of simulated time,
every time. Changing the step size didn't help. Even a completely separate textbook solver did the same.

Here's why. In the wave version of the landscape, every wave has a *mirror twin*. For the picture to be
ordinary numbers, each twin must match its partner exactly. Computers round every sum, by about 1 part
in 10 million billion, so the twins drift a whisker out of step. The mismatch is a ghost: it doesn't show
on screen, and the "slopes sink" push never feels it, so nothing calms it down. But the "bumps grow" push
does feel it, and grows it like compound interest: about 2.7 times bigger every 4 units of time.

From a whisker to a monster takes about 74 of those growths: 4 × 74 ≈ 300. That's the 300.

**The fix:** after every step, make each twin match its partner again:

```js
const r = 0.5 * (hRe[i] + hRe[j]), m = 0.5 * (hIm[i] - hIm[j]);
```

Average each wave with its mirror twin, so the ghost is erased the moment it appears.

## How it was checked

- Each push on its own: the growth rate came out right, and the "slopes sink" push kept its energy
  exactly, as the maths says it should.
- The solver ran for 20 minutes of real time at the default settings, and about 7 minutes at each end of
  the sliders, without blowing up, and was still moving as much at the end as at the start.
- It runs in a worker (a helper alongside the page) at a steady 60 frames a second.

**Words on this page:** [Euler's method](../glossary.md), [Fourier transform](../glossary.md),
[rounding error](../glossary.md), [clamp](../glossary.md), [Web Worker](../glossary.md)
