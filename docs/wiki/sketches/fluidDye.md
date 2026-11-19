# Fluid Dye: in plain English

File: `src/sketches/fluidDye.js` · Mode: shader · Category: Fluid Flow

**What you see:** swirling clouds of blue and pale aqua drifting through deep navy, like ink dropped
into a glass of water, or smoke curling off a candle. Wisps fold over each other and slowly eddy, with
bright seams where currents meet. It never repeats.

**The idea behind it:** real fluid simulation is hard work (see the planned simulation pages, and Navier–Stokes
Vortex). This sketch doesn't simulate anything. It's a famous shortcut, a magic trick that *looks* like
fluid, called *domain warping*:
1. Make some [noise](../noise.md): soft random cloudiness.
2. Instead of looking up the noise at each pixel's real position, first *push* the position by some other
   noise, then look up.
3. Do it twice: noise pushed by noise, pushed by noise.

Pushing the lookup position bends straight lines into curls, and curls into curls-on-curls. Your eye says
"that's a fluid". The equation on screen is exactly that nesting: fbm of (p + fbm of (p + fbm of p)).
Here fbm is layered noise, and w is the "warpStrength" slider.

This trick is often credited to the graphics artist Inigo Quilez, who popularised it for drawing clouds,
marble and alien skies in shaders.

**Where the data comes from:** no data.

**How it's built:**
- One [fragment shader](../shaders.md).
- Home-made [noise and fbm](../noise.md): hash → smooth blend → five layers.
- A three-colour blend for the ink, using [mix and clamp](../colour-blending-and-gain.md).

**A tour of the file:**

The warping:

```glsl
vec2 q = vec2(
  fbm(uv + t * 0.15),
  fbm(uv + vec2(5.2, 1.3) - t * 0.1)
);
vec2 r = vec2(
  fbm(uv + q * uWarpStrength + vec2(1.7, 9.2) + t * 0.12),
  fbm(uv + q * uWarpStrength + vec2(8.3, 2.8) - t * 0.09)
);
float f = fbm(uv + r * uWarpStrength);
```

- `q` is a first push: two noise values, one for across and one for up. The odd offsets like
  `vec2(5.2, 1.3)` make sure the two aren't the same noise. `t` slides them over time, so it flows.
- `r` is a second push, worked out at the position *already pushed by `q`*.
- `f` is the final cloudiness, at the position pushed by `r`.

The colour:

```glsl
vec3 color = mix(deep, mid, clamp(f * 1.4, 0.0, 1.0));
color = mix(color, bright, clamp((f + length(r) * 0.4 - 0.6) * 1.6, 0.0, 1.0));
```

- Line 1: thin ink is deep navy, and thick ink is mid blue.
- Line 2: where the ink is thick *and* the second push was strong (`length(r)`), it brightens to pale aqua.
  That's why the brightest seams sit along the twistiest currents.

**Numbers worth knowing:**
- **5** layers of noise in each fbm.
- **5** fbms per pixel, so 25 noise lookups, each checking 4 grid corners: 100 little random-number
  scrambles for every pixel, 60 times a second.
- **0.8**: default warp strength. At 0.1 it is a lazy fog; at 2 it is a turbulent storm.

**Try this (funky):** swap the ink for lava. Change the three colours to
`deep = vec3(0.1, 0.0, 0.0)`, `mid = vec3(0.8, 0.2, 0.0)` and `bright = vec3(1.0, 0.9, 0.3)`. Same currents,
but now it's molten rock oozing through a dark crust. Then push **warpStrength** to 2 for a full eruption.

**Words on this page:** [noise](../glossary.md), [fbm](../glossary.md), [domain warping](../glossary.md),
[hash](../glossary.md), [mix](../glossary.md), [shader](../glossary.md)
