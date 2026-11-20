---
summary: A 3D object is a shape (geometry) plus a skin (material), put together as a mesh.
added: 2026-11-18
---

# Drawing in 3D 2: mesh, geometry and material

**In one sentence:** a *mesh* is a visible object, made of a *geometry* (its shape) and a *material* (how its
surface looks).

**Picture it:** a papier-mâché mask. Underneath is a frame of wire bent into triangles: that is the geometry.
Over it goes paint, gloss or glitter: that is the material. Put them together and you have the finished mask:
the mesh.

**Why sketches need it:** every solid object in a 3D sketch is a mesh. The geometry decides where its corners
are. The material decides its colour and how it reacts to light.

**Where you'll see it:** every `3d` sketch with a solid surface.

## Geometry: the shape, made of triangles

Computers draw every surface as lots of small flat triangles. With enough of them, curves look smooth. The
corners of the triangles are called *vertices* (one is a *vertex*).

From `src/sketches/audioReactiveMesh.js`:

```js
const geometry = new THREE.IcosahedronGeometry(1, 3);
const posAttr = geometry.attributes.position;
const count = posAttr.count;
```

- Line 1 builds a ball 1 unit in radius out of triangles: 320 of them. The `3` says how finely to split the 20
  triangles of the starting shape (an icosahedron, a 20-sided dice). Higher numbers make it rounder but
  slower.
- Line 2 gets the list of every corner's position. An *attribute* is a list holding one value per corner.
- Line 3 counts the corners: 960. That is three per triangle, because this shape stores each triangle's
  corners separately. Where five or six triangles
meet at one point, that point is stored five or six times, so moving one copy without the others would tear
the surface open. The sketch avoids that by working out each corner's new place from its direction alone, so
all copies of a point move together.

Three.js has ready-made shapes: `PlaneGeometry` (a flat rectangle), `ConeGeometry` (the birds in Boids Flock),
`IcosahedronGeometry` (a ball) and more. Sketches can also build their own shape point by point, with
`BufferGeometry` (33 sketches).

## Material: the surface

```js
const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.4,
  metalness: 0.1,
});
const mesh = new THREE.Mesh(geometry, material);
```

- `MeshStandardMaterial` is a realistic paint that reacts to lights. It needs [lights](lights.md), or it looks
  black.
- `vertexColors: true` means each corner carries its own colour, and the colours blend across each triangle.
- `roughness: 0.4` is between glossy (0) and matte (1).
- `metalness: 0.1` is almost not metallic.
- `new THREE.Mesh(geometry, material)` joins shape and paint into one object.

Other common materials: `MeshBasicMaterial` (flat colour, ignores light) and `ShaderMaterial` (a custom paint
written as a shader, see [Shaders: two questions](shaders.md)).

## Changing the shape every frame

The same sketch moves every corner on every frame:

```js
posAttr.setXYZ(i, dx * scale, dy * scale, dz * scale);
...
posAttr.needsUpdate = true;
...
geometry.computeVertexNormals();
```

- `posAttr` is the shape's list of corner positions (its position *attribute*, from earlier). `setXYZ(i, …)`
  gives corner `i` a new across, up and depth: here pushed outward, more when the music is louder at that
  spot. (`...` marks lines left out.)
- `needsUpdate = true` tells three.js the corners have changed, so it sends them to the graphics chip again.
- `computeVertexNormals()` recomputes which way each bit of surface faces (its *normals*). Light needs those
  directions to shade the surface correctly.

## Shapes worked out entirely on the graphics chip

Five sketches (Boy's Surface, Möbius Strip, Klein Bottle, Helicoid–Catenoid, NURBS Weight Patch) use
`src/lib/morphSurface.js`. They start with a flat grid of corners, and a shader moves each corner to its place
on a surface, on every frame. This is far faster than moving corners in JavaScript, so the surface can change
shape smoothly.

**Try this:** in `audioReactiveMesh.js`, change `IcosahedronGeometry(1, 3)` to `(1, 1)`. The ball turns into a
rough, gem-like shape with big flat faces, because it now has 80 triangles instead of 320.

**Related:** [The scene and the camera](scene-and-camera.md) · [Lights](lights.md) · [Shaders: two
questions](shaders.md) · [Many copies of one shape (instancing)](instancing.md)
