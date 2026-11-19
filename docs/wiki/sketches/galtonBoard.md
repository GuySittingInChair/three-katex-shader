# Galton Board: in plain English

File: `src/sketches/galtonBoard.js` · Mode: 3d · Category: Probability

**What you see:** a triangle of grey-blue pegs, ten rows deep, like a pinball machine with no
flippers. Orange balls rain down from the top, bouncing left or right off each peg. Underneath, green bars
grow as balls land, and they build a hill shape: tall in the middle, low at the edges. After 300 balls, the
bars reset and the hill builds again.

**The idea behind it:** every time a ball hits a peg, it's a coin toss: left or right, 50/50. Ten pegs,
ten coin tosses. To land at the far left, a ball must go left all ten times, which is like flipping ten
heads in a row: about 1 chance in 1,000. To land in the middle, it needs five lefts and five rights *in any
order*, and there are 252 different orders that do it. So the middle fills up 252 times faster than the
edge.

That hill is the *binomial distribution*. With many more rows, it becomes the famous *bell curve*, the
shape of people's heights, exam marks and measurement errors. Francis Galton built a real one, with
wooden pegs and lead shot, in the 1870s to show this. It's also called a *bean machine*.

The equation on screen: the chance of landing in slot k is (ways to choose k rights out of 10) × (½)¹⁰.
The `binom` symbol, the one that looks like a fraction without a line, counts the ways.

**Where the data comes from:** no data. [Coin flips](../randomness.md) from `Math.random()`.

**How it's built:**
- Three [instanced meshes](../instancing.md): 55 pegs, 60 balls and 11 bars.
- Each ball's fall in `update`: a coin flip at each row, then a smooth slide sideways.
- [Orbit controls](../camera-and-controls.md).

**A tour of the file:**

The coin flip, when a ball reaches the next row:

```js
while (ballState.rowIndex[i] < ROWS && ballState.y[i] <= rowY(ballState.rowIndex[i])) {
  ballState.xTarget[i] += (Math.random() < 0.5 ? -1 : 1) * (PEG_SPACING / 2);
  ballState.rowIndex[i] += 1;
}
```

- "While this ball has fallen past its next row of pegs…"
- "…step half a peg-gap left or right at random…"
- "…and count that row as done."

The slide, so balls glide instead of teleporting:

```js
ballState.xVisual[i] += (ballState.xTarget[i] - ballState.xVisual[i]) * Math.min(1, ctx.delta * 8);
```

Each frame, the ball moves about an eighth of the way towards where the coin sent it. That's a classic
"ease towards a target" trick: fast at first, then gently settling.

Landing:

```js
let k = Math.round(ballState.xTarget[i] / PEG_SPACING + ROWS / 2);
histogram[k] += 1;
```

Work out which slot (0 to 10) it ended in, and add one to that bar's count. Bars are drawn relative to the
tallest one, so the hill always fills the same height.

**Numbers worth knowing:**
- **1,024** possible left/right paths through 10 rows (2 × 2 × … ten times).
- **24.6%**: the chance of landing in the middle slot (252 ÷ 1,024).
- **0.1%**: the chance of either end slot (1 ÷ 1,024). In a run of 300 balls, you'll usually see none
  there at all.
- **300**: balls per round before the bars reset.

**Try this (funky):** in `galtonBoard.js`, change `Math.random() < 0.5` to `Math.random() < 0.8`. Now every
peg is rigged, with 80% of bounces going left (the `-1` side). The hill slides off to the left and leans,
the way a loaded coin would.

**Words on this page:** [probability](../glossary.md), [binomial distribution](../glossary.md),
[bell curve](../glossary.md), [histogram](../glossary.md), [instancing](../glossary.md)
