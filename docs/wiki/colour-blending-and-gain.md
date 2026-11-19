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
0.5 is half and half. JavaScript calls the same idea `lerp`, short for *linear interpolation*.

From `src/sketches/bezierDeCasteljau.js`:

```js
tmp.copy(CURVE_A).lerp(CURVE_B, u).multiplyScalar(u <= s ? 1 : 0.4);
```

- `tmp.copy(CURVE_A)` starts with the first colour, a mid blue.
- `.lerp(CURVE_B, u)` blends towards the second colour, a purple, by `u`. `u` runs from 0 at the start of
  the curve to 1 at the end, so the curve shades from blue to purple along its length.
- `.multiplyScalar(u <= s ? 1 : 0.4)` is a dimmer: the part of the curve the dot has already passed keeps
  full brightness (×1), and the rest is dimmed to 40%.

`mix` blends shapes as well as colours. Boy's Surface uses `mix(roman(w), b, m_s)` to blend one surface
into another. See [Boy's Surface](sketches/boysSurface.md).

## Adding: light on light

```glsl
vec3 color = deepWater + brightWater * caustic;
```
(from `src/sketches/causticsLight.js`)

- Start from dark water.
- Add the bright aqua, as much as the caustic pattern says (`caustic` is 0 where it's dark and up to 2.2
  where the ripples focus the light).

Adding only ever makes things brighter, like extra lamps. Point clouds use
`blending: THREE.AdditiveBlending` for the same reason: overlapping sparks add up and glow (see
[Lines and points](lines-and-points.md)).

## Dimming and gain: multiplying

Multiplying a colour by less than 1 dims it, and by more than 1 brightens it. Brightening is often called
*gain*, like the gain knob on a microphone. From `src/sketches/cmbPlanck.js`:

```glsl
gl_FragColor = vec4(planck(T / 300.0 * uGain) * uDim, 1.0);
```

- `T / 300.0` scales the temperature: a difference of 300 millionths of a degree fills the colour scale.
- `* uGain` is the gain. When the sketch shows only the faintest ripples, it turns the gain up so they are
  still visible.
- `planck(...)` picks a colour from the [colour scale](colour-scales.md).
- `* uDim` dims the whole picture, which the sketch uses to fade the map out behind the graph.

## Keeping in range: `clamp`

Screens can't show more than full brightness. `clamp(x, 0.0, 1.0)` keeps a number between 0 and 1, so
values outside the range don't cause surprises. Bifurcation Diagram does this with its point density.

**Try this:** in `bezierDeCasteljau.js`, change `0.4` to `0.0`. The part of the curve ahead of the moving
dot disappears entirely, so you watch the curve being drawn as the dot moves along it.

**Related:** [RGB, three numbers](rgb.md) · [Colour scales for data, and how they are chosen](colour-scales.md) · [GLSL basics: reading a shader](glsl-basics.md)
