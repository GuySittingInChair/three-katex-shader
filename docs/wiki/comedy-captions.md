# The comedy formula: true equations, absurd nouns

**In one sentence:** the funny sketches follow one house rule, written down in `src/lib/bit.js`: **a true
equation × an absurd noun, told deadpan.**

**Picture it:** a nature documentary narrator, calm and serious, describing a sperm cell flying into
anti-aircraft fire. The voice never cracks. Every fact is correct. The joke is entirely in what's being
described, never in getting the science wrong.

**Why sketches need it:** comedy is a way in. People who'd never read about proportional navigation will
happily watch a giant sperm cell weave through tracer fire. The formula keeps the jokes honest, so you
learn real physics while laughing.

**Where you'll see it:** 33 sketches import `bit.js`, including `antiAircraftContraception.js`,
`elephantToothpaste.js`, `rabbitsVsFoxes.js`, `fireflySync.js`, `voodooDoll.js`, `intercept.js`,
`keplersPizza.js` and `radarShadow.js`. `docs/guide.md` section 12 has the expert version.

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
   ("rewinding; entropy briefly ignored").

## The helpers

**`caption(text)`**: the deadpan voice. It makes a line small, grey and in italics, under the equation:

```js
export const caption = (s) => (s ? `\\textcolor{#9aa3b2}{\\small\\textit{${escapeText(s)}}}` : '');
```

- `#9aa3b2` is a quiet blue-grey (see [rgb.md](rgb.md)).
- `\\small\\textit{...}` is LaTeX for "small italic text".
- `escapeText` protects a few symbols (like `%` and `&`) that would otherwise confuse the equation
  renderer.
- If there's no text, it returns nothing.

In `antiAircraftContraception.js` it ends the on-screen equation with lines like:

```js
line = m.phase === 'low'
  ? (m.Re > 0 ? 'The tail is beating. In air, at this size, it achieves nothing.' : '')
```

That's rule 1 and rule 3 together: the line appears because the sketch has worked out that the tail's
swimming stroke really is useless in air (see [its walkthrough](sketches/antiAircraftContraception.md)).

**`mood(rates, table)`**: picks a caption from whether each rate is going up (`+`), down (`-`) or holding
(`0`). **`inUnits(...)`**: shows a real number in a silly unit, with the conversion. **`beat(t, list)`**:
picks the caption whose start time has most recently passed, for timed lines.

**Try this:** in `antiAircraftContraception.js`, find `'It happens.'` (the caption when the cell crashes
into the ground) and change it to anything you like. At the default settings the gun shoots every attempt
down, so set **spread** to 8 and **hits** to 6 in Params. In a test, more than a third of attempts then
dived into the ground, and each time your line appears, small and grey. (None ever reach the egg: by
the owner's ruling, [that quest is never finished](sketches/antiAircraftContraception-physics.md#the-quest-that-must-never-be-finished).)

**Related:** [motion-and-latex.md](motion-and-latex.md) ·
[sketches/antiAircraftContraception.md](sketches/antiAircraftContraception.md) · `docs/guide.md` section 12
