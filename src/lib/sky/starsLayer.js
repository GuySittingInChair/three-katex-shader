import * as THREE from 'three';
import { badge } from '../galaxy/provenance.js';

// The stars around the Sun: every star brighter than V = 6.5 in Hipparcos (about 8,800) plus every star with an IAU
// name, at its real direction and distance (tools/stars/build_stars.py). Coloured by temperature, sized by luminosity.
// Click one for a card: what is measured (position, distance, brightness, spectral type) and what is worked out from
// it (temperature, luminosity, size, mass, lifetime, fate) — the second set is approximate, and says so.

const VERT = /* glsl */ `
  attribute vec3 aCol;
  attribute float aSize;
  uniform float uA, uPx;
  varying vec3 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vCol = aCol * uA;
    gl_PointSize = clamp(aSize * uPx / max(0.004, -mv.z) * 0.0035, 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.0; if (r2 > 1.0) discard; gl_FragColor = vec4(vCol * (exp(-r2 * 4.0) + 0.15 * exp(-r2)), 1.0); }`;

/** blackbody colour, roughly, for a temperature (K) */
export function starColour(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * (t - 60) ** -0.1332; g = 288.12 * (t - 60) ** -0.0755; b = 255; }
  const c = (x) => Math.min(255, Math.max(0, x)) / 255;
  return [c(r), c(g), c(b)];
}

