---
summary: The lines of the Gaia data script that turn measured parallaxes into star positions, explained.
added: 2026-11-20
file: tools/gaia/build_gaia.py
---

# Gaia data script: the lines that matter

`tools/gaia/build_gaia.py` runs once, on a computer, before the site is built. It reads the stars downloaded
from the Gaia archive and writes the compact file that [The Stars Within 100
Parsecs](../../../src/sketches/gaiaNeighbourhood.js) loads. These notes cover the lines quoted in [Parallax:
measuring the distance to the stars](../parallax-and-distance.md).

## Lines

### `WHERE parallax > 10 AND parallax_over_error > 10 AND ruwe < 1.4 AND bp_rp IS NOT NULL`

The filter sent to the Gaia archive: which of its 1.8 billion stars to download. Only stars that pass all four
tests are kept, about a quarter of a million.
#### `parallax > 10`
A parallax over 10 thousandths of an arcsecond means nearer than 1000 ÷ 10 = 100 parsecs (326 light-years):
the sketch's bubble.
#### `parallax_over_error > 10`
The parallax must be at least ten times its own measurement error, so every distance is good to about 10%.
Without this, faint stars with shaky parallaxes would scatter in and out of the bubble at random.
#### `ruwe < 1.4`
RUWE says how well Gaia's model of a single, steadily moving star fits the measurements; 1 is a perfect fit.
Above about 1.4 the star is often really two stars orbiting each other, which spoils the parallax, so those
are left out.
#### `bp_rp IS NOT NULL`
Keep only stars whose colour was measured (blue light minus red light), because the sketch colours each star
by it and arranges the colour–brightness diagram with it.

### `ra, dec, plx, pmra, pmdec, rv, G, bprp = d.T`

Unpacks the downloaded table into eight lists, one value per star: where on the sky (`ra`, `dec`), the
parallax (`plx`), how fast it drifts across the sky (`pmra`, `pmdec`), how fast it moves towards or away from
us (`rv`, not measured for every star), its brightness as seen from Earth (`G`) and its colour (`bprp`).

### `dist = 1000 / plx`

The parallax formula, d = 1000 / ϖ, worked out for all quarter of a million stars at once: distance in parsecs
from the parallax in milliarcseconds.
#### `1000`
Turns milliarcseconds into arcseconds. Leave it out and every star would be a thousand times too close.
#### `plx`
The parallax, one number per star, in milliarcseconds.

### `c = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, distance=dist * u.pc, pm_ra_cosdec=pmra * u.mas / u.yr,`

Hands each star's direction, distance and motion to astropy, a standard astronomy toolbox, which turns them
into positions in space (and velocities) around the Sun, lined up with the Milky Way rather than with the
Earth.
#### `distance=dist * u.pc`
This is where the parallax becomes a place: the distance from the line above, in parsecs.

### `MG = G + 5 * np.log10(plx / 100)`

The star's true brightness: how bright it would look from a standard distance of 10 parsecs. Two stars that
look equally bright can be very different, if one is much further away; this puts them on an equal footing,
for the colour–brightness diagram.
#### `5 * np.log10(plx / 100)`
The distance correction. Astronomers' brightness scale (magnitudes) counts backwards and goes up by 5 for
every 100 times fainter. A star at 10 parsecs has a parallax of 100 mas, so this term is 0 there; nearer stars
(bigger parallax) get a positive term, because from 10 parsecs they'd look fainter.
