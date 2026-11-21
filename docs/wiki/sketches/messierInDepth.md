---
summary: Messier's 110 objects, the Unknown Universe and Arp's peculiar galaxies at their real distances, with where each galaxy is moving, the Local Group's future, a film of the nearby universe and the collisions behind ring and shell galaxies.
added: 2026-11-21
---

# Messier's Sky, in Depth: in plain English

File: `src/sketches/messierInDepth.js` · Mode: 3d · Category: Astronomy

**What you see:** a 3D map with the Sun at the centre and rings marking distances from 1,000 to a billion
light-years. Charles Messier's 110 objects, 36 unusual objects from "the Unknown Universe" and Arp's catalogue
of peculiar galaxies float at their real distances, each as a small photograph. Click one and the camera flies
to it, and a card opens with its photo, facts and story.

This page is about the newer parts:

- **"→ Where it's moving"** is a box on every galaxy card. "→ Show motions" draws an arrow on each galaxy.
- **"⏳ The Local Group"** plays a film of our galaxy, Andromeda, Triangulum and the Large Magellanic Cloud,
  from 6 billion years ago to 10 billion years ahead.
- **"🎞 The nearby universe, flowing"** plays a film of all the matter within about 750 million light-years,
  run backwards and forwards with gravity.
- **"⏳ The collision, past and future"** appears on colliding pairs and on ring and shell galaxies: a
  simulated collision that ends looking like the photograph.

**The idea behind it:** a galaxy's light only tells us its speed towards or away from us. A map of gravity
fills in the rest, and a galaxy's shape can record a collision. See [Galaxy motions and the shapes they
leave](../galaxy-motions.md).

**Where the data comes from:**

- Positions, redshifts and distances come from NED (the NASA/IPAC Extragalactic Database).
- Photos come from the Digitized Sky Survey. The ring and shell galaxies' deep images come from the DESI
  Legacy Imaging Surveys.
- The gravity map is Cosmicflows-4 (Courtois et al. 2023).
- The Local Group's sideways motions come from Hubble, Gaia and radio-telescope measurements published by
  Salomon et al. 2021, van der Marel et al. 2019 and Kallivayalil et al. 2013.
- Every number on a card carries a label saying what kind of number it is: **Observed** (measured),
  **Inferred** (worked out from measurements), **Simulated** (from a model), or **Artistic**.

**How it's built:**

- 3D scene, camera and controls: [Scene and camera](../scene-and-camera.md), [Camera and
  controls](../camera-and-controls.md).
- The photos are drawn as many copies of one shape: [Instancing](../instancing.md).
- The two films are drawn on a plain canvas, a flat drawing surface the code paints dots and words onto
  directly, sixty times a second.
- Downloading the data: [Promises and fetch](../js-promises-and-fetch.md).

The heavy work happens before the page loads. Python scripts in `tools/motion/` and `tools/shapes/` download
and measure the data. A Node script, `tools/galaxies/fit_shapes.mjs`, tries thousands of collisions and keeps
the best. The page then reads the results as small files.

**A tour of the file:**

*1. Expansion against the galaxy's own motion* (`src/lib/galaxy/motion.js`):

```js
if (rec.vpec != null) {
  const tooBig = rec.vpecErr > 500;
```

