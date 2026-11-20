---
summary: Every technical word used on the site, explained in a line, with a link to the page that covers it.
added: 2026-11-18
---

# Glossary

One line per word, in alphabetical order, with a link to the page that explains it. Pages marked *(planned)*
don't exist yet; until then the link goes to the closest page that does.

- **actions**: extra buttons a sketch adds to the Params panel, like "Poke the dish". → [The sketch format:
  every field](sketch-format.md)
- **additive blending**: overlapping light adds up and gets brighter, like overlapping torch beams. → [Colour
  2: blending, adding, dimming and gain](colour-blending-and-gain.md)
- **aggregation**: things clumping together and sticking. → [Diffusion-Limited Aggregation: in plain
  English](sketches/diffusionLimitedAggregation.md)
- **alpha**: a colour's fourth number, how solid it is: 1 solid, 0 invisible. → [Colour 1: RGB, three
  numbers](rgb.md)
- **array**: a numbered list of values, written `[ ]`, counting from 0. → [Reading JavaScript 4: lists
  (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
- **async / await**: marks a recipe that can pause to wait for a download without freezing the page. →
  [Reading JavaScript 5: loading data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md)
- **attribute**: a list holding one value per corner of a shape (position, colour). → [Drawing in 3D 2: mesh,
  geometry and material](mesh-geometry-material.md)
- **bell curve**: the hill shape of heights, exam marks and errors: most near the middle, few at the edges. →
  [Galton Board: in plain English](sketches/galtonBoard.md)
- **Bézier curve**: a smooth curve pulled towards a few control points, as in drawing programs. → [De
  Casteljau Bézier: in plain English](sketches/bezierDeCasteljau.md)
- **bifurcation**: the moment one steady behaviour splits into two, like a population starting to boom and
  bust. → [Bifurcation Diagram: in plain English](sketches/bifurcationDiagram.md)
- **binary file (`.bin`)**: numbers packed as raw bytes to keep downloads small. → [Reading JavaScript 5:
  loading data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md)
- **binomial distribution**: how often you get each number of heads from a set of coin flips. → [Galton Board:
  in plain English](sketches/galtonBoard.md)
- **bloom**: another name for glow. → [Glow: making bright things shine](glow.md)
- **burn-in**: running a rule many times and throwing the results away, so it settles first. → [Bifurcation
  Diagram: in plain English](sketches/bifurcationDiagram.md)
- **camera**: the viewpoint the 3D scene is photographed from. → [Drawing in 3D 1: the scene and the
  camera](scene-and-camera.md)
- **CanvasTexture**: a picture drawn on a hidden flat canvas, then used in the scene. → [Textures: pictures a
  shader can look things up in](textures.md)
- **category**: the gallery shelf a sketch sits on. → [The sketch format: every field](sketch-format.md)
- **catenoid**: the hourglass-shaped soap film stretched between two rings held apart. → [Helicoid ↔ Catenoid:
  in plain English](sketches/helicoidCatenoid.md)
- **caustic**: bright lines of light focused by a curved surface, like sunlight on a pool floor. → [Caustics:
  in plain English](sketches/causticsLight.md)
- **cellular automaton**: a grid of squares that each update by a simple rule about their neighbours. →
  [Conway's Game of Life: in plain English](sketches/gameOfLife.md)
- **chaos**: behaviour that never settles and where tiny changes lead to completely different results. →
  [Bifurcation Diagram: in plain English](sketches/bifurcationDiagram.md)
- **clamp**: keep a number between a lowest and highest value. → [GLSL basics: reading a
  shader](glsl-basics.md)
- **Clifford torus**: the perfectly balanced doughnut in the Hopf fibration, where every pair of its circles
  links once. → [Hopf Fibration: in plain English](sketches/hopfFibration.md)
- **colour scale**: a rule turning a measured number into a colour you can read back. → [Colour 4: colour
  scales for data, and how they are chosen](colour-scales.md)
- **comedy formula**: a true equation × an absurd noun, told deadpan (`src/lib/bit.js`).
- **comment**: a note for people, after `//` or between `/*` and `*/`, ignored by the computer. → [Reading
  JavaScript 1: values, names and comments](js-values-and-variables.md)
- **complex number**: two numbers bundled together, like a position across and up, that can be multiplied. →
  [Audio-Reactive Julia Set: in plain English](sketches/audioReactiveJulia.md) (math page *(planned)*)
- **connectome**: a wiring diagram of a brain: every neuron and who it talks to. → [Fly Connectome: in plain
  English](sketches/flyConnectome.md)
- **const / let**: make a named value; `const` never changes, `let` can. → [Reading JavaScript 1: values,
  names and comments](js-values-and-variables.md)
- **control point**: a point that pulls a curve towards it. A Bézier curve starts on the first control point
  and ends on the last, but usually misses the ones in between. → [De Casteljau Bézier: in plain
  English](sketches/bezierDeCasteljau.md)
- **cosine palette**: the one-line rainbow recipe: red, green and blue each rise and fall, out of step. →
  [Colour 3: the cosine palette (the rainbow trick)](cosine-palette.md)
- **ctx**: the bag of useful things the app hands a sketch: camera, scene, sliders, time. → [The frame loop:
  setup, update, dispose](frame-loop.md)
- **damping**: losing a little speed every step, like moving through honey, so things settle. →
  [Force-Directed Graph: in plain English](sketches/forceDirectedGraph.md)
- **DataTexture**: a grid of numbers made in code and handed to a shader as a picture. → [Textures: pictures a
  shader can look things up in](textures.md)
- **delta (`ctx.delta`)**: seconds since the last frame, about 0.017. → [The frame loop: setup, update,
  dispose](frame-loop.md)
- **destructuring**: taking several named values out of an object in one line, `const { a, b } = …`. →
  [Reading JavaScript 4: lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
- **diffusion**: spreading out from where there is more to where there is less, like ink in water. →
  [Belousov–Zhabotinsky: in plain English](sketches/belousovZhabotinsky.md)
- **dispose**: the clean-up step when you leave a sketch. → [The frame loop: setup, update,
  dispose](frame-loop.md)
- **diverging scale**: a colour scale with two colours meeting at a pale middle, for "above or below average".
  → [Colour 4: colour scales for data, and how they are chosen](colour-scales.md)
- **domain warping**: looking up noise at a position that has itself been pushed by noise; makes fake fluids.
  → [Fluid Dye: in plain English](sketches/fluidDye.md)
- **edge (graph)**: a link between two dots in a network. → [Force-Directed Graph: in plain
  English](sketches/forceDirectedGraph.md)
- **emergence**: order arising from simple local rules, with no leader. → [Boids Flock: in plain
  English](sketches/boidsFlock.md)
- **escape time**: how many rounds of a rule a point survives before flying off; it colours most fractals. →
  [Audio-Reactive Julia Set: in plain English](sketches/audioReactiveJulia.md)
- **Euler's method**: the simplest way to step a simulation forward: new value = old value + speed × time
  step. → [Kuramoto–Sivashinsky: in plain English](sketches/kuramotoSivashinsky.md)
- **excitable**: quiet until sparked, then it fires a wave and needs time to recover. → [Belousov–Zhabotinsky:
  in plain English](sketches/belousovZhabotinsky.md)
- **fbm**: noise stacked in layers, each twice as detailed and half as strong. → [Noise: randomness that looks
  natural](noise.md)
- **fetch**: ask for a file over the network. → [Reading JavaScript 5: loading data (`fetch`, `Promise`,
  `await`)](js-promises-and-fetch.md)
- **field**: one labelled box in a sketch file, like `name` or `update`. → [The sketch format: every
  field](sketch-format.md)
- **flat shading**: lighting each triangle as one flat face, for a cut-gem look. → [Displaced Icosphere: in
  plain English](sketches/displacedIcosphere.md)
- **float**: in GLSL, one number with a decimal point; write `1.0`, not `1`. → [GLSL basics: reading a
  shader](glsl-basics.md)
- **force-directed layout**: drawing a network by letting dots repel and links pull like springs. →
  [Force-Directed Graph: in plain English](sketches/forceDirectedGraph.md)
- **Fourier transform**: splitting a pattern into a mix of plain waves, like an equaliser splits music into
  bass and treble. → [Kuramoto–Sivashinsky: the bug that froze the flame](sketches/kuramotoSivashinsky-fix.md)
- **fractal**: a shape with detail at every zoom level, often made by repeating one simple step many times. →
  [Life-Warped Fractal: in plain English](sketches/lifeWarpedFractal.md)
- **fragment shader**: the shader that picks the colour of each pixel. → [Shaders: two questions](shaders.md)
- **frame**: one picture of the animation; about 60 are drawn each second. → [The frame loop: setup, update,
  dispose](frame-loop.md)
- **Fresnel effect**: surfaces seen edge-on reflect more than surfaces seen face-on, like a lake at a low
  angle. → [Iridescent Sphere: in plain English](sketches/iridescentSphere.md)
- **function**: a named, reusable recipe with inputs and a result. → [Reading JavaScript 2: functions and
  arrows (`=>`)](js-functions.md)
- **gain**: multiplying brightness up, like a microphone's gain knob. → [Colour 2: blending, adding, dimming
  and gain](colour-blending-and-gain.md)
- **Gaussian curvature**: how strongly a surface curves at a spot, in a way bending without stretching can't
  change. → [Helicoid ↔ Catenoid: in plain English](sketches/helicoidCatenoid.md)
- **geometry**: an object's shape, as corners and triangles. → [Drawing in 3D 2: mesh, geometry and
  material](mesh-geometry-material.md)
- **glider**: a five-square pattern in the Game of Life that crawls diagonally forever. → [Conway's Game of
  Life: in plain English](sketches/gameOfLife.md)
- **glow**: blurring the brightest parts of the picture and adding them back, so bright things shine. → [Glow:
  making bright things shine](glow.md)
- **GLSL**: the language shaders are written in. → [GLSL basics: reading a shader](glsl-basics.md)
- **golden angle**: about 137.5°, the turn that spaces sunflower seeds; used so loops never repeat exactly. →
  [Belousov–Zhabotinsky: in plain English](sketches/belousovZhabotinsky.md)
- **graph (network)**: dots joined by links, like a metro map. → [Force-Directed Graph: in plain
  English](sketches/forceDirectedGraph.md)
- **hash**: a scrambler that turns a position into a random-looking but repeatable number. → [Noise:
  randomness that looks natural](noise.md)
- **helicoid**: the spiral-staircase soap film you'd get on a twisted wire. → [Helicoid ↔ Catenoid: in plain
  English](sketches/helicoidCatenoid.md)
- **histogram**: a bar chart counting how often each result happened. → [Galton Board: in plain
  English](sketches/galtonBoard.md)
- **Hopf fibration**: the "3-sphere" (the three-dimensional surface of a ball in four dimensions) split into
  circles, every pair of them linked like chain links. → [Hopf Fibration: in plain
  English](sketches/hopfFibration.md)
- **HSL**: a colour as hue (place on the colour wheel), saturation (vividness) and lightness. → [Colour 1:
  RGB, three numbers](rgb.md)
- **hyperbolic geometry**: a world with more room the further out you go, like a crinkly lettuce leaf. →
  [Hyperbolic Tiling: in plain English](sketches/hyperbolicTiling.md)
- **if / else, `? :`**: choose what to do depending on a question. → [Reading JavaScript 3: decisions (`if`)
  and loops (`for`)](js-decisions-and-loops.md)
- **instancing**: drawing many copies of one shape in a single go. → [Drawing in 3D 6: many copies of one
  shape (instancing)](instancing.md)
- **integral**: in calculus, a running total; the integral of a wave is another, shifted wave. → [Radian628
  Integral-Warped GLSL Fractal: in plain English](sketches/different-this-time.md) (math page *(planned)*)
- **interference**: waves adding up where they agree and cancelling where they don't. → [Caustics: in plain
  English](sketches/causticsLight.md)
