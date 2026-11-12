import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { search, lookbackYears, unknownHTML } from '../src/lib/galaxy/catalog.js';

const messier = JSON.parse(fs.readFileSync(new URL('../public/data/messier/meta.json', import.meta.url))).objects;
const deep = JSON.parse(fs.readFileSync(new URL('../public/data/deepsky/meta.json', import.meta.url))).objects;
const all = [...messier, ...deep];

test('search finds things by any of their names', () => {
  assert.equal(search(all, 'M51')[0].m, 51);
  assert.equal(search(all, 'messier 31')[0].m, 31);
  assert.equal(search(all, 'whirlpool')[0].m, 51);
  assert.equal(search(all, 'NGC 1976')[0].m, 42);
  assert.equal(search(all, 'hoag')[0].id, 'hoag');
  assert.equal(search(all, "stephan's quintet")[0].id, 'stephan');
  assert.equal(search(all, 'df2')[0].id, 'df2');
  assert.ok(search(all, 'dark matter').some((o) => o.id === 'bullet'));
  assert.deepEqual(search(all, ''), []);
  assert.deepEqual(search(all, 'zzzzqqq'), []);
});

test('Unknown Universe entries are complete and sourced', () => {
  assert.ok(deep.length >= 30);
  const ids = new Set();
  for (const o of deep) {
    assert.ok(!ids.has(o.id), `duplicate ${o.id}`); ids.add(o.id);
    assert.ok(o.why.length > 40 && o.unknown.length >= 1, `${o.id} text`);
    assert.ok(o.ly > 1e4 && o.ly < 1e10, `${o.id} distance ${o.ly}`);
    assert.ok(o.distSrc && o.posRef, `${o.id} sources`);
    assert.ok(o.ra >= 0 && o.ra < 360 && Math.abs(o.dec) <= 90, `${o.id} position`);
    assert.ok(o.about.length > 50 && o.wikiUrl.startsWith('https://en.wikipedia.org/'), `${o.id} summary`);
    assert.ok(fs.existsSync(new URL(`../public/data/deepsky/img/${o.id}.jpg`, import.meta.url)), `${o.id} image`);
    assert.match(unknownHTML(o), /What we still don't know/);
  }
});

test('light-travel time: close to distance nearby, shorter far away', () => {
  const near = lookbackYears(0.01), far = lookbackYears(0.3);
  assert.ok(Math.abs(near / 1.4e8 - 1) < 0.05, `z=0.01: ${near}`);         // ~ cz/H0 = 42.8 Mpc = 140 Mly
  assert.ok(far > 3.1e9 && far < 3.6e9, `z=0.3: ${far}`);                  // ~3.4 Gyr in this cosmology
});
