---
summary: A 3D murmuration of up to 4,000 birds, each watching its 7 nearest neighbours like real starlings, hunted by hawks; panic relays across the flock. Plus a rumour mill where a crowd splits into camps.
added: 2026-11-20
updated: 2026-11-28
---

# Hawks and Boids: in plain English

File: `src/sketches/hawksAndBoids.js` · Mode: 3d · Category: Emergence

**What you see:** a dusk sky with a horizon, and a flock of 1,800 starlings (1,200 on a phone) swirling as one
dark cloud: a *murmuration*. Each bird's wings beat harder when it speeds up or climbs and glide when it cruises,
and it leans into its turns. Two hawks hunt the flock, each trailing a pale wake that curls away behind it. When a
hawk comes close, birds that see it flee and light up warm gold, and the gold runs on through birds that never saw
the hawk: a panic wave. The flock splits round the hawk and closes behind it. Drag to look around; the camera
drifts with the flock.

The panel at the bottom right has:

- **Murmuration / Sardine run / Rumour mill.** The first two are the same rules in two costumes (in the sardine
  run the birds are silver fish and the hawks are dolphins). The **Rumour mill** runs *different rules*: a crowd
  of people on a plaza, each with an opinion, and headlines drifting through. See part 9.
- **Look / Wind / Thermal / Decoy:** what dragging or tapping does. *Wind*: drag across the sky to paint a gust
  (it fades after 8 seconds). *Thermal*: tap to set down a column of rising warm air; birds and hawks in it are
  carried up and round. *Decoy*: tap to set out a fake bird; any hawk within 60 m goes for it instead. (In the
  rumour mill only Look and Wind are offered; wind pushes people along.)

The Params panel has sliders for the number of birds and hawks, how sharply hawks turn, how they hunt, the blind
spot behind each bird, how easily panic is copied, and whether neighbours are "the 7 nearest" or "everyone within
3 m".

**The idea behind it:** in 1987 Craig Reynolds made computer birds he called *boids*. Each one looks only at its
neighbours and steers by three rules:

1. **separation:** don't crowd them;
2. **alignment:** fly the way they fly;
3. **cohesion:** drift towards their middle.

No bird leads and no bird knows the shape of the flock, yet a flock appears: *emergence*. This version adds what
biologists have measured since, and every rule below is something a single bird could actually sense:

- **Seven neighbours, not a fixed distance.** Reynolds's birds watched everyone within a set distance (*metric*
  neighbours). In 2008 Michele Ballerini and colleagues filmed real starling flocks over Rome with several cameras
  and found each starling reacts to its 6 or 7 nearest neighbours, however near or far they are (*topological*
  neighbours). Here each bird always finds its true 7 nearest, even a bird knocked far from the flock.
- **A blind spot.** Neighbours and hawks in a cone straight behind a bird (60° wide by default) are invisible to it.
- **Seeing the flock.** No real bird knows where the middle of the flock is. But it can see the rest of the flock
  as a dark shape across the sky, and in 2014 Daniel Pearce and colleagues showed starlings steer by that shape.
  Here each bird is drawn towards the dark patches of flock it can see, more strongly the more of its view a patch
  covers. Each bird also knows where its roost is (a place, as real starlings do) and drifts back if it strays far
  to the side.
- **Panic is relayed at full strength.** A bird that sees a hawk panics and flees. A bird that sees a neighbour
  panicking copies it a moment later, at full strength, and then rests: it can't be set off again for 8 seconds.
  Because nothing fades from bird to bird, the turn crosses the whole flock, as Alessandro Attanasi and colleagues
  measured in real starlings in 2014.
- **Birds can't see through birds.** Deep inside the flock, the view of the hawk is partly blocked by the birds in
  between.
- **Hawks hunt three ways and get confused.** They chase the nearest bird (Reynolds's rule), or steer by
  *proportional navigation* (part 7), or lock onto a *straggler*, the bird furthest from its neighbours. Every bird
  packed close round its target confuses a hawk: it may lose the target to a neighbour, and its catch range
  shrinks. This is the *predator confusion effect*, one reason animals bunch up at all.

**Where the data comes from:** no data. Speeds are roughly a starling's (8 to 13 metres per second, about 30 to
47 km/h) and a hawk's in a chase (15 cruising, 20 attacking). The papers above give the rules; the strengths of
each rule are this sketch's own settings.

**How it's built:**

