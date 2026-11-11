import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Lighthouses of the Galaxy. Every pulsar in the ATNF Pulsar Catalogue with a known position and
// distance (3679 of 3838), in the Milky Way where it is, each blinking at its own real rotation period.
// Those spinning faster than about 7 times a second blink faster than a screen can show, so they glow
// steadily instead. Then the same points become the P–Ṗ diagram, the pulsar astronomer's map, and the
// Crab pulsar's own numbers give the age and power of the Crab Nebula.
// tools/pulsars/build_psr.py makes the data and every derived number (dipole spin-down, I = 10^45 g cm²).

const DATA_URL = '/data/pulsars/';
const PHASES = [['galaxy', 13], ['chart', 12], ['crab', 10], ['msp', 10]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const KPC = 0.5;                                   // scene units per kpc
const LP = [-3.2, 1.4], LPD = [-21.5, -9.5];       // chart ranges: log10 P (s), log10 Ṗ
const CW = 9, CH = 6;                              // chart size in scene units
const LIVE = { d: null };

const VERT = /* glsl */ `
  attribute vec3 aGal;
  attribute vec3 aPF;        // log10 P, log10 Pdot (0 if unknown), flags
  uniform float uTime, uChart, uPx, uHi, uHiMode;
  uniform vec4 uChartBox;    // x0, y0, width, height
  uniform vec4 uRange;       // log P min, max; log Pdot min, max
  varying vec3 vCol;
  varying float vA;
  bool flag(float f, float bit) { return mod(floor(f / bit), 2.0) > 0.5; }
  void main() {
    float lp = aPF.x, lpd = aPF.y, f = aPF.z;
    float P = pow(10.0, lp);
    bool msp = flag(f, 1.0), mag = flag(f, 2.0), bin = flag(f, 4.0), hasPd = flag(f, 32.0);
    vec3 col = msp ? vec3(1.0, 0.82, 0.4) : mag ? vec3(1.0, 0.35, 0.3) : vec3(0.55, 0.78, 1.0);
    // blink at the real period: a short pulse each turn; too fast to show → a steady glow
    float ph = fract(uTime / P);
    float pulse = P > 0.14 ? 0.15 + 1.6 * exp(-pow(min(ph, 1.0 - ph) * P / 0.035, 2.0)) : 0.75;
    vec3 chart = vec3(uChartBox.x + (lp - uRange.x) / (uRange.y - uRange.x) * uChartBox.z,
                      uChartBox.y + (lpd - uRange.z) / (uRange.w - uRange.z) * uChartBox.w, 0.0);
    vec3 p = mix(aGal, chart, uChart);
    float a = mix(pulse, 0.9, uChart);
    if (!hasPd) a *= 1.0 - uChart;                 // no slow-down measured: not on the chart
    // highlights: 1 = MSPs and binaries, 2 = nothing
    if (uHiMode > 0.5) { float on = msp ? 1.0 : 0.15; a *= mix(1.0, on, uHi); if (bin && msp) col = mix(col, vec3(1.0, 1.0, 0.85), uHi); }
    vCol = col; vA = a;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * (msp || mag ? 1.25 : 1.0) * (1.0 + 0.6 * clamp(a - 1.0, 0.0, 1.0));
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * (exp(-r2 * 3.5) + 0.1 * (1.0 - r2)), 1.0);
  }`;

const fmtE = (x, dig = 1) => { const e = Math.floor(Math.log10(x)); return `${(x / 10 ** e).toFixed(dig)} \\times 10^{${e}}`; };

export default {
  name: 'Lighthouses of the Galaxy',
  description:
    'Every known pulsar with a distance, 3679 spinning neutron stars, placed in the Milky Way and blinking at its ' +
    'own real rotation period. Then the P–Ṗ diagram: young pulsars, old ones, magnetars, and the millisecond ' +
    "pulsars spun up by a companion. The Crab pulsar's own spin-down gives the Crab Nebula's age and power. " +
    'Data: ATNF Pulsar Catalogue (Manchester et al. 2005), CSIRO.',
  tags: ['pulsars', 'neutron stars', 'milky way', 'magnetars', 'crab', 'real data', 'p-pdot'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'galaxy', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading the pulsar catalogue…}';
    const M = d.meta, c = M.special.crab, v = M.special.vela;
    if (m.phase === 'galaxy')
      return `\\begin{aligned}&${hl(M.drawn, 0)}\\ \\text{pulsars, each blinking at its real period} \\\\ &\\text{(faster than 7 a second: a steady glow)} \\\\ &\\text{distances mostly from the delay of low radio} \\\\ &\\text{frequencies by free electrons on the way}\\end{aligned}`;
    if (m.phase === 'chart')
      return `\\begin{aligned}&P\\ \\text{across},\\ \\dot P\\ \\text{(how fast it slows) up; } ${hl(M.withPdot, 0)}\\ \\text{pulsars} \\\\ &B = 3.2\\times 10^{19}\\sqrt{P\\dot P}\\ \\text{G},\\quad \\tau = P/2\\dot P \\\\ &{\\color{#8cc8ff}\\text{ordinary}},\\ {\\color{#ff5a4d}\\text{magnetars}\\ (${M.magnetars})},\\ {\\color{#ffd166}\\text{millisecond}\\ (${M.msp})} \\\\ &\\text{lines: } B = 10^{8\\ldots 14}\\ \\text{G (grey)},\\ \\tau = 10^{3\\ldots 9}\\ \\text{yr (blue)}\\end{aligned}`;
    if (m.phase === 'crab')
      return `\\begin{aligned}&\\text{the Crab: } P = ${hl(c.P * 1000, 1)}\\ \\text{ms},\\ \\dot P = ${fmtE(c.Pdot, 2)} \\\\ &\\tau = P/2\\dot P = ${hl(c.tau, 0)}\\ \\text{yr; the supernova was seen in 1054} \\\\ &\\dot E = 4\\pi^2 I \\dot P / P^3 = ${fmtE(c.Edot, 1)}\\ \\text{erg/s} \\\\ &\\approx ${fmtE(c.Edot / 3.828e33, 1)}\\ \\text{Suns: what lights the nebula}\\end{aligned}`;
    return `\\begin{aligned}&\\text{millisecond pulsars: old, weak-field, spun up} \\\\ &\\text{by gas from a companion star} \\\\ &\\text{in a binary: } ${hl(100 * M.binaryMSP, 0)}\\%\\ \\text{of them, } ${hl(100 * M.binaryNormal, 1)}\\%\\ \\text{of ordinary ones} \\\\ &\\text{fastest: ${M.special.fastest.name}, } ${hl(1 / M.special.fastest.P, 0)}\\ \\text{turns a second}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x000000);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 2400, width: 1.3 });
    ctx.scene.add(lines.object);
    Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'psr.bin').then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
      if (s.disposed) return;
      const f = new Float32Array(buf), n = f.length / 6;
      const gal = new Float32Array(n * 3), pf = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        // Galactocentric x, y in the disc, z up → scene x, y up, z
        gal[i * 3] = f[i * 6] * KPC; gal[i * 3 + 1] = f[i * 6 + 2] * KPC; gal[i * 3 + 2] = -f[i * 6 + 1] * KPC;
        pf[i * 3] = f[i * 6 + 3]; pf[i * 3 + 1] = f[i * 6 + 4]; pf[i * 3 + 2] = f[i * 6 + 5];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aGal', new THREE.BufferAttribute(gal, 3));
      g.setAttribute('aPF', new THREE.BufferAttribute(pf, 3));
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 }, uChart: { value: 0 }, uPx: { value: 6 }, uHi: { value: 0 }, uHiMode: { value: 0 },
          uChartBox: { value: new THREE.Vector4(-CW / 2, -CH / 2, CW, CH) }, uRange: { value: new THREE.Vector4(LP[0], LP[1], LPD[0], LPD[1]) },
        },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.geo = g; s.gal = gal; s.pf = pf;
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      LIVE.d = { meta }; s.meta = meta; s.ready = true;
    }).catch((err) => console.error('pulsar data', err));
    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), cg: new THREE.Vector3(), cc: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); lines.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);

    // ---------- chart amount and camera ----------
    const toChart = m.phase === 'galaxy' ? 0 : m.phase === 'chart' ? smooth(Math.min(1, m.u / 0.3)) : 1;
    const back = m.phase === 'msp' ? smooth(Math.max(0, (m.u - 0.85) / 0.15)) : 0;   // fold back into the Galaxy for the loop
    const chart = toChart * (1 - back);
    const az = 0.6 + ctx.time * 0.04, el = THREE.MathUtils.degToRad(38);
    const Dg = (portrait ? 12 / (aspect * th) : 11 / th) * 0.55;
    state.cg.set(Math.sin(az) * Math.cos(el) * Dg, Math.sin(el) * Dg, Math.cos(az) * Math.cos(el) * Dg);
    const Dc = (portrait ? (CW * 0.62) / (aspect * th) : (CH * 0.95) / th);
    const ox = portrait ? 0 : 2.4, oy = portrait ? -0.9 : -0.5;   // the chart sits left of the equations
    state.cc.set(ox, oy, Dc);
    cam.position.copy(state.cg).lerp(state.cc, chart);
    cam.up.set(0, 1, 0);
    v.set(ox, oy, 0).multiplyScalar(chart);
    cam.lookAt(v);
    if (!s.ready) { lines.commit(); return; }
    const M = s.meta, U = s.mat.uniforms;
    U.uTime.value = ctx.time; U.uChart.value = chart;
    U.uPx.value = Math.max(3, Math.min(width, height) / 160);
    U.uHiMode.value = m.phase === 'msp' ? 1 : 0;
    U.uHi.value = m.phase === 'msp' ? smooth(Math.min(1, m.u / 0.2)) * (1 - back) : 0;

    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, z0, x1, y1, z1, hex, k) => { v.set(x0, y0, z0); w.set(x1, y1, z1); lines.push(v, w, col(hex, k)); };
    // ---------- the Galaxy: rings every 4 kpc, the centre, the Sun ----------
    const kg = 1 - chart;
    if (kg > 0.01) {
      for (const R of [4, 8, 12, 16]) for (let q = 0; q < 96; q += 1) {
        const a0 = (q / 96) * Math.PI * 2, a1 = ((q + 1) / 96) * Math.PI * 2;
        seg(Math.cos(a0) * R * KPC, 0, Math.sin(a0) * R * KPC, Math.cos(a1) * R * KPC, 0, Math.sin(a1) * R * KPC, 0x3a4a66, 0.5 * kg);
      }
      const sx = -M.R0 * KPC, e = 0.18;
      seg(sx - e, 0, 0, sx + e, 0, 0, 0xffd166, kg); seg(sx, 0, -e, sx, 0, e, 0xffd166, kg); seg(sx, -e, 0, sx, e, 0, 0xffd166, kg);
      seg(-e, 0, 0, e, 0, 0, 0xffffff, 0.6 * kg); seg(0, 0, -e, 0, 0, e, 0xffffff, 0.6 * kg);
    }
    // ---------- the chart: axes, field lines, age lines, death line ----------
    if (chart > 0.3) {
      const k = (chart - 0.3) / 0.7;
      const X = (lp) => -CW / 2 + ((lp - LP[0]) / (LP[1] - LP[0])) * CW, Y = (lpd) => -CH / 2 + ((lpd - LPD[0]) / (LPD[1] - LPD[0])) * CH;
      const inside = (lp, lpd) => lp >= LP[0] && lp <= LP[1] && lpd >= LPD[0] && lpd <= LPD[1];
      const line = (fn, hex, kk) => {
        let prev = null;
        for (let lp = LP[0]; lp <= LP[1] + 1e-9; lp += 0.05) {
          const lpd = fn(lp);
          if (prev && inside(lp, lpd) && inside(prev[0], prev[1])) seg(X(prev[0]), Y(prev[1]), 0, X(lp), Y(lpd), 0, hex, kk);
          prev = [lp, lpd];
        }
      };
      seg(X(LP[0]), Y(LPD[0]), 0, X(LP[1]), Y(LPD[0]), 0, 0x8a93a6, 0.8 * k); seg(X(LP[0]), Y(LPD[0]), 0, X(LP[0]), Y(LPD[1]), 0, 0x8a93a6, 0.8 * k);
      for (let lp = -3; lp <= 1; lp++) seg(X(lp), Y(LPD[0]), 0, X(lp), Y(LPD[0]) - 0.12, 0, 0x8a93a6, 0.7 * k);
      for (let lpd = -21; lpd <= -10; lpd++) seg(X(LP[0]), Y(lpd), 0, X(LP[0]) - 0.1, Y(lpd), 0, 0x8a93a6, 0.5 * k);
      for (let lb = 8; lb <= 14; lb++) line((lp) => 2 * (lb - Math.log10(3.2e19)) - lp, 0x8a93a6, 0.22 * k);
      for (let lt = 3; lt <= 9; lt++) line((lp) => lp - Math.log10(2 * 10 ** lt * 3.156e7), 0x4f8fd6, 0.3 * k);
      line((lp) => Math.log10(2.82e-17) + 3 * lp, 0xff8fa3, 0.35 * k);
      // the Crab, Vela and the Galactic-centre magnetar, ringed during 'crab'
      if (m.phase === 'crab') {
        const kc = smooth(Math.min(1, m.u / 0.2));
        for (const [key, hex] of [['crab', 0xffffff], ['vela', 0x9be564], ['sgrA', 0xff5a4d]]) {
          const sp = M.special[key];
          const x = X(Math.log10(sp.P)), y = Y(Math.log10(sp.Pdot)), r = key === 'crab' ? 0.22 : 0.15;
          for (let q = 0; q < 32; q++) {
            const a0 = (q / 32) * Math.PI * 2, a1 = ((q + 1) / 32) * Math.PI * 2;
            seg(x + Math.cos(a0) * r, y + Math.sin(a0) * r, 0, x + Math.cos(a1) * r, y + Math.sin(a1) * r, 0, hex, kc * (key === 'crab' ? 1 : 0.6));
          }
        }
      }
    }
    lines.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    state.lines.dispose();
    if (s.geo) { s.geo.dispose(); s.mat.dispose(); }
    LIVE.d = null;
  },
};