- `rec` is the galaxy's record from `motion.json`. `rec.vpec` is its own motion along our line of sight, left
  over after the expansion is taken out. It only exists when the galaxy's distance was measured without using
  its redshift (otherwise the two can't be told apart, and the card says so).
- Line 2 checks the uncertainty. If the leftover could be off by more than 500 km/s, the card says it's too
  uncertain to pin down rather than quoting a number. Change 500 to 200 and more cards would say "too
  uncertain".

*2. The film of the nearby universe* (`src/lib/galaxy/flowView.js`): each dot moves along a straight line by
the growth factor, explained on the [galaxy motions
page](../galaxy-motions.md#what-it-looks-like-in-the-code). The dots are added up as light in a buffer, a
block of memory holding a colour for every pixel, so crowded places glow brighter:

```js
for (const d of [0, 1, bw, bw + 1]) { const at = (y * bw + x + d) * 3; F[at] += cr * wt; F[at + 1] += cg * wt; F[at + 2] += cb * wt; }
```

- `F` holds three numbers (red, green, blue) for every pixel on the screen. `bw` is the screen's width in
  pixels.
- The four offsets `0, 1, bw, bw + 1` are the pixel itself, the one to its right, the one below and the one
  diagonally below: each dot paints a 2×2 square.
- `cr`, `cg`, `cb` are the dot's colour (blue in empty places, gold in crowded ones). `wt` is how bright one
  dot is. Adding (`+=`) instead of replacing is what makes overlapping dots glow, like [additive
  blending](../colour-blending-and-gain.md).

*3. The ring and shell fits* (`tools/galaxies/fit_shapes.mjs`). Each trial orbit for a ring galaxy is kept
only if it makes sense:

```js
if (!best || best.r > 0.45 * a || best.r < 0.7 || best.t > -20 || best.t < -600 || nClose > 1) continue;
```

- `best` is the intruder's closest pass to the disk's centre, found by running the orbit backwards. `best.r`
  is how close it came (in kiloparsecs; one is 3,260 light-years) and `best.t` when (in millions of years; a
  minus sign means the past). `a` is the ring's measured radius.
- The orbit is thrown away (`continue`) unless the intruder went through the inner disk, closer than 0.45 of
  the ring's radius. It is also thrown away if the intruder came within 0.7 kpc of the centre, because the
  simulation would treat that as a merger. It must have passed between 20 and 600 million years ago, and only
  once (`nClose > 1` means more than one close pass).
- Change 0.45 to 0.2 and only nearly dead-centre hits would count. Fewer orbits would pass, and off-centre
  rings like the Cartwheel's would be harder to match.

For shell galaxies, the small galaxy that falls in is made deliberately light:

```js
const SAT = () => halo(22, 0.5, 4);
```

- `halo(22, 0.5, 4)` makes a soft ball of mass whose stars orbit at about 22 km/s, with a 0.5 kpc core, ending
  at 4 kpc. That's light enough to be torn apart completely on its first plunge. With a heavier one (the first
  version used 55 km/s), a core survived and kept orbiting, and the fit cheated by parking that core on top of
  a real neighbouring galaxy in the photo.

**Numbers worth knowing:**

- **Where it's moving:** for the 22 galaxies with at least 20 published distances (outside big clusters),
  predicted and measured motions correlate at 0.9, about 100 km/s apart. A correlation is a score from −1 to 1
  of how well two lists of numbers rise and fall together; 1 means perfectly.
- **The Local Group:**
  - Andromeda hits the Milky Way on its first approach in 82–93% of runs, about 5.5 billion years from now.
  - Triangulum is falling towards Andromeda for the first time.
- **The flow film:**
  - The Local Group has drifted about 16 Mpc (51 million light-years), roughly towards the Centaurus Cluster.
  - Running it backwards halves the clumping.
  - Structure will only ever grow about 39% beyond today's.
- **Rings:** the fitted collisions match the images at 0.62–0.82. The same disks left undisturbed score
  0.13–0.52.
  - Arp 147: the intruder went through about 50 million years ago.
  - The Cartwheel: about 84 million years ago.
- **Shells:** the fitted shells match at 0.29–0.68, while the same debris turned by 90° scores below 0. The
  fit pins down roughly where the shells lie and how far out; it does not reproduce the exact pattern of arcs.

**Try this:** open the Cartwheel Galaxy's card, press "⏳ The collision, past and future", then drag the view
round to look at the disk edge-on while it plays. You'll see the intruder punch through and the ring spread
outwards.

**Words on this page:** [redshift](../glossary.md#redshift), [peculiar
motion](../glossary.md#peculiar-motion), [Cosmicflows-4](../glossary.md#cosmicflows-4), [growth
factor](../glossary.md#growth-factor), [Zel'dovich approximation](../glossary.md#zel-dovich-approximation),
[ring galaxy](../glossary.md#ring-galaxy), [shell galaxy](../glossary.md#shell-galaxy), [cosmic microwave
background](../glossary.md#cosmic-microwave-background)
