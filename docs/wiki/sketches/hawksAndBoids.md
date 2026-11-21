---
summary: Two hundred and sixty birds following three simple rules make a leaderless flock; three hawks hunt it, and it splits and regroups.
added: 2026-11-20
---

# Hawks and Boids: in plain English

File: `src/sketches/hawksAndBoids.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Emergence

**What you see:** a rectangle full of small arrowheads, 260 birds, coloured by the direction they fly,
gathered in loose flocks that swirl and stream. Three big red arrowheads, hawks, each with a faint red circle
round it, chase them. Where a hawk dives in, the flock splits round it and closes up behind; when a hawk
catches a bird, a pale ring flashes and the bird reappears at an edge. Leaving one side of the rectangle
brings you in at the other.

**The idea behind it:** in 1987 Craig Reynolds made computer birds he called *boids*. Each one looks only at
neighbours within a short distance and steers by three rules:
1. **separation:** don't crowd them;
2. **alignment:** fly the way they fly;
3. **cohesion:** drift towards their middle.

No bird leads and no bird knows the shape of the flock, yet a flock appears: an example of *emergence*. Here a
fourth, stronger rule is added: **flee**, straight away from any hawk within three times the normal range. The
hawks chase the nearest bird. They are a little faster than a bird can fly but worse at turning, so a bird
that dodges at the last moment escapes. The flock splitting round a hawk and closing up behind it (a
"fountain") is seen in real fish schools.

**Where the data comes from:** no data. A seeded random start.

**How it's built:**
- Every bird checks every other (260 × 259 pairs, twice a frame) for neighbours within range.
- Each rule gives a steering push; they are added with weights (flee strongest), and the turn is capped so
  birds can't spin on the spot. Speeds are kept between 40% and 100% of the top speed.
- **Polarisation**, a standard measure of how much a group moves as one, is worked out live: the length of the
  average of every bird's heading arrow. 1 means all fly the same way; near 0, every which way.

## The equation

- **v̇ = k_s separate + k_a align + k_c cohere + k_f flee**: each bird's steering, the four rules added with
  their weights.
- **Polarisation** and **caught**, measured live.

## A tour of the file

The three rules, in `stepWorld`:

```js
if (n) { gx += K.ali * (ax / n - b.vx) + K.coh * (cx / n); gy += K.ali * (ay / n - b.vy) + K.coh * (cy / n); }
```

Over the `n` neighbours: alignment steers towards their average velocity (`ax / n`) minus its own; cohesion
steers towards their average position (`cx / n`, measured from the bird itself). Separation was added just
before.

Fleeing:

```js
if (d < 3 * R) { fx -= (dx / d) * (3 * R - d); fy -= (dy / d) * (3 * R - d); }
```

A hawk within 3 × the range pushes the bird straight away from it, harder the closer it is.

## Numbers worth knowing

Run with the sketch's own code (birds measured from 20 to 60 seconds):

- **0.39:** average polarisation with three hawks hunting: the flock keeps breaking up.
- **0.94** with no hawks: almost every bird flying the same way.
- **About 8** birds caught a minute by three hawks (8 in the first 60 seconds of the run measured).

**Try this (funky):** call off the hunt. In `hawksAndBoids.js`, change `const NB = 260, NH = 3;` to `const NB
= 260, NH = 0;`. With no hawks, the birds settle into big, smooth flocks, and polarisation climbs to about
0.94: nearly everyone flying the same way. (Measured with the sketch's own code.)

**Words on this page:** [boids](../glossary.md#boids), [emergence](../glossary.md#emergence), [polarisation
(flocking)](../glossary.md#polarisation), [agent-based model](../glossary.md#agent-based-model),
[seed](../glossary.md#seed)
