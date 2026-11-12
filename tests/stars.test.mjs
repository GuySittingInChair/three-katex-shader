import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { starColour } from '../src/lib/sky/starsLayer.js';

const meta = JSON.parse(fs.readFileSync(new URL('../public/data/stars/named.json', import.meta.url)));
const find = (n) => meta.stars.find((s) => s.ascii === n);

test('named stars: complete, and the famous ones come out about right', () => {
  assert.ok(meta.stars.length > 380);
  for (const s of meta.stars) assert.ok(s.name && s.ly > 0 && s.hip > 0 && Number.isFinite(s.v), `${s.name}`);
  const sirius = find('Sirius'), vega = find('Vega'), proxima = find('Proxima Centauri');
  assert.ok(Math.abs(sirius.ly - 8.6) < 0.1, `Sirius ${sirius.ly} ly`);
  assert.ok(sirius.L > 15 && sirius.L < 40, `Sirius L ${sirius.L}`);          // published ~25
  assert.ok(Math.abs(vega.ly - 25) < 0.5, `Vega ${vega.ly} ly`);
  assert.ok(proxima.ly > 4.1 && proxima.ly < 4.3, `Proxima ${proxima.ly} ly`);
  assert.equal(sirius.lc, 'V'); assert.equal(find('Betelgeuse').lc, 'Ib');
});

test('star colours: hot stars blue-white, cool stars red-orange', () => {
  const hot = starColour(25000), cool = starColour(3200);
  assert.ok(hot[2] >= hot[0], 'hot star is bluer than red');
  assert.ok(cool[0] > cool[2], 'cool star is redder than blue');
});
