---
summary: Every line of The Sun's Eleven-Year Heartbeat explained: loading 142 years of sunspots, painting them on the Sun, and the graphs.
added: 2026-11-20
sketch: sunCycle
---

# The Sun's Eleven-Year Heartbeat: the code, line by line

The explanations behind the clickable code of [The Sun's Eleven-Year Heartbeat](../sketches/sunCycle.md). The
data is made by `tools/sun/build_sun.py` and loaded from `public/data/sun/`.

## Symbols

### `R` {#R}

The sunspot number: 10 × groups + single spots. The record since 1749 is a graph of it.

### `g` {#g}

The number of sunspot groups seen.

### `s` {#s}

The number of single spots seen.

### `\bar T` {#Tbar}

The average length of a cycle, from minimum to minimum, worked out from the 24 cycles since 1755: 11.03 years.

### `|\bar\phi|` {#phi}

How far from the Sun's equator the spots are on average, in degrees of latitude, north or south alike, with
big groups counting more.

### `t` {#t}

Years since the cycle's minimum (its quietest point).

### `\phi_0` {#phi0}

Where the fitted line starts: the spots' average distance from the equator at the start of a cycle, 23.4°.

### `k` {#k}

How fast the spots move towards the equator: −1.60° per year.

## Lines

### `const DATA_URL = '/data/sun/';`

Where the four data files live on the site.

### `const PHASES = [['sun', 9], ['cycle', 26], ['record', 10], ['sporer', 9]];`

The four parts of the loop and how many seconds each lasts: the busiest rotation, 142 years of spots, the
record since 1749, and Spörer's law.

### `const LOOP = PHASES.reduce((s, p) => s + p[1], 0);`

Adds them up: 54 seconds.

### `const MAPW = 1024, MAPH = 512;`

The size of the spot map in pixels: twice as wide as tall, because longitude goes all the way round (360°) and
latitude only from pole to pole (180°).

### `const SIZE_K = 2;`

Spots are drawn twice as wide as they really are, so they show. Set it to 1 for their true size.

### `const MONTHS = ['January', ... 'December'];`

Month names, for the dates in the equation.

### `const LIVE = { d: null };`

Somewhere to keep the loaded data so the equation can read it (it's empty until the files arrive).

### `` const SUN_VERT = /* glsl */ ` ``

The Sun's [vertex shader](../shaders.md): places each corner of the ball and works out what the other shader
needs.

### `varying vec3 vN, vP;`

The surface's direction (`vN`) and the point's place on the ball (`vP`), passed on to the colouring shader.

### `varying vec3 vView;`

The direction from the point to the camera.

### `void main() {`

Runs for every corner.

### `vP = position;`

The point on the ball, before any turning: its own grid, with y along the Sun's spin axis.

### `vN = normalize(normalMatrix * normal);`

Which way the surface faces, as seen by the camera.

### `vec4 mv = modelViewMatrix * vec4(position, 1.0);`

The point's position relative to the camera.

### `vView = normalize(-mv.xyz);`

The direction back towards the camera.

### `gl_Position = projectionMatrix * mv;`

Its place on screen.

### `` const SUN_FRAG = /* glsl */ ` ``

The Sun's colouring shader: runs for every pixel of the ball.

### `uniform sampler2D uMap;`

The spot map, a picture of the whole surface (white = clear, dark = spot).

### `uniform float uRot, uTime;`

How far the Sun has turned, and the clock.

### `varying vec3 vN, vP, vView;`

The three directions from the vertex shader.

### `float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`

A scrambler: turns a position into a random-looking number between 0 and 1. The odd constants are a well-known
recipe; any odd-looking numbers would do. See [Random numbers, and seeds](../randomness.md).

### `float noise(vec3 p) {`

Smooth *noise*: random-looking values that change gently from place to place, for the Sun's grainy surface.
See [Noise](../noise.md).

### `vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);`

Splits the position into which box of a grid it's in (`i`) and where inside the box (`f`), then eases `f` so
the blend has no sharp creases.

### `return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), ...`

A random number at each of the box's 8 corners, blended across the box: first along x, then y…

### `mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);`

…then the far face of the box, and finally the two faces blended along z.

### `void main() {`

Runs for every pixel of the Sun.

### `vec3 p = normalize(vP);`

The point on the ball, as a direction from the centre.

### `float lat = asin(clamp(p.y, -1.0, 1.0));`

Its latitude: how far north (positive) or south it is, as an angle.

### `float lon = atan(p.z, p.x);`

Its longitude, in the ball's own grid.

### `float carr = fract((lon + uRot) / 6.2831853);`

Its *Carrington longitude*: the Sun's own map grid, turned by how far the Sun has rotated, as a fraction 0 to
1 of the way round. (6.2831853 is one full turn in radians.)

### `float spot = texture2D(uMap, vec2(carr, 0.5 + lat / 3.14159265)).r;`

Looks up that place on the spot map: 1 for clear surface, lower for a spot, 0 for a spot's darkest middle (its
*umbra*).

### `float mu = clamp(dot(vN, vView), 0.0, 1.0);`

How squarely this bit of the surface faces us: 1 in the middle of the disc, 0 at the edge.

### `float limb = 1.0 - 0.62 * (1.0 - mu) - 0.15 * (1.0 - mu * mu);`

*Limb darkening*: the real Sun is darker towards its edge (its *limb*), because there we see only its cooler
outer layers. At the edge this formula gives 1 − 0.62 − 0.15 = 0.23 of the centre's brightness.

### `float gran = 0.9 + 0.1 * noise(p * 90.0 + uTime * 0.05) + 0.05 * noise(p * 23.0);`

The *granulation*: the real Sun's surface is a boiling pattern of bright cells. Here, fine noise drifting
slowly with time, plus a coarser layer, varying the brightness by about 10%.

### `vec3 photo = vec3(1.0, 0.78, 0.45) * limb * gran;`

The surface's colour (a warm orange-white), dimmed towards the edge, grainy.

### `vec3 c = mix(vec3(0.05, 0.02, 0.01), mix(vec3(0.45, 0.22, 0.08), photo, smoothstep(0.55, 1.0, spot)), ...`

The spots: near-black in the middle (the umbra), a brownish ring around it (the *penumbra*), blending into the
bright surface.
#### `smoothstep(0.55, 1.0, spot)`
From the brown ring to the clear surface, as the map goes from 0.55 to 1.
#### `smoothstep(0.15, 0.55, spot)`
From the black middle to the brown ring, as the map goes from 0.15 to 0.55.

### `c *= mix(1.0, limb, 0.3);`

A little more darkening towards the edge, for the spots too.

### `gl_FragColor = vec4(c * 1.15, 1.0);`

The pixel's colour, a touch brighter overall.

### `` const HALO_FRAG = /* glsl */ ` ``

The faint orange glow round the Sun, painted on a flat square behind it.

### `varying vec2 vUv;`

Where this pixel is on the square, 0 to 1 each way.

### `void main() {`

Runs for every pixel of the square.

### `float r = length(vUv - 0.5) * 2.0;`

Distance from the square's centre: 0 in the middle, 1 at the edge.

### `float a = smoothstep(1.0, 0.45, r) * (0.35 / (1.0 + 30.0 * max(r - 0.47, 0.0)));`

The glow's brightness: steady inside (where the Sun covers it anyway), falling off quickly outside the Sun's
edge, gone by the square's edge.

### `gl_FragColor = vec4(vec3(1.0, 0.6, 0.3) * a, 1.0);`

An orange glow. Drawn with additive blending, so it only adds light.

### `` const BF_FRAG = /* glsl */ ` ``

The butterfly diagram's shader: colours the panel from the butterfly picture, revealing it left to right.

### `uniform sampler2D uBF;`

The butterfly picture: time across, latitude up, brightness = how much spot area.

### `uniform float uReveal, uAlpha;`

How much of it is revealed so far (0 to 1, left to right), and the fade-in.

### `varying vec2 vUv;`

Where this pixel is on the panel.

### `void main() {`

Runs for every pixel of the panel.

### `if (vUv.x > uReveal) discard;`

Not yet revealed: draw nothing.

### `float a = texture2D(uBF, vUv).r;`

How much spot area there was at this time and latitude.

### `vec3 c = mix(vec3(0.0), vec3(1.0, 0.45, 0.1), smoothstep(0.0, 0.5, a)) + vec3(0.0, 0.4, 0.5) * ...`

A colour scale: nothing is black, some is orange, a lot turns pale yellow-white (blue-green added on top of
the orange).

### `float edge = smoothstep(0.0, 0.004, uReveal - vUv.x);`

0 right at the revealing edge, 1 just behind it…

### `gl_FragColor = vec4(c * uAlpha * (0.5 + 0.5 * edge) + vec3(1.0) * (1.0 - edge) * 0.4 * uAlpha, 1.0);`

…so the edge shows as a thin white line moving across, like a pen drawing it.

### `` const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; ... ``

A small shared vertex shader for the flat panels: passes on where each pixel is on the panel.

### `async function load() {`

Fetches the data files and unpacks them. `async` means it can wait for the files without freezing the page.

### `const [meta, spots, ssn, bf] = await Promise.all([`

Asks for all four files at once and waits for them all:

### `fetch(DATA_URL + 'meta.json').then((r) => r.json()),`

The summary file: the rotations' dates, the cycles, the Spörer fit, and so on.

### `...['spots.bin', 'ssn.bin', 'butterfly.bin'].map((f) => fetch(DATA_URL + f).then((r) => r.arrayBuffer())),`

The three packed number files: every group, the monthly sunspot numbers, and the butterfly picture.

### `const dv = new DataView(spots), n = spots.byteLength / 8;`

Each group record is 8 bytes (four 2-byte numbers), so there are size ÷ 8 records: 50,473.

### `const rot = new Uint16Array(n), lat = ... area = new Float32Array(n);`

Four lists to unpack them into: rotation, latitude, longitude, area.

### `for (let i = 0; i < n; i++) {`

For each record:

### `rot[i] = dv.getUint16(i * 8, true); ... area[i] = dv.getUint16(i * 8 + 6, true);`

Reads its four numbers. Latitude and longitude were stored as whole hundredths of a degree, so they're divided
by 100.
#### `lat[i] = dv.getInt16(i * 8 + 2, true) / 100`
Latitude can be negative (south), so it's read as a signed number.

### `const start = new Int32Array(meta.nrot + 1).fill(-1), ... latSum = new Float32Array(meta.nrot);`

For each of the 1,908 rotations: where its records start in the list, its total spot area, its number of
groups, and a running sum for its mean latitude.

### `for (let i = n - 1; i >= 0; i--) start[rot[i]] = i;`

The records are in rotation order; going backwards, each rotation's start ends up at its first record.

### `start[meta.nrot] = n;`

An end marker after the last rotation.

### `for (let r = meta.nrot - 1; r >= 0; r--) if (start[r] < 0) start[r] = start[r + 1];`

A rotation with no spots at all (they happen near minimum) gets an empty range.

### `for (let i = 0; i < n; i++) { total[rot[i]] += area[i]; groups[rot[i]]++; latSum[rot[i]] += ... }`

Adds up each rotation's totals: area, groups, and latitude weighted by area (so big groups count more).
#### `groups[rot[i]]++`
One more group for that rotation: the *g* in Wolf's count, for the Greenwich years.
symbol: g

### `let busiest = 0;`

Find the rotation with the most spot area…

### `for (let r = 0; r < meta.nrot; r++) if (total[r] > total[busiest]) busiest = r;`

…by checking every one: rotation 1409, January 1959, 22,956 millionths of a hemisphere.

### `const S = new Float32Array(ssn);`

The monthly sunspot numbers: three numbers a month (the date as a year, that month's count, and the smoothed
count).

The sketch never counts single spots (*s*) itself: these numbers arrive already worked out by SILSO, from the
groups and spots counted by observers since 1749.
symbol: s

### `return { meta, n, rot, lat, lon, area, start, total, groups, latSum, busiest, ssn: S, bf: new Uint8Array(bf) };`

Everything, unpacked.

### `const yearOfRot = (M, r) => M.rotYear[0] + (r / M.nrot) * (M.rotYear[M.nrot] - M.rotYear[0]);`

The date (as a year with a fraction) of rotation `r`: rotations are evenly spaced, 27.2753 days apart.

### `const dateText = (y) => { const yr = Math.floor(y), mo = Math.min(11, Math.floor((y - yr) * 12)); ... };`

Turns 1959.003 into "January 1959".

### `export default {`

The start of the sketch's description of itself.

### `name: "The Sun's Eleven-Year Heartbeat",`

The title on screen.

### `description:`

The sentence under the title, over the next four lines.

### `'A hundred and forty years of sunspots, every group painted where it really was, rotation by rotation, ' +`

First part.

### `'while the butterfly diagram draws itself: each cycle starts at mid-latitudes and drifts to the equator. ' +`

Second part.

### `'Then the sunspot number since 1749, the cycle length measured from it, and Spörer\'s law fitted. Data: ' +`

Third part.

### `'Royal Greenwich Observatory, USAF/NOAA, compiled by NASA Marshall; WDC-SILSO, Royal Observatory of Belgium.',`

The data's sources.

### `tags: ['sun', 'sunspots', 'solar cycle', 'butterfly diagram', 'real data', 'magnetism', 'time series'],`

Search words.

### `category: 'Astronomy',`

Its gallery shelf, which also puts it on the Astronomy page.

### `mode: '3d',`

A 3D scene.

### `motion(t) {`

Turns the clock into which part is playing (see [Motion and the live equation](../motion-and-latex.md)).

### `const T = ((t % LOOP) + LOOP) % LOOP;`

The time within the 54-second loop.

### `let acc = 0;`

The start of each part, added up as it goes.

### `for (const [phase, len] of PHASES) {`

For each part in turn:

### `if (T < acc + len) return { T, phase, u: (T - acc) / len, len };`

If the time falls inside this part, that's the one: hand back its name, and how far through it is (`u`, 0 to
1).

