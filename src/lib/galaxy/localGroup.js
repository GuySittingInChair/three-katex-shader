// The Local Group, past and future: the Milky Way, Andromeda (M31), Triangulum (M33) and the Large Magellanic Cloud,
// moved from their measured 3D motions (Hubble, Gaia and radio proper motions), 1000 times within the measurement
// errors for each of two published mass scenarios. Data: tools/motion/build_lg.py → /data/motion/lg.json.
// Drawn on its own 2D canvas over the page: drag to turn, wheel/pinch to zoom.
import { badge } from './provenance.js';

const BODY = [
  { name: 'Milky Way', note: 'we are here', col: '#ffe08a' },
  { name: 'Andromeda', note: 'M31', col: '#9db4ff' },
  { name: 'Triangulum', note: 'M33', col: '#7dffc0' },
  { name: 'Large Magellanic Cloud', note: 'LMC', col: '#ff9fd0' },
];
const KPC_LY = 3261.56;
const css = `
.lg-wrap{position:fixed;inset:0;z-index:40;background:#020306;display:flex;color:#e9edf5;font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.lg-wrap *{box-sizing:border-box}
.lg-cv{flex:1;min-width:0;position:relative;touch-action:none;cursor:grab}
.lg-cv canvas{position:absolute;inset:0;width:100%;height:100%}
.lg-side{width:min(400px,40vw);overflow:auto;padding:14px 16px 18px;background:rgba(12,13,18,.95);border-left:1px solid rgba(255,255,255,.12)}
.lg-side h2{margin:0 0 2px;font:600 21px/1.2 Georgia,serif}
.lg-side h2 small{display:block;font:13px system-ui;color:#9aa3b5;margin-top:3px}
.lg-side p{margin:0 0 9px;font-size:13.5px}
.lg-n{color:#8a93a6;font-size:12px}
.lg-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.lg-btn{background:rgba(255,255,255,.07);color:#e9edf5;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;font-size:13px}
.lg-btn.on{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5)}
.lg-time{font:600 20px/1.2 Georgia,serif;margin:6px 0 2px}
.lg-slider{width:100%}
.lg-box{background:rgba(255,255,255,.05);border-radius:10px;padding:9px 11px;margin:10px 0;font-size:13px}
.lg-box ul{margin:4px 0 0;padding-left:18px}.lg-box li{margin:3px 0}
.lg-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.lg-x{position:absolute;right:10px;top:10px;z-index:2;width:38px;height:38px;border-radius:50%;background:rgba(12,13,18,.85);color:#e9edf5;border:1px solid rgba(255,255,255,.25);font-size:18px;cursor:pointer}
.lg-hud{position:absolute;left:12px;top:10px;right:58px;font-size:12.5px;color:#b9c1d0;pointer-events:none;text-shadow:0 1px 3px #000}
.gx-badge{display:inline-block;font-size:11px;line-height:1.4;padding:0 7px;border:1px solid;border-radius:99px;margin-left:6px;vertical-align:1px;white-space:nowrap}
@media (max-width:700px){.lg-wrap{flex-direction:column}.lg-cv{flex:none;height:46vh}.lg-hud{font-size:11.5px}.lg-side{width:auto;flex:1;border-left:0;border-top:1px solid rgba(255,255,255,.12)}}
`;
const yrs = (myr) => {
  const a = Math.abs(myr);
  if (a < 25) return 'now';
  const s = a >= 1000 ? `${(a / 1000).toFixed(2)} billion years` : `${Math.round(a)} million years`;
  return myr > 0 ? `${s} from now` : `${s} ago`;
};
const ly = (kpc) => (kpc * KPC_LY >= 1e6 ? `${(kpc * KPC_LY / 1e6).toFixed(2)} million light-years` : `${Math.round(kpc * KPC_LY / 1000) * 1000 >= 1000 ? Math.round(kpc * KPC_LY / 1000).toLocaleString('en-US') + ',000' : Math.round(kpc * KPC_LY)} light-years`);

