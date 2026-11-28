---
summary: Evolution pictured as walking uphill on a map of hills and valleys, where height is how well a body works for making a living.
added: 2026-11-27
tags: biology
---

# Adaptive landscapes

**In one sentence:** an *adaptive landscape* (also called a *fitness landscape*) is a map where every spot is one
possible kind of animal, and the height of the ground is how well that kind of animal would do, so evolution looks
like a slow walk uphill.

**Picture it:** a hilly park at night, with a crowd of sleepwalkers. Each sleepwalker always leans a little towards
whichever way the ground rises, and stumbles a little at random. Leave them long enough and they gather on the
hilltops. Nobody planned the route; "uphill, plus a stumble" is the whole rule. Now park a huge truck on the
biggest hill. The ground under it is flattened, the sleepwalkers who wander near get pushed back, and that hill
stays empty however long you wait. Drive the truck away and the hill springs back up, and they start climbing.

In this picture:

- **Where you stand** is what you are: how heavy you are, what you eat, where you live. Two numbers are enough
  for a picture; real animals have thousands.
- **Height** is *fitness*: how many surviving young a body like that would leave, in this world, right now.
- **Hills** are *niches*: ways of making a living that pay well, like "big animal that hunts in water".
- **Walking uphill** is *natural selection*: over many generations, the average body in a species shifts
  towards whatever leaves more young.
- **The stumble** is *genetic drift*: the luck of which individuals happen to breed.

**Why sketches need it:** evolution is far too slow to watch and has thousands of moving parts. The landscape
turns it into something you can see: dots climbing hills. It is also honest about what decides the outcome: the
shape of the ground (the niches), how steep it is (how strongly selection pushes), and who is standing where
already.

**Where you'll see it:** [The Empty Throne](sketches/emptyThrone.md), where the hills are five empty
big-animal niches and the truck is us. [Silly Walks, Evolved](sketches/sillyWalksEvolved.md) uses the same idea
in a different form: a genetic algorithm (a computer copy of evolution) climbing towards walkers that cover more
ground.

## The one equation

In words: *each generation, a species' average body moves a little way uphill; the steeper the ground, the
bigger the step.* The geneticist Russell Lande wrote this down in 1976:

  Δz̄ = G ∇F

- **z̄** (said "z bar") is the species' average body, its spot on the map.
- **Δ** means "the change in", here over one generation.
- **∇F** (said "grad F") is the slope of the ground: which way is uphill and how steep. F is the height.
- **G** is how much useful variety the species has to work with. More variety, bigger steps.

## What it looks like in the code

From `src/sketches/emptyThrone.js`, inside the loop that moves every species one step of 10,000 years:

```js
const gens = (DT * 1e6) / (L.tgen * 10 ** (0.25 * (s.x - L.x0)));
let nx = s.x + G_SEL * Fx * gens + Math.sqrt(2 * D_DRIFT * gens) * gauss(rnd);
```

- `gens` is how many generations fit into this step. `DT * 1e6` is the step in years (0.01 million = 10,000).
  It is divided by the generation time, which grows as the animal gets heavier (more on that on the
  [walkthrough page](sketches/emptyThrone.md)).
- `Fx` is the slope of the ground in the body-mass direction: the ∇F of the equation.
- `G_SEL * Fx * gens` is Lande's uphill step, added up over all the generations in the step.
- `Math.sqrt(2 * D_DRIFT * gens) * gauss(rnd)` is the stumble: a random nudge (`gauss` rolls a bell-curve
  random number; see [Random numbers](randomness.md)). It grows with the square root of the number of
  generations, which is how random wandering adds up: four times as many generations, twice the wander.

## Try this

- In `emptyThrone.js`, change `const G_SEL = 3e-7` to `6e-7`. Every uphill step doubles, so lineages climb
  faster, but they run into the fossil speed limit (the `evansMaxLogFold` line) and into each other. In four
  test runs the biggest animal at 10 million years was 0.6 to 1.3 tonnes either way. The limit is the sketch's
  way of saying: real evolution has never gone faster than this.
- Change `D_DRIFT = 4e-9` to `4e-7`. The stumble gets ten times bigger (the square root of 100). The dots jitter
  visibly and wander off the hilltops.

## Related

- [The Empty Throne: in plain English](sketches/emptyThrone.md)
- [Random numbers, and seeds that make them repeatable](randomness.md)
- [Silly Walks, Evolved: in plain English](sketches/sillyWalksEvolved.md)
