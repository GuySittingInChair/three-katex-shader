---
summary: All 6,412 known planets around other stars, appearing in the year each was found, then flying into four charts that show what we've learned.
added: 2026-11-20
tags: astronomy
---

# Six Thousand Worlds: in plain English

File: `src/sketches/exoplanets.js` · Mode: 3d · Category: Astronomy

**What you see:** a dark space with a small gold dot in the middle (the Sun) and three faint rings round it.
Dots start popping into view around it, each one flashing as it appears: planets around other stars, each
placed in the direction of its star and at its distance. A counter shows the year racing from 1992 to 2026,
about two years a second, and how many planets are known so far. Then the dots fly off and line up into four
charts in turn, each a discovery that only shows up when you have thousands of planets to look at. The loop is
84 seconds:

1. **The census** (24 s): every planet appears in the year it was found.
2. **The radius valley** (16 s): planet size against how long its year is.
3. **Mass and radius** (14 s): how big planets get as they get heavier.
4. **The habitable zone** (15 s): how much starlight each planet gets, and which ones get Earth-like amounts.
5. **What each method can see** (15 s): orbit size against mass. Then the dots fly back to the sky.

The colours say how each planet was found:
- **blue**: it *transited*: passed in front of its star, dimming it slightly, like a moth crossing a lamp.
- **orange**: it made its star *wobble*. A planet and its star both swing round their shared balance point, so
  the star moves very slightly towards us and away; that shows as a tiny shift in its light's colour.
- **pink**: *microlensing*: it bent the light of a more distant star behind it, by its gravity, and made it
  brighten briefly.
- **green**: it was *imaged*: photographed directly, as a faint dot beside its glaring star.
- **grey**: other ways, such as precise timing of a pulsar's beats (the first two planets ever confirmed, in
  1992, were found that way, around a dead star called a pulsar).

**The idea behind it:** until 1992, no one knew for sure whether there were planets around other stars. Now
there are more than six thousand, and with that many, patterns appear that no single planet could show.

- **The radius valley.** Small planets come in two common sizes, about 1.3 and 2.4 times the Earth's width,
  with few in between, about 1.6. The usual explanation: the bigger ones are rocky cores still wrapped in a
  thick layer of gas; the smaller ones are cores that had their gas blown away by their star's heat. The gap
  moves to slightly smaller sizes for planets further from their star.
- **Mass and radius.** For small planets, more mass means more size. But above about 150 Earth masses (half of
  Jupiter) planets stop growing: adding mass squeezes them tighter, so a planet ten times Jupiter's mass is
  about Jupiter's size.
- **The habitable zone.** The band round a star where a planet like Earth could have liquid water on its
  surface: not so close that its oceans boil away, not so far that they freeze even under a thick blanket of
  carbon dioxide. For a cool, dim star, the band is close in; for a hot star, far out.
- **What each method can see.** Each way of finding planets has blind spots. Transits favour planets close to
  their star (they pass in front more often). Wobbles favour heavy ones (they pull harder). So the planets
  found so far are the ones easiest to find, not a fair sample. Planets like Earth, around stars like the Sun,
  are still almost out of reach.

