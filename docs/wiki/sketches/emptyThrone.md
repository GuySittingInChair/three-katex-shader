---
summary: Humans are the asteroid. Lift us off the big-animal niches and watch rats, pigs and crows evolve into new giants over 30 million years, no faster than fossils allow.
added: 2026-11-27
tags: biology
---

# The Empty Throne: in plain English

File: `src/sketches/emptyThrone.js` · Mode: 3d · Category: Biology

**What you see:** a glowing hilly landscape, seen from above at an angle. Left to right is **body mass**, from
100 grams to over a tonne; each step to the right is ten times heavier. Front to back is **way of life**: hunting
in water at the front, then eating plants, a mixed diet in the middle, meat, and finally carrion and tool use at
the back. The five big hills are five ways of making a living as a large animal, each labelled: Big diver,
Forest browser, Pack hunter, Apex predator, Clever scavenger.

At first the whole heavy side of the map, everything right of the dashed amber **44 kg** line, is pressed into a
deep amber crater, and a glowing orb of tiny city lights sits in it: **the humans**. The coloured dots are
species: green for brown rats, pink for feral pigs, blue for crows. Their trails show where each one has been
over the last 2.5 million years.

Then the orb lifts away. The crater springs up into hills, and over 30 million years the dots spread out, split
into new species, die out, and climb. When a lineage takes a hill, the hill lights up in its colour.

The panel on the right (folded up on a phone) has:

- **Humans gone / Humans stay**: the same history, with the humans leaving or never leaving.
- **Rats / Pigs / Crows**: follow one lineage; the others dim.
- **The creature view**: a sketch of the selected species next to its founder and a dashed 1.75 m human for
  scale, all drawn at true relative size. Tap any dot on the landscape to pick that species.
- **The scrubber**: drag it to move through deep time, from a million years before now to 30 million years after.

**The idea behind it:** *ecological incumbency* means that whoever already holds a way of life keeps it, because
newcomers have to compete with an animal that is already good at the job. Dinosaurs held the big-animal jobs for
about 150 million years, and mammals stayed small the whole time. Then, 66 million years ago, an asteroid
removed the dinosaurs, and within roughly 25 million years mammals had grown into elephants and whales. The jobs
were empty, so something filled them.

Today one species holds the big-animal jobs. Since modern humans spread across the world, most land mammals over
44 kg (the usual cut-off for "megafauna", which means "big animals") have disappeared. Today humans outweigh all
wild mammals put together about 8.6 to 1 (Bar-On, Phillips and Milo, 2018, counting by weight of carbon). Large
animals that turn up now are hunted, fenced or farmed. So nothing new and large can evolve while we are here:
**we are the asteroid that never stops falling**.

The sketch asks: what if that pressure was lifted? It starts from three animals that do well around people
(brown rats, feral pigs, crows), because those are the ones most likely to still be around.

**Where the data comes from:** this is a model, not a forecast, and most of its numbers are chosen, not measured.
The measured ones:

- The **44 kg** megafauna line is the standard one in studies of the Ice Age extinctions.
- The **speed limit** comes from Evans and colleagues (2012, *Proceedings of the National Academy of Sciences*),
  who measured the fastest growth in body size across the mammal fossil record. Getting 100 times heavier took
  at least 1.6 million generations, 1,000 times at least 5.1 million, and 5,000 times at least 10 million.
- **Generation times:** about 0.4 years for a brown rat, 2 for a feral pig, 3.5 for a crow (rough typical
  values).
- **8.6 to 1** human to wild mammal biomass, from Bar-On and colleagues (2018). **62 kg** is the average adult
  human body mass worldwide (Walpole and colleagues, 2012).

The shape of the hills, how strongly each body plan suits each niche, and the birth and death rates of species
are the sketch's own choices, picked so all three lineages get a fair chance. The fossil speed limit was measured
on mammals; crows are birds, so for them it is borrowed.

**How it's built:**

- [Adaptive landscapes](../adaptive-landscape.md): the hills, and the rule that moves the dots.
- [Random numbers, and seeds that make them repeatable](../randomness.md): each loop is one seeded history, so
  the "humans gone" and "humans stay" worlds start from the same dice.
- [Shaders](../shaders.md) and [uniforms](../uniforms.md): the landscape's height is worked out on the graphics
  card from the same formula, so it can rise when the humans leave.
- [Lines and points](../lines-and-points.md): species are glowing points, their histories are lines.
- [Glow](../glow.md): the bloom that makes it shine.
- [Motion and LaTeX](../motion-and-latex.md): the timeline and the live equation.

## A tour of the file

