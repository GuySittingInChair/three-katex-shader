---
summary: A dark ball with a soap-bubble rainbow round its edge.
---

# Iridescent Sphere: in plain English

File: `src/sketches/iridescentSphere.js` · Mode: 3d · Category: Materials

**What you see:** a dark ball floating in black space. Its face is almost black, but around its edge runs
a thin halo of rainbow colours, like the rim of a soap bubble or a drop of oil on a puddle. The colours
slowly cycle round, and a soft white highlight glints on one side as the ball turns. Drag to look around.

**The idea behind it:** two real effects from everyday life, faked cheaply.

1. **Edges reflect more.** Look straight down into a lake and you see the bottom. Look across it at a
   low angle and it's a mirror. Most shiny things work this way: surfaces you see face-on show little
   reflection, and surfaces you see edge-on reflect a lot. It's called the *Fresnel effect* (say
   "freh-NEL"), after the French physicist who worked it out in the 1820s.
2. **Thin films make rainbows.** A soap bubble's skin is thinner than a wavelength of light. Light bouncing
   off the front and back of the skin interferes, and which colour wins depends on the angle you look
   from. That's *iridescence*.

The sketch combines them: the more edge-on a spot is, the stronger its shimmer, and the further round
the rainbow its colour goes. It's not real optics (that would be much harder), but it fools the eye.

The equation on screen: F, the shimmer strength, grows from 0 face-on towards 1 edge-on; p (the **Power**
slider) says how quickly. The colour is F times 1.4, plus a slow drift with time, wrapped round the
rainbow.

**Where the data comes from:** no data.

**How it's built:**
- A [mesh](../mesh-geometry-material.md): a sphere made of 64 × 64 patches, with a custom
  [shader material](../shaders.md).
- The [vertex shader](../shaders.md) works out, for each point, which way the surface faces and which way
  the camera is. The fragment shader does the rest.
- The rainbow comes from the [cosine palette](../cosine-palette.md).

**A tour of the file:** the fragment shader:

```glsl
float fresnel = pow(1.0 - max(0.0, dot(n, v)), uPower);
float hue = fract(fresnel * 1.4 + uTime * uHueSpeed);
vec3 sheen = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
vec3 color = mix(base, sheen, fresnel);
```

- Line 1: `n` is the way the surface faces, `v` the way to your eye. `dot(n, v)` is 1 when they point the
  same way (face-on) and 0 when they're at right angles (the edge). `1.0 −` flips that, so it's 0
  face-on and 1 at the edge. `pow(…, uPower)` raises it to a power (the **Power** slider): multiplying
  a number below 1 by itself several times shrinks it fast, so the shimmer stays hugging the edge.
- Line 2: pick a place on the rainbow from the shimmer, plus a slow drift. `fract` keeps only the part
  after the decimal point, so the rainbow wraps round.
- Line 3: turn that place into a colour, with the [cosine palette](../cosine-palette.md). `vec3` is a
  bundle of three numbers: red, green, blue.
- Line 4: `mix` blends from `base` (near-black) to that colour by the shimmer strength: dark face,
  bright rim.

Spinning, in `update`:

```js
state.mesh.rotation.y += ctx.delta * ctx.params.spin;
state.mesh.rotation.x += ctx.delta * ctx.params.spin * 0.3;
```

`ctx.delta` is the time since the last frame (about 1/60 of a second), and `ctx.params.spin` the **Spin**
slider. So each frame it turns a little round the upright axis (`rotation.y`), and a third as much round
the sideways one (`rotation.x`), so it tumbles slightly.

**Numbers worth knowing:**
- **3.5**: the default power. Even 80% of the way from the middle of the ball to its edge, the shimmer is
  only about 4% of full strength, which is why the face looks black.
- **4,225** points on the sphere (65 × 65).
- **20 seconds**: one trip round the rainbow drift, at the default **Hue speed** of 0.05.

**Try this (funky):** drag **Power** down to 1. The shimmer floods inwards across the face and the ball
becomes a swirling psychedelic marble, still dark only at the very centre. Push **Hue speed** to 0.3 and it
strobes like a disco ball.

**Words on this page:** [Fresnel effect](../glossary.md#fresnel-effect), [iridescence](../glossary.md#iridescence),
[normal](../glossary.md#normal), [cosine palette](../glossary.md#cosine-palette), [lerp / mix](../glossary.md#lerp-mix),
[vertex shader](../glossary.md#vertex-shader)
