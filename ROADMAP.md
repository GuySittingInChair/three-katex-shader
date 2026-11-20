# aiship roadmap

The working plan for the big batch requested on 2026-11-20. Every item from the request is here with a status
and a "done means". Status values: **todo**, **doing**, **done** (verified, with how), **deferred** (with
the reason), **blocked** (waiting on the owner).

Check-ins with the owner: (A) this plan, (B) the Phase 2 quality check, (C) the Phase 3 design,
(D) the Phase 4 design. Between those, Claude makes the calls and records them under "Decisions".

Nothing is marked done until: the build passes, the tests pass, the page has been opened in a browser,
the new interaction has been clicked, and the page has been checked at phone width (390 px).

---

## Step 0: plan

| # | Item | Status | Done means |
|---|------|--------|------------|
| 0.1 | Write this roadmap and wait for go-ahead | done (owner: "figure it out", 2026-11-20) | Owner has read it and said go |

---

## Phase 1: fixes and quick wins

### 1A. Open issues already flagged

From my own self-review on 2026-11-19 (8 points), plus the owner's reply (6 more).

| # | Issue | How I'll fix it | Status | Done means |
|---|-------|-----------------|--------|------------|
| 1.1 | Pages were patched with bracketed asides, so they read like stapled-on notes | Rewrite each page as a whole, in order, reading it start to finish; no inserted `(…)` asides | todo | Every page reread start to finish by me, with a log line per page in `docs/wiki/_audit.md` |
| 1.2 | The same small code lessons (`&&`, `!`, `===`, `? :`, `const`) are repeated on many pages | Explain each once on its wiki page; on other pages, make the symbol clickable (Phase 2) instead of explaining it again in prose | todo | A grep finds no stock "`&&` means and" style sentence outside its home page |
| 1.3 | The 600-word limit was broken, then kept as a rule | Remove the limit everywhere (see 1B) | done (see 1.16–1.18) | Nothing in the repo or memory mentions a word limit |
| 1.4 | Clumsy sentences ("so … so", `chatgpt-quantum.md:64`, `motion-and-latex.md:37`) | Fixed as part of the 1.1 reread | todo | Covered by the 1.1 log |
| 1.5 | Messy line wrapping left by scripted edits | Rewrap every page to one width with a script, then reread; stop editing pages by regex | todo | A check reports no prose line over the width; diff reviewed |
| 1.6 | "Words on this page" links all land on the top of the glossary | Give every glossary entry an id and link to it (`glossary.md#golden-angle`); add a test that each anchor exists | done (181 links now point at their word; glossary link text uses page titles; test fails on a missing word; clicked in Firefox at 1200 and 390 px: lands centred and highlighted) | A test fails on a missing anchor; clicking a word scrolls to its entry |
| 1.7 | I claimed scores rose "from 3 to 5–6" without re-measuring | Correction: that number was never measured for the final pages. From now on I report only checks I actually ran, and I don't use the local critic's score as evidence of quality | todo | Owner has the correction in writing; the reports in this file name the check behind every claim |
| 1.8 | My reports were long and unclear | Short reports: what changed, how I checked it, what's next | ongoing | n/a (a habit) |
| 1.9 | The code logic isn't explained: pages say what a symbol is, not why the code does it | Phase 2 clickable code; each explanation says why this line is in this sketch | todo | See 2.1 |
| 1.10 | The colour wheel: pages don't show how the numbers land on a particular colour | Rewrite `rgb.md`, `cosine-palette.md` and `colour-scales.md` with worked examples that carry one real input through every step to the final colour (numbers computed by running the code), plus a live swatch | todo | Each step's number matches a run of the real code (script saved in `tools/`); swatch checked in the browser |
| 1.11 | I said "66 pages" and it read as 66 sketches | The real numbers: 69 wiki pages; 34 are sketch walkthroughs covering **31 of 166** sketches; 35 are topic pages and the glossary | done (stated to owner 2026-11-19) | n/a |
| 1.12 | Errors on every page | A full error audit of every page by me (not the local model). Each claim, number and quote is checked against the code or a source and logged in `_audit.md`. Owner's own sightings are taken first if they share them | todo | `_audit.md` lists every page with errors found and fixed; quote check (2.5) passes |
| 1.13 | No way to go back and forth between a page and the code it discusses | Every code block in the wiki gets "Open at line N" (opens the sketch with the code panel scrolled to that line and highlighted). Lines in the code panel that a walkthrough discusses get "Explained in the walkthrough" linking back to that paragraph. Line numbers are worked out at build time from the quoted text, so they can't go stale | done (every quoted code block, 164 on 69 pages, has numbered lines and a bar: "Open these lines in the code panel" (sketch files) and "On GitHub"; the code panel marks explained lines and links back to the block. Clicked both ways in Firefox on Game of Life at 1200 and 390 px and from the Explain panel on Boids; all 69 pages loaded with no errors) | Clicking each way lands on the right line or paragraph, checked on 3 pages in the browser and at phone width |
| 1.14 | comedy-captions page not wanted | Deleted with all links to it (8a4309e, pushed) | done (build, 33/33 tests, link check 0 broken) | n/a |
| 1.15 | The push of 8a4309e also put the 4 criticised commits live | Keep them live (Q1) | done (decision) | n/a |

