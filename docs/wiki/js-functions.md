# Reading JavaScript 2: functions and arrows (`=>`)

**In one sentence:** a *function* is a named, reusable recipe: you give it some ingredients (its
*inputs*) and it hands back a result.

**Picture it:** a coffee machine. You put in beans and water, press the button, and out comes coffee. You
don't need to know what happens inside each time. You only need the name of the button and what to put in.

**Why sketches need it:** the same steps are needed again and again, such as "find the point on the
curve at position s". Writing them once as a function keeps the file short and tidy.

## Three ways to write a function

**1. With the word `function`.** From `src/sketches/bezierDeCasteljau.js`:

```js
function evalBezier(s, kappa) {
  const b = bernstein(s);
  ...
  return out;
}
```

- `function evalBezier` names the recipe `evalBezier` ("evaluate the Bézier curve").
- `(s, kappa)` are its inputs: how far along the curve, and how twisted it is.
- Everything between `{` and `}` is the recipe.
- Its first line calls another recipe, `bernstein`, which works out how strongly each control point
  pulls at this spot; `...` marks lines left out, which add the pulls up into `out`.
- `return out;` hands back the result, a point in space.

To *use* it, the code writes its name with inputs in brackets: `evalBezier(0.5, 0.2)`. This is called
*calling* the function.

**2. With an arrow, `=>`.** Same file:

```js
const controlPoint = (i, kappa) => [X[i], Y[i] * Math.cos(i * kappa), Y[i] * Math.sin(i * kappa)];
```

- `const controlPoint =` names it.
- `(i, kappa)` are the inputs.
- `=>` reads as "gives". Whatever follows is the result.
- The result here is a list of three numbers: a point's x, y and z. `Math.cos` and `Math.sin` are
  [wave-makers](sine-and-cosine.md); together they swing the point's height round in a circle.

Arrows are a shorter way to write small recipes. They mean the same thing.

**3. As a field of the sketch.** `setup(ctx) { ... }` and `update(ctx, state) { ... }` are functions too.
They are written inside the sketch's big object, so the app can find them by name. See
[The frame loop: setup, update, dispose](frame-loop.md).

## Functions inside functions

From `src/sketches/boysSurface.js`:

```js
motion(t) {
  const { index, blend } = segments(phaseOf(t, PERIOD), 2, 0.4);
  return { s: index === 0 ? blend : 1 - blend };
},
```

- `phaseOf(t, PERIOD)` runs first. It says how far through the 16-second loop we are.
- Its answer is fed straight into `segments(..., 2, 0.4)`, which splits the loop into 2 halves, each
  pausing for a moment before it changes. Both helpers are in `src/lib/motion.js`.
- `return { s: ... }` hands back one number, `s`. The `?` part is explained in
  [Decisions (`if`) and loops (`for`)](js-decisions-and-loops.md).

## Methods: functions that belong to something

When a function is reached through a dot, it belongs to that thing. `ctx.camera.position.set(0, 0, 3.2)`
calls the camera position's own `set` recipe. `geometry.dispose()` calls the geometry's own "free your
memory" recipe. The empty brackets `()` mean "no inputs needed".

**Try this:** in `bezierDeCasteljau.js`, `Y` holds the heights of the five *control points*, the dots
the curve bends towards:
`[-0.8, 1.1, -0.2, 1.1, -0.8]`. Change the middle `-0.2` to `1.5`. The middle of the zig-zag pops up, and
the curve, which `evalBezier` works out from those points, bulges upward in the middle.

**Related:** [Values, names and comments](js-values-and-variables.md) ·
[Decisions (`if`) and loops (`for`)](js-decisions-and-loops.md) · [The frame loop: setup, update, dispose](frame-loop.md)
