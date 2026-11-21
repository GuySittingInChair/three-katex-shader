---
summary: Walking up the critical line and drawing where the Riemann zeta function lands; it passes through zero at each famous zero.
added: 2026-11-20
---

# Riemann Zeta Zero Hunter: in plain English

File: `src/sketches/zetaZeroHunter.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Number
Theory

**What you see:** a pair of crossed axes, labelled *real* and *imaginary*, and a glowing curve being drawn on
them by a white dot. The curve swoops round in loops, bigger and smaller, and every so often it passes exactly
through the centre, where a gold dot flashes. On the right, a tall line climbs with the hunt; each time the
curve passes through zero, a gold mark appears on it, labelled with its value. Over 40 seconds the hunt goes
from 0 to 50, finding ten zeros, then starts again.

**The idea behind it:** the Riemann zeta function starts life as a simple infinite sum, ζ(s) = 1 + 1/2ˢ + 1/3ˢ +
1/4ˢ + …, which Euler showed is tied to the prime numbers. Riemann (1859) found a way to extend it to *complex
numbers* s (numbers with two parts, written s = a + bi, which can be drawn as points on a flat plane). He
showed that where it equals zero holds the secret of how the primes are spread among the whole numbers.

Besides some easy zeros at −2, −4, −6, …, all the zeros found so far have real part exactly ½: they lie on one
line, the *critical line*. Riemann guessed they all do. That guess, the *Riemann hypothesis*, is perhaps the
most famous unsolved problem in mathematics; a million-dollar prize (one of the Clay Millennium Prizes) waits
for a proof. Computers have checked trillions of zeros, all on the line.

This sketch walks up the critical line, s = ½ + it for t from 0 to 50, and draws where ζ(s) lands. Every pass
through the centre is a zero.

**Where the data comes from:** no data: it is computed. The first ten zeros it finds match the published
values to every one of the six decimals shown.

**How it's built:**
- ζ(s) is computed by *Euler–Maclaurin summation*: add the first 49 terms of the sum directly, then estimate
  the rest of the infinite sum with an integral and 8 correction terms using the *Bernoulli numbers*. (The
  plain sum doesn't work on the critical line: it never settles down.) Checked: it gives ζ(2) = π²/6 to 16
  digits.
- The whole path, 5,001 points, is worked out the first time the sketch opens.
- The zeros are found as sign changes of a real-valued version, Z(t) = e^{iθ(t)} ζ(½ + it) (the
  *Riemann–Siegel Z function*), then pinned down by halving the gap 50 times.

## The equation

- **ζ(s) = Σ 1/nˢ** and **s = ½ + it**: the function, and where we walk.
- **t** and **ζ**: where we are on the line, and the complex value of ζ there (its two parts).
- **Zeros found**: how many so far, and the last three.

## A tour of the file

One term of the sum, nˢ for a complex s, in `npow`:

```js
const npow = (n, s) => { const l = Math.log(n), mg = Math.exp(-s[0] * l), an = -s[1] * l; return [mg * Math.cos(an), mg * Math.sin(an)]; };
```

n⁻ˢ = e^{−s ln n}: the real part of s sets its size (`mg`), the imaginary part turns it round (`an`, an
angle), giving a complex number as [across, up].

The tail of the infinite sum:

```js
const Ns = npow(N, s), tail = cdiv(cmul(Ns, [N, 0]), [s[0] - 1, s[1]]);
```

The terms from N = 50 onwards, added up, are close to the area under the curve 1/xˢ from 50 to infinity: N¹⁻ˢ
/ (s − 1). The Bernoulli corrections that follow fix up the difference.

## Numbers worth knowing

- **14.134725:** the first zero on the line, at s = ½ + 14.134725i.
- **The first ten:** 14.134725, 21.022040, 25.010858, 30.424876, 32.935062, 37.586178, 40.918719, 43.327073,
  48.005151, 49.773832.
- **1859:** the year of Riemann's only paper on number theory, in which he stated the hypothesis.

**Try this (funky):** hunt further. In `zetaZeroHunter.js`, change `const T_MAX = 50,` to `const T_MAX =
100,`. The walk now finds 29 zeros by t = 100 (the last at 98.831194), and the loops get busier as the zeros
crowd closer together. (Found with the sketch's own code; both numbers match the published counts.)

**Words on this page:** [Riemann zeta function](../glossary.md#riemann-zeta-function), [Riemann
hypothesis](../glossary.md#riemann-hypothesis), [complex number](../glossary.md#complex-number), [prime
number](../glossary.md#prime-number), [bisection](../glossary.md#bisection)
