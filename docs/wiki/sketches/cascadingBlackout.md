---
summary: A toy power grid where one failed line overloads its neighbours, and they fail too, until whole towns go dark.
added: 2026-11-20
---

# Cascading Blackout: in plain English

File: `src/sketches/cascadingBlackout.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Graphs & Networks

**What you see:** a little power grid: 7 power stations (squares) and 17 towns (circles), joined by 43 power
lines. Small white dots travel along each line, showing which way the power flows; lines glow from blue to red
as they get close to their limit. For four seconds everything hums along. Then the busiest line fails (a
spark, then a dashed ghost). Its power has to go another way, the neighbouring lines turn red, and one by one
they fail too. Islands of the grid cut off from enough power stations turn dark red: blackout. Every 30
seconds it starts again.

**The idea behind it:** on an alternating-current grid, every generator and every motor spins in step with the
50 Hz rhythm (60 Hz in America). Each one can be described by its *phase*: where it is in its spin, as an
angle θ. Power flows from a node that is slightly ahead in phase to one slightly behind, and the bigger the
difference, the more power, up to a limit. This is described by the *swing equation*, a well-studied simple
model of a grid (this form: Filatrella and others, 2008):

**θ̈ᵢ = Pᵢ − α θ̇ᵢ − Σⱼ K sin(θᵢ − θⱼ)**

In words: each node's spin speeds up (θ̈, its acceleration) if it is making more power than it sends out. Pᵢ
is the power it makes (+1 for a station, −7/17 for a town, so the total is zero); α θ̇ is friction; and each
line to a neighbour j carries K sin(θᵢ − θⱼ) of power away.

When a line fails, the same power still has to get through, so it squeezes into the other lines. A *protection
relay* opens any line that stays over its limit for more than 0.3 s (to stop it melting). That moves even more
power onto the remaining lines… a *cascade*. Islands with more stations than towns speed up (shown blue);
islands with more towns slow down (shown dark red): they can't be supplied. Real blackouts (such as the
north-east United States in 2003) have spread this way.

**Where the data comes from:** no data. The grid is made up: a 6 × 4 lattice, slightly jiggled, with 5 extra
diagonal lines and 7 stations placed at random (with a fixed seed). The units are scaled (K = 2.2, α = 0.6);
the cascade, not the megawatts, is the point.

**How it's built:**
- At the start of each run the grid settles to its steady state (4,000 steps with no failures).
- Each line's limit is its steady flow times the **spare capacity** slider (1.4 to start).
- At 4 seconds the line with the biggest flow is switched off.
- The equation is stepped forward 100 times a second, always a whole number of steps, so every run is exactly
  the same.

## The equation

- The swing equation, as above.
- **Spare capacity:** the slider.
- **Lines lost:** how many of the 43 have failed so far.
- **Frequency spread:** the fastest node's speed minus the slowest's. 0 means everything spins in step.

## A tour of the file

The swing equation, in `advance`:

```js
l.flow = l.on ? K * Math.sin(th[l.i] - th[l.j]) : 0;
a[l.i] -= l.flow; a[l.j] += l.flow;
```

For each line: the power it carries from node i to node j, K sin(θᵢ − θⱼ) (none if it has failed). That power
leaves i and arrives at j.

The relay:

```js
if (Math.abs(l.flow) > l.cap) { l.over += DT; if (l.over > RELAY) { l.on = false; l.off = sim.t; } } else l.over = 0;
```

A line over its limit starts a timer; if it is still over after 0.3 s (`RELAY`), it is switched off. Drop back
under the limit and the timer resets.

## Numbers worth knowing

Measured by running the sketch's own code in Node (30 seconds each):

| spare capacity | lines lost | towns in the dark |
|---|---|---|
| 1.1 × | 29 of 43 | 16 |
| 1.4 × (the start) | 15 | 6 |
| 2 × | 8 | 3 |
| 2.5 × | 5 | 0 |
| 3 × | 1 (only the first) | 0 |

**Try this (funky):** open Params and drag **margin** (spare capacity) to 3. The run restarts; at 4 seconds
the busiest line fails as before, its neighbours glow hot for a moment, and then nothing else happens: one
line lost, no towns dark. Drag it to 1.1 and the same single failure takes out 29 lines and leaves 16 towns
dark.

**Words on this page:** [swing equation](../glossary.md#swing-equation), [phase](../glossary.md#phase),
[cascade](../glossary.md#cascade), [graph (network)](../glossary.md#graph), [simulation
step](../glossary.md#simulation-step), [seed](../glossary.md#seed)