**Where the data comes from:** the NASA Exoplanet Archive (run by Caltech's IPAC for NASA), its *Planetary
Systems Composite Parameters* table: one row per confirmed planet, with the archive's best value for each
measurement. Downloaded on 12 November 2026 and boiled down by `tools/exoplanets/build_exo.py`, which also
does every fit shown in the equations. Planets the archive flags as disputed are left out.

**How it's built:**
- Every planet is one point, drawn by a custom [shader](../shaders.md). Each point carries five positions, one
  for the sky and one for each chart, and the shader slides it between two of them, so all 6,412 move together
  smoothly. See [Lines and points](../lines-and-points.md).
- The sky positions use the star's direction (turned so the Milky Way's flat disc lies flat in the scene) and
  its distance on a *logarithmic* scale: each ring is ten times further than the last (10, 100 and 1,000
  [parsecs](../glossary.md#parsec), a parsec being 3.26 light-years). Otherwise everything but the nearest
  stars would be squashed into the middle.
- The charts' axes are logarithmic too (each step along an axis is ten times the last), drawn with
  [lines](../lines-and-points.md); the Solar System's planets are drawn as rings for scale.
- `motion` turns the clock into which part is playing; the shader does the moving.

## The equation

**The census:** the year, how many planets are known by then, and how many by each method. "Distance from the
Sun: log₁₀ d" says the sky's distances are on a ten-times scale.

**The radius valley:**
- First, how many planets are used (1,589: transiting planets with a year shorter than 100 days and a size
  known to within 10%), and what to notice: a gap between two sizes, and almost no big planets very close in
  (the "hot-Neptune desert").
- Then **R_gap ∝ P^m, m = −0.125**: the gap's size (R_gap) changes with the planet's year (P) to the power m.
  A negative m means the gap is at smaller sizes for planets further out. With P ten times longer, the gap is
  10^−0.125 = 0.75 times the size. The sketch measured m by trying tilts and keeping the one that makes the
  gap deepest.
- **Peaks 1.26 and 2.41, gap 1.6** Earth radii, for a 10-day year. Below them, for comparison, the published
  numbers: Fulton and others (2017) found peaks at about 1.3 and 2.4; Van Eylen and others (2018), m = −0.09.

**Mass and radius:**
- **R ∝ M^s**: radius grows with mass (M) to the power s. Measured from 1,069 planets whose mass was actually
  measured (to within 25%) and size too (to within 10%).
- **s = 0.45 → 0.59 → −0.01**: three straight pieces on the log chart. Up to 10 Earth masses, doubling the
  mass makes a planet 2^0.45 = 1.37 times wider; from 10 to 145, 2^0.59 = 1.5 times; beyond 145, no wider at
  all.
- **Scatter 0.11**: planets sit on average 0.11 *dex* (a factor of 10^0.11 = 1.29) off the line: same mass,
  different make-up.
- For comparison, Chen and Kipping (2017) found 0.28, 0.59 and −0.04. Their first break is at 2 Earth masses,
  not 10; the first slope here comes out steeper.

**The habitable zone:**
- **S_edge = S₀ + aT + bT² + cT³ + dT⁴**: Kopparapu and others (2014): how much starlight (S, with Earth's = 1)
  marks each edge of the zone, for a star of temperature T★. **T** is that temperature minus 5,780 K, the
  Sun's. For a Sun-like star the inner edge is at 1.11 times Earth's sunlight, the outer at 0.36.
- Then the count: **181 planets** in the zone, of which **17** are smaller than 1.6 Earth radii, so likely
  rocky. Among them TRAPPIST-1 e, f and g (three planets round one small cool star), Proxima Centauri b (round
  the nearest star to the Sun, 1.30 parsecs or 4.2 light-years away) and TOI-700 d. **275** are in the wider,
  "optimistic" zone.

**What each method can see:** words only: which corner of the chart each colour fills, then what's still
missing.

## A tour of the file

Each point moves between two positions, in the shader:

```glsl
vec3 p = mix(at(uA), at(uB), uK);
```

`at(uA)` is the point's position in one layout (say, the sky), `at(uB)` in the next (say, the radius-valley
chart), and `uK` slides from 0 to 1 between them. Because the graphics chip does this for every point at once,
all 6,412 planets fly together with no work at all on the main program's side.

Placing a planet on the sky, in `skyPos`:

```js
const r = SKY * Math.log10(Math.max(1.2, dpc));
```

The distance in parsecs, as a power of ten (`Math.log10`: 10 gives 1, 100 gives 2, 1,000 gives 3), times 1.3
scene units. So Proxima Centauri b at 1.3 parsecs is 0.15 units from the Sun, and a planet 8,500 parsecs away
(the furthest) only 5.1.

## Numbers worth knowing

- **6,412** planets: 4,821 blue (transit and transit timing), 1,172 orange (wobble), 294 pink (microlensing),
  94 green (imaged), 31 grey (other ways).
- **1,501** found in 2016, the record year, nearly all by transit: a big batch from the Kepler space
  telescope.
- **1995**: the first planet round a Sun-like star, 51 Pegasi b, found by its star's wobble.
- **351 parsecs** (about 1,150 light-years): the median distance to a known planet's star. Microlensing
  planets are much further: median 6,290 parsecs, towards the middle of the Milky Way.
- **8 days**: the median year of a transiting planet. Most of them orbit far closer to their star than Mercury
  does to the Sun (88 days).
- **12.5 m/s and 0.09 m/s**: how fast Jupiter and the Earth make the Sun wobble. A wobble the size of the
  Earth's is 9 centimetres a second: about half a hand's length each second, from a star many light-years
  away. That's why Earth's twin is still out of reach.
- **1.30 parsecs**: Proxima Centauri b, the nearest known planet.

**Try this (funky):** see why the sky uses a ten-times scale. In `exoplanets.js`, change `const r = SKY *
Math.log10(Math.max(1.2, dpc));` to `const r = SKY * dpc / 1000;`, which makes distance plain (1,000 parsecs =
1.3 units) and press Run. A quarter of the planets now sit within 0.13 units of the Sun and 82% within 1.3, a
tight knot round the gold dot, while the pink microlensing planets are flung far out, up to 11 units, in a
line along the dashed gold arrow: the direction of the middle of the Milky Way, where they were found. (The
rings stay where they were: they're drawn separately, still on the ten-times scale. Worked out from the data,
then checked in the sketch.)

**Words on this page:** [exoplanet](../glossary.md#exoplanet), [transit](../glossary.md#transit), [radial
velocity](../glossary.md#radial-velocity), [microlensing](../glossary.md#microlensing), [habitable
zone](../glossary.md#habitable-zone), [radius valley](../glossary.md#radius-valley),
[parsec](../glossary.md#parsec), [logarithmic scale](../glossary.md#logarithmic-scale),
[shader](../glossary.md#shader)
