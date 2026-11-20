---
summary: Every line of the Fourier Epicycles sketch explained, from the heart's formula to the chain of circles.
added: 2026-11-20
sketch: fourierEpicycles
---

# Fourier Epicycles: the code, line by line

The explanations behind the clickable code of [Fourier Epicycles](../sketches/fourierEpicycles.md).

## Symbols

### `z(\tau)` {#z}

Where the pen is at angle τ: the tip of the last circle in the chain. It's written as one number that holds
both "across" and "up" (a *complex number*); in the code it's the pair `x`, `y`.

### `\tau` {#tau}

τ (tau): how far round its lap the pen has gone, as an angle. One full lap is 2π (about 6.28); the pen does
four laps per 24-second loop.

### `k` {#k}

A circle's speed: it turns k times while the pen goes round once. Negative k turns the other way. There are 49
speeds, −24 to 24.

### `c_k` {#c}

Circle k's arrow: its length is the circle's radius, and its direction is where it points when τ is 0. The
blend of the heart's arrow and the star's.

### `s` {#s}

The blend between the shapes: 0 is all heart, 1 is all star.

### `a_k` {#a}

The heart's arrow for speed k, worked out once at the start from 512 points on the heart.

### `b_k` {#b}

The star's arrow for speed k, worked out the same way from 512 points on the star.

## Lines

### `const PERIOD = 24;`

One full loop lasts 24 seconds: heart, heart turning into star, star, star turning back into heart.

### `const TURNS = 4;`

The pen goes round four times per loop, so one lap per 6-second stage.

### `const K = 24;`

The fastest circle: speeds run from −24 to 24, 49 in all. Enough to make the heart exactly and the star to
within 2.7%. Change it to 4 and the star turns into a puffy pentagon.
symbol: k

### `const SAMPLES = 512;`

How many points along each shape are used to work out the circles. More points give more exact circles; 512 is
plenty for speeds up to 24.

### `const SIZE = 2.7;`

Scales the shapes (which are about 1 unit across as written) up to fill the screen.

### `const CIRCLE_SEGMENTS = 40;`

Each circle is drawn as 40 short straight pieces, enough to look round.

### `const CURVE_SAMPLES = 360;`

The faint full shape and the bright trail are each drawn from 360 points, one per degree of the lap.

### `function heart(t) {`

The heart: give it an angle `t` (0 to one full turn) and it returns a point on the heart's outline.

### `return [`

The point, as a pair: across, then up.

### `(16 * Math.sin(t) ** 3) / 17,`

How far across: 16 times sine cubed (`** 3` means "to the power 3"), divided by 17 to make it about 1 unit
wide. This is a well-known heart curve.

### `(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.12,`

How far up: four cosine waves, turning once, twice, three times and four times per lap, which together make
the dip at the top and the point at the bottom. Because the fastest of them turns only 4 times, a chain of
circles with speeds −4 to 4 makes this heart exactly; that's why only 8 of the 49 circles have any size.
symbol: a
#### `Math.cos(4 * t)`
The fastest wobble in the heart: four times per lap.
#### `+ 0.12`
Nudges the heart up a little so it sits centred.

### `function star(t) {`

The star: give it an angle and it returns a point on a five-pointed star, made of ten straight edges.

### `const f = ((t / TAU) * 10) % 10;`

How far round the star we are, counted in edges: 0 to 10. `% 10` wraps back to 0 after the tenth edge.

### `const k = Math.floor(f);`

Which edge we're on (0 to 9). (This `k` is an edge number, not a circle speed.)

### `const w = f - k;`

How far along that edge, 0 to 1.

### `const vertex = (j) => {`

A small recipe for corner number `j` of the star.

### `const a = Math.PI / 2 + (j * TAU) / 10;`

The corner's direction: starting straight up (π/2) and going round in tenths of a turn.

### `const r = j % 2 ? 0.42 : 1;`

Even corners are the tips, 1 unit out; odd corners are the dips between them, 0.42 units out.

### `return [r * Math.cos(a), r * Math.sin(a)];`

The corner's position: distance `r` in direction `a` (see [sine and cosine](../sine-and-cosine.md)).

### `const A = vertex(k);`

The corner at the start of this edge.

### `const B = vertex((k + 1) % 10);`

The corner at the end of this edge (after the tenth comes the first again).

### `return [A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w];`

The point a fraction `w` of the way from A to B: a straight edge.
symbol: b

