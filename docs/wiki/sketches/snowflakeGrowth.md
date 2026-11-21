---
summary: Six-armed snowflakes grown cell by cell on a hexagonal grid from just three numbers: Reiter's model.
added: 2026-11-20
---

# Snowflake Growth: in plain English

File: `src/sketches/snowflakeGrowth.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Chemistry

**What you see:** a dark blue hexagon with a tiny speck of ice in the middle. Six thin arms grow out of it,
then side branches sprout from the arms, all six arms exactly alike. Around the crystal a faint blue halo
shows where it has drawn the water vapour out of the air. When it has grown big enough it pauses for four
seconds, and a new flake starts with different settings; there are three, then it repeats.

**The idea behind it:** a snowflake grows from water vapour freezing onto an ice crystal. Ice crystals are
hexagonal (that is how water molecules pack), which is why snowflakes have six arms. But why arms, and not a
fat hexagon? Because a tip that pokes out a little reaches fresher, wetter air than the hollows behind it, so
it grows faster still, and pokes out further: tips win. Any bump on an arm becomes a side branch for the same
reason.

In 2005 the mathematician Clifford Reiter made a simple model of this on a grid of hexagons. Each cell holds
an amount of water, s; a cell with s ≥ 1 is ice. Every step:
- a cell that is ice, or touches ice, is *receptive*: it keeps its water and gains a little more, γ (vapour
  freezing on);
- every other cell lets its water spread out: it moves a fraction α/2 of the way towards the average of its
  six neighbours (*diffusion*);
- far away, at the grid's edge, the air keeps a fixed amount of vapour, β.

Three numbers (α, β, γ) and a hexagonal grid. The arms, the branches and the symmetry all come out on their
own.

**Where the data comes from:** no data.

**How it's built:**
- A 161 × 161 grid of hexagonal cells, stored with *axial coordinates* (two numbers per cell, with six
  neighbours at fixed offsets).
- Two steps per frame, until the crystal's arms reach 72 cells long.
- Each pixel of the picture works out which hexagon it is in (once, when the screen size changes), and is
  coloured from that cell: ice white-blue, brighter where more water has piled up (showing ridges inside the
  crystal); vapour a faint blue, darker where it has been used up.
- The three flakes use α = 1 and (β, γ) = (0.4, 0.0001), (0.35, 0.001) and (0.8, 0.002).

## The equation

- The two rules (receptive cells gain γ; the others spread their water).
- This flake's α, β, γ.
- **Step** count, the **arm length** in cells, and how much of the hexagon round it the crystal fills.

## A tour of the file

Who is receptive, in `stepFlake`:

```js
if (rec) { u[k] = 0; v[k] = s[k] + gamma; } else { u[k] = s[k]; v[k] = 0; }
```

Each cell's water is split into the part that can move (`u`: only for non-receptive cells) and the part that
stays (`v`: receptive cells, plus γ).

Spreading out:

```js
s[k] = u[k] + (ALPHA / 2) * (sum / 6 - u[k]) + v[k];
```

The moving part goes α/2 of the way towards its neighbours' average (`sum / 6`); then the staying part is
added back.

## Numbers worth knowing

Measured by growing each flake in Node, until its arms are 70 cells long:

| β (vapour) | γ (freezing) | steps | fills of its hexagon |
|---|---|---|---|
| 0.4 | 0.0001 | 1,498 | 21% (thin, branching) |
| 0.35 | 0.001 | 2,022 | 30% |
| 0.8 | 0.002 | 139 | 31% (ten times faster) |
| 0.95 | 0.0001 | 70 | 58% (nearly a solid plate) |

- **6:** the arms, from the hexagonal grid, as in real ice.

**Try this (funky):** make the air much wetter. In `snowflakeGrowth.js`, change the first flake `[0.4,
0.0001]` to `[0.95, 0.0001]`. With vapour everywhere, the hollows fill almost as fast as the tips grow: the
first flake comes out a nearly solid six-sided plate (58% of its hexagon instead of 21%), and in 70 steps
instead of about 1,500. (Grown with the sketch's own code.) In this model, more vapour means fatter crystals.

**Words on this page:** [snowflake](../glossary.md#snowflake), [cellular
automaton](../glossary.md#cellular-automaton), [diffusion](../glossary.md#diffusion), [hexagonal
grid](../glossary.md#hexagonal-grid), [crystal](../glossary.md#crystal)
