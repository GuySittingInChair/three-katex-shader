import * as THREE from 'three';
import { createFatLines, createDots } from '../lib/fatLines.js';
import { createGalaxyMode } from '../lib/galaxy/galaxyMode.js';

// Messier's Sky, in depth. The 110 objects of Charles Messier's catalogue, each a real photograph (Digitized Sky
// Survey 2, via NASA SkyView) placed in its true direction from the Sun at its measured distance, with distance on
// a log scale so the Pleiades (440 light-years) and the Virgo galaxies (55 million) fit in one view.
// Click one: the camera flies to it and a card says what it is, how far, how big, when its light left, and what's
// known about it (each object's Wikipedia summary, CC BY-SA 4.0). Leave it alone and it gives itself a tour.
// tools/messier/build_messier.py makes the pictures and the facts file.

const DATA_URL = '/data/messier/';
// objects that also have a STRUCTURE view (3D model from the photo + event engine): tools/galaxies/build_<name>.py
const GALAXIES = { 51: '/data/galaxies/m51/' };
const RS = 1.6;                                  // scene units per factor of 10 in distance
const R = (ly) => RS * Math.log10(Math.max(ly, 250) / 200);
const RINGS = [[1e3, '1,000 light-years'], [1e4, '10,000 light-years'], [1e5, '100,000 ly: the Milky Way is about this wide'], [1e6, '1 million light-years'], [1e7, '10 million light-years'], [1e8, '100 million light-years']];
const GROUPS = {
  galaxy: { label: 'Galaxies', col: '#9db4ff', what: 'A galaxy: a separate system of billions of stars, gas and dark matter, far beyond our own Milky Way. Messier took these for clouds of gas; only in the 1920s did Edwin Hubble show, from variable stars he found in Andromeda, that they are whole galaxies like ours.' },
  globular: { label: 'Globular clusters', col: '#ffd27a', what: 'A globular cluster: a tight ball of hundreds of thousands of stars, most of them 10–13 billion years old, among the oldest things in the Galaxy. They orbit in the halo around the Milky Way\'s centre; about 150 are known.' },
  open: { label: 'Open clusters', col: '#8fe3ff', what: 'An open cluster: a loose family of a few hundred to a few thousand stars born together from the same cloud of gas, usually young — tens to hundreds of millions of years. Over time the Galaxy\'s pull scatters them.' },
  nebula: { label: 'Nebulae', col: '#ff7a9a', what: 'A nebula: a cloud of gas and dust where stars are being born. Young, hot stars inside light it up; the red glow is hydrogen.' },
  planetary: { label: 'Planetary nebulae', col: '#7dffc0', what: 'A planetary nebula: the outer layers shed by a dying Sun-like star, lit up by the hot core left behind, a white dwarf. Nothing to do with planets: in early telescopes they looked like a planet\'s disk. Each lasts only a few tens of thousands of years — our Sun will make one in about 5 billion years.' },
  remnant: { label: 'Supernova remnant', col: '#ff9f5a', what: 'A supernova remnant: the debris of a star that exploded, still flying outward.' },
  other: { label: 'Other', col: '#d8d8d8', what: '' },
};
const OTHER_WHAT = {
  Asterism: 'An asterism: a few stars that only look like a group from here. They are at different distances and unrelated.',
  'Optical Double': 'Two unrelated stars that happen to line up as seen from Earth. Messier was looking for a nebula reported in this spot by Johannes Hevelius, found only this pair, and catalogued it anyway.',
};
const TOUR = [45, 42, 1, 57, 13, 31, 51, 104, 87, 16, 27, 8, 44, 81, 82, 101, 33, 64, 97, 11, 92, 24, 40, 20];
// what was happening on Earth when the light left: [years ago, words]
const MILESTONES = [
  [252, 'before Messier published the first version of this catalogue (1774)'],
  [1030, 'before the Vikings reached North America (around AD 1000)'],
  [2050, 'before the Roman Empire began (27 BC)'],
  [4600, 'before the Great Pyramid of Giza was built'],
  [5200, 'before writing was invented, in Mesopotamia'],
  [11700, 'before the end of the last ice age'],
  [17000, 'before the cave paintings at Lascaux'],
  [300000, 'before our species, Homo sapiens, existed'],
  [2.8e6, 'before the first members of our genus, Homo'],
  [7e6, 'before the human and chimpanzee lines split'],
  [25e6, 'before the first apes appeared'],
  [66e6, 'while dinosaurs still lived'],
];
const NOW = new Date().getFullYear();
const HOME = { p: [11, 11, 25], t: [1.2, 2.2, 0] };   // the whole-sky view

const VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aTile;
  attribute vec3 aMisc;        // size (scene units), shown (0..1), highlight (0..1)
  uniform vec2 uTiles;
  uniform float uPxPerUnit, uMinPx;
  varying vec2 vUv, vLocal;
  varying float vA, vHl;
  void main() {
    vec4 mvC = modelViewMatrix * vec4(aCenter, 1.0);
    float d = max(0.001, -mvC.z);
    float size = max(aMisc.x, uMinPx * d / uPxPerUnit) * (1.0 + 0.25 * aMisc.z);
    vec4 mv = mvC + vec4(position.xy * size, 0.0, 0.0);
    vUv = (aTile + uv) / uTiles;
    vLocal = uv;
    vA = aMisc.y;
    vHl = aMisc.z;
    gl_Position = projectionMatrix * mv;
    if (aMisc.y < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv, vLocal;
  varying float vA, vHl;
  void main() {
    vec2 q = vLocal - 0.5;               // position inside the tile
    float r = length(q) * 2.0;
    float mask = smoothstep(1.0, 0.72, r);
    vec3 c = texture2D(uMap, vUv).rgb * (1.1 + 0.6 * vHl);
    gl_FragColor = vec4(c * mask * vA, 1.0);
  }`;

const css = `
.mz-panel{position:fixed;z-index:15;right:16px;top:64px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 160px);overflow:auto;
  background:rgba(12,13,18,.9);backdrop-filter:blur(8px);color:#e9edf5;border:1px solid rgba(255,255,255,.12);border-radius:14px;
  font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.mz-panel *{box-sizing:border-box}
.mz-in{padding:14px 16px 16px}
.mz-head{display:flex;align-items:flex-start;gap:8px}
.mz-head h2{margin:0;font:600 22px/1.2 Georgia,serif;flex:1}
.mz-head h2 small{display:block;font:13px system-ui;color:#9aa3b5;margin-top:3px}
.mz-btn{background:rgba(255,255,255,.07);color:#e9edf5;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;font-size:13px}
.mz-btn:hover{border-color:rgba(255,255,255,.4)}
.mz-img{width:100%;aspect-ratio:1;border-radius:10px;display:block;margin:12px 0 4px;background:#000;object-fit:cover}
.mz-cap{font-size:11.5px;color:#8a93a6;margin-bottom:10px}
.mz-facts{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:10px 0 12px}
.mz-facts dt{color:#8a93a6;font-size:12.5px;padding-top:1px}
.mz-facts dd{margin:0}
.mz-what{background:rgba(255,255,255,.05);border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13.5px}
.mz-about{font-size:13.5px;color:#d6dbe6}
.mz-src{font-size:11.5px;color:#8a93a6;margin-top:8px}
.mz-src a,.mz-about a{color:#9fc6ff}
.mz-nav{display:flex;gap:6px;margin-top:12px}
.mz-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.mz-chip{border-radius:99px;padding:3px 10px;font-size:12.5px;cursor:pointer;border:1px solid;background:transparent;font-family:inherit}
.mz-chip.off{opacity:.35}
.mz-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:0}
.mz-labels{position:fixed;inset:0;pointer-events:none;z-index:14;overflow:hidden}
.mz-label{position:absolute;transform:translate(-50%,0);white-space:nowrap;font:12px system-ui,sans-serif;color:#dfe6f3;text-shadow:0 1px 3px #000,0 0 6px #000;padding-top:4px}
.mz-label.ring{color:#7f8ba3;font-size:11px}
.mz-label.big{font-size:14px;font-weight:600}
.mz-min{display:none}
@media (max-width:700px){
  .mz-panel{left:10px;right:10px;width:auto;top:auto;bottom:84px;max-height:52vh}
  .mz-img{max-height:26vh;width:auto;margin-left:auto;margin-right:auto}
  .mz-panel.collapsed .mz-body{display:none}
  .mz-min{display:inline-block}
}`;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
function sig(n, k = 2) { const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(n))) - k + 1); return Math.round(n / p) * p; }
function lyText(ly) {
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1)} million light-years`;
  return `${fmt(sig(ly, ly < 1e4 ? 2 : 3))} light-years`;
}
function rangeText(o) {
  const nums = (o.dist.match(/[\d][\d,]*\.?\d*/g) || []).map((x) => parseFloat(x.replace(/,/g, '')) * 1000);
  return nums.length >= 2 ? `measurements range from ${lyText(nums[0]).replace(' light-years', '')} to ${lyText(nums[1])}` : '';
}
function lightLeft(ly) {
  const when = ly < NOW - 50 ? `around AD ${sig(NOW - ly, 2)}` : ly < 1e4 ? `around ${fmt(sig(ly - NOW, 2))} BC` : '';
  const ago = ly >= 1e6 ? `${(ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1)} million years ago` : `about ${fmt(sig(ly, 2))} years ago`;
  let mile = '';
  for (const [yrs, words] of MILESTONES) if (yrs < ly) mile = words;
  return `${ago}${when ? `, ${when}` : ''}${mile ? ` — ${mile}` : ''}.`;
}
function brightness(mag) {
  if (mag == null) return '';
  const how = mag < 4.5 ? 'easy to see with your eyes alone from a dark place' : mag < 6.3 ? 'just visible to the naked eye under a really dark sky'
    : mag < 9.5 ? 'binoculars show it' : 'needs a telescope';
  return `magnitude ${mag} — ${how}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function skyDir(ra, dec, out) {
  // equatorial → galactic; scene: Galactic plane horizontal, the Galactic centre along +x
  const a = THREE.MathUtils.degToRad(ra), d = THREE.MathUtils.degToRad(dec);
  const e = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const M = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.444829630, 0.7469822445], [-0.867666149, -0.1980763734, 0.4559837762]];
  const g = M.map((r) => r[0] * e[0] + r[1] * e[1] + r[2] * e[2]);
  return out.set(g[0], g[2], -g[1]);
}

export default {
  name: "Messier's Sky, in Depth",
  description:
    "All 110 objects in Charles Messier's 18th-century catalogue — galaxies, star clusters and glowing clouds — as real telescope photographs, " +
    'each placed in its true direction at its measured distance (log scale: 440 light-years to 80 million). Click any of them to fly there and read ' +
    'what it is, how big it really is and when the light you see left it. Pictures: Digitized Sky Survey 2 via NASA SkyView; facts: Wikipedia.',
  tags: ['messier', 'galaxies', 'nebulae', 'star clusters', 'interactive', 'real data', 'explore'],
  category: 'Astronomy',
  mode: '3d',
  controls: 'orbit',
  wheelZoom: true,

  latex: () => '',

  params: {},

  setup(ctx) {
    const cam = ctx.camera, controls = ctx.controls;
    cam.fov = 45; cam.near = 0.01; cam.far = 400; cam.updateProjectionMatrix();
    cam.position.set(HOME.p[0], HOME.p[1], HOME.p[2]);
    controls.target.set(HOME.t[0], HOME.t[1], HOME.t[2]);
    controls.enableZoom = true; controls.minDistance = 0.15; controls.maxDistance = 60;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
    ctx.scene.background = new THREE.Color(0x020306);
    const narrow = () => window.matchMedia('(max-width:700px)').matches;
    const s = { ready: false, disposed: false, collapsed: narrow(), mode: 'photo', gx: {}, sel: -1, hover: -1, filter: new Set(Object.keys(GROUPS)), lastInput: -1e9, tourAt: 0, tourI: -1, fly: null };
    const lines = createFatLines({ maxSegments: 4000, width: 1.2 });
    ctx.scene.add(lines.object);
    const dots = createDots({ maxPoints: 8 });
    ctx.scene.add(dots.object);

    // ---------- DOM: panel and labels ----------
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const panel = document.createElement('div'); panel.className = 'mz-panel'; document.body.appendChild(panel);
    const labels = document.createElement('div'); labels.className = 'mz-labels'; document.body.appendChild(labels);
    s.dom = { style, panel, labels };

    fetch(DATA_URL + 'meta.json').then((r) => r.json()).then((meta) => {
      if (s.disposed) return;
      const objs = meta.objects, n = objs.length;
      s.meta = meta; s.objs = objs;
      const centers = new Float32Array(n * 3), tiles = new Float32Array(n * 2), misc = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      s.pos = objs.map((o, i) => {
        skyDir(o.ra, o.dec, v).multiplyScalar(R(o.ly));
        centers.set([v.x, v.y, v.z], i * 3);
        tiles.set([(o.m - 1) % meta.cols, 9 - Math.floor((o.m - 1) / meta.cols)], i * 2);
        // picture size grows with the object's real size (log), so galaxies are bigger cards than clusters
        o.card = 0.13 + 0.045 * Math.log10(Math.max(2, o.sizeLy || 5));
        misc.set([o.card, 1, 0], i * 3);
        return v.clone();
      });
      const g = new THREE.InstancedBufferGeometry();
      const quad = new THREE.PlaneGeometry(1, 1);
      g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
      g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
      g.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 2));
      s.misc = new THREE.InstancedBufferAttribute(misc, 3); s.misc.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aMisc', s.misc);
      g.instanceCount = n;
      const tex = new THREE.TextureLoader().load(DATA_URL + 'atlas.jpg');
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uMap: { value: tex }, uTiles: { value: new THREE.Vector2(11, 10) }, uPxPerUnit: { value: 800 }, uMinPx: { value: 14 } },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.cards = new THREE.Mesh(g, s.mat);
      s.cards.frustumCulled = false;
      ctx.scene.add(s.cards);
      s.geo = g; s.tex = tex;
      // the selected one also gets its full-size picture
      s.big = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: { uMap: { value: null }, uA: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D uMap; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float m = smoothstep(1.0, 0.82, r); gl_FragColor = vec4(texture2D(uMap, vUv).rgb, m * uA); }',
        blending: THREE.NormalBlending, depthWrite: false, depthTest: false, transparent: true,   // a photo in front, not added onto what's behind
      }));
      s.big.frustumCulled = false; s.big.visible = false; s.big.renderOrder = 2;
      ctx.scene.add(s.big);
      // labels: one per object, plus the distance rings
      s.lab = objs.map((o) => { const el = document.createElement('div'); el.className = 'mz-label'; el.textContent = `M${o.m}${o.name ? ' · ' + o.name : ''}`; el.style.display = 'none'; labels.appendChild(el); return el; });
      s.ringLab = RINGS.map(([, t]) => { const el = document.createElement('div'); el.className = 'mz-label ring'; el.textContent = t; labels.appendChild(el); return el; });
      s.sunLab = document.createElement('div'); s.sunLab.className = 'mz-label'; s.sunLab.textContent = 'Sun — you are here'; labels.appendChild(s.sunLab);
      s.ready = true;
      renderPanel();
    }).catch((err) => console.error('messier data', err));

    // ---------- galaxies with a STRUCTURE view ----------
    const gxFor = (i) => {
      const o = s.objs?.[i];
      if (!o || !GALAXIES[o.m]) return null;
      if (!s.gx[o.m]) {
        const gm = createGalaxyMode({
          url: GALAXIES[o.m], skyDir, ra: o.ra, dec: o.dec, center: s.pos[i].clone(), photo: { widthUnits: o.card * 1.25, fovDeg: o.fov },
          onEventsChanged: () => { const el = panel.querySelector('[data-gxlog]'); if (el && s.mode === 'structure') el.innerHTML = gm.logHTML(); },
        });
        ctx.scene.add(gm.group);
        s.gx[o.m] = gm;
      }
      return s.gx[o.m];
    };
    const modesHTML = () => (gxFor(s.sel) ? `<div class="gx-modes"><button class="mz-btn ${s.mode === 'photo' ? 'on' : ''}" data-act="photo">Photograph</button><button class="mz-btn ${s.mode === 'structure' ? 'on' : ''}" data-act="structure">Structure + explosions</button></div>` : '');
    const setMode = (mode) => {
      const gm = gxFor(s.sel);
      if (!gm) return;
      s.mode = mode;
      gm.show(mode === 'structure');
      controls.minDistance = mode === 'structure' ? 0.02 : 0.15;
      if (mode === 'structure') {
        controls.autoRotate = false;
        gm.ready.then(() => {
          if (s.mode !== 'structure' || s.disposed) return;
          s.fly = { t0: ctx.time, dur: 2.4, from: { p: cam.position.clone(), t: controls.target.clone() }, to: gm.pose(narrow() ? 52 : 36, cam) };
          renderPanel();
        });
      } else { flyTo(s.sel); s.bigAt = ctx.time; }
      renderPanel();
    };
    const leaveStructure = () => { if (s.mode === 'structure') { for (const gm of Object.values(s.gx)) gm.show(false); s.mode = 'photo'; controls.minDistance = 0.15; } };

    // ---------- panel ----------
    const renderPanel = () => {
      if (!s.ready) return;
      const i = s.sel;
      if (i < 0) {
        const counts = {};
        for (const o of s.objs) counts[o.group] = (counts[o.group] || 0) + 1;
        panel.innerHTML = `<div class="mz-in"><div class="mz-head"><h2>Messier's Sky<small>110 objects, at their real distances</small></h2><button class="mz-btn mz-min" data-act="min">▾</button></div>
          <div class="mz-body"><p style="margin:10px 0">Charles Messier hunted comets from Paris in the 1700s. To stop himself and others mistaking fixed fuzzy patches for comets,
          he listed them. His list became the classic tour of the night sky. Every picture here is a real photograph of one of them. Each sits in its true
          direction from the Sun, and its distance is on a log scale, so each ring is ten times further out than the last.</p>
          <p style="margin:10px 0"><b>Click any picture</b> to fly there. Drag to turn, scroll or pinch to zoom.</p>
          <div class="mz-chips">${Object.entries(GROUPS).filter(([k]) => counts[k]).map(([k, G]) => `<button class="mz-chip ${s.filter.has(k) ? '' : 'off'}" data-g="${k}" style="color:${G.col};border-color:${G.col}55"><span class="mz-dot" style="background:${G.col}"></span>${G.label} ${counts[k]}</button>`).join('')}</div>
          <div class="mz-nav"><button class="mz-btn" data-act="tour">▶ Take the tour</button><button class="mz-btn" data-act="names">${s.allNames ? 'Hide' : 'Show'} all names</button></div>
          <div class="mz-src">Pictures: Digitized Sky Survey (photographic plates, 1950s–90s), via NASA SkyView. Facts and summaries: Wikipedia, CC BY-SA 4.0.</div></div></div>`;
      } else if (s.mode === 'structure' && gxFor(i)) {
        const o = s.objs[i], G = GROUPS[o.group];
        panel.innerHTML = `<div class="mz-in"><div class="mz-head"><h2>M${o.m}${o.name ? ` · ${esc(o.name)}` : ''}<small><span class="mz-dot" style="background:${G.col}"></span>Structure and events</small></h2>
            <button class="mz-btn mz-min" data-act="min">▾</button><button class="mz-btn" data-act="close" title="back to the whole sky">✕</button></div>
          <div class="mz-body">${modesHTML()}
          <p style="margin:8px 0;font-size:13.5px">The photograph, turned into a 3D disk of ${(90000).toLocaleString()} star points, tilted the way the galaxy really is tilted. Pink: regions where stars are forming. Green rings: where real supernovae were seen. Flashes: supernovae, at the rate this galaxy really has them. Drag to fly round it; click anything.</p>
          ${gxFor(i).panel()}
          <div class="mz-nav"><button class="mz-btn" data-act="prev">← M${o.m === 1 ? 110 : o.m - 1}</button><button class="mz-btn" data-act="next">M${o.m === 110 ? 1 : o.m + 1} →</button><span style="flex:1"></span><button class="mz-btn" data-act="close">Whole sky</button></div></div></div>`;
      } else {
        const o = s.objs[i], G = GROUPS[o.group];
        const what = o.group === 'other' ? (OTHER_WHAT[o.type] || (/star cloud/i.test(o.type) ? 'A star cloud: a stretch of the Milky Way\'s disk seen through a gap in the dust, crowded with stars thousands of light-years deep.' : '')) : G.what;
        const range = rangeText(o);
        const sizeRow = o.sizeLy && o.group !== 'other' ? `<dt>Real size</dt><dd>about ${lyText(o.sizeLy).replace('light-years', 'light-years across')}; light takes ${o.sizeLy >= 1e6 ? lyText(o.sizeLy).replace('light-years', 'years') : fmt(sig(o.sizeLy, 2)) + ' years'} to cross it</dd>` : '';
        const paras = o.about.split(/\n+/).filter(Boolean).map((p) => `<p style="margin:0 0 8px">${esc(p)}</p>`).join('');
        panel.innerHTML = `<div class="mz-in"><div class="mz-head"><h2>M${o.m}${o.name ? ` · ${esc(o.name)}` : ''}<small><span class="mz-dot" style="background:${G.col}"></span>${esc(o.type)} · in ${esc(o.const)}${o.ngc ? ' · ' + esc(o.ngc) : ''}</small></h2>
            <button class="mz-btn mz-min" data-act="min">▾</button><button class="mz-btn" data-act="close" title="back to the whole sky">✕</button></div>
          <div class="mz-body">${modesHTML()}<img class="mz-img" src="${DATA_URL}img/m${String(o.m).padStart(3, '0')}.jpg" alt="M${o.m}">
          <div class="mz-cap">Real photograph, ${o.fov >= 1 ? o.fov.toFixed(1) + '°' : Math.round(o.fov * 60) + '′'} across (the full Moon is 0.5°). Digitized Sky Survey (${esc(o.survey)} plates, 1950s–90s), colour balanced on the stars in the field.</div>
          <dl class="mz-facts">
            <dt>Distance</dt><dd>${lyText(o.ly)}${range ? `<br><span style="color:#8a93a6;font-size:12.5px">${range}</span>` : ''}</dd>
            <dt>Light left it</dt><dd>${lightLeft(o.ly)}</dd>
            ${sizeRow}
            <dt>Looks</dt><dd>${esc(o.dims)} across in our sky${o.mag != null ? `; ${brightness(o.mag)}` : ''}</dd>
          </dl>
          ${what ? `<div class="mz-what">${what}</div>` : ''}
          <div class="mz-about">${paras}</div>
          <div class="mz-src">Text: <a href="${esc(o.wiki)}" target="_blank" rel="noopener">Wikipedia, “${esc(o.wikiTitle)}”</a> (CC BY-SA 4.0). Photo: DSS2 via NASA SkyView.</div>
          <div class="mz-nav"><button class="mz-btn" data-act="prev">← M${o.m === 1 ? 110 : o.m - 1}</button><button class="mz-btn" data-act="next">M${o.m === 110 ? 1 : o.m + 1} →</button><span style="flex:1"></span><button class="mz-btn" data-act="close">Whole sky</button></div></div></div>`;
      }
      if (s.collapsed) panel.classList.add('collapsed'); else panel.classList.remove('collapsed');
    };
    s.renderPanel = renderPanel;
    const touch = () => { s.lastInput = ctx.time; };
    const onPanel = (e) => {
      const b = e.target.closest('[data-act],[data-g],[data-gx]');
      if (!b) return;
      if (b.dataset.gx) {
        touch(); s.touring = false;
        const r = gxFor(s.sel)?.act(b, ctx.time);
        if (r?.fly) {
          // move in to look at that spot, from where we are
          const dir = cam.position.clone().sub(controls.target).normalize();
          s.fly = { t0: ctx.time, dur: 1.6, from: { p: cam.position.clone(), t: controls.target.clone() }, to: { t: r.fly.clone(), p: r.fly.clone().addScaledVector(dir, Math.max(0.12, cam.position.distanceTo(controls.target) * 0.55)) } };
        }
        if (r?.rerender) renderPanel();
        return;
      }
      const act = b.dataset.act;
      if (act === 'photo' || act === 'structure') { touch(); s.touring = false; setMode(act); return; }
      if (act !== 'tour') { touch(); s.touring = false; }
      if (b.dataset.g) { const k = b.dataset.g; if (s.filter.has(k)) s.filter.delete(k); else s.filter.add(k); renderPanel(); return; }
      if (act === 'close') select(-1);
      else if (act === 'next') select(s.objs.findIndex((o) => o.m === (s.objs[s.sel].m % 110) + 1));
      else if (act === 'prev') select(s.objs.findIndex((o) => o.m === ((s.objs[s.sel].m + 108) % 110) + 1));
      else if (act === 'tour') { s.touring = true; s.tourI = -1; s.tourAt = -1e9; }
      else if (act === 'names') { s.allNames = !s.allNames; renderPanel(); }
      else if (act === 'min') { s.collapsed = !s.collapsed; renderPanel(); }
    };
    panel.addEventListener('click', onPanel);

    // ---------- selecting: fly the camera there ----------
    const flyTo = (i) => {
      const from = { p: cam.position.clone(), t: controls.target.clone() };
      const o = s.objs[i], P = s.pos[i];
      // keep looking from roughly the same side, at a distance where the picture fills a good part of the screen
      const dir = cam.position.clone().sub(P).normalize();
      const dist = (o.card * 2.6) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / (ctx.size.width < ctx.size.height ? 0.55 : 1);
      s.fly = { t0: ctx.time, dur: 1.8, from, to: { p: P.clone().addScaledVector(dir, dist), t: P.clone() } };
    };
    const select = (i) => {
      leaveStructure();
      s.sel = i;
      const from = { p: cam.position.clone(), t: controls.target.clone() };
      if (i < 0) {
        s.fly = { t0: ctx.time, dur: 1.8, from, to: { p: new THREE.Vector3(...HOME.p), t: new THREE.Vector3(...HOME.t) } };
        s.big.visible = false;
      } else {
        const o = s.objs[i];
        flyTo(i);
        new THREE.TextureLoader().load(`${DATA_URL}img/m${String(o.m).padStart(3, '0')}.jpg`, (t) => {
          if (s.disposed || s.sel !== i) { t.dispose(); return; }
          t.colorSpace = THREE.SRGBColorSpace;
          s.big.material.uniforms.uMap.value?.dispose();
          s.big.material.uniforms.uMap.value = t; s.big.visible = true; s.bigAt = ctx.time;
        });
      }
      controls.autoRotate = i < 0;
      if (narrow()) s.collapsed = i < 0;     // phone: the card opens for a pick and folds away for the whole sky
      renderPanel();
    };

    // ---------- pointer: hover and click ----------
    const el = ctx.domElement;
    const pick = (cx, cy, radius) => {
      if (!s.ready) return -1;
      const r = el.getBoundingClientRect(), v = new THREE.Vector3();
      let best = -1, bestD = radius;
      s.objs.forEach((o, i) => {
        if (!s.filter.has(o.group)) return;
        v.copy(s.pos[i]).project(cam);
        if (v.z > 1) return;
        const sx = (v.x * 0.5 + 0.5) * r.width + r.left, sy = (0.5 - v.y * 0.5) * r.height + r.top;
        const pxR = Math.max(10, (o.card / 2) * s.mat.uniforms.uPxPerUnit.value / Math.max(0.01, cam.position.distanceTo(s.pos[i])));
        const dd = Math.hypot(sx - cx, sy - cy) - Math.min(pxR, 120) * 0.8;
        if (dd < bestD) { bestD = dd; best = i; }
      });
      return best;
    };
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; touch(); s.touring = false; };
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
      down = null;
      if (s.mode === 'structure') {
        // inside a galaxy: clicks go to its explosions, star-forming regions and supernova sites, not other objects
        const gm = gxFor(s.sel), hit = gm?.pick(e.clientX, e.clientY, cam, el.getBoundingClientRect(), ctx.time);
        if (hit) { gm.select(hit); if (narrow()) s.collapsed = false; renderPanel(); panel.scrollTop = 0; }
        return;
      }
      const i = pick(e.clientX, e.clientY, 14);
      if (i >= 0 && i !== s.sel) select(i);
    };
    const onMove = (e) => { if (e.pointerType === 'mouse') { s.hover = pick(e.clientX, e.clientY, 10); el.style.cursor = s.hover >= 0 ? 'pointer' : ''; } };
    const onKey = (e) => {
      if (!s.ready || e.target.closest?.('input,textarea')) return;
      if (e.key === 'Escape' && s.sel >= 0) { select(-1); e.stopPropagation(); }
      if ((e.key === ']' || e.key === '.') && s.sel >= 0) select(s.objs.findIndex((o) => o.m === (s.objs[s.sel].m % 110) + 1));
      if ((e.key === '[' || e.key === ',') && s.sel >= 0) select(s.objs.findIndex((o) => o.m === ((s.objs[s.sel].m + 108) % 110) + 1));
    };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp); el.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', touch, { passive: true });
    window.addEventListener('keydown', onKey);
    s.unbind = () => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', touch); window.removeEventListener('keydown', onKey); panel.removeEventListener('click', onPanel); el.style.cursor = '';
    };
    s.select = select;
    s.gxFor = gxFor;
    return { s, lines, dots, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, lines, dots, v, w, c } = state;
    const cam = ctx.camera, controls = ctx.controls;
    const { width, height } = ctx.size;
    lines.setResolution(width, height); lines.reset(); dots.reset();
    if (!s.ready) { lines.commit(); dots.commit(); return; }

    // ---------- the tour: starts by itself after 40 s of nothing, or from the button ----------
    if (!s.touring && s.mode !== 'structure' && ctx.time - s.lastInput > 40 && ctx.time > 25) { s.touring = true; s.tourAt = -1e9; }
    if (s.touring && ctx.time - s.tourAt > 14) {
      s.tourI = (s.tourI + 1) % TOUR.length;
      s.tourAt = ctx.time;
      s.select(s.objs.findIndex((o) => o.m === TOUR[s.tourI]));
    }

    // ---------- camera flight ----------
    if (s.fly) {
      const k = Math.min(1, (ctx.time - s.fly.t0) / s.fly.dur), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      // out a little and back in, so long flights don't skim through everything
      const lift = Math.sin(Math.PI * e) * Math.min(6, s.fly.from.t.distanceTo(s.fly.to.t) * 0.35);
      controls.target.copy(s.fly.from.t).lerp(s.fly.to.t, e);
      cam.position.copy(s.fly.from.p).lerp(s.fly.to.p, e);
      v.copy(cam.position).sub(controls.target).normalize();
      cam.position.addScaledVector(v, lift);
      if (k >= 1) s.fly = null;
    }

    // phone with the card open: shift the picture into the space above the card
    // desktop: centre the scene in the space left of the card
    const lift = width < 700 && s.sel >= 0 && !s.collapsed ? Math.round(height * 0.24) : 0;
    const side = width >= 700 ? Math.round(Math.min(400, width * 0.32) / 2) : 0;
    const key = `${lift},${side},${width},${height}`;
    if (key !== s.offKey) { s.offKey = key; if (lift || side) cam.setViewOffset(width, height, side, lift, width, height); else cam.clearViewOffset(); }

    // ---------- cards ----------
    const pxPerUnit = height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    s.mat.uniforms.uPxPerUnit.value = pxPerUnit;
    s.mat.uniforms.uMinPx.value = Math.max(10, Math.min(width, height) / 55);
    const M = s.misc.array;
    s.objs.forEach((o, i) => {
      const on = s.filter.has(o.group) ? 1 : 0;
      const hl = i === s.sel ? 1 : i === s.hover ? 0.6 : 0;
      const shown = on * (i === s.sel && (s.big.visible || s.mode === 'structure') ? (s.mode === 'structure' ? 0 : 1 - s.big.material.uniforms.uA.value) : 1);   // the full-size picture (or the 3D model) replaces it
      M[i * 3 + 1] += (shown - M[i * 3 + 1]) * Math.min(1, ctx.delta * 6);
      M[i * 3 + 2] += (hl - M[i * 3 + 2]) * Math.min(1, ctx.delta * 8);
    });
    s.misc.needsUpdate = true;
    // the selected one: full-resolution picture, facing the camera, fading in over the small card
    if (s.big.visible && s.sel >= 0) {
      const o = s.objs[s.sel];
      s.big.position.copy(s.pos[s.sel]);
      s.big.quaternion.copy(cam.quaternion);
      s.big.scale.setScalar(o.card * 1.25);
      const uA = s.big.material.uniforms.uA;
      uA.value = s.mode === 'structure' ? Math.max(0, uA.value - ctx.delta * 1.5) : Math.min(1, (ctx.time - s.bigAt) / 0.8);
    }
    for (const gm of Object.values(s.gx)) gm.update(ctx);

    // ---------- distance rings in the Galactic plane, drop lines, the Sun ----------
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    RINGS.forEach(([ly], j) => {
      const r = R(ly);
      for (let q = 0; q < 128; q++) {
        const a0 = (q / 128) * Math.PI * 2, a1 = ((q + 1) / 128) * Math.PI * 2;
        v.set(Math.cos(a0) * r, 0, Math.sin(a0) * r); w.set(Math.cos(a1) * r, 0, Math.sin(a1) * r);
        lines.push(v, w, col(j === 2 ? 0x56607a : 0x2c3448, j === 2 ? 0.9 : 0.8));
      }
    });
    for (let q = 0; q < 6; q++) { v.set(q * 0.35, 0, 0); w.set(q * 0.35 + 0.18, 0, 0); lines.push(v, w, col(0xffc46b, 0.35)); }   // toward the Galactic centre
    s.objs.forEach((o, i) => {
      if (!s.filter.has(o.group) || (s.mode === 'structure' && i === s.sel)) return;
      const P = s.pos[i];
      v.copy(P); w.set(P.x, 0, P.z);
      lines.push(v, w, col(GROUPS[o.group].col, i === s.sel || i === s.hover ? 0.5 : 0.05));
    });
    dots.push(v.set(0, 0, 0), col(0xffe08a, 1), 0.035);

    // ---------- labels ----------
    const r = ctx.domElement.getBoundingClientRect();
    const place = (el, P, dy = 0) => {
      v.copy(P).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { el.style.display = 'none'; return false; }
      el.style.display = '';
      el.style.left = `${r.left + (v.x * 0.5 + 0.5) * r.width}px`;
      el.style.top = `${r.top + (0.5 - v.y * 0.5) * r.height + dy}px`;
      return true;
    };
    s.objs.forEach((o, i) => {
      const el = s.lab[i];
      const show = s.mode !== 'structure' && s.filter.has(o.group) && (i === s.sel || i === s.hover || s.allNames || (s.sel < 0 && o.name && cam.position.distanceTo(s.pos[i]) < 6));
      if (!show) { el.style.display = 'none'; return; }
      const d = Math.max(0.01, cam.position.distanceTo(s.pos[i]));
      const half = Math.max(s.mat.uniforms.uMinPx.value, (o.card * 1.25 * pxPerUnit) / d) / 2;
      place(el, s.pos[i], Math.min(half, 260));
      el.className = 'mz-label' + (i === s.sel || i === s.hover ? ' big' : '');
      el.style.opacity = i === s.sel || i === s.hover ? 1 : 0.75;
    });
    RINGS.forEach(([ly], j) => { const ok = place(s.ringLab[j], v.set(R(ly) * 0.7071, 0, R(ly) * 0.7071)); if (ok) s.ringLab[j].style.opacity = s.sel >= 0 ? 0.35 : 0.9; });
    place(s.sunLab, w.set(0, 0, 0), -22);
    // real supernova sites, as rings that stay the same size on screen, with names
    const gmNow = s.mode === 'structure' ? s.gxFor(s.sel) : null;
    const sites = gmNow ? gmNow.observedWorld() : [];
    s.snLab = s.snLab || [];
    while (s.snLab.length < sites.length) { const el = document.createElement('div'); el.className = 'mz-label'; s.dom.labels.appendChild(el); s.snLab.push(el); }
    s.snLab.forEach((el, j) => { if (j >= sites.length) el.style.display = 'none'; });
    if (sites.length) {
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      sites.forEach(({ o, p }, j) => {
        const rad = (9 * cam.position.distanceTo(p)) / pxPerUnit, colr = o.type === 'LRN' ? 0xffd27a : 0x7dffc0;
        for (let q = 0; q < 20; q++) {
          const a0 = (q / 20) * Math.PI * 2, a1 = ((q + 1) / 20) * Math.PI * 2;
          v.copy(p).addScaledVector(right, Math.cos(a0) * rad).addScaledVector(up, Math.sin(a0) * rad);
          w.copy(p).addScaledVector(right, Math.cos(a1) * rad).addScaledVector(up, Math.sin(a1) * rad);
          lines.push(v, w, col(colr, 0.9));
        }
        s.snLab[j].textContent = o.name; s.snLab[j].style.color = o.type === 'LRN' ? '#ffd27a' : '#7dffc0';
        place(s.snLab[j], p, 10);
      });
    }
    s.sunLab.style.opacity = s.sel >= 0 ? 0.4 : 0.9;
    lines.commit(); dots.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    ctx.camera.clearViewOffset();
    s.disposed = true;
    s.unbind?.();
    state.lines.dispose(); state.dots.dispose?.();
    s.dom.style.remove(); s.dom.panel.remove(); s.dom.labels.remove();
    for (const gm of Object.values(s.gx || {})) gm.dispose();
    if (s.geo) { s.geo.dispose(); s.mat.dispose(); s.tex.dispose(); ctx.scene.remove(s.cards); }
    if (s.big) { s.big.material.uniforms.uMap.value?.dispose(); s.big.geometry.dispose(); s.big.material.dispose(); ctx.scene.remove(s.big); }
  },
};