### `function coefficients(shape) {`

The Fourier transform: works out all 49 circles for a shape, once, at the start.

### `const pts = Array.from({ length: SAMPLES }, (_, j) => shape((TAU * j) / SAMPLES));`

512 points evenly spaced round the shape.

### `const order = [0];`

The list of speeds to work out, starting with 0 (the circle that doesn't turn: where the chain is anchored).

### `for (let k = 1; k <= K; k++) order.push(k, -k);`

Then 1, −1, 2, −2 and so on up to 24 and −24, so the chain goes slowest first. Big, slow circles come first
and small, fast ones ride on the end, which is easier to watch.
symbol: k

### `return order.map((k) => {`

For each speed `k`, work out that circle's arrow.

### `let re = 0;`

The arrow's across part, added up below.

### `let im = 0;`

The arrow's up part.

### `pts.forEach(([x, y], j) => {`

Goes through the 512 points; `x`, `y` is point number `j`.

### `const a = (-TAU * k * j) / SAMPLES;`

How far to turn point `j` back: k turns' worth over the whole lap. Parts of the shape that go round k times
per lap all end up pointing the same way after this, so they add up; everything else ends up pointing every
which way and cancels.

### `re += x * Math.cos(a) - y * Math.sin(a);`

Turns the point by angle `a` and adds its across part to the total.

### `im += x * Math.sin(a) + y * Math.cos(a);`

…and its up part.

### `return { k, re: (re / SAMPLES) * SIZE, im: (im / SAMPLES) * SIZE };`

The average of the turned points is circle k's arrow, scaled up to screen size.
symbol: c

### `const HEART = coefficients(heart);`

The heart's 49 arrows, worked out once when the sketch loads. All but 8 come out with no size at all.
symbol: a

### `const STAR = coefficients(star);`

The star's 49 arrows. All but 10 come out with no size: the star's five-fold symmetry only allows speeds 1, 6,
11, 16, 21 and −4, −9, −14, −19, −24.
symbol: b

### `function blendAt(s) {`

Mixes the heart's arrows and the star's: at `s` = 0 all heart, at 1 all star.
symbol: s

### `return HEART.map((a, i) => ({ k: a.k, re: a.re + (STAR[i].re - a.re) * s, im: a.im + (STAR[i].im - a.im) * s }));`

Each circle's arrow slides a fraction `s` of the way from its heart value to its star value, c_k = (1 − s) a_k +
s b_k.
symbol: c

### `function evaluate(c, tau) {`

Where the pen is at angle τ, for a given set of arrows: adds up all 49 spinning arrows.
symbol: z

### `let x = 0;`

The running total, across.

### `let y = 0;`

The running total, up.

### `for (const { k, re, im } of c) {`

For each circle's speed and arrow.

### `const cs = Math.cos(k * tau);`

The cosine of how far this circle has turned (k × τ).
symbol: tau

### `const sn = Math.sin(k * tau);`

…and the sine.

### `x += re * cs - im * sn;`

Turns the circle's arrow by k × τ and adds its across part: this is c_k e^{ikτ}, worked out by hand.

### `y += re * sn + im * cs;`

…and its up part.

### `return [x, y];`

The pen's position, z(τ).
symbol: z

### `export default {`

The start of the sketch's description of itself.

### `name: 'Fourier Epicycles',`

The title on screen.

### `description:`

The sentence under the title, over the next three lines.

### `'A chain of 49 spinning circles, each turning at a whole-number speed, whose tip draws a heart. Blending ' +`

First part of the description.

### `'their Fourier coefficients turns the same chain into one that draws a star, and back. The equation shows ' +`

Second part ("Fourier coefficients" are the circles' arrows).

### `'the pen angle τ and the blend s live.',`

Last part.

### `tags: ['fourier', 'epicycles', 'complex numbers', 'series'],`

Search words.

### `category: 'Waves',`

Its gallery shelf.

### `mode: '3d',`

Drawn as a 3D scene (lines in a flat plane), so you can turn it with the mouse.

### `controls: 'orbit',`

Drag to look around it (see [How the camera moves](../camera-and-controls.md)).

### `motion(t) {`

Turns the clock into the pen's angle and the blend (see [Motion and the live
equation](../motion-and-latex.md)).

### `const p = phaseOf(t, PERIOD);`

How far through the 24-second loop, 0 to 1.

### `const s = p < 0.25 ? 0 : p < 0.5 ? smooth((p - 0.25) / 0.25) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.25);`

