---
summary: A genetic algorithm teaching wobbly four-footed blobs to move, racing each generation's champion against its ancestors.
added: 2026-11-20
---

# Silly Walks, Evolved: in plain English

File: `src/sketches/sillyWalksEvolved.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Biology

**What you see:** three lanes, each with a little creature: four round feet (orange ones are grippy, pale ones
slippery) joined by six glowing springy limbs that stretch and squeeze in a rhythm. The top lane is the best
creature of generation 1, the middle the best of generation 10, the bottom the best of the latest generation.
They race for ten seconds along a track marked in metres, then race again. Underneath, a gold line climbs: the
best distance in each generation. The whole evolution starts again from scratch every 100 seconds.

**The idea behind it:** a *genetic algorithm* is evolution by natural selection, done by a computer:
1. Start with 40 creatures with random *genes* (here: where each foot starts, how grippy it is, and how much
   and when each limb stretches).
2. Test each one: drop it on the ground for 10 seconds and measure how far its middle moves to the right.
3. Keep the best 20. Each has one child: a copy with every gene nudged at random, by up to 12% of its range.
4. Repeat with the new 40.

Nobody tells the creatures how to walk. Early generations flail and topple; within a few dozen generations
they have found something that works, usually a lopsided hop, a scoot or a lunge. The captions say which,
worked out from how much of the time the latest champion has all four feet off the ground.

**Where the data comes from:** no data. A seeded random start, so each run of 100 seconds is the same.

**How it's built:**
- **The bodies** are a simple physics model, not a realistic animal. Each foot is a point with gravity (9.8
  m/s²) and 1% air drag, moved 60 times a second by *Verlet integration* (the next position is worked out from
  the last two). Each limb is a soft spring that pulls 12% of the way towards its length, twice a step, so no
  limb can kick infinitely hard. The floor stops feet sinking, and a foot on the floor keeps only (1 − grip)
  of its sideways motion.
- **The muscles:** each limb's length swings by up to 35% round its resting length, once every 1.2 s, each
  limb at its own moment in the beat.
- **The evolution** runs in the background, one creature tested per frame (about 1.5 generations a second).

The first version used stiff limbs, and evolution promptly found a way to fly: creatures that kicked so hard
they stayed airborne most of the time. Soft springs fixed it. Hopping is still allowed: kangaroos do it.

## The equation

- **score** = how far the creature's middle moved in 10 seconds.
- The selection rule: the best 20 of 40 survive, each child with every gene nudged by up to ±12%.
- **Generation:** the latest generation, its best distance, and generation 1's best, for comparison.

## A tour of the file

A limb pulling towards its length, in `physicsStep`:

```js
const rest = L[k] * (1 + amp * Math.sin((TAU * b.t) / BEAT + ph));
```

`L[k]` is the limb's resting length, `amp` how much it stretches (a gene), `ph` when in the beat it stretches
(a gene), and `BEAT` the 1.2 s rhythm.

A foot on the floor:

```js
if (p.y < 0) { p.y = 0; p.py = Math.min(p.py, 0); const grip = gn.nodes[i][2]; p.x = p.px + (p.x - p.px) * (1 - grip); }
```

Below the floor: put it back on the floor, and stop it falling; then keep only (1 − grip) of how far it slid
sideways this step. A grip of 1 is glue; 0 is ice.

Breeding, in `evolveSome`:

```js
E.pop = [...keep, ...keep.map((gn) => child(gn, E.r))];
```

The next generation is the 20 survivors plus one nudged child of each.

## Numbers worth knowing

Measured by running the sketch's own code in Node (its first three runs, each a different random start):

- **0.9–2.5 m:** what the best creature of generation 1 manages in 10 seconds.
- **9–15 m** by generation 40: a creature about a metre across, covering its own size every second or so.

**Try this (funky):** make the floor ice. In `sillyWalksEvolved.js`, change `const grip = gn.nodes[i][2];` to
`const grip = 0;`. Now no creature gets anywhere: the best distance stays at 0.00 m, generation after
generation (three runs, 40 generations each). Muscles can only push one part of a body against another;
without friction from the ground there is nothing to push off, so the middle of the body can't move sideways
at all. (Isaac Newton would have told you, but this is more fun.)

**Words on this page:** [genetic algorithm](../glossary.md#genetic-algorithm), [gene](../glossary.md#gene),
[Verlet integration](../glossary.md#verlet-integration), [simulation step](../glossary.md#simulation-step),
[seed](../glossary.md#seed)