const SPEC = {
  O: 'O-type: the hottest and most massive stars, blue, over 30,000 K. Rare, and gone within a few million years.',
  B: 'B-type: hot blue-white stars, 10,000–30,000 K, several to 20 times the Sun\'s mass.',
  A: 'A-type: white stars around 7,500–10,000 K, roughly twice the Sun\'s mass.',
  F: 'F-type: yellow-white stars a little hotter and heavier than the Sun.',
  G: 'G-type: yellow stars like the Sun, about 5,300–6,000 K.',
  K: 'K-type: orange stars, cooler and smaller than the Sun when on the main sequence — or swollen orange giants.',
  M: 'M-type: red stars, below about 3,900 K. Most stars in the Galaxy are small red M dwarfs; some M stars are huge red giants and supergiants.',
  C: 'A carbon star: a cool giant whose atmosphere has more carbon than oxygen, which makes it deep red.',
};
const LUM = {
  V: 'a main-sequence ("dwarf") star, steadily turning hydrogen into helium in its core, as the Sun is',
  IV: 'a subgiant, running out of hydrogen in its core and starting to swell',
  III: 'a giant: its core hydrogen is used up, and it has swollen to many times its old size',
  II: 'a bright giant, between a giant and a supergiant',
  Ib: 'a supergiant: a massive star late in life, enormously swollen',
  Iab: 'a supergiant: a massive star late in life, enormously swollen',
  Ia: 'a luminous supergiant: among the biggest and brightest stars there are',
  I: 'a supergiant: a massive star late in life, enormously swollen',
  WD: 'a white dwarf: the bare, cooling core left by a Sun-like star',
};
// two significant figures: these are estimates
const n2 = (x) => { if (x >= 100) { const p = 10 ** (Math.floor(Math.log10(x)) - 1); return (Math.round(x / p) * p).toLocaleString('en-US'); } return x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toPrecision(2); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fate(s) {
  if (s.lc === 'WD') return 'Already a white dwarf: it will just cool and fade for billions of years.';
  if (s.lc === 'V' && s.M) {
    const life = s.life >= 1 ? `about ${n2(s.life)} billion years` : `about ${Math.round(s.life * 1000)} million years`;
    if (s.M > 8) return `At roughly ${n2(s.M)} times the Sun's mass, it lives only ${life} on the main sequence, then swells into a supergiant and explodes as a supernova, leaving a neutron star or black hole.`;
    if (s.M < 0.5) return `At roughly ${n2(s.M)} times the Sun's mass, it burns so slowly it will shine for far longer than the universe has existed (${life} or more), then fade into a white dwarf.`;
    return `At roughly ${n2(s.M)} times the Sun's mass, its main-sequence life is ${life} in total. Then it swells into a red giant, sheds its outer layers as a planetary nebula, and its core becomes a white dwarf.`;
  }
  if (/^I/.test(s.lc || '')) return 'A supergiant this luminous is a massive star near the end of its life: within the next million years or so it will most likely explode as a supernova.';
  if (s.lc === 'III' || s.lc === 'II') return 'A giant like this is in the later part of its life. Most will shed their outer layers as a planetary nebula and leave a white dwarf; only the most massive explode.';
  return 'Its future depends on its mass, which these measurements don\'t pin down.';
}

export function createStarsLayer({ url, skyDir, R, labelLayer }) {
  const group = new THREE.Group();
  const st = { ready: false, named: [], sel: -1 };
  let geo, mat, pos, rec;
  const labels = [];
  const ready = Promise.all([fetch(url + 'named.json').then((r) => r.json()), fetch(url + 'stars.bin').then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
    const f = new Float32Array(buf), S = meta.stride, n = f.length / S;
    rec = f; pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3), size = new Float32Array(n), v = new THREE.Vector3();
    const byHip = new Map(meta.stars.map((s) => [s.hip, s]));
    st.idx = new Map();
    for (let i = 0; i < n; i++) {
      const [ra, dec, ly, , logL, T, hip] = f.subarray(i * S, i * S + 7);
      skyDir(ra, dec, v).multiplyScalar(R(ly));
      pos.set([v.x, v.y, v.z], i * 3);
      const c = T > 0 ? starColour(T) : [1, 1, 1];
      col.set(c.map((x) => x * 0.95), i * 3);
      size[i] = logL > -8 ? Math.min(9, Math.max(1, 2.2 + 1.1 * logL)) : 1.5;
      const s = byHip.get(hip);
      if (s) { s.i = i; s.star = true; st.idx.set(i, s); }
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uA: { value: 1 }, uPx: { value: 800 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 1;
    group.add(pts);
    st.named = meta.stars.filter((s) => s.i != null);
    st.source = meta.source;
    for (let k = 0; k < 40; k++) { const el = document.createElement('div'); el.className = 'mz-label'; el.style.display = 'none'; el.style.color = '#ffe9c2'; labelLayer.appendChild(el); labels.push(el); }
    st.n = n; st.S = S; st.ready = true;
  });

  const worldOf = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  /** the facts about star i, from the named list or from the bare record */
  const info = (i) => {
    const s = st.idx.get(i);
    if (s) return s;
    const [ra, dec, ly, v, logL, T, hip, flags] = rec.subarray(i * st.S, i * st.S + 8);
    return { hip, ra, dec, ly, v, L: logL > -8 ? 10 ** logL : null, T: T || null, reliable: !!(flags & 2), i };
  };
  return {
    group, ready,
    get named() { return st.named; },
    get ready_() { return st.ready; },
    worldOf,
    /** nearest star to the pointer, if close enough */
    pick(cx, cy, camera, rect, radius = 9) {
      if (!st.ready) return -1;
      const v = new THREE.Vector3(); let best = -1, bd = radius;
      for (let i = 0; i < st.n; i++) {
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        const d = Math.hypot(rect.left + (v.x * 0.5 + 0.5) * rect.width - cx, rect.top + (0.5 - v.y * 0.5) * rect.height - cy) - (st.idx.has(i) ? 3 : 0);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    select(i) { st.sel = i; },
    get selected() { return st.sel; },
    update(ctx, place) {
      if (!st.ready) return;
      const cam = ctx.camera, d = cam.position.length();
      // fade in as you come close to the Sun; the whole cloud is only ~2 units across
      mat.uniforms.uA.value = Math.min(0.9, Math.max(0.12, 2.0 - d * 0.18));
      mat.uniforms.uPx.value = ctx.size.height;
      // labels: the named stars that look biggest from where the camera is (luminosity over distance)
      if (d > 6) { labels.forEach((l) => (l.style.display = 'none')); return; }
      const scored = st.named.map((s) => [Math.log10(Math.max(1e-3, s.L || 1)) - 2 * Math.log10(Math.max(0.005, cam.position.distanceTo(worldOf(s.i)))), s]);
      scored.sort((a, b) => b[0] - a[0]);
      labels.forEach((el, k) => {
        const s = scored[k]?.[1];
        if (!s) { el.style.display = 'none'; return; }
        el.textContent = s.name;
        place(el, worldOf(s.i), 6);
        el.style.opacity = s.i === st.sel ? 1 : 0.8;
        el.style.fontWeight = s.i === st.sel ? '600' : '';
      });
    },
    /** the card for star i */
    card(i, { lyText, lightLeft }) {
      const s = info(i);
      const title = s.name ? esc(s.name) : `HIP ${s.hip}`;
      const cls = (s.sp || '')[0];
      const sizeAU = s.R ? s.R / 215 : null;
      const sizeComp = !s.R ? '' : s.R > 215 ? ` — put in the Sun's place, it would reach ${sizeAU > 5.2 ? 'past Jupiter' : sizeAU > 1.52 ? 'past Mars' : 'past the Earth'}` : s.R < 0.2 ? ' — not much bigger than Jupiter' : '';
      const unreliable = s.plx && !s.reliable ? '<br><span style="color:#ffb070;font-size:12.5px">The parallax is uncertain by more than 20%: treat this distance (and everything worked out from it) as rough.</span>' : '';
      return `<div class="mz-in"><div class="mz-head"><h2>${title}<small><span class="mz-dot" style="background:#ffe9c2"></span>Star${s.desig ? ' · ' + esc(s.desig) : ''}${s.con ? ' · in ' + esc(s.con) : ''}${s.hip ? ' · HIP ' + s.hip : ''}</small></h2>
          <button class="mz-btn mz-min" data-act="min">▾</button><button class="mz-btn" data-act="closestar" title="back">✕</button></div>
        <div class="mz-body">
        ${s.sp ? `<div class="mz-what"><b>Type ${esc(s.sp)}.</b> ${SPEC[cls] || ''}${s.lc && LUM[s.lc] ? ` It is ${LUM[s.lc]}.` : ''}</div>` : ''}
        <dl class="mz-facts">
          <dt>Distance ${badge('OBSERVED')}</dt><dd>${lyText(s.ly)}${s.plx ? `<br><span style="color:#8a93a6;font-size:12.5px">parallax ${s.plx.toFixed(2)} ± ${s.eplx.toFixed(2)} mas (Hipparcos, 2007 reduction)</span>` : ''}${unreliable}</dd>
          <dt>Light left it</dt><dd>${lightLeft(s.ly)}</dd>
          <dt>Looks ${badge('OBSERVED')}</dt><dd>magnitude ${s.v.toFixed(2)} — ${s.v < 1.5 ? 'one of the brightest stars in the sky' : s.v < 4.5 ? 'easy to see by eye' : s.v < 6.3 ? 'visible to the eye from a dark place' : 'needs binoculars'}</dd>
          ${s.T ? `<dt>Temperature ${badge('INFERRED')}</dt><dd>about ${Math.round(s.T / 100) * 100} K (the Sun: 5,772 K), from its colour</dd>` : ''}
          ${s.L ? `<dt>Power ${badge('INFERRED')}</dt><dd>about ${n2(s.L)} times the Sun's</dd>` : ''}
          ${s.R ? `<dt>Size ${badge('INFERRED')}</dt><dd>about ${n2(s.R)} times the Sun's width${sizeComp}</dd>` : ''}
        </dl>
        <div class="mz-what"><b>Its future</b> ${badge('INFERRED')} ${fate(s)}</div>
        ${s.about ? `<div class="mz-about"><p style="margin:0 0 8px">${esc(s.about)}</p></div>` : ''}
        <div class="mz-src">Measured: Hipparcos (ESA 1997; parallaxes van Leeuwen 2007), via the Gaia archive${s.name ? '; name: IAU Working Group on Star Names' : ''}. Worked out here, approximately: temperature from colour (Ballesteros 2012), power with a bolometric correction (Flower 1996 / Torres 2010), no correction for dust, size from power and temperature, mass and lifetime from rough main-sequence rules.${s.wikiUrl ? ` Text: <a href="${esc(s.wikiUrl)}" target="_blank" rel="noopener">Wikipedia, “${esc(s.wikiTitle)}”</a> (CC BY-SA 4.0).` : ''}</div>
        <div class="mz-nav"><span style="flex:1"></span><button class="mz-btn" data-act="closestar">Back</button></div></div></div>`;
    },
    dispose() { geo?.dispose(); mat?.dispose(); labels.forEach((l) => l.remove()); group.parent?.remove(group); },
  };
}
