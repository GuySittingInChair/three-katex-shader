# How the files fit together

**In one sentence:** each sketch (one animated picture on the site, with its sliders and equation) is one file in `src/sketches/`, the app in `src/core/` and `src/ui/` runs
it, shared helpers live in `src/lib/`, and real science data is prepared by scripts in `tools/` and served
from `public/data/`.

**Picture it:** a theatre. The sketches are the plays. `src/core/` is the stage crew who run whichever
play is on. `src/ui/` is the front of house: the buttons, panels and menus. `src/lib/` is the prop
cupboard that many plays borrow from. `tools/` is the workshop out the back where props are built from
raw materials, and `public/data/` is the shelf where the finished props wait.

**The folders that matter:**

| Folder | What is in it | Will you edit it? |
|---|---|---|
| `src/sketches/` | One file per sketch (166 files). | Yes, this is where the art lives. |
| `src/lib/` | Shared helpers: `motion.js` (timing), `fatLines.js` (lines), `morphSurface.js` (shapes that change), `environment.js` (realistic scenes), `bit.js` (comic timing) and more. | Rarely. A change here affects every sketch that borrows it. |
| `src/core/` | The engine: finds the sketches (`registry.js`), runs them (`SketchRunner.js`), draws the equation (`latex.js`, `equationLayer.js`), sorts categories (`taxonomy.js`). | Almost never. |
| `src/ui/` | The panels: Explain, Params (sliders), Code, Comments, the gallery. | Almost never. |
| `tools/` | Python scripts that download and prepare science data, one folder per data set. | Only when changing a data set. |
| `public/data/` | The prepared data files the sketches load. | No. The scripts in `tools/` make them. |
| `docs/` | `guide.md` (the expert field guide in the Explain panel), and this wiki. | Yes. |

**How a sketch reaches the screen:**

1. `src/core/registry.js` collects every file in `src/sketches/` automatically. You never have to "add"
   a new sketch to a list. Putting the file in the folder is enough.
2. When you open a sketch, `src/core/SketchRunner.js` sets up a *scene* (the empty 3D world) and a
   *camera* (the point of view it's seen from). Then it runs the sketch's `setup` part once, to build
   things, and its `update` part on every frame (about 60 times a second), to move them. See
   [The frame loop: setup, update, dispose](frame-loop.md).
3. If the sketch has a `latex` part (its equation, written in LaTeX, a standard way to type maths),
   `src/core/latex.js` draws it on screen. Numbers that change as the sketch moves are coloured yellow.
4. If the sketch needs data (real measurements, like star positions or earthquake records), it loads it from `public/data/...` while it starts up. See
   [Loading data (`fetch`, `Promise`, `await`)](js-promises-and-fetch.md).

**What it looks like in the code:** the whole of "find every sketch" is this line from
`src/core/registry.js`.

```js
const modules = import.meta.glob('../sketches/*.js', { eager: true });
```

- `import.meta.glob(...)` means "load every file that matches this pattern".
- `'../sketches/*.js'` is the pattern: every file ending in `.js` in the sketches folder. The `*` means
  "any name".
- `{ eager: true }` means "load them all straight away, when the site starts".

**Try this:** copy `src/sketches/gradientPlane.js` to `src/sketches/myFirst.js` and change its `name`. A
new sketch called whatever you named it appears in the gallery, with no other change needed.

**Related:** [What a sketch is](what-is-a-sketch.md) ·
[Opening and changing a sketch safely](changing-a-sketch-safely.md) · [Survey of the project](_survey.md)
