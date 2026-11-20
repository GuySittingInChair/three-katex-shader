---
summary: A kaleidoscope bent by a hidden Game of Life.
---

# Life-Warped Fractal: in plain English

File: `src/sketches/lifeWarpedFractal.js` · Mode: shader · Category: Fractals

**What you see:** a dizzying, symmetric kaleidoscope that never stops changing its mind: blue lace one
moment, candy stripes the next, then mustard-yellow mosaic, then hot-pink and green medallions. Over it
crawl dozens of small blobs filled with fizzing rainbow static, like patches of an untuned TV. The blobs
are a hidden Game of Life board, and wherever a live square sits, the kaleidoscope underneath is folded
differently.

**The idea behind it:** two things, wired together.
- **A folding fractal.** Take a point, fold it like paper (mirror it into one corner), shift it, enlarge
  it, turn it, and repeat 14 times. Points that started close together end up wildly far apart, and
  colouring by where each one ends up gives intricate, repeating, kaleidoscope detail. The name comes from
  a style by the shader artist Radian628.
- **[Conway's Game of Life](gameOfLife.md)**, on a 64 × 64 board, ticking 6 times a second.

The trick is that the Life board doesn't paint on top of the fractal. It *retunes* it. A pixel under a
live square folds with a bigger enlargement, a different twist, and a stronger wobble. So the gliders
and blinkers punch little windows into a slightly different fractal.

The equation on screen says exactly that: "alive here" changes the fold scale, the spin and the warp.

**Where the data comes from:** no data. A quarter of the Life squares start alive, chosen
[at random](../randomness.md).

**How it's built:**
- The Life board runs in JavaScript and is sent to the [shader](../shaders.md) every frame as a
  [DataTexture](../textures.md), 64 × 64 squares, smoothed between squares (`LinearFilter`). That
  smoothing is why the blobs have soft edges.
- One [fragment shader](../shaders.md) does all the folding, once per pixel.

**A tour of the file:**

Reading the Life board and setting the fold, in the shader:

```glsl
float life = texture2D(uLife, vUv).r;
float angle = uTime * 0.05 + life * 1.2;
float scale = 1.08 + life * uLifeInfluence;
```

- Line 1: `texture2D(uLife, vUv)` reads the Life board (`uLife`) at this pixel's spot on screen (`vUv`),
  like putting a pin in a map. `.r` takes the red part, where the board is stored. So: is there a live
  square under this pixel? 1 for yes, 0 for no, in between at soft edges.
- Line 2: the twist. Everyone turns slowly with time (`uTime`, seconds since the start); live pixels get
  an extra 1.2 (in *radians*, where a full turn is 6.28: so about 70°).
- Line 3: the enlargement at each fold: 1.08 normally, 1.43 under a live square (adding **Life
  influence**, 0.35 by default).

The fold, repeated **Iterations** times:

```glsl
p = abs(p);
p -= 0.15;
p *= scale;
p *= rot;
```

- `p` is the point being folded: two numbers, across and up. `rot` is the turn, made from `angle`.
- Line 1: `abs` throws away minus signs: mirror the point into the top-right corner. That's the fold.
- Line 2: shift it a little.
- Line 3: enlarge it.
- Line 4: turn it.

Then the colour: three distances, multiplied by 67 and run through a sine wave:

```glsl
color = sin(color * 67.0) * 0.5 + 0.5;
```

Multiplying by 67 means tiny differences in distance swing the colour right round. That gives the
detail. It's also why the Life blobs fizz: under a live square, 14 enlargements of 1.43 blow the point up
about 150 times (1.43 multiplied by itself 14 times; against 1.08¹⁴, about 3 times, elsewhere), so neighbouring pixels land on wildly different colours.
That's static.

**Numbers worth knowing:**
- **14 folds** per pixel (the **Iterations** slider, 4 to 26).
- **6 generations a second** (**Gen rate**, 1 to 20).
- **1 to 5 minutes**: how long the Life board took to settle down in tests, after which only blinkers
  and still blobs remain. The board never resets until you leave the sketch.

**Try this (funky):** drag **Iterations** down to 4. The fine lace vanishes and the kaleidoscope opens out
into big, bold rainbow rings, like a 1970s album cover, with the Life blobs crawling over them. Then crank it to
26 for maximum migraine.

**Words on this page:** [fractal](../glossary.md), [kaleidoscope fold](../glossary.md),
[cellular automaton](../glossary.md), [DataTexture](../glossary.md), [shader](../glossary.md),
[interference](../glossary.md)
