// node --test tests/   (no dependencies: Node's own test runner)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventEngine, createRng, pickType, SN_TYPES } from '../src/lib/galaxy/eventEngine.js';
import { PROVENANCE, parseProvenance, isProvenance, badge } from '../src/lib/galaxy/provenance.js';

const sites = { cc: [[1, 0, 0], [2, 0, 0]], ia: [[-1, 0, 0], [-2, 0, 0]] };

test('type fractions add up to 1 and match the LOSS mix', () => {
  const sum = Object.values(SN_TYPES).reduce((s, t) => s + t.frac, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const rng = createRng(3), n = 200000, count = { Ia: 0, Ibc: 0, II: 0 };
  for (let i = 0; i < n; i++) count[pickType(rng())]++;
  for (const k of Object.keys(count)) assert.ok(Math.abs(count[k] / n - SN_TYPES[k].frac) < 0.005, `${k}: ${count[k] / n}`);
});

test('every generated event is PROCEDURAL, at a site of the right kind', () => {
  const eng = createEventEngine({ sites, ratePerYear: 5, yearsPerSecond: 1, rng: createRng(9) });
  const all = [];
  for (let t = 0; t < 200; t += 0.05) all.push(...eng.step(0.05, t));
  assert.ok(all.length > 500);
  for (const e of all) {
    assert.equal(e.provenance, 'PROCEDURAL');
    assert.ok(isProvenance(e.provenance));
    const list = e.type === 'Ia' ? sites.ia : sites.cc;
    assert.ok(list.some((p) => p[0] === e.pos[0]), `${e.type} at ${e.pos}`);
    assert.ok(e.duration > 0 && e.intensity > 0);
  }
});

test('the rate matches what was asked for, and chaos multiplies it', () => {
  const run = (chaos) => {
    const eng = createEventEngine({ sites, ratePerYear: 0.1, yearsPerSecond: 1, rng: createRng(11) });
    eng.setChaos(chaos);
    let n = 0;
    for (let t = 0; t < 20000; t += 0.1) n += eng.step(0.1, t).length;
    return n / 20000;
  };
  const base = run(1), fast = run(30);
  assert.ok(Math.abs(base - 0.1) < 0.012, `base ${base}`);
  assert.ok(Math.abs(fast / base - 30) < 4, `ratio ${fast / base}`);
});

test('same seed, same events (repeatable)', () => {
  const go = () => { const eng = createEventEngine({ sites, ratePerYear: 2, rng: createRng(42) }); const out = []; for (let t = 0; t < 30; t += 0.1) out.push(...eng.step(0.1, t).map((e) => `${e.type}@${e.pos}`)); return out.join('|'); };
  assert.equal(go(), go());
});

test('replays of real supernovae are OBSERVED and keep their own type and place', () => {
  const eng = createEventEngine({ sites, ratePerYear: 1, rng: createRng(1) });
  const e = eng.replay({ name: 'SN 2011dh', type: 'IIb', date: '2011-05-31', x: 4.1, y: 4.74 }, 0);
  assert.equal(e.provenance, 'OBSERVED');
  assert.equal(e.type, 'II'); assert.equal(e.observedType, 'IIb');
  assert.deepEqual(e.pos, [4.1, 4.74, 0]);
  assert.equal(eng.replay({ name: 'x', type: 'Ic', date: '1994', x: 0, y: 0 }, 0).type, 'Ibc');
});

test('finished events are forgotten', () => {
  const eng = createEventEngine({ sites, ratePerYear: 50, rng: createRng(5) });
  for (let t = 0; t < 10; t += 0.1) eng.step(0.1, t);
  const before = eng.events.length;
  for (let t = 10; t < 60; t += 0.1) eng.step(0.1, t);   // keeps making new ones
  assert.ok(eng.events.every((e) => 60 - e.t0 <= e.duration * 2.5 + 0.2));
  assert.ok(before > 0);
});

test('bad inputs are refused', () => {
  assert.throws(() => createEventEngine({ sites, ratePerYear: 0 }));
  assert.throws(() => createEventEngine({ sites: { cc: [], ia: [[0, 0, 0]] }, ratePerYear: 1 }));
});

test('provenance notes parse, unknown kinds are refused', () => {
  assert.deepEqual(parseProvenance('INFERRED: from colour'), { kind: 'INFERRED', text: 'from colour' });
  assert.throws(() => parseProvenance('GUESSED: no'));
  assert.throws(() => badge('NOPE'));
  for (const k of Object.keys(PROVENANCE)) assert.match(badge(k), /gx-badge/);
});
