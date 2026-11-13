import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEncounter, halo } from '../src/lib/galaxy/encounterSim.js';

const n = [0.3, -0.5, 0.81];
const nn = Math.hypot(...n), N = n.map((x) => x / nn);

test('a tilted disk lies in the plane its normal sets, and turns right-handed about it', () => {
  // companion far away and massless, so the disk is undisturbed
  const sim = runEncounter({ main: halo(200, 1, 40), comp: halo(1, 0.5, 0.01), compPos: [800, 0, 0], compVel: [0, 0, 0], t0: -1, t1: 0, nDisk: 500, nComp: 0, dt: 0.5, every: 1, mainDisk: { n, rd: 3, rmax: 15 } });
  const S = sim.snaps; let Lsum = [0, 0, 0], off = 0;
  for (let i = 0; i < sim.n; i++) {
    const x = [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]], v = [S[sim.n * 3 + i * 3], S[sim.n * 3 + i * 3 + 1], S[sim.n * 3 + i * 3 + 2]];
    off = Math.max(off, Math.abs(x[0] * N[0] + x[1] * N[1] + x[2] * N[2]));
    const L = [x[1] * v[2] - x[2] * v[1], x[2] * v[0] - x[0] * v[2], x[0] * v[1] - x[1] * v[0]];
    Lsum = Lsum.map((s, k) => s + L[k]);
  }
  assert.ok(off < 0.2, `stars stay within the disk's thin plane (max ${off})`);
  const l = Math.hypot(...Lsum);
  assert.ok(Lsum.reduce((s, x, k) => s + x * N[k], 0) / l > 0.999, 'angular momentum along +n');
});

test('both galaxies get disks when asked, and the stars are labelled by galaxy', () => {
  const sim = runEncounter({ main: halo(200, 1, 40), comp: halo(150, 0.8, 25), compPos: [30, 0, 5], compVel: [0, 150, 0], t0: -50, t1: 50, nDisk: 200, nComp: 100, dt: 1, every: 10,
    mainDisk: { n: [0, 0, 1], rd: 3, rmax: 15 }, compDisk: { n: [1, 0, 0], rd: 2, rmax: 10 } });
  assert.equal(sim.n, 300);
  let comp = 0; for (let i = 0; i < sim.n; i++) comp += sim.born[i * 2 + 1];
  assert.equal(comp, 100);
  // the companion's stars start round the companion, in its x = const plane
  const c = [sim.cen[3], sim.cen[4], sim.cen[5]];
  for (let i = 200; i < 300; i++) assert.ok(Math.abs(sim.snaps[i * 3] - c[0]) < 0.25);
});

test('the disk-crossing moment uses the tilted plane', () => {
  // companion falling through a disk tilted to face x, missing the centre
  const sim = runEncounter({ main: halo(200, 1, 40), comp: halo(100, 0.5, 10), compPos: [-30, 6, 0], compVel: [400, 0, 0], t0: -10, t1: 200, nDisk: 0, nComp: 0, dt: 1, mainDisk: { n: [1, 0, 0], rd: 3, rmax: 15 } });
  assert.ok(sim.moments.some((m) => m.kind === 'crossing'), 'crossing found');
});
