---
summary: Ten thousand players cooperating or cheating, each copying its best neighbour: a symmetric kaleidoscope, then shifting borders.
added: 2026-11-20
---

# Prisoner's Dilemma Turf War: in plain English

File: `src/sketches/prisonersTurfWar.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Biology

**What you see:** a square board of 99 × 99 coloured squares, changing six times a second. In the first 30
seconds it starts all blue except one red square in the middle, and grows into a perfectly symmetric,
ever-changing pattern of red, blue, yellow and green, like a kaleidoscope. In the next 30 seconds it starts
from a random scattering of red and becomes shifting, jagged territories.

**The idea behind it:** the *Prisoner's Dilemma* is the classic puzzle about cooperation. Two players each
choose: be nice (*cooperate*) or cheat (*defect*). If both are nice, both do well. If one cheats on a nice
one, the cheat does even better and the nice one gets nothing. If both cheat, both get nothing. Whatever the
other does, cheating pays more, yet two cheats end up worse off than two nice players.

In 1992 Martin Nowak and Robert May put players on a board. Each square plays the game with its 8 neighbours
and itself every round, adds up its points, and then every square copies the strategy of whoever scored most
in its neighbourhood. No memory, no planning. They found that nice players survive in clumps: inside a clump,
being nice pays, because your neighbours are nice too. At the edges, cheats prey on them. The borders never
settle.

The colours are the ones in their paper:
- **blue:** was nice, still nice;
- **red:** was a cheat, still a cheat;
- **yellow:** just turned cheat;
- **green:** just turned nice.

**Where the data comes from:** no data. A made-up game on a made-up board.

**How it's built:**
- The board wraps round at the edges (leaving the right side brings you in on the left), so every square has 8
  neighbours.
- Each round: every square's score is counted, then every square takes the strategy of its best-scoring
  neighbour (itself included), all at once.
- The board is a 99 × 99 picture, one pixel per square, blown up without blurring.

## The equation

- **The table:** what a player gets for meeting a nice one (C) or a cheat (D). A nice player meeting a nice
  one gets 1; a cheat meeting a nice one gets **b** (the temptation, 1.85 to start); everything else gets 0.
- **Cooperators:** the share of the board that is nice right now, and in the second act the average over time.

## A tour of the file

Scoring, in `pdRound`:

```js
score[y * N + x] = S[y * N + x] ? b * c : c;        // 1 = defector; c = cooperators met, itself included
```

`c` is how many nice players this square met (out of 9). A nice square scores 1 for each; a cheat scores b for
each. Meeting a cheat is always worth 0, so it isn't counted.

Copying the best:

```js
if (score[j] > best) { best = score[j]; s = S[j]; }
```

Over the 9 squares of the neighbourhood, keep the strategy of the highest score.

## Numbers worth knowing

Measured by running the sketch's own code in Node:

- **Mirror-perfect:** in act 1, after 200 rounds the pattern is still exactly symmetric, left–right and across
  the diagonal: the rules treat every direction the same, and so does the start.
- **31%:** with b = 1.85 (and also 1.9), from a random start, nice players hold about 31% of the board on
  average (between 25% and 36% from round to round).
- **1.8 to 2:** the range of b where, in Nowak and May's paper, neither side wins and the borders shift for
  ever. The runs here agree with the trend: much lower and nice players hold most of the board, much higher
  and cheats take nearly everything (see Try this).

**Try this (funky):** open Params and move **b** during the second act (the random start). At **b = 1.5**,
cheating hardly pays and nice players hold about 87% of the board. At **b = 2.1** they are down to about 4%,
surviving in a few tiny blocks. In the first act, b = 1.7 traps the lone cheat in a small block that never
grows, and the board stays 99.9% blue. (All measured with the sketch's own code, averaged over rounds
100–400.)

**Words on this page:** [Prisoner's Dilemma](../glossary.md#prisoner-s-dilemma), [cellular
automaton](../glossary.md#cellular-automaton), [emergence](../glossary.md#emergence),
[seed](../glossary.md#seed)
