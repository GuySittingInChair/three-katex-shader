# Kuramoto–Sivashinsky — Life-Seeded: in plain English

File: `src/sketches/kuramotoSivashinskyLife.js` · Mode: shader · Category: Chaos

**What you see:** the same seething honeycomb as [Kuramoto–Sivashinsky](kuramotoSivashinsky.md): dark-blue
bubble cells walled in sand, orange and red. But scattered over it are pale minty-cyan speckles that
flicker and crawl, and wherever they go, the honeycomb underneath bulges and churns. It's two simulations
stacked: a Game of Life board is "feeding" the flame.

This sketch is currently a **draft**: the arrow keys and the feed skip it, but you can open it from the
sketch list.

**The idea behind it:** a mash-up of two famous systems.
- **Underneath**, the Kuramoto–Sivashinsky equation: a wrinkling flame front, as heights on a grid. Read
  [its page](kuramotoSivashinsky.md) first.
- **On top**, [Conway's Game of Life](gameOfLife.md): squares that live or die by counting their
  neighbours, making blinkers and gliders.

The link between them is one extra term in the equation: **wherever a Life square is alive, the height
there gets a steady push upward.** Life is the fuel, sprinkled in neat patterns; the flame's chaos grabs
it, folds it, and smears it away. Order is constantly fed in and constantly eaten. Picture dropping
sugar cubes into a boiling pan: you can see where each lands for a moment, then it's churned in.

The equation on screen is the original, plus ε (epsilon, a small amount: the **Drive** slider) times
"alive here?", which is 1 or 0.

**Where the data comes from:** no data. The flame starts as faint random ripples, and 22% of the Life
squares start alive, chosen [at random](../randomness.md).

**How it's built:** everything from the original sketch, plus:
- A 96 × 96 Life board, stepped in JavaScript on its own clock.
- A second [DataTexture](../textures.md) carrying the Life board to the [shader](../shaders.md), which
  paints living squares in cyan over the flame.

**A tour of the file:**

The one changed line in the equation, inside `step()`:

```js
const dh = -lap[idx] - lap2[idx] - 0.5 * gradSq + drive * LIFE[idx];
```

The original three pushes, plus `drive` times the Life square (1 if alive, 0 if dead). Dead squares add
nothing; live ones add a constant upward push.

Two clocks, in `update`:

```js
state.genTimer += ctx.delta;
const genInterval = 1 / ctx.params.genRate;
while (state.genTimer >= genInterval) {
  state.genTimer -= genInterval;
  stepLife();
}
```

- Lines 1–2: save up time; a new Life generation is due every 1 ÷ **Gen rate** seconds (a quarter of a
  second by default).
- Lines 3–6: spend the saved time one generation at a time, like a piggy bank. Then, separately, the
  flame takes its own **Speed** steps every frame. So Life ticks 4 times a second while the flame updates
  every frame.

The cyan, in the shader:

```glsl
color = mix(color, vec3(0.55, 0.98, 0.9), life * 0.75);
```

Blend three-quarters of the way to mint wherever Life is alive.

**Numbers worth knowing:**
- **4 generations a second** by default (**Gen rate**, 1 to 15).
- **0.35**: the default **Drive**, how hard live squares push.
- **About 650 live squares** after a minute, out of 9,216, and still a couple of hundred changing every
  generation after 5 minutes, measured. The board never resets, so after many minutes only a few
  blinkers and blobs keep feeding the flame.
- The original sketch's safety limit is here too, and so is its known problem: see
  [the original's page](kuramotoSivashinsky.md).

**Try this (funky):** set **Drive** to 0. The cyan Life squares keep crawling on top, but they no longer
touch the flame: it's the plain sketch with a ghost layer drawn over it. Now drag **Drive** to its
maximum, 1.2, and **Gen rate** to 15: the Life board stampedes, and the flame boils up wherever it goes.

**Words on this page:** [Kuramoto–Sivashinsky equation](../glossary.md), [cellular automaton](../glossary.md),
[glider](../glossary.md), [DataTexture](../glossary.md), [lerp / mix](../glossary.md)
