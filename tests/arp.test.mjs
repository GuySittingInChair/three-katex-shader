import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { search } from '../src/lib/galaxy/catalog.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL('../public/data/' + p, import.meta.url)));

test("Arp's atlas: every number accounted for, each card sourced", () => {
  const a = read('arp/meta.json');
  const shown = a.objects.map((o) => o.arp);
  const tagged = [...Object.values(a.alsoArp.messier), ...Object.values(a.alsoArp.deep)].flat();
  const all = new Set([...shown, ...tagged]);
  assert.equal(new Set(shown).size, shown.length, 'no Arp number twice');
  assert.ok(all.size >= 310, `only ${all.size} of 338 accounted for`);   // ~20 have no distance in NED, even via a member galaxy
  for (const o of a.objects) {
    assert.ok(o.cls && o.sub && o.clsText.length > 30, `Arp ${o.arp} class`);
    assert.ok(o.ly > 1e5 && o.ly < 2e10 && o.distSrc, `Arp ${o.arp} distance`);
    assert.ok(o.posRef.startsWith('NED'), `Arp ${o.arp} position`);
    assert.ok(fs.existsSync(new URL(`../public/data/arp/img/arp${String(o.arp).padStart(3, '0')}.jpg`, import.meta.url)), `Arp ${o.arp} image`);
  }
});

test('Arp numbers are searchable, including ones shown as Messier objects', () => {
  const a = read('arp/meta.json'), m = read('messier/meta.json').objects, d = read('deepsky/meta.json').objects;
  for (const [mm, arps] of Object.entries(a.alsoArp.messier)) { const o = m.find((x) => x.m === +mm); o.alsoArp = arps; }
  const all = [...m, ...d, ...a.objects];
  if (a.alsoArp.messier[51]) assert.equal(search(all, 'Arp 85')[0].m, 51);
  const one = a.objects[0];
  assert.equal(search(all, `Arp ${one.arp}`)[0].arp, one.arp);
});