### `acc += len;`

Otherwise move on to the next part.

### `return { T, phase: 'sun', u: 0, len: PHASES[0][1] };`

A fallback that's never reached in practice.

### `latex: (params, hl, m) => {`

The equation on screen, different for each part.

### `const d = LIVE.d;`

The loaded data, if it has arrived.

### `if (!d) return '\\text{loading 142 years of sunspots…}';`

Until it has, a loading message.

### `const M = d.meta, r = LIVE.r ?? d.busiest;`

The summary, and which rotation is on the Sun right now (`update` sets it; until then, the busiest).

### `if (m.phase === 'sun')`

Part 1, the busiest rotation:

### `` return `\\begin{aligned}&\\text{Carrington rotation } ... ``

Its number and date (rotation 1409, January 1959), its 94 groups and 22,956 millionths of a hemisphere, and
what a spot is: a knot of magnetic field holding back heat, about 1,500 degrees cooler, drawn twice as wide as
real.

### `if (m.phase === 'cycle') {`

Part 2, the years flying past:

### `const y = yearOfRot(M, r), lm = d.total[r] > 0 ? d.latSum[r] / d.total[r] : 0;`

This rotation's date, and its spots' mean distance from the equator, weighted by area (0 if there are no
spots).

### `` return `\\begin{aligned}&\\text{${dateText(y)}},\\ \\text{rotation } ... ``

