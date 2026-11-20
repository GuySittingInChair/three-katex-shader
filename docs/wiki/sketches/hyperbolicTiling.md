---
summary: Seven-sided tiles that only fit together in a stranger kind of space.
added: 2026-11-18
---

# Hyperbolic Tiling: in plain English

File: `src/sketches/hyperbolicTiling.js` · Mode: shader · Category: Non-Euclidean

**What you see:** a round window of seven-sided tiles outlined in black: a teal one in the middle, ringed
by green, yellow, orange and pink, each ring smaller than the last, shrinking to glittering dust at the
rim. Every tile is cut into 14 thin triangles, alternately lighter
and darker. The whole window turns slowly.

**The idea behind it:** try tiling a floor with seven-sided tiles, three meeting at every corner. You
can't: each corner of a seven-sided tile is about 129°, so three of them make about 386°, more than the
360° of a full turn. There's too much tile at each corner, so the floor buckles up into frilly lettuce. On a flat floor
it's impossible. But it *does* work in **hyperbolic space**, a world where there's always more room the
further out you go, like a coral reef or a crocheted lettuce leaf.

The round window is a map of that world, called the *Poincaré disk*. Like a flat map of the round Earth,
it has to distort. Here, things look smaller the nearer they are to the rim. **Every tile is really the
same size.** The rim itself is infinitely far away: walk towards it and you'd never arrive, because the
ground keeps growing under your feet.

The equation on screen is the map's scale bar: how far a step on the map really is. On the left, `ds` is
the real distance; on the right, `dx` and `dy` are a small step across and up on the map, and `x` and
`y` are where you are (0 at the centre, distance 1 at the rim). Near the rim, `1 − x² − y²`, the bottom
of the fraction, nears zero, and dividing by almost nothing gives a huge number: a tiny step on the
map there is a huge real distance.

M.C. Escher loved this picture: his *Circle Limit* woodcuts fill the same map with fish, and with angels
and devils.

**Where the data comes from:** no data.

**How it's built:** one [fragment shader](../shaders.md). Instead of drawing tiles, each pixel asks
"which tile am I in?" by *folding itself home* with mirror reflections, like a kaleidoscope:
- Two straight mirrors through the centre fold the pixel into one thin slice of the middle tile.
- One curved mirror, a circle that meets the rim at right angles, is the tile's edge. If the pixel is
  past it, reflect it back across. On this map, that circle counts as a straight line.
- Repeat until the pixel lands in the home triangle. The number of curved reflections says roughly how
  many rings out it was, and picks its colour from the [cosine palette](../cosine-palette.md).

**A tour of the file:**

The fold, inside the loop:

```glsl
float a = atan(p.y, p.x);
float k = floor(a / (2.0 * wedge));
a -= k * 2.0 * wedge;
...
if (a > wedge) { a = 2.0 * wedge - a; flips += 1.0; }
```

- `p` is the pixel's spot (across, up). `wedge` is half a seventh of a full turn.
- Line 1: `atan` gives the pixel's angle around the centre (which direction it lies in).
- Lines 2–3: `floor` rounds down to a whole number, so `k` counts how many whole sevenths round the
  pixel is; taking those off turns it back into the first seventh of the circle.
- Line 4: if it's in the second half of that seventh, mirror it into the first half.

The curved mirror:

```glsl
if (d2 >= r * r) { done = true; break; }
...
p = C + d * (r * r / d2);
rings += 1.0;
```

- `C` is the mirror circle's centre and `r` its radius. `d` is the arrow from `C` to the pixel, and `d2`
  its length squared (length × length).
- Line 1: outside the circle means home: stop.
- Line 2: otherwise, *reflect in the circle*: points near its edge stay near, points deep inside are
  flung far out.
- Line 3: count it.

**A fix:** until 2026-11-18 the curved mirror was the wrong circle (it didn't meet the rim at right
angles), and the sketch drew a flat green disc. It now uses the right one, worked out from the tiling's
angles.

**Numbers worth knowing:**
- **7 sides, 3 at each corner**: the {7,3} tiling, in mathematicians' shorthand.
- **14** triangles per tile: each tile is 14 mirror images of one triangle.
- **9 rings** painted by default (the **Depth** slider, 1 to 30). Further out is left dark.

**Try this (funky):** drag **Depth** to 2. Only the tiles nearest the middle are painted, floating in
the dark like a flower. Then drag it up to 30 for a full bloom right to the rim, and set
**Spin** to −1 to watch the whole infinite floor whirl.

**Words on this page:** [hyperbolic geometry](../glossary.md#hyperbolic-geometry), [Poincaré disk](../glossary.md#poincare-disk),
[tiling](../glossary.md#tiling), [reflection in a circle](../glossary.md#reflection-in-a-circle), [kaleidoscope fold](../glossary.md#kaleidoscope-fold),
[shader](../glossary.md#shader)
