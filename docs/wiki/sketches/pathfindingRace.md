---
summary: Dijkstra and A* race through the same maze; both find a shortest route, and A* searches about half as much to be sure.
added: 2026-11-20
---

# Pathfinding Race: in plain English

File: `src/sketches/pathfindingRace.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Algorithms

**What you see:** two copies of the same maze, side by side (stacked on a phone), each with a white mouse at
the top left and a gold piece of cheese at the bottom right. In each, a coloured flood spreads from the mouse:
the cells the search has looked at, blue near the start, shading to purple further out, with yellow cells on
its edge waiting to be looked at. On the left, Dijkstra spreads evenly in every direction. On the right, A*
heads more towards the cheese. When each reaches the cheese, its route lights up in gold. They pause, and a
new maze appears.

**The idea behind it:** finding the shortest route through a maze (or a road map, or a game level) is a
classic problem.

- **Dijkstra's method** (Edsger Dijkstra, 1956) always looks next at the unexplored square closest to the
  start. It spreads out in rings, so when it reaches the cheese it is sure no shorter route exists. Here every
  step costs the same, so it is the same as *breadth-first search*.
- **A\*** (Peter Hart, Nils Nilsson and Bertram Raphael, 1968) adds a guess. It ranks squares by f = g + h: g
  is the steps from the start so far, h a guess of the steps still to go. Here h is the *Manhattan distance*:
  across plus down to the cheese, ignoring walls, like walking city blocks. Squares that look promising are
  explored first.

The clever part: as long as the guess never *overestimates* (it never does here, since walls only make routes
longer), A* is still guaranteed to find a shortest route. It just wastes less time on the wrong side of the
maze.

**Where the data comes from:** no data. Mazes are carved by a *randomised depth-first search* (walk into a
random unvisited neighbour, knocking down the wall; when stuck, back up), then 12% of the remaining inner
walls are knocked out so there are loops and more than one route.

**How it's built:**
- A 31 × 21 maze; both searches look at one square per tick, 40 ticks a second.
- Each keeps a list of squares waiting to be looked at; it picks the one with the lowest f (for Dijkstra, h =
  0). Ties go to the square furthest from the start, which helps A* push on.
- When the cheese is reached, the route is traced back through "where did I come from?" notes.

## The equation

- **f(n) = g(n) + h(n)**, with **h = |Δx| + |Δy|**.
- **Cells explored** by each, and the route length once found. The caption compares them.

## A tour of the file

The guess, in `manhattan`:

```js
const manhattan = (k) => { const x = k % COLS, y = (k - x) / COLS; return COLS - 1 - x + (ROWS - 1 - y); };
```

The square number `k` is turned into a column and row; the guess is the columns plus rows still to go to the
bottom-right corner.

Picking the next square, in `expand`:

```js
if (f(a) < f(b) || (f(a) === f(b) && S.g[a] > S.g[b])) bi = i;
```

The lowest f wins; on a tie, the one with more steps behind it (larger g).

## Numbers worth knowing

Run on 40 mazes with the sketch's own code:

- **55%:** how many squares A* looked at, compared with Dijkstra, on average.
- **0 of 40:** mazes where A*'s route was longer than Dijkstra's. Both always find a shortest route.

**Try this (funky):** make A* overconfident. In `pathfindingRace.js`, change `return COLS - 1 - x + (ROWS - 1 -
y); };` to `return 2 * (COLS - 1 - x + (ROWS - 1 - y)); };` (guess twice as far as it really is). A* dashes
for the cheese, looking at only 22% as many squares as Dijkstra, but its route comes out longer in 28 of 40
mazes. A guess that can overestimate breaks the guarantee. (Measured with the sketch's own code.)

**Words on this page:** [A* search](../glossary.md#a-search), [Dijkstra's
algorithm](../glossary.md#dijkstra-s-algorithm), [breadth-first search](../glossary.md#breadth-first-search),
[heuristic](../glossary.md#heuristic), [Manhattan distance](../glossary.md#manhattan-distance), [graph
(network)](../glossary.md#graph)
