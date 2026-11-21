---
summary: White light through a glass prism, traced ray by ray for 24 colours, fanning out into a rainbow.
added: 2026-11-20
---

# Prism Dispersion: in plain English

File: `src/sketches/prismDispersion.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Optics

**What you see:** a beam of white light (seven parallel rays) coming in from the left and hitting a glass
triangle, a prism. Inside, the beam bends; coming out, it fans into a rainbow, red bending least and violet
most. The prism slowly turns back and forth, and the rainbow swings and widens. At one end of the swing the
violet and blue light gets trapped inside the glass and bounces off the far face instead of coming out.

**The idea behind it:** light slows down in glass, and when it enters at an angle it bends, by *Snell's law*:
n₁ sin θ₁ = n₂ sin θ₂, where θ is the angle from straight-on and n the *refractive index* (how much the
material slows light: 1 for air, about 1.5 for window glass). The bending happens because one side of the beam
reaches the glass, and slows, before the other side, like a car's wheels turning when one side hits sand
first.

Glass slows violet light slightly more than red, so its n is slightly bigger for violet, and violet bends
more. That spreading of colours is *dispersion*. A prism bends the light twice (in and out), so the colours
fan out enough to see. Newton did this in 1666 and showed that white light is a mixture of all the colours.

The sketch uses real glass: SF11, a dense flint glass with strong dispersion. Its index for each wavelength λ
comes from the *Sellmeier formula*, n² = 1 + Σ Bᵢλ² / (λ² − Cᵢ), with the six numbers the glass maker (Schott)
publishes.

**Where the data comes from:** Schott's Sellmeier coefficients for SF11. Checked: they give n = 1.7847 for
yellow (587.6 nm) and an Abbe number (a standard measure of how little a glass spreads colour) of 25.7,
matching Schott's 1.78472 and 25.68.

**How it's built:**
- 24 wavelengths from 400 to 700 nm, each drawn in its own colour, worked out from the CIE colour-matching
  functions (the same as in [Soap Film Colours](soapFilmColours.md)).
- Each ray is traced as straight lines between faces: find where it hits the next face; bend it with Snell's
  law; if the law has no answer (light meeting the inside of a face too steeply), reflect it instead: *total
  internal reflection*.
- The coloured rays are drawn with *additive* mixing (see [Colour blending](../colour-blending-and-gain.md)),
  so where all the colours overlap they add back up to white.

## The equation

- **Snell's law** and the **Sellmeier formula**.
- **n** for blue (486 nm), yellow (589 nm) and red (656 nm): 1.807, 1.785, 1.776.
- **θ in**: the angle the beam meets the first face at, right now; **D**: how much the blue and red light are
  bent in total (the *deviation*).
- **D min = 2 arcsin(n sin 30°) − 60°**: the least the prism can bend yellow light, 66.3°, when the light
  crosses the prism symmetrically. As the prism turns, D dips to near this and rises again.

## A tour of the file

Snell's law, in `refract`:

```js
const r = n1 / n2, cos1 = -(d[0] * nrm[0] + d[1] * nrm[1]), k = 1 - r * r * (1 - cos1 * cos1);
if (k < 0) return null;
```

`d` is the light's direction, `nrm` the face's direction (pointing back towards the incoming light), so `cos1`
is the cosine of the angle of incidence. `k` is the cosine squared of the bent angle; if it would be negative
there is no bent angle at all: total internal reflection (`null`).

The index of the glass:

```js
const nOf = (nm) => { const l2 = (nm / 1000) ** 2; return Math.sqrt(1 + B.reduce((s, b, i) => s + (b * l2) / (l2 - C[i]), 0)); };
```

The Sellmeier formula, with λ in micrometres (`nm / 1000`), summing the three terms with Schott's B and C.

## Numbers worth knowing

Worked out in Node from the same formula:

- **65.2° and 69.2°:** the least that red and blue light can be bent by this prism. A 4° wide rainbow.
- **53.4°:** below this angle of incidence, blue light (486 nm) can't get out of the far face; violet (420 nm)
  is trapped below 56.4°. The sweep runs from 55° to 85°, so the violet end disappears for a moment.
- **33°:** the steepest angle at which light inside SF11 can still escape into air (arcsin(1/n)).

**Try this (funky):** swap in ordinary crown glass, BK7, the glass of most lenses. In `prismDispersion.js`,
change `const B = [1.73759695, 0.313747346, 1.89878101], C = [0.013188707, 0.0623068142, 155.23629];` to
`const B = [1.03961212, 0.231792344, 1.01046945], C = [0.00600069867, 0.0200179144, 103.560653];` (Schott's
BK7 numbers). The index drops to 1.517, the light bends far less (minimum 39.1° for blue, 38.4° for red), and
the rainbow shrinks from about 4° wide to 0.7°: barely a coloured fringe. (Worked out from the formula.)

**Words on this page:** [refraction](../glossary.md#refraction), [refractive
index](../glossary.md#refractive-index), [Snell's law](../glossary.md#snell-s-law),
[dispersion](../glossary.md#dispersion), [total internal
reflection](../glossary.md#total-internal-reflection), [wavelength](../glossary.md#wavelength), [additive
blending](../glossary.md#additive-blending)
