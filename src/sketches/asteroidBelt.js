import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Every Asteroid We've Numbered. 895,910 numbered asteroids from NASA/JPL's Small-Body Database, each on
// its real orbit (osculating elements a, e, i, Ω, ω, M), moved with Kepler's equation in the vertex
// shader. The site ships the 247,020 that matter most to the eye (every one outside the main belt, and the
// brightest main-belt ones); every count and gap below uses all of them.
//   now        today's sky above the Sun: the belt, Jupiter's Trojans, the near-Earth ones
//   run        one Jupiter orbit (11.9 years) in a dozen seconds
//   corotate   the same, turning with Jupiter: the Trojan clouds and the Hilda triangle stand still
//   gaps       each asteroid moved to its orbit's average distance a: the Kirkwood gaps open as rings,
//              where Jupiter's resonances (3:1, 5:2, 7:3, 2:1) have cleared them
//   families   a against sin i: the families of fragments from old collisions
// tools/asteroids/build_ast.py makes the data and numbers.

const DATA_URL = '/data/asteroids/';
const PHASES = [['now', 9], ['run', 12], ['corotate', 13], ['gaps', 13], ['families', 11]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const DEG = Math.PI / 180;
const PJ = 4332.59;                          // Jupiter's period, days
const LIVE = { d: null };
// JPL approximate planetary elements (Standish), J2000 values and rates per century: a, e, i, L, ϖ, Ω
const PLANETS = [
  ['Mercury', [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], 0xb8b8b8],
  ['Venus', [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], 0xf2d49b],
  ['Earth', [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0], 0x7fd4ff],
  ['Mars', [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], 0xff7b54],
  ['Jupiter', [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [0, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], 0xffd8a8],
];

function planetAt(el, rate, jd, out) {
  const T = (jd - 2451545) / 36525;
  const [a, e, i, L, wb, om] = el.map((x, k) => x + rate[k] * T);
  const w = wb - om, M = ((((L - wb) % 360) + 540) % 360) - 180;
  let E = M * DEG;
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M * DEG) / (1 - e * Math.cos(E));
  return orbitToScene(a, e, i * DEG, om * DEG, w * DEG, E, out);
}
// from the orbit plane to the scene: ecliptic x → x, ecliptic y → −z, north → y
function orbitToScene(a, e, i, om, w, E, out) {
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(i), si = Math.sin(i);
  const x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
  const y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  return out.set(x, z, -y);
}

const VERT = /* glsl */ `
  attribute float aA;
  attribute vec4 aEl;        // e, i, node, peri (radians)
  attribute vec3 aMHC;       // mean anomaly at epoch, H, class
  uniform float uDays, uRot, uCirc, uPlane, uPx, uAmin, uAmax;
  varying vec3 vCol;
  varying float vA;
  vec3 classColour(float c, float a, float e, float inc) {
    if (c < 0.5 || c > 0.5 && c < 2.5) {
      if (a > 3.7 && a < 4.2 && e < 0.3 && inc < 0.35) return vec3(1.0, 0.6, 0.25);   // Hildas
      return vec3(0.55, 0.7, 1.0);                                                       // main belt
    }
    if (c < 3.5) return vec3(0.45, 1.0, 0.55);                // Jupiter Trojans
    if (c < 7.5) return vec3(1.0, 0.35, 0.3);                 // near-Earth: Apollo, Aten, Amor, Atira
    if (c < 8.5) return vec3(1.0, 0.55, 0.8);                 // Mars-crossers
    return vec3(0.75, 0.6, 1.0);                              // centaurs, trans-Neptunian
  }
  void main() {
    float a = aA, e = aEl.x, inc = aEl.y, om = aEl.z, w = aEl.w;
    float n = 0.0172020989 / (a * sqrt(a));                   // rad/day
    float M = mod(aMHC.x + n * uDays, 6.2831853);
    float E = e > 0.8 ? 3.14159265 : M;
    for (int k = 0; k < 7; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
    float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
    float cw = cos(w), sw = sin(w), co = cos(om), so = sin(om), ci = cos(inc), si = sin(inc);
    vec3 ecl = vec3((cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
                    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
                    sw * si * xp + cw * si * yp);
    // turn with Jupiter
    float cr = cos(uRot), sr = sin(uRot);
    ecl.xy = vec2(cr * ecl.x - sr * ecl.y, sr * ecl.x + cr * ecl.y);
    vec3 p = vec3(ecl.x, ecl.z, -ecl.y);
    // gaps: every asteroid at its average distance a, flat
    float r = length(p.xz);
    vec3 circ = vec3(p.x / max(r, 1e-4) * a, 0.0, p.z / max(r, 1e-4) * a);
    p = mix(p, circ, uCirc);
    // families: a across, sin i up (a flat chart in the ecliptic, seen from above)
    vec3 chart = vec3((a - 2.8) * 8.5, 0.0, -(sin(inc) - 0.2) * 20.0);
    p = mix(p, chart, uPlane);
    vCol = classColour(aMHC.z, a, e, inc);
    float H = aMHC.y;
    vA = clamp(1.4 - (H - 10.0) * 0.12, 0.25, 1.6);
    float inChart = uPlane > 0.0 ? step(uAmin, a) * step(a, uAmax) * step(sin(inc), 0.4) : 1.0;
    vA *= mix(1.0, inChart, uPlane);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * clamp(2.6 - (H - 9.0) * 0.18, 1.0, 4.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * (1.0 - r2) * 0.42, 1.0);
  }`;
const SUN_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() { float r = length(vUv - 0.5) * 2.0; float a = 0.9 / (1.0 + 220.0 * r * r) * smoothstep(1.0, 0.2, r); gl_FragColor = vec4(vec3(1.0, 0.85, 0.55) * a, 1.0); }`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

async function load() {
  const [meta, buf] = await Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'orbits.bin').then((r) => r.arrayBuffer())]);
  const n = buf.byteLength / 16, dv = new DataView(buf);
  const A = new Float32Array(n), El = new Float32Array(n * 4), MHC = new Float32Array(n * 3);
  const u = (o, s) => (dv.getUint16(o, true) / 65535) * s;
  for (let k = 0; k < n; k++) {
    const o = k * 16;
    A[k] = dv.getFloat32(o, true);
    El[k * 4] = u(o + 4, 1); El[k * 4 + 1] = u(o + 6, 180) * DEG; El[k * 4 + 2] = u(o + 8, 360) * DEG; El[k * 4 + 3] = u(o + 10, 360) * DEG;
    MHC[k * 3] = u(o + 12, 360) * DEG; MHC[k * 3 + 1] = dv.getUint8(o + 14) / 10; MHC[k * 3 + 2] = dv.getUint8(o + 15);
  }
  return { meta, n, A, El, MHC };
}

const jdNow = () => Date.now() / 86400000 + 2440587.5;
const dateOf = (jd) => new Date((jd - 2440587.5) * 86400000);

export default {
  name: "Every Asteroid We've Numbered",
  description:
    'Almost nine hundred thousand numbered asteroids from NASA/JPL, every one on its real orbit and where it ' +
    'is today, then run forward a Jupiter year: the Trojan clouds and the Hilda triangle hold still as you turn ' +
    'with Jupiter, the Kirkwood gaps open where its resonances cleared them, and old collision families stand ' +
    'out. Data: NASA/JPL Small-Body Database, from Minor Planet Center observations.',
  tags: ['asteroids', 'solar system', 'kirkwood gaps', 'trojans', 'orbital resonance', 'real data', 'kepler'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'now', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading 247,020 orbits…}';
    const M = d.meta, date = dateOf(LIVE.jd || jdNow()).toISOString().slice(0, 10);
    if (m.phase === 'now')
      return `\\begin{aligned}&M = E - e\\sin E\\quad \\text{(Kepler's equation, every frame)} \\\\ &${hl(M.count, 0)}\\ \\text{numbered; drawn: } ${hl(M.shipped, 0)},\\ \\text{as of ${date}} \\\\ &{\\color{#8cb3ff}\\text{main belt}}\\ ${hl(M.mainBelt, 0)},\\ {\\color{#73ff8c}\\text{Trojans}}\\ ${hl(M.classCounts.TJN, 0)},\\ {\\color{#ff5a4d}\\text{near-Earth}}\\ ${hl(M.classCounts.APO + M.classCounts.ATE + M.classCounts.AMO + M.classCounts.IEO, 0)}\\end{aligned}`;
    if (m.phase === 'run')
      return `\\begin{aligned}&n = \\sqrt{GM_\\odot / a^3}:\\ \\text{the inner belt laps the outer} \\\\ &\\text{${date}},\\ \\text{one Jupiter year (11.86 yr) in 12 s} \\\\ &{\\color{#73ff8c}\\text{Trojans}}\\ \\text{share Jupiter's orbit, } 60^\\circ\\ \\text{ahead and behind}\\end{aligned}`;
    if (m.phase === 'corotate')
      return `\\begin{aligned}&\\text{turning with Jupiter: } \\phi' = \\phi - \\lambda_J(t) \\\\ &\\text{Trojans: } ${hl(M.trojans.L4, 0)}\\ \\text{ahead (L4)},\\ ${hl(M.trojans.L5, 0)}\\ \\text{behind (L5)} \\\\ &{\\color{#ff9940}\\text{Hildas}}\\ (${hl(M.hildas, 0)}):\\ \\text{3 orbits for Jupiter's 2,} \\\\ &\\text{a triangle with corners at L3, L4, L5}\\end{aligned}`;
    if (m.phase === 'gaps') {
      const g = M.gaps;
      return `\\begin{aligned}&\\text{each at its mean distance } a;\\ \\ a_{p:q} = a_J\\,(q/p)^{2/3} \\\\ &3{:}1\\ ${hl(g[0].found, 3)},\\ 5{:}2\\ ${hl(g[1].found, 3)},\\ 7{:}3\\ ${hl(g[2].found, 3)},\\ 2{:}1\\ ${hl(g[3].found, 3)}\\ \\text{AU} \\\\ &\\text{predicted } ${g.map((x) => x.predicted.toFixed(3)).join(',\\ ')} \\\\ &\\text{the 3:1 gap holds } ${hl(100 * g[0].ratio, 1)}\\%\\ \\text{of its neighbours' density}\\end{aligned}`;
    }
    return `\\begin{aligned}&a\\ \\text{across } (2.0\\text{–}3.6\\ \\text{AU}),\\ \\sin i\\ \\text{up} \\\\ &\\text{clumps are families: fragments of one} \\\\ &\\text{old collision, still on similar orbits} \\\\ &\\text{(Vesta, Koronis, Eos, Themis among them)}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 40; cam.near = 0.05; cam.far = 500; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x000000);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 6 * 160 + 40, width: 1.2 });
    ctx.scene.add(lines.object);
    const hud = createFatLines({ maxSegments: 600, width: 1.4, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SUN_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    ctx.scene.add(sun);
    const dotGeo = new THREE.SphereGeometry(1, 16, 12);
    const planets = PLANETS.map(([name, , , hex]) => {
      const mesh = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: hex }));
      mesh.scale.setScalar(name === 'Jupiter' ? 0.09 : 0.045);
      ctx.scene.add(mesh);
      return mesh;
    });
    load().then((d) => {
      if (s.disposed) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.n * 3), 3));
      g.setAttribute('aA', new THREE.BufferAttribute(d.A, 1));
      g.setAttribute('aEl', new THREE.BufferAttribute(d.El, 4));
      g.setAttribute('aMHC', new THREE.BufferAttribute(d.MHC, 3));
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uDays: { value: 0 }, uRot: { value: 0 }, uCirc: { value: 0 }, uPlane: { value: 0 }, uPx: { value: 1 }, uAmin: { value: 2.0 }, uAmax: { value: 3.6 } },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.geo = g;
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      LIVE.d = d; s.d = d; s.ready = true;
    }).catch((err) => console.error('asteroid data', err));
    return { s, lines, hud, sun, planets, dotGeo, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), jd0: jdNow() };
  },

  update(ctx, state) {
    const { s, lines, hud, sun, planets, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); hud.setResolution(width, height);
    lines.reset(); hud.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);

    // ---------- time and frame ----------
    let jd = state.jd0, rot = 0, circ = 0, plane = 0;
    if (m.phase === 'run') jd += smooth(m.u) * PJ;
    if (m.phase === 'corotate') { jd += PJ + m.u * PJ; }
    if (m.phase === 'gaps' || m.phase === 'families') jd += 2 * PJ;
    const jupiter = PLANETS[4];
    const jPos = planetAt(jupiter[1], jupiter[2], jd, v.clone());
    const lamJ = Math.atan2(-jPos.z, jPos.x);   // Jupiter's ecliptic longitude
    if (m.phase === 'corotate') rot = -lamJ * smooth(Math.min(1, m.u / 0.15)) + (Math.PI / 2) * smooth(Math.min(1, m.u / 0.15));
    if (m.phase === 'gaps' || m.phase === 'families') rot = -lamJ + Math.PI / 2;
    if (m.phase === 'gaps') circ = smooth(Math.min(1, m.u / 0.35));
    if (m.phase === 'families') { circ = 1; plane = smooth(Math.min(1, m.u / 0.3)); }
    // the loop's ends: undo the turn at the start of 'now'
    LIVE.jd = jd;

    // ---------- camera ----------
    const top = m.phase === 'gaps' ? smooth(Math.min(1, m.u / 0.35)) : m.phase === 'families' ? 1 : m.phase === 'now' ? 1 - smooth(Math.min(1, m.u / 0.2)) * 0 : 0;
    const el = THREE.MathUtils.degToRad(32 + 56 * (m.phase === 'gaps' || m.phase === 'families' ? top : 0));
    const az = (0.4 + ctx.time * 0.03) * (1 - (m.phase === 'gaps' || m.phase === 'families' ? top : 0));
    const R = m.phase === 'gaps' ? 7.2 + 1.6 * top : m.phase === 'families' ? 6.8 : 7.2;
    const dist = (portrait ? R / (aspect * th) : R / th) * 0.98;
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    // in the flat view, slide the rings up the screen to leave room for the histogram
    const slide = m.phase === 'gaps' ? (portrait ? 3.2 : 1.1) * top : 0;
    cam.position.z += slide;
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, slide);
    sun.quaternion.copy(cam.quaternion);
    sun.visible = plane < 0.5;

    // ---------- planets and their orbits ----------
    const fadeP = 1 - plane;
    PLANETS.forEach(([name, el0, rate, hex], k) => {
      const p = planetAt(el0, rate, jd, planets[k].position);
      p.applyAxisAngle(state.up || (state.up = new THREE.Vector3(0, 1, 0)), rot);
      planets[k].visible = fadeP > 0.05 && (circ < 0.5 || name === 'Jupiter');
      const kk = 0.3 * fadeP * (name === 'Jupiter' ? 1.4 : 1) * (circ > 0.5 && name !== 'Jupiter' ? 0 : 1);
      if (kk < 0.01) return;
      const prev = new THREE.Vector3();
      for (let q = 0; q <= 160; q++) {
        planetAt(el0, rate, jd + (q / 160) * (365.25 * el0[0] ** 1.5), w);
        w.applyAxisAngle(state.up, rot);
        if (q > 0) lines.push(prev, w, c.set(hex).multiplyScalar(kk));
        prev.copy(w);
      }
    });
    if (!s.ready) { lines.commit(); hud.commit(); return; }
    const d = s.d, M = d.meta, U = s.mat.uniforms;
    U.uDays.value = jd - M.epochJD; U.uRot.value = rot; U.uCirc.value = circ; U.uPlane.value = plane;
    U.uPx.value = Math.max(1, Math.min(width, height) / 750) * (window.devicePixelRatio > 1.5 ? 1.3 : 1);

    // ---------- gaps: the histogram under the rings ----------
    if (m.phase === 'gaps') {
      const K = smooth(Math.min(1, Math.max(0, (m.u - 0.35) / 0.2))) * (1 - smooth(Math.max(0, (m.u - 0.94) / 0.06)));
      const Z = -1, halfW = aspect * th;
      const gw = portrait ? 1.8 * halfW : Math.min(1.4 * halfW, 1.9 * th), gh = portrait ? 0.3 * th : 0.26 * th;
      const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.26) * th;
      const H = M.hist, a0 = 2.0, a1 = 3.6, X = (a) => gx + ((a - a0) / (a1 - a0)) * gw;
      const mx = Math.max(...H.n);
      let px = null, py = null;
      for (let b = 0; b < H.n.length; b++) {
        const a = H.a0 + (b + 0.5) * H.da;
        if (a < a0 || a > a1) continue;
        const x = X(a), y = gy + (H.n[b] / mx) * gh;
        if (px !== null) { v.set(px, py, Z); w.set(x, y, Z); hud.push(v, w, c.set(0x8cb3ff).multiplyScalar(K)); }
        px = x; py = y;
      }
      v.set(gx, gy, Z); w.set(gx + gw, gy, Z); hud.push(v, w, c.set(0x8a93a6).multiplyScalar(0.7 * K));
      for (const g of M.gaps) {
        v.set(X(g.predicted), gy, Z); w.set(X(g.predicted), gy + gh, Z); hud.push(v, w, c.set(0xffd166).multiplyScalar(0.7 * K));
      }
    }
    // the resonance rings themselves, in the flat view
    if (circ > 0.5 && plane < 0.5) {
      for (const g of M.gaps) {
        for (let q = 0; q < 96; q += 2) {
          const a0 = (q / 96) * Math.PI * 2, a1 = ((q + 1) / 96) * Math.PI * 2;
          v.set(Math.cos(a0) * g.predicted, 0, Math.sin(a0) * g.predicted); w.set(Math.cos(a1) * g.predicted, 0, Math.sin(a1) * g.predicted);
          lines.push(v, w, c.set(0xffd166).multiplyScalar(0.35 * (circ - 0.5) * 2 * (1 - plane)));
        }
      }
    }
    if (plane > 0.5) {
      // chart frame: a from 2.0 to 3.6 AU, sin i from 0 to 0.4
      const X = (a) => (a - 2.8) * 8.5, Y = (si) => -(si - 0.2) * 20;
      const kk = (plane - 0.5) * 2 * 0.7;
      v.set(X(2.0), 0, Y(0)); w.set(X(3.6), 0, Y(0)); lines.push(v, w, c.set(0x8a93a6).multiplyScalar(kk));
      v.set(X(2.0), 0, Y(0)); w.set(X(2.0), 0, Y(0.4)); lines.push(v, w, c.set(0x8a93a6).multiplyScalar(kk));
      for (const g of M.gaps) { v.set(X(g.predicted), 0, Y(0)); w.set(X(g.predicted), 0, Y(0.4)); lines.push(v, w, c.set(0xffd166).multiplyScalar(0.25 * kk)); }
    }
    lines.commit(); hud.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.hud.object);
    state.lines.dispose(); state.hud.dispose();
    state.sun.geometry.dispose(); state.sun.material.dispose();
    state.dotGeo.dispose(); state.planets.forEach((p) => p.material.dispose());
    if (s.geo) { s.geo.dispose(); s.mat.dispose(); }
    LIVE.d = null;
  },
};
