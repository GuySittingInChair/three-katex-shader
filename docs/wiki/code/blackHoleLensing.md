---
summary: Every line of the Black Hole Lensing sketch explained, from the camera to the bending of light.
added: 2026-11-20
sketch: blackHoleLensing
---

# Black Hole Lensing: the code, line by line

The explanations behind the clickable code of [Black Hole Lensing](../sketches/blackHoleLensing.md). Units
throughout: the black hole's mass M is 1, and so are the speed of light and the strength of gravity, so every
distance is "how many M" (for a hole ten times the Sun's mass, one M is about 15 km).

## Symbols

### `u` {#u}

One over the distance from the centre of the hole: u = 1/r. It's 0 far away and grows as light gets closer.
The equation is written in u rather than r because that makes it much simpler to solve.

### `\varphi` {#phi}

φ (phi): how far round the hole the light has gone, as an angle. The ray is followed in small steps of φ.

### `M` {#M}

The black hole's mass, which sets the scale of everything. In the code it is 1, so it doesn't appear: the 3Mu²
of the equation is written `3.0 * u * u`.

### `r` {#r}

Distance from the centre of the hole, in units of M. The event horizon is at r = 2, the photon orbit at r = 3,
and the glowing gas runs from r = 6 to 16.

### `b_{\text{shadow}}` {#b}

The shadow's edge: light aimed closer than 3√3 ≈ 5.2 units from the centre falls in. In the code it isn't a
number anyone sets; it comes out of the equation, at the line that turns a pixel black.

### `18` {#dist}

How far the camera is from the hole, in units of M: the **distance** slider.

### `3^\circ` {#deg}

How high the camera is above the plane of the gas, in degrees, worked out by `motion` and gliding between 3°
and 35°.

## Lines

### `const PERIOD = 24;`

One loop of the camera's rise and fall lasts 24 seconds.

### `export default {`

The start of the sketch's description of itself: name, sliders, shader and so on.

### `name: 'Black Hole Lensing',`

The title on screen and in the gallery.

### `description:`

The sentence under the title, written over the next three lines (the `+` joins the pieces of text).

### `'Light traced around a black hole with general relativity, per pixel on the GPU. Rays closer than 3√3 ' +`

First part of the description: every pixel works out its own ray of light, using Einstein's gravity.

### `'masses fall in (the shadow); the far side of the glowing disk is bent over the top into an arch; the side ' +`

Second part: the shadow and the arch.

### `'coming toward you is Doppler-boosted. The viewing angle is shown live.',`

Last part: the bright side, and the live camera angle in the equation.

### `tags: ['astronomy', 'general relativity', 'black hole', 'ray tracing', 'lensing'],`

Search words. `astronomy` also puts it on the [Astronomy page](https://aiship.lol/astronomy).

### `category: 'Physics',`

Its gallery shelf.

### `mode: 'shader',`

One flat picture painted by a single [shader](../shaders.md): there is no 3D scene at all. The "3D" you see is
worked out by following light rays inside the shader.

### `shaderLang: 'glsl',`

A note that the shader is written in GLSL.

### `motion(t) {`

Turns the clock into the camera's height (see [Motion and the live equation](../motion-and-latex.md)). Because
it only depends on the time, the loop repeats exactly.

### `const p = phaseOf(t, PERIOD);`

How far through the 24-second loop we are, from 0 to 1.

### `const deg = 3 + 32 * (0.5 - 0.5 * Math.cos(TAU * p));`

The camera's height in degrees. The part in brackets glides smoothly from 0 up to 1 and back once per loop (a
[cosine](../sine-and-cosine.md) wave, shifted and halved), so `deg` glides from 3° to 35° and back.
symbol: deg
#### `3`
The lowest the camera goes: 3° above the gas, nearly edge-on, the famous view from the film *Interstellar*.
#### `32`
How much higher it rises: 3 + 32 = 35° at the top.

### `return { deg, elev: (deg * Math.PI) / 180 };`

Hands back the height in degrees (for the equation on screen) and in radians (for the shader, because GLSL's
`sin` and `cos` work in radians). 180° is π radians.

### `latex: (params, hl, m) =>`

The equation on screen, rebuilt every frame so the camera numbers can change. `hl` paints a live number
yellow.

### `'\\begin{aligned}' +`

Lines the three rows of the equation up on their = signs.

### `'\\frac{d^2\\htmlData{sym=u}{u}}...`

Row one: the equation for a light ray's path, d²u/dφ² + u = 3Mu², with u = 1/r. Each `\htmlData{sym=…}` marks
a symbol you can click.
symbol: u

### `'\\htmlData{sym=b}{b_{\\text{shadow}}}...`

Row two: the shadow's size, 3√3 M, and the photon orbit at r = 3M, where light can circle forever.
symbol: b

### `` `\\text{camera } r &= ... ``

Row three: the camera's distance (the slider) and height (from `motion`), as live yellow numbers.
symbol: dist
#### `${hl(m.deg, 0)}`
The camera's height in whole degrees, from `motion`.
symbol: deg

### `'\\end{aligned}',`

Ends the three rows.

### `params: {`

The sliders.

### `speed: { value: 1, min: 0, max: 3 },`

How fast the camera rises and falls (it speeds up the `motion` clock). At 0 the camera stops where it is.

### `distance: { value: 18, min: 10, max: 30 },`

The camera's distance from the hole, in units of M. At 18 the shadow fills about 60% of the screen's height;
at 10 it's taller than the screen; at 30 it's about a third.
symbol: dist

### `quality: { value: 260, min: 120, max: 400, step: 10 },`

How many steps each ray may take before giving up. Each step goes 0.04 radians round the hole, so 260 steps
can follow a ray about 1.66 times round. Fewer steps run faster but can cut the thin rings short.

### `` fragmentShader: ` ``

The start of the shader, the program the graphics chip runs for every pixel.

### `uniform float uTime;`

The clock, in seconds; it makes the gas swirl.

### `uniform vec2 uResolution;`

The screen's width and height in pixels, so the picture isn't stretched on a wide screen.

### `uniform float uElev;`

The camera's height above the gas, in radians, from `motion`.

### `uniform float uDist;`

The camera's distance from the hole, from the slider.

### `uniform float uSteps;`

The **quality** slider: the most steps a ray may take.

### `varying vec2 vUv;`

This pixel's position on the screen, 0 to 1 across and up.

### `const float DISK_IN = 6.0;`

The inner edge of the gas, at 6 units: the closest that anything can orbit steadily. Closer in, orbits are
unstable and gas plunges straight into the hole, so real disks stop here.
symbol: r

### `const float DISK_OUT = 16.0;`

The outer edge of the gas, at 16 units. Chosen to fit nicely on screen; real disks reach much further.

### `float hash(vec3 p) {`

A scrambler that turns a position into a random-looking but repeatable number between 0 and 1 (see
[Noise](../noise.md)), used to scatter the background stars.

### `p = fract(p * 0.3183099 + vec3(0.11, 0.23, 0.37));`

Mixes the position up with odd numbers and keeps only the fractional part. 0.3183099 is 1/π, picked because
it's an unlikely number.

### `p *= 17.0;`

Stretches the result so that the next multiplication scrambles it more.

### `return fract(p.x * p.y * p.z * (p.x + p.y + p.z));`

Multiplies the parts together and keeps the fraction: a number that jumps unpredictably from one cell of space
to the next.

### `vec3 sky(vec3 d) {`

The starry background: what a ray sees if it flies off into the distance in direction `d`.

### `vec3 q = d * 160.0;`

Divides the sky into a grid of small cells, 160 across, so each can hold at most one star.

### `vec3 cell = floor(q);`

Which cell this direction falls in.

### `float h = hash(cell);`

The cell's random number.

### `float star = step(0.982, h) * smoothstep(0.55, 0.0, length(fract(q) - 0.5));`

A star in this cell only if its number is above 0.982 (about 1 cell in 55), drawn as a small soft dot in the
middle of the cell.
#### `step(0.982, h)`
0 if `h` is below 0.982, 1 if above: whether this cell has a star at all.
#### `smoothstep(0.55, 0.0, length(fract(q) - 0.5))`
Bright at the cell's centre and fading towards its edge: the star's soft round shape.

### `vec3 tint = mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.82, 1.0), hash(cell + 7.0));`

Each star gets its own colour, somewhere between a warm yellow-white and a cool blue-white, like real stars of
different temperatures.

### `float band = exp(-pow(d.y * 2.6 - 0.5 * d.x, 2.0)) * 0.06;`

A faint glowing band across the sky, a hint of the Milky Way, brightest along a tilted line and fading away
from it.

### `return star * tint * (0.5 + 0.5 * hash(cell + 3.0)) + band * vec3(0.55, 0.5, 0.7);`

The sky's colour: the tinted star (each at its own random brightness, between half and full) plus the faint
band.

### `vec3 disk(float r, vec3 p, vec3 rayDir) {`

The colour of the glowing gas where a ray hits it: `r` is how far out, `p` the exact spot, `rayDir` which way
the light was going.
symbol: r

### `float heat = pow(DISK_IN / r, 0.75);`

How hot the gas is: hottest at the inner edge and cooler further out, falling as r to the power ¾, the rule
for a real thin disk. At the outer edge it's about half as hot as at the inner one.

### `vec3 color = mix(vec3(0.85, 0.3, 0.07), vec3(1.0, 0.86, 0.62), heat);`

Cooler gas is deep orange, hotter gas pale yellow-white, blended by the heat.

### `float v = sqrt(1.0 / r);`

How fast the gas orbits, as a fraction of the speed of light: √(1/r). At the inner edge (r = 6) that's 0.41,
about 40% of the speed of light.

### `vec3 vDir = normalize(vec3(-p.z, 0.0, p.x));`

Which way the gas is moving at this spot: round the hole, at right angles to the line from the centre.

### `float g = sqrt(max(1.0 - 3.0 / r, 0.01)) / (1.0 - v * dot(vDir, -rayDir));`

How much the light's energy is changed on its way to you: the gas coming towards you boosts it (the bottom of
the fraction gets smaller), and the climb out of the hole's gravity saps it (the top).
#### `sqrt(max(1.0 - 3.0 / r, 0.01))`
The loss from climbing out of the gravity well, combined with the slowing of moving clocks. At the inner edge
it's √(1 − 3/6) = 0.71.
#### `v * dot(vDir, -rayDir)`
How much of the gas's speed is towards you: the Doppler effect. Coming straight at you at the inner edge, g is
1.20; going straight away, 0.50.

