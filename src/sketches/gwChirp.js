import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The First Chirp. GW150914, the first gravitational wave ever recorded (14 September 2015), taken from
// the public LIGO strain (GWOSC: 32 s at 4096 samples a second from Hanford and Livingston) and worked
// through the way the discovery was:
//   raw       the recorded strain, dominated by noise ~600× larger than the wave
//   noise     each detector's noise spectrum √S(f); dividing by it ("whitening") evens the noise out
//   clean     whitened, 35–350 Hz: the chirp appears in both detectors; Livingston leads by the measured
//             delay and is flipped (its arms are turned ~90° from Hanford's)
//   search    a chirp template slid along all 32 s: one spike, far above the noise
//   merger    replayed ~60× slower: the sheet's ripples ARE the measured strain (H1 + aligned L1, with its
//             quadrature), sent outward at the retarded time t − r/v; the two holes' orbit follows the
//             measured phase, their separation from Kepler's law at the measured frequency
//   measure   f^{−8/3} falls linearly to the merger, and its slope is the chirp mass
// tools/gw/build_gw.py makes the data and every number shown.

const DATA_URL = '/data/gw/';
const PHASES = [['raw', 7], ['noise', 7], ['clean', 9], ['search', 7], ['merger', 22], ['measure', 11]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const TAU0 = -0.22, TAU1 = 0.11;                 // the replayed stretch of real time (s from the event)
const SLOW = PHASES[4][1] / (TAU1 - TAU0);
const V = 140;                                   // ripple speed on the sheet, units per real second
const KM = 300;                                  // km per scene unit
const G = 6.674e-11, C = 2.998e8, MSUN = 1.989e30;
const LIVE = { d: null, tau: TAU0, f: 0, R: 0 };

const SHEET_VERT = /* glsl */ `
  uniform sampler2D uStrain;
  uniform float uN, uT0, uFs, uTau, uV, uAmp;
  uniform vec4 uHoles;      // xz of both holes
  uniform vec2 uWell;       // depth of each funnel
  varying float vH, vR;
  varying vec2 vXZ;
  vec2 S(float tt) {
    float x = clamp((tt - uT0) * uFs, 0.0, uN - 2.0);
    float i = floor(x);
    vec2 a = texture2D(uStrain, vec2((i + 0.5) / uN, 0.5)).rg, b = texture2D(uStrain, vec2((i + 1.5) / uN, 0.5)).rg;
    return mix(a, b, x - i);
  }
  void main() {
    vec3 p = position;
    float r = length(p.xz), phi = atan(p.z, p.x);
    float tr = uTau - r / uV;
    // outside the chirp the record is only noise; it is faded out rather than sent from the holes
    float gate = smoothstep(-0.135, -0.09, tr) * (1.0 - smoothstep(0.035, 0.07, tr));
    vec2 s = S(tr);
    // a quadrupole: h = Re[(h₊ + i h×) e^{−2iφ}], falling off as 1/r
    float h = (s.x * cos(2.0 * phi) + s.y * sin(2.0 * phi)) * gate * smoothstep(0.4, 2.2, r) / (1.0 + 0.22 * r);
    p.y += uAmp * h;
    float d0 = length(p.xz - uHoles.xy), d1 = length(p.xz - uHoles.zw);
    p.y -= uWell.x / sqrt(d0 * d0 + 0.35) + uWell.y / sqrt(d1 * d1 + 0.35);
    vH = h; vR = r; vXZ = p.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const SHEET_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying float vH, vR;
  varying vec2 vXZ;
  float grid(vec2 q) {
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float line = grid(vXZ / 0.5);
    float k = clamp(abs(vH) / 6.0, 0.0, 1.0);
    vec3 c = mix(vec3(0.10, 0.22, 0.45), vec3(0.55, 0.85, 1.0), k) + vec3(1.0, 0.8, 0.5) * k * k;
    float fade = 1.0 - smoothstep(8.0, 14.0, vR);
    gl_FragColor = vec4(c * (line * 0.9 + 0.05 + 0.25 * k) * fade * uAlpha, 1.0);
  }`;

function ringTexture() {
  const n = 128, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  // dark centre, a bright ring just outside the horizon (where light orbits), a soft halo
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.36, 'rgba(0,0,0,0)');
  grad.addColorStop(0.42, 'rgba(255,214,150,1)'); grad.addColorStop(0.5, 'rgba(255,170,90,0.45)');
  grad.addColorStop(0.75, 'rgba(120,150,255,0.12)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function load() {
  const [meta, strain, raw, snr] = await Promise.all([
    fetch(DATA_URL + 'meta.json').then((r) => r.json()),
    ...['strain.bin', 'raw.bin', 'snr.bin'].map((f) => fetch(DATA_URL + f).then((r) => r.arrayBuffer())),
  ]);
  const S = new Float32Array(strain), n = meta.strain.n, cols = 6;
  const col = (k) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = S[i * cols + k]; return a; };
  const d = { meta, n, t: col(0), H: col(1), Lal: col(2), L: col(3), C: col(4), Q: col(5), raw: new Float32Array(raw), snr: new Float32Array(snr) };
  // the orbit's phase. During the visible chirp it is half the measured wave phase (unwrapped, never
  // allowed to run backwards); before that, the fitted chirp f(t) integrated
  const Mc = meta.Mc, tauc = (G * Mc * MSUN) / C ** 3;
  const fFit = (tau) => {
    // the fitted line, shifted to reach the measured peak frequency at the measured peak time
    const thPk = (5 / 256) * (Math.PI * meta.fpeak) ** (-8 / 3) * tauc ** (-5 / 3);
    const th = Math.max(1e-4, thPk + (meta.tpk - tau));
    return (1 / Math.PI) * (5 / (256 * th)) ** (3 / 8) * tauc ** (-5 / 8);
  };
  const dt = 1 / meta.fs, nT = Math.round((meta.tpk - TAU0 + 0.05) / dt) + 1;
  const orb = new Float32Array(nT), freq = new Float32Array(nT);
  const idx = (tau) => (tau - meta.strain.t0) * meta.fs;
  let ph = 0, prevW = null;
  const DATA_FROM = -0.085;
  for (let j = 0; j < nT; j++) {
    const tau = TAU0 + j * dt;
    const i = Math.round(idx(tau));
    const f = fFit(Math.min(tau, meta.tpk));
    freq[j] = tau <= meta.tpk ? f : meta.fpeak;
    if (tau < DATA_FROM || tau > meta.tpk) { ph += Math.PI * freq[j] * dt; prevW = null; }
    else {
      const w = Math.atan2(d.Q[i], d.C[i]);
      if (prevW !== null) {
        let dw = w - prevW;
        while (dw < -Math.PI) dw += 2 * Math.PI;
        while (dw > Math.PI) dw -= 2 * Math.PI;
        ph += Math.max(0, dw) / 2;
      } else ph += Math.PI * f * dt;
      prevW = w;
    }
    orb[j] = ph;
  }
  d.orb = { orb, freq, dt, n: nT };
  d.Mtot = meta.Mtot;
  return d;
}

