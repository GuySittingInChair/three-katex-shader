---
summary: Particles through two slits build stripes; a which-path detector wipes them out; an eraser brings them back, but only when sorted.
added: 2026-11-20
---

# Double Slit, With Eraser: in plain English

File: `src/sketches/doubleSlitEraser.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Waves

**What you see:** on the left, waves rolling in from the left edge, hitting a grey wall with two narrow gaps,
and spreading out beyond it in rippling fans. On the right, a screen where particles land one at a time as
white specks, and beside it a growing tally of where they landed. The loop has three acts of 22 seconds:
1. **No detector:** the ripples from the two gaps cross and the tally grows into stripes (several bright
   bands).
2. **Detector on:** two lamps by the gaps blink; the ripples from each gap are drawn in their own colour
   (green and magenta); the stripes vanish into one broad hump.
3. **Eraser:** the specks land in two colours, gold and blue. Each colour on its own has stripes (gold where
   the first act had bright bands, blue in between); added together (grey), no stripes.

**The idea behind it:** light, and even electrons and atoms, travel as waves. A wave going through two gaps
spreads out from each, and where the two spreading waves meet they add up: crest on crest makes a bright band,
crest on trough cancels to dark. That is *interference*. The strange part is that each particle arrives at the
screen as a single dot, yet after thousands of dots the stripes appear, so each particle's wave went through
both gaps. The chance of landing at a point is the square of the wave's size there, |ψ|²: the *Born rule*.

Now put a detector at the gaps that records which one each particle went through. The stripes vanish. Knowing
the path (or even recording it where nobody looks) turns the two waves into two separate possibilities, which
no longer interfere: the pattern is the sum of the two single-gap patterns.

The *quantum eraser* (done in labs since the 1990s; a famous version is Kim and others, 2000) goes one step
further: the path record is later read in a way that can't tell the gaps apart, giving an answer + or −. Sort
the dots by that answer, and each group shows stripes: + the original stripes, − the stripes shifted half a
band (*anti-stripes*). But together they still add up to no stripes. The eraser never changes where any
particle lands; it only lets you sort them afterwards. Nothing travels back in time.

**Where the data comes from:** no data. Units are wavelengths: gaps 6 apart, each 1.5 wide, screen 60 away.

**How it's built:**
- Each gap is modelled as 5 point sources across its width (every point of a gap sends out a fresh ripple:
  *Huygens' principle*), each ripple falling off as 1/√distance.
- The screen's chances are worked out once: |ψ₁ + ψ₂|² for act 1, |ψ₁|² + |ψ₂|² for acts 2 and 3. Each
  particle's landing point is drawn at random from them, 70 a second.
- In act 3 each particle's eraser answer is + with chance |ψ₁ + ψ₂|² ÷ 2(|ψ₁|² + |ψ₂|²) at the point where it
  landed, otherwise −.
- The ripples on the left are each gap's wave, worked out once as a complex number for every point of a 220 ×
  132 picture; each frame only turns their phase.

## The equation

- **Act 1:** P(y) ∝ |ψ₁ + ψ₂|²: the chance of landing at height y follows the square of the two waves added.
- **Act 2:** P(y) ∝ |ψ₁|² + |ψ₂|²: two possibilities, added as chances, not as waves.
- **Act 3:** P±(y) ∝ ½|ψ₁ ± ψ₂|²: the + and − groups. Add them: ½(|ψ₁ + ψ₂|² + |ψ₁ − ψ₂|²) = |ψ₁|² + |ψ₂|²,
  act 2's pattern again.

## A tour of the file

One gap's wave at a point, in `slitWave`:

```js
const r = Math.hypot(x, y - sy), ph = TAU * r, a = 1 / Math.sqrt(Math.max(r, 0.3)) / SUBS;
```

`r` is the distance from the source to the point, in wavelengths; `ph` the phase there (a full turn every
wavelength); `a` the size, falling off as 1/√r, shared between the 5 sources of the gap.

The eraser's answer, in `update`:

```js
const s = m.act === 2 ? (r() < SCREEN.both[b] / (2 * SCREEN.sum[b]) ? 1 : -1) : 0;
```

At the landing point `b`: + with the chance described above, otherwise −.

## Numbers worth knowing

- **10 wavelengths:** the spacing of the bright stripes on the screen. Rule of thumb: spacing = wavelength ×
  distance ÷ gap separation = 60 ÷ 6 = 10. Measured from the sketch's own pattern: 9.9.
- **70** particles a second, about 1,500 per act.
- For visible light (wavelength about 0.5 µm), this would be gaps 3 µm apart and a screen 30 µm away: less
  than half the width of a human hair.

**Try this (funky):** in `doubleSlitEraser.js`, change `const D = 6,` to `const D = 12,`: the gaps twice as
far apart. The stripes come twice as close together: bright bands every 5.1 wavelengths instead of 9.9 (60 ÷
12 = 5 by the rule of thumb). Measured from the sketch's own pattern.

**Words on this page:** [interference](../glossary.md#interference), [Born rule](../glossary.md#born-rule),
[quantum eraser](../glossary.md#quantum-eraser), [Huygens' principle](../glossary.md#huygens-principle),
[complex number](../glossary.md#complex-number), [probability](../glossary.md#probability),
[histogram](../glossary.md#histogram)
