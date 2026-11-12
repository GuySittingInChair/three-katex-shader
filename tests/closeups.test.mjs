// The close-ups that compute something: the tidal disruption's debris (Newtonian, in closeupFx.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCloseups } from '../src/lib/galaxy/closeupFx.js';
import { RARE, waitText } from '../src/lib/galaxy/eventEngine.js';

test('tidal disruption: about half the debris escapes, and fallback rises then fades', () => {
  const c = createCloseups(), cam = new THREE.PerspectiveCamera();
  c.play('tde', { now: 0, position: new THREE.Vector3(), scale: 1, seed: 3 });
  const perSecond = []; let last = 0, st;
  for (let t = 0; t < 21.9; t += 1 / 60) {
    c.update(t, 1 / 60, 500, cam); st = c.current.state;
    if (Math.floor(t) !== Math.floor(t - 1 / 60)) { perSecond.push(st.captured - last); last = st.captured; }
  }
  const unbound = st.deb.filter((d) => !d.disk && (d.vx ** 2 + d.vy ** 2 + d.vz ** 2) / 2 - 1 / Math.hypot(d.x, d.y, d.z) > 0).length;
  const f = unbound / st.deb.length;
  assert.ok(f > 0.35 && f < 0.65, `unbound fraction ${f}`);
  const peak = perSecond.indexOf(Math.max(...perSecond));
  assert.ok(peak > 5 && peak < 11, `peak at ${peak} s`);                      // after the star passes pericentre (5.5 s)
  const early = perSecond.slice(peak, peak + 3).reduce((a, b) => a + b), late = perSecond.slice(peak + 6, peak + 9).reduce((a, b) => a + b);
  assert.ok(late < early / 2, `fallback should fade: ${early} then ${late}`);
});

test('every close-up kind runs without blowing up', () => {
  const c = createCloseups(), cam = new THREE.PerspectiveCamera();
  for (const kind of ['kilonova', 'tde', 'agn', 'xrb']) {
    c.play(kind, { now: 0, position: new THREE.Vector3(), scale: 1 });
    for (let t = 0; t < 12; t += 0.1) assert.ok(Number.isFinite(c.update(t, 0.1, 500, cam)), kind);
  }
  c.dispose();
});

test('rare-event rates come with their range and sources', () => {
  for (const k of ['kilonova', 'tde']) {
    const [lo, hi] = RARE[k].perYear;
    assert.ok(lo > 0 && hi > lo && hi < 1e-3, k);
    assert.ok(RARE[k].ref.length > 20);
  }
  assert.match(waitText(RARE.kilonova.perYear), /7,000 to 1\.2 million years/);
});
