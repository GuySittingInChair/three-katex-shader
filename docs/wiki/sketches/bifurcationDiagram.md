---
summary: A simple population rule tipping from steady, to repeating, to chaos.
---

# Bifurcation Diagram: in plain English

File: `src/sketches/bifurcationDiagram.js` · Mode: shader · Category: Chaos

**What you see:** a still picture, like a tree lying on its side. On the left, a single bright line. It
splits into two branches, each of those splits again, faster and faster, and on the right the branches
dissolve into a glowing fog with thin dark gaps in it. A thin yellow line slides slowly from left to right
across the picture, and starts again.

**The idea behind it:** imagine a population of rabbits that grows each year, but crowds itself when there
are too many. The *logistic map* is the simplest rule for that:

**next year's population = r × this year's × (1 − this year's)**

Population is measured from 0 (none) to 1 (as many as the land can hold). `r` is how fast they breed.
That is the equation on screen: x₍ₙ₊₁₎ = r xₙ (1 − xₙ). The small n is the year number: "next year's
population (n + 1) is r times this year's (n), times the room left to grow (1 minus this year's)".

Run the rule for many years and see where the population ends up:
- At a modest `r`, it settles on one value: one line.
- Raise `r` and it starts flipping between two values, a boom year then a bust year: the line splits in
  two. This split is a *bifurcation*.
- Raise it more and it cycles through 4 values, then 8, then 16, each split coming sooner.
- Past about r = 3.57 it never settles at all. That is *chaos*: tiny differences in the starting
  population lead to completely different futures.
- The dark gaps inside the fog are "windows" where order briefly returns. The biggest is near r = 3.83,
  where it cycles through 3 values.

So across the picture, `r` goes from 2.4 on the left to 4.0 on the right. Up the picture is the
population. Bright means "the population often lands here".

**Where the data comes from:** no data. Every pixel works it out.

**How it's built:**
- One [fragment shader](../shaders.md). Each column of pixels runs the rule for its own `r`.
- Loops in GLSL (see [Decisions (`if`) and loops (`for`)](../js-decisions-and-loops.md)).
- `smoothstep` for soft dots (see [GLSL basics: reading a shader](../glsl-basics.md)).
- The [cosine palette](../cosine-palette.md), changing with height.

**A tour of the file:**

```glsl
float r = mix(2.4, 4.0, vUv.x);
float x = 0.5;
for (int i = 0; i < 100; i++) {
  x = r * x * (1.0 - x);
}
```

- Line 1: this pixel's column decides `r`. `vUv.x` is how far across the screen the pixel is, from 0 to
  1. At the left edge (`vUv.x` = 0) it is 2.4, and at the right
  edge (1) it is 4.0. `mix` blends between them (see
  [Blending, adding, dimming and gain](../colour-blending-and-gain.md)).
- Line 2: start with the population at half.
- Lines 3–5: `for (int i = 0; i < 100; i++)` repeats what's inside 100 times (`i` counts 0, 1, 2… 99).
  Each time, `x = r * x * (1.0 - x)` works out next year's population from this year's. Run 100 years
  and throw them away. This is the *burn-in*, giving the population time to
  settle into its pattern.

```glsl
for (int i = 0; i < MAX_ITER; i++) {
  if (i >= int(uIterations)) break;
  x = r * x * (1.0 - x);
  float dist = abs(x - vUv.y);
  density += smoothstep(0.006, 0.0, dist);
}
```

- Now run more years, 200 by default (the **Iterations** slider). `break` stops the loop early once
  `i` reaches the slider's value; `int(…)` turns the slider's number into a whole number.
- Each year, check how close the population `x` is to this pixel's height `vUv.y`. `abs` drops the
  minus sign, so above and below count the same.
- `smoothstep(0.006, 0.0, dist)` is 1 when `dist` is 0 and fades to 0 by 0.006. `+=` adds it on. So if it
  lands within 0.006, add some brightness. A pixel that the population visits often ends up bright.

The yellow line:

```glsl
float rHighlight = 2.4 + mod(uTime * uHighlightSpeed, 1.6);
```

It moves right at the "highlightSpeed" slider rate, and `mod` (the remainder after dividing, which counts up and then wraps round like a clock) brings it
back to the left edge after
covering the whole width of 1.6.

**Numbers worth knowing:**
- **3.0**: the first split, the point where one steady population turns into a boom–bust cycle.
- **3.57**: roughly where chaos begins.
- **3.83**: the big window of order, a 3-year cycle in the middle of chaos.
- **300**: years per pixel at most (100 burn-in + up to 200 drawn). Every pixel does this on every frame.
- **About 11 seconds**: how long the yellow line takes to cross, at the default speed (1.6 ÷ 0.15).

**Words on this page:** [logistic map](../glossary.md#logistic-map), [bifurcation](../glossary.md#bifurcation),
[chaos](../glossary.md#chaos), [burn-in](../glossary.md#burn-in), [shader](../glossary.md#shader), [smoothstep](../glossary.md#smoothstep)
