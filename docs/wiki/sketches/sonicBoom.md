---
summary: A robot singing one note flies faster each lap; the sound waves bunch up ahead, pile into a wall at Mach 1, and trail behind in a cone.
added: 2026-11-20
---

# Sonic Boom: in plain English

File: `src/sketches/sonicBoom.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Waves

**What you see:** a small glowing robot ("♪ A") flies from left to right, sending out rings of sound that
spread from wherever it was when it sang them. Two microphones listen, one ahead and one behind, glowing as
rings reach them. Every 11 seconds it flies again, faster: Mach 0.5, 0.9, 1.0, 1.5, 2.0. At slow speeds the
rings bunch up in front of it; at Mach 1 they pile up into one bright edge; faster still, the rings trail
behind inside a gold V: the Mach cone.

**The idea behind it:** sound is a wave in the air, travelling at about 340 m/s whatever the singer does. The
robot sings A, 440 waves a second. If it flies towards you, each wave starts a little closer to you than the
last, so they arrive bunched up: more waves a second, a higher note. Flying away, they are spread out: lower.
That is the *Doppler effect*, the reason a passing siren drops in pitch. For a listener straight ahead or
behind, in still air:

- **f ahead = f / (1 − M)**, **f behind = f / (1 + M)**

where **M**, the *Mach number*, is the robot's speed divided by the speed of sound. At M = 0.5 the robot
sounds 880 Hz ahead (an octave up) and 293 Hz behind.

At M = 1 the robot keeps pace with its own song: every wave it sings piles onto the last, making a wall of
pressure in front of it. Faster than sound, the robot outruns its rings. They overlap along a cone trailing
behind it, with half-angle μ where sin μ = 1/M. Inside the cone, you hear it; outside, nothing yet. When the
cone sweeps over you, all that piled-up sound arrives at once: the *sonic boom*.

**Where the data comes from:** no data.

**How it's built:**
- Every ring is remembered by where and when it was sung; each frame its radius is (now − then) × the speed of
  sound. The picture is slowed down about 80 times: one ring every 0.18 s, each standing for one wave of the
  note.
- The microphones *measure* the pitch rather than computing it from the formula: for each ring, the moment it
  reaches the microphone is worked out; the pitch is (rings heard − 1) ÷ (time from the first to the last of
  them) over the last 2 seconds. Slowing the picture down changes both rates by the same factor, so the ratio,
  and the pitch in Hz, is unchanged.

## The equation

- **M = v / c**: this lap's speed.
- **f ahead** and **f behind**: the formula's prediction, and in brackets what the microphone measured. They
  agree: 880 and 293 Hz at Mach 0.5.
- **sin μ = 1/M**, shown once it is supersonic: the cone's half-angle. 41.8° at Mach 1.5, 30° at Mach 2.

## A tour of the file

When a ring reaches a microphone, in `update`:

```js
const hit = te + Math.abs(mx - (x0 + M * te * k)) / k;
```

`te` is when the ring was sung, `x0 + M * te * k` where the robot was then (on screen), `mx` where the
microphone is. The ring reaches it after (distance ÷ speed of sound); `k` turns screen pixels back into
picture units, in which sound travels 1 unit a second.

The cone:

```js
const mu = Math.asin(1 / M), len = M * T * k;
```

The half-angle, and how long to draw its edges: as far as the robot has flown.

## Numbers worth knowing

- **880 Hz:** what you hear ahead of a robot singing 440 Hz at half the speed of sound: exactly an octave up.
- **4,400 Hz** at Mach 0.9 ahead: ten times the note. As M approaches 1, the note ahead heads for infinity.
- **30°:** the Mach cone's half-angle at Mach 2.
- **343 m/s:** the speed of sound in air at 20 °C, about 1,235 km/h; Mach 2 is about 2,470 km/h.

**Try this (funky):** in `sonicBoom.js`, change `const F = 440;` to `const F = 262;` (middle C). Both the
formula and the microphones now read 524 Hz ahead and 175 Hz behind at Mach 0.5, since both scale with the
note sung.

**Words on this page:** [Doppler effect](../glossary.md#doppler-effect), [Mach
number](../glossary.md#mach-number), [Mach cone](../glossary.md#mach-cone),
[frequency](../glossary.md#frequency), [phase](../glossary.md#phase)