- **iridescence**: rainbow colours that change with the angle you look from, as on a soap bubble. →
  [Iridescent Sphere: in plain English](sketches/iridescentSphere.md)
- **isometry**: a bend that changes a shape without stretching or squashing any part of it. → [Helicoid ↔
  Catenoid: in plain English](sketches/helicoidCatenoid.md)
- **JSON**: a text format of labelled values, used for `meta.json` files. → [Reading JavaScript 5: loading
  data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md)
- **Julia set**: under the rule "square it, add c", the points that never fly off fill a shape (the *filled*
  Julia set); the Julia set is that shape's edge, where the fine lace is. → [Audio-Reactive Julia Set: in
  plain English](sketches/audioReactiveJulia.md)
- **kaleidoscope fold**: cutting the picture into wedges and folding them all onto one. → [Radian628 — Abyssal
  Bloom: in plain English](sketches/chatgpt-quantum.md)
- **Klein bottle**: a bottle whose inside is its outside; in three dimensions it must pass through itself. →
  [Klein Bottle: in plain English](sketches/kleinBottle.md)
- **Kuramoto–Sivashinsky equation**: the classic equation for a wrinkling flame front that never settles. →
  [Kuramoto–Sivashinsky: in plain English](sketches/kuramotoSivashinsky.md)
