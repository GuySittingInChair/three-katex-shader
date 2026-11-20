---
summary: Dice rolls in code. A seed makes the same rolls come out every time.
---

# Random numbers, and seeds that make them repeatable

**In one sentence:** sketches roll dice with `Math.random()`, and when they need the *same* "random"
result every time, they use a *seed*: a starting number that makes the dice roll identically.

**Picture it:** shuffling a deck of cards. `Math.random()` is a fresh, honest shuffle every time. A seeded
generator is a magician's shuffle. It looks random, but if the magician starts from the same deck order
(the seed), the cards come out in exactly the same order, every single time.

**Why sketches need it:** randomness makes things lively: birds start in random spots, balls bounce left
or right. But sometimes you want "random, but the same random". The fly brain should be wired the same
way for everyone, so a neuron you click today is the same one tomorrow. Each attempt in Anti-Aircraft
Contraception should be different from the last, but the same on everyone's screen.

## Fresh dice: `Math.random()`

From `src/sketches/galtonBoard.js`, where a ball hits a peg:

```js
ballState.xTarget[i] += (Math.random() < 0.5 ? -1 : 1) * (PEG_SPACING / 2);
```

- `Math.random()` gives a number between 0 and 1, different every time.
- `< 0.5` is true half the time: a coin flip.
- Heads, the ball moves half a peg-gap left (`-1`). Tails, right (`1`).

Other uses: `boidsFlock.js` (random starting birds), `diffusionLimitedAggregation.js` (random steps),
`gameOfLife.js` (`Math.random() < 0.35` makes about 35% of cells start alive).

## Loaded dice: a seeded generator

From `src/sketches/antiAircraftContraception.js`:

```js
function rngOf(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
```

- `rngOf(seed)` builds a dice-roller from a starting number.
- `s` is its secret current number.
- Each roll multiplies `s` by 16807 and keeps the remainder after dividing by 2,147,483,647. That
  scrambles it thoroughly, but in a fixed way. The two numbers aren't magic to you: they're a
  well-tested pair, published in 1988 (Park and Miller's "minimal standard"), that goes through about
  two billion different values before repeating.
- Dividing by the same big number gives a result between 0 and 1, like `Math.random()`.

Same seed in, same rolls out. The sketch uses `2000 + loop × 7919` as the seed (`loop` is the attempt number, and 7919 is a
big, odd-looking jump, so neighbouring attempts get very different seeds), so attempt 1, attempt 2
and attempt 3 each get their own seed. That way they differ from one another, yet they're identical for
everyone who watches.

`src/lib/flyConnectome.js` uses another classic recipe, `mulberry32`, with seed 1. That's why the fly's
brain is wired the same way on every visit.

## Bell curves from flat dice

```js
r.n = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(6.283185 * r());
```

Flat dice make every number equally likely. Real-world wobble (a gun barrel's shake, a radar's error)
is usually small, occasionally large: a *bell curve*. This line, the Box–Muller trick, turns two flat
rolls into one bell-curve roll. You don't need to follow the math. It's a well-known recipe, used like a
kitchen gadget. (Two small details: `6.283185` is one full turn, 2π, and `1e-12`, a millionth of a
millionth, is added so the recipe never takes the logarithm of exactly zero, which has no answer.)

**Try this:** in `gameOfLife.js`, change `Math.random() < 0.35` to `< 0.05`. Only 1 cell in 20 starts
alive. Most die at once of loneliness (fewer than 2 neighbours), and the board goes nearly dark within a
second or two.

**Related:** [Noise: randomness that looks natural](noise.md) · [Galton Board](sketches/galtonBoard.md) ·
[Anti-Aircraft Contraception](sketches/antiAircraftContraception.md)
