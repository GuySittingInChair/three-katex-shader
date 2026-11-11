import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Six Planets in a Star's Flicker. Kepler-11, a Sun-like star 2000 light-years away, watched by the
// Kepler space telescope every 30 minutes for four years (17 quarters, public light curves from MAST).
// Its planets are found here from scratch:
//   raw      the brightness as recorded: jumps between quarters, slow drifts
//   flat     each quarter normalised and slow wiggles divided out (a 1.5-day running median)
//   search   box least squares: for every trial period, fold the light curve and look for a box-shaped
//            dip; the strongest one is a planet. Mask its transits and search again, until nothing is left
//   system   the orbits measured, and the real light curve playing underneath: every dip lands when a
//            measured orbit puts a planet in front of the star
// tools/kepler/build_kep.py runs the search and makes every number shown.

const DATA_URL = '/data/kepler/';
const SEARCH_LEN = 5;
const AU = 9;                       // scene units per AU
const STAR_X = 6, PLANET_X = 45;    // the star drawn 6× and the planets 45× their sizes (to scale, both vanish)
const RSUN_AU = 0.00465047, REARTH_AU = 4.26352e-5;
const COLS = [0x7fd4ff, 0xffd166, 0xff8fa3, 0x9be564, 0xc9a7ff, 0xffb36b, 0xd8dee9];
const LIVE = { d: null };

const STAR_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vView;
  void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vN; varying vec3 vView;
  void main() { float mu = clamp(dot(vN, vView), 0.0, 1.0); float l = 1.0 - 0.6 * (1.0 - mu); gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * l * 1.3, 1.0); }`;
const HALO_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() { float r = length(vUv - 0.5) * 2.0; float a = 0.5 / (1.0 + 60.0 * r * r) * smoothstep(1.0, 0.3, r); gl_FragColor = vec4(vec3(1.0, 0.75, 0.45) * a, 1.0); }`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

async function load() {
  const [meta, buf] = await Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'lc.bin').then((r) => r.arrayBuffer())]);
  const dv = new DataView(buf), n = meta.n, B = meta.recordBytes;
  const t = new Float32Array(n), f = new Float32Array(n), raw = new Float32Array(n), q = new Uint8Array(n);
  for (let i = 0; i < n; i++) { t[i] = dv.getFloat32(i * B, true); f[i] = dv.getInt16(i * B + 4, true); raw[i] = dv.getInt16(i * B + 6, true) * meta.rawScale; q[i] = dv.getUint8(i * B + 8); }
  // planets in the order the search found them, and sorted by period for drawing
  const found = [...meta.planets].sort((a, b) => a.found - b.found);
  // the raw record's range, for its graph
  const sr = [...raw].sort((x, y) => x - y);
  const rawLo = sr[Math.floor(n * 0.001)], rawHi = sr[Math.floor(n * 0.999)];
  return { meta, n, t, f, raw, q, found, rawLo, rawHi };
}

// which planet (if any) is crossing the star at time tt, by the measured ephemeris
const inTransit = (pl, tt) => { const ph = ((tt - pl.t0 + 0.5 * pl.P) % pl.P + pl.P) % pl.P - 0.5 * pl.P; return Math.abs(ph) < pl.dur / 2; };

