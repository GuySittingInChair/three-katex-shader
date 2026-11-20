---
summary: Every line of Kepler's Pizza explained: the flight plan, Kepler's equation, the slices and the comic caption.
added: 2026-11-20
sketch: keplersPizza
---

# Kepler's Pizza: the code, line by line

The explanations behind the clickable code of [Kepler's Pizza](../sketches/keplersPizza.md). Units are the
Sun's: distances in AU (the Earth–Sun distance, about 150 million km) and times in years.

## Symbols

### `r` {#r}

The planet's distance from the star, in AU.

### `a` {#a}

Half the length of the orbit's oval, in AU (its *semi-major axis*). Bigger a, bigger orbit, longer year.

### `b` {#b}

Half the width of the oval. For a circle b = a; the more stretched the oval, the smaller b is compared with a.

### `e` {#e}

The orbit's *eccentricity*: how stretched the oval is. 0 is a circle; this sketch goes up to 0.75.

### `\nu` {#nu}

ν (nu): how far round the planet is from its closest point to the star, as an angle seen from the star.

### `M` {#M}

The *mean anomaly*: a clock hand that goes round evenly, 2π (one turn) per orbit. Equal steps of M are equal
stretches of time, so equal slices.

### `E` {#E}

The *eccentric anomaly*: an angle that pins down the planet's position, found from M by solving Kepler's
equation, M = E − e sin E.

### `|v|` {#v}

The planet's speed, in km/s.

### `T` {#T}

The time one orbit takes, in years: T² = a³.

### `\Delta v_{\text{burn}}` {#dv}

How much the last engine burn changed the planet's speed, in km/s.

### `K` {#K}

How many slices each orbit is cut into: the **slices** slider, 12 to start with.

## Lines

### `const Q = 1;`

Every orbit's closest point to the star (its *perihelion*) is 1 AU away, like the Earth's distance. The burns
happen there, which keeps it fixed while the far end moves.

### `const V_EARTH = 29.78;`

The Earth's speed round the Sun, 29.78 km/s: the speed of a circular orbit 1 AU out. All the other speeds are
worked out from it.

### `const YEAR = 2.4;`

One year of the orbit plays in 2.4 seconds, so the Earth-like circle takes 2.4 seconds and the 8-year oval
19.2.

### `const ES = [0, 0.3, 0.55, 0.75, 0.55, 0.3];`

The flight plan: the eccentricity of each orbit in turn. Up from a circle to a long oval, then back down, so
the loop ends where it began.
symbol: e

### `const ORBITS = ES.map((e) => {`

Works out each orbit's size and period from its eccentricity, once, at the start.

### `const a = Q / (1 - e);`

The oval's half-length. The closest point is a(1 − e), and it's kept at Q = 1 AU, so a = 1 / (1 − e): 1, 1.43,
2.22 and 4 AU.
symbol: a

### `return { e, a, b: a * Math.sqrt(1 - e * e), T: a ** 1.5 };`

Each orbit's numbers: the half-width b = a √(1 − e²), and the period T = a^1.5, Kepler's third law (T² = a³)
solved for T. For a = 4 that's 8 years.
symbol: T
#### `b: a * Math.sqrt(1 - e * e)`
The half-width. For the longest oval (e = 0.75, a = 4), b = 2.65 AU.
symbol: b
#### `T: a ** 1.5`
Kepler's third law: the year grows as the orbit's size to the power 1.5.
symbol: T

### `const STARTS = [];`

When each orbit starts, in seconds from the start of the loop.

### `let LOOP = 0;`

The total length of the loop, added up next.

### `for (const o of ORBITS) { STARTS.push(LOOP); LOOP += o.T * YEAR; }`

Each orbit starts when the one before ends. The six orbits add up to 19.04 years, so the loop is 45.7 seconds.

### `const PIZZAS_PER_AU2 = 1.495978707e11 ** 2 / (Math.PI * 0.1778 ** 2);`

How many large pizzas fit in one square AU, for the punchline in the equation: one AU is 149,597,870,700
metres, squared; a 14-inch pizza is 0.1778 m in radius, so π × 0.1778² square metres. About 2.25 × 10²³.
#### `0.1778`
A 14-inch pizza's radius, in metres (7 inches).

### `const solveE = (M, e) => {`

Solves Kepler's equation, M = E − e sin E, for E: where the planet is at time M. It can't be rearranged into
"E = …", so the code guesses and improves the guess.
symbol: E

### `let E = e < 0.8 ? M : Math.PI;`

The first guess: E = M is close for gentle ovals. (For very stretched ones, 0.8 or more, starting at π is
safer; this sketch never goes that far.)

### `for (let i = 0; i < 12; i++) {`

Improve the guess up to 12 times (it usually needs only 3 or 4).

### `const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));`

*Newton's method*: how wrong the guess is (`E - e sin E - M`), divided by how fast that error changes as E
changes (`1 - e cos E`), says how far to move the guess. Each round roughly doubles the number of correct
digits.
symbol: M

### `E -= d;`

Moves the guess.

### `if (Math.abs(d) < 1e-12) break;`

Stops once the correction is under a millionth of a millionth: as exact as a computer's numbers go.

### `return E;`

The answer.

### `const at = (o, M) => {`

Where the planet is at time M on orbit `o`, as a position in the orbit's flat plane.

### `const E = solveE(M, o.e);`

First solve Kepler's equation for E.

### `return { x: o.a * (Math.cos(E) - o.e), y: o.b * Math.sin(E), E };`

Then the position: x along the oval's long axis (towards the closest point), y across it. With the star at (0,
0), this puts the star at a focus of the oval, Kepler's first law.

