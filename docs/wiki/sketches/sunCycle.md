---
summary: 142 years of real sunspots painted on a spinning Sun, the butterfly diagram drawing itself, and the 11-year cycle measured.
added: 2026-11-20
---

# The Sun's Eleven-Year Heartbeat: in plain English

File: `src/sketches/sunCycle.js` · Mode: 3d · Category: Astronomy

**What you see:** a glowing orange Sun, slowly turning, freckled with dark spots. The loop is 54 seconds long,
in four parts:

1. **The busiest month on record** (9 seconds). The Sun shows its spots exactly as they were in January 1959,
   the busiest single rotation in 142 years of records: 94 groups of spots at once.
2. **142 years in 25 seconds** (26 seconds). The spots change about 76 times a second, one rotation of the Sun
   after another, from 1874 to 2016. Underneath, a diagram draws itself from left to right: the *butterfly
   diagram*, which shows where on the Sun the spots were, year by year. A gold line below it shows how many
   spots there were.
3. **The record since 1749** (10 seconds). A graph of the monthly sunspot count over 277 years: 25 valleys
   with 24 whole cycles between them, each about 11 years long. Blue ticks mark the valleys.
4. **Spörer's law** (9 seconds). Blue crosses show how far from the Sun's equator the spots sit, on average,
   year by year through a cycle; a gold line fitted through them slopes down, from about 23° to about 6°.

**The idea behind it:** sunspots are dark patches on the Sun's glowing surface. Each one is a place where a
knot of magnetic field pokes through the surface and holds back the heat welling up from inside, so that patch
is cooler (a large spot's dark centre is around 1,500 degrees or more cooler than the surface around it, which
is about 5,500 °C) and looks dark beside the rest. A spot would still glow brightly if you could see it on its
own.

The number of spots rises and falls in a rhythm about 11 years long, the *solar cycle*. At the quiet bottom
(the *minimum*) the Sun can go weeks without a spot; at the busy top (the *maximum*) there can be a hundred or
more groups. And the spots follow a pattern: each new cycle's first spots appear far from the equator, around
25° north and south (on Earth, that would be about as far from the equator as Miami), and as the cycle goes
on, new spots appear closer and closer to the equator. Plot where the spots are against time and you get a row
of wing shapes: the *butterfly diagram*, first drawn by Walter Maunder in 1904, working with his wife Annie.
The steady drift towards the equator is *Spörer's law*, after the German astronomer Gustav Spörer.

What drives it is the Sun's magnetic *dynamo*: the Sun's gas is electrically charged and churning, and its
equator spins faster than its poles (about 25 days round at the equator, over 30 near the poles), which winds
the magnetic field up tighter and tighter until it bursts out as spots. The detail is still being worked out.

**Where the data comes from:** two public records, both real.
- **Every sunspot group, 1874 to 2016**: the Royal Greenwich Observatory measured the Sun every day from 1874
  to 1976, and the US Air Force and NOAA carried on after; NASA's Marshall Space Flight Center gathered it all
  into one set. 246,132 sightings of a group on a day, each with where it was on the Sun and how big. The
  project's `tools/sun/build_sun.py` boils these down to 50,473 records: one per group per rotation of the
  Sun.
- **The international sunspot number, monthly since 1749**: kept by WDC-SILSO at the Royal Observatory of
  Belgium, from the counts of many observers over the centuries, put on one scale.

**How it's built:**
- The Sun is a ball drawn by a custom [shader](../shaders.md): it paints the glowing surface, darkens it
  towards the edge (as the real Sun is darker at its rim), and adds a faint grainy texture.
