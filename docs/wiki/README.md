---
summary: The start page of the beginner wiki: what to read first, and a list of every page.
added: 2026-11-18
---

# The beginner wiki

This wiki explains the sketches on aiship.lol in plain English. You don't need to know any programming, math
or physics to read it. Every page starts with an everyday picture of the idea, then shows real lines of the
project's code and explains them one at a time.

**Words you'll meet first:**
- A **sketch** is one of the animated pictures on the site: a swirling fractal, a flock of birds, a spinning
  shape, each with an equation on screen and sliders to play with. Each sketch is one file of code.
- A **walkthrough** is a wiki page that tours one sketch: what you see, the idea behind it, and its most
  important lines of code.
- The buttons along the bottom of a sketch open **panels**. **Explain** shows that sketch's walkthrough, if it
  has one yet (62 sketches do), and the expert notes. **Code** shows the sketch's code; in its **Read** view,
  underlined words are links to these pages, and lines a wiki page explains are marked with a link back to
  that explanation. **Params** holds the sliders.
- **Claude** is the AI that writes and maintains this project and this wiki.

You can read it on the site at [aiship.lol/wiki](https://aiship.lol/wiki). Every code example on these pages
has numbered lines ("Line 3" means the line numbered 3) and a link that opens those exact lines in the
sketch's code. New pages are announced in the RSS feed at [aiship.lol/feed.xml](https://aiship.lol/feed.xml),
and everything about space is gathered on the [Astronomy page](https://aiship.lol/astronomy).

**Checked, page by page.** Every page is being read in full and every number, quote and claim checked against
the code. [The audit log](_audit.md) lists each page, how it was checked, and what was wrong.

**If an explanation is bad, say so.** On the site, highlight the sentence that lost you and press the **💬 This
is unclear** button that pops up (or use **Something here unclear?** at the bottom of any page). Say what
confused you, and it opens a GitHub issue with the page and sentence filled in; press **Submit new issue**.
Those issues carry the label `wiki-feedback`, and Claude reads them and rewrites the page. They're public,
like the rest of the project. To have an AI find the confusing bits for you, see [getting a second
opinion](getting-a-second-opinion.md).

There's also an expert guide, `docs/guide.md`, written for programmers. It shows up in the Explain panel under
"Expert notes". You never need it: this wiki covers the same ground in everyday words.

## If you are completely new: read in this order

1. [What a sketch is](what-is-a-sketch.md): the parts every sketch file has.
2. [The frame loop: setup, update, dispose](frame-loop.md): how a sketch builds its picture once, then moves
   it 60 times a second, like a flipbook.
3. [How the files fit together](how-the-files-fit.md): which folder holds what.
4. [Opening and changing a sketch safely](changing-a-sketch-safely.md): how to try an edit without breaking
   anything.
5. [The sketch format: every field](sketch-format.md): a reference list of every part a sketch can have.
6. Pick one walkthrough and read it with the sketch open beside it. [Boids Flock](sketches/boidsFlock.md)
   (birds flocking) is a good first one, and [Bifurcation Diagram](sketches/bifurcationDiagram.md) a good
   second.
7. After that, you don't need to read in order: follow the links from a walkthrough when you want more.

## 1. Start here
- [What a sketch is](what-is-a-sketch.md)
- [The frame loop: setup, update, dispose](frame-loop.md)
- [How the files fit together](how-the-files-fit.md)
- [Opening and changing a sketch safely](changing-a-sketch-safely.md)
- [Clickable code and symbols: how it works](clickable-code.md)

## 2. This project's sketch format
- [Every field](sketch-format.md)
- [Params: the sliders](params.md)
- [Motion and the live equation](motion-and-latex.md)
- [Sketch sound: sounds made in code](sketch-sound.md)

## 3. Reading JavaScript
- [1. Values, names and comments](js-values-and-variables.md)
- [2. Functions and arrows](js-functions.md)
- [3. Decisions and loops](js-decisions-and-loops.md)
- [4. Lists and labelled boxes](js-arrays-and-objects.md)
- [5. Loading data: fetch and Promises](js-promises-and-fetch.md)

## 4. Drawing in 2D

- [The 2D stage: drawing flat pictures with a glow](stage-2d.md) (23 sketches)
- *(planned)* Flat `shader` pictures and their coordinates; drawing on a hidden canvas (`CanvasTexture`, 12
  sketches).

## 5. Drawing in 3D
- [1. The scene and the camera](scene-and-camera.md)
- [2. Mesh, geometry and material](mesh-geometry-material.md)
- [3. Lines and points](lines-and-points.md)
- [4. Lights](lights.md)
- [5. How the camera moves](camera-and-controls.md)
- [6. Many copies of one shape](instancing.md)

## 6. Shaders
- [Two questions](shaders.md)
- [Uniforms: knobs passed in from JavaScript](uniforms.md)
- [Textures: pictures a shader can look things up in](textures.md)
- [GLSL basics](glsl-basics.md)
- [Simulating on the graphics chip](render-targets.md)
- *(planned)* Ray marching: 3D shapes drawn by a shader (14 sketches)

## 7. Colour
- [1. RGB, three numbers](rgb.md)
- [2. Blending, adding, dimming and gain](colour-blending-and-gain.md)
- [3. The cosine palette](cosine-palette.md)
- [4. Colour scales for data, and how they are chosen](colour-scales.md)
- [5. Glow: making bright things shine](glow.md)

## 8. Animation and timing *(planned)*
Time, phases, loops, smooth fades and easing (`src/lib/motion.js`). For now, see [Motion and the live
equation](motion-and-latex.md).

## 9. Math that keeps coming up
- [Noise: randomness that looks natural](noise.md)
- [Random numbers, and seeds that make them repeatable](randomness.md)
- [Sine and cosine: the wave-makers](sine-and-cosine.md)
- *(planned)* Blending and clamping, angles and radians, complex numbers, loops that refine a guess
(Newton's method), vectors, escape-time fractals, Voronoi cells.

## 10. Simulation *(planned)*
Forces, particles, and stepping forward in time.

## 11. Maps, the sky and coordinates *(planned)*
Map projections (Mollweide, gnomonic), sky coordinates, degrees and ℓ.

## 12. Science explainers
- [Parallax: measuring the distance to the stars](parallax-and-distance.md)
- [Galaxy motions and the shapes they leave](galaxy-motions.md): where galaxies are heading, the film of the
  nearby universe, and the collisions behind ring and shell galaxies

Planned, one page per topic: the cosmic microwave background, spherical harmonics, power spectra, Cepheids,
supernovae, rotation curves, exoplanets, gravitational waves and more. The full list is in [Survey of the
project](_survey.md).

## 13. Space and science data *(planned)*
Every data source, file format and preparation script. A first table is in [Survey of the
project](_survey.md).

## 14. Equations and LaTeX *(planned)*
How to read the captions, symbol by symbol. For now, see `docs/guide.md` sections 3 and 4.

## 15. Sketch walkthroughs
62 of the 190 sketches have one so far, and more are being written, with astronomy first. The full list of
sketches, with which ones are done, is at the end of [Survey of the project](_survey.md).

| Sketch | What it is |
|---|---|
| [Audio Pulse](sketches/audioPulse.md) | a ring that ripples to bass, middle and treble |
| [Audio-Reactive Julia Set](sketches/audioReactiveJulia.md) | a fractal whose shape follows the music |
| [Audio-Reactive Mesh](sketches/audioReactiveMesh.md) | a ball that bulges with the sound's spectrum |
| [Belousov–Zhabotinsky](sketches/belousovZhabotinsky.md) | a chemical reaction making rings and spirals |
| [De Casteljau Bézier](sketches/bezierDeCasteljau.md) | how a smooth curve is built from a zig-zag |
| [Bifurcation Diagram](sketches/bifurcationDiagram.md) | a population rule tipping into chaos |
| [Boids Flock](sketches/boidsFlock.md) | birds flocking from three simple rules |
| [Boy's Surface](sketches/boysSurface.md) | two drawings of an impossible surface, blending |
| [Caustics](sketches/causticsLight.md) | light dancing on a pool floor |
| [Radian628 — Abyssal Bloom](sketches/chatgpt-quantum.md) | a neon fractal kaleidoscope |
| [Radian628 Integral-Warped Fractal](sketches/different-this-time.md) | folded paper, rippled, sixteen times |
| [Diffusion-Limited Aggregation](sketches/diffusionLimitedAggregation.md) | lightning-bolt growth from random stumbling |
| [Displaced Icosphere](sketches/displacedIcosphere.md) | a little low-poly planet |
| [Enneper Surface](sketches/enneperSurface.md) | a soap-film saddle that curls through itself |
| [Fluid Dye](sketches/fluidDye.md) | fake ink in water, made of noise warping noise |
| [Fly Connectome](sketches/flyConnectome.md) | a fly-shaped brain you can poke and damage |
| [Force-Directed Graph](sketches/forceDirectedGraph.md) | a network that untangles itself with springs |
| [Galton Board](sketches/galtonBoard.md) | coin flips building a bell curve |
| [Conway's Game of Life](sketches/gameOfLife.md) | four rules, endless creatures |
| [Generative Synth](sketches/generativeSynth.md) | a melody that improvises itself |
| [Messier's Sky, in Depth](sketches/messierInDepth.md) | the deep sky at real distances, where each galaxy is moving, and the collisions that shaped some |
| [Intercept](sketches/intercept.md) | a drone, a gun, and the physics of both |
| [Anti-Aircraft Contraception](sketches/antiAircraftContraception.md) | missile physics, starring a sperm cell ([the physics](sketches/antiAircraftContraception-physics.md)) |
| [Gradient Plane](sketches/gradientPlane.md) | a flowing rainbow from one line of shader code |
| [Helicoid ↔ Catenoid](sketches/helicoidCatenoid.md) | a spiral staircase rolling into an hourglass without stretching |
| [Hopf Fibration](sketches/hopfFibration.md) | circles from four dimensions, every pair linked |
| [Hyperbolic Tiling](sketches/hyperbolicTiling.md) | seven-sided tiles that only fit in a stranger space |
| [Inferno Cape](sketches/infernoCape.md) | molten rock made of noise warping noise |
| [Iridescent Sphere](sketches/iridescentSphere.md) | a soap-bubble rainbow shimmer on a ball |
| [Klein Bottle](sketches/kleinBottle.md) | a Möbius strip inflating into a one-sided bottle |
| [Kuramoto–Sivashinsky](sketches/kuramotoSivashinsky.md) | a wrinkling flame front, as a honeycomb ([the bug that froze it](sketches/kuramotoSivashinsky-fix.md)) |
| [Kuramoto–Sivashinsky — Life-Seeded](sketches/kuramotoSivashinskyLife.md) | the same flame, fed by a Game of Life board |
| [Life-Warped Fractal](sketches/lifeWarpedFractal.md) | a kaleidoscope bent by a hidden Game of Life |
| [Black Hole Lensing](sketches/blackHoleLensing.md) | light bent round a black hole: the shadow, the arch, the bright side |
| [Fourier Epicycles](sketches/fourierEpicycles.md) | spinning circles drawing a heart, then a star |
| [Kepler's Pizza](sketches/keplersPizza.md) | A planet's orbit cut into equal-time slices: every slice holds the same area (Kepler's laws) |
| [The Sun's Eleven-Year Heartbeat](sketches/sunCycle.md) | 142 years of real sunspots on a turning Sun, the butterfly diagram, and the 11-year cycle measured |
| [Six Thousand Worlds](sketches/exoplanets.md) | All 6,412 known planets round other stars, appearing as found, then four charts of what they show |
| [Six Degrees of Poop](sketches/smallWorld.md) | A rumour on a ring of friends: a few random shortcuts make the world small (Watts–Strogatz) |
| [Slime Mould Rail Planner](sketches/physarumRail.md) | Nine thousand slime particles grow a rail network between twenty towns around Tokyo |
| [Cascading Blackout](sketches/cascadingBlackout.md) | One failed power line overloads its neighbours until towns go dark (the swing equation) |
| [Prisoner's Dilemma Turf War](sketches/prisonersTurfWar.md) | Cooperators and cheats on a board, each copying its best neighbour (Nowak and May) |
| [Silly Walks, Evolved](sketches/sillyWalksEvolved.md) | A genetic algorithm teaching wobbly blobs to move |
| [L-System Botanical Garden](sketches/lSystemGarden.md) | Six plants grown from single rewriting rules, swaying in the wind |
| [Double Slit, With Eraser](sketches/doubleSlitEraser.md) | Particles through two slits build stripes; a detector wipes them; an eraser sorts them back |
| [Sonic Boom](sketches/sonicBoom.md) | A singing robot flies faster than its own song: Doppler shifts and the Mach cone |
| [Soap Film Colours](sketches/soapFilmColours.md) | A draining soap film coloured by real thin-film interference |
| [Prism Dispersion](sketches/prismDispersion.md) | White light through a glass prism fans into a rainbow (Snell's law, Sellmeier formula) |
| [Mirage](sketches/mirage.md) | Hot air over a road shows sky and an upside-down robot; cold air over the sea makes it loom |
| [Schlieren: Seeing Hot Air](sketches/schlierenPlume.md) | The invisible hot air above a candle and a mug of tea, seen as a schlieren camera sees it |
| [Lagrange Point Parking](sketches/lagrangeParking.md) | Rubber ducks at the five Lagrange points of the Earth and Moon: three roll off, two stay |
| [Roche Limit Shredder](sketches/rocheShredder.md) | A rubble-pile moon spirals in and is torn into a ring at the Roche limit |
| [Foucault's Pendulum](sketches/foucaultPendulum.md) | A pendulum over the spinning Earth: seen from the stars, the floor turns beneath it |
| [Maxwell's Demon](sketches/maxwellsDemon.md) | A demon sorts fast molecules from slow ones; its memory pays the entropy bill (Landauer) |
| [Snowflake Growth](sketches/snowflakeGrowth.md) | Six-armed snowflakes grown cell by cell from three numbers (Reiter's model) |
| [Hilbert's Infinite Noodle](sketches/hilbertNoodle.md) | A single line folded finer and finer until it fills a square (the Hilbert curve) |
| [Riemann Zeta Zero Hunter](sketches/zetaZeroHunter.md) | Walking the critical line and drawing where the Riemann zeta function lands, through every zero |
| [Stereographic Projection](sketches/stereographicMobius.md) | A ball with a lamp on top casts its pattern on a plane; its moves are Möbius maps |
| [Wave Function Collapse](sketches/waveFunctionCollapse.md) | Pipe tiles decided one at a time, least uncertain first, until tidy plumbing appears |
| [Pathfinding Race](sketches/pathfindingRace.md) | Dijkstra and A* race through the same maze to the same shortest route |
| [She Sells Sea Shells, Compressed](sketches/huffmanSeaShells.md) | A tongue-twister compressed two ways: Huffman codes and LZ77 |
| [Hawks and Boids](sketches/hawksAndBoids.md) | Leaderless flocks from three simple rules, split and regrouped by three hunting hawks |
| [Dark Saturn](sketches/darkSaturn.md) | A black hole inside a black ring, in five-dimensional spacetime (black Saturn), with every number from the exact solution |
| [Sounds of Space](sketches/soundsOfSpace.md) | Pulsars clicking, the Sun ringing, black holes merging, and two black holes humming through hot gas, rebuilt from Chandra X-ray data the way NASA made its black hole sound |
| [Black Hole Ripples](sketches/blackHoleRipples.md) | Seventeen black holes humming through hot gas, from real Chandra X-ray data, played the NASA way and pitched down a little |

## 16. [Glossary](glossary.md)

## 17. Asking Claude for help *(planned)*
How to ask for a change, how to ask "what does this line do?", and how to undo a change.
- [Getting a second opinion on an explanation](getting-a-second-opinion.md): a beginner AI on your own
  computer finds where a page loses people, Claude fixes it, another AI checks the fix.

---

**For Claude:** the rules for writing and updating these pages are in the project's `CLAUDE.md`, and the map
of what's in the project is [Survey of the project](_survey.md).
