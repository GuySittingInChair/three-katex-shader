---
summary: A 3D murmuration of up to 4,000 birds, each watching its 7 nearest neighbours like real starlings, hunted by hawks. Panic spreads in waves; you can paint wind, drop thermals and set out decoys.
added: 2026-11-20
updated: 2026-11-27
---

# Hawks and Boids: in plain English

File: `src/sketches/hawksAndBoids.js` · Mode: 3d · Category: Emergence

**What you see:** a dusk sky with a horizon, and a flock of 1,800 starlings (1,200 on a phone) swirling as one
dark cloud: a *murmuration*. Each bird has wings that beat harder when it speeds up or climbs and glide when it
cruises, and it leans into its turns. Two hawks hunt it, each trailing a pale wake that drifts and curls away
behind it. When a hawk comes close, birds near it flee and light up warm gold, and the gold ripples outward
through birds that never saw the hawk: panic spreading. The flock splits round the hawk and closes behind it.
Drag to look around; the camera drifts along with the flock.

The panel at the bottom right has:

- **Murmuration / Sardine run / Rumour mill:** the same simulation in three costumes. In the sardine run the
  birds are silver fish in blue water and the hawks are dolphins. In the rumour mill they are people (glowing
  dots), the hawks are scary headlines, and the gold wave is a rumour passing from person to person: an
  *information cascade*, where people copy what those around them do instead of checking for themselves.
- **Look / Wind / Thermal / Decoy:** what dragging or tapping does. *Wind*: drag across the sky to paint a gust
  (it fades after 8 seconds). *Thermal*: tap to set down a column of rising warm air; birds and hawks caught in
  it are carried up and round. *Decoy*: tap to set out a fake bird; any hawk within 60 m goes for it instead.

The Params panel has sliders for the number of birds and hawks, how sharply hawks turn, how they hunt, how big
the blind spot behind each bird is, how contagious panic is, and whether neighbours are "the 7 nearest" or
"everyone within 3 m".

**The idea behind it:** in 1987 Craig Reynolds made computer birds he called *boids*. Each one looks only at
its neighbours and steers by three rules:

1. **separation:** don't crowd them;
2. **alignment:** fly the way they fly;
3. **cohesion:** drift towards their middle.

No bird leads and no bird knows the shape of the flock, yet a flock appears: *emergence*. The first version of
this sketch was Reynolds's, flat, with 260 birds and three hawks. This version adds four things learned since:

- **Seven neighbours, not a fixed distance.** Reynolds's birds watched everyone within a set distance (called
  *metric* neighbours). In 2008 Michele Ballerini and colleagues filmed real starling flocks over Rome with
  several cameras and worked out where every bird was in 3D. They found each starling reacts to its 6 or 7
  nearest neighbours, however near or far they happen to be (*topological* neighbours). That is what keeps a
  real flock together when it stretches thin. Both rules are in the sketch; 7 nearest is the default.
- **A blind spot.** Birds can't see straight behind them. Neighbours and hawks in a cone behind each bird
  (60° wide by default) are ignored.
- **Panic spreads.** A bird that sees a hawk panics and flees. A bird next to a panicking bird copies it after a
  short reaction time, even if it saw nothing, and copies its escape direction too. Each copy is a little weaker
  than the original, so the panic travels several birds deep and then dies out: a wave runs through the flock.
  Real starling flocks under attack show waves like this.
- **Hawks hunt in different ways.** They can chase the nearest bird (Reynolds's rule), fly to where the bird is
  going to be, or pick the *straggler*: the bird furthest from its neighbours. Predators really do tend to take
  the odd one out; it is one reason animals bunch up at all (the biologist W. D. Hamilton's "selfish herd",
  1971).

**Where the data comes from:** no data. Speeds are set to roughly a starling's (8 to 13 metres per second,
about 30 to 47 km/h) and a hawk's in a chase (15 cruising, 20 attacking). Everything else is the model's own
settings.

**How it's built:**

- [Spatial hashing](../spatial-hash.md): how 1,800 birds find their neighbours 60 times a second.
- [Instancing](../instancing.md): every bird is drawn in one go from one shape.
- [Shaders](../shaders.md): the wings flap on the graphics card; the sky is a shader too.
- [Lines and points](../lines-and-points.md): the hawks' wakes and the tool markers are lines.
- [Glow](../glow.md): the bloom, turned up in the rumour mill.
- [Random numbers](../randomness.md): the flock starts from a seeded random ball, the same every time.

## A tour of the file

### 1. The settings

```js
const K_NEAR = 7;                       // topological neighbours (Ballerini et al. 2008)
```

```js
const W = { sep: 22, ali: 4.0, coh: 2.4, flee: 45 };
```

