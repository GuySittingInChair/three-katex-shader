# Audio-Reactive Julia Set: in plain English

File: `src/sketches/audioReactiveJulia.js` · Mode: shader · Category: Audio-Reactive Fractal

**What you see:** a lacy, swirling shape in black, edged with bands of rainbow colour, slowly changing
form. Sometimes it is one connected island, sometimes it breaks up into dust. With music or the microphone
on, the bass and treble push it between those states.

**The idea behind it:** a *Julia set* comes from a very simple rule, repeated. Take a point on the screen
and treat it as a number. Square it, then add a fixed number `c`. Repeat. For some starting points the
answer stays small forever: those are coloured black, and they form the shape. For others it shoots off
towards infinity, and the colour shows how quickly. That is the rule on screen,
z₍ₙ₊₁₎ = zₙ² + c, which reads: "the next number (n + 1) is this number (n), squared, plus c".

Change `c` a little and the whole shape changes. Here `c` slowly travels round a small circle, and the
sound makes the circle bigger or smaller.

How do you square a point? Picture an arrow from the centre of the screen to the point, like a clock
hand. To square it, double the angle the hand points at, and square its length. A hand at 1 o'clock
swings to 2 o'clock; a hand half a unit long shrinks to a quarter, one 3 units long grows to 9. So points
near the centre shrink inwards and far points fly outwards, while everything swirls round. Points
handled this way are called *complex numbers*: two numbers bundled together, across and up.

**Where the data comes from:** live sound (see [Audio Pulse](audioPulse.md)). Only bass and treble are
used.

**How it's built:**
- One [fragment shader](../shaders.md).
- A repeat loop per pixel (see [Decisions (`if`) and loops (`for`)](../js-decisions-and-loops.md)).
- [Uniforms](../uniforms.md) for the sliders and sound.
- The [cosine palette](../cosine-palette.md) for colour.

**A tour of the file:**

First, the moving constant:

```glsl
float wobble = (uBass - uTreble) * 0.35 * uSensitivity;
float angle = uTime * uSpeed * 0.25;
vec2 c = vec2(-0.55, 0.6) + vec2(cos(angle), sin(angle)) * (0.15 + wobble);
```

- `float` is one number, `vec2` a pair (across, up), `vec3` three (a colour). See
  [GLSL basics](../glsl-basics.md).
- Line 1: bass pushes one way, treble the other. Bass-heavy music makes the circle bigger.
- Line 2: an angle that grows slowly with time.
- Line 3: `c` sits on a circle around the point (−0.55, 0.6), with radius 0.15 plus the wobble.
  `cos` and `sin` together walk round a circle (see [sine and cosine](../sine-and-cosine.md)).

Then the repeat:

```glsl
for (int i = 0; i < MAX_ITER; i++) {
  z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
  if (dot(z, z) > 4.0) break;
  iter += 1.0;
}
```

- `z` starts as this pixel's position.
- Line 2 is "square it and add `c`", written out for complex numbers. `z.x` is the across part and `z.y`
  the up part; the formula is the clock-hand rule worked out in numbers.
- Line 3: once `z` is more than 2 away from the centre (`dot(z, z)` is across² + up², the distance squared,
  so "more than 4" means "more than 2 away"), it is
  certain to fly off, so stop.
- `iter` counts how many rounds it survived, up to 120.

Finally, colour:

```glsl
vec3 color = (iter >= float(MAX_ITER) - 0.5)
  ? vec3(0.0)
  : 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
```

If it survived all 120 rounds, the pixel is black: it is part of the set. Otherwise it gets a rainbow
colour depending on how many rounds it lasted.

**Numbers worth knowing:**
- **120**: rounds per pixel. A full-screen picture has about two million pixels, so that is up to 240
  million squarings, 60 times a second. Only a graphics chip can do that.
- **2**: the escape distance. Once a point is further than 2 from the centre, it can never come back.
- **0.25**: with speed at its default 0.6, `c` takes about 42 seconds to go once round its circle.

**Words on this page:** [Julia set](../glossary.md), [complex number](../glossary.md),
[escape time](../glossary.md), [shader](../glossary.md), [uniform](../glossary.md)