### 1. The founders and the niches

```js
{ key: 'rat', name: 'Brown rat', x0: Math.log10(0.35), y0: 0.0, tgen: 0.4, col: [0.35, 1.0, 0.62], css: '#5effa0', k: 0.35 },
```

- `x0: Math.log10(0.35)`: the rat starts at 0.35 kg. The map's left-right position is the *logarithm* of mass:
  the number of times you multiply 1 kg by ten to get there. 1 kg sits at 0, 10 kg at 1, 100 kg at 2, and
  0.35 kg at about −0.46. That way a mouse and an elephant both fit on one map.
- `y0: 0.0`: way of life in the middle (mixed diet).
- `tgen: 0.4`: one generation every 0.4 years.
- `col` and `css`: its colour in the 3D scene and in the text.
- `k: 0.35`: turns mass into body length for the creature drawing (more below).

```js
{ key: 'diver', label: 'Big diver', x: 2.3, y: -0.85, a: 2.0, fit: [1.25, 0.6, 0.55] },
```

- A hill centred on 10^2.3 ≈ 200 kg (about a large seal), far towards the water side (`y: -0.85`).
- `a: 2.0`: how tall the hill is.
- `fit: [1.25, 0.6, 0.55]`: how well a rat, pig and crow body plan suits it. Rats swim well, so the hill is
  25% taller for them; for a crow it is about half as tall. This is an assumption, and the code says so.

### 2. The humans

```js
const s = 1 / (1 + Math.exp(-(x - X44) / HUMAN_EDGE));
F -= HUMAN_DEPTH * H * s; Fx -= (HUMAN_DEPTH * H * s * (1 - s)) / HUMAN_EDGE;
```

- `s` is an S-shaped switch (a *sigmoid*): close to 0 for light animals, exactly 0.5 at 44 kg, close to 1 for
  heavy ones. `HUMAN_EDGE = 0.22` sets how gradual the switch is.
- `F -= HUMAN_DEPTH * H * s` lowers the ground by up to `HUMAN_DEPTH = 3.2` wherever the switch is on. `H` is 1
  while the humans are here and 0 when they are gone.
- Worked numbers with the humans here: at 10 kg the ground drops by about 0.16; at 44 kg by 1.6; at 100 kg by
  2.7, and past 200 kg by more than 3. The four hills centred above 100 kg are at most about 2.9 tall, even for
  the body plan that suits them best, so with the humans here they are flattened into a crater. The pack-hunter
  hill, centred at 40 kg, sits just under the line and is only partly squashed, which is why in the "humans stay"
  world the biggest animals stop at around 40 kg.
- The second half of the line works out how steep that drop is (the slope `Fx`), which is what the dots feel.

### 3. One step of evolution

```js
const gens = (DT * 1e6) / (L.tgen * 10 ** (0.25 * (s.x - L.x0)));
let nx = s.x + G_SEL * Fx * gens + Math.sqrt(2 * D_DRIFT * gens) * gauss(rnd);
```

- A step is `DT = 0.01` million years: 10,000 years.
- Generation time grows with size: multiply the mass by 10,000 and the generation time goes up 10 times
  (10,000 to the power ¼). That is the *quarter-power rule*, seen across mammals: big animals live slower.
  A rat lineage that reaches 350 kg, 1,000 times its founder, breeds about every 2.2 years instead of 0.4.
  So it evolves more slowly per year exactly when it is big.
- The second line is Lande's uphill step plus a random stumble, explained on
  [Adaptive landscapes](../adaptive-landscape.md).

### 4. The fossil speed limit

```js
const EVANS = [[0, 0], [1.6e6, 2], [5.1e6, 3], [10e6, Math.log10(5000)]];
```

Each pair is (generations, how many times ten heavier). `[1.6e6, 2]` means "1.6 million generations to grow
10 × 10 = 100 times". Between the measured points the sketch draws straight lines. Then, every step:

```js
nx = Math.min(nx, s.xstart + Math.max(0.3, evansMaxLogFold(s.gens)));
```

- `s.xstart` is the lineage's size when the humans left; `s.gens` counts its generations since then.
- `evansMaxLogFold(s.gens)` reads the limit off the line. `Math.max(0.3, ...)` lets any species double (10^0.3
  ≈ 2) straight away, because small changes in size are known to happen fast (island animals often do it).
- `Math.min` means: if selection would push the species bigger than the fossil record has ever seen in that many
  generations, it stops at the limit. The equation's fifth line shows this check live, for the biggest animal on
  the map: "×14 in 3.6M gens (Evans: ≥ 0.9M)" means it is 14 times heavier than its ancestor was at release,
  took 3.6 million generations, and the fastest mammals ever needed at least 0.9 million for that.

