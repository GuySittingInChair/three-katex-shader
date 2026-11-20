---
summary: Randomly wandering squares stick together into a branching, frost-like cluster.
added: 2026-11-18
---

# Diffusion-Limited Aggregation: in plain English

File: `src/sketches/diffusionLimitedAggregation.js` · Mode: shader · Category: Growth

**What you see:** a dark screen with one coloured square in the middle. More squares stick to it, one at a
time, and it grows a spindly, branching cluster in rainbow colours, like frost creeping across a window. After
about a minute and a half the cluster fills its patch of the grid, holds still for 4 seconds so you can admire
it, then vanishes and starts again from one square.

**The idea behind it:** picture a crowd of drunk people stumbling randomly around a dark room. In the middle
stands one person who is covered in glue. Anyone who bumps into the glue person gets stuck to them, and then
*they're* sticky too. Over time, the stuck crowd grows arms reaching outward, because someone stumbling in
from outside almost always bumps into an arm tip before they can wander deep into the gaps between arms.

That's *diffusion-limited aggregation*: particles wander at random (*diffusion*) and stick on contact
(*aggregation*). The arm tips win, so the shape branches. The same rule draws lightning bolts, frost on a
window, coral, mineral "ferns" on rocks, and the branching cracks of an electrical discharge in plastic.

The equation on screen is the whole rule in words: if you're next to the cluster, you stick; otherwise, take a
random step.

**Where the data comes from:** no data. [Random numbers](../randomness.md) decide every step.

**How it's built:**
- The cluster lives in JavaScript, on a 72 × 72 grid.
- Each frame, the grid is copied into a small picture, a [DataTexture](../textures.md).
- It runs 30 steps a second for each unit of the "speed" slider: 240 a second at the default 8.
- A [fragment shader](../shaders.md) colours it.
- The walkers themselves are never drawn, only the stuck squares. So you can't see the crowd stumbling, only
  its results.

**A tour of the file:**

Walkers start on a ring near the edge:

```js
const angle = Math.random() * Math.PI * 2;
const radius = SIZE * 0.42;
const x = Math.round(CENTER + Math.cos(angle) * radius);
```

`Math.random() * Math.PI * 2` is a random angle, anywhere round a full turn (2π). `cos` and `sin` turn an
angle into a spot on a circle (see [sine and cosine](../sine-and-cosine.md)); `Math.round` snaps it to the
nearest square. So: a random direction, 42% of the grid's width from the centre, about 30 squares out.

Each step, each walker staggers one square in a random direction:

```js
const dir = Math.floor(Math.random() * 4);
...
if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue; // wandered off, discard
if (isAdjacentToCluster(x, y) && !occupied[y * SIZE + x]) {
```

- `dir` is 0, 1, 2 or 3: right, left, down or up. (`...` marks lines left out.)
- `||` means "or": past the left, right, bottom or top edge. `continue` means "skip to the next walker", and
  `//` starts a note for human readers.
- Stagger off the edge and you're gone. The edge is only about 6 squares behind the starting ring, but the
  cluster is 30 squares away, so most walkers fall off long before they find it. That's why the sketch needs
  so many steps: until 2026-11-18 it ran only 8 a second, and grew about 50 squares in 10 minutes.
- `&&` means "and", `!` "not": next to the cluster and not already taken? Then you stick, and your stick-time
  is recorded as your `age`.

The colour mixes how long ago each square stuck with how far it is from the centre:

```glsl
float hue = fract(ageNorm * 0.6 + radiusHue + uTime * 0.01);
```

Rings of colour spread outward, and the whole palette slowly drifts.

**Numbers worth knowing:**
- **72 × 72 = 5,184** squares in the grid. Growth stops at 55% full, about 2,850 squares.
- **40**: the most walkers allowed at once.
- **240 steps a second** at default speed (30 to 600 on the slider).
- **A few hundred squares after one minute** (230 to 580 in five test runs of the sketch's own rules), then
  growth speeds up sharply, because a bigger cluster catches more walkers: full at 73 to 87 seconds.

**Try this (funky):** drag **speed** to its maximum, 20. Now it's 600 steps a second, and the tree shoots out
its branches in well under a minute. Then drag it to 1 to watch single squares arrive one by one.

**Words on this page:** [diffusion](../glossary.md#diffusion), [aggregation](../glossary.md#aggregation),
[random walk](../glossary.md#random-walk), [DataTexture](../glossary.md#datatexture),
[shader](../glossary.md#shader)
