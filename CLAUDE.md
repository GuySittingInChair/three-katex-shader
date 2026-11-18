# Notes for Claude

## The beginner wiki (`docs/wiki/`)

The owner is not a programmer and has no math or physics background. `docs/wiki/` explains the project in
plain English for them; `docs/wiki/README.md` is the index and `docs/wiki/_survey.md` the map of what's in
the project (sketch list, techniques, topics, data sources). `docs/guide.md` and its "annotated" sections
are the expert field guide shown in the Explain panel: keep them, the wiki sits alongside.

**Standing rule: whenever you create or change a sketch:**
1. Write or update its walkthrough, `docs/wiki/sketches/<id>.md` (id = file name without `.js`).
2. If it uses a technique, topic, data source or term that has no wiki page yet, write that page, then add
   it to `glossary.md` and `README.md`. Update `_survey.md` (its sketch table and technique list).
3. In the sketch's code, put a short plain-English comment above each major block, naming the relevant
   wiki page by file name, e.g. `// see docs/wiki/shaders.md`.
4. End your reply with a list of the wiki pages you added or changed.

**How to write every page:**
- Reader: a curious adult with no programming, math or physics background. Never make them feel slow.
- Short sentences, everyday words. Explain every technical term in plain words the first time it appears
  on a page, even if another page already does.
- Picture before detail: every concept opens with an everyday analogy.
- Never show an equation without first saying what it means in words.
- Quote 2 to 6 real lines from a named sketch file and explain them line by line. Never invent examples.
- Say what changing something would do ("change 0.9 to 0.5 and the map shrinks to half the screen
  width"). Check that claim against the code (arithmetic, units, which way a number works) before
  writing it.
- Numbers people can picture ("about the width of the full Moon", not "0.52°" alone).
- About 600 words at most per page; split longer ones.
- Never write "simply", "just", "obviously" or "trivially".
- Concept pages: `# Name`, **In one sentence**, **Picture it**, **Why sketches need it**, **Where you'll
  see it**, **What it looks like in the code**, **Try this**, **Related**.
- Walkthroughs: `# <Sketch name>: in plain English`, **What you see**, **The idea behind it**, **Where the
  data comes from**, **How it's built** (linking concept pages), **A tour of the file** (setup → update,
  quoting key lines), **Numbers worth knowing**, **Words on this page** (glossary links).

**Still to write** (see the *(planned)* items in `README.md`): drawing in 2D, animation and timing, math,
simulation, maps and the sky, science explainers, space and science data, equations and LaTeX, asking
Claude for help, and the walkthroughs for the remaining sketches, in batches of about ten, oldest first,
in the order of the table at the end of `_survey.md`.