The blend, in four quarters: the first quarter all heart (0), the second sliding smoothly to star, the third
all star (1), the fourth sliding back. `smooth` eases in and out so the change starts and stops gently.
symbol: s

### `return { tau: TAU * TURNS * p, s };`

τ goes from 0 to 4 full turns (8π) over the loop: four laps of the pen.
symbol: tau

### `latex: (params, hl, m) =>`

The equation on screen, rebuilt every frame.

### `'\\begin{aligned}' +`

Lines the rows up on their = signs.

### `'\\htmlData{sym=z}{z}...`

Row one: z(τ) = Σ c_k e^{ikτ} and c_k = (1 − s) a_k + s b_k. Each `\htmlData{sym=…}` marks a clickable symbol.
symbol: z

### `` `\\htmlData{sym=tau}{\\tau} &= ... ``

Row two: the live τ (within the current lap) and s, in yellow.
symbol: tau

### `'\\end{aligned}',`

Ends the rows.

### `params: {`

The sliders.

### `speed: { value: 1, min: 0, max: 3 },`

How fast the loop runs. At 0 everything freezes, mid-shape.

### `setup(ctx) {`

Builds the drawing tools once at the start.

### `ctx.camera.position.set(0, 0, 7.5);`

Puts the camera 7.5 units in front of the drawing, looking straight at it.

### `const circles = createFatLines({ maxSegments: HEART.length * (CIRCLE_SEGMENTS + 1), width: 1 });`

The pen for the circles and arms: thin lines 1 pixel wide, with room for every circle's 40 pieces plus its
arm.

### `const curve = createFatLines({ maxSegments: CURVE_SAMPLES * 2, width: 2.4 });`

The pen for the shape: the faint full outline and the bright trail, 2.4 pixels wide.

### `const pen = createDots({ maxPoints: 1 });`

One round dot: the pen tip.

### `ctx.scene.add(circles.object, curve.object, pen.object);`

Puts all three into the scene, so they're drawn.

### `return {`

Hands the tools and colours to `update` (as `state`).

### `circles,`

The circle-and-arm lines.

### `curve,`

The shape lines.

### `pen,`

The tip dot.

### `a: new THREE.Vector3(),`

A spare point, reused for every line's start, so no new ones are made each frame.

### `b: new THREE.Vector3(),`

A spare point for every line's end.

### `ring: new THREE.Color(0x3a4a66),`

The circles' colour: a dim slate blue.

### `arm: new THREE.Color(0x8fa4c8),`

The arms' colour: a lighter grey-blue, so the chain stands out from the circles.

### `ghost: new THREE.Color(0x2c3240),`

The faint full outline's colour: barely brighter than the background.

### `trail: new THREE.Color(),`

The trail's colour, set fresh for each piece (it brightens towards the pen).

### `penColor: new THREE.Color(0xffd166),`

The pen tip: the same warm yellow as the live numbers in every equation.

### `update(ctx, state) {`

Runs every frame and redraws everything.

### `const { circles, curve, pen, a, b } = state;`

Short names for the tools from `setup`.

### `const { tau, s } = ctx.motion;`

This moment's pen angle and blend, from `motion`.

### `const c = blendAt(s);`

This moment's 49 arrows: the heart's and the star's, blended.
symbol: c

### `const { width, height } = ctx.size;`

The screen's size, which the line and dot tools need to keep their widths in pixels.

### `circles.setResolution(width, height);`

Tells the circle lines the screen's size.

### `curve.setResolution(width, height);`

Tells the shape lines the screen's size.

### `pen.setCamera(ctx.camera, height);`

Tells the dot where the camera is, so it stays round and the right size.

### `circles.reset();`

Wipes last frame's circles; they're redrawn in their new positions below.

### `let x = c[0].re;`

The chain starts at circle 0's arrow: the non-turning one, which anchors the chain.

### `let y = c[0].im;`

…its up part.

### `for (let i = 1; i < c.length; i++) {`

Then each of the other 48 circles in turn, slowest first.

### `const { k, re, im } = c[i];`

This circle's speed and arrow.

### `const r = Math.hypot(re, im);`

Its radius: the arrow's length (`hypot` is the length of the slanted side of a right-angled triangle).

### `if (r > 0.004) {`

Only circles with some size are drawn. For the heart that's 8, for the star 10; the rest have no size and
would only be dots.

