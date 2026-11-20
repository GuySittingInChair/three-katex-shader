---
summary: Draws thousands of copies of one shape in a single go, each with its own position.
added: 2026-11-18
---

# Drawing in 3D 6: many copies of one shape (instancing)

**In one sentence:** *instancing* draws hundreds of copies of one shape in a single go, each copy with its own
position, turn and colour.

**Picture it:** a rubber stamp. You carve the stamp once, then press it all over the page, wherever you like,
in different inks. Carving is slow, and stamping is fast.

**Why sketches need it:** drawing 120 birds as 120 separate objects means 120 separate trips to the graphics
chip, on every frame. Drawing one shape 120 times in one trip is much faster.

**Where you'll see it:** 12 sketches, including `boidsFlock.js`, `galtonBoard.js`, `nBodyGravity.js`,
`forceDirectedGraph.js`, `flyConnectome.js`, `particleSwarmOptimization.js`, `sunflowerPhyllotaxis.js` and
`rabbitsVsFoxes.js`.

**What it looks like in the code:** from `src/sketches/boidsFlock.js`. First, in `setup`, the stamp:

```js
const geometry = new THREE.ConeGeometry(0.05, 0.17, 6);
...
const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
```

- Line 1 carves the stamp: a small cone 0.1 units across (0.05 from centre to edge) and 0.17 tall, with 6
  sides. Its tip points up, so it can point the way a bird flies.
- Line 2 makes an *instanced mesh* (one shape that is drawn many times) that will draw that cone `COUNT`
  times. `COUNT` is set to 120 at the top of the file. `material` is the paint (see [Mesh, geometry and
  material](mesh-geometry-material.md)); `...` marks lines left out.

Then, on every frame in `update`, each copy is placed:

```js
dummy.position.copy(b.pos);
...
dummy.quaternion.setFromUnitVectors(UP, dir);
dummy.updateMatrix();
mesh.setMatrixAt(i, dummy.matrix);
```

- `dummy` is an invisible helper object, used like a ruler. Line 1 moves it to bird `b`'s position (`b.pos`).
- Line 2 turns it so its "up" (`UP`, set at the top of the file to straight up) points the way the bird is
  flying (`dir`, the bird's velocity shrunk to length 1, so pure direction). A *quaternion* is the way 3D
  programs store a turn. You only need to know it means "which way something faces".
- Line 3 squashes position, turn and size into one block of 16 numbers (a 4 × 4 grid), called a *matrix*. It's
  the standard way a graphics chip is told "put this here, turned like this".
- Line 4 gives copy number `i` that block. The stamp is pressed there.

After all 120:

```js
mesh.instanceMatrix.needsUpdate = true;
```

`instanceMatrix` is the list of every copy's block. Setting `needsUpdate` to `true` tells three.js "the copies
have moved, send them to the graphics chip again". Without it, the birds would freeze.

## Colour per copy

Each bird's colour depends on its speed. Slow birds are sky blue, and fast ones shift towards lime green:

```js
color.setHSL(0.6 - speed * 0.35, 0.75, 0.55).toArray(instanceColor.array, i * 3);
```

`setHSL` picks a colour by hue (position around the colour wheel), saturation (how vivid) and lightness. Hue
0.6 is a sky blue, and lower values move towards green. `.toArray(instanceColor.array, i * 3)` writes the
colour's three numbers into the list of all birds' colours, starting at place `i * 3`, because each bird takes
three places (red, green, blue). See [RGB, three numbers](rgb.md).

**Try this:** in `boidsFlock.js`, change `ConeGeometry(0.05, 0.17, 6)` to `(0.1, 0.4, 6)`. Every bird becomes
twice as wide and more than twice as long, because all 120 are stamped from the same cone.

**Related:** [Mesh, geometry and material](mesh-geometry-material.md) · [Shaders: two questions](shaders.md) ·
[Lines and points](lines-and-points.md)
