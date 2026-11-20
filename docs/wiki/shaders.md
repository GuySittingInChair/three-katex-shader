---
summary: A tiny program the graphics card runs once for every pixel, all at the same time.
added: 2026-11-18
---

# Shaders: two questions

**In one sentence:** a *shader* is a small program that runs on the graphics chip, and it only ever answers
one of two questions: "where does this corner go?" or "what colour is this pixel?"

**Picture it:** a stadium card display. Thousands of people each hold up one coloured card, all at the same
moment, and together they make a picture. Nobody sees the whole picture. Each person follows the same
instruction sheet: "if you are in row 12, seat 40, hold up blue". A shader is that instruction sheet. The
graphics chip hands it to millions of tiny workers at once, one per pixel.

**Why sketches need it:** a screen has about two million pixels, and the picture changes 60 times a second.
Working each one out in turn, in JavaScript, would be far too slow. The graphics chip does them all at once.
That is why the fractals and fluids on this site can move smoothly.

**Where you'll see it:** all 87 `shader` sketches are a single shader. 38 of the 79 `3d` sketches use shaders
too, as custom paint (`ShaderMaterial`).

## The two kinds

- **Vertex shader: "where does this corner go?"** It runs once for every corner of a shape and says where that
  corner lands on screen. It can bend, stretch or morph a shape. In the sketch The Oldest Light (a map of the
  oldest light in the universe), the vertex shader is what unrolls the sky sphere into a flat oval map.
- **Fragment shader: "what colour is this pixel?"** It runs once for every pixel the shape covers and picks
  its colour. In a `shader` sketch, this is the whole sketch.

In a `shader` sketch the app supplies a vertex shader that does nothing interesting: it stretches one square
over the whole screen. Then the sketch's `fragmentShader` colours every pixel of that square.

**What it looks like in the code:** the whole picture of `src/sketches/gradientPlane.js`:

```glsl
void main() {
  vec2 uv = vUv * uScale;
  vec3 color = 0.5 + 0.5 * cos(uTime * uSpeed + uv.xyx * 6.2831 + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(color, 1.0);
}
```

- `void main() {` is where every shader starts. Each pixel's worker runs it.
- `vec2`, `vec3` and `vec4` mean "a bundle of 2, 3 or 4 numbers": a position, a colour, a colour plus
  see-through-ness. `uv` is a name the sketch picked for a position.
- `vUv` is *this pixel's* position on the screen: two numbers, each from 0 (left or bottom) to 1 (right or
  top). Every worker gets a different `vUv`. That is the only reason they paint different colours.
- Names starting with `u` (`uScale`, `uTime`, `uSpeed`) are values handed in from outside: the sliders and the
  clock.
- Line 2 multiplies the position by the "scale" slider, so higher scale packs more stripes in.
- Line 3 works out a colour: three numbers for red, green and blue. They change with position and with time
  (`uTime`), so the colours drift. This recipe is the [cosine palette](cosine-palette.md).
- Line 4 hands the colour over. `gl_FragColor` is the answer to "what colour is this pixel?". The fourth
  number, `1.0`, means fully solid, not see-through.

## Where shaders hide in a file

They are long blocks of text between backticks (the ` character, which in JavaScript starts and ends a long
piece of text), because JavaScript has to carry them to the graphics chip as text. Look for `fragmentShader:
\``, `vertexShader: \``, or names like `VERT`, `FRAG` and `STEP_FRAG`. The language inside is GLSL. See [GLSL
basics: reading a shader](glsl-basics.md).

## How JavaScript talks to a shader

A shader can't see the sliders or the clock directly. JavaScript passes numbers in as *uniforms* (values that
are the same for every pixel, like the slider settings or the time), and pictures as *textures*. See
[Uniforms: knobs passed in from JavaScript](uniforms.md) and [Textures](textures.md).

## From corners to pixels: the whole journey

Every picture the graphics chip draws goes through the same three stages, every frame:

1. **The vertex shader places the corners.** Each corner of each triangle goes in; its spot on the screen
   comes out, in a variable called `gl_Position`. The corners can also carry extra numbers along with them,
   like a colour or a position on a picture. Those are called *varyings*, because they will vary across the
   triangle.
2. **The chip finds the pixels.** For each triangle, it works out which pixels on the screen it covers. This
   step is called *rasterising* (a raster is a grid of dots). You don't write any code for it.
3. **The fragment shader colours them.** For every covered pixel, the chip blends the corners' varyings
   according to how close the pixel is to each corner, and runs the fragment shader with the blended values.
   Its answer goes in `gl_FragColor`. (A *fragment* is a pixel that a triangle wants to colour; usually it's
   simply that pixel.)

