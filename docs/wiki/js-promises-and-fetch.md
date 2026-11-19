# Reading JavaScript 5: loading data (`fetch`, `Promise`, `await`)

**In one sentence:** `fetch` asks for a file, and a *Promise* is the ticket you hold while you wait for it
to arrive.

**Picture it:** ordering at a busy café. You pay, they give you a numbered ticket, and you sit down. You
don't stand frozen at the counter. When your number is called, you collect your coffee. `fetch` places the
order, the Promise is the ticket, and `await` means "wait here until my number is called".

**Why sketches need it:** 16 sketches show real science data, such as star positions or the glow left over
from the Big Bang. That data sits in files in `public/data/`, and downloading takes a moment. Meanwhile
the page must keep running, so the sketch asks for the file and carries on.

**Where you'll see it:** `cmbPlanck.js`, `cepheids.js`, `gaiaNeighbourhood.js`, `exoplanets.js`,
`keplerEleven.js`, `pulsars.js`, `gwChirp.js`, `snAcceleration.js`, `sdssCosmicWeb.js`, `missingMass.js`,
`asteroidBelt.js`, `sunCycle.js`, `voyagerTour.js`, `webbDeepField.js`, `skyZoom.js` and
`messierInDepth.js`, all in `src/sketches/`.

**What it looks like in the code:** from the `setup` of `src/sketches/cmbPlanck.js` (The Oldest Light),
where `DATA_URL` is `'/data/cmb/'`:

```js
Promise.all([
  fetch(DATA_URL + 'meta.json').then((r) => r.json()),
  new Promise((res, rej) => new THREE.TextureLoader().load(DATA_URL + 'sky.png', res, undefined, rej)),
]).then(([meta, tex]) => {
  if (s.disposed) { tex.dispose(); return; }
  mat.uniforms.uSky.value = tex;
```

- `/data/cmb/` on the site is the folder `public/data/cmb/` in the project.
- `fetch(DATA_URL + 'meta.json')` orders the file `meta.json`. The `+` joins the two pieces of text.
- `.then((r) => r.json())` says "when it arrives, read it as JSON", a text format of labelled values.
- The second line orders the picture `sky.png`. Picture loaders don't hand out tickets on their own, so
  `new Promise(...)` makes one. `res` and `rej` are the ticket's two buttons, "done" (resolve) and
  "failed" (reject), handed to the loader to press when the picture arrives or goes wrong.
- `Promise.all([...])` waits for *both* tickets.
- `.then(([meta, tex]) => {` runs once both have arrived. It names them `meta` (the numbers) and `tex` (the
  picture).
- `s` is a little status note the sketch keeps in its memory, marked `disposed` once you leave. So
  `if (s.disposed) {...}`: if you flipped to another sketch while waiting, throw the picture away and stop.
- `mat` is the sky sphere's paint (its material), and `uniforms` the knobs it hands its shader (see
  [Uniforms](uniforms.md)). `mat.uniforms.uSky.value = tex;` hands the sky picture to the shader. Until this moment, the sphere has
  nothing to show.

Some code writes the same idea with `await`, meaning "pause *this recipe* until the ticket is called".
Only that recipe pauses; the rest of the page keeps running. A function that uses `await` has `async`
in front of its name.

## What arrives

- **JSON** (`meta.json`): readable text of labelled numbers, such as counts, fitted results and source
  notes.
- **Binary** (`*.bin`): long runs of numbers packed as raw bytes, so 100,000 stars don't make a huge
  download. The sketch reads them with `.arrayBuffer()` and views them as a typed array (see
  [Lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md)).
- **Pictures** (`.png`, `.jpg`): either real photographs, or numbers hidden in the colour channels. See
  [Textures](textures.md).

Where each data set comes from, and which script made it, is listed in [Survey of the project](_survey.md). A full
"Space and science data" section is planned.

**Try this:** open the site with the browser's developer tools (F12), choose the **Network** tab, and
open The Oldest Light. You will see `meta.json` and `sky.png` arrive from `/data/cmb/`. That is `fetch`
at work.

**Related:** [Lists (arrays) and labelled boxes (objects)](js-arrays-and-objects.md) · [Textures](textures.md) ·
[Survey of the project](_survey.md)
