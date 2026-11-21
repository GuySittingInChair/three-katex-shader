---
summary: A see-through ball with a lamp on top casts its pattern on the plane; every way of moving the ball is a Möbius transformation.
added: 2026-11-20
---

# Stereographic Projection: in plain English

File: `src/sketches/stereographicMobius.js` · Mode: 3d · Category: Topology

**What you see:** a see-through ball resting on an endless floor, with a small lamp at its very top. A
coloured grid of squares and gold rings painted on the ball casts its shadow on the floor, stretching out to
the horizon. A few faint rays run from the lamp through the ball to the floor. Then the ball moves: it slides
sideways (the shadow slides), lifts up (the shadow grows), spins on the spot (the shadow turns), and finally
tips over, and the straight lines of the grid bend into circles. You can drag to look around. The loop is 48
seconds.

**The idea behind it:** put a lamp at the top of a ball resting on a flat floor. Every point of the ball casts
a shadow at exactly one point of the floor, and every point of the floor is the shadow of exactly one point of
the ball (except the lamp's own point, which lands "at infinity"). That one-to-one matching of a ball and a
plane is *stereographic projection*. It was known to Hipparchus over 2,000 years ago and is still used for
star charts and maps of the poles. It keeps angles the same, and turns circles on the ball into circles (or
straight lines) on the floor.

Now move the ball, keeping the lamp on top. The shadow changes in particular ways. Treat each point of the
floor as a *complex number* z (a point on a plane, written as one number with two parts). Then:
- sliding the ball moves every shadow by the same amount: z ↦ z + b;
- lifting it scales the shadow: z ↦ kz;
- spinning it about the upright turns the shadow: z ↦ e^{iθ} z (a turn by angle θ);
- tipping it over does something more surprising, a kind of turning-inside-out where lines bend into circles.

Every one of these is a *Möbius transformation*, **f(z) = (az + b)/(cz + d)**, and every Möbius transformation
comes from some motion of the ball. That beautiful fact was the subject of a famous short film by Douglas
Arnold and Jonathan Rogness, *Möbius Transformations Revealed* (2007).

**Where the data comes from:** no data.

**How it's built:**
- **The ball** is a sphere drawn by a [shader](../shaders.md): each point works out its own shadow position
  with the ball at rest and colours itself from the pattern there.
- **The floor** is a large flat square, also drawn by a shader: each point traces the line from the lamp
  through itself, finds where it meets the moved ball, undoes the ball's move, and looks up the pattern there.
  So the floor shows exactly the shadow of the ball's pattern, whatever the ball does.
- **The numbers a, b, c, d** are worked out live, in JavaScript, from where three points land: 0, 1 and
  infinity. (Three points fix a Möbius transformation.) Checked: for a tipped, slid and lifted ball, the
  formula with these numbers predicts where any other point's shadow lands to within 7 × 10⁻¹⁵, that is,
  exactly, up to rounding.

## The equation

- **f(z) = (az + b) / (cz + d)**, with a, b, c, d (complex numbers) live.
- Which move is happening.

## A tour of the file

The shadow, in the floor's shader:

```glsl
vec3 lamp = uC + vec3(0.0, 1.0, 0.0), d = vWorld - lamp;
float s = -2.0 * d.y / dot(d, d);                    // u = lamp − centre = (0, 1, 0), so u·d = d.y
vec3 Q = lamp + s * d;
```

`d` points from the lamp to this point of the floor. Along that line, the ball is met again at a distance `s`;
`Q` is that point of the ball.

The pattern's coordinates on the ball at rest:

```glsl
vec2 w = vec2(q.x, q.z) * 2.0 / max(1.0 - q.y, 1e-4);
```

For a point q of the unit ball (measured from its centre), its shadow on the floor with the ball at rest:
stereographic projection, written out.

The live numbers, in `update`:

```js
const c = cdiv(csub(w2, w1), csub(w3, w2));
```

With f(0) = w1, f(1) = w2, f(∞) = w3, and d set to 1, the other numbers follow by a little algebra: b = w1, a
= w3 c, and this c.

## Numbers worth knowing

- **k = (2 + h) / 2:** lifting the ball by h scales the shadow by this much. (The lamp is at height 2 + h;
  checked with the sketch's own code for h = 1.6 and 4.)
- **Four kinds of move** (slide, scale, turn, tip) build every Möbius transformation.
- **Infinity is a point:** on the ball, "infinity" is just the lamp's spot. When the ball tips, infinity lands
  somewhere on the floor (c stops being 0).

**Try this (funky):** lift the ball higher. In `stereographicMobius.js`, change `lift: 1.6 * lift,` to `lift:
4 * lift,`. At the top of the lift the shadow is now 3 times its resting size (k = (2 + 4) / 2), and the grid
squares at your feet grow into big tiles; a grows from 1 to 3 in the equation. (Checked with the sketch's own
code.)

**Words on this page:** [stereographic projection](../glossary.md#stereographic-projection), [Möbius
transformation](../glossary.md#mobius-transformation), [complex number](../glossary.md#complex-number),
[shader](../glossary.md#shader), [infinity (point at)](../glossary.md#infinity)
