---
summary: A rainbow made from three cosine waves, one each for red, green and blue.
added: 2026-11-18
---

# Colour 3: the cosine palette (the rainbow trick)

**In one sentence:** the cosine palette turns a single number into a smoothly changing colour, by letting
red, green and blue each rise and fall in a wave, slightly out of step with one another.

**Picture it:** three people on swings side by side, each starting a little after the last. At any moment
one is high, one is in the middle and one is low. If each swing controls one colour bulb (red, green,
blue), the mix of the three keeps changing smoothly, cycling through the rainbow and back to where it
started.

**Why sketches need it:** fractals and patterns produce one number per pixel, such as "how many steps
until it escaped". The palette turns that number into a colour in one line. It loops back on itself, so
there are no sudden jumps.

**Where you'll see it:** 30 sketches, including `audioPulse.js`, `audioReactiveJulia.js`,
`bifurcationDiagram.js`, `gradientPlane.js`, most `kali*` sketches, `mengerSponge.js` and `torusKnot.js`.

## In words first

For an input number `t`:

- red = ½ + ½ × cos(a full turn × `t`)
- green = the same, but started a third of a turn later
- blue = the same, started two thirds of a turn later

Cosine ("cos", see [sine and cosine](sine-and-cosine.md)) is a wave-maker: feed it a number that grows steadily and the answer rises and falls
forever, like a swing, between −1 and +1. One full turn of the input is one full swing. So "½ + ½ × cos"
swings between 0 and 1: from off to full brightness. Because the three are a third of a turn apart, they
never all peak together. When all three are equal you get grey or white; when one is high and the others
low you get a strong colour. Staying out of step keeps them unequal, so the colours stay vivid, and as
the input grows the lead passes from red to green to blue and back: the rainbow.

**What it looks like in the code:** from `src/sketches/audioPulse.js`:

```glsl
float hue = fract(uTime * 0.05 + uBass * 0.3 + r * 0.2);
vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
```

- `float` means "a number with a decimal point" and `vec3` means "a bundle of three numbers"; GLSL, the
  [shader](shaders.md) language, wants you to say which kind you're making.
- Line 1 makes the input number, `hue`. It creeps forward with time (`uTime`, seconds since the sketch
  started), jumps a little with the bass (`uBass`, how loud the low notes are, or a slow pretend pulse while sound is off), and changes
  with distance from the centre (`r`). `fract` keeps only the part after the decimal point, so it stays
  between 0 and 1.
- Line 2 is the palette. Cosine measures turns in *radians*, where one full turn is 6.2831 (that's 2π).
  So multiplying by `6.2831` means "`hue` going from 0 to 1 is one full swing".
- `vec3(0.0, 0.33, 0.67)` gives red, green and blue their head starts, like the swings starting at
  different times: none, a third of a swing, two thirds.
- The answer is three numbers, one per colour, each between 0 and 1.

The same calculation in JavaScript (the language the rest of a sketch is written in), from
`src/sketches/audioReactiveMesh.js`. `out.x`, `.y` and `.z` hold red, green and blue:

```js
out.x = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.0));
out.y = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.33));
out.z = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.67));
```

## Changing the look

The general form has four settings: a middle level, a swing size, how fast to cycle, and the three head
starts. Changing the head starts changes the family of colours. For example, `vec3(0.0, 0.1, 0.2)` gives a
"sunset into night" set (cream, burnt orange, navy and sky blue), because the three colours now move
nearly together. `docs/guide.md` section 8 ("Cosine
palette") has the full version.

**When not to use it:** for scientific data. It cycles, so a high value and a low value can get the same
colour, and it isn't designed for colour-blind readers. Data sketches use a
[colour scale](colour-scales.md) instead.

**Try this:** in `audioPulse.js`, change `vec3(0.0, 0.33, 0.67)` to `vec3(0.0, 0.1, 0.2)`. The ring's
rainbow narrows to cream, burnt orange, navy and sky blue, with no greens or purples.

**Related:** [RGB, three numbers](rgb.md) · [Colour scales for data, and how they are chosen](colour-scales.md) · [Shaders: two questions](shaders.md)
