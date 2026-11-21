---
summary: A demon sorts fast molecules from slow ones through a tiny door, cooling one side and heating the other; its memory pays the entropy bill.
added: 2026-11-20
---

# Maxwell's Demon: in plain English

File: `src/sketches/maxwellsDemon.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Physics

**What you see:** a box of 160 bouncing molecules (bluish when slow, orange when fast), split by a wall with a
small door in the middle. A little red demon with big eyes sits on the wall. The door glows whenever the demon
lets a molecule through, and the molecule flashes white. Over 40 seconds the left side gets bluer and its tint
cooler, the right side more orange and warmer. Under the box, the demon's notebook fills with ticks, one per
decision. Then it all starts again.

**The idea behind it:** in 1867 James Clerk Maxwell imagined a tiny, quick-witted being guarding a door
between two halves of a box of gas. It opens the door only for fast molecules going right and slow ones going
left. Soon the right side is hot and the left cold, with no work done: you could run an engine off the
difference for free. That seems to break the *second law of thermodynamics*, which says that left alone, the
disorder of things, *entropy*, never goes down. (Hot and cold separated is more ordered than mixed.)

The resolution took a century. Leo Szilard (1929) noticed the demon has to *find out* each molecule's speed;
Rolf Landauer (1961) and Charles Bennett (1982) showed where the catch is: the demon has to remember what it
saw, and its memory is finite. Sooner or later it must erase it, and erasing one bit of information always
produces at least k ln 2 of entropy (*Landauer's principle*). So the gas's entropy drop is paid for, and more,
by the demon's forgetting. Information is physical.

**Where the data comes from:** no data. 160 hard discs, mass 1, starting at temperature 1 (in units where
Boltzmann's constant k is 1).

**How it's built:**
- The molecules bounce off the walls and each other elastically (no energy lost; the total stays exactly the
  same).
- The dividing wall bounces every molecule back, except at the door, where the demon decides: through, if it
  is fast and heading right or slow and heading left; otherwise bounced. "Fast" means faster than the middle
  speed at the start (√(2 ln 2) ≈ 1.18 for this gas). Every decision is one bit in the notebook.
- **Temperature** of a side is the average energy of motion of its molecules (½v² each, in these units, for a
  gas moving in a flat plane).
- **The gas's entropy** is worked out live from each side's number of molecules and temperature, with the
  ideal-gas formula for a flat gas: S/k = Σ (N ln(A/N) + N ln T), adding the two sides.

## The equation

- **T left, T right**: the two temperatures.
- **−ΔS gas / k**: how much the gas's entropy has fallen since the start.
- **bits × ln 2**: the least entropy the demon must produce to erase its notebook.
- **−ΔS gas / k ≤ bits × ln 2**: Landauer's bound. The right side always wins, by a mile.

## A tour of the file

The demon's decision, in `stepGas`:

```js
const fast = Math.hypot(p.vx, p.vy) > G.vStar, goingRight = p.vx > 0;
through = goingRight ? fast : !fast;
```

A molecule at the door: is it faster than the starting middle speed (`vStar`)? Fast ones may go right, slow
ones may go left.

Equal masses colliding:

```js
a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny;
```

`rel` is how fast they are approaching along the line between their centres (`nx`, `ny`). Two equal balls
hitting head-on swap that part of their velocity, and keep the rest.

## Numbers worth knowing

Run with the sketch's own code for 40 seconds:

- **0.47 and 1.42:** the two temperatures after 40 s, from about 1.02 each at the start.
- **283 bits** of decisions; the gas's entropy fell by **21.7** (in units of k); erasing the notebook will
  cost at least 283 × 0.693 = **196**. The demon loses, nine times over.
- **The total energy** stays at exactly its starting value throughout: the demon sorts, it never adds.

**Try this (funky):** give the demon a bigger door. In `maxwellsDemon.js`, change `GAP = 0.06;` to `GAP =
0.2;` (the door half-height). More molecules reach the door, so the demon sorts much faster: after 40 s the
sides are at 0.25 and 2.19, and the gas's entropy has fallen by 89. But the notebook holds 909 bits, a bill of
at least 630. (Run with the sketch's own code.)

**Words on this page:** [entropy](../glossary.md#entropy), [second law of
thermodynamics](../glossary.md#second-law-of-thermodynamics), [Landauer's
principle](../glossary.md#landauer-s-principle), [bit](../glossary.md#bit),
[temperature](../glossary.md#temperature), [simulation step](../glossary.md#simulation-step)
