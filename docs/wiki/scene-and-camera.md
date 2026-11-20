---
summary: A 3D sketch puts objects in a scene and photographs it with a camera, about 60 times a second.
---

# Drawing in 3D 1: the scene and the camera

**In one sentence:** a 3D sketch puts objects into a *scene* and photographs it with a *camera*, about 60
times a second.

**Picture it:** a model railway on a table, with a phone camera pointed at it. The table and everything on
it is the scene. The phone is the camera. What you see on screen is the phone's photo. Move the phone and
the photo changes, even though the railway hasn't moved.

**Why sketches need it:** the 79 `3d` sketches are little worlds. The computer stores where every object
is in that world, then works out what the camera would see.

**Where you'll see it:** every sketch with `mode: '3d'`. The app makes the scene and camera for you, in
`src/core/SketchRunner.js`, and hands them over as `ctx.scene` and `ctx.camera`.

## Positions: x, y and z

Every point in the scene has three numbers:
- **x**: left (negative) to right (positive).
- **y**: down (negative) to up (positive).
- **z**: away from you (negative) to towards you (positive).

The centre of the world is `(0, 0, 0)`. A *unit* has no fixed size. It is whatever the sketch decides, so
think of it as "one step". Most sketches keep their objects within a few units of the centre.

## The camera

The app's default camera:
- stands at `(0, 0, 3)`, three units in front of the centre, looking at the centre;
- sees a cone 75 degrees tall, a bit narrower than what your eyes take in without turning;
- draws nothing closer than 0.01 units or further than 1000 units.

This is a *perspective* camera: far things look smaller, like in real life. Flat `shader` sketches use a
different, *orthographic* camera with no perspective, which shows a flat square straight on.

**What it looks like in the code:** from the `setup` of `src/sketches/boidsFlock.js`:

```js
ctx.camera.position.set(0, 0.6, 3.6);
...
const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
...
ctx.scene.add(mesh);
```

- Line 1 moves the camera a little up (0.6) and back (3.6). It is looking down slightly at the flock.
- `...` marks lines left out.
- Line 2 makes the birds: `COUNT` copies of one bird shape (`geometry`) with one paint (`material`). See [Many copies of one shape (instancing)](instancing.md).
- Line 3 puts them into the scene. **Anything not added to the scene is never drawn.**

The word `THREE` appears everywhere. It is three.js, the toolbox for 3D drawing that the whole project is
built on. `new THREE.Something(...)` means "make a new Something from the toolbox".

## Moving things

Every object has:
- `.position`: where it is, `(x, y, z)`.
- `.rotation`: how it is turned, in *radians*. A full turn is about 6.28 radians (2π), so a quarter
  turn is about 1.57.
- `.scale`: how big it is. 1 is normal size, and 2 is twice as big.

From `src/sketches/audioReactiveMesh.js`:

```js
state.mesh.rotation.y += ctx.delta * ctx.params.spin;
```

`ctx.delta` is the time since the last frame (about 1/60 of a second), `ctx.params.spin` is the **Spin**
slider, and `+=` means "add to". So this turns the ball around its up-down (`y`) axis, a little more on
every frame. See
[The frame loop: setup, update, dispose](frame-loop.md).

**Try this:** in `boidsFlock.js`, change `ctx.camera.position.set(0, 0.6, 3.6)` to `(0, 4, 0.1)`. The
camera now hangs almost straight above the flock, looking down, so you see it from above, like a map.

**Related:** [Mesh, geometry and material](mesh-geometry-material.md) ·
[How the camera moves](camera-and-controls.md) · [Lights](lights.md)
