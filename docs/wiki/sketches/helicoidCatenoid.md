# Helicoid ↔ Catenoid: in plain English

File: `src/sketches/helicoidCatenoid.js` · Mode: 3d · Category: Surfaces

**What you see:** a glossy blue sheet twisted like a spiral staircase, or a strand of fusilli pasta. It
holds still for a few seconds, then starts to unwind and curl round sideways until it has rolled itself
up into an hourglass-shaped tube, like a cooling-tower chimney. It holds that shape, then rolls back into
the staircase, over and over. Drag to look around.

**The idea behind it:** both shapes are *minimal surfaces*, the shapes a soap film makes. A soap film
pulls itself as tight as it can, so every tiny patch of it balances: curving up one way exactly as much as
it curves down the other, like a saddle.
- The **helicoid** is the staircase: the soap film you'd get on a twisted wire.
- The **catenoid** is the hourglass: the soap film stretched between two rings held apart.

The surprise is that one bends into the other *without stretching or tearing anywhere*. Imagine the
staircase made of paper that can bend but never stretch: you can roll it up into the hourglass. Every
little patch keeps its exact size and shape on the inside. Mathematicians call a bend like that an
*isometry*, and this particular one was found by Ossian Bonnet in the 1850s.

How do you *see* that nothing stretches? The colour. By default the sheet is painted by its *Gaussian
curvature*: how strongly each patch curves, in a way that bending can't change (Gauss proved this in 1827
and was so pleased he called it his "remarkable theorem"). Watch the colours: they ride along with the
surface while it rolls, and don't change.

The equation on screen places each point of the sheet. The yellow α (alpha) is how far along the roll we
are: 0 is the staircase, 1.57 (a quarter turn) the hourglass.

**Where the data comes from:** no data.

**How it's built:**
- `createMorphSurface` from `src/lib/morphSurface.js` makes a [mesh](../mesh-geometry-material.md)
  whose points are placed every frame by a [vertex shader](../shaders.md). It even works out the
  curvature live, while the shape changes.
- [Motion](../motion-and-latex.md): `motion(t)` turns the clock into α.

**A tour of the file:**

The clock, in `motion(t)`:

```js
const { index, blend } = segments(phaseOf(t, PERIOD), 2, 0.35);
const towardCatenoid = index === 0 ? blend : 1 - blend;
return { alpha: (Math.PI / 2) * towardCatenoid };
```

- Line 1: split each 18-second loop into two halves, there and back. `blend` eases from 0 to 1 in each.
- Line 2: in the first half go towards the hourglass, in the second come back.
- Line 3: α runs from 0 to a quarter turn (π/2).

The shape, in the shader:

```glsl
vec3 p = vec3(ca * sinh(v) * sin(u) + sa * cosh(v) * cos(u),
             -ca * sinh(v) * cos(u) + sa * cosh(v) * sin(u),
              u * ca + v * sa);
```

`ca` and `sa` are the cosine and sine of α: how much "staircase" and how much "hourglass" to mix. At
α = 0, `sa` is 0 and only the staircase parts survive. At a quarter turn, `ca` is 0 and only the
hourglass parts do. In between, both, which is the rolling.

**Numbers worth knowing:**
- **18 seconds** per loop, with each shape held still for about 3 seconds.
- **16,471** points in the sheet (181 × 91).
- **Less than 1 part in a million**: how much the curvature changed during the roll when it was measured.
  That's computer rounding; in theory the change is exactly zero.

**Try this (funky):** in Params, set **Shading** to **UV checker**. The sheet is painted like a
chessboard. As it rolls, every square bends but none stretches or squashes: the proof you can see. Then
drag **Speed** to 4 and watch the pasta spin itself into a chimney and back like a nervous party trick.

**Words on this page:** [minimal surface](../glossary.md), [helicoid](../glossary.md),
[catenoid](../glossary.md), [isometry](../glossary.md), [Gaussian curvature](../glossary.md),
[parametric surface](../glossary.md)
