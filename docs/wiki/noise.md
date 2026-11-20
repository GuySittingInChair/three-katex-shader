---
summary: Smooth randomness: hills and clouds, not TV static.
---

# Noise: randomness that looks natural

**In one sentence:** *noise* is a recipe for smooth, wobbly randomness: bumpy but never jumpy, which is what
clouds, smoke, coastlines and mountains look like.

**Picture it:** two kinds of mess. Pure randomness is TV static: every dot unrelated to its neighbour, a
screaming fizz. Noise is a rumpled bedsheet: random, yes, but each bit of sheet is close to the height of
the bit next to it. Nature is almost always bedsheet, almost never static.

**Why sketches need it:** anything that should look organic, like dye swirling in water or the mountains
of a little planet, needs randomness with *smoothness*. 14 sketches build their own noise recipe.

**Where you'll see it:** `fluidDye.js`, `displacedIcosphere.js`, `marbleTexture.js`, `infernoCape.js`,
`supernovaRemnant.js`, `sunCycle.js`, `bristolSpecimen.js` and most of the `kali*` sketches.

## The three-step recipe

**1. Random numbers on a grid.** Give every corner of an invisible square grid a random height. From
`src/sketches/fluidDye.js`:

```glsl
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
```

This is GLSL, the [shader](shaders.md) language. `p` is a corner's position (two numbers). `fract`
keeps only the part after the decimal point (2.75 → 0.75), and `dot` multiplies the numbers in pairs and
adds them up. Mixed together with odd numbers like 127.1, they scramble a position into a number
between 0 and 1 that looks random. It isn't truly random:
the same corner always gets the same number. That's the point: the shader redraws the whole picture 60 times a second, so if a corner got a new
random number each time, the picture would flicker like static. A
scrambler like this is called a *hash*.

**2. Blend smoothly between corners.**

```glsl
vec2 u = f * f * (3.0 - 2.0 * f);
return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
```

- `a, b, c, d` are the four corner heights of the square this pixel is in.
- `f` is where the pixel sits inside its square (0 to 1 each way).
- Line 1 bends `f` into an S-curve so the blend eases in and out, with no creases at the grid lines. It is
  the same curve as `smoothstep`.
- Line 2 blends across the top pair, then across the bottom pair, then between the two results. See
  [Blending, adding, dimming and gain](colour-blending-and-gain.md).

Now you have soft hills, one hill per grid square. Pleasant, but bland.

**3. Stack layers: fbm.** Real mountains have big ridges, *and* smaller bumps on the ridges, *and* rocks on
the bumps. So add several layers of noise, each twice as detailed and half as strong:

```glsl
for (int i = 0; i < 5; i++) {
  sum += amp * noise(p * freq);
  freq *= 2.0;
  amp *= 0.5;
}
```

`freq` is how detailed a layer is and `amp` how strong; `*=` means "multiply by". So each time round,
the next layer is twice as detailed and half as strong. Five layers: big shapes, then finer, then finer
still. This stacking is called *fbm* (fractal Brownian
motion, a grand name for "noise on noise on noise"). Each layer is an *octave*, borrowed from music:
going up an octave (from one "do" to the next in do-re-mi) doubles a note's pitch, and each layer
doubles the detail.

## The party trick: warping

Feed noise *into* noise. Take a position, nudge it by some noise, then look up noise at the nudged spot.
Do it twice. Straight lines turn into curls and eddies, and you get something that looks a lot like dye
in water. That is the whole of [Fluid Dye](sketches/fluidDye.md).

**Try this:** in `fluidDye.js`, change `i < 5` to `i < 1`. Only the first, broadest layer is left. The dye
turns into smooth, rubbery blobs with no fine wisps at all, like a lava lamp.

**Related:** [Random numbers, and seeds that make them repeatable](randomness.md) · [Fluid Dye](sketches/fluidDye.md) ·
[Displaced Icosphere](sketches/displacedIcosphere.md) · [GLSL basics: reading a shader](glsl-basics.md)
