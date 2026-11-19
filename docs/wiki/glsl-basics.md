# GLSL basics: reading a shader

**In one sentence:** GLSL is the language *shaders* are written in: the small programs the graphics chip
runs once for every pixel, to decide its colour. It looks like JavaScript (the language the rest of the
site is written in), but it is fussier about numbers and has built-in types for positions and colours.

**Picture it:** the same recipe written for a different kitchen. The steps are familiar, but this kitchen
measures everything precisely, and its bowls come in fixed sizes: one, two, three or four compartments. The bowls are GLSL's *types*: every
number must go in a bowl of the right size, and you must say which bowl you're using.

**Why sketches need it:** the graphics chip only understands shader languages. Every pattern, fractal and
fluid on the site is written in GLSL.

**Where you'll see it:** inside the backtick blocks of 126 sketch files. See [shaders.md](shaders.md).

## The bowls: types

| Type | Holds | Example |
|---|---|---|
| `float` | one number with a decimal point | `float r = length(uv);` |
| `int` | a whole number | `for (int i = 0; i < 100; i++)` |
| `vec2` | two numbers: a position on screen | `vec2 uv = vUv;` |
| `vec3` | three numbers: a colour (red, green, blue) or a 3D position | `vec3(0.0, 0.08, 0.16)` is very dark blue |
| `vec4` | four numbers: colour plus see-through-ness | `vec4(color, 1.0)` |
| `bool` | true or false | `bool inDish(...)` |

**Numbers need a dot.** Write `1.0`, not `1`. GLSL treats `1` as a whole number and may refuse to mix it
with decimals. Forgetting the dot is the most common reason a shader won't run.

## Reading the parts: `.x .y .z` and `.rgb`

Most shaders have a `uv`: this pixel's position on screen, as two numbers (a `vec2`). `uv.x` is how far
across, and `uv.y` is how far up. For colours, `.r .g .b` mean the same
places. You can take several at once: `color.rgb`, or even shuffle them: `uv.xyx` is "x, y, then x again".
This is called *swizzling*.

## Built-in tools

| GLSL | Means |
|---|---|
| `sin`, `cos` | wave-makers: as the input grows, the answer rises and falls between −1 and 1, forever ([more](sine-and-cosine.md)) |
| `length(v)` | how long an arrow is, so distance from the centre |
| `atan(y, x)` | which direction an arrow points (an angle) |
| `mix(a, b, t)` | blend from a to b; `t` = 0 gives a, 1 gives b (see [colour-blending-and-gain.md](colour-blending-and-gain.md)) |
| `clamp(x, lo, hi)` | keep x between lo and hi |
| `smoothstep(a, b, x)` | a soft switch from 0 to 1 as x goes from a to b |
| `fract(x)` | the part after the decimal point: 2.75 → 0.75 |
| `mod(x, y)` | remainder after dividing |
| `pow(x, p)` | x to the power p |
| `dot(a, b)` | multiply matching parts and add them up |

## A full example, line by line

From `src/sketches/audioPulse.js`, a ring that wobbles to music:

```glsl
vec2 uv = (vUv - 0.5) * 2.0;
float r = length(uv);
float a = atan(uv.y, uv.x);
float ringPos = r - 0.4 - 0.15 * wobble;
float ring = smoothstep(0.02, 0.0, abs(ringPos));
```

- Line 1: `vUv` is the pixel's position from 0 (left or bottom edge) to 1 (right or top). Subtracting 0.5
  and doubling moves the zero point to the middle of the screen. Now `uv` runs from −1 to +1.
- Line 2: `r` is how far this pixel is from the centre.
- Line 3: `a` is which direction the pixel is in, as an angle.
- Line 4: `ringPos` is how far this pixel is from the ring. The ring sits 0.4 from the centre, pushed in and
  out by the music (`wobble`).
- Line 5: if the pixel is within 0.02 of the ring, `ring` is close to 1 (bright). Further away it fades to
  0 (dark). `abs` means "ignore the minus sign", so inside and outside count the same.

**Try this:** in `audioPulse.js`, change `0.4` in line 4 to `0.8`. The ring doubles in size and nearly
touches the top and bottom of the screen.

**Related:** [shaders.md](shaders.md) · [uniforms.md](uniforms.md) ·
[js-decisions-and-loops.md](js-decisions-and-loops.md) · `docs/guide.md` section 7
