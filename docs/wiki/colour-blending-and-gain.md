---
summary: Mixing two colours, adding light to light, and turning brightness up or down.
added: 2026-11-18
---

# Colour 2: blending, adding, dimming and gain

**In one sentence:** colours are numbers, so sketches mix them by blending (part this, part that), adding
(light on light), and multiplying (turning the brightness up or down).

**Picture it:** mixing paint, overlapping torch beams, and a dimmer switch. Paint blends two colours
into something in between. Two torch beams on the same spot make it brighter. A dimmer turns everything
down together.

**Why sketches need it:** fades between scenes, glowing particles, and making faint data visible all come
down to these three moves.

## Blending: `mix` (shaders) and `lerp` (JavaScript)

`mix(a, b, t)` gives a blend of `a` and `b`. When `t` is 0 you get all `a`, when it is 1 all `b`, and
0.5 is half and half. Picture a slider between two paint pots, with `t` saying how far along it you are. JavaScript calls the
same idea `lerp`, short for *linear interpolation*: "go a straight-line fraction of the way from one
value to another".

From `src/sketches/bezierDeCasteljau.js`:

```js
tmp.copy(CURVE_A).lerp(CURVE_B, u).multiplyScalar(u <= s ? 1 : 0.4);
```

- `tmp` is a scratch colour the sketch reuses, and the dots chain steps one after another.
- `tmp.copy(CURVE_A)` starts with the first colour, a mid blue.
- `.lerp(CURVE_B, u)` blends towards the second colour, a purple, by `u`. `u` runs from 0 at the start of
  the curve to 1 at the end, so the curve shades from blue to purple along its length.
- `.multiplyScalar(…)` multiplies all three colour numbers by one number. `u <= s ? 1 : 0.4` means "1
  if `u` is at most `s` (how far the dot has got), otherwise 0.4". So it's a dimmer: the part of the curve the dot has already passed keeps
  full brightness (×1), and the rest is dimmed to 40%.

`mix` blends shapes as well as colours. Boy's Surface uses `mix(roman(w), b, m_s)` to blend one surface
into another. See [Boy's Surface](sketches/boysSurface.md).

## Adding: light on light

```glsl
vec3 color = deepWater + brightWater * caustic;
```
(from `src/sketches/causticsLight.js`, in GLSL, the [shader](shaders.md) language)

- `vec3` is a colour: three numbers, red, green, blue.
- Start from dark water (`deepWater`).
- Add the bright aqua, as much as the caustic pattern says (`caustic` is 0 where it's dark and 2 or more
  where the ripples focus the light).

Light adds up: two lamps on the same wall make it brighter than either alone. Colour numbers are
amounts of light, so adding them only ever makes things brighter, like extra lamps. That's different
from `mix`, which goes partway *between* two colours and is never brighter than the brighter one. Point clouds use
`blending: THREE.AdditiveBlending` for the same reason: overlapping sparks add up and glow (see
[Lines and points](lines-and-points.md)).

## Dimming and gain: multiplying

Multiplying a colour by less than 1 dims it, and by more than 1 brightens it: half of a bright red
(1.0, 0, 0) is (0.5, 0, 0), a dark red. Brightening is often called
*gain*, like the gain knob on a microphone. From `src/sketches/cmbPlanck.js`:

```glsl
gl_FragColor = vec4(planck(T / 300.0 * uGain) * uDim, 1.0);
```

- `gl_FragColor` is the pixel's final colour; `vec4(…, 1.0)` adds "fully solid". Names starting with `u`
  are knobs handed in from JavaScript ([uniforms](uniforms.md)).
- `T / 300.0` scales the temperature: a difference of 300 millionths of a degree fills the colour scale.
- `* uGain` is the gain. When the sketch shows only the faintest ripples, it turns the gain up so they are
  still visible.
- `planck(...)` picks a colour from the [colour scale](colour-scales.md).
- `* uDim` dims the whole picture, which the sketch uses to fade the map out behind the graph.

## Keeping in range: `clamp`

Screens can't show more than full brightness (1) or less than none (0): anything above 1 is shown as 1,
so detail up there is lost. `clamp(x, 0.0, 1.0)` keeps a number between 0 and 1 on purpose, so values
outside the range don't cause surprises later in the sums. Bifurcation Diagram does this with its point density.

**Try this:** in `bezierDeCasteljau.js`, change `0.4` to `0.0`. The part of the curve ahead of the moving
dot disappears entirely, so you watch the curve being drawn as the dot moves along it.

**Related:** [RGB, three numbers](rgb.md) · [Colour scales for data, and how they are chosen](colour-scales.md) · [GLSL basics: reading a shader](glsl-basics.md)