### 1B. Remove the word limit everywhere

| # | Item | Status | Done means |
|---|------|--------|------------|
| 1.16 | Remove "About 600 words at most per page; split longer ones" from `CLAUDE.md` | done (removed; grep finds no limit) | Line gone |
| 1.17 | Remove the other caps in `CLAUDE.md`: "Quote 2 to 6 real lines" and "in batches of about ten" | done (both replaced with no number) | Lines gone or replaced with no number |
| 1.18 | Remove the batch-of-ten and length notes from my memory file | done (memory note updated) | Memory file has no cap |
| 1.19 | Short summaries for small spaces: each wiki page gets a `summary:` line at the top. The code-panel cards use it, and so will search results, hover cards, previews and the RSS feed. This replaces the `blurb` text now hard-coded in `src/core/wiki.js` | done (69 pages have `summary:`; tests/wiki.test.mjs fails if one is missing; code cards show it, checked in Firefox at 1200 and 390 px; header hidden on the page) | Every page has one (a test fails otherwise); the cards show it; the full page is unaffected |

### 1B-2. Every other cap on a length or count (Step 0, item 3)

Nothing limits walkthroughs to 20. These are all the caps I found; each has a decision.

| Where | Cap | Decision | Status |
|---|---|---|---|
| `CLAUDE.md` | 600 words, "2 to 6 lines", "batches of about ten" | Removed (1.16, 1.17) | done |
| Code panel "similar lines" card (`src/core/wiki.js` `similarLines`) | Showed 8 sketches out of up to 139 | Shows 8, plus "Show all N" that lists every one | done (clicked: 8 → 139) |
| Same card | Line text cut at 90 characters | Cut removed; long lines fade out at the card's edge, full text on hover | done |
| Code-term card (`.code-term-card`) | At most 36% of the panel's height | Kept: it scrolls, so nothing is hidden | kept |
| Code panel sketch list (`.code-panel-list`) | 130 px tall | Kept: it scrolls | kept |
| Wiki feedback form (`src/ui/wikiFeedback.js`) | Quote up to 1,500 characters; issue title quotes 50 | Kept for now: a GitHub "new issue" link stops working when the URL gets too long (about 8,000 characters). Revisit if it gets in the way | kept (reason given) |
| Explain panel sound notes | 120 s recording, upload size limit | Kept: storage limits on the hosting side (Supabase) | kept (reason given) |
| `wikicritic` (local AI) | 15 problems, 10 fact issues, 16,000 characters per source file, 30,000 in all, answer length | Kept: these are the local model's memory limits; the tool is optional and not used as evidence | kept (reason given) |

### 1C. Astronomy tab

| # | Item | Status | Done means |
|---|------|--------|------------|
| 1.20 | "Astronomy" in the header next to Games and Review, plus the mobile menu | todo | Visible on every page and at phone width |
| 1.21 | `/astronomy` hub, built from tags: astronomy sketches (16 in the Astronomy category plus the space-physics ones, by tag), their walkthroughs, astronomy wiki entries, and the astronomy sections of `docs/guide.md` and `docs/galaxy-engine.md`. Anything tagged later appears there automatically | todo | Adding a tag to a test sketch makes it appear with no other change |
| 1.22 | Find astronomy content that nothing links to yet, and include it | todo | List of what was found recorded here |
| 1.23 | Feature astronomy on the home page | todo | Section visible on the home page, desktop and phone |

