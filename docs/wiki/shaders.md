---
summary: A tiny program the graphics card runs once for every pixel, all at the same time.
added: 2026-11-18
---

# Shaders: two questions

**In one sentence:** a *shader* is a small program that runs on the graphics chip, and it only ever
answers one of two questions: "where does this corner go?" or "what colour is this pixel?"

**Picture it:** a stadium card display. Thousands of people each hold up one coloured card, all at the
same moment, and together they make a picture. Nobody sees the whole picture. Each person follows the
same instruction sheet: "if you are in row 12, seat 40, hold up blue". A shader is that instruction sheet.
The graphics chip hands it to millions of tiny workers at once, one per pixel.

**Why sketches need it:** a screen has about two million pixels, and the picture changes 60 times a second.
Working each one out in turn, in JavaScript, would be far too slow. The graphics chip does them all at once.
That is why the fractals and fluids on this site can move smoothly.

**Where you'll see it:** all 87 `shader` sketches are a single shader. About 40 `3d` sketches use shaders
too, as custom paint (`ShaderMaterial`).

## The two kinds

- **Vertex shader: "where does this corner go?"** It runs once for every corner of a shape and says
  where that corner lands on screen. It can bend, stretch or morph a shape. In the sketch The Oldest Light (a map of
  the oldest light in the universe), the vertex shader is what unrolls the sky sphere into a flat oval map.
- **Fragment shader: "what colour is this pixel?"** It runs once for every pixel the shape covers and
  picks its colour. In a `shader` sketch, this is the whole sketch.

In a `shader` sketch the app supplies a vertex shader that does nothing interesting: it stretches one
square over the whole screen. Then the sketch's `fragmentShader` colours every pixel of that square.

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
- Names starting with `u` (`uScale`, `uTime`, `uSpeed`) are values handed in from outside: the sliders and
  the clock.
- Line 2 multiplies the position by the "scale" slider, so higher scale packs more stripes in.
- Line 3 works out a colour: three numbers for red, green and blue. They change with position and with
  time (`uTime`), so the colours drift. This recipe is the [cosine palette](cosine-palette.md).
- Line 4 hands the colour over. `gl_FragColor` is the answer to "what colour is this pixel?". The fourth
  number, `1.0`, means fully solid, not see-through.

## Where shaders hide in a file

They are long blocks of text between backticks (the ` character, which in JavaScript starts and ends a
long piece of text), because JavaScript has to carry them to the graphics chip
as text. Look for `fragmentShader: \``, `vertexShader: \``, or names like `VERT`, `FRAG` and `STEP_FRAG`.
The language inside is GLSL. See [GLSL basics: reading a shader](glsl-basics.md).

## How JavaScript talks to a shader

A shader can't see the sliders or the clock directly. JavaScript passes numbers in as *uniforms* (values that are
the same for every pixel, like the slider settings or the time), and pictures as *textures*. See [Uniforms: knobs passed in from JavaScript](uniforms.md) and [Textures](textures.md).

**Try this:** in `gradientPlane.js`, change `vec3(0.0, 2.0, 4.0)` to `vec3(0.0, 0.5, 1.0)`. The rainbow
loses its variety: red, green and blue now rise and fall nearly together, so you mostly see pale, washed-out
tints fading to dark and back.

**Related:** [GLSL basics: reading a shader](glsl-basics.md) · [Uniforms: knobs passed in from JavaScript](uniforms.md) · [Textures](textures.md) ·
[Simulating on the graphics chip](render-targets.md) · [The cosine palette (the rainbow trick)](cosine-palette.md) · `docs/guide.md` section 7
