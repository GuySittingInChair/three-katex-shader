---
summary: A map of the whole project: every sketch, the techniques they use, and where their data comes from.
added: 2026-11-18
---

# Survey of the project

This is the map the wiki is built from. It lists what is actually in the project: the kinds of sketches,
the techniques they share, the science they lean on, and where every data set comes from. The full list of
sketches, oldest first, is at the end.

Update this file whenever a sketch, a data set or a shared technique is added.

## Kinds of sketch

There are two **modes**, which decide how a sketch draws:

| Mode | How many | What it means |
|---|---|---|
| `shader` | 87 | One flat picture filling the screen. A small program, the shader, picks the colour of every pixel. |
| `3d` | 79 | A 3D scene with objects, a camera and often lights. Usually you can drag to look around. |

A `2d` mode is reserved in `src/core/SketchRunner.js`, but no sketch uses it. Flat drawing happens in two
other ways: `shader` mode, and drawing onto a hidden 2D canvas that is then used as a picture
("canvas textures", 12 sketches).

**Categories.** Each sketch names one category, and `src/core/taxonomy.js` sorts categories into seven
groups (Mathematics, Systems, Fields, Geometry, Rendering, Audio, Experiments). The categories in use:
Fractals 43, Physics 27, Astronomy 16, Chaos 8, Biology 5, Topology 4, Geometry 4, Functional Analysis 4,
Reaction-Diffusion 3, Surfaces 3, Fluid Flow 3, Shaders 3, Knots 3, Particles 3, Waves 3, Splines 2,
Optics 2, Graphs & Networks 2, Procedural Textures 2, Dynamical Systems 2, Algebraic Art 2, Chemistry 2,
and one each for Audio-Reactive, Audio-Reactive Fractal, Visualization, Emergence, Growth, Meshes,
Probability, Cellular Automata, Synthesis, Non-Euclidean, Materials, 3D, Waveforms, Optimization,
Ray Tracing, Spectra, 4D, Number Theory, Vector Fields and Voxels.

## Techniques used in more than one sketch

