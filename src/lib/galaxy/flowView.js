// "The nearby universe, flowing": a full-screen movie of the matter within ~230 Mpc of us, moved backwards and
// forwards in time along the Cosmicflows-4 velocity field with linear theory (the Zel'dovich approximation).
// Data: tools/motion/build_flow.py → public/data/motion/flow.json + flow.bin. A 2D canvas, like localGroup.js.
// see docs/wiki/sketches/messierInDepth.md
import { badge } from './provenance.js';

const MPC_LY = 3.2616e6;
const css = `
.fl-wrap{position:fixed;inset:0;z-index:40;background:#020306;display:flex;color:#e9edf5;font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.fl-wrap *{box-sizing:border-box}
.fl-cv{flex:1;min-width:0;position:relative;touch-action:none;cursor:grab}
.fl-cv canvas{position:absolute;inset:0;width:100%;height:100%}
.fl-side{width:min(410px,40vw);overflow:auto;padding:14px 16px 18px;background:rgba(12,13,18,.96);border-left:1px solid rgba(255,255,255,.12)}
.fl-side h2{margin:0 0 2px;font:600 21px/1.2 Georgia,serif}
.fl-side h2 small{display:block;font:13px system-ui;color:#9aa3b5;margin-top:3px}
.fl-side p{margin:0 0 9px;font-size:13.5px}
.fl-n{color:#8a93a6;font-size:12px}
.fl-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.fl-btn{background:rgba(255,255,255,.07);color:#e9edf5;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:13px}
.fl-btn.on{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5)}
.fl-time{font:600 19px/1.25 Georgia,serif;margin:6px 0 2px}
.fl-slider{width:100%}
.fl-box{background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;margin:10px 0;font-size:13px}
.fl-box ul{margin:4px 0 0;padding-left:18px}.fl-box li{margin:3px 0}
.fl-hud{position:absolute;left:12px;top:10px;right:58px;font-size:12.5px;color:#b9c1d0;pointer-events:none;text-shadow:0 1px 3px #000}
.fl-x{position:absolute;right:10px;top:10px;z-index:2;width:38px;height:38px;border-radius:50%;background:rgba(12,13,18,.85);color:#e9edf5;border:1px solid rgba(255,255,255,.25);font-size:18px;cursor:pointer}
.gx-badge{display:inline-block;font-size:11px;line-height:1.4;padding:0 7px;border:1px solid;border-radius:99px;margin-left:6px;vertical-align:1px;white-space:nowrap}
@media (max-width:700px){.fl-wrap{flex-direction:column}.fl-cv{flex:none;height:50vh}.fl-side{width:auto;flex:1;border-left:0;border-top:1px solid rgba(255,255,255,.12)}.fl-hud{font-size:11.5px}}
`;
// colour by today's density: empty (blue) → average (pale) → dense (gold)
const COLS = ['#3f6dff', '#6f9bff', '#b9ccff', '#ffe3a8', '#ffb347'];
const RGB = COLS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255));

const fmtT = (t, age) => {
  if (Math.abs(t - age) < 0.08) return 'now';
  if (t < age) return `${(age - t).toFixed(age - t >= 10 ? 1 : 2)} billion years ago <span class="fl-n">(${t < 1 ? Math.round(t * 1000) + ' million' : t.toFixed(1) + ' billion'} years after the Big Bang)</span>`;
  return `${(t - age).toFixed(1)} billion years from now`;
};

