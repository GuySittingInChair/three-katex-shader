import * as THREE from 'three';
import { createEventEngine, createRng, SN_TYPES, TYPICAL, LOSS_REF } from './eventEngine.js';
import { createSupernovaFx } from './supernovaFx.js';
import { badge, parseProvenance } from './provenance.js';

// STRUCTURE mode for one galaxy: its photograph turned into a 3D disk of stars (tools/galaxies/build_<name>.py),
// the star-forming knots found in it, the places real supernovae were seen, and a running event engine.
// Everything lives in the galaxy's own frame (kpc; x along the major axis, z out of the disk), and the group is
// oriented so that seen from the Sun it lines up exactly with the photograph: the tilt only shows when you fly
// round it.

const STAR_VERT = /* glsl */ `
  attribute vec3 aCol;
  attribute float aW;
  uniform float uPx, uA;
  varying vec3 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vCol = aCol * (0.35 + 0.9 * aW) * uA;
    gl_PointSize = clamp(uPx * (0.6 + 0.8 * aW) / max(0.01, -mv.z), 1.0, 9.0);
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.0; if (r2 > 1.0) discard; gl_FragColor = vec4(vCol * exp(-r2 * 3.0), 1.0); }`;
const KNOT_VERT = /* glsl */ `
  attribute float aS;
  attribute float aPh;
  uniform float uPx, uA, uTime;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float breathe = 0.85 + 0.15 * sin(uTime * 0.7 + aPh);     // ARTISTIC: a slow shimmer, not a measurement
    vA = uA * (0.5 + 0.5 * aS) * breathe;
    gl_PointSize = uPx * (0.6 + 0.9 * aS) * breathe / max(0.01, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const KNOT_FRAG = /* glsl */ `
  varying float vA;
  void main() { vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(1.0, 0.45, 0.7) * vA * (exp(-r * r * 6.0) * 0.9 + 0.15 * exp(-r * 2.0)), 1.0); }`;

const css = `
.gx-badge{display:inline-block;font-size:11px;line-height:1.4;padding:0 7px;border:1px solid;border-radius:99px;margin-left:6px;vertical-align:1px;white-space:nowrap}
.gx-modes{display:flex;gap:6px;margin:10px 0 4px}
.gx-modes button.on{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5)}
.gx-list{margin:6px 0 10px;padding:0;list-style:none}
.gx-list li{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:13px}
.gx-list li span.n{flex:1}
.gx-prov{font-size:12.5px;margin:8px 0}
.gx-prov div{margin:3px 0}
.gx-ev{background:rgba(255,255,255,.05);border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13.5px}
.gx-ev h3{margin:0 0 6px;font:600 16px Georgia,serif}
.gx-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.gx-chaos.on{background:#ff9f5a33;border-color:#ff9f5a;color:#ffd2b0}`;

// what each observed subtype means (the engine's three broad classes are too coarse for real objects)
const OBS_TYPE_TEXT = {
  Ic: 'Type Ic: a massive star that had lost both its hydrogen and its helium layers before it died, so neither shows in its light. Its core collapsed into a neutron star or black hole.',
  'II-P': SN_TYPES.II.what + ' "P" is for plateau: it stayed at nearly the same brightness for about three months while the hydrogen layer slowly cooled.',
  IIb: 'Type IIb: in between. The star had lost most — not all — of its hydrogen to a companion, so hydrogen showed in its light at first and then faded from view, leaving a spectrum like a Type Ib. Its core collapsed into a neutron star or black hole.',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateText = (d) => { const [y, m, dd] = d.split('-').map(Number); return dd ? `on ${dd} ${MONTHS[m - 1]} ${y}` : m ? `in ${MONTHS[m - 1]} ${y}` : `in ${y}`; };
// absolute magnitude (V) → how many Suns (the Sun's is 4.83)
const suns = (M) => { const L = 10 ** (0.4 * (4.83 - M)); return L >= 1e9 ? `${(L / 1e9).toFixed(L >= 1e10 ? 0 : 1)} billion` : `${Math.round(L / 1e6 / 10) * 10} million`; };

/** east and north unit vectors on the sky at (ra, dec), in scene coordinates, given the scene's direction function */
function skyBasis(skyDir, ra, dec) {
  const v = (a, d) => skyDir(a, d, new THREE.Vector3());
  const L = v(ra, dec).normalize();
  const E = v(ra + 1e-3, dec).sub(v(ra - 1e-3, dec)).normalize();
  const N = v(ra, dec + 1e-3).sub(v(ra, dec - 1e-3)).normalize();
  return { L, E, N };
}

export function createGalaxyMode({ url, skyDir, ra, dec, center, photo, onEventsChanged }) {
  let unitsPerKpc = 1;   // set from the photograph's width once the data (and its kpc per arcsecond) is in
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const group = new THREE.Group();
  group.visible = false;
  const state = { ready: false, alpha: 0, chaos: false, selected: null, log: [], lastLog: 0, t: 0 };
  const fx = createSupernovaFx({ shellKpc: 0.8 });
  let starMat, knotMat, starGeo, knotGeo, engine, meta, prov = {};

  const ready = Promise.all([fetch(url + 'meta.json').then((r) => r.json()), fetch(url + 'stars.bin').then((r) => r.arrayBuffer())]).then(([m, buf]) => {
    meta = m;
    // the same size as the photograph card: its width in scene units covers its field of view on the sky
    unitsPerKpc = photo.widthUnits / (photo.fovDeg * 3600 * m.kpcPerArcsec);
    for (const [k, note] of Object.entries(m.provenance)) prov[k] = parseProvenance(note);
    // orientation: disk x along the major axis (position angle PA east of north), tilted by the inclination;
    // seen along the line of sight the disk projects onto the sky exactly as the photograph shows it
    const { L, E, N } = skyBasis(skyDir, ra, dec);
    const pa = THREE.MathUtils.degToRad(m.positionAngle), inc = THREE.MathUtils.degToRad(m.inclination);
    const u = E.clone().multiplyScalar(Math.sin(pa)).addScaledVector(N, Math.cos(pa));          // major axis
    const v = E.clone().multiplyScalar(-Math.cos(pa)).addScaledVector(N, Math.sin(pa));         // minor axis, on the sky
    const ex = u, ey = v.clone().multiplyScalar(Math.cos(inc)).addScaledVector(L, Math.sin(inc));
    const ez = v.clone().multiplyScalar(-Math.sin(inc)).addScaledVector(L, Math.cos(inc));
    group.matrixAutoUpdate = false;
    group.matrix.makeBasis(ex, ey, ez).scale(new THREE.Vector3(unitsPerKpc, unitsPerKpc, unitsPerKpc)).setPosition(center);
    group.matrixWorldNeedsUpdate = true;

    const f = new Float32Array(buf), S = m.stride, n = f.length / S;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set(f.subarray(i * S, i * S + 3), i * 3); col.set(f.subarray(i * S + 3, i * S + 6), i * 3); w[i] = f[i * S + 6]; }
    starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    starGeo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
    starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uPx: { value: 1 }, uA: { value: 0 } }, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false;
    const kn = m.knots;
    knotGeo = new THREE.BufferGeometry();
    knotGeo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(kn.flatMap((k) => [k.x, k.y, 0])), 3));
    knotGeo.setAttribute('aS', new THREE.BufferAttribute(Float32Array.from(kn.map((k) => k.s)), 1));
    knotGeo.setAttribute('aPh', new THREE.BufferAttribute(Float32Array.from(kn.map((_, i) => i * 2.39)), 1));
    knotMat = new THREE.ShaderMaterial({ vertexShader: KNOT_VERT, fragmentShader: KNOT_FRAG, uniforms: { uPx: { value: 1 }, uA: { value: 0 }, uTime: { value: 0 } }, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    const knots = new THREE.Points(knotGeo, knotMat); knots.frustumCulled = false; knots.renderOrder = 3;
    group.add(stars, knots, fx.group);
    // the galaxy's own record sets the default rate: real supernovae seen in it per year (since the first one listed)
    const sne = m.observed.filter((o) => o.type !== 'LRN');
    const y0 = Math.min(...sne.map((o) => +o.date.slice(0, 4))), years = new Date().getFullYear() - y0;
    state.rate = { perYear: sne.length / years, n: sne.length, since: y0 };
    engine = createEventEngine({ sites: { cc: m.ccSites, ia: m.iaSites }, ratePerYear: state.rate.perYear, yearsPerSecond: 1, rng: createRng(Date.now() % 1e9) });
    state.ready = true;
  });

  const toWorld = (p, out = new THREE.Vector3()) => out.set(p[0], p[1], p[2]).applyMatrix4(group.matrix);
  const eventText = (e) => {
    const T = SN_TYPES[e.type];
    const R = Math.hypot(e.pos[0], e.pos[1]);
    const where = e.provenance === 'OBSERVED'
      ? `Seen here ${dateText(e.date)}, ${R.toFixed(1)} kpc (${Math.round(R * 3.262).toLocaleString()} thousand light-years) from the centre. Position: NED (${e.obs.posRef}).`
      : `${R.toFixed(1)} kpc from the centre, at a place picked ${e.type === 'Ia' ? 'in proportion to old, red starlight (Type Ia come from old stars)' : 'in proportion to young, blue starlight (massive stars die where they were born)'}.`;
    return `<div class="gx-ev"><h3>${e.provenance === 'OBSERVED' ? e.name + ' · ' : ''}${e.provenance === 'OBSERVED' ? 'Type ' + e.observedType : T.label} supernova ${badge(e.provenance)}</h3>
      ${e.provenance === 'OBSERVED' ? `<p style="margin:0 0 6px">${e.obs.what}${e.obs.peakMag ? ` It peaked at magnitude ${e.obs.peakMag} as seen from Earth.` : ''}</p>` : '<p style="margin:0 0 6px">This explosion was <b>made up by this page</b>, using the odds below. Nobody saw it.</p>'}
      <p style="margin:0 0 6px">${e.provenance === 'OBSERVED' ? OBS_TYPE_TEXT[e.observedType] || T.what : T.what}</p>
      <p style="margin:0 0 6px;color:#9aa3b5">${where}</p>
      <p style="margin:0;color:#9aa3b5;font-size:12.5px">Typical numbers for any supernova: about 10<sup>44</sup> joules (10<sup>51</sup> erg) of energy, debris flying out at ~${TYPICAL.ejectaKms.toLocaleString()} km/s; at its peak a ${T.label} typically shines at absolute magnitude about ${T.peakAbsMag}, as bright as ${suns(T.peakAbsMag)} Suns.
      The flash and shell are drawn ${badge('ARTISTIC')}, slowed down a hundredfold so you can see them.</p></div>`;
  };

  return {
    group, ready,
    get ready_() { return state.ready; },
    show(on) { state.on = on; if (on) group.visible = true; if (!on) { state.selected = null; } },
    get on() { return !!state.on; },
    setChaos(on) { state.chaos = on; engine?.setChaos(on ? 30 : 1); },
    replay(i, now) {
      const o = meta.observed[i];
      if (o.type === 'LRN') return null;
      const e = engine.replay(o, now); fx.add(e); state.selected = e; state.log.unshift(e); state.log.length = Math.min(state.log.length, 8);
      return toWorld(e.pos);
    },
    focusWorld(e) { return toWorld(e.pos); },
    update(ctx) {
      if (!state.ready) return;
      const k = Math.min(1, ctx.delta * 2.5);
      state.alpha += ((state.on ? 1 : 0) - state.alpha) * k;
      if (state.alpha < 0.005 && !state.on) { group.visible = false; return; }
      group.visible = true;
      const pxPerUnit = ctx.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
      starMat.uniforms.uA.value = state.alpha * 0.55;
      starMat.uniforms.uPx.value = pxPerUnit * unitsPerKpc * 0.06;
      knotMat.uniforms.uA.value = state.alpha;
      knotMat.uniforms.uPx.value = pxPerUnit * unitsPerKpc * 0.45;
      knotMat.uniforms.uTime.value = ctx.time;
      fx.update(ctx.time, pxPerUnit * unitsPerKpc * 0.05);
      if (state.on) {
        const born = engine.step(ctx.delta, ctx.time);
        for (const e of born) { fx.add(e); state.log.unshift(e); }
        if (state.log.length > 8) state.log.length = 8;
        if (born.length) onEventsChanged?.();
      }
    },
    /** what's under the pointer: an explosion, a real supernova site, or a star-forming knot */
    pick(cx, cy, camera, rect, now) {
      if (!state.ready || !state.on) return null;
      const v = new THREE.Vector3();
      let best = null, bestD = 22;
      const test = (p, item) => {
        v.copy(p).project(camera); if (v.z > 1) return;
        const d = Math.hypot(rect.left + (v.x * 0.5 + 0.5) * rect.width - cx, rect.top + (0.5 - v.y * 0.5) * rect.height - cy);
        if (d < bestD) { bestD = d; best = item; }
      };
      for (const e of fx.active(now)) test(toWorld(e.pos), { kind: 'event', e });
      meta.observed.forEach((o, i) => test(toWorld([o.x, o.y, 0]), { kind: 'observed', i }));
      if (!best) { bestD = 12; meta.knots.forEach((kn, i) => test(toWorld([kn.x, kn.y, 0]), { kind: 'knot', i })); }
      return best;
    },
    select(item) { state.selected = item?.kind === 'event' ? item.e : item; },
    /** world positions of the real supernova sites (for drawing their markers) */
    observedWorld() { return state.ready ? meta.observed.map((o) => ({ o, p: toWorld([o.x, o.y, 0]) })) : []; },
    /** the card body in STRUCTURE mode */
    panel() {
      if (!state.ready) return '<p>Loading the structure…</p>';
      const sel = state.selected;
      let detail = '';
      if (sel?.kind === 'supernova') detail = eventText(sel);
      else if (sel?.kind === 'knot') detail = `<div class="gx-ev"><h3>Star-forming region ${badge('INFERRED')}</h3><p style="margin:0">A compact knot bluer than its surroundings in the photograph: light from young, hot, massive stars, which live only a few million years — so stars are being born here now. Inferred from colour alone (no spectrum), so some may be foreground stars or clusters. The slow shimmer is ${badge('ARTISTIC')}.</p></div>`;
      else if (sel?.kind === 'observed') { const o = meta.observed[sel.i]; detail = `<div class="gx-ev"><h3>${o.name} ${badge('OBSERVED')}</h3><p style="margin:0 0 6px">${o.what}</p><p style="margin:0;color:#9aa3b5">Found ${dateText(o.date)}. Position from NED (${o.posRef}).</p>${o.type !== 'LRN' ? `<div class="gx-row"><button class="mz-btn" data-gx="replay" data-i="${sel.i}">▶ Replay it here</button></div>` : ''}</div>`; }
      const r = state.rate;
      return `${detail}
        <div class="gx-row"><button class="mz-btn gx-chaos ${state.chaos ? 'on' : ''}" data-gx="chaos">${state.chaos ? '◉ Chaos mode ×30' : '○ Chaos mode'}</button>
          <span style="color:#9aa3b5;font-size:12.5px">${state.chaos ? 'Explosions 30× more often than real. Still made up, still in the right places.' : `1 second = 1 year. About one supernova every ${Math.round(1 / r.perYear)} years, M51's real record: ${r.n} seen since ${r.since}.`}</span></div>
        <p style="margin:8px 0 4px;font-weight:600">Real supernovae seen in M51</p>
        <ul class="gx-list">${meta.observed.map((o, i) => `<li><span class="n">${o.name} <span style="color:#9aa3b5">· ${o.type === 'LRN' ? 'impostor (luminous red nova)' : 'Type ' + o.type} · ${o.date.slice(0, 4)}</span></span>${o.type !== 'LRN' ? `<button class="mz-btn" data-gx="replay" data-i="${i}">▶</button>` : ''}</li>`).join('')}</ul>
        <div data-gxlog>${this.logHTML()}</div>
        <p style="margin:10px 0 4px;font-weight:600">What's real here</p>
        <div class="gx-prov">${Object.values(prov).map((p) => `<div>${badge(p.kind)} ${p.text}</div>`).join('')}
          <div>${badge('PROCEDURAL')} Explosion types in the mix found by the ${LOSS_REF}: 24% Type Ia, 19% Ib/c, 57% II.</div></div>
        <p style="color:#8a93a6;font-size:11.5px;margin:6px 0 0">Distance ${meta.distMpc.toFixed(2)} Mpc (${(meta.distMpc * 3.2616).toFixed(1)} million light-years): ${meta.distSource}. Pictures, positions: ${meta.credit}</p>`;
    },
    logHTML() {
      return state.log.length ? `<p style="margin:8px 0 4px;font-weight:600">Recent explosions <span style="color:#9aa3b5;font-weight:400;font-size:12.5px">— click one in the galaxy, or ⓘ</span></p><ul class="gx-list">${state.log.slice(0, 5).map((e) => `<li><span class="n">${e.provenance === 'OBSERVED' ? e.name : SN_TYPES[e.type].label} <span style="color:#9aa3b5">· ${Math.hypot(e.pos[0], e.pos[1]).toFixed(1)} kpc out</span></span>${badge(e.provenance)}<button class="mz-btn" data-gx="ev" data-id="${e.id}">ⓘ</button></li>`).join('')}</ul>`
        : '<p style="color:#9aa3b5;font-size:12.5px;margin:8px 0">Waiting for the next explosion…</p>';
    },
    /** a camera position that shows the disk at an angle (its depth), and what to look at */
    pose(distKpc, camera) {
      const c = new THREE.Vector3().setFromMatrixPosition(group.matrix);
      const ex = new THREE.Vector3().setFromMatrixColumn(group.matrix, 0).normalize();
      const n = new THREE.Vector3().setFromMatrixColumn(group.matrix, 2).normalize();
      const toSun = c.clone().negate().normalize();
      if (n.dot(toSun) < 0) n.negate();
      const dir = n.multiplyScalar(0.55).addScaledVector(toSun, 0.35).addScaledVector(ex, 0.75).normalize();
      return { t: c, p: c.clone().addScaledVector(dir, distKpc * unitsPerKpc) };
    },
    act(btn, now) {
      const a = btn.dataset.gx;
      if (a === 'chaos') { this.setChaos(!state.chaos); return { rerender: true }; }
      if (a === 'replay') { const p = this.replay(+btn.dataset.i, now); return { rerender: true, fly: p }; }
      if (a === 'ev') { const e = state.log.find((x) => x.id === +btn.dataset.id); if (e) { state.selected = e; return { rerender: true, fly: toWorld(e.pos) }; } }
      return { rerender: true };
    },
    get log() { return state.log; },
    dispose() {
      style.remove(); fx.dispose();
      starGeo?.dispose(); starMat?.dispose(); knotGeo?.dispose(); knotMat?.dispose();
      group.parent?.remove(group);
    },
  };
}
