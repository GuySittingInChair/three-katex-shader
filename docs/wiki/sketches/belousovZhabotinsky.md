# Belousov–Zhabotinsky: in plain English

File: `src/sketches/belousovZhabotinsky.js` · Mode: shader · Category: Reaction-Diffusion

**What you see:** a round dish, seen from above. It plays out one experiment, about 25 seconds long, and
then repeats it:
1. **Quiet dish** (first second or so): an even colour.
2. **A spark** in the centre: a ring of colour spreads outward, like a ripple in a pond.
3. **The ring is cut** across the middle: its two loose ends curl up into a pair of spirals turning
   opposite ways.
4. **Spirals fill the dish.** New waves keep peeling off them.
5. **The recipe changes:** the waves crowd closer together and race faster, then relax again.
6. **Quench:** a flood of the inhibitor wipes every wave out, and the dish goes quiet.

The "Poke the dish" button sparks a new ring at a random spot.

**The idea behind it:** the Belousov–Zhabotinsky (BZ) reaction is a real chemistry demonstration. A
liquid flips between red and blue on its own, again and again, and in a shallow dish it forms spreading
rings and spirals. Two ingredients drive it:
- an *activator*, which makes more of itself: a spark that spreads;
- a *catalyst* that slowly builds up behind each wave and holds back the activator, so the spot that has
  fired needs time to recover. That is why waves move forward but never backward.

The activator also spreads to neighbouring spots (*diffusion*), so a spark becomes a moving front. The
equation on screen is the standard simplified model of this chemistry. `u` is the activator, `v` is the
catalyst, and `f` controls how strongly the catalyst holds things back. Large `f` means the dish waits
quietly until sparked (*excitable*). Small `f` means it pulses on its own (*oscillatory*). The number λ
shown on screen tells which: negative means excitable.

**Where the data comes from:** no data. It is a simulation.

**How it's built:**
- The dish is 512 × 512 cells. Their amounts live in a hidden picture on the graphics chip, updated by
  [ping-pong rendering](../render-targets.md).
- A step shader updates every cell; event shaders make the spark and the cut.
- A display shader turns amounts into colours.
- `motion(t)` runs the script: what time it is in the experiment, and the current `f`.
  See [motion-and-latex.md](../motion-and-latex.md).

**A tour of the file:**

The long comment at the top is the expert's summary. The settings follow:

```js
const SIZE = 512; // cells across the dish
const DT = 0.02;
const RATE = 4; // chemical time units per second of motion
```

- 512 cells across.
- Each tick moves the chemistry forward 0.02 units of its own time.
- 4 units of chemical time pass each second, so that is 200 ticks a second.

How `f` changes:

```js
function fOf(tau) {
  if (tau < 45 || tau >= 95) return F_HI;
  const s = Math.sin((Math.PI * (tau - 45)) / 50);
  return F_HI - (F_HI - F_LO) * s * s;
}
```

- `tau` is the time within the experiment, from 0 to 100.
- Outside 45–95 it is held at 3.2.
- Between them it dips smoothly down to 1.4 and back up, a single smooth dip that bottoms out at τ = 70.

In `update`, the scripted events fire once each per loop:

```js
if (m.tau >= 3 && !state.done.stim) {
  state.done.stim = true;
  runEvent(renderer, state, { mode: 1, center: [0, 0], radius: 3 });
}
```

At τ = 3, spark a spot 3 units wide in the centre, and note that it has been done. A similar block cuts
the ring at τ = 8. The cut's direction turns by the *golden angle* (about 137.5°) each loop, so no two
loops look the same.

Then the ticks run, as described in [render-targets.md](../render-targets.md).

**Numbers worth knowing:**
- **25 seconds**: one experiment (100 units ÷ 4 a second).
- **262,144**: cells in the square holding the dish, each updated 200 times a second.
- **About 5**: the dish's own pulse period, in chemical time, when it oscillates.
- **137.5°**: the golden angle, the same angle sunflowers use to space their seeds.

**Words on this page:** [reaction–diffusion](../glossary.md), [diffusion](../glossary.md),
[render target](../glossary.md), [ping-pong](../glossary.md), [excitable](../glossary.md),
[golden angle](../glossary.md)
