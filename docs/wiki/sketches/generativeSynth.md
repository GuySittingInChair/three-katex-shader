---
summary: A melody that composes and plays itself.
---

# Generative Synth: in plain English

File: `src/sketches/generativeSynth.js` · Mode: shader · Category: Synthesis

**What you see (and hear):** soft glowing rings ripple out from the centre of a dark screen, one for each
note, like raindrops on a pond at night. Each ring's colour comes from its pitch: the lowest notes are a
warm red, middle notes cyan and blue, and the very highest swing round again towards orange. With sound on (press **Space**), a gentle electronic tone plays
a wandering, music-box melody that never repeats and never sounds wrong.

**The idea behind it:** the sketch improvises. It has a ladder of 10 notes, and every 0.4 seconds it takes a
random step up or down the ladder, by one or two rungs. That's a *random walk* (the same idea as the
stumbling walkers in [Diffusion-Limited Aggregation](diffusionLimitedAggregation.md)), but on a musical scale
instead of a grid.

Why does random never sound wrong? The ladder is a *pentatonic* scale: C, D, E, G, A, then the same again an
octave up. Those five notes have no two neighbours that clash. It's the scale of countless folk tunes, and
of the black keys on a piano. Mash only the black keys and it sounds like music. Same trick.

The equation on screen: the next note's position is this one, plus a step of −2, −1, +1 or +2.

**Where the data comes from:** no data. The melody is [random](../randomness.md).

**How it's built:**
- Sound: Tone.js, a music toolbox the site already loads (see `src/core/audioEngine.js`), makes a simple
  sine-wave synthesiser: the purest, softest kind of electronic tone.
- Picture: one [fragment shader](../shaders.md) that draws up to 8 rings, from two *uniform arrays*, lists
  of numbers passed in as [uniforms](../uniforms.md).

**A tour of the file:**

Choosing and playing a note, in `update`:

```js
const step = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
state.scaleIndex = Math.max(0, Math.min(SCALE.length - 1, state.scaleIndex + step));
const note = SCALE[state.scaleIndex];
...
state.synth.triggerAttackRelease(note, '8n');
```

- Line 1: `Math.random()` gives a random number from 0 up to (but not including) 1; times 4 and rounded down by
  `Math.floor`, it's 0, 1, 2 or 3. That picks one of the four steps in the list: down two, down one, up
  one or up two rungs.
- Line 2: take the step, but don't fall off either end of the ladder: `Math.max(0, …)` means "no lower
  than the bottom rung" and `Math.min(SCALE.length - 1, …)` "no higher than the top".
- Line 3: look up the note's name, like `'E4'` (the E in the middle of a piano).
- Line 5 (`...` marks lines left out): `triggerAttackRelease` presses the synthesiser's key and lets go
  after an eighth-note (`'8n'`).

Starting a ring:

```js
state.ringPos = (state.ringPos + 1) % RING_COUNT;
state.ringAge[state.ringPos] = 0;
state.ringHue[state.ringPos] = state.scaleIndex / SCALE.length;
```

`%` means "remainder after dividing", so counting 6, 7, then 8 % 8 = 0 wraps back to the start.
There are 8 ring slots used in turn, like seats on a carousel. The newest note takes the next seat,
resets its age to 0, and gets a colour from its pitch.

Drawing the rings, in the shader:

```glsl
float radius = age * 0.9;
float ring = 0.02 / (0.02 + ringDist * ringDist * 30.0);
float fade = exp(-age * 1.1);
```

- Each ring grows 0.9 screen-units a second.
- `age` is how many seconds since this ring's note played; `ringDist` is how far this pixel is from the
  ring's circle.
- `ring` is bright right on the circle and fades softly either side: a glowing line.
- `fade` dims it as it ages: `exp(-age * 1.1)` shrinks by the same fraction every moment, like a cooling
  cup of tea. After a second it's down to a third; after 3 seconds it's gone.

**Numbers worth knowing:**
- **10 notes**, C4 to A5: about two octaves, the range of a comfortable singing voice.
- **2.5 notes a second** at the default 0.4-second gap (0.15 to 1.2 on the slider).
- **8 rings** at most on screen, but at the default pace only 7 or 8 are ever alive at once anyway.

**Try this (funky):** in `setup`, change `type: 'sine'` to `type: 'square'`. The soft flute-like tone turns
into a buzzy retro video-game chip sound. Then drag **noteInterval** down to 0.15 for a frantic arcade
soundtrack.

**Words on this page:** [random walk](../glossary.md), [pentatonic scale](../glossary.md),
[synthesiser](../glossary.md), [uniform](../glossary.md), [shader](../glossary.md)
