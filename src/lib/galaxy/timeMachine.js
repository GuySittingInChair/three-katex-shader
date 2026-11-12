import * as THREE from 'three';
import { positionsAt, centresAt } from './encounterSim.js';
import { badge } from './provenance.js';

// The M51 time machine: the encounter simulation (encounterSim.js, run in a worker) drawn in the galaxy's own frame,
// so at "today" the model sits where the photograph does. A timeline bar to play, pause, change speed and scrub;
// click a star to follow it through the whole encounter.

const VERT = /* glsl */ `
  attribute vec3 aCol;
  uniform float uPx, uA;
  varying vec3 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vCol = aCol * uA;
    gl_PointSize = clamp(uPx / max(0.01, -mv.z), 1.5, 8.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.0; if (r2 > 1.0) discard; gl_FragColor = vec4(vCol * exp(-r2 * 3.0), 1.0); }`;

const css = `
.tm-bar{position:fixed;z-index:16;left:calc((100vw - 420px) / 2);transform:translateX(-50%);bottom:92px;width:min(680px,calc(100vw - 460px));background:rgba(12,13,18,.92);
  border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px 12px;color:#e9edf5;font:13px system-ui,sans-serif;display:flex;flex-direction:column;gap:6px}
.tm-row{display:flex;gap:8px;align-items:center}
.tm-bar button{background:rgba(255,255,255,.08);color:#e9edf5;border:1px solid rgba(255,255,255,.16);border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit}
.tm-bar button.on{background:#9db4ff33;border-color:#9db4ff}
.tm-read{flex:1;text-align:right;font-variant-numeric:tabular-nums;color:#c9d3e6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-track{position:relative;height:22px}
.tm-track input{position:absolute;inset:0;width:100%;margin:0;accent-color:#9db4ff}
.tm-tick{position:absolute;top:-2px;width:2px;height:6px;background:#ffd27a;transform:translateX(-1px);pointer-events:none}
.tm-tick.today{background:#7dffc0;height:26px;top:-2px}
.tm-tick.merger{background:#ff7a9a}
@media (max-width:700px){.tm-bar{left:50%;width:calc(100vw - 20px);bottom:auto;top:56px}}`;

const KIND_TEXT = { closest: 'closest approach', crossing: 'NGC 5195 passes through the plane of M51\'s disk', merger: 'the two cores merge', today: 'today' };
const fmtT = (t) => (Math.abs(t) < 0.5 ? 'today' : `${Math.abs(Math.round(t))} million years ${t < 0 ? 'ago' : 'from now'}`);

