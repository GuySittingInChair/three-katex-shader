# Opening and changing a sketch safely

**In one sentence:** run the site on your own computer, change one number at a time, watch what happens,
and keep an easy way back.

**Picture it:** adjusting a recipe. You don't change five ingredients at once, or you won't know which one
spoiled the cake. You change one, taste, and decide whether to keep it.

**Why it matters:** these files are long and some numbers depend on each other. Small, single changes are
easy to understand and easy to undo.

## Two ways to change a sketch

**1. In the browser, with the Code panel.** Open a sketch and press **Code** in the dock at the bottom.
The sketch's file opens in **Read** view: click any underlined piece of code to see what it does, a link
to its wiki page, and the same kind of line in other sketches. Switch to **Edit** to change it, then press
**Run** (or Ctrl+Enter) to restart the sketch with it.
- On aiship.lol itself, your edits are only stored in your own browser. Nobody else sees them, and the
  real file doesn't change.
- When the site is running on your computer (see below), the Code panel also saves your edit into the
  real file in `src/sketches/`.
- The **Reset** button throws your edits away and brings back the original.

**2. In the file itself.** Open the file in `src/sketches/` in any text editor, change it, save. When the
site is running on your computer, the page updates on its own within a second or two.

## Running the site on your computer

In a terminal, in the project folder (`~/projects/three-katex-shader`):

```
npm run dev
```

- `npm` is the tool that runs the project's commands. `run dev` starts the *development server*, a
  private copy of the site that only your computer can see.
- It prints an address like `http://localhost:5173`. Open it in your browser.
- Press `Ctrl+C` in that terminal to stop it.

## Habits that keep you safe

- **Change one thing, then look.** Numbers are the safest things to change. Words between quotes
  (`'like this'`) are safe too. Brackets, commas and backticks are not: removing one usually stops the
  whole sketch from loading.
- **If the screen goes blank or shows an error,** undo your last change (`Ctrl+Z` in the editor) and save
  again. In the browser, press F12 and look at the "Console" tab: a red line names the file and line
  number with the problem.
- **Your work is saved by git,** the project's history keeper. Every saved version is kept, and you can
  always go back. Ask Claude "undo my changes to `boidsFlock.js`" and it can restore the last saved
  version. (A planned page, "Asking Claude for help", will cover this in more detail.)
- **Don't edit `public/data/`.** Those files are made by scripts in `tools/`. Change the script instead,
  or ask Claude to.

**What it looks like in the code:** the friendliest numbers to try are slider settings, in `params`. From
`src/sketches/boidsFlock.js`:

```js
params: {
  separation: { value: 1.5, min: 0, max: 3 },
```

- `separation` is the name of a slider: how strongly each bird avoids its neighbours.
- `value: 1.5` is where the slider starts.
- `min: 0, max: 3` are the two ends of the slider.

**Try this:** change `value: 1.5` to `value: 3`. Every bird now pushes its neighbours away twice as hard, so
the birds keep further apart and the flock looks looser. You can get the same effect without editing anything, by
dragging the slider in the **Params** panel.

**Related:** [how-the-files-fit.md](how-the-files-fit.md) · [params.md](params.md) ·
[sketch-format.md](sketch-format.md)
