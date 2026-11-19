# Force-Directed Graph: in plain English

File: `src/sketches/forceDirectedGraph.js` · Mode: 3d · Category: Graphs & Networks

**What you see:** 40 little blue balls joined by faint blue threads. They start in a tangled heap. Over a
few seconds they jostle, spread out and settle into a tidy 3D web, where connected balls sit near each
other and unconnected ones keep their distance. Balls glow brighter while they're moving fast, then dim
as they settle. Drag to look around.

**The idea behind it:** a *graph* here means a network: dots (*nodes*) joined by links (*edges*), like
friends on a social network or stations on a metro map. The hard question is how to *draw* one so it's
readable. Hand-placing 40 dots is miserable. So let physics do it:
- **Every pair of balls repels**, like magnets of the same pole. That spreads them out.
- **Every thread is a spring** that likes to be 0.5 units long. It pulls linked balls together if they're
  too far apart, and pushes them apart if they're too close.
- **A gentle pull towards the centre** stops the whole web drifting off.

Let it jiggle until the pushes and pulls balance, and the layout falls out naturally: clusters of friends
bunch up, and loners drift to the edge. This is called a *force-directed layout*, and it's how many
network diagrams you see online are drawn.

The equation on screen: repulsion is k_r ÷ d², so it gets much stronger as two balls get closer (half the
distance, four times the push). The spring is k_s × (d − d₀): it pushes in proportion to how stretched or
squashed it is.

**Where the data comes from:** no data. The network is [random](../randomness.md): each ball links to 1 to
3 others.

**How it's built:**
- [Instancing](../instancing.md) for the 40 balls, with a tiny [shader](../shaders.md) for per-ball colour.
- `LineSegments`, plain thin [lines](../lines-and-points.md), for the threads.
- A small force simulation in `update`.

**A tour of the file:**

Repulsion, for every pair:

```js
const d2 = dx * dx + dy * dy + dz * dz + SOFTENING2;
const f = kr / d2;
fx += (dx / d) * f;
```

- `d2` is the distance squared, plus a little extra (`SOFTENING2`). Without it, two balls that start
  almost on top of each other would get a near-infinite shove and rocket off screen. The comment at the
  top of the file admits that this used to happen!
- `f` is the push.
- Line 3 points the push directly away from the other ball.

The springs:

```js
const stretch = (d - REST_LENGTH) * ks;
a.vx += fx; ...
b.vx -= fx; ...
```

How far the thread is from its natural 0.5 length, times stiffness. Equal and opposite tugs on both ends.

Then calming:

```js
n.vx *= DAMPING;
```

Every step, each ball keeps only 90% of its speed, like moving through honey. That's what lets it settle
instead of wobbling forever.

**Numbers worth knowing:**
- **40** balls and about 75 threads (it varies a little each time, since the links are random).
- **780** pairs of balls checked for repulsion every frame.
- **90%**: the speed kept each step. At 99% the web would wobble for ages; at 50% it would freeze almost
  immediately, often in a tangle.
- One step happens per frame, so on a 120 Hz screen it settles twice as fast as on a 60 Hz one.

**Try this (funky):** slide **repulsion** to its maximum, 4, then **springStiffness** to its minimum, 0.2.
The web explodes outward into a big, loose, floating jellyfish. Swap them (repulsion low, springs stiff)
and it crumples into a tight knotted ball.

**Words on this page:** [graph](../glossary.md), [node](../glossary.md), [edge](../glossary.md),
[force-directed layout](../glossary.md), [damping](../glossary.md), [instancing](../glossary.md)
