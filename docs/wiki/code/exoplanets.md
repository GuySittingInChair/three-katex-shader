---
summary: Every line of Six Thousand Worlds explained: loading 6,412 planets, the sky, the four charts and the fits behind them.
added: 2026-11-20
sketch: exoplanets
---

# Six Thousand Worlds: the code, line by line

The explanations behind the clickable code of [Six Thousand Worlds](../sketches/exoplanets.md). The data comes
from the NASA Exoplanet Archive, made into `public/data/exoplanets/` by `tools/exoplanets/build_exo.py`, which
also does every fit the equations show.

## Symbols

### `d_{\rm pc}` {#d}

A planet's distance from the Sun, in parsecs (1 parsec = 3.26 light-years). The sky shows its *logarithm*: 10
pc is 1, 100 pc is 2, 1,000 pc is 3.

### `R_{\rm gap}` {#Rgap}

The size, in Earth radii, at which planets are rarest: the bottom of the radius valley. 1.60 for a 10-day
year.

### `P` {#P}

A planet's orbital period: how many days its year lasts.

### `m` {#m}

How the gap's size changes with the length of the year: R_gap grows as P to the power m. Here m = −0.125, so
planets with longer years have their gap at slightly smaller sizes.

### `R` {#R}

A planet's radius, in Earth radii (Earth = 1, Jupiter = 11.2).

### `M` {#M}

A planet's mass, in Earth masses (Earth = 1, Jupiter = 318).

### `s` {#s}

How fast radius grows with mass: R grows as M to the power s. Measured in three pieces: 0.45, 0.59, then
−0.01.

### `S` {#S}

How much starlight a planet gets, compared with what the Earth gets from the Sun (Earth = 1). Its
*insolation*.

### `S_{\rm edge}` {#Sedge}

The starlight at an edge of the habitable zone, from Kopparapu and others (2014): S₀ plus four terms in the
star's temperature, with the numbers a, b, c, d they fitted to their climate models. The sketch draws four
edges.

### `T` {#T}

The star's temperature minus the Sun's (5,780 K in Kopparapu's formula), in kelvin.

### `T_\star` {#Tstar}

The star's surface temperature, in kelvin. The Sun's is 5,772 K.

## Lines

### `const DATA_URL = '/data/exoplanets/';`

Where the two data files live on the site.

### `const PHASES = [['census', 24], ['valley', 16], ['massRadius', 14], ['hz', 15], ['methods', 15]];`

The five parts and their lengths in seconds: the census, the radius valley, mass and radius, the habitable
zone, and what each method can see.

### `const LOOP = PHASES.reduce((s, p) => s + p[1], 0);`

Adds them up: 84 seconds.

### `const CW = 9, CH = 6;`

Every chart is 9 units wide and 6 tall.

### `const SKY = 1.3;`

On the sky, each ten-times step in distance is 1.3 units: 10 parsecs at 1.3, 100 at 2.6, 1,000 at 3.9.

### `const Y0 = 1991.6, Y1 = 2027.0;`

The census counts from just before the first planets (1992) to the end of 2026.

### `const AX = {`

Each chart's axes: what range of numbers each side covers. All but the habitable zone's up-axis are logarithms
(powers of ten).

### `valley: { x: [-0.5, 3.7], y: [-0.45, 1.4] },`

Radius valley: the year from 10^−0.5 = 0.3 days to 10^3.7 = 5,000 days across; radius from 0.35 to 25 Earth
radii up.
symbol: P

### `massRadius: { x: [-0.7, 4.0], y: [-0.45, 1.4] },`

Mass and radius: mass from 0.2 to 10,000 Earth masses across; radius as above.
symbol: M

### `hz: { x: [2.6, -1.6], y: [2400, 7300] },`

Habitable zone: starlight from 400 times Earth's down to 0.025 (reversed, so less starlight is to the right,
as if further from the star); star temperature from 2,400 to 7,300 K up.
symbol: S

### `methods: { x: [-2.2, 3.4], y: [-0.7, 4.3] },`

What each method can see: orbit size from 0.006 to 2,500 AU across; mass from 0.2 to 20,000 Earth masses up.

### `const LAYOUTS = ['sky', 'valley', 'massRadius', 'hz', 'methods'];`

The five places each planet can be: numbered 0 to 4.

### `const SOLAR = [`

The Solar System's eight planets, drawn as rings on the charts for scale: each one's year (days), orbit size
(AU), radius and mass (Earth = 1), and starlight (Earth = 1).

### `['Mercury', 87.97, 0.387, 0.383, 0.0553, 6.67], ['Venus', 224.7, 0.723, 0.949, 0.815, 1.91], ['Earth', 365.25, 1, 1, 1, 1],`

Mercury gets 6.67 times Earth's sunlight (1 ÷ 0.387², because light spreads out with the square of distance).

### `['Mars', 687, 1.524, 0.532, 0.107, 0.431], ['Jupiter', 4333, 5.203, 11.21, 317.8, 0.037], ...`

Mars, Jupiter, Saturn: Jupiter is 11.2 Earths wide and 318 Earths heavy.

### `['Uranus', 30687, 19.19, 4.01, 14.5, 0.0027], ['Neptune', 60190, 30.07, 3.88, 17.1, 0.0011],`

