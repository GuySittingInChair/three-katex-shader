---
summary: Light bending through hot air over a road shows sky and an upside-down robot where the road should be; over a cold sea, the robot looms.
added: 2026-11-20
---

# Mirage: in plain English

File: `src/sketches/mirage.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Optics

**What you see:** a side view of a road: an eye on the left, 1.6 m up, and a glowing robot 450 m away. A fan
of light rays leaves the eye; each is coloured by what it ends up at: gold for the robot, blue for the sky,
brown for the road. On the right, a strip shows "what you see": every ray's colour, the highest ray at the
top. Underneath, a small graph of the air's temperature near the ground. For 24 seconds the road heats up;
then it becomes a cold sea under warm air for 16 seconds.

**The idea behind it:** light travels slightly slower in denser air, and bends towards it, the same way it
bends entering glass ([Prism Dispersion](prismDispersion.md)), only far more gently and smoothly.

- **Hot road:** the air touching a road in the sun can be tens of degrees hotter, and so thinner, than the air
  a metre up. A ray aimed slightly down towards the road curves back up before reaching it. Your eye follows
  the ray straight back, so you see the sky where the road should be: a shining "puddle", which moves away as
  you approach. Rays aimed even lower curve up and hit the bottom of the robot from below, so an upside-down
  copy of the robot appears under it: an *inferior mirage*.
- **Cold sea:** with cold, dense air on the water and warmer air above, rays curve down instead. Things far
  away appear lifted and stretched (*looming*); in strong layers, castles in the air: a *superior mirage*, or
  Fata Morgana.

The physics in two formulas:
- **n = 1 + 2.93×10⁻⁴ × (273.15 K / T)**: air's refractive index n at sea level, from its temperature T (in
  kelvin). Hotter air: n closer to 1.
- **y″ = dn/dy**: the ray's path bends (its curvature y″) towards larger n, by as much as n changes with
  height.

**Where the data comes from:** no data. The air: 20 °C (293 K), with a layer next to the road ΔT warmer (up to
25 K), fading over the first 15 cm; or a layer next to the sea ΔT colder, fading over 2 m.

**How it's built:**
- 90 rays, from 0.55° below level to 0.12° above, each stepped forward half a metre at a time with the bending
  formula (*ray tracing* through a smoothly changing medium).
- A ray that hits the robot after dipping lower than where it hit, and is rising, has made an upside-down
  copy.
- The side view is stretched upwards (by about 80 on a laptop screen; the label shows the actual figure),
  because real mirage angles are tiny: the whole fan is less than 0.7°.

## The equation

- The two formulas above.
- **T(y):** the temperature at height y right now (the hot road or the cold sea).
- **Rays hitting the robot:** how many of the 90 reach it the right way up, and how many as the flipped copy.

## A tour of the file

The bending, in `traceRay`:

```js
v += air.dndy(y) * (1 + v * v) * DX;
```

`v` is the ray's slope (how much it rises per metre forward). Each half-metre step, it changes by dn/dy (times
a small correction for steep rays, 1 + v²): rays curve towards denser air.

The temperature of the air, in `makeAir`:

```js
const T = (y) => 293 + sign * dT * Math.exp(-Math.max(0, y) / h);
```

293 K, plus (road) or minus (sea) ΔT right at the surface, fading away with height over `h` (15 cm or 2 m).

## Numbers worth knowing

Worked out by tracing rays with the sketch's own code:

- **0.375°:** with the road 25 K hotter than the air, rays aimed up to this far below level curve back up,
  grazing the road about 280 m ahead. That is where the puddle begins.
- **About 300 m** and **0.34°** for a road 20 K hotter.
- **0.0003:** how much air's refractive index differs from 1. Tiny, which is why mirages need long distances.

**Try this (funky):** make the hot layer thinner. In `mirage.js`, change `const h = act === 0 ? 0.15 : 2.0` to
`const h = act === 0 ? 0.05 : 2.0` (hot air only 5 cm deep instead of 15). Surprise: the mirage hardly
changes. The steepest rescued ray is still 0.375° below level and the same 38 rays make the flipped robot;
only the grazing point moves a little closer (257 m instead of 280 m). What matters is how much hotter the
road is, not how thick the hot layer is. (Worked out with the sketch's own code.)

**Words on this page:** [refraction](../glossary.md#refraction), [refractive
index](../glossary.md#refractive-index), [mirage](../glossary.md#mirage), [ray
tracing](../glossary.md#ray-tracing), [kelvin](../glossary.md#kelvin)