### `const SUB = 28;`

Each slice is drawn as a fan of 28 thin triangles from the star to the orbit, enough for its outer edge to
look curved.

### `` const SLICE_VERT = ` ``

The shader that places every corner of every slice triangle on the orbit (a [vertex shader](../shaders.md)).

### `attribute vec3 aSlice;`

Each corner's three numbers: which slice it belongs to (`k`), how far along that slice (`u`, 0 to 1), and
whether it's at the star (0) or on the orbit (1).

### `uniform float uE, uA, uK;`

The current orbit's eccentricity and half-length, and the number of slices.

### `varying vec3 vSlice;`

Passes the corner's three numbers on to the colouring shader below.

### `void main() {`

Runs once for every corner.

### `vSlice = aSlice;`

Hands the numbers on.

### `float M = 6.2831853 * (aSlice.x + aSlice.y) / uK;`

The time this corner stands for: (k + u) / K of the way round, as an angle. Equal steps of time: that's what
makes the slices equal in area.
symbol: M

### `float E = M;`

First guess at E.

### `for (int i = 0; i < 10; i++) E -= (E - uE * sin(E) - M) / (1.0 - uE * cos(E));`

The same Newton's method as `solveE`, done on the graphics chip for every corner: ten rounds, plenty.
symbol: E

### `float b = uA * sqrt(1.0 - uE * uE);`

The oval's half-width.

### `vec2 p = vec2(uA * (cos(E) - uE), b * sin(E)) * aSlice.z;`

The point on the orbit at time M, times 0 (the star) or 1 (the orbit): so each triangle reaches from the star
out to the rim.

### `gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, 0.0, -p.y, 1.0);`

Places the corner in the 3D scene, with the orbit lying flat, and hands it to the camera.

### `` const SLICE_FRAG = ` ``

The shader that colours the slices.

### `uniform float uSwept, uK, uFade;`

