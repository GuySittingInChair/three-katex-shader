---
summary: How a smooth curve is built from a zig-zag, one layer of in-between points at a time.
---

# De Casteljau Bézier: in plain English

File: `src/sketches/bezierDeCasteljau.js` · Mode: 3d · Category: Splines

**What you see:** five grey dots joined by a grey zig-zag. Between them, coloured lines in three layers
(teal, amber, rose) connect points along the zig-zag, and a gold dot rides along a smooth blue-to-purple
curve. The gold dot sweeps from one end to the other and back, three times per loop. Meanwhile the
zig-zag slowly twists out of its flat plane into a corkscrew, and back. The loop lasts 18 seconds.

**The idea behind it:** a *Bézier curve* is the smooth curve drawing programs use when you drag the
handles of a line. A few *control points* pull the curve towards them, like magnets, without the curve
passing through them all.

De Casteljau's way of drawing it uses only one move: "go a fraction of the way from one point to the
next". Pick a fraction `s`, say 0.3:
1. On each of the 4 grey segments, mark the spot 30% along. That gives 4 new points (teal lines join
   them).
2. On each of the 3 teal segments, mark the spot 30% along. That gives 3 points (amber).
3. Again: 2 points (rose).
4. Once more: 1 point. That is the gold dot, the point on the curve at 30%.

Sweep `s` from 0 to 1 and the gold dot traces the whole curve.

The equation shows the same thing as a weighted average. The point B(s) is a blend of the five control
points, with weights b₀ to b₄ (shown live) that always add up to 1. When s is near 0, the first point's
weight is near 1. Near the middle, the middle points dominate.

**Where the data comes from:** no data.

**How it's built:**
- [Lines and dots](../lines-and-points.md) from `src/lib/fatLines.js`, all redrawn every frame.
- [Orbit controls](../camera-and-controls.md) to look around.
- `motion(t)` drives the twist and the sweep. See [Motion and the live equation](../motion-and-latex.md).

**A tour of the file:**

The zig-zag's points:

```js
const X = [-1.8, -0.9, 0, 0.9, 1.8];
const Y = [-0.8, 1.1, -0.2, 1.1, -0.8];
...
const controlPoint = (i, kappa) => [X[i], Y[i] * Math.cos(i * kappa), Y[i] * Math.sin(i * kappa)];
```

- Five across positions and five heights make the flat zig-zag.
- `controlPoint` is a small recipe (see [Functions and arrows](../js-functions.md)): give it a point's
  number `i` and the twist `kappa`, and it hands back that point's position, across, up and depth.
  `cos` and `sin` swing the height round in a circle (see [sine and cosine](../sine-and-cosine.md)),
  so it turns point `i` around the left-right axis by `i × kappa`. Point 0 doesn't turn, point 1
  turns a little, point 4 turns most. That twists the zig-zag into a corkscrew.

The clock, in `motion(t)`:

```js
const kappa = KAPPA_MAX * 0.5 * (1 - Math.cos(TAU * p));
const s = 0.5 * (1 - Math.cos(3 * TAU * p));
```

- `p` is how far through the loop we are (0 to 1), and `TAU` one full turn (6.28).
- `kappa`, the twist, rises from 0 to 0.9 (`KAPPA_MAX`) and falls back, once per loop.
- `s`, the sweep, goes 0 → 1 → 0 three times per loop. `½(1 − cos)` is a smooth back-and-forth that
  slows down at each end, like a pendulum.

The construction, in `update`:

```js
if (k < DEGREE) level = level.slice(0, -1).map((p, i) => p.clone().lerp(level[i + 1], s));
```

This is step 1–4 above in one line. `level` is the current list of points and `k` counts the rounds.
`.slice(0, -1)` takes every point but the last, and `.map((p, i) => …)` makes a new list by doing
something to each one. For each point but the last, it makes a new point a fraction `s` of
the way to its neighbour (`lerp`, see [Blending, adding, dimming and gain](../colour-blending-and-gain.md)). Each
round has one point fewer, until one is left.

**Numbers worth knowing:**
- **18 seconds**: one loop. The dot makes six trips along the curve in that time.
- **0.9 radians**: the largest twist per step, about 52°. Point 4 ends up turned 4 × 0.9 = 3.6 radians, about 206°, more than
  half a turn.
- **128**: short line pieces that make up the curve.

**Words on this page:** [Bézier curve](../glossary.md#bezier-curve), [control point](../glossary.md#control-point),
[lerp](../glossary.md#lerp-mix), [radians](../glossary.md#radians), [orbit controls](../glossary.md#orbit-controls)
