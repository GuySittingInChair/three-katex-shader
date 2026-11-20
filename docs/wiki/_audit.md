---
summary: The log of the full error check of every wiki page: what was checked, what was wrong, what was fixed.
added: 2026-11-20
---

# Wiki audit log

Every page is read start to finish by Claude (not the local AI), and every number, quote and claim is checked
against the code or a source. Each entry says how it was checked and what was wrong. Started 2026-11-20.

How things are checked:
- **Quotes:** `tests/wiki.test.mjs` fails if any quoted code block no longer matches its file.
- **Numbers:** worked out again by running the same calculation (Python or Node), not by eye.
- **Colours:** worked out from the code's own numbers; the colour samples on the pages are those results.

## Pages

| Page | Checked | What was wrong, and the fix |
|---|---|---|
| [Colour 1: RGB, three numbers](rgb.md) | 2026-11-20 | Said bezierDeCasteljau writes `new THREE.Color(0.95, 0.76, 0.42)`; it writes `col(0.95, …)`, a short name for it. Said hue 0.6 is blue; it's a sky blue (pure blue is 0.67). Added: the full list of hues, and the boids' speed worked through to its colour for five speeds (checked: the boids shader adds no shading, and the site copies colours to the screen unchanged, so the samples match what you see). |
| [Colour 3: the cosine palette](cosine-palette.md) | 2026-11-20 | **Wrong:** said the brightest colour goes red → green → blue; worked out, it goes red → blue → green (the colour wheel backwards). Said 30 sketches use it and "most kali* sketches"; it's 43 by searching the code, and every kali* sketch (as `rainbow`). The "sunset" example left out brown and near-black. Added: a table of `t` → red, green, blue → colour, and one input worked step by step. |
| [Colour 4: colour scales](colour-scales.md) | 2026-11-20 | A sentence started mid-line in lower case after "See Blending."; rewritten. "The site's background is black" is no longer always true (palettes); now says the sketches are drawn on black. Added: six real temperatures worked through the Planck scale, with one step by step. |
| [Shaders: two questions](shaders.md) | 2026-11-20 | "About 40 3d sketches" → 38 of 79 (counted). **Wrong "Try this":** said the edit makes the rainbow "pale, washed-out"; made the edit in the real sketch: a dark patch and near-white patches appear along the diagonal, with green and magenta either side. Rewritten to match, with why. |
| [Random numbers, and seeds](randomness.md) | 2026-11-20 | The bell-curve line was shown after the fly-brain paragraph, as if from that file; it's from antiAircraftContraception.js (and intercept.js). Now says so. "Try this" checked by running the Game of Life rules from a 5% start: ~220 cells → a few dozen after one tick, settling at 13–37; added that a few small survivors remain. Seed formula, Park–Miller numbers and mulberry32 seed checked in the code. |
| [Sine and cosine](sine-and-cosine.md) | 2026-11-20 | **Wrong:** said cosine is "a quarter-turn behind" sine; it is a quarter-turn ahead. Count of 151 of 166 sketches checked. |
| [Noise](noise.md) | 2026-11-20 | Listed Displaced Icosphere among the noise recipes; it fakes noise with stacked sine waves (now said). Count of 14 checked. "Try this" made in the real sketch: smooth blobs as described, and much darker, which the page didn't say (one layer sums to at most 0.5, five to 0.97); added. |
| [Uniforms](uniforms.md) | 2026-11-20 | A misnamed uniform doesn't "keep the default value"; the shader reads 0. "Try this" direction checked (`uv /= uZoom`, so 0.5 makes the fractal smaller). |
| [Mesh, geometry and material](mesh-geometry-material.md) | 2026-11-20 | `BufferGeometry` count 37 → 33. "Line 3 counts the corners" left out that this shape stores 960 corners for 320 triangles (each shared point stored five or six times); added, with why the sketch's way of moving them doesn't tear the surface (checked in the code). Try-this triangle counts (320 → 80) checked with three.js. |
| [Motion and the live equation](motion-and-latex.md) | 2026-11-20 | No errors found. Checked: 101 / 164 counts, PERIOD 18, KAPPA_MAX 0.9, phaseOf in src/lib/motion.js, ctx.motion set in SketchRunner. |
| [Lines and points](lines-and-points.md) | 2026-11-20 | No errors found. Checked: 41 / 20 counts, CURVE_SAMPLES 128, width default 3, `tmp` colour, dot sizes. |
| [Blending, adding, dimming and gain](colour-blending-and-gain.md) | 2026-11-20 | **Nonsense sentence** "the dots chain steps one after another" was still there (I had said it was fixed on 2026-11-19; it wasn't); rewritten. `caustic` range corrected (up to about 2, clamped at 2.2, a little more at fractal edges). Colour samples for both curve colours added. "Try this" now also says the curve is rubbed out as the dot slides back. |
| [Textures](textures.md) | 2026-11-20 | "Pure black means as cold as it gets" mixed up three separate maps stored in the three colour channels; now per channel. Counts (15 DataTexture, 12 CanvasTexture, 5 GPU simulations), the colour-space line and the poop sketches' canvas faces checked. |
| [GLSL basics](glsl-basics.md) | 2026-11-20 | 126 → 125 files. Missing nuance: this sketch doesn't correct for the wide screen, so its "ring" is really a wide oval (seen in the sketch); now explained, with a pointer to the line other sketches use. |
| [Glow](glow.md) | 2026-11-20 | Said its tone map is "the same" as Abyssal Bloom's; both are ACES-style but different formulas (fitted vs one-line); corrected. Threshold made exact: halos fade in from 0.8 of white and are full from 1.33. 13 users, 3 blur levels, phone fov widening and the glow slider checked in code. |
| [Lights](lights.md) | 2026-11-20 | No errors found. Checked: 13 sketches with lights, the named examples, lights removed in `dispose`. |
| [Instancing](instancing.md) | 2026-11-20 | "Hue 0.6 is blue" → sky blue (as on the RGB page). Count 12 and cone sizes checked. |
| [Render targets](render-targets.md) | 2026-11-20 | No errors found. Checked: the 5 sketches, 60-steps-per-frame cap, float fallback warning, RATE → loop length (100 ÷ 4 = 25 s). |
| [Scene and camera](scene-and-camera.md) | 2026-11-20 | No errors found. Checked: camera (0, 0, 3), 75°, 0.01–1000, orthographic for shaders, orbit target in the Try-this. |
| [How the camera moves](camera-and-controls.md) | 2026-11-20 | No errors found. Checked: 60 orbit sketches, Ctrl + wheel zoom (main.js), 105 s per look-around turn, 3.8 → 6 units. |
| [The frame loop](frame-loop.md) | 2026-11-20 | 96 → 98 sketches with `dispose`. Runner's own clean-up checked. |
| [Params](params.md) | 2026-11-20 | No errors found. Checked: 166 with params, SPECIES names, speed scales `motionTime`, zoom direction. |
| [The sketch format](sketch-format.md) | 2026-11-20 | Left out the Experiments group of shelves; added. 7 sketches with actions, search reading tags checked. |
| [What a sketch is](what-is-a-sketch.md) | 2026-11-20 | No errors found. Checked: 87 / 79, gradientPlane the shortest file (38 lines). |
| [How the files fit together](how-the-files-fit.md) | 2026-11-20 | **Invented example:** "earthquake records"; the project has no earthquake data. Replaced with the real sunspot records. `tools/` isn't only Python; `docs/` also holds galaxy-engine.md; both added. A copied sketch does appear (new sketches are published unless marked otherwise), checked. |
| [Values, names and comments](js-values-and-variables.md) | 2026-11-20 | No errors found. |
| [Functions and arrows](js-functions.md) | 2026-11-20 | "Each half pausing for a moment" made exact from `segments`: 3.2 of each 8 seconds still. |
| [Decisions and loops](js-decisions-and-loops.md) | 2026-11-20 | **Wrong "Try this":** said faint streaks appear; made the edit in the real sketch: the lines swell into bright wedges just before each fork (where settling is slowest), the rest barely changes. Rewritten. |
| [Lists and objects](js-arrays-and-objects.md) | 2026-11-20 | Said `Float32Array` here is packed "so the graphics chip can read it fast"; this one is only read by JavaScript. Reworded. |
| [Loading data](js-promises-and-fetch.md) | 2026-11-20 | No errors found. Checked: exactly these 16 sketches call `fetch`. |
