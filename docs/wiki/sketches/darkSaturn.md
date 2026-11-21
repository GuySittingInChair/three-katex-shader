---
summary: A black hole wearing a ring that is also a black hole, possible only with an extra dimension of space; every number from the exact solution.
added: 2026-11-21
tags: astronomy
---

# Dark Saturn: in plain English

File: `src/sketches/darkSaturn.js` · Mode: 3d · Category: Physics

**What you see:** a dark ball with a glowing orange edge, and around it a dark ring with a glowing blue edge,
like Saturn drawn in black. Faint bands drift round both, each at its own speed. Every 12 seconds the pair
slides into a different shape: the ring fat or thin, the ball bigger or smaller, the ball's bands drifting
with the ring, standing still, or going backwards. You can drag to look around. With Sound on, two tones hum,
one for the ball and one for the ring.

**The idea behind it:** in our universe (three dimensions of space plus time) a black hole's edge, its *event
horizon*, is always round, like a ball: in 1972 Stephen Hawking proved no other shape is possible. In a
universe with one more dimension of space (*five-dimensional spacetime*), that rule breaks. In 2002 Roberto
Emparan and Harvey Reall found a *black ring*: a black hole shaped like a doughnut, kept from collapsing by
spinning, just as Saturn's rings are kept up by orbiting.

In 2007 Henriette Elvang and Pau Figueras found an exact solution of Einstein's equations with both together:
a round black hole sitting in the middle of a black ring, in perfect balance, nothing holding them apart. They
called it **black Saturn**. Two surprises came with it:
- **Frame dragging:** the ring's spin drags space round with it, so the central hole turns even when it has no
  spin of its own (the first saturn in the loop).
- **Non-uniqueness:** many different saturns share exactly the same total mass and spin. In our universe, mass
  and spin are enough to tell you everything about a black hole; here they are not.

A new paper, "Doubly-spinning Black Saturns" by Jay Armas (arXiv:2611.20701, posted 16 November 2026), lets
the hole and the ring each spin in two directions at once (five-dimensional space has two independent planes
to spin in). It finds saturns where both horizons spin as fast as they possibly can (*extremal*), which the
paper calls the first example of a regular, vacuum solution of its kind with two separate extremal horizons,
and shows that black saturns that aren't extremal can reach thermal equilibrium (hole and ring at the same
temperature and spin rate). This sketch uses the original, single-spin family, whose formulas are short enough
to put on screen; the new family's are not.

**Where the data comes from:** no data: the exact formulas of Elvang and Figueras (JHEP 2007, arXiv
hep-th/0701035), equations 3.20 to 3.43. Before using them I checked my copy in Node: each horizon obeys its
*Smarr relation*, ⅔M = TS + ΩJ (a basic identity linking mass, temperature, entropy, angular velocity and
spin) to 15 decimal places; the hole's and ring's masses and spins add up to the totals; and an ordinary
five-dimensional black hole comes out with the paper's reference area, 2√2.

**How it's built:**
- Three numbers, 0 < κ₃ < κ₂ < κ₁ < 1, describe a black Saturn. A fourth, c̄₂, is fixed by the *balance
  condition* (equation 3.20), which keeps the ring from needing a strut or string to hold it up.
- From them come everything shown: the total mass M and spin J, and for each horizon its area, temperature,
  angular velocity and share of the spin.
- The loop moves smoothly between four saturns I found by solving the formulas: (A) the hole has no spin of
  its own (c̄₂ = 0) but is dragged round; (B) hole and ring spinning the same way; (C) the hole spinning
  backwards just enough to stand still (Ω = 0); (D) the hole spinning against the ring. All the saturns in
  between are balanced too (checked at 200 points along the way).
- **The picture is a 3D slice and not to exact scale.** A five-dimensional shape can't be drawn exactly. The
  ball's size comes from its area (A = 2π²r³ for a 3-sphere); the ring's radius from the thin-ring estimate R
  ≈ 1/(√2 Ω); its thickness from its area (A ≈ 2πR × 4πr²).
- The horizons are drawn by a [shader](../shaders.md): dark, with a glow where you look along the surface
  edge-on, and bands drifting at each horizon's angular velocity. [Glow](../glow.md) adds the halo.

**The sound** is a *sonification*: a translation of numbers into sound, not a sound the black holes make. Each
horizon hums one tone, pitch 330 Hz × 2^ω, where ω is how fast it turns (one octave up per unit). The hole is
on the left, the ring on the right. When the hole stands still (saturn C) its tone sits at 330 Hz;
counter-rotating, it drops below. Two horizons turning at the same rate would hum the same note.

## The equation

All in the paper's "reduced" units, which divide out the overall size so different saturns can be compared:
- **j**: the total spin for this mass (j² = 27πJ² / 32M³).
- **κ**: the three numbers describing this saturn.
- **a_H**: each horizon's area (its entropy) for this mass. **ω**: its angular velocity. **J_BH/J**: the
  hole's share of the total spin.
- **a_H total < 2√2**: the two areas together, always less than the area of a non-spinning five-dimensional
  black hole of the same mass. Elvang and Figueras found no saturn that beats it.

## A tour of the file

The balance condition, in `saturn`:

```js
const c = (1 / k2) * ((k1 - k2) / s(k1 * (1 - k2) * (1 - k3) * (k1 - k3)) - 1);          // balance (3.20), ε = +1
```

Equation 3.20 of the paper, solved for c̄₂: the value that makes the ring balance exactly.

The hole's angular velocity:

```js
const OBH = d * s((k2 * k3) / (2 * k1)) * (k3 * (1 - k1) - k1 * (1 - k2) * (1 - k3) * c) / (k3 * (1 - k1) + X);
```

Equation 3.21. With c̄₂ = 0 the hole has no spin of its own (`JBH` is 0), but this is not zero: frame
dragging.

The sound:

```js
{ freq: 330 * 2 ** s.omBH, gain: 0.18, pan: -0.4 },
```

The hole's tone: 330 Hz raised one octave per unit of its angular velocity, a little to the left.

## Numbers worth knowing

From the exact formulas (reduced units):

| saturn | j | hole's share of spin | hole ω | ring ω | total area |
|---|---|---|---|---|---|
| A: dragged round | 0.951 | 0 | 0.342 | 0.616 | 0.773 |
| B: co-rotating | 0.935 | 0.116 | 1.157 | 0.773 | 0.733 |
| C: standing still | 0.938 | −0.045 | 0 | 0.583 | 0.778 |
| D: counter-rotating | 0.875 | −0.352 | −0.329 | 0.570 | 0.724 |

- **2√2 ≈ 2.83:** the area (entropy) of a non-spinning five-dimensional black hole of the same mass. Every
  saturn here has less.
- **Saturn C:** a hole with spin of its own (−4.5% of the total), held motionless because the ring drags space
  the other way just as fast.

**Try this (funky):** open Params and set **speed** to 0 while the caption says "Hole spinning against the
ring" (saturn D): the bands freeze, and the numbers stay on the counter-rotating saturn. Then drag the view to
look along the ring's plane: from edge-on, the ring shrinks to a thin line, but it is still a whole black
hole.

**Words on this page:** [black ring](../glossary.md#black-ring), [black Saturn](../glossary.md#black-saturn),
[event horizon](../glossary.md#event-horizon), [frame dragging](../glossary.md#frame-dragging), [extra
dimensions](../glossary.md#extra-dimensions), [Smarr relation](../glossary.md#smarr-relation),
[sonification](../glossary.md#sonification), [shader](../glossary.md#shader)