- [Spatial hashing](../spatial-hash.md): how 1,800 birds find their 7 nearest neighbours.
- [Instancing](../instancing.md): every bird is drawn in one go from one shape.
- [Shaders](../shaders.md): the wings flap on the graphics card; the sky is a shader too.
- [Lines and points](../lines-and-points.md): the hawks' wakes and the tool markers are lines.
- [Glow](../glow.md): the bloom, turned up in the rumour mill.
- [Random numbers](../randomness.md): the flock starts from a seeded random ball, the same every time.

## A tour of the file

### 1. Finding the 7 nearest, wherever they are

The birds are sorted into buckets by position (see [Spatial hashing](../spatial-hash.md)). Then each bird
searches outward in shells, like the layers of an onion made of cubes: its own cube, then the 26 round it, then
the 98 round those, and so on. When can it stop?

```js
    if (metric ? reach >= R_METRIC : m >= k && reach * reach >= kD[m - 1]) break;
```

- `reach` is how far the searched cubes are sure to extend in every direction. Anything not yet searched is at
  least that far away.
- `kD[m - 1]` is the (squared) distance to the furthest of the best 7 found so far.
- So: stop once 7 have been found *and* nothing unsearched could be closer than the 7th. That makes the answer
  exact. A bird thrown 20 m out from the flock keeps searching until it reaches the flock and finds its 7 there,
  so cohesion pulls it back. (The first version searched a fixed distance only, about 6 m, so stray birds lost
  every neighbour and wandered off.)

```js
          if (j === i || seen[j] === stamp) continue;   // hash collisions can put one bird in two searched cells
```

- Far-apart cubes sometimes share a bucket (see the spatial hashing page), so a big search can meet the same bird
  twice. Each bird is stamped when it is first looked at, and skipped if it shows up again.

