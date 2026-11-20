---
summary: A planet's orbit cut into slices of equal time: long and thin far out, short and fat near the star, every one the same size.
added: 2026-11-20
tags: astronomy
---

# Kepler's Pizza: in plain English

File: `src/sketches/keplersPizza.js` · Mode: 3d · Category: Physics

**What you see:** a glowing orange star (the "oven") with a small blue planet going round it on an oval track.
The oval is cut into 12 slices, like a pizza, by lines from the star to the track, and the slices light up in
warm colours one after another as the planet passes through them. Every few orbits there is a flash at the
planet's closest point to the star: an engine burn, which stretches the next orbit into a longer oval. The
orbits grow from a circle to a long, thin oval, then shrink back to a circle, and start again. The live
equation shows the planet's distance, speed, the time an orbit takes, and how many large pizzas each slice
would hold.

**The idea behind it:** in 1609 Johannes Kepler, working from years of careful measurements of Mars, found two
rules that every planet obeys (and a third in 1619):
1. A planet's orbit is an *ellipse* (an oval), with the star at one of two special points inside it, called a
   *focus*, not at the centre.
2. The line from the star to the planet sweeps out **equal areas in equal times**. Near the star the planet
   moves fast, so its slice is short and fat; far away it crawls, so its slice is long and thin. But every
   slice cut in the same amount of time holds exactly the same area: the same amount of pizza.
3. The time an orbit takes (T, in years) and its size (a, the half-length of the oval in AU, the Earth–Sun
   distance) obey **T² = a³**. Bigger orbits take much longer.

The sketch cuts each orbit into 12 equal stretches of time, so each slice shows the same area. Kepler had no
idea why; Newton later showed that rule 2 follows from the fact that gravity pulls straight towards the star.

**Where the data comes from:** no data, only the Sun's real numbers: distances in AU, times in years, and the
Earth's speed, 29.78 km/s.

**How it's built:**
- The slices are fans of thin triangles drawn by a custom [shader](../shaders.md) that works out, for every
  corner, where the planet would be at that moment of the orbit.
- [Lines](../lines-and-points.md) draw the four orbit shapes and the slice cuts.
- [Glow](../glow.md) makes the star and planet shine.
- A comic caption under the equation says what the planet is "doing" (falling towards the oven, climbing
  away), worked out from whether its distance is shrinking or growing.

## The flight plan

Every orbit's closest point to the star (its *perihelion*) is 1 AU away, like the Earth's. At that point a
burn speeds the planet up, which keeps that closest point but throws the far end further out:

| orbit | stretch (e) | far point | time per orbit | speed, near / far |
|---|---|---|---|---|
| 1 | 0 (a circle) | 1.00 AU | 1.00 year | 29.8 / 29.8 km/s |
| 2 | 0.30 | 1.86 AU | 1.71 years | 34.0 / 18.3 km/s |
| 3 | 0.55 | 3.44 AU | 3.31 years | 37.1 / 10.8 km/s |
| 4 | 0.75 | 7.00 AU | 8.00 years | 39.4 / 5.6 km/s |

Then backward burns bring it back down through 0.55 and 0.3 to the circle, so the loop closes where it began.
The whole plan is 19.04 years, played at 2.4 seconds per year: 45.7 seconds. The burns are 4.17, 3.12 and 2.32
km/s.

On the longest oval the planet is 7 times faster at its closest point than at its farthest (39.4 against 5.6
km/s), which is exactly why its slices near the star are so short and fat.

## The equation

- **r = a(1 − e²) / (1 + e cos ν)**: the planet's distance from the star, r, when it is an angle ν (nu) round
  from its closest point. **a** is the oval's half-length and **e** its stretch (0 is a circle, near 1 a very
  long oval).
- **M = E − e sin E**: Kepler's equation, the trick for finding where the planet is at a given time. **M**
  grows steadily with time (2π per orbit); **E** is an angle that pins down the position. You can't rearrange
  this to get E directly, so the sketch guesses and improves the guess a few times (*Newton's method*).
- **|v|** is the planet's speed, from the *vis-viva* rule v = 29.78 × √(2/r − 1/a) km/s.
- **T² = a³**: Kepler's third law, in years and AU. **Δv** is the latest burn.
- **each slice = πab / K**: the oval's area (π times a times b, its half-length and half-width) split into K
  equal pieces, and how many 14-inch pizzas that is.

## A tour of the file

Finding where the planet is at a given time:

```js
const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
E -= d;
```

This is Newton's method on Kepler's equation. `E - e * Math.sin(E) - M` is how wrong the current guess is;
dividing by how fast that error changes says how far to move the guess. Each round roughly doubles the number
of correct digits, so a handful of rounds is exact to the last decimal place.

The slices, worked out in the shader for every corner:

```glsl
float M = 6.2831853 * (aSlice.x + aSlice.y) / uK;
```

Corner number `u` (0 to 1) along slice `k` sits at a time a fraction (k + u) / K of the way round the orbit.
Equal steps of time, so equal slices of area.

## Numbers worth knowing

- **0.2618 AU²**: each slice of the circle (π ÷ 12), about 5.9 × 10²² large pizzas: 59 thousand billion
  billion.
- **2.77 AU²**: each slice of the longest oval. Every one of its 12 slices holds exactly that, from the stubby
  ones by the star to the long ones at the far end. (Checked by adding up 4,000 thin triangles per slice: all
  12 agree to six decimal places, for all four orbits.)
- **7 times**: how much faster the planet goes at its closest point than its farthest, on the longest oval. In
  general it's (1 + e) ÷ (1 − e).
- **T² = a³**: the longest oval has a = 4 AU, so T = √(4³) = 8 years.

**Try this (funky):** in Params, drag **slices** down to 4, and wait for the longest oval. Each slice is now a
quarter of an orbit's time, and the cuts land at 158°, 180° and 202° round from the closest point. So two
slices are thin wedges, 22° wide, reaching 7 AU out to the far end, where the planet crawls, and the other two
are wide fans that each sweep 158° round the star, where it races. Same pizza in all four, as the equation's
"each slice" row says. (The cut angles were worked out from Kepler's equation before writing this.)

**Words on this page:** [ellipse](../glossary.md#ellipse), [eccentricity](../glossary.md#eccentricity),
[Kepler's laws](../glossary.md#kepler-s-laws), [perihelion](../glossary.md#perihelion), [Newton's
method](../glossary.md#newton-s-method), [shader](../glossary.md#shader), [glow](../glossary.md#glow)
