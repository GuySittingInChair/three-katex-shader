---
summary: Two giant black holes humming through the hot gas of their galaxy clusters, from real Chandra X-ray data, played the NASA way and pitched down a little.
added: 2026-11-23
tags: astronomy
---

# Black Hole Ripples: in plain English

File: `src/sketches/blackHoleRipples.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Astronomy

**What you see:** a real X-ray picture of the gas around a giant black hole, bright where the gas is squeezed and
dark where it is stretched, with a glowing "radar" line turning slowly over it. Below it, a wavy line: an
*oscilloscope* trace of the sound itself, the very numbers your speakers are playing. After 22 seconds (one full
turn of the radar) it moves from the Perseus cluster to the Centaurus cluster and back. Press **Sound** to hear it.

**The idea behind it:** this is the black hole idea from [Sounds of Space](soundsOfSpace.md), on its own, bigger,
slower, and a little deeper. A *galaxy cluster* is a swarm of hundreds of galaxies sitting in one huge cloud of gas
at tens of millions of degrees. The giant black hole in the middle burps out energy now and then, and each burp
sends a pressure wave through that gas. A pressure wave in a gas is exactly what sound is, so these are real sound
waves, with crests tens of thousands of light-years apart. They are far too slow to hear (one crest passes every
ten million years or so), but the *Chandra* X-ray telescope photographed them as faint rings, like ripples frozen in
a photo of a pond. The sound is made from those rings the way NASA's Chandra team made their famous 2022 Perseus
sound: read the ripples along lines out from the middle, sweep the lines round like a radar, raise the result 57 and
58 octaves. Then this sketch lowers it by a few *semitones* (the step between neighbouring piano keys; 12 make an
octave), 5 by default, for a deeper growl.

**Where the data comes from:** `public/data/blackholes/`, made by
`tools/blackholes/build_bh.py` from Chandra's public archive (Perseus: observations 3209 and 4289; Centaurus: 4954,
4955 and 5310). The ripple spacings and wave speeds in the equation come from the discovery papers: Andrew Fabian and
colleagues (2003) for Perseus, Jeremy Sanders and Andrew Fabian (2008) for Centaurus.

**How it's built:**
- **The black holes, step by step** (the first three in `build_bh.py`, run once on a computer; the rest in the
  browser, in `ripplesSong` in `src/lib/spaceSound.js`):
  1. *Make a picture.* Every X-ray particle is dropped onto a grid of 1-arcsecond squares (an *arcsecond* is
     a tiny angle: the width of a coin seen from 4 km away) centred on the black hole.
  2. *Hide what isn't gas.* The camera is made of several chips with small gaps between them; an *exposure
     map* says how long each square was really watched, so gaps don't look like dark gas. Tiny bright dots
     (*point sources*: stars and far-off galaxies in front of or behind the cluster) are masked too.
  3. *Find the ripples.* The gas glows brightest in the middle and fades outwards, and the ripples are only a
     few per cent on top of that. Blur the picture a little and a lot, divide one by the other, and subtract
     1: what is left (the *fractional residual*) is how much brighter or dimmer each spot is than its smooth
     surroundings. That is the picture you see, bright for squeezed gas, dark for stretched.
  4. *Read 360 lines.* From the middle outwards, one line per degree, each averaging a thin 6° slice.
  5. *Listen for spacings.* For each line, a *Fourier transform* (a way of asking "how strongly does this
     pattern repeat every 10 arcseconds? every 20? every 30?") measures 48 ripple spacings, from 0.4 to 2.5
     times the published one. Spacings that stand out more than usual in that direction are made louder.
  6. *Turn spacings into pitches.* A real wave with crests a distance apart, moving at the speed of sound,
     passes a point (speed ÷ spacing) times a second. That is its true frequency; raise it 57 octaves (and, a
     little softer, 58) and play it.
  7. *Sweep.* The radar turns once every 22 seconds, and the sound follows whatever the line under it holds,
     so where ripples crowd together the pitch rises and where they spread out it falls.
  8. *Lower it.* Everything is then lowered by the pitch slider's semitones (see the tour below).
- The data is fetched once when the sketch opens ([promises and fetch](../js-promises-and-fetch.md)).
- The sound is made by the function `ripplesSong` in `src/lib/spaceSound.js`, and played on a loop by the [sound player](../sketch-sound.md).
- The picture and radar line are drawn on the [2D stage](../stage-2d.md) every frame; the radar's angle comes
  from where the sound loop is, so what you see is what you hear.

## A tour of the file

The sound for one black hole, at one pitch:

```js
    SONGS[key] = ripplesSong(BH.meta[id], BH.tables[id], RATE, { sweep: SCENE, octaves: [57 - down, 58 - down] });
