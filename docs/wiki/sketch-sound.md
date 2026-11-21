---
summary: How a sketch makes its own sound in code, played only when the Sound button is on.
added: 2026-11-21
---

# Sketch sound: sounds made in code

**In one sentence:** a sketch can make its own sound, worked out in code from its data or its maths, using the
sound player in `src/lib/spaceSound.js`; nothing plays until you turn the **Sound** button on.

**Picture it:** a music box whose tune is punched by the sketch itself. The sketch works out a strip of
numbers (the shape of the sound wave), and the player loops it, or holds a couple of steady notes and slides
their pitch.

**Why sketches need it:** some things in the sketches are already sounds, or rhythms: a pulsar turns 30 times
a second, gravitational waves came in at frequencies we can hear. Playing them makes the numbers something you
can feel. Other sketches use sound as a translation (a *sonification*): in [Dark
Saturn](sketches/darkSaturn.md) each black hole's spin becomes a pitch.

The site has always let an admin upload a sound file for a sketch. These sounds are different: made in code,
from real numbers, so they can't drift from what the sketch shows.

**Where you'll see it:** [Sounds of Space](sketches/soundsOfSpace.md), [Dark Saturn](sketches/darkSaturn.md),
Lighthouses of the Galaxy (the pulsars: Vela, the Crab and the fastest known pulsar clicking at their real
rates) and The First Chirp (the real gravitational-wave recording, while the cleaned signal is on screen).

**What it looks like in the code:** a sketch that makes sound says so, which makes the site show the Sound
button. From `src/sketches/darkSaturn.js`:

```js
sound: 'live',
```

In `setup`, it makes a player:

```js
return { glow, hole, ring, turnBH: 0, turnBR: 0, player: createSoundPlayer({ volume: 0.35 }) };
```

Every frame, it says what should be playing. Either a looped strip of samples (from
`src/sketches/soundsOfSpace.js`):

```js
state.player.loop(s, song, RATE);
```

`s` names the sound (calling again with the same name changes nothing; a new name fades the old sound out and
the new one in), `song` is the strip of samples, and `RATE` how many samples make a second (22,050). Or a few
steady notes, as Dark Saturn does with each horizon's tone. And when the sketch closes:

```js
state.player.dispose();
```

Browsers only allow sound after a tap or click, and the site remembers whether you left Sound on. The player
checks both every frame, and stays silent unless both say yes.

**Try this:** in `src/sketches/darkSaturn.js`, change `{ freq: 330 * 2 ** s.omBH, gain: 0.18, pan: -0.4 },` to
`{ freq: 220 * 2 ** s.omBH, gain: 0.18, pan: -0.4 },` and press Run with Sound on. The hole's tone drops a
fifth (330 Hz → 220 Hz is a ratio of 3 to 2) while the ring's stays put, so the two notes no longer match even
when the two horizons turn at the same rate.

**Related:** [Sounds of Space](sketches/soundsOfSpace.md), [Dark Saturn](sketches/darkSaturn.md), [What is a
sketch?](what-is-a-sketch.md), [Frame loop](frame-loop.md)
