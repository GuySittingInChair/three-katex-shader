import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Cosmic Yardstick. Classical Cepheids from Gaia DR3: 2201 in the Large Magellanic Cloud, each brightening
// and fading with its own period and the light-curve shape Gaia fitted to it, at the phase it has today.
// They slide into Henrietta Leavitt's period–luminosity law. Then 245 Milky Way Cepheids whose parallaxes Gaia
// measured to 5% set the law's zero point, and the gap between the two lines is the distance to the Cloud.
// tools/cepheids/build_ceph.py makes the data and every fitted number.

const DATA_URL = '/data/cepheids/';
const PHASES = [['cloud', 14], ['law', 13], ['galaxy', 13], ['calib', 16]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const DAYS_PER_S = 2;
const SKY = 0.62;                       // scene units per degree on the sky
const KPC = 1.25;                       // scene units per kpc around the Sun
const CW = 9, CH = 6;
const LPR = [-0.05, 2.15];              // log10 P (days) across the chart
const JD_GAIA = 2455197.5;              // Gaia's time origin
const LIVE = { d: null };

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aLP;        // log P, magnitude (apparent W for the Cloud, absolute W for the Milky Way), amplitude A1, kind (0 LMC, 1 MW)
  attribute vec4 aShape;     // R21, R31, phi21, phi31
  attribute vec2 aPh;        // phase at time 0, phase of maximum light in the shape
  uniform float uDays, uChart, uPx, uShift, uShowL, uShowM, uMagRef;
  uniform vec4 uBox;         // x0, y0, w, h
  uniform vec4 uRange;       // log P min, max; magnitude at bottom, at top
  varying vec3 vCol;
  varying float vA;
  void main() {
    float lp = aLP.x, mag = aLP.y, A1 = aLP.z, mw = aLP.w;
    float P = pow(10.0, lp);
    float ph = fract(uDays / P - aPh.x) + aPh.y;
    float TAU = 6.2831853;
    float dm = A1 * (cos(TAU * ph) + aShape.x * cos(2.0 * TAU * ph + aShape.z) + aShape.y * cos(3.0 * TAU * ph + aShape.w));
    float pulse = pow(10.0, -0.4 * dm);                  // flux relative to the mean
    float m = mw > 0.5 ? mag : mag - uShift;
    vec3 chart = vec3(uBox.x + (lp - uRange.x) / (uRange.y - uRange.x) * uBox.z,
                      uBox.y + (m - uRange.z) / (uRange.w - uRange.z) * uBox.w, 0.0);
    vec3 p = mix(aPos, chart, uChart);
    float show = mw > 0.5 ? uShowM : uShowL;
    // brighter on the sky the brighter the star (mean flux), and always the pulse
    float lum = mw > 0.5 ? pow(10.0, -0.4 * (mag + 4.0)) : pow(10.0, -0.4 * (mag - uMagRef));
    float base = mix(clamp(0.35 + 0.65 * sqrt(lum), 0.3, 2.2), 0.9, uChart);
    vA = show * base * pulse;
    vCol = mw > 0.5 ? vec3(0.55, 0.85, 1.0) : mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.95, 0.85), clamp(lp - 0.5, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = show < 0.01 ? 0.0 : uPx * (0.75 + 0.45 * pulse) * mix(0.8 + 0.5 * clamp(lp, 0.0, 2.0), 1.0, uChart) * (mw > 0.5 ? 1.35 : 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * (exp(-r2 * 3.0) + 0.08), 1.0);
  }`;

export default {
  name: 'The Cosmic Yardstick',
  description:
    "Cepheid variable stars from Gaia: 2201 in the Large Magellanic Cloud, each brightening and fading with its own measured period and " +
    'light-curve shape. The slower they pulse, the brighter they are — Henrietta Leavitt\'s law. 245 Cepheids in our own Galaxy, ' +
    "with distances from Gaia's parallaxes, fix how bright that really is, and the difference gives the distance to the Cloud: about 50 kpc. " +
    'Data: Gaia DR3 (ESA/Gaia/DPAC; Ripepi et al. 2023).',
  tags: ['cepheids', 'gaia', 'distance ladder', 'leavitt law', 'magellanic cloud', 'real data', 'parallax'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'cloud', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading Gaia\'s Cepheids…}';
    const M = d.meta;
    if (m.phase === 'cloud')
      return `\\begin{aligned}&${hl(M.nLMC, 0)}\\ \\text{Cepheids in the Large Magellanic Cloud} \\\\ &\\text{each pulsing at its own period (1 s = ${DAYS_PER_S} days)} \\\\ &\\text{with the light-curve shape Gaia measured} \\\\ &\\text{and the phase it is at today}\\end{aligned}`;
    if (m.phase === 'law')
      return `\\begin{aligned}&W = G - 1.90\\,(B_P - R_P)\\text{: brightness, dust cancelled} \\\\ &W = ${hl(M.lmc.a, 2)} ${hl(M.lmc.b, 2)}\\,\\log_{10} P_{\\rm days} \\\\ &\\text{scatter } ${hl(M.lmc.sd, 3)}\\ \\text{mag: slower means brighter} \\\\ &\\text{Leavitt, 1912: 25 Cepheids in the Small Cloud}\\end{aligned}`;
    if (m.phase === 'galaxy')
      return `\\begin{aligned}&${hl(M.nMW, 0)}\\ \\text{Milky Way Cepheids, parallax } \\varpi \\text{ to 5\\%} \\\\ &d = 1/\\varpi\\text{: out to } ${hl(M.mw.dmax, 1)}\\ \\text{kpc around the Sun} \\\\ &\\varpi\\ \\text{corrected by Gaia's zero point, } ${(M.mw.zp * 1000).toFixed(0)}\\ \\mu\\text{as} \\\\ &M = W + 5 \\log_{10} \\varpi_{\\rm mas} - 10 \\end{aligned}`;
    const k = m.u * m.len;
    if (k < 9)
      return `\\begin{aligned}&\\text{nearby: } M = ${hl(M.mw.a, 2)} ${M.lmc.b.toFixed(2)} \\log_{10} P,\\ \\pm ${M.mw.sd.toFixed(2)} \\\\ &\\text{the Cloud's are fainter by } \\mu = ${hl(M.mu, 2)} \\\\ &d = 10^{\\mu/5 + 1}\\ \\text{pc} = ${hl(M.kpc, 1)}\\ \\text{kpc} \\\\ &\\text{(light that left 170,000 years ago)}\\end{aligned}`;
    return `\\begin{aligned}&\\text{metal-poor Cepheids are slightly fainter:} \\\\ &\\gamma\\,\\Delta[\\text{Fe/H}] = (${M.gamma})(${M.dFe}) = ${hl(M.gamma * M.dFe, 2)}\\ \\text{mag} \\\\ &\\mu = ${hl(M.muZ, 2)},\\ d = ${hl(M.kpcZ, 1)}\\ \\text{kpc} \\\\ &\\text{eclipsing binaries: } ${M.kpcEB}\\ \\text{kpc}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x010103);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 1600, width: 1.3 });
    ctx.scene.add(lines.object);
    Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'ceph.bin').then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
      if (s.disposed) return;
      const f = new Float32Array(buf), S = meta.stride, n = f.length / S;
      const pos = new Float32Array(n * 3), lp = new Float32Array(n * 4), sh = new Float32Array(n * 4), ph = new Float32Array(n * 2);
      const TAU = Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const o = i * S, mw = i >= meta.nLMC;
        if (mw) { pos[i * 3] = f[o] * KPC; pos[i * 3 + 1] = f[o + 2] * KPC; pos[i * 3 + 2] = -f[o + 1] * KPC; }
        else { pos[i * 3] = f[o] * SKY; pos[i * 3 + 1] = f[o + 1] * SKY; pos[i * 3 + 2] = 0; }
        const [r21, r31, p21, p31] = [f[o + 6], f[o + 7], f[o + 8], f[o + 9]];
        // the shape's peak-to-peak and where its maximum light (smallest magnitude) falls
        let lo = Infinity, hi = -Infinity, at = 0;
        for (let q = 0; q < 96; q++) {
          const x = q / 96, v = Math.cos(TAU * x) + r21 * Math.cos(2 * TAU * x + p21) + r31 * Math.cos(3 * TAU * x + p31);
          if (v < lo) { lo = v; at = x; }
          if (v > hi) hi = v;
        }
        lp[i * 4] = f[o + 3]; lp[i * 4 + 1] = f[o + 4]; lp[i * 4 + 2] = f[o + 5] / Math.max(0.3, hi - lo); lp[i * 4 + 3] = mw ? 1 : 0;
        sh[i * 4] = r21; sh[i * 4 + 1] = r31; sh[i * 4 + 2] = p21; sh[i * 4 + 3] = p31;
        ph[i * 2] = f[o + 10]; ph[i * 2 + 1] = at;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aPos', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aLP', new THREE.BufferAttribute(lp, 4));
      g.setAttribute('aShape', new THREE.BufferAttribute(sh, 4));
      g.setAttribute('aPh', new THREE.BufferAttribute(ph, 2));
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uDays: { value: 0 }, uChart: { value: 0 }, uPx: { value: 5 }, uShift: { value: 0 }, uShowL: { value: 1 }, uShowM: { value: 0 }, uMagRef: { value: 13 },
          uBox: { value: new THREE.Vector4(-CW / 2, -CH / 2, CW, CH) }, uRange: { value: new THREE.Vector4(LPR[0], LPR[1], 17, 10) },
        },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      s.geo = g; s.meta = meta;
      // today's date in Gaia's time, so the phases are the real ones now
      s.day0 = Date.now() / 86400000 + 2440587.5 - JD_GAIA;
      LIVE.d = { meta }; s.ready = true;
    }).catch((err) => console.error('cepheid data', err));
    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), a: new THREE.Vector3(), b: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); lines.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const local = m.u * m.len;

    // ---------- what is shown ----------
    const ramp = (a, b) => smooth(Math.min(1, Math.max(0, (local - a) / (b - a))));
    let chart = 0, gal = 0, showL = 1, showM = 0, shift = 0;
    // y range of the chart (magnitude at bottom, at top) and its blend
    let yr = [17, 10];
    const M = s.ready ? s.meta : null;
    if (m.phase === 'cloud') { showL = ramp(0, 1.5); }
    else if (m.phase === 'law') { chart = ramp(0.5, 3); showL = 1 - ramp(m.len - 1, m.len); }
    else if (m.phase === 'galaxy') { gal = 1; showL = 0; showM = ramp(0, 1.5) * (1 - ramp(m.len - 0.8, m.len)); }
    else {
      chart = 1; showL = ramp(0.3, 1.5); showM = ramp(0.3, 1.5);
      // both lines on one chart 26 magnitudes tall, then the Cloud's slides up by mu, then zoom in
      const mu = M ? M.mu : 18.6, muZ = M ? M.muZ : 18.48;
      shift = mu * ramp(3.5, 6.5) + (muZ - mu) * ramp(9.5, 11);
      const z = ramp(6.5, 8.5);
      yr = [17 * (1 - z) + -1 * z, -9.5];
      if (local > m.len - 1) { const o = ramp(m.len - 1, m.len); showL *= 1 - o; showM *= 1 - o; }
    }
    if (m.phase === 'law') yr = [17, 10];

    // ---------- camera ----------
    const ox = portrait ? 0 : 2.3, oy = portrait ? 0.5 : -0.4;
    const fitSky = portrait ? 4.6 / (aspect * th) : 5.2 / th;
    const fitChart = portrait ? (CW * 0.6) / (aspect * th) : (CH * 0.95) / th;
    const dSky = fitSky, dChart = fitChart;
    // sky and chart are seen face-on; the Milky Way from above at an angle, turning
    state.a.set(chart * ox, chart * oy + (1 - chart) * (portrait ? 0.9 : 0), dSky * (1 - chart) + dChart * chart);
    const az = 0.5 + ctx.time * 0.05, el = THREE.MathUtils.degToRad(35), dg = portrait ? 7 / (aspect * th) : 7 / th;
    state.b.set(Math.sin(az) * Math.cos(el) * dg, Math.sin(el) * dg, Math.cos(az) * Math.cos(el) * dg);
    const gk = m.phase === 'galaxy' ? smooth(Math.min(1, local / 1.5)) * (1 - smooth(Math.max(0, (local - m.len + 1.5) / 1.5))) : 0;
    cam.position.copy(state.a).lerp(state.b, gk);
    v.set(state.a.x, state.a.y, 0).multiplyScalar(1 - gk);
    if (gk > 0) v.y += gk * (portrait ? 0.6 : 0.5);
    cam.up.set(0, 1, 0);
    cam.lookAt(v);
    if (!s.ready) { lines.commit(); return; }
    const U = s.mat.uniforms;
    U.uDays.value = s.day0 + ctx.time * DAYS_PER_S;
    U.uChart.value = chart; U.uShowL.value = showL; U.uShowM.value = showM; U.uShift.value = shift;
    U.uRange.value.set(LPR[0], LPR[1], yr[0], yr[1]);
    U.uPx.value = Math.max(3, Math.min(width, height) / 170);

    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, z0, x1, y1, z1, hex, k) => { v.set(x0, y0, z0); w.set(x1, y1, z1); lines.push(v, w, col(hex, k)); };
    const GREY = 0x8a93a6, GOLD = 0xffc46b, BLUE = 0x8cd8ff;
    // ---------- the Milky Way: rings round the Sun, the way to the Galactic centre ----------
    if (gk > 0.01) {
      for (let R = 1; R <= 5; R++) for (let q = 0; q < 96; q++) {
        const a0 = (q / 96) * Math.PI * 2, a1 = ((q + 1) / 96) * Math.PI * 2;
        seg(Math.cos(a0) * R * KPC, 0, Math.sin(a0) * R * KPC, Math.cos(a1) * R * KPC, 0, Math.sin(a1) * R * KPC, 0x3a4a66, 0.5 * gk);
      }
      for (let q = 0; q < 14; q += 2) seg(q * 0.5 * KPC, 0, 0, (q + 1) * 0.5 * KPC, 0, 0, GOLD, 0.45 * gk);
      const e = 0.15;
      seg(-e, 0, 0, e, 0, 0, 0xffd166, gk); seg(0, 0, -e, 0, 0, e, 0xffd166, gk); seg(0, -e, 0, 0, e, 0, 0xffd166, gk);
    }
    // ---------- the chart ----------
    if (chart > 0.3) {
      const k = (chart - 0.3) / 0.7;
      const X = (lp) => -CW / 2 + ((lp - LPR[0]) / (LPR[1] - LPR[0])) * CW;
      const Y = (mg) => -CH / 2 + ((mg - yr[0]) / (yr[1] - yr[0])) * CH;
      const inY = (mg) => (mg - yr[0]) / (yr[1] - yr[0]) >= -1e-6 && (mg - yr[0]) / (yr[1] - yr[0]) <= 1 + 1e-6;
      seg(X(LPR[0]), -CH / 2, 0, X(LPR[1]), -CH / 2, 0, GREY, 0.8 * k); seg(X(LPR[0]), -CH / 2, 0, X(LPR[0]), CH / 2, 0, GREY, 0.8 * k);
      for (const P of [1, 2, 5, 10, 20, 50, 100]) seg(X(Math.log10(P)), -CH / 2, 0, X(Math.log10(P)), -CH / 2 - (P === 1 || P === 10 || P === 100 ? 0.16 : 0.09), 0, GREY, 0.7 * k);
      const step = Math.abs(yr[1] - yr[0]) > 12 ? 5 : 1;
      for (let mg = Math.ceil(Math.min(...yr)); mg <= Math.max(...yr); mg++) if (mg % step === 0) seg(X(LPR[0]), Y(mg), 0, X(LPR[0]) - 0.1, Y(mg), 0, GREY, 0.5 * k);
      const law = (a, b, hex, kk, dash) => {
        let p = null;
        for (let q = 0; q <= 60; q++) {
          const lp = LPR[0] + (q / 60) * (LPR[1] - LPR[0]), mg = a + b * lp;
          const cur = inY(mg) ? [X(lp), Y(mg)] : null;
          if (p && cur && (!dash || q % 2)) seg(p[0], p[1], 0.01, cur[0], cur[1], 0.01, hex, kk);
          p = cur;
        }
      };
      if (m.phase === 'law') law(M.lmc.a, M.lmc.b, 0xffffff, 0.7 * ramp(5, 7) * showL, true);
      if (m.phase === 'calib') {
        law(M.mw.a, M.lmc.b, BLUE, 0.6 * ramp(1.5, 3) * showM, true);
        law(M.lmc.a - shift, M.lmc.b, GOLD, 0.6 * ramp(1.5, 3) * showL, true);
        // the gap, while both lines are on the chart
        const gapK = ramp(2, 3) * (1 - ramp(6, 7));
        if (gapK > 0.01) {
          const lp = 1.6, top = M.mw.a + M.lmc.b * lp, bot = M.lmc.a - shift + M.lmc.b * lp;
          if (bot - top > 0.5) {
            seg(X(lp), Y(top), 0.01, X(lp), Y(bot), 0.01, 0xffffff, 0.8 * gapK);
            for (const yy of [top, bot]) seg(X(lp) - 0.12, Y(yy), 0.01, X(lp) + 0.12, Y(yy), 0.01, 0xffffff, 0.8 * gapK);
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
    if (s.geo) { s.geo.dispose(); s.mat.dispose(); ctx.scene.remove(s.points); }
    LIVE.d = null;
  },
};