Uranus and Neptune: Neptune gets about a thousandth of Earth's sunlight.

### `const METHOD_COL = [0x5cd2ff, 0xff9a3c, 0xf06ae6, 0x6dff8a, 0xb4bccc];`

The colour for each way of finding planets: blue for transit, orange for wobble, pink for microlensing, green
for imaging, grey for everything else.

### `const LIVE = { d: null, year: Y0 };`

Somewhere to keep the loaded data and the census year, for the equation.

### `` const VERT = /* glsl */ ` ``

The planets' [vertex shader](../shaders.md): places each planet's point, sizes it and works out how bright it
is. It does all the moving: the main program only turns a few knobs.

### `attribute vec3 aP0, aP1, aP2, aP3, aP4;`

Each planet's five positions, one for each layout.

### `attribute vec4 aVal;`

Whether the planet belongs on each chart (1 or 0): a planet with no measured radius has no place on the radius
charts, for example.

### `attribute vec4 aInfo;`

Four more numbers per planet: how it was found, when it appears, how big to draw it, and its habitable-zone
flags.

### `attribute vec3 aCol;`

Its colour.

### `uniform float uA, uB, uK, uYear, uPx, uHz, uFade, uChart;`

The knobs: which two layouts to move between and how far (`uA`, `uB`, `uK`), the census year, the point size,
the habitable-zone highlight, the fade, and how far into "chart mode" it is.

### `varying vec3 vCol;`

The colour, passed on to the colouring shader…

### `varying float vA;`

…and the brightness.

### `vec3 at(float i) { return i < 0.5 ? aP0 : i < 1.5 ? aP1 : i < 2.5 ? aP2 : i < 3.5 ? aP3 : aP4; }`

Picks the position for layout number `i`.

### `float ok(float i) { return i < 0.5 ? 1.0 : i < 1.5 ? aVal.x : i < 2.5 ? aVal.y : i < 3.5 ? aVal.z : aVal.w; }`

Whether the planet belongs in layout `i`. Every planet belongs on the sky.

### `void main() {`

Runs for every planet.

### `vec3 p = mix(at(uA), at(uB), uK);`

The planet's position: part way from layout A to layout B. As `uK` goes from 0 to 1, all 6,412 planets fly
from one layout to the next together.

### `float shown = mix(ok(uA), ok(uB), uK);`

Planets that don't belong on the next chart fade out as they go.

### `float age = uYear - aInfo.y;`

How many years since this planet was found, at the census's current year (negative: not found yet).

### `float born = step(0.0, age);`

0 before it was found, 1 after: planets appear in the year of their discovery.

### `float flash = 1.0 + 4.0 * exp(-max(age, 0.0) * 5.0);`

