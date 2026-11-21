---
summary: A soap film draining under gravity, coloured by real thin-film interference worked out wavelength by wavelength.
added: 2026-11-20
---

# Soap Film Colours: in plain English

File: `src/sketches/soapFilmColours.js` · Mode: shader · Category: Optics

**What you see:** a round soap film held in a thin wire loop, like a bubble wand held upright. At first it is
almost white with faint pastel ripples. Over the loop's 40 seconds (standing for 1 to about 180 minutes, sped
up more and more), bands of colour appear at the top and creep downwards, and at the very top a black cap
forms. Slow swirls drift through the bands. Under the film, a strip shows the colour a film of each thickness
makes, from 0 (left) to 1,500 nanometres (right), with a tick every 250 nm.

**The idea behind it:** the colours of a soap bubble aren't dye. Light reflects off the film twice: once off
its front surface and once off its back. The two reflections travel slightly different distances (the back one
goes through the film and back) and then meet. For some colours (wavelengths) the two arrive in step and add
up: those colours are reflected brightly. For others they arrive out of step and cancel. Which colours win
depends on the film's thickness, so the colour is a measure of thickness. That is *thin-film interference*,
the same thing that colours oil on a puddle.

The reflected light at wavelength λ is **I(λ) = 4R sin²(2πnh/λ)**, where h is the film's thickness, n = 1.33
its refractive index (water) and R = 0.020 how much one surface reflects. (The front reflection is flipped
upside down, a half-wave shift, which is why the formula has sin² and not cos².) When the film gets thinner
than about 30 nm, it reflects only a fifth or less of what it does at its brightest, for every colour, and
looks black next to the colours around it: *black film*, the film about to pop.

Why bands that move? Gravity pulls the liquid down between the two surfaces, so the top thins first. Treating
it like syrup sliding between two plates, and keeping track of where the liquid goes, gives a neat formula for
the thickness at depth z below the top after time t (worked out here, not looked up):

**h(z, t) = 2 √(η z / (ρ g t))**

with η the liquid's viscosity (1 millipascal-second, water), ρ its density and g gravity. Thin at the top,
thicker further down, and thinning everywhere as the square root of time.

Real soap films drain faster than this: their surfaces stretch and flow, and thin patches rise from the edges
("marginal regeneration"). This model, with surfaces that don't move, is the slowest case. The swirls are
added for the look (±6% of the thickness), and are not computed.

**Where the data comes from:** the colour science: the CIE 1931 colour-matching functions (how the eye
responds to each wavelength), in the multi-lobe Gaussian fits of Wyman, Sloan and Shirley (2013).

**How it's built:** it is a single [shader](../shaders.md). For every pixel inside the loop:
1. work out the depth z below the top, and the thickness h from the formula;
2. for 31 wavelengths from 400 to 700 nm, compute sin²(2πnh/λ) and add it up, weighted by how the eye sees
   each wavelength (the colour-matching functions);
3. turn the result into a screen colour.

## The equation

- **I(λ)**: the reflected light at each wavelength.
- **h(z, t)**: the thickness formula.
- **t** and three thicknesses: 1 mm from the top, at the middle (15 mm) and at the bottom (29 mm), right now.

## A tour of the file

The thickness, in the shader:

```glsl
float h = 2.0 * sqrt(${ETA.toExponential(2)} * max(z, 1e-6) / (${RHOG.toFixed(1)} * uSeconds)) * 1e9;
```

The formula h = 2√(ηz / ρgt), with the numbers η and ρg written into the shader by JavaScript (`${…}`), times
10⁹ to turn metres into nanometres.

The colour, in `filmColour`:

```glsl
float s = sin(6.2831853 * 1.33 * h / l);
vec3 c = cmf(l);
xyz += s * s * c;
```

For wavelength `l`: sin²(2πnh/λ), times the colour-matching value `cmf(l)` (how much this wavelength looks
red, green and blue to us), added to the total.

## Numbers worth knowing

From the formula (with water's viscosity):

| time | 1 mm down | middle (15 mm) | bottom (29 mm) |
|---|---|---|---|
| 3 minutes | 1,420 nm | 5,500 nm | 7,650 nm |
| 51 minutes | 366 nm | 1,416 nm | 1,969 nm |

- **Below about 1,500 nm** the colours become vivid; thicker films look nearly white.
- **About 30 nm:** thinner than this and the film reflects a fifth or less of its brightest, in every colour:
  it looks black.
- **8%:** the most a soap film can reflect (4 × 0.020). The picture is brightened so a thick film looks light
  grey.

**Try this (funky):** in `soapFilmColours.js`, change `const ETA = 1.0e-3,` to `const ETA = 1.0e-2,`: a liquid
ten times as thick, like water with plenty of glycerine. From the formula, the film is √10 ≈ 3.2 times thicker
at every moment, so the colour bands take ten times as long to reach the same place: by the end of the loop
(178 minutes) the vivid colours (under 1,500 nm) reach only about 6 mm down from the top, instead of covering
the whole film.

**Words on this page:** [interference](../glossary.md#interference), [thin-film
interference](../glossary.md#thin-film-interference), [wavelength](../glossary.md#wavelength),
[colour-matching functions](../glossary.md#colour-matching-functions),
[iridescence](../glossary.md#iridescence), [spectrum](../glossary.md#spectrum),
[shader](../glossary.md#shader)
