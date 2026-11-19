# Conway's Game of Life: in plain English

File: `src/sketches/gameOfLife.js` · Mode: shader · Category: Cellular Automata

**What you see:** a grid of chunky coloured squares on a near-black background, flickering ten times a
second. At first it's a chaotic soup. Over a minute or two it calms into scattered still blobs, blinking
three-in-a-row "blinkers", and now and then a little five-square *glider* that crawls diagonally across
the screen and wraps round the edge. Squares are coloured by how crowded they are, and the colours drift slowly round the rainbow.

**The idea behind it:** a board of squares, each one either alive or dead. Every tick, each square
counts its eight neighbours and follows these rules:
- **Lonely:** a live square with fewer than 2 live neighbours dies.
- **Happy:** a live square with 2 or 3 live neighbours survives.
- **Crowded:** a live square with more than 3 dies.
- **Birth:** a dead square with *exactly* 3 live neighbours comes alive.

That's the whole game: you set it going and watch. John Conway invented it in 1970. Such tiny rules make
things that move, collide, breed and even compute: people have built working computers inside it.

The equation on screen is the rules: the next state is 1 (alive) if there are 3 neighbours, stays the same
if there are 2, and is 0 (dead) otherwise.

**Where the data comes from:** no data. About 35% of squares start alive, chosen [at random](../randomness.md).

**How it's built:**
- The game runs in JavaScript on a 64 × 64 grid.
- Each tick, the grid is copied into a [DataTexture](../textures.md), a small picture, and a
  [fragment shader](../shaders.md) colours it.
- `NearestFilter` keeps squares crisp instead of blurring them together.

**A tour of the file:**

Counting neighbours:

```js
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = (x + dx + SIZE) % SIZE;
```

- `for (let dy = -1; dy <= 1; dy++)` means "let `dy` be −1, then 0, then 1" (`++` adds one each time).
  Two of these loops, one inside the other, visit the 3 × 3 block around a square. `continue` skips the
  middle one (`dx === 0 && dy === 0`: "both are zero"), the square itself. See
  [Decisions and loops](../js-decisions-and-loops.md).
- The `% SIZE` wraps around: the left edge's neighbour is the right edge. The board is secretly a
  doughnut, which is why gliders leaving one side reappear on the other.

The rules, in one line:

```js
next[idx] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 255 : 0;
```

`&&` means "and", `||` means "or", `!` means "not", and `n` is the neighbour count. The `? 255 : 0` at
the end means "if all that is true, 255, otherwise 0". So: "Alive with 2 or 3 neighbours, or dead with
exactly 3, means alive (255). Anything else means dead (0)."

Timing:

```js
state.accum += ctx.delta * ctx.params.speed;
while (state.accum >= 1) { state.accum -= 1; step(); ... }
```

`ctx.delta` is the time since the last frame, and `+=` means "add to". A piggy bank of time: add a
little each frame, and spend it one generation at a time. At speed 10 that's
10 generations a second, whatever the screen's frame rate.

**The colours:** each live square is coloured by how many neighbours it has, using the
[cosine palette](../cosine-palette.md):

```glsl
float n = texture2D(uNeighbors, vUv).r * 255.0;
float hue = fract(n / 8.0 + uTime * 0.02);
```

- Line 1 reads the square's neighbour count back from the second texture. Pictures store numbers as 0 to
  1 (the stored byte divided by 255), so multiplying by 255 gets the count, 0 to 8, back.
- Line 2 moves an eighth of the way round the rainbow for each neighbour, and the whole palette drifts
  slowly with time.

So squares in crowded clumps and squares out on the edges get different colours. (Until 2026-11-18 the
first line multiplied by 8 instead of 255, which left every live square nearly the same colour.)

**Numbers worth knowing:**
- **4,096** squares (64 × 64), about 1,400 alive at the start.
- **10** generations a second (1 to 30 on the slider).
- **4 generations**: a glider's lap. Every 4 generations it is back to its own shape, one square further
  along diagonally.
- The board never resets. Leave the sketch and come back for a new random soup.

**Try this (funky):** in `step()`, change the birth rule `(!alive && n === 3)` to
`(!alive && (n === 3 || n === 6))`. That's a famous variant called *HighLife*, where a special pattern can
copy itself. The soup now churns longer and more wildly before it settles.

**Words on this page:** [cellular automaton](../glossary.md), [glider](../glossary.md),
[DataTexture](../glossary.md), [shader](../glossary.md), [random](../glossary.md)
