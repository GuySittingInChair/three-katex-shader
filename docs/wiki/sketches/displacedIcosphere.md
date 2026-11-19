# Displaced Icosphere: in plain English

File: `src/sketches/displacedIcosphere.js` · Mode: 3d · Category: Meshes

**What you see:** a little low-poly planet slowly spinning in space, all flat triangular facets like a
cut gem. Deep blue oceans in the low parts, green lowlands, brown hills, and white snowy peaks on the
highest points. You can drag it around.

**The idea behind it:** start with a smooth ball. For every corner on its surface, ask a
[noise](../noise.md) recipe "how high is the ground here?" and push the corner out (mountain) or in
(ocean) by that much. Then paint each corner by its height, like the colours on a relief map.

The equation on screen says: each corner's new position 𝐩 is its direction from the centre (𝐧̂), times 1
plus the strength `s` times the height `h` at that spot. "Layered sin/cos noise" is how `h` is made.

**Where the data comes from:** no data. The terrain is made up by the noise recipe.

**How it's built:**
- A [mesh](../mesh-geometry-material.md): a ball of triangles with a matte material and `flatShading`,
  so each triangle is lit as one flat face. That's the cut-gem look.
- Two [lights](../lights.md), a sun and a soft blue-grey fill.
- Home-made noise in JavaScript (see [Noise: randomness that looks natural](../noise.md)).
- Height colours blended with `lerp` (see [Blending, adding, dimming and gain](../colour-blending-and-gain.md)).

**A tour of the file:**

The noise: four layers of waves, each twice as detailed and half as strong.

```js
for (let o = 0; o < 4; o++) {
  value += amp * Math.sin(nx * freq * 3.1 + ny * freq * 1.7) * Math.cos(nz * freq * 2.3 - nx * freq * 0.9);
  freq *= 2.0;
  amp *= 0.5;
}
```

`for (let o = 0; o < 4; o++)` repeats four times. `nx`, `ny`, `nz` are a direction from the planet's
centre; `*=` means "multiply by". This is a cheap stand-in for proper noise: wavy patterns multiplied together, stacked in layers like
[fbm](../noise.md). The odd numbers (3.1, 1.7, 2.3, 0.9) keep the waves from lining up into an obvious
grid.

Pushing the surface:

```js
v.fromBufferAttribute(pos, i).normalize();
const height = fbmDir(v.x, v.y, v.z);
const scale = 1 + height * strength;
pos.setXYZ(i, v.x * scale, v.y * scale, v.z * scale);
```

- `pos` is the list of every corner of the ball's surface. `v.fromBufferAttribute(pos, i)` reads corner
  `i`; `.normalize()` keeps only its direction from the centre (length 1).
- Ask the noise for the height there, between about −0.94 and +0.94.
- Turn that into a distance from the centre: 1, plus or minus up to a quarter.
- Move the corner there.

Painting by height:

```js
if (t < 0.35) color = deepColor.clone().lerp(midColor, t / 0.35);
else if (t < 0.65) color = midColor.clone().lerp(highColor, (t - 0.35) / 0.3);
else color = highColor.clone().lerp(peakColor, (t - 0.65) / 0.35);
```

`t` is the height, from 0 (lowest) to 1 (highest). `.lerp(a, x)` blends towards colour `a` by `x`, and
`.clone()` makes a copy first so the original colour isn't changed. This is a little
[colour scale](../colour-scales.md): navy → green → brown → white, as `t` goes from lowest
to highest ground.

**Fixed on 2026-11-19:** the **Displacement** slider used to do nothing until you left the sketch and
came back, because the planet is built once, in `setup`. It now has `rebuild: true` (see
[Params: the sliders](../params.md)): let go of the slider and the planet is rebuilt with taller or
flatter mountains.

**Numbers worth knowing:**
- **500 triangles** (detail level 4), which is what keeps it gem-like.
- **0.25**: default mountain strength. The tallest peaks stand about 23% above "sea level", and the deepest
  trenches sit 23% below. On a real Earth that would make mountains around 1,500 km tall.
- **About 42 seconds** per full turn at the default spin of 0.15 radians a second.

**Try this (funky):** change `IcosahedronGeometry(1, 4)` to `(1, 1)`. Now there are only 80 big triangles,
and the planet becomes a chunky, crumpled paper ball with patches of colour. Or try `(1, 12)`: about 3,400 triangles, and a
much more detailed world with proper wiggly coastlines.

**Words on this page:** [mesh](../glossary.md), [noise](../glossary.md), [fbm](../glossary.md),
[normalise](../glossary.md), [flat shading](../glossary.md), [light](../glossary.md)