To keep the flock fast, a bird runs the full search only every third step (a twentieth of a second, about a
bird's reaction time). In between it keeps the same 7 neighbours and only measures where they are now:

```js
    if ((i + S.tick) % 3 === 0 || S.nbM[i] === 0) {
```

### 2. Seeing the rest of the flock

```js
      const cover = Math.min(1, (p.n * BIRD_AREA) / d2);               // fraction of the view it blots out (roughly)
```

- The flock is lumped into 8-metre patches. `p.n` is how many birds are in a patch, `BIRD_AREA` (0.03 m²) is how
  big a starling looks face-on, and `d2` is the squared distance to the patch. Together they give roughly what
  fraction of the bird's view that patch blots out, the way a coin held close hides more sky than one held far.
- The bird adds up the directions to every patch it can see (none behind it, none within 6 m, where its 7
  neighbours already steer it), each weighted by `cover`, and is drawn that way. A bird that drifts away sees the
  whole flock as one big dark shape and turns back towards it.

```js
    if (rh > ROOST_FREE) { const pull = Math.min(5, 0.06 * (rh - ROOST_FREE)) / rh; gx -= pull * rx; gz -= pull * rz; }
```

- `rh` is how far the bird is from the roost, measured along the ground. Within 20 m nothing happens; beyond, a
  gentle pull back of 0.06 m/s² for every extra metre (at most 5).

### 3. Seeing a hawk, through the flock

```js
        if (ex * ex + ey * ey + ez * ez < (PATCH * PATCH) / 4) tau += (p.n * BIRD_AREA) / (PATCH * PATCH);
```

- For every patch whose middle lies on the line between the bird and the hawk (within half a patch of it), the
  "thickness" `tau` grows by (birds in the patch × each bird's face-on size ÷ the patch's face). This is how
  light dims through fog.

```js
      const w = Math.min(1, (2 * (DETECT - d)) / DETECT) * Math.exp(-tau);
```

- How strongly the bird sees the hawk: stronger the closer it is (out to `DETECT` = 16 m), times `e^(−tau)`, the
  share of light that gets through. A `tau` of 1 lets through about a third.
- Honest note: at this flock's size the blocking is weak. The 1,800 birds fill about 20 to 70 patches (measured),
  so a patch holds roughly 25 to 90 birds, and one patch blocks only 1 to 4% of the view (90 × 0.03 ÷ 64 ≈ 0.04).
  A line through the whole flock crosses only a few patches. Real murmurations look solid because they hold tens
  of thousands of birds across hundreds of metres.

### 4. The fountain

```js
      let qx = rx - along * hdx, qy = ry - along * hdy, qz = rz - along * hdz;
```

- `rx, ry, rz` is the arrow from the hawk to the bird; `along` is the part of it lying along the hawk's flight
  path. Taking that part away leaves `q`, the part pointing *sideways* from the hawk's path.

```js
      efx += w * (qx / ql + (0.6 * rx) / d - 0.3 * hdx);
```

- The escape direction is mostly sideways (`qx / ql`), partly straight away (`0.6 * rx / d`) and a little
  backwards along the hawk's path (`- 0.3 * hdx`). Birds peel off to both sides and slip past behind the hawk, so
  the flock opens like a fountain and closes after it.

### 5. The panic relay

```js
      if (alarm[j] > thresh && alarm[j] > 0.05) {
```

- Among the neighbours it can see (the blind spot was already applied while finding them, so a bird can't copy a
  panicking bird directly behind it), a bird notices any whose panic `alarm[j]` is above the threshold. The
  threshold is 1 − *Panic contagion*: 0.2 by default.

```js
    } else if (aw > 0 && t >= rest[i] && pend[i] === Infinity) {
```

```js
      pend[i] = t + REACT; pdx[i] = afx / l; pdy[i] = afy / l; pdz[i] = afz / l; psrc[i] = src;
```

- If it has seen a panicking neighbour, isn't resting (`t >= rest[i]`) and isn't already about to react, it
  schedules its own panic `REACT` = 0.05 seconds from now, taking its neighbours' escape direction.
- When that moment comes it panics at full strength (alarm 1), and `rest[i]` is set 8 seconds ahead.

```js
      if (a < 0.5) { S.triggers.saw++; rest[i] = t + REFRACT; rootx[i] = xi; rooty[i] = yi; rootz[i] = zi; roott[i] = t; }   // a chain starts here
```

- A bird that sees the hawk itself always panics, rest or no rest. It is also where a chain of copying begins:
  it notes where and when.

**Why the 8-second rest?** Without it, a wave can run right round the flock and set off birds that have already
calmed down, again and again, like the spiral waves in the [Belousov–Zhabotinsky](belousovZhabotinsky.md) dish.
With a 3-second rest, one test run had over 66,000 relayed panics in two minutes while at most 21 birds had seen
a hawk at any moment: the flock was panicking at itself. A wave going round a 60 m flock at 13 m/s takes about
4.6 seconds, so 8 seconds is long enough to stop that.

**The wave's speed**, shown live in the equation, is measured from these chains:

```js
      rootx[i] = rootx[j]; rooty[i] = rooty[j]; rootz[i] = rootz[j]; roott[i] = roott[j];
```

- A bird that copies neighbour `j` inherits where and when `j`'s chain began. Its distance from that point, over
  the time since, is how fast the panic travelled to reach it. The sketch fits one speed to the last 300 relays.

### 6. Hawks, and confusion

```js
    const sc = style === 2 ? (d < 45 ? iso[i] / (1 + d / 15) : -d - 1000) : -d;
```

- Every bird gets a score and the hawk picks the highest. "Nearest": minus the distance. "Straggler": `iso[i]`,
  the distance to the bird's 7th neighbour (how alone it is), divided by (1 + distance ÷ 15 m), so a loner 15 m
  away counts half as much as one right here. Only birds within 45 m count. The hawk sticks with a straggler for
  up to 8 seconds, or until it rejoins the flock (its 7th neighbour closer than 1.8 m).

```js
          if (S.rnd() < conf * 0.25 * DT) {
```

- `conf` is how many of the target's 7 neighbours are within 2.5 m of it. Each one is a 25%-a-second chance that
  the hawk loses track. A straggler-hunter then looks for a new loner; the others grab whichever bird was
  alongside.

```js
          if (d < CATCH / (1 + conf / 3)) { catchBird(S, i); h.rest = 2.5; h.target = -1; }
```

- The catch range shrinks in a crowd: 1 m for a bird alone, 0.3 m for one with all 7 neighbours close round it.

### 7. Proportional navigation

Picture two boats on a collision course: from either boat, the other stays at the same angle on the horizon while
it grows. If the angle starts to drift, you're going to miss. *Proportional navigation* steers to stop the drift:
turn in proportion to how fast the angle to the target is changing. In 2017 Caroline Brighton and colleagues
filmed peregrine falcons attacking and found their paths fit this rule with a "navigation constant" of about 3.

```js
      om.crossVectors(tmp, rel).divideScalar(dist * dist);  // line-of-sight rotation rate (rad/s)
```

- `tmp` is the arrow from hawk to target and `rel` is how the target moves relative to the hawk. Their *cross
  product* (an arrow at right angles to both, as long as the area they span) divided by the distance squared is
  how fast the line of sight is turning, in radians per second.

```js
      const vc = -tmp.dot(rel) / dist;                      // closing speed
```

```js
        tmp2.crossVectors(om, tmp).multiplyScalar((PN_N * vc) / dist);
```

- The turn: 3 (`PN_N`) × closing speed × the line-of-sight turning rate, aimed sideways to the line of sight.
  If the hawk is falling behind (`vc` not positive), it chases directly instead.

### 8. Drawing

```js
    const ampT = 0.15 + Math.min(0.95, 2.2 * work) + 0.4 * next[i];
```

- Wingbeats get bigger the harder the bird is speeding up or climbing (`work`) and with panic (`next[i]`), and
  fall back to a small flutter when gliding.

```js
      float ang = aAmp * sin(aPhase) * aWing;
```

- In the shader (the small program on the graphics card that places every corner of every bird), each wing
  corner swings up and down by this angle. `aWing` is 1 on the wings and 0 on the body.

```js
    S.bank[i] += (Math.atan2(lat, 9.8) - S.bank[i]) * 0.15;
```

- `lat` is the sideways part of the bird's acceleration. A turn as hard as gravity (9.8 m/s²) banks it 45°, as a
  plane would.

```js
        const drift = age * age * 9;
```

- The hawks' wakes are their paths over the last 1.8 seconds, each point carried up to 9 m along a smooth swirl
  the older it is (the `curl` function, a sum of waves arranged so the flow has no sources or sinks, like real
  air; see [Noise](../noise.md) for the family of tricks it belongs to).

```js
    while (state.acc >= DT && steps < 3) { step(S, ctx.params); state.acc -= DT; steps++; }
```

- The world moves in steps of exactly 1/60 of a second whatever the screen's frame rate, at most 3 per frame,
  so a slow computer slows the birds down instead of freezing.

### 9. The rumour mill: different rules

A rumour isn't a hawk. People don't peel aside and close ranks behind it; they take sides. So in the rumour mill
the people walk on a flat plaza and each holds an opinion `o`, from −1 ("it's false", blue) through 0
(undecided, grey) to +1 ("it's true", pink).

```js
      S.gull[i] = rnd() < 0.6 ? 1 : -1;      // 60% take a headline at its word, 40% push back against it
```

```js
      if (d < CROWD.see) { o += gull[i] * 0.9 * DT; heard[i] = 1; told = false; }
```

- A headline within 8 m pushes a person's opinion: towards "true" if they take headlines at their word, towards
  "false" if they push back.

```js
      if (Math.abs(oj) > 0.6 && d2 < 2.25) told = true;
```

```js
    if (told) { o += gull[i] * 0.45 * DT; if (!heard[i]) heard[i] = 2; }
```

- Word of mouth: if someone within 1.5 m feels strongly, you hear the claim from them and react the way you'd
  react to the headline, at half strength. The equation counts people who saw a headline and people who only
  heard it.

```js
    if (like) o += CROWD.mu * (lo / like - oi) * DT;
```

- *Bounded confidence* (Rainer Hegselmann and Ulrich Krause, 2002): you are swayed only by neighbours whose
  opinion is already within 0.4 of yours (`CROWD.eps`), towards their average. People who disagree a lot simply
  don't move you.

```js
      else if (oi * oj < 0 && Math.abs(oi) > 0.3 && Math.abs(oj) > 0.3 && d2 < 9) { const inv = 1 / (Math.sqrt(d2) + 0.3); rx -= ddx * inv; rz -= ddz * inv; }
```

- People on opposite sides who are within 3 m edge away from each other, and walk with the like-minded, so the
  plaza sorts itself into camps (like Thomas Schelling's 1971 segregation model, where mild preferences produce
  strongly separated neighbourhoods).

```js
    if (Math.abs(oi) < 0.2) { gx -= 1.2 * vx[i]; gz -= 1.2 * vz[i]; }   // undecided: stand still
```

- The undecided stand still.

## Numbers worth knowing

All measured by running the sketch's own simulation code outside the browser, 1,800 birds, 150 simulated seconds
per run, four different random starts per hunting style (11, 23, 37 and 7):

| hunting style | birds caught a minute, by start | average |
|---|---|---|
| nearest | 6.4, 6.0, 6.8, 6.4 | 6.4 |
| proportional navigation | 5.6, 5.2, 4.0, 4.0 | 4.7 |
| straggler | 5.2, 3.2, 6.4, 3.6 | 4.6 |

**What this does and doesn't show.** In nature, hawks and falcons often go for stragglers, and they rely on the
confusion effect to make dense flocks hard. With confusion and the other changes on this page, the "nearest" hawk
went from 9.7 catches a minute (the previous version) down to 6.4. But in this model, going for the straggler still doesn't beat taking the
nearest bird. A likely reason: a hawk coming in from outside meets the edge birds first, so "nearest" already
means "an edge bird", and edge birds aren't crowded. Proportional navigation also underperforms. It is ideal
against a target flying straight; these birds swerve harder (up to 38 m/s², 61 when panicking) than the hawk can
turn (24), and peregrines use it mostly in fast dives.

- **Neighbours matter for the hawks.** With "everyone within 3 m" instead of "7 nearest", straggler-hunting hawks
  caught 10.4 birds a minute instead of about 4.6 (one run).
- **The relay.** Between 41% and 68% of all panics (depending on the run) came from copying a neighbour rather
  than from seeing a hawk.
  Turning the relay off (*Panic contagion* 0) made no measurable difference to how many birds were caught (4.0 a
  minute against 3.2 to 6.4 with it on).
- **Wave speed:** about 7 to 15 m/s here. Attanasi and colleagues measured 20 to 40 m/s in real starlings, so this
  wave is slower than the real one. Here each relay waits 0.05 s and the copied neighbour is usually about a
  metre away.
- **Holding together:** with no hawks, the flock stayed one group the whole time (counting birds within 4 m of
  each other as one group). Under attack it splits; in 10 of the 12 hunting runs the largest group held 82 to 99%
  of the birds at the end, and in the other two 38% and 50%.
- **Speed:** a full step for 1,800 birds takes about 3 milliseconds in Node; the sketch ran at about 58 frames a
  second in headless Firefox.
- **The rumour mill** (two starts, 3 minutes each): by the end nobody was undecided; 1,105 and 1,091 said true,
  695 and 709 false; 205 and 113 people had only heard it secondhand; 99 to 100% of neighbours with an opinion
  agreed with each other, and the two camps' middles had drifted 16 and 18 m apart. Note the split matches the
  60/40 split between people who take headlines at their word and people who push back: in this model, what the
  headline said never mattered.

**Sizes:** "Drawn size" 1 is life size (a starling is about 21 cm long). The default, 2.5, draws birds two and a
half times life size so they show up from a distance; hawks are drawn 2.6 times bigger than birds.

## Try this (funky)

- **Nobody copies anybody.** Set *Panic contagion* to 0. Only birds that see a hawk react, so the equation's
  "alarmed" number stays close to its "saw" number and the gold stays round each hawk.
- **Reynolds's flock.** Set *Neighbours* to 1 ("within 3 m"). Each bird now ignores anyone more than 3 m away.
- **A hawk with no brakes.** Set *Hawk agility* to 0.3. The hawk can now turn at only about 7 m/s² (24 × 0.3),
  a fifth of what a bird can, so it swoops through the flock in long, wide arcs.
- **One headline, many opinions.** In the Rumour mill, set *Hawks* to 1 and watch "only heard it" climb while
  "saw a headline" stays smaller.

## Words on this page

[boids](../glossary.md#boids), [emergence](../glossary.md#emergence),
[polarisation](../glossary.md#polarisation), [agent-based model](../glossary.md#agent-based-model),
[murmuration](../glossary.md#murmuration), [topological neighbours](../glossary.md#topological-neighbours),
[metric neighbours](../glossary.md#metric-neighbours),
[information cascade](../glossary.md#information-cascade), [spatial hash](../glossary.md#spatial-hash),
[thermal](../glossary.md#thermal), [dot product](../glossary.md#dot-product),
[proportional navigation](../glossary.md#proportional-navigation),
[confusion effect](../glossary.md#confusion-effect), [bounded confidence](../glossary.md#bounded-confidence),
[cross product](../glossary.md#cross-product), [seed](../glossary.md#seed)
