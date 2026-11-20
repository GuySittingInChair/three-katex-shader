---
summary: A rippling, folded-paper fractal pattern that slowly turns and breathes.
added: 2026-11-18
---

# Radian628 Integral-Warped GLSL Fractal: in plain English

File: `src/sketches/different-this-time.js` · Mode: shader · Category: Fractals

**What you see:** a psychedelic tapestry of tight, rippling stripes in shifting colours, like a paisley shirt
put through a car wash. The pattern has mirror symmetry, and it turns very slowly and breathes as it does,
sprouting new curls and folds.

**The idea behind it:** this is a *folding fractal*, the same family as [Abyssal Bloom](chatgpt-quantum.md).
Imagine a sheet of tracing paper with a doodle on it. Fold it in half, then in half the other way, nudge it
off-centre, stretch it a little, twist it, and repeat 16 times. Each fold copies the doodle onto itself, so
after a few rounds you get mirror-upon-mirror detail.

The twist in this one: on every round, the sheet is also pushed sideways by a smooth wave. The code calls it
the wave's *integral*. An integral is a running total. If a wave said how fast you were walking each second
(forwards, then backwards, then forwards), its integral would say how far from the start you'd got: and that
also goes back and forth, as another, smoother wave. So read it as "an extra gentle ripple, added on every
fold". That ripple is what keeps the shapes curvy instead of crystal-sharp.

There's no equation on screen for this one: it is one of the two sketches without a `latex` field.

**Where the data comes from:** no data.

**How it's built:**
- A [fragment shader](../shaders.md) with a folding loop.
- [Uniforms](../uniforms.md) for the sliders.
- Unusually, it builds its own screen-filling square in `setup` (most `shader` sketches let the app do that),
  and it uses `gl_FragCoord`, the pixel's position counted in actual pixels, instead of `vUv`.

**A tour of the file:**

The folding loop:

```glsl
for (float i = 0.0; i < 32.0; i++) {
  if (i >= uIterations) break;
  p = abs(p);
  p -= vec2(0.15);
  p *= uScale;
  p *= rot;
```

- `p` is the point being folded: a `vec2`, a pair of numbers (across, up).
- `abs(p)` folds (`abs` means "drop the minus sign"): anything on the left is flipped to the right, anything
  below is flipped up. Four quarters of the screen become one.
- `p -= vec2(0.15)` takes 0.15 off both numbers: it slides the paper diagonally, so the next fold lands
  somewhere new.
- `p *= uScale` stretches by the **Scale** slider: 1.1, so 10% bigger each round. (Names starting with `u` are
  values handed in from outside, like sliders.)
- `p *= rot` twists it by an angle that grows slowly with time. `rot` is a *rotation*, made a few lines
  earlier from that angle.

Then the gentle ripple:

```glsl
vec2 intTerm = SpatialTrigIntegral(p, 2.5 + sin(uTime * 0.2), uTime * 0.5);
p += intTerm * 0.08;
```

`SpatialTrigIntegral` is a small recipe written at the top of the file; it works out that integral ripple at
point `p`. The result nudges `p` a little (`* 0.08`). Its waviness itself drifts with time (`2.5 + sin(...)`,
a slow [sine](../sine-and-cosine.md) wave), which is why the pattern never quite settles.

The colour:

```glsl
color = sin(color * 67.0) * 0.5 + 0.5;
```

After folding, each of red, green and blue is a distance. Multiplying by 67 and taking the sine turns smooth
distance into a quick up-down-up-down: rings, like a contour map gone wild. That makes the tight stripes. Each
channel's rings are slightly offset, so they cross in rainbow fringes.

**Numbers worth knowing:**
- **16 folds** by default (4 to 32 on the slider).
- **1.1 per fold**: after 16 folds the paper is stretched 1.1¹⁶ ≈ 4.6 times.
- **About 2 minutes** for one full slow turn, at the default speed of 0.05 radians a second.
- **67**: the stripe density. It's a "looks good" number, not a physical one.

**Try this (funky):** change `67.0` to `6.0`. The razor stripes melt into broad, soft bands of pale pastel
(lemon, pink, sky blue), like the same pattern painted with a fat brush. Then try `300.0`: the stripes get
finer than the pixels can show, and the picture turns into fine colour speckle, like an untuned TV, that
fizzes as it turns.

**Fixed on 2026-11-19:** the sketch used to read the window's size only once, at the start, so after you
resized the window the pattern sat off-centre until you left and came back. It now re-reads the size every
frame.

**Words on this page:** [shader](../glossary.md#shader), [kaleidoscope
fold](../glossary.md#kaleidoscope-fold), [uniform](../glossary.md#uniform),
[integral](../glossary.md#integral)