How many slices the planet has swept so far this orbit (with a fraction for the one it's in), the number of
slices, and a fade-in at the start of each orbit.

### `varying vec3 vSlice;`

The corner's numbers, blended across the triangle.

### `void main() {`

Runs for every pixel of every slice.

### `float k = floor(vSlice.x + 0.5);`

Which slice this pixel belongs to (rounded to the nearest whole number).

### `float pos = k + vSlice.y;`

How far round the orbit this pixel's spot is, counted in slices.

### `float swept = step(pos, uSwept);`

1 if the planet has already passed this spot this orbit, 0 if not: swept slices light up.

### `float current = step(k, uSwept) * step(uSwept, k + 1.0);`

1 for the slice the planet is in right now, which glows a little brighter.

### `vec3 warm = mix(vec3(1.0, 0.58, 0.14), vec3(0.95, 0.22, 0.55), k / uK);`

Each slice's colour, drifting from amber (the first slice) to rose (the last) round the orbit.

### `vec3 col = mix(warm, warm.gbr * 0.6 + vec3(0.25, 0.1, 0.35), 0.35 * mod(k, 2.0));`

Every other slice is shifted a little in colour, so neighbouring slices can be told apart.

### `float rim = 0.25 + 0.75 * vSlice.z * vSlice.z;`

Brighter towards the rim, dimmer near the star, so the slices read as wedges.

### `float a = (0.03 + swept * (0.3 + 0.12 * current)) * rim * uFade;`

How bright: faint (0.03) before the planet gets there, much brighter once swept, a bit more for the current
slice. (This `a` is a brightness, not the orbit's size.)

### `gl_FragColor = vec4(col * a * 2.6, 1.0);`

The pixel's colour. The slices are drawn with *additive blending*, so where they overlap the lines and glow,
light adds up.

### `` const SPRITE_VERT = ` ``

The shader for the star, the planet, the burn flash and the background stars: each is a single point drawn as
a soft, glowing dot.

### `attribute vec3 aColor;`

Each dot's colour.

### `attribute float aSize;`

Each dot's size.

### `varying vec3 vColor;`

Passes the colour on to the colouring shader.

### `uniform float uScale;`

Scales the dots with the screen's height, so they look the same size on any screen.

### `void main() {`

Runs once per dot.

### `vColor = aColor;`

Hands the colour on.

### `vec4 mv = modelViewMatrix * vec4(position, 1.0);`

The dot's position relative to the camera.

### `gl_PointSize = aSize * uScale / -mv.z;`

Its size on screen: bigger when nearer the camera (dividing by the distance), like real things.

### `gl_Position = projectionMatrix * mv;`

Its place on screen.

### `` const SPRITE_FRAG = ` ``

The shader that paints each dot.

### `varying vec3 vColor;`

The dot's colour.

### `void main() {`

Runs for every pixel of every dot.

### `float d = length(gl_PointCoord - 0.5) * 2.0;`

How far this pixel is from the dot's centre: 0 at the centre, 1 at its edge.

### `float core = exp(-d * d * 18.0);`

A tight bright centre that falls away quickly.

### `float halo = exp(-d * d * 3.5) * 0.25;`

A wider, fainter glow round it.

### `gl_FragColor = vec4(vColor * (core + halo), 1.0);`

The dot's colour times core plus halo: a soft glowing point.

### `function sliceGeometry(K) {`

Builds the slices' triangles for K slices: each corner gets its (k, u, star-or-rim) numbers; the shader places
it.
symbol: K

### `const data = [];`

The list of corner numbers, filled below.

### `for (let k = 0; k < K; k++) {`

For each slice…

### `for (let j = 0; j < SUB; j++) {`

…and each of its 28 thin triangles…

### `const u0 = j / SUB;`

…where the triangle starts along the slice…

### `const u1 = (j + 1) / SUB;`

…and where it ends.

### `data.push(k, u0, 0, k, u0, 1, k, u1, 1);`

The triangle's three corners: one at the star (0) and two on the orbit (1), at u0 and u1.

### `const g = new THREE.BufferGeometry();`

A shape built from a list of corners (see [Mesh, geometry and material](../mesh-geometry-material.md)).

### `const arr = new Float32Array(data);`

The corner numbers packed into a list of plain numbers.

### `g.setAttribute('aSlice', new THREE.BufferAttribute(arr, 3));`

Hands them to the shape, three per corner.

### `g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr.length), 3));`

Three.js insists every shape has positions, so it gets a list of zeros; the shader works out the real ones.

### `return g;`

The finished shape.

### `export default {`

The start of the sketch's description of itself.

### `name: "Kepler's Pizza",`

The title on screen.

### `description:`

The sentence under the title, over the next four lines.

### `'A planet orbits a star, and each orbit is sliced into equal stretches of time. The slices look ' +`

First part of the description.

### `'nothing alike, long and thin far out, short and fat near the star, but every one holds exactly the same ' +`

Second part: Kepler's second law.

### `'area: Kepler\'s second law. Engine burns at the closest point stretch the orbit, and the bigger orbits ' +`

Third part: the burns.

### `'take longer, by Kepler\'s third law, T² = a³.',`

Last part: the third law.

### `tags: ['physics', 'astronomy', 'kepler', 'orbits', 'gravity', 'humor'],`

Search words; `astronomy` puts it on the Astronomy page.

### `category: 'Physics',`

Its gallery shelf.

### `mode: '3d',`

A 3D scene.

### `controls: 'orbit',`

Drag to turn the view (see [How the camera moves](../camera-and-controls.md)).

### `motion(t) {`

Turns the clock into everything that moves: which orbit, where the planet is, its speed, and the numbers for
the equation (see [Motion and the live equation](../motion-and-latex.md)).

### `const tl = ((t % LOOP) + LOOP) % LOOP;`

The time within the 45.7-second loop.

### `let i = ORBITS.length - 1;`

Start from the last orbit…

### `while (STARTS[i] > tl) i--;`

…and step back until reaching the orbit that has started: that's the current one.

### `const o = ORBITS[i];`

The current orbit.

### `const prev = ORBITS[(i + ORBITS.length - 1) % ORBITS.length];`

The orbit before it (for the burn size and the camera's glide).

### `const since = tl - STARTS[i];`

Seconds since this orbit began.

### `const M = (TAU * since) / (o.T * YEAR);`

The mean anomaly: since this orbit began, as a fraction of its period, times one full turn. It grows evenly
with time.
symbol: M

### `const { x, y, E } = at(o, M);`

Where the planet is now, from Kepler's equation.
symbol: E

### `const r = o.a * (1 - o.e * Math.cos(E));`

Its distance from the star: a(1 − e cos E). From 1 AU at the closest point to a(1 + e) at the farthest (7 AU
on the longest oval).
symbol: r

### `const nu = Math.atan2(y, x);`

Its angle round from the closest point, as seen from the star.
symbol: nu

### `const p = o.a * (1 - o.e * o.e);`

The orbit's *semi-latus rectum*: its distance from the star when the planet is a quarter of the way round in
angle. It appears in the speed formulas.

### `const rdot = o.e * Math.sin(nu) * Math.sqrt((4 * Math.PI * Math.PI) / p);`

How fast the distance is changing (in AU a year): positive when the planet is climbing away, negative when
falling in. The caption uses its sign. `4π²` is the Sun's pull in these units (years and AU).

### `const speed = V_EARTH * Math.sqrt(2 / r - 1 / o.a);`

The planet's speed, from the *vis-viva* rule: v² is proportional to 2/r − 1/a. Scaled by the Earth's speed, so
a circle at 1 AU gives exactly 29.78 km/s. On the longest oval: 39.4 km/s closest in, 5.6 km/s farthest out.
symbol: v

### `const ease = smooth(clamp01(since / 2.2));`

A smooth 0-to-1 over the first 2.2 seconds of each orbit, so the camera glides to the new orbit instead of
jumping.

### `return {`

Hands all of this moment's numbers to the equation and to `update`.

### `i,`

Which orbit of the plan.

### `e: o.e,`

Its eccentricity.
symbol: e

### `a: o.a,`

Its half-length.
symbol: a

### `b: o.b,`

Its half-width.
symbol: b

### `T: o.T,`

Its period, in years.
symbol: T

### `M,`

The time, as the mean anomaly.

### `E,`

The eccentric anomaly.

### `nu: ((nu * 180) / Math.PI + 360) % 360,`

The angle round, in degrees from 0 to 360, for the equation.
symbol: nu

### `r,`

The distance.

### `rdot,`

Whether it's climbing or falling.

### `speed,`

The speed in km/s.

### `x,`

The position along the long axis…

### `y,`

…and across it.

### `since,`

Seconds since this orbit began.

### `dv: V_EARTH * (Math.sqrt(1 + o.e) - Math.sqrt(1 + prev.e)),`

The last burn's size. The speed at the closest point is 29.78 √(1 + e) km/s, so changing e means changing that
speed by the difference: 4.17, 3.12 and 2.32 km/s on the way up (negative on the way down).
symbol: dv

### `raising: o.e > prev.e ? 1 : 0,`

Whether that burn raised the orbit (forwards) or lowered it (backwards), for the caption.

### `frameA: lerp(prev.a * (1 + prev.e * 0.35), o.a * (1 + o.e * 0.35), ease),`

How big a view the camera needs, gliding from the last orbit's size to this one's.

### `frameX: lerp(-prev.a * prev.e, -o.a * o.e, ease),`

Where to centre the view: the middle of the oval, which for a long oval is well away from the star.

### `fade: smooth(clamp01(since / 0.6)),`

The new orbit's slices fade in over 0.6 seconds.

### `latex: (params, hl, m) => {`

The equation on screen, rebuilt every frame with the live numbers.

### `const K = Math.round(params.slices ?? 12);`

The number of slices, from the slider (12 if it isn't set).
symbol: K

### `const area = (Math.PI * m.a * m.b) / K;`

Each slice's area: the whole oval (π a b) shared equally between the K slices. On the circle with 12 slices,
0.2618 square AU.

### `const pizzas = area * PIZZAS_PER_AU2;`

The same in large pizzas: about 5.9 × 10²² for a slice of the circle.

### `const exp = Math.floor(Math.log10(pizzas));`

The power of ten, so the number can be written like 5.9 × 10²².

### `const line =`

The caption: one deadpan line, chosen by what the planet is doing right now.

### `m.since < 2 * YEAR * 0.35 && m.dv !== 0`

In the first moments after a burn (1.68 seconds)…

### `? m.raising`

…if it was a forward burn…

### `` ? `Burn at perihelion. Longer route, same pizza per second.` ``

…the caption says so (perihelion is the closest point).

### `: m.e === 0`

…otherwise, if it was a backward burn that made the orbit a circle again…

### `? 'Retro burn, back to a circle. Every slice a normal slice. Fuel not refunded.'`

…this one…

### `: 'Retro burn. Shorter route.'`

…and for the other backward burns, this one.

### `: m.e === 0`

When there's no fresh burn: on the circle…

### `? 'Circular orbit. Every slice a normal slice.'`

…all slices are the same shape, so there's nothing to say but that.

### `: mood([m.rdot], {`

On an oval, `mood` picks a line from whether the distance is shrinking (`-`), growing (`+`) or neither (`0`).
See [Random numbers, and seeds](../randomness.md) for another of the site's caption helpers' cousins.

### `'-': 'Falling toward the oven. Speeding up. Slices getting short and fat.',`

Falling in: faster, so the slices get stubby.

### `'+': 'Climbing away. Slowing down. Slices getting long and thin. Same pizza.',`

Climbing out: slower, so the slices stretch. Same area: Kepler's second law.

### `0: 'Turning point.',`

At the closest and farthest points, the distance stops changing for a moment.

### `}, 1e-6);`

Changes smaller than a millionth count as "holding steady".

### `return (`

The equation text, built from the pieces below.

### `'\\begin{aligned}' +`

Lines the rows up on their = signs.

### `` `\\htmlData{sym=r}{r} &= ... ``

Row one: the distance formula, r = a(1 − e²) / (1 + e cos ν), with this moment's numbers put in.
symbol: r

### `` `\\htmlData{sym=M}{M} &= ... ``

Row two: Kepler's equation with this moment's M and E, and the speed.
symbol: M

### `` `\\htmlData{sym=T}{T}^2 &= ... ``

Row three: Kepler's third law with this orbit's T and a, and the last burn.
symbol: T

### `` `\\text{each slice} &= ... ``

Row four: one slice's area, in square AU and in large pizzas.
symbol: K

### `` `& ${caption(line)}` + ``

Row five: the caption, small and grey.

### `'\\end{aligned}'`

Ends the rows.

### `params: {`

The sliders.

### `speed: { value: 1, min: 0, max: 3 },`

How fast the flight plan plays. At 0 everything stops.

### `slices: { value: 12, min: 4, max: 24, step: 1 },`

How many equal-time slices per orbit, 4 to 24.
symbol: K

### `setup(ctx) {`

Builds everything once at the start.

### `const { scene, camera } = ctx;`

Short names for the scene and the camera.

### `scene.background = new THREE.Color(0x030308);`

A near-black background with a hint of blue.

### `camera.near = 0.05;`

The camera draws things as close as 0.05 units…

### `camera.far = 400;`

…and as far as 400 (the background stars are 150 away).

### `const glow = createGlow(ctx, { fov: 42, strength: 0.85, threshold: 0.55, exposure: 1, vignette: 0.55 });`

Turns on [glow](../glow.md), so the star and planet shine.

### `camera.position.set(-1.2, 4.2, 4.6);`

Starts the camera above and in front, looking down at the orbit at an angle.

### `ctx.controls?.target.set(0, 0, 0);`

Points the camera at the star.

### `ctx.controls?.update();`

Applies that straight away.

### `const sliceMat = new THREE.ShaderMaterial({`

The slices' paint: the two slice shaders above.

### `vertexShader: SLICE_VERT,`

The shader that places each corner on the orbit.

### `fragmentShader: SLICE_FRAG,`

The shader that colours them.

### `uniforms: { uE: { value: 0 }, uA: { value: 1 }, uK: { value: 12 }, uSwept: { value: 0 }, uFade: { value: 1 } },`

The knobs, with starting values; `update` turns them every frame.

### `blending: THREE.AdditiveBlending,`

Overlapping light adds up (see [Blending](../colour-blending-and-gain.md)).

### `depthWrite: false,`

The slices don't hide what's behind them.

### `transparent: true,`

Drawn after solid things, so the adding works.

### `side: THREE.DoubleSide,`

Visible from above and below, when you turn the view.

### `const slices = new THREE.Mesh(sliceGeometry(12), sliceMat);`

The slices: 12 to start with, rebuilt if the slider changes.

### `slices.frustumCulled = false;`

Always drawn. (Three.js can't tell where the shader puts the corners, so it mustn't guess they're off screen.)

### `scene.add(slices);`

Into the scene.

### `const lines = createFatLines({ maxSegments: 1800, width: 1.6 });`

Thin lines for the faint orbits and the slice cuts (see [Lines and points](../lines-and-points.md)).

### `const bright = createFatLines({ maxSegments: 400, width: 2.6 });`

Thicker lines for the current orbit and the trail.

### `scene.add(lines.object, bright.object);`

Into the scene.

### `const spriteMat = (scale) =>`

A small recipe for making a glowing-dot paint.

### `new THREE.ShaderMaterial({`

…from the dot shaders above.

### `vertexShader: SPRITE_VERT,`

The shader that sizes each dot.

### `fragmentShader: SPRITE_FRAG,`

The shader that paints each dot's glow.

### `uniforms: { uScale: { value: scale } },`

The size knob.

### `blending: THREE.AdditiveBlending,`

Glows add up where they overlap.

### `depthWrite: false,`

Dots don't hide what's behind them.

### `transparent: true,`

Drawn after the solid things.

### `const bodies = new THREE.BufferGeometry();`

Three glowing dots: the star, the planet and the burn flash.

### `bodies.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));`

Their positions (3 dots × 3 numbers), filled in every frame.

### `bodies.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(9), 3));`

Their colours.

### `bodies.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(3), 1));`

Their sizes.

### `const bodyMat = spriteMat(1);`

Their glowing paint.

### `const bodyPts = new THREE.Points(bodies, bodyMat);`

The three dots, as a point cloud.

### `bodyPts.frustumCulled = false;`

Always drawn.

### `bodyPts.renderOrder = 5;`

Drawn after the slices and lines, so they glow on top.

### `scene.add(bodyPts);`

Into the scene.

### `const NS = 2500;`

2,500 faint background stars.

### `const stars = new THREE.BufferGeometry();`

Their shape: one point each.

### `const sp = new Float32Array(3 * NS);`

Their positions…

### `const sc = new Float32Array(3 * NS);`

…colours…

### `const ss = new Float32Array(NS);`

…and sizes.

### `for (let i = 0; i < NS; i++) {`

For each background star:

### `const v = new THREE.Vector3().randomDirection().multiplyScalar(150);`

A random direction, 150 units away: a sphere of stars round the whole scene.

### `sp.set([v.x, v.y, v.z], 3 * i);`

Stores its position.

### `const w = 0.12 + 0.35 * Math.random() ** 4;`

Its brightness: mostly faint, a few brighter (a random number to the 4th power is usually small). (This `w` is
a brightness, separate from the `w` used in `update`.)

### `const warm = Math.random();`

How warm (yellow) or cool (blue) it is.

### `sc.set([w * (0.8 + 0.2 * warm), w * 0.85, w * (1.05 - 0.25 * warm)], 3 * i);`

Its colour: between bluish and yellowish white, like real stars.

### `ss[i] = 0.5 + Math.random();`

Its size.

### `stars.setAttribute('position', new THREE.BufferAttribute(sp, 3));`

Hands the positions to the shape…

### `stars.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));`

…the colours…

### `stars.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));`

…and the sizes.

### `const starMat = spriteMat(1);`

Their glowing paint.

### `const starPts = new THREE.Points(stars, starMat);`

The background stars, as a point cloud.

### `starPts.frustumCulled = false;`

Always drawn.

### `scene.add(starPts);`

Into the scene.

### `return { glow, slices, sliceMat, K: 12, lines, bright, bodies, bodyMat, starMat, dir: new THREE.Vector3(), c: new THREE.Color(), v: new THREE.Vector3(), w: new THREE.Vector3() };`

Hands everything to `update`, plus a few spare points and a colour to reuse every frame.

### `update(ctx, state) {`

Runs every frame.

### `const m = ctx.motion;`

This moment's numbers, from `motion`.

### `const { lines, bright, c, v, w } = state;`

Short names for the tools.

### `const { width, height } = ctx.size;`

The screen's size.

### `lines.setResolution(width, height);`

The thin lines need the screen size to keep their width in pixels…

### `bright.setResolution(width, height);`

…and so do the thick ones.

### `const K = Math.round(ctx.params.slices ?? 12);`

The number of slices, from the slider.
symbol: K

### `if (K !== state.K) {`

If the slider has changed…

### `state.slices.geometry.dispose();`

…throw away the old slices…

### `state.slices.geometry = sliceGeometry(K);`

…build new ones for K slices…

### `state.K = K;`

…and remember the new number.

### `const u = state.sliceMat.uniforms;`

A short name for the slice shaders' knobs.

### `u.uE.value = m.e;`

This orbit's eccentricity…

### `u.uA.value = m.a;`

…its half-length…

### `u.uK.value = K;`

…the number of slices…

### `u.uSwept.value = (m.M / TAU) * K;`

…how many slices the planet has swept so far: the fraction of the orbit done, times K.

### `u.uFade.value = m.fade;`

…and the fade-in.

### `const P = (x, y, out) => out.set(x, 0, -y);`

Turns a position in the orbit's flat plane into a 3D position, with the orbit lying flat.

### `lines.reset();`

Wipes last frame's thin lines…

### `bright.reset();`

…and thick ones.

### `const N = 160;`

Each orbit is drawn as 160 short pieces.

### `for (const o of ORBITS.slice(0, 4)) {`

The four different orbits (the last two in the plan repeat earlier ones).

### `const current = o.e === m.e;`

Is this the orbit the planet is on now?

### `const target = current ? bright : lines;`

The current orbit in thick lines, the others thin.

### `const k = current ? 0.55 : 0.12;`

…and brighter. (This `k` is a brightness, not a slice number.)

### `for (let j = 0; j < N; j++) {`

Round the orbit in 160 pieces:

### `const t0 = (TAU * j) / N;`

Where the piece starts, as an angle E…

### `const t1 = (TAU * (j + 1)) / N;`

…and where it ends.

### `P(o.a * (Math.cos(t0) - o.e), o.b * Math.sin(t0), v);`

The start point on the oval…

### `P(o.a * (Math.cos(t1) - o.e), o.b * Math.sin(t1), w);`

…and the end point.

### `c.setRGB(0.55 * k, 0.75 * k, 1.0 * k);`

A cool blue, as bright as `k` says.

### `target.push(v, w, c);`

Adds the piece.

### `const o = ORBITS[m.i];`

The current orbit.

### `for (let k = 0; k < K; k++) {`

For each slice cut:

### `const q = at(o, (TAU * k) / K);`

Where the planet is at the k-th equal step of time: the cut's outer end.

### `P(q.x, q.y, w);`

That point, in 3D.

### `v.set(0, 0, 0);`

The cut starts at the star.

### `const lit = (m.M / TAU) * K >= k ? 0.5 : 0.15;`

Cuts the planet has passed are brighter.

### `c.setRGB(1.0 * lit * m.fade, 0.7 * lit * m.fade, 0.4 * lit * m.fade);`

A warm orange.

### `lines.push(v, w, c);`

Adds the cut.

### `const TR = 90;`

The planet's trail is drawn in 90 pieces.

### `for (let j = 0; j < TR; j++) {`

Along the trail, newest first:

### `const M0 = m.M - (0.2 * TAU * (j + 1)) / TR;`

The trail covers the last fifth of an orbit (in time): this piece's older end…

### `const M1 = m.M - (0.2 * TAU * j) / TR;`

…and its newer end.

### `if (M0 < 0) break;`

The trail doesn't reach back into the previous orbit.

### `const a0 = at(o, M0);`

Where the planet was at the older time…

### `const a1 = at(o, M1);`

…and the newer.

### `P(a0.x, a0.y, v);`

In 3D…

### `P(a1.x, a1.y, w);`

…both ends.

### `const f = (1 - j / TR) ** 2 * 1.6;`

Brightest at the planet, fading away behind it.

### `c.setRGB(0.5 * f, 0.9 * f, 1.2 * f);`

A pale blue.

### `bright.push(v, w, c);`

Adds the piece. Near the star the trail is long (the planet moves fast); far out it's short.

### `lines.commit();`

Sends the thin lines to the graphics chip…

### `bright.commit();`

…and the thick ones.

### `const pos = state.bodies.attributes.position.array;`

The three glowing dots' positions…

### `const col = state.bodies.attributes.aColor.array;`

…colours…

### `const size = state.bodies.attributes.aSize.array;`

…and sizes, to fill in.

### `const flicker = 1 + 0.04 * Math.sin(ctx.time * 7.3) + 0.03 * Math.sin(ctx.time * 11.1);`

A gentle flicker for the oven: two waves at different speeds, a few percent each.

### `pos.set([0, 0, 0], 0);`

The star sits at the centre…

### `col.set([2.6 * flicker, 1.3 * flicker, 0.45 * flicker], 0);`

…glowing orange (over full brightness, so the glow picks it up)…

### `size[0] = 1.6;`

…biggest of the three.

### `P(m.x, m.y, v);`

The planet's position, in 3D.

### `pos.set([v.x, v.y, v.z], 3);`

The planet dot goes there…

### `col.set([0.9, 1.5, 2.2], 3);`

…pale blue…

### `size[1] = 0.7;`

…smaller.

### `const burn = m.dv !== 0 ? Math.exp(-m.since / 0.35) : 0;`

The burn flash: full at the start of an orbit that began with a burn, fading away within about a second.

### `pos.set([v.x, v.y, v.z], 6);`

The flash is at the planet…

### `col.set([2.5 * burn, 1.4 * burn, 0.6 * burn], 6);`

…orange-white, fading…

### `size[2] = 0.6 + 1.4 * (1 - burn);`

…and spreading out as it fades.

### `state.bodies.attributes.position.needsUpdate = true;`

Tells three.js the positions changed…

### `state.bodies.attributes.aColor.needsUpdate = true;`

…the colours…

### `state.bodies.attributes.aSize.needsUpdate = true;`

…and the sizes.

### `state.bodyMat.uniforms.uScale.value = height * 0.5;`

Scales the dots to the screen's height…

### `state.starMat.uniforms.uScale.value = height * 0.5;`

…and the background stars.

### `const ctl = ctx.controls;`

The drag controls.

### `if (ctl) {`

If they're on:

### `state.dir.copy(ctx.camera.position).sub(ctl.target).normalize();`

Keeps whatever direction you've turned the view to…

### `const d = 3.2 + 2.3 * m.frameA;`

…but moves the camera out or in to fit the current orbit.

### `ctl.target.set(m.frameX, 0.12 * d, 0);`

Aims at the middle of the oval, a little above it, so the orbit sits below the equation.

### `ctx.camera.position.copy(ctl.target).addScaledVector(state.dir, d);`

Puts the camera that far back along the direction you chose.

### `dispose(ctx, state) {`

Tidies up when you leave.

### `state.glow.dispose();`

Frees the glow's hidden pictures…

### `state.lines.dispose();`

…the thin lines…

### `state.bright.dispose();`

…and the thick lines.