The weights of the four rules. Flee is by far the strongest, so a frightened bird stops caring about keeping
formation. Separation is strong too, but it only acts on neighbours closer than 1 metre.

### 2. Finding neighbours

The sketch sorts birds into buckets by position every step (explained on [Spatial hashing](../spatial-hash.md)),
then each bird looks through the 27 nearby buckets. A bird behind it is skipped:

```js
          if (ddx * ux + ddy * uy + ddz * uz < -cosBlind * Math.sqrt(d2)) continue;   // behind: can't see it
```

- `ddx, ddy, ddz` is the arrow from this bird to the other one, and `ux, uy, uz` is the way this bird is
  flying. Multiplying them pairwise and adding (a *dot product*) measures how much the other bird is "ahead":
  positive in front, negative behind.
- `cosBlind` turns the blind-spot angle into the same scale. If the other bird is far enough behind to be inside
  the blind cone, `continue` skips it.

Keeping the 7 nearest is done like slotting a card into a sorted hand:

```js
            while (p > 0 && kD[p - 1] > d2) { kD[p] = kD[p - 1]; kI[p] = kI[p - 1]; p--; }
            kD[p] = d2; kI[p] = j; if (m < k) m++;
```

- `kD` holds the distances of the best ones found so far, nearest first. Each one further than the new bird
  moves down a place, and the new bird goes into the gap. Anything pushed past 7th falls off the end.

### 3. Seeing a hawk: the fountain

```js
      let qx = rx - along * hdx, qy = ry - along * hdy, qz = rz - along * hdz;
```

- `rx, ry, rz` is the arrow from the hawk to the bird. `along` is how much of that arrow points along the hawk's
  line of flight. Taking that part away leaves `q`: the part pointing *sideways* from the hawk's path.

```js
      efx += w * (qx / ql + (0.6 * rx) / d - 0.3 * hdx);
```

- The escape direction is mostly sideways (`qx / ql`), partly straight away (`0.6 * rx / d`), and a little
  backwards along the hawk's path (`- 0.3 * hdx`). So birds peel off to both sides and slip past behind it:
  the flock opens like a fountain round the hawk and closes after it. `w` is stronger the closer the hawk is.

### 4. Panic spreading

```js
    const target = Math.max(s, contagion * maxA);
```

- `s` is this bird's own sighting (0 if it saw no hawk). `maxA` is the most panicked of its neighbours.
  `contagion` (0.8 by default) is how much of a neighbour's panic it copies. The bird aims for whichever is
  bigger.
- With 0.8, panic copied five times over is 0.8 × 0.8 × 0.8 × 0.8 × 0.8 ≈ 0.33, still counted as "alarmed"
  (over 0.3); six times over is 0.26, which isn't. So a wave reaches about five birds deep from each bird that
  saw the hawk. Turn contagion down to 0 and only birds that see the hawk react. Turn it to 0.98 and a wave can
  cross the whole flock.

```js
    next[i] = target > alarm[i] ? alarm[i] + (target - alarm[i]) * Math.min(1, DT / REACT) : alarm[i] * Math.exp(-DT / CALM);
```

- Rising: the bird closes the gap to its target over about `REACT` = 0.08 seconds, a reaction time, so the wave
  takes time to travel.
- Falling: panic fades away smoothly, dropping to about a third in `CALM` = 1.4 seconds.

```js
    else if (aw > 0) { const l = Math.hypot(afx, afy, afz) || 1; nfx[i] = afx / l; nfy[i] = afy / l; nfz[i] = afz / l; }
```

- A bird that didn't see the hawk takes its escape direction from its panicking neighbours (`afx` is their
  escape directions added up, the more panicked counting more). So the wave is not only a colour: the whole
  flock turns away together.

The equation's third line counts both: "alarmed 248 (saw it: 41)" means 41 birds saw a hawk and 207 more
panicked secondhand.

### 5. Holding together

```js
    if (ql > 4) { const pull = Math.min(6, 0.11 * (ql - 4)) / ql; gx += pull * qx; gy += pull * qy * 0.6; gz += pull * qz; }
```

- `ql` is how far the bird is from the middle of the whole flock. Beyond 4 metres it gets a gentle pull back:
  0.11 m/s² for every extra metre, at most 6. No bird can see the whole flock, but without this, the flock
  splinters into dozens of little groups after the first attacks, which real murmurations don't do. Models of
  real murmurations add a similar pull towards the roost and the flock.

### 6. Hawks

```js
            const sc = style === 2 ? (d < 45 ? iso[i] * 4 - d * 0.05 : -d) : -d;
```

- Every bird gets a score; the hawk picks the highest. For "nearest", the score is minus the distance, so the
  closest wins. For "straggler", it is the bird's distance to its 7th neighbour (`iso`, how alone it is) times
  4, minus a little for being far away, counting only birds within 45 m. The hawk then sticks with that target
  for 3 seconds.

