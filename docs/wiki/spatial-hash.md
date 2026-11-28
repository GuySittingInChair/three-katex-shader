---
summary: Sorting things into numbered buckets by where they are, so each one only has to check the buckets next door for neighbours.
added: 2026-11-27
---

# Spatial hashing: finding neighbours fast

**In one sentence:** instead of checking every bird against every other bird, a *spatial hash* drops each bird
into a numbered bucket by where it is, so a bird only has to look in the handful of buckets around its own.

**Picture it:** a huge car park with 2,000 people in it, and everyone wants to know who is standing near them.
The slow way: everyone walks up to everyone else and measures the distance. That is about two million
measurements. The fast way: paint a grid on the tarmac and number the squares. Each person shouts their square
number, a clerk writes the names down square by square, and now each person reads out only the names in their
own square and the squares touching it. A few dozen names instead of 2,000.

**Why sketches need it:** flocks, crowds and particles all ask "who is near me?" for every member, every
frame. The work of the slow way grows with the *square* of the crowd: double the birds, four times the work.
With 1,800 birds that is over three million distance checks per step, too many for 60 steps a second in a
browser. With buckets the work only doubles when the birds double.

**Where you'll see it:** [Hawks and Boids](sketches/hawksAndBoids.md), which keeps up to 4,000 birds flocking
this way. (Its first version, with 260 birds, used the slow way, which was fine at that size.)

## Why "hash"?

A 3D grid big enough for a whole sky would have millions of squares, almost all empty. So the sketch doesn't
keep one box per square. It turns each square's three coordinates into one number between 0 and 16,383 with a
scrambling formula, a *hash*, and keeps only 16,384 buckets. Squares far apart sometimes land in the same bucket
(a *collision*). That is harmless: a bird found in the bucket that is actually far away fails the distance
check and is skipped.

## What it looks like in the code

From `src/sketches/hawksAndBoids.js`. The scrambling formula:

```js
const cellKey = (ix, iy, iz) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & MASK;
```

- `ix, iy, iz` are the square's coordinates: the bird's position divided by the square size (1.6 m), rounded
  down.
- Each is multiplied by a different large number (`Math.imul` multiplies whole numbers the way a computer chip
  does, wrapping round instead of growing forever). The three results are mixed with `^` ("exclusive or", which
  combines the bits of two numbers so that changing either changes the result).
- `& MASK` keeps only the last 14 bits: a number from 0 to 16,383, the bucket.

Then each step, the buckets are filled in three passes (a *counting sort*):

```js
    const k = cellKey(Math.floor(px[i] / CELL), Math.floor(py[i] / CELL), Math.floor(pz[i] / CELL));
    key[i] = k; cellStart[k + 1]++;
```

1. Every bird works out its bucket and adds one to that bucket's count.

```js
  for (let k = 0; k <= MASK; k++) cellStart[k + 1] += cellStart[k];
```

2. A running total turns the counts into starting places: bucket 5's birds start right after all the birds in
   buckets 0 to 4.

```js
  for (let i = 0; i < n; i++) sorted[fill[key[i]]++] = i;
```

3. Every bird writes its number into the next free place in its bucket's stretch of the `sorted` list.

Now "who is in bucket c?" is the stretch of `sorted` from `cellStart[c]` to `cellStart[c + 1]`. To find its
neighbours, a bird reads its own square, then the 26 squares around it, then the next shell of 98 around those,
and so on outward, until it has found its 7 nearest and nothing unsearched could be closer (the stopping rule is
explained on the [Hawks and Boids walkthrough](sketches/hawksAndBoids.md)). For each square in a shell:

```js
        const c = cellKey(ix + dx, iy + dy, iz + dz);
```

Because far-apart squares can share a bucket, a wide search can meet the same bird twice; each bird is stamped
the first time it is looked at and skipped after that.

## Try this

- In `hawksAndBoids.js`, change `const CELL = 1.6` to `0.8`. Squares half as wide hold about an eighth as many
  birds each, so each square is quicker to read, but a bird now needs more shells to reach its 7th neighbour. The
  flock behaves exactly the same (the search is exact either way); only the speed changes, one way or the other.
- Change `MASK = (1 << 14) - 1` to `(1 << 8) - 1`: only 256 buckets. Far-apart squares now share buckets often.
  The flock behaves exactly the same (collisions are filtered out by distance) but each bird checks many more
  birds, so the sketch slows down. That is the price of collisions.

## Related

- [Hawks and Boids: in plain English](sketches/hawksAndBoids.md)
- [Instancing](instancing.md): the drawing side of having thousands of things
- [Reading JavaScript 4: lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)
