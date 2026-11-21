---
summary: The Earth and Moon seen from a turning camera, and rubber ducks dropped at the five Lagrange points: three roll off, two stay.
added: 2026-11-20
tags: astronomy
---

# Lagrange Point Parking: in plain English

File: `src/sketches/lagrangeParking.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Physics

**What you see:** a blue Earth in the middle and a grey Moon to its right, both standing still, on a
background of glowing contour lines like a hill map. Five crosses mark the Lagrange points, L1 to L5. At each,
five yellow rubber ducks are dropped, at rest, and leave trails as they move. The ducks at L1, L2 and L3 drift
away, slowly at first, then swing wildly round the Earth and Moon or out of the picture. The ducks at L4 and
L5 wobble in little loops and stay. The loop is 45 seconds, about nine months of time.

**The idea behind it:** the camera turns with the Moon, once every 27.3 days, so the Earth and Moon stay put.
A small object (a duck, a spacecraft) feels four things here: the Earth's pull, the Moon's pull, an outward
push because the camera is turning (the *centrifugal* effect: the same push you feel on a roundabout), and a
sideways push on anything moving (the *Coriolis* effect). The five Lagrange points (found by Euler and
Lagrange in the 1700s) are the places where all of these balance: a duck placed there at rest, stays at rest.

The contour lines are a *landscape* of those forces: a duck slides downhill on it. L1, L2 and L3 sit on
hilltops and saddles: the slightest nudge, and the duck rolls off, faster and faster. L4 and L5 are hilltops
too, but the Coriolis push turns any drift into a loop round the point instead (for a moon less than about
1/26 of the total mass, which our Moon is: 1/82), so the ducks there stay. Real asteroids collect at Jupiter's
L4 and L5: the *Trojans*.

Spacecraft use the unstable points too, with small engine burns to stay balanced: the James Webb Space
Telescope orbits the Sun–Earth L2, 1.5 million km beyond the Earth, where the Sun, Earth and Moon all stay
behind its sunshield.

**Where the data comes from:** the Moon's share of the Earth–Moon mass, μ = 0.01215, and their distance,
384,400 km.

**How it's built:**
- Units where the Earth–Moon distance, their total mass and the turning rate are all 1 (the *circular
  restricted three-body problem*).
- L1, L2 and L3 are found by *bisection* (halving a range until the balance point is pinned down); L4 and L5
  make equilateral triangles with the Earth and Moon.
- Each duck starts 0.002 (770 km) from its point, at rest, in a random direction, and is followed with the
  [RK4](../glossary.md#rk4) method, 250 steps per unit of time.
- The landscape is drawn once from the formula for Ω (below).

## The equation

- **Ω = ½(x² + y²) + (1 − μ)/r₁ + μ/r₂**: the landscape. The first part is the turning (centrifugal) effect;
  the other two are the Earth's and Moon's gravity (r₁ and r₂ are the distances to them).
- **ẍ − 2ẏ = ∂Ω/∂x, ÿ + 2ẋ = ∂Ω/∂y**: how a duck moves. Its acceleration (ẍ, ÿ) is the slope of the landscape,
  plus the Coriolis terms (2ẏ, −2ẋ), which push sideways on anything moving.
- **Ducks still parked**: how many of each five are within 0.1 (38,000 km) of their point.

## A tour of the file

How a duck accelerates, in `accel`:

```js
return [2 * vy + x - (a * (x + MU)) / d1 - (MU * (x - 1 + MU)) / d2, -2 * vx + y - (a * y) / d1 - (MU * y) / d2];
```

Across: Coriolis (2 vy), the outward push (x), the Earth's pull (towards x = −μ) and the Moon's (towards x = 1
− μ). Up: the same, with the Coriolis push the other way.

Finding L1, in `bisect`:

```js
const bisect = (a, b) => { for (let i = 0; i < 100; i++) { const m = (a + b) / 2; if (omegaX(a) * omegaX(m) <= 0) b = m; else a = m; } return (a + b) / 2; };
```

The push along the Earth–Moon line, `omegaX`, changes sign at the balance point. Keep halving the range,
always keeping the half where the sign changes.

## Numbers worth knowing

- **326,400 km:** L1, between the Earth and the Moon, 58,000 km short of the Moon.
- **448,900 km:** L2, 64,500 km beyond the Moon.
- **381,700 km:** L3, on the far side of the Earth.
- **1.5 days:** at L1, a small nudge grows about 2.7-fold every 1.5 days.
- **1.5 million km:** the Sun–Earth L2, where JWST orbits (from the same physics with μ = 3 × 10⁻⁶).

**Try this (funky):** give the Moon more mass. In `lagrangeParking.js`, change `const MU = 0.01215,` to `const
MU = 0.1,` (a moon a tenth of the total mass, well over the 1/26 limit). Now L4 and L5 are hilltops too: after
nine months, none of the 25 ducks are still parked anywhere. (Run with the sketch's own code. Just over the
limit, at μ = 0.04, the L4 and L5 ducks only leave very slowly: 7 of 10 are still there after nine months.)

**Words on this page:** [Lagrange point](../glossary.md#lagrange-point), [three-body
problem](../glossary.md#three-body-problem), [Coriolis effect](../glossary.md#coriolis-effect), [centrifugal
effect](../glossary.md#centrifugal-effect), [RK4 (Runge–Kutta)](../glossary.md#rk4),
[bisection](../glossary.md#bisection)
