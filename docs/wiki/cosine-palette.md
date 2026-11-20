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

Because the three are a third of a turn apart, they never all peak together. Better still, their average never
changes, so the mix is never black, white or grey: there's a short proof [further
down](#why-it-is-never-black-white-or-grey). Pushing green on by a third means green reaches its peak a third
of a turn *before* red does it again, and blue two thirds before. So as `t` grows, the brightest colour goes
red, then blue, then green, then back to red.

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
than the red, blue and green rows, where one colour is at full strength. The rainbow has darker bands in it,
and to your eye some colours look far brighter than others: see [how bright each colour
looks](#how-bright-each-colour-looks).

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

## The formula, written properly

Mathematicians and graphics programmers write the whole recipe as one line:

**colour(t) = a + b · cos(2π · (c · t + d))**

Each letter is three numbers, one for red, one for green, one for blue, and the sum is done for each colour on
its own:

- **a**, the middle level: where each swing is centred. Here ½.
- **b**, the swing size: how far above and below the middle it goes. Here ½, so each colour runs 0 to 1.
- **c**, how many times each colour cycles while `t` goes from 0 to 1. Here 1.
- **d**, the head starts (the phase, as in phases of the Moon). Here 0, 0.33 and 0.67.
- **2π** (about 6.2831) is one full turn, because cosine measures turns in [radians](sine-and-cosine.md).

The sketches above are this formula with a = b = ½ and c = 1. Every other choice of the four letters gives a
different family of colours, which is why one line of code can make so many looks.

## Why it is never black, white or grey

Picture three spokes of a wheel, a third of a turn apart, like a three-pointed star. However you turn the
wheel, the spokes balance: for every spoke pointing right, the other two point left by exactly as much,
together. "How far right" is the cosine. So:

**cos(x) + cos(x + ⅓ turn) + cos(x + ⅔ turn) = 0, for every x.**

The red, green and blue cosines are exactly those three spokes. Add the three colours up and the cosines
cancel, leaving three middles: ½ + ½ + ½ = 1.5. So the average of red, green and blue is always exactly ½.
Black needs all three at 0, white all three at 1, and grey all three equal: none of those has an average that
can stay at ½ while the swings move, so the palette never lands on them. (Worked out over a thousand values of
`t`: the sum of the three cosines never strays from 0 by more than two millionths of a billionth, which is
rounding. The sketches use 0.33 and 0.67, slightly off a third, so their average wobbles by at most 0.006.)

This is also why the "sunset" set below can reach almost black: its head starts aren't a third apart, so the
spokes don't balance.

## How bright each colour looks

Equal amounts of light don't look equally bright. Your eye is most sensitive to green, then red, and much less
to blue. Screens and video standards weigh them as about 21% red, 72% green and 7% blue (the "Rec. 709"
brightness rule). Worked out for the standard palette:

| `t` | colour | how bright it looks (0 to 1) |
|---|---|---|
| 0.17 | <span class="swatch" style="background:#bf00c2"></span> purple | 0.21 |
| 0.33 | <span class="swatch" style="background:#403dff"></span> blue | 0.30 |
| 0 | <span class="swatch" style="background:#ff4242"></span> red | 0.42 |
| 0.5 | <span class="swatch" style="background:#00bdbd"></span> teal | 0.58 |
| 0.67 | <span class="swatch" style="background:#40ff3d"></span> green | 0.79 |

So although the average of red, green and blue never changes, the green part of the rainbow looks almost four
times as bright as the purple part. That's lovely in art, and it's exactly why this palette is bad for data
(see below): your eye reads the bright green band as "a lot" even when the number underneath isn't special.

## See it running

<div class="wiki-embed" data-sketch="gradientPlane" data-caption="Gradient Plane: one cosine palette per pixel"></div>

[Gradient Plane](sketches/gradientPlane.md) is this formula and almost nothing else. Its code is explained
line by line: click a line or an underlined piece below for what it does in that sketch.

```glsl
vec3 color = 0.5 + 0.5 * cos(uTime * uSpeed + uv.xyx * 6.2831 + vec3(0.0, 2.0, 4.0));
```

It writes the head starts in radians rather than turns (2 and 4 radians are about 0.32 and 0.64 of a turn),
and it feeds the position in differently for green (`uv.xyx`), so green runs up the screen while red and blue
run across. In the sketch itself, its equation's symbols are clickable too: click `t` or `φ` on screen.

## Changing the look

Changing the head starts changes the family of colours. With `vec3(0.0, 0.1, 0.2)` the three colours move
nearly together, so instead of a rainbow you get light and dark: worked out the same way, `t` from 0 to 1
gives
<span class="swatch" style="background:#ffe7a7"></span> cream, <span class="swatch" style="background:#bf722a"></span>
burnt orange, <span class="swatch" style="background:#803506"></span> brown, <span class="swatch"
style="background:#110121"></span> almost black, <span class="swatch" style="background:#001858"></span> navy,
<span class="swatch" style="background:#408dd5"></span> sky blue and <span class="swatch"
style="background:#bff4fc"></span> pale ice, then back to cream. `docs/guide.md` section 8 ("Cosine palette")
has more.

**Try this:** in `audioPulse.js`, change `vec3(0.0, 0.33, 0.67)` to `vec3(0.0, 0.1, 0.2)`. The ring's rainbow
turns into the cream-to-navy set above: no greens, and the near-black part of the cycle makes stretches of the
ring nearly vanish.

## Common mistakes

- **Mixing turns and radians.** `audioPulse.js` adds the head starts (0.33, 0.67) *before* multiplying by
  6.2831, so they are fractions of a turn. `gradientPlane.js` adds them (2.0, 4.0) *after*, so they are
  radians. Copy 0.33 into the second kind of line and the colours barely shift, because 0.33 radians is only
  about a nineteenth of a turn.
- **Forgetting the 6.2831.** Without it, `t` has to grow by 6.28, not 1, to go once round the rainbow, so the
  colours change about six times more slowly than intended.
- **Using it for data.** It cycles, so a high value and a low value can get the same colour; and as the table
  above shows, its brightness jumps around, so it invents bands that aren't in the data. Data sketches use a
  [colour scale](colour-scales.md) instead.
- **Middle plus swing over 1.** If a + b is more than 1, the top of each swing is cut off at full brightness,
  and the smooth rainbow gets flat, washed-out patches.

## Connections

- [RGB, three numbers](rgb.md): what the three outputs are.
- [Sine and cosine](sine-and-cosine.md): the wave inside.
- [Blending, adding, dimming and gain](colour-blending-and-gain.md): what sketches do with the colour next.
- [Colour scales for data](colour-scales.md): the right tool when the colour has to mean a number.
- [Shaders: two questions](shaders.md): where the palette usually runs.

## Sources

- Inigo Quilez, "Palettes" (iquilezles.org/articles/palettes), which made this one-line formula popular among
  shader artists and shows many families of colours from different a, b, c and d.
- ITU-R Recommendation BT.709, which defines the 21% / 72% / 7% brightness weights used above.
