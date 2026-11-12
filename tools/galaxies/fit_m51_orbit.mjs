// Choose the M51–NGC 5195 orbit for the time machine, like Toomre & Toomre did by eye in 1972 but by number:
// try many present-day velocities for the companion (its present position is fixed by the photo; its depth assumed),
// keep the orbits whose past makes sense (arriving from > 40 kpc, at most two close passes, the last 120–550 Myr ago
// at 6–25 kpc, crossing M51's disk near it),
// run each as a test-particle simulation, and score how well the model disk TODAY matches the photograph
// (correlation of the non-round part of the log star density, face-on, 0.5 kpc pixels). The best is saved for the page.
// node tools/galaxies/fit_m51_orbit.mjs
import fs from 'node:fs';
import { runEncounter, halo, positionsAt, rng } from '../../src/lib/galaxy/encounterSim.js';

const dir = new URL('../../public/data/galaxies/m51/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('meta.json', dir)));
const stars = new Float32Array(fs.readFileSync(new URL('stars.bin', dir)).buffer.slice(0));
const MAIN = halo(200, 1.0, 40), COMP = halo(160, 0.8, 20);
// NGC 5195's position on the sky is fixed by the photo; its depth behind M51 isn't known (only that it is behind:
// M51's dusty arm crosses in front of it), so the depth is one of the things tried
const DEPTHS = [-2, -6, -10, -15, -20, -25];
const posAt = (z) => [meta.companion.x, meta.companion.y, z];
const G = 64, W = 16;
const grid = () => new Float64Array(G * G);
const bin = (H, x, y, w = 1) => { const i = Math.floor(((x + W) / (2 * W)) * G), j = Math.floor(((y + W) / (2 * W)) * G); if (i >= 0 && i < G && j >= 0 && j < G) H[j * G + i] += w; };
const blur = (H) => { const O = grid(); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { let s = 0, c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && a < G && b >= 0 && b < G) { s += H[b * G + a]; c++; } } O[j * G + i] = s / c; } return O; };
// only the non-round part counts: each map is divided by its own average at that radius, so a plain round disk
// scores ~0 and what is compared is the arms, the bridge and the companion
const detrend = (A) => {
  const nb = 32, sum = new Float64Array(nb), cnt = new Float64Array(nb), O = new Float64Array(A.length);
  const rb = (i, j) => Math.min(nb - 1, Math.floor(Math.hypot(i + 0.5 - G / 2, j + 0.5 - G / 2) / (G / 2) * nb));
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const r = rb(i, j); sum[r] += Math.log1p(A[j * G + i]); cnt[r]++; }
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const r = rb(i, j); O[j * G + i] = Math.log1p(A[j * G + i]) - sum[r] / cnt[r]; }
  return O;
};
let MASK = null;   // when set, pixels near the companion are left out (so only M51's own disk is compared)
const corr = (A, B) => {
  let a = detrend(A), b = detrend(B);
  if (MASK) { a = a.filter((_, i) => !MASK[i]); b = b.filter((_, i) => !MASK[i]); }
  const ma = a.reduce((s, x) => s + x) / a.length, mb = b.reduce((s, x) => s + x) / b.length;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(sa * sb);
};
// the photograph, as star density in the disk frame (main galaxy at the origin)
const photo = grid();
for (let i = 0; i < stars.length / 7; i++) bin(photo, stars[i * 7], stars[i * 7 + 1], stars[i * 7 + 6]);
const P = blur(photo);
// normalise each model star's contribution by the number of stars (the photo is light; the model is stars)
const score = (sim) => {
  const pos = positionsAt(sim, 0, new Float64Array(sim.n * 3));
  const H = grid();
  const c = [0, 0, 0];   // main centre today, to put it at the origin like the photo
  const cen = sim.cen, k = Math.round((0 - sim.t0) / sim.every);
  for (let q = 0; q < 3; q++) c[q] = cen[k * 6 + q];
  for (let i = 0; i < sim.n; i++) bin(H, pos[i * 3] - c[0], pos[i * 3 + 1] - c[1]);
  return corr(blur(H), P);
};

