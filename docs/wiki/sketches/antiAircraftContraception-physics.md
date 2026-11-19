# Anti-Aircraft Contraception: the physics, in plain English

Part of the [Anti-Aircraft Contraception walkthrough](antiAircraftContraception.md). File:
`src/sketches/antiAircraftContraception.js`.

**In one sentence:** behind the joke sit three real pieces of physics, and one real piece of biology.

**Picture it:** a wildlife documentary narrated by a ballistics engineer. Everything said is true; it's
only the cast that's absurd. See [the comedy formula](../comedy-captions.md).

## The four ideas

1. **Swimming is useless at this size.** A real sperm swims by beating its tail in a wave. G. I. Taylor
   worked out in 1951 how fast that gets you: about 0.7 m/s for this tail. But his result only works when
   everything is tiny and the liquid is thick, like swimming through honey. Scientists measure this with
   the *Reynolds number*: under 1 means "honey world". This cell, in air, scores about 20 million. So the
   tail does nothing, the caption says so, and the cell flies like a missile instead.
2. **Homing, the way missiles do it.** The cell uses *proportional navigation*. Sailors know the rule: if
   another boat stays at the same angle from you while it gets closer, you're going to collide. So the
   cell steers to keep the egg's direction from changing. If the egg appears to drift left, it turns left,
   three times as hard (N = 3).
3. **Shooting where it will be.** Shells take time to arrive and slow down in the air. So the gun aims at
   where the cell *will be* when the shells get there, working from noisy radar fixes that it smooths out.

If the cell reaches the egg, a real biological wave follows: a wave of calcium sweeps across the egg and
hardens its coat so no other sperm can get in. On a real egg, 0.1 mm across, that wave moves 10
millionths of a metre a second. Here everything is scaled up 140,000 times.

## What it looks like in the code

The swimming speed, worked out once at the top of the file:

```js
const WAVE_K = (2 * Math.PI) / 2.5, WAVE_W = 2 * Math.PI * 2.2, TIP_B = 0.2;
const TAYLOR_U = 0.5 * WAVE_W * WAVE_K * TIP_B * TIP_B;
```

- The tail's wave is 2.5 m long, beats 2.2 times a second, and swings 0.2 m to each side at the tip.
- Taylor's formula, ½ × beat rate × waviness × swing², gives about 0.69 m/s: a slow stroll.
- The cell actually flies at about 51 m/s, roughly 75 times faster than its tail could ever push it.

## The quest that must never be finished

The cell's steering has its sign flipped, so in the dive it turns *away* from the egg instead of towards
it. In a test of 40 attempts with the gun switched off, every one flew over the egg about 800 m up and
crashed roughly a kilometre beyond it. With the sign corrected, all 40 reached the egg.

It was found while writing these pages, on 2026-11-18. The same mistake in `intercept.js`, where the line
came from, was fixed that day. Here it stays, by the owner's ruling: **the sperm shall never be allowed to
finish its quest.** So the "fertilized" tally stays at 0, the calcium-wave ending is never seen, and the
line `-(terminal ? 4 : 3) * Vc` in `simulate()` must not be "fixed".

The joke now has a second layer, in the house style: the equation on screen says "homing", and the
homing quietly works against it.

**Related:** [antiAircraftContraception.md](antiAircraftContraception.md) · [comedy-captions.md](../comedy-captions.md)
· [randomness.md](../randomness.md) · [glow.md](../glow.md)
