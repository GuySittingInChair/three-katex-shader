---
summary: Eight real sounds from space, from real numbers: pulsars clicking, the Sun ringing, two black holes merging, and two black holes humming through hot gas, rebuilt from Chandra X-ray data.
added: 2026-11-21
tags: astronomy
---

# Sounds of Space: in plain English

File: `src/sketches/soundsOfSpace.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Astronomy

**What you see:** a tour of eight sound sources in space, 11 seconds each. At the top, the source: a pulsar's
spinning beams, the Sun shimmering, two black holes spiralling together, and, for the last two, a real X-ray
picture of the gas around a black hole with a bright "radar" line turning over it.
At the bottom, a glowing line: an *oscilloscope* trace of the sound itself, the very numbers your speakers are
playing. The equation says what the real frequency is and how much (if at all) it has been sped up. Press the
**Sound** button to hear it.

**The idea behind it:** space is almost empty, so sound can't travel across it to us. But lots of things out
there ring, tick and hum at a steady rate of their own. Turn that rate into sound (speeding it up if it is too
slow to hear) and you can listen to it. Turning data into sound is called *sonification*. Here, wherever
possible, nothing is sped up at all.

1. **Vela pulsar** (11.2 clicks a second, real time). A *pulsar* is a dead star's core, a ball of neutrons
   about 20 km across, spinning and sweeping a radio beam past us like a lighthouse. One click per turn.
2. **Crab pulsar** (29.9 a second, real time): the remains of a star whose explosion was seen in the year 1054.
3. **The fastest known pulsar**, J1748−2446ad (716 a second, real time): so fast the clicks merge into a note.
4. **A magnetar** near the Milky Way's central black hole, J1745−2900: one slow tick every 3.76 seconds.
5. **The Sun** (sped up 100,000 times). The Sun rings like a bell with thousands of sound waves trapped inside
   it, each with a period of about 5 minutes; astronomers measure them from the surface moving up and down
   (*helioseismology*), which tells them about the inside of the Sun. Sped up 100,000 times, 5 minutes becomes
   about 300 Hz, and one second of sound is 27.8 hours of Sun.
6. **GW150914** (real time): the first *gravitational waves* ever detected, from two black holes merging 1.3
   billion years ago, recorded by LIGO on 14 September 2015. Gravitational waves are stretches and squeezes of
   space itself; these ones happened to be at frequencies we can hear, rising from about 35 to 250 Hz in a
   fraction of a second: a "chirp". This is the actual recorded signal from the Hanford detector, noise and
   all.
7. **The black hole in the Perseus cluster** (raised 57 and 58 octaves). A *galaxy cluster* is a swarm of
   hundreds of galaxies, all soaking in one enormous cloud of thin gas at tens of millions of degrees. Gas
   that hot glows in *X-rays* (light far too energetic for our eyes), which the *Chandra* X-ray space
   telescope can photograph. The giant black hole in the middle of the Perseus cluster burps out energy
   every so often, and each burp sends a pressure wave through that gas. A pressure wave in a gas is exactly
   what sound is, so these are real sound waves, just unimaginably big: their crests are about 36,000
   light-years apart (11 kiloparsecs, *kpc*; one kpc is about 3,260 light-years), and one passes by every 9.6
   million years or so (Andrew Fabian and colleagues, 2003). Nobody heard them: they were *seen*, as faint
   rings of slightly brighter (squeezed) and slightly dimmer (stretched) gas in Chandra's pictures, like
   ripples frozen in a photo of a pond.
8. **The black hole in the Centaurus cluster** (raised 57 and 58 octaves). The only other place where these
   ripples have been found: crests about 9 kpc (29,000 light-years) apart, one every 10 million years or so
   (Jeremy Sanders and Andrew Fabian, 2008).

The black holes are played the way NASA's Chandra team made their famous 2022 Perseus sound (Kimberly
Arcand, Matt Russo and Andrew Santaguida). Their code was never published, but their method was: read the
ripples along lines running out from the black hole, sweep those lines round like a radar, and raise what
you find 57 and 58 octaves. This sketch rebuilds that from the raw telescope data, so it is the same idea from
the same data, not their exact recording.

**Where the data comes from:**
- The pulsar periods: the ATNF Pulsar Catalogue, already in this project for the Lighthouses of the Galaxy
  sketch (`public/data/pulsars/meta.json`).
- GW150914: the Hanford strain from LIGO's open data (GWOSC), whitened and filtered to 35–350 Hz, already in
  this project for The First Chirp (`public/data/gw/strain.bin`).
- The Sun: its measured *large separation* Δν = 135.1 μHz (the gap between neighbouring notes) and the
  frequency of its loudest notes, νmax = 3,090 μHz. The notes are placed by the *asymptotic relation* ν = Δν
  (n + l/2 + ε): a model of the pattern, not a list of measured notes.
- The black holes: Chandra's raw observations from its public archive (the *event files*: a list of every
  single X-ray particle that hit the camera, with where and when). Perseus: observations 3209 and 4289, 191
  thousand seconds (about 53 hours) between them, the ones the 2003 discovery used. Centaurus: 4954, 4955
  and 5310, about 50 hours. The ripple spacing and the speed the waves travel come from the two discovery
  papers. The script `tools/blackholes/build_bh.py` turns them into `public/data/blackholes/`: one picture
  and one table of 360 lines per black hole. To add another black hole, add one entry to the `BH` list at the
  top of that script and run it again.

**How it's built:**
- Each sound is a list of numbers (*samples*), 22,050 a second, worked out in JavaScript; the [sound
  player](../sketch-sound.md) loops it when Sound is on. The oscilloscope draws the same list, around the
  moment being played.
- **Pulsars:** a short click (a 1,800 Hz blip with a little hiss, about 4% of a turn long) once per turn. The
  loop holds about half a second of turns, so the click rate is exact to 0.004% (measured).
- **The Sun:** 48 notes (three kinds, l = 0, 1, 2, for 16 overtones), loudest near νmax. Real solar notes are
  kicked by the boiling surface and die away over a few days, so each note's loudness wanders at random, with
  a lifetime of 3 days (2.6 seconds once sped up).
- **GW150914:** the recorded strain, resampled from 4,096 to 22,050 samples a second and scaled to a
  comfortable loudness, then 1.4 seconds of quiet before it repeats.
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
  7. *Sweep.* The radar turns once every 11 seconds, and the sound follows whatever the line under it holds,
     so where ripples crowd together the pitch rises and where they spread out it falls.
  While the data is still loading, Perseus plays a plain placeholder tone at its textbook pitch.

## The equation

For each sound: the real rate (the pulsar's period P and its turns a second; the Sun's Δν and νmax; for the
black holes, the ripple spacing λ and sound speed c_s, whose ratio is the true frequency), the speed-up, and
the pitch you hear.

## A tour of the file

A pulsar's clicks, in `src/lib/spaceSound.js`:

```js
const K = Math.max(1, Math.round(0.5 / P)), n = Math.round(K * P * RATE), out = new Float32Array(n), r = rng(seed);
```

`K` turns fill about half a second. The loop's length `n` is rounded to a whole number of samples, but spread
over K turns the rounding hardly matters: for the fastest pulsar, whose single turn is only 31 samples, it
changes the rate by 0.001%.

The textbook Perseus pitch (the placeholder while the data loads):

```js
const perseusHz = () => 2 ** PERSEUS.octaves / (PERSEUS.periodYears * 365.25 * 86400);
```

One wave every 9.6 million years (turned into seconds), raised 57 octaves: each octave doubles the frequency,
so 57 octaves multiply it by 2⁵⁷.

Finding the ripples, in `tools/blackholes/build_bh.py`:

```python
    frac = np.where(good, smooth(2.5) / np.maximum(smooth(14), 1e-12) - 1, np.nan)