### 1D. Colours

| # | Item | Status | Done means |
|---|------|--------|------------|
| 1.24 | Move every colour into theme variables (about 350 hard-coded colours in `style.css`, plus inline styles in `src/lib/galaxy/*` and the UI JS) | todo | A grep finds no raw colour outside the theme block (an exceptions list is allowed for sketch art) |
| 1.25 | Three clearly different palettes, one of them astronomy-themed, with a switcher to preview them on real pages | todo | Switcher works and the choice is remembered; screenshots of 4 pages × 3 palettes |
| 1.26 | WCAG AA contrast for all text; equations, symbol highlights and code highlighting still readable | todo | A contrast script checks every text/background pair in every palette |
| 1.27 | Sketch backgrounds: recommend they keep their own colours (see Q4); regenerate thumbnails only if they change | todo | Decision recorded |
| 1.28 | `theme-color` meta tag follows the palette | todo | Updates on switch |

### 1E. RSS feed

| # | Item | Status | Done means |
|---|------|--------|------------|
| 1.31 | The code panel hides `import` lines, so its line numbers can be a few lower than the file's (and GitHub's). Make the panel number lines as the file does | done (panel margin shows the file's numbers; wiki link /s/gameOfLife#L93-96 highlights lines 93–96, each checked against the file; GitHub link is #L93-L96; a "similar line" pick checked against its file) | The same line has the same number in the panel, the wiki bar and GitHub |
| 1.32 | Quotes made honest: 29 code blocks skipped lines without saying so; each gap now shows "...". 5 quotes had been reworded and now match the code exactly. 6 pages counted "..." as a numbered line; renumbered | done (all 162 quotes match, per the test above; every "Line N" checked against the numbered line by script and by reading) | n/a |
| 1.30 | Find where "only 20 walkthroughs" shows up (live wiki index, sketch pages, explain panel) and fix it if it's a bug | todo | Cause found and recorded |
| 1.29 | `/feed.xml` built at build time: new walkthroughs and wiki entries, each with its summary and the date it first appeared (from git) | todo | Passes a feed validator; opens in a feed reader; linked in `<head>` |

---

## Phase 2: clickable code, a much deeper wiki, more walkthroughs

### 2A. Clickable code

The equation-symbol system is the model (the "This sketch" symbol list in `src/ui/explainPanel.js`), and
the code panel already makes concept words clickable (`lineTerms` in `src/core/wiki.js`). Both get one
shared card component, so they look and behave the same.

| # | Item | Status | Done means |
|---|------|--------|------------|
| 2.1 | Explanations per sketch in `docs/wiki/code/<id>.md`: each one is anchored to a quoted piece of code (a line, or a call, constant or operator inside it), says what it does and why it's here, and links wiki entries | todo | Loaded by the code panel and by wiki code blocks |
| 2.2 | Clicking a line or piece opens the card; equation ↔ code highlighting both ways when a piece computes an equation symbol | todo | Clicked both ways in the browser on 3 sketches |
| 2.3 | Keyboard (Tab and arrows move, Enter opens, Esc closes) and mobile (tap; the card becomes a bottom sheet) | todo | Checked by keyboard only, and at 390 px |
| 2.4 | One card component shared by equation symbols and code | todo | Old duplicate code removed |
| 2.5 | Drift check: a test fails if an explanation's anchor text, or a code block quoted in a wiki page, no longer appears in its file | doing (wiki half done: tests/wiki.test.mjs fails if any of the 162 quoted wiki code blocks stops matching its file, shown by changing one line of gameOfLife.js; the code-explanation half comes with 2.1) | Changing a quoted line in a sketch makes `npm test` fail |
| 2.6 | Backfill: every place on the site that shows code (code panel, walkthrough code blocks, guide code blocks) | todo | Coverage report per sketch (see Q2 on scope) |

### 2B. A much deeper wiki

Each entry covers, where it fits: plain intro, analogy, formal definition and notation, derivation or
proof sketch, worked example (computed, not eyeballed), embedded animated sketch, clickable symbols and
code, common mistakes, connections, walkthroughs it appears in (generated), sources. Long entries get a
table of contents (generated from headings).

| # | Item | Status | Done means |
|---|------|--------|------------|
| 2.7 | Page template and renderer support: embedded live sketch, generated TOC, generated "appears in" list, sources section | todo | Works on one page in the browser |
| 2.8 | Order of work: most-linked first (shaders 28 links from walkthroughs, cosine palette 12, randomness 11, sine and cosine 10, noise 10, uniforms 8, mesh 8 …), plus new astronomy entries: parallax and distance, redshift, light curves and transits, Kepler's laws and orbits, standard candles, the electromagnetic spectrum, gravitational lensing | todo | Per-entry status below once started |
| 2.9 | Fact-check every number, especially astronomy, against the data files in `public/data` and published sources, with the check recorded | todo | Every numeric claim has a source or a script in `_audit.md` |

### 2C. More walkthroughs (31 sketches now → 67)

Proposed new walkthroughs, grouped by topic. Difficulty: ● beginner, ●● intermediate, ●●● advanced.
These are drawn from the 135 sketches that have none yet, without duplicating existing ones.

**Astronomy, real data (16)**
| Sketch | What it is | Level |
|---|---|---|
| sunCycle | 140 years of sunspots; the butterfly diagram draws itself | ● |
| exoplanets | all 6,412 known planets around other stars, appearing in the year found | ● |
| messierInDepth | Messier's 110 objects as real photos, in their true directions | ● |
| voyagerTour | Voyager 1 and 2 past the giant planets, on JPL's reconstructed paths | ●● |
| asteroidBelt | ~900,000 numbered asteroids on real orbits; Kirkwood gaps and Trojans | ●● |
| keplerEleven | finding six planets from scratch in a real Kepler light curve | ●● |
| gaiaNeighbourhood | a quarter of a million stars within 326 light-years, from Gaia | ●● |
| cepheids | 2,201 pulsing stars that measure distance (the cosmic yardstick) | ●● |
| pulsars | 3,679 spinning neutron stars blinking at their real periods | ●● |
| skyZoom | one 26,000× zoom from the whole sky to one Webb galaxy | ●● |
| webbDeepField | a Webb deep field with every object moved back to its distance | ●●● |
| sdssCosmicWeb | 600,000 galaxies by redshift: walls, voids, the Coma cluster | ●●● |
| missingMass | rotation curves of 175 galaxies: the case for dark matter | ●●● |
| snAcceleration | 1,500 supernovae and the discovery that expansion is speeding up | ●●● |
| cmbPlanck | the oldest light, as Planck mapped it | ●●● |
| gwChirp | the first gravitational wave, worked out from LIGO's recordings | ●●● |

**Space physics (7)**
| Sketch | What it is | Level |
|---|---|---|
| keplersPizza | equal slices of time sweep equal areas (Kepler's second law) | ● |
| nBodyGravity | a cloud of particles pulling on each other | ● |
| einsteinRing | a galaxy's gravity bends a background galaxy into a ring | ●● |
| whereOrbitingStops | from atoms to the cosmic web: where orbits stop working | ●● |
| supernovaRemnant | a blast wave sweeping up the galaxy | ●●● |
| duckSpaghettification | a rubber duck stretched by a black hole's tides | ●●● |
| blackHoleLensing | light traced around a black hole with general relativity | ●●● |

**Physics (5)**
| doublePendulum | three pendulums one atom apart, then chaos | ● |
|---|---|---|
| pendulumWave | 15 pendulums drifting in and out of patterns | ● |
| quantumTunnelling | an electron going through a wall it can't climb | ●● |
| twinParadox | the travelling twin comes home younger | ●● |
| hydrogenOrbitals | the electron cloud of hydrogen from its exact equations | ●●● |

**Maths, waves and life (8)**
| fourierEpicycles | 49 spinning circles drawing a heart | ● |
|---|---|---|
| ulamSpiral | primes on a spiral, with surprise diagonals | ● |
| sunflowerPhyllotaxis | sunflower seeds and the golden angle | ● |
| rabbitsVsFoxes | predator and prey populations chasing each other | ● |
| chladniPlate | sand finding the still lines on a vibrating plate | ●● |
| fireflySync | 300 fireflies learning to flash together | ●● |
| lorenzAttractor | the chaotic butterfly | ●● |
| newtonFractal | a root-finding method coloured by where each point ends up | ●● |

Total: 36 new, for 67 sketches walked through.

### 2D. Quality check (check-in B)

| # | Item | Status | Done means |
|---|------|--------|------------|
| 2.10 | Once clickable code works: expand 3 wiki entries: cosine palette, shaders, and new parallax and distance (Q5) | todo | Verified as above |
| 2.11 | Write the first 5 new walkthroughs (proposed: keplersPizza, sunCycle, exoplanets, fourierEpicycles, blackHoleLensing: four astronomy, one maths, from easy to hard) | todo | Verified as above |
| 2.12 | Stop for owner review | todo | Owner's verdict recorded |
| 2.13 | The remaining 31 walkthroughs and the rest of the wiki | todo | After B |

---

## Phase 3: "/" predictive coding

| # | Item | Status | Done means |
|---|------|--------|------------|
| 3.1 | Design doc `docs/design/slash-coding.md`: location, trigger, interaction, context, explanations, architecture, cost, limits | todo | Owner OK (check-in C) |
| 3.2 | Prototype behind a feature flag | todo | Works end to end in the browser, flag off by default |

Early notes for the design: the sketch editor today is a plain `<textarea>` in `src/ui/codePanel.js`.
Ghost text needs a real editor, so I'll propose CodeMirror 6. The proxy would be a Vercel function under
`/api` with Supabase sign-in, which the site already has; the CSP's `connect-src 'self'` already allows
it.

## Phase 4: trending feed and creator timeline

| # | Item | Status | Done means |
|---|------|--------|------------|
| 4.1 | Design doc `docs/design/trending-and-creators.md`: sources and their terms, data model, metrics, scheduling, storage, cost, starter creators | todo | Owner OK (check-in D) |
| 4.2 | Proof of concept with about 5 creators | todo | Runs on schedule, timeline and bubble views render |

---

## Decisions (made by Claude, recorded here)

- "Line N" on a wiki page means the line numbered N beside the code block. Numbers count code lines only:
  "..." (skipped code) and blank lines get no number.
- A quote may leave off a line's trailing `// comment`; anything else must match the file exactly.
- Blocks that aren't quotes of our code (shell commands, maths) are recognised by their language tag;
  old code that no longer exists is marked with `<!-- not a quote -->` before the block.

- Code explanations are anchored to quoted code text, not line numbers, so edits elsewhere in a file
  don't break them, and the drift test (2.5) catches real changes.
- The local AI critic (`wikicritic`) stays as an optional tool, but its scores are not used as evidence.
- Wiki pages are rewrapped by a formatter, not by hand-edited regexes.

## Questions for the owner (answered by Claude on 2026-11-20; the owner said to decide)

- **Q1. Criticised commits live?** Keep them live. They also contain real fixes (Displaced Icosphere
  slider, Different This Time resize, corrected facts); rolling back would remove those. Pages are
  improved in place by 1.1 and 1.12.
- **Q2. Clickable-code scope:** full hand-written "why" coverage for every sketch with a walkthrough
  (existing and new) and every code block in the wiki and guide. Other sketches keep concept links until
  their walkthrough is written; a coverage report lists every sketch and its coverage, so nothing is
  hidden. Recorded as a deferral, not a drop.
- **Q3. "Only 20 walkthroughs":** no cap exists in the code. Where it shows up is item 1.30, still to
  check. Target stays 67.
- **Q4. Sketch backgrounds:** keep their own colours; only the interface follows the palette. Thumbnails
  are not regenerated.
- **Q5. Quality-check entries:** cosine palette, shaders, and a new astronomy entry, parallax and
  distance (astronomy was the owner's stated favourite).
- **Q6. AI provider for Phase 3:** Anthropic API through a Vercel function: Claude Haiku 5.5 for ghost
  text, Claude Sonnet 5.5 for drafting code. Default spending cap $20 a month and per-user limits; the
  owner adds the API key to Vercel when the prototype is ready. Detailed in the Phase 3 design.
- **Q7. Creators:** Claude proposes a starter list in the Phase 4 design for the owner to edit.

## Things I think could be done better

- **Walkthrough count:** the request says "at least 50". The list above gives 67 so astronomy is well
  covered; trim or add as you like.
- **Clickable code size:** see Q2. It's the part most at risk of turning shallow if spread over all 166
  sketches at once.
- **Phase 4 "how well" metric:** I agree it must stay private. I'd also leave it out of the proof of
  concept entirely, and build only speed and volume first.