### `float angle = atan(p.z, p.x);`

Which way round the hole this spot is, as an angle: used to draw the swirls.

### `float swirl = 0.7 + 0.3 * sin(9.0 * angle + 5.0 * log(r) - uTime * 1.6 * pow(r / DISK_IN, -1.5));`

Spiral streaks in the gas, brightening and dimming by up to 30%. The inner gas turns faster than the outer gas
(its speed goes as r to the power −1.5, Kepler's rule), so the streaks wind up as they go round.

### `float edges = smoothstep(DISK_IN - 0.4, DISK_IN + 0.9, r) * smoothstep(DISK_OUT, DISK_OUT - 4.0, r);`

Fades the gas in softly at the inner edge and out over the last 4 units of the outer edge, so the disk has no
hard rims.

### `float I = heat * heat * pow(g, 3.0) * swirl * edges * 2.2;`

The brightness. Hotter gas is brighter, and the energy change counts three times over (`pow(g, 3.0)`): the
approaching side's g of 1.20 against the receding side's 0.50 makes it about 13.5 times brighter.
#### `pow(g, 3.0)`
g cubed. Light's brightness changes as the cube of its energy change, which is why the boosted side stands out
so strongly.

### `I = I / (1.0 + I);`

A gentle squeeze (a [tone map](../glossary.md#tone-map)): small brightnesses stay about the same, huge ones
approach 1 without ever going past it. So the bright side never turns into a flat white blob.

### `return color * mix(vec3(1.0, 0.85, 0.75), vec3(0.85, 0.95, 1.15), clamp(g - 0.6, 0.0, 1.0)) * I;`

The final gas colour: shifted redder where the light lost energy and bluer where it gained, then dimmed or
brightened by `I`.

### `float accel(float u) { return 3.0 * u * u - u; }`

The physics, in one line: how sharply a ray's path curves at u. It is the equation on screen rearranged,
d²u/dφ² = 3u² − u (with M = 1). Without the `3.0 * u * u`, light would travel in straight lines.
symbol: M
#### `3.0 * u * u`
Einstein's correction, 3Mu². Tiny far away, large close in: the reason light bends round the hole.

### `void main() {`

Where the shader starts: run once for every pixel.

### `vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);`

This pixel's position, measured from the centre of the screen and stretched across by the screen's shape, so
the shadow is a circle, not an oval.

### `vec3 cam = uDist * vec3(0.0, sin(uElev), cos(uElev));`

Where the camera is: `uDist` from the hole, raised by the angle `uElev` above the gas's plane.

### `vec3 fwd = normalize(-cam);`

The direction the camera looks: straight at the hole.

### `vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));`

The camera's "right", at right angles to where it looks and to straight up.

### `vec3 up = cross(right, fwd);`

The camera's "up", at right angles to the other two.

### `vec3 d = normalize(fwd + (uv.x * right + uv.y * up) * 0.95);`

The direction of this pixel's ray: the camera's forward direction, nudged right and up by the pixel's
position. The 0.95 sets how wide the view is (about 51° from top to bottom).

### `vec3 e1 = normalize(cam);`

Light round a black hole travels in a flat plane through the centre. This is one direction in that plane: from
the hole out through the camera.

### `vec3 side = d - dot(d, e1) * e1;`

The part of the ray's direction that isn't along `e1`: its sideways part within the plane.

### `float st = length(side);`

How much sideways part there is. Zero means the ray points straight at the hole or straight away.

### `if (st < 1e-6) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }`

A ray aimed exactly at the centre has no plane of its own; it falls straight in, so the pixel is black.

### `vec3 e2 = side / st;`

The second direction of the ray's plane, at right angles to `e1`. With `e1` and `e2`, the ray's whole 3D
journey becomes a flat path described by u and φ.

### `float u = 1.0 / uDist;`

The ray starts at the camera, so u starts at one over the camera's distance.
symbol: u

### `float du = -u * dot(d, e1) / st;`

How fast u is changing at the start: aiming towards the hole makes u grow (getting closer), aiming away makes
it shrink.

### `float phi = 0.0;`

The ray starts at angle 0 (pointing along `e1`, the line from the hole to the camera).
symbol: phi

### `float h = 0.04;`

The step size: 0.04 radians, about 2.3°, round the hole per step.

### `vec3 prev = cam;`

Where the ray was at the last step, to spot when it crosses the plane of the gas.

### `vec3 col = sky(d);`

The colour if nothing else happens: the star in the direction the ray started.

### `bool done = false;`

Whether the ray has already found what it hits.

### `for (int i = 0; i < 400; i++) {`

Follows the ray step by step, up to 400 steps (the shader language needs a fixed upper limit; the quality
slider stops it sooner).

### `if (float(i) >= uSteps) break;`

Stops at the **quality** slider's number of steps.

### `float k1u = du;              float k1v = accel(u);`

The first of four test measurements (RK4): how fast u and its rate of change are changing at the start of the
step.

### `float k2u = du + 0.5*h*k1v;  float k2v = accel(u + 0.5*h*k1u);`

The second test: halfway through the step, using the first test to guess where halfway is.

### `float k3u = du + 0.5*h*k2v;  float k3v = accel(u + 0.5*h*k2u);`

The third test: halfway again, using the better guess from the second.

### `float k4u = du + h*k3v;      float k4v = accel(u + h*k3u);`

The fourth test: at the end of the step.

### `u += h / 6.0 * (k1u + 2.0*k2u + 2.0*k3u + k4u);`

Moves u on by one step, using an average of the four tests with the two middle ones counting double. This is
far more accurate than one test alone, so the thin rings stay sharp.
symbol: u

### `du += h / 6.0 * (k1v + 2.0*k2v + 2.0*k3v + k4v);`

Moves u's rate of change on in the same way.

### `phi += h;`

One step further round the hole.
symbol: phi

### `vec3 radial = cos(phi) * e1 + sin(phi) * e2;`

The direction from the hole to the ray now, back in 3D: angle φ round its plane.

### `if (u > 0.5) { col = vec3(0.0); done = true; break; }`

u above 0.5 means r below 2: past the event horizon. Nothing comes back, so the pixel is black. Every pixel
that ends here is part of the shadow.
symbol: b

### `if (u <= 0.0) { col = sky(radial); done = true; break; }`

u at 0 means r is infinite: the ray has escaped, so the pixel shows the star in the direction it left in
(which may be far from where it started: that's the lensing).

### `vec3 p = radial / u;`

The ray's position now: direction times distance (1/u).
symbol: r

### `if (prev.y * p.y < 0.0) {`

If the ray went from above the gas's plane to below it, or the other way, during this step, it crossed the
plane.

### `vec3 hit = mix(prev, p, prev.y / (prev.y - p.y));`

Exactly where it crossed: part of the way from the last position to this one.

### `float r = length(hit);`

How far from the hole the crossing was.
symbol: r

### `if (r > DISK_IN - 0.5 && r < DISK_OUT) { col = disk(r, hit, normalize(p - prev)); done = true; break; }`

If the crossing was within the gas, the pixel shows the gas there (if not, the ray carries on, perhaps to hit
the gas on the other side after bending round).

### `prev = p;`

Remembers this position for the next step.

### `if (!done) col = sky(normalize(prev));`

If the ray ran out of steps while still circling, show the star in its last direction.

### `gl_FragColor = vec4(col, 1.0);`

Hands the pixel's colour to the screen.

### `uniforms() {`

Makes the shader's knobs, once at the start.

### `return { uElev: { value: 0.1 }, uDist: { value: 18 }, uSteps: { value: 260 } };`

Their starting values; `update` overwrites them every frame.

### `update(ctx, state) {`

Runs every frame and passes the moving numbers to the shader.

### `const u = state.uniforms;`

A short name for the shader's knobs (here `u` is just a name for them, not the u of the equation).

### `u.uElev.value = ctx.motion.elev;`

The camera's height, from `motion`.
symbol: deg

### `u.uDist.value = ctx.params.distance;`

The camera's distance, from the slider.
symbol: dist

### `u.uSteps.value = ctx.params.quality;`

The number of steps, from the **quality** slider.