```js
            const tGo = Math.min(1.5, d / HAWK_ATTACK);
```

- "Aim ahead": `tGo` is how long the hawk would take to get there at attack speed (capped at 1.5 seconds), and
  the hawk aims at where the bird will be after that long if it keeps flying straight.

A hawk catches any bird within 1 metre. After a catch it climbs away and circles for 2.5 seconds, and the bird
rejoins from the edge of the roost area.

### 7. How birds are drawn

```js
    const ampT = 0.15 + Math.min(0.95, 2.2 * work) + 0.4 * next[i];
```

- `work` is how hard the bird is speeding up plus how fast it is climbing. Wingbeats get bigger with work and
  with panic (`next[i]`), and fall back to a small flutter when gliding.

```js
      float ang = aAmp * sin(aPhase) * aWing;
```

- In the shader (the small program on the graphics card that places every corner of every bird), each wing
  corner is swung up and down by this angle. `aWing` is 1 for wing corners and 0 for the body, so only the wings
  move.

```js
    S.bank[i] += (Math.atan2(lat, 9.8) - S.bank[i]) * 0.15;
```

- `lat` is the sideways part of the bird's acceleration. A bird turning at an acceleration equal to gravity
  (9.8 m/s²) banks at 45°, as a plane would.

The hawks' wakes are their recent paths, carried off along a smooth swirl that grows with age:

```js
        const drift = age * age * 9;
```

- `age` goes from 0 at the hawk to 1 at the oldest point (about 1.8 seconds back). Old points drift up to 9
  metres along the swirl (made by the `curl` function, a sum of waves arranged so the flow has no sources or
  sinks, like real air; see [Noise](../noise.md) for the family of tricks it belongs to).

### 8. Steps

```js
    while (state.acc >= DT && steps < 3) { step(S, ctx.params); state.acc -= DT; steps++; }
```

The world always moves in steps of exactly 1/60 of a second, whatever the screen's frame rate, so the flock
behaves the same on every computer. At most 3 steps per frame: if a slow computer falls further behind, it
slows down instead of freezing.

## Numbers worth knowing

Measured with the sketch running in a browser, about 85 simulated seconds per setting, after letting it settle:

| setting | polarisation | birds caught a minute |
|---|---|---|
| no hawks | 0.97 | 0 |
| 2 hawks, nearest | 0.64 | 9.7 |
| 2 hawks, aim ahead | 0.51 | 7.0 |
| 2 hawks, straggler | 0.28 | 2.0 |
| 2 hawks, straggler, "within 3 m" neighbours | 0.35 | 6.0 |

*Polarisation* is how much the flock flies as one: the length of the average of every bird's heading arrow,
1 when all fly the same way, near 0 when every which way.

Surprise: picking stragglers catches the *fewest* birds here. The hawks lock on to lone birds at the edge, and
their dives through the flock to reach them keep scattering it (lowest polarisation). In this model, at least,
"go for the weak one" costs the hawks more chases than it saves. One run each, so treat the numbers as rough.

The "within 3 m" run also ran at about a third of the speed of the others: checking everyone within 3 m means
125 buckets per bird instead of 27.

**Sizes:** "Drawn size" 1 is life size (a starling is about 21 cm long). The default, 2.5, draws birds two and a
half times life size so they show up from a distance; hawks are drawn 2.6 times bigger than birds.

## Try this (funky)

- **Nobody copies anybody.** Set *Panic contagion* to 0. Now only birds that see a hawk react, so in the
  equation "alarmed" can never be much bigger than "saw it", and the gold glints stay close round each hawk
  instead of rippling outward.
- **Mass hysteria.** Set *Panic contagion* to 0.98 in the Rumour mill. One person sees a headline and the
  whole crowd lights up. The equation's "saw it" number stays tiny while "alarmed" goes into the hundreds.
- **A hawk with no brakes.** Set *Hawk agility* to 0.3. The hawk can now turn at only about 7 m/s² (24 × 0.3),
  a fifth of what a bird can, so it swoops through the flock in long, wide arcs while the birds dodge.

## Words on this page

[boids](../glossary.md#boids), [emergence](../glossary.md#emergence),
[polarisation](../glossary.md#polarisation), [agent-based model](../glossary.md#agent-based-model),
[murmuration](../glossary.md#murmuration), [topological neighbours](../glossary.md#topological-neighbours),
[information cascade](../glossary.md#information-cascade), [spatial hash](../glossary.md#spatial-hash),
[thermal](../glossary.md#thermal), [dot product](../glossary.md#dot-product), [seed](../glossary.md#seed)
