---
summary: Nine thousand blind particles following their noses up a trail of slime grow a network joining twenty towns around Tokyo.
added: 2026-11-20
---

# Slime Mould Rail Planner: in plain English

File: `src/sketches/physarumRail.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Graphs &
Networks

**What you see:** a dark square map, 150 km across, with twenty labelled dots: Tokyo and the towns around it.
Glowing amber slime spreads out from the towns, thins, and gathers into a network of tubes joining them, with
loops and branches, like a hand-drawn railway map. A scale bar shows 20 km. Every 48 seconds it starts again
with a fresh scattering of slime.

**The idea behind it:** *Physarum polycephalum* is a slime mould: a single, enormous, brainless cell that
crawls about looking for food. In 2010 Atsushi Tero and colleagues put oat flakes on a wet dish in the pattern
of the cities around Tokyo and let the mould loose. It grew a network of tubes between the oats that looked a
lot like the real railway, and compared well with it on cost, efficiency and resilience, with nobody planning
it.

This sketch uses a well-known computer model of the mould, by Jeff Jones (2010). The mould is 9,000 tiny
particles, each following four rules:
1. *sniff* the slime trail at three points ahead of it: ahead-left, straight ahead, ahead-right (9 cells away,
   at 45° either side);
2. *turn* towards whichever smells strongest (by 45°);
3. *step* forward one cell, unless another particle is already there (only one fits in a cell; a blocked
   particle stays put and faces a random way);
4. *leave* a little slime where it lands.

Meanwhile the slime spreads out a little (each cell becomes the average of itself and its 8 neighbours) and
fades (loses 10% every step). The towns keep adding slime too, like food smelling. Busy routes get more slime,
so more particles follow them, so they get more slime: the routes that carry traffic grow into tubes, and the
rest fade away.

**Where the data comes from:** the town positions are approximate (to a couple of km) latitudes and
longitudes, turned into kilometres east and north of a point near Tokyo. There is no sea and there are no
mountains here. The real experiment shone light on those areas (the mould avoids light) to keep it off them;
this one is free to cross Tokyo Bay.

**How it's built:**
- The trail is a grid of 240 × 240 numbers (each cell 0.625 km); the particles move over it.
- Every frame: two steps of the four rules for all 9,000 particles, then the spread-and-fade.
- The grid is drawn as a picture: brighter amber where the slime is thicker. Brightness is scaled to the
  thickest 1% of the map, so the picture never washes out.
- Every quarter of a second, the sketch checks which towns are joined to Tokyo through thick slime (thicker
  than 90% of the map), by flooding outwards from Tokyo along it.

## The equation

- The first two lines are the particle's rules in words.
- **c ← (1 − 0.1) c̄₃ₓ₃** is the spread-and-fade: each cell's slime c becomes 90% of the average over the 3 ×
  3 square around it.
- **Towns joined to Tokyo** is counted live from the map.
- **Shortest straight-line network** is the *minimum spanning tree*: the shortest set of straight lines that
  joins all twenty towns (336 km), worked out once with Prim's method (start at Tokyo; keep adding the nearest
  town not yet joined).

## A tour of the file

The sniffing, in `stepMould`:

```js
const F = at(x + SO * Math.cos(h), y + SO * Math.sin(h));
const L = at(x + SO * Math.cos(h - SA), y + SO * Math.sin(h - SA));
```

`h` is the particle's heading (an angle). `SO` is how far ahead it sniffs (9 cells) and `SA` how far to each
side (45°). `F` is the smell straight ahead, `L` ahead-left (and the next line, not shown, ahead-right).

The one-per-cell rule:

```js
if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1 || (to !== from && taken[to])) h = r() * TAU;
```

If the next cell is off the map, or taken, the particle stays where it is and picks a new random heading.
Without this rule, every particle piles onto the same few trails and the network collapses into a couple of
bright streaks (that happened in the first version of this sketch).

The spread-and-fade:

```js
tmp[y * S + x] = (s / 9) * (1 - DECAY);
```

`s` is the sum of the 9 cells around (x, y); divided by 9 it is their average, and `(1 - DECAY)` keeps 90% of
it.

## Numbers worth knowing

- **9,000** particles, **20** towns, a **240 × 240** grid, each cell **0.625 km** across.
- **336 km:** the shortest possible straight-line network joining all twenty towns. Real rail lines aren't
  straight and the mould's tubes aren't either, so both are longer.
- **10% a step:** how fast the slime fades. That is the mould's memory: low fading means old routes linger.

**Try this (funky):** in `physarumRail.js`, change `DECAY = 0.1,` to `DECAY = 0.02,` (slime that fades five
times more slowly). The mould remembers its old routes for longer, so the network settles into fewer, fatter,
rounder tubes with fewer side branches. (Checked by eye in the sketch, side by side with the original.)

**Words on this page:** [slime mould](../glossary.md#slime-mould), [agent-based
model](../glossary.md#agent-based-model), [minimum spanning tree](../glossary.md#minimum-spanning-tree),
[diffusion](../glossary.md#diffusion), [emergence](../glossary.md#emergence), [graph
(network)](../glossary.md#graph)
