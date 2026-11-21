---
summary: How we know where galaxies are going, and how a collision long ago can be read from a galaxy's shape today.
added: 2026-11-21
---

# Galaxy motions and the shapes they leave

**In one sentence:** a galaxy's light tells us only how fast it moves towards or away from us, but a map of
all the matter around us tells us how gravity is pulling it, and its shape can tell us about a collision that
happened millions or billions of years ago.

**Picture it:** you're on a beach at night and can only see boats by their lights. You can tell whether a boat
is coming towards you or going away by how its engine's pitch changes, like a passing ambulance. That's the
**redshift**. You can't hear it moving sideways. But if you know where the currents run, you can guess the
rest. And if one boat's wake is a ring of foam, something dropped into the water there not long ago.

**Why sketches need it:** Messier's Sky puts 372 galaxies at their real places. Without motion they'd be
frozen. With it, each card can say where its galaxy is heading. The sky can show arrows, the neighbourhood can
be played as a film, and some strange shapes can be explained as old collisions.

**Where you'll see it:** in [Messier's Sky, in Depth](sketches/messierInDepth.md): the "→ Where it's moving"
box on every galaxy card, "→ Show motions", "⏳ The Local Group", "🎞 The nearby universe, flowing", and "⏳ The
collision, past and future" on the ring and shell galaxies.

## The three pieces

**1. The redshift: speed along our line of sight (measured).** Light from a galaxy moving away from us is
stretched to longer, redder wavelengths. How much it's stretched gives the speed. It can't tell us anything
about sideways motion.

**2. Expansion versus the galaxy's own motion (worked out).** Space itself is stretching, so distant galaxies
move away from us faster the further they are: about 70 km/s for every megaparsec (3.26 million light-years).
That's the **Hubble law**. If a galaxy's distance has been measured some other way (from stars of known
brightness, for instance), we can subtract the expansion. What's left over is its own motion, the **peculiar
motion**, usually a few hundred km/s. First we take out our own motion: the Sun moves at 370 km/s relative to
the afterglow of the Big Bang (the **cosmic microwave background**), which serves as the universe's own
"standing still".

**3. The map of gravity (predicted).** Astronomers measured the distances of about 56,000 galaxies
(**Cosmicflows-4**). From their leftover motions they worked out how matter must be spread out to pull them
that way, and from that the full 3D velocity at every point. Read off at a galaxy's position, it predicts the
sideways motion too. The map is smooth on scales of about 36 million light-years, so it shows big flows
(towards the Virgo Cluster, the Great Attractor, the Shapley Supercluster), not a galaxy's orbit inside its
own cluster.

## Running it as a film

If every bit of matter keeps moving the way it moves now, gravity's effect simply grows with time. Each bit
travels along a straight line, and how far along that line it has got is set by one number, the **growth
factor**. That is the **Zel'dovich approximation** (1970). Running the growth factor down towards zero runs
the film backwards to the smooth early universe; running it up runs it into the future. Dark energy is making
the universe expand faster and faster, so the growth factor stops growing: in the model, structure only ever
grows about 39% more than it has now.

## Shapes left by collisions

- **Ring galaxies.** A smaller galaxy drops straight through a disk galaxy near its centre. For a moment every
  star is pulled inwards, then let go. Their orbits swing in together and out together, and that outswing
  travels outwards like a ripple from a stone dropped in a pond (Lynds & Toomre 1976). The Cartwheel Galaxy is
  the famous example.
- **Shell galaxies.** A small galaxy falls almost straight into a big round one and is torn apart. Its stars
  keep swinging back and forth through the centre, each with its own period, and pile up where they turn
  round. They gather into thin arcs at growing distances, on alternating sides (Quinn 1984).

## What it looks like in the code

`src/lib/galaxy/flowView.js` moves each dot of matter along its straight line:

```js
proj(Q[q] + k * P[q], Q[q + 1] + k * P[q + 1], Q[q + 2] + k * P[q + 2], o);
```

- `Q[q]`, `Q[q + 1]`, `Q[q + 2]` are the dot's position today (three numbers: across, up, and depth).
- `P[q]` and the two after it are the straight line it travels along, worked out from the gravity map's
  velocity at that spot.
- `k` is the growth factor minus 1. It is 0 now, −1 at the very start, and about +0.39 in the far future. So
  `Q + k × P` is where the dot is at the chosen time.
- `proj(…)` turns that 3D position into a point on the screen.

## Try this

Open the flow film, press "From the early universe" and watch the gold dots. They're the ones in crowded
places today, and they gather. Then press "Show the expansion too": with the stretching of space put back, the
whole picture starts as a tiny speck.

## Related

[Messier's Sky, in Depth](sketches/messierInDepth.md) · [Parallax: measuring
distance](parallax-and-distance.md) · [Glossary](glossary.md)
