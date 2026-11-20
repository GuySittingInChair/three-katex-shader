---
summary: A neon kaleidoscope made by twisting, folding and counting near-misses.
---

# Radian628 — Abyssal Bloom: in plain English

File: `src/sketches/chatgpt-quantum.js` · Mode: shader · Category: Fractals

Full name on screen: "Radian628 — Abyssal Bloom (Hyper-Vibrant Log Spiral)".

**What you see:** an intensely bright, neon kaleidoscope. Petals and spiral arms of saturated colour turn
around a glowing blue-white centre. They are laced with fine magenta and cyan threads, and lit with
cream-white highlights. The number of arms gently changes, and the whole pattern breathes in and out.
The edges are slightly darker.

**The idea behind it:** this is art, not physics. It is one of a family of sketches named after
Radian628, an artist known for fractal shaders. All of them bend space over and over. The recipe has
four ideas:
1. **Spiral warping.** Space is twisted along a *logarithmic spiral*, the curve of a snail shell or a
   galaxy arm, which looks the same at every size: each time round, it gets the same number of times
   wider (that steady "times wider" growth is what *logarithmic* means). The equation on screen is this
   twist. It mixes the distance from the centre, r, with the angle θ (theta, which direction from the
   centre). It uses r through its logarithm, ln r, which counts "how many times bigger" instead of "how
   much further", so the twist looks the same close in and far out.
2. **Folding, repeated.** The picture is cut into wedges, like slices of a cake, and each wedge is folded
   onto the first one: that makes the kaleidoscope. Then space is pushed out and turned inside-out near the
   centre. Repeating this 20 times builds fractal detail.
3. **Counting near-misses.** As each pixel's point gets folded around, the sketch keeps a tally of how
   often it passes close to a circle or to the axes. This tally is called an *orbit trap*. Pixels with a
   high tally get the brightest colour and the white highlights.
4. **Interference veins.** Two wave patterns are multiplied together, and where they peak, thin neon lines
   appear.

**Where the data comes from:** no data.

**How it's built:**
- One [fragment shader](../shaders.md), over 200 lines long.
- Repeated folding in a loop; the [cosine palette](../cosine-palette.md), pushed past normal
  saturation.
- A "tone map" that squeezes very bright values back into what a screen can show.

**A tour of the file:**

The main steps, in `main()`:

```glsl
vec2 p = uv;
p = logSpiralWarp(p, t);
float orbit;
vec2 q = foldSpace(p, t, orbit);
```

- Start with the pixel's position (`uv`: two numbers, across and up). `t` is the time.
- Twist it along the spiral.
- Fold it repeatedly. `foldSpace` hands back the folded point `q`, and fills in the tally `orbit`.

The wedge fold inside `foldSpace`:

```glsl
float sectors = uArms + 2.0 * sin(t * 0.25);
angle = mod(angle + PI / sectors, TAU / sectors) - PI / sectors;
```

- `sectors` is the number of wedges: the "arms" slider (5), give or take 2, swaying slowly. That is why the
  number of arms seems to change.
- `PI` is half a turn and `TAU` a full turn, so `TAU / sectors` is one wedge's width. `mod` means "the
  remainder after dividing", which wraps any angle round into one wedge's width.
- So the second line moves every angle into the first wedge, so all wedges look the same: the kaleidoscope.

The colour:

```glsl
vec3 color = vibrantPalette(colorPhase, uColorSaturation);
float orbitIntensity = smoothstep(0.1, 2.5, orbit);
color *= 0.8 + 2.5 * orbitIntensity;
```

- A [cosine-palette](../cosine-palette.md) colour (`vibrantPalette` is a recipe written earlier in the
  file), made extra vivid by the **Color saturation** slider.
- `smoothstep(0.1, 2.5, orbit)` ramps gently from 0 to 1 as the tally `orbit` goes from 0.1 to 2.5.
- `*=` means "multiply by": pixels whose points came near the traps often are boosted to as much as 3.3
  times as bright (0.8 + 2.5).

Near the end:

```glsl
color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
```

This is a standard film-style *tone map* (known as ACES). It keeps very bright colours from flattening into
pure white, the way a camera handles a sunset.

**A note on the file:** it also contains a `quantumWave` function, about 60 lines long, which nothing calls.
It is left over from an earlier version, so it has no effect on the picture. The file's name
(`chatgpt-quantum.js`) comes from that version too.

**Numbers worth knowing:**
- **20**: folds per pixel by default (the "iterations" slider, 4 to 28).
- **5 ± 2**: wedges in the kaleidoscope.
- **About 25 seconds**: how long the wedge count takes to sway through one full cycle (2π ÷ 0.25).

**Words on this page:** [logarithmic spiral](../glossary.md#logarithmic-spiral), [orbit trap](../glossary.md#orbit-trap),
[kaleidoscope fold](../glossary.md#kaleidoscope-fold), [tone map](../glossary.md#tone-map), [cosine palette](../glossary.md#cosine-palette),
[shader](../glossary.md#shader)
