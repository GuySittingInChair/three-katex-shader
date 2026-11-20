---
summary: 120 birds forming flocks from three simple rules.
added: 2026-11-18
---

# Boids Flock: in plain English

File: `src/sketches/boidsFlock.js` · Mode: 3d · Category: Emergence

**What you see:** 120 small cones, like arrowheads, darting around inside an invisible box. At first they fly
every which way. Within seconds they gather into groups that swoop and turn together, like starlings or a
school of fish. Slow birds are blue, and fast ones shift towards green. You can drag to look around.

**The idea behind it:** no bird is in charge, and no bird knows the shape of the flock. Each one follows three
rules about its nearby neighbours only:
1. **Separation:** don't crowd. Steer away from neighbours that are too close.
2. **Alignment:** go with the flow. Steer towards the average direction of your neighbours.
3. **Cohesion:** stay together. Steer towards the middle of your neighbours.

From those three local rules, a whole flock appears. Order that arises from simple local rules, with no
leader, is called *emergence*. "Boids" is the name Craig Reynolds gave his simulated birds in 1986.

The equation on screen says: each bird's velocity (𝐯) is nudged by the three steering pushes (𝐒, 𝐀, 𝐂), each
scaled by its slider weight (w). Then the bird moves along its velocity for a small slice of time (Δt).

**Where the data comes from:** no data. The birds start at random positions.

**How it's built:**
- [Instancing](../instancing.md): one cone shape, drawn 120 times.
- A tiny custom [shader](../shaders.md) gives each copy its own colour.
- The flock rules run in JavaScript, in `update`, one step per frame.
- [Orbit controls](../camera-and-controls.md).

**A tour of the file:**

For each bird `bi`, look at every other bird `bj`:

```js
diff.subVectors(bi.pos, bj.pos);
const d2 = diff.lengthSq();
if (d2 < perception2 && d2 > 0.0001) {
  const d = Math.sqrt(d2);
  steerS.addScaledVector(diff, 1 / d);
  steerA.add(bj.vel);
  steerC.add(bj.pos);
  count++;
}
```

These lines work with 3D *arrows* (three numbers: across, up, depth): `pos` is a bird's position, `vel` its
velocity (which way, how fast). `steerS`, `steerA` and `steerC` are running totals for the three rules.
- Line 1: `diff.subVectors(a, b)` sets `diff` to `a` minus `b`: the arrow from the other bird to this one.
- Line 2: its length, squared (squaring avoids a slow square root).
- Line 3: only count birds within 0.5 units (`perception2` is 0.5 squared): the bird's neighbourhood. `&& d2 >
  0.0001` ("and not right on top of it") skips the bird itself.
- Line 5: separation. `addScaledVector(arrow, n)` adds the arrow times `n`. Add a push away from this
  neighbour (the `1 / d` part is explained below).
- Line 6: alignment. Add up the neighbours' velocities.
- Line 7: cohesion. Add up the neighbours' positions.
- Line 8: `count++` adds one to the number of neighbours (for averaging later).

Then the totals are turned into steering, capped so no rule can yank too hard, and added up with the slider
weights:

```js
bi.vel
  .addScaledVector(steerS, ctx.params.separation)
  .addScaledVector(steerA, ctx.params.alignment)
  .addScaledVector(steerC, ctx.params.cohesion);
```

A soft wall pulls birds back if they stray more than 1.5 units from the centre in any direction. Finally the
bird moves:

```js
bi.pos.addScaledVector(bi.vel, dt);
```

`dt` is the length of one time step. That is "position += velocity × time", the second half of the equation.

**Numbers worth knowing:**
- **120**: birds. Each checks the other 119 on every frame: about 14,000 checks, 60 times a second.
- **0.5 units**: how far each bird can "see", about a sixth of the box's width.
- **1.5 units**: the box reaches this far from the centre in every direction.
- **1 / d**: in the separation step, `diff` is already as long as the distance, so dividing by `d` makes every
  neighbour's push the same size, pointing away from it.

**Words on this page:** [emergence](../glossary.md#emergence), [velocity](../glossary.md#velocity),
[vector](../glossary.md#vector), [instancing](../glossary.md#instancing), [simulation
step](../glossary.md#simulation-step)