const sepKm = (Mtot, f) => ((G * Mtot * MSUN) / (Math.PI * f) ** 2) ** (1 / 3) / 1000;

export default {
  name: 'The First Chirp',
  description:
    'GW150914, the first gravitational wave ever detected, worked out from the public LIGO recordings: the ' +
    'noise, the whitening, the chirp in both detectors seven milliseconds apart, the search that finds it, ' +
    'then the merger replayed sixty times slower with the measured wave rippling out across spacetime, and ' +
    "the chirp mass read off the data's slope. Data: LIGO Scientific Collaboration and Virgo Collaboration, " +
    'Gravitational Wave Open Science Center (gwosc.org).',
  tags: ['gravitational waves', 'ligo', 'black holes', 'gw150914', 'matched filter', 'real data', 'relativity'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        const tau = phase === 'merger' ? TAU0 + (TAU1 - TAU0) * u : phase === 'measure' ? TAU1 : TAU0;
        return { T, phase, u, tau };
      }
      acc += len;
    }
    return { T, phase: 'raw', u: 0, tau: TAU0 };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading the LIGO recordings…}';
    const M = d.meta;
    if (m.phase === 'raw')
      return `\\begin{aligned}&h(t) = \\Delta L / L\\quad \\text{LIGO Hanford, 14 Sep 2015, 09:50:45 UTC} \\\\ &\\text{the record swings } \\pm ${hl(LIVE.rawMax, 1)} \\times 10^{-19}\\text{, mostly ground noise} \\\\ &\\text{the wave peaks near } 10^{-21}\\ \\text{(gold tick)} \\\\ &\\text{the 4 km arms change by } \\tfrac{1}{400}\\text{ of a proton}\\end{aligned}`;
    if (m.phase === 'noise')
      return `\\begin{aligned}&\\sqrt{S_n(f)}:\\ \\text{each detector's noise, by frequency} \\\\ &\\tilde d_w(f) = \\tilde d(f) / \\sqrt{S_n(f)}\\quad \\text{(whitening)} \\\\ &\\text{every frequency's noise made equal; keep} \\\\ &35\\text{–}350\\ \\text{Hz, where they hear best; notch the spikes}\\end{aligned}`;
    if (m.phase === 'clean') {
      const k = smooth(Math.min(1, Math.max(0, (m.u - 0.45) / 0.3)));
      return `\\begin{aligned}&\\text{whitened: } {\\color{#7fd4ff}\\text{Hanford}}\\ \\text{and } {\\color{#ffb36b}\\text{Livingston}},\\ 3002\\ \\text{km apart} \\\\ &${k > 0.5 ? `\\text{Livingston heard it } ${hl(M.lagMs, 1)}\\ \\text{ms first, upside down}` : '\\text{the same rising whistle in both}'} \\\\ &${k > 0.5 ? `\\text{(published } 6.9^{+0.5}_{-0.4}\\text{); match after shifting: } ${hl(M.corr, 2)}` : '\\text{a few milliseconds apart}'} \\\\ &\\text{light needs } 10.0\\ \\text{ms between the sites}\\end{aligned}`;
    }
    if (m.phase === 'search')
      return `\\begin{aligned}&\\rho(t) = \\frac{|\\langle d,\\, h_{t}\\rangle|}{\\sqrt{\\langle h, h\\rangle}}\\quad \\text{a chirp slid along 30 s} \\\\ &\\rho_{\\text{H}} = ${hl(M.snrH, 1)},\\ \\rho_{\\text{L}} = ${hl(M.snrL, 1)},\\ \\text{together } ${hl(M.snrNet, 1)} \\\\ &\\text{(LIGO's full analysis: } 24\\text{)} \\\\ &\\text{loudest noise anywhere else: } ${hl(M.noiseMax, 1)}\\end{aligned}`;
    if (m.phase === 'merger') {
      const tau = LIVE.tau, ms = tau * 1000;
      if (tau > M.tpk + 0.002)
        return `\\begin{aligned}&\\text{one black hole, ringing down} \\\\ &\\text{the ripples carried off } \\approx 3\\,M_\\odot c^2 \\\\ &t = ${hl(ms, 0)}\\ \\text{ms};\\ \\text{replayed } ${hl(SLOW, 0)}\\times \\text{ slower} \\\\ &\\text{the ripples are the measured strain at } t - r/v\\end{aligned}`;
      const v = (Math.PI * LIVE.f * LIVE.R * 1000) / 2 / C;
      return `\\begin{aligned}&f_{\\text{GW}} = 2 f_{\\text{orbit}} = ${hl(LIVE.f, 0)}\\ \\text{Hz},\\quad t = ${hl(ms, 0)}\\ \\text{ms} \\\\ &R = \\Big(\\frac{G M}{\\omega^2}\\Big)^{1/3} = ${hl(LIVE.R, 0)}\\ \\text{km},\\quad M = ${hl(d.Mtot, 0)}\\,M_\\odot \\\\ &\\text{each hole moves at } ${hl(v, 2)}\\,c;\\ \\text{replayed } ${hl(SLOW, 0)}\\times \\text{ slower}\\end{aligned}`;
    }
    const k = smooth(Math.min(1, Math.max(0, (m.u - 0.5) / 0.15)));
    if (k < 0.5)
      return `\\begin{aligned}&f^{-8/3} = \\tfrac{256}{5}\\pi^{8/3}\\Big(\\frac{G\\mathcal{M}}{c^3}\\Big)^{5/3}(t_c - t) \\\\ &\\text{a straight line: its slope, from } ${M.track.use.reduce((a, b) => a + b, 0)}\\text{ half-cycles,} \\\\ &\\text{gives } \\mathcal{M} = ${hl(M.Mc, 1)}\\ M_\\odot\\ (${hl(M.McLo, 0)}\\text{–}${hl(M.McHi, 0)}) \\\\ &\\div (1 + z),\\ z = 0.09:\\ ${hl(M.McSource, 1)}\\ M_\\odot\\ \\text{(published } 28.6^{+1.7}_{-1.5}\\text{)}\\end{aligned}`;
    return `\\begin{aligned}&\\text{at the peak, } ${hl(M.fpeak, 0)}\\ \\text{Hz, } \\geq ${hl(M.Mtot, 0)}\\,M_\\odot\\ \\text{orbit } ${hl(M.sepKm, 0)}\\ \\text{km apart} \\\\ &\\text{their horizons } 2GM/c^2\\ \\text{add to } ${hl(M.rsKm, 0)}\\ \\text{km:} \\\\ &\\text{nothing but black holes is that small} \\\\ &\\text{published: } 35.6 + 30.6 \\to 63.1\\,M_\\odot,\\ 440\\ \\text{Mpc}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x02030a);
    ctx.scene.add(cam); // the graphs ride on the camera
    const s = { ready: false, disposed: false };
    const hud = createFatLines({ maxSegments: 4200, width: 1.5, overlay: true });
    hud.material.transparent = true; // drawn after the card behind it
    cam.add(hud.object);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 9;
    cam.add(card);

    // the sheet
    const geo = new THREE.PlaneGeometry(28, 28, 420, 420);
    geo.rotateX(-Math.PI / 2);
    const sheetMat = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG,
      uniforms: {
        uStrain: { value: null }, uN: { value: 1 }, uT0: { value: 0 }, uFs: { value: 4096 }, uTau: { value: TAU0 }, uV: { value: V },
        uAmp: { value: 0.09 }, uHoles: { value: new THREE.Vector4() }, uWell: { value: new THREE.Vector2() }, uAlpha: { value: 1 },
      },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const sheet = new THREE.Mesh(geo, sheetMat);
    sheet.frustumCulled = false;
    ctx.scene.add(sheet);

    // the holes: black spheres that hide the sheet behind them, each with a ring of light
    const ringTex = ringTexture();
    const mkHole = () => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      ball.renderOrder = -1;
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      ring.scale.setScalar(5.6);
      g.add(ball, ring);
      ctx.scene.add(g);
      return { g, ball, ring };
    };
    const holes = [mkHole(), mkHole(), mkHole()];

    load().then((d) => {
      if (s.disposed) return;
      const tex = new THREE.DataTexture(new Float32Array(d.n * 4), d.n, 1, THREE.RGBAFormat, THREE.FloatType);
      for (let i = 0; i < d.n; i++) { tex.image.data[i * 4] = d.C[i]; tex.image.data[i * 4 + 1] = d.Q[i]; }
      tex.minFilter = tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      const U = sheetMat.uniforms;
      U.uStrain.value = tex; U.uN.value = d.n; U.uT0.value = d.meta.strain.t0; U.uFs.value = d.meta.fs;
      let rm = 0; for (const x of d.raw) rm = Math.max(rm, Math.abs(x));
      LIVE.rawMax = rm / 100; // ×1e-21 → ×1e-19
      LIVE.d = d; s.d = d; s.tex = tex; s.ready = true;
    }).catch((err) => console.error('gw data', err));
    return { s, hud, card, sheet, sheetMat, holes, ringTex, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), look: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, hud, sheetMat, holes, v, w, c, look } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    hud.setResolution(width, height); hud.reset();

    // camera: slowly round the sheet, looking a little below the centre so the graphs fit underneath
    const ang = 0.6 + ctx.time * 0.035;
    const dist = portrait ? 21 : 13.5, hgt = portrait ? 10 : 6.2;
    const close = m.phase === 'merger' ? smooth(Math.min(1, m.u / 0.15)) * (1 - smooth(Math.max(0, (m.u - 0.9) / 0.1))) : 0;
    const dd = dist * (1 - 0.18 * close);
    cam.position.set(Math.cos(ang) * dd, hgt * (1 - 0.15 * close), Math.sin(ang) * dd);
    look.set(0, -(portrait ? 3.5 : 2.2) * (1 - 0.6 * close), 0);
    cam.lookAt(look);
    if (!s.ready) { hud.commit(); return; }
    const d = s.d, M = d.meta, U = sheetMat.uniforms;

    // ---------- the binary ----------
    const tau = m.tau;
    LIVE.tau = tau;
    U.uTau.value = tau;
    const O = d.orb, j = Math.max(0, Math.min(O.n - 1, Math.round((Math.min(tau, M.tpk + 0.05) - TAU0) / O.dt)));
    let ph = O.orb[j], f = O.freq[j];
    if (m.phase !== 'merger' && m.phase !== 'measure') { f = O.freq[0]; ph = ctx.time * Math.PI * f / SLOW; } // waiting: the first orbit, slowed
    LIVE.f = f;
    const R = sepKm(d.Mtot, f); LIVE.R = R;
    const rH = (d.meta.rsKm / 2) / KM;              // each hole's horizon (equal masses)
    const rF = ((2 * G * 63.1 * (1 + M.z) * MSUN) / C ** 2 / 1000) / KM;   // the final hole (published mass)
    const merged = m.phase === 'measure' || (m.phase === 'merger' && tau > M.tpk);
    const mk = m.phase === 'merger' ? smooth(Math.min(1, Math.max(0, (tau - M.tpk) / 0.004))) : merged ? 1 : 0;
    const half = ((R / KM) / 2) * (1 - mk);
    for (let k = 0; k < 2; k++) {
      const a = ph + k * Math.PI;
      holes[k].g.position.set(Math.cos(a) * half, 0.0, Math.sin(a) * half);
      holes[k].g.scale.setScalar(rH * (1 - mk) + 1e-4);
      holes[k].g.visible = mk < 0.999;
    }
    holes[2].g.position.set(0, 0, 0);
    holes[2].g.scale.setScalar(rF * Math.max(mk, 1e-4));
    holes[2].g.visible = mk > 0.001;
    const flash = m.phase === 'merger' ? Math.exp(-Math.max(0, tau - M.tpk) / 0.006) * (tau > M.tpk ? 1 : 0) : 0;
    holes[2].ring.material.color.setScalar(1 + 3 * flash);
    holes[0].g.position.y = holes[1].g.position.y = -0.55;
    holes[2].g.position.y = -0.7;
    U.uHoles.value.set(holes[0].g.position.x, holes[0].g.position.z, holes[1].g.position.x, holes[1].g.position.z);
    U.uWell.value.set(0.55 * (1 - mk) + 0.5 * mk, 0.55 * (1 - mk) + 0.5 * mk);
    U.uAlpha.value = m.phase === 'merger' || m.phase === 'measure' ? 1 : 0.7;

    // ---------- the graphs ----------
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), Z = -1, halfW = aspect * th;
    const gw = portrait ? 1.8 * halfW : Math.min(1.5 * halfW, 1.9 * th), gh = portrait ? 0.36 * th : 0.42 * th;
    const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.27) * th;
    // a dark card behind the graph, so the sheet's grid doesn't run through it
    state.card.position.set(0, gy + gh / 2, Z - 0.001);
    state.card.scale.set(gw + 0.12 * th, gh + 0.12 * th, 1);
    const fadeIn = (len) => smooth(Math.min(1, m.u * len / 0.8)) * (1 - smooth(Math.max(0, (m.u * len - len + 0.6) / 0.6)));
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };
    const axes = (k) => { seg(gx, gy, gx + gw, gy, 0x8a93a6, 0.7 * k); seg(gx, gy, gx, gy + gh, 0x8a93a6, 0.7 * k); };
    const trace = (n, X, Y, hex, k, step = 1) => {
      let px = X(0), py = Y(0);
      for (let i = step; i < n; i += step) { const x = X(i), y = Y(i); seg(px, py, x, y, hex, k); px = x; py = y; }
    };
    const len = PHASES.find((p) => p[0] === m.phase)[1];
    const K = fadeIn(len);
    state.card.material.opacity = 0.72 * K;
    const BLUE = 0x7fd4ff, ORANGE = 0xffb36b, GOLD = 0xffd166;

    if (m.phase === 'raw') {
      axes(K);
      const n = d.raw.length, A = LIVE.rawMax * 100;
      trace(n, (i) => gx + (i / (n - 1)) * gw, (i) => gy + gh / 2 + (d.raw[i] / A) * gh * 0.48, BLUE, K);
      // how big the wave is on this scale: a tick at ±1e-21, at the event
      const x = gx + 0.5 * gw, e = (1 / A) * gh * 0.48;
      seg(x - 0.03 * th, gy + gh / 2 + e, x + 0.03 * th, gy + gh / 2 + e, GOLD, K);
      seg(x - 0.03 * th, gy + gh / 2 - e, x + 0.03 * th, gy + gh / 2 - e, GOLD, K);
    } else if (m.phase === 'noise') {
      axes(K);
      const A = M.asd, lx = (f2) => (Math.log(f2) - Math.log(10)) / (Math.log(2000) - Math.log(10));
      const ly = (a) => (Math.log(a) - Math.log(0.3)) / (Math.log(3e4) - Math.log(0.3)); // ×1e-23 /√Hz
      const n = A.f.length;
      trace(n, (i) => gx + lx(A.f[i]) * gw, (i) => gy + Math.min(1, Math.max(0, ly(A.H1[i]))) * gh, BLUE, K);
      trace(n, (i) => gx + lx(A.f[i]) * gw, (i) => gy + Math.min(1, Math.max(0, ly(A.L1[i]))) * gh, ORANGE, K);
      for (const fb of [35, 350]) seg(gx + lx(fb) * gw, gy, gx + lx(fb) * gw, gy + gh, GOLD, 0.5 * K);
      for (const ft of [10, 100, 1000]) seg(gx + lx(ft) * gw, gy, gx + lx(ft) * gw, gy - 0.025 * th, 0x8a93a6, 0.6 * K);
    } else if (m.phase === 'clean' || m.phase === 'merger') {
      axes(K);
      const t0 = -0.2, t1 = 0.06, i0 = Math.round((t0 - M.strain.t0) * M.fs), i1 = Math.round((t1 - M.strain.t0) * M.fs), n = i1 - i0;
      const X = (i) => gx + (i / n) * gw, A = 9;
      if (m.phase === 'clean') {
        const k = smooth(Math.min(1, Math.max(0, (m.u - 0.45) / 0.3)));
        const off = gh * 0.22 * (1 - k);
        trace(n, X, (i) => gy + gh / 2 + off + (d.H[i0 + i] / A) * gh * 0.25, BLUE, K);
        trace(n, X, (i) => gy + gh / 2 - off + (((1 - k) * d.L[i0 + i] + k * d.Lal[i0 + i]) / A) * gh * 0.25, ORANGE, 0.85 * K);
      } else {
        const play = Math.round((tau - t0) * M.fs);
        trace(Math.min(n, Math.max(2, play)), X, (i) => gy + gh / 2 + (d.C[i0 + i] / A) * gh * 0.3, GOLD, K);
        if (play > 0 && play < n) seg(X(play), gy, X(play), gy + gh, 0xffffff, 0.35 * K);
      }
      // 50 ms ticks
      for (let tt = -0.2; tt <= 0.06; tt += 0.05) { const x = gx + ((tt - t0) / (t1 - t0)) * gw; seg(x, gy, x, gy - 0.025 * th, 0x8a93a6, 0.6 * K); }
    } else if (m.phase === 'search') {
      axes(K);
      const B = d.snr.length / 2, Ymax = 20;
      const grow = Math.min(1, m.u / 0.55);
      const shown = Math.max(2, Math.round(B * grow));
      trace(shown, (i) => gx + (i / (B - 1)) * gw, (i) => gy + (d.snr[i * 2] / Ymax) * gh, BLUE, K);
      trace(shown, (i) => gx + (i / (B - 1)) * gw, (i) => gy + (d.snr[i * 2 + 1] / Ymax) * gh, ORANGE, 0.8 * K);
      const yN = gy + (M.noiseMax / Ymax) * gh;
      for (let q = 0; q < 40; q += 2) seg(gx + (q / 40) * gw, yN, gx + ((q + 1) / 40) * gw, yN, 0x8a93a6, 0.6 * K);
    } else if (m.phase === 'measure') {
      axes(K);
      const tr = M.track, t0 = -0.09, t1 = 0.02;
      const Y = (f2) => (f2 / 100) ** (-8 / 3), Ymax = 12;
      const X = (tt) => gx + ((tt - t0) / (t1 - t0)) * gw, YY = (y) => gy + Math.min(1, y / Ymax) * gh;
      const e = 0.014 * th;
      tr.t.forEach((tt, i) => {
        if (tt < t0 || tt > t1 || tr.a[i] < 1) return;
        const px = X(tt), py = YY(Y(tr.f[i])), hex = tr.use[i] ? BLUE : 0x5a6276, k = tr.use[i] ? K : 0.6 * K;
        seg(px - e, py, px + e, py, hex, k); seg(px, py - e, px, py + e, hex, k);
      });
      // the fitted line, drawn in as the slope is measured
      const draw = smooth(Math.min(1, Math.max(0, (m.u - 0.12) / 0.3)));
      const tauc = (G * M.Mc * MSUN) / C ** 3, slope = (256 / 5) * Math.PI ** (8 / 3) * tauc ** (5 / 3) * 100 ** (8 / 3);
      const ta = t0, tb = t0 + (M.tc - t0) * draw;
      if (draw > 0.01) seg(X(ta), YY(slope * (M.tc - ta)), X(tb), YY(slope * (M.tc - tb)), GOLD, K);
      seg(X(M.tc), gy, X(M.tc), gy + 0.08 * gh, GOLD, 0.6 * K * draw);
    }
    hud.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.hud.object); ctx.camera.remove(state.card);
    state.card.geometry.dispose(); state.card.material.dispose();
    state.hud.dispose();
    state.sheet.geometry.dispose(); state.sheetMat.dispose();
    for (const h of state.holes) { h.ball.geometry.dispose(); h.ball.material.dispose(); h.ring.material.dispose(); }
    state.ringTex.dispose();
    if (s.tex) s.tex.dispose();
    LIVE.d = null;
  },
};
