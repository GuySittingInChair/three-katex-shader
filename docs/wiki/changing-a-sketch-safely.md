---
summary: How to run the site on your own computer, change one thing at a time, and always have a way back.
---

# Opening and changing a sketch safely

**In one sentence:** run the site on your own computer, change one number at a time, watch what happens,
and keep an easy way back.

**Picture it:** adjusting a recipe. You don't change five ingredients at once, or you won't know which one
spoiled the cake. You change one, taste, and decide whether to keep it.

**Why it matters:** these files are long and some numbers depend on each other. Small, single changes are
easy to understand and easy to undo.

## Two ways to change a sketch

**1. In the browser, with the Code panel.** Open a sketch and press **Code** in the dock (the row of buttons along the bottom of the screen:
Explain, Params, Code…).
The sketch's file opens in **Read** view, which shows the code without letting you change it by
accident: click any underlined piece of code to see what it does, a link
to its wiki page, and the same kind of line in other sketches. Switch to **Edit** to change it, then press
**Run** (or Ctrl+Enter) to restart the sketch with it.
- On aiship.lol itself, your edits are only stored in your own browser. Nobody else sees them, and the
  real file doesn't change.
- When the site is running on your computer (see below), the Code panel also saves your edit into the
  real file in `src/sketches/`.
- The **Reset** button throws your edits away and brings back the original.

**2. In the file itself.** The sketch files are in the project folder, `~/projects/three-katex-shader`,
inside `src/sketches/` (one file per sketch, e.g. `boidsFlock.js`). Open one in any text editor, change
it, save. When the
site is running on your computer, the page updates on its own within a second or two.

## Running the site on your computer

A *terminal* is the window where you type commands instead of clicking (Konsole, on your computer). Open
one in the project folder (`~/projects/three-katex-shader`) and type:

```
npm run dev
```

- `npm` is the tool that runs the project's commands. `run dev` starts the *development server*, a
  private copy of the site that only your computer can see.
- It prints an address like `http://localhost:5173`. `localhost` means "this computer". Paste the
  address into your browser's address bar.
- Hold Ctrl and press C in that terminal to stop it.

## Habits that keep you safe

- **Change one thing, then look.** Numbers are the safest things to change. Words between quotes
  (`'like this'`) are safe too. Brackets, commas and backticks are not: removing one usually stops the
  whole sketch from loading.
- **If the screen goes blank or shows an error,** undo your last change (`Ctrl+Z` in the editor) and save
  again. In the browser, press the F12 key: a panel of developer tools opens. Its "Console" tab lists
  messages from the page, and a red line names the file and line number with the problem.
- **Git keeps the project's history.** Git is a tool that stores a snapshot of the project each time a
  change is *committed* (deliberately saved into the history; Claude does this when you ask it to).
  Saving a file in an editor doesn't commit it. So you can always get back to the last committed
  version: ask Claude "undo my changes to `boidsFlock.js`".
- **Don't edit `public/data/`.** That folder holds the science data some sketches load (star maps,
  earthquake lists). Those files are made by scripts in `tools/`, and a hand edit would be overwritten
  the next time a script runs. Change the script instead,
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

**Related:** [How the files fit together](how-the-files-fit.md) · [Params: the sliders](params.md) ·
[The sketch format: every field](sketch-format.md)
