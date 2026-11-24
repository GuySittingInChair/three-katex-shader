---
summary: Twelve giant black holes humming through the hot gas around them, from real Chandra X-ray data, played the NASA way and pitched down a little.
added: 2026-11-23
tags: astronomy
---

# Black Hole Ripples: in plain English

File: `src/sketches/blackHoleRipples.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Astronomy

**What you see:** a real X-ray picture of the gas around a giant black hole, bright where the gas is squeezed and
dark where it is stretched, with a glowing "radar" line turning slowly over it. Below it, a wavy line: an
*oscilloscope* trace of the sound itself, the very numbers your speakers are playing. After 22 seconds (one full
turn of the radar) it moves on to the next of twelve black holes; the **hole** slider stops the tour on one. Press **Sound** to hear it.

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

**Two kinds of black hole.** Only two places are known to have a steady *train* of ripples, one after another
like the rings from a dripping tap: the Perseus and Centaurus clusters (numbers 1 and 2 on the slider). The other
ten (3 to 12) are famous for a black hole visibly shoving its gas around, but in single events: *shock fronts*
(one sharp pressure jump racing outwards, more a thunderclap than a hum) and *bubbles* (cavities blown in the gas
by the black hole's jets). Those are real pressure waves too, but nobody has measured a ripple spacing for them,
so this sketch measures a typical size from the picture itself (see step 5 below). Their pitch is this sketch's
rough reading, not a discovery, and the equation says so.

| slider | black hole | kind | known for |
|---|---|---|---|
| 1 | Perseus cluster | ripples | the original "B♭ 57 octaves down" |
| 2 | Centaurus cluster | ripples | the only other ripple train found |
| 3 | M87, Virgo cluster | shocks | the Event Horizon Telescope's black hole; a shock ring and bubbles |
| 4 | Abell 2052 | shocks | bubbles inside shells of shocked gas |
| 5 | NGC 5813 | shocks | three outbursts, three pairs of shock fronts |
| 6 | Hydra A | shocks | one of the largest shock fronts known |
| 7 | MS 0735.6+7421 | shocks | one of the most powerful outbursts ever seen |
| 8 | Abell 2199 | shocks | a shock and bubbles |
| 9 | NGC 5044 | shocks | a galaxy group full of cavities |
| 10 | 2A 0335+096 | shocks | a stirred-up core full of bubbles |
| 11 | Abell 262 | shocks | bubbles blown by radio jets |
| 12 | Cygnus A | shocks | a jet-blown cocoon edged by a shock |

**Where the data comes from:** `public/data/blackholes/`, made by
`tools/blackholes/build_bh.py` from Chandra's public archive (Perseus: observations 3209 and 4289; Centaurus: 4954,
4955 and 5310). For the other ten, `tools/blackholes/bh_fetch.py` searches the archive by name and takes the deepest
plain-camera observations, longest first, until about 150 thousand seconds (about 42 hours); their sound speed comes
from the gas temperature (hotter gas carries sound faster) and their distance from their *redshift* (how much the
universe's expansion has stretched their light). The ripple spacings and wave speeds in the equation come from the discovery papers: Andrew Fabian and
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
  For the shock-and-bubble black holes, step 5 also *measures* the spacing: it averages, over all 360 lines,
  how strongly each size repeats, evens out the fact that gas is always lumpier at bigger sizes, and takes the
  size that stands out most. For many of the ten it lands on the largest size allowed (a third of the distance
  read), which really means "about the size of the biggest bubbles": treat their pitch as rough.
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

λ is the spacing (for 1–2 published; for 3–12 measured here, rough), c_s the speed of sound in the gas. The pitch
is c_s ÷ λ raised 57 octaves (NASA's), then 5 semitones down (this sketch's default).

| | black hole | distance | λ (kpc) | c_s (km/s) | NASA pitch | default here |
|---|---|---|---|---|---|---|
| 1 | Perseus | 240 million light-years | 11 | 1,170 | 497 Hz | 372 Hz |
| 2 | Centaurus | 150 million light-years | 9 | 880 | 457 Hz | 342 Hz |
| 3 | M87 | 54 million light-years | 4.6 | 729 | 739 Hz | 553 Hz |
| 4 | Abell 2052 | 500 million light-years | 33 | 893 | 126 Hz | 94 Hz |
| 5 | NGC 5813 | 110 million light-years | 10.5 | 432 | 192 Hz | 144 Hz |
| 6 | Hydra A | 770 million light-years | 81 | 965 | 55 Hz | 41 Hz |
| 7 | MS 0735.6+7421 | 3.0 billion light-years | 134 | 1,153 | 40 Hz | 30 Hz |
| 8 | Abell 2199 | 420 million light-years | 32 | 1,032 | 149 Hz | 111 Hz |
| 9 | NGC 5044 | 100 million light-years | 7.9 | 516 | 305 Hz | 229 Hz |
| 10 | 2A 0335+096 | 490 million light-years | 37 | 816 | 102 Hz | 77 Hz |
| 11 | Abell 262 | 230 million light-years | 18 | 729 | 191 Hz | 143 Hz |
| 12 | Cygnus A | 780 million light-years | 46 | 1,210 | 124 Hz | 93 Hz |

Big bubbles mean a long spacing, and a long spacing means a low note: MS 0735's outburst blew cavities hundreds of
thousands of light-years across, so it comes out at a 30 Hz rumble that small speakers can barely play (try pitch 0,
or headphones). The papers describing each one's shocks and bubbles: Fabian et al. 2003; Sanders & Fabian 2008;
Forman et al. 2007; Blanton et al. 2011; Randall et al. 2015; Nulsen et al. 2005; McNamara et al. 2005; Nulsen et al.
2013; David et al. 2009; Sanders et al. 2009; Blanton et al. 2004; Snios et al. 2018.

A *kpc* (kiloparsec) is about 3,260 light-years. Five semitones down multiplies every frequency by 2^(−5/12), about
0.75: 497 × 0.75 = 372.

**Try this:** set **hole** to 5 (NGC 5813) and watch the radar cross its rings: three outbursts left three nested
shells, and the sound changes as the line passes each. Then drag **pitch** to 24: two octaves down, everything is a
quarter of NASA's pitch (Perseus's middle note about 124 Hz), a low rumble. Drag it to 0 for NASA's own pitch.

**Words on this page:** [galaxy cluster](../glossary.md#galaxy-cluster), [Chandra](../glossary.md#chandra),
[X-ray](../glossary.md#x-ray), [sonification](../glossary.md#sonification), [octave](../glossary.md#octave),
[semitone](../glossary.md#semitone), [frequency](../glossary.md#frequency),
[kiloparsec](../glossary.md#kiloparsec), [speed of sound](../glossary.md#speed-of-sound), [shock
front](../glossary.md#shock-front), [redshift](../glossary.md#redshift), [arcsecond](../glossary.md#arcsecond),
[exposure map](../glossary.md#exposure-map), [point source](../glossary.md#point-source), [fractional
residual](../glossary.md#fractional-residual), [Fourier transform](../glossary.md#fourier-transform)
