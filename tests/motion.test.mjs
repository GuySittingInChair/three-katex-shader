// "Where it's moving": the card text says what's measured and what's predicted, and the arrow points the right way.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { motionKey, motionHTML, motionRaDec, inLocalGroupModel } from '../src/lib/galaxy/motion.js';

const data = JSON.parse(readFileSync(new URL('../public/data/motion/motion.json', import.meta.url)));
const by = Object.fromEntries(data.galaxies.map((g) => [g.key, g]));

test('keys match the three collections', () => {
  assert.equal(motionKey({ cat: 'messier', m: 87 }), 'm87');
  assert.equal(motionKey({ cat: 'arp', arp: 273 }), 'arp:273');
  assert.equal(motionKey({ cat: 'unknown', id: 'cartwheel' }), 'deep:cartwheel');
  for (const k of ['m87', 'arp:273', 'deep:cartwheel', 'm31']) assert.ok(by[k], k);
});

test('a galaxy with an independent distance: expansion, its own motion, the prediction, labelled', () => {
  const h = motionHTML(by.m87, data);
  assert.match(h, /away from us at 1,284 km\/s/);
  assert.match(h, /Observed/); assert.match(h, /Inferred/);
  assert.match(h, /Virgo Cluster/);
  assert.match(h, /predicted from gravity/);
});

test('a redshift-only distance does not claim its own motion', () => {
  const h = motionHTML(by['arp:273'], data);
  assert.doesNotMatch(h, /What's left over/);
  assert.match(h, /can't be told apart/);
});

test('Local Group members get the model button, not a gravity-map prediction', () => {
  const h = motionHTML(by.m31, data);
  assert.match(h, /data-act="lg"/);
  assert.doesNotMatch(h, /predicted from gravity/);
  assert.ok(inLocalGroupModel('deep:lmc'));
});

test('beyond the map, no prediction', () => {
  const far = data.galaxies.find((g) => g.cf4?.outside);
  assert.ok(far);
  assert.match(motionHTML(far, data), /too far away/);
  assert.equal(motionRaDec(far), null);
});

test('arrow direction: the eq unit vector round-trips to the predicted direction', () => {
  const r = by.m87, [ra, dec] = motionRaDec(r), d = Math.PI / 180;
  const e = [Math.cos(dec * d) * Math.cos(ra * d), Math.cos(dec * d) * Math.sin(ra * d), Math.sin(dec * d)];
  r.cf4.eq.forEach((x, i) => assert.ok(Math.abs(x - e[i]) < 1e-3));
});

test('the Local Group file: both scenarios, sensible present-day motions', () => {
  const lg = JSON.parse(readFileSync(new URL('../public/data/motion/lg.json', import.meta.url)));
  assert.equal(lg.scenarios.length, 2);
  for (const S of lg.scenarios) {
    assert.ok(S.now.M31.vRad < -100 && S.now.M31.vRad > -130, 'M31 approaches at ~110 km/s');
    assert.ok(S.now.LMC.vTan > 280 && S.now.LMC.vTan < 360, 'LMC moves sideways at ~320 km/s');
    assert.ok(S.hit.t50 > 3000 && S.hit.t50 < 9000);
    assert.equal(S.orbits[0].length, 4);
  }
});

test('flow.json + flow.bin: sizes match, time table runs through today, growth stops in the future', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../public/data/motion/flow.json', import.meta.url)));
  const buf = fs.readFileSync(new URL('../public/data/motion/flow.bin', import.meta.url));
  assert.equal(buf.length, m.n * 12 + m.n);
  const now = m.table.find((r) => r[1] >= 1);
  assert.ok(Math.abs(now[2] - 1) < 0.01 && Math.abs(now[0] - m.age) < 0.2);
  assert.ok(m.dInf > 1.2 && m.dInf < 1.6, 'ΛCDM growth saturates ~1.4× today');
  assert.ok(m.clumpiness.early < m.clumpiness.now, 'running back smooths the matter out');
  assert.ok(m.labels.some((l) => /Virgo/.test(l.name)));
});

test('shapes.json: every ring and shell fit beats its own control', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../public/data/pairs/shapes.json', import.meta.url)));
  const ok = m.fits.filter((f) => f.ok);
  assert.ok(ok.length >= 8);
  for (const f of ok) {
    const ctl = f.kind === 'ring' ? Math.max(f.baseline, f.controlMedian) : Math.max(f.rotated, f.controlMedian);
    assert.ok(f.score > ctl, `${f.tag}: ${f.score} vs ${ctl}`);
    assert.ok(f.t0 < 0 && f.t1 > 0 && Number.isFinite(f.centreRa));
    if (f.kind === 'ring') assert.ok(f.impact.t < 0 && f.impact.r < f.measured.ringKpc);
  }
});
