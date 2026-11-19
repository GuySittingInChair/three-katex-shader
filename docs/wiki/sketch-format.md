# The sketch format: every field

**In one sentence:** a sketch file is one big labelled list (an *object*, see
[Lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)), and each label, called a *field*, has a fixed job.

**Picture it:** a form with boxes. "Name", "Description", "Which shelf". Some boxes hold words, some hold
numbers, and a few hold instructions (`setup`, `update`). The app (the website's own code, which runs every sketch) reads the form and knows what to do.

**Why it matters:** every one of the 166 sketches uses the same boxes. Learn them once and you can open
any file and know which part does what.

## The labels (shown in the app)

| Field | What it holds | What you see |
|---|---|---|
| `name` | The title, in quotes. | The title at the top and in the gallery. |
| `description` | A sentence or two. | The text under the title. |
| `tags` | A list of keywords, like `['chaos', 'logistic-map']`. | Nothing directly. The search box on the Sketches page (the gallery of all sketches) looks through them. |
| `category` | One shelf name, like `'Chaos'`. | Which shelf of the gallery the sketch sits on. `src/core/taxonomy.js` groups shelves into Mathematics, Systems, Fields, Geometry, Rendering and Audio. |

## How it is drawn

| Field | What it holds | What you see |
|---|---|---|
| `mode` | `'shader'` or `'3d'`. | `'shader'` is one flat picture filling the screen. `'3d'` is a 3D scene. |
| `controls` | `'orbit'`, or missing. | With `'orbit'` you can drag to turn the camera around the scene. See [How the camera moves](camera-and-controls.md). |
| `wheelZoom` | `true`, or missing. | With `true`, the mouse wheel zooms instead of flipping to the next sketch. |
| `shaderLang` | `'glsl'`. | Nothing. It is a note saying which shader language the file uses. |

## The moving parts

| Field | What it holds | What you see |
|---|---|---|
| `params` | The sliders. | The **Params** panel. See [Params: the sliders](params.md). |
| `motion` | Instructions that turn the time into numbers. | Nothing directly, but those numbers drive the animation and the equation. See [Motion and the live equation](motion-and-latex.md). |
| `latex` | The equation, as text or as instructions that build text. | The equation on screen, with live numbers in yellow. See [Motion and the live equation](motion-and-latex.md). |
| `setup` | Instructions run once, at the start. | The scene appearing. See [The frame loop: setup, update, dispose](frame-loop.md). |
| `update` | Instructions run on every frame. | Everything that moves. |
| `dispose` | Instructions run once, when you leave. | Nothing. It frees memory. |
| `actions` | Buttons, each with a label and what to do. | Extra buttons in the Params panel, such as "Poke the dish" in Belousov–Zhabotinsky. 7 sketches have them. |

## Only in `shader` sketches

| Field | What it holds | What you see |
|---|---|---|
| `fragmentShader` | A GLSL program between backticks. | The whole picture. It decides the colour of every pixel. See [Shaders: two questions](shaders.md). |
| `uniforms` | A list of the knobs the shader reads. | Nothing directly. `update` copies slider values into them. See [Uniforms: knobs passed in from JavaScript](uniforms.md). |

**What it looks like in the code:** the opening of `src/sketches/boidsFlock.js`.

```js
name: 'Boids Flock',
description: 'Emergent flocking behavior from three simple local rules: separation, alignment, cohesion.',
tags: ['emergence', 'flocking', 'agents'],
category: 'Emergence',
mode: '3d',
controls: 'orbit',
```

- Line 1 is the title on screen.
- Line 2 is the sentence under it.
- Line 3: typing "flocking" into the gallery search finds this sketch.
- Line 4 puts it on the Emergence shelf.
- Line 5 makes it a 3D scene.
- Line 6 lets you drag the view around the flock.

**Try this:** delete the line `controls: 'orbit',` from `boidsFlock.js`. The flock still flies, but
dragging no longer turns the view. Put the line back afterwards.

**Related:** [What a sketch is](what-is-a-sketch.md) · [Params: the sliders](params.md) ·
[Motion and the live equation](motion-and-latex.md) · [The frame loop: setup, update, dispose](frame-loop.md)
