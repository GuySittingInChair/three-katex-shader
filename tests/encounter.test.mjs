import test from 'node:test';
import assert from 'node:assert/strict';
import { runEncounter, halo, positionsAt, centresAt } from '../src/lib/galaxy/encounterSim.js';

const MAIN = halo(200, 1.0, 40);

test('with no companion, a disk of circular orbits stays a disk', () => {
  const sim = runEncounter({ main: MAIN, comp: halo(1, 0.8, 0.01), compPos: [300, 0, 0], compVel: [0, 0, 0], t0: -500, t1: 0, nDisk: 600, nComp: 0 });
  const p = positionsAt(sim, 0, new Float64Array(sim.n * 3)), c = centresAt(sim, 0).main;
  let worst = 0;
  for (let i = 0; i < sim.n; i++) worst = Math.max(worst, Math.abs(Math.hypot(p[i * 3] - c[0], p[i * 3 + 1] - c[1]) / sim.born[i * 2] - 1));
  assert.ok(worst < 0.05, `a star drifted ${(worst * 100).toFixed(1)}% from its circle`);
});

test('snapshot interpolation follows the real orbit between snapshots', () => {
  const coarse = runEncounter({ main: MAIN, comp: halo(1, 0.8, 0.01), compPos: [300, 0, 0], compVel: [0, 0, 0], t0: -100, t1: 0, nDisk: 200, nComp: 0, every: 10 });
  const fine = runEncounter({ main: MAIN, comp: halo(1, 0.8, 0.01), compPos: [300, 0, 0], compVel: [0, 0, 0], t0: -100, t1: 0, nDisk: 200, nComp: 0, every: 1 });
  const a = positionsAt(coarse, -45, new Float64Array(coarse.n * 3)), b = positionsAt(fine, -45, new Float64Array(fine.n * 3));
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  assert.ok(worst < 0.05, `interpolated position off by ${worst.toFixed(3)} kpc`);
});

test('the fitted M51 encounter: one pass from far away, then a merger, and nothing blows up', async () => {
  const fs = await import('node:fs');
  const f = JSON.parse(fs.readFileSync(new URL('../public/data/galaxies/m51/encounter.json', import.meta.url)));
  const sim = runEncounter({ main: halo(f.main.v, f.main.rc, f.main.rt), comp: halo(f.comp.v, f.comp.rc, f.comp.rt), compPos: f.compPos, compVel: f.compVel, spin: f.spin, t0: f.t0, t1: f.t1, nDisk: 300, nComp: 50 });
  const past = sim.moments.filter((m) => m.kind === 'closest' && m.t < 0);
  assert.ok(past.length >= 1 && past.length <= 2, `${past.length} past passes`);
  assert.ok(sim.moments.some((m) => m.kind === 'merger' && m.t > 0), 'merges in the future');
  for (const v of sim.snaps) assert.ok(Number.isFinite(v));
  assert.ok(f.diskOnly > f.diskBaseline + 0.1, 'fits the photo better than an undisturbed disk');
});
