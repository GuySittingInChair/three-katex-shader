---
summary: A hundred people in a ring; rewire a few friendships at random and the handshakes between any two collapse, while friend groups stay tight.
added: 2026-11-20
---

# Six Degrees of Poop: in plain English

File: `src/sketches/smallWorld.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category: Graphs &
Networks

**What you see:** a ring of 100 glowing dots: people. Each is joined by faint blue lines to the two people on
either side of them: their friends. Every few seconds a rumour (about who blocked the office toilet) starts
with the person at the top and spreads, one handshake at a time: dots turn orange as they hear it, with a
white flash at the moment it arrives. Slowly, a few friendships are rewired to someone random across the ring;
they show as gold curves through the middle. Then they unwire again. The loop takes 44 seconds.

**The idea behind it:** a *network* (or *graph*) is a set of things (here, people) and the links between them
(friendships). In 1998 Duncan Watts and Steven Strogatz asked how a network can be both *cliquey* (my friends
are mostly friends with each other) and *small* (anyone can reach anyone in a few steps), like real social
networks seem to be. In a plain ring it's cliquey but huge: a rumour has to crawl round step by step. Their
surprise: rewire just a few links at random, and the shortcuts let news jump across the ring, so the number of
steps collapses, while the friend groups hardly notice. That is a *small world*. It is why the idea of "six
degrees of separation" (that any two people on Earth are linked by a short chain of acquaintances) isn't
absurd.

Two numbers are measured live, from the network on screen:
- **C (clustering):** for each person, of all the pairs of their friends, what fraction are friends with each
  other; averaged over everyone. In the plain ring it is exactly 0.5.
- **L (path length):** the average number of handshakes between two people, counted by trying every pair. In
  the plain ring it is 12.9.

**Where the data comes from:** no data. The network is made up, with a fixed [seed](../glossary.md#seed) so it
is the same every time.

**How it's built:**
- Every friendship is given, once, a random number between 0 and 1 and a list of possible new partners. When
  the rewiring chance p is bigger than a friendship's number, that friendship is moved to the first partner on
  its list who isn't already a friend. So as p grows, the same links rewire in the same order, and the network
  changes smoothly instead of reshuffling every frame.
- The handshakes are counted by *breadth-first search*: start from one person, mark everyone one handshake
  away, then everyone two away, and so on.
- Everything is drawn with circles and lines on the [2D stage](../stage-2d.md).

## The equation

- **p** is the chance that each friendship has been rewired. It sweeps from 0.0001 (almost never) to 1 (every
  friendship) and back, evenly on a [logarithmic scale](../glossary.md#logarithmic-scale) (each step ten times
  the last).
- **C/C₀** is the clustering compared with the plain ring's; **L/L₀** the path length compared with the plain
  ring's. The interesting moment is around p = 0.01: L/L₀ has already fallen to 0.61 while C/C₀ is still 0.93.
- The last line counts the shortcuts and says how far the rumour has got.

## A tour of the file

The rewiring, in `network`:

```js
if (e.u < p) {
  const t = e.cand.find((c) => c !== e.a && !adj[e.a].has(c));
```

`e.u` is that friendship's fixed random number. If it is below p, the friendship looks down its list of
possible new partners (`e.cand`) for the first one that isn't the person themselves and isn't already a
friend.

Counting handshakes, in `hops`:

```js
for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v); }
```

`q` is a queue of people to visit, in order. For each one, every friend not yet reached (`d[v] < 0`) is one
more handshake away than they are, and joins the end of the queue. Because the queue is worked through in
order, nearer people are always reached first.

Clustering, in `measure`:

```js
C += links / ((k * (k - 1)) / 2);
```

`k` friends make k × (k − 1) / 2 possible pairs; `links` is how many of those pairs are friends themselves.

## Numbers worth knowing

These were measured by running the sketch's own code in Node:

| p | C / C₀ | L / L₀ | handshakes on average |
|---|---|---|---|
| 0 (the plain ring) | 1 | 1 | 12.9 |
| 0.001 | 1.00 | 1.00 | 12.9 |
| 0.01 | 0.93 | 0.61 | 7.9 |
| 0.1 | 0.79 | 0.41 | 5.3 |
| 1 (everything random) | 0.14 | 0.26 | 3.4 |

- **0.5:** the plain ring's clustering. With 2 friends on each side, it is 3(k − 2) / 4(k − 1) for k = 4
  friends.
- **4 shortcuts** out of 200 friendships are enough (at p ≈ 0.01) to cut the average from 12.9 handshakes to
  7.9.

**Try this (funky):** in `smallWorld.js`, change `const K = 2;` to `const K = 3;`, so everyone has 3 friends
on each side (6 in all). The plain ring is now cliquier (C₀ = 0.600, from the same formula with k = 6) and
already smaller (8.8 handshakes on average instead of 12.9). Rewiring still does its trick: at p = 0.01, L/L₀
is 0.66 while C/C₀ stays 0.93. (Measured with the sketch's own code.)

**Words on this page:** [graph (network)](../glossary.md#graph), [node](../glossary.md#node), [edge
(graph)](../glossary.md#edge), [small world](../glossary.md#small-world), [clustering
coefficient](../glossary.md#clustering-coefficient), [breadth-first
search](../glossary.md#breadth-first-search), [seed](../glossary.md#seed), [logarithmic
scale](../glossary.md#logarithmic-scale)
