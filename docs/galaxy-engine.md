# The Deep Sky: galaxy engine — plan, status, assumptions

The goal (from the project brief): turn *Messier's Sky, in Depth* into an explorer where galaxies are active
places — supernovae, star formation, black holes, collisions — while always showing what is real and what is not.

## How it fits the existing code

The site is a gallery of self-contained sketches (`src/sketches/*.js`, auto-discovered) that share helpers in
`src/lib/`. Rather than a parallel `src/astronomy/ … src/universe/` tree, the new engine lives in one library folder
that any sketch can use, and data is built offline by Python scripts into `public/data/` (the site's content security
policy blocks live archive requests, so everything is preprocessed).

| Piece | File | Notes |
|---|---|---|
| Provenance labels | `src/lib/galaxy/provenance.js` | OBSERVED / SIMULATED / INFERRED / PROCEDURAL / ARTISTIC, with badges |
| Event engine | `src/lib/galaxy/eventEngine.js` | no Three.js; decides when/where/what; seeded; tested |
| Supernova drawing | `src/lib/galaxy/supernovaFx.js` | 32 GPU slots × 360 debris particles + flashes; pooled |
| Galaxy STRUCTURE view | `src/lib/galaxy/galaxyMode.js` | 3D model, knots, real SN sites, picking, card content |
| Explorer | `src/sketches/messierInDepth.js` | `GALAXIES = { 51: … }` turns the view on per object |
| M51 data | `tools/galaxies/build_m51.py` → `public/data/galaxies/m51/` | see below |
| TNG fetcher | `tools/galaxies/tng_fetch.py` | written, not yet run (needs a key) |
| Tests | `tests/*.test.mjs`, `npm test` | Node's built-in runner, no new dependencies |

## Data sources: what works from here (12 Nov 2026)

| Source | Status | Used for |
|---|---|---|
| NASA/IPAC Extragalactic Database (NED) | works, no key | positions with reference codes, object types, redshifts; NED-D distances |
| NASA SkyView (DSS1/DSS2) | works | photographs |
| Wikipedia | works | supernova types, dates, peak magnitudes (which cite IAUCs/ATels); lead summaries |
| IllustrisTNG API | **needs a free API key** (403 without) | simulated galaxy histories and mergers — `tools/galaxies/tng_fetch.py`, key via `TNG_API_KEY` |
| NASA ADS | **needs a token** (401 without) | paper metadata — not used yet |
| SIMBAD, VizieR (CDS Strasbourg) | unreachable from this machine (404/"page unavailable") | — |

## Milestones

1. **Infrastructure — done.** Provenance system; structured data with a source on every measurement layer;
   tests for the Messier data, the M51 data, the event engine and provenance.
2. **First dynamic galaxy (M51) — done.** "Structure + explosions" view: 90,000 star points from the photo,
   140 star-forming regions, the four real transients at their NED positions with replays, procedural supernovae,
   clickable events with explanation and provenance, Chaos mode.
3. **Event engine** — supernovae done; neutron-star mergers, black-hole accretion and jets, tidal disruption and
   star-formation events next, each with its own rate model and provenance.
4. **Galaxy interactions** — needs IllustrisTNG data (key) for a real simulated merger with a timeline.
5. **Encyclopedia expansion** — NED makes this possible (Hoag's Object, NGC 4650A, NGC 1052-DF2, NGC 1569, IC 1101,
   NGC 1277, Arp galaxies …), with a "What we still don't know" section per object.
6. **Integration.**

## M51: what is real

- **Observed:** the photograph (DSS2 plates via SkyView); positions of NGC 5194/5195, SN 1994I, SN 2005cs,
  SN 2011dh and AT 2019abn (NED, with refcodes); their types, dates and peak magnitudes (Wikipedia).
- **Inferred:** the 3D layout, by deprojecting the photo with inclination 22°, position angle 173°
  (Colombo et al. 2014, ApJ 784, 3); star-forming regions, as compact knots bluer than their surroundings (colour
  only — some may be foreground stars or clusters); distance 7.94 Mpc, the median of NED-D's published distances.
- **Artistic:** the disk's thickness (0.3 kpc scale height, thicker bulge — a photo has no depth); NGC 5195 put
  2 kpc behind the disk; what explosions look like and their 100× slowed timing; the knots' shimmer.
- **Procedural:** every explosion that isn't a replay. Places: core-collapse at young (blue) light, Type Ia at old
  (red/IR) light — so NGC 5195, an old galaxy, only gets Type Ia. Mix: Lick Observatory Supernova Search volume-
  limited fractions (Li et al. 2011, MNRAS 412, 1441): Ia 24%, Ib/c 19%, II 57%. Rate: M51's own record, 3 supernovae
  since 1994, at 1 year per second; Chaos mode ×30.

Limitations: the deprojection assumes a flat disk, so anything above or below it (and the tidal bridge to
NGC 5195) is flattened into the plane; a real supernova rate for one galaxy from three events is very uncertain;
the peak magnitudes per type are typical values, and real supernovae vary a lot around them.