- **Laplacian (∇²)**: how different a spot is from the average of its neighbours. → [Kuramoto–Sivashinsky: in
  plain English](sketches/kuramotoSivashinsky.md)
- **LaTeX**: a way of writing math as text so it can be shown as a neat equation. → [Motion and the live
  equation](motion-and-latex.md)
- **lead (aiming)**: aiming ahead of a moving target, at where it will be when the shot arrives. → [Intercept:
  in plain English](sketches/intercept.md)
- **leaky integrate-and-fire**: a neuron as a leaky bucket that fires when it overflows. → [Fly Connectome: in
  plain English](sketches/flyConnectome.md)
- **lerp / mix**: blend between two values by a fraction from 0 to 1. → [Colour 2: blending, adding, dimming
  and gain](colour-blending-and-gain.md)
- **lesion**: damage to part of a brain. → [Fly Connectome: in plain English](sketches/flyConnectome.md)
- **light**: makes solid objects look solid; directional (Sun), ambient (glow), point (bulb), spot (torch),
  hemisphere (sky and ground). → [Drawing in 3D 4: lights](lights.md)
- **lines (fat lines)**: lines with a fixed width in pixels, from `src/lib/fatLines.js`. → [Drawing in 3D 3:
  lines and points](lines-and-points.md)
