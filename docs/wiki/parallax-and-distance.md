---
summary: How astronomers measure the distance to a star from the tiny yearly wobble in where it appears.
added: 2026-11-20
tags: astronomy
---

# Parallax: measuring the distance to the stars

**In one sentence:** as the Earth goes round the Sun, nearby stars seem to shift very slightly against the far
background, and the size of that shift (the *parallax*) tells you exactly how far away the star is.

**Picture it:** hold your thumb up at arm's length and look at it with one eye, then the other. Your thumb
jumps sideways against the room behind it. Bring your thumb closer and it jumps more; move it away and it
jumps less. Your two eyes are about 6.5 cm apart, and with your thumb about 60 cm away it jumps by about 6°.
Your brain uses exactly this, all the time, to judge distance.

Astronomers do the same thing, but their "two eyes" are the Earth at two ends of its orbit, six months apart,
300 million kilometres apart.

**Why sketches need it:** [The Stars Within 100 Parsecs](../../src/sketches/gaiaNeighbourhood.js) places a
quarter of a million real stars at their real distances, and every one of those distances comes from a
parallax measured by the Gaia space telescope. Parallax is also the first rung of the "cosmic distance
ladder": the Cepheid stars in [The Cosmic Yardstick](../../src/sketches/cepheids.js) are calibrated with it,
and they in turn measure the distances to galaxies.

## The idea, in words

- The nearer the star, the bigger its yearly wobble.
- The wobble is tiny: even the nearest star moves by less than a second of arc, about the width of a 1p coin
  seen from 4 km away.
- Distance and wobble go opposite ways in a simple way: twice as far, half the wobble.

## The formula, written properly

**d = 1 / ϖ**

- **ϖ** (a curly pi, read "pomega" or "parallax") is the parallax angle in *arcseconds*. An arcsecond is a
  3,600th of a degree.
- **d** is the distance in *parsecs*. One parsec is the distance at which a star's parallax is exactly one
  arcsecond: about 3.26 light-years, or 206,265 times the distance from the Earth to the Sun.

Gaia reports parallaxes in *milliarcseconds* (mas, thousandths of an arcsecond), so in practice:

**d [parsecs] = 1000 / ϖ [mas]**

## Where the formula comes from

Draw a long thin triangle: the Sun at one corner, the Earth at another, and the star far away at the third.
The short side, Sun to Earth, is 1 *astronomical unit* (AU), about 150 million km. The parallax ϖ is the angle
at the star.

For a thin triangle, the short side is the long side times the angle (measured in radians, the natural unit
for angles: one full turn is 2π radians). So:

1 AU = d × ϖ (in radians), which means d = 1 AU ÷ ϖ.

Now choose units that make this neat. An arcsecond is 1 ÷ 206,265 of a radian. So a star with a parallax of 1
arcsecond is 206,265 AU away, and astronomers named that distance one parsec ("parallax of one arcsecond"). In
those units, d = 1 / ϖ with nothing else to remember.

(The "thin triangle" step is exact enough here: for an angle as small as an arcsecond, the difference between
the angle and its tangent is far smaller than any measurement.)

## A worked example

Gaia measured the parallax of Proxima Centauri, the nearest star to the Sun, as 768.07 mas.

- d = 1000 ÷ 768.07 = **1.302 parsecs**.
- In light-years: 1.302 × 3.2616 = **4.25 light-years**.
- So light from Proxima, travelling 300,000 km every second, takes over four years to reach us.

Sirius, the brightest star in the night sky, has a parallax of 379.21 mas: 1000 ÷ 379.21 = 2.64 parsecs, or
8.6 light-years.

## See it running

<div class="wiki-embed" data-sketch="gaiaNeighbourhood" data-caption="The Stars Within 100 Parsecs: a quarter of a million stars, each placed by its parallax"></div>

## What it looks like in the code

The sketch's stars are prepared once, before the site is built, by a Python script,
`tools/gaia/build_gaia.py`. Click a line or an underlined piece for what it does. First, which stars to ask
Gaia for:

```sql
WHERE parallax > 10 AND parallax_over_error > 10 AND ruwe < 1.4 AND bp_rp IS NOT NULL
```

Then the whole of the formula above, for every star at once:

```python
dist = 1000 / plx
```

And the star's true brightness, using the distance:

```python
MG = G + 5 * np.log10(plx / 100)
```

## How small these angles are

| parallax | distance | what it's like |
|---|---|---|
| 768 mas | 1.30 pc, 4.25 light-years | Proxima Centauri, the nearest star |
| 379 mas | 2.64 pc, 8.6 light-years | Sirius |
| 10 mas | 100 pc, 326 light-years | the edge of the Gaia sketch |
| 1 mas | 1,000 pc, 3,260 light-years | a 2 cm coin seen from 4,125 km away |

Gaia measures the parallax of bright stars to about 0.02 to 0.03 mas: about the width of a human hair (0.07
mm) seen from 580 km away. That is why the sketch can insist that every star's distance is good to 10%.

## Common mistakes

- **Mixing up arcseconds and milliarcseconds.** d = 1/ϖ needs arcseconds; with Gaia's milliarcseconds it's
  1000/ϖ. Forget the 1000 and every star is a thousand times too close.
- **Trusting tiny parallaxes.** If a parallax is about as small as its own measurement error, 1/ϖ swings
  wildly: a star measured at 0.5 ± 0.5 mas could be anywhere from 1,000 pc to "infinitely far". That's why the
  sketch keeps only stars whose parallax is at least ten times its error.
- **Thinking the wobble is the star moving.** The star stays put (apart from its own slow drift, which is
  separate); it's our point of view that moves, with the Earth.
- **Expecting a big wobble.** No star's parallax is bigger than about 0.77 arcseconds. You can't see it by
  eye, or even with an ordinary telescope; it was first measured in 1838, by Friedrich Bessel, for the star 61
  Cygni.

## Connections

- [Sine and cosine](sine-and-cosine.md) and [radians](sine-and-cosine.md#the-numbers-that-matter): the angle
  measure the derivation uses.
- [Loading data](js-promises-and-fetch.md): how the sketch loads the prepared star file.
- [Colour scales](colour-scales.md): how the stars are coloured by temperature.

## Sources

- Gaia Collaboration (Vallenari et al.), "Gaia Data Release 3: Summary of the content and survey properties",
  *Astronomy & Astrophysics* 674, A1 (2023): the parallaxes and their precision.
- F. W. Bessel, 1838: the first measured stellar parallax, of 61 Cygni.
- IAU 2012 Resolution B2, which fixes the astronomical unit at exactly 149,597,870,700 metres.
