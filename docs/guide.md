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
12. [Funny sketches: the formula](#12-funny-sketches-the-formula)
13. [Realistic scenes](#13-realistic-scenes)
14. [Elephant's Toothpaste, annotated](#14-elephants-toothpaste-annotated)
15. [Rabbits vs Foxes, annotated](#15-rabbits-vs-foxes-annotated)
16. [Firefly Sync, annotated](#16-firefly-sync-annotated)
17. [Robot Picks a Shape, annotated](#17-robot-picks-a-shape-annotated)
18. [Liesegang Rings, annotated](#18-liesegang-rings-annotated)
19. [Double Pendulum, annotated](#19-double-pendulum-annotated)
20. [Quantum Tunnelling, annotated](#20-quantum-tunnelling-annotated)
21. [Sunflower Phyllotaxis, annotated](#21-sunflower-phyllotaxis-annotated)
22. [Voronoi Metrics, annotated](#22-voronoi-metrics-annotated)
23. [Lloyd's Relaxation, annotated](#23-lloyds-relaxation-annotated)
24. [Giant's Causeway, annotated](#24-giants-causeway-annotated)
25. [Kuramoto–Sivashinsky Spacetime, annotated](#25-kuramotosivashinsky-spacetime-annotated)
26. [Cellular Flame, annotated](#26-cellular-flame-annotated)
27. [Kuramoto–Sivashinsky on a Torus, annotated](#27-kuramotosivashinsky-on-a-torus-annotated)
28. [Kuramoto–Sivashinsky Spiral, annotated](#28-kuramotosivashinsky-spiral-annotated)
29. [Kuramoto–Sivashinsky Soap Film, annotated](#29-kuramotosivashinsky-soap-film-annotated)
30. [Voodoo Doll, annotated](#30-voodoo-doll-annotated)
31. [Radar Shadow, annotated](#31-radar-shadow-annotated)
32. [Supernova Remnant, annotated](#32-supernova-remnant-annotated)
33. [Intercept, annotated](#33-intercept-annotated)
34. [Radian628 — Shape Mirror, annotated](#34-radian628--shape-mirror-annotated)
35. [My notes](#35-my-notes)

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
| ξ | xi | how far a chemical reaction has gone, 0 (not started) to 1 (finished) | `\xi` | `xi` |
| ψ | psi | a wave function; a field; the average phase of a crowd of oscillators | `\psi` | `psi` |
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
| Ṙ | R dot | how fast R is changing per unit of time, dR/dt (Newton's notation) | `\dot R` |
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
| ∬ | double integral | a continuous sum over an area | `\iint` | double loop: `total += u * dx * dx` |
| erfc | complementary error function | the tail of a bell curve: erfc(x) = 1 − erf(x) | `\operatorname{erfc}` | a polynomial fit (`erfc` in radarShadow.js) |
| w = z⁻³ | a conformal map | a way of bending the plane that keeps angles; here it turns radar exposure into plain length | `w = z^{-3}` | complex power: raise r, multiply θ |
| K₀, K₁ | modified Bessel functions | how a dent in a sheet on a soft bed fades with distance (about e^{−r}/√r far out) | `K_0(x)` | a polynomial fit (`besselK` in voodooDoll.js) |
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
| `\\mathrm{H_2O_2}` | H₂O₂ | chemical formulas: upright letters, subscript counts |
| `\\xrightarrow{\\ \\mathrm{I^-}\\ }` | an arrow with I⁻ over it | "turns into, helped by I⁻" in a reaction |
| `\\ln x` | ln x | natural logarithm, `Math.log(x)` in JS |
| `\\#\\{i : \\dots\\}` | #{i : …} | "how many i satisfy …"; `#` must be escaped |
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

## 12. Funny sketches: the formula

The silly sketches (the duck, the robots, the poop) all work the same way, and
`src/lib/bit.js` turns that into helpers. A bit is

**a true equation × an absurd noun, told deadpan.**

1. **Straight man.** The system, the equation and every number on screen are real and
   checked. The joke never gets to bend the physics. If the honest number is less funny,
   use the honest number.
2. **Casting.** Swap the textbook noun for an absurd one that still fits the maths
   (spins → robot moods, a test mass → a rubber duck). Or keep the noun and swap the
   *unit* (litres → elephants brushed).
3. **Feelings from derivatives.** Name the actors' moods from the signs of real rates.
   `mood([dR, dF], { '+-': 'Rabbits: thriving. Foxes: on a diet.', ... })` picks the
   caption from whether each rate is positive or negative, so the joke is true on every
   frame.
4. **Punchline readout.** One live number converts a real result into a ridiculous unit,
   with the conversion shown: `inUnits(hl, vFoam, { per: 2, of: 'L', name: 'elephants brushed' })`.
5. **Own the reset.** Real processes don't loop. Give the loop's reset its own beat
   ("Rewinding. Entropy, briefly ignored.") with `beat(t, [[start, text], ...])`.

`caption(text)` formats any of these as the small grey italic line at the bottom of the
equation. Not every sketch needs all five rules; 1 is the only compulsory one.

---

## 13. Realistic scenes

`src/lib/environment.js` puts a 3D sketch somewhere that looks real:

```js
setup(ctx) {
  const env = createEnvironment(ctx, { preset: 'meadow', sun: [12, 230] });
  // ... add your objects; use MeshStandardMaterial, castShadow = true
  return { env };
},
update(ctx, state) { state.env.update(ctx); },
dispose(ctx, state) { state.env.dispose(); },
```

| Preset | What you get |
|---|---|
| `meadow` | a physically based sky (the Preetham model) with a sun, swaying instanced grass, ground, haze |
| `dusk` | the meadow after sunset: no direct sun, the sky still glowing |
| `lab` | a black epoxy bench and a tiled wall under ceiling lights, with studio reflections |

Options override the preset: `sun: [elevation°, azimuth°]`, `exposure`, `grassHeight`,
`grassRadius`, `shadowRadius` (how much of the scene gets crisp shadows), `vignette`.
`env.setSun(elevation, azimuth)` moves the sun at any time.

What makes it look real, in order of importance:

1. **Light in real units, then film.** The scene renders into a high-dynamic-range buffer
   (the sun can be thousands of times brighter than a shadow), and a last pass maps that
   onto the screen with the ACES filmic curve, as a camera would. Without this, bright
   things clip to flat white.
2. **Reflections of the actual sky.** The sky is baked into an environment map, so every
   physically based material picks up its colour.
3. **Soft shadows** from the sun, and **fog matched to the sky's colour at the horizon**,
   measured from the sky itself in the direction the camera looks.
4. **Clutter.** Tens of thousands of grass blades, graduation marks on glassware. Real
   places are never clean.

---

## 14. Elephant's Toothpaste, annotated

File: `src/sketches/elephantToothpaste.js`

Hydrogen peroxide falls apart into water and oxygen on its own, slowly. Iodide ions
(from potassium iodide) speed this up without being used up, so they're a **catalyst**.
Dish soap traps the oxygen as foam.

**Everything follows from one number, ξ.** The reaction is first order, so the fraction
of peroxide used up is ξ = 1 − e^(−kt) with k = 0.6 per second. Then:

| Quantity | Formula | At the end |
|---|---|---|
| peroxide left | n₀(1 − ξ), with n₀ = 0.4895 mol in 50 mL of 30 % solution | 0 |
| oxygen | ½ n₀ ξ RT/P (2 H₂O₂ make 1 O₂; ideal gas at 25 °C) | 5.99 L |
| foam | oxygen ÷ φ, with φ = 0.9 of the foam being gas | 6.65 L |
| heat | 98.0 kJ per mole of peroxide × n₀ ξ | 48.0 kJ |
| temperature | 25 °C + heat ÷ (70 g × 4.18 J/(g·°C)), stopping at 100 °C | 100 °C |
| steam | heat beyond 100 °C ÷ 2257 J/g | 11.5 g |

The foam is drawn as a tube exactly as wide as the cylinder, so its length *is* its volume
divided by πr². Two metres of it.

**The joke (formula rules 2, 4, 5).** Elephants brushed = foam ÷ 2 L (an elephant has
four molars in use at a time; we budget 0.5 L each). The last 4 s rewind the reaction,
and the caption admits that isn't physics.

**Code map.** `motion` turns loop time into reaction time τ (forwards, a pause, then
the rewind) and computes every number above. `buildPath` lays out the foam's route
once (up, over, down, coiling round the foot) and gives it twist-free frames by
**parallel transport**: each ring's sideways direction is the previous one, nudged to
stay perpendicular. `update` rebuilds the tube every frame up to the foam's current
length. Lumps and stripes are looked up by `matter = length − s`, which labels each
parcel of foam, so they ride along with it instead of sliding over it.

---

## 15. Rabbits vs Foxes, annotated

File: `src/sketches/rabbitsVsFoxes.js`

The Lotka–Volterra equations (1925) are the simplest predator–prey model:

- Ṙ = αR − βRF. Rabbits breed (αR) and get eaten (βRF: proportional to how often a
  rabbit and a fox meet).
- Ḟ = δRF − γF. Foxes breed by eating rabbits (δRF) and die (γF).

**Why it loops forever.** V = δR − γ ln R + βF − α ln F never changes. Check it: dV/dt =
(δ − γ/R)Ṙ + (β − α/F)Ḟ, and substituting the equations makes it cancel to 0. Each
starting point has its own V, and the populations go round the closed curve of that V.
The sketch shows V live: it stays at −4.1604 (to rounding) while everything else
changes.

**The numbers.** α = 1.04, γ = 0.832 per year; β = 0.065, δ = 0.0104 per animal per
year. Equilibrium is R = γ/δ = 80, F = α/β = 16. Starting from 30 rabbits and 8 foxes,
rabbits swing 21 → 202 and foxes 5 → 37, with a period of 10.0 years, close to the
real ~10-year snowshoe hare/lynx cycle in Canadian fur-trading records.

**Feelings from derivatives (formula rule 3).** The four quarters of the loop are the four
sign combinations of (Ṙ, Ḟ). `mood()` names them: thriving / on a diet, thriving /
noticing, concerned / never been better, scarce / regretting the last five years.

**Code map.** `CYCLE` integrates one exact period with RK4 (4th-order Runge–Kutta: four
slope samples per step, averaged) and stores 2400 samples, so `motion` is a lookup and
the loop closes perfectly. Every animal is one instance of an `InstancedMesh`: animal i
is shown while i < population, and the newest one grows in by the fractional part.

---

## 16. Firefly Sync, annotated

File: `src/sketches/fireflySync.js`

Each firefly has a phase θᵢ (where it is in its own flash cycle) and flashes as θᵢ passes
0. The **Kuramoto model** (1975): θ̇ᵢ = ωᵢ + K r sin(ψ − θᵢ).

- ωᵢ is the firefly's natural rhythm. They're all slightly different.
- r e^(iψ) is the average of all the e^(iθⱼ): put every firefly on a clock face and take
  the centre of mass. ψ is the crowd's average phase; r, from 0 to 1, is how together
  they are.
- K r sin(ψ − θᵢ) nudges each firefly toward the crowd: forward if it's behind, back
  if it's ahead.

**Kuramoto's exact result.** If the ωᵢ follow a Lorentzian of half-width γ, nothing
happens until K passes K_c = 2γ; above it, r = √(1 − K_c/K). A firefly joins in iff
|ωᵢ − ω₀| ≤ K r. The rest, with rhythms too far from the crowd's, keep doing their own
thing. The live "locked" count is that formula applied to the simulated r.

**Feelings (rule 3, from a threshold rather than a sign).** "Every firefly for itself"
below K_c, "a band is forming" above it, and at synchrony the caption counts the
fireflies still freestyling.

**Code map.** The simulation is the mean-field form: compute r and ψ once (O(N)), then
update every θᵢ, a few small time steps per frame. The flash is a narrow bump in θ. The
point light at the centre has brightness equal to the total flash, which is why the
grass pulses once they agree.

---

## 17. Robot Picks a Shape, annotated

File: `src/sketches/robotPicksAShape.js`

A robot names a mathematical object, the shape on screen turns into it, and then it
picks another. About 45 kinds of object, most with random parameters, so it is never the
same twice. Ask it for something specific with **Params → Ask for a shape**, or start from
one with `?shape=klein` at the end of the address.

**One representation for everything.** Every object is a function d(x, y, z) whose zero set
is the object. There are three kinds:

| Kind | Examples | How d is made |
|---|---|---|
| exact distance | sphere, torus, Platonic solids, knots, links | the true distance to the surface, negative inside |
| distance estimate | Mandelbulb, Julia set, Menger sponge, Sierpinski | a formula that is never more than the true distance |
| implicit surface | Klein bottle, Clebsch cubic, Kummer, gyroid, Barth | d = f/\|∇f\|: the equation's value, divided by how fast it changes |

The third is one step of Newton's method: if f changes by \|∇f\| per unit of distance, a
point where f = 0.3 and \|∇f\| = 3 is about 0.1 away from where f = 0. That turns any
equation into something a raymarcher can draw.

**One formula for every transformation.**

  F_s(x) = (1 − s) d_A(x) + s d_B(x) + 4s(1 − s) φ(x)

At s = 0 this is exactly object A and at s = 1 exactly B, because 4s(1 − s) is 0 at both
ends and 1 halfway. φ is the flourish, picked at random: a sine ripple, a gyroid lattice,
a swelling (a constant), or a twist of space (instead of adding to F, it rotates each
point by an angle proportional to its height before F is evaluated).

**Drawing it.** The surface drawn is \|F\| = 0.008, a thin shell, so a solid sphere and an
open saddle blend the same way. Everything is clipped to a ball of radius 1.3. The ray
steps forward by \|F\| divided by L, where L bounds how steep F can be: the blend never
gets steeper than its steepest ingredient, and the flourish adds its own steepness.

**The robot** follows the comedy formula (section 12). Every fact it states is true
(27 lines on a cubic surface, 16 nodes on the Kummer surface, 65 on the Barth sextic);
the opinions are its own. Ask for something it doesn't know and it substitutes a random
object, "which is basically the same if you squint".

**Typing your own equation.** Click **✎ Ask for a shape, or type an equation** under the
robot and type something like `z = x^2 - y^2`, `x^4 + y^4 + z^4 = 1` or
`r = 1 + 0.2 sin(5x) sin(5y) sin(5z)`. z is up. You can use x, y, z, r (distance from the
centre), t (time, so it moves), pi, e, phi, `^` for powers, `|x|` for absolute value, and
sin cos tan exp ln sqrt abs min max and friends. `2xy` means 2·x·y. What happens next
(`src/lib/equation.js`):

1. **Parse.** The text becomes a syntax tree. Everything else is generated from the tree,
   never from your text, so only known pieces can reach the shader.
2. **Find it.** f is sampled on a grid, first in a 6-unit box, then 24 units, then 1.2
   units. Grid points within one cell of f = 0 are snapped onto the surface by Newton's
   method (p ← p − f∇f/|∇f|²). That gives its centre, its size, and whether it reaches the
   edge of the box, which counts as infinite.
3. **Describe it.** The robot's facts are all measured: the polynomial degree (read off the
   tree), mirror and rotational symmetries (f compared with f after reflecting or rotating,
   at 60 random points), and the width of its bounding box. Then it gets a name.
4. **Draw it.** The tree is written out as GLSL (whole powers become repeated
   multiplication, because GLSL's `pow` can't handle negative bases), compiled into one of
   three spare slots, and drawn like any other implicit surface: d = f/|∇f|.

The address changes to `?eq=…`, so you can share your surface.

**Adding an object.** Add an entry to `SHAPES`: `id`, `name`, `kind` (`'sdf'` or
`'implicit'`), `glsl` (for `'sdf'`, return a distance from `p`; for `'implicit'`, return
f of `q` = p × `scale`), `params(rng)` (up to four random numbers, which arrive as `k`),
`latex(k)`, `fact(k)` and `aliases`. Check it alone with `?shape=<id>`.

---

## 18. Liesegang Rings, annotated

File: `src/sketches/liesegangRings.js`

Put a drop of silver nitrate in the middle of a gel containing potassium dichromate, wait
a couple of days, and the dark red silver dichromate comes out not as a smear but as
**rings**, with clear gel between them. Raphael Liesegang found this in 1896. Rings like
these appear in some rocks too.

**Why rings.** The product has to become *supersaturated* (reach c\*) before any solid
appears. Once a ring has formed, it grows by soaking up dissolved product from around it,
which leaves a gap where nothing can reach c\*. The next ring can only form further out,
where the front brings in fresh product. The caption narrates c/c\* ("holding
it in") and each new ring ("could not hold it in any more").

**The model** (Keller–Rubinow): silver a and dichromate b diffuse and react to dissolved
product c, which turns into immobile precipitate d where c > c\* (nucleation) or where
there is already precipitate and c > c_s (growth). Explicit finite differences in the
radius r, so the Laplacian has the extra (1/r)∂/∂r term of a disc.

**The two laws on screen.** Each ring is further out than the last by a nearly constant
factor (Jablczynski's spacing law, x_{n}/x_{n−1} → 1 + p, here 1.06–1.12), and x_n/√t_n
settles to a constant (the time law: diffusion covers distance ∝ √time). Real silver
diffuses at 1.6 × 10⁻⁹ m²/s, so this 9 cm dish takes about 2.3 days, shown in 26 s.

**Code map.** `createSim` runs the simulation (in the first second) and records 520
snapshots; later loops replay them. The gel's colour is looked up in the shader from a
240 × 1 texture (r: precipitate, g: dichromate left) by radius, with a small angular
wobble so the rings look grown.

---

## 19. Double Pendulum, annotated

File: `src/sketches/doublePendulum.js`

Three double pendulums, released together, their tips one atom's width (10⁻¹⁰ m)
apart. The equations of motion come from the Lagrangian L = T − V on the first line and
are integrated with RK4. Energy stays constant to 10⁻⁹ J, shown live, so the
arithmetic is trustworthy.

**What chaos means here.** The gap grows like e^(λt) with λ ≈ 1.6 per second: 10⁻⁶ rad at
2.9 s, 0.1 rad at 12.6 s. Nothing random is happening; the future is fixed by the start.
It's just that to predict 12 s ahead you'd need to know the start to better than an atom.
λ is the **Lyapunov exponent**, and the readout estimates it live as ln(gap/gap₀)/t.

**The white trail.** The LEDs are red, green and blue, and the trails add like light, so
while the three paths coincide the trail is white. It splits into colours exactly when
they stop agreeing.

**Honesty about the computer.** The integrator makes tiny errors too, and chaos amplifies
those as well. Comparing two step sizes from the same start, they reach 0.1 rad at 16.4 s,
four seconds after the atom. After that the paths are real double-pendulum motions, but
not the exact ones for these angles, and the caption says so.

---

## 20. Quantum Tunnelling, annotated

File: `src/sketches/quantumTunnelling.js`

An electron with 13.6 eV of energy meets a wall 16.3 eV high. Classically, it bounces
every time. Quantum mechanically, part of it comes out the other side.

**What's drawn.** The wavefunction ψ is a complex number at every point x, drawn as a
curve that winds around the x-axis: real part up, imaginary part sideways, colour =
phase. The translucent curtain is |ψ|², the probability of finding the electron there.
The glass pane is the wall, drawn to scale (0.05 to 0.21 nm thick).

**How it's solved.** The Schrödinger equation, i∂ψ/∂t = −½∂²ψ/∂x² + Vψ, in atomic
units. The split-step Fourier method alternates two exact steps: V just rotates ψ's phase
at each point, and −½∂² just rotates the phase of each wavelength (an FFT switches
between the two views). Rotating phases never changes |ψ|, so the total probability
stays exactly 1.0000, as the readout shows.

**The check.** For a single wavelength the transmission through a rectangular wall is
known exactly, T = [1 + V₀² sinh²(κa)/(4E(V₀ − E))]⁻¹. A packet is a mixture of
wavelengths, so its transmission is the average ⟨T⟩. Each loop thickens the wall, and
the simulated P_through lands within 1% of ⟨T⟩: 0.718, 0.350, 0.159, 0.077. Thicker walls
let through exponentially less, roughly e^(−2κa).

**You, through a wall.** Same formula, your numbers: 70 kg, a 10 cm wall, 1 J short.
κ = √(2mΔE)/ħ is about 10³⁵ per metre, so T ≈ 10^(−9.7×10³³). Don't wait up.

---

## 21. Sunflower Phyllotaxis, annotated

File: `src/sketches/sunflowerPhyllotaxis.js`

Seed n of a sunflower sits at angle n·α and radius c√n (Vogel's model). The √n makes
every seed take the same area. Everything else depends on the single angle α.

**Fractions make spokes.** If α is p/q of a turn, every q-th seed comes back to the same
direction, so the seeds pile up on q straight spokes with wasted gaps between. The loop
visits 2/5, 3/8, 5/13, 8/21 and 13/34: 5, 8, 13, 21, 34 spokes, each closer to the next
angle.

**The golden angle has no spokes.** Those fractions are ratios of Fibonacci numbers,
and they're the best approximations to 1/φ² = 0.381966…, where φ is the golden ratio.
360°/φ² = 137.508° is the golden angle. φ is the hardest number of all to approximate by
fractions (its continued fraction is 1, 1, 1, 1, …), so seeds placed by it never line
up, and they pack evenly. The closest pair of seeds goes from 0.07c at 2/5 to 1.67c at the
golden angle.

**Where the spirals come from.** At the golden angle each seed's nearest neighbours are a
Fibonacci number of seeds away, here 55 and 89 at the rim. Neighbours along a family of k
spirals are k apart, so those are the spiral counts you can see and count: 55 one way, 89
the other. Real sunflowers commonly show 34/55 or 55/89. The petals are placed by the
golden angle too.

---

## 22. Voronoi Metrics, annotated

File: `src/sketches/voronoiMetrics.js`

A Voronoi cell is everything closer to its seed than to any other seed. "Closer" needs a
distance, and this sketch changes which one: d_p = (|Δx|^p + |Δy|^p)^(1/p).

| p | Name | A "circle" is a… |
|---|---|---|
| 1 | taxicab, Manhattan | diamond |
| 2 | Euclidean | circle |
| ∞ | chessboard, Chebyshev: max(\|Δx\|, \|Δy\|) | square |
| < 1 | not a distance: the triangle inequality fails | four-pointed star |

The small outline round each seed is its "unit circle" for the current p; every cell
boundary is built from that shape. The black patches at p = 1 are real: whole regions can
be exactly as far from two seeds.

---

## 23. Lloyd's Relaxation, annotated

File: `src/sketches/lloydRelaxation.js`

Move every seed to the centre of mass of its own cell; redraw the cells; repeat. The cells
end up nearly all hexagons, the honeycomb, without being told to.

**Why.** Each step lowers the energy G = Σ∫|x − pᵢ|² dA / (2nĀ²): moving a seed to its
centroid minimises its own cell's integral, and redrawing the cells can only lower it
further. In the plane nothing beats the regular hexagon, G = 5/(36√3) = 0.080188 (Fejes
Tóth). The readout is computed exactly from the polygons (`src/lib/voronoi.js`), not
sampled.

**The colours** count sides: honey 6, blue 5, red 7. The average stays at 6 throughout:
Euler's formula, with three cells meeting at every corner, forces it. Lloyd doesn't change
the average; it makes everyone average. Blue–red pairs left over are defects, like
dislocations in a crystal.

**The dual.** Join two seeds when their cells share an edge and you get the Delaunay
triangulation. No seed is inside any triangle's circumcircle (the circles drawn at the end).

---

## 24. Giant's Causeway, annotated

File: `src/sketches/giantsCauseway.js`

The same relaxation, drawn as basalt columns rising from the sea, each keeping its own
height while its outline changes. The real columns formed differently: a thick lava flow
cooled, contracted and cracked, the cracks advancing layer by layer, and that crack pattern
also drifts toward hexagons. Most columns there have 5, 6 or 7 sides, most often 6.

---

## 25. Kuramoto–Sivashinsky Spacetime, annotated

File: `src/sketches/ksSpacetime.js`

u_t = −u u_x − u_xx − u_xxxx, on a periodic box of length L, drawn as a landscape: across is
x, the front edge is now, the past recedes behind it.

**One number organises it.** A wave e^(ikx) grows at rate k² − k⁴, so only 0 < k < 1 grows.
In a box of length L the waves that fit are k = 2πn/L, so ⌊L/2π⌋ of them are unstable. The
loop goes through L = 5, 12, 16, 22, 100: 0, 1, 2, 3 and 15 unstable modes, and the
behaviour goes decay, a travelling cell, steady cells, chaos, spatiotemporal chaos. The
"regime" readout is measured live: chaos if the energy ⟨u²⟩ fluctuates, travelling if it's
constant but the profile moves, steady if nothing moves.

**How it's solved** (`src/lib/kuramotoSivashinsky.js`): in Fourier space the stiff part,
(k² − k⁴)v, can be integrated exactly; ETDRK4 does that and handles the nonlinear part to
fourth order. Two traps, both hit while building it: keep the shortest wave damped, and keep
the field exactly real after every step, or round-off grows into a blow-up.

---

## 26. Cellular Flame, annotated

File: `src/sketches/cellularFlame.js`

Sivashinsky derived his equation for flame fronts: φ_t + ∇²φ + ∇⁴φ + ½|∇φ|² = 0, where φ is
where the flame is. A flat flame is unstable (∇²), small wrinkles are smoothed (∇⁴), and
burning along the normal (½|∇φ|²) folds the wrinkles into cells with sharp creases. Real
lean hydrogen flames look like this.

**Wrinkles make it faster.** Average the equation over the burner: ∇² and ∇⁴ average to
zero, leaving d⟨φ⟩/dt = −½⟨|∇φ|²⟩. Both sides are measured live and agree. A wrinkled flame
has more area, and more area burns more fuel.

**How it's drawn.** A thin sheet of glowing gas looks brightest where you look along it, so the
brightness grows as the sheet turns edge-on; the creases between cells are brightest of all, and a
glow (bloom) pass (`src/lib/glow.js`) lets them bleed light, as real flames do.

**Cell size.** Linear theory says the fastest-growing wavelength is 2π√2 = 8.9 (k = 1/√2,
where k² − k⁴ peaks). The measured cells, from the peak of the curvature spectrum, are a
little smaller (6–8): the nonlinearity keeps splitting them.

---

## 27. Kuramoto–Sivashinsky on a Torus, annotated

File: `src/sketches/ksTorus.js`

A periodic rectangle (what leaves the right edge comes back on the left, and the same top to
bottom) *is* a torus: glue left to right to get a tube, then glue the tube's ends. So the 2D
KS equation, which is always solved on a periodic rectangle, is drawn on one.

The rectangle is 80 × 32, close to the torus's own proportions (the long way round is 2.5
times the short way), so the cells aren't stretched much. What's drawn is the curvature −∇²u
rather than u itself, because u's size is mostly in very long, gentle waves, while the cells
live in its curvature: the surface bulges over each cell and creases between them.

---

## 28. Kuramoto–Sivashinsky Spiral, annotated

File: `src/sketches/ksSpiral.js`

The 1D equation lives on a periodic line, which is a circle. So space goes round the rim and
time sinks inward: each new moment is the outer ring, and older ones slide toward the centre
and down into the dark, like looking into a tunnel of time. With L = 64, ten waves can grow
(k = 2πn/L < 1), which is plenty for chaos: cells are born, drift sideways (the tilted streaks),
merge and split.

---

## 29. Kuramoto–Sivashinsky Soap Film, annotated

File: `src/sketches/ksSoapFilm.js`

KS also describes waves on thin liquid films. Here it ripples the thickness d of a soap film
that is also draining under gravity, so it's thin at the top and thick at the bottom.

**The colours are physics.** Light bounces off the front of the film and off the back. The
front reflection flips the wave over (a half-wave shift), the back one doesn't, and the two
interfere: R(λ) = 2r²(1 − cos(4πnd/λ)). For each pixel that's computed at 16 wavelengths and
turned into a colour with the CIE colour-matching functions (how the eye's cones respond),
then into screen RGB. When d is tiny, the two reflections cancel at every colour: the film
goes black. Real soap films turn black at the top just before they pop.

---

## 30. Voodoo Doll, annotated

File: `src/sketches/voodooDoll.js`

Click and hold on the doll to push a pin in (on a phone, turn on hand mode first). Leave it
alone and it pokes itself; after ten pins they all pop out.

**The shape.** Solve ∇²φ = −1 inside the outline, with φ = 0 on the seam. For a long tube of
half-width a that gives φ = (a² − x²)/2, so √(2φ) = √(a² − x²) is a semicircle: a stuffed
fabric tube is round however wide it is. The doll's thickness is 0.6√(2φ).

**The skin** is a stretched sheet (tension T) on a bed of stuffing (stiffness k), dented
inward by w: ρ w_tt = T∇²w − k w − γ w_t + f. That's a wave equation (T∇²w) plus a spring
(−k w) plus friction (−γ w_t). Press on it with a flat tip of radius a and the dent is
w(r) = δ K₀(r/ℓ)/K₀(a/ℓ), with ℓ = √(T/k) = 13.5 mm. Add up the forces and the push needed
is F = πa²kδ + 2πTδ (a/ℓ) K₁(a/ℓ)/K₀(a/ℓ). The sketch measures F on its grid and prints the
formula beside it; they agree to about 1%, except near a seam (the formula assumes a sheet
with no edges, and a seam makes it stiffer).

**The pin** follows a needle-insertion model from surgical robotics (Okamura et al., 2004):
the force builds as the fabric dents, the fabric gives way at about 2.2 N (the pop, and the
dent rings out as a wave), then friction grows with depth, f = μs, dragging the fabric in
around the pin. Every force also twists the doll (torque τ = r × F on a damped spring).

**The pain** is a heat equation: u_t = D∇²u − u/τ + η F·v. The source is the needle's power
F·v, so a pin that took more work hurts more; the −u/τ term makes it fade. "Pain" and "ow"
are the joke. The equation is the one that spreads heat.

Try: set **speed** to 0.1 and poke. In slow motion you can see the dent deepen, the pop, and
the ring of the wave crossing the doll.

---

## 31. Radar Shadow, annotated

File: `src/sketches/radarShadow.js`

A drone spots a target, then flies the route a radar is least likely to notice.

**Spotting it (Johnson criteria).** A camera can tell something is there when about one pair of
pixels (one "cycle") spans its critical size. Across a target of size h at range R, with each pixel
covering IFOV radians, that's N = h / (2R·IFOV) cycles. The chance of detection is
P = (N/N50)^E / (1 + (N/N50)^E) with E = 2.7 + 0.7·N/N50 and N50 = 1. Watch P climb as the drone
closes in.

**Hiding (a geodesic).** A radar's echo weakens as 1/r⁴ (the signal goes out and comes back), so a
drone at steady speed collects echo energy J = ∫ ds/r⁴ along its path. Finding the path with the
smallest J is a calculus-of-variations problem, and it has a beautiful shortcut. Treat the plane as
complex numbers z and use the map w = z⁻³. Then |dw| = 3|dz|/r⁴, so J is just a third of the path's
length in the w-plane, and the shortest path there is a straight line. Mapped back, that line is the
curve r³ = a³cos(3θ + φ), which swings wide of the radar before cutting in. It is about twice as
long and gets about 40% less echo.

**The family.** For a sensor whose signal falls as 1/rⁿ, the map is w = z^(1−n). n = 0 gives a
straight line (no sensor). n = 1 gives a logarithmic spiral, using w = log z. n = 2 (a camera) gives
a circle through the sensor. n = 4 (radar) gives the three-lobed curve. The planning phase sweeps n
from 0 to 4 so you can watch the path bend.

**Was it seen?** Integrated echo S is proportional to J. North's approximation gives the detection
probability P_d = ½ erfc(√(−ln P_fa) − √(S + ½)). The straight route ends at 87% and the curved one
at 40%. Less, not never.

**The background.** The radar is a 16-element phased array. Its beam pattern is the array factor
AF(θ) = sin(Nψ/2) / (N sin(ψ/2)) with ψ = π sin(θ − θ_beam): one main lobe plus sidelobes. The echo
passes through it twice, so the glow is AF⁴/r⁴, swept round, with each outgoing pulse drawn as a ring.

---

## 32. Supernova Remnant, annotated

File: `src/sketches/supernovaRemnant.js`

A star explodes. Its shock sweeps up the gas around it for 160 000 years, shown on a log time scale.
Each loop is a new star (a white dwarf or a collapsed massive star) in gas of a different density.

**Free expansion.** At first the ejecta just coast. A uniform ball of mass M_ej carrying energy E has
edge speed v_ej = √(10E / 3M_ej), about 11 000 km/s for a white dwarf, so R = v_ej·t. The fading light
at the start is cobalt-56 decaying to iron-56: L ∝ e^(−t/111 d).

**Sedov–Taylor (dimensional analysis).** Once the shock has swept up about its own mass of gas, the
ejecta stop mattering. All that is left is the energy E (J = kg·m²/s²), the gas density ρ (kg/m³) and
the time t. The only length you can build from them is (E t²/ρ)^⅕, so R = ξ₀ (E t²/ρ)^⅕ with a pure
number ξ₀ in front. G. I. Taylor used this to estimate the energy of a blast from photographs of its
radius over time. The shock speed follows by differentiating: v_s = Ṙ = 2R / 5t.

**Finding ξ₀.** Dimensional analysis can't give the number in front, but the flow is *self-similar*:
the profiles of velocity, density and pressure keep the same shape and just stretch with R. Writing
u = Ṙ f(λ), ρ = ρ₁ g(λ), p = ρ₁ Ṙ² h(λ) with λ = r/R turns the gas equations into three ordinary
differential equations in λ. The sketch integrates them at load (RK4, from the shock inwards, starting
from the strong-shock jump g = 4, f = h = ¾), then requires the total energy to equal E. That gives
ξ₀ = 1.1517 for a monatomic gas (γ = 5/3), the textbook value. The same solution gives the density
inside: 4× the gas density at the shock, falling to almost nothing in the middle (ρ ∝ λ^4.5). Nearly all
the mass is piled up in a thin shell just behind the front.

**Why the rim glows.** Hot gas shines by bremsstrahlung, ε ∝ ρ² √T, so the thin dense shell does the
shining. Looking through the middle of a hollow shell you cross it twice, briefly; at the edge your line
of sight runs along it for a long way. So the remnant looks like a ring (limb brightening), as real ones
do. The shader adds up ε along each view ray.

**Temperature.** Just behind a strong shock T_s = 3μ m_p v_s² / 16k (μ = 0.6, the mean particle mass
in proton masses). At thousands of km/s that is hundreds of millions of kelvin: X-rays, drawn in false
colour like a Chandra image (blue rim; red, gold and blue knots for silicon, sulfur and iron).

**Snowplow.** At t_tr ≈ 2.9×10⁴ yr · E₅₁^(4/17) n^(−9/17) the shell is cool enough to radiate its heat
away. It collapses into a thin cold shell pushed by the hot interior, R ∝ t^(2/7), and glows in
hydrogen-alpha red and oxygen teal, like the Veil Nebula. (The filaments are noise, not hydrodynamics.)

**Checks.** R(340 yr) = 2.1 pc for Cas A-like numbers (observed ≈ 2.5 pc), R(450 yr) = 3.8 pc for
Tycho (observed ≈ 3.7 pc), and Ṙ matches 2R/5t to 0.2% in the Sedov phase.

Try: speed 0.2 around the "swept up its own mass" caption, and watch v_s start to fall while R keeps
growing.

---

## 33. Intercept, annotated

File: `src/sketches/intercept.js`

A Shahed-type drone makes a pop-up attack on a gun position, and a twin 35 mm autocannon shoots it
down. The whole attack is simulated at 240 steps a second and played back. The camera cuts between a
chase view, the gun's view, a slow-motion orbit of the hit and the fall of the wreckage. Every loop is a
new attack.

**The attack.** It flies in at 45 m, below the tree line where the gun's radar can't see it, climbs
steeply near the target, then dives. In the dive it steers by **proportional navigation**:
a = N·V_c·(Ω × v̂), where Ω = (r × ṙ)/|r|² is how fast the line of sight to the target is turning. Turn
N times faster than the line of sight turns, and you end up on a collision course.

**The gun.** Each round leaves at 1175 m/s and slows by air drag, v̇ = −k|v|v + g (about 850 m/s left
at 2 km). To hit, the gun aims where the drone will be when the round gets there, solving
|r + v·t| = v̄·t. Under drag the flight time over distance d is t = (e^{kd} − 1)/(k·v₀). The gun only
knows the drone's velocity from noisy radar fixes, smoothed by a filter that lags, so every turn the
drone makes throws the aim off for a moment.

**The hit.** One 35 mm explosive round is enough, and where it lands decides what happens: the warhead
may go off, the fuselage snaps in three, a wing comes off, or the engine dies and it glides down. Each
piece then falls as its own rigid body, v̇ = g − (ρC_dA/2m)|v|v, spinning, at its own terminal speed
√(2mg/ρC_dA): a wing flutters down at about 15 m/s, the warhead section falls at about 100.

**The blast.** The shock front grows as the Taylor–Sedov point blast, R = 1.03(E t²/ρ)^{1/5}, the same
law the Supernova Remnant uses, here with E ≈ 75 MJ instead of 10⁴⁴ J. The casing breaks into
fragments thrown at the Gurney velocity √(2E)·(M/C + 3/5)^{−1/2} ≈ 1.9 km/s, which drag slows over
tens of metres: s(t) = ln(1 + k·v₀·t)/k.

**Checks.** Over 40 simulated attacks: 30 shot down in the climb, 10 in the dive, after 25–120 rounds,
at 1.2–1.6 km. The blast front is 6 m out after 10 ms and 11.5 m after 50 ms.

Try: speed 0.3, and watch the tracers arc as gravity and drag bend them, and the gun's aim chase the
drone through its climb.

---

## 34. Radian628 — Shape Mirror, annotated

File: `src/sketches/radian628ShapeMirror.js`

Radian628's fractal repeats one step: fold, shift, scale, turn, and warp by an integral,
p ↦ s·R_θ(|p| − c) − (0.08/k) cos(kp + t). The fold `|p|` is a **mirror**: every point on the negative
side of an axis is reflected onto the positive side. This variation swaps the straight mirror for a
**curved one**, so the fractal grows on a shape.

**A mirror made from an equation.** Write the shape as an implicit curve g(p) = 0, with g < 0 inside.
Near the curve, g/|∇g| is (to first order) the signed distance to it, and ∇g/|∇g| points straight out.
So the reflection across the curve is

  p ↦ p + (|g| − g) ∇g/|∇g|²

Outside (g > 0) nothing moves. Inside, the point is pushed out by twice its distance: it lands on the
other side of the curve. For the line g = x this is exactly x ↦ |x|, the fold Radian628 already uses.

**The shapes** are ones from other sketches:

| Shape | g(x, y) | Where it came from |
|---|---|---|
| Hopf link | (\|p − c₁\| − r)(\|p − c₂\| − r) | two Hopf fibres, each through the other's centre |
| trefoil | (x² + y²)² − a(x³ − 3xy²) | the trefoil knot's shadow, the rose r = a cos 3θ |
| lemniscate | (x² + y²)² − a²(x² − y²) | the figure-eight, a Möbius strip's shadow |
| cardioid | (x² + y² − ax)² − a²(x² + y²) | the main bulb of the Mandelbrot set |
| deltoid | (x² + y²)² + 18a²(x² + y²) − 27a⁴ − 8a(x³ − 3xy²) | a circle rolling inside one 3× its size |

A product g₁g₂ is zero where either factor is, so the Hopf link is two circles from one equation.

**Morphing.** The slide from shape A to shape B uses g = (1 − s) g_A + s g_B, with both first turned
into distances (divided by |∇g|). Blending distances, not raw polynomials, keeps the curve in between a
sensible mix of the two.

**Glow.** At every step the shader measures |g| at the current point, divided by how much the step has
magnified things so far. That is the point's distance on screen from the mirror at that depth. Light is
added in proportion to 1/(distance + ε), so the shape and every smaller echo of it glow.

**μ** fades the curved mirror in over the first 4 s of the 30 s loop (μ = 0 is plain Radian628) and out
again at the end, so the loop closes.

Try: iterations 3 shows the shape with one ring of echoes; 14 shows the full filigree. Scale near 1.1
keeps the echoes close to the curve; 1.6 throws them out into petals.

---

## 35. Radian628 — Prism Mirror, annotated

File: `src/sketches/radian628PrismMirror.js`

The same curved mirror as §34, with two changes to Radian628's step and a brighter palette.
It plays behind the front page.

**A kaleidoscope instead of |p|.** The axis fold |p| reflects across two mirrors, x = 0 and y = 0.
Put N mirrors through the origin instead, at angles π/N apart, and fold the angle φ = atan2(y, x)
into a single wedge:

  φ ↦ |(φ mod 2π/N) − π/N|

N = 2 is the old fold, turned. The loop uses N = 3, 4, 5, 6, so the echoes around each shape come in
threes, fours, fives and sixes. A fractional N would leave a seam where the wedges don't meet, so the
slide between two counts blends the two folds: K = (1 − s)K_{N_A} + s K_{N_B}.

**A crossed warp.** Radian628 adds ∫ sin(kx + t) dx to x and ∫ sin(ky + t) dy to y. Here the
arguments are swapped: x gets −cos(ky + t)/k and y gets −cos(kx + t)/k. Each coordinate is pushed by the
*other*, which shears the echoes into swirls.

**Colour.** Each glow's hue is the depth i plus the orbit's angle, on a full-saturation rainbow
(0.5 + 0.5 cos 2π(t + (0, ⅓, ⅔))). The tone map divides by the brightest channel, compresses that, and
multiplies back, so bright spots get brighter but keep their hue instead of turning white.

Try: saturation 0 for a grey version (it shows the structure without the colour), or iterations 4 to
see the first ring of kaleidoscope echoes clearly.

---

## 36. Kali Drift, annotated

File: `src/sketches/kaliDrift.js`

Kali's fractal (the "Kaliset") repeats one step:

  p ↦ |p| / |p|^α − c

The |p| is the axis mirror again. Dividing by |p|² is an **inversion in the unit circle**: a point at
distance r goes to distance 1/r, so the inside of the circle is turned outside and back. Mirror,
invert, shift by c, repeat. α = 2 is the classic set. Smaller α inverts more gently (soft lace), and
larger α inverts harder (bold cells and jewels).

**Never the same twice.** The other sketches loop. Here c, α, the turn θ and the zoom each move on a
sum of sines whose frequencies are in irrational ratio (1, φ, √2, √3, φ√3, ...). Two frequencies with an
irrational ratio never line up again, so the point (c, α, θ, zoom) never returns to where it was: the
motion is **quasi-periodic**. The slowest clock takes about 47 s, so the picture keeps changing
character without ever jumping.

**Colour from the closest pass.** For each pixel, the shader follows the orbit and records its
closest pass to the mirror axes or the inversion circle, and *at which step* it happened. The step
picks the hue (one colour per level of the fractal), and closeness picks the brightness. Deeper passes
are counted as further away (×(1 + 0.8i)), so the first few levels draw the picture and the chaos
underneath is fine texture rather than noise. A smooth wash from the first step's radius fills the
background, so nothing goes black. Four samples per pixel (2×2) keep the fine lines from flickering.

Try: iterations 5 for just the big shapes, 20 for all the lace; saturation 0 to see the structure
alone.

---

## 37. Kali Mart, annotated

File: `src/sketches/kaliMart.js`

A shop whose stock is Kali's fractal, walked by a shopper on autopilot.

**The shelves** show the 3D Kaliset, the same step as Kali Drift one dimension up: p ↦ |p|/|p|² − c
with p ∈ ℝ³. Each shelf face is cut into 0.7 × 0.6 m product boxes, and each box shows a different
flat slice of the 3D set (the slice's depth comes from a hash of the box's position). c drifts on
irrational clocks as in Kali Drift, so the stock keeps changing.

**Ray marching.** There are no triangles. For every pixel the shader shoots a ray and asks a
*distance function* "how far is the nearest surface from here?" (the minimum over floor, ceiling,
shelf units, shelf boards and items). Moving that far along the ray can't overshoot anything, so it
steps forward by that distance and asks again until the distance is tiny (a hit) or the ray has gone
70 m. The floor sends a second ray in the mirror direction for its reflection, and fog
(1 − e^(−0.045 t)) takes the far aisles. That reflection and fog are most of the sense of depth.

**The items** are signed distance functions:

| Item | Distance function |
|---|---|
| Hopf link | min of two tori, one turned 90°: each ring passes through the other |
| trefoil knot | distance to the curve (sin t + 2 sin 2t, cos t − 2 cos 2t, −sin 3t), sampled as 36 segments, minus the tube radius |
| Menger sponge | a cube with crosses cut out at 3 scales (fold with mod, take the max) |
| gyroid ball | \|sin x cos y + sin y cos z + sin z cos x\| thickened, cut to a sphere |
| Möbius strip | a thin rectangle swept round a circle, turning by half the angle it has gone round |

Each item first checks a bounding sphere, so the expensive formula only runs on rays that pass close.

**The shopper** walks only along aisles (x = 6i) and cross aisles (z = 24j). Every frame it checks
which list items it can *see*: a straight line from it to the item, sampled every 0.4 m, must not pass
through a shelf. Then it routes there: along its aisle to a crossing, across, then down the item's
aisle. If it sees nothing it wanders crossing to crossing and looks both ways down each cross aisle.
After 40 s without luck it "asks a member of staff" (goes to the nearest list item it hasn't seen). A
finished list is checked out, and the basket is dropped from the ceiling at random spots, under
gravity with one bounce, for the next list.

Try: speed 3 to watch a whole list get done; detail 4 for flat posters, 14 for full fractal lace.

---

## 38. Kali Run, annotated

File: `src/sketches/kaliRun.js`

A man made of Kali Drift runs an endless hall, fighting what comes at him, with something behind him.

**What's drawn with what.**

| Part | Formula |
|---|---|
| his skin | Kali's 2D step p ↦ \|p\|/\|p\|^α − c, in his own body coordinates (it moves with him) |
| walls | ONE Kali picture per wall, unrolled along the hall by p = e^{a y}(cos(a z + s), sin(a z + s)) |
| floor, ceiling | the same unrolling across the width, over Inferno Cape f = fbm(x + k·fbm(x + fbm(x))) |
| floor objects | the five shape SDFs from Kali Mart, one per 2.6 m slot (some empty), from a hash of the slot |
| shadows | a sphere squashed to 0.8 tall, with sin·sin·sin spikes that move, and two red eyes |

**One picture on an endless wall.** The map (z, y) ↦ e^{a y}(cos a z, sin a z) is the log-polar
unrolling: height becomes distance from the centre of the picture, length becomes the angle round it.
It is conformal (small shapes keep their shape) and periodic in z, so the wall shows one continuous
picture with no seam, however far he runs (one turn per 32 m). The scroll s turns the picture past him,
and c and α drift on irrational clocks (as in Kali Drift), so it never repeats.

**Settings.** The walls and the floor run on their own clocks:
- *wall speed*, *floor speed* (3× by default): how fast the pictures drift and scroll;
- *wall scale*, *floor scale*: how big the picture is;
- *wall style*: video wall (one picture behind thin bezels), seamless, or separate screens (each its own Kali);
- *floor style*: Kali over Inferno Cape, Kali only, or Inferno only.

**His body** is 13 capsules (rounded line segments) blended with a smooth minimum, plus a sphere for
the head and the fists. JavaScript solves the joints every frame from a run cycle whose phase advances
by 2π per stride *of distance*, so his feet don't slide. Strikes are blended on top: a jab (left), a
cross (right) and a kick, each out fast and back slower.

**The chase.** He only runs forward, at 4.4 m/s. The thing behind runs at 4.8, so it gains; under 6 m
he sprints at 5.6 until the gap is over 13 m. Each fight slows him, so it gains while he fights. Small
shadows come down the hall and home in on him; whichever is in reach gets the next move of the combo
and bursts into colour. Every 18–30 s the thing behind vanishes and is 11 m in front. He doesn't stop:
jab, cross, kick, and it bursts, and re-forms 24 m behind him.

**The camera** sits behind him and a little to one side. Every 11–17 s it swings round in front of him
for 3 s, so you can see what's following.

Try: wall style "separate screens" for the old look; wall speed 8 for a hall that's moving faster than he is.

---

## 39. Kali Tangle, annotated

File: `src/sketches/kaliTangle.js`

Kali Drift with the tidiness taken out. Kali Drift's lines look neat because every step folds with the
same mirror |p| (so the picture is mirror-symmetric) and glows against the same three curves (the two
axes and the unit circle). Here both are random *per step*:

    p ↦ |R_i p + s_i| / |p|^α − c

- **R_i** turns by a random angle a_i, which drifts at its own random rate;
- **s_i** shifts the mirror off the centre, while the inversion still measures |p| from the centre, so
  no symmetry survives;
- each step glows against **its own random line and circle**, in its own random hue, and every near
  pass is *added* (not only the closest), so strands cross and tangle.

Try: chaos 0 to get back (nearly) to Kali Drift; chaos 1 for the full mess.

---

## 40. Kali Silk, annotated

File: `src/sketches/kaliSilk.js`

A different Kali set in every patch of the screen. c and α become *fields* picked by a slowly drifting
noise n(z) (fractal Brownian motion: a few octaves of smooth value noise):

    c(z) = c + k (n(z) − ½),     α(z) = α + 1.5 k (n₁(z) − n₂(z))

Neighbouring pixels run nearly the same fractal, so lines stay continuous, but across the screen they
bend, split and wander. Each step's trap line turns by the golden angle (≈ 137.5°), so no two steps glow
against the same direction, and hues come from the noise field.

Try: warp 0 for plain Kali; warp 1 for threads that barely remember the fractal.

---

## 41. Kali Scribble, annotated

File: `src/sketches/kaliScribble.js`

The Tangle step (random turns and shifted mirrors), drawn as shaky ink and **re-dealt** every
`reseed` seconds (0.1 to 300). All the random numbers come from a seed, and each one follows a
Catmull-Rom curve through its values for seeds k−1, k, k+1, k+2, so a re-deal never jumps or stops dead.

- **Blend:** how long each re-deal takes, in seconds. The picture holds still for the rest of the
  period; when blend ≥ reseed it never holds, it just keeps flowing.
- **Fast reseeds stay continuous:** under 6 s each deal moves only T/6 of the way (on top of a slow
  deal every 9 s), so the picture changes at the same rate whatever the reseed; a short reseed makes the
  motion wigglier, not faster. The pen breaks and line directions speed up by √(6/T) to keep pace.

- **Jitter:** the distance to each trap line is wobbled by noise, d ↦ |d + j (n(18p) − ½)|, so lines
  shake like a pen (or crackle like lightning).
- **Breaks:** a coarser noise lifts the pen, so strokes break into dashes and scraps.
- **Colour:** each stroke has its own random hue from the seed, so neighbours clash.

Try: reseed 0.1 for a constant shimmer; reseed 120 with blend 30 for a slow, long re-deal; jitter 1.5 for lightning.

---

## 42. Kali Drape, annotated

File: `src/sketches/kaliDrape.js`

Kali Silk woven into cloth. The noise field that picks each patch's c and α is also the cloth's height:

    H(z) = fbm(0.6 z + 1.6 q(z)),   q(z) = fbm(0.6 z + v t)

(noise warped by noise, so the folds bunch and twist instead of rolling in even waves). From H:

- **Folds pull the threads:** z ↦ z + k ∇H, so the threads bunch in the folds like real fabric;
- **The cloth is lit:** its normal is (−∇H, 1), a light circles overhead once every 23 s, giving a soft
  shade plus a narrow sheen;
- **Iridescent sheen:** the highlight's colour comes from the slope direction, so it shifts through
  the rainbow as the folds move;
- **Warp and weft:** a second layer of threads runs a quarter turn round in its own hues, and the brighter
  of the two lies on top, like over-and-under weaving.

Try: weave 0 for Silk with folds; folds 2.5 and sheen 2.5 for crumpled satin.

---

## 43. Mocalocky, annotated

File: `src/sketches/mocalocky.js`

A cartoon, not a line fractal: seven jelly blobs hop to a chant at 112 bpm, two beats a word, then a
beat of wobble:

| word | hop |
|---|---|
| ne-ka | two small hops, one per beat |
| noo-ka | one big, long hop over both beats (the "oo" is long) |
| noc-ka | two sharp, higher hops |

Each blob belongs to one word, so the hopping goes round the group.

**Cartoon physics, all closed-form in t.** A hop is a parabola, y = 4A·u(1 − u). Squash and stretch
keeps the area: x is scaled by (1 + s) and y by 1/(1 + s), squashed on landing and stretched in the air.

**Metaballs.** The blobs are one field F(p) = Σ (r_i²/|q_i|²)², drawn where F > 1, so neighbours melt
together when they touch. For the outline, f = F^(−1/4) equals |q|/r for a lone blob, so (f − 1)/|∇f| is
a true distance to the edge, which gives an even outline.

**Toon shading.** Three flat bands of light, a hard white highlight and a thick outline. Inside each
blob is Kali's fractal in the blob's own squashed coordinates (so the pattern squashes with it), and
every "nocka" deals it a new c.

Try: goo 2 for one big melting slime; bounce 2 for silly jumps; outline 0 for a softer look.

---

## 44. Kali Ink, annotated

File: `src/sketches/kaliInk.js`

Kali Scribble (§41) with the smooth wobble swapped for a nervous hand, and paper that moves:

- **Scratchy strokes (fBm):** the jitter noise is three octaves, fbm₃(p) = ½n(p) + 0.3n(2.13p) + 0.2n(4.37p),
  so the edge of a line is jagged at several scales instead of one smooth wave.
- **Hand fatigue:** step i's jitter is scaled by (1 + 0.15 i), so the fine detail of the deep steps
  shakes more than the big early strokes.
- **Ink bleed (`bleed`):** each colour channel gets its own small noise nudge on the distance d, and
  green/blue spread a little wider, so the dye separates at stroke edges like fountain-pen ink in paper.
- **Line boil (`shudder`):** every pixel's z gets a sub-pixel offset hashed from floor(12 t), so the whole
  drawing twitches 12 times a second, like hand-drawn animation traced afresh each frame.
- **Breathing paper (`breathe`):** a slow, low-frequency fBm warp is added to z before the loop, so the
  sheet gently swells and drifts under the lines.

Try: shudder 0, bleed 0, breathe 0 to get Scribble back (apart from the scratchier edges); jitter 1.5 with
shudder 4 for a very shaky hand; bleed 3 for wet ink.

**The lens.** The finished drawing I is then filmed through a dirty lens. The brightest strokes (the
jets) are picked out as B, and everything optical is made from B and added as light L:

    out = 1 − (1 − I) e^(−L)

so it never blows out to white, and with L = 0 (`optics` 0) the picture is exactly as above.

- **bloom:** B blurred at 1/2, 1/4 and 1/8 size, with a red fringe (film halation).
- **spikes:** twinkling glints on the jets, each with six spikes like light through a hexagonal iris; a
  spike runs white, then rainbow toward its tip (red diffracts further than blue).
- **streak:** B smeared far sideways and tinted blue, the anamorphic-lens look.
- **rays:** B smeared toward the centre, fading as it goes (god rays).
- **ghosts:** reflections between lens elements land at c + κ(c − z) through the screen centre c, so B
  is sampled at a few κ (−0.55, 0.4, 1.25, …), each colour channel with a slightly different κ; plus a
  rainbow halo ring.
- **dirt:** hexagonal bokeh specks and smudges on the glass, visible only where bloom or ghosts light them.
- **aberration:** red and blue land a little apart, more toward the edges.

Try: optics 0 for the bare drawing; streak 3 and everything else 0 for a sci-fi lens; dirt 3 for a
greasy phone camera.

---

## 45. Kali Pearls, annotated

File: `src/sketches/kaliPearls.js`

A Kali fractal where a stroke that closes into too round a ring gets caught and frozen into a **pearl**.

- **The base (`base`):** the fractal underneath is Kali Tangle (§39, the default), Kali Ink (§44), Kali Drift
  or Kali Silk, each exactly as in its own sketch. Some dials only matter for one base: `chaos` for Tangle,
  `warp` for Silk, and `reseed`, `blend`, `jitter`, `bleed`, `shudder`, `breathe`, `breaks` for Ink. Tangle's
  random circle traps make rings of their own, so it throws up pearls readily.

- **Finding rings:** twice a second the picture is blurred, and for every point c and six radii r
  (0.07·1.4ʲ, j = 0..5) it is sampled at 24 angles round the circle |z − c| = r, plus inside (½r) and outside (1.5r).
  With μ the mean round the circle, b the background (the inside, or the inside/outside average if that
  is brighter: the middle must be dark, busy surroundings count half), and f the share of the 24 angles that
  are clearly ink, the score is S(μ − b)·S(μ/b)·f² (S = smoothstep): a bright ring that stands out and has
  no gaps scores near 1. The best spot above `roundness` becomes a pearl: that disc of the picture is
  copied out and stays that shape while the ink keeps changing.
- **Flowing around it:** the ink moves out of the way like an incompressible fluid,
  |z′ − c|² = |z − c|² − R². That squeezes the outside of the disc onto the whole plane and keeps areas
  equal (π r′² = π r² − π R²), so nothing disappears, it just bunches up at the rim.
- **Winding (`swirl`):** the direction of z − c is also turned by `swirl` · age · R²/|z − c|², strongest
  at the rim and growing as the pearl ages, so the strokes wrap round it.
- **Going away (`hold`, `vanish`):** a pearl stays full size for `hold` seconds, then its radius
  shrinks to 0 over `vanish` seconds (fading in the second half) and the flow closes up behind it.
- **`pearls`:** how many can exist at once (0 turns it back into the plain base).
- **Contact light (`contact`):** strands that pass close to a pearl (within 1.7 radii) light up in the colour
  of the pearl's nearest edge, in ripples running outward, sin(60 s − 4t) with s the distance from the rim.
  Only strands light up, not the backdrop, and the light is added as 1 − (1 − I)e^(−L) so it never clips.
- **Glass (`glass`):** inside a pearl the strands behind it still show, magnified like a lens:
  z′ = c + d (0.55 + 0.25 |d/R|²). `glass` 0 is the plain frozen snapshot; 1 lets every strand shine through.
- **Riding (`ride`):** each base maps the screen into its fractal's plane as p = zoom · R₋θ (z + pan(t)). A pearl
  remembers its point P in that plane, so it is carried along like the strands around it:
  c(t) = R_θ P / zoom − pan(t), turning by θ − θ₀ and scaling with the zoom (kept within 0.6–1.4×).
  `ride` 0 leaves only the pearls' own motion (below).
- **Bouncing (`drift`, `bounce`):** each pearl is launched at speed `drift` in a direction hashed from the time
  it was caught, and glides on top of the riding. Pearls are discs with mass m ∝ R². When two touch they are
  pushed apart (the lighter one moves more) and, if they are closing, swap momentum along the line of
  centres n with the impulse j = −(1 + e)(v_b − v_a)·n / (1/m_a + 1/m_b), e = `bounce` (1 = perfectly
  elastic). The screen edges bounce them back the same way. Each hit squashes the pearl along n,
  d ↦ d + s n (n·d) with s = 0.22·e^(−7t)·cos 22t (a damped wobble), and flashes it. Hits lose a little
  speed, so each pearl's speed eases back to `drift` over about 3 s and they never run down.

Try: base Kali Silk for big soft bubbles; chaos 1 on Tangle for a wilder tangle to catch rings in;
roundness 0.4 for lots of pearls; hold 0 and vanish 10 for pearls that start shrinking at once;
swirl 1.5 for whirlpools; glass 1 and contact 3 for pearls that glow through the tangle;
pearls 6, roundness 0.4, drift 0.5 and hold 20 for a table of marbles.

---

## 46. Kali Accretion, annotated

File: `src/sketches/kaliAccretion.js`

Kali Pearls (§45) under gravity: the same base, ring finder, flow, contact light, glass and riding, but the
pearls fall together and **merge** instead of bouncing.

- **Gravity (`gravity`, `attract`, `drag`):** every pearl is pulled toward the centre of the screen with a
  softened pull of nearly constant strength, −g c/√(|c|² + 0.04), and toward every other pearl with
  `attract` · m_j (c_j − c)/(|c_j − c|² + 0.01)^(3/2), with m = (R/0.2)² (so a middling pearl weighs 1). Drag
  slows them by e^(−drag·t).
- **Orbits (`drift`):** a new pearl is launched sideways at speed `drift` (clockwise or anticlockwise, hashed from
  the time it was caught). It falls into a decaying orbit and spirals in.
- **Merging:** only small rings are caught (r ≤ 0.19). When two pearls touch they become one, keeping
  mass (R = √(R_a² + R_b²), up to 0.5), momentum (the centre and velocity are mass-weighted) and angular
  momentum: with I = ½ m R² and L the pair's orbital angular momentum about the new centre, the merged
  pearl spins at ω = (I_a ω_a + I_b ω_b + L)/I. A head-on hit barely turns it; a glancing one sets it spinning.
- **What it swallowed:** both pictures, each as it was shown (spin and swirl included), are copied into one
  new snapshot. Each point comes from whichever pearl it is nearer to, measured in that pearl's own radii,
  and points outside both are folded back in through the nearer rim. After a few merges the core is a
  mosaic of everything it has eaten. The merged pearl starts stretched along the line of impact, as long as
  the pair was, then wobbles round (d ↦ d + s n (n·d), s = s₀ e^(−5t) cos 12t).
- **Inner swirl (`churn`, `viscosity`):** besides its rigid spin ω, each pearl has an inner swirl Ω. The
  snapshot at radius r (in pearl radii) is turned by φ(r) = ∫ω + (1 − r²)² ∫Ω, so the core turns further
  than the rim and the picture inside winds into a spiral. A merge sets
  Ω = Ω̄ + churn · (L/I + ω̄ − (I_a ω_a + I_b ω_b)/I): the parts' own swirl (mass-averaged), plus the hit,
  plus the spin the parts brought in that the bigger whole dilutes. Viscosity damps Ω as e^(−t/viscosity),
  and the spiral freezes in place.
- **Frame dragging:** the ink around a pearl winds at `swirl` + 0.4 ω, so it is dragged round with the spin.
- **Lifetime:** a merged pearl's age is the mass-weighted age of its parts, so a core that keeps feeding stays
  young. After `hold` it shrinks away over `vanish` seconds, as in Kali Pearls.

Try: gravity 0 and attract 0.5 for pearls that find each other wherever they are; drift 0.8 and drag 0.02
for long orbits and glancing hits; churn 5 and viscosity 30 for cores that whirl and whirl; hold 40 for one
big pearl that eats everything; base Kali Silk for soft marbled cores.

---

## 47. Kepler's Pizza, annotated

File: `src/sketches/keplersPizza.js`

A planet orbits a star, and each orbit is cut into K slices, one per equal stretch of time. Kepler's second
law says every slice has the same area, πab/K, however long and thin or short and fat it looks.

- **Where the planet is:** the mean anomaly M = 2πt/T grows evenly with time. Kepler's equation
  M = E − e sin E gives the eccentric anomaly E; there is no formula for E, so `solveE` runs Newton's method,
  E ← E − (E − e sin E − M)/(1 − e cos E), which converges in a handful of steps. Then x = a(cos E − e),
  y = b sin E (the star sits at the origin, the focus), and r = a(1 − e cos E).
- **Why equal M means equal area:** the area swept from perihelion is (ab/2)·M, a straight line in M. So the
  cuts at M = 2πk/K split the ellipse into equal slices. Checked numerically: 12 slices agree with πab/12 to 6
  digits for e = 0, 0.3, 0.55 and 0.75.
- **The slices on the GPU:** each vertex carries (k, u, rim). The vertex shader solves Kepler's equation for
  M = 2π(k + u)/K itself, so changing e or a only changes two uniforms. The fragment shader fills slices whose
  k + u is less than `uSwept` = KM/2π.
- **The flight plan:** units are the Sun's (AU, years), where Kepler's third law is T² = a³. Each orbit starts
  at perihelion q = 1 AU, where the engine fires along the motion. That keeps q and changes e; the speed there
  is v_p = 29.78 √(1 + e) km/s, and Δv is the difference. a = q/(1 − e), so the e = 0.75 orbit has a = 4 and
  takes T = 8 years. Retro burns bring it back to a circle, so the loop is a flight you could actually fly.
- **The joke (bit.js):** the area of each slice in large (14-inch) pizzas: 1 AU² = 2.25 × 10²³ of them.
  The caption reads the sign of ṙ = e sin ν √(GM/p) with `mood()`.

Try: slices 24 to see how thin the far slices get; speed 0.3 to watch the planet whip round perihelion.

---

## 48. Brusselator Dish, annotated

File: `src/sketches/brusselatorDish.js`

The Brusselator is a made-up but legal chemistry (four reactions, from Prigogine and Lefever in Brussels,
1968). It is the smallest one that can both draw a pattern and keep time:

    ∂ₜu = a − (b + 1)u + u²v + D_u ∇²u        (u: activator)
    ∂ₜv = b u − u²v + D_v ∇²v                 (v: inhibitor)

- **Two thresholds, both exact:** the well-mixed state u = a, v = b/a starts oscillating (Hopf) when
  b > b_H = 1 + a², and grows a stationary pattern (Turing) when b > b_T = (1 + a/√d)², with d = D_v/D_u.
  Turing needs the inhibitor to spread faster than the activator (d large): at d = 8, b_T = 2.91; at d = 1,
  b_T = 9 and only the oscillation is possible.
- **The predicted spacing:** linearise about the steady state with a wave e^{ikx + σt}. `fastest()` scans k for
  the largest growth rate Re σ, and the readout shows 2π/k_max. Near onset it is λ_c = 2π/√(a/√(D_u D_v)).
- **The measured spacing (`measure`):** twice a second the middle 128 × 128 cells are read back from the GPU,
  multiplied by a Hann window (so the square's edges don't add fake frequencies), Fourier-transformed with a
  small radix-2 FFT, and the power is summed in rings of equal |k|. The peak ring gives λ. Theory and dish
  agree to within a few percent (7.1 vs 7.0 at b = 3.6, 6.8 vs 6.7 at b = 4.6).
- **Molecular noise:** every step adds η√dt of random noise to u. Without it, the stirring at the start decays
  below float precision long before b crosses b_T, and patterns could only creep in from the wall.
- **Pacemakers:** three specks where b is 0.6 lower. In the oscillating dish they cycle faster (period 3.7
  against 5.1), so their neighbours follow them, and rings spread outward. When d goes back up, the Turing
  pattern grows through the rings and freezes them in place.
- **Numerics:** explicit Euler, dx = 0.5, dt = 0.006 (diffusion is stable up to dx²/(4 D_v) = 0.0078),
  no-flux circular wall, float32 textures ping-ponged on the GPU, like Belousov–Zhabotinsky.
- **The lighting:** u is drawn as a height field: normals from its gradient, a diffuse light and a specular
  highlight, so the spots look like glossy beads.

Try: palette Ink for a printed look; speed 0.3 during the d → 8 ramp (around 6–8 s into the loop) to watch the
rings freeze.

---

## 49. Earworm SIR, annotated

File: `src/sketches/earwormSir.js`

The SIR epidemic model (Kermack and McKendrick, 1927), with a song instead of a germ. s, i, r are the shares of
the crowd who haven't heard it, are humming it, and are sick of it (immune). Time is in units of 1/γ, the
average humming spell:

    ṡ = −R₀ s i,    i̇ = R₀ s i − i,    ṙ = i

- **The peak:** i̇ = i(R₀ s − 1), which is zero exactly when s = 1/R₀. So the humming peaks when the share still
  unexposed drops to 1/R₀, the herd-immunity threshold. The tick inside the ring marks that moment on the ODE.
- **The final size:** divide ṡ by ṙ to get ds/dr = −R₀ s, so s = s₀ e^{−R₀ r}. At the end i = 0, so r = 1 − s_∞
  and ln(s₀/s_∞) = R₀(1 − s_∞). `finalSize` solves that with Newton's method. Below R₀ = 1 the only
  solution is the trivial one: no outbreak.
- **The crowd is not the ODE:** `outbreak()` runs Gillespie's algorithm. Total rate = R₀ S I/N (passing it on)
  + I (getting sick of it); the time to the next event is exponential with that rate, and which event happens
  is picked in proportion. Anyone can meet anyone (well mixed), as the equations assume, so the arcs jump
  across the crowd. With 3000 people the final size lands within a few hundredths of the formula, and the s at
  the peak scatters around 1/R₀ by a few hundredths.
- **The ring:** the outbreak's timeline, clockwise from the top. The gold band is the crowd's i(t), the white
  line is the ODE (RK4). The long tail of stragglers is cut off (see `shownDays`) so the interesting part fills
  the ring.
- **The joke (bit.js):** total humming, ∫ I dt days × 3 hours a day, in Eurovision finals (4 hours each). The
  caption reads the sign of di/dt with `mood()`.

Try: watch the R₀ = 0.9 outbreak: the ten seeds start short chains, and every chain dies out.

---

## 50. The fractal family on aiship, and the modern branch

Almost every fractal here is the same idea: **repeat one simple step many times, and colour each point by
how its orbit behaves.** They differ in what the step is and in what "behaves" means.

**1. Escape-time sets (2D).** Iterate z ↦ f(z) + c and ask whether z runs off to infinity.
- *Mandelbrot / Julia* (`radian628Julia`, the Life-Warped and Polar variants): f(z) = z². Colour is the
  smooth escape count ν = n + 1 − log₂ log|z|.
- *Newton Fractal*: here the step is Newton's method on z³ − 1, and the question is *which root* the orbit
  falls into. The boundaries between the three basins are fractal because every boundary point touches
  all three basins.

**2. Fold-and-scale sets (the "Radian628" family).** The step is a mirror fold |p| followed by shift, scale
and turn: p ↦ s·R_θ(|p| − c), plus a small warp by an integral of sin. Mirrors make symmetry; the scale
makes it repeat at every size. Variations swap the straight mirror for a curved one (Shape Mirror), a
prism of mirrors (Prism Mirror), log-polar coordinates (Log Spiral), or several frequencies (Multi-Freq).
*Menger Sponge* and the old *Radian628 — Raymarched* are the 3D version: fold, sort the axes, scale.

**3. Fold-and-invert sets (the Kali family).** Kali's set adds an inversion: p ↦ |p|/|p|^α − c. The
inversion pulls the outside in and throws the inside out, which is where the lace and the jewels come from.
Its orbits never escape, so instead of an escape count the colour comes from *orbit traps*: how close the
orbit came to some curve, and at which step. Kali Drift moves c, α, θ and zoom quasi-periodically (never
repeating). Tangle randomises the mirror per step, Silk makes c and α fields over the screen, Scribble/Ink
draw it as a hand would, Drape weaves it into cloth, and Pearls/Accretion catch round rings and give them
physics. Mart and Run walk through it in 3D.

**4. Power sets in 3D.** The *Mandelbulb* raises a 3D point to a power in spherical coordinates
(z ↦ z^p + c) and ray-marches it with a distance estimate. Lovely, but it was the 2009 state of the art.

**What "modern" means in this scene (2010–2021), and the two new sketches:**
- **Distance estimates everywhere.** Instead of only asking "in or out?", carry the derivative along the
  orbit and get the distance to the set. It gives sharp filaments in 2D and makes ray marching, soft
  shadows and ambient occlusion possible in 3D.
- **Box and sphere folds** (the Mandelbox, Tglad 2010) replaced the power formula. They are made from
  conformal folds, so the distance estimate is exact in the limit and the shapes look architectural.
  → *Mandelbox* (§52).
- **Perturbation deep zoom** (SuperFractalThing 2013, Kalles Fraktaler, rebasing by Zhuoran 2021). One
  exact reference orbit, and every pixel only tracks its difference from it, so a GPU's 7-digit floats go
  30+ decades deep. → *Perturbation Dive* (§51).
- **Kaleidoscopic IFS** (Knighty 2010): fold into one wedge of a symmetry group, turn, scale toward a
  vertex. → *Kaleidoscopic IFS* (§53).
- **Kleinian limit sets** (Mumford, Series & Wright, *Indra's Pearls*, 2002): the fractal curve where the
  orbits of a group of Möbius maps pile up. → *Kleinian Necklace* (§54).
- **Hybrids** (Mandelbulber, Mandelbulb 3D, from about 2011): alternate two formulas step by step.
  → *Hybrid Fractal* (§55).
- **Pseudo-Kleinian sets** (Knighty 2011, after Jos Leys): the 3D cousin of the Kleinian limit sets, made
  with folds instead of a search. → *Pseudo-Kleinian* (§56).
- Also out there, not built yet: path-traced lighting.
- **Every 2D formula in one place, explained dial by dial:** → *Fractal Lab* (§57).

---

## 51. Perturbation Dive, annotated

File: `src/sketches/perturbationDive.js`

- **Why ordinary deep zooms die:** a float32 has about 7 significant digits. At width 10⁻⁵ neighbouring
  pixels have the same c and the picture turns to blocks. float64 lasts to about 10⁻¹³.
- **Perturbation:** for a reference point c₀ with orbit Zₙ and a pixel c = c₀ + δc, subtract the two
  recurrences: δ_{n+1} = 2Zₙδₙ + δₙ² + δc. Exact. δ is as small as the screen (10⁻³⁰ at the bottom), and
  float32 stores small numbers fine: its *range* goes to 10⁻³⁸ even though its *precision* is 7 digits.
- **Rebasing:** if |zₙ| < |δₙ| the orbit has come near 0, where the reference is a bad guide. Restart the
  reference at Z₀ = 0 with δ := zₙ (one line in the shader).
- **A Misiurewicz point as the reference:** c₀ = M₅,₂ is a point whose critical orbit becomes periodic
  after 5 steps: Z₇ = Z₅. So the reference is 7 numbers, computed in JavaScript by Newton's method on
  (Z₇ − Z₅)/(Z₆ − Z₄) (dividing by the lower-preperiod version removes the roots we don't want), and the
  index wraps 7 → 5 forever.
- **Self-similarity (Tan Lei, 1990):** near a Misiurewicz point, the set looks like itself scaled by the
  cycle's multiplier λ = (f²)'(Z₅) = 2Z₅·2Z₆ ≈ 1.906 e^{122°i}. Zoom ×1.906 and turn 122°: same picture.
  With `co-rotate` on, the camera turns by arg λ / ln|λ| per e-fold of zoom, and deep down the picture
  stands still.
- **Iterations needed:** a pixel at distance w from c₀ escapes after about k + p·ln(1/w)/ln|λ| steps, so
  10⁻³⁰ needs only ~300. That's why it runs on a phone.
- **Shading:** smooth escape count through a palette; distance estimate |z| ln|z| / |dz/dc| for the glowing
  filaments; the "normal map" light from the direction of z/(dz/dc). The derivative is carried pre-scaled,
  D = width·dz/dc, so it never overflows float32.
- **The joke:** if the whole set were as wide as the observable universe (8.8 × 10²⁶ m), the screen at the
  bottom is under a millimetre wide.

Try: co-rotate on, then watch from about 20 s in: the star stops turning.

---

## 52. Mandelbox, annotated

File: `src/sketches/mandelbox.js`

- **The step:** box fold (each coordinate past ±1 is mirrored back: x ↦ 2 clamp(x, −1, 1) − x), sphere fold
  (inside r_min = 0.5 scale up by 4; between 0.5 and 1 invert, p ↦ p/|p|²), then p ↦ s·p + c.
- **Distance estimate:** both folds scale space locally by a known factor, so carry it: dr ↦ k·dr for the
  sphere fold, dr ↦ |s|·dr + 1 for the scale. DE = |p|/|dr|. A ray can safely step forward by DE.
- **The bound shown live:** for |s| > 1 the set is guaranteed to sit inside |x| ≤ 2(|s|+1)/(|s|−1). It is
  a loose bound: for the sweep used here the set fills the cube |x| ≤ 2 (checked by escape along the axes
  and diagonals), which is what the camera frames.
- **The loop:** s = −2.4 − 0.5 cos(2πt/T), from crystalline (−2.9) to open chambers (−1.9), while the
  camera circles and swings in to the faces.
- **Lighting:** normals from four DE taps (a tetrahedron), soft shadows (march toward the sun and keep the
  smallest 10·d/t: a near miss gives a penumbra), five-tap ambient occlusion along the normal, colour from
  orbit traps (closest approach to the origin and to the axes), fog, ACES tone mapping.

Try: palette Night for glowing seams; speed 0.3 to watch the chambers open.

---

## 53. Kaleidoscopic IFS, annotated

File: `src/sketches/kaleidoscopicIfs.js`

- **The step:** p ↦ s·R_θ·F_G(p) − (s − 1)v. F_G folds space into one wedge (the fundamental domain) of a
  polyhedron's mirror group G, R_θ turns it, and the scale pulls everything toward the corner v.
- **The fold (Knighty's):** repeat k times: x ↦ |x|, y ↦ |y|, then reflect across the plane with normal
  n = (−½, −cos(π/k), √(¾ − cos²(π/k))) if p is on its negative side. k = 3, 4, 5 gives the tetrahedral,
  octahedral and icosahedral groups (24, 48, 120 elements, counting mirror images). Checked: it keeps |p|,
  folding twice is the same as once, and the corners' orbits have the polyhedra's vertex counts
  (4, 6, 12 vertices; 4, 8, 20 face centres).
- **Why it's an IFS:** every vertex of the polyhedron folds onto v, and the step then shrinks toward v. So one
  step makes N copies of the whole, one per vertex, without testing N maps.
- **Symmetry for free:** F_G(g·p) = F_G(p) for every g in G, so the shape has the full symmetry whatever θ is.
- **Dimension:** N copies at 1/s give D = ln N / ln s when they don't overlap (Moran's open set condition), and
  at most that otherwise. The loop starts each flake where the copies just touch: Sierpinski tetrahedron
  (N = 4, s = 2, D = 2), octahedron flake (6, 2, 2.585), icosahedron flake (12, 1 + φ, 2.582), dodecahedron
  flake (20, 2 + φ, 2.330). Then θ swings out and back, and s grows 12% so the turning copies pull apart.
- **Cross-fade:** at θ = 0 one flake turns into the next by blending the two distance estimates.
- **Colour:** "Thin film" tints by viewing angle (like a soap bubble) plus the orbit trap.

Try: palette Ice; speed 0.3 on the icosahedron flake to see the 12 copies turn.

---

## 54. Kleinian Necklace, annotated

File: `src/sketches/kleinianNecklace.js`

- **Möbius maps:** z ↦ (αz + β)/(γz + δ), stored as 2×2 complex matrices with determinant 1; composing maps is
  multiplying matrices. Two of them, a and b, and their inverses A, B generate a group: every word like abAAb
  is a member.
- **The limit set Λ:** for a discrete group, the orbit of any point piles up on the same set. Here it is a
  closed fractal curve (a quasicircle).
- **Grandma's recipe:** choose the traces t_a = tr a and t_b = tr b; then t_ab comes from
  t_ab² − t_a t_b t_ab + t_a² + t_b² = 0, and the recipe writes down a and b so that the commutator abAB has
  trace −2 (parabolic), which makes the curve close up. The readout recomputes tr(abAB) from the matrices.
- **Drawing it by depth-first search:** a branch is a word w ending in a letter g. Apply w to the fixed points
  of three special words ending in g (the two cyclic commutators that end in g, and g itself). When the
  three image points are within ε, draw them as two segments and stop. Children are visited in cyclic order,
  so the segments come out in order along the curve, and the colour runs along it. The search keeps its
  matrices in one typed array (no allocation per word): about 5 ms for 65 000 segments.
- **Staying discrete:** most choices of traces give a non-discrete group and a meaningless picture. The loop
  moves t_a on a closed path with t_b = conj(t_a), checked in advance: t_a = t_b = 2 gives exactly the
  Apollonian gasket, and along the whole path the search converges and the curve stays bounded.
- **What you see:** near the edge of the discrete region (t_a ≈ 1.87 + 0.1i) the curve coils into double
  spirals; deep inside (≈ 2.1 + 0.3i) it relaxes into a wobbly circle. The second half is the mirror image.
  On wide screens the curve is turned on its side.

Try: palette Ember for a gold necklace.

---

## 55. Hybrid Fractal, annotated

File: `src/sketches/hybridFractal.js`

- **The idea:** instead of repeating one formula, alternate two by a word. B is a Mandelbox step (box fold,
  sphere fold, p ↦ s·p + c); M is a Menger-sponge step (fold into the wedge |x| ≥ |y| ≥ |z|, scale 3 from a
  corner). The orbit is p_{n+1} = W_{n mod L}(p_n). The word W = BBM means two Mandelbox steps, then one Menger.
- **Distance estimate:** both steps are isometries plus uniform scaling, so the running derivative is just
  multiplied by each step's scale (k·|s| + 1 for B, 3 for M) and DE = |p|/|dr| still works, but it is no
  longer exact.
- **Measured, not assumed:** a ray may step by DE/L where L is the DE's Lipschitz constant. Sampling 60 000
  nearby pairs gave L ≈ 1.4 (B), 1.4 (BBM), 1.5 (BM), 1.7 (BMM), so the march steps 0.55·DE (1/1.7 ≈ 0.59).
  The textbook Menger step "if z < −1 then z += 2" jumps, and gives L ≈ 72 in the hybrid: rays would tunnel
  straight through walls. So the M step *folds* z at 1 instead, which keeps the map continuous.
- **The loop:** B (plain Mandelbox, for reference), BBM, BM, BMM, 14 s each, cross-faded. The Mandelbox
  scale breathes between −2.3 and −2.6; every word's set stays in |x| ≤ 2 (escape-tested).
- **Ownership colour:** each kind of step keeps its own orbit trap (closest approach of its outputs to the
  origin). ln(t_B/t_M) decides copper (Mandelbox owns this part) or steel blue (Menger owns it).
- **Readout:** |dr| grows at least |s|^(number of B) · 3^(number of M) per pass through the word.
- **The joke:** the caption is a custody schedule: how many steps each formula gets per word ("week").

Try: palette Night for glowing seams where the two formulas meet.

---

## 56. Pseudo-Kleinian, annotated

File: `src/sketches/pseudoKleinian.js`

- **The group:** reflections in the six faces of a box |x_j| = C_j, plus inversion in a sphere |p|² = S. These
  are Möbius maps of 3D space, so they generate a Kleinian group, and its limit set is the lace you fly through.
- **The lattice for free:** reflecting in x = C and then in x = −C is a translation by 4C. So the group contains
  a whole lattice, and one jump p ↦ p − 4C⌊p/4C⌉ replaces any number of box folds (checked against 200 repeated
  folds: same point to 3 × 10⁻¹⁵). That's why the structure is infinite.
- **The fold:** repeat: reflect into the box (2 clamp(p, −C, C) − p), invert if inside the sphere
  (p ↦ p·max(S/|p|², 1)). Then measure the folded point against a seed (a disc and its axis) and divide by the
  product of the inversion factors.
- **Why the DE is trustworthy:** inversion is conformal (it scales every direction by the same S/r², checked by
  finite differences), so dividing by ∏k is exact bookkeeping. The DE's measured Lipschitz constant is 1.65, so
  rays step 0.55·DE.
- **Why "pseudo":** "invert if inside" is a fold, not a proof that the point reached the group's fundamental
  domain. The picture has the group's exact symmetry but is a look-alike of the true limit set.
- **The flight:** the camera moves exactly one lattice period 4C_x per 40 s loop, so the end looks identical to the
  start and the loop is seamless. The corridor y = C_y, z = C_z was found by searching for the parallel line
  with the most clearance. The camera weaves around it and keeps DE ≥ 0.57 (checked at 2000 points). The DE at
  the camera is computed live in JavaScript.
- **Rendering for density:** glowing filaments where the orbit skimmed the box planes (orbit traps), glow
  accumulated along each ray, hue that shifts with depth so each wall of rings has its own colour, a headlamp,
  rim light and ambient occlusion.

Try: palette Abyss for silver-and-gold lace, Ember for bronze.

---

## 57. Fractal Lab: every dial, in plain words

File: `src/sketches/fractalLab.js`

One fractal with as many controls as would fit, built to be understood. Open **Params**: the dials are in
seven groups, and every one has a sentence under it saying what it does. The preset buttons at the top
(Kali lace, Classic Mandelbrot, Julia spirals, Burning ship, Kaleidoscope, Surprise me) jump to good
starting points.

**The one idea behind all of it.** Every pixel is a starting point. A rule is applied to that point over
and over, so it takes a journey: p₀ → p₁ → p₂ → … The pixel's colour is one fact about that journey.
Points right next to each other can take completely different journeys, and that is where the endless
detail comes from.

**See a journey.** Tap anywhere on the picture. The white dot is where that point starts; each coloured dot
is one more step of the rule, and the lines join them in order. The equation panel writes out the first
steps as numbers (computed with the same rule as the picture) and says whether the point ran off to
infinity ("escapes at step 7") or stayed. Drag to watch the journey change as the start moves.

**1 · Shape: the rule**
- *Formula*: which rule. **Kali**: take absolute values (a mirror that folds everything into one quarter),
  divide by the length squared (which turns the plane inside out around the unit circle: near the centre
  goes far away and far away comes near), subtract c. **Mandelbrot**: square (double the angle, square the
  length), add the pixel. **Julia**: the same, but add a fixed c, and the pixel is where it starts.
  **Burning Ship**: mirror first, then square. **Tricorn**: reflect across the x-axis, then square.
  **Mandelbox 2D**: fold into a box, flip out of a small circle, scale, add the pixel.
- *Power*: how strong the inside-out turn is (Kali), or the exponent (Mandelbrot family: 3 gives three arms).
- *Constant c*: the shift used every step. The single most sensitive dial.
- *Steps*: how many times the rule repeats. More steps, finer detail.
- *Spin per step*: turn the point a little each step, which bends everything into spirals.
- *Kaleidoscope*: cut one pie slice and repeat it around the centre, mirrored.
- *Liquid warp*: ripple the plane before starting.

**2 · Camera**: zoom (log scale: +2.3 is 10× closer), move, turn, drift (the camera wanders by itself),
zoom pulse (breathing), edge smoothing (several samples per pixel, so thin lines stop shimmering).

**3 · Colour: what a colour means**
- *Colour means…*: **closest to axes & circle / a dot / a cross / a ring** colours each point by how close
  its journey came to that shape, called an *orbit trap*. Bright means it passed very close, and the colour
  says at which step. **Escape speed**: for points that run away, how quickly. **Stripes**: the average
  direction the journey pointed. **Final direction**: where it pointed at the end.
- *Depth fade*: later steps count for less, so the big, clean shapes from the first steps show instead of
  fine grain.
- *Backdrop*: a soft wash of colour behind the lines.
- *Trap shape size*, *Line thickness*, *Palette*, *Hue shift*, *Colour spread*, *Colour cycling* (colours
  flow through the shape), *Saturation*, *Brightness* (highlights roll off softly instead of clipping to
  white), *Contrast*, *Invert*.

**4 · Light & depth**
- *Relief*: pretend brightness is height, like a landscape, and shine a light across it from the side.
  Flat colour becomes carved, embossed metal. *Light direction* and *Shine* (glossy highlights) go with it.
- *Glow*: a soft halo around the brightest lines, like neon tubes.
- *Ink outline*: dark lines wherever colour changes sharply, like a comic.

**5 · Lens tricks (just for looks: none of them change the maths)**
- *Colour fringing*: red and blue land slightly apart, more toward the edges, as through a cheap lens or 3D
  glasses. Photographers call this *chromatic aberration*: glass bends each colour by a slightly
  different amount.
- *Dark corners*: the corners are dimmed to pull the eye inward. Called *vignette*.
- *Film grain*: fine flickering noise. *TV lines*: stripes like an old CRT screen.

**6 · Teaching overlays**: *Show a journey* (and how many steps to draw), *Journey starts…* (wandering or
where you tapped), *Show trap* (draws the dot, cross or ring that the colouring measures distance to),
*Show axes & unit circle* (for Kali, points inside that circle get flung outside it).

**7 · Motion**: *Speed* (0 freezes everything), *Auto tour* (c and the power move slowly by themselves).

Small dictionary for the other fractal sketches:
- **Orbit**: the journey of one point under the rule.
- **Escape time**: how many steps until the orbit runs away. The classic Mandelbrot colouring.
- **Orbit trap**: colour by how close the orbit came to a chosen shape.
- **Bloom / halation**: bright areas leak soft light into their surroundings, as in a camera.
- **Ghosts / flares**: faint copies of bright spots, from light bouncing between the lenses of a camera.
- **Diffraction spikes**: the star points on bright lights, from the shape of the camera's aperture.
- **Optics** (in Kali Ink): the master dial for all the camera-lens effects at once.

Try: Classic Mandelbrot, then tap inside the black and outside it, and compare the journeys.

---

## 58. Bristol Specimen, annotated

File: `src/sketches/bristolSpecimen.js`

A stool on the Bristol Stool Form Scale with sweet corn in it. **Tap a kernel** to examine it (the camera
flies in and a card gives its size, mass and whether it's intact or just the empty skin); **tap it again**
to pull it out. It leaves its socket behind. **Tap the stool** for a Gram-stained view at ×1000.
**Scroll or pinch** to zoom, towards wherever the cursor is. Leave it alone for ten seconds and it does all
this by itself.

**The shape is a tube.** Types 2–4 are a centreline that wanders across the floor, with a radius r(s) at
each distance s along it. The front is a rounded cap, r = R√(1 − (1 − s/c)²), which is a quarter circle.
The back is pinched off, r = R(1 − (1 − u)^2.2), which ends in a point. Cracks (type 3) are drawn where a
noise field crosses zero. That field changes faster along the log than around it, so its zero lines run
*around* the log, like real drying cracks. Everything sags: points below a small height w are squeezed up,
y ↦ w·e^{(y−w)/w}, and pushed outward. That's what flattens the bottom into a contact patch.

**Watching it leave.** Every specimen is first *simulated coming out*: it leaves an anus H cm above the floor
(the *Drop height* dial) at v = L/12 s, because mammals of every size take about 12 seconds (Yang et al., 2017).
The log is a chain of points 4 mm apart: gravity pulls them, each pair keeps its spacing, and extra links over
2, 4 and 8 points stop it bending. The simulation is recorded once and played back, and the mesh rides along on
it: every vertex is stored as "this far along the log, this far round it", so the same mesh can hang, fall and
lie down. The last frame is the specimen you then examine.

**Firmness is one number: the yield stress τ_y.** Below τ_y the stuff behaves like a solid, and above it, it
flows like toothpaste. τ_y drops steeply with water: here τ_y = 1.5 kPa·e^{−(w − 76%)/1.5%}, so every extra 1.5%
of water divides it by e ≈ 2.7. That exponential is a model, not a measurement. Try the *Extra water* dial. Three
things follow from τ_y:
- **When it tears off.** The part hanging from the anus pulls on it with a stress of ρgΔy (its weight per unit
  area, with Δy the height it hangs). It tears when that reaches √3·τ_y, so anything hanging more than
  ℓ_tear = √3τ_y/(ρg) breaks off (a length, shown as ℓ_tear in the equation). That's 25 cm for type 4 but only 6.7 cm with 2% more water.
- **How tall it can stand.** A heap of yield-stress material can't be taller than h_pile = 2τ_y/(ρg), so a soft
  blob slumps until it is that tall. It keeps its volume by spreading sideways. The same goes for a pile of
  folds: a bit of log lying on another bit, with its top above h_pile, flows off sideways.
- **How it lands.** A stiff log topples like a stick. A soft one folds, and it stays folded, because once a bend
  goes past the yield point the bent shape becomes its new resting shape.

Two things keep the landing honest. The push is a pressure, not a piston: if the part that's already out is
jammed against the floor and squeezed along its length, the feed slows down (to a stop if it has to) until the
log bends out of the way. And the anus isn't a rigid clamp: the canal's direction swings towards wherever the
log leaves it (up to 35°), so a stiff log can pivot and topple instead of being pinned between the body and
the floor. Inside the canal it moves as a plug: a yield-stress material in a mucus-lined tube slides as one
solid piece, with all the shear in the thin wall layer, so corn kernels ride along without turning.

**Sockets.** Each kernel gets a hole carved to its shape before it's put in. Every surface point inside
the kernel's ellipsoid is moved inward along the surface direction −n, to where that line leaves the
ellipsoid. It's the same quadratic as a ray hitting a sphere, after scaling the ellipsoid into a sphere.

**Volume without a formula for the shape.** The divergence theorem says V = ⅓∮ x·n dA: add up, over every
triangle, a third of (position · normal) × area. In code that's one line per triangle,
`v += a.dot(b.cross(c)) / 6`, which is the signed volume of the tetrahedron from the origin to that
triangle. It works for any closed mesh, sockets and all.

**Cooling.** Newton's law with "lumped capacitance": the whole thing is treated as one temperature T,
so ρcV·dT/dt = −hA(T − T_air), which gives T = T_air + (37 − T_air)e^{−t/τ} with τ = ρcV/(hA). The
Biot number Bi = h(V/A)/k checks that assumption: it's fine when Bi ≪ 1, and here it's about 0.1, so
it's a fair estimate.

**Why corn survives.** The kernel's skin is cellulose: glucose joined by β(1→4) bonds. Human enzymes only
cut the α kind (starch). So the skin comes out whole, sometimes with the starch inside it digested away,
which is the "empty hull".

**Why some float.** Gas, not fat (Levitt & Duane, 1972). With ρ = 1.07(1 − φ), it floats once φ > 6.5%.
Try the *Gas fraction* dial.

| LaTeX | You write | Means |
|---|---|---|
| `\oint` | `\oint` | integral over a closed surface (or loop) |
| `\varphi` | `\varphi` | phi, here the gas fraction |
| `\beta(1{\to}4)` | `\beta(1{\to}4)` | the bond type in cellulose |
| `\tau_y` | `\tau_y` | tau sub y: the yield stress |
| `\sqrt3` | `\sqrt3` | square root of 3 (braces optional for one digit) |
| `\ell_{\text{tear}}` | `\ell_{\text{tear}}` | script l: the hanging length at which it tears off |
| `h_{\text{pile}}` | `h_{\text{pile}}` | the tallest a heap of it can stand |

### The explorer: cutting, heat, the microscope, A/B and the instruments

The **Instruments** panel (top left; a pill at the bottom on phones) holds everything below. Every number in
it carries a badge. **SIM** means it was computed from this specimen's mesh or simulation. **MODEL** means it
comes from an assumed relation, like the yield-stress exponential. **REF** means it was taken from a paper.
Point at a row (or tap it) to see where it comes from.

**Cutting it open.** *Cutaway* slices it with a flat knife; *Knife*, *Turn* and *Tilt* move it. The code
finds where the knife crosses each triangle. Each crossing triangle gives one short segment of the cut's
outline, and segments that share a mesh edge join up, so they chain into closed loops. A loop inside
another loop of the same piece is a hole. The loops are triangulated into the cut face (`section`).
Two numbers come for free:
- **Cut area:** the area of the outer loops, minus the holes.
- **Volume on each side:** the divergence theorem again, but with the origin *on the knife*. On the cut
  face, x·n = 0, so the face adds nothing, and V_kept = ⅙Σ det(a, b, c) over the clipped triangles alone.
  The check V_kept + V_cut = V is in the *Checks* list.

**Gas pockets.** The space is divided into 4.5 mm cubes, with one bubble per cube at a random point in it
and a random radius. The random numbers come from an integer hash that gives the same answers in
JavaScript and in the shader, so the pockets you see are the pockets the readout counts. The radius is
chosen so the bubbles fill a fraction φ of the volume (the *Gas fraction* dial). **Delesse's principle**
(1847): on a random flat cut, the fraction of the *area* that is holes equals the fraction of the
*volume* that is holes, A_A = V_V. The panel samples about 6000 points on the cut and compares. Expect
it within a couple of percent, not exactly: one cut is one sample.

**Heat inside.** The lumped model gives one temperature for the whole thing. The *Heat* view solves the
real heat equation for a long cylinder (logs) or a sphere (lumps) of the local radius R, cooling at its
surface:

θ = (T − T_air)/(37 − T_air) = Σ Cₙ e^{−ζₙ²·Fo} J₀(ζₙ r/R),  Fo = αt/R²,  Bi = hR/k

- **Fo, the Fourier number:** how far the cooling has got. It goes as 1/R², so thin parts cool first.
- **Bi, the Biot number:** how much the surface holds the heat back compared with the inside.
- **ζₙ:** the roots of ζJ₁(ζ) = Bi·J₀(ζ).
- **J₀, J₁:** Bessel functions, the cylinder's version of cos and sin.

The code finds the roots numerically and checks the series against a finite-difference solution (the two
agree to 4 decimals). The shader works out r/R for each pixel from the distance to the nearest piece of
the rope's centreline. The plot shows core, skin, the thinnest core, and the lumped curve.

**Microscope.** Tap the outside, a corn socket, or the cut face (or a gas pocket on it). The smear
changes with the spot: mucus and shed lining cells on the outside, corn skin cells in a socket, more
fibre inside. ×100 / ×400 / ×1000 change the field (1.8 mm / 450 µm / 180 µm across, for an 18 mm field
number). It's a drawing, labelled as one. What's real is the sizes and the count: 0.096 cells/µm³ × 1 µm
in focus × field area.

**A/B.** *Pin as A* freezes this specimen and slides it left. B is a fresh copy with the **same seed**,
so when you change a dial, every difference in the A/B table is caused by that dial.

**Stepping the exit.** The exit was simulated once at a fixed 1/480 s step and recorded at 30 fps, so
⏮ ◀ ⏸ ▶ ⏭ just move through the recording, and every replay is identical. The *Exit simulation* plot shows
kinetic and gravitational energy and the worst stretch of any segment. Bending energy isn't counted, so
a stiff log springing loose from the anus shows as a bump.

**Checks** run on every specimen: finite numbers, closed pieces, volume near the nominal shape, the
isoperimetric inequality A³ ≥ 36πV², no folded surface, the rope not over-stretched, no sinking into the
floor. They do fail at the extremes. A soft log (+5% water) slumps into overlapping sheets, and a stiff log
from a 6 cm drop gets squashed between the floor and the anus. That's the model's limit, and the checks
say so.

| LaTeX | You write | Means |
|---|---|---|
| `J_0(\zeta_n r/R)` | `J_0(\zeta_n r/R)` | Bessel function of order 0 |
| `\zeta_n` | `\zeta_n` | zeta sub n: the n-th root |
| `\text{Fo}` | `\text{Fo}` | Fourier number αt/R² |
| `\det(\mathbf a,\mathbf b,\mathbf c)` | `\det(\mathbf a,\mathbf b,\mathbf c)` | determinant: 6 × the tetrahedron's volume |
| `A_A = V_V` | `A_A = V_V` | Delesse: area fraction = volume fraction |

---

## 59. My notes

Add your own findings, questions and discoveries here.

-
