---
summary: A moon of 300 boulders held together by its own gravity spirals in towards its planet and is torn into a ring at the Roche limit.
added: 2026-11-20
tags: astronomy
---

# Roche Limit Shredder: in plain English

File: `src/sketches/rocheShredder.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Physics

**What you see:** an orange planet in the middle, two dashed circles round it (labelled "fluid limit" and
"rigid limit") and a small white moon orbiting it. The moon slowly spirals inwards. Once it is well inside the
outer circle it stretches, then comes apart, and its pieces spread round the planet into a ring. Every 30
seconds a new moon starts again.

**The idea behind it:** the planet pulls on every part of the moon, but harder on the near side than the far
side (gravity weakens with distance). That difference, the *tide*, tries to stretch the moon. The moon's own
gravity holds it together. The tide grows fast as the moon gets closer (as 1/distance³), while the moon's own
grip stays the same, so inside a certain distance the tide wins and the moon is pulled apart: the *Roche
limit*, worked out by Édouard Roche in 1848. Saturn's rings are inside Saturn's Roche limit, which is probably
why they are rings and not a moon.

How close depends on what the moon is like:
- a **rigid** ball (solid rock, holding its shape): it can come as close as 1.26 Rₚ (ρₚ/ρₘ)^⅓;
- a **fluid** ball (which stretches into an egg shape first): it breaks up further out, at 2.44 Rₚ (ρₚ/ρₘ)^⅓.

Rₚ is the planet's radius and ρₚ, ρₘ the planet's and moon's densities. A moon of loose boulders, a *rubble
pile* (as many small moons and asteroids are), should break up somewhere between the two.

**Where the data comes from:** no data. Units: the planet has mass 1 and radius 0.25; the moon has mass 0.001,
shared between 300 boulders.

**How it's built:**
- Every boulder pulls on every other (300 × 299 ÷ 2 = 44,850 pairs, 24 times a frame), *softened* a little so
  close pairs don't fling each other off.
- Boulders that touch push apart like stiff, slightly squashy balls, losing a little energy each bump.
- A gentle drag (0.4% of the speed per unit of time) makes the orbit shrink. It switches off once the moon has
  broken.
- The moon's size is measured live: the radius that holds 90% of the boulders (the smallest value seen in the
  run, since it stretches before it breaks). The two limits use the density that gives.
- A few boulders on the edge get flung off in the first seconds, before the pile settles: loose gravel.

## The equation

- **d rigid** and **d fluid**: the two limits, for this moon's measured density.
- **r**: the moon's distance from the planet's centre; its radius; and the planet's radius for scale.
- The caption reports where it broke up.

## A tour of the file

One pair of boulders, in `stepMoon`:

```js
const f = mp / Math.pow(d2 + SOFT * SOFT, 1.5);
```

Gravity between two boulders of mass `mp`, falling off with distance (`d2` is the distance squared). `SOFT`
(0.004) keeps it finite when two boulders are very close.

Touching:

```js
const nx = dx / d, ny = dy / d, vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny, fc = (STIFF * (2 * SIZE - d) - c * vn) / mp;
```

If two boulders overlap (closer than two radii), they push apart in proportion to the overlap (`STIFF`), minus
a little for the speed at which they are moving together (`c * vn`): a squashy collision.

## Numbers worth knowing

From the sketch's live readout, and the same code run in Node:

- **0.06:** the moon's radius once settled. That makes the limits about **0.75** (rigid) and **1.45** (fluid).
- **1.07–1.09:** where it actually comes apart: between the two, as a loose pile should.
- **2.27 times Saturn's radius:** where Saturn's main rings end (the outer edge of the A ring, about 136,800
  km). The fluid Roche limit there for a moon of ice is about 2.2: the rings' outer edge sits right around it.

**Try this (funky):** make the moon four times as dense. In `rocheShredder.js`, change `MOON = 1e-3,` to `MOON
= 4e-3,`. Its own gravity squeezes it smaller (radius 0.048) and holds it together much more strongly; the
limits shrink to 0.38 and 0.73, and it survives until r = 0.59, about half as far out. (Run with the sketch's
own code.)

**Words on this page:** [Roche limit](../glossary.md#roche-limit), [tide](../glossary.md#tide), [rubble
pile](../glossary.md#rubble-pile), [density](../glossary.md#density), [simulation
step](../glossary.md#simulation-step)
