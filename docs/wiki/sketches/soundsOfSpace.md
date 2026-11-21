---
summary: Seven real sounds from space, from real numbers: pulsars clicking, the Sun ringing, two black holes merging, and a black hole's B♭.
added: 2026-11-21
tags: astronomy
---

# Sounds of Space: in plain English

File: `src/sketches/soundsOfSpace.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Astronomy

**What you see:** a tour of seven sound sources in space, 11 seconds each. At the top, the source: a pulsar's
spinning beams, the Sun shimmering, two black holes spiralling together, ripples spreading from a black hole.
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
7. **The black hole in the Perseus cluster** (raised 57 octaves). Its outbursts send pressure waves through
   the hot gas around it, ripples seen by the Chandra X-ray telescope about 36,000 light-years apart, with a
   period of about 9.6 million years (Andrew Fabian and colleagues, 2003). That is a note 57 octaves below
   anything we can hear. Raised 57 octaves (2⁵⁷, about 144,000 million million times higher) it comes out at
   476 Hz, close to the B♭ above middle C: the "B♭ 57 octaves below middle C" of the 2003 announcement.

**Where the data comes from:**
- The pulsar periods: the ATNF Pulsar Catalogue, already in this project for the Lighthouses of the Galaxy
  sketch (`public/data/pulsars/meta.json`).
- GW150914: the Hanford strain from LIGO's open data (GWOSC), whitened and filtered to 35–350 Hz, already in
  this project for The First Chirp (`public/data/gw/strain.bin`).
- The Sun: its measured *large separation* Δν = 135.1 μHz (the gap between neighbouring notes) and the
  frequency of its loudest notes, νmax = 3,090 μHz. The notes are placed by the *asymptotic relation* ν = Δν
  (n + l/2 + ε): a model of the pattern, not a list of measured notes.
- Perseus: the period of 9.6 million years, from the published measurement.

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
- **Perseus:** a pure tone at 476 Hz with soft overtones, swelling once every 1.5 seconds like the ripples
  drawn. It stands for the pitch; the real waves are pressure ripples in gas, not a musical note.

## The equation

For each sound: the real rate (the pulsar's period P and its turns a second; the Sun's Δν and νmax; the black
hole's period), the speed-up, and the pitch you hear.

## A tour of the file

A pulsar's clicks, in `src/lib/spaceSound.js`:

```js
const K = Math.max(1, Math.round(0.5 / P)), n = Math.round(K * P * RATE), out = new Float32Array(n), r = rng(seed);
```

`K` turns fill about half a second. The loop's length `n` is rounded to a whole number of samples, but spread
over K turns the rounding hardly matters: for the fastest pulsar, whose single turn is only 31 samples, it
changes the rate by 0.001%.

The Perseus pitch:

```js
const perseusHz = () => 2 ** PERSEUS.octaves / (PERSEUS.periodYears * 365.25 * 86400);
```

One wave every 9.6 million years (turned into seconds), raised 57 octaves: each octave doubles the frequency,
so 57 octaves multiply it by 2⁵⁷.

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
| Perseus black hole | 3.3 × 10⁻¹⁵ Hz | 475.5 Hz (formula 475.7) | 2⁵⁷ × |

**Try this (funky):** speed the Sun up twice as much. In `soundsOfSpace.js`, change `speed: 1e5,` to `speed:
2e5,`. Every note goes up exactly one octave (the loudest region from about 309 Hz to 618 Hz), each note's
swells come and go twice as fast, and one second of sound is now 13.9 hours of Sun instead of 27.8. (Worked
out from the numbers: doubling a speed-up doubles every frequency, and a doubling is an octave.)

**Words on this page:** [sonification](../glossary.md#sonification), [pulsar](../glossary.md#pulsar),
[magnetar](../glossary.md#magnetar), [helioseismology](../glossary.md#helioseismology), [gravitational
wave](../glossary.md#gravitational-wave), [frequency](../glossary.md#frequency),
[octave](../glossary.md#octave), [sample (sound)](../glossary.md#sample)
