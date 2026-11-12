// Checks the shipped astronomy data files: every object complete and sane, every layer labelled with where it
// comes from, real events traceable to a source.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseProvenance } from '../src/lib/galaxy/provenance.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL('../public/' + p, import.meta.url)));

test('Messier: all 110, numbered 1–110, each complete', () => {
  const m = read('data/messier/meta.json');
  assert.equal(m.objects.length, 110);
  assert.deepEqual(m.objects.map((o) => o.m).sort((a, b) => a - b), Array.from({ length: 110 }, (_, i) => i + 1));
  for (const o of m.objects) {
    assert.ok(o.ly > 300 && o.ly < 2e8, `M${o.m} distance ${o.ly}`);
    assert.ok(o.ra >= 0 && o.ra < 360 && o.dec >= -90 && o.dec <= 90, `M${o.m} position`);
    assert.ok(o.about.length > 50, `M${o.m} summary`);
    assert.match(o.wiki, /^https:\/\/en\.wikipedia\.org\/wiki\//);
    assert.ok(o.survey && o.fov > 0, `M${o.m} photo source`);
    for (const k of ['type', 'const', 'dims']) assert.ok(!/[<{[]/.test(o[k]), `M${o.m} ${k} has markup: ${o[k]}`);
    assert.ok(fs.existsSync(new URL(`../public/data/messier/img/m${String(o.m).padStart(3, '0')}.jpg`, import.meta.url)), `M${o.m} image`);
  }
});

test('M51 structure: provenance on every layer, real events sourced', () => {
  const g = read('data/galaxies/m51/meta.json');
  for (const note of Object.values(g.provenance)) parseProvenance(note);   // throws if unlabelled
  assert.ok(g.distMpc > 5 && g.distMpc < 12);
  assert.ok(g.inclination > 0 && g.inclination < 90 && g.orientationRef);
  assert.ok(g.ccSites.length > 100 && g.iaSites.length > 100);
  assert.ok(g.observed.length >= 3);
  for (const o of g.observed) {
    assert.ok(o.posRef && o.wiki && o.date && o.type, `${o.name} incomplete`);
    assert.ok(Math.hypot(o.x, o.y) < 15, `${o.name} lies outside the disk`);
  }
  for (const f of g.features) assert.ok(f.facts && f.src && f.provenance === 'OBSERVED' && Number.isFinite(f.x), `feature ${f.id}`);
  const bytes = fs.statSync(new URL('../public/data/galaxies/m51/stars.bin', import.meta.url)).size;
  assert.equal(bytes, g.nStars * g.stride * 4);
});
