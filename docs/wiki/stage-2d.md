---
summary: The 2D stage: a full-screen drawing board for sketches made of dots, lines and grids, shown through a soft glow.
added: 2026-11-20
---

# The 2D stage: drawing flat pictures with a glow

**In one sentence:** the 2D stage (`src/lib/stage2d.js`) gives a sketch a flat drawing board the size of the
screen, where it can draw dots, lines, circles and text with the browser's ordinary drawing tools, and then
shows that board on screen through a soft glow, so bright things shine.

**Picture it:** a sheet of black paper the size of the window. Every frame the sketch wipes it clean, draws
the picture with pens and stamps (a circle here, a line there, some writing), and holds it up in front of a
slightly misty window: anything bright gets a faint halo, and the corners are a little darker.

**Why sketches need it:** many ideas are naturally flat pictures made of simple shapes: a network of dots and
lines, a grid of coloured squares, rays of light bouncing through a prism, a maze. They could be built out of
3D objects, or written as a [shader](shaders.md) that colours every pixel, but both are a lot of work for a
drawing of dots and lines. The browser already has a good set of 2D drawing tools (the *canvas*): `arc` for
circles, `lineTo` for lines, `fillRect` for squares, `fillText` for writing. The stage lets a sketch use them,
then hands the finished picture to the graphics chip as a [texture](textures.md) and shows it full-screen.

It also keeps the drawing out of the way of the equation. On a wide screen the equation sits at the top right,
so the stage offers a clear *area* on the left half; on a phone, held upright, the equation is at the top, so
the area is the lower part of the screen.

**Where you'll see it:** 22 of the sketches added on 2026-11-20, among them [Six Degrees of
Poop](sketches/smallWorld.md), [Slime Mould Rail Planner](sketches/physarumRail.md), [Maxwell's
Demon](sketches/maxwellsDemon.md) and [Pathfinding Race](sketches/pathfindingRace.md).

**What it looks like in the code:** every sketch that uses it follows the same three steps. From
`src/sketches/smallWorld.js`:

```js
const stage = createStage(ctx, { glow: 0.9 });
```

In `setup`: make the stage. `glow` says how strong the halo round bright things is (0 is none).

```js
const { g, w, h } = state.stage.begin(ctx);
```

At the start of every frame: `begin` makes sure the drawing board matches the screen's size and wipes it. `g`
is the set of drawing tools (pens, brushes, text); `w` and `h` are the board's width and height in pixels.

```js
state.stage.end();
```

At the end of every frame: `end` sends the finished drawing to the screen.

In between, the sketch draws with `g`. For example, each person in the small-world network is a circle:

```js
g.arc(x, y, rad * (1 + 0.8 * flash) * (i === 0 ? 1.6 : 1), 0, TAU);
```

That is a circle at (x, y), its radius bigger while it is flashing (and 1.6 times bigger for the person who
starts the rumour), drawn all the way round from angle 0 to a full turn (`TAU`, 2π).

Inside the stage, the glow is a small shader that looks at 24 points around each pixel, keeps only the bright
parts, and adds a little of them back: in `src/lib/stage2d.js`,

```glsl
c += uGlow * g / 12.0 * 1.6;
```

Two more helpers come with it: `rng(seed)`, a [random-number generator](randomness.md) that gives the same
numbers every time for the same seed (so a simulation can be replayed exactly), and `palette(t)`, the [cosine
palette](cosine-palette.md) as a colour the canvas understands.

**Try this:** in `src/sketches/smallWorld.js`, change `createStage(ctx, { glow: 0.9 })` to `createStage(ctx, {
glow: 0 })` and press Run. The network is the same, but the dots and lines lose their soft halo and look flat
and printed.

**Related:** [Shaders](shaders.md), [Textures](textures.md), [Glow](glow.md), [Random numbers, and
seeds](randomness.md), [What is a sketch?](what-is-a-sketch.md)
