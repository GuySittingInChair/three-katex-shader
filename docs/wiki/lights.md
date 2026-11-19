# Drawing in 3D 4: lights

**In one sentence:** lights make solid objects look solid, with bright sides facing the light and darker
sides facing away.

**Picture it:** a ball on a table at night. With only a dim glow in the room, it looks like a flat disc.
Shine a torch from the side and suddenly it is clearly round: one side bright, the other in shadow. Lights
in a scene work the same way.

**Why sketches need it:** shading is how your eye reads a shape. Without light, a sphere and a circle look
the same. 13 sketches add lights. Many others skip them and use materials that colour themselves, or
shaders that do their own shading.

**Where you'll see it:** `audioReactiveMesh.js`, `displacedIcosphere.js`, `doublePendulum.js`,
`pendulumWave.js`, `fireflySync.js`, `particleSwarmOptimization.js` and others. The realistic scenes in
`src/lib/environment.js` set up their own lighting.

## The common kinds

- **Directional light:** like the Sun. Parallel rays all coming from one direction, the same strength
  everywhere.
- **Ambient light:** a soft, even glow from all directions, like light bouncing off the walls of a room.
  It stops shadowed sides from going completely black.
- **Point light:** like a bare bulb, shining in every direction from one spot.
- **Spot light:** like a torch, a cone of light.
- **Hemisphere light:** sky colour from above and ground colour from below, like the outdoors.

**What it looks like in the code:** from the `setup` of `src/sketches/audioReactiveMesh.js`:

```js
const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(2, 3, 4);
ctx.scene.add(light);
const ambient = new THREE.AmbientLight(0x404050, 1.2);
ctx.scene.add(ambient);
```

- `THREE` is three.js, the 3D toolbox the site uses; `new THREE.DirectionalLight(…)` means "make a new
  sun-style light from the toolbox".
- Line 1 makes a "sun". `0xffffff` is white (see [RGB, three numbers](rgb.md) for colour codes), and `2.0` is its
  strength.
- Line 2 places it at across 2, up 3, towards you 4: up and to the right, in front. Its rays come from there towards the centre.
- Line 3 adds it to the scene (`ctx` is the bag of useful things the app hands every sketch, including
  the scene). A light that isn't added does nothing.
- Line 4 makes a dim, slightly blue (`0x404050`) glow everywhere, at strength 1.2.
- Line 5 adds that too.

A *material* is a shape's paint. The lights only affect paints that react to light, such as
`MeshStandardMaterial` (shiny or matt, shaded like a real object). A `MeshBasicMaterial` is flat paint
that glows its own colour evenly and ignores lights. See [Mesh, geometry and material](mesh-geometry-material.md).

These lights are removed again in the sketch's `dispose`, so they don't leak into the next sketch.

**Try this:** in `audioReactiveMesh.js`, change `light.position.set(2, 3, 4)` to `(-4, 0, 0)`. The light
now comes from the far left, so the ball's left side is bright and its right side falls into shadow, like a
half moon.

**Related:** [Mesh, geometry and material](mesh-geometry-material.md) · [The scene and the camera](scene-and-camera.md)
· [RGB, three numbers](rgb.md)
