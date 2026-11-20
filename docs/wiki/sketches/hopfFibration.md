---
summary: Circles from four dimensions, every pair linked, nested into doughnuts.
---

# Hopf Fibration: in plain English

File: `src/sketches/hopfFibration.js` · Mode: 3d · Category: Topology

**What you see:** 60 glowing rings, like a tangle of coloured bangles, some huge and loopy. They gather
into a neat nest of doughnuts, one inside another, each woven from rings wrapping round it diagonally.
The nest swells and shrinks, then the rings scatter again. Drag to look around.

**The idea behind it:** here's the mind-bender. Every ring passes *through* every other ring exactly once,
like links in a chain. Not most of them: every single pair. Take any two bangles and they're linked.

Where do they come from? The surface of a ball in four dimensions (mathematicians call it S³). In 1931
Heinz Hopf found that it splits perfectly into circles, with nothing left over. And there's exactly one circle
for every point on an ordinary globe. Pick a spot on Earth, and you've picked a ring.

We can't see four dimensions, so the sketch casts a shadow. *Stereographic projection* is like putting a
lamp at the north pole of a glass globe and looking at the shadows its markings cast on the floor.
Circles stay circles, but the ones passing near the lamp get blown up enormous. That's why some rings are
huge and loopy.

So the whole animation is dots moving on a globe:
- **Gather:** the 60 dots start evenly spread over the globe, then slide into 5 lines of latitude.
  Dots on one latitude make rings that weave into one doughnut.
- **Sweep:** the 5 latitudes slide north and south together, so the doughnuts swell and shrink.
- **Scatter:** the dots spread out again.

A ring's colour is its dot's latitude on the globe. When the middle latitude sits exactly on the
equator, that doughnut is the famous *Clifford torus*, and the caption says so.

**Where the data comes from:** no data.

**How it's built:**
- Each ring is a ribbon, a long thin strip of a [mesh](../mesh-geometry-material.md) that always faces
  you, so it looks like a tube without the cost of one.
- A [vertex shader](../shaders.md) works out every ring's shape. JavaScript sends only the dots'
  positions, as one [uniform](../uniforms.md) list.
- [Motion](../motion-and-latex.md): `motion(t)` makes the gather, sweep and scatter.

**A tour of the file:**

Where each dot heads, in `update`:

```js
const r = i % RINGS;
...
const thetaRing = theta + RING_SPACING * (r - (RINGS - 1) / 2);
...
const th = Math.min(Math.PI - 0.05, Math.max(THETA_MIN, lerp(fib[i].theta, thetaRing, s)));
```

- Line 1: `%` means "the remainder after dividing": 7 % 5 is 2. So dot number `i` belongs to latitude line
  `r`, one of 5, dealt out like cards.
- Line 2: that line's latitude: the middle latitude `theta`, plus or minus a little for the others.
- Line 3: `lerp` slides from where the dot started (`fib`, the even spread) to its line, by the fraction
  `s` (0 = start, 1 = on its line). `Math.max(THETA_MIN, ...)` means "no smaller than `THETA_MIN`": it
  keeps the dot away from the north pole, whose rings would be infinitely big. `Math.min(Math.PI - 0.05,
  ...)` likewise keeps it a whisker off the south pole.

Turning a dot into a ring, in the shader:

```glsl
vec4 q = vec4(c * cos(t + 0.5 * ph), c * sin(t + 0.5 * ph),
              sn * cos(t - 0.5 * ph), sn * sin(t - 0.5 * ph));
return q.yzw / max(1.0 - q.x, 1e-3);
```

- `th` and `ph` are the dot's place on the ball (how far down, how far round); `c` and `sn` are worked out
  from `th`. `vec4` is a bundle of four numbers: one point in four dimensions.
- Lines 1–2: a point on the four-dimensional circle. As `t` goes round once, it traces the whole ring.
- Line 3: the shadow. `q.yzw` keeps the last three of the four numbers, dropping the first (`q.x`),
  and divides by how close the point is to the lamp. Near the lamp, that division makes things huge. (`max(…, 1e-3)` stops it dividing by zero: `1e-3` is 0.001.)

**Numbers worth knowing:**
- **28 seconds** per loop: about 7 to gather, 14 sweeping, 7 to scatter.
- **60 rings** by default, up to **128**.
- **1,770**: how many pairs of rings there are at 60 (each of 60 rings pairs with 59 others, and each pair
  is counted from both ends: 60 × 59 ÷ 2). Every one of them is linked.

**Try this (funky):** in Params, drag **Fiber count** to 128 (the rings rebuild when you let go) and
**Width** to its smallest. You get a dense, shimmering bird's nest of 8,128 linked pairs. Then drag
**Width** to its biggest for a pile of chunky neon bangles.

**Words on this page:** [Hopf fibration](../glossary.md#hopf-fibration), [stereographic projection](../glossary.md#stereographic-projection),
[Clifford torus](../glossary.md#clifford-torus), [topology](../glossary.md#topology), [vertex shader](../glossary.md#vertex-shader),
[lerp / mix](../glossary.md#lerp-mix)
