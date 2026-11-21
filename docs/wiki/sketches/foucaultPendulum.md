---
summary: A pendulum over the spinning Earth in time-lapse: seen from the stars the floor turns beneath it; seen from the floor, the swing turns.
added: 2026-11-20
tags: astronomy
---

# Foucault's Pendulum: in plain English

File: `src/sketches/foucaultPendulum.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Physics

**What you see:** two round floors with compass marks (N, E, S, W), each with a glowing pendulum bob swinging
across it and a fading orange fan of its recent swings. On the left, "seen from the stars": the swing stays in
one line while the floor slowly turns underneath. On the right, "seen standing on the floor": the floor stays
put and the line of the swing slowly turns. Every 12 seconds the pendulum moves to a new place: the North
Pole, Oslo, Paris, Quito (on the equator) and Sydney. One second is one hour.

**The idea behind it:** in 1851 Léon Foucault hung a 28 kg ball on a 67 m wire from the dome of the Panthéon
in Paris and set it swinging. Over the hours, the line of its swing slowly turned, clockwise: proof, visible
to anyone, that the Earth spins.

Nothing pushes the swing round. A pendulum keeps swinging in the same direction in space; it is the floor that
turns underneath it, carried round by the Earth. At the North Pole, the floor makes one full turn in a day
(23.93 hours, the Earth's turn measured against the stars). Away from the poles, only part of the Earth's spin
turns the floor about its own upright, a fraction sin φ, where φ is the latitude. So the swing turns at

**ω = Ω sin φ = 15.04° per hour × sin φ**, once round every **23.93 h / |sin φ|**.

In Paris that is 11.3° an hour, 31.8 hours for a full turn. At the equator, sin 0° = 0: it doesn't turn at
all. In the southern hemisphere sin φ is negative: it turns the other way, anticlockwise.

**Where the data comes from:** the latitudes of the five places, and the length of the Earth's turn against
the stars, 23.9345 hours.

**How it's built:**
- Both floors use the same formula. Left: the floor turns by +ω × time, the swing is fixed. Right: the floor
  is fixed, the swing turns by −ω × time.
- The time-lapse runs at an hour a second; the swing itself is drawn slowed down (a real 67 m pendulum swings
  once every 16.4 s, which in this time-lapse would be a blur). The turning rate is the real one.
- The orange fan is the swing's line over the last few hours, fading with age: the pattern a pointer on the
  bob would scratch in sand.

## The equation

- **ω = Ω sin φ**: the turning rate at this latitude, and which way.
- **T**: how long a full turn takes.
- **After … h**: how far it has turned so far at this place.

## A tour of the file

The turning rate, in `motion`:

```js
const rate = OMEGA_DEG_H * Math.sin((lat * Math.PI) / 180);       // degrees per hour, + = counter-clockwise from above
```

15.04° an hour (the Earth's spin, `OMEGA_DEG_H`) times sin φ, with the latitude turned from degrees into
radians for `Math.sin`.

The swing on the floor (right panel), in `update`:

```js
[['seen from the stars', floorTurn, 0], ['seen standing on the floor', 0, -floorTurn]].forEach(([label, floorAng, swingAng], k) => {
```

The same picture twice: once turning the floor, once turning the swing the other way.

## Numbers worth knowing

| place | latitude | turning rate | full turn |
|---|---|---|---|
| North Pole | 90° N | 15.04° an hour, clockwise | 23.9 hours |
| Oslo | 59.91° N | 13.0° an hour | 27.6 hours |
| Paris | 48.85° N | 11.3° an hour | 31.8 hours |
| Quito | 0.18° S | 0.05° an hour | almost never (about 7,600 hours) |
| Sydney | 33.87° S | 8.4° an hour, anticlockwise | 42.9 hours |

- **16.4 s:** one swing of Foucault's 67 m pendulum (back and forth), from 2π √(length ÷ g).

**Try this (funky):** add the South Pole. In `foucaultPendulum.js`, change `['Sydney', -33.87]` to `['South
Pole', -90]`. At the end of each loop the pendulum now turns a full circle in 23.9 hours, as fast as at the
North Pole, but anticlockwise (from sin(−90°) = −1 in the formula).

**Words on this page:** [Foucault pendulum](../glossary.md#foucault-pendulum),
[latitude](../glossary.md#latitude), [sidereal day](../glossary.md#sidereal-day), [Coriolis
effect](../glossary.md#coriolis-effect), [rotating frame](../glossary.md#rotating-frame),
[radians](../glossary.md#radians)
