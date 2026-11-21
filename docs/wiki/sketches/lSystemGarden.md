---
summary: Six plants, each grown from a single rewriting rule read as pen strokes, swaying in the wind.
added: 2026-11-20
---

# L-System Botanical Garden: in plain English

File: `src/sketches/lSystemGarden.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Biology

**What you see:** six plants in a row (two rows on a phone), growing up from the ground: ferns, bushes, a
weedy stalk, a feathery tree. Their trunks are brown and their tips green, yellow or blue-green. They sway
gently in the wind, stand fully grown for a while, then shrink back into the ground and grow again. Every six
seconds a different plant is highlighted and its rule shown in the equation.

**The idea behind it:** in 1968 the biologist Aristid Lindenmayer invented a way to describe how plants grow:
start with a short word, and replace every letter by a longer phrase, again and again. These rewriting rules
are called *L-systems*. Read the final word as instructions for a pen, and the drawing is a plant:
- **F**: draw a line forward;
- **+** and **−**: turn left or right by a fixed angle δ;
- **[**: remember where you are (a branch starts here);
- **]**: jump back to where you remembered (the branch has ended);
- **X**: draw nothing, but grow into more plant next time.

For example, the first plant's rule is F → F[+F]F[−F]F: every line becomes a line, a branch to the left, a
line, a branch to the right, and a line. Do that 5 times and one line becomes 5⁵ = 3,125, arranged as a plant.
The six rules, angles and generation counts are the six plants in figure 1.24 of Przemysław Prusinkiewicz and
Lindenmayer's book *The Algorithmic Beauty of Plants* (1990).

**Where the data comes from:** no data: six short rules.

**How it's built:**
- The words are expanded the first time the sketch opens (the longest is 13,956 letters).
- Every frame, a *turtle* (an imaginary pen with a position and a heading) walks each word and draws its
  strokes, batched by how deep in the branching they are, so trunks can be thicker and browner than tips.
- **Growing:** each stroke knows its distance from the root, in strokes. A stroke only appears once the growth
  has reached it, so plants grow from the ground up, branches extending outwards.
- **Wind:** each stroke is bent a little more the further out it is, swaying in time.
- **Droop** (botanists call it *tropism*): every stroke turns slightly towards the ground, most when it points
  sideways (from the book, section 2.2).

## The equation

- The highlighted plant's starting word (the *axiom*), its angle δ and how many times the rule is applied.
- The rule (or rules).
- **Strokes:** how many lines the final word draws; for the plants that start from F, 5⁵ = 3,125 or 8⁴ =
  4,096.
- **Grown so far:** how many strokes are drawn in the whole garden right now.

## A tour of the file

The rewriting, in `grow`:

```js
for (let i = 0; i < p.n; i++) s = [...s].map((c) => p.rules[c] ?? c).join('');
```

Take the word letter by letter; replace each by its rule if it has one (`?? c` keeps it as it is if not); glue
it back together. Repeat n times.

The pen, in `turtle`:

```js
else if (c === '[') { stack.push([x, y, a, depth]); depth++; }
else if (c === ']') [x, y, a, depth] = stack.pop();
```

`[` puts the pen's position and heading on a pile (a *stack*); `]` takes the last one back off, so the pen
jumps back to where the branch started.

Droop:

```js
a += droop * 0.02 * Math.cos(a);
```

`a` is the pen's heading (y points down the screen). `cos(a)` is 0 when the pen points straight up or down and
largest when it points sideways, so sideways strokes bend down most, as in the book's rule.

## Numbers worth knowing

Expanded in Node:

| plant | rule | δ | generations | strokes |
|---|---|---|---|---|
| 1 | F → F[+F]F[−F]F | 25.7° | 5 | 3,125 |
| 2 | F → F[+F]F[−F][F] | 20° | 5 | 3,125 |
| 3 | F → FF−[−F+F+F]+[+F−F−F] | 22.5° | 4 | 4,096 |
| 4 | X → F[+X]F[−X]+X, F → FF | 20° | 7 | 4,118 |
| 5 | X → F[+X][−X]FX, F → FF | 25.7° | 7 | 4,118 |
| 6 | X → F−[[X]+X]+F[+FX]−X, F → FF | 22.5° | 5 | 1,488 |

**Try this (funky):** open Params and drag **droop** up to 3. Every branch bends towards the ground; the tall
plants hook over and curl like weeping willows. Then drag **wind** to 4 for a gale. (Checked by eye in the
sketch.)

**Words on this page:** [L-system](../glossary.md#l-system), [turtle
graphics](../glossary.md#turtle-graphics), [tropism](../glossary.md#tropism),
[fractal](../glossary.md#fractal), [string](../glossary.md#string)
