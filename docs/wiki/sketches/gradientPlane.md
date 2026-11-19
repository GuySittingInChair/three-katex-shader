# Gradient Plane: in plain English

File: `src/sketches/gradientPlane.js` · Mode: shader · Category: Shaders

**What you see:** the whole screen is a soft rainbow, red melting into magenta, blue, cyan, green and
yellow, with no edges anywhere. The colours slide slowly across the screen, like light through a stained
glass window as the sun moves. That's it: no shapes, no objects. It's the smallest sketch on the site, and
the best one to learn shaders on.

**The idea behind it:** a [shader](../shaders.md) is a tiny program the graphics card runs once for every
pixel, all at the same time. Each pixel only knows *where it is* on the screen and *what time it is*. From
those two facts it must work out its own colour.

This one uses the [cosine palette](../cosine-palette.md) trick. A cosine wave rises and falls smoothly
forever, like a swing. Give red, green and blue each their own swing, a little out of step with each
other, and wherever the swings are at different heights you get a different colour. Push each pixel
along the swings by its position, and by the time, and the rainbow appears and flows.

The equation on screen is one swing: a brightness that goes from 0 to 1 and back, smoothly, forever.

**Where the data comes from:** no data.

**How it's built:**
- One [fragment shader](../shaders.md), with no 3D scene at all (mode `shader`).
- Two [uniforms](../uniforms.md), `uSpeed` and `uScale`, carry the two sliders into the shader.
- `uTime`, the clock, is supplied by the site to every shader sketch.

**A tour of the file:** the whole picture is these three lines in the shader:

```glsl
vec2 uv = vUv * uScale;
vec3 color = 0.5 + 0.5 * cos(uTime * uSpeed + uv.xyx * 6.2831 + vec3(0.0, 2.0, 4.0));
gl_FragColor = vec4(color, 1.0);
```

- Line 1: `vUv` is where this pixel is, from (0, 0) at the bottom left to (1, 1) at the top right.
  Multiplying by **Scale** stretches that range, so more rainbow fits across the screen.
- Line 2, read from the inside out:
  - `uv.xyx` makes three numbers from the position: across, up, across. Red and blue follow the
    across position; green follows the up position.
  - `* 6.2831` (that's 2 × π) means one step across the screen is exactly one full swing.
  - `uTime * uSpeed` pushes every swing along with time: that's the flowing.
  - `vec3(0.0, 2.0, 4.0)` starts red, green and blue at different points of their swings, so they
    never line up. That's what makes it a rainbow instead of grey.
  - `0.5 + 0.5 * cos(...)` turns the swing, which goes from −1 to 1, into a brightness from 0 to 1.
- Line 3: hand the colour to the screen. The fourth number, 1, means fully solid.

`update` copies the slider values into the uniforms every frame, and that's the whole file:

```js
state.uniforms.uSpeed.value = ctx.params.speed;
state.uniforms.uScale.value = ctx.params.scale;
```

**Numbers worth knowing:**
- **38 lines**: the whole sketch.
- **About 6 seconds**: one full trip round the rainbow at speed 1 (one swing takes 2π, about 6.3, seconds).
- **One rainbow** across the screen at scale 1, up to **8** at the maximum.

**Try this (funky):** in the shader, change `vec3(0.0, 2.0, 4.0)` to `vec3(0.0)`. Now red, green and blue
swing perfectly together, except that green follows a different direction. The rainbow collapses into a
psychedelic plaid of magenta, green, white and black. Then drag **Scale** to 8 for a tablecloth.

**Words on this page:** [shader](../glossary.md), [cosine palette](../glossary.md),
[uniform](../glossary.md), [vUv](../glossary.md), [swizzling](../glossary.md), [radians](../glossary.md)
