---
summary: A single line folded finer and finer until it passes through every point of a square: the Hilbert curve, order by order.
added: 2026-11-20
---

# Hilbert's Infinite Noodle: in plain English

File: `src/sketches/hilbertNoodle.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Geometry

**What you see:** a glowing line, coloured like a rainbow from one end to the other, folded into a square. At
first it is a simple U. Then every corner splits into four smaller corners, and the line becomes a more
crinkled U made of four U's; then again, and again, seven times, until it is a dense rainbow carpet of 16,384
tiny steps. A white dot travels steadily along the line. Below, the same rainbow is shown pulled straight,
with the dot's place along it.

**The idea behind it:** in 1891 David Hilbert described a curve that, folded finer and finer forever, passes
through every single point of a square. A line, which has no width, filling an area. Each level (*order*) of
the curve is made of four copies of the one before, shrunk to half size, turned and joined end to end. At
order n it visits every cell of a 2ⁿ × 2ⁿ grid, one step to a neighbouring cell at a time.

Its length doubles each time: in a 1-metre square, order n is (4ⁿ − 1) / 2ⁿ metres long, about 2ⁿ. The
"infinite noodle" at the end of the process is infinitely long and fills the square completely: mathematicians
say its *dimension* is 2, like an area, though it is still one unbroken line.

It has a practical side. Because the curve never jumps, points close together along it are close together in
the square (*locality*). Watch the travelling dot: it never leaps across the picture. That is why Hilbert
curves are used to store maps and images in computers so that neighbouring places stay near each other in
memory. (The reverse isn't always true: two neighbouring cells can be far apart along the curve, either side
of a big fold.)

**Where the data comes from:** no data.

**How it's built:**
- Each order's points are worked out once, with the standard bit-by-bit recipe that turns a position along the
  curve into a cell of the grid.
- The animation grows order n out of order n − 1: each new point starts at the position of its "parent" (the
  point of the previous order whose cell it lies in) and slides to its own place. Checked for orders 2 to 7:
  every block of four new points lies exactly in its parent's cell, and every step moves to a touching cell.
- The rainbow is drawn in 96 coloured stretches along the curve.

## The equation

- **n** and **4ⁿ**: the order and the number of cells it visits.
- **L(n) = (4ⁿ − 1) / 2ⁿ**: its length on a 1-metre tile. (4ⁿ points, so 4ⁿ − 1 steps, each 1/2ⁿ of a metre.)
- **L(20)**: what order 20 would be: 1,049 km of noodle, folded into a square metre.

## A tour of the file

The recipe, in `cellOf`:

```js
const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
```

The position along the curve, `t`, is read two binary digits (*bits*) at a time; each pair says which quarter
of the current square the point is in. `rx` and `ry` pick left or right, bottom or top.

```js
if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
```

In the bottom quarters the smaller curve is turned (swapping x and y) and sometimes flipped, so that its ends
join up with the neighbouring quarters' ends.

Growing out of the parent, in `update`:

```js
const parent = Math.floor(d / 4);
```

Point `d` of order n lies in the cell of point d ÷ 4 (rounded down) of order n − 1: four children per parent.

## Numbers worth knowing

| order | cells | length on a 1 m tile |
|---|---|---|
| 1 | 4 | 1.5 m |
| 3 | 64 | 7.9 m |
| 7 | 16,384 | 128.0 m |
| 20 | about 1.1 trillion | 1,049 km |

**Try this (funky):** in `hilbertNoodle.js`, change `const MAX = 7,` to `const MAX = 8,`. The animation goes
one order further: 65,536 cells, and a noodle (4⁸ − 1) / 2⁸ = 256.0 m long folded into a 1-metre tile. At that
point the steps are smaller than the screen's pixels, and the carpet looks almost solid.

**Words on this page:** [space-filling curve](../glossary.md#space-filling-curve),
[fractal](../glossary.md#fractal), [locality](../glossary.md#locality), [bit](../glossary.md#bit),
[recursion](../glossary.md#recursion)
