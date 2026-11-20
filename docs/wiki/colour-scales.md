---
summary: Rules that turn a measured number into a colour, so you can read the number back from the colour.
added: 2026-11-18
---

# Colour 4: colour scales for data, and how they are chosen

**In one sentence:** a *colour scale* is a rule that turns a measured number (a temperature, a density, a
speed) into a colour, so that you can read the number back from the colour.

**Picture it:** a weather map. Blue means cold and red means hot, and the key in the corner shows the steps in
between. You don't need the numbers, because the colours tell you where it's warmer. A colour scale is that
key.

**Why sketches need it:** the astronomy sketches show real measurements. If the colours are badly chosen, the
picture can show patterns that aren't there, or hide ones that are.

**Where you'll see it:** The Oldest Light (`cmbPlanck.js`), and the other data sketches in the Astronomy
category.

## How a scale is built

Pick a few colours at fixed points, then blend between neighbours (see [Blending, adding, dimming and
gain](colour-blending-and-gain.md)). From the fragment shader of `src/sketches/cmbPlanck.js`:

```glsl
vec3 planck(float x) {    // −1 … +1: deep blue, pale blue, cream, orange, deep red
  x = clamp(x * 0.5 + 0.5, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.9), c1 = vec3(0.2, 0.6, 1.0), c2 = vec3(1.0, 0.93, 0.85), ...
  if (x < 0.25) return mix(c0, c1, x / 0.25);
  if (x < 0.5) return mix(c1, c2, (x - 0.25) / 0.25);
```

- This is GLSL, the [shader](shaders.md) language. `float` means "a number with a decimal point" and `vec3`
  "three numbers", here a colour: red, green, blue, each 0 to 1 (see [RGB](rgb.md)).
- Line 1: `planck` is a recipe that takes a number `x` and hands back a colour. The input runs from −1
  (coldest) to +1 (hottest). The comment after `//` lists the five colours in order.
- Line 2 turns −1…+1 into 0…1. `clamp` keeps anything outside the range at the end colours.
- Line 3 sets the fixed colours: deep blue, pale blue, cream, and (further along) orange and deep red.
- Lines 4 and 5 blend with `mix(a, b, t)`: partway from colour `a` to colour `b`, by `t` (0 to 1); see
  [Blending](colour-blending-and-gain.md). In the first quarter of the range it blends from deep blue to pale
  blue, in the second from pale blue to cream, and two more lines further down do the same for cream to orange
  and orange to deep red.

So cream marks "average", blue "colder than average" and red "warmer". It mimics the scale the Planck team
used on their own maps, so the picture looks like the one scientists know.

**Following the numbers to a colour.** The sketch feeds in each spot's temperature difference from average, in
millionths of a degree (µK), divided by 300: `planck(T / 300.0 * uGain)`, where `uGain` is 1 on the full map.
Worked out for six spots:

| spot | `x` after line 2 | blend | colour |
|---|---|---|---|
| 300 µK colder | 0 | all `c0` | <span class="swatch" style="background:#0000e6"></span> deep blue |
| 150 µK colder | 0.25 | all `c1` | <span class="swatch" style="background:#3399ff"></span> pale blue |
| exactly average | 0.5 | all `c2` | <span class="swatch" style="background:#ffedd9"></span> cream |
| 90 µK warmer | 0.65 | 60% of the way from `c2` to `c3` | <span class="swatch" style="background:#ffb36e"></span> apricot |
| 150 µK warmer | 0.75 | all `c3` | <span class="swatch" style="background:#ff8c26"></span> orange |
| 300 µK warmer (or more) | 1 | all `c4` | <span class="swatch" style="background:#8c0000"></span> deep red |

The 90 µK row, step by step: 90 ÷ 300 = 0.3. Line 2 turns that into 0.3 × 0.5 + 0.5 = 0.65. That is past 0.5,
so the third blend applies: (0.65 − 0.5) ÷ 0.25 = 0.6, so 60% of the way from cream (1.0, 0.93, 0.85) to
orange (1.0, 0.55, 0.15). Green goes 0.93 → 0.55, and 60% of the way is 0.93 − 0.6 × 0.38 = 0.70. Blue goes
0.85 → 0.15, and 60% of the way is 0.43. Red stays 1.0. Full red, about two thirds green, under half blue: a
warm apricot.

## How Claude chooses a colour scale

1. **Follow the field's habit, where one exists.** Maps of the oldest light use Planck's blue–cream–red, so
   the sketch looks like the published maps. A map of stars would use the colours stars really have, from
   bluish hot stars to orange cool ones.
2. **Match the kind of number.**
   - Numbers that go *either way* from a middle (warmer or colder than average) get a *diverging* scale: two
     colours meeting at a pale middle.
   - Numbers that only go *up* (how many, how dense, how bright) get a *sequential* scale: dark to light in
     one direction, like viridis or inferno.
   - Labels with no order (planet types, survey names) get clearly different colours, of similar brightness,
     so none looks more important.
3. **Brightness must change steadily along the scale.** Your eye reads brightness far better than hue. If the
   scale has a bright band in the middle (the classic "rainbow"), it invents edges in the data that aren't
   there.
4. **Check for colour blindness.** About 1 in 12 men can't tell red from green well. Blue against orange or
   red is safer than red against green. The scale should still make sense printed in grey.
5. **Keep it readable on black.** The sketches are drawn on black (whatever colours the site's menus use), so
   the darkest colour of a sequential scale must still be visible against it, or must be meant to fade into
   it.

The [cosine palette](cosine-palette.md) breaks rules 3 and 4 on purpose. It is for art, not data.

**Try this:** in `cmbPlanck.js`, swap the first and last colours: `c0 = vec3(0.55, 0.0, 0.0)` and `c4 =
vec3(0.0, 0.0, 0.9)`. The coldest spots now go dark red and the hottest dark blue. Nothing in the data
changed, but the map now *reads* backwards. That is why the scale matters.

**Related:** [Blending, adding, dimming and gain](colour-blending-and-gain.md) · [Textures](textures.md) ·
[The cosine palette (the rainbow trick)](cosine-palette.md) · [RGB, three numbers](rgb.md)
