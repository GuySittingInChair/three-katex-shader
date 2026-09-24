# Reading and Writing Sketches — a Field Guide

A reference for the math, notation and code in `three-katex-shader`. It is meant to be
kept open next to a sketch and added to as you learn. Nothing here needs to be read in
order: look things up.

In the app, open **Explain** from the dock (or press **E**) to read this guide beside the running
sketch. Its "This sketch" view looks up every symbol in the live equation in the tables
of sections 3 and 4, so a row you add there shows up in the app. A section containing a
line that starts with `File:` followed by the sketch's path (as in section 9) becomes that
sketch's walkthrough.

**Contents**

1. [The three languages in a sketch](#1-the-three-languages-in-a-sketch)
2. [Typing symbols](#2-typing-symbols)
3. [Symbol glossary](#3-symbol-glossary)
4. [LaTeX cheat sheet](#4-latex-cheat-sheet)
5. [JavaScript cookbook](#5-javascript-cookbook)
6. [Motion patterns](#6-motion-patterns)
7. [GLSL (shader) basics](#7-glsl-shader-basics)
8. [Math concepts behind the sketches](#8-math-concepts-behind-the-sketches)
9. [The Hopf fibration sketch, annotated](#9-the-hopf-fibration-sketch-annotated)
10. [How to read an unfamiliar equation](#10-how-to-read-an-unfamiliar-equation)
11. [Exercises: changing the Hopf sketch](#11-exercises-changing-the-hopf-sketch)
12. [My notes](#12-my-notes)

---

## 1. The three languages in a sketch

Every sketch file mixes three languages. Knowing which one you are looking at is the
first step to reading any line.

| Language | Runs on | What it does in a sketch | How to spot it |
|---|---|---|---|
| **JavaScript** | CPU, once per frame | Decides *what* happens: timing, which points go where, sliders | Most of the file: `const`, `function`, `for (...)`, `Math.sin` |
| **GLSL** | GPU, once per vertex or pixel, in parallel | Decides *where* each vertex is and *what colour* each pixel is | Inside backtick strings named `VERT` / `FRAG`; types like `vec3`, `float` |
| **LaTeX** | Rendered by KaTeX into the on-screen equation | Displays the math, with live numbers | Inside the `latex:` function; full of `\\` |

### Anatomy of a sketch file

```js
return {
  name, description, tags, category,   // labels shown in the app
  mode: '3d', controls: 'orbit',       // how the scene is viewed
  motion(t)  { ... },                  // the closed-form loop: time → numbers
  latex: (p, hl, m) => '...',          // the equation, built from motion's numbers
  params: { ... },                     // the sliders
  setup(ctx) { ... },                  // runs once: build geometry and materials
  update(ctx, state) { ... },          // runs every frame: push motion into the scene
  dispose(ctx, state) { ... },         // clean up when switching sketches
};
```

The flow each frame: **time `t` → `motion(t)` → numbers → `update` (CPU) and `latex`
(screen) → uniforms → shaders (GPU) → pixels.**

---

## 2. Typing symbols

There are three places you might want a symbol, and each has its own method.

### a) In the on-screen equation (LaTeX) — type the command

You never type θ itself. You type `\theta` and KaTeX draws θ.

Inside a JavaScript string every backslash must be **doubled**, because a single `\` is
JavaScript's escape character (`\n` means newline, `\t` means tab):

```js
'\\theta'      // JavaScript string → KaTeX receives \theta → shows θ
'\theta'       // WRONG: \t becomes a tab character, KaTeX sees "heta"
```

### b) In code (JavaScript or GLSL) — spell it out

Code variables use plain letters: `theta`, `phi`, `tau`, `TAU`, `alpha`. JavaScript
technically allows `const θ = 1;` but GLSL does not, and spelled names are easier to
search for. Stick to names.

### c) In comments and notes — Unicode characters

Comments like `// fiber over θ = 0` use real Unicode characters. On this machine
(KDE Plasma, Wayland, US keyboard) the options are:

1. **Copy and paste** from the glossary below. The simplest option.
2. **Kate's LaTeX completion**: in Kate, typing a backslash command like `\theta` offers
   to insert θ (if the LaTeX completion plugin is on: Settings → Configure Kate →
   Plugins).
3. **A Compose key** (not set up yet). You would press a spare key such as Right Alt,
   then a short sequence like `g t` to get θ. This needs a Compose key chosen in System
   Settings → Keyboard → Key Bindings, plus a `~/.XCompose` file listing the sequences.
   Ask Claude to set this up if you find yourself typing symbols often.

---

## 3. Symbol glossary

"LaTeX" is what goes in a KaTeX string (write each `\` twice inside JavaScript).
"Code" is the usual spelling in JS/GLSL.

### Greek letters

| Symbol | Name | Usual meaning in these sketches | LaTeX | Code |
|---|---|---|---|---|
| α | alpha | an angle; an amount/weight | `\alpha` | `alpha` |
| β | beta | a second angle or parameter | `\beta` | `beta` |
| γ | gamma | a curve; a third parameter | `\gamma` | `gamma` |
| δ | delta (small) | a tiny change | `\delta` | `delta`, `eps` |
| Δ | Delta (capital) | a difference or spacing; also the Laplacian | `\Delta` | `RING_SPACING`, `d` |
| ε | epsilon | a tiny number to avoid dividing by zero | `\varepsilon` (curly), `\epsilon` (ϵ) | `1e-3`, `EPS` |
| θ | theta | an angle; on a sphere, **colatitude** (0 = north pole) | `\theta` | `theta`, `th` |
| κ | kappa | curvature | `\kappa` | `kappa` |
| λ | lambda | a wavelength; a scale factor; eigenvalue | `\lambda` | `lambda` |
| μ | mu | a parameter; a mean | `\mu` | `mu` |
| π | pi | half a turn, ≈ 3.14159 | `\pi` | `Math.PI` |
| τ | tau | a parameter running along a curve (Hopf: along a fiber). Also the name for 2π | `\tau` | `tau`; `TAU` = 2π |
| ρ | rho | a radius; a density | `\rho` | `rho`, `r` |
| σ | sigma (small) | a width or spread | `\sigma` | `sigma` |
| Σ | Sigma (capital) | "add all of these up" | `\sum` (for the sum sign), `\Sigma` (letter) | a `for` loop with `+=` |
| φ | phi | an angle; on a sphere, **longitude** | `\varphi` gives φ, `\phi` gives ϕ | `phi`, `ph` |
| ψ | psi | a wave function; a field | `\psi` | `psi` |
| ω | omega (small) | angular speed (radians per second) | `\omega` | `omega`, `speed` |
| Ω | Omega (capital) | a region | `\Omega` | — |

### Decorations on letters

| Written | Read as | Meaning | LaTeX |
|---|---|---|---|
| θ⋆ | theta star | a special or target value of θ | `\theta_\star` |
| θᵢ | theta sub i | the θ of item number i | `\theta_i` |
| θᵢ^Fib | theta i, Fib | the θ of item i in the Fibonacci arrangement (the label is a name, not a power) | `\theta_i^{\mathrm{Fib}}` |
| x² | x squared | x·x | `x^2` |
| x′ | x prime | the derivative of x, or "a new x" | `x'` |
| x̄ or z̄ | x bar | an average; for complex numbers, the conjugate | `\bar z`, `\overline{z}` |
| x̂ | x hat | a unit-length direction | `\hat x` |
| **v** or v⃗ | vector v | a quantity with direction | `\mathbf v`, `\vec v` |

### Numbers, sets and spaces

| Symbol | Read as | Meaning | LaTeX |
|---|---|---|---|
| ℝ | R | the real numbers (the number line) | `\mathbb{R}` |
| ℝ³ | R three | ordinary 3D space, triples (x, y, z) | `\mathbb{R}^3` |
| ℂ | C | the complex numbers a + bi | `\mathbb{C}` |
| ℂ² | C two | pairs of complex numbers, which is 4 real numbers, i.e. 4D | `\mathbb{C}^2` |
| S¹ | the circle | all points at distance 1 in the plane | `S^1` |
| S² | the 2-sphere | the ordinary sphere surface, in 3D | `S^2` |
| S³ | the 3-sphere | all points at distance 1 in 4D | `S^3` |
| T² | torus | the doughnut surface | `T^2` |
| ∈ | "is in", "belongs to" | q ∈ S³: the point q lies on S³ | `\in` |
| ⊂ | "is inside", "subset of" | S³ ⊂ ℂ²: S³ lives inside ℂ² | `\subset` |
| × | times, "cross" | a product of numbers, of spaces (S¹ × S¹ = torus), or vectors | `\times` |
| [0, 1) | zero to one, including 0, excluding 1 | a range; `[` includes the end, `)` excludes it | `[0, 1)` |
| {…} | "the set of" | a collection | `\{ \dots \}` |

### Operations and relations

| Symbol | Read as | Meaning | LaTeX | Code |
|---|---|---|---|---|
| · | times | multiplication | `\cdot` | `*` |
| √x | root x | square root | `\sqrt{x}` | `Math.sqrt(x)`, GLSL `sqrt(x)` |
| \|z\| | absolute value / length of z | size of a number or vector | `\lvert z \rvert` or `|z|` | `Math.abs`, GLSL `length` |
| ‖v‖ | norm of v | length of a vector | `\lVert v \rVert` | GLSL `length(v)` |
| = | equals | | `=` | `===` compares, `=` assigns |
| ≈ | approximately | | `\approx` | |
| ≠ | not equal | | `\ne` | `!==` |
| ≤ ≥ | at most, at least | | `\le`, `\ge` | `<=`, `>=` |
| ≡ | identically equal / defined as | | `\equiv` | |
| → | "goes to", "maps to" | a function's direction (S³ → S²), or a change over time (s: 0 → 1) | `\to` | |
| ↦ | "is sent to" | where one specific input goes | `\mapsto` | |
| ∘ | "after" | f ∘ g means do g, then f | `\circ` | `f(g(x))` |
| ∞ | infinity | | `\infty` | `Infinity` |
| Σ | sum | add many terms | `\sum_{k=1}^{n}` | loop with `+=` |
| ∫ | integral | a continuous sum, area under a curve | `\int_a^b` | loop over small steps |
| ∂ | partial derivative | rate of change in one direction | `\partial` | finite difference |
| ∇ | nabla, gradient | the direction of steepest increase | `\nabla` | |
| ⟨a, b⟩ | inner product | the dot product | `\langle a, b \rangle` | GLSL `dot(a, b)` |
| ∀ ∃ | for all, there exists | | `\forall`, `\exists` | |

### Complex-number symbols

| Written | Meaning | LaTeX | Code equivalent |
|---|---|---|---|
| i | the imaginary unit, i² = −1 | `i` | a second real number (the `.y` of a `vec2`) |
| z = a + bi | a complex number, a point (a, b) in the plane | `a + bi` | `vec2(a, b)` |
| e^{iα} | the point on the unit circle at angle α | `e^{i\alpha}` | `vec2(cos(a), sin(a))` |
| r·e^{iα} | the point at distance r, angle α | `r\,e^{i\alpha}` | `r * vec2(cos(a), sin(a))` |
| \|z\| | distance of z from 0 | `\lvert z \rvert` | `length(z)` |
| z̄ | the conjugate a − bi, the mirror image across the real axis | `\bar z` | `vec2(z.x, -z.y)` |
| Re z, Im z | the real part a, the imaginary part b | `\operatorname{Re} z` | `z.x`, `z.y` |

---

## 4. LaTeX cheat sheet

As typed in a sketch's `latex` function, meaning backslashes are **already doubled**.

| You write (in JS) | You get | Notes |
|---|---|---|
| `x^2`, `x^{10}` | x², x¹⁰ | superscript: a power, or a label written above. Braces group more than one character |
| `x_i`, `\\theta_{\\star}` | xᵢ, θ⋆ | subscript: an index (which one) or a label written below |
| `\\frac{a}{b}` | a over b | a full-size fraction |
| `\\tfrac{a}{b}`, `\\tfrac\\pi2` | a small fraction | braces can be dropped for single tokens |
| `\\sqrt{x}`, `\\sqrt[3]{x}` | √x, ∛x | |
| `\\sin x`, `\\cos`, `\\log`, `\\exp` | upright function names | plain `sin x` would be italic, like a product s·i·n·x |
| `(`, `\\big(`, `\\Big(`, `\\left( ... \\right)` | growing parentheses | `\\left...\\right` sizes to fit automatically |
| `\\,`  `\\ `  `\\quad`  `\\qquad` | thin, normal, wide, very wide space | LaTeX ignores ordinary spaces in math |
| `\\text{rad}` | upright words inside math | |
| `\\mathrm{Fib}` | upright letters (for labels) | |
| `\\mathbb{R}` | ℝ | blackboard bold |
| `\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}` | lines aligned at the `=` | `&` marks the alignment point, `\\\\` starts a new line |
| `\\textcolor{orange}{x}` | coloured x | the app's yellow live numbers are made this way by `hl()`. `\\color{orange}` instead colours everything after it |
| `\\cdot`, `\\times` | ·, × | |
| `\\dots`, `\\cdots` | …, ⋯ | |

**Live numbers.** In `latex: (p, hl, m) => ...`:
- `m` is whatever `motion(t)` returned, e.g. `m.s`, `m.theta`.
- `hl(value, digits)` formats a number and highlights it.
- In a backtick string, `${...}` inserts a JavaScript value: `` `s = ${hl(m.s, 2)}` ``.

**Decoding a real line (Hopf, line 1):**

```js
'q(\\tau) &= \\big(\\cos\\tfrac\\theta2\\,e^{i(\\tau+\\phi/2)},\\ \\sin\\tfrac\\theta2\\,e^{i(\\tau-\\phi/2)}\\big)\\in S^3 \\\\'
```

- `q(\\tau) &=` → "q(τ) =", with `&` as the alignment point
- `\\big(` → a big open parenthesis
- `\\cos\\tfrac\\theta2` → cos(θ/2) with a small fraction θ⁄2
- `\\,` → a thin space
- `e^{i(\\tau+\\phi/2)}` → e raised to i(τ + φ/2)
- `,\\ ` → a comma, then a normal space
- `\\in S^3` → "∈ S³"
- `\\\\` → end of line

---

## 5. JavaScript cookbook

### Variables

```js
const N = 60;        // can't be reassigned: use by default
let i = 0;           // can be reassigned: use when the value changes
```

### Functions: three ways to write the same thing

```js
function double(x) { return 2 * x; }
const double = (x) => 2 * x;             // arrow function, implicit return
const double = (x) => { return 2 * x; }; // arrow function with a body
```

Inside an object, `motion(t) { ... }` is shorthand for `motion: function (t) { ... }`.

### if / else and the ternary

```js
if (p < 0.25) s = 0; else s = 1;
const s = p < 0.25 ? 0 : 1;              // same thing as an expression

// chained ternary (reads top to bottom like if / else if / else)
const s = p < 0.25 ? rampUp
        : p > 0.75 ? rampDown
        : 1;
```

### Loop variations

```js
for (let i = 0; i < n; i++)        // 0, 1, …, n−1   (n steps, the most common)
for (let i = 0; i <= n; i++)       // 0, 1, …, n     (n+1 steps: the endpoints of n segments)
for (let i = 1; i <= n; i++)       // 1, …, n        (counting from 1)
for (let i = n - 1; i >= 0; i--)   // n−1 down to 0  (backwards)
for (let i = 0; i < n; i += 2)     // 0, 2, 4, …     (every other one)
for (let x = 0; x <= 1; x += 0.1)  // AVOID: floating-point steps drift (0.30000000000000004)
for (let i = 0; i <= 10; i++) { const x = i / 10; }   // do this instead

for (const item of list)           // each value in an array
for (const [i, item] of list.entries())  // index and value together
list.forEach((item, i) => { ... }) // same idea, as a function call

let k = 0;
while (k < 100 && !done) { k++; }  // when you don't know the count in advance

continue;                          // skip to the next iteration
break;                             // leave the loop entirely
```

**Nested loops** visit every combination, like the rows and columns of a grid:

```js
for (let row = 0; row < R; row++)
  for (let col = 0; col < C; col++)
    // runs R × C times
```

**The "u = i / (n − 1)" trick**: turn a count into a position from 0 to 1.

```js
for (let i = 0; i < n; i++) {
  const u = i / (n - 1);          // 0 … 1 inclusive
  const angle = u * TAU;          // 0 … 2π
}
```

Use `i / n` instead when going around a circle: 0 and 2π are the same place, so you
don't want both.

**One index ↔ grid position**, using `%` (remainder) and `Math.floor`:

```js
const row = Math.floor(i / C);   // 0,0,0,1,1,1,2,…   (for C = 3)
const col = i % C;               // 0,1,2,0,1,2,0,…
const i   = row * C + col;       // back again
```

### Building arrays

```js
const out = [];
for (let i = 0; i < n; i++) out.push(f(i));

const out = Array.from({ length: n }, (_, i) => f(i));   // same, one line
const out = list.map((x) => 2 * x);                      // transform each element
const big = list.filter((x) => x > 1);                   // keep some elements
const total = list.reduce((sum, x) => sum + x, 0);       // Σ, adding them all up

new Float32Array(n)   // a fixed-size array of numbers, the form the GPU wants
```

### Objects and destructuring

```js
const m = { s: 0.5, theta: 1.57 };
m.s;                              // 0.5
const { s, theta } = m;           // unpack: s = 0.5, theta = 1.57
return { mesh, material };        // shorthand for { mesh: mesh, material: material }
```

### Strings

```js
'plain'  "plain"
`template ${1 + 1}`               // → "template 2"
'a' + 'b'                         // → "ab"
```

### Math you'll see constantly

| Code | Meaning |
|---|---|
| `Math.PI`, `TAU` | π, 2π |
| `Math.sin(a)`, `Math.cos(a)` | angle in **radians** |
| `Math.atan2(y, x)` | the angle of the point (x, y), from −π to π |
| `Math.acos(y)` | the angle whose cosine is y |
| `Math.hypot(x, y)` | √(x² + y²) |
| `Math.min(a, b)`, `Math.max(a, b)` | the smaller or larger value |
| `Math.floor(x)`, `Math.round(x)`, `Math.ceil(x)` | round down, to nearest, up |
| `a % b` | remainder. Careful: `-1 % 3` is `-1`, not `2` |
| `x ** 2` | x² |
| `1e-3` | 0.001 (scientific notation) |

---

## 6. Motion patterns

These are the building blocks of every `motion(t)`. The helpers live in
`src/lib/motion.js`.

| Helper | Formula | What it's for |
|---|---|---|
| `phaseOf(t, P)` | fraction part of t/P | where you are in a P-second loop, 0 → 1, repeating |
| `lerp(a, b, s)` | a + (b − a)·s | blend: s = 0 gives a, s = 1 gives b |
| `clamp01(x)` | x limited to [0, 1] | keep a ramp from overshooting |
| `smooth(x)` | x²(3 − 2x) | ease in and out, no sudden starts or stops |

### Stages within a loop

```js
const p = phaseOf(t, 20);
const a = smooth(clamp01(p / 0.3));             // 0 → 1 during the first 30%
const b = smooth(clamp01((p - 0.5) / 0.2));     // 0 → 1 between 50% and 70%
```

The general form: **`clamp01((p − start) / length)`** gives 0 before the stage, 1 after
it, and ramps in between.

### Oscillations

```js
Math.sin(TAU * p)                     // one full wave per loop, −1 … 1
0.5 - 0.5 * Math.cos(TAU * p)         // 0 → 1 → 0, smooth, starting and ending at 0
center + amplitude * Math.sin(TAU * p)
Math.sin(TAU * p * k)                 // k waves per loop (k must be a whole number to loop seamlessly)
```

### Staggering many items

```js
const pi = phaseOf(t + i / n * P, P);   // item i runs the same loop, shifted in time
```

### Angles: going the short way round

```js
const wrapDelta = (a, b) => ((((b - a) % TAU) + 3 * Math.PI) % TAU) - Math.PI;
const angle = a + s * wrapDelta(a, b);  // blend angles without spinning 340° when 20° will do
```

### Rule for a seamless loop

Everything must be a function of `p` alone, and must have the same value at p = 0 and
p = 1. Check the endpoints by plugging them in.

---

## 7. GLSL (shader) basics

### Types

| GLSL | Holds | JS equivalent |
|---|---|---|
| `float` | one number, **always with a decimal point**: `1.0` not `1` | number |
| `int` | a whole number | number |
| `vec2`, `vec3`, `vec4` | 2, 3 or 4 numbers | `THREE.Vector2/3/4` |
| `mat3`, `mat4` | 3×3, 4×4 matrix | `THREE.Matrix3/4` |

### Swizzling: picking components

```glsl
vec4 q = vec4(1.0, 2.0, 3.0, 4.0);
q.x      // 1.0
q.yzw    // vec3(2.0, 3.0, 4.0)
q.xx     // vec2(1.0, 1.0)
// .rgba is the same as .xyzw, used for colours
```

### Where data comes from

| Keyword | Set by | Same for… | Example |
|---|---|---|---|
| `uniform` | JavaScript, via `material.uniforms.X.value` | every vertex/pixel in a frame | `uBase`, `uWidth`, time |
| `attribute` | the geometry buffers built in `setup` | one vertex | `aFiber`, `aS`, `aSide` |
| `varying` | the vertex shader writes it, the fragment shader reads it (blended across the triangle) | one pixel | `vTheta`, `vSide` |

Naming habit in this project: **u**niform, **a**ttribute, **v**arying.

### The two shaders

- **Vertex shader**: must set `gl_Position` (where on screen this vertex goes).
- **Fragment shader**: must set `gl_FragColor` (the colour of this pixel, as rgba 0 to 1).

### Built-in functions and their JS names

| GLSL | JS / helper | Meaning |
|---|---|---|
| `mix(a, b, s)` | `lerp(a, b, s)` | blend |
| `clamp(x, lo, hi)` | `Math.min(hi, Math.max(lo, x))` | limit to a range |
| `smoothstep(e0, e1, x)` | `smooth((x - e0) / (e1 - e0))` | eased ramp |
| `fract(x)` | `x - Math.floor(x)` | fractional part |
| `mod(x, y)` | `((x % y) + y) % y` | remainder that is never negative |
| `length(v)` | `v.length()` | size of a vector |
| `normalize(v)` | `v.clone().normalize()` | same direction, length 1 |
| `dot(a, b)` | `a.dot(b)` | how aligned two vectors are |
| `cross(a, b)` | `a.clone().cross(b)` | a vector perpendicular to both |
| `step(e, x)` | `x < e ? 0 : 1` | a hard switch |

### Common mistakes

- `1` instead of `1.0` → a type error. GLSL won't mix int and float.
- Dividing by something that can be 0 → guard it with `max(d, 1e-3)`.
- Using a variable name GLSL reserves (`sample`, `input`, `output`, …).

---

## 8. Math concepts behind the sketches

### Radians

A full turn is 2π radians (`TAU`), half a turn is π, a quarter turn is π/2. All `sin`
and `cos` in code take radians. Degrees → radians: multiply by π/180.

### The circle, sin and cos

The point at angle α on the unit circle is **(cos α, sin α)**. As α goes 0 → 2π it
goes once around, counter-clockwise, starting from (1, 0). For radius r: (r cos α, r sin α).

### Spherical coordinates (θ, φ)

A point on the unit sphere S²:

  x = sin θ · cos φ,  y = sin θ · sin φ,  z = cos θ

- θ, the **colatitude**: 0 at the north pole, π/2 at the equator, π at the south pole.
- φ, the **longitude**: 0 → 2π around.
- (Three.js uses y as "up", so in scene code the roles of y and z are often swapped.)

### Complex numbers

A complex number z = a + bi is a point (a, b) in the plane. Multiplying by e^{iα}
**rotates it by α**. That is why complex numbers appear so often in geometry: they're a
compact way to write rotations.

Euler's formula: **e^{iα} = cos α + i sin α**.

### Higher spheres

Sⁿ is every point at distance 1 from the center in (n+1)-dimensional space. S¹ is a
circle in 2D, S² a sphere surface in 3D, S³ a "sphere" in 4D. Written with complex
numbers: S³ = { (z₁, z₂) ∈ ℂ² : |z₁|² + |z₂|² = 1 }.

### Stereographic projection

Put a light at a point of the sphere and project everything else onto the flat space
opposite it. For S³ from the light at (1, 0, 0, 0):

  (x, y, z, w) ↦ (y, z, w) / (1 − x)

It is conformal (it preserves angles) and sends circles to circles, or to straight lines
if the circle passes through the light. Points near the light shoot off toward infinity.

### Torus

A doughnut surface, which is S¹ × S¹ ("a circle's worth of circles"). In S³, the set
|z₁| = a, |z₂| = b (with a² + b² = 1) is a torus. The **Clifford torus** is a = b = 1/√2.

### Linking

Two closed loops are **linked** if you can't pull them apart without cutting one, like
chain links. Any two Hopf fibers link exactly once.

### Fibonacci sphere

To spread n points evenly on a sphere: space their heights evenly from +1 to −1, and turn
each one by the golden angle π(3 − √5) ≈ 137.5° from the last. Because that angle is
"maximally irrational", no two points line up in columns.

### Cosine palette

`colour = a + b · cos(2π(c·h + d))`, applied to r, g and b separately with different
offsets d, turns one number h into a smooth range of colours. (Technique from Inigo
Quilez.)

---

## 9. The Hopf fibration sketch, annotated

File: `src/sketches/hopfFibration.js`

### The idea in five sentences

1. S³ is the set of pairs of complex numbers (z₁, z₂) with |z₁|² + |z₂|² = 1, a
   "sphere" in 4D.
2. The Hopf map sends each point of S³ to a point on the ordinary sphere S², and the
   points that land on the same spot form a whole circle, called a **fiber**.
3. The fibers never touch, they fill all of S³, and any two of them link once.
4. We draw the fibers by stereographic projection into 3D, where each one shows up as a
   circle (a ribbon on screen).
5. The animation moves only the *base points* on S². Each frame is an exact set of
   fibers.

### The fiber formula

  q(τ) = ( cos(θ/2) · e^{i(τ + φ/2)},  sin(θ/2) · e^{i(τ − φ/2)} )

- (θ, φ) chooses the base point on S², i.e. which fiber.
- τ from 0 to 2π walks once around that fiber.
- |z₁| = cos(θ/2), |z₂| = sin(θ/2), and cos² + sin² = 1, so q is on S³. ✓

**Why a whole circle maps to one point.** The Hopf map is
h(z₁, z₂) = (2 z₁ z̄₂, |z₁|² − |z₂|²). Plugging in q(τ):

- |z₁|² − |z₂|² = cos²(θ/2) − sin²(θ/2) = cos θ
- 2 z₁ z̄₂ = 2 cos(θ/2) sin(θ/2) · e^{i(τ + φ/2)} · e^{−i(τ − φ/2)} = sin θ · e^{iφ}

**τ cancels out.** Every point of the circle lands on the same spot
(sin θ cos φ, sin θ sin φ, cos θ), which is exactly the spherical-coordinates point (θ, φ).

### Tori and the Clifford torus

Fix θ and let φ vary: the fibers sweep out a torus with |z₁| = cos(θ/2),
|z₂| = sin(θ/2). At θ = π/2 both equal 1/√2, which is the Clifford torus. The fibers
lying on these tori are Villarceau circles.

### The loop (28 s)

| Phase p | What happens | Driven by |
|---|---|---|
| 0 – 0.25 | points leave the Fibonacci spread and gather into 5 rings of latitude | s: 0 → 1 |
| 0.25 – 0.75 | the rings swing in latitude around the equator; the tori swell and shrink around the Clifford torus | θ⋆ = π/2 + 0.45 sin(2πx) |
| 0.75 – 1 | points spread back out | s: 1 → 0 |

On-screen equation line 2:
θᵢ = (1 − s) θᵢ^Fib + s (θ⋆ + 0.2 (rᵢ − 2)). This is a **lerp**: at s = 0 each point
is at its Fibonacci spot, at s = 1 it's at its ring spot. The rings sit at θ⋆ − 0.4,
θ⋆ − 0.2, θ⋆, θ⋆ + 0.2, θ⋆ + 0.4.

### Code map

| Part | What it does |
|---|---|
| Constants | `PERIOD` loop length, `RINGS` ring count, `RING_SPACING` gap between rings, `SWEEP_AMPLITUDE` swing size, `THETA_MIN` keeps fibers away from the projection pole |
| `motion(t)` | phase → s (gather/disperse blend) and θ⋆ (sweep) |
| `latex` | builds the 3-line equation with live s and θ⋆ |
| `fibonacciBase(n)` | the even spread of starting points |
| `setup` | builds one ladder-shaped ribbon per fiber: labels each vertex with fiber number, position around (0–1) and side (±1). No 3D positions are computed here |
| `update` | every frame: for each fiber, work out its ring (`i % RINGS`) and place in the ring (`floor(i / RINGS)`), lerp from Fibonacci spot to ring spot, clamp θ to a safe range, write to `uBase` |
| `VERT` | on the GPU: q(τ) as 4 real numbers → stereographic projection `q.yzw / (1 − q.x)` → push sideways to make a camera-facing ribbon |
| `FRAG` | fake tube shading (bright center, dark edges) + cosine-palette colour by θ, pulled 25% toward gray |

### Why `THETA_MIN = 0.75`

The projection's light source (1, 0, 0, 0) lies on the fiber over θ = 0. Fibers close
to θ = 0 pass near the light and project to huge circles: the largest distance from the
center measured 8.9 at θ = 0.45, but 5.3 at θ = 0.75 and 2.4 at θ = π/2.

---

## 10. How to read an unfamiliar equation

1. **Name every symbol.** Look each one up in section 3. Write down what it stands for
   *in this sketch*, since the same letter means different things in different places.
2. **Sort them.** Which ones change (inputs like t, τ, i), which are fixed (constants),
   and which one is the output?
3. **Plug in easy values.** 0, 1, π/2, π. What does the formula give? For q(τ) with
   θ = 0: z₂ = sin 0 = 0, so the fiber is (e^{iτ}, 0), a circle in the z₁ plane.
4. **Look for familiar shapes.** `cos … , sin …` is a circle. `(1 − s)a + s b` is a
   blend. `a + b sin(…)` is an oscillation around a. `x / (1 − y)` is a projection.
5. **Find it in the code.** The equation and the code should match term for term. If
   they don't, one of them is wrong.
6. **Change one number and watch.** The fastest way to learn what a term does.

---

## 11. Exercises: changing the Hopf sketch

Edit in the app's code panel. Each exercise changes one idea. Undo before starting the
next one.

1. **Fewer, thicker rings.** Set `RINGS = 3` and `RING_SPACING = 0.35`.
   *Question: the equation now shows r − 2⁄2 instead of r − 4⁄2, and you didn't touch
   `latex`. Why? (Hint: look for `${RINGS - 1}`.)*
2. **Hold on the Clifford torus.** In `motion`, change the `theta:` line to
   `theta: Math.PI / 2,` so the rings stop sweeping. Set `RINGS = 1` to see a single
   torus of fibers.
3. **Swing twice.** Replace `Math.sin(TAU * x)` with `Math.sin(2 * TAU * x)`.
   *Question: does the loop still join up seamlessly at p = 0.75? Plug in x = 1.*
4. **Rotate the rings.** In `motion`, add `spin: TAU * x,` to the returned object. In
   `update`, change the `phiRing` line to add `+ ctx.motion.spin`. The rings now turn in
   longitude while they sweep. Every frame is still an exact Hopf fibration, because only
   the base points move.
5. **Colour by longitude instead.** In `VERT`, change `vTheta = b.x;` to
   `vTheta = mod(b.y, 6.2831853) * 0.5;`. *Question: why `* 0.5`? (Hint: look at what FRAG
   divides by.)*
6. **Write it down.** After exercise 4, update the `latex` function so line 2 shows the
   new φ term.

---

## 12. My notes

Add your own findings, questions and discoveries here.

-
