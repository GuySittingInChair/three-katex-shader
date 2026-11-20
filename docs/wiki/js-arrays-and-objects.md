---
summary: Lists of things, and bundles of named values.
added: 2026-11-18
---

# Reading JavaScript 4: lists (arrays) and labelled boxes (objects)

**In one sentence:** an *array* is a numbered list of values, `[ ]`, and an *object* is a set of labelled
values, `{ }`.

**Picture it:** an array is a row of numbered lockers: locker 0, locker 1, locker 2. An object is a
filing cabinet with named drawers: "name", "position", "colour".

**Why sketches need it:** a sketch juggles many things at once, like 120 birds or five control points.
Lists keep them in order, and labels keep them findable.

## Arrays: `[ ]`

From `src/sketches/bezierDeCasteljau.js`:

```js
const X = [-1.8, -0.9, 0, 0.9, 1.8];
const Y = [-0.8, 1.1, -0.2, 1.1, -0.8];
```

- Each list holds five numbers, separated by commas: the across and up positions of five *control
  points*, the dots the sketch's curve bends towards.
- Counting starts at **0**. `X[0]` is `-1.8` (the first), and `X[4]` is `1.8` (the fifth). Think of the
  number as "how many steps from the start": the first item is 0 steps in.
- `X.length` is how many there are: 5.

Lists can hold anything, including other lists or objects. Adding to the end of a list is `.push(...)`:
you'll see it below.

## Objects: `{ }`

From `src/sketches/boidsFlock.js`, where one bird is made:

```js
boids.push({
  pos: new THREE.Vector3(
  ...
  vel: new THREE.Vector3(
  ...
});
```

- `boids` is the list of birds, and `boids.push({...})` adds one more bird to the end of it. The `{ }`
  inside is the new bird: an object.
- Each bird is an object with two drawers: `pos` (where it is) and `vel` (its velocity: which way it is
  heading, and how fast). `new THREE.Vector3(...)` makes an arrow in 3D: three numbers, across, up and
  towards you.
- Later the code reads them with a dot: `bi.pos`, `bi.vel`, where `bi` is whichever bird it's working on
  (bird number `i`).

A whole sketch is one big object, too. Its drawers are `name`, `params`, `setup` and the rest. See
[The sketch format: every field](sketch-format.md).

## Unpacking: `const { a, b } = ...`

```js
const { kappa, s } = ctx.motion;
```
(from `bezierDeCasteljau.js`)

`ctx.motion` is an object holding the numbers the sketch's own `motion` part worked out for this moment
of the animation (see [Motion and the live equation](motion-and-latex.md)). This line takes the drawers called `kappa` and `s` out of it and gives each its own short name. It is
the same as writing `const kappa = ctx.motion.kappa;` and `const s = ctx.motion.s;`. This unpacking is
called *destructuring*.

## Typed arrays: long lists of plain numbers

```js
const directions = new Float32Array(count * 3);
```
(from `src/sketches/audioReactiveMesh.js`)

- `Float32Array` is a list that holds only numbers, packed tightly so the graphics chip can read it fast.
- `count * 3`: three numbers (x, y, z) for each corner of the ball.
- Corner `i`'s x is at `directions[i * 3]`, its y at `i * 3 + 1`, and its z at `i * 3 + 2`.

You will see `Float32Array` wherever there are thousands of points.

## Making a list from a recipe

```js
Array.from({ length: DEGREE + 1 }, (_, i) => binom(DEGREE, i) * ...)
```
(from `bezierDeCasteljau.js`)

This means "make a list of 5 items (`DEGREE` is 4, plus 1), and work out item `i` with this recipe".
`binom` is a small counting function defined earlier in the file; the recipe works out how strongly
each of the five control points pulls on the curve. The
`_` is a placeholder for an input the recipe doesn't use.

**Try this:** in `bezierDeCasteljau.js`, change `X`'s last number, `1.8`, to `3`. The right-hand end of the
zig-zag stretches out further, and the curve follows it, ending further to the right.

**Related:** [Values, names and comments](js-values-and-variables.md) · [Functions and arrows (`=>`)](js-functions.md)
· [The sketch format: every field](sketch-format.md)
