---
summary: A real fly's brain wiring as glowing beads you can poke and damage.
---

# Fly Connectome: in plain English

File: `src/sketches/flyConnectome.js` (plus `src/lib/flyConnectome.js` and `src/lib/flyLifWorker.js`) ·
Mode: 3d · Category: Graphs & Networks

**What you see:** a cloud of 848 tiny glowing beads in the shape of a fly's brain, laced with faint
connecting threads. Beads are dim cyan, tinted by brain region. When a signal runs through, they flare
orange and swell, and a wave of firing cascades from the senses inwards. A panel on the left lists the
regions and their health, and lets you click a neuron to inspect it, save snapshots, and compare them.
In the Params panel are the buttons: 🍬 Sugar Sense, ⚠️ Looming Threat, 🔥 Random Lesion, 🎯 Lesion
Selected, ♻️ Reset, and 💀 Torture Loop.

**The idea behind it:** a *connectome* is a wiring diagram of a brain: every nerve cell (*neuron*) and
who it talks to. Scientists have mapped a real fruit fly's whole brain, about 140,000 neurons (the
FlyWire project). This sketch is **not** that data. It is a made-up, much smaller brain, built to have
the same *shape* of wiring:
- senses (eyes spotting a looming shadow, taste cells sensing sugar)
- → relay stations (the antennal lobes)
- → thinking hubs (the mushroom bodies for learning, the central complex for steering)
- → "descending" neurons that would tell the legs and wings what to do.

Each neuron is a *leaky bucket*. Signals from other neurons pour water in. The bucket slowly leaks. If it
overflows past a line (the *threshold*), the neuron *fires*: it sends a splash to everyone it's
connected to, empties, and takes a short rest before it can fire again. This model is called
*leaky integrate-and-fire*. The equation on screen is that bucket rule, plus a damage term `d` for
lesioned regions.

A *lesion* is damage to a region. Damaged regions pass on weaker signals, and past a threshold they fail
completely. Lesion one, fire a stimulus, and watch which pathway goes dark. That's how real
neuroscientists work out which part does what.

**Where the data comes from:** generated, from a fixed [seed](../randomness.md), so every visitor gets
the same brain. Region names and rough layout follow real fly anatomy.

**How it's built:**
- [Instancing](../instancing.md): one tiny bead shape, drawn 848 times, with custom [shaders](../shaders.md)
  that colour each bead by its firing and its region's damage.
- [Lines](../lines-and-points.md) for the connections.
- The simulation runs in a *Web Worker*: a second, separate helper inside the browser, working in
  parallel, so the brain ticks steadily even if the drawing stutters.
- [Actions](../sketch-format.md) for the buttons, and a hand-built panel for the inspector.

**A tour of the file:** the heart is the worker's tick, in `src/lib/flyLifWorker.js`:

```js
potential[i] = potential[i] * leak + pendingInput[i];
...
if (potential[i] > threshold) {
  activation[i] = 1;
  potential[i] = -0.3;
  refractory[i] = refractoryTicks;
```

- `i` is the neuron's number, and each name is a list with one entry per neuron: `potential` is how full
  its bucket is, `pendingInput` what arrived since the last tick, `activation` how brightly it glows,
  `refractory` how long it must rest. (`...` marks lines left out.)
- Line 1: the bucket. Keep 85% of what was there (the "leak" slider), and add whatever arrived.
- Line 2: overflow? Then fire!
- Line 3: light up fully. The glow then fades by the "activationDecay" slider.
- Line 4: empty the bucket, slightly below zero for good measure.
- Line 5: rest for 5 ticks (the "refractoryTicks" slider) before firing again.

After firing, the neuron adds its splash to every neuron it connects to, scaled by its region's health.

**Numbers worth knowing:**
- **848** neurons in 10 regions. The biggest is a 420-neuron pool of general-purpose *interneurons* (go-betweens that connect
neurons to other neurons, rather than to the senses or the muscles).
- **10,018** connections.
- **24 ticks a second** in the worker.
- **About 165 times smaller** than the real fly brain's roughly 140,000 neurons.

**Try this (funky):** press 💀 **Torture Loop**. Every 2.5 to 4 seconds it does something random: a sugar
rush, a looming threat, a random lesion, or a full "overload burst" firing every sense at once. Now and
then it heals everything. Leave it running and watch the brain flicker between panic, damage and recovery.

**Words on this page:** [connectome](../glossary.md#connectome), [neuron](../glossary.md#neuron),
[leaky integrate-and-fire](../glossary.md#leaky-integrate-and-fire), [lesion](../glossary.md#lesion), [threshold](../glossary.md#threshold),
[Web Worker](../glossary.md#web-worker), [instancing](../glossary.md#instancing)