- **logarithmic spiral**: a spiral that looks the same at every size, like a snail shell. → [Radian628 —
  Abyssal Bloom: in plain English](sketches/chatgpt-quantum.md)
- **logistic map**: the simplest rule for a population that grows but crowds itself. → [Bifurcation Diagram:
  in plain English](sketches/bifurcationDiagram.md)
- **loop (`for`)**: repeat a block of code a set number of times. → [Reading JavaScript 3: decisions (`if`)
  and loops (`for`)](js-decisions-and-loops.md)
- **material**: how a surface looks: colour, gloss, how it reacts to light. → [Drawing in 3D 2: mesh, geometry
  and material](mesh-geometry-material.md)
- **matrix**: a block of 16 numbers storing where something is, how it is turned and how big it is. → [Drawing
  in 3D 6: many copies of one shape (instancing)](instancing.md)
- **mesh**: a visible solid object: geometry plus material. → [Drawing in 3D 2: mesh, geometry and
  material](mesh-geometry-material.md)
- **minimal surface**: a surface as small as possible for its edges, like a soap film. → [Enneper Surface: in
  plain English](sketches/enneperSurface.md)
- **Möbius strip**: a strip with a half-twist taped into a loop: it has only one side. → [Klein Bottle: in
  plain English](sketches/kleinBottle.md)