- The spots are painted onto a flat picture (a map of the whole Sun's surface, like a map of the world) using
  the browser's 2D drawing tools, and the shader wraps that map round the ball. See
  [Textures](../textures.md).
- The butterfly diagram is a second picture, made from the data when it loads, shown on a flat panel in front
  of the camera.
- The graphs are drawn with [lines](../lines-and-points.md).
- `motion` turns the clock into which of the four parts is playing and how far through it is.

## The equation

It changes with each part.

**Part 1** names the rotation (Carrington rotation 1409, January 1959) and its totals: 94 groups, covering
22,956 *millionths of a hemisphere* (the unit sunspot areas are measured in: 22,956 millionths is 2.3% of the
face of the Sun turned towards us). It also reminds you the spots are drawn twice their real width, so they
show.

**Part 2** shows the date, the rotation's number of groups, and their *mean latitude*: how far from the
equator they are on average, weighted so big groups count more. Watch it fall through each cycle.

**Part 3:**
- **R = 10g + s**: the sunspot number. Count the groups (**g**), multiply by 10, and add the number of single
  spots (**s**). Rudolf Wolf invented this count in 1848, giving groups extra weight because they're easier to
  see than individual spots through a poor telescope. (Today's official number is put together from many
  observers and adjusted onto one scale, but it's built on the same count.)
- **T̄ = 11.03 ± 1.15 yr**: the average length of the 24 cycles since 1755, and how much they vary.
- **Strongest periodogram peak: 11 yr**: a second, independent measurement. The computer tried every rhythm
  from 5 to 30 years and asked which one fits the whole record best (a *periodogram*); 11.0 years wins.
- **Latest maximum: 2024.8, smoothed R = 161**: the peak of the current cycle, in late 2024.

**Part 4:**
- **|φ̄|(t) = φ₀ + k t**: Spörer's law as a straight line. **|φ̄|** is the spots' average distance from the
  equator, in degrees of latitude; **t** is years since the cycle's minimum.
- **φ₀ = 23.4°**: where the spots are at the start of a cycle.
- **k = −1.60° per year**: how fast they move towards the equator. After 11 years: 23.4 − 1.60 × 11 = 5.8°.

## A tour of the file

Turning a spot's area into a size to paint (in `update`):

```js
const rho = Math.sqrt(2 * d.area[i] * 1e-6) * SIZE_K * (180 / Math.PI);   // degrees
```

A group's area is given in millionths of a hemisphere. A hemisphere is half a ball's surface, so a patch that
size, gathered into a circle, has an angular radius (in the units mathematicians call *radians*) of √(2 × area
× 10⁻⁶). `SIZE_K` doubles it so the spots can be seen; `180 / Math.PI` turns radians into degrees.

Finding the spots' place on the ball (in the Sun shader):

```glsl
float carr = fract((lon + uRot) / 6.2831853);     // Carrington longitude, 0..1
float spot = texture2D(uMap, vec2(carr, 0.5 + lat / 3.14159265)).r;   // 1 = clear, 0 = deepest umbra
```

Every point on the ball works out its own longitude and latitude, looks up that place on the spot map, and
gets back 1 for clear surface or less for a spot. The *Carrington longitude* is the Sun's own map grid, which
turns with it (named after Richard Carrington, who started numbering the Sun's rotations in 1853, one every
27.3 days as seen from the Earth).

## Numbers worth knowing

- **11.03 years**: the average cycle, from 24 cycles. The shortest was 9.0 years (1766 to 1775), the longest
  13.6 (1784 to 1798).
- **285**: the highest smoothed sunspot number, in early 1958: the strongest cycle on record. The current
  cycle peaked at 161 in late 2024.
- **6,132 millionths of a hemisphere**: the biggest group in the Greenwich record, in 1947. An Earth-sized
  circle on the Sun is about 42 millionths, so that group covered about 146 Earths.
- **About 7,000 km**: the median group's radius, if its area were gathered into one round patch: about the
  size of the Earth (radius 6,371 km).
- **27.3 days**: one Carrington rotation, the Sun's turn as seen from the moving Earth. 1,908 of them from
  1874 to 2016.
- **7.25°**: how far the Sun's axis leans from the plane of the Earth's orbit; the ball is tilted by that
  much.
- **× 1.4**: the areas measured after 1976, by a different set of observers, are multiplied by 1.4 to match
  the Greenwich ones, as the data's own archive does.

**Try this (funky):** in `sunCycle.js`, change `const SIZE_K = 2;` to `const SIZE_K = 1;`, press Run, and
watch the first part. Every spot is now drawn at its true size: half as wide, a quarter of the area. In
January 1959, the busiest rotation on record, the spots drawn at double width cover 4.6% of the Sun's whole
surface; at true size, 1.1%. And 12 of the 94 groups become too small to draw at all (82 drawn instead of 92),
so even the Sun's busiest month is a few dark freckles on a bright face. (Worked out from the data file before
writing this.)

**Words on this page:** [sunspot](../glossary.md#sunspot), [solar cycle](../glossary.md#solar-cycle),
[butterfly diagram](../glossary.md#butterfly-diagram), [Carrington
rotation](../glossary.md#carrington-rotation), [sunspot number](../glossary.md#sunspot-number),
[periodogram](../glossary.md#periodogram), [shader](../glossary.md#shader), [texture](../glossary.md#texture)