The date, the rotation, its number of groups and their mean latitude, with a reminder of the pattern to watch
for.

### `if (m.phase === 'record') {`

Part 3, the record since 1749:

### `const last = M.maxima[M.maxima.length - 1];`

The latest peak found in the record: late 2024, smoothed sunspot number 161.

### `` return `\\begin{aligned}&\\htmlData{sym=R}{R} = 10\\htmlData{sym=g}{g} + ... ``

Wolf's count, R = 10g + s; the number of cycles and their average length with its spread (11.03 ± 1.15 years);
the periodogram's best rhythm (11 years; the build script found 11.00 exactly, trying periods 0.025 years
apart); and the latest peak.
symbol: R
#### `\\htmlData{sym=Tbar}{\\bar T}`
The average cycle length.
symbol: Tbar

### `` return `\\begin{aligned}&\\text{Spörer's law: } ... ``

Part 4: the fitted line |φ̄|(t) = φ₀ + k t, with φ₀ = 23.4° and k = −1.60° a year.
symbol: phi
#### `\\htmlData{sym=phi0}{\\phi_0}`
Where the line starts.
symbol: phi0
#### `\\htmlData{sym=k}{k}`
Its slope.
symbol: k
#### `\\htmlData{sym=t}{t}`
Years since minimum.
symbol: t