- **mode**: `'shader'` (one flat picture) or `'3d'` (a scene). → [What a sketch is](what-is-a-sketch.md)
- **motion**: the sketch's "time in, numbers out" recipe that drives the animation and the equation. → [Motion
  and the live equation](motion-and-latex.md)
- **neuron**: a nerve cell, which collects signals and fires when they add up past a threshold. → [Fly
  Connectome: in plain English](sketches/flyConnectome.md)
- **node**: a dot in a network. → [Force-Directed Graph: in plain English](sketches/forceDirectedGraph.md)
- **noise**: smooth, natural-looking randomness, like a rumpled bedsheet rather than TV static. → [Noise:
  randomness that looks natural](noise.md)
- **non-orientable**: one-sided: you can't paint an inside and an outside different colours. → [Klein Bottle:
  in plain English](sketches/kleinBottle.md)
- **normal**: the direction a bit of surface faces, needed for shading. → [Drawing in 3D 2: mesh, geometry and
  material](mesh-geometry-material.md)
- **normalise**: shrink or stretch an arrow to length 1, keeping only its direction. → [Audio-Reactive Mesh:
  in plain English](sketches/audioReactiveMesh.md)
- **object**: a set of labelled values, written `{ }`. → [Reading JavaScript 4: lists (arrays) and labelled
  boxes (objects)](js-arrays-and-objects.md)
- **octave**: one layer of fbm noise, twice the detail of the last (as an octave doubles a note's pitch). →
  [Noise: randomness that looks natural](noise.md)
- **Ollama**: a program that runs AI models on your own computer, with no internet and no account. → [Getting
  a second opinion on an explanation](getting-a-second-opinion.md)
- **orbit controls**: drag to turn the camera around the scene's centre. → [Drawing in 3D 5: how the camera
  moves](camera-and-controls.md)
- **orbit trap**: a tally of how often a point passes near a chosen shape while being folded; used for colour.
  → [Radian628 — Abyssal Bloom: in plain English](sketches/chatgpt-quantum.md)
- **orthographic camera**: a camera with no perspective; used by flat `shader` sketches. → [Drawing in 3D 1:
  the scene and the camera](scene-and-camera.md)
- **parametric surface**: a surface made by a formula that says where each point of a flat square goes. →
  [Enneper Surface: in plain English](sketches/enneperSurface.md)
- **params**: a sketch's sliders. → [Params: the sliders](params.md)
- **pentatonic scale**: a five-note scale (C D E G A) in which no notes clash, like the piano's black keys. →
  [Generative Synth: in plain English](sketches/generativeSynth.md)
- **perspective camera**: a camera where far things look smaller, like real life. → [Drawing in 3D 1: the
  scene and the camera](scene-and-camera.md)
- **phase**: how far through a loop we are, from 0 to 1. → [Motion and the live equation](motion-and-latex.md)
- **pinch point**: a spot where a surface comes to a sharp crease. → [Boy's Surface: in plain
  English](sketches/boysSurface.md)
- **ping-pong**: drawing back and forth between two hidden pictures, one simulation tick each time. →
  [Simulating on the graphics chip: render targets and ping-pong](render-targets.md)
- **pixel**: one tiny dot of the screen. → [Shaders: two questions](shaders.md)
- **Poincaré disk**: a round map of hyperbolic space where things shrink towards a rim that's infinitely far
  away. → [Hyperbolic Tiling: in plain English](sketches/hyperbolicTiling.md)
- **points (`THREE.Points`)**: a cloud of dots, for stars, sparks and data. → [Drawing in 3D 3: lines and
  points](lines-and-points.md)
- **probability**: how likely something is, from 0 (never) to 1 (certain). → [Galton Board: in plain
  English](sketches/galtonBoard.md)
