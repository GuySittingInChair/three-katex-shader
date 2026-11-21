---
summary: The invisible hot air above a candle and a mug of tea, made visible the way a schlieren camera sees it.
added: 2026-11-20
---

# Schlieren: Seeing Hot Air: in plain English

File: `src/sketches/schlierenPlume.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Optics

**What you see:** a round window of grey with black shapes at the bottom: a candle and a mug of tea. Above the
candle a wavering column rises, drawn in black and white edges like smoke, twisting into curls as it climbs; a
fainter shimmer rises from the mug. Every 18 seconds the picture switches to colour: the same flow, now in
rainbow hues on black.

**The idea behind it:** warm air is thinner than cool air, and light bends very slightly passing through air
of changing thickness (that is what makes things shimmer above a hot road; see [Mirage](mirage.md)). The
bending is far too small to see by eye. A *schlieren* camera (from the German *Schliere*, a streak) catches
it: it focuses light through the air onto a sharp edge, a *knife edge*. Light bent one way is blocked by the
edge, light bent the other way passes; unbent light is half blocked. So the picture's brightness shows how
fast the air's refractive index changes from left to right: invisible currents appear as light-and-dark edges.
Engineers use schlieren cameras to see shock waves round aircraft and gas leaks.

A *colour* schlieren replaces the knife edge with a colour filter: the colour shows which way the light was
bent, the strength how much.

**Where the data comes from:** no data. The air is a fluid simulation.

**How it's built:**
- **The air** is simulated by the "stable fluids" method (Jos Stam, 1999) on a 128 × 128 grid. Each step:
  1. the candle and mug heat the air above them;
  2. warm air is pushed up (*buoyancy*), and loses a little heat to the room;
  3. a little *vorticity confinement* (Fedkiw and others, 2001) keeps the small swirls that a coarse grid
     would smear out;
  4. everything is carried along by the flow (looking backwards along each cell's velocity to see where its
     air came from);
  5. the pressure is adjusted (30 sweeps of averaging) so the air is never squeezed or stretched.
- **The picture:** since thinner air means a lower index, the brightness is 50% grey plus the left-to-right
  change in temperature (negated). In colour mode, the hue is the direction of the temperature change, the
  brightness its size.
- The units are scaled; the shape of the flow, not its exact speed, is the point.

## The equation

- **n − 1 = Kρ** (the Gladstone–Dale law: air's index follows its density ρ; K ≈ 2.26×10⁻⁴ m³/kg) and **ρ = p
  / RT** (warmer air at the same pressure is thinner).
- **Brightness ∝ ∂n/∂x**: the knife edge shows how fast n changes across the picture.
- **The flow equation**: the air's velocity u changes by being carried along by itself, pushed by pressure
  differences, and lifted by heat (βT); and ∇·u = 0 says it is never squeezed.

## A tour of the file

Buoyancy and cooling, in `stepAir`:

```js
for (let k = 0; k < N * N; k++) { v[k] += DT * BUOY * T[k]; T[k] *= 1 - COOL; }
```

Every cell's upward speed `v` grows in proportion to how warm it is (`T`); and every cell loses 0.4% of its
warmth a step.

The knife edge, in `update`:

```js
const b = Math.max(0, Math.min(255, 128 + 900 * gx));
```

128 is mid-grey; `gx` is how fast the index changes from left to right here (worked out from the temperature
of the cells either side). Brighter one way, darker the other, clipped to the range a screen can show.

## Numbers worth knowing

- **About 9 millionths (0.000009):** how much air's refractive index changes between 20 °C and 30 °C, about 1
  part in 110,000. That is all a schlieren camera needs.
- **128 × 128** cells, **30** pressure sweeps each step.
- **1864:** August Toepler named the schlieren method and built the first practical apparatus.

**Try this (funky):** turn the knife edge on its side. In `schlierenPlume.js`, change `const b = Math.max(0,
Math.min(255, 128 + 900 * gx));` to `const b = Math.max(0, Math.min(255, 128 + 900 * gy));`. Now the picture
shows changes from bottom to top instead: the long straight sides of the rising column fade, while the tops
and bottoms of each curl stand out. Real schlieren photographers turn their knife edge to choose what to see.
(Checked by eye in the sketch.)

**Words on this page:** [schlieren](../glossary.md#schlieren), [refractive
index](../glossary.md#refractive-index), [buoyancy](../glossary.md#buoyancy),
[vorticity](../glossary.md#vorticity), [simulation step](../glossary.md#simulation-step)