| Technique | Sketches | Wiki page |
|---|---|---|
| Full-screen shader picture (`shader` mode) | 87 | [Shaders: two questions](shaders.md) |
| Shader programs inside 3D scenes (`ShaderMaterial`) | about 40 more | [Shaders: two questions](shaders.md) |
| Uniforms: numbers handed from JavaScript to a shader | nearly all | [Uniforms: knobs passed in from JavaScript](uniforms.md) |
| A closed-form loop (`motion(t)`, `src/lib/motion.js`) | 101 | *(planned: animation and timing)* |
| Smooth steps and fades (`smoothstep`, `smooth`) | about 95 | *(planned: animation and timing)* |
| Blending two values (`mix`, `lerp`) | about 100 | [Colour 2: blending, adding, dimming and gain](colour-blending-and-gain.md) |
| The cosine colour palette | 30 | [Colour 3: the cosine palette (the rainbow trick)](cosine-palette.md) |
| Sine and cosine waves | 151 | [Sine and cosine: the wave-makers](sine-and-cosine.md) |
| Colour scales for data (CMB, temperature, density) | the data sketches | [Colour 4: colour scales for data, and how they are chosen](colour-scales.md) |
| Meshes, geometry and materials | all `3d` sketches | [Drawing in 3D 2: mesh, geometry and material](mesh-geometry-material.md) |
| Screen-width lines and dots (`src/lib/fatLines.js`) | 41 | [Drawing in 3D 3: lines and points](lines-and-points.md) |
| Clouds of points (`THREE.Points`) | 20 | [Drawing in 3D 3: lines and points](lines-and-points.md) |
| Many copies of one shape (`InstancedMesh`) | 12 | [Drawing in 3D 6: many copies of one shape (instancing)](instancing.md) |
| Lights | 13 | [Drawing in 3D 4: lights](lights.md) |
| Orbit camera you can drag (`controls: 'orbit'`) | 60 | [Drawing in 3D 5: how the camera moves](camera-and-controls.md) |
| Textures: pictures a shader looks things up in | many | [Textures: pictures a shader can look things up in](textures.md) |
| Drawing on a hidden 2D canvas (`CanvasTexture`) | 12 | *(planned: drawing in 2D)* |
| Grids of numbers stored as a picture (`DataTexture`) | 15 | [Textures: pictures a shader can look things up in](textures.md) |
| Simulating on the GPU by rendering back and forth (`WebGLRenderTarget`) | 5 | [Simulating on the graphics chip: render targets and ping-pong](render-targets.md) |
| Ray marching distance fields (3D shapes drawn by a shader) | 13 | *(planned: shaders, part 2)* |
| Escape-time fractals (repeat z → z² + c) | many of the 43 fractals | *(planned: math)* |
| Surfaces that change shape on the GPU (`src/lib/morphSurface.js`) | 5 | [Drawing in 3D 2: mesh, geometry and material](mesh-geometry-material.md) |
| Stepping a simulation forward in time (Euler, Runge–Kutta, Verlet) | 20 | *(planned: simulation)* |
| Loops that refine a guess (Newton's method) | 10 | *(planned: math)* |
| Realistic scenes (`src/lib/environment.js`) | 9 | *(planned)*; also docs/guide.md §13 |
| The comedy formula (`src/lib/bit.js`) | 33 | docs/guide.md §12 |
| Soft glow (`src/lib/glow.js`) | 13 | [Glow: making bright things shine](glow.md) |
| Noise and fbm (home-made smooth randomness) | 14 | [Noise: randomness that looks natural](noise.md) |
| Random numbers and seeds (`Math.random`, seeded generators) | many | [Random numbers, and seeds that make them repeatable](randomness.md) |
| Sliders that rebuild the sketch (`rebuild: true`) | several | [Params: the sliders](params.md) |
| Kuramoto–Sivashinsky solver (`src/lib/kuramotoSivashinsky.js`) | 5 | *(planned: science)* |
| Voronoi cells (`src/lib/voronoi.js`) | 2 | *(planned: math)* |
| Live sound input (`ctx.audio`) | 8 | *(planned: audio)* |
| Loading data files (`fetch`) | 16 | [Reading JavaScript 5: loading data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md) |
| Map projections (Mollweide, gnomonic) | 2 | *(planned: maps and the sky)* |
| Buttons on a sketch (`actions`) | 7 | [The sketch format: every field](sketch-format.md) |

Techniques found in only one sketch (for example the 3D galaxy engine in `src/lib/galaxy/`, used by
Messier in Depth and described in `docs/galaxy-engine.md`) are explained in that sketch's walkthrough.

## Science and math topics

- **Fractals:** Julia and Mandelbrot sets, Newton's fractal, Kali-style folding fractals (the `kali*`
  sketches), Radian628's integral-warped fractals (the `radian628*` sketches), the Mandelbulb, Mandelbox,
  Menger sponge, Kleinian and pseudo-Kleinian sets, iterated function systems, the dragon curve.
- **Chaos and dynamical systems:** the logistic map and bifurcation, the Lorenz attractor, the double
  pendulum, the Kuramoto–Sivashinsky equation, synchronisation (fireflies), predator and prey.
- **Patterns in chemistry and biology:** reaction–diffusion (Belousov–Zhabotinsky, Brusselator,
  Gray–Scott), Liesegang rings, diffusion-limited growth, phyllotaxis (sunflowers), flocking (boids),
  a fruit-fly connectome, epidemic models (SIR).
- **Geometry and topology:** surfaces (Möbius strip, Klein bottle, Boy's surface, Enneper, helicoid,
  minimal surfaces), knots, the Hopf fibration, the tesseract (4D), hyperbolic and Penrose tilings,
  Voronoi cells, Bézier and NURBS curves, the brachistochrone.
- **Waves, signals and Fourier:** Fourier series and epicycles, Chladni plates, wave interference,
  caustics, oscilloscopes and spectra, orthogonal polynomials (Gram–Schmidt), weak convergence.
- **Physics:** Newtonian gravity (n-body, orbits), fluids (Navier–Stokes), the Ising model, special
  relativity (Lorentz boosts, the twin paradox, relativistic flight, the Terrell rotation), general
  relativity (black-hole lensing, Einstein rings, wormholes, Penrose diagrams, spaghettification),
  quantum mechanics (tunnelling, hydrogen orbitals, coherent states), Noether's theorem.