### `params: {`

The sliders.

### `speed: { value: 1, min: 0, max: 3 },`

How fast the loop plays. At 0 everything stops.

### `setup(ctx) {`

Builds everything once at the start.

### `const cam = ctx.camera;`

A short name for the camera.

### `cam.fov = 40; cam.near = 0.05; cam.far = 100; cam.updateProjectionMatrix();`

A narrowish 40° view, drawing things from 0.05 to 100 units away.

### `ctx.scene.background = new THREE.Color(0x020204);`

A near-black background.

### `ctx.scene.add(cam);`

The camera goes into the scene, so things can be attached to it (the graph panel rides in front of it).

### `const s = { ready: false, disposed: false };`

Notes on whether the data has arrived, and whether you've already left.

### `const cv = document.createElement('canvas');`

A hidden drawing surface for the spot map.

### `cv.width = MAPW; cv.height = MAPH;`

1024 × 512 pixels.

### `const g2 = cv.getContext('2d');`

The browser's 2D drawing tools for it.

### `g2.fillStyle = '#fff'; g2.fillRect(0, 0, MAPW, MAPH);`

Starts all white: clear surface, no spots.

### `const map = new THREE.CanvasTexture(cv);`

Turns the drawing into a [texture](../textures.md) the shader can look up.

### `map.wrapS = THREE.RepeatWrapping;`

