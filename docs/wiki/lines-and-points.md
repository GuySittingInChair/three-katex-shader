---
summary: Thin strokes and dots instead of solid surfaces: trails, threads, stars.
---

# Drawing in 3D 3: lines and points

**In one sentence:** besides solid surfaces, a 3D sketch can draw lines (for curves, graphs and
construction lines) and clouds of points (for stars, sparks and particles).

**Picture it:** lines are string pinned between nails. Points are glitter scattered in the air: each speck
has a position and a colour, but no shape of its own.

**Why sketches need it:** a lot of math is lines, like curves, axes and the steps of a construction. A lot
of science is points, like stars, galaxies and data. 41 sketches use the project's line helper and 20 use
point clouds.

## Lines that stay the same width: `src/lib/fatLines.js`

Ordinary 3D lines are always 1 pixel (one tiny dot of the screen) thin on most screens. The project's
helper, `createFatLines` in the shared file `src/lib/fatLines.js`, draws lines with a chosen width in
pixels, which stays the same however far away they are (instead of shrinking with distance, like a
real rope would).

From `src/sketches/bezierDeCasteljau.js`:

```js
const curve = createFatLines({ maxSegments: CURVE_SAMPLES, width: ctx.params.width });
...
curve.reset();
curve.push(prev, next, tmp.clone());
curve.commit();
```

- Line 1 (in `setup`) makes room for up to 128 short pieces of line (`CURVE_SAMPLES` is 128), each as
  wide as the "width" slider.
- `curve.reset()` (in `update`) wipes last frame's line.
- `curve.push(prev, next, colour)` adds one short piece from point `prev` (the previous point on the
  curve) to point `next`, in a colour (`tmp.clone()` is a copy of the colour worked out for this piece).
  128 short pieces in a row look like one smooth curve.
- `curve.commit()` sends the finished line to the graphics chip.

Wiping and redrawing on every frame is normal. That is how the curve can twist as you watch.

## Clouds of points: `THREE.Points`

From `src/sketches/particleFountain.js`:

```js
const material = new THREE.PointsMaterial({
  size: 0.06,
  vertexColors: true,
  blending: THREE.AdditiveBlending,
  ...
});
const points = new THREE.Points(geometry, material);
```

- `size: 0.06` makes each point 0.06 units across in the scene.
- `vertexColors: true`: each point has its own colour.
- `AdditiveBlending`: where points overlap, their light adds up and gets brighter, like overlapping
  torch beams. This makes sparks and stars glow. See
  [Blending, adding, dimming and gain](colour-blending-and-gain.md).
- `new THREE.Points(geometry, material)` makes the cloud from a shape (`geometry`) and a paint
  (`material`, the settings above). For points, the geometry is only a list of positions, one per point.
  `...` marks lines left out.

## Dots that are always round: `createDots`

`fatLines.js` also has `createDots`, used for the control points in De Casteljau Bézier. They are small
discs that always face the camera:

```js
dots.push(level[i], k === 0 ? color.clone().multiplyScalar(1.7) : color, k === DEGREE ? 0.09 : k === 0 ? 0.07 : 0.05);
```

`level` is the list of points in the current round of the construction, and `level[i]` point number
`i` of it. This puts one dot there. `k` counts the rounds of the construction: the first round's dots (`k === 0`,
the control points) are drawn 1.7 times brighter and 0.07 units across, the final dot (`k === DEGREE`,
the point on the curve) is the biggest at 0.09, and the in-between dots are 0.05.

**Try this:** in `bezierDeCasteljau.js`, the "width" slider sets the line width directly. In the code, change
`width: { value: 3, ...}` to `value: 8`. The curve opens with lines nearly three times as thick.

**Related:** [Mesh, geometry and material](mesh-geometry-material.md) · [Many copies of one shape (instancing)](instancing.md) ·
[Blending, adding, dimming and gain](colour-blending-and-gain.md)
