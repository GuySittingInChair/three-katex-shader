# Reading JavaScript 3: decisions (`if`) and loops (`for`)

**In one sentence:** `if` lets the code choose what to do, and `for` makes it repeat something many times.

**Picture it:** `if` is a fork in a path with a signpost: "if it is raining, take the umbrella". `for` is
a checklist: "for each guest on the list, set a place at the table".

**Why sketches need it:** a flock has 120 birds, and each one needs the same treatment. A loop does that
in a few lines. Decisions handle the special cases, like "if a bird has left its box, steer it back".

## `if` and `else`

From `src/sketches/audioPulse.js`:

```js
if (ctx.audio?.enabled) {
  state.uniforms.uBass.value = ctx.audio.bass;
} else {
  state.uniforms.uBass.value = 0.5 + 0.5 * Math.sin(ctx.time * 0.9);
}
```

- `if (...)` asks a question. Here: "has the person switched on the microphone?"
- If yes, the first block runs: use the real bass loudness.
- `else` means "otherwise". If the microphone is off, the second block invents a gentle, pretend beat
  that rises and falls, so the sketch never looks dead.
- `?.` means "if there is no `audio` at all, don't crash. Treat the answer as no".

## Comparing things

`===` means "is equal to" (three equals signs, because one `=` already means "put in the jar").
`!==` is "is not equal to". `<`, `>`, `<=`, `>=` are less than, greater than, and "or equal". `&&` means
"and", `||` means "or", `!` means "not".

## The short `if`: `? :`

```js
return { s: index === 0 ? blend : 1 - blend };
```
(from `src/sketches/boysSurface.js`)

Read `A ? B : C` as "if A then B, otherwise C". In the first half of the loop (`index === 0`), `s` is
`blend`, which rises from 0 to 1. In the second half, `s` is `1 - blend`, so it falls back from 1 to 0.
That is how one shape turns into another and then back again.

## `for` loops

From `src/sketches/boidsFlock.js`:

```js
for (let i = 0; i < boids.length; i++) {
  const bi = boids[i];
  ...
}
```

- `let i = 0` starts a counter at 0 (`let` makes a name whose value can change; see [Values, names and comments](js-values-and-variables.md)).
- `i < boids.length` keeps going while the counter is less than the number of birds (120).
- `i++` adds one to the counter after each round.
- `boids[i]` is "bird number i". So the block runs 120 times, once per bird.

Inside, there is a second loop over every *other* bird, to find the neighbours. 120 × 119 is about
14,000 checks on every frame. That is why adding birds slows things down quickly.

`continue` skips to the next round (used to skip a bird comparing itself to itself). `break` stops the
loop early.

## Loops in shaders

Shaders loop too, with the same shape. From `src/sketches/bifurcationDiagram.js`:

```glsl
for (int i = 0; i < 100; i++) {
  x = r * x * (1.0 - x);
}
```

This repeats one formula 100 times, so the number `x` settles down before the sketch starts drawing it.
See [Shaders: two questions](shaders.md).

**Try this:** in `bifurcationDiagram.js`, change `i < 100` to `i < 5`. The sketch no longer waits for
`x` to settle, so its first wandering values get drawn too: faint extra streaks and smudges appear
around the clean branches.

**Related:** [Values, names and comments](js-values-and-variables.md) · [Functions and arrows (`=>`)](js-functions.md)
· [Lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
