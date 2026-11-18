# Simulating on the graphics chip: render targets and ping-pong

**In one sentence:** some sketches draw into a hidden picture instead of the screen, then read that picture
back as the starting point for the next step, so a simulation can run entirely on the graphics chip.

**Picture it:** two whiteboards. You copy what's on board A onto board B, changing it slightly as you go:
spreading a stain a little, say. Then you copy B back onto A with another small change. Back and forth,
hundreds of times. Each copy is one tick of the simulation. This back-and-forth is called *ping-pong*.

**Why sketches need it:** a chemical reaction in a dish of 512 × 512 cells means about 260,000 cells. Each
one has to be updated many times a second. The graphics chip can update all of them at once, but only if
the whole state lives in pictures it can read and draw into.

**Where you'll see it:** `belousovZhabotinsky.js`, `brusselatorDish.js`, `kaliInk.js`, `kaliPearls.js` and
`kaliAccretion.js`.

## The pieces

- A **render target** (`WebGLRenderTarget`) is a hidden picture you can draw into. Instead of red, green and
  blue, each pixel holds the amounts of the chemicals in that cell.
- A **step shader** reads the old picture, works out each cell's next amounts, and writes them into the
  other picture.
- A **display shader** reads the latest picture and turns the numbers into colours on screen.

**What it looks like in the code:** from the `update` of `src/sketches/belousovZhabotinsky.js`:

```js
for (let i = 0; i < steps; i++) {
  sm.uniforms.uState.value = state.targets[state.read].texture;
  renderer.setRenderTarget(state.targets[1 - state.read]);
  renderer.render(state.passScene, state.passCamera);
  state.read = 1 - state.read;
}
```

- `state.targets` holds the two whiteboards. `state.read` says which one is current: 0 or 1.
- Line 2 hands the current board to the step shader as a [texture](textures.md).
- Line 3 says "draw into the *other* board". `1 - state.read` swaps 0 and 1.
- Line 4 runs the step shader on every cell. This is one tick.
- Line 5 swaps which board is current, ready for the next tick.
- The loop repeats `steps` times per frame, up to 60, to keep the chemistry in time with the clock.

## Why the numbers must be precise

```js
type: floatOk ? THREE.FloatType : THREE.HalfFloatType,
```

Each pixel normally stores colours roughly, which is fine for looking at. A simulation needs precise
numbers, or tiny changes get rounded away and the chemistry stalls. `FloatType` keeps about 7 digits.
The sketch falls back to the rougher `HalfFloatType` (about 3 digits) only if the device can't do better,
and it warns that the result will be inaccurate.

**Try this:** in `belousovZhabotinsky.js`, change `const RATE = 4;` to `const RATE = 2;`. The chemistry's
clock runs at half speed: the sketch does half as many ticks each second, so the waves spread half as fast
and one full loop takes 50 seconds instead of 25.

**Related:** [textures.md](textures.md) · [shaders.md](shaders.md) ·
[sketches/belousovZhabotinsky.md](sketches/belousovZhabotinsky.md)
