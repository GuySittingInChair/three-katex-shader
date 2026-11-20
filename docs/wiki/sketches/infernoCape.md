---
summary: Molten rock with glowing cracks, made from noise warping noise.
added: 2026-11-18
---

# Inferno Cape: in plain English

File: `src/sketches/infernoCape.js` · Mode: shader · Category: Procedural Textures

**What you see:** a wall of molten rock. Dark, glassy black stone is cracked all over with glowing veins of
orange and red, and here and there the heat boils up into yellow-white blotches. The whole thing drifts
slowly upwards, like flames licking up a wall, and gently pulses as if it's breathing. The middle is
brightest; the sides fade to dark, like the folds of a cape. It's inspired by the Infernal cape from Old
School RuneScape.

**The idea behind it:** nobody painted this. It's *procedural*: a recipe that makes the picture fresh for
every pixel, every frame. The secret ingredient is [noise](../noise.md), smooth randomness that looks like
rolling hills or clouds.

Plain noise looks like soft blobs, not fire. So the sketch does something sneaky called *domain warping*:
before looking up the noise at a spot, it *shoves the spot sideways* by an amount that is itself read
from more noise. Then it does it again. Imagine a photo of clouds printed on a rubber sheet, and someone
stirring the rubber with a spoon. Straight lines become swirls, and swirls of swirls: exactly the
twisting, curling look of flame.

The equation on screen is that recipe: noise, of a spot shoved by noise, of a spot shoved by noise. "fbm"
is stacked noise: big blobs plus smaller blobs plus smaller still (see [Noise: randomness that looks natural](../noise.md)).

**Where the data comes from:** no data.

**How it's built:** one [fragment shader](../shaders.md), with four sliders passed in as
[uniforms](../uniforms.md). Colours are blended with [mix and smoothstep](../colour-blending-and-gain.md).

**A tour of the file:**

The double warp:

```glsl
vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
vec2 r = vec2(
  fbm(p + uTurbulence * q + vec2(1.7, 9.2) - flow * 0.6),
  fbm(p + uTurbulence * q + vec2(8.3, 2.8) - flow * 0.6)
);
float f = fbm(p + uTurbulence * r);
```

- `p` is this pixel's spot (two numbers, across and up). `fbm(p)` reads the [noise](../noise.md) there:
  a smooth, cloudy random number that changes gently from spot to spot. `flow` slowly slides with time,
  so the lava creeps.
- Line 1: read two noise values here. Together they make an arrow, `q`: "shove this way".
- Lines 2–5: shove the spot by `q`, read two more noise values there: a second arrow, `r`.
- Line 6: shove by `r`, and read the noise one last time. That's the final heat `f`.
- The odd numbers like `5.2, 1.3` make sure each read comes from a different part of the noise, so
  the arrows don't all point the same way. **Turbulence** says how hard each shove is.

The cracks:

```glsl
float crack = 1.0 - abs(sin((f + r.x * 0.5) * uCrackSharpness));
crack = pow(crack, 4.0);
```

- `uCrackSharpness` is the **Crack sharpness** slider, and `r.x` the across part of the second shove.
- Line 1: a [sine](../sine-and-cosine.md) wave goes up and down; `abs` folds it so it only touches zero at sharp V-shaped
  points. `1.0 −` turns those points into bright peaks: thin glowing lines.
- Line 2: raising to the 4th power (multiplying it by itself 4 times) shrinks everything below 1: 0.9
  becomes 0.66, but 0.5 becomes 0.06. So only the very peaks stay bright: thinner, sharper lines.

Then four colours are blended in order as the heat rises: obsidian black, embers, flame orange, and a
white-hot core.

**Numbers worth knowing:**
- **5 layers** of noise in every fbm, and **5 fbm reads** per pixel: 25 noise lookups for each of the
  roughly 2 million pixels on a big screen, 60 times a second.
- **0.22**: the **Flow** speed, how fast the pattern drifts upwards.
- **14**: the default **Crack sharpness**. The higher it is, the more veins are packed in, and the thinner
  each one gets.

**Try this (funky):** drag **Turbulence** to 8 and **Crack sharpness** to 30. The calm lava turns into a
frantic, shattered, crackling mess, like the cape is about to explode. Then drag **Flow** to 0: the fire
freezes into a still slab of glowing rock, with only the gentle breathing left.

**Words on this page:** [procedural](../glossary.md#procedural), [noise](../glossary.md#noise), [fbm](../glossary.md#fbm),
[domain warping](../glossary.md#domain-warping), [smoothstep](../glossary.md#smoothstep), [vignette](../glossary.md#vignette)
