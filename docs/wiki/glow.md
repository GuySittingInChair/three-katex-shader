# Glow: making bright things shine

**In one sentence:** the glow helper (a shared piece of code that any sketch can borrow), `src/lib/glow.js`, finds the brightest parts of a picture, blurs
them, and adds the blur back on top, so bright things bleed light into their surroundings the way they do
in a camera or your eye.

**Picture it:** a streetlight on a foggy night. The bulb itself is a small dot, but it sits in a soft halo
that lights up the fog around it. Your brain reads that halo as *bright*, far brighter than the screen can
really be. Glow fakes the fog.

**Why sketches need it:** a screen's brightest white is not very bright. Tracer rounds, explosions, neon
and stars look flat without help. A halo sells the brightness. 13 sketches use this helper (it's also
called *bloom*).

**Where you'll see it:** `antiAircraftContraception.js`, `intercept.js`, `radarShadow.js`,
`supernovaRemnant.js`, `kleinianNecklace.js`, `voodooDoll.js`, `ksSoapFilm.js`, `ksSpiral.js`, `ksTorus.js`,
`keplersPizza.js`, `earwormSir.js`, `bristolSpecimen.js` and `cellularFlame.js`.

## How it works, in four passes

1. **Draw the scene with headroom.** Normally colours stop at 1 (full brightness). Here the scene is drawn
   into a hidden picture that can hold values above 1. A tracer (a glowing bullet in Anti-Aircraft Contraception) can be "5 times brighter than white". See
   [render-targets.md](render-targets.md).
2. **Keep only the bright bits.** Everything dimmer than a *threshold* is thrown away.
3. **Blur them, three times, at three sizes:** a tight halo, a medium one and a wide one.
4. **Add the halos back and squash it all to fit the screen.** That last squash is a *tone map*, the
   same film-style one described in [Abyssal Bloom](sketches/chatgpt-quantum.md).

**What it looks like in the code:** step 2, from `src/lib/glow.js`:

```glsl
vec3 c = texture2D(tSrc, vUv).rgb;
float l = max(c.r, max(c.g, c.b));
gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 1.6 + 0.05, l), 1.0);
```

- Line 1 reads this pixel's colour from the hidden picture (`tSrc`); `vUv` is where the pixel is.
- Line 2: `l` is its brightest channel, a rough "how bright is it".
- Line 3: below the threshold, multiply by 0 (gone). Well above it, multiply by 1 (kept). In
  between, `smoothstep` makes a gentle ramp from 0 to 1, so halos fade in instead of switching on with
  a hard edge. `gl_FragColor` is the pixel's final colour.

And how a sketch turns it on, from `src/sketches/antiAircraftContraception.js`:

```js
const glow = createGlow(ctx, { fov: 50, strength: 0.9, threshold: 0.8, exposure: 1.1, vignette: 0.6 });
```

- `strength: 0.9`: how strongly the halos are added back.
- `threshold: 0.8`: only things brighter than 80% of white get a halo.
- `exposure: 1.1`: brighten everything a touch, like opening a camera's aperture.
- `vignette: 0.6`: darken the corners, like an old lens.
- `fov: 50`: the camera's field of view, which the helper widens on tall phone screens so portrait mode
  still sees the whole scene.

Later, `update` (the part of a sketch that runs every frame) sets `state.glow.strength = 0.9 * P.glow`.
`P.glow` is where the **glow** slider is set, so the slider scales the halos' strength.
`state` is the sketch's memory between frames.

**Try this:** in Anti-Aircraft Contraception, drag the **glow** slider to 0. The tracer rounds turn into
thin, flat lines, and the bursts lose their flash. Drag it to 2 and the whole sky fizzes like a fireworks
night.

**Related:** [render-targets.md](render-targets.md) · [colour-blending-and-gain.md](colour-blending-and-gain.md)
· [sketches/antiAircraftContraception.md](sketches/antiAircraftContraception.md)
