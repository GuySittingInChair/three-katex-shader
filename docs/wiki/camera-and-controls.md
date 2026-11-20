---
summary: Where the camera sits and points, and how dragging and scrolling move it.
added: 2026-11-18
---

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
...
if (!window.matchMedia('(pointer: coarse)').matches) this.ctx.controls.enableZoom = false;
this.ctx.controls.enableDamping = true;
```

- `this.ctx.camera` is the sketch's camera, and `this.domElement` the area of the page you drag on.
  (`this` means "the sketch runner we're inside".)
- Line 1: `OrbitControls` is a ready-made tool from three.js, the 3D library the site uses. Handing it
  the camera and the drag area hooks your mouse or finger up to the camera.
- Line 2: `(pointer: coarse)` is how a web page asks "is this a touch screen?". `!` means "not", so
  on a computer with a mouse, the scroll wheel flips to the next sketch, so the wheel's zoom is
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

- `cam` is the camera and `look` a point in space it will look at. `.set(…)` gives a position as three
  numbers: across, up, and towards you.
- `ctx.time` is seconds since the sketch started. `a` is an angle that grows slowly with time, 0.06 radians a second, so a full turn takes about 105
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

The three numbers are across (0: centred), up (2.2) and towards you (3.1), measured from the middle of
the scene, where the surface sits. So the camera is above and in front, looking down at the surface at an
angle. You can still drag away from
there.

**Try this:** in `boysSurface.js`, change `(0, 2.2, 3.1)` to `(0, 0, 6)`. The surface starts out seen
straight from the front, and about two-thirds as big. The camera used to be about 3.8 units from the
middle (worked out from 2.2 up and 3.1 back); now it's 6. Things look smaller in proportion to distance,
like a car down the road, and 3.8 ÷ 6 is about ⅔.

**Related:** [The scene and the camera](scene-and-camera.md) · [The sketch format: every field](sketch-format.md)