export function createTimeMachine({ url, labelLayer, onPanelChange }) {
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const group = new THREE.Group(); group.matrixAutoUpdate = false; group.visible = false;
  const st = { t: -800, rate: 40, playing: false, ready: false, progress: 0, on: false, alpha: 0, follow: -1 };
  let sim = null, fit = null, geo, mat, pos, off, pathGeo, pathFut, mainPath, trackLine;
  const labels = ['M51', 'NGC 5195'].map((t) => { const el = document.createElement('div'); el.className = 'mz-label big'; el.textContent = t; el.style.display = 'none'; labelLayer.appendChild(el); return el; });
  const markGeo = new THREE.BufferGeometry(); markGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  markGeo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array([1, 0.9, 0.7, 1, 0.75, 0.5]), 3));
  const markMat = new THREE.ShaderMaterial({ vertexShader: VERT.replace('clamp(uPx / max(0.01, -mv.z), 1.0, 7.0)', 'uPx'), fragmentShader: FRAG, uniforms: { uPx: { value: 14 }, uA: { value: 1 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
  const marks = new THREE.Points(markGeo, markMat); marks.frustumCulled = false; marks.renderOrder = 4;

  // ---------- the timeline bar ----------
  const bar = document.createElement('div'); bar.className = 'tm-bar'; bar.style.display = 'none';
  bar.innerHTML = `<div class="tm-row"><button data-tm="play" title="play / pause (space)">▶</button><button data-tm="speed" title="speed">×1</button><button data-tm="today">Today</button><span class="tm-read">computing…</span></div>
    <div class="tm-track"><input type="range" min="-800" max="900" step="1" value="-800"></div>`;
  document.body.appendChild(bar);
  const slider = bar.querySelector('input'), read = bar.querySelector('.tm-read'), playBtn = bar.querySelector('[data-tm=play]'), speedBtn = bar.querySelector('[data-tm=speed]');
  const SPEEDS = [[10, '×¼'], [40, '×1'], [120, '×3']];
  const syncBar = () => {
    playBtn.textContent = st.playing ? '⏸' : '▶';
    speedBtn.textContent = SPEEDS.find((s) => s[0] === st.rate)[1];
    slider.value = String(Math.round(st.t));
    const near = sim?.moments.find((m) => Math.abs(m.t - st.t) < 12);
    read.textContent = !st.ready ? `computing the encounter… ${Math.round(st.progress * 100)}%` : `${fmtT(st.t)}${near && near.kind !== 'today' ? ' — ' + KIND_TEXT[near.kind] + (near.r ? `, ${near.r.toFixed(1)} kpc apart` : '') : ''}`;
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tm]'); if (!b) return;
    if (b.dataset.tm === 'play') { if (st.t >= sim?.t1 - 1) st.t = sim.t0; st.playing = !st.playing; }
    if (b.dataset.tm === 'speed') { const k = SPEEDS.findIndex((s) => s[0] === st.rate); st.rate = SPEEDS[(k + 1) % SPEEDS.length][0]; }
    if (b.dataset.tm === 'today') { st.t = 0; st.playing = false; }
    syncBar();
  });
  slider.addEventListener('input', () => { st.t = +slider.value; st.playing = false; syncBar(); });
  const onKey = (e) => { if (st.on && st.ready && e.code === 'Space' && !e.target.closest?.('input,textarea,button')) { e.preventDefault(); if (st.t >= sim.t1 - 1) st.t = sim.t0; st.playing = !st.playing; syncBar(); } };
  window.addEventListener('keydown', onKey);
  // keep keys on the slider from also flying round the catalogue
  slider.addEventListener('keydown', (e) => e.stopPropagation());

  // ---------- run the simulation ----------
  let worker = null;
  const start = () => {
    if (worker || sim) return;
    fetch(url + 'encounter.json').then((r) => r.json()).then((f) => {
      fit = f;
      worker = new Worker(new URL('./encounterWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.progress != null) { st.progress = e.data.progress; syncBar(); return; }
        sim = e.data.sim; worker.terminate(); worker = null;
        build(); st.ready = true; st.t = sim.t0; st.playing = true; syncBar(); onPanelChange?.();
      };
      worker.postMessage({ main: f.main, comp: f.comp, compPos: f.compPos, compVel: f.compVel, spin: f.spin, t0: f.t0, t1: f.t1, nDisk: 6000, nComp: 1000 });
    });
  };
  const build = () => {
    const n = sim.n;
    pos = new Float32Array(n * 3);
    const c0 = centresAt(sim, 0).main; off = c0;           // today's M51 centre goes where the photograph's is
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = sim.born[i * 2], comp = sim.born[i * 2 + 1] > 0.5;
      const k = Math.min(1, r / 10);
      const c = comp ? [1, 0.68, 0.42] : [1 - 0.4 * k, 0.86 - 0.08 * k, 0.62 + 0.38 * k];
      col.set(c.map((x) => x * 0.9), i * 3);
    }
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uPx: { value: 1 }, uA: { value: 0 } }, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    // the companion's path, past solid and future dashed (relative to today's frame)
    const past = [], fut = [], mp = [];
    for (let t = sim.t0; t <= sim.t1; t += 5) {
      const c = centresAt(sim, t), p = new THREE.Vector3(c.comp[0] - off[0], c.comp[1] - off[1], c.comp[2] - off[2]);
      (t <= 0 ? past : fut).push(p); if (t === 0) fut.push(p.clone());
      mp.push(new THREE.Vector3(c.main[0] - off[0], c.main[1] - off[1], c.main[2] - off[2]));
    }
    pathGeo = new THREE.BufferGeometry().setFromPoints(past);
    pathFut = new THREE.BufferGeometry().setFromPoints(fut);
    const l1 = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.55, depthTest: false }));
    const l2 = new THREE.Line(pathFut, new THREE.LineDashedMaterial({ color: 0xffb070, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.45, depthTest: false }));
    l2.computeLineDistances();
    mainPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.25, depthTest: false }));
    trackLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7dffc0, transparent: true, opacity: 0.9, depthTest: false }));
    for (const l of [l1, l2, mainPath, trackLine]) { l.frustumCulled = false; l.renderOrder = 3; }
    group.add(pts, marks, l1, l2, mainPath, trackLine);
    // ticks for the key moments
    const track = bar.querySelector('.tm-track');
    for (const m of sim.moments) {
      const el = document.createElement('div'); el.className = 'tm-tick ' + m.kind; el.title = `${fmtT(m.t)}: ${KIND_TEXT[m.kind]}`;
      el.style.left = `${((m.t - sim.t0) / (sim.t1 - sim.t0)) * 100}%`; track.appendChild(el);
    }
    slider.min = sim.t0; slider.max = sim.t1;
  };
  const follow = (i) => {
    st.follow = i;
    // the star's whole path, every snapshot
    const pts = [];
    for (let s = 0; s < sim.nSnap; s++) { const b = s * sim.n * 6 + i * 3; pts.push(new THREE.Vector3(sim.snaps[b] - off[0], sim.snaps[b + 1] - off[1], sim.snaps[b + 2] - off[2])); }
    trackLine.geometry.dispose(); trackLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  };
  // where a star is at time t: in M51's disk, round NGC 5195, between them, or flung out
  const whereIs = (i, t) => {
    const p = positionsAt(sim, t, new Float64Array(sim.n * 3)), c = centresAt(sim, t);
    const x = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
    const dM = Math.hypot(x[0] - c.main[0], x[1] - c.main[1], x[2] - c.main[2]), dC = Math.hypot(x[0] - c.comp[0], x[1] - c.comp[1], x[2] - c.comp[2]);
    const sep = Math.hypot(c.comp[0] - c.main[0], c.comp[1] - c.main[1], c.comp[2] - c.main[2]);
    if (sep < 1) return dM < 20 ? `in the merged galaxy, ${dM.toFixed(1)} kpc from its centre` : `flung out to ${dM.toFixed(0)} kpc`;
    if (dC < 4 && dC < dM) return `orbiting NGC 5195, ${dC.toFixed(1)} kpc from its centre`;
    if (dM < 16) return `in M51, ${dM.toFixed(1)} kpc from the centre`;
    if (dM < sep && dC < sep) return `in the bridge between the two galaxies`;
    return `out in a tidal tail, ${dM.toFixed(0)} kpc from M51's centre`;
  };

  return {
    group,
    get ready() { return st.ready; },
    show(on) {
      st.on = on; bar.style.display = on ? '' : 'none';
      if (on) { start(); group.visible = true; } else { st.playing = false; labels.forEach((l) => (l.style.display = 'none')); }
      syncBar();
    },
    get on() { return st.on; },
    update(ctx, galaxyMatrix, unitsPerKpc, project) {
      st.alpha += ((st.on ? 1 : 0) - st.alpha) * Math.min(1, ctx.delta * 2.5);
      if (!st.on && st.alpha < 0.01) { group.visible = false; return; }
      group.visible = true;
      group.matrix.copy(galaxyMatrix); group.matrixWorldNeedsUpdate = true;
      if (!st.ready) return;
      if (st.playing) {
        st.t = Math.min(sim.t1, st.t + ctx.delta * st.rate);
        if (st.t >= sim.t1) st.playing = false;
        syncBar();
      }
      positionsAt(sim, st.t, pos);
      for (let i = 0; i < sim.n; i++) { pos[i * 3] -= off[0]; pos[i * 3 + 1] -= off[1]; pos[i * 3 + 2] -= off[2]; }
      geo.attributes.position.needsUpdate = true;
      const c = centresAt(sim, st.t), mp = markGeo.attributes.position.array;
      for (let k = 0; k < 3; k++) { mp[k] = c.main[k] - off[k]; mp[3 + k] = c.comp[k] - off[k]; }
      markGeo.attributes.position.needsUpdate = true;
      const pxPerUnit = ctx.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
      mat.uniforms.uPx.value = pxPerUnit * unitsPerKpc * 0.13;
      mat.uniforms.uA.value = st.alpha * 1.25;
      const merged = Math.hypot(c.comp[0] - c.main[0], c.comp[1] - c.main[1], c.comp[2] - c.main[2]) < 1;
      [[c.main, 0], [c.comp, 1]].forEach(([p, j]) => {
        if (j === 1 && merged) { labels[1].style.display = 'none'; return; }
        const w = new THREE.Vector3(p[0] - off[0], p[1] - off[1], p[2] - off[2]).applyMatrix4(group.matrix);
        project(labels[j], w, 14);
        labels[j].style.opacity = st.alpha;
      });
      if (merged) labels[0].textContent = 'M51 + NGC 5195 (merged)'; else labels[0].textContent = 'M51';
    },
    /** click a star to follow it */
    pick(cx, cy, camera, rect) {
      if (!st.ready || !st.on) return false;
      const v = new THREE.Vector3(); let best = -1, bd = 12;
      for (let i = 0; i < sim.n; i += 1) {
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(group.matrix).project(camera);
        if (v.z > 1) continue;
        const d = Math.hypot(rect.left + (v.x * 0.5 + 0.5) * rect.width - cx, rect.top + (0.5 - v.y * 0.5) * rect.height - cy);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return false;
      follow(best); onPanelChange?.();
      return true;
    },
    jump(t) { st.t = t; st.playing = false; syncBar(); },
    /** where M51's centre is right now, in the scene (the camera keeps it in view while time moves) */
    focusWorld() {
      if (!st.ready) return null;
      const c = centresAt(sim, st.t).main;
      return new THREE.Vector3(c[0] - off[0], c[1] - off[1], c[2] - off[2]).applyMatrix4(group.matrix);
    },
    panel() {
      if (!st.ready || !fit) return `<div class="gx-ev"><h3>M51 and NGC 5195 through time ${badge('SIMULATED')}</h3><p style="margin:0">Computing the encounter in your browser… ${Math.round(st.progress * 100)}%</p></div>`;
      const close = sim.moments.filter((m) => m.kind === 'closest'), merger = sim.moments.find((m) => m.kind === 'merger');
      const fol = st.follow >= 0 ? (() => {
        const i = st.follow, comp = sim.born[i * 2 + 1] > 0.5;
        return `<div class="gx-ev"><h3>The star you're following</h3><p style="margin:0 0 6px">It started ${comp ? 'in NGC 5195' : `in M51's disk, ${sim.born[i * 2].toFixed(1)} kpc from the centre`}, 800 million years ago. Right now (${fmtT(st.t)}) it is ${whereIs(i, st.t)}. Today it is ${whereIs(i, 0)}${merger ? `; after the merger it ends up ${whereIs(i, sim.t1)}` : ''}.</p><p style="margin:0;color:#9aa3b5">The green line is its whole path. It is one test particle in the model ${badge('SIMULATED')}, standing in for millions of real stars on similar orbits.</p></div>`;
      })() : '';
      return `${fol}<div class="gx-ev"><h3>M51 and NGC 5195 through time ${badge('SIMULATED')}</h3>
        <p style="margin:0 0 6px">M51's two great arms and the bridge to its companion are most likely tides: NGC 5195 swung past, pulling harder on M51's near side than its middle, and harder on its middle than its far side — stretching the disk into two arms, one towards the companion and one away. This is the encounter, computed in your browser the way Toomre &amp; Toomre first did it in 1972: the two galaxies as soft balls of mass (dark matter included), and ${(sim.nDisk + sim.nComp).toLocaleString()} test stars that feel their pull. Use the bar below: ▶ play, drag to scrub, click a star to follow it.</p>
        <p style="margin:0 0 6px">In this model: closest approach ${close.map((m) => `${fmtT(m.t)} (${m.r.toFixed(1)} kpc)`).join(', then ')}${merger ? `; the cores merge ${fmtT(merger.t)}` : ''}. In the future, dynamical friction — the companion dragging a wake of dark matter behind it — slows it down until it sinks into M51 and the two become one galaxy.</p>
        <p style="margin:6px 0 4px;font-weight:600">Moments</p>
        <ul class="gx-list">${sim.moments.map((m) => `<li><span class="n">${fmtT(m.t)} <span style="color:#9aa3b5">· ${KIND_TEXT[m.kind]}${m.r ? `, ${m.r.toFixed(1)} kpc` : ''}</span></span><button class="mz-btn" data-tmj="${m.t}">Go</button></li>`).join('')}</ul>
        <p style="margin:6px 0 4px;font-weight:600">How this orbit was chosen</p>
        <p style="margin:0 0 6px;font-size:13px">${fit.tried} trial orbits through NGC 5195's real position on the sky; ${fit.sensible} had a sensible past (a close pass 120–550 million years ago). Each was simulated, and this one's disk today best matches the photograph's arms: correlation ${fit.diskOnly} for M51's disk alone (1 would be a perfect match), against ${fit.diskBaseline} for an undisturbed disk and ${fit.otherSpin} for the same orbit with the disk spinning the other way${fit.diskOnly - fit.otherSpin > 0.2 ? ' — so the fit also says which way M51 turns' : ' — so it leans towards this direction of rotation, but only weakly'}. NGC 5195's depth was tried too: the best fit puts it ${fit.depth} kpc behind M51.</p>
        <p style="margin:6px 0 4px;font-weight:600">What's real here</p>
        <div class="gx-prov"><div>${badge('OBSERVED')} NGC 5195's position on the sky, and M51's photograph the fit is scored against.</div>
          <div>${badge('INFERRED')} NGC 5195's depth, ${fit.depth} kpc behind M51 — chosen by the fit; only that it is behind is observed (M51's dusty arm crosses in front of it).</div>
          <div>${badge('ARTISTIC')} The masses: flat rotation speeds of 200 and 160 km/s, a mass ratio of about ${(sim.Mcomp / sim.Mmain).toFixed(2)} (published models use roughly a third to a half).</div>
          <div>${badge('SIMULATED')} Everything that moves, computed here — not a published simulation. Stars don't pull on each other and there is no gas, so no new stars form; the past is run without dynamical friction.</div></div>
        <div class="mz-unknown"><div class="mz-unknown-h">What we still don't know</div><ul>
          <li>Whether NGC 5195 passed M51 once or twice: some detailed models fit better with an earlier passage too (e.g. Salo &amp; Laurikainen 2000).</li>
          <li>How far behind M51 the companion really is, and the two galaxies' true masses — which set when (or whether) they merge.</li></ul></div></div>`;
    },
    act(btn) { if (btn.dataset.tmj != null) { this.jump(+btn.dataset.tmj); return true; } return false; },
    dispose() {
      worker?.terminate(); style.remove(); bar.remove(); window.removeEventListener('keydown', onKey); labels.forEach((l) => l.remove());
      geo?.dispose(); mat?.dispose(); markGeo.dispose(); markMat.dispose(); pathGeo?.dispose(); pathFut?.dispose();
      mainPath?.geometry.dispose(); trackLine?.geometry.dispose();
      group.parent?.remove(group);
    },
  };
}