## How a pixel knows where it is

In a `shader` sketch the app draws one square covering the whole screen, made of two triangles over four
corners (in `src/core/SketchRunner.js`). Each corner carries its own place on the screen as a varying, `vUv`:

| corner | where it is placed | its `vUv` |
|---|---|---|
| top left | (−1, 1) | (0, 1) |
| top right | (1, 1) | (1, 1) |
| bottom left | (−1, −1) | (0, 0) |
| bottom right | (1, −1) | (1, 0) |

Now take a pixel a quarter of the way across and halfway up the screen. It sits a quarter of the way from the
left corners to the right ones, so the chip blends their across numbers 75% left (0) and 25% right (1): 0.25.
Halfway between the bottom corners (0) and the top ones (1) gives 0.5. So that pixel's fragment shader runs
with `vUv` = (0.25, 0.5). Every pixel gets its own blend, which is the only reason the same instructions paint
different colours in different places.

## How much work that is

A screen 1,920 pixels wide and 1,080 tall has 2,073,600 pixels. At 60 frames a second that is 124,416,000 runs
of the fragment shader every second, for a sketch that colours the screen once. [Gradient
Plane](sketches/gradientPlane.md) works out three cosines per pixel, so about 373 million cosines a second. A
graphics chip manages it because it has thousands of small calculators working side by side (an NVIDIA RTX
2080 Ti, for example, has 4,352), all running the same instructions on different pixels: the stadium card
display from the top of this page.

## See it running

<div class="wiki-embed" data-sketch="gradientPlane" data-caption="Gradient Plane: the shader above, running"></div>

The short shader quoted near the top of this page is the whole of it. They are explained line by line in
[Gradient Plane: the code, line by line](code/gradientPlane.md), and you can click them in the code above, or
in the sketch's code panel.

## Common mistakes

- **Writing `1` instead of `1.0`.** GLSL treats `1` as a whole number and may refuse to mix it with decimals;
  the shader then doesn't run at all, and the screen stays black. See [GLSL basics](glsl-basics.md).
- **A knob that is never turned.** If the shader asks for `uniform float uZoom;` but JavaScript names it
  `uzoom`, the shader's `uZoom` is 0 forever. See [Uniforms](uniforms.md).
- **Dividing by zero.** A pixel where a division by zero happens gets a "not a number" colour, usually shown
  as black: a single dark dot or line where the maths breaks down (for example, the exact centre of a polar
  pattern).
- **Forgetting the screen is wide.** `vUv` runs 0 to 1 both ways, but the screen is wider than tall, so a
  circle drawn in `vUv` comes out as an oval. [Audio Pulse](sketches/audioPulse.md) does exactly this; most
  sketches multiply by `uResolution.x / uResolution.y` to fix it.
- **Expecting a pixel to see its neighbours.** Each run only knows its own pixel. To use the result of one
  step in the next (a simulation), a sketch has to draw into a hidden picture and read it back: see
  [Simulating on the graphics chip](render-targets.md).

## Connections

- [GLSL basics](glsl-basics.md): the language the shaders are written in.
- [Uniforms](uniforms.md) and [Textures](textures.md): how numbers and pictures get in.
- [The cosine palette](cosine-palette.md): the colour recipe in most of the site's shaders.
- [Simulating on the graphics chip](render-targets.md): shaders that remember.

## Sources

- Patricio Gonzalez Vivo and Jen Lowe, *The Book of Shaders* (thebookofshaders.com): a gentle, free
  introduction to fragment shaders.
- The Khronos Group, *The OpenGL ES Shading Language* specification: the rules of GLSL as WebGL uses it.
- three.js documentation, `ShaderMaterial`: how three.js hands a sketch's shaders to the chip.

**Try this:** in `gradientPlane.js`, change `vec3(0.0, 2.0, 4.0)` to `vec3(0.0, 0.5, 1.0)`. Those three
numbers are the head starts for red, green and blue, measured in radians (a full turn is 6.28, so 2 and 4 are
about a third and two thirds of a turn). Shrinking them makes the colours keep step more closely. The rainbow
changes character: a dark patch and pale, nearly white patches appear along the diagonal where across equals
up (there all three colours rise and fall almost together), with bright green on one side and magenta on the
other.

**Related:** [GLSL basics: reading a shader](glsl-basics.md) · [Uniforms: knobs passed in from
JavaScript](uniforms.md) · [Textures](textures.md) · [Simulating on the graphics chip](render-targets.md) ·
[The cosine palette (the rainbow trick)](cosine-palette.md) · `docs/guide.md` section 7