- **procedural**: made by a recipe each time it's drawn, not painted or stored. → [Inferno Cape: in plain
  English](sketches/infernoCape.md)
- **projective plane**: the surface you'd get by gluing each edge point of a disc to its opposite; it can't be
  built in 3D without crossing itself. → [Boy's Surface: in plain English](sketches/boysSurface.md)
- **Promise**: a ticket for a result that will arrive later. → [Reading JavaScript 5: loading data (`fetch`,
  `Promise`, `await`)](js-promises-and-fetch.md)
- **proportional navigation**: homing by steering to keep the target's direction from changing. →
  [Anti-Aircraft Contraception: in plain English](sketches/antiAircraftContraception.md)
- **quaternion**: how 3D programs store which way something faces. → [Drawing in 3D 6: many copies of one
  shape (instancing)](instancing.md)
- **radians**: a way of measuring angles; a full turn is about 6.28 (2π), a quarter turn about 1.57. → [Sine
  and cosine: the wave-makers](sine-and-cosine.md)
- **random**: see *seed*. `Math.random()` gives a fresh number between 0 and 1 each time. → [Random numbers,
  and seeds that make them repeatable](randomness.md)
- **random walk**: moving by random steps, like a stumbling drunk. → [Diffusion-Limited Aggregation: in plain
  English](sketches/diffusionLimitedAggregation.md)
- **reaction–diffusion**: chemicals that react where they are and spread to their neighbours, making waves and
  spots. → [Belousov–Zhabotinsky: in plain English](sketches/belousovZhabotinsky.md)
- **rebuild (slider)**: a slider that restarts the sketch with the new value when you let go. → [Params: the
  sliders](params.md)
- **reflection in a circle**: a mirror that's a circle: points near its edge stay near, points deep inside are
  flung far out. → [Hyperbolic Tiling: in plain English](sketches/hyperbolicTiling.md)
- **render target**: a hidden picture a shader can draw into instead of the screen. → [Simulating on the
  graphics chip: render targets and ping-pong](render-targets.md)
- **Reynolds number**: tells you whether a swimmer lives in "honey world" (under 1) or "splashy world"
  (large). → [Anti-Aircraft Contraception: in plain English](sketches/antiAircraftContraception.md)
- **RGB**: a colour as three numbers: red, green and blue. → [Colour 1: RGB, three numbers](rgb.md)
- **rounding error**: the tiny mistake (about 1 part in 10 million billion) a computer makes on every sum. →
  [Kuramoto–Sivashinsky: the bug that froze the flame](sketches/kuramotoSivashinsky-fix.md)
- **saddle**: a surface curving up one way and down the other, like a pringle. → [Enneper Surface: in plain
  English](sketches/enneperSurface.md)
- **scene**: the 3D world holding every object, light and camera. → [Drawing in 3D 1: the scene and the
  camera](scene-and-camera.md)
- **seed**: a starting number that makes "random" results come out the same every time. → [Random numbers, and
  seeds that make them repeatable](randomness.md)
- **sequential scale**: a colour scale running dark to light in one direction, for "how much". → [Colour 4:
  colour scales for data, and how they are chosen](colour-scales.md)
- **setup**: the build-once step when a sketch starts. → [The frame loop: setup, update,
  dispose](frame-loop.md)
- **shader**: a small program on the graphics chip that answers "where does this corner go?" or "what colour
  is this pixel?". → [Shaders: two questions](shaders.md)
- **sine (`sin`)**: a calculation that turns a steadily growing number into a smooth wave between −1 and +1;
  cosine (`cos`) is the same wave a quarter-turn ahead. → [Sine and cosine: the
  wave-makers](sine-and-cosine.md)
- **simulation step**: moving a simulation forward by one small slice of time. → [Boids Flock: in plain
  English](sketches/boidsFlock.md) (simulation page *(planned)*)
- **smoothstep**: a soft switch from 0 to 1 between two values. → [GLSL basics: reading a
  shader](glsl-basics.md)
- **spectrum**: how loud each pitch in a sound is, from low to high. → [Audio-Reactive Mesh: in plain
  English](sketches/audioReactiveMesh.md)
- **state**: the things `setup` built, handed back to `update` on every frame. → [The frame loop: setup,
  update, dispose](frame-loop.md)
- **stereographic projection**: a shadow map of a sphere, as if lit by a lamp at its pole; circles stay
  circles. → [Hopf Fibration: in plain English](sketches/hopfFibration.md)
- **string**: text in quotes. → [Reading JavaScript 1: values, names and comments](js-values-and-variables.md)
- **surface**: a shape with no thickness, like a soap film or a sheet. → [Boy's Surface: in plain
  English](sketches/boysSurface.md)
- **swizzling**: picking parts of a GLSL value by letter: `.xy`, `.rgb`, `.xyx`. → [GLSL basics: reading a
  shader](glsl-basics.md)
- **synthesiser**: a machine (here, code) that makes musical tones electronically. → [Generative Synth: in
  plain English](sketches/generativeSynth.md)
- **tags**: keywords the gallery search looks through. → [The sketch format: every field](sketch-format.md)
- **terminal velocity**: the steady speed a falling thing reaches when air resistance balances gravity. →
  [Anti-Aircraft Contraception: in plain English](sketches/antiAircraftContraception.md)
- **texture**: a picture a shader can look things up in; often data in disguise. → [Textures: pictures a
  shader can look things up in](textures.md)
- **three.js (`THREE`)**: the toolbox for 3D drawing the whole project is built on. → [Drawing in 3D 1: the
  scene and the camera](scene-and-camera.md)
- **threshold**: the line a value must cross before something happens (a neuron firing, a pixel glowing). →
  [Fly Connectome: in plain English](sketches/flyConnectome.md)
- **tiling**: covering a floor (or a stranger space) with shapes, no gaps and no overlaps. → [Hyperbolic
  Tiling: in plain English](sketches/hyperbolicTiling.md)
- **tone map**: squeezing very bright colours back into what a screen can show, like a camera does. →
  [Radian628 — Abyssal Bloom: in plain English](sketches/chatgpt-quantum.md)
- **topology**: the study of shapes that only cares about what's joined to what, not about size or angles. →
  [Boy's Surface: in plain English](sketches/boysSurface.md)
- **typed array (`Float32Array`)**: a long list holding only numbers, packed for speed. → [Reading JavaScript
  4: lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
- **uniform**: a number handed from JavaScript to a shader, the same for every pixel. → [Uniforms: knobs
  passed in from JavaScript](uniforms.md)
- **update**: the step that runs on every frame. → [The frame loop: setup, update, dispose](frame-loop.md)
- **uTime, uResolution**: the two uniforms every `shader` sketch gets for free: the time and the screen size.
  → [Uniforms: knobs passed in from JavaScript](uniforms.md)
- **vec2, vec3, vec4**: GLSL bundles of 2, 3 or 4 numbers (positions, colours). → [GLSL basics: reading a
  shader](glsl-basics.md)
- **vector**: an arrow with a direction and a length, stored as numbers (x, y, z). → [Boids Flock: in plain
  English](sketches/boidsFlock.md) (math page *(planned)*)
- **velocity**: which way something is heading and how fast. → [Boids Flock: in plain
  English](sketches/boidsFlock.md)
- **vertex**: a corner of a triangle in a shape (plural: vertices). → [Drawing in 3D 2: mesh, geometry and
  material](mesh-geometry-material.md)
- **vertex shader**: the shader that says where each corner lands on screen. → [Shaders: two
  questions](shaders.md)
- **vignette**: darkening towards the edges of the picture. → [Caustics: in plain
  English](sketches/causticsLight.md)
- **vUv**: a pixel's position on screen, two numbers from 0 to 1. → [Shaders: two questions](shaders.md)
- **Web Worker**: a separate helper inside the browser that runs code in parallel with the drawing. → [Fly
  Connectome: in plain English](sketches/flyConnectome.md)
