---
summary: The sliders in the Params panel, and how code reads their values.
---

# Params: the sliders

**In one sentence:** `params` lists the sliders a sketch offers, with where each one starts and how far
it can go.

**Picture it:** the knobs on a radio. Each knob has a name (volume, tuning), a lowest setting and a
highest setting. The sketch reads the knobs on every frame (each fresh picture, about 60 a second), so turning one
changes the picture straight away.

**Why sketches need it:** they let you explore without editing code. Every sketch has a `params` field.

**Where you'll see it:** every sketch, and on screen in the **Params** panel in the dock.

**What it looks like in the code:** from `src/sketches/audioReactiveJulia.js`.

```js
params: {
  speed: { value: 0.6, min: 0, max: 3 },
  sensitivity: { value: 1.0, min: 0, max: 3 },
  zoom: { value: 1.4, min: 0.4, max: 4 },
},
```

- `params: {` opens the list of sliders.
- `speed:` is the slider's name. `value: 0.6` is where it starts, `min: 0` is the left end and `max: 3`
  is the right end.
- `sensitivity:` sets how strongly the music shakes the picture.
- `zoom:` sets how close you look.

Then, inside `update`, the sketch reads the current slider position:

```js
state.uniforms.uZoom.value = ctx.params.zoom;
```

- `ctx.params.zoom` is wherever the zoom slider is right now.
- The line copies it into the shader's knob called `uZoom`. See [Uniforms: knobs passed in from JavaScript](uniforms.md).

## Extra settings a slider can have

- `step: 1` makes the slider jump in whole numbers (1, 2, 3) instead of sliding smoothly.
- `options: [...]` turns the slider into a choice between named settings. In
  `src/sketches/belousovZhabotinsky.js`:

  ```js
  species: { value: 0, min: 0, max: SPECIES.length - 1, step: 1, options: SPECIES },
  ```

  `SPECIES` is a list of three names (the dye's colour, the activator, the catalyst). The panel shows the
  name, not the number 0, 1 or 2.

- `rebuild: true` means "this slider changes the shape itself, so start the sketch over". Most sliders
  are read on every frame, but some numbers are only used in `setup`, when the shape is built. With
  `rebuild: true`, letting go of the slider makes the app throw the sketch away and run `setup` again
  with the new value. In `src/sketches/enneperSurface.js`:

  ```js
  cubicCoeff: { value: 0.3333, min: 0, max: 1, rebuild: true }, // α
  ```

  Drag it and nothing happens while you drag. Let go, and the surface is rebuilt in its new shape.

## The `speed` slider is special

Many sketches have a slider called `speed`. If the sketch has a `motion` part (the recipe that turns the time
into the animation's numbers), the app uses `speed` to run the sketch's clock faster or slower, without making the animation jump. At `speed` 2, an 18-second
loop takes 9 seconds. See [Motion and the live equation](motion-and-latex.md).

**Try this:** in `audioReactiveJulia.js`, change zoom's `value: 1.4` to `value: 3`. The sketch now opens
zoomed in about twice as close, showing the fractal's lacy edge instead of its whole shape.

**Related:** [The sketch format: every field](sketch-format.md) · [Uniforms: knobs passed in from JavaScript](uniforms.md) ·
[Opening and changing a sketch safely](changing-a-sketch-safely.md)
