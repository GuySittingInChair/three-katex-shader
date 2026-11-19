# Drawing in 3D 5: how the camera moves

**In one sentence:** the camera either moves by itself, because the sketch moves it in `update`, or you
move it, by dragging with *orbit controls*.

**Picture it:** orbit controls are like holding a globe on a stand. You can't walk away from it, but you
can turn it any way you like, and lean in or out. The camera always keeps looking at the same centre.

**Why sketches need it:** a 3D shape is hard to understand from one direction. Turning it around shows
its depth. Some sketches tell a story instead, and move the camera themselves to show you the right
thing at the right moment.

**Where you'll see it:** 60 sketches have `controls: 'orbit'`. Data sketches like The Oldest Light
(`cmbPlanck.js`) fly the camera on a script.

## Orbit controls

A sketch switches them on with one field:

```js
controls: 'orbit',
```

Then the app does the rest, in `src/core/SketchRunner.js`:

```js
this.ctx.controls = new OrbitControls(this.ctx.camera, this.domElement);
if (!window.matchMedia('(pointer: coarse)').matches) this.ctx.controls.enableZoom = false;
this.ctx.controls.enableDamping = true;
```

- Line 1 attaches drag-to-turn to the camera.
- Line 2: on a computer with a mouse, the scroll wheel flips to the next sketch, so the wheel's zoom is
  switched off. Holding **Ctrl** while scrolling zooms instead. On a phone, pinching zooms.
- Line 3 turns on *damping*: when you let go, the view glides to a stop instead of halting dead, like a
  spun globe slowing down.

A sketch with `wheelZoom: true` keeps the wheel for zooming.

**How to use them:** drag to turn. Ctrl + scroll to zoom. Right-drag (or two-finger drag) slides the view
sideways.

## Moving the camera from the sketch

A sketch can set the camera's position on every frame, in `update`. In the opening phase of The Oldest
Light (`src/sketches/cmbPlanck.js`), you stand at the centre of the sky and slowly look around:

```js
const a = 0.25 + ctx.time * 0.06;
cam.position.set(0, 0, 0);
look.set(-Math.sin(a), 0.15 * Math.sin(ctx.time * 0.11), -Math.cos(a));
cam.lookAt(look);
```

- `a` is an angle that grows slowly with time, 0.06 radians a second, so a full turn takes about 105
  seconds.
- Line 2 keeps the camera exactly at the centre of the sky sphere.
- Line 3 picks a point to look at. `-Math.sin(a)` and `-Math.cos(a)` together walk that point around a
  circle (see [sine and cosine](sine-and-cosine.md)), so your gaze sweeps across the sky. The middle
  number nods your gaze gently up and down.
- `cam.lookAt(look)` turns the camera to face that point.

Later phases of the same sketch back the camera out, so the sky sphere can be seen unrolling into a flat
map.

## Where the camera starts

Most `setup` functions place the camera first. In `src/sketches/boysSurface.js`:

```js
ctx.camera.position.set(0, 2.2, 3.1);
```

This puts it above and in front, so you look down at the surface at an angle. You can still drag away from
there.

**Try this:** in `boysSurface.js`, change `(0, 2.2, 3.1)` to `(0, 0, 6)`. The surface starts out seen
straight from the front and about half as big, because the camera is roughly twice as far away.

**Related:** [scene-and-camera.md](scene-and-camera.md) · [sketch-format.md](sketch-format.md)
