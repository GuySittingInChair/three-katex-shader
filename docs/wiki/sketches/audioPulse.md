---
summary: A glowing ring that ripples to the bass, middle and treble of the sound.
added: 2026-11-18
---

# Audio Pulse: in plain English

File: `src/sketches/audioPulse.js` · Mode: shader · Category: Audio-Reactive

**What you see:** a glowing ring on black, in slowly drifting rainbow colours. The ring's edge ripples: big
slow bulges, medium wiggles and fine fast crinkles, all moving at once. With no sound it breathes gently by
itself. Turn on the microphone or the music (Space, or the More menu), and the bulges follow the bass, the
wiggles the middle of the sound, and the crinkles the high notes.

**The idea behind it:** a sound can be split into low, middle and high parts, like the bass, middle and treble
knobs on a stereo. The sketch gives each part its own ripple on the ring:
- the bass bends the ring into 3 big bumps;
- the middle into 7 smaller ones;
- the treble into 13 tiny ones.

The equation on screen says exactly that: the ring's radius `r` at each angle θ is a base size `r₀`, plus bass
× (a wave with 3 bumps), plus middle × (7 bumps), plus treble × (13 bumps).

**Where the data comes from:** live sound from your microphone, or the site's music. `src/core/audioEngine.js`
splits it into 64 slices from low to high pitch. The lowest 10 slices make "bass", the next 22 "mid", and the
top 32 "treble". Each is a number from 0 (silent) to 1 (loud).

**How it's built:**
- A single [fragment shader](../shaders.md) colours every pixel.
- Three [uniforms](../uniforms.md), `uBass`, `uMid` and `uTreble`, carry the loudness in.
- A soft switch, `smoothstep`, draws the ring (see [GLSL basics: reading a shader](../glsl-basics.md)).
- The [cosine palette](../cosine-palette.md) gives the colours.

**A tour of the file:**

The shader first finds each pixel's distance and direction from the centre:

```glsl
vec2 uv = (vUv - 0.5) * 2.0;
float r = length(uv);
float a = atan(uv.y, uv.x);
```

- Line 1: `vUv` is the pixel's position, 0 to 1 across and up. Subtracting 0.5 and doubling moves the zero
  point to the middle of the screen, so `uv` runs from −1 to +1.
- Line 2: `r` is the distance from the centre.
- Line 3: `a` is the angle, the direction you'd point to reach this pixel.

Then the ripples:

```glsl
float wobble = uBass * sin(a * 3.0 + uTime * uSpeed)
             + uMid * sin(a * 7.0 - uTime * uSpeed * 1.3)
             + uTreble * sin(a * 13.0 + uTime * uSpeed * 0.7);
```

- `sin` is a [wave-maker](../sine-and-cosine.md). `sin(a * 3.0 ...)` goes up and down 3 times on the way round
  the circle: 3 bumps. Same for 7 and 13.
- `+ uTime ...` makes each set of bumps creep round. The `-` on the middle line makes those bumps turn the
  other way.
- Each set is scaled by how loud its part of the sound is: `uBass` (low notes), `uMid`, `uTreble` (high
  notes).

```glsl
float ringPos = r - 0.4 - 0.15 * wobble;
float ring = smoothstep(0.02, 0.0, abs(ringPos));
float glow = 0.03 / (0.02 + abs(ringPos));
```

- The ring sits 0.4 from the centre, pushed in and out by the wobble.
- `abs` drops the minus sign, so inside and outside the ring count the same. `smoothstep(0.02, 0.0, …)` is 1
  right on the ring and fades to 0 by 0.02 away: the sharp line.
- `glow` fades gently with distance: the soft halo. Right on the ring it's 0.03 ÷ 0.02 = 1.5 (bright); 0.1
  away it's 0.03 ÷ 0.12 = 0.25; further out it keeps shrinking but never quite reaches zero.

Finally, in JavaScript, `update` passes in the loudness. With no sound, it makes up a gentle pulse:

```js
state.uniforms.uBass.value = 0.5 + 0.5 * Math.sin(ctx.time * 0.9);
```

`ctx.time` is seconds since the sketch started. That is a slow swell from 0 to 1 and back, about every 7
seconds (one full wave takes 6.28 ÷ 0.9 ≈ 7).

**Numbers worth knowing:**
- **0.4**: the ring's size, 40% of the way from the centre to the edge of the screen.
- **3, 7, 13**: the bumps per part of the sound. They share no common factor, so the three ripples never line
  up into a repeating shape.
- **0.05**: the colour drifts a twentieth of the way round the rainbow every second, so a full cycle takes 20
  seconds.

**Words on this page:** [shader](../glossary.md#shader), [uniform](../glossary.md#uniform),
[smoothstep](../glossary.md#smoothstep), [cosine palette](../glossary.md#cosine-palette),
[radians](../glossary.md#radians)
