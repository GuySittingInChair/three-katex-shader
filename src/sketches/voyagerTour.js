import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// The Grand Tour. Voyager 1 and 2 and the planets where JPL Horizons says they were, every two days from August
// 1977. Each flyby is slowed down. Then the craft's speed against distance from the Sun, crossing the Sun's escape
// speed at Jupiter; the velocity triangle of a gravity assist (in the planet's frame the speed in equals the speed
// out — only the direction turns); and where they are today.
// tools/voyager/build_voy.py makes the data and every derived number.

const DATA_URL = '/data/voyager/';
const FB = [['-32', 'Jupiter'], ['-32', 'Neptune']];        // the velocity triangles shown
const PHASES = [['tour', 30], ['speed', 13], ['assist', FB.length * 9], ['now', 14]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const TOUR_END = 4440;                                       // days after 1977-08-21: October 1989
const COL = { v1: 0xff9a3c, v2: 0x5fd4ff, earth: 0x6fa8ff, sun: 0xffe08a };
const PLANETS = [[2, 'Earth', 0x6fa8ff, 0.7], [3, 'Jupiter', 0xe8c39e, 1.4], [4, 'Saturn', 0xf0dca0, 1.25], [5, 'Uranus', 0x9fe8e8, 1.05], [6, 'Neptune', 0x6f8fff, 1.05]];
const LIVE = { d: null, day: 0 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (day) => { const t = new Date(Date.UTC(1977, 7, 21) + day * 86400000); return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };

export default {
  name: 'The Grand Tour',
  description:
    'Voyager 1 and 2 from launch in 1977 past Jupiter, Saturn, Uranus and Neptune, on the trajectories JPL reconstructed from tracking. ' +
    'Each planet flung them faster, past the speed needed to leave the Sun for good; in the planet\'s own frame the speed in equals ' +
    'the speed out, only the direction turns. Then where they are today, almost a light-day out. Data: JPL Horizons (NASA/JPL-Caltech).',
  tags: ['voyager', 'gravity assist', 'spacecraft', 'solar system', 'real data', 'jpl horizons', 'orbits'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        if (phase === 'assist') { const x = (T - acc) / 9, k = Math.floor(x); return { T, phase, u, len, k, v: x - k }; }
        return { T, phase, u, len };
      }
      acc += len;
    }
    return { T, phase: 'tour', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading the Voyager trajectories…}';
    const M = d.meta;
    if (m.phase === 'tour') {
      const fb = M.flybys.filter((f) => Math.abs(f.day - LIVE.day) < 70)[0];
      const l3 = fb ? `&\\text{${fb.craft === '-31' ? 'Voyager 1' : 'Voyager 2'} at ${fb.planet}: } ${hl(fb.rmin / 1000, 0)}{,}000\\ \\text{km}` : '&\\text{each flyby slowed down}';
      return `\\begin{aligned}&\\text{${dateOf(LIVE.day)}} \\\\ &{\\color{#ff9a3c}\\text{Voyager 1}}\\ ${hl(LIVE.r1, 1)}\\ \\text{AU},\\ {\\color{#5fd4ff}\\text{Voyager 2}}\\ ${hl(LIVE.r2, 1)}\\ \\text{AU} \\\\ ${l3} \\\\ &\\text{positions: JPL Horizons, every 2 days}\\end{aligned}`;
    }
    if (m.phase === 'speed') {
      const j1 = M.flybys.find((f) => f.craft === '-32' && f.planet === 'Jupiter');
      return `\\begin{aligned}&\\text{speed against distance from the Sun} \\\\ &\\text{dashed: escape speed } v_{\\rm esc} = \\sqrt{2GM_\\odot/r} \\\\ &\\text{Voyager 2 at Jupiter: } ${hl(j1.vBefore, 1)} \\to ${hl(j1.vAfter, 1)}\\ \\text{km/s} \\\\ &\\text{past the } ${j1.vesc.toFixed(1)}\\ \\text{needed: it will never come back}\\end{aligned}`;
    }
    if (m.phase === 'assist') {
      const [c, p] = FB[m.k], f = M.flybys.find((x) => x.craft === c && x.planet === p);
      const sign = f.vAfter > f.vBefore ? '' : ' \\\\ &\\text{slower: bent south, to pass Triton}';
      return `\\begin{aligned}&\\text{Voyager 2 at ${p}, ${f.date}} \\\\ &\\text{${p}'s frame: } {\\color{#ffd166}v_\\infty}\\ ${hl(f.vinfIn, 2)}\\ \\text{in},\\ ${hl(f.vinfOut, 2)}\\ \\text{out, turned } ${hl(f.turn, 0)}^\\circ \\\\ &\\text{Sun's frame: } v = {\\color{#9aa3b5}V_{\\rm planet}} + {\\color{#ffd166}v_\\infty} \\\\ &${hl(f.vBefore, 1)} \\to ${hl(f.vAfter, 1)}\\ \\text{km/s}${sign}\\end{aligned}`;
    }
    const n = M.now, h = M.heliopause;
    return `\\begin{aligned}&\\text{10 Nov 2026: } {\\color{#ff9a3c}\\text{V1}}\\ ${hl(n.r1, 1)}\\ \\text{AU},\\ {\\color{#5fd4ff}\\text{V2}}\\ ${hl(n.r2, 1)}\\ \\text{AU from the Sun} \\\\ &\\text{light from V1 takes } ${hl(n.light1, 1)}\\ \\text{hours} \\\\ &\\text{left the Sun's wind (heliopause): } \\\\ &${h.v1.date.slice(0, 4)}\\ \\text{at } ${h.v1.r.toFixed(1)},\\ ${h.v2.date.slice(0, 4)}\\ \\text{at } ${h.v2.r.toFixed(1)}\\ \\text{AU}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.01; cam.far = 4000; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x010103);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 12000, width: 1.4 });
    ctx.scene.add(lines.object);
    const dots = createDots({ maxPoints: 32 });
    ctx.scene.add(dots.object);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x010103, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 8;
    cam.add(card);
    const hud = createFatLines({ maxSegments: 9000, width: 1.5, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);
    Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'voy.bin').then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
      if (s.disposed) return;
      const f = new Float32Array(buf);
      for (const fb of meta.flybys) fb.day = fb.jd - meta.jd0;
      // tour clock: slower around each flyby
      const rate = (day) => 1 - 0.85 * Math.max(...meta.flybys.map((fb) => Math.exp(-(((day - fb.day) / 45) ** 2))));
      const cum = new Float32Array(TOUR_END + 1);
      for (let i = 1; i <= TOUR_END; i++) cum[i] = cum[i - 1] + rate(i);
      s.cum = cum; s.f = f; s.meta = meta;
      LIVE.d = { meta }; s.ready = true;
    }).catch((err) => console.error('voyager data', err));
    return { s, lines, dots, card, hud, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), tgt: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, lines, dots, card, hud, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); hud.setResolution(width, height);
    lines.reset(); hud.reset(); dots.reset();
    dots.setCamera(cam, height);
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), halfW = aspect * th;
    if (!s.ready) { lines.commit(); hud.commit(); dots.commit(); return; }
    const M = s.meta, f = s.f, S = M.stride, N = M.n, step = M.step;
    const local = m.u * m.len;

    // ---------- the clock ----------
    let day;
    if (m.phase === 'tour') {
      const target = smooth(Math.min(1, local / (m.len - 1.5))) * s.cum[TOUR_END];
      let lo = 0, hi = TOUR_END;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.cum[mid] < target) lo = mid; else hi = mid; }
      day = lo;
    } else if (m.phase === 'speed') day = TOUR_END;
    else if (m.phase === 'assist') {
      const fb = M.flybys.find((x) => x.craft === FB[m.k][0] && x.planet === FB[m.k][1]);
      day = fb.day - 40 + 80 * smooth(Math.min(1, m.v * 1.3));
    } else day = TOUR_END + (M.now.day - TOUR_END) * smooth(Math.min(1, local / 8));
    const iNow = Math.min(N - 1, Math.max(0, day / step));
    const i0 = Math.floor(iNow), fr = iNow - i0, i1 = Math.min(N - 1, i0 + 1);
    // ecliptic x, y, z (AU) → scene x, z up → y, y → −z
    const P = (i, j, out) => out.set(f[i * S + j * 3], f[i * S + j * 3 + 2], -f[i * S + j * 3 + 1]);
    const at = (j, out) => { P(i0, j, out); P(i1, j, w); return out.lerp(w, fr); };
    const r1 = at(0, v).length(), r2 = at(1, v).length();
    LIVE.day = day; LIVE.r1 = r1; LIVE.r2 = r2;

    // ---------- camera ----------
    let R, el = THREE.MathUtils.degToRad(portrait ? 58 : 52), az = -0.6 + ctx.time * 0.02;
    state.tgt.set(0, 0, 0);
    if (m.phase === 'tour') R = Math.max(6, 1.25 * Math.max(r1, r2));
    else if (m.phase === 'speed') R = 1.25 * 32;
    else if (m.phase === 'assist') R = 1.25 * 32;
    else R = Math.max(1.25 * 32, 1.15 * Math.max(r1, r2));
    if (m.phase === 'now' && local > m.len - 1.2) R *= 1 - 0.8 * smooth((local - m.len + 1.2) / 1.2);
    const dist = R / (portrait ? halfW : th);
    cam.position.set(state.tgt.x + Math.sin(az) * Math.cos(el) * dist, state.tgt.y + Math.sin(el) * dist, state.tgt.z + Math.cos(az) * Math.cos(el) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(state.tgt);
    // keep the system clear of the equations: shift the view down a little
    v.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.position.addScaledVector(v, (portrait ? 0.18 : 0.08) * th * dist);
    const px = dist * th / (height / 2);     // world units per pixel at the target

    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    // ---------- orbits (the planets' own tracks), trails ----------
    const dim = m.phase === 'speed' || m.phase === 'assist' ? 0.3 : 1;
    const track = (j, from, to, every, hex, k) => {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      let prev = null;
      for (let i = from; i <= to; i += every) {
        P(Math.min(i, N - 1), j, b);
        if (prev) lines.push(a.copy(prev), b, col(hex, k));
        prev = (prev || new THREE.Vector3()).copy(b);
      }
    };
    for (const [j, , hex] of PLANETS) {
      const per = { 2: 365, 3: 4333, 4: 10759, 5: 30687, 6: 60190 }[j];
      track(j, 0, Math.min(N - 1, Math.ceil(per / step)), j === 2 ? 2 : 6, hex, 0.22 * dim);
    }
    const every = R > 60 ? 12 : R > 15 ? 4 : 1;
    for (const [j, hex] of [[0, COL.v1], [1, COL.v2]]) {
      track(j, 0, i0, every, hex, 0.95 * dim);
      P(i0, j, v); lines.push(v, at(j, new THREE.Vector3()), col(hex, 0.95 * dim));
    }
    // heliopause crossings, during 'now'
    if (m.phase === 'now') {
      for (const [key, j, hex] of [['v1', 0, COL.v1], ['v2', 1, COL.v2]]) {
        const hp = M.heliopause[key];
        if (day < hp.day) continue;
        P(Math.round(hp.day / step), j, v);
        dots.push(v, col(0xffffff, 0.9), 2.2 * px * 3);
      }
      // a ring at 120 AU in the ecliptic, roughly where the Sun's wind ends
      for (let q = 0; q < 160; q++) {
        const a0 = (q / 160) * Math.PI * 2, a1 = ((q + 1) / 160) * Math.PI * 2;
        if (q % 2) continue;
        v.set(Math.cos(a0) * 120, 0, Math.sin(a0) * 120); w.set(Math.cos(a1) * 120, 0, Math.sin(a1) * 120);
        lines.push(v, w, col(0x8a93a6, 0.35 * smooth(Math.min(1, local / 3))));
      }
    }
    // ---------- bodies ----------
    dots.push(v.set(0, 0, 0), col(COL.sun, 1), Math.max(0.05, 7 * px));
    for (const [j, , hex, sz] of PLANETS) dots.push(at(j, v), col(hex, 1), 4.5 * sz * px);
    dots.push(at(0, v), col(COL.v1, 1.1), 3.5 * px);
    dots.push(at(1, v), col(COL.v2, 1.1), 3.5 * px);
    // a ring flashes round a planet at each flyby
    if (m.phase === 'tour') for (const fb of M.flybys) {
      const dd = day - fb.day;
      if (dd < 0 || dd > 90) continue;
      const pj = PLANETS.find((p) => p[1] === fb.planet);
      at(pj[0], state.tgt);
      const rr = (8 + dd * 0.4) * px, k = 1 - dd / 90;
      for (let q = 0; q < 48; q++) {
        const a0 = (q / 48) * Math.PI * 2, a1 = ((q + 1) / 48) * Math.PI * 2;
        v.set(state.tgt.x + Math.cos(a0) * rr, state.tgt.y, state.tgt.z + Math.sin(a0) * rr);
        w.set(state.tgt.x + Math.cos(a1) * rr, state.tgt.y, state.tgt.z + Math.sin(a1) * rr);
        lines.push(v, w, col(fb.craft === '-31' ? COL.v1 : COL.v2, 0.8 * k));
      }
    }

    // ---------- HUD: speed chart and velocity triangles ----------
    const Z = -1;
    const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };
    const K = (m.phase === 'speed' || m.phase === 'assist')
      ? (m.phase === 'assist' ? smooth(Math.min(1, m.v * 9 / 0.6)) * (1 - smooth(Math.max(0, (m.v * 9 - 8.5) / 0.5)))
        : smooth(Math.min(1, local / 0.8)) * (1 - smooth(Math.max(0, (local - m.len + 0.6) / 0.6)))) : 0;
    const GREY = 0x8a93a6;
    if (m.phase === 'speed' && K > 0.01) {
      const gw = portrait ? 1.8 * halfW : Math.min(1.5 * halfW, 1.9 * th), gh = portrait ? 0.95 * th : 1.0 * th;
      const gx = portrait ? -gw / 2 : -gw / 2 - 0.15 * halfW, gy = -th + (portrait ? 0.3 : 0.27) * th;
      card.position.set(gx + gw / 2, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.12 * th, gh + 0.12 * th, 1);
      card.material.opacity = 0.82 * K;
      const L0 = 0, L1 = Math.log10(200), V1 = 45;
      const X = (r) => gx + ((Math.log10(Math.max(r, 1)) - L0) / (L1 - L0)) * gw, Y = (s2) => gy + Math.min(1, s2 / V1) * gh;
      seg(gx, gy, gx + gw, gy, GREY, 0.7 * K); seg(gx, gy, gx, gy + gh, GREY, 0.7 * K);
      for (const r of [1, 2, 5, 10, 20, 50, 100, 200]) seg(X(r), gy, X(r), gy - (r === 1 || r === 10 || r === 100 ? 0.035 : 0.02) * th, GREY, 0.6 * K);
      for (let s2 = 10; s2 < V1; s2 += 10) seg(gx, Y(s2), gx - 0.02 * th, Y(s2), GREY, 0.5 * K);
      // escape speed
      let prev = null;
      for (let q = 0; q <= 80; q++) {
        const r = 10 ** (L0 + (q / 80) * (L1 - L0)), ve = 42.12 / Math.sqrt(r), pt = [X(r), Y(ve)];
        if (prev && q % 2) seg(prev[0], prev[1], pt[0], pt[1], 0xffffff, 0.55 * K);
        prev = pt;
      }
      const draw = Math.min(1, local / 6) * (M.now.day / step);
      for (const [j, hex] of [[0, COL.v1], [1, COL.v2]]) {
        let p0 = null;
        for (let i = 0; i < draw; i += 1) {
          const r = Math.hypot(f[i * S + j * 3], f[i * S + j * 3 + 1], f[i * S + j * 3 + 2]), sp = f[i * S + 21 + j];
          if (sp <= 0) continue;
          if (r > 40 && i % 10) continue;
          const pt = [X(r), Y(sp)];
          if (p0) seg(p0[0], p0[1], pt[0], pt[1], hex, 0.95 * K);
          p0 = pt;
        }
      }
    } else if (m.phase === 'assist' && K > 0.01) {
      const [cr, pn] = FB[m.k], fb = M.flybys.find((x) => x.craft === cr && x.planet === pn);
      const box = portrait ? 1.25 * halfW : 1.0 * th;
      const cx = portrait ? -0.45 * halfW : -0.62 * halfW, cy = portrait ? -0.25 * th : -0.18 * th;
      card.position.set(cx + 0.45 * box, cy, Z - 0.002); card.scale.set(1.3 * box, 1.35 * box, 1);
      card.material.opacity = 0.8 * K;
      // ecliptic vectors (km/s): rotate so the planet's velocity points right
      const vp = fb.vp_in.map((x, i) => (x + fb.vp_out[i]) / 2);
      const ang = Math.atan2(vp[1], vp[0]);
      const rot = (a) => [a[0] * Math.cos(-ang) - a[1] * Math.sin(-ang), a[0] * Math.sin(-ang) + a[1] * Math.cos(-ang)];
      const sc = box / 30;
      const Vp = rot(vp), vin = rot(fb.vc_in), vout = rot(fb.vc_out);
      const ui = [vin[0] - Vp[0], vin[1] - Vp[1]], uo = [vout[0] - Vp[0], vout[1] - Vp[1]];
      // v∞ swings from in to out as the flyby runs
      const sw = smooth(Math.min(1, Math.max(0, (m.v * 9 - 2.5) / 3)));
      const ai = Math.atan2(ui[1], ui[0]), ao = Math.atan2(uo[1], uo[0]);
      let da = ao - ai; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const mag = Math.hypot(...ui) * (1 - sw) + Math.hypot(...uo) * sw, a = ai + da * sw;
      const u = [Math.cos(a) * mag, Math.sin(a) * mag];
      const ox = cx, oy = cy;
      const arrow = (x0, y0, x1, y1, hex, k) => {
        seg(x0, y0, x1, y1, hex, k);
        const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-6) return;
        const dx = (x1 - x0) / L, dy = (y1 - y0) / L, hd = 0.035 * th;
        seg(x1, y1, x1 - hd * (dx * 0.9 - dy * 0.45), y1 - hd * (dy * 0.9 + dx * 0.45), hex, k);
        seg(x1, y1, x1 - hd * (dx * 0.9 + dy * 0.45), y1 - hd * (dy * 0.9 - dx * 0.45), hex, k);
      };
      const tipP = [ox + Vp[0] * sc, oy + Vp[1] * sc];
      arrow(ox, oy, tipP[0], tipP[1], 0x9aa3b5, K);
      // the circle v∞ can point anywhere on: same length in and out
      for (let q = 0; q < 64; q += 2) {
        const r0 = Math.hypot(...ui) * sc, a0 = (q / 64) * Math.PI * 2, a1 = ((q + 1) / 64) * Math.PI * 2;
        seg(tipP[0] + Math.cos(a0) * r0, tipP[1] + Math.sin(a0) * r0, tipP[0] + Math.cos(a1) * r0, tipP[1] + Math.sin(a1) * r0, 0xffd166, 0.3 * K);
      }
      arrow(tipP[0], tipP[1], tipP[0] + u[0] * sc, tipP[1] + u[1] * sc, 0xffd166, K);
      // the craft's speed around the Sun: before (faint), now
      arrow(ox, oy, ox + vin[0] * sc, oy + vin[1] * sc, COL.v2, 0.35 * K);
      arrow(ox, oy, tipP[0] + u[0] * sc, tipP[1] + u[1] * sc, COL.v2, K);
      // circle of radius = speed before, so the gain or loss shows
      const rb = Math.hypot(...vin) * sc, ab = Math.atan2(vin[1], vin[0]);
      for (let q = 0; q < 40; q += 2) {
        const a0 = ab - 0.8 + (q / 40) * 1.6, a1 = ab - 0.8 + ((q + 1) / 40) * 1.6;
        seg(ox + Math.cos(a0) * rb, oy + Math.sin(a0) * rb, ox + Math.cos(a1) * rb, oy + Math.sin(a1) * rb, COL.v2, 0.3 * K);
      }
    } else card.material.opacity = 0;
    lines.commit(); hud.commit(); dots.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.card); ctx.camera.remove(state.hud.object);
    state.lines.dispose(); state.hud.dispose(); state.dots.dispose?.();
    state.card.geometry.dispose(); state.card.material.dispose();
    LIVE.d = null;
  },
};
