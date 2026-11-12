// The encyclopedia side: search across every object, and the parts of a card that the curated collections add.
// No Three.js, so it can be tested on its own (tests/catalog.test.mjs).

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** every name an object answers to: "M51", "Whirlpool Galaxy", "NGC 5194", NED's own name, … */
export function namesOf(o) {
  const out = [];
  if (o.m) out.push(`M${o.m}`, `M ${o.m}`, `Messier ${o.m}`);
  if (o.arp) out.push(`Arp ${o.arp}`, `Arp${o.arp}`);
  for (const a of o.alsoArp ?? []) out.push(`Arp ${a}`);
  if (o.sub) out.push(o.sub);
  for (const k of ['name', 'ngc', 'nedName', 'nedQuery', 'wikiTitle', 'type', 'nedType', 'desig', 'ascii']) if (o[k]) out.push(...String(o[k]).split(/,\s*/));
  if (o.hip) out.push(`HIP ${o.hip}`);
  for (const t of o.tags ?? []) out.push(t);
  return out.filter(Boolean);
}

/**
 * Ranked search. Exact name > name starts with the query > every query word found in a name > found in the tags/type.
 * Returns up to `limit` objects.
 */
export function search(items, query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored = [];
  for (const o of items) {
    let best = 0;
    for (const raw of namesOf(o)) {
      const n = norm(raw), compact = n.replace(/ /g, ''), qc = q.replace(/ /g, '');
      let s = 0;
      if (n === q || compact === qc) s = 100;
      else if (n.startsWith(q) || compact.startsWith(qc)) s = 70;
      else if (words.every((w) => n.includes(w))) s = 40;
      if (s && (o.tags ?? []).some((t) => norm(t) === n)) s -= 15;   // a tag match ranks below a real name
      best = Math.max(best, s);
    }
    if (best) scored.push([best, o]);
  }
  scored.sort((a, b) => b[0] - a[0] || String(a[1].name ?? a[1].m).localeCompare(String(b[1].name ?? b[1].m)));
  return scored.slice(0, limit).map((x) => x[1]);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** the "What we still don't know" section */
export function unknownHTML(o) {
  if (!o.unknown?.length) return '';
  return `<div class="mz-unknown"><div class="mz-unknown-h">What we still don't know</div><ul>${o.unknown.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`;
}

/** light-travel time (years) for redshift z, flat ΛCDM with H0 = 70, Ωm = 0.3 — for far objects, where it is
 *  noticeably shorter than "distance in light-years" because the universe expanded while the light travelled */
export function lookbackYears(z) {
  const H0 = 70, Om = 0.3, OL = 0.7, hubbleGyr = 977.792 / H0;
  const n = 400, E = (x) => Math.sqrt(Om * (1 + x) ** 3 + OL);
  let s = 0;
  for (let i = 0; i < n; i++) { const a = (i / n) * z, b = ((i + 1) / n) * z, m = (a + b) / 2; s += ((b - a) / 6) * (1 / ((1 + a) * E(a)) + 4 / ((1 + m) * E(m)) + 1 / ((1 + b) * E(b))); }
  return s * hubbleGyr * 1e9;
}
