// "Where it's moving": for every galaxy card, what its redshift says (OBSERVED), how much of that is the expansion of
// the universe and how much its own motion (INFERRED, when its distance is measured independently), and the full 3D
// motion that the Cosmicflows-4 map of gravity predicts for it (INFERRED). Data: tools/motion/build_motion.py.
import { badge } from './provenance.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MOTION_CSS = `
.mv{border:1px solid #7dffc033;background:#7dffc00a;border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13.5px}
.mv-h{font-weight:600;color:#9ff0cc;margin-bottom:6px;letter-spacing:.02em}
.mv p{margin:0 0 7px}
.mv .mv-n{color:#8a93a6;font-size:12px}
.mv details{margin-top:6px;font-size:12.5px;color:#b9c1d0}
.mv summary{cursor:pointer;color:#9fc6ff}
.mv .mv-btn{margin-top:4px;border-color:#7dffc088;color:#cffff0}
.gx-badge{display:inline-block;font-size:11px;line-height:1.4;padding:0 7px;border:1px solid;border-radius:99px;margin-left:6px;vertical-align:1px;white-space:nowrap}
`;

/** the key a card's record is stored under in motion.json */
export function motionKey(o) {
  if (!o) return null;
  return o.cat === 'arp' ? `arp:${o.arp}` : o.cat === 'unknown' ? `deep:${o.id}` : o.cat === 'messier' ? `m${o.m}` : null;
}

export async function loadMotion(url) {
  const r = await fetch(url);
  if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
  const m = await r.json();
  m.byKey = Object.fromEntries(m.galaxies.map((g) => [g.key, g]));
  return m;
}

// galaxies the Local Group model moves (or that ride along with one it moves)
const LG_MODEL = { m31: 'Andromeda', m32: 'Andromeda', m110: 'Andromeda', m33: 'Triangulum', 'deep:lmc': 'the Large Magellanic Cloud', 'deep:smc': 'the Large Magellanic Cloud' };
export const inLocalGroupModel = (key) => key in LG_MODEL;

/** equatorial unit vector of the predicted motion → [ra, dec] in degrees (for the arrow on the map) */
export function motionRaDec(rec) {
  const e = rec?.cf4?.eq;
  if (!e) return null;
  return [((Math.atan2(e[1], e[0]) * 180) / Math.PI + 360) % 360, (Math.asin(Math.max(-1, Math.min(1, e[2]))) * 180) / Math.PI];
}

export function motionHTML(rec, meta) {
  if (!rec) return '';
  const cz = rec.czHelio, c4 = rec.cf4 || {};
  const parts = [];
  // 1. what the redshift says
  parts.push(`<p>${cz >= 0 ? `Moving <b>away from us at ${fmt(cz)} km/s</b>` : `Coming <b>towards us at ${fmt(-cz)} km/s</b>`} ${badge('OBSERVED')}<br>
    <span class="mv-n">from its redshift${rec.zRef ? ` (${esc(rec.zRef)}, via NED)` : ' (NED)'}: the stretch of its light's wavelengths. That's only the part of its motion along our line of sight.</span></p>`);
  if (rec.localGroup) {
    const who = LG_MODEL[rec.key];
    parts.push(`<p>It's inside the <b>Local Group</b>, our own small group of galaxies. Here the expansion of the universe has stopped: the group's gravity holds it together, so the motion is all orbit.</p>`);
    if (who) parts.push(`<p>Its sideways motion has been measured (Hubble, Gaia, radio telescopes) — so here we can do what isn't possible for more distant galaxies: run the real 3D motions forward and back in time.${rec.key !== 'm31' && rec.key !== 'm33' && rec.key !== 'deep:lmc' ? ` In the model it rides along with ${who}.` : ''}</p>
      <button class="mz-btn mv-btn" data-act="lg">⏳ The Local Group: past and future</button>`);
    else parts.push(`<p class="mv-n">Its sideways motion isn't in our Local Group model, so we can't say more than the line-of-sight speed.</p>`);
    return `<div class="mv"><div class="mv-h">→ Where it's moving</div>${parts.join('')}</div>`;
  }
  // 2. expansion vs its own motion
  if (rec.vpec != null) {
    const tooBig = rec.vpecErr > 500;
    parts.push(`<p>Measured against the cosmic microwave background, the universe's own rest frame (taking out the Sun's own 370 km/s through it), it ${rec.czCmb >= 0 ? `recedes at ${fmt(rec.czCmb)}` : `approaches at ${fmt(-rec.czCmb)}`} km/s.
      The expansion of the universe alone would carry it away at about <b>${fmt(rec.hubble)} km/s</b> (its distance × 70 km/s per megaparsec). ${tooBig
      ? `What's left over is its own motion, but its distance is too uncertain (±${Math.round(rec.distErrFrac * 100)}%) to pin that down: ${sgn(rec.vpec)} ± ${fmt(rec.vpecErr)} km/s.`
      : `What's left over, <b>${sgn(rec.vpec)} ± ${fmt(rec.vpecErr)} km/s</b>, is the galaxy's own motion along our line of sight${rec.vpec > 0 ? ' (away)' : ' (towards us)'}.`} ${badge('INFERRED')}<br>
      <span class="mv-n">The ± comes from the spread of ${rec.nedd?.n ? `the ${rec.nedd.n} published distance${rec.nedd.n > 1 ? 's' : ''}` : 'its distance'}${rec.nedd?.n && rec.nedd.n < 3 ? ' (too few to judge, so we assume ±20%)' : ''}.</span></p>`);
    if (rec.cluster) parts.push(`<p>It's in <b>${esc(rec.cluster)}</b>, where galaxies swarm around at random speeds of hundreds of km/s, so this mostly shows its orbit inside the cluster.</p>`);
  } else if (!rec.indep) {
    parts.push(`<p class="mv-n">Its distance comes from its redshift, so here the expansion and its own motion can't be told apart.</p>`);
  }
  // 3. the gravity map's prediction
  if (c4.outside) {
    parts.push(`<p class="mv-n">It's too far away for the map of gravity we use (Cosmicflows-4 covers about 1.6 billion light-years around us), so we can't predict its full motion.</p>`);
  } else if (c4.v != null) {
    const tw = c4.towards ? `, heading roughly towards <b>${esc(c4.towards.name)}</b>${c4.towards.angle > 8 ? ` (${c4.towards.angle}° off)` : ''}` : '';
    const moon = c4.moonMyr ? ` So slow, seen from this far away, that it would take ${c4.moonMyr >= 1000 ? (c4.moonMyr / 1000).toFixed(1) + ' billion' : fmt(c4.moonMyr) + ' million'} years to drift the width of the full Moon across our sky.` : '';
    parts.push(`<p><b>Its full 3D motion, predicted from gravity: about ${fmt(c4.v)} km/s</b>${tw}. ${badge('INFERRED')}<br>
      Of that, ${sgn(c4.vLos)} km/s along our line of sight and ${fmt(c4.vSky)} km/s sideways.${moon}</p>`);
    if (rec.vpec != null && rec.vpecErr <= 500 && !rec.cluster) {
      const diff = Math.abs(rec.vpec - c4.vLos), tol = Math.hypot(rec.vpecErr, 250);
      parts.push(`<p class="mv-n">Check: measured ${sgn(rec.vpec)} ± ${fmt(rec.vpecErr)}, predicted ${sgn(c4.vLos)} km/s along the line of sight — ${diff < tol ? 'they agree within the errors' : diff < 2 * tol ? 'a fair match, given the errors' : 'they disagree: something local (a group, a close neighbour) or a wrong distance'}.</p>`);
    }
    if (c4.nearby) parts.push(`<p class="mv-n">This close, the map’s cells (36 million light-years wide) blur it together with our own neighbourhood, so this is mostly the motion of the whole region, the Local Group included.</p>`);
    else if (!c4.reliable) parts.push(`<p class="mv-n">At this distance the map is built from fewer, rougher distances, so the prediction is less certain.</p>`);
    parts.push(`<p class="mv-n">The arrow on the map shows this direction (length ∝ speed).</p>`);
  }
  const ck = meta?.check?.find((c) => c.nMin === 20);
  parts.push(`<details><summary>How this works</summary>
    <p style="margin:6px 0">Every galaxy pulls on every other. Astronomers measured the distances of about 56,000 galaxies (Cosmicflows-4), worked out how the matter
    must be spread out to explain their motions, and from that the velocity gravity gives each place: the <i>Cosmicflows-4 velocity field</i>
    (Courtois et al. 2023, A&amp;A 670, L15). We read it off at this galaxy's position.</p>
    <p style="margin:6px 0">Only the line-of-sight part can be measured for galaxies this far away; the sideways part is the map's prediction. The map is smooth on scales of about
    36 million light-years: it shows the big flows (towards the Virgo Cluster, the Great Attractor, the Shapley Supercluster), not a galaxy's orbit inside its own group.</p>
    ${ck ? `<p style="margin:6px 0">How good is it? For the ${ck.n} galaxies on this map with at least 20 published distances (outside big clusters), measured and predicted line-of-sight motions correlate at ${ck.corr}, with a typical difference of ${ck.medDiff} km/s.</p>` : ''}
    <p style="margin:6px 0">The file doesn't state its velocity unit; we calibrated it to ${meta?.unit ?? 54} km/s per unit from the continuity equation of gravity (${meta?.unitCheck?.continuity ?? ''} km/s) and from the bulk flows the paper publishes.</p>
  </details>`);
  return `<div class="mv"><div class="mv-h">→ Where it's moving</div>${parts.join('')}</div>`;
}
