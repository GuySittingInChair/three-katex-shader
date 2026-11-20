---
summary: Two drawings of a surface that can't be built in our space, blending into each other.
added: 2026-11-18
---

# Boy's Surface: in plain English

File: `src/sketches/boysSurface.js` · Mode: 3d · Category: Topology

**What you see:** a strange, lumpy shell that slowly changes shape and back again, in a 16-second loop. One
end of the loop is Steiner's *Roman surface*, a rounded shape with creases and pinched points. The other end
is *Boy's surface*, a smooth shape with three lobes curling around a centre, like a three-bladed propeller
wrapped in cloth. Each shape holds still for about 3 seconds (1.6 at the end of one half and 1.6 at the start
of the next) before changing. You can drag to turn it, and the Params panel can switch the shading.

**The idea behind it:** this is about a famous strange surface called the *projective plane*. Here is one way
to make it, in your head:
1. Take a round sheet, a disc.
2. Glue every point on its edge to the point exactly opposite it on the edge.

In ordinary 3D space you can't do this without the sheet passing through itself. So mathematicians draw it in
3D with some self-crossing, like a drawing of a cube on paper has lines that cross. The Roman surface and
Boy's surface are two such drawings. The Roman surface has 6 *pinch points*, places where the sheet comes to a
sharp crease. Boy's surface has none: it is smooth everywhere, crossing itself along curves that meet at a
single *triple point* (one spot where three sheets pass through each other at once).

Both are recipes that take a point of the same disc and say where to put it in space. So you can blend the two
recipes: put each point a fraction `s` of the way from where the Roman surface puts it to where Boy's surface
puts it. That is the first line of the equation: **r_s(w) = (1 − s)·R(w) + s·B(w)**. In words: for each point
`w` of the disc, R(w) is where the Roman surface puts it and B(w) where Boy's surface puts it; take a fraction
`s` of the way from the first to the second. As `s` slides from 0 to 1, the pinch points open up.

**Where the data comes from:** no data. Both shapes are formulas: Steiner's from the 1840s, and the
Bryant–Kusner formula for Boy's surface from the 1980s.

**How it's built:**
- A surface worked out on the graphics chip by `src/lib/morphSurface.js` (see [Mesh, geometry and
  material](../mesh-geometry-material.md)). The sketch supplies GLSL saying where each point of the disc goes.
- `motion(t)` with the `segments` helper from `src/lib/motion.js`, for the hold-then-change rhythm.
- [Orbit controls](../camera-and-controls.md).

**A tour of the file:**

The rhythm, in `motion(t)`:

```js
const { index, blend } = segments(phaseOf(t, PERIOD), 2, 0.4);
return { s: index === 0 ? blend : 1 - blend };
```

- `segments` (a helper from `src/lib/motion.js`) cuts the 16-second loop into 2 halves; `index` says which
  half we're in (0 or 1).
- In each 8-second half, `blend` stays at 0 for the first fifth, eases smoothly from 0 to 1 over the middle
  three fifths, and stays at 1 for the last fifth. That's the `0.4`: 40% of each half spent holding still,
  split between its start and its end.
- `index === 0 ? blend : 1 - blend` means "if we're in the first half, `blend`; otherwise `1 - blend`". So
  first half: `s` = `blend` (Roman → Boy). Second half: `s` = `1 - blend` (Boy → Roman).

The surface, in the shader:

```glsl
float rho = 0.004 + 0.996 * uv.x;
float phi = uv.y * 6.28318530718;
vec2 w = rho * vec2(cos(phi), sin(phi));
...
return mix(roman(w), b, m_s);
```

- The grid of points (`uv`, each part from 0 to 1) is turned into a disc. `rho` is the distance from the
  centre, nudged a hair away from 0 (at exactly 0, every direction meets in one spot, which can make the
  shading glitch). `phi` is the angle, all the way round.
- `w` is the point on the disc.
- `roman(w)` and `boy(w)` (recipes earlier in the file) work out where each surface puts it; the line left out
  (`...`) stores the Boy's surface answer in `b`.
- `mix(..., m_s)` blends them by `s`. `m_s` is the motion value `s`, passed in as a [uniform](../uniforms.md).

The label in the equation changes too: when `s` is under 0.02 it reads "(Roman surface)", and over 0.98
"(Boy's surface)".

**Numbers worth knowing:**
- **16 seconds**: one full loop, there and back.
- **6 pinch points** on the Roman surface; **1 triple point** on Boy's surface.
- **110 × 165**: the grid of points the surface is made of, about 18,000 points, all moved on the graphics
  chip on every frame.

**Words on this page:** [projective plane](../glossary.md#projective-plane),
[surface](../glossary.md#surface), [pinch point](../glossary.md#pinch-point), [mix](../glossary.md#lerp-mix),
[uniform](../glossary.md#uniform), [topology](../glossary.md#topology)
