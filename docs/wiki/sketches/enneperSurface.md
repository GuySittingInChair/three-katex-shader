---
summary: A soap-film saddle that curls over and through itself.
---

# Enneper Surface: in plain English

File: `src/sketches/enneperSurface.js` · Mode: 3d · Category: Surfaces

**What you see:** a shimmering, saddle-like sheet that curls over itself: four flaps, two curving up and
two curving down, crossing through each other at the edges like a pair of pringles wrestling. It slowly
spins. Its colour shifts like oil on water. The Params panel can switch to other shadings, slice it
open, or reshape the equation itself.

**The idea behind it:** dip a wire loop in soapy water and the film that forms is as small as it can
possibly be. It pulls itself tight, like a stretched rubber sheet. Shapes like that are called *minimal
surfaces*. Every small patch of one balances perfectly: curving up one way exactly as much as it curves
down the other way, like a saddle or a pringle.

Alfred Enneper wrote down this one in 1864, with a short, neat formula. In the middle it is a pure
saddle. Further out, the flaps keep curling until they swing round and pass through each other. A real
soap film couldn't do that, but the formula doesn't mind.

The equation on screen is the formula. Picture a flat square of rubber, with every spot on it named by
two numbers, how far across (u) and how far up (v). The formula says where each spot ends up in 3D:
across (x), sideways (y) and height (z). The yellow numbers in it are the ones you can change with the
sliders in the Params panel.

**Where the data comes from:** no data.

**How it's built:**
- `parametricSurface` from `src/lib/parametric.js` turns the formula into a *mesh* (a shape made of thousands of tiny flat triangles): a 120 × 120 grid, each
  point placed by the formula (see [Mesh, geometry and material](../mesh-geometry-material.md)).
- `src/lib/surfaceMaterial.js` gives the shadings: "Iridescent", curvature colour maps, a checkerboard, and
  more.
- Four of the sliders have `rebuild: true` (see [Params: the sliders](../params.md)): let go of one and the whole
  surface is rebuilt in its new shape.

**A tour of the file:**

The formula itself:

```js
const uu = (u * 2 - 1) * coeffs.domainScale;
const vv = (v * 2 - 1) * coeffs.domainScale;
const x = uu - coeffs.cubicCoeff * (uu * uu * uu) + coeffs.crossCoeff * uu * vv * vv;
const y = vv - coeffs.cubicCoeff * (vv * vv * vv) + coeffs.crossCoeff * vv * uu * uu;
const z = uu * uu - vv * vv;
```

- `coeffs` holds the slider settings: `domainScale`, `cubicCoeff` and `crossCoeff`.
- Lines 1–2: `u` and `v` arrive between 0 and 1. `u * 2 - 1` turns 0…1 into −1…+1 (doubling, then taking 1 off), and multiplying by the
  **Domain scale** setting stretches that to run from −1.3 to +1.3, and call the results `uu` and `vv`.
- Lines 3–4: across and sideways positions. `uu * uu * uu` is `u` cubed (u × u × u), written `u³`. It
  stays tiny near the middle but grows fast towards the edges, and it's subtracted, so it pulls the
  edges back in. That's the curl.
- Line 5: height is `u² − v²` (u × u, minus v × v). Walk along the `u` direction and you climb; walk
  along `v` and you sink. Up one way, down the other: the classic saddle.

At the default settings (`cubicCoeff` ⅓, `crossCoeff` 1), this is exactly Enneper's surface. Move the
sliders and you get relatives of it, which are mostly no longer minimal surfaces.

`setup` builds it, and `update` only spins it and refreshes the shading:

```js
updateSurfaceMaterial(state.material, ctx);
state.mesh.rotation.y += ctx.delta * ctx.params.spin;
```

**Numbers worth knowing:**
- **14,641** points in the grid (121 × 121, since a 120-step grid has 121 points along each side).
- **1.3**: the patch size. Past about 1.7, the flaps cross through each other heavily, which is why the
  slider is there to play with.
- **1864**: the year Enneper described it.

**Try this (funky):** drag **domainScale** to its maximum, 2.5, and let go. The flaps grow, keep curling,
and wrap through each other into a wild crown of overlapping petals. Then try **slice** to cut it open and
see inside.

**Words on this page:** [minimal surface](../glossary.md), [surface](../glossary.md),
[saddle](../glossary.md), [parametric](../glossary.md), [mesh](../glossary.md)
