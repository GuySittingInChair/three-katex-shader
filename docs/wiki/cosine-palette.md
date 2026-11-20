---
summary: A rainbow made from three cosine waves, one each for red, green and blue.
added: 2026-11-18
---

# Colour 3: the cosine palette (the rainbow trick)

**In one sentence:** the cosine palette turns a single number into a smoothly changing colour, by letting red,
green and blue each rise and fall in a wave, slightly out of step with one another.

**Picture it:** three people on swings side by side, each starting a little after the last. At any moment one
is high, one is in the middle and one is low. If each swing controls one colour bulb (red, green, blue), the
mix of the three keeps changing smoothly, cycling through the rainbow and back to where it started.

**Why sketches need it:** fractals and patterns produce one number per pixel, such as "how many steps until it
escaped". The palette turns that number into a colour in one line. It loops back on itself, so there are no
sudden jumps.

**Where you'll see it:** 43 sketches (found by searching the code for its pattern), including `audioPulse.js`,
`audioReactiveJulia.js`, `bifurcationDiagram.js`, `gradientPlane.js`, every `kali*` sketch (where it is called
`rainbow`), `mengerSponge.js` and `torusKnot.js`.

## In words first

For an input number `t`:

- red = ½ + ½ × cos(a full turn × `t`)
- green = the same, but with `t` pushed a third of a turn further on
- blue = the same, with `t` pushed two thirds of a turn further on

Cosine ("cos", see [sine and cosine](sine-and-cosine.md)) is a wave-maker: feed it a number that grows
steadily and the answer rises and falls forever, like a swing, between −1 and +1. One full turn of the input
is one full swing. So "½ + ½ × cos" swings between 0 and 1: from off to full brightness.

Because the three are a third of a turn apart, they never all peak together, so the mix is never a dull grey.
Pushing green on by a third means green reaches its peak a third of a turn *before* red does it again, and
blue two thirds before. So as `t` grows, the brightest colour goes red, then blue, then green, then back to
red.

## Following the numbers to a colour

Here is what comes out as `t` goes from 0 to 1, worked out with the same calculation the sketches use (each
number rounded to 2 places; the swatch is the colour those three numbers make):

| `t` | red | green | blue | colour |
|---|---|---|---|---|
| 0 | 1.00 | 0.26 | 0.26 | <span class="swatch" style="background:#ff4242"></span> red |
| 0.17 | 0.75 | 0.00 | 0.76 | <span class="swatch" style="background:#bf00c2"></span> purple |
| 0.33 | 0.25 | 0.24 | 1.00 | <span class="swatch" style="background:#403dff"></span> blue |
| 0.5 | 0.00 | 0.74 | 0.74 | <span class="swatch" style="background:#00bdbd"></span> teal |
| 0.67 | 0.25 | 1.00 | 0.24 | <span class="swatch" style="background:#40ff3d"></span> green |
| 0.83 | 0.75 | 0.76 | 0.00 | <span class="swatch" style="background:#bfc200"></span> olive yellow |
| 1 | 1.00 | 0.26 | 0.26 | <span class="swatch" style="background:#ff4242"></span> red again |

That is the colour wheel run backwards: red, purple, blue, teal, green, yellow, orange, red. Notice the
purple, teal and olive rows: there two colours are about equal and the third is 0, so they come out darker
than the red, blue and green rows, where one colour is at full strength. The rainbow has slightly darker bands
in it.

**One input, step by step.** Take `t` = 0.25:

- red: a full turn is 6.2831, and 6.2831 × 0.25 = 1.571, a quarter turn. cos of a quarter turn is 0. So red =
  ½ + ½ × 0 = **0.50**.
- green: 6.2831 × (0.25 + 0.33) = 3.644. cos(3.644) = −0.88. So green = ½ + ½ × (−0.88) = **0.06**.
- blue: 6.2831 × (0.25 + 0.67) = 5.781. cos(5.781) = +0.88. So blue = ½ + ½ × 0.88 = **0.94**.

Half red, almost no green, nearly full blue: <span class="swatch" style="background:#8010ef"></span> a violet,
between the purple and blue rows above.

**What it looks like in the code:** from `src/sketches/audioPulse.js`:

```glsl
float hue = fract(uTime * 0.05 + uBass * 0.3 + r * 0.2);
vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
```

- `float` means "a number with a decimal point" and `vec3` means "a bundle of three numbers"; GLSL, the
  [shader](shaders.md) language, wants you to say which kind you're making.
- Line 1 makes the input number, `hue`. It creeps forward with time (`uTime`, seconds since the sketch
  started), jumps a little with the bass (`uBass`, how loud the low notes are, or a slow pretend pulse while
  sound is off), and changes with distance from the centre (`r`). `fract` keeps only the part after the
  decimal point, so it stays between 0 and 1.
- Line 2 is the palette. Cosine measures turns in *radians*, where one full turn is 6.2831 (that's 2π). So
  multiplying by `6.2831` means "`hue` going from 0 to 1 is one full swing".
- `vec3(0.0, 0.33, 0.67)` gives red, green and blue their head starts, like the swings starting at different
  times: none, a third of a swing, two thirds.
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
starts. Changing the head starts changes the family of colours. With `vec3(0.0, 0.1, 0.2)` the three colours
move nearly together, so instead of a rainbow you get light and dark: worked out the same way, `t` from 0 to 1
gives <span class="swatch" style="background:#ffe7a7"></span> cream, <span class="swatch"
style="background:#bf722a"></span> burnt orange, <span class="swatch" style="background:#803506"></span>
brown,
<span class="swatch" style="background:#110121"></span> almost black, <span class="swatch"
style="background:#001858"></span> navy, <span class="swatch" style="background:#408dd5"></span> sky blue and
<span class="swatch" style="background:#bff4fc"></span> pale ice, then back to cream. `docs/guide.md` section 8
("Cosine palette") has the full version.

**When not to use it:** for scientific data. It cycles, so a high value and a low value can get the same
colour, and it isn't designed for colour-blind readers. Data sketches use a [colour scale](colour-scales.md)
instead.

**Try this:** in `audioPulse.js`, change `vec3(0.0, 0.33, 0.67)` to `vec3(0.0, 0.1, 0.2)`. The ring's rainbow
turns into the cream-to-navy set above: no greens, and the near-black part of the cycle makes stretches of the
ring nearly vanish.

**Related:** [RGB, three numbers](rgb.md) · [Colour scales for data, and how they are
chosen](colour-scales.md) · [Shaders: two questions](shaders.md)
