---
summary: A picture (or a grid of numbers stored as one) that a shader can look things up in.
added: 2026-11-18
---

# Textures: pictures a shader can look things up in

**In one sentence:** a *texture* is a picture handed to a [shader](shaders.md) (the small program on the
graphics chip that colours each pixel), which can ask "what colour is at this spot?" at any position.

**Picture it:** a printed map and a pin. Put the pin anywhere and read off what's there. The shader puts its
pin at a position (two numbers from 0 to 1, across and up) and gets back a colour. That colour can be a real
colour, or it can be *numbers in disguise*.

**Why sketches need it:** to show photographs (galaxies, sky surveys), to wrap pictures onto shapes, and, very
often, to carry *data*. Red, green and blue are only three numbers per pixel. A sketch can store temperatures,
chemical amounts or anything else in them.

**Where you'll see it:** The Oldest Light, the sky and galaxy sketches (photographs), 15 sketches that build a
`DataTexture` from numbers, 12 that draw on a hidden canvas (`CanvasTexture`), and the 5 GPU simulations in
[Simulating on the graphics chip](render-targets.md).

## Looking something up

From the fragment shader of `src/sketches/cmbPlanck.js` (The Oldest Light):

```glsl
uniform sampler2D uSky;
...
vec3 t = texture2D(uSky, vUv).rgb * 2.0 - 1.0;
vec3 uk = t * uRange;
```

- `uniform sampler2D uSky;`: a texture knob called `uSky`. JavaScript puts the picture `sky.png` in it once it
  has loaded (see [Loading data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md)).
- `texture2D(uSky, vUv)` puts the pin at this pixel's spot `vUv` and reads the picture.
- `.rgb` takes its red, green and blue, each a number from 0 to 1.
- `* 2.0 - 1.0` turns 0…1 into −1…+1, because the map stores how much *hotter or colder than average* each
  spot is, which can go either way, but a picture can only hold 0 to 1. So pure black means "as cold as it
  gets", and pure white "as hot".
- `t * uRange` turns that into real temperature differences, in millionths of a degree.

## A picture that is really data

`public/data/cmb/sky.png` looks like an odd grey-and-colour smear if you open it. That's because it isn't a
photo. Its three colour channels hold three *different* versions of the map of the oldest light in the
universe (see `tools/cmb/build_cmb.py`):
- red: the full map;
- green: only the largest blotches;
- blue: only blotches about one degree across, twice the width of the full Moon.

The shader mixes these with the `uW` knob, and then colours the result with a [colour
scale](colour-scales.md). The colours you see are chosen by the shader, not stored in the file.

The sketch also has to say "don't adjust these colours":

```js
tex.colorSpace = THREE.NoColorSpace;
```

Normally pictures get adjusted for how screens show brightness. That would bend the numbers, so this line
switches the adjustment off.

## Textures made in code

- **`DataTexture`**: a grid of numbers made in JavaScript and handed over as a picture. Game of Life, for
  example, stores each cell as alive or dead.
- **`CanvasTexture`**: the sketch draws text or shapes on a hidden flat canvas (like a notepad), then uses it
  as a picture in the 3D scene. Labels, charts and the cartoon faces in the poop sketches are made this way.

**Try this:** in `cmbPlanck.js`, in the fragment shader, change `* 2.0 - 1.0` to `* 2.0 - 0.5`. Every
temperature reads hotter than it really is, so the whole sky shifts towards orange and red.

**Related:** [Uniforms: knobs passed in from JavaScript](uniforms.md) · [Shaders: two questions](shaders.md) ·
[Colour scales for data, and how they are chosen](colour-scales.md) · [Simulating on the graphics
chip](render-targets.md)