export default {
  name: "Six Planets in a Star's Flicker",
  description:
    'Four years of the Kepler space telescope watching one Sun-like star, Kepler-11, and its six planets found ' +
    'from scratch in the real light curve: flatten it, search every period for a repeating dip, take the ' +
    'strongest, mask it, search again. Each dip gives a size, each period a distance; then the measured orbits ' +
    'play over the real data, every dip on cue. Data: NASA Kepler mission via MAST (STScI).',
  tags: ['exoplanets', 'kepler', 'transits', 'box least squares', 'light curve', 'real data', 'planet search'],
  category: 'Astronomy',
  mode: '3d',

  motion(t, params) {
    const nS = LIVE.d ? LIVE.d.found.length : 6;
    const PH = [['raw', 7], ['flat', 7], ['search', nS * SEARCH_LEN], ['system', 16]];
    const LOOP = PH.reduce((s, p) => s + p[1], 0);
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PH) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        if (phase === 'search') { const k = Math.min(nS - 1, Math.floor((T - acc) / SEARCH_LEN)); return { T, phase, u, len, k, v: ((T - acc) - k * SEARCH_LEN) / SEARCH_LEN }; }
        return { T, phase, u, len, k: nS, v: 0 };
      }
      acc += len;
    }
    return { T, phase: 'raw', u: 0, len: 7, k: 0, v: 0 };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading four years of Kepler data…}';
    const M = d.meta;
    if (m.phase === 'raw')
      return `\\begin{aligned}&\\text{Kepler-11: one star, every 30 minutes, ${(M.t1 - M.t0) / 365.25 < 4.05 ? 'four' : ''} years} \\\\ &${hl(M.n, 0)}\\ \\text{good measurements in 17 quarters} \\\\ &\\text{the spacecraft rolled every quarter, so each} \\\\ &\\text{quarter lands on a different patch of chip}\\end{aligned}`;
    if (m.phase === 'flat')
      return `\\begin{aligned}&\\hat f(t) = f(t)\\,/\\,\\mathrm{median}_{1.5\\,\\text{d}}\\, f \\\\ &\\text{scatter: } ${hl(M.scatterPpm, 0)}\\ \\text{ppm every 30 minutes} \\\\ &\\text{the dips are a few hundred ppm: hidden in it}\\end{aligned}`;
    if (m.phase === 'search') {
      const p = d.found[m.k];
      const reveal = m.v > 0.35;
      return `\\begin{aligned}&\\text{search ${m.k + 1}: fold at every period } P,\\ \\text{look for a box} \\\\ &P = ${hl(p.P, 3)}\\ \\text{d},\\ \\text{depth } ${hl(p.depth, 0)}\\ \\text{ppm},\\ ${hl(p.transits, 0)}\\ \\text{transits},\\ \\text{S/N } ${hl(p.snr, 0)} \\\\ &${reveal ? `R_p = R_\\star\\sqrt{\\delta} = ${hl(p.rp, 2)}\\,R_\\oplus,\\quad a = (P^2 M_\\star)^{1/3} = ${hl(p.a, 3)}\\ \\text{AU}` : '\\phantom{x}'} \\\\ &${reveal ? `\\text{Kepler-11${p.name}; published } ${p.published.P.toFixed(2)}\\ \\text{d},\\ ${p.published.rp.toFixed(2)}\\,R_\\oplus` : '\\phantom{x}'}\\end{aligned}`;
    }
    return `\\begin{aligned}&\\text{the real light curve, day } ${hl(LIVE.day || 0, 0)}\\text{; the planets where} \\\\ &\\text{their measured orbits put them: each dip} \\\\ &\\text{is one of them in front of the star} \\\\ &\\text{star } ${STAR_X}\\times,\\ \\text{planets } ${PLANET_X}\\times\\ \\text{their true size}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 40; cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x010103);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false, planets: [] };
    const sys = new THREE.Group();
    ctx.scene.add(sys);
    const R = 1.065 * RSUN_AU * AU * STAR_X;
    const star = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG }));
    sys.add(star);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(R * 9, R * 9), new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: HALO_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sys.add(halo);
    const orbits = createFatLines({ maxSegments: 7 * 128 + 40, width: 1.2 });
    sys.add(orbits.object);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x010103, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 8;
    cam.add(card);
    const hud = createFatLines({ maxSegments: 9000, width: 1.3, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);

    load().then((d) => {
      if (s.disposed) return;
      for (const p of d.found) {
        const r = Math.max(0.035, p.rp * REARTH_AU * AU * PLANET_X);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: COLS[p.found % COLS.length] }));
        mesh.scale.setScalar(r);
        mesh.visible = false;
        sys.add(mesh);
        s.planets.push({ p, mesh, col: COLS[p.found % COLS.length] });
      }
      LIVE.d = d; s.d = d; s.ready = true;
    }).catch((err) => console.error('kepler data', err));
    return { s, sys, star, halo, orbits, card, hud, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) };
  },

  update(ctx, state) {
    const { s, sys, halo, orbits, card, hud, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    hud.setResolution(width, height); orbits.setResolution(width, height);
    hud.reset(); orbits.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), halfW = aspect * th;
    // Kepler looks along −z at the star; we watch from above and to the side, so the orbits are ellipses
    const outer = 0.47 * AU;
    const dist = portrait ? (outer * 1.12) / halfW : outer / (th * 0.8);
    const el = THREE.MathUtils.degToRad(portrait ? 24 : 20), az = 0.35 + 0.25 * Math.sin(ctx.time * 0.04);
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, 0, 0);
    // lift the system into the upper part of the view (the graph sits below)
    const lift = (portrait ? 0.3 : 0.36) * th * dist;
    v.set(0, 1, 0).applyQuaternion(cam.quaternion);   // moving the camera down raises the scene
    cam.position.addScaledVector(v, -lift);
    halo.quaternion.copy(cam.quaternion);
    if (!s.ready) { hud.commit(); orbits.commit(); return; }
    const d = s.d, M = d.meta;

    // ---------- the planets ----------
    let day = M.t0;
    if (m.phase === 'system') day = M.t0 + 30 + m.u * 140;
    LIVE.day = day - M.t0;
    s.planets.forEach((pl, j) => {
      const p = pl.p;
      const shown = m.phase === 'system' || (m.phase === 'search' && (p.found < m.k || (p.found === m.k && m.v > 0.35)));
      const grow = m.phase === 'search' && p.found === m.k ? smooth(Math.min(1, (m.v - 0.35) / 0.2)) : 1;
      pl.mesh.visible = shown;
      // orbital phase from the measured ephemeris: in front of the star (towards Kepler, +z) at mid-transit
      const tt = m.phase === 'system' ? day : M.t0 + ctx.time * 6;
      const ang = (2 * Math.PI * (tt - p.t0)) / p.P;
      const a = p.a * AU;
      pl.mesh.position.set(Math.sin(ang) * a, 0, Math.cos(ang) * a);
      if (shown) {
        const k = 0.55 * grow;
        for (let q = 0; q < 128; q++) {
          const a0 = (q / 128) * Math.PI * 2, a1 = ((q + 1) / 128) * Math.PI * 2;
          v.set(Math.sin(a0) * a, 0, Math.cos(a0) * a); w.set(Math.sin(a1) * a, 0, Math.cos(a1) * a);
          orbits.push(v, w, c.set(pl.col).multiplyScalar(k));
        }
      }
    });
    // Kepler's line of sight: a dashed line from the star towards the telescope
    for (let q = 0; q < 16; q += 2) { v.set(0, 0, 0.6 + q * 0.35); w.set(0, 0, 0.6 + (q + 1) * 0.35); orbits.push(v, w, c.set(0x8a93a6).multiplyScalar(0.5)); }

    // ---------- the graph ----------
    const Z = -1;
    const gw = portrait ? 1.8 * halfW : Math.min(1.6 * halfW, 2.3 * th), gh = portrait ? 0.42 * th : 0.46 * th;
    const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.27) * th;
    const K = smooth(Math.min(1, (m.u * m.len) / 0.8)) * (1 - smooth(Math.max(0, (m.u * m.len - m.len + 0.5) / 0.5)));
    card.position.set(0, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.1 * th, gh + 0.1 * th, 1);
    card.material.opacity = 0.78 * K;
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };
    const GREY = 0x8a93a6;
    seg(gx, gy, gx + gw, gy, GREY, 0.7 * K); seg(gx, gy, gx, gy + gh, GREY, 0.7 * K);
    // min–max per pixel column: a faithful picture of 59,000 points with a few hundred lines
    const envelope = (t0, t1, val, ymin, ymax, hex, k, cols = 360, colour) => {
      const lo = new Float32Array(cols).fill(Infinity), hi = new Float32Array(cols).fill(-Infinity), tag = new Int8Array(cols).fill(-1);
      for (let i = 0; i < d.n; i++) {
        const tt = d.t[i];
        if (tt < t0 || tt >= t1) continue;
        const b = Math.floor(((tt - t0) / (t1 - t0)) * cols), y = val(i);
        if (y < lo[b]) lo[b] = y; if (y > hi[b]) hi[b] = y;
        if (colour) { const cc = colour(i); if (cc >= 0) tag[b] = cc; }
      }
      const Y = (y) => gy + Math.min(1, Math.max(0, (y - ymin) / (ymax - ymin))) * gh;
      for (let b = 0; b < cols; b++) {
        if (lo[b] === Infinity) continue;
        const x = gx + ((b + 0.5) / cols) * gw;
        seg(x, Y(lo[b]), x, Y(hi[b]) + 0.002 * th, tag[b] >= 0 ? COLS[tag[b] % COLS.length] : hex, tag[b] >= 0 ? 1.2 * k : k);
      }
    };
    if (m.phase === 'raw') envelope(M.t0, M.t1, (i) => d.raw[i], d.rawLo, d.rawHi, 0x9fb4d8, 0.8 * K);
    if (m.phase === 'flat') {
      const mix = smooth(Math.min(1, m.u / 0.4));
      envelope(M.t0, M.t1, (i) => d.f[i] * mix + d.raw[i] * (1 - mix) * 0.15, -2000, 1000, 0x9fb4d8, 0.8 * K);
    }
    if (m.phase === 'search') {
      const p = d.found[m.k], sr = M.searches[p.found];
      if (m.v < 0.4) {
        // the periodogram: S/N against log period, drawn left to right, then its peak
        const n = sr.p.length, lp = (P) => (Math.log(P) - Math.log(3)) / (Math.log(150) - Math.log(3));
        const pm = Math.max(...sr.power), draw = Math.min(1, m.v / 0.25) * n;
        let px = null, py = null;
        for (let i = 0; i < draw; i++) {
          const x = gx + lp(sr.p[i]) * gw, y = gy + Math.max(0, sr.power[i] / pm) * gh * 0.95;
          if (px !== null) seg(px, py, x, y, 0x9fb4d8, 0.85 * K);
          px = x; py = y;
        }
        if (m.v > 0.25) { const x = gx + lp(p.P) * gw; seg(x, gy, x, gy + gh, COLS[p.found % COLS.length], K); }
        for (const P of [5, 10, 20, 50, 100]) { const x = gx + lp(P) * gw; seg(x, gy, x, gy - 0.02 * th, GREY, 0.6 * K); }
      } else {
        // the fold: every transit stacked, binned
        const fy = p.fold.y, nb = fy.length, depth = Math.max(300, p.depth * 1.6);
        const Y = (y) => gy + gh * 0.82 + (y / depth) * gh * 0.75;
        const e = smooth(Math.min(1, (m.v - 0.4) / 0.15));
        let px = null, py = null;
        for (let b = 0; b < nb; b++) {
          if (fy[b] === null) { px = null; continue; }
          const x = gx + ((b + 0.5) / nb) * gw, y = Y(fy[b] * e);
          const hcol = COLS[p.found % COLS.length];
          seg(x - 0.006 * th, y, x + 0.006 * th, y, hcol, K);
          if (px !== null) seg(px, py, x, y, hcol, 0.35 * K);
          px = x; py = y;
        }
        seg(gx, Y(0), gx + gw, Y(0), GREY, 0.35 * K);
        // duration marks
        const W = p.fold.w, xd = (x) => gx + ((x + W) / (2 * W)) * gw;
        seg(xd(-p.dur / 2), Y(-p.depth), xd(p.dur / 2), Y(-p.depth), 0xffffff, 0.6 * K * e);
      }
    }
    if (m.phase === 'system') {
      const W = 40, t1 = day, t0 = day - W;
      envelope(t0, t1, (i) => d.f[i], -2200, 900, 0x9fb4d8, 0.85 * K, 240, (i) => {
        for (const pl of s.planets) if (inTransit(pl.p, d.t[i])) return pl.p.found;
        return -1;
      });
      seg(gx + gw, gy, gx + gw, gy + gh, 0xffffff, 0.4 * K);
    }
    hud.commit(); orbits.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.card); ctx.camera.remove(state.hud.object);
    state.hud.dispose(); state.orbits.dispose();
    state.card.geometry.dispose(); state.card.material.dispose();
    state.star.geometry.dispose(); state.star.material.dispose();
    state.halo.geometry.dispose(); state.halo.material.dispose();
    for (const pl of s.planets) { pl.mesh.geometry.dispose(); pl.mesh.material.dispose(); }
    LIVE.d = null;
  },
};