```

`smooth(2.5)` is the picture blurred over about 2.5 arcseconds (enough to calm the speckle of single
particles, not enough to blur away ripples about 30 arcseconds apart); `smooth(14)` is blurred over 14, which
smears the ripples out and leaves only the smooth glow. Dividing gives 1.05 where the gas is 5% brighter than
its surroundings; subtracting 1 leaves 0.05. `np.where(good, …, np.nan)` keeps only squares the camera watched
properly and marks the rest "not a number", so they are skipped later.

How a ripple spacing becomes a pitch, in `src/lib/spaceSound.js`:

```js
      const hz = (2 ** oct) / (lams[j] * meta.secPerArcsec);
```

`lams[j]` is one ripple spacing in arcseconds. `meta.secPerArcsec` is how long a sound wave takes to cross one
arcsecond of the cluster at the real speed of sound (for Perseus about 9.8 trillion seconds, some 310,000
years). Their product is the time between crests; one over that is crests per second, the true frequency.
`2 ** oct` raises it `oct` octaves: 57 for the main voice, 58 for the softer one an octave up.

Making the clear ripples stand out:

```js
    for (let k = 0; k < 360; k++) S[k * NF + j] = (S[k * NF + j] / med) ** 3;
```

The gas is lumpy at every size, so every spacing is present a little in every direction. Dividing by `med`
(that spacing's typical strength over all 360 directions) asks "is it stronger here than usual?", and `** 3`
(cubing) exaggerates the answer: twice as strong as usual becomes 8 times as loud, half as strong becomes 8
times quieter.

The pitch shown in the equation, in `src/sketches/soundsOfSpace.js`:

```js
    const P = BH_PAPER[s], f0 = (P.cs * 1e3) / (P.lam * KPC_M), f = f0 * 2 ** 57;