```

`ripplesSong` turns each ripple spacing into a pitch: the real frequency (wave speed ÷ spacing), doubled once per
octave. `octaves: [57 - down, 58 - down]` asks for two voices, NASA's 57 and 58 octaves, each lowered by `down`.
`down` is the slider's semitones divided by 12, because 12 semitones make one octave: 5 semitones is 5/12 = 0.42
of an octave, so the voices sit at 2^56.58 and 2^57.58 instead of 2^57 and 2^58. `sweep: SCENE` makes the radar
take 22 seconds per turn.

The slider:

```js
    pitch: { value: 5, min: 0, max: 24, step: 1 },   // semitones lower than NASA's 57 octaves (12 = one octave)
```

0 is NASA's pitch exactly. 12 is one octave down, 24 two octaves down. Change `value: 5` to `value: 12` and the
sketch starts a whole octave lower: Perseus's middle note goes from 372 Hz to 249 Hz (half of NASA's 497).

Waiting for the slider to settle:

```js
    if (state.pitch === null || (want !== state.pitch && t - state.since > 0.5)) state.pitch = want;
```

Making a black hole's sound takes most of a second of computer work. If it remade the sound at every step while you
drag the slider, the page would stutter. So it waits until the slider has stayed put for half a second (`t -
state.since > 0.5`), then makes the sound once. Sounds already made are kept, so going back to a pitch you tried
before is instant.

## Numbers worth knowing

| | Perseus | Centaurus |
|---|---|---|
| distance | about 240 million light-years | about 150 million light-years |
| ripple spacing | 11 kpc (36,000 light-years) | 9 kpc (29,000 light-years) |
| speed of sound in the gas | 1,170 km/s | 880 km/s |
| true frequency | 3.45 × 10⁻¹⁵ Hz (one crest per 9.2 million years) | 3.17 × 10⁻¹⁵ Hz (one per 10 million years) |
| NASA's pitch (2⁵⁷) | 497 Hz | 457 Hz |
| this sketch (5 semitones down) | 372 Hz | 342 Hz |

A *kpc* (kiloparsec) is about 3,260 light-years. Five semitones down multiplies every frequency by 2^(−5/12), about
0.75: 497 × 0.75 = 372.

**Try this:** drag **pitch** to 24. Two octaves down, everything is a quarter of NASA's pitch (Perseus's middle note
about 124 Hz), a low rumble. Then drag it to 0 to hear NASA's own pitch.

**Words on this page:** [galaxy cluster](../glossary.md#galaxy-cluster), [Chandra](../glossary.md#chandra),
[X-ray](../glossary.md#x-ray), [sonification](../glossary.md#sonification), [octave](../glossary.md#octave),
[semitone](../glossary.md#semitone), [frequency](../glossary.md#frequency),
[kiloparsec](../glossary.md#kiloparsec), [speed of sound](../glossary.md#speed-of-sound), [arcsecond](../glossary.md#arcsecond),
[exposure map](../glossary.md#exposure-map), [point source](../glossary.md#point-source), [fractional
residual](../glossary.md#fractional-residual), [Fourier transform](../glossary.md#fourier-transform)
