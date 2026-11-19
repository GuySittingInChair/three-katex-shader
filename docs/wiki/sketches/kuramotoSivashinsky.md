# Kuramoto–Sivashinsky: in plain English

File: `src/sketches/kuramotoSivashinsky.js` · Mode: shader · Category: Chaos

**What you see:** a seething honeycomb. Rounded dark-blue cells, like bubbles in a pan of boiling
porridge, are packed together and outlined in glowing sand and orange, with patches of deep red where the
ridges are highest. At first the cells jostle, split and merge restlessly. Over the first minute they
settle, and after that the honeycomb barely moves (see "A known problem" below).

**The idea behind it:** look closely at the edge of a gas flame, or a thin film of liquid running down a
window, and it isn't smooth. It wrinkles, and the wrinkles never stop changing. In the 1970s Yoshiki
Kuramoto (studying chemical waves) and Gregory Sivashinsky (studying flames) found the same short equation
for both. It's now the textbook example of *spatiotemporal chaos*: a pattern that's messy in space *and*
never repeats in time.

The sketch treats the screen as a landscape of hills and holes: a height `h` at every point. Three pushes
act on it, and they're the three parts of the equation on screen:
1. **−∇²h: bumps grow.** ∇² (the *Laplacian*) measures how different a spot is from the average of its
   neighbours. Normally nature *smooths* differences away, like heat spreading out. The minus sign does
   the opposite: big gentle bumps get bigger.
2. **−∇⁴h: tiny wrinkles are flattened.** The Laplacian of the Laplacian. It acts like stiffness, so
   very fine crinkles die out. Between these two, there's one bump size that grows best, and that sets the
   size of the cells.
3. **−½|∇h|²: slopes sink.** |∇h| is how steep the ground is. Steep places get pulled down, which folds
   the growing bumps into sharp-edged cells.

**Where the data comes from:** no data. It starts as faint random ripples.

**How it's built:**
- A [simulation](../glossary.md) in plain JavaScript on a 96 × 96 grid that wraps around at the edges,
  like the board in [Game of Life](gameOfLife.md).
- Each frame the heights are squeezed into a [DataTexture](../textures.md), a small picture, and a
  [fragment shader](../shaders.md) colours it with a five-colour [colour scale](../colour-scales.md).

**A tour of the file:**

The heart of `step()`, for one grid square:

```js
const dh = -lap[idx] - lap2[idx] - 0.5 * gradSq;
let nh = H[idx] + dt * dh;
if (nh > CLAMP) nh = CLAMP;
else if (nh < -CLAMP) nh = -CLAMP;
```

- Line 1: the equation, word for word: the three pushes add up to `dh`, how fast this height changes.
- Line 2: take a small step forward in time: the new height is the old one plus speed × time step `dt`.
  (This simplest way of stepping is called *Euler's method*.)
- Lines 3–4: a safety limit. No height may go past ±4.

And afterwards:

```js
mean /= CELLS;
for (let i = 0; i < CELLS; i++) next[i] -= mean;
```

Push 3 only ever pulls down, so the landscape would sink forever. This lifts it back to an average of zero.

**A known problem:** without the safety limit, this simulation blows up within seconds (heights reach
about a billion). With it, about 400 squares end up pinned at the limit, and those pinned ridges hold the
cells still: measured, by 50 seconds it moves about 1% as much as at the start. The real equation never
settles. A sturdier method (a *spectral* solver) would fix it.

**Numbers worth knowing:**
- **9,216** squares (96 × 96).
- **3 steps** of the equation per frame (the **Speed** slider, 1 to 8).
- **0.04**: the time step **Dt**. **1.3**: the **Spacing** between squares, which sets how many cells fit:
  a bigger spacing means more, smaller cells on screen.

**Try this (funky):** drag **Spacing** to 0.7. Within seconds the simulation overloads: about half the
grid slams into the safety limit and locks solid. You've broken the universe. Leave the sketch and come
back to restart it.

**Words on this page:** [chaos](../glossary.md), [Laplacian](../glossary.md),
[Euler's method](../glossary.md), [simulation step](../glossary.md), [DataTexture](../glossary.md),
[clamp](../glossary.md)