```

`P.cs` is the published sound speed in km/s (times 1,000 for metres per second), `P.lam` the published
ripple spacing in kpc (times `KPC_M`, the metres in a kpc). Speed ÷ spacing = `f0`, the true frequency;
`f0 * 2 ** 57` is the pitch 57 octaves up.

## Numbers worth knowing

Measured from the sound the sketch makes:

| source | real | heard | sped up |
|---|---|---|---|
| Vela pulsar | 11.195 turns a second | 11.195 clicks a second | no |
| Crab pulsar | 29.947 | 29.948 | no |
| J1748−2446ad | 716.33 | 716.33 | no |
| Magnetar J1745−2900 | one turn per 3.7637 s | one tick per 3.7637 s | no |
| The Sun | loudest near 3.09 mHz | loudest note 316 Hz (envelope peak 309) | 100,000 × |
| GW150914 | 35–250 Hz | the same | no |
| Perseus black hole | 3.4 × 10⁻¹⁵ Hz (1,170 km/s ÷ 11 kpc) | formula 497 Hz and 994 Hz; the loudest pitch wanders from 223 to 1,241 Hz as the radar turns (middle 778) | 2⁵⁷ and 2⁵⁸ × |
| Centaurus black hole | 3.2 × 10⁻¹⁵ Hz (880 km/s ÷ 9 kpc) | formula 457 Hz and 914 Hz; the loudest pitch wanders from 183 to 1,055 Hz (middle 415) | 2⁵⁷ and 2⁵⁸ × |

(The black holes' "loudest pitch" was measured every 0.37 seconds over one 11-second turn. It spreads either
side of the formula because the ripples really are spaced differently in different directions, and because
the higher voice sits an octave up.)

**Try this (funky):** speed the Sun up twice as much. In `soundsOfSpace.js`, change `speed: 1e5,` to `speed:
2e5,`. Every note goes up exactly one octave (the loudest region from about 309 Hz to 618 Hz), each note's
swells come and go twice as fast, and one second of sound is now 13.9 hours of Sun instead of 27.8. (Worked
out from the numbers: doubling a speed-up doubles every frequency, and a doubling is an octave.)

**Try this:** make the black holes plainer. In `src/lib/spaceSound.js`, change `/ med) ** 3;` to `/ med) **
1;`. Spacings are no longer exaggerated where they stand out, so the gas's lumps at every size all sound at
once: instead of distinct tones gliding about, you hear a dense, breathy wash across the whole band (that is
how it looked when measured, before the cubing was added).

**Words on this page:** [sonification](../glossary.md#sonification), [pulsar](../glossary.md#pulsar),
[magnetar](../glossary.md#magnetar), [helioseismology](../glossary.md#helioseismology), [gravitational
wave](../glossary.md#gravitational-wave), [frequency](../glossary.md#frequency),
[octave](../glossary.md#octave), [sample (sound)](../glossary.md#sample), [galaxy
cluster](../glossary.md#galaxy-cluster), [X-ray](../glossary.md#x-ray), [Chandra](../glossary.md#chandra),
[event file](../glossary.md#event-file), [exposure map](../glossary.md#exposure-map), [point
source](../glossary.md#point-source), [fractional residual](../glossary.md#fractional-residual), [Fourier
transform](../glossary.md#fourier-transform), [speed of sound](../glossary.md#speed-of-sound),
[kiloparsec](../glossary.md#kiloparsec), [arcsecond](../glossary.md#arcsecond)
