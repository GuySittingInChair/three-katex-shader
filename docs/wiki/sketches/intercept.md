# Intercept: in plain English

File: `src/sketches/intercept.js` · Mode: 3d · Category: Physics

**What you see:** night, a dark landscape with trees, a twin anti-aircraft gun. A delta-winged drone skims
in low under the tree line, pops up into a steep climb, then tips over into a weaving dive towards the
gun. The gun swings round and opens fire, with glowing tracers arcing out ahead of the drone. A round
connects and the clock drops to slow motion. The drone comes apart, and the pieces tumble down. If the
warhead was hit, a blast sphere flashes out with fragments flying. Every attack ends with the drone shot
down, and each one plays out differently.

This is the serious original. [Anti-Aircraft Contraception](antiAircraftContraception.md) is the same
physics with a sperm cell cast as the drone.

**The idea behind it:** three pieces of real physics.
1. **Homing** (*proportional navigation*). If something's direction from you stays fixed while it gets
   closer, you will collide. Sailors use this rule to spot collisions. The drone uses it to *aim* for one:
   it steers so the target's direction stops drifting, turning 3 times as hard as the drift (N = 3).
2. **Leading the target.** Rounds take a second or more to get there, slowing down in the air as they go,
   so the gun must aim at where the drone *will be*. Its radar fixes are noisy, so it smooths them first.
   That smoothing makes the aim lag every sudden turn, which is exactly what the weaving exploits.
3. **Falling apart.** Each broken piece falls on its own, and air resistance gives each a top speed
   (*terminal velocity*): a light, flat wing flutters down slowly, while the heavy nose drops fast.
   A warhead blast grows like a classic point explosion, and its fragments fly out at the speed
   explosives can throw metal.

**Where the data comes from:** no data, only real numbers. The drone is sized like a Shahed (a common long-range attack drone; 3.5 m long,
about 200 kg), and the gun's rate of fire, round speed and drag are those of a twin 35 mm autocannon.

**How it's built:**
- **Simulate, then replay.** `simulate()` works out a whole attack at 240 steps a second and records it;
  `update` plays it back, slowing to 10% around the hit.
- Each attack has its own [seed](../randomness.md); `update` skips any seed that doesn't end in a
  shoot-down.
- [Glow](../glow.md) for tracers and blasts, [lines](../lines-and-points.md) for trails.
- Live equations with [captions](../comedy-captions.md), here played straight.

**A tour of the file:** the homing, in the dive:

```js
const vr = mul(v, -1);
const Om = mul(cross(los, vr), 1 / dot(los, los));
Vc = -dot(norm(los), vr);
acc = mul(cross(Om, norm(v)), 3 * Vc);
```

- `v` is the drone's velocity (which way it's flying, and how fast). `mul`, `cross`, `dot` and `norm` are
  small helpers in the file for sums with 3D arrows: scaling one, combining two, measuring length.
- `los` ("line of sight") is the arrow from the drone to the target.
- `Om` is how fast that arrow is swinging round: how fast the target drifts across the drone's view
  (it's Ω, the Greek letter omega, in the equation on screen).
- `Vc` is how fast the gap is closing.
- Line 4 sets `acc`, the drone's acceleration (how it speeds up and turns). It turns the drone to cancel
  that drift, 3 times as hard, and harder when closing faster. If the
  target stays still in your view while it grows, you're on course to hit it.

Until 2026-11-18 this last line had a minus sign, so the drone turned *away* in the dive. It was found
while writing these pages and fixed. Its copy in Anti-Aircraft Contraception was left as it is,
deliberately: see that page.

**Numbers worth knowing:**
- **2.3 km**: where each attack starts, at 45 m up, about the height of a 15-storey building.
- **1,100 rounds a minute** from both barrels, leaving at 1,175 m/s and down to about 850 m/s by 2 km.
- **0.75 to 1.6 km**: where the drone was shot down in a test of 40 attacks, after 20 to 200 rounds.
- **10 m/s versus 100 m/s**: a falling wing versus the falling warhead section.

**Try this:** drag the **speed** slider to 0.2 and watch a dive in near-slow-motion: the gun's tracers
are aimed ahead of the drone, at where it's predicted to be, and you can watch its weaving make the gun's
guesses go wrong.

**Words on this page:** [proportional navigation](../glossary.md), [terminal velocity](../glossary.md),
[seed](../glossary.md), [glow](../glossary.md), [lead (aiming)](../glossary.md)
