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
The `binom` symbol, the one that looks like a fraction without a line, counts the ways. For example,
to land in slot 1 you need exactly one "right" among the 10 bounces; it could be the 1st bounce, or the
2nd, … or the 10th: 10 ways. For the middle slot (5 rights) there are 252 ways, which is why the middle
bar is tallest.

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

`ballState` holds every ball's numbers in lists, and `[i]` picks ball number `i`: its row so far
(`rowIndex`), its height (`y`) and where it's heading (`xTarget`). Read the lines as:
- "While this ball has fallen past its next row of pegs…"
- "…step half a peg-gap left or right at random…" (`Math.random() < 0.5` is a coin flip: a random
  number below a half. `? -1 : 1` means "if so, left; if not, right".)
- "…and count that row as done."

The slide, so balls glide instead of teleporting:

```js
ballState.xVisual[i] += (ballState.xTarget[i] - ballState.xVisual[i]) * Math.min(1, ctx.delta * 8);
```

`xVisual` is where the ball is drawn, and `xTarget` where the coin sent it. `ctx.delta` is the time
since the last frame (about 1/60 of a second), so `ctx.delta * 8` is about 0.13, and `Math.min(1, …)`
stops it ever going past 1. Each frame, the ball moves about an eighth of the way towards its target. That's a classic
"ease towards a target" trick: fast at first, then gently settling.

Landing:

```js
let k = Math.round(ballState.xTarget[i] / PEG_SPACING + ROWS / 2);
histogram[k] += 1;
```

`PEG_SPACING` is the gap between pegs, so dividing by it counts how many gaps from the middle the ball
ended up (negative for left). Adding `ROWS / 2` (5) shifts that so the far left is 0. `Math.round`
rounds to the nearest whole number, so `k` is the slot (0 to 10) it ended in.
`histogram[k] += 1` adds one to that bar's count. (A *histogram* is a bar chart of counts.) Bars are drawn relative to the
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
