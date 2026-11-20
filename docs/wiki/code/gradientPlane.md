---
summary: Every line of the Gradient Plane sketch, and every piece that matters, explained.
added: 2026-11-20
sketch: gradientPlane
---

# Gradient Plane: the code, line by line

These are the explanations you get by clicking the code of [Gradient Plane](../sketches/gradientPlane.md), in
the code panel or in its walkthrough. They are collected here so you can also read them straight through.

## Symbols

### `c(t)` {#c}

The brightness of one colour (red, green or blue) at one pixel, from 0 (off) to 1 (full). The sketch works it
out three times per pixel, once for each colour, in line 2 of the shader.

### `t` {#t}

How far along its swing the colour is, counted in whole swings: t going from 0 to 1 is one full rise and fall.
In the code it is made of two things added together: the time (so the colours flow) and the pixel's position
(so each part of the screen is at a different point of the swing).

### `\phi` {#phi}

φ (phi) is each colour's head start: how far along its swing it already is when t is 0. Red, green and blue
get different head starts, so they never all peak together, and that is what turns three swings into a
rainbow.

## Lines

### `export default {`

The start of the sketch. Everything from this curly bracket to the matching one at the end of the file is the
sketch describing itself to the app: its name, its sliders, its shader and so on. See [The sketch format:
every field](../sketch-format.md).

### `name: 'Gradient Plane',`

The title shown at the top of the screen and in the gallery.

### `description: 'Time-driven cosine palette across UV space.',`

The sentence shown under the title. "Cosine palette" is the [rainbow recipe](../cosine-palette.md) this sketch
is built on; "UV space" means the screen's positions, from 0 to 1 across and up.

### `tags: ['basic', 'shader'],`

Search words: typing "basic" into the gallery's search box finds this sketch.

### `category: 'Shaders',`

The gallery shelf it sits on, Shaders, which belongs to the Rendering group.

### `mode: 'shader',`

This sketch is one flat picture painted by a single [shader](../shaders.md), with no 3D objects. The app
supplies the screen-filling square and the clock; the sketch only says what colour each pixel is.

### `shaderLang: 'glsl',`

A note saying the shader below is written in GLSL, the graphics chip's language (see [GLSL
basics](../glsl-basics.md)). Nothing on screen changes with it.

### `latex: '\\htmlData{sym=c}{c}(...`

The equation shown on screen. The `\htmlData{sym=…}` parts mark its symbols so you can click them: click t and
the line of code that makes t lights up.

### `params: {`

The start of the slider list. Each line inside makes one slider in the Params panel. See [Params: the
sliders](../params.md).

### `speed: { value: 1.0, min: 0, max: 5 },`

The **Speed** slider: how fast the colours flow. It starts at 1, and at 0 the picture stands still, because
speed multiplies the clock in line 2 of the shader.
#### `max: 5`
At 5 the rainbow sweeps past five times as fast: one full cycle in about 1.3 seconds instead of 6.3.

### `scale: { value: 1.0, min: 0.1, max: 8 },`

The **Scale** slider: how many rainbows fit across the screen. At 1 there is one; at 8, eight.
#### `min: 0.1`
At 0.1 you see only a tenth of one rainbow, so the whole screen is nearly one colour, slowly changing.

### `` fragmentShader: ` ``

The start of the shader: a long piece of text, between backticks, that the app hands to the graphics chip.
Everything until the closing backtick is GLSL, not JavaScript.

### `uniform float uTime;`

A [uniform](../uniforms.md) is a number handed to the shader from outside, the same for every pixel. `uTime`
is the clock: seconds since the sketch started. The app fills it in for every `shader` sketch.

### `uniform float uSpeed;`

The Speed slider's value, handed in by `update` (below) on every frame.

### `uniform float uScale;`

The Scale slider's value, handed in by `update` on every frame.

### `varying vec2 vUv;`

This pixel's position on the screen, as two numbers from 0 to 1 (across, up). It is the only thing that
differs from one pixel to the next, so it is the only reason different pixels get different colours.

### `void main() {`

Where the shader starts. The graphics chip runs everything inside, once for every pixel, all at the same time.

### `vec2 uv = vUv * uScale;`

Stretches the pixel's position by the Scale slider. At scale 2, a pixel halfway across the screen is treated
as if it were a whole screen across, so two rainbows fit.
symbol: t
#### `vUv`
This pixel's position, 0 to 1 across and up.
#### `uScale`
The Scale slider. Bigger numbers pack more rainbows in.

### `vec3 color = 0.5 + 0.5 * cos(uTime * uSpeed + uv.xyx * 6.2831 + vec3(0.0, 2.0, 4.0));`

The whole picture in one line: three swings, one each for red, green and blue, worked out together. This is
the equation on screen, done three times at once.
symbol: c
#### `uTime * uSpeed`
The clock times the Speed slider: this pushes every swing along as time passes, so the colours flow. It is the
time part of t.
symbol: t
#### `uv.xyx`
Three numbers made from the position: across, up, across again (picking parts by letter is called
[swizzling](../glsl-basics.md)). So red and blue change as you go across the screen, and green as you go up.
That is why green runs in a different direction from the other two.
#### `6.2831`
One full turn (2π). Multiplying the position by it makes one step across the whole screen exactly one full
swing, so at scale 1 you see exactly one rainbow across.
#### `vec3(0.0, 2.0, 4.0)`
The head starts φ for red, green and blue, measured in radians: 0, 2 and 4 out of a full turn of 6.28, so
roughly none, a third and two thirds of a swing. Change them to `vec3(0.0)` and red and blue swing in step,
which leaves only magenta, green, white and black.
symbol: phi
#### `0.5 + 0.5 * cos(`
`cos` swings between −1 and +1; halving it and adding a half moves the swing to 0 … 1, the range a colour
needs. See [sine and cosine](../sine-and-cosine.md).

### `gl_FragColor = vec4(color, 1.0);`

Hands the colour to the screen. This is the shader's answer to "what colour is this pixel?".
#### `1.0`
The fourth number: fully solid, not see-through.

### `uniforms() {`

A small recipe the app runs once at the start, to make the knobs the shader reads.

### `return { uSpeed: { value: 1.0 }, uScale: { value: 1.0 } };`

Makes the two slider knobs the shader expects, each starting at 1. The app adds `uTime` itself.

### `update(ctx, state) {`

Runs on every frame, about 60 times a second (see [The frame loop](../frame-loop.md)). This sketch only uses
it to pass the sliders to the shader; the shader does all the drawing.

### `state.uniforms.uSpeed.value = ctx.params.speed;`

On every frame, copies the Speed slider's position into the shader's `uSpeed` knob, so dragging the slider
changes the picture straight away.

### `state.uniforms.uScale.value = ctx.params.scale;`

The same for the Scale slider.
