import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// Six Thousand Worlds. Every confirmed exoplanet in the NASA Exoplanet Archive, appearing in the sky in the year
// it was found, coloured by how it was found. Then the same dots fly into four charts, each measured from this
// data: the radius valley (rocky cores vs cores that kept their gas), the mass-radius relation (from planets whose
// mass was actually measured), the habitable zone (Kopparapu et al. 2014), and what each method can and can't see.
// tools/exoplanets/build_exo.py makes the data and every fitted number.

const DATA_URL = '/data/exoplanets/';
const PHASES = [['census', 24], ['valley', 16], ['massRadius', 14], ['hz', 15], ['methods', 15]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const CW = 9, CH = 6;
const SKY = 1.3;                       // scene units per decade of distance (pc), from the Sun
const Y0 = 1991.6, Y1 = 2027.0;       // the census counts years from Y0 to Y1
// chart axes: [x quantity range], [y quantity range]
const AX = {
  valley: { x: [-0.5, 3.7], y: [-0.45, 1.4] },          // log P (days), log R (Earth radii)
  massRadius: { x: [-0.7, 4.0], y: [-0.45, 1.4] },      // log M (Earth masses), log R
  hz: { x: [2.6, -1.6], y: [2400, 7300] },              // log insolation (Earth = 0), reversed; star temperature (K)
  methods: { x: [-2.2, 3.4], y: [-0.7, 4.3] },          // log a (AU), log M
};
const LAYOUTS = ['sky', 'valley', 'massRadius', 'hz', 'methods'];
// Solar System, for scale: P (d), a (AU), R, M (Earth = 1), insolation
const SOLAR = [
  ['Mercury', 87.97, 0.387, 0.383, 0.0553, 6.67], ['Venus', 224.7, 0.723, 0.949, 0.815, 1.91], ['Earth', 365.25, 1, 1, 1, 1],
  ['Mars', 687, 1.524, 0.532, 0.107, 0.431], ['Jupiter', 4333, 5.203, 11.21, 317.8, 0.037], ['Saturn', 10759, 9.537, 9.45, 95.2, 0.011],
  ['Uranus', 30687, 19.19, 4.01, 14.5, 0.0027], ['Neptune', 60190, 30.07, 3.88, 17.1, 0.0011],
];
const METHOD_COL = [0x5cd2ff, 0xff9a3c, 0xf06ae6, 0x6dff8a, 0x5cd2ff];   // transit, wobble (RV), microlensing, imaging, other
const LIVE = { d: null, year: Y0 };

const VERT = /* glsl */ `
  attribute vec3 aP0, aP1, aP2, aP3, aP4;   // position in each layout
  attribute vec4 aVal;                      // shown in layouts 1-4 (the sky shows everything)
  attribute vec4 aInfo;                     // method, year it appears (with a spread inside the year), size, flags
  attribute vec3 aCol;
  uniform float uA, uB, uK, uYear, uPx, uHz, uFade, uChart;
  varying vec3 vCol;
  varying float vA;
  vec3 at(float i) { return i < 0.5 ? aP0 : i < 1.5 ? aP1 : i < 2.5 ? aP2 : i < 3.5 ? aP3 : aP4; }
  float ok(float i) { return i < 0.5 ? 1.0 : i < 1.5 ? aVal.x : i < 2.5 ? aVal.y : i < 3.5 ? aVal.z : aVal.w; }
  void main() {
    vec3 p = mix(at(uA), at(uB), uK);
    float shown = mix(ok(uA), ok(uB), uK);
    float age = uYear - aInfo.y;
    float born = step(0.0, age);
    float flash = 1.0 + 4.0 * exp(-max(age, 0.0) * 5.0);
    float f = aInfo.w;
    float hzSmall = step(7.5, f), hzIn = step(3.5, mod(f, 8.0));
    float hz = mix(1.0, mix(0.22, 1.0, max(hzIn, hzSmall)), uHz);
    vCol = mix(aCol, vec3(1.0, 0.82, 0.35), hzSmall * uHz);
    vA = born * shown * hz * uFade * mix(flash, 1.0, uChart) * mix(0.9, 0.6, uChart);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = mix(0.7 + 0.32 * aInfo.z, 1.0, uChart * 0.6) * (1.0 + 1.3 * hzSmall * uHz);
    gl_PointSize = vA < 0.002 ? 0.0 : uPx * size * mix(flash, 1.0, 0.7);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * (exp(-r2 * 2.5) + 0.1), 1.0);
  }`;

// equatorial (J2000) → galactic unit vector, then scene axes: Galactic plane horizontal, centre along +x
const EQ2GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.444829630, 0.7469822445], [-0.867666149, -0.1980763734, 0.4559837762]];
function skyPos(ra, dec, dpc, out) {
  const a = THREE.MathUtils.degToRad(ra), d = THREE.MathUtils.degToRad(dec);
  const e = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const g = EQ2GAL.map((r) => r[0] * e[0] + r[1] * e[1] + r[2] * e[2]);
  const r = SKY * Math.log10(Math.max(1.2, dpc));
  out[0] = g[0] * r; out[1] = g[2] * r; out[2] = -g[1] * r;
}
const chartX = (k, v) => -CW / 2 + ((v - AX[k].x[0]) / (AX[k].x[1] - AX[k].x[0])) * CW;
const chartY = (k, v) => -CH / 2 + ((v - AX[k].y[0]) / (AX[k].y[1] - AX[k].y[0])) * CH;
const inside = (k, x, y) => Number.isFinite(x) && Number.isFinite(y) && (x - AX[k].x[0]) * (x - AX[k].x[1]) <= 0 && (y - AX[k].y[0]) * (y - AX[k].y[1]) <= 0;
// Kopparapu et al. (2014) effective insolation of a habitable-zone edge for a star of temperature T
const seff = (c, T) => { const t = T - 5780; return c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4; };