export function createFlowView({ url }) {
  const st = { open: false, i: 0, play: false, speed: 1, slab: true, expand: false, yaw: 0, pitch: 0, zoom: 1, last: 0, raf: 0 };
  let acc = null, off = document.createElement('canvas'), offg = off.getContext('2d'), wrap, cv, canvas, g, hud, side, style, M = null, Q, P, Dn, slabIdx, allIdx, loading = null;

  const load = () => loading || (loading = Promise.all([
    fetch(url + 'flow.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(url + 'flow.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
  ]).then(([m, buf]) => {
    M = m; const n = m.n;
    const i16 = new Int16Array(buf, 0, n * 6), d8 = new Int8Array(buf, n * 12, n);
    Q = new Float32Array(n * 3); P = new Float32Array(n * 3); Dn = d8;
    for (let k = 0; k < n * 3; k++) { Q[k] = i16[k] / 100; P[k] = i16[n * 3 + k] / 100; }
    // points grouped by colour, so the canvas changes colour five times a frame, not 90,000
    // log10(1 + δ): below −0.25 is a void (under 56% of average), above +0.25 a crowd (over 1.8× average)
    const bucket = (k) => { const l = (d8[k] / 127) * 1.3; return l < -0.25 ? 0 : l < -0.08 ? 1 : l < 0.08 ? 2 : l < 0.25 ? 3 : 4; };
    allIdx = COLS.map(() => []); slabIdx = COLS.map(() => []);
    for (let k = 0; k < n; k++) { const b = bucket(k); allIdx[b].push(k); if (Math.abs(Q[k * 3 + 2]) < 15) slabIdx[b].push(k); }
    allIdx = allIdx.map((a) => Int32Array.from(a)); slabIdx = slabIdx.map((a) => Int32Array.from(a));
    st.iNow = m.table.findIndex((r) => r[1] >= 1);
    st.i = st.iNow;
  }));

  // the cosmological state at a fractional row of the table: [t, a, D]
  const row = (x) => { const T = M.table, k = Math.max(0, Math.min(T.length - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - k)); return [0, 1, 2].map((c) => T[k][c] + (T[k + 1][c] - T[k][c]) * f); };

  const draw = () => {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#020306'; g.fillRect(0, 0, W, H);
    if (!M) { g.fillStyle = '#8a93a6'; g.font = '13px system-ui'; g.fillText('Loading the map of the nearby universe…', 16, 30); return; }
    const [t, a, D] = row(st.i), k = D - 1, s = st.expand ? a : 1;
    const span = (W < 500 ? 360 : 330);                                     // Mpc/h across the short side at zoom 1
    const sc = (Math.min(W, H) / span) * st.zoom * s, cx = W / 2, cy = H / 2;
    const cyw = Math.cos(st.yaw), syw = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    // rotate: yaw about the view's vertical, then pitch about its horizontal
    const proj = (x, y, z, out) => { const u = x * cyw + z * syw, w = -x * syw + z * cyw; out[0] = cx + u * sc; out[1] = cy - (y * cp - w * sp) * sc; return out; };
    // the dots, added up as light into a pixel buffer (much faster than 90,000 little rectangles)
    const sets = st.slab ? slabIdx : allIdx, gain = st.slab ? 0.5 : 0.17, o = [0, 0];
    const bw = Math.round(W), bh = Math.round(H);
    if (!acc || acc.w !== bw || acc.h !== bh) { acc = { w: bw, h: bh, f: new Float32Array(bw * bh * 3), img: new ImageData(bw, bh) }; off.width = bw; off.height = bh; }
    const F = acc.f; F.fill(0);
    for (let b = 0; b < 5; b++) {
      const [cr, cg, cb] = RGB[b], L = sets[b], wt = gain * (b === 0 ? 0.7 : 1);
      for (let j = 0; j < L.length; j++) {
        const q = L[j] * 3;
        proj(Q[q] + k * P[q], Q[q + 1] + k * P[q + 1], Q[q + 2] + k * P[q + 2], o);
        const x = o[0] | 0, y = o[1] | 0;
        if (x < 0 || y < 0 || x >= bw - 1 || y >= bh - 1) continue;
        // a 2×2 splat, so the dots stay visible on high-density screens
        for (const d of [0, 1, bw, bw + 1]) { const at = (y * bw + x + d) * 3; F[at] += cr * wt; F[at + 1] += cg * wt; F[at + 2] += cb * wt; }
      }
    }
    const px = acc.img.data;
    for (let i = 0, j = 0; i < F.length; i += 3, j += 4) {
      // soft tone curve: crowded pixels saturate gently instead of clipping
      px[j] = 255 * (1 - Math.exp(-F[i])) + 2; px[j + 1] = 255 * (1 - Math.exp(-F[i + 1])) + 3; px[j + 2] = 255 * (1 - Math.exp(-F[i + 2])) + 6; px[j + 3] = 255;
    }
    offg.putImageData(acc.img, 0, 0);
    g.drawImage(off, 0, 0, W, H);
    // the clusters, carried along by the same flow
    g.font = '12px system-ui,sans-serif'; g.textAlign = 'center';
    // names don't overlap: one that would land on a name already drawn shows only its ring
    const placed = [];
    const lab = (name, p, ps, col) => {
      if (st.slab && Math.abs(p[2]) > 25) return;
      proj(p[0] + k * ps[0], p[1] + k * ps[1], p[2] + k * ps[2], o);
      if (o[0] < -20 || o[0] > W + 20 || o[1] < -20 || o[1] > H + 20) return;
      g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.arc(o[0], o[1], 5, 0, 7); g.stroke();
      const tw = g.measureText(name).width / 2 + 4, x = Math.min(W - tw, Math.max(tw, o[0])), y = Math.max(14, o[1] - 9);
      if (placed.some(([a, b, w2]) => Math.abs(a - x) < w2 + tw && Math.abs(b - y) < 15)) return;
      placed.push([x, y, tw]);
      g.fillStyle = col; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(name, x, y); g.shadowBlur = 0;
    };
    lab('You (the Local Group)', [0, 0, 0], M.observer.psi, '#7dffc0');
    for (const l of M.labels) lab(l.name, l.p, l.psi, '#e9edf5');
    // scale bar: 50 Mpc/h comoving (at today's size; shrinks with the expansion toggle)
    const bar = 50 * sc, mly = Math.round((50 / M.h) * MPC_LY / 1e6 * (st.expand ? a : 1));
    g.strokeStyle = '#8a93a6'; g.lineWidth = 1; g.beginPath(); g.moveTo(16, H - 18); g.lineTo(16 + bar, H - 18); g.stroke();
    g.fillStyle = '#8a93a6'; g.textAlign = 'left'; g.fillText(`${mly.toLocaleString('en-US')} million light-years`, 16, H - 24);
    hud.innerHTML = `${fmtT(t, M.age)}<br><span class="fl-n">structure grown to ${Math.round(D * 100)}% of today's${st.expand ? ` · universe ${a < 1 ? Math.round(a * 100) + '% of' : (a).toFixed(1) + '×'} today's size` : ''}</span>`;
  };

  const loop = (now) => {
    if (!st.open) return;
    const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 0; st.last = now;
    if (st.play && M) {
      st.i += dt * 9 * st.speed;
      if (st.i >= M.table.length - 1) { st.i = M.table.length - 1; st.play = false; renderSide(); }
      const sl = side.querySelector('.fl-slider'); if (sl) sl.value = st.i;
      const tt = side.querySelector('.fl-time'); if (tt) tt.innerHTML = fmtT(row(st.i)[0], M.age);
    }
    // redraw only when something changed (the picture is still while paused)
    const key = M ? `${st.i},${st.yaw},${st.pitch},${st.zoom},${st.slab},${st.expand},${cv.clientWidth},${cv.clientHeight}` : 'loading';
    if (key !== st.drawn || !M) { st.drawn = key; draw(); }
    st.raf = requestAnimationFrame(loop);
  };

  const renderSide = () => {
    if (!side) return;
    if (!M) { side.innerHTML = '<h2>The nearby universe, flowing</h2><p class="fl-n">Loading…</p>'; return; }
    const obsPsi = Math.hypot(...M.observer.psi) / M.h, obsV = Math.round(Math.hypot(...M.observer.v));
    const on = Math.hypot(...M.observer.psi);
    const towards = M.labels.map((l) => ({ name: l.name, ang: Math.round((Math.acos(l.p.reduce((s2, x, j) => s2 + x * M.observer.psi[j], 0) / on / Math.hypot(...l.p)) * 180) / Math.PI) })).filter((l) => l.ang < 25).sort((a, b) => a.ang - b.ang);
    const B = (on) => (on ? 'fl-btn on' : 'fl-btn');
    side.innerHTML = `<h2>The nearby universe, flowing<small>All the matter within about 750 million light-years, run backwards and forwards with gravity</small></h2>
      <div class="fl-time">${fmtT(row(st.i)[0], M.age)}</div>
      <input class="fl-slider" type="range" min="0" max="${M.table.length - 1}" step="0.01" value="${st.i}" data-fl="slide" aria-label="time">
      <div class="fl-row"><button class="fl-btn" data-fl="play">${st.play ? '⏸ Pause' : '▶ Play'}</button>${[[0.5, 'slow'], [1, 'medium'], [2.5, 'fast']].map(([v, n]) => `<button class="${B(st.speed === v)}" data-fl="speed" data-v="${v}">${n}</button>`).join('')}</div>
      <div class="fl-row"><button class="fl-btn" data-fl="early">From the early universe</button><button class="fl-btn" data-fl="now">Now</button><button class="fl-btn" data-fl="end">${Math.round(M.table[M.table.length - 1][0] - M.age)} billion years ahead</button></div>
      <div class="fl-row"><button class="${B(st.slab)}" data-fl="slab">A slice: the supergalactic plane</button><button class="${B(!st.slab)}" data-fl="sphere">The whole sphere</button></div>
      <div class="fl-row"><button class="${B(st.expand)}" data-fl="expand">${st.expand ? 'Expansion shown' : 'Show the expansion too'}</button><button class="fl-btn" data-fl="face">Face-on view</button></div>
      <p class="fl-n">Drag to turn, pinch or scroll to zoom. Colour: how crowded each dot's surroundings are today: deep blue in the voids (under about half the average density), gold in the crowds (nearly twice the average or more). Watch the gold gather.</p>
      <div class="fl-box"><b>What you're seeing</b> ${badge('INFERRED')} ${badge('SIMULATED')}
        <p style="margin:6px 0">Each dot is a bit of matter (dark and ordinary), placed where the Cosmicflows-4 map says matter is today. Every bit is moving: gravity pulls it out of the emptier regions and towards the crowded ones. Play it backwards and the clusters spread out; play it forwards and they keep gathering.</p>
        <p style="margin:6px 0">The expansion of the universe is taken out (unless you switch it on), so what you see is only the motion gravity adds on top of it, a few hundred km/s, the same motion the arrows on the sky show.</p>
        <ul>
          <li>You are moving too: the map gives the Local Group ${obsV} km/s, so since the early universe we've drifted about ${Math.round(obsPsi)} Mpc (${Math.round(obsPsi * MPC_LY / 1e6)} million light-years), ${towards.length ? `heading roughly towards ${towards.map((l) => `the ${l.name} (${l.ang}° off)`).join(' and ')}` : 'not straight at any one big cluster'}.</li>
          <li>Run backwards to the start, the clumping of the dots (beyond what pure chance would give) drops from ${M.clumpiness.now.toFixed(2)} to ${M.clumpiness.early.toFixed(2)}: about halfway to smooth. The early universe really was almost perfectly smooth; the rest of the clumping is in the tight knots this method can't undo.</li>
          <li>Into the future the movie slows to a stop: dark energy is pulling the universe apart faster and faster, so in this model structure only ever grows ${Math.round((M.dInf - 1) * 100)}% beyond today's. The clusters you see now are nearly all there will ever be.</li>
        </ul></div>
      <div class="fl-box"><b>How it's built</b>
        <p style="margin:6px 0">The Cosmicflows-4 map (Courtois et al. 2023, A&amp;A 670, L15) is built from the distances and speeds of about 56,000 galaxies. It gives the density and the 3D velocity on a grid of cells about 11 Mpc (36 million light-years) across. We put ${M.n.toLocaleString('en-US')} dots where the density is, then move each one along a straight line through its velocity. The length of that line grows with the "growth factor" of structure, D(t): this is the Zel'dovich approximation (1970), the same linear theory of gravity the map itself is built on.</p>
        <p style="margin:6px 0">Time and growth come from a standard model of the universe (flat, 30% matter, 70% dark energy, H₀ = 70 km/s/Mpc), which puts the universe's age at ${M.age.toFixed(1)} billion years (13.8 with the latest measured values) and gives a growth rate today of f = ${M.f}.</p></div>
      <div class="fl-box"><b>What it leaves out</b><ul>
        <li>Anything smaller than the map's cells: single galaxies, their orbits inside groups and clusters. Clusters are shown as soft clumps, never as tight balls.</li>
        <li>Straight-line motion is only right while things haven't crossed paths. In the densest places (clusters), real matter fell in, overshot and settled; here it would carry on through. So the far past and far future are the most approximate parts.</li>
        <li>Each dot's motion is read off at its position today, not where it started. That is the first-order version of the method.</li>
        <li>The map gets less certain with distance: it is well measured out to about 200 Mpc/h, and this view stops at ${M.R} Mpc/h (${Math.round(M.R / M.h * MPC_LY / 1e6).toLocaleString('en-US')} million light-years).</li></ul></div>
      <div class="fl-row"><span style="flex:1"></span><button class="fl-btn" data-fl="close">✕ Back to the sky</button></div>`;
  };

  const onClick = (e) => {
    const b = e.target.closest('[data-fl]'); if (!b || !M) { if (b?.dataset.fl === 'close') close(); return; }
    const a = b.dataset.fl;
    if (a === 'play') { if (!st.play && st.i >= M.table.length - 1.01) st.i = 0; st.play = !st.play; }
    else if (a === 'speed') st.speed = +b.dataset.v;
    else if (a === 'early') { st.i = 0; st.play = true; }
    else if (a === 'now') { st.i = st.iNow; st.play = false; }
    else if (a === 'end') { st.i = M.table.length - 1; st.play = false; }
    else if (a === 'slab') st.slab = true;
    else if (a === 'sphere') { st.slab = false; if (st.pitch === 0 && st.yaw === 0) { st.pitch = 0.5; st.yaw = 0.4; } }
    else if (a === 'expand') st.expand = !st.expand;
    else if (a === 'face') { st.yaw = 0; st.pitch = 0; st.zoom = 1; }
    else if (a === 'close') { close(); return; }
    renderSide();
  };
  const onInput = (e) => {
    if (e.target.dataset.fl !== 'slide' || !M) return;
    st.i = +e.target.value; st.play = false;
    const tt = side.querySelector('.fl-time'); if (tt) tt.innerHTML = fmtT(row(st.i)[0], M.age);
    const pb = side.querySelector('[data-fl=play]'); if (pb) pb.textContent = '▶ Play';
  };
  // drag to turn, two fingers or the wheel to zoom
  const pts = new Map(); let drag = null;
  const onDown = (e) => { if (e.target.closest?.('.fl-x')) return; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, d: null, zoom: st.zoom }; cv.style.cursor = 'grabbing'; };
  const onMove = (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (drag.d == null) { drag.d = d; drag.zoom = st.zoom; } st.zoom = Math.max(0.4, Math.min(8, (drag.zoom * d) / drag.d)); return; }
    if (drag && drag.d == null) { st.yaw = drag.yaw + (e.clientX - drag.x) * 0.006; st.pitch = Math.max(-1.55, Math.min(1.55, drag.pitch + (e.clientY - drag.y) * 0.006)); }
  };
  const onUp = (e) => { pts.delete(e.pointerId); if (!pts.size) { drag = null; cv.style.cursor = 'grab'; } };
  const onWheel = (e) => { e.preventDefault(); st.zoom = Math.max(0.4, Math.min(8, st.zoom * Math.exp(-e.deltaY * 0.0012))); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); e.stopPropagation(); e.preventDefault(); }
    if (e.code === 'Space' && !e.target.closest?.('input')) { e.preventDefault(); e.stopPropagation(); st.play = !st.play; renderSide(); }
  };

  const build = () => {
    style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    wrap = document.createElement('div'); wrap.className = 'fl-wrap';
    wrap.innerHTML = '<div class="fl-cv"><canvas></canvas><div class="fl-hud"></div><button class="fl-x" title="back to the sky (Esc)">✕</button></div><div class="fl-side"></div>';
    cv = wrap.querySelector('.fl-cv'); canvas = cv.querySelector('canvas'); g = canvas.getContext('2d'); hud = wrap.querySelector('.fl-hud'); side = wrap.querySelector('.fl-side');
    side.addEventListener('click', onClick); side.addEventListener('input', onInput); cv.querySelector('.fl-x').addEventListener('click', () => close());
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
  };
  const open = () => {
    if (!wrap) build();
    document.body.appendChild(wrap); st.open = true; st.last = 0;
    window.addEventListener('keydown', onKey, true);
    renderSide();
    load().then(() => { if (st.open) renderSide(); }).catch((e) => { side.innerHTML = `<p>Couldn't load the flow map (${String(e)}).</p><button class="fl-btn" data-fl="close">Close</button>`; });
    cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(loop);
  };
  const close = () => { st.open = false; st.play = false; cancelAnimationFrame(st.raf); window.removeEventListener('keydown', onKey, true); wrap?.remove(); };
  return { open, close, get isOpen() { return st.open; }, state: st, dispose() { close(); style?.remove(); wrap = null; } };
}