A flash when it appears: 5 times as bright at first, 2.5 times after a fifth of a year, 1.3 times after half a
year (a quarter of a second, at the census's two years a second).

### `float f = aInfo.w;`

The habitable-zone flags: 0 (outside), 4 (inside), 8 (inside and smaller than 1.6 Earth radii).

### `float hzSmall = step(7.5, f), hzIn = step(3.5, mod(f, 8.0));`

Unpacks them: `hzSmall` is 1 for small planets in the zone, `hzIn` for any other planet in it.

### `float hz = mix(1.0, mix(0.22, 1.0, max(hzIn, hzSmall)), uHz);`

When the habitable zone is being highlighted, planets outside it dim to 22%.

### `vCol = mix(aCol, vec3(1.0, 0.82, 0.35), hzSmall * uHz);`

…and the small ones inside it turn gold.

### `vA = born * shown * hz * uFade * mix(flash, 1.0, uChart) * mix(0.9, 0.6, uChart);`

The final brightness: found yet, on this chart, highlighted, faded, flashing (on the sky only), and a little
dimmer on the charts where dots crowd together.

### `vec4 mv = modelViewMatrix * vec4(p, 1.0);`

The planet's position relative to the camera.

### `float size = mix(0.7 + 0.32 * aInfo.z, 1.0, uChart * 0.6) * (1.0 + 1.3 * hzSmall * uHz);`

Its size: bigger for bigger planets on the sky, more even on the charts, and 2.3 times bigger for the small
planets in the habitable zone when they're highlighted.

### `gl_PointSize = vA < 0.002 ? 0.0 : uPx * size * mix(flash, 1.0, 0.7);`

Its size on screen in pixels; invisible planets get no size at all, so they cost nothing to draw. The flash
makes a new planet up to 2.2 times as big for a moment (0.3 × 5 + 0.7).

### `gl_Position = projectionMatrix * mv;`

Its place on screen.

### `` const FRAG = /* glsl */ ` ``

The shader that paints each point.

### `varying vec3 vCol;`

The colour…

### `varying float vA;`

…and brightness.

### `void main() {`

Runs for every pixel of every point.

### `vec2 q = gl_PointCoord - 0.5;`

Where this pixel is in the point's square, from the middle.

### `float r2 = dot(q, q) * 4.0;`

Its distance from the middle, squared: 0 at the middle, 1 at the edge of the circle.

### `if (r2 > 1.0) discard;`

Outside the circle: draw nothing, so points are round.

### `gl_FragColor = vec4(vCol * vA * (exp(-r2 * 2.5) + 0.1), 1.0);`

Bright in the middle, softer towards the edge.

### `const EQ2GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.444829630, 0.7469822445], ...];`

A standard table of numbers that turns a direction on the sky as astronomers write it (*right ascension* and
*declination*, the sky's longitude and latitude, lined up with the Earth's equator) into the *galactic* grid,
lined up with the Milky Way's disc and pointing at its centre.

### `function skyPos(ra, dec, dpc, out) {`

Where to put a planet on the sky: from its star's direction and distance.

### `const a = THREE.MathUtils.degToRad(ra), d = THREE.MathUtils.degToRad(dec);`

The direction, in radians. (This `d` is the declination, not the distance.)

### `const e = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];`

The direction as an arrow of length 1, in the Earth-equator grid.

### `const g = EQ2GAL.map((r) => r[0] * e[0] + r[1] * e[1] + r[2] * e[2]);`

The same arrow in the galactic grid (each row of the table, multiplied with the arrow).

### `const r = SKY * Math.log10(Math.max(1.2, dpc));`

How far out to put it: the distance as a power of ten, times 1.3. Proxima Centauri b, 1.30 parsecs away, sits
0.15 units from the Sun; the furthest planet, 8,500 parsecs, only 5.1. Anything closer than 1.2 parsecs
(nothing is) would be put at 1.2.
symbol: d

### `out[0] = g[0] * r; out[1] = g[2] * r; out[2] = -g[1] * r;`

The scene position: across towards the Milky Way's centre, up out of its disc. So the disc lies flat.

### `const chartX = (k, v) => -CW / 2 + ((v - AX[k].x[0]) / (AX[k].x[1] - AX[k].x[0])) * CW;`

Turns a number into a place across chart `k`: the low end of the axis at the left edge, the high end at the
right.

### `const chartY = (k, v) => -CH / 2 + ((v - AX[k].y[0]) / (AX[k].y[1] - AX[k].y[0])) * CH;`

The same, up the chart.

### `const inside = (k, x, y) => Number.isFinite(x) && Number.isFinite(y) && ...;`

Whether a point is a real number and falls within chart `k`'s axes.

### `const seff = (c, T) => { const t = T - 5780; return c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4; };`

Kopparapu's formula for the starlight at a habitable-zone edge, for a star of temperature T: five numbers
(`c`) for each edge. For a Sun-like star: 1.11 times Earth's sunlight at the inner edge, 0.36 at the outer.
symbol: Sedge
#### `const t = T - 5780`
The star's temperature measured from the Sun's.
symbol: T

### `export default {`

The start of the sketch's description of itself.

### `name: 'Six Thousand Worlds',`

The title on screen.

### `description:`

The sentence under the title, over the next four lines.

### `'Every confirmed planet around another star — 6,412 of them — appearing in the sky in the year it was found, ...`

First part: what the census shows.

### `'(blue: it crossed its star; orange: it made its star wobble; ...`

The colour key.

### `'become four charts measured from the same table: ...`

The four charts…

### `'get Earth-like sunlight, and what each method can and cannot see. Data: NASA Exoplanet Archive (NASA/Caltech-IPAC).',`

…and the data's source.

### `tags: ['exoplanets', 'radius valley', 'habitable zone', 'mass-radius', 'kepler', 'tess', 'real data'],`

Search words.

### `category: 'Astronomy',`

Its gallery shelf, which also puts it on the Astronomy page.

### `mode: '3d',`

A 3D scene.

### `motion(t) {`

Turns the clock into which part is playing (see [Motion and the live equation](../motion-and-latex.md)).

### `const T = ((t % LOOP) + LOOP) % LOOP;`

The time within the 84-second loop.

### `let acc = 0;`

The start of each part, added up as it goes.

### `for (const [phase, len] of PHASES) {`

For each part in turn:

### `if (T < acc + len) return { T, phase, u: (T - acc) / len, len };`

If the time falls inside it, hand back its name and how far through it is (`u`, 0 to 1).

### `acc += len;`

Otherwise on to the next.

### `return { T, phase: 'census', u: 0, len: PHASES[0][1] };`

A fallback that's never reached in practice.

### `latex: (params, hl, m) => {`

The equation on screen, different for each part.

### `const d = LIVE.d;`

The loaded data, if it has arrived.

### `if (!d) return '\\text{loading the Exoplanet Archive…}';`

Until it has, a loading message.

### `const M = d.meta, k = m.u * m.len;`

The summary, and the seconds into this part. (This `M` is the summary, not a mass.)

### `if (m.phase === 'census') {`

The census:

### `const y = Math.min(2026, Math.max(1992, Math.floor(LIVE.year)));`

The year to show, kept between 1992 and 2026.

### `const c = d.countBy(LIVE.year);`

How many planets were known by then, in all and by method.

### `` return `\\begin{aligned}&${hl(y, 0)}:\\ ${hl(c.all, 0)}\\ \\text{planets known} ... ``

The year, the total, the count for each colour, and "other" (the total minus the four), so they add up.
symbol: d

### `if (m.phase === 'valley') {`

The radius valley:

### `const V = M.valley;`

Its fitted numbers.

### `` if (k < 8) return `\\begin{aligned}&\\text{size vs. orbit, } ... ``

For the first 8 seconds: how many planets are used (1,589) and what to notice.

### `` return `\\begin{aligned}&\\htmlData{sym=Rgap}{R_{\\rm gap}} \\propto ... ``

Then the fit: the gap's tilt m = −0.125, the two peaks (1.26 and 2.41 Earth radii) and the gap (1.60), and the
published numbers to compare.
symbol: Rgap
#### `\\htmlData{sym=P}{P}`
The year's length.
symbol: P
#### `\\htmlData{sym=m}{m}`
The tilt.
symbol: m

### `if (m.phase === 'massRadius') {`

Mass and radius:

### `const R = M.mr;`

Its fitted numbers. (This `R` is the fit, not a radius.)

### `` return `\\begin{aligned}&\\htmlData{sym=R}{R} \\propto ... ``

The three slopes (0.45, 0.59, −0.01), where they break (10 and 145 Earth masses), the scatter (0.11), and Chen
and Kipping's numbers to compare.
symbol: R
#### `\\htmlData{sym=M}{M}`
The mass.
symbol: M
#### `\\htmlData{sym=s}{s}`
The slope.
symbol: s

### `if (m.phase === 'hz') {`

The habitable zone:

### `const H = M.hz;`

Its counts.

### `` if (k < 6) return `\\begin{aligned}&\\text{starlight } ... ``

For the first 6 seconds: what the chart shows and Kopparapu's formula for the edges.
symbol: Sedge
#### `\\htmlData{sym=S}{S}`
Starlight.
symbol: S
#### `\\htmlData{sym=Tstar}{T_\\star}`
The star's temperature.
symbol: Tstar

### `` return `\\begin{aligned}&${hl(H.cons, 0)}\\ \\text{planets in the conservative zone} ... ``

Then the count: 181 planets in the zone, 17 of them small, some names, and 275 in the wider zone.

### `` if (k < 8) return `\\begin{aligned}&\\text{mass vs. orbit size: each method} ... ``

The last part, for 8 seconds: which corner of the chart each method fills.

### `` return `\\begin{aligned}&\\text{rings: our Solar System} ... ``

Then the punchline: Jupiter's twin barely in reach, Earth's twin still almost empty.

### `params: {`

The sliders.

### `speed: { value: 1, min: 0, max: 3 },`

How fast the loop plays.

### `setup(ctx) {`

Builds everything once at the start.

### `const cam = ctx.camera;`

A short name for the camera.

### `cam.fov = 45; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix();`

A 45° view, drawing things from 0.05 to 300 units away.

### `ctx.scene.background = new THREE.Color(0x010103);`

A near-black background.

### `const s = { ready: false, disposed: false };`

Notes on whether the data has arrived, and whether you've already left.

### `const lines = createFatLines({ maxSegments: 6000, width: 1.3 });`

Lines for the rings, axes and fitted curves (see [Lines and points](../lines-and-points.md)).

### `ctx.scene.add(lines.object);`

Into the scene.

### `const dots = createDots({ maxPoints: 64 });`

A few extra dots: the Sun in the middle of the sky.

### `ctx.scene.add(dots.object);`

Into the scene.

### `Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'exo.bin').then(...)]).then(([meta, buf]) => {`

Asks for both files at once (the summary, and the packed numbers for every planet); when both arrive, this
runs:

### `if (s.disposed) return;`

If you've already left, do nothing.

### `const f = new Float32Array(buf), S = meta.stride, n = f.length / S;`

The packed numbers: 13 per planet (`stride`), so 6,412 planets.

### `const P = LAYOUTS.map(() => new Float32Array(n * 3));`

Five lists of positions, one per layout, three numbers per planet.

### `const val = new Float32Array(n * 4), info = new Float32Array(n * 4), colA = new Float32Array(n * 3);`

The per-planet "on this chart?" flags, the info numbers, and the colours.

### `const H = meta.hz.coef, cc = new THREE.Color(), tmp = [0, 0, 0];`

Kopparapu's numbers, a spare colour and a spare position.

### `const years = new Float32Array(n), method = new Uint8Array(n);`

When each planet appears, and how it was found, for the census counts.

### `for (let i = 0; i < n; i++) {`

For each planet:

### `const o = i * S;`

Where its 13 numbers start.

### `const [ra, dec, dist, mth, yr, lP, lR, lM, mk, lS, Teff, flags, la] = f.subarray(o, o + S);`

Unpacks them: direction on the sky, distance, method, year found, then the logarithms of its year, radius and
mass, what kind of mass it is, the logarithm of its starlight, its star's temperature, which fits it was used
in, and the logarithm of its orbit size. Missing values are marked "not a number".

### `skyPos(ra, dec, dist, tmp);`

Its place on the sky.

### `P[0].set(tmp, i * 3);`

Stored as layout 0.

### `const radiusMeasured = mth === 0 || mth === 4;`

Only planets that pass in front of their star (found by transit, or by the timing of transits) have a measured
radius. For the others the archive fills in a radius estimated from the mass, which would be a guess on a
chart about radius.

### `const q = {`

Where the planet goes on each chart, if anywhere:

### `valley: radiusMeasured ? [lP, lR] : null,`

Radius valley: year across, radius up. Measured radii only.

### `massRadius: radiusMeasured && mk === 1 ? [lM, lR] : null,`

Mass and radius: only where both were measured (`mk === 1`: a real mass, not a minimum or an estimate).

### `hz: [lS, Teff],`

Habitable zone: starlight across, star temperature up. Every planet that has both.

### `methods: mk > 0 ? [la, lM] : null,`

What each method sees: orbit size across, mass up. Measured masses and minimum masses (from wobbles) count;
masses estimated from the radius don't.

### `for (let L = 1; L < LAYOUTS.length; L++) {`

For each chart:

### `const k = LAYOUTS[L], v = q[k];`

Its name, and the planet's two numbers for it.

### `const ok = v && inside(k, v[0], v[1]);`

Does the planet have a place on this chart?

### `if (ok) P[L].set([chartX(k, v[0]), chartY(k, v[1]), 0], i * 3);`

If so, put it there.

### `else P[L].set(P[L - 1].subarray(i * 3, i * 3 + 3), i * 3);`

If not, it stays where it was in the layout before, and fades out (next line), rather than flying off
somewhere.

### `val[i * 4 + L - 1] = ok ? 1 : 0;`

Remember whether it's on this chart.

### `const Sx = 10 ** lS, inHz = Teff > 2500 && Teff < 7200 && Sx <= seff(H.runaway, Teff) && Sx >= seff(H.maxGreenhouse, Teff);`

Is it in the habitable zone? Its starlight must be no more than the inner edge's (the *runaway greenhouse*:
any more and the oceans boil away) and no less than the outer edge's (the *maximum greenhouse*: any less and
even a thick carbon-dioxide blanket can't keep water liquid). The formula only covers stars between 2,500 and
7,200 K.
symbol: S