export function createLocalGroupView({ url }) {
  const st = { open: false, data: null, sc: 0, t: 0, play: false, speed: 400, yaw: 0, pitch: 0, zoom: 1, last: 0, raf: 0 };
  let wrap, cv, canvas, ctx2, side, hud, style;

  const load = () => st.data ? Promise.resolve(st.data) : fetch(url).then((r) => r.json()).then((d) => { st.data = d; return d; });

  // position of body b in draw k at time t (kpc), in the frame of that draw's centre of mass, then the view basis
  const at = (k, b, t, out) => {
    const S = st.data.scenarios[st.sc], T = S.t, n = T.length;
    const f = Math.max(0, Math.min(n - 1.0001, (t - T[0]) / (T[1] - T[0]))), i = Math.floor(f), w = f - i;
    const O = S.orbits[k];
    const M = S.masses, Mt = M.reduce((a, c) => a + c, 0);
    let cx = 0, cy = 0, cz = 0;
    for (let q = 0; q < 4; q++) {
      const p0 = O[q][i], p1 = O[q][i + 1];
      cx += M[q] * (p0[0] + (p1[0] - p0[0]) * w); cy += M[q] * (p0[1] + (p1[1] - p0[1]) * w); cz += M[q] * (p0[2] + (p1[2] - p0[2]) * w);
    }
    const p0 = O[b][i], p1 = O[b][i + 1];
    const x = (p0[0] + (p1[0] - p0[0]) * w - cx / Mt) / 10, y = (p0[1] + (p1[1] - p0[1]) * w - cy / Mt) / 10, z = (p0[2] + (p1[2] - p0[2]) * w - cz / Mt) / 10;
    const B = S.viewBasis;
    const u = x * B[0][0] + y * B[0][1] + z * B[0][2], v = x * B[1][0] + y * B[1][1] + z * B[1][2], nn = x * B[2][0] + y * B[2][1] + z * B[2][2];
    // turn the view: yaw about the screen's vertical, then pitch about its horizontal
    const cyw = Math.cos(st.yaw), syw = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const x1 = u * cyw + nn * syw, z1 = -u * syw + nn * cyw;
    out[0] = x1; out[1] = v * cp - z1 * sp; out[2] = v * sp + z1 * cp;
    return out;
  };

  const draw = () => {
    if (!st.open || !st.data) return;
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const g = ctx2; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#020306'; g.fillRect(0, 0, W, H);
    const S = st.data.scenarios[st.sc], nd = S.orbits.length;
    const sc = (Math.min(W, H) * 0.9 / (W < 500 ? 1300 : 1000)) * st.zoom, cx = W / 2, cy = H / 2;    // 1000 kpc across the short side
    const P = [0, 0, 0];
    const X = (p) => cx + p[0] * sc, Y = (p) => cy - p[1] * sc;
    // the typical future: paths, faint for all time, brighter up to now
    const T = S.t;
    for (let b = 0; b < 4; b++) {
      g.lineWidth = 1.4;
      for (let pass = 0; pass < 2; pass++) {
        g.beginPath(); let started = false;
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          if (pass === 1 && t > st.t) break;
          at(0, b, t, P);
          if (!started) { g.moveTo(X(P), Y(P)); started = true; } else g.lineTo(X(P), Y(P));
        }
        if (pass === 1) { at(0, b, st.t, P); g.lineTo(X(P), Y(P)); }
        g.strokeStyle = BODY[b].col + (pass ? 'aa' : '22'); g.stroke();
      }
    }
    // the other draws, as a cloud: where each body might be now
    for (let k = 1; k < nd; k++) for (let b = 0; b < 4; b++) {
      at(k, b, st.t, P);
      g.fillStyle = BODY[b].col + '66'; g.beginPath(); g.arc(X(P), Y(P), 2.2, 0, 7); g.fill();
    }
    // the typical draw's bodies, with a glow sized by mass
    g.font = '12px system-ui,sans-serif'; g.textAlign = 'center';
    const placed = [];
    for (let b = 0; b < 4; b++) {
      at(0, b, st.t, P);
      const r = 3 + 5 * Math.cbrt(S.masses[b] / 1e12);
      const gr = g.createRadialGradient(X(P), Y(P), 0, X(P), Y(P), r * 3);
      gr.addColorStop(0, BODY[b].col); gr.addColorStop(0.35, BODY[b].col + '88'); gr.addColorStop(1, BODY[b].col + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(X(P), Y(P), r * 3, 0, 7); g.fill();
      // a label, unless it would land on one already drawn (when they've merged, the bigger galaxy's name stays)
      // kept inside the picture, so a name near the edge isn't cut off (phones)
      const tw = g.measureText(BODY[b].name).width / 2 + 4;
      const lx = Math.min(W - tw, Math.max(tw, X(P))), lyy = Math.max(14, Y(P) - r * 3 - 4);
      if (!placed.some(([x, y]) => Math.abs(x - lx) < 90 && Math.abs(y - lyy) < 14)) {
        g.fillStyle = '#dfe6f3'; g.shadowColor = '#000'; g.shadowBlur = 4;
        g.fillText(BODY[b].name, lx, lyy); g.shadowBlur = 0; placed.push([lx, lyy]);
      }
    }
    // scale bar: 100 kpc
    const bar = 100 * sc;
    g.strokeStyle = '#8a93a6'; g.lineWidth = 1; g.beginPath(); g.moveTo(16, H - 18); g.lineTo(16 + bar, H - 18); g.stroke();
    g.fillStyle = '#8a93a6'; g.textAlign = 'left'; g.fillText('326,000 light-years', 16, H - 24);
    // HUD: time, MW–M31 distance in the typical draw
    const a = at(0, 0, st.t, [0, 0, 0]), m = at(0, 1, st.t, [0, 0, 0]);
    const d = Math.hypot(a[0] - m[0], a[1] - m[1], a[2] - m[2]);
    hud.innerHTML = `<b style="font-size:15px">${yrs(st.t)}</b><br>Milky Way ↔ Andromeda: ${d < 30 ? 'merged into one galaxy' : ly(d)}<br><span style="color:#8a93a6">bright: one typical future · dots: ${nd - 1} others within the measurement errors</span>`;
    const sl = side.querySelector('.lg-slider'); if (sl && document.activeElement !== sl) sl.value = st.t;
    const tl = side.querySelector('.lg-time'); if (tl) tl.textContent = yrs(st.t);
  };

  const loop = (now) => {
    if (!st.open) return;
    const dt = Math.min(0.1, (now - (st.last || now)) / 1000); st.last = now;
    if (st.play) {
      const S = st.data?.scenarios[st.sc];
      if (S) { st.t += st.speed * dt; if (st.t >= S.t[S.t.length - 1]) { st.t = S.t[S.t.length - 1]; st.play = false; renderSide(); } }
    }
    draw();
    st.raf = requestAnimationFrame(loop);
  };

  const renderSide = () => {
    const D = st.data; if (!D) { side.innerHTML = '<p>Loading…</p>'; return; }
    const S = D.scenarios[st.sc], f = S.firstPeri, nw = S.now;
    const g = (x) => (x / 1000).toFixed(1);
    const m33first = S.m33PastMin.d50 >= 0.95 * S.m33NowToM31;
    const src = D.src;
    side.innerHTML = `<h2>The Local Group, past and future<small>Our galaxy and its three biggest neighbours, from their measured motions</small></h2>
      <div class="lg-time">${yrs(st.t)}</div>
      <input class="lg-slider" type="range" min="${S.t[0]}" max="${S.t[S.t.length - 1]}" step="5" value="${st.t}">
      <div class="lg-row"><button class="lg-btn" data-lg="play">${st.play ? '⏸ Pause' : '▶ Play'}</button>
        <button class="lg-btn ${st.speed === 150 ? 'on' : ''}" data-lg="speed" data-v="150">slow</button><button class="lg-btn ${st.speed === 400 ? 'on' : ''}" data-lg="speed" data-v="400">medium</button><button class="lg-btn ${st.speed === 1200 ? 'on' : ''}" data-lg="speed" data-v="1200">fast</button></div>
      <div class="lg-row"><button class="lg-btn" data-lg="jump" data-v="${S.t[0]}">6 billion years ago</button><button class="lg-btn" data-lg="jump" data-v="0">Now</button><button class="lg-btn" data-lg="jump" data-v="${Math.round(S.hit.t50)}">They collide</button><button class="lg-btn" data-lg="jump" data-v="${S.t[S.t.length - 1]}">+10 billion years</button></div>
      <div class="lg-row">${D.scenarios.map((x, i) => `<button class="lg-btn ${i === st.sc ? 'on' : ''}" data-lg="sc" data-v="${i}">${x.name}</button>`).join('')}<button class="lg-btn" data-lg="view">Face-on view</button></div>
      <p class="lg-n">Two mass scenarios, as in van der Marel et al. (2019): the Milky Way ${S.masses[0] / 1e12}, Andromeda ${S.masses[1] / 1e12} trillion Suns (Triangulum 0.25, the LMC 0.1). Nobody knows the masses better than that.</p>
      <div class="lg-box"><b>What the model says</b> ${badge('SIMULATED')}
        <ul><li>In <b>${Math.round(S.headOn * 100)}%</b> of the ${D.draws} runs Andromeda and the Milky Way <b>collide</b> on their first approach (their centres pass within 30 kpc, so the disks crash through each other), at about <b>${g(S.hit.t50)} billion years from now</b> (${g(S.hit.t16)}–${g(S.hit.t84)} in the middle two-thirds of those runs).</li>
        ${S.miss.n ? `<li>In the other ${Math.round((1 - S.headOn) * 100)}% they first miss, by about ${ly(S.miss.d50)}, and most of those are still apart 10 billion years from now.</li>` : ''}
        <li>In this simplified model a collision always ends in a merger straight away. Full simulations of their stars and dark matter usually show a first pass, a swing back out, and then the final merger; the drag here is too blunt to show the swing-out.</li>
        <li>Triangulum ${m33first ? 'has never been closer to Andromeda than it is now: it is falling in for the first time' : `came within ${Math.round(S.m33PastMin.d50)} kpc of Andromeda in the past`}.</li>
        <li>The Large Magellanic Cloud is near its closest point to the Milky Way now, and in the past 6 billion years it was never much closer (${Math.round(S.lmcPastMin.d50)} kpc): a first pass. Kallivayalil et al. (2013) rule out orbits shorter than 4 billion years.</li></ul>
        <p class="lg-n" style="margin:6px 0 0">Published comparison: van der Marel et al. (2019) found the first close pass about 4.5 billion years ahead (two galaxies alone), about a billion years later with Triangulum and the LMC included.</p></div>
      <div class="lg-box"><b>Their motions now, relative to the Milky Way's centre</b> ${badge('INFERRED')}
        <ul>${['M31', 'M33', 'LMC'].map((k, i) => `<li><span class="lg-dot" style="background:${BODY[i + 1].col}"></span><b>${BODY[i + 1].name}</b>: ${nw[k].vRad < 0 ? `approaching at ${Math.round(-nw[k].vRad)}` : `receding at ${Math.round(nw[k].vRad)}`} km/s, sideways ${Math.round(nw[k].vTan)} km/s (${Math.round(nw[k].vTan16)}–${Math.round(nw[k].vTan84)})</li>`).join('')}</ul>
        <p class="lg-n" style="margin:6px 0 0">The sideways part is the hard one: for Andromeda it's an angle of about 0.00006 arcseconds a year, measured by Gaia from thousands of its stars.</p></div>
      <div class="lg-box"><b>What it's built from</b>
        <ul><li>${badge('OBSERVED')} Andromeda's motion across the sky (${src.M31.pm[0]} ± ${src.M31.pm[1]}, ${src.M31.pm[2]} ± ${src.M31.pm[3]} μas/yr): ${src.M31.cite}. Distance ${src.M31.d[0]} kpc; speed towards us ${-src.M31.vlos[0]} km/s.</li>
        <li>${badge('OBSERVED')} Triangulum (${src.M33.pm[0]} ± ${src.M33.pm[1]}, ${src.M33.pm[2]} ± ${src.M33.pm[3]} μas/yr): ${src.M33.cite}.</li>
        <li>${badge('OBSERVED')} The LMC (${(src.LMC.pm[0] / 1000).toFixed(3)}, ${(src.LMC.pm[2] / 1000).toFixed(3)} mas/yr): ${src.LMC.cite}.</li>
        <li>${badge('INFERRED')} The Sun's own position and motion in the Galaxy (astropy's Galactocentric frame, v4.0), to turn these into motions relative to the Milky Way.</li>
        <li>${badge('INFERRED')} Masses: the two published scenarios above.</li>
        <li>${badge('SIMULATED')} ${D.draws} runs per scenario, each with motions and distances drawn within the measurement errors; gravity between the four, plus dynamical friction (the drag that makes galaxies sink together), in 1-million-year steps.</li></ul></div>
      <div class="lg-box" style="border:1px solid #ffd27a44;background:#ffd27a10"><b style="color:#ffd27a">What it leaves out</b>
        <ul><li>Each galaxy's dark-matter halo is a fixed, round ball that never gets stretched or stripped; real halos deform as they meet, which changes when they merge. Treat the merger timing as rough.</li>
        <li>The Small Magellanic Cloud, M32, and dozens of small galaxies are left out (they ride along with the big ones).</li>
        <li>Running time backwards makes the past less certain than the next few billion years.</li>
        <li>The dots show measurement uncertainty only; the masses are a bigger unknown, which is why there are two scenarios.</li></ul></div>
      <p class="lg-n">Drag to turn the view, scroll or pinch to zoom. The view starts face-on to the plane Andromeda's orbit lies in.</p>
      <div class="lg-row"><span style="flex:1"></span><button class="lg-btn" data-lg="close">✕ Back to the sky</button></div>`;
  };

  const onClick = (e) => {
    const b = e.target.closest('[data-lg]'); if (!b) return;
    const a = b.dataset.lg, v = +b.dataset.v;
    if (a === 'play') { if (!st.play && st.t >= st.data.scenarios[st.sc].t.at(-1) - 1) st.t = st.data.scenarios[st.sc].t[0]; st.play = !st.play; }
    else if (a === 'speed') st.speed = v;
    else if (a === 'jump') { st.t = v; st.play = false; }
    else if (a === 'sc') st.sc = v;
    else if (a === 'view') { st.yaw = 0; st.pitch = 0; st.zoom = 1; }
    else if (a === 'close') { close(); return; }
    renderSide();
  };
  const onInput = (e) => { if (e.target.classList.contains('lg-slider')) { st.t = +e.target.value; st.play = false; const tl = side.querySelector('.lg-time'); if (tl) tl.textContent = yrs(st.t); } };
  let drag = null; const pts = new Map();
  const onDown = (e) => {
    if (e.target.closest?.('.lg-x')) return; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, d: null, zoom: st.zoom }; cv.style.cursor = 'grabbing'; };
  const onMove = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (drag.d == null) { drag.d = d; drag.zoom = st.zoom; } else st.zoom = Math.max(0.3, Math.min(12, drag.zoom * d / drag.d));
      return;
    }
    if (drag) { st.yaw = drag.yaw + (e.clientX - drag.x) * 0.008; st.pitch = Math.max(-1.55, Math.min(1.55, drag.pitch + (e.clientY - drag.y) * 0.008)); }
  };
  const onUp = (e) => { pts.delete(e.pointerId); if (!pts.size) { drag = null; cv.style.cursor = ''; } };
  const onWheel = (e) => { e.preventDefault(); st.zoom = Math.max(0.3, Math.min(12, st.zoom * Math.exp(-e.deltaY * 0.0012))); };
  const onKey = (e) => {
    if (!st.open) return;
    if (e.key === 'Escape') { close(); e.stopPropagation(); e.preventDefault(); }
    if (e.code === 'Space' && !e.target.closest?.('input')) { e.preventDefault(); e.stopPropagation(); st.play = !st.play; renderSide(); }
  };

  const build = () => {
    style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    wrap = document.createElement('div'); wrap.className = 'lg-wrap';
    wrap.innerHTML = '<div class="lg-cv"><canvas></canvas><div class="lg-hud"></div><button class="lg-x" data-lg="close" title="back to the sky (Esc)">✕</button></div><div class="lg-side"></div>';
    cv = wrap.querySelector('.lg-cv'); canvas = cv.querySelector('canvas'); ctx2 = canvas.getContext('2d'); hud = wrap.querySelector('.lg-hud'); side = wrap.querySelector('.lg-side');
    side.addEventListener('click', onClick); cv.querySelector('.lg-x').addEventListener('click', () => close()); side.addEventListener('input', onInput);
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
  };
  const open = () => {
    if (!wrap) build();
    document.body.appendChild(wrap); st.open = true; st.last = 0;
    window.addEventListener('keydown', onKey, true);
    renderSide();
    load().then(() => { if (st.open) { renderSide(); } }).catch((e) => { side.innerHTML = `<p>Couldn't load the Local Group model (${String(e)}).</p><button class="lg-btn" data-lg="close">Close</button>`; });
    cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(loop);
  };
  const close = () => {
    st.open = false; st.play = false; cancelAnimationFrame(st.raf);
    window.removeEventListener('keydown', onKey, true);
    wrap?.remove();
  };
  return {
    open, close, get isOpen() { return st.open; }, state: st,
    dispose() { close(); style?.remove(); wrap = null; },
  };
}
