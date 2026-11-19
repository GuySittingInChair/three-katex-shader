# The frame loop: setup, update, dispose

**In one sentence:** a sketch builds its scene once (`setup`), changes it a little on every frame
(`update`), and tidies up when you leave (`dispose`).

**Picture it:** a puppet show. Before the curtain goes up, you set out the stage, the puppets and the
lights. That is `setup`. During the show, you move the puppets a little at a time, over and over. That
is `update`, and it happens about 60 times every second. When the show ends, you pack everything away so
the next show has a clear stage. That is `dispose`.

**Why sketches need it:** building objects is slow, and moving them is quick. So a sketch builds
everything once and then only nudges it. If a sketch rebuilt its whole world on every frame, the
animation would stutter.

**Where you'll see it:** almost every sketch. 102 have a `setup`, all 166 have an `update`, and 96 have
a `dispose`. Flat `shader` sketches often skip `setup`, because the app builds their screen-filling
picture for them.

**What it looks like in the code:** from `src/sketches/audioReactiveMesh.js`, a ball that bulges with
music.

```js
setup(ctx) {
  ctx.camera.position.set(0, 0, 3.2);
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  ...
  return { mesh, geometry, material, ... };
},
```

- `setup(ctx) {` is the start of the "build once" step. `ctx` (short for *context*) is a bag of useful
  things the app hands over: the camera, the scene, the slider values, the time.
- `ctx.camera.position.set(0, 0, 3.2);` moves the camera 3.2 units back from the centre, so the ball fits
  on screen.
- `new THREE.IcosahedronGeometry(1, 3)` builds the ball's shape: a sphere made of small triangles.
- `return { mesh, geometry, ... }` hands back the things it built. The app keeps them and passes them to
  `update` as `state`, so `update` can find them again.

```js
update(ctx, state) {
  ...
  state.mesh.rotation.y += ctx.delta * ctx.params.spin;
},
```

- `update(ctx, state)` runs on every frame. It gets the same `ctx`, plus `state`, the things `setup`
  returned.
- `ctx.delta` is how many seconds passed since the last frame, about 0.017 (one sixtieth of a second).
- `ctx.params.spin` is the value of the "spin" slider.
- The line turns the ball a little more on every frame: a slice of time multiplied by the spin speed.

```js
dispose(ctx, state) {
  state.geometry.dispose();
  state.material.dispose();
```

- These lines release the memory the shape and its paint used on the graphics chip. Without them, flipping
  through many sketches would slowly fill the memory.

**The order, every time:** you arrive at a sketch → `setup` once → `update`, frame after frame → you
leave → `dispose` once. The app's code for this is in `src/core/SketchRunner.js`. If a sketch forgets
`dispose`, the runner cleans up the basics anyway.

**Try this:** in `audioReactiveMesh.js`, change `3.2` in `setup` to `6`. The camera starts twice as far
away, so the ball looks about half the size.

**Related:** [What a sketch is](what-is-a-sketch.md) · [The sketch format: every field](sketch-format.md) ·
[Motion and the live equation](motion-and-latex.md)
