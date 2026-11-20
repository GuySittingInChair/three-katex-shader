---
summary: Giving a value a name so you can use it later.
added: 2026-11-18
---

# Reading JavaScript 1: values, names and comments

**In one sentence:** a *variable* is a name stuck on a value, so the code can refer to "PERIOD" instead of
repeating the number 18 everywhere.

**Picture it:** labelled jars in a kitchen. The jar labelled "sugar" holds sugar. When a recipe says "add the
sugar", you know which jar to reach for. A variable is the label, and the value is what's in the jar.

**Why sketches need it:** names make numbers readable. `COUNT = 120` tells you that 120 is how many birds
there are. It also means changing one line changes it everywhere.

This page is for *reading* code, not writing it. You only need to recognise these things.

## Kinds of value

- **Numbers:** `120`, `0.5`, `-1.8`. A leading `0.` is common: `0.05` means five hundredths.
- **Text,** called *strings*, between quotes: `'Boids Flock'`. Single quotes `'`, double quotes `"` and
  backticks `` ` `` all make text. Backticks allow `${...}` inside, which drops a value into the text.
- **True or false:** `true`, `false`.
- **Nothing:** `null` or `undefined`, meaning "no value here yet".

## Naming a value

```js
const COUNT = 120;
const BOUND = 1.5;
```
(from `src/sketches/boidsFlock.js`)

- `const` means "this name will always hold this value". It stands for *constant*.
- `COUNT` is the name. Names in ALL CAPITALS are a habit for settings fixed for the whole file.
- `=` here means "put this value in the jar". It is not "equals" as in math.
- `;` ends the line, like a full stop.

So line 1 says "there are 120 birds", and line 2 says "the birds' box reaches 1.5 units from the centre".

```js
let count = 0;
...
count++;
```
(from the `update` of the same file)

- `let` makes a name whose value is allowed to change.
- `count++` means "add one to `count`". You will also see `+=`: `x += 2` means "add 2 to x".

## Arithmetic

`+ - * /` are plus, minus, times and divide. `**` is "to the power of": `s ** 2` is s squared. `%` is the
remainder after dividing: `7 % 3` is 1.

`Math.` is a toolbox of math: `Math.sin`, `Math.cos`, `Math.sqrt` (square root), `Math.PI` (3.14159…),
`Math.random()` (a random number between 0 and 1), `Math.min` and `Math.max` (the smaller or larger of two
numbers), `Math.floor` (round down to a whole number: 3.7 becomes 3).

## Comments

Anything after `//` on a line is a note for people. The computer ignores it. So is anything between `/*` and
`*/`. In `boidsFlock.js`:

```js
// Soft boundary steering back toward center.
```

This tells you what the next few lines do. Comments are the best place to start reading an unfamiliar file.

## Dots: "belonging to"

A dot means "the part of this thing called…". `ctx.camera.position` is "the position of the camera that `ctx`
holds". `boid.vel.x` is "the x part of this bird's velocity".

**Try this:** in `boidsFlock.js`, change `const COUNT = 120;` to `const COUNT = 400;`. You get more than three
times as many birds, and the flock looks denser. The animation may get slower too, because each bird checks
every other bird on every frame.

**Related:** [Functions and arrows (`=>`)](js-functions.md) · [Decisions (`if`) and loops
(`for`)](js-decisions-and-loops.md) · [Lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
· `docs/guide.md` section 5
