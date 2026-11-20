---
summary: Every colour on screen is a mix of red, green and blue light.
---

# Colour 1: RGB, three numbers

**In one sentence:** every colour on a screen is a mix of red, green and blue light, so a colour is three
numbers: how much red, how much green, how much blue.

**Picture it:** three dimmer switches, one each for a red, a green and a blue bulb shining on the same
wall. All off is black. All fully on is white. Red and green on, with blue off, makes yellow. Every colour
is some setting of the three dimmers.

**Why sketches need it:** shaders and materials need colours as numbers they can calculate with. A sketch
can add, blend and dim colours with arithmetic. That is how a fractal gets its rainbow or a star map its
glow.

**Where you'll see it:** everywhere, in three forms.

## Form 1: three numbers from 0 to 1 (shaders, and `THREE.Color`)

```glsl
vec3 deepWater = vec3(0.0, 0.08, 0.16);
vec3 brightWater = vec3(0.4, 0.85, 0.95);
```
(from `src/sketches/causticsLight.js`)

- These lines are in GLSL, the language of [shaders](shaders.md) (programs that colour each pixel).
  `vec3` means "a bundle of three numbers": here `vec3(red, green, blue)`, each from 0 (off) to 1 (full).
- `deepWater` has no red, a little green and a bit more blue: a very dark navy, the colour of deep water.
- `brightWater` has some red and lots of green and blue: a pale aqua, the colour of light dancing on a
  pool floor.

In JavaScript (the language the rest of a sketch is written in) the same thing is written
`new THREE.Color(0.95, 0.76, 0.42)`: "make a new colour" from three.js (`THREE`), the 3D toolbox the
site is built on. That one, from
`src/sketches/bezierDeCasteljau.js`, is a warm gold.

## Form 2: a code like `0xffffff` (JavaScript)

```js
new THREE.DirectionalLight(0xffffff, 2.0);
new THREE.AmbientLight(0x404050, 1.2);
```
(from `src/sketches/audioReactiveMesh.js`: two lights, each given a colour and a brightness)

- `0x` means "the next six characters are a colour code". The six characters are three pairs:
  red, green, blue.
- Each pair runs from `00` (off) to `ff` (full). The letters a–f stand for 10–15, so `ff` is 255,
  the largest value.
- `ffffff` is all three fully on: white. `404050` is about a quarter of red and green and a little more
  blue: a dim bluish grey.

Web pages write the same codes with a `#`: `#ffd166` is the warm yellow used for the live numbers in every
equation (`src/core/latex.js`).

## Form 3: hue, saturation, lightness (HSL)

```js
color.setHSL(0.6 - speed * 0.35, 0.75, 0.55).toArray(instanceColor.array, i * 3);
```
(from `src/sketches/boidsFlock.js`, the flocking-birds sketch, where each bird's colour shows its
speed; `speed` runs from 0 for the slowest to 1 for the fastest)

Instead of three bulbs, HSL describes a colour the way people do:
- **hue**: where on the colour wheel, from 0 to 1 (0 is red, about 0.33 green, about 0.6 blue, and
  back to red at 1);
- **saturation**: how vivid, from 0 (grey) to 1 (pure colour);
- **lightness**: from 0 (black) through 0.5 (the colour itself) to 1 (white).

`color.setHSL(hue, saturation, lightness)` sets a colour this way (the `.toArray(…)` part then copies it
into bird `i`'s place in the list of all the birds' colours). Here slow birds get hue 0.6 (blue)
and fast birds move towards hue 0.25 (yellow-green).

## A fourth number: see-through-ness

`vec4(color, 1.0)` (a bundle of four numbers: the three colour numbers, then one more) adds a fourth
number, *alpha*: 1 is solid, 0 is invisible. Most sketches use 1.

**Try this:** in `causticsLight.js` (the file for the [Caustics](sketches/causticsLight.md) sketch), change `brightWater` to `vec3(0.95, 0.6, 0.2)`. The pool turns into
molten gold: the dancing light becomes orange over the same dark navy water.

**Related:** [Blending, adding, dimming and gain](colour-blending-and-gain.md) · [The cosine palette (the rainbow trick)](cosine-palette.md)
· [Colour scales for data, and how they are chosen](colour-scales.md)