### 5. New species and extinctions

```js
const mu = MU + 1.2 / (1 + Math.exp(3 * (s.F - 0.2)));
```

- `mu` is the chance per million years of dying out. `MU = 0.12` is the background. The second part adds up to
  1.2 more for species stuck low on the landscape (low `F`), so species in valleys die out more often.

```js
if (rnd() < LAMBDA * Math.max(0, 1 - counts[s.lin] / CAP) * DT) {
```

- A species splits into two with chance `LAMBDA = 0.9` per million years, multiplied down as its lineage fills
  up: at `CAP = 26` living species the lineage stops splitting. The new species starts right next to its parent.
- There is also *crowding*: species close together on the map lower the ground for each other (the `CROWD`
  lines), so they push apart, and a hill that is already taken is lower for anyone else. That is incumbency
  again, built into the model: whoever reaches a hill first holds it.

### 6. Two worlds, prepared ahead

```js
if (!state.runs.has(k)) state.runs.set(k, createRun(1 + ((((slot % 997) + 997) % 997) * 7919), world === 1));
```

- Each time round the loop (`slot`), a new seed (see [Random numbers](../randomness.md)) makes a new history.
  The "humans gone" and "humans stay" worlds use the same seed, so they are identical up to the moment the humans
  would leave, and differ only after.
- A whole history (3,100 steps, stored every 50,000 years: 621 snapshots) is computed when needed. The next
  loop's histories are computed 60 steps per frame in the background (`run.step(60)`), so changing loops doesn't
  stutter.

### 7. The timeline

```js
const PRE = 9, LIFT = 4, RAD = 46, HOLD = 6, RESET = 2.5;
```

In seconds: 9 for "today" (the last million years with humans), 4 for the orb lifting, 46 for 30 million years
of evolution, 6 to hold the result, 2.5 to rewind. The 46 seconds are not evenly spread: time runs slower at
the start, where most of the action is (`RAD_POW = 1.7`), so the first million years get about 6 seconds and
the last ten million about 10.

### 8. Drawing the creature

```js
const lenM = L.k * Math.cbrt(10 ** x);            // body length in metres, from mass
```

- Body length grows with the *cube root* of mass: 1,000 times heavier is 10 times longer, because weight fills
  a body in all three directions.
- `k` is set from the founders: a 0.35 kg rat is about 0.25 m long (head and body), an 80 kg pig about 1.4 m,
  a 0.5 kg crow about 0.45 m.
- The drawing is built from a few ellipses and lines whose proportions follow the species' position on the map:
  towards water, legs shrink into flippers and a rat's tail flattens into a paddle; towards meat, legs lengthen,
  jaws and a pig's tusks grow; a crow above 2 kg loses flight, stands upright on long legs, and its wings
  shrink. It is a body plan sketch, not a reconstruction.
- The names follow the same rules: genus *Megarattus* for a rat over 44 kg, *Terrocorvus* ("ground crow") for
  a flightless crow, and a Latin word for the niche: *natator* (swimmer), *frondator* (leaf-stripper),
  *lupinus* (wolf-like), *tyrannus* (tyrant), *faber* (craftsman).

## Numbers worth knowing

- **44 kg**: the usual megafauna line, about the weight of a large dog or a small adult person.
- **8.6 to 1**: humans outweigh all wild mammals put together.
- **1.6 million generations**: the fewest the fossil record shows for a mammal lineage to get 100 times heavier.
  For a rat that is at least 640,000 years even if generation time did not grow; in practice it grows, so
  longer.
- **About 25 million years**: how long mammals took after the dinosaurs to reach their biggest sizes. The sketch
  runs 30 million.
- **What came out of test runs** (eight seeds, run in Node before building the visuals): with the humans gone,
  by 30 million years the biggest rats were 100–650 kg, pigs 0.6–1.3 tonnes, crows 15–25 kg flightless
  scavengers (or they stayed small when another lineage took their hill first). With the humans staying, nothing
  got past about 40 kg in any run.

## Words on this page

[adaptive landscape](../glossary.md#adaptive-landscape), [fitness](../glossary.md#fitness), [niche](../glossary.md#niche), [ecological incumbency](../glossary.md#ecological-incumbency), [megafauna](../glossary.md#megafauna), [genetic drift](../glossary.md#genetic-drift), [sigmoid](../glossary.md#sigmoid), [seed](../glossary.md#seed), [logarithmic scale](../glossary.md#logarithmic-scale)
