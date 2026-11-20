---
summary: The log of the full error check of every wiki page: what was checked, what was wrong, what was fixed.
added: 2026-11-20
---

# Wiki audit log

Every page is read start to finish by Claude (not the local AI), and every number, quote and claim is checked
against the code or a source. Each entry says how it was checked and what was wrong. Started 2026-11-20.

How things are checked:
- **Quotes:** `tests/wiki.test.mjs` fails if any quoted code block no longer matches its file.
- **Numbers:** worked out again by running the same calculation (Python or Node), not by eye.
- **Colours:** worked out from the code's own numbers; the colour samples on the pages are those results.

## Pages

| Page | Checked | What was wrong, and the fix |
|---|---|---|
| [Colour 1: RGB, three numbers](rgb.md) | 2026-11-20 | Said bezierDeCasteljau writes `new THREE.Color(0.95, 0.76, 0.42)`; it writes `col(0.95, …)`, a short name for it. Said hue 0.6 is blue; it's a sky blue (pure blue is 0.67). Added: the full list of hues, and the boids' speed worked through to its colour for five speeds (checked: the boids shader adds no shading, and the site copies colours to the screen unchanged, so the samples match what you see). |
| [Colour 3: the cosine palette](cosine-palette.md) | 2026-11-20 | **Wrong:** said the brightest colour goes red → green → blue; worked out, it goes red → blue → green (the colour wheel backwards). Said 30 sketches use it and "most kali* sketches"; it's 43 by searching the code, and every kali* sketch (as `rainbow`). The "sunset" example left out brown and near-black. Added: a table of `t` → red, green, blue → colour, and one input worked step by step. |
| [Colour 4: colour scales](colour-scales.md) | 2026-11-20 | A sentence started mid-line in lower case after "See Blending."; rewritten. "The site's background is black" is no longer always true (palettes); now says the sketches are drawn on black. Added: six real temperatures worked through the Planck scale, with one step by step. |
