# Sine and cosine: the wave-makers

**In one sentence:** `sin` and `cos` are two built-in calculations that turn a steadily growing number
into a smooth up-and-down wave, between −1 and +1, forever.

**Picture it:** a Ferris wheel seen from the side. As the wheel turns at a steady speed, your seat rises
to the top, sinks to the bottom, and rises again, smoothly, never stopping. Write down your seat's height
every second and you get a wave. That height is the *sine* of how far the wheel has turned. Your seat's
position left-to-right makes the same wave, but a quarter-turn behind: that's the *cosine*.

Put them together and you have a point going round a circle: cosine says how far across, sine says how
far up.

**Why sketches need it:** almost everything that moves on this site goes up and down, back and forth, or
round and round: a wobbling ring, a breathing shape, a camera circling a scene, a rainbow that cycles.
One `sin` gives smooth back-and-forth with no sudden jumps, and it repeats forever without running out.
151 of the 166 sketch files use one.

**Where you'll see it:** written `sin(…)` and `cos(…)` in [shaders](shaders.md), and `Math.sin(…)` and
`Math.cos(…)` in JavaScript.

## The numbers that matter

- The answer is always between **−1 and +1**. To get something from 0 to 1 instead (a brightness, say),
  sketches write `0.5 + 0.5 * sin(…)`.
- What goes in is an angle: how far round the wheel. Angles here are in *radians*, where a full turn is
  about **6.28** (that's 2π; written `6.2831` or `TAU` in the code). A half turn is 3.14, a quarter 1.57.
- So `sin(time)` makes one full wave every 6.28 seconds. `sin(time * 2.0)` goes twice as fast.

## What it looks like in the code

From `src/sketches/audioPulse.js`, the ring that wobbles to music:

```glsl
float wobble = uBass * sin(a * 3.0 + uTime * uSpeed)
             + uMid * sin(a * 7.0 - uTime * uSpeed * 1.3)
             + uTreble * sin(a * 13.0 + uTime * uSpeed * 0.7);
```

`a` is the direction from the centre (the angle round the ring). Each line is one wave running round
the ring:
- `a * 3.0`: three bumps round the ring. `a * 7.0` makes seven, `a * 13.0` thirteen.
- `+ uTime * uSpeed`: the time keeps sliding the wave along, so the bumps travel round. The middle line
  has `−`, so its bumps travel the other way.
- `uBass`, `uMid`, `uTreble` set how tall each wave is: how loud the low, middle and high notes are.

Added together, the three waves make the ring's lumpy, living outline: a few big lumps for the bass, many
fine ripples for the treble.

And a circle, from `src/sketches/cmbPlanck.js` (The Oldest Light), where the camera looks around the sky:

```js
look.set(-Math.sin(a), 0.15 * Math.sin(ctx.time * 0.11), -Math.cos(a));
```

`Math.sin(a)` and `Math.cos(a)` together walk a point round a circle as the angle `a` grows (the minus
signs only choose where it starts). The middle number, a small slow sine, nods the gaze gently up and
down.

**Try this:** in `audioPulse.js`, change `a * 3.0` to `a * 1.0`. The bass no longer makes three bumps:
it pushes the whole ring off-centre to one side, and the bulge travels round as the music plays.

**Related:** [cosine palette](cosine-palette.md) (cosine making colours) ·
[glsl-basics.md](glsl-basics.md) · [camera-and-controls.md](camera-and-controls.md)
