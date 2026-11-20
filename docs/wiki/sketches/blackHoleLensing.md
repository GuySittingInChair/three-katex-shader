---
summary: Light bent round a black hole with Einstein's gravity, worked out for every pixel: the shadow, the arch and the bright side.
added: 2026-11-20
tags: astronomy
---

# Black Hole Lensing: in plain English

File: `src/sketches/blackHoleLensing.js` · Mode: shader · Category: Physics

**What you see:** a black disc in the middle of the screen, wrapped in a warm, dim orange ring of glowing gas.
The ring doesn't look flat. Its near side runs across in front of the black disc, but its far side, which
should be hidden behind the hole, rises up over the top of it in a great arch, and a second, thin line of
light hugs the edge of the black disc. A few stars shine through the gaps, smeared near the edge. Over 24
seconds the camera slowly rises from almost edge-on, 3° above the gas, to 35° above it, and comes back down.
The gas swirls round the whole time.

This is what the film *Interstellar* showed, and what the Event Horizon Telescope photographed in 2019: here
it is worked out from the equation, pixel by pixel.

**The idea behind it:** a black hole's gravity is so strong that it bends light. Not a little, as the Sun
does, but enough to swing light round the back of the hole and out the other side. So you see things that are
behind it.

- **The shadow.** Light that passes too close falls in and never comes out. From far away, any light aimed
  closer than about 5.2 "units" from the centre is lost, and that blank patch is the black disc you see: the
  black hole's *shadow*. (A unit here is the hole's size scale: for a black hole ten times the Sun's mass,
  about 15 km.)
- **The arch.** Light leaving the far side of the gas disk, behind the hole, is bent up over the top towards
  you. So the far side seems to stand up like an arch. Light from underneath is bent too, which makes the thin
  line round the shadow's edge.
- **The bright side.** The gas orbits fast: at its inner edge, about 40% of the speed of light. The side
  coming towards you looks brighter and bluer, the side going away dimmer and redder (the same effect that
  makes a passing siren change pitch, called the *Doppler effect*). Light climbing out of the hole's gravity
  also loses energy and reddens.

**Where the data comes from:** no data. It is Einstein's general relativity, worked out live.

**How it's built:**
- One [fragment shader](../shaders.md). For every pixel it sends a ray of light *backwards* from the camera
  and follows it, step by step, until it falls in, hits the gas, or flies off into the stars.
- The path of the ray comes from one equation (below), solved with a careful stepping method that tests the
  ground four times per step.
- `motion` moves the camera; three sliders set the speed, the camera's distance and how many steps each ray
  may take.

## The equation

The first line on screen is the whole of the physics:

**d²u/dφ² + u = 3Mu²**, with **u = 1/r**

- **r** is how far the light is from the centre of the hole, and **u** is one over that (so u is big near the
  hole and 0 far away).
- **φ** (phi) is how far round the hole the light has travelled, as an angle.
- **d²u/dφ²** is how fast u's rate of change is itself changing as the light goes round: how sharply the path
  is curving.
- **M** is the hole's mass, in units where it is 1.

Without the right-hand side (3Mu² = 0), the solutions are exactly straight lines: light that isn't bent. The
3Mu² is Einstein's correction. Far from the hole, u is tiny and u² tinier still, so light goes almost
straight; close in, it bends hard.

The second line gives the two famous numbers: rays aimed closer than **b = 3√3 M ≈ 5.2** fall in (that sets
the shadow's size), and at **r = 3M** light can circle the hole forever, the *photon orbit*. The third line
shows the camera's distance and height, live.

## A tour of the file

The camera's height, in `motion(t)`:

```js
const deg = 3 + 32 * (0.5 - 0.5 * Math.cos(TAU * p));
```

`p` goes from 0 to 1 over the 24-second loop. `0.5 − 0.5 cos(…)` glides smoothly from 0 to 1 and back (a
[wave](../sine-and-cosine.md)), so the camera's height glides from 3° to 3 + 32 = 35° and back.

The bending, in the shader:

```glsl
float accel(float u) { return 3.0 * u * u - u; }
```

This is the equation rearranged: d²u/dφ² = 3u² − u. Each step, the shader asks it "how is the path curving
here?".

```glsl
u += h / 6.0 * (k1u + 2.0*k2u + 2.0*k3u + k4u);
du += h / 6.0 * (k1v + 2.0*k2v + 2.0*k3v + k4v);
phi += h;
```

One step round the hole, 0.04 radians (about 2.3°) at a time. The `k1` to `k4` are four test measurements of
the curving, taken at the start, twice in the middle and at the end of the step, and averaged with the middle
ones counting double. This recipe, *RK4* (Runge–Kutta, fourth order), is far more accurate than taking one
measurement and striding.

```glsl
if (u > 0.5) { col = vec3(0.0); done = true; break; }          // inside r = 2M
if (u <= 0.0) { col = sky(radial); done = true; break; }        // escaped to infinity
```

- u above 0.5 means r below 2: the ray has crossed the *event horizon*, the point of no return. The pixel is
  black.
- u at or below 0 means the ray has gone off to infinity: the pixel shows the star in that direction.

When a ray crosses the flat plane of the disk between 6 and 16 units out, the pixel shows the gas there:

```glsl
float g = sqrt(max(1.0 - 3.0 / r, 0.01)) / (1.0 - v * dot(vDir, -rayDir));
```

`g` is how much the light's energy is boosted (above 1) or sapped (below 1): the gas's speed towards you on
the bottom of the fraction, the climb out of the hole's gravity on top. The brightness then goes up with g³.

## Numbers worth knowing

- **5.196** (3√3): the shadow's edge, in units of M. Checked by running the same equation: a ray aimed at 5.19
  falls in, one at 5.20 escapes.
- **6 to 16**: the gas disk, inner to outer edge. 6 is the closest a stable orbit can be (any closer and gas
  spirals straight in), so the disk really does stop there.
- **13.5 times**: how much brighter the approaching side of the inner edge is than the receding side, from g³
  (g is 1.20 coming towards you and 0.50 going away, worked out from the line above).
- **60%**: how much of the screen's height the shadow fills, from the default distance of 18. Worked out from
  the equation (it looks 15.8° wide from there) and measured on a screenshot: 62%.
- **1.66 turns**: the furthest any ray is followed round the hole, at the default 260 steps of 0.04 radians.

**Try this (funky):** in Params, drag **distance** down to 10. The shadow swells until it's taller than the
screen, and you're staring into the hole with the arch wrapped round its rim. Then drag it to 30: the shadow
shrinks to about a third of the screen's height, and the whole disk comes into view like a lopsided hat. (Both
worked out first from the equation, then checked in the sketch.)

**Words on this page:** [general relativity](../glossary.md#general-relativity), [event
horizon](../glossary.md#event-horizon), [black hole shadow](../glossary.md#black-hole-shadow), [photon
orbit](../glossary.md#photon-orbit), [Doppler effect](../glossary.md#doppler-effect),
[RK4](../glossary.md#rk4), [shader](../glossary.md#shader), [tone map](../glossary.md#tone-map)
