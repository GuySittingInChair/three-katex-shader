---
summary: How code and equation symbols become clickable, and where their explanations are written.
added: 2026-11-20
---

# Clickable code and symbols: how it works

**In one sentence:** each sketch can have a page of hand-written notes, one per line of its code (and per
important piece inside a line), and the site turns those notes into things you can click: in the code panel,
in the wiki's code examples, and in the equation on screen.

**Picture it:** a museum audio guide. Every exhibit has a number on a little plaque; press the number and you
hear what that piece is and why it's in this room. The notes are the recordings, and the clickable lines are
the plaques.

**Why it matters:** reading code is much easier when you can ask "what does *this* do, and why is it here?"
about any part of it, and get an answer about this sketch, not a general lesson.

## What you can click

- **In the code panel** (the **Code** button under a sketch, in its **Read** view): a line with a note has its
  line number in blue. Click the line (or press Tab to reach it and Enter) for its card. Pieces inside it with
  their own note are underlined in blue: click those for a closer look. Esc closes the card.
- **In a wiki page's code examples:** the same lines and pieces are clickable there too, and the card floats
  next to what you clicked (on a phone it slides up from the bottom).
- **In the equation on screen:** symbols with a note are clickable. Click one and the code panel opens with
  the lines that work it out lit up in yellow, and a card saying what the symbol means. The other way round, a
  line's card has a **Highlight it in the equation** button.
- Every card links to the sketch's full notes page, which you can read straight through, like [Gradient Plane:
  the code, line by line](code/gradientPlane.md).

## Where the notes live

One file per sketch: `docs/wiki/code/<sketch>.md`. Each note's heading is the line of code itself, copied
exactly; the explanation goes underneath. From `docs/wiki/code/gradientPlane.md`:

```text
### `vec2 uv = vUv * uScale;`

Stretches the pixel's position by the Scale slider. At scale 2, a pixel halfway across the screen is treated
as if it were a whole screen across, so two rainbows fit.
symbol: t
#### `uScale`
The Scale slider. Bigger numbers pack more rainbows in.
```

- `###` is a line, `####` a piece of the line above it.
- `symbol: t` says this line works out the symbol t, which the equation marks as clickable. In the sketch's
  `latex`, a clickable symbol is written `\\htmlData{sym=t}{t}` instead of plain `t`.
- Links to other wiki pages work as usual.

**Kept honest by a test.** `tests/codeNotes.test.mjs` checks every note against its sketch. If someone changes
a line of code and forgets the note, the test fails and names the note, so explanations can't quietly drift
away from the code. `node tools/code-notes-coverage.mjs` lists how much of each sketch is explained.

**Related:** [Opening and changing a sketch safely](changing-a-sketch-safely.md) · [Motion and the live
equation](motion-and-latex.md) · [The sketch format: every field](sketch-format.md)
