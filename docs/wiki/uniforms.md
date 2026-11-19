# Uniforms: knobs passed in from JavaScript

**In one sentence:** a *uniform* is a number (or a few numbers) that JavaScript hands to a shader, the same
value for every pixel, so the shader can react to sliders, time and sound.

**Picture it:** the stadium card display again (see [Shaders: two questions](shaders.md)). The instruction sheet says
"if the scoreboard shows more than 50, hold up red". The scoreboard is a uniform. Everyone sees the same
scoreboard, and when the organisers change it, every card can change at once.

**Why sketches need it:** shaders run on the graphics chip and can't read the sliders or the clock
themselves. Uniforms are the only door in. They are called *uniform* because they are the same for every
pixel.

**Where you'll see it:** nearly every sketch. Names usually start with `u`: `uTime`, `uSpeed`, `uZoom`.

## Three steps, always the same

From `src/sketches/audioReactiveJulia.js`.

**1. The shader says which knobs it expects:**

```glsl
uniform float uZoom;
uniform float uBass;
```

- `uniform` means "a knob from outside".
- `float` means it holds one number with a decimal point.
- `uZoom` and `uBass` are the knobs' names.

**2. The sketch creates the knobs, with starting values** (each knob is a little box with a `value`
inside):

```js
uniforms() {
  return {
    uZoom: { value: 1.4 },
    uBass: { value: 0 },
```

**3. On every frame, `update` turns the knobs:**

```js
state.uniforms.uZoom.value = ctx.params.zoom;
...
state.uniforms.uBass.value = ctx.audio.bass;
```

- `state.uniforms` is where the sketch keeps the knobs it made in step 2; `ctx.params` holds the
  sliders' current settings, and `ctx.audio` the sound. (`...` marks lines left out.)
- Line 1 copies the **Zoom** slider into the `uZoom` knob.
- Line 3 copies the live bass loudness from the microphone into `uBass`.

The names must match exactly in all three places. If the shader says `uZoom` and JavaScript says
`uzoom`, the knob is never turned and the shader keeps the default value.

## Two knobs you get for free

In `shader` mode the app adds two uniforms itself, in `src/core/SketchRunner.js`:
- `uTime`: seconds since the sketch started. This makes things move.
- `uResolution`: the screen's width and height in pixels. Sketches use it so circles stay round on wide
  screens:

```glsl
uv.x *= uResolution.x / uResolution.y;
```

  This stretches the across direction by how much wider the screen is than it is tall.

## Knobs that hold more than one number

`vec2` holds two numbers (like a position), `vec3` holds three (like a colour), and `sampler2D` holds a
whole picture (see [Textures](textures.md)). In The Oldest Light (`src/sketches/cmbPlanck.js`):

```glsl
uniform vec3 uW;          // weights of the full map, the large-scale band and the peak band
```

These three numbers decide how much of each version of the sky map to show. The sketch fades between them
by turning this knob.

**Try this:** in `audioReactiveJulia.js`, in `update`, change `= ctx.params.zoom;` to `= 0.5;`. Now the
zoom slider does nothing: the knob is stuck at 0.5, and the fractal sits small in the middle of the screen.

**Related:** [Shaders: two questions](shaders.md) · [Textures](textures.md) · [Params: the sliders](params.md) ·
[GLSL basics: reading a shader](glsl-basics.md)