- **Astronomy, with real data:** the cosmic microwave background and its power spectrum, spherical
  harmonics, Cepheid variable stars and the distance ladder, Type Ia supernovae and the accelerating
  universe, galaxy rotation curves and missing mass, the cosmic web of galaxies, exoplanets and the
  transit method, Kepler's laws, pulsars, gravitational waves, the Sun's spot cycle, the asteroid belt,
  Gaia's map of nearby stars, the Voyager flybys, the Messier catalogue, the JWST deep field.

## Data sources

Every data set lives in `public/data/<folder>/` and is made once, on this computer, by a Python script in
`tools/<folder>/`. The site never contacts the original archives; it loads the prepared files.

| Folder | Used by | Original source | Published by |
|---|---|---|---|
| `cmb` | The Oldest Light (`cmbPlanck.js`) | Planck 2015 Commander CMB map (HEALPix), via IRSA | ESA Planck team; IRSA at Caltech/IPAC |
| `cepheids` | `cepheids.js` | Gaia DR3 Cepheid table | ESA Gaia |
| `gaia` | `gaiaNeighbourhood.js` | Gaia DR3 stars within 100 parsecs | ESA Gaia |
| `stars` | `messierInDepth.js` | Hipparcos catalogue, IAU star names | ESA; International Astronomical Union |
| `asteroids` | `asteroidBelt.js` | JPL Small-Body Database | NASA JPL |
| `exoplanets` | `exoplanets.js` | NASA Exoplanet Archive (pscomppars) | NASA / Caltech IPAC |
| `kepler` | `keplerEleven.js` | Kepler-11 light curve | NASA Kepler mission, via MAST |
| `pulsars` | `pulsars.js` | ATNF Pulsar Catalogue v2.6.1 | CSIRO Australia Telescope National Facility |
| `gw` | `gwChirp.js` | LIGO strain data for GW150914 | LIGO / GWOSC |
| `sn` | `snAcceleration.js` | Pantheon+ supernova distances | Scolnic, Brout et al. 2022 (public release) |
| `sparc` | `missingMass.js` | SPARC galaxy rotation curves | Lelli, McGaugh & Schombert 2016 |
| `sdss` | `sdssCosmicWeb.js` | SDSS DR18 galaxy spectra | Sloan Digital Sky Survey |
| `sun` | `sunCycle.js` | Greenwich sunspot groups (1874–2016); SILSO sunspot number | NASA MSFC archive; Royal Observatory of Belgium |
| `voyager` | `voyagerTour.js` | JPL Horizons positions | NASA JPL |
| `deepfield` | `webbDeepField.js` | JADES DR2 images and DR4 spectra | JWST JADES team, via MAST |
| `zoom` | `skyZoom.js` | Gaia DR3, DSS2 plates via SkyView, JADES | ESA; NASA SkyView |
| `messier` | `messierInDepth.js` | Wikipedia (facts, CC BY-SA); DSS2 plates via SkyView | Wikipedia; NASA SkyView |
| `deepsky`, `arp`, `pairs`, `motion` | `messierInDepth.js` | NED (positions, redshifts, distances), Wikipedia, DSS via SkyView, published papers | NASA/IPAC NED |
| `galaxies/m51` | `messierInDepth.js` | DSS2 plates, NED, Wikipedia, published fits | as above |

**File formats in `public/data/`:**
- `meta.json`: a text file of labelled numbers and notes (counts, fitted values, sources).
- `*.bin`: long runs of numbers packed tightly as raw bytes, to keep downloads small. Each build
  script's opening comment says exactly how they are packed.
- `sky.png` (CMB): a picture used as data. Its red, green and blue channels hold three different
  versions of the temperature map, not colours.
- `atlas.jpg`: many small pictures packed into one big one.
- `*.jpg` in `img/`: ordinary photographs (sky-survey plates turned into colour).

**Formats the scripts read (never sent to the browser):** FITS (astronomy's standard image and table
format), CSV (tables as text), HEALPix (a way of cutting the sphere of the sky into equal-area pixels,
used by the Planck map), HTML and JSON answers from NED, Wikipedia and SkyView.

## Shared code in `src/lib/`

`motion.js` (loop timing), `fatLines.js` (lines and dots), `morphSurface.js` + `surfaceMaterial.js`
(GPU surfaces), `environment.js` (realistic scenes), `bit.js` (comedy timing), `glow.js`, `voronoi.js`,
`kuramotoSivashinsky.js`, `curves.js`, `parametric.js`, `equation.js`, `hopf.js`, `skullHead.js`,
`flyConnectome.js`, `galaxy/` (galaxy engine) and `sky/` (star layer).

