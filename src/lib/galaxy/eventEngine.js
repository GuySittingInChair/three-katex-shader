// The galactic event engine: decides when and where things happen in a galaxy. Plain JavaScript (no Three.js),
// so it can be tested on its own (tests/galaxy-engine.test.mjs). Drawing is done elsewhere (supernovaFx.js).
//
// Supernovae, for now. Where: sampling sites made offline from the galaxy's own photograph (build_m51.py):
// core-collapse explosions (massive stars, short-lived) at young, blue light; Type Ia (white dwarfs, which can
// explode billions of years after their stars formed) at old, red light. Which type: the volume-limited mix from
// the Lick Observatory Supernova Search (Li et al. 2011, MNRAS 412, 1441): Ia 24%, Ib/c 19%, II 57%.
// How often: by default the galaxy's own observed record (for M51, 3 supernovae seen 1994–2026), with time
// running at `yearsPerSecond`. Chaos mode multiplies the rate; it never changes the mix or the places.
// Every event made here is PROCEDURAL; replays of real ones are OBSERVED (position and type), drawn artistically.

export const SN_TYPES = {
  Ia: {
    frac: 0.24, label: 'Type Ia', peakAbsMag: -19.3, durationS: 6, colour: [0.75, 0.85, 1.0],
    what: 'A white dwarf — the dead core of a Sun-like star — gained enough mass from a companion (or merged with one) to ignite carbon all at once and blow itself apart. No star is left behind. They come from old stars, so they can happen anywhere there are old stars, not only in the arms.',
  },
  Ibc: {
    frac: 0.19, label: 'Type Ib/c', peakAbsMag: -17.5, durationS: 5, colour: [0.8, 0.9, 1.0],
    what: 'A massive star that had already lost its outer hydrogen (and for Ic its helium too), usually to a companion star, ran out of fuel; its core collapsed to a neutron star or black hole and the rest was blown off.',
  },
  II: {
    frac: 0.57, label: 'Type II', peakAbsMag: -16.8, durationS: 8, colour: [1.0, 0.62, 0.45],
    what: 'A massive star, at least about 8 times the Sun, ran out of fuel. Its iron core collapsed in under a second into a neutron star, and the bounce blew the rest of the star — still wrapped in hydrogen, which glows red — into space. Massive stars live only a few million years, so these happen where stars are still being born: in the spiral arms.',
  },
};
export const TYPICAL = { energyErg: 1e51, ejectaKms: 10000 };   // textbook order of magnitude for any supernova
export const LOSS_REF = 'Li et al. 2011, MNRAS 412, 1441 (Lick Observatory Supernova Search)';

/** small seeded random number generator, so tests (and a given seed) are repeatable */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickType(r) {
  let acc = 0;
  for (const [k, t] of Object.entries(SN_TYPES)) { acc += t.frac; if (r < acc) return k; }
  return 'II';
}

/**
 * @param {object} o
 * @param {{cc: number[][], ia: number[][]}} o.sites  candidate positions [x, y, z] (kpc, disk frame)
 * @param {number} o.ratePerYear     supernovae per year in this galaxy
 * @param {number} [o.yearsPerSecond=1]
 * @param {() => number} [o.rng]
 */
export function createEventEngine({ sites, ratePerYear, yearsPerSecond = 1, rng = createRng(1) }) {
  if (!(ratePerYear > 0)) throw new Error('ratePerYear must be positive');
  if (!sites?.cc?.length || !sites?.ia?.length) throw new Error('need core-collapse and Type Ia sites');
  let nextId = 1, simYears = 0, chaos = 1;
  const events = [];
  const make = (type, pos, t0, provenance, extra = {}) => {
    const T = SN_TYPES[type];
    const e = {
      id: nextId++, kind: 'supernova', type, label: T.label, pos: pos.slice(), t0, duration: T.durationS,
      intensity: 10 ** (-0.4 * (T.peakAbsMag + 16.8)),            // relative to an ordinary Type II
      provenance, simYear: simYears, ...extra,
    };
    events.push(e);
    return e;
  };
  return {
    events,
    get simYears() { return simYears; },
    get chaos() { return chaos; },
    setChaos(k) { chaos = Math.max(1, k); },
    /** expected seconds between explosions at the current settings */
    meanGapSeconds() { return 1 / (ratePerYear * yearsPerSecond * chaos); },
    /** advance by dt seconds of page time (at time `now`); returns the events that started */
    step(dt, now) {
      const born = [];
      simYears += dt * yearsPerSecond;
      // Poisson: in a short step the chance of one explosion is rate·dt (several at once if chaos is huge)
      let expect = ratePerYear * yearsPerSecond * chaos * dt;
      while (expect > 0) {
        if (rng() < Math.min(1, expect)) {
          const type = pickType(rng());
          const list = type === 'Ia' ? sites.ia : sites.cc;
          born.push(make(type, list[Math.floor(rng() * list.length)], now, 'PROCEDURAL'));
        }
        expect -= 1;
      }
      // forget finished ones
      for (let i = events.length - 1; i >= 0; i--) if (now - events[i].t0 > events[i].duration * 2.5) events.splice(i, 1);
      return born;
    },
    /** replay a real, observed supernova at its real place */
    replay(obs, now) {
      const type = /^Ia/.test(obs.type) ? 'Ia' : /^I[bc]/.test(obs.type) ? 'Ibc' : 'II';
      return make(type, [obs.x, obs.y, obs.z ?? 0], now, 'OBSERVED', { name: obs.name, observedType: obs.type, date: obs.date, obs });
    },
  };
}