export default {
  name: 'Six Thousand Worlds',
  description:
    'Every confirmed planet around another star — 6,412 of them — appearing in the sky in the year it was found, coloured by how it was found ' +
    '(blue: it crossed its star; orange: it made its star wobble; pink: it bent a background star\'s light; green: photographed). Then the dots ' +
    'become four charts measured from the same table: a gap in planet sizes near 1.6 Earth radii, how radius grows with mass, which planets ' +
    'get Earth-like sunlight, and what each method can and cannot see. Data: NASA Exoplanet Archive (NASA/Caltech-IPAC).',
  tags: ['exoplanets', 'radius valley', 'habitable zone', 'mass-radius', 'kepler', 'tess', 'real data'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'census', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading the Exoplanet Archive…}';
    const M = d.meta, k = m.u * m.len;
    if (m.phase === 'census') {
      const y = Math.min(2026, Math.max(1992, Math.floor(LIVE.year)));
      const c = d.countBy(LIVE.year);
      return `\\begin{aligned}&${hl(y, 0)}:\\ ${hl(c.all, 0)}\\ \\text{planets known} \\\\ &\\textcolor{#5cd2ff}{\\text{transit}}\\ ${c[0]}\\quad \\textcolor{#ff9a3c}{\\text{wobble}}\\ ${c[1]} \\\\ &\\textcolor{#f06ae6}{\\text{lensing}}\\ ${c[2]}\\quad \\textcolor{#6dff8a}{\\text{imaged}}\\ ${c[3]} \\\\ &\\text{distance from the Sun: } \\log_{10} d_{\\rm pc}\\end{aligned}`;
    }
    if (m.phase === 'valley') {
      const V = M.valley;
      if (k < 8) return `\\begin{aligned}&\\text{size vs. orbit, } ${hl(V.n, 0)}\\ \\text{radii known to 10\\%} \\\\ &\\text{almost none: big planets very close in} \\\\ &\\text{(the hot-Neptune desert)} \\\\ &\\text{and a gap between two sizes} \\\\ &\\rightarrow \\text{orbit period (log)}\\quad \\uparrow \\text{radius}\\end{aligned}`;
      return `\\begin{aligned}&R_{\\rm gap} \\propto P^{\\,m},\\quad m = ${hl(V.m, 3)} \\\\ &\\text{peaks } ${hl(V.peak1, 2)}\\ \\&\\ ${hl(V.peak2, 2)}\\,R_\\oplus,\\ \\text{gap } ${hl(V.valley, 2)}\\,R_\\oplus \\\\ &\\text{bare rock below, gas envelopes above} \\\\ &\\text{Fulton 2017: 1.3, 2.4;\\ Van Eylen 2018: } m = -0.09\\end{aligned}`;
    }
    if (m.phase === 'massRadius') {
      const R = M.mr;
      return `\\begin{aligned}&R \\propto M^{s}\\text{, ${R.n} measured masses:} \\\\ &s = ${hl(R.s[0], 2)} \\to ${hl(R.s[1], 2)} \\to ${hl(R.s[2], 2)} \\\\ &\\text{breaks at } ${hl(R.breaks[0], 0)}\\ \\&\\ ${hl(R.breaks[1], 0)}\\,M_\\oplus\\text{, scatter } ${hl(R.scatter, 2)}\\ \\text{dex} \\\\ &\\text{Chen \\& Kipping 2017: } 0.28,\\ 0.59,\\ {-0.04} \\\\ &\\rightarrow \\text{mass (log)}\\quad \\uparrow \\text{radius}\\end{aligned}`;
    }
    if (m.phase === 'hz') {
      const H = M.hz;
      if (k < 6) return `\\begin{aligned}&\\text{starlight } S \\text{ vs. star temperature} \\\\ &S_{\\rm edge} = S_0 + aT + bT^2 + cT^3 + dT^4 \\\\ &T = T_\\star - 5780\\,\\text{K}\\quad\\text{(Kopparapu 2014)} \\\\ &\\text{Earth: } S = 1,\\ T_\\star = 5772\\,\\text{K} \\\\ &\\rightarrow \\text{less starlight}\\quad \\uparrow \\text{hotter star}\\end{aligned}`;
      return `\\begin{aligned}&${hl(H.cons, 0)}\\ \\text{planets in the conservative zone} \\\\ &\\textcolor{#ffd166}{${H.consSmall}\\ \\text{smaller than } 1.6\\,R_\\oplus} \\\\ &\\text{TRAPPIST-1 e, f, g;\\ Proxima b;\\ TOI-700 d} \\\\ &\\text{(${H.opt} in the wider, optimistic zone)}\\end{aligned}`;
    }
    if (k < 8) return `\\begin{aligned}&\\text{mass vs. orbit size: each method} \\\\ &\\textcolor{#5cd2ff}{\\text{transit}}\\text{: close in}\\quad \\textcolor{#ff9a3c}{\\text{wobble}}\\text{: heavy} \\\\ &\\textcolor{#f06ae6}{\\text{lensing}}\\text{: cold, thousands of pc} \\\\ &\\textcolor{#6dff8a}{\\text{imaging}}\\text{: young, hot, far out} \\\\ &\\rightarrow \\text{orbit size (log)}\\quad \\uparrow \\text{mass}\\end{aligned}`;
    return `\\begin{aligned}&\\text{rings: our Solar System} \\\\ &\\text{Jupiter's twin: barely in reach} \\\\ &\\text{Earth's twin: still almost empty} \\\\ &\\text{found so far: what's easy to find}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.05; cam.far = 300; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x010103);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 6000, width: 1.3 });
    ctx.scene.add(lines.object);
    const dots = createDots({ maxPoints: 64 });
    ctx.scene.add(dots.object);
    Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'exo.bin').then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
      if (s.disposed) return;
      const f = new Float32Array(buf), S = meta.stride, n = f.length / S;
      const P = LAYOUTS.map(() => new Float32Array(n * 3));
      const val = new Float32Array(n * 4), info = new Float32Array(n * 4), colA = new Float32Array(n * 3);
      const H = meta.hz.coef, cc = new THREE.Color(), tmp = [0, 0, 0];
      const years = new Float32Array(n), method = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * S;
        const [ra, dec, dist, mth, yr, lP, lR, lM, mk, lS, Teff, flags, la] = f.subarray(o, o + S);
        skyPos(ra, dec, dist, tmp);
        P[0].set(tmp, i * 3);
        const radiusMeasured = mth === 0 || mth === 4;           // transit or transit timing: the radius is measured
        const q = {
          valley: radiusMeasured ? [lP, lR] : null,
          massRadius: radiusMeasured && mk === 1 ? [lM, lR] : null,
          hz: [lS, Teff],
          methods: mk > 0 ? [la, lM] : null,
        };
        for (let L = 1; L < LAYOUTS.length; L++) {
          const k = LAYOUTS[L], v = q[k];
          const ok = v && inside(k, v[0], v[1]);
          if (ok) P[L].set([chartX(k, v[0]), chartY(k, v[1]), 0], i * 3);
          else P[L].set(P[L - 1].subarray(i * 3, i * 3 + 3), i * 3);   // not on this chart: stay where it was, faded out
          val[i * 4 + L - 1] = ok ? 1 : 0;
        }
        // habitable zone flags (also in the builder): 4 = conservative zone, 8 = conservative and smaller than 1.6 Earth radii
        const Sx = 10 ** lS, inHz = Teff > 2500 && Teff < 7200 && Sx <= seff(H.runaway, Teff) && Sx >= seff(H.maxGreenhouse, Teff);
        const small = Number.isFinite(lR) && 10 ** lR < 1.6;
        const spread = ((i * 0.6180339887) % 1) * 0.999;
        years[i] = yr + spread; method[i] = mth;
        info.set([mth, yr + spread, Number.isFinite(lR) ? Math.min(1.6, Math.max(0, lR + 0.2)) : 0.5, (inHz ? 4 : 0) + (inHz && small ? 4 : 0)], i * 4);
        cc.set(METHOD_COL[Math.min(4, mth)]);
        colA.set([cc.r, cc.g, cc.b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      P.forEach((arr, L) => g.setAttribute('aP' + L, new THREE.BufferAttribute(arr, 3)));
      g.setAttribute('aVal', new THREE.BufferAttribute(val, 4));
      g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
      g.setAttribute('aCol', new THREE.BufferAttribute(colA, 3));
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uA: { value: 0 }, uB: { value: 0 }, uK: { value: 0 }, uYear: { value: Y0 }, uPx: { value: 5 }, uHz: { value: 0 }, uFade: { value: 1 }, uChart: { value: 0 } },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      s.geo = g; s.meta = meta;
      // running counts per method for the census text: sorted appearance times
      const order = Array.from(years.keys()).sort((a, b) => years[a] - years[b]);
      const sortedYears = Float32Array.from(order, (i) => years[i]);
      const cumul = [0, 1, 2, 3].map(() => new Uint16Array(n + 1));
      order.forEach((i, j) => { for (let c = 0; c < 4; c++) cumul[c][j + 1] = cumul[c][j] + (Math.min(4, method[i]) === c || (c === 0 && method[i] === 4) ? 1 : 0); });
      const countBy = (y) => {
        let lo = 0, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedYears[mid] <= y) lo = mid + 1; else hi = mid; }
        return { all: lo, 0: cumul[0][lo], 1: cumul[1][lo], 2: cumul[2][lo], 3: cumul[3][lo] };
      };
      LIVE.d = { meta, countBy }; s.ready = true;
    }).catch((err) => console.error('exoplanet data', err));
    return { s, lines, dots, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), a: new THREE.Vector3(), b: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, lines, dots, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); lines.reset(); dots.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const local = m.u * m.len;
    const ramp = (a, b) => smooth(Math.min(1, Math.max(0, (local - a) / (b - a))));

    // ---------- which layouts, and how far between them ----------
    let A = 0, B = 0, K = 0, year = Y1, hz = 0, fade = 1, toChart = 1;
    if (m.phase === 'census') { year = Y0 + (Y1 - Y0) * ramp(1.2, 19); toChart = 0; }
    else if (m.phase === 'valley') { A = 0; B = 1; K = ramp(0.3, 3.3); toChart = K; }
    else if (m.phase === 'massRadius') { A = 1; B = 2; K = ramp(0, 2.5); }
    else if (m.phase === 'hz') { A = 2; B = 3; K = ramp(0, 2.5); hz = ramp(6, 7.5); }
    else {
      A = 3; B = 4; K = ramp(0, 2.5);
      const back = ramp(m.len - 3, m.len - 0.6);                  // back to the sky for the next census
      if (back > 0) { A = 4; B = 0; K = back; toChart = 1 - back; }
      fade = 1 - ramp(m.len - 0.6, m.len);
    }
    LIVE.year = year;

    // ---------- camera: orbiting the sky, face-on for the charts ----------
    const fitSky = portrait ? 5.0 / (aspect * th) : 6.6 / th;
    const az = 0.9 + ctx.time * 0.06, el = THREE.MathUtils.degToRad(22);
    state.a.set(Math.sin(az) * Math.cos(el) * fitSky, Math.sin(el) * fitSky, Math.cos(az) * Math.cos(el) * fitSky);
    const ox = portrait ? 0.75 : 1.9, oy = portrait ? 1.1 : 0.45;
    const dChart = portrait ? (CW * 0.64) / (aspect * th) : (CH * 0.98) / th;
    state.b.set(ox, oy, dChart);
    cam.position.copy(state.a).lerp(state.b, toChart);
    v.set(0, 0, 0).lerp(w.set(ox, oy, 0), toChart);
    cam.up.set(0, 1, 0);
    cam.lookAt(v);
    if (!s.ready) { lines.commit(); dots.commit(); return; }

    const U = s.mat.uniforms;
    U.uA.value = A; U.uB.value = B; U.uK.value = K; U.uYear.value = year; U.uHz.value = hz; U.uFade.value = fade; U.uChart.value = toChart;
    U.uPx.value = Math.max(2.5, Math.min(width, height) / 210);
    const px = dChart * th * 2 / height;                            // scene units per pixel on the chart plane

    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, z0, x1, y1, z1, hex, k) => { v.set(x0, y0, z0); w.set(x1, y1, z1); lines.push(v, w, col(hex, k)); };
    const GREY = 0x8a93a6;

    // ---------- sky: distance rings and the Galactic centre direction ----------
    const skyK = 1 - toChart;
    if (skyK > 0.02) {
      for (const [dpc, k] of [[10, 0.5], [100, 0.4], [1000, 0.3]]) {
        const R = SKY * Math.log10(dpc);
        for (let q = 0; q < 120; q++) {
          const a0 = (q / 120) * Math.PI * 2, a1 = ((q + 1) / 120) * Math.PI * 2;
          seg(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R, 0x3a4a66, k * skyK);
        }
      }
      for (let q = 0; q < 10; q += 2) seg(q * 0.5, 0, 0, (q + 1) * 0.5, 0, 0, 0xffc46b, 0.35 * skyK);   // toward the Galactic centre
      dots.push(v.set(0, 0, 0), col(0xffd166, skyK), 0.09);
    }

    // ---------- charts ----------
    const chartK = toChart;
    const key = LAYOUTS[K > 0.5 ? B : A];
    if (chartK > 0.25 && key !== 'sky') {
      const k = Math.min(1, (chartK - 0.25) / 0.6) * fade;
      const X = (x) => chartX(key, x), Y = (y) => chartY(key, y);
      seg(-CW / 2, -CH / 2, 0, CW / 2, -CH / 2, 0, GREY, 0.8 * k); seg(-CW / 2, -CH / 2, 0, -CW / 2, CH / 2, 0, GREY, 0.8 * k);
      const ax = AX[key];
      // log ticks: every decade long, 2 and 5 short
      const logTicks = (lo, hi, fn) => { for (let e = Math.floor(Math.min(lo, hi)); e <= Math.ceil(Math.max(lo, hi)); e++) for (const mlt of [1, 2, 5]) { const t = e + Math.log10(mlt); if ((t - lo) * (t - hi) <= 0) fn(t, mlt === 1); } };
      logTicks(ax.x[0], ax.x[1], (t, big) => seg(X(t), -CH / 2, 0, X(t), -CH / 2 - (big ? 0.16 : 0.08), 0, GREY, 0.7 * k));
      if (key === 'hz') for (let T = 2500; T <= 7000; T += 500) seg(-CW / 2, Y(T), 0, -CW / 2 - (T % 1000 ? 0.08 : 0.16), Y(T), 0, GREY, 0.6 * k);
      else logTicks(ax.y[0], ax.y[1], (t, big) => seg(-CW / 2, Y(t), 0, -CW / 2 - (big ? 0.16 : 0.08), Y(t), 0, GREY, 0.6 * k));
      const M = s.meta;
      const curve = (fn, x0, x1, hex, kk, dash, nSeg = 80) => {
        let p = null;
        for (let q = 0; q <= nSeg; q++) {
          const x = x0 + (q / nSeg) * (x1 - x0), y = fn(x);
          const cur = inside(key, x, y) ? [X(x), Y(y)] : null;
          if (p && cur && (!dash || q % 2)) seg(p[0], p[1], 0.01, cur[0], cur[1], 0.01, hex, kk);
          p = cur;
        }
      };
      if (key === 'valley') {
        const V = M.valley, gk = ramp(7.5, 9.5) * k;
        // the gap: R = R_gap (P / 10 d)^m, over the periods it was measured on
        curve((lp) => Math.log10(V.valley) + V.m * (lp - 1), -0.3, 2, 0xffffff, 0.75 * gk, true, 60);
        // the size distribution along the tilt, at P = 10 d, drawn up the right-hand side
        const x0 = CW / 2 + 0.25, peak = Math.max(...V.kde);
        let prev = null;
        V.grid.forEach((q, j) => {
          const y = Y(q), x = x0 + (V.kde[j] / peak) * 1.3 * gk;
          if (q >= AX.valley.y[0] && q <= AX.valley.y[1]) { if (prev) seg(prev[0], prev[1], 0, x, y, 0, 0x5cd2ff, 0.9 * gk); prev = [x, y]; } else prev = null;
        });
        if (gk > 0.01) { seg(x0, -CH / 2, 0, x0, CH / 2, 0, GREY, 0.4 * gk); for (const r of [V.peak1, V.valley, V.peak2]) seg(x0 - 0.08, Y(Math.log10(r)), 0, x0 + 0.08, Y(Math.log10(r)), 0, 0xffffff, 0.8 * gk); }
        seg(X(1), -CH / 2, 0, X(1), -CH / 2 + 0.25, 0, 0xffffff, 0.5 * gk);   // P = 10 d
      }
      if (key === 'massRadius') {
        const R = M.mr, b1 = Math.log10(R.breaks[0]), b2 = Math.log10(R.breaks[1]);
        const ours = (x) => R.c + R.s[0] * x + (R.s[1] - R.s[0]) * Math.max(0, x - b1) + (R.s[2] - R.s[1]) * Math.max(0, x - b2);
        // Chen & Kipping (2017): R = 1.008 M^0.279 below 2.04 Me, then 0.589 to 131.6 Me, then -0.044 (continuous)
        const ck1 = Math.log10(2.04), ck2 = Math.log10(131.6);
        const ck = (x) => Math.log10(1.008) + 0.279 * Math.min(x, ck1) + 0.589 * Math.min(Math.max(0, x - ck1), ck2 - ck1) - 0.044 * Math.max(0, x - ck2);
        curve(ours, AX.massRadius.x[0], AX.massRadius.x[1], 0xffffff, 0.85 * ramp(3.5, 5.5) * k, false);
        curve(ck, AX.massRadius.x[0], AX.massRadius.x[1], 0xffc46b, 0.7 * ramp(7, 9) * k, true);
      }
      if (key === 'hz') {
        const H = M.hz.coef, bk = ramp(2, 4) * k;
        const edge = (name, hex, kk, dash) => {
          let p = null;
          for (let T = 2500; T <= 7200; T += 50) {
            const x = Math.log10(seff(H[name], T)), cur = [X(x), Y(T)];
            if (p && (!dash || (T / 50) % 2)) seg(p[0], p[1], 0.01, cur[0], cur[1], 0.01, hex, kk);
            p = cur;
          }
        };
        edge('runaway', 0x6dff8a, 0.8 * bk, false); edge('maxGreenhouse', 0x6dff8a, 0.8 * bk, false);
        edge('recentVenus', 0x6dff8a, 0.45 * bk, true); edge('earlyMars', 0x6dff8a, 0.45 * bk, true);
        for (let T = 2550; T <= 7150; T += 100) seg(X(Math.log10(seff(H.runaway, T))), Y(T), 0, X(Math.log10(seff(H.maxGreenhouse, T))), Y(T), 0, 0x6dff8a, 0.12 * bk);
      }
      // the Solar System, as rings
      const ringK = (key === 'methods' ? ramp(7, 9) : ramp(1.5, 3)) * k;
      if (ringK > 0.01) for (const [name, Pd, a, Rr, Mm, Si] of SOLAR) {
        const qv = { valley: [Math.log10(Pd), Math.log10(Rr)], massRadius: [Math.log10(Mm), Math.log10(Rr)], hz: [Math.log10(Si), 5772], methods: [Math.log10(a), Math.log10(Mm)] }[key];
        if (!inside(key, qv[0], qv[1])) continue;
        const cx = X(qv[0]), cy = Y(qv[1]), earth = name === 'Earth', r = (earth ? 11 : 7) * px;
        for (let q = 0; q < 24; q++) {
          const a0 = (q / 24) * Math.PI * 2, a1 = ((q + 1) / 24) * Math.PI * 2;
          seg(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.02, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.02, earth ? 0x9fd8ff : 0xffffff, (earth ? 1 : 0.7) * ringK);
        }
      }
    }
    lines.commit(); dots.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    state.lines.dispose(); state.dots.dispose?.();
    if (s.geo) { s.geo.dispose(); s.mat.dispose(); ctx.scene.remove(s.points); }
    LIVE.d = null;
  },
};