### `for (let j = 0; j < CIRCLE_SEGMENTS; j++) {`

Draws the circle as 40 short straight pieces.

### `const a0 = (TAU * j) / CIRCLE_SEGMENTS;`

The angle where piece `j` starts.

### `const a1 = (TAU * (j + 1)) / CIRCLE_SEGMENTS;`

The angle where it ends.

### `a.set(x + r * Math.cos(a0), y + r * Math.sin(a0), 0);`

The piece's start: on the circle round the current centre (`x`, `y`).

### `b.set(x + r * Math.cos(a1), y + r * Math.sin(a1), 0);`

The piece's end.

### `circles.push(a, b, state.ring);`

Adds the piece, in the circle colour.

### `const nx = x + re * Math.cos(k * tau) - im * Math.sin(k * tau);`

The end of this circle's arm: the arrow turned by k × τ, added to the centre. This is where the next circle is
centred.
symbol: k

### `const ny = y + re * Math.sin(k * tau) + im * Math.cos(k * tau);`

…its up part.

### `a.set(x, y, 0);`

The arm starts at this circle's centre…

### `b.set(nx, ny, 0);`

…and ends on its rim.

### `circles.push(a, b, state.arm);`

Adds the arm, in the arm colour.

### `x = nx;`

The next circle is centred where this arm ends.

### `y = ny;`

…up part too. After the last circle, (`x`, `y`) is the pen tip, z(τ).
symbol: z

### `circles.commit();`

Sends the finished circles and arms to the graphics chip.

### `curve.reset();`

Wipes last frame's shape lines.

### `let prev = evaluate(c, 0);`

The shape's starting point (τ = 0), for the faint outline.

### `for (let j = 1; j <= CURVE_SAMPLES; j++) {`

Goes round the whole shape in 360 steps.

### `const next = evaluate(c, (TAU * j) / CURVE_SAMPLES);`

The next point round the shape.

### `a.set(prev[0], prev[1], 0);`

A piece of outline from the previous point…

### `b.set(next[0], next[1], 0);`

…to the next.

### `curve.push(a, b, state.ghost);`

Adds it, in the faint outline colour: the whole shape, so you can see where the pen is going.

### `prev = next;`

Moves on.

### `const TRAIL = 0.75 * TAU;`

The bright trail covers the last three quarters of a lap behind the pen.

### `prev = evaluate(c, tau - TRAIL);`

The trail's oldest end: where the pen was three quarters of a lap ago.

### `for (let j = 1; j <= CURVE_SAMPLES; j++) {`

Draws the trail in 360 steps, from oldest to newest.

### `const f = j / CURVE_SAMPLES;`

How far along the trail, 0 (oldest) to 1 (at the pen).

### `const next = evaluate(c, tau - TRAIL * (1 - f));`

The next point along the trail.

### `a.set(prev[0], prev[1], 0);`

A trail piece from the previous point…

### `b.set(next[0], next[1], 0);`

…to the next.

### `state.trail.setHSL(0.93 - 0.15 * s, 0.75, 0.2 + 0.45 * f);`

The trail's colour: pink for the heart (hue 0.93, about 335°), sliding to purple for the star (0.78, about
281°), and brighter the nearer the pen. See [RGB, three numbers](../rgb.md) for hue, saturation and lightness.
#### `0.93 - 0.15 * s`
The hue: 0.93 (pink) at s = 0, 0.78 (purple) at s = 1.
symbol: s
#### `0.2 + 0.45 * f`
The lightness: dim (0.2) at the old end, bright (0.65) at the pen, so the trail fades out behind it.

### `curve.push(a, b, state.trail);`

Adds the trail piece. (The tool copies the colour, so changing `trail` for the next piece doesn't change this
one.)

### `prev = next;`

Moves on along the trail.

### `curve.commit();`

Sends the outline and trail to the graphics chip.

### `pen.reset();`

Wipes last frame's dot.

### `a.set(x, y, 0);`

The dot goes where the chain ends: the pen tip.
symbol: z

### `pen.push(a, state.penColor, 0.07);`

Adds the yellow dot, 0.07 units across.

### `pen.commit();`

Sends it to the graphics chip.

### `dispose(ctx, state) {`

Tidies up when you leave the sketch.

### `state.circles.dispose();`

Frees the circle lines' memory on the graphics chip.

### `state.curve.dispose();`

…the shape lines'.

### `state.pen.dispose();`

…and the dot's.