const R = rng(7), cands = [];
for (let k = 0; k < 600; k++) {
  const z = R() * 2 - 1, a = R() * 2 * Math.PI, s = Math.sqrt(1 - z * z), speed = 150 + 250 * R();
  for (const spin of [1, -1]) cands.push({ v: [s * Math.cos(a) * speed, s * Math.sin(a) * speed, z * speed], spin, pos: posAt(DEPTHS[Math.floor(R() * DEPTHS.length)]) });
}
const sensible = [];
for (const c of cands) {
  const sim = runEncounter({ main: MAIN, comp: COMP, compPos: c.pos, compVel: c.v, t0: -800, t1: 900, spin: c.spin, nDisk: 0, nComp: 0 });
  const past = sim.moments.filter((m) => m.kind === 'closest' && m.t < -120 && m.t > -550 && m.r > 6 && m.r < 25);
  const allPast = sim.moments.filter((m) => m.kind === 'closest' && m.t < 0);
  const cross = sim.moments.filter((m) => m.kind === 'crossing' && m.t < 0);
  // it must arrive from far away (more than 35 kpc apart 800 Myr ago) and pass at most twice — an encounter, not an old orbit
  const sep0 = Math.hypot(sim.cen[3] - sim.cen[0], sim.cen[4] - sim.cen[1], sim.cen[5] - sim.cen[2]);
  if (past.length && allPast.length <= 2 && sep0 > 35 && cross.some((q) => Math.abs(q.t - past[past.length - 1].t) < 80)) sensible.push({ ...c, peri: past[past.length - 1], nPass: allPast.length, merger: sim.moments.find((m) => m.kind === 'merger') });
}
console.log(`${cands.length} candidate orbits, ${sensible.length} with a sensible past`);
for (const c of sensible) {
  const sim = runEncounter({ main: MAIN, comp: COMP, compPos: c.pos, compVel: c.v, t0: -800, t1: 0, spin: c.spin, nDisk: 3500, nComp: 400 });
  c.score = score(sim);
}
sensible.sort((a, b) => b.score - a.score);
for (const c of sensible.slice(0, 6)) console.log(`score ${c.score.toFixed(3)}  depth ${-c.pos[2]}  passes ${c.nPass}  spin ${c.spin}  v ${c.v.map((x) => x.toFixed(0))} km/s  closest ${c.peri.r.toFixed(1)} kpc at ${c.peri.t.toFixed(0)} Myr  merger ${c.merger ? c.merger.t.toFixed(0) + ' Myr' : 'none in 900 Myr'}`);
// confirm the best few with more stars
const top = sensible.slice(0, 4).map((c) => ({ ...c, score2: score(runEncounter({ main: MAIN, comp: COMP, compPos: c.pos, compVel: c.v, t0: -800, t1: 0, spin: c.spin, nDisk: 9000, nComp: 1500 })) }));
top.sort((a, b) => b.score2 - a.score2);
const best = top[0];
// a baseline: an undisturbed disk (no companion pull) scores how much of the match is just "a round disk"
const flat = runEncounter({ main: MAIN, comp: halo(1, 0.8, 0.01), compPos: [200, 0, 0], compVel: [0, 0, 0], t0: -800, t1: 0, spin: 1, nDisk: 9000, nComp: 0 });
const baseline = score(flat);
console.log(`best ${best.score2.toFixed(3)} vs undisturbed disk ${baseline.toFixed(3)}`);
// the same, with the companion's surroundings (6 kpc) masked out: does the model's own disk match, not just the companion?
MASK = new Uint8Array(G * G);
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = ((i + 0.5) / G) * 2 * W - W, y = ((j + 0.5) / G) * 2 * W - W; MASK[j * G + i] = Math.hypot(x - best.pos[0], y - best.pos[1]) < 6 ? 1 : 0; }
const bestSim = runEncounter({ main: MAIN, comp: COMP, compPos: best.pos, compVel: best.v, t0: -800, t1: 0, spin: best.spin, nDisk: 9000, nComp: 1500 });
const diskOnly = score(bestSim), diskBase = score(flat);
const other = score(runEncounter({ main: MAIN, comp: COMP, compPos: best.pos, compVel: best.v, t0: -800, t1: 0, spin: -best.spin, nDisk: 9000, nComp: 1500 }));
console.log(`disk only (companion masked): best ${diskOnly.toFixed(3)}, undisturbed ${diskBase.toFixed(3)}, same orbit spinning the other way ${other.toFixed(3)}`);
best.diskOnly = diskOnly; best.diskBase = diskBase; best.otherSpin = other;
fs.writeFileSync(new URL('encounter.json', dir), JSON.stringify({
  main: { v: 200, rc: 1.0, rt: 40 }, comp: { v: 160, rc: 0.8, rt: 20 }, compPos: best.pos, depth: -best.pos[2], compVel: best.v.map((x) => +x.toFixed(2)), spin: best.spin,
  t0: -800, t1: 900, score: +best.score2.toFixed(3), baseline: +baseline.toFixed(3), diskOnly: +best.diskOnly.toFixed(3), diskBaseline: +best.diskBase.toFixed(3), otherSpin: +best.otherSpin.toFixed(3),
  closest: { t: best.peri.t, r: +best.peri.r.toFixed(1) }, passes: best.nPass, tried: cands.length, sensible: sensible.length,
  note: 'Orbit chosen from random trial velocities as the one whose model disk today best matches the photograph (correlation of the non-round part of the star density; an undisturbed disk scores the baseline). Not a published fit.',
}, null, 1));
console.log('saved encounter.json');
