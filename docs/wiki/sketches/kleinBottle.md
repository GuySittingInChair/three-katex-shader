---
summary: A twisted ribbon inflating into a bottle with only one side.
---

# Klein Bottle: in plain English

File: `src/sketches/kleinBottle.js` · Mode: 3d · Category: Topology

**What you see:** a shimmering ring, like a twisted ribbon looped into a bracelet. Slowly it puffs up:
the ribbon swells into a fat, rounded tube that folds through itself, a bit like a doughnut that's been
sat on and twisted. Then it slims back down to a ribbon. Its oily rainbow sheen shifts as it breathes.
Drag to look around.

**The idea behind it:** two famous one-sided shapes, and a smooth path from one to the other.

1. **The Möbius strip.** Take a strip of paper, give one end a half-twist, and tape the ends together.
   Now try to colour only one side with a pen. You can't: you'll go all the way round and come back on the
   "other" side. The strip only *has* one side.
2. **The Klein bottle.** The same trick with a tube instead of a strip: a bottle whose inside is its
   outside. In our three dimensions it has to pass through itself somewhere:
   that's the fold you see. Felix Klein described it in 1882.

How the sketch builds both: take a small shape, the *cross-section*, and sweep it round a big circle,
turning it half a turn as it goes, like a twirling baton carried round a running track.
- If the cross-section is a **straight line**, the sweep makes a Möbius strip.
- If it's a **figure-8**, the sweep makes a Klein bottle.

One number, `c`, opens the line into a figure-8: at 0 it's a line, at 1 a full figure-8. The animation
slides `c` back and forth, so the strip inflates into the bottle. The half-turn is why both are
one-sided: after one lap, the shape lands back on itself upside down.

The equation on screen: the cross-section, the sweep, and the live values of `c`, the ribbon's width `b`
and the track's size `a`.

**Where the data comes from:** no data.

**How it's built:** like [Helicoid ↔ Catenoid](helicoidCatenoid.md): `createMorphSurface` from
`src/lib/morphSurface.js` makes a [mesh](../mesh-geometry-material.md) whose points a
[vertex shader](../shaders.md) places fresh every frame, and [motion](../motion-and-latex.md) drives
the numbers.

**A tour of the file:**

The clock, in `motion(t)`:

```js
const p = phaseOf(t, PERIOD) + 0.3;
return {
  c: 0.04 + 1.1 * (0.5 - 0.5 * Math.cos(TAU * p)),
```

- Line 1: `phaseOf(t, PERIOD)` says how far through the 16-second loop (`PERIOD`) we are, from 0 to 1.
  Adding 0.3 starts the sketch 0.3 of the way in, so it opens mid-breath.
- Line 2: `return { … }` hands back the numbers for this moment, by name.
- Line 3: `TAU` is one full turn (6.28), so `Math.cos(TAU * p)` makes one smooth
  [wave](../sine-and-cosine.md) per loop, and `0.5 − 0.5 cos(...)` glides from 0 to 1 and back. Scaled, `c` breathes between 0.04
  (almost a line: the Möbius strip) and 1.14 (a full figure-8: the bottle). `a` and `b` wobble too, at
  different speeds, so it never looks quite the same twice.

The sweep, in the shader:

```glsl
float th = 0.5 * u;
float radial = sin(v) * cos(th) - m_c * sin(2.0 * v) * sin(th);
float height = sin(v) * sin(th) + m_c * sin(2.0 * v) * cos(th);
float r = m_a + m_b * radial;
```

- `u` and `v` name each point of the surface: `u` says how far round the track, `v` how far round the
  cross-section. `m_a`, `m_b` and `m_c` are the live values of `a`, `b` and `c`, handed in from `motion`.
- Line 1: `u` goes once round the track; `th`, the cross-section's turn, goes half as far. That's the
  half-twist.
- Lines 2–3: the figure-8, turned by `th`: how far it sticks out from the track, and how high.
- Line 4: distance from the centre: the track's size `a`, plus the cross-section scaled by `b`.

**Numbers worth knowing:**
- **16 seconds** per breath.
- **0.04 to 1.14**: the range of `c`. It never quite reaches 0, so the strip always has a little
  thickness to catch the light.
- **20,301** points in the surface (201 × 101).

**Try this (funky):** in `motion(t)`, change `1.1` to `2.5`. Now `c` climbs to about 2.5, and the figure-8's
loops grow more than twice as tall: the bottle balloons into a puffy, tangled pretzel. (The equation on screen still says 1.1,
because that number is typed into the `latex` text separately.)

**Words on this page:** [Möbius strip](../glossary.md), [Klein bottle](../glossary.md),
[non-orientable](../glossary.md), [topology](../glossary.md), [parametric surface](../glossary.md),
[motion](../glossary.md)
