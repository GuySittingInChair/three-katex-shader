# Anti-Aircraft Contraception: in plain English

File: `src/sketches/antiAircraftContraception.js` · Mode: 3d · Category: Physics

**What you see:** a giant sperm cell, the length of a small bus, flies low across a dark, moonlit landscape
dotted with trees, towards a giant egg. It pops up, climbs, then dives at the egg, weaving as it comes. A twin anti-aircraft gun
tracks it and opens fire, with glowing tracer rounds arcing through the sky. Then, in slow motion, one of
two endings:
- **Shot down:** a burst breaks the cell into pieces, which tumble to the ground. The severed tail keeps
  beating for a while, pointlessly.
- **It gets through:** the cell hits the egg, and a wave of light sweeps across the egg's surface as it
  seals itself. This ending is written into the code but never happens. See "The quest that must never be
finished" below.
- **It crashes:** the cell survives the gun but dives into the ground short of the egg. The caption says
  "It happens."

A tally counts the outcomes. Gun settings in Params apply from the next attempt.

**The idea behind it:** this is a remake of the sketch [Intercept](../../../src/sketches/intercept.js) with
the cast swapped, following the [comedy formula](../comedy-captions.md): every number is real physics,
told deadpan. Three real ideas star:

1. **The tail is useless.** Swimming strokes only work for tiny things in thick liquid. In air, at bus
   size, the beating tail achieves nothing, and the caption says so.
2. **It homes like a missile,** steering so that the egg's direction never changes.
3. **The gun shoots where the cell will be,** not where it is.

These three ideas, and the egg's calcium wave, are explained properly on
[the physics page](antiAircraftContraception-physics.md).

**Where the data comes from:** no data, only real constants: air density, gravity, sperm's density and a
35 mm shell's energy.

**How it's built:**
- **Simulate first, then replay.** Each attempt's whole flight is worked out in one go by `simulate()`, at
  240 steps per second of flight, then played back. That's how it knows when to slow down.
- [Seeded randomness](../randomness.md): attempt n uses seed `2000 + n × 7919`.
- [Glow](../glow.md) for the tracers and bursts, [lines](../lines-and-points.md) for the tracer trails,
  and [captions](../comedy-captions.md) under the equation.

**A tour of the file:** the clock in `motion(t)`:

```js
return { loop: Math.floor(t / PERIOD), dt: phaseOf(t, PERIOD) * PERIOD };
```

Which attempt we're on (`loop`), and how many seconds into it (`dt`). Each attempt lasts 27.5 seconds.

The cell's homing, inside `simulate()`:

```js
const vr = mul(v, -1), Om = mul(cross(los, vr), 1 / dot(los, los)), Vc = -dot(norm(los), vr);
acc = add(mul(cross(Om, norm(v)), -(terminal ? 4 : 3) * Vc), mul(norm(v), 2.0));
```

- `Om` measures how fast the direction to the egg is swinging round.
- `Vc` is how fast the gap is closing.
- Line 2 steers against the swing, 3 times as hard (4 in the last 150 m), and pushes forward a little.

**Numbers worth knowing:**
- **6.4 m, 370 kg**: the cell, about a bus's length and the weight of a grand piano.
- **14 m**: the egg's width, a four-storey building.
- **2.3 km**: where each attempt starts.
- **1,100 rounds a minute** from the gun by default, with shells leaving at 1,175 m/s, about 3.5 times the
  speed of sound.
- **110 m/s and 33 m/s**: how fast the falling head and a tail piece end up dropping. The floppy tail
  catches more air.

**The quest that must never be finished:** the cell's homing steers *away* from the egg, so it never
reaches it. This started as a bug and is now kept on purpose, by order of the owner. See
[the physics page](antiAircraftContraception-physics.md#the-quest-that-must-never-be-finished).

**Try this (funky):** in Params, set **spread** to 8 (the gun shakes like a shopping trolley) and **hits** to
6 (the cell shrugs off five hits). In a test of 40 attempts, 15 now survived the gun, only to nosedive into
the ground. Watch for the "It happens." caption.

**Words on this page:** [proportional navigation](../glossary.md), [Reynolds number](../glossary.md),
[seed](../glossary.md), [glow](../glossary.md), [terminal velocity](../glossary.md),
[comedy formula](../glossary.md)