## Existing documentation (kept as it is)

- `docs/guide.md`: the field guide shown in the app's Explain panel (press E). Written for experts; its
  "annotated" sections are deep dives into single sketches. The wiki links to it but does not replace it.
- `docs/galaxy-engine.md`: how the galaxy engine works.

## Writing plan

1. Foundations (done first): start here, the sketch format, reading JavaScript, drawing in 3D, shaders,
   colour, glossary.
2. Walkthroughs in batches of about ten, oldest first, in the order of the table below.
3. Remaining sections: drawing in 2D, animation and timing, math, simulation, maps and the sky, science
   explainers, data, equations, asking Claude for help.

## Every sketch, oldest first

The first 75 arrived together in the initial commit (2026-09-21) and are listed alphabetically within that
day. "Walkthrough" links to the plain-English page where one exists.

| Added | File | Name | Mode | Category | Walkthrough |
|---|---|---|---|---|---|
| 2026-09-21 | `audioPulse.js` | Audio Pulse | shader | Audio-Reactive | [walkthrough](sketches/audioPulse.md) |
| 2026-09-21 | `audioReactiveJulia.js` | Audio-Reactive Julia Set | shader | Audio-Reactive Fractal | [walkthrough](sketches/audioReactiveJulia.md) |
| 2026-09-21 | `audioReactiveMesh.js` | Audio-Reactive Mesh | 3d | Visualization | [walkthrough](sketches/audioReactiveMesh.md) |
| 2026-09-21 | `belousovZhabotinsky.js` | Belousov–Zhabotinsky | shader | Reaction-Diffusion | [walkthrough](sketches/belousovZhabotinsky.md) |
| 2026-09-21 | `bezierDeCasteljau.js` | De Casteljau Bézier | 3d | Splines | [walkthrough](sketches/bezierDeCasteljau.md) |
| 2026-09-21 | `bifurcationDiagram.js` | Bifurcation Diagram | shader | Chaos | [walkthrough](sketches/bifurcationDiagram.md) |
| 2026-09-21 | `boidsFlock.js` | Boids Flock | 3d | Emergence | [walkthrough](sketches/boidsFlock.md) |
| 2026-09-21 | `boysSurface.js` | Boy's Surface | 3d | Topology | [walkthrough](sketches/boysSurface.md) |
| 2026-09-21 | `causticsLight.js` | Caustics | shader | Optics | [walkthrough](sketches/causticsLight.md) |
| 2026-09-21 | `chatgpt-quantum.js` | Radian628 — Abyssal Bloom (Hyper-Vibrant Log Spiral) | shader | Fractals | [walkthrough](sketches/chatgpt-quantum.md) |
| 2026-09-21 | `different-this-time.js` | Radian628 Integral-Warped GLSL Fractal | shader | Fractals | [walkthrough](sketches/different-this-time.md) |
| 2026-09-21 | `diffusionLimitedAggregation.js` | Diffusion-Limited Aggregation | shader | Growth | [walkthrough](sketches/diffusionLimitedAggregation.md) |
| 2026-09-21 | `displacedIcosphere.js` | Displaced Icosphere | 3d | Meshes | [walkthrough](sketches/displacedIcosphere.md) |
| 2026-09-21 | `enneperSurface.js` | Enneper Surface | 3d | Surfaces | [walkthrough](sketches/enneperSurface.md) |
| 2026-09-21 | `fluidDye.js` | Fluid Dye | shader | Fluid Flow | [walkthrough](sketches/fluidDye.md) |
| 2026-09-21 | `flyConnectome.js` | Fly Connectome | 3d | Graphs & Networks | [walkthrough](sketches/flyConnectome.md) |
| 2026-09-21 | `forceDirectedGraph.js` | Force-Directed Graph | 3d | Graphs & Networks | [walkthrough](sketches/forceDirectedGraph.md) |
| 2026-09-21 | `galtonBoard.js` | Galton Board | 3d | Probability | [walkthrough](sketches/galtonBoard.md) |
| 2026-09-21 | `gameOfLife.js` | Conway's Game of Life | shader | Cellular Automata | [walkthrough](sketches/gameOfLife.md) |
| 2026-09-21 | `generativeSynth.js` | Generative Synth | shader | Synthesis | [walkthrough](sketches/generativeSynth.md) |
| 2026-09-21 | `gradientPlane.js` | Gradient Plane | shader | Shaders | [walkthrough](sketches/gradientPlane.md) |
| 2026-09-21 | `helicoidCatenoid.js` | Helicoid ↔ Catenoid | 3d | Surfaces | [walkthrough](sketches/helicoidCatenoid.md) |
| 2026-09-21 | `hopfFibration.js` | Hopf Fibration | 3d | Topology | [walkthrough](sketches/hopfFibration.md) |
| 2026-09-21 | `hyperbolicTiling.js` | Hyperbolic Tiling | shader | Non-Euclidean | [walkthrough](sketches/hyperbolicTiling.md) |
| 2026-09-21 | `infernoCape.js` | Inferno Cape | shader | Procedural Textures | [walkthrough](sketches/infernoCape.md) |
| 2026-09-21 | `iridescentSphere.js` | Iridescent Sphere | 3d | Materials | [walkthrough](sketches/iridescentSphere.md) |
| 2026-09-21 | `kleinBottle.js` | Klein Bottle | 3d | Topology | [walkthrough](sketches/kleinBottle.md) |
| 2026-09-21 | `kuramotoSivashinsky.js` | Kuramoto–Sivashinsky | shader | Chaos | [walkthrough](sketches/kuramotoSivashinsky.md) |
| 2026-09-21 | `kuramotoSivashinskyLife.js` | Kuramoto–Sivashinsky — Life-Seeded | shader | Chaos | [walkthrough](sketches/kuramotoSivashinskyLife.md) |
| 2026-09-21 | `lifeWarpedFractal.js` | Life-Warped Fractal | shader | Fractals | [walkthrough](sketches/lifeWarpedFractal.md) |
| 2026-09-21 | `lissajousKnot.js` | Lissajous Knot | 3d | Knots |  |
| 2026-09-21 | `lorenzAttractor.js` | Lorenz Attractor | 3d | Dynamical Systems |  |
| 2026-09-21 | `mandelbulb.js` | Mandelbulb | shader | Fractals |  |
| 2026-09-21 | `marbleTexture.js` | Marble Texture | shader | Procedural Textures |  |
| 2026-09-21 | `mengerSponge.js` | Menger Sponge | shader | Fractals |  |
| 2026-09-21 | `metaballs.js` | Metaballs | shader | 3D |  |
| 2026-09-21 | `mobiusStrip.js` | Möbius Strip | 3d | Topology |  |
| 2026-09-21 | `navierStokesVortex.js` | Navier–Stokes Vortex | shader | Fluid Flow |  |
| 2026-09-21 | `nBodyGravity.js` | N-Body Gravity | 3d | Physics |  |
| 2026-09-21 | `newtonFractal.js` | Newton Fractal | shader | Algebraic Art |  |
| 2026-09-21 | `nurbsWeightPatch.js` | NURBS Weight Patch | 3d | Splines |  |
| 2026-09-21 | `oscilloscope.js` | Oscilloscope | shader | Waveforms |  |
| 2026-09-21 | `particleFountain.js` | Particle Fountain | 3d | Particles |  |
| 2026-09-21 | `particleSwarmOptimization.js` | Particle Swarm Optimization | 3d | Optimization |  |
| 2026-09-21 | `penroseTiling.js` | Penrose Multigrid | shader | Geometry |  |
| 2026-09-21 | `plasmaWaves.js` | Plasma Waves | shader | Shaders |  |
| 2026-09-21 | `radian-628-gemini.js` | Radian628 — Abyssal Bloom | shader | Fractals |  |
| 2026-09-21 | `radian-628-quantum-neural-network.js` | Radian628 — Quantum Abyss Neural | shader | Fractals |  |
| 2026-09-21 | `radian628-gpt.js` | Radian628 — Abyssal Bloom | shader | Fractals |  |
| 2026-09-21 | `radian628-log.js` | Radian628 — Abyssal Bloom (Hyper-Vibrant Log Spiral) | shader | Fractals |  |
| 2026-09-21 | `radian628-quantum-abyss-bezier.js` | Radian628 — Quantum Abyss Bézier | shader | Fractals |  |
| 2026-09-21 | `radian628Audio.js` | Radian628 — Audio Reactive | shader | Fractals |  |
| 2026-09-21 | `radian628Classic.js` | Radian628 — Classic | shader | Fractals |  |
| 2026-09-21 | `radian628Glow.js` | Radian628 — Glow | shader | Fractals |  |
| 2026-09-21 | `radian628Julia.js` | Radian628 — Julia Hybrid | shader | Fractals |  |
| 2026-09-21 | `radian628Kaleidoscope.js` | Radian628 — Kaleidoscope | shader | Fractals |  |
| 2026-09-21 | `radian628LogSpiral.js` | Radian628 — Log Spiral | shader | Fractals |  |
| 2026-09-21 | `radian628Mirror.js` | Radian628 — Mirror Tile | shader | Fractals |  |
| 2026-09-21 | `radian628MultiFreq.js` | Radian628 — Multi-Frequency | shader | Fractals |  |
| 2026-09-21 | `radian628Polar.js` | Radian628 — Polar Bloom | shader | Fractals |  |
| 2026-09-21 | `radian628Raymarch.js` | Radian628 — Raymarched | shader | Fractals |  |
| 2026-09-21 | `reactionDiffusion.js` | Reaction-Diffusion | shader | Reaction-Diffusion |  |
| 2026-09-21 | `reflectiveSpheres.js` | Reflective Spheres | shader | Ray Tracing |  |
| 2026-09-21 | `rippleWaves.js` | Ripple Waves | 3d | Waves |  |
| 2026-09-21 | `spectrumBars.js` | Spectrum Bars | shader | Spectra |  |
| 2026-09-21 | `tesseract.js` | Tesseract | 3d | 4D |  |
| 2026-09-21 | `torusKnot.js` | Torus Knot | 3d | Knots |  |
| 2026-09-21 | `trefoilKnot.js` | Trefoil Knot | 3d | Knots |  |
| 2026-09-21 | `triplyPeriodicSurfaces.js` | Triply Periodic Surfaces | shader | Surfaces |  |
| 2026-09-21 | `ulamSpiral.js` | Ulam Spiral | shader | Number Theory |  |
| 2026-09-21 | `vectorFieldFlow.js` | Vector Field Flow | shader | Vector Fields |  |
| 2026-09-21 | `voronoiCells.js` | Voronoi Cells | shader | Shaders |  |
| 2026-09-21 | `voxelSdfMorph.js` | Voxel SDF Morph | 3d | Voxels |  |
| 2026-09-21 | `x.js` | Radian628 — Quantum Abyss | shader | Fractals |  |
| 2026-09-21 | `xyz.js` | Radian628 Integral-Warped GLSL Fractal | shader | Fractals |  |
| 2026-09-27 | `rocketToAlien.js` | Rocket → Alien | 3d | Particles |  |
| 2026-09-29 | `brachistochrone.js` | Brachistochrone Race | 3d | Physics |  |
| 2026-09-29 | `chladniPlate.js` | Chladni Plate | shader | Waves |  |
| 2026-09-29 | `dragonCurve.js` | Dragon Curve Unfolding | 3d | Fractals |  |
| 2026-09-29 | `fourierEpicycles.js` | Fourier Epicycles | 3d | Waves |  |
| 2026-09-29 | `pendulumWave.js` | Pendulum Wave | 3d | Physics |  |
| 2026-09-29 | `poopRocket.js` | Poop → Robot Rocket | 3d | Particles |  |
| 2026-09-30 | `blackHoleLensing.js` | Black Hole Lensing | shader | Physics |  |
| 2026-09-30 | `coherentState.js` | Coherent State | 3d | Functional Analysis |  |
| 2026-09-30 | `einsteinRing.js` | Einstein Ring | shader | Physics |  |
| 2026-09-30 | `fourierProjection.js` | Fourier Projection | 3d | Functional Analysis |  |
| 2026-09-30 | `gramSchmidtLegendre.js` | Gram–Schmidt → Legendre | 3d | Functional Analysis |  |
| 2026-09-30 | `hydrogenOrbitals.js` | Hydrogen Orbitals | shader | Physics |  |
| 2026-09-30 | `lorentzBoost.js` | Lorentz Boost | 3d | Physics |  |
| 2026-09-30 | `penroseDiagram.js` | Minkowski → Penrose | 3d | Physics |  |
| 2026-09-30 | `poopEinsteinRing.js` | Einstein Ring of Poop | shader | Physics |  |
| 2026-09-30 | `relativisticFlight.js` | Relativistic Flight | 3d | Physics |  |
| 2026-09-30 | `terrellRotation.js` | Terrell Rotation | shader | Physics |  |
| 2026-09-30 | `twinParadox.js` | Twin Paradox | 3d | Physics |  |
| 2026-09-30 | `weakConvergence.js` | Weak ≠ Strong Convergence | 3d | Functional Analysis |  |
| 2026-09-30 | `wormhole.js` | Wormhole | shader | Physics |  |
| 2026-10-01 | `duckSpaghettification.js` | Spaghettification of a Rubber Duck | shader | Physics |  |
| 2026-10-01 | `friendlyRobots.js` | Friendly Robots Fall In | shader | Physics |  |
| 2026-10-01 | `isingMoodRing.js` | Ising Mood Ring | shader | Physics |  |
| 2026-10-01 | `noetherDance.js` | Noether’s Dancing Robot | shader | Physics |  |
| 2026-10-01 | `poopBlackHole.js` | Poop Hard Drive Black Hole | shader | Physics |  |
| 2026-10-01 | `poopStackFold.js` | Poop Tower Catastrophe | 3d | Dynamical Systems |  |
| 2026-10-01 | `robotHeadlight.js` | Relativistic Robot Headlight | shader | Physics |  |
| 2026-10-01 | `robotSneeze.js` | Navier–Stokes of a Sneeze | shader | Fluid Flow |  |
| 2026-10-04 | `elephantToothpaste.js` | Elephant's Toothpaste | 3d | Chemistry |  |
| 2026-10-04 | `fireflySync.js` | Firefly Sync | 3d | Biology |  |
| 2026-10-04 | `rabbitsVsFoxes.js` | Rabbits vs Foxes | 3d | Biology |  |
| 2026-10-04 | `robotPicksAShape.js` | Robot Picks a Shape | shader | Algebraic Art |  |
| 2026-10-05 | `cellularFlame.js` | Cellular Flame | 3d | Chaos |  |
| 2026-10-05 | `doublePendulum.js` | Double Pendulum | 3d | Chaos |  |
| 2026-10-05 | `giantsCauseway.js` | Giant's Causeway | 3d | Geometry |  |
| 2026-10-05 | `ksSoapFilm.js` | Kuramoto–Sivashinsky Soap Film | shader | Optics |  |
| 2026-10-05 | `ksSpacetime.js` | Kuramoto–Sivashinsky Spacetime | 3d | Chaos |  |
| 2026-10-05 | `ksSpiral.js` | Kuramoto–Sivashinsky Spiral | 3d | Chaos |  |
| 2026-10-05 | `ksTorus.js` | Kuramoto–Sivashinsky on a Torus | 3d | Chaos |  |
| 2026-10-05 | `liesegangRings.js` | Liesegang Rings | 3d | Chemistry |  |
| 2026-10-05 | `lloydRelaxation.js` | Lloyd's Relaxation | 3d | Geometry |  |
| 2026-10-05 | `quantumTunnelling.js` | Quantum Tunnelling | 3d | Physics |  |
| 2026-10-05 | `sunflowerPhyllotaxis.js` | Sunflower Phyllotaxis | 3d | Biology |  |
| 2026-10-05 | `voronoiMetrics.js` | Voronoi Metrics | shader | Geometry |  |
| 2026-10-06 | `voodooDoll.js` | Voodoo Doll | 3d | Physics |  |
| 2026-10-07 | `intercept.js` | Intercept | 3d | Physics | [walkthrough](sketches/intercept.md) |
| 2026-10-07 | `radarShadow.js` | Radar Shadow | 3d | Physics |  |
| 2026-10-07 | `supernovaRemnant.js` | Supernova Remnant | 3d | Physics |  |
| 2026-10-14 | `radian628ShapeMirror.js` | Radian628 — Shape Mirror | shader | Fractals |  |
| 2026-10-16 | `kaliAccretion.js` | Kali Accretion | shader | Fractals |  |
| 2026-10-16 | `kaliDrift.js` | Kali Drift | shader | Fractals |  |
| 2026-10-16 | `kaliInk.js` | Kali Ink | shader | Fractals |  |
| 2026-10-16 | `kaliMart.js` | Kali Mart | shader | Fractals |  |
| 2026-10-16 | `kaliPearls.js` | Kali Pearls | shader | Fractals |  |
| 2026-10-16 | `kaliRun.js` | Kali Run | shader | Fractals |  |
| 2026-10-16 | `kaliScribble.js` | Kali Scribble | shader | Fractals |  |
| 2026-10-16 | `kaliSilk.js` | Kali Silk | shader | Fractals |  |
| 2026-10-16 | `kaliTangle.js` | Kali Tangle | shader | Fractals |  |
| 2026-10-16 | `radian628PrismMirror.js` | Radian628 — Prism Mirror | shader | Fractals |  |
| 2026-10-17 | `kaliDrape.js` | Kali Drape | shader | Fractals |  |
| 2026-10-17 | `mocalocky.js` | Mocalocky | shader | Fractals |  |
| 2026-10-19 | `brusselatorDish.js` | Brusselator Dish | shader | Reaction-Diffusion |  |
| 2026-10-19 | `earwormSir.js` | Earworm SIR | 3d | Biology |  |
| 2026-10-19 | `fractalLab.js` | Fractal Lab | shader | Fractals |  |
| 2026-10-19 | `hybridFractal.js` | Hybrid Fractal | shader | Fractals |  |
| 2026-10-19 | `kaleidoscopicIfs.js` | Kaleidoscopic IFS | shader | Fractals |  |
| 2026-10-19 | `keplersPizza.js` | Kepler's Pizza | 3d | Physics |  |
| 2026-10-19 | `kleinianNecklace.js` | Kleinian Necklace | 3d | Fractals |  |
| 2026-10-19 | `mandelbox.js` | Mandelbox | shader | Fractals |  |
| 2026-10-19 | `perturbationDive.js` | Perturbation Dive | shader | Fractals |  |
| 2026-10-19 | `pseudoKleinian.js` | Pseudo-Kleinian | shader | Fractals |  |
| 2026-10-21 | `bristolSpecimen.js` | Bristol Specimen | 3d | Biology |  |
| 2026-11-10 | `asteroidBelt.js` | Every Asteroid We've Numbered | 3d | Astronomy |  |
| 2026-11-10 | `cepheids.js` | The Cosmic Yardstick | 3d | Astronomy |  |
| 2026-11-10 | `cmbPlanck.js` | The Oldest Light | 3d | Astronomy |  |
| 2026-11-10 | `gaiaNeighbourhood.js` | The Stars Within 100 Parsecs | 3d | Astronomy |  |
| 2026-11-10 | `gwChirp.js` | The First Chirp | 3d | Astronomy |  |
| 2026-11-10 | `keplerEleven.js` | Six Planets in a Star's Flicker | 3d | Astronomy |  |
| 2026-11-10 | `missingMass.js` | The Missing Mass | 3d | Astronomy |  |
| 2026-11-10 | `pulsars.js` | Lighthouses of the Galaxy | 3d | Astronomy |  |
| 2026-11-10 | `sdssCosmicWeb.js` | The Cosmic Web, Measured | 3d | Astronomy |  |
| 2026-11-10 | `skyZoom.js` | From the Whole Sky to One Galaxy | 3d | Astronomy |  |
| 2026-11-10 | `snAcceleration.js` | The Universe Is Speeding Up | 3d | Astronomy |  |
| 2026-11-10 | `sunCycle.js` | The Sun's Eleven-Year Heartbeat | 3d | Astronomy |  |
| 2026-11-10 | `voyagerTour.js` | The Grand Tour | 3d | Astronomy |  |
| 2026-11-10 | `webbDeepField.js` | Webb Deep Field in Depth | 3d | Astronomy |  |
| 2026-11-10 | `whereOrbitingStops.js` | Where Orbiting Stops | 3d | Physics |  |
| 2026-11-12 | `exoplanets.js` | Six Thousand Worlds | 3d | Astronomy |  |
| 2026-11-12 | `messierInDepth.js` | Messier's Sky, in Depth | 3d | Astronomy |  |
| 2026-11-18 | `antiAircraftContraception.js` | Anti-Aircraft Contraception | 3d | Physics | [walkthrough](sketches/antiAircraftContraception.md) |
