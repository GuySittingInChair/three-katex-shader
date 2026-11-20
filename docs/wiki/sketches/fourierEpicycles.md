---
summary: A chain of spinning circles whose tip draws a heart, then a star: any closed drawing is a sum of circles.
added: 2026-11-20
---

# Fourier Epicycles: in plain English

File: `src/sketches/fourierEpicycles.js` · Mode: 3d · Category: Waves

**What you see:** a chain of thin grey circles, each one riding on the rim of the one before, all spinning at
different speeds. A gold dot at the very end of the chain draws a glowing pink trail, and the trail is a
heart. After a couple of laps the circles quietly change size and the dot starts drawing a five-pointed star
instead (its trail turning from pink to purple), and after a couple more, a heart again. The loop takes 24
seconds: heart, heart turning into star, star, star turning back into heart. You can drag to look around.

**The idea behind it:** in 1807 Joseph Fourier claimed something that sounded absurd: *any* repeating pattern
can be built by adding up plain, smooth waves. For a drawing that goes round in a loop, the "plain waves" are
circles turning at steady speeds: one circle turning once per lap, one turning twice, one turning backwards
three times, and so on. Stack them, each centred on the rim of the last, and the tip of the last one can trace
any closed shape you like, given the right sizes and starting angles.

Ancient astronomers used the same trick, more than 1,600 years earlier. Ptolemy, around the year 150,
explained the looping paths of the planets across the sky with circles riding on circles, called *epicycles*.
Fourier's version says how many circles you need for a given shape, and exactly what size each must be.

The sketch has 49 circle "slots" in its chain, for speeds −24 to +24 turns per lap. The sizes are worked out
from the shape by a recipe called the *Fourier transform*. Here is the surprise: most of the slots come out
with **no size at all**. The heart needs only 8 circles; the star needs 10. The rest sit at zero, invisible.

**Where the data comes from:** no data. The heart is a classic formula (made of sines and cosines), and the
star is drawn by joining ten points: five tips, five dips.

**How it's built:**
- At the start, the sketch samples each shape at 512 points and works out the size and starting angle of all
  49 circles for it: one list for the heart, one for the star.
- `motion` turns the clock into the pen's angle τ (tau) and the blend `s` between the two lists.
- Every frame, [lines](../lines-and-points.md) draw the circles, the arms joining their centres, a faint copy
  of the whole shape and the bright trail.

## The equation

**z(τ) = Σ c_k e^{ikτ}**, for k from −24 to 24, with **c_k = (1 − s) a_k + s b_k**

In words: the pen's position z at angle τ is the sum of 49 spinning arrows.

- **τ** (tau) is how far round the lap the pen has gone, as an angle.
- **k** is a circle's speed: it turns k times per lap. Negative k turns the other way.
- **e^{ikτ}** is "an arrow of length 1, turned by k × τ". (This is how mathematicians write a turning arrow,
  using a number called *e*; you can read it as "spin by k τ".)
- **c_k** is that circle's arrow: its size (the circle's radius) and its starting angle.
- **a_k** and **b_k** are the arrows for the heart and for the star. **s** blends from one to the other: at s
  = 0 the chain draws the heart, at s = 1 the star, and in between, a heart-star mixture.

The second line shows τ (within the current lap) and s, live.

## A tour of the file

Working out each circle, in `coefficients`:

```js
const a = (-TAU * k * j) / SAMPLES;
re += x * Math.cos(a) - y * Math.sin(a);
im += x * Math.sin(a) + y * Math.cos(a);
```

This is the Fourier transform. For circle `k`, it goes round the shape's 512 points, turns each point
backwards by k turns-worth (`a`), and adds them all up. Parts of the shape that wobble k times per lap all
line up and add together; everything else points every which way and cancels out. What's left, averaged, is
that circle's arrow: how big, and which way it starts. `re` and `im` are its two numbers, across and up.

Drawing the chain, in `update`:

```js
const nx = x + re * Math.cos(k * tau) - im * Math.sin(k * tau);
const ny = y + re * Math.sin(k * tau) + im * Math.cos(k * tau);
```

Starting from where the previous circle's arm ends (`x`, `y`), this circle's arm, turned by k × τ, reaches the
next point (`nx`, `ny`). After all 48 arms, that last point is the pen.

## Numbers worth knowing

- **8 and 10**: circles with any size, for the heart and for the star (out of 48 possible). The heart's
  formula only wobbles up to 4 times per lap, so only speeds −4 to 4 are needed. The star has five-fold
  symmetry, which allows only every fifth speed: 1, 6, 11, 16, 21 and −4, −9, −14, −19, −24. While one shape
  blends into the other, 16 show (two speeds, 1 and −4, are used by both).
- **1.99 and 1.86**: the biggest circle's radius for the heart (turning backwards once per lap) and for the
  star (forwards once per lap). Most of each shape is made by that one circle; the rest add the details.
- **2.7%**: how far short of each tip the 49-circle star falls (the tips come out at 0.973 of the way).
  Corners are the hardest thing for smooth circles to make; the heart, with no sharp corners, is exact.
- **24 seconds, 4 laps**: 6 seconds per lap of the pen.

**Try this (funky):** in `fourierEpicycles.js`, change `const K = 24;` to `const K = 4;`. Now there are only
speeds −4 to 4. The heart is untouched (it only ever needed those), but the star keeps just two of its circles
and turns into a puffy, curved-sided pentagon: its tips reach only 0.85 of the way and its dips stay at 0.52
instead of 0.42. Fourier's idea in one edit: fewer circles, blurrier corners. (Worked out first, then checked
in the sketch. The equation on screen still says 24, because that number is typed into the `latex` text.)

**Words on this page:** [Fourier transform](../glossary.md#fourier-transform),
[epicycle](../glossary.md#epicycle), [complex number](../glossary.md#complex-number),
[sine](../glossary.md#sine), [lines (fat lines)](../glossary.md#lines)
