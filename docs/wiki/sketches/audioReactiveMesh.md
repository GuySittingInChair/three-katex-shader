# Audio-Reactive Mesh: in plain English

File: `src/sketches/audioReactiveMesh.js` · Mode: 3d · Category: Visualization

**What you see:** a lit, coloured ball, slowly spinning. Its surface bulges outward in ridges that run
from pole to pole, like the segments of an orange. With no sound the ridges ripple by themselves. With
music or the microphone on, each ridge pushes out with the loudness of one pitch, so the ball becomes a 3D
picture of the sound, wrapped round a sphere.

**The idea behind it:** a *spectrum* shows how loud each pitch in a sound is, from the deepest bass to
the highest hiss, like the bouncing bars on an old stereo. Here the bars are wrapped round the ball. Going
round the ball's middle, you walk from low pitches to high ones, and each slice pushes outward by its
loudness.

The equation says: each corner of the ball (𝐩ᵢ) sits along its own direction from the centre (𝐝̂ᵢ), at
distance 1 plus the slider `s` times the loudness of its slice (X).

**Where the data comes from:** live sound, split into 64 pitch slices by `src/core/audioEngine.js`. With no
sound, the sketch invents gentle waves.

**How it's built:**
- A [mesh](../mesh-geometry-material.md): a ball made of triangles, with a lit, realistic
  material.
- Two [lights](../lights.md).
- The corners are moved in JavaScript on every frame.
- The colour per corner comes from the [cosine palette](../cosine-palette.md).

**A tour of the file:**

`setup` builds the ball and remembers where each corner points:

```js
const geometry = new THREE.IcosahedronGeometry(1, 3);
...
const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();
```

- Line 1: a ball of radius 1, made of 320 small triangles.
- Line 2 runs for each corner (`...` marks lines left out). `posAttr` is the list of every corner's
  position, and `getX(i)` reads corner `i`'s across position. `new THREE.Vector3(…)` makes an arrow from
  the three numbers. It takes this position and *normalises* it: shrinks or stretches it to
  length 1. What's left is pure direction. The sketch stores these so it can push each corner straight out
  later.

`update` does three things for every corner:

```js
const angle = Math.atan2(dz, dx);
const normalized = angle / TWO_PI + 0.5;
let bin = Math.floor(normalized * 64);
```

- `dx`, `dy`, `dz` are the corner's stored direction: across, up, depth.
- Line 1: which way round the ball's middle the corner points, as an angle (`atan2` turns an across and
  a depth into a direction).
- Line 2 turns that angle into a number from 0 to 1 (`TWO_PI` is one full turn, 6.28).
- Line 3 turns it into a slice number from 0 to 63 (`Math.floor` rounds down to a whole number). The
  sound is split into 64 slices of pitch, low to high, so each slice of the ball dances to one.

```js
const scale = 1 + value * ctx.params.displacement;
posAttr.setXYZ(i, dx * scale, dy * scale, dz * scale);
paletteColor(0.55 + value * 0.5, colorTmp);
```

- Line 1: how far out to push, depending on the slice's loudness (`value`) and the slider.
- Line 2 moves the corner out along its direction.
- Line 3 picks its colour with the [cosine palette](../cosine-palette.md) (`paletteColor` writes the
  answer into `colorTmp`): quiet spots are a blue-green, and loud spots shift round the rainbow.

Then `geometry.computeVertexNormals()` re-works out which way the surface faces, so the lights shade the
new bumps correctly. The ball also turns a little on every frame, by the "spin" slider.

**Numbers worth knowing:**
- **960**: corners on the ball, each moved 60 times a second. That is three per triangle: neighbouring
  triangles keep their own copy of a shared corner, so each copy is moved separately.
- **64**: pitch slices. The ridges are wedges round the middle, each about 5.6 degrees wide, roughly the
  angle between two minute marks on a clock face.
- **0.6**: the default push. A full-volume slice pushes 60% further out than the ball's radius.

**Words on this page:** [mesh](../glossary.md), [vertex](../glossary.md), [normal](../glossary.md),
[spectrum](../glossary.md), [light](../glossary.md)