### `const small = Number.isFinite(lR) && 10 ** lR < 1.6;`

Smaller than 1.6 Earth radii, below the radius valley: probably rocky. (For planets that don't transit, this
uses the archive's estimated radius.)

### `const spread = ((i * 0.6180339887) % 1) * 0.999;`

The archive gives only the year of discovery, so each planet gets a made-up moment within its year, evenly
spread (stepping by the *golden ratio*, 0.618…, scatters them without clumps). Otherwise each year's planets
would all pop in at once on New Year's Day.

### `years[i] = yr + spread; method[i] = mth;`

Stored for the census counts.

### `info.set([mth, yr + spread, Number.isFinite(lR) ? Math.min(1.6, Math.max(0, lR + 0.2)) : 0.5, ...], i * 4);`

The four info numbers: method, appearance time, a drawing size from its radius (0 to 1.6), and the
habitable-zone flags (4 if in the zone, 8 if also small).

### `cc.set(METHOD_COL[mth === 4 ? 0 : Math.min(4, mth)]);`

Its colour: transit timing counts as transit (as in the census), and the six rarer methods share the grey.

### `colA.set([cc.r, cc.g, cc.b], i * 3);`

Stored.

### `const g = new THREE.BufferGeometry();`

One shape holding all 6,412 points.

### `g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));`

Three.js insists on positions; the shader works out the real ones, so these are zeros.

### `P.forEach((arr, L) => g.setAttribute('aP' + L, new THREE.BufferAttribute(arr, 3)));`

The five layouts' positions, as `aP0` to `aP4`.

### `g.setAttribute('aVal', new THREE.BufferAttribute(val, 4));`

The "on this chart?" flags…

### `g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));`

…the info numbers…

### `g.setAttribute('aCol', new THREE.BufferAttribute(colA, 3));`

…and the colours.

### `s.mat = new THREE.ShaderMaterial({`

The planets' paint, from the two shaders above:

### `vertexShader: VERT, fragmentShader: FRAG,`

The shaders…

### `uniforms: { uA: { value: 0 }, uB: { value: 0 }, uK: { value: 0 }, uYear: { value: Y0 }, uPx: { value: 5 }, ... },`

…their knobs, with starting values…

### `blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,`

…and light that adds up where points overlap, so crowded parts of a chart glow brighter (see
[Blending](../colour-blending-and-gain.md)).

### `s.points = new THREE.Points(g, s.mat);`

The planets, as a point cloud.

### `s.points.frustumCulled = false;`

Always drawn (three.js can't tell where the shader puts them).

### `ctx.scene.add(s.points);`

Into the scene.

### `s.geo = g; s.meta = meta;`

Kept for later.

### `const order = Array.from(years.keys()).sort((a, b) => years[a] - years[b]);`

The planets in order of appearance.

### `const sortedYears = Float32Array.from(order, (i) => years[i]);`

Their appearance times, in order.

### `const cumul = [0, 1, 2, 3].map(() => new Uint16Array(n + 1));`

Running totals for each of the four main methods: how many had appeared after the first j planets.

### `order.forEach((i, j) => { for (let c = 0; c < 4; c++) cumul[c][j + 1] = cumul[c][j] + (...); });`

Fills them in, counting transit timing as transit.

### `const countBy = (y) => {`

How many planets were known by year `y`, in all and by method:

### `let lo = 0, hi = n;`

Search the sorted times…

### `while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedYears[mid] <= y) lo = mid + 1; else hi = mid; }`

…by halving: check the middle, keep the half the answer is in. Thirteen steps find it among 6,412.

### `return { all: lo, 0: cumul[0][lo], 1: cumul[1][lo], 2: cumul[2][lo], 3: cumul[3][lo] };`

The total, and the running total for each method.

### `LIVE.d = { meta, countBy }; s.ready = true;`

Ready, for the equation and for `update`.

### `}).catch((err) => console.error('exoplanet data', err));`

If a file fails to load, say why in the browser's error console.

### `return { s, lines, dots, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), ... };`

Hands everything to `update`, with spare points and a colour to reuse.

### `update(ctx, state) {`

Runs every frame.

### `const { s, lines, dots, v, w, c } = state;`

Short names.

### `const cam = ctx.camera, m = ctx.motion;`

The camera, and which part is playing.

### `const { width, height } = ctx.size;`

The screen's size.

### `const aspect = width / height, portrait = aspect < 1;`

Wide or upright.

### `lines.setResolution(width, height); lines.reset(); dots.reset();`

The lines need the screen size; last frame's lines and dots are wiped.

### `const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);`

How much the camera sees per unit of distance, for fitting things on screen.

### `const local = m.u * m.len;`

Seconds into this part.

### `const ramp = (a, b) => smooth(Math.min(1, Math.max(0, (local - a) / (b - a))));`

A smooth 0-to-1 between second `a` and second `b` of this part: used for everything that fades or moves.

### `let A = 0, B = 0, K = 0, year = Y1, hz = 0, fade = 1, toChart = 1;`

The defaults: from layout A to layout B, K of the way; the census year; no highlight; fully shown; camera at
the chart.

### `if (m.phase === 'census') { year = Y0 + (Y1 - Y0) * Math.min(1, Math.max(0, (local - 0.4) / 18)); toChart = 0; }`

The census: the year runs from 1991.6 to 2027 over 18 seconds (about two years a second), with the camera on
the sky.

### `else if (m.phase === 'valley') { A = 0; B = 1; K = ramp(0.3, 3.3); toChart = K; }`

The radius valley: planets fly from the sky to the chart over 3 seconds, and the camera swings round to face
it.

### `else if (m.phase === 'massRadius') { A = 1; B = 2; K = ramp(0, 2.5); }`

Mass and radius: from the valley chart to this one in 2.5 seconds.

### `else if (m.phase === 'hz') { A = 2; B = 3; K = ramp(0, 2.5); hz = ramp(6, 7.5); }`

The habitable zone: to this chart, then from second 6 the planets in the zone are picked out.

### `else {`

The last part, what each method can see:

### `A = 3; B = 4; K = ramp(0, 2.5);`

To this chart…

### `const back = ramp(m.len - 3, m.len - 0.6);`

…and in the last 3 seconds…

### `if (back > 0) { A = 4; B = 0; K = back; toChart = 1 - back; }`

…back to the sky, ready for the next census.

### `fade = 1 - ramp(m.len - 0.6, m.len);`

Fading out at the very end, as the census starts again with no planets.

### `LIVE.year = year;`

Tells the equation the census year.

### `const fitSky = portrait ? 5.0 / (aspect * th) : 6.6 / th;`

How far away the camera stands for the sky, so the cloud of planets fits on screen.

### `const az = 0.9 + ctx.time * 0.06, el = THREE.MathUtils.degToRad(22);`

The camera circles slowly (0.06 radians a second: once round in 105 seconds), 22° above the Milky Way's plane.

### `state.a.set(Math.sin(az) * Math.cos(el) * fitSky, Math.sin(el) * fitSky, Math.cos(az) * Math.cos(el) * fitSky);`

Its position for the sky.

### `const ox = portrait ? 0.75 : 1.9, oy = portrait ? 1.1 : 0.45;`

Where to aim at the charts: shifted so the chart sits clear of the equation.

### `const dChart = portrait ? (CW * 0.64) / (aspect * th) : (CH * 0.98) / th;`

How far back to stand so a chart fits.

### `state.b.set(ox, oy, dChart);`

Its position for the charts, straight in front.

### `cam.position.copy(state.a).lerp(state.b, toChart);`

The camera glides between the two.

### `v.set(0, 0, 0).lerp(w.set(ox, oy, 0), toChart);`

…and so does where it looks.

### `cam.up.set(0, 1, 0);`

Keeps it upright.

### `cam.lookAt(v);`

Points it.

### `if (!s.ready) { lines.commit(); dots.commit(); return; }`

No data yet: stop here.

### `const U = s.mat.uniforms;`

The planets' shader knobs.

### `U.uA.value = A; U.uB.value = B; U.uK.value = K; U.uYear.value = year; ...`

Turns them: which layouts, how far between, the year, the highlight, the fade, how far into chart mode.

### `U.uPx.value = Math.max(2.5, Math.min(width, height) / 210);`

Point size in pixels, scaled to the screen (at least 2.5).

### `const px = dChart * th * 2 / height;`

How many scene units one pixel is on the chart, so the Solar System rings are a fixed size on screen.

### `const col = (hex, k) => c.set(hex).multiplyScalar(k);`

A colour, dimmed by `k`.

### `const seg = (x0, y0, z0, x1, y1, z1, hex, k) => { v.set(x0, y0, z0); w.set(x1, y1, z1); lines.push(v, w, col(hex, k)); };`

Draws one straight piece of line.

### `const GREY = 0x8a93a6;`

For the axes.

### `const skyK = 1 - toChart;`

How much of the sky to show.

### `if (skyK > 0.02) {`

If any:

### `for (const [dpc, k] of [[10, 0.5], [100, 0.4], [1000, 0.3]]) {`

Three rings, at 10, 100 and 1,000 parsecs, fainter further out…

### `const R = SKY * Math.log10(dpc);`

…at 1.3, 2.6 and 3.9 units. (This `R` is a ring's size, not a planet's radius.)

### `for (let q = 0; q < 120; q++) {`

Each ring in 120 pieces:

### `const a0 = (q / 120) * Math.PI * 2, a1 = ((q + 1) / 120) * Math.PI * 2;`

The piece's start and end angle…

### `seg(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R, 0x3a4a66, k * skyK);`

…drawn flat in the Milky Way's plane, dark blue.

### `for (let q = 0; q < 10; q += 2) seg(q * 0.5, 0, 0, (q + 1) * 0.5, 0, 0, 0xffc46b, 0.35 * skyK);`

A dashed gold line pointing towards the centre of the Milky Way.

### `dots.push(v.set(0, 0, 0), col(0xffd166, skyK), 0.09);`

A gold dot for the Sun.

### `const chartK = toChart;`

How far into chart mode.

### `const key = LAYOUTS[K > 0.5 ? B : A];`

Which chart's axes to draw: the one the planets are closer to.

### `if (chartK > 0.25 && key !== 'sky') {`

Draw the chart once the camera is a quarter of the way round:

### `const k = Math.min(1, (chartK - 0.25) / 0.6) * fade;`

Its brightness, fading in.

### `const X = (x) => chartX(key, x), Y = (y) => chartY(key, y);`

Number-to-place for this chart.

### `seg(-CW / 2, -CH / 2, 0, CW / 2, -CH / 2, 0, GREY, 0.8 * k); seg(-CW / 2, -CH / 2, 0, -CW / 2, CH / 2, 0, GREY, 0.8 * k);`

The two axes.

### `const ax = AX[key];`

This chart's ranges.

### `const logTicks = (lo, hi, fn) => { ... };`

Ticks for a ten-times axis: a long one at every power of ten (1, 10, 100…), short ones at 2 and 5 times each.

### `logTicks(ax.x[0], ax.x[1], (t, big) => seg(X(t), -CH / 2, 0, X(t), -CH / 2 - (big ? 0.16 : 0.08), 0, GREY, 0.7 * k));`

Ticks along the bottom.

### `if (key === 'hz') for (let T = 2500; T <= 7000; T += 500) seg(...);`

The habitable zone's up-axis is ordinary temperature, so its ticks are every 500 K, longer at each 1,000.

### `else logTicks(ax.y[0], ax.y[1], (t, big) => seg(...));`

The others get ten-times ticks.

### `const M = s.meta;`

The fitted numbers. (This `M` is the summary, not a mass.)

### `const curve = (fn, x0, x1, hex, kk, dash, nSeg = 80) => {`

Draws a curve y = fn(x) across the chart in 80 pieces, skipping parts outside it; dashed if asked.

### `let p = null;`

The previous point.

### `for (let q = 0; q <= nSeg; q++) {`

For each piece:

### `const x = x0 + (q / nSeg) * (x1 - x0), y = fn(x);`

A point on the curve…

### `const cur = inside(key, x, y) ? [X(x), Y(y)] : null;`

…placed on the chart, if it's inside it.

### `if (p && cur && (!dash || q % 2)) seg(p[0], p[1], 0.01, cur[0], cur[1], 0.01, hex, kk);`

A piece from the previous point (every other piece, if dashed).

### `p = cur;`

Move on.

### `if (key === 'valley') {`

The radius valley's extras:

### `const V = M.valley, gk = ramp(7.5, 9.5) * k;`

The fitted numbers, fading in from second 7.5.

### `curve((lp) => Math.log10(V.valley) + V.m * (lp - 1), -0.3, 2, 0xffffff, 0.75 * gk, true, 60);`

The gap, as a dashed white line: 1.60 Earth radii at a 10-day year, tilting down by m = −0.125. Drawn over
years of 0.5 to 100 days, where it was measured.
symbol: Rgap

### `const x0 = CW / 2 + 0.25, peak = Math.max(...V.kde);`

Just right of the chart, a side graph: how common each size is, along the tilt…

### `let prev = null;`

…drawn as a line…

### `V.grid.forEach((q, j) => {`

…point by point up the size axis:

### `const y = Y(q), x = x0 + (V.kde[j] / peak) * 1.3 * gk;`

Further right means more planets of that size. (The curve is a *kernel density*: each planet adds a small
smooth bump, and the bumps are added up.)

### `if (q >= AX.valley.y[0] && q <= AX.valley.y[1]) { if (prev) seg(...); prev = [x, y]; } else prev = null;`

A piece, if inside the chart's height. Two humps and a dip between: the valley.

### `if (gk > 0.01) { seg(x0, -CH / 2, 0, x0, CH / 2, 0, GREY, 0.4 * gk); for (const r of [V.peak1, V.valley, V.peak2]) seg(...); }`

A base line for the side graph, with white ticks at the two peaks (1.26 and 2.41) and the gap (1.60).

### `seg(X(1), -CH / 2, 0, X(1), -CH / 2 + 0.25, 0, 0xffffff, 0.5 * gk);`

A white tick on the bottom axis at 10 days, where those sizes are measured.

### `if (key === 'massRadius') {`

The mass–radius extras:

### `const R = M.mr, b1 = Math.log10(R.breaks[0]), b2 = Math.log10(R.breaks[1]);`

The fit, and its two break points (10 and 145 Earth masses) as logarithms.

### `const ours = (x) => R.c + R.s[0] * x + (R.s[1] - R.s[0]) * Math.max(0, x - b1) + (R.s[2] - R.s[1]) * Math.max(0, x - b2);`

The fitted line: three straight pieces joined at the breaks, slopes 0.45, 0.59 and −0.01.
symbol: s

### `const ck1 = Math.log10(2.04), ck2 = Math.log10(131.6);`

Chen and Kipping's (2017) break points, for comparison…

### `const ck = (x) => Math.log10(1.008) + 0.279 * Math.min(x, ck1) + 0.589 * ... - 0.044 * Math.max(0, x - ck2);`

…and their line, slopes 0.279, 0.589 and −0.044.

### `curve(ours, AX.massRadius.x[0], AX.massRadius.x[1], 0xffffff, 0.85 * ramp(3.5, 5.5) * k, false);`

Ours in solid white, from second 3.5…

### `curve(ck, AX.massRadius.x[0], AX.massRadius.x[1], 0xffc46b, 0.7 * ramp(7, 9) * k, true);`

…theirs dashed gold, from second 7.

### `if (key === 'hz') {`

The habitable zone's extras:

### `const H = M.hz.coef, bk = ramp(2, 4) * k;`

Kopparapu's numbers, the edges fading in from second 2.

### `const edge = (name, hex, kk, dash) => {`

Draws one edge as a line up the chart:

### `let p = null;`

The previous point.

### `for (let T = 2500; T <= 7200; T += 50) {`

For star temperatures from 2,500 to 7,200 K, every 50:

### `const x = Math.log10(seff(H[name], T)), cur = [X(x), Y(T)];`

The edge's starlight for that star, placed on the chart.
symbol: Tstar

### `if (p && (!dash || (T / 50) % 2)) seg(p[0], p[1], 0.01, cur[0], cur[1], 0.01, hex, kk);`

A piece from the previous point.

### `p = cur;`

Move on.

### `edge('runaway', 0x6dff8a, 0.8 * bk, false); edge('maxGreenhouse', 0x6dff8a, 0.8 * bk, false);`

The conservative zone's two edges, solid green.

### `edge('recentVenus', 0x6dff8a, 0.45 * bk, true); edge('earlyMars', 0x6dff8a, 0.45 * bk, true);`

The optimistic zone's, dashed and fainter. Its inner edge is the starlight Venus got about a billion years ago
(radar shows Venus has had no surface water for at least that long, so a planet getting less may still have
some); its outer edge is the starlight Mars got 3.8 billion years ago, when it seems to have had liquid water.

### `for (let T = 2550; T <= 7150; T += 100) seg(X(Math.log10(seff(H.runaway, T))), Y(T), 0, ...);`

Faint green lines filling the band between the two solid edges.

### `const ringK = (key === 'methods' ? ramp(7, 9) : ramp(1.5, 3)) * k;`

The Solar System's rings fade in: after 1.5 seconds on most charts, after 7 on the last (so the last chart's
punchline comes after its first message).

### `if (ringK > 0.01) for (const [name, Pd, a, Rr, Mm, Si] of SOLAR) {`

For each Solar System planet:

### `const qv = { valley: [...], massRadius: [...], hz: [Math.log10(Si), 5772], methods: [...] }[key];`

Its two numbers for this chart (on the habitable-zone chart, at the Sun's temperature, 5,772 K).

### `if (!inside(key, qv[0], qv[1])) continue;`

Skip it if it's off the chart.

### `const cx = X(qv[0]), cy = Y(qv[1]), earth = name === 'Earth', r = (earth ? 11 : 7) * px;`

Its place, and a ring 7 pixels across (11 for the Earth).

### `for (let q = 0; q < 24; q++) {`

In 24 pieces:

### `const a0 = (q / 24) * Math.PI * 2, a1 = ((q + 1) / 24) * Math.PI * 2;`

Start and end angle…

### `seg(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.02, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, ...);`

…white, or pale blue for the Earth.

### `lines.commit(); dots.commit();`

Sends the lines and dots to the graphics chip.

### `dispose(ctx, state) {`

Tidies up when you leave.

### `const s = state.s;`

The notes.

### `s.disposed = true;`

So data arriving late is ignored.

### `state.lines.dispose(); state.dots.dispose?.();`

Frees the lines and dots…

### `if (s.geo) { s.geo.dispose(); s.mat.dispose(); ctx.scene.remove(s.points); }`

…and the planets, if they were loaded.

### `LIVE.d = null;`

Forgets the data.