Longitude wraps round: 360° is 0°, so the map's left and right edges join smoothly.

### `const sunMat = new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, ... });`

The Sun's paint: the two Sun shaders, with the spot map, the turn and the clock as knobs.

### `const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), sunMat);`

The Sun: a ball of radius 1, made of 128 × 96 little panels so its edge looks round.

### `const tilt = new THREE.Group();`

A holder for the ball…

### `tilt.rotation.x = THREE.MathUtils.degToRad(7.25);`

…tilted 7.25°, the angle the Sun's spin axis leans from the plane of the Earth's orbit.

### `tilt.add(sun);`

The ball goes in the tilted holder.

### `ctx.scene.add(tilt);`

Into the scene.

### `const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.ShaderMaterial({ ... }));`

The glow round the Sun: a flat square, 4.6 wide (2.3 times the Sun's width), painted by the halo shader and
added on as light.

### `halo.position.z = -0.2;`

Just behind the Sun.

### `ctx.scene.add(halo);`

Into the scene.

### `const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ ... }));`

A dark see-through card behind the graphs, so they stand out from the Sun's glow.

### `card.renderOrder = 8;`

Drawn late, on top of the Sun…

### `cam.add(card);`

…and attached to the camera, so it stays put on screen.

### `const bfMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BF_FRAG, ... });`

The butterfly diagram's paint. Its picture (`uBF`) is filled in once the data arrives.

### `const bfQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bfMat);`

The panel it's painted on.

### `bfQuad.renderOrder = 9;`

Drawn after the card, so it's on top.

### `cam.add(bfQuad);`

Attached to the camera.

### `const hud = createFatLines({ maxSegments: 6000, width: 1.4, overlay: true });`

Lines for the graphs: up to 6,000 pieces, drawn over everything (see [Lines and
points](../lines-and-points.md)).

### `hud.material.transparent = true;`

So they can fade in and out.

### `cam.add(hud.object);`

Attached to the camera.

### `load().then((d) => {`

Starts loading the data; when it arrives, this runs:

### `if (s.disposed) return;`

If you've already left the sketch, do nothing.

### `const M = d.meta;`

The summary.

### `const W = M.nrot, H = M.butterfly.cols, px = new Uint8Array(W * H * 4);`

The butterfly picture is 1,908 pixels wide (one per rotation) and 50 tall (strips of latitude), four numbers
(red, green, blue, opacity) per pixel.

### `for (let r = 0; r < W; r++) for (let b = 0; b < H; b++) { const v = d.bf[r * H + b], ... }`

Copies each rotation's 50 strips into the picture as grey levels. (The strips are equal steps of the *sine* of
latitude, so they cover equal areas of the Sun's surface; the build script did that.)

### `const tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);`

Turns the numbers into a texture.

### `tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;`

Blends smoothly between pixels when stretched or squeezed on screen, and sends it to the graphics chip.

### `bfMat.uniforms.uBF.value = tex;`

Hands it to the butterfly shader.

### `s.bfTex = tex;`

Kept, to free it on leaving.

### `LIVE.d = d; s.d = d; s.ready = true;`

The data is ready, for the equation and for `update`.

### `}).catch((err) => console.error('sun data', err));`

If a file fails to load, say why in the browser's error console.

### `return { s, cv, g2, map, sun, sunMat, tilt, halo, card, bfQuad, bfMat, hud, painted: -2, ... };`

Hands everything to `update`. `painted: -2` means "no rotation painted on the map yet".

### `update(ctx, state) {`

Runs every frame.

### `const { s, g2, map, sun, sunMat, halo, card, bfQuad, bfMat, hud, v, w, c } = state;`

Short names for the tools.

### `const cam = ctx.camera, m = ctx.motion;`

The camera, and this moment's part and progress.

### `const { width, height } = ctx.size;`

The screen's size.

### `const aspect = width / height, portrait = aspect < 1;`

How wide the screen is compared with its height; a phone held upright is *portrait*.

### `hud.setResolution(width, height); hud.reset();`

The graph lines need the screen size; last frame's lines are wiped.

### `const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), halfW = aspect * th;`

How much the camera sees, up and across, per unit of distance: used to fit things to the screen.

### `const dist = portrait ? 1.25 / (halfW * 0.92) : 1.25 / (th * 0.5);`

How far back the camera stands so the Sun fits: on an upright phone, by the width; on a wide screen, by the
height.

### `cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0);`

Puts the camera there, looking straight at the middle.

### `const sunY = (portrait ? 0.2 : 0.3) * th * dist, sunX = portrait ? 0 : -0.42 * halfW * dist;`

Where the Sun sits: in the upper part of the view, and on wide screens to the left, clear of the equation at
the top right.

### `sun.parent.position.set(sunX, sunY, 0); halo.position.set(sunX, sunY, -0.2);`

Moves the Sun (its tilted holder) and its glow there.

### `sunMat.uniforms.uTime.value = ctx.time;`

The clock, for the drifting granulation.

### `if (!s.ready) { hud.commit(); return; }`

No data yet: draw the bare Sun and stop here.

### `const d = s.d, M = d.meta;`

The data and its summary.

### `let r = d.busiest, spin = ctx.time * 0.35, win = 1;`

Which rotation to show (the busiest, to start), how far the Sun has turned (0.35 radians a second: one turn in
18 seconds on screen), and how many rotations of spots to paint at once.

### `if (m.phase === 'cycle') { const rf = Math.min(1, m.u / 0.96) * (M.nrot - 1); r = Math.floor(rf); win = 3; }`

In part 2, step through all 1,908 rotations in the first 96% of its 26 seconds (about 76 a second), painting
the current one and the two before it, fading, so spots don't flicker in and out.

### `if (m.phase === 'record' || m.phase === 'sporer') r = M.nrot - 1;`

In parts 3 and 4, the Sun keeps the last rotation, late 2016.

### `LIVE.r = r;`

Tells the equation which rotation is showing.

### `sunMat.uniforms.uRot.value = spin;`

Turns the spot map round the ball, so the Sun spins.

### `sun.rotation.y = 0;`

The ball itself never turns; only its pattern does.

### `if (state.painted !== r) {`

Only repaint the spot map when the rotation changes:

### `state.painted = r;`

Remember which one is painted.

### `g2.fillStyle = '#fff'; g2.fillRect(0, 0, MAPW, MAPH);`

Wipe the map white.

### `for (let k = win - 1; k >= 0; k--) {`

For each rotation to paint, oldest first:

### `const rr = r - k;`

Which rotation.

### `if (rr < 0) continue;`

None before the first.

### `const fade = 1 - k / win;`

Older rotations paint fainter.

### `for (let i = d.start[rr]; i < d.start[rr + 1]; i++) {`

For each group seen in that rotation:

### `const rho = Math.sqrt(2 * d.area[i] * 1e-6) * SIZE_K * (180 / Math.PI);`

Its size to paint, as an angle on the Sun in degrees. The area is in millionths of a hemisphere (half the
ball's surface, 2π for a ball of radius 1); a circle of that area has an angular radius of √(2 × area × 10⁻⁶)
radians. Doubled by `SIZE_K`; turned into degrees.

### `if (rho < 0.3) continue;`

Too small to see at this map size: skip it.

### `const x = (d.lon[i] / 360) * MAPW, y = (0.5 - d.lat[i] / 180) * MAPH, ry = ..., rx = ...;`

Its place on the map (longitude across, latitude up), and its size in map pixels: tall `ry`, and wide `rx`,
which is stretched away from the equator because the map stretches there (as a world map makes Greenland look
huge).
#### `rx = ry / Math.max(0.2, Math.cos((d.lat[i] * Math.PI) / 180))`
The stretch: 1 ÷ cos(latitude), capped at 5 times near the poles.

### `for (const dx of [0, -MAPW, MAPW]) {`

Paint it three times, shifted a whole map-width left and right, so a spot near the map's edge also appears on
the other side where the edges join.

### `if (x + dx + rx < 0 || x + dx - rx > MAPW) continue;`

Skip the copies that land entirely off the map.

### `g2.save(); g2.translate(x + dx, y); g2.scale(rx / ry, 1);`

Move the pen to the spot, and stretch the drawing sideways by the map's stretch.

### `const gr = g2.createRadialGradient(0, 0, 0, 0, 0, ry);`

A round fade from the spot's middle to its edge…

### `` gr.addColorStop(0, `rgba(0,0,0,${0.95 * fade})`); gr.addColorStop(0.35, `rgba(0,0,0,${0.85 * fade})`); ``

…dark in the middle third (the umbra)…

### `` gr.addColorStop(0.45, `rgba(0,0,0,${0.5 * fade})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ``

…half dark just outside (the penumbra), fading to nothing at the edge.

### `g2.fillStyle = gr; g2.beginPath(); g2.arc(0, 0, ry, 0, Math.PI * 2); g2.fill(); g2.restore();`

Paints the circle with that fade, and puts the pen back.

### `map.needsUpdate = true;`

Sends the new map to the graphics chip.

### `const Z = -1;`

The graphs sit 1 unit in front of the camera.

### `const gw = portrait ? 1.8 * halfW : Math.min(1.6 * halfW, 2.2 * th), gh = portrait ? 0.5 * th : 0.52 * th;`

The graph's width and height, fitted to the screen.

### `const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.27) * th;`

Its bottom-left corner: centred across, near the bottom.

### `const len = m.len;`

This part's length in seconds.

### `const K = smooth(Math.min(1, (m.u * len) / 0.8)) * (1 - smooth(Math.max(0, (m.u * len - len + 0.6) / 0.6)));`

The graphs' fade: in over the first 0.8 seconds of each part, out over the last 0.6. (This `K` is a
brightness.)

### `const showPanel = m.phase === 'sun' ? 0 : K;`

No graph panel in part 1.

### `card.position.set(0, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.1 * th, gh + 0.1 * th, 1);`

The dark card goes behind the graph, a little bigger than it.

### `card.material.opacity = 0.75 * showPanel;`

Three-quarters dark at most.

### `const col = (hex, k) => c.set(hex).multiplyScalar(k);`

A colour, dimmed by `k`.

### `const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };`

Draws one straight piece of graph from (x0, y0) to (x1, y1).

### `const GOLD = 0xffd166, GREY = 0x8a93a6;`

Gold for the data lines, grey for the axes.

### `bfQuad.visible = m.phase === 'cycle';`

The butterfly diagram shows only in part 2.

### `if (m.phase === 'cycle') {`

Part 2's graph:

### `const bh = gh * 0.66, by = gy + gh * 0.34;`

The butterfly takes the top two-thirds of the panel.

### `bfQuad.position.set(gx + gw / 2, by + bh / 2, Z - 0.001); bfQuad.scale.set(gw, bh, 1);`

Places and sizes it.

### `bfMat.uniforms.uReveal.value = Math.min(1, m.u / 0.96); bfMat.uniforms.uAlpha.value = K;`

Reveals it left to right in step with the rotations on the Sun, and fades it in.

### `seg(gx, by + bh / 2, gx + gw, by + bh / 2, GREY, 0.35 * K);`

A faint line across the middle: the Sun's equator.

### `const y0 = M.rotYear[0], y1 = M.rotYear[M.nrot], X = (yy) => gx + ((yy - y0) / (y1 - y0)) * gw;`

The time axis: 1874 at the left, 2016 at the right. `X` turns a year into a place across.

### `const S = d.ssn, n = S.length / 3, nowY = yearOfRot(M, r);`

The monthly sunspot numbers, how many months, and the year now showing.

### `let px = null, py = null;`

The previous point of the gold line (none yet).

### `for (let i = 0; i < n; i++) {`

For each month:

### `const yy = S[i * 3], sm = S[i * 3 + 2];`

Its date and smoothed sunspot number.

### `if (yy < y0 || yy > nowY || !(sm >= 0)) { px = null; continue; }`

Skip months before 1874, after the year now showing, or without a smoothed value (the first and last six).

### `const x = X(yy), y = gy + (sm / 300) * gh * 0.3;`

Its place: across by date; up by the count, with 300 filling the bottom third of the panel.

### `if (px !== null) seg(px, py, x, y, GOLD, K);`

A gold piece from the previous month.

### `px = x; py = y;`

This month becomes the previous one.

### `for (let yy = 1880; yy <= 2010; yy += 10) seg(X(yy), gy, X(yy), gy - 0.02 * th, GREY, 0.6 * K);`

Little ticks under the axis every ten years.

### `if (m.phase === 'record') {`

Part 3's graph, the record since 1749:

### `const S = d.ssn, n = S.length / 3, y0 = 1749, y1 = M.ssn.last;`

The months, from January 1749 to the latest (late 2026).

### `const X = (yy) => gx + ((yy - y0) / (y1 - y0)) * gw, Y = (vv) => gy + Math.min(1, vv / 400) * gh;`

Year to place across; count to place up, with 400 at the top (the highest month on record, May 1778, was 398).

### `seg(gx, gy, gx + gw, gy, GREY, 0.8 * K); seg(gx, gy, gx, gy + gh, GREY, 0.8 * K);`

The two axes.

### `const draw = Math.min(1, m.u / 0.5) * n;`

The graph draws itself over the first half of the part.

### `for (let i = 1; i < draw; i++) seg(X(S[(i - 1) * 3]), Y(S[(i - 1) * 3 + 1]), X(S[i * 3]), Y(S[i * 3 + 1]), 0x7a5a30, 0.6 * K);`

The raw monthly counts, a jagged dim brown line.

### `let px = null, py = null;`

Then the smoothed line on top:

### `for (let i = 0; i < draw; i++) {`

For each month drawn so far:

### `const sm = S[i * 3 + 2];`

Its smoothed count: the average over 13 months centred on it (with the two end months counting half), the
standard way to smooth the sunspot number.

### `if (!(sm >= 0)) { px = null; continue; }`

Skip months without one.

### `const x = X(S[i * 3]), y = Y(sm);`

Its place.

### `if (px !== null) seg(px, py, x, y, GOLD, K);`

A gold piece from the previous month.

### `px = x; py = y;`

And move on.

### `const km = smooth(Math.min(1, Math.max(0, (m.u - 0.5) / 0.2)));`

Once the graph has drawn, the minimum ticks fade in.

### `for (const mn of M.minima) seg(X(mn), gy, X(mn), gy + 0.08 * gh, 0x7fd4ff, km * K);`

A short blue tick at each of the 25 minima.

### `for (let yy = 1750; yy <= 2025; yy += 25) seg(X(yy), gy, X(yy), gy - 0.02 * th, GREY, 0.6 * K);`

Ticks under the axis every 25 years.

### `if (m.phase === 'sporer') {`

Part 4's graph, Spörer's law:

### `const X = (t) => gx + ((t + 1) / 13) * gw, Y = (l) => gy + (l / 35) * gh;`

Across: years since minimum, from −1 to 12. Up: latitude, 0° to 35°.

### `seg(gx, gy, gx + gw, gy, GREY, 0.8 * K); seg(gx, gy, gx, gy + gh, GREY, 0.8 * K);`

The two axes.

### `const e = 0.012 * th;`

The size of each cross.

### `for (const [t, l] of M.sporer.points) { const x = X(t), y = Y(l); seg(x - e, y, x + e, y, 0x7fd4ff, K); ... }`

A blue cross for every half-year of the cycle: the spots' mean latitude then, from all 12 cycles of the
Greenwich record stacked together.

### `const kf = smooth(Math.min(1, Math.max(0, (m.u - 0.2) / 0.3)));`

The fitted line grows in…

### `const t1 = 11 * kf;`

…out to 11 years…

### `if (kf > 0.01) seg(X(0), Y(M.sporer.lat0), X(t1), Y(M.sporer.lat0 + M.sporer.slope * t1), GOLD, K);`

…from 23.4° at minimum, falling 1.60° a year: the gold line.
symbol: phi0

### `for (let t = 0; t <= 12; t += 2) seg(X(t), gy, X(t), gy - 0.02 * th, GREY, 0.6 * K);`

Ticks every 2 years…

### `for (const l of [10, 20, 30]) seg(gx, Y(l), gx - 0.02 * th, Y(l), GREY, 0.6 * K);`

…and at 10°, 20° and 30°.

### `hud.commit();`

Sends the graph lines to the graphics chip.

### `dispose(ctx, state) {`

Tidies up when you leave.

### `const s = state.s;`

The notes.

### `s.disposed = true;`

So data arriving late is ignored.

### `ctx.camera.remove(state.card); ctx.camera.remove(state.bfQuad); ctx.camera.remove(state.hud.object);`

Takes the panels off the camera (the camera is shared with the next sketch).

### `state.hud.dispose();`

Frees the graph lines…

### `state.card.geometry.dispose(); state.card.material.dispose();`

…the card…

### `state.bfQuad.geometry.dispose(); state.bfMat.dispose();`

…the butterfly panel…

### `state.sun.geometry.dispose(); state.sunMat.dispose(); state.map.dispose();`

…the Sun and its map…

### `state.halo.geometry.dispose(); state.halo.material.dispose();`

…the glow…

### `if (s.bfTex) s.bfTex.dispose();`

…and the butterfly picture.

### `LIVE.d = null;`

Forgets the data.
