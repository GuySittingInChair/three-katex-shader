# Caustics: in plain English

File: `src/sketches/causticsLight.js` · Mode: shader · Category: Optics

**What you see:** a dark blue background covered in a shimmering net of bright aqua lines, like sunlight
dancing on the floor of a swimming pool. The net moves constantly. In places it breaks up into fine,
feathery threads, and that fractured region slowly changes shape.

**The idea behind it:** when sunlight passes through a rippling water surface, each ripple acts like a
small lens. It bends light together into bright lines, and leaves darker patches between them. These
bright, focused patterns are called *caustics*. You also see them at the bottom of a glass of water in
sunlight.

The sketch doesn't trace real light rays. It fakes the look:
1. Add up a few sine waves (see the planned math page) running in different directions, so they overlap
   and interfere.
2. Sharpen them: keep only the places where the sum is near zero, and raise that to a power so the lines
   become thin and bright.
3. Stack three such layers at different sizes and speeds.

Then a [Julia set](audioReactiveJulia.md) is mixed in. It nudges where each layer is sampled, and
brightens the lines near its edges. That is where the feathery, self-similar threads come from.

The equation on screen is the recipe for the shimmer, C(𝐱, t), plus the Julia rule, z → z² + c.

**Where the data comes from:** no data.

**How it's built:**
- One [fragment shader](../shaders.md).
- Sine waves, rotation and `pow` for sharpening (see [glsl-basics.md](../glsl-basics.md)).
- An escape-time loop for the Julia set.
- Colour is [added](../colour-blending-and-gain.md) onto a dark base.

**A tour of the file:**

One layer of shimmer:

```glsl
float v = sin(p.x * freq + t1)
        + sin(p.y * freq - t1 * 1.3)
        + sin((p.x + p.y) * freq * 0.7 + t1 * 0.8);
v *= 0.333;
return pow(max(0.0, 1.0 - abs(v)), uSharpness);
```

- Three waves: one running across, one up, and one diagonally, each drifting at its own speed.
- `v *= 0.333` averages them, so `v` stays between −1 and 1.
- `1.0 - abs(v)` is 1 exactly where the waves cancel out, and falls off either side.
- `pow(..., uSharpness)` raises it to the power of the "sharpness" slider (6 by default). Values below 1
  shrink fast when raised to a power, so only the very middle of each line stays bright. The result is
  thin, crisp lines.

The fractal nudge:

```glsl
vec2 uvWarped = uv + uFractalMix * (julia - 0.3) * 0.8 * warpDir;
```

- `julia` is a number from 0 to 1 from the Julia loop, changing fastest near the set's edge.
- This shifts the sampling position by that amount, in a direction (`warpDir`) that slowly turns.
- "fractalMix" at 0 switches the nudge off, giving pure sine shimmer.

The colour:

```glsl
vec3 color = deepWater + brightWater * caustic;
```

Dark navy, plus pale aqua wherever the light is focused (see [rgb.md](../rgb.md)). A slight darkening
towards the edges, the *vignette*, makes it feel like looking down into water.

**Numbers worth knowing:**
- **3 layers**, at three sizes (3, 4.2 and 5.6 in the code, the larger the finer), each turned at a
  different angle, so the net never lines up into a grid.
- **6**: the default sharpness. At 2 the lines are soft and wide; at 12 they are hair-thin.
- **40**: rounds per pixel for the Julia set, a third of what [Audio-Reactive Julia](audioReactiveJulia.md)
  uses, since it only needs a rough outline.

**Words on this page:** [caustic](../glossary.md), [interference](../glossary.md),
[Julia set](../glossary.md), [shader](../glossary.md), [vignette](../glossary.md)
