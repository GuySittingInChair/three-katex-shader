# The comedy formula: true equations, absurd nouns

**In one sentence:** the funny sketches all follow one rule, written down in the shared file
`src/lib/bit.js` (a comedy "bit" is a routine): **a true equation, plus an absurd noun, told deadpan**
(with a straight face).

**Picture it:** a nature documentary narrator, calm and serious, describing a sperm cell flying into
anti-aircraft fire. The voice never cracks. Every fact is correct. The joke is entirely in what's being
described, never in getting the science wrong.

**Why sketches need it:** comedy is a way in. People who'd never read about *proportional navigation* (how
missiles steer towards a target) will happily watch a giant sperm cell weave through tracer fire. The formula keeps the jokes honest, so you
learn real physics while laughing.

**Where you'll see it:** 33 sketches use `bit.js`. Each sketch is one file named after it, so these
are sketch files: `antiAircraftContraception.js`, `elephantToothpaste.js`, `rabbitsVsFoxes.js`, `fireflySync.js`, `voodooDoll.js`, `intercept.js`,
`keplersPizza.js` and `radarShadow.js`. (Section 12 of the expert guide, `docs/guide.md`, says the same
for programmers.)

## The five rules (from the top of `bit.js`)

1. **Straight man.** The system, the equation and every number on screen are real and checked. The joke
   never gets to bend the physics.
2. **Casting.** Swap the textbook noun for an absurd one that still fits the maths: a test mass becomes a
   rubber duck, a missile becomes a sperm cell. Or keep the noun and swap the unit: litres become
   "elephants brushed".
3. **Feelings from rates.** Name the characters' moods from whether things are going up or down
   ("thriving" if the rabbit count is rising). The captions are worked out on every frame, not written in
   advance, so the joke is true at every moment.
4. **Punchline readout.** One live number converted into a ridiculous unit, with the conversion shown.
5. **Own the reset.** Real things don't loop. When the animation restarts, give the restart its own line
   ("rewinding; entropy briefly ignored": *entropy* is physics' word for the way things only ever get
more jumbled, never less, so a real rewind is impossible).

## The helpers

**`caption(text)`**: the deadpan voice. It makes a line small, grey and in italics, under the equation.
(`export const caption = (s) => …` means "here's a recipe called `caption`, shared with other files:
give it some text `s` and it hands back…"; see [Functions and arrows](js-functions.md).)

```js
export const caption = (s) => (s ? `\\textcolor{#9aa3b2}{\\small\\textit{${escapeText(s)}}}` : '');
```

- `#9aa3b2` is a quiet blue-grey (see [RGB, three numbers](rgb.md)).
- `\\small\\textit{...}` is LaTeX (the typesetting code for the on-screen equation) for "small italic
  text". The backslashes mark commands, and are doubled for a JavaScript reason.
- `escapeText` protects a few symbols (like `%` and `&`) that would otherwise confuse the equation
  renderer.
- `s ? A : ''` means "if there's text, A; otherwise nothing".

In `antiAircraftContraception.js` it ends the on-screen equation with lines like:

```js
line = m.phase === 'low'
  ? (m.Re > 0 ? 'The tail is beating. In air, at this size, it achieves nothing.' : '')
```

`m` holds the sketch's numbers for this moment: `m.phase` is which part of the flight it's in (`'low'`
is the low approach), and `m.Re` is the *Reynolds number*, which says whether swimming can work. `===`
means "is exactly", and `? … : …` means "if so … otherwise …". That's rule 1 and rule 3 together: the line appears because the sketch has worked out that the tail's
swimming stroke really is useless in air (see [its walkthrough](sketches/antiAircraftContraception.md)).

The other helpers:
- **`mood(rates, table)`**: give it how fast things are changing (`rates`) and a table of lines, and it
  picks a line from whether each is going up (`+`), down (`-`) or holding (`0`).
- **`inUnits(...)`**: shows a real number in a silly unit, with the conversion (rule 4).
- **`beat(t, list)`**: give it the time `t` and a list of timed lines, and it picks the line whose start
  time has most recently passed.

**Try this:** in `antiAircraftContraception.js`, find `'It happens.'` (the caption when the cell crashes
into the ground) and change it to anything you like. At the default settings the gun shoots every attempt
down, so open the **Params** panel (the sliders) and set **spread** (how much the gun's aim wobbles) to 8
and **hits** (how many hits the cell can take) to 6. In a test, more than a third of attempts then
dived into the ground, and each time your line appears, small and grey. (None ever reach the egg: by
the owner's ruling, [that quest is never finished](sketches/antiAircraftContraception-physics.md#the-quest-that-must-never-be-finished).)

**Related:** [Motion and the live equation](motion-and-latex.md) ·
[Anti-Aircraft Contraception](sketches/antiAircraftContraception.md) · `docs/guide.md` section 12
