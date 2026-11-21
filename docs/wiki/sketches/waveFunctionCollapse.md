---
summary: A grid where every square could be any of sixteen pipe pieces, decided one at a time, lowest uncertainty first, until tidy plumbing appears.
added: 2026-11-20
---

# Wave Function Collapse: in plain English

File: `src/sketches/waveFunctionCollapse.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Algorithms

**What you see:** a grid of dim blue squares. One by one, squares light up as glowing cyan pipe pieces
(straight runs, corners, T-junctions, crossings, dead ends, or blank), each new one flashing white with a gold
outline. The pipes always join up with their neighbours: no pipe ever ends at a wall. The decided area spreads
like a patch, until the whole grid is a tidy, meaningless plumbing system. It pauses for four seconds and
starts a new one.

**The idea behind it:** *Wave Function Collapse* is a way to make patterns that obey local rules, invented by
Maxim Gumin in 2016 and used in games to build levels, towns and dungeons. Its name borrows loosely from
quantum mechanics: every square starts as a "superposition" of all the pieces it could be, and *collapses* to
one when decided.

The loop:
1. Find the undecided square with the least *uncertainty* (fewest options, weighted by how common they are).
2. Decide it: pick one of its remaining pieces at random, common pieces more likely.
3. *Propagate*: every neighbour crosses off any piece whose pipes wouldn't line up with it; if that changes
   the neighbour, its neighbours check too, and so on outwards.
4. Repeat until every square is decided.

Choosing the least uncertain square first is what keeps it from painting itself into a corner: the squares
with fewest options get decided while they still have one.

**Where the data comes from:** no data. 16 pipe pieces: one for every way the four sides (north, east, south,
west) can have a pipe or not.

**How it's built:**
- The only rule: touching sides must match, pipe to pipe and blank to blank.
- Weights (how common each piece is): blank 6, straight 3, corner 3, T-junction 1, crossing 0.5, dead end 0.4.
- The uncertainty is the *Shannon entropy* of the remaining options: high when many pieces are still possible
  and equally likely, zero when only one is left.
- With all 16 pieces available, it can never get stuck: there is always a piece that fits.
- 30 squares are decided a second. Undecided squares glow brighter the more uncertain they are.

## The equation

- **H = log Σw − (Σ w log w) / Σw**: the entropy of a square's remaining options, where w are their weights.
- **Decided**, **choices made**: progress. (Squares can also become decided without a choice, when propagation
  leaves only one option.)
- **Least uncertain square left**: the H of the next one to be decided.

## A tour of the file

The entropy, in `entropy`:

```js
for (const t of opts) { const w = TILES[t].w; s += w; sl += w * Math.log(w); }
return Math.log(s) - sl / s;
```

Add up the weights (`s`) and the weights times their logarithms (`sl`) over the options still open.

Propagation, in `collapseOne`:

```js
const kept = cells[j].filter((t) => can.has(TILES[t].n[theirs]));
```

`can` is what the decided square's facing side can be (pipe or blank); the neighbour keeps only the pieces
whose side facing back matches.

## Numbers worth knowing

- **16** pieces, **2** kinds of side (pipe or blank).
- **22%:** the share of blank squares in a finished grid with these weights (measured over three grids with
  the sketch's own code).
- **About 1,100 squares** on a laptop screen (34 × 32 here); 750 on a phone.

**Try this (funky):** make blank squares rare. In `waveFunctionCollapse.js`, change `w: c === 0 ? 6 :` to `w:
c === 0 ? 0.5 :`. The grids fill up with pipe: blank squares drop from 22% to 3%, and the plumbing turns into
a dense maze. (Measured over three grids with the sketch's own code.)

**Words on this page:** [wave function collapse (algorithm)](../glossary.md#wave-function-collapse),
[entropy](../glossary.md#entropy), [procedural](../glossary.md#procedural), [constraint
propagation](../glossary.md#constraint-propagation), [tiling](../glossary.md#tiling),
[random](../glossary.md#random)
