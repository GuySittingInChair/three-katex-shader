import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Sun's Eleven-Year Heartbeat. Two public records:
//   sunspot groups 1874–2016 (Royal Greenwich Observatory, then USAF/NOAA; compiled at NASA Marshall):
//   246,132 sightings of a group on a day, each with its latitude, Carrington longitude and area
//   the international sunspot number, monthly since 1749 (WDC-SILSO, Royal Observatory of Belgium)
// Phases:
//   sun       the busiest rotation in the record, its real groups painted at their real positions
//   cycle     1874 → 2016, one Carrington rotation (27.3 days) after another; the butterfly diagram
//             draws itself underneath: spots start at mid-latitudes and drift towards the equator
//   record    the sunspot number since 1749, its minima, and the mean cycle length
//   sporer    Spörer's law: mean latitude against years since minimum, all 13 cycles stacked
// tools/sun/build_sun.py makes the data and every number shown.

const DATA_URL = '/data/sun/';
const PHASES = [['sun', 9], ['cycle', 26], ['record', 10], ['sporer', 9]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const MAPW = 1024, MAPH = 512;
const SIZE_K = 2;                       // spots drawn twice their area-equivalent radius, so they show
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LIVE = { d: null };

const SUN_VERT = /* glsl */ `
  varying vec3 vN, vP;
  varying vec3 vView;
  void main() {
    vP = position;                                   // body frame: y is the rotation axis
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const SUN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uRot, uTime;
  varying vec3 vN, vP, vView;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 p = normalize(vP);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);                       // body longitude
    float carr = fract((lon + uRot) / 6.2831853);     // Carrington longitude, 0..1
    float spot = texture2D(uMap, vec2(carr, 0.5 + lat / 3.14159265)).r;   // 1 = clear, 0 = deepest umbra
    float mu = clamp(dot(vN, vView), 0.0, 1.0);
    float limb = 1.0 - 0.62 * (1.0 - mu) - 0.15 * (1.0 - mu * mu);        // limb darkening
    float gran = 0.9 + 0.1 * noise(p * 90.0 + uTime * 0.05) + 0.05 * noise(p * 23.0);
    vec3 photo = vec3(1.0, 0.78, 0.45) * limb * gran;
    // spots: penumbra brownish, umbra nearly black
    vec3 c = mix(vec3(0.05, 0.02, 0.01), mix(vec3(0.45, 0.22, 0.08), photo, smoothstep(0.55, 1.0, spot)), smoothstep(0.15, 0.55, spot));
    c *= mix(1.0, limb, 0.3);
    gl_FragColor = vec4(c * 1.15, 1.0);
  }`;
const HALO_FRAG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.45, r) * (0.35 / (1.0 + 30.0 * max(r - 0.47, 0.0)));
    gl_FragColor = vec4(vec3(1.0, 0.6, 0.3) * a, 1.0);
  }`;
const BF_FRAG = /* glsl */ `
  uniform sampler2D uBF;
  uniform float uReveal, uAlpha;
  varying vec2 vUv;
  void main() {
    if (vUv.x > uReveal) discard;
    float a = texture2D(uBF, vUv).r;
    vec3 c = mix(vec3(0.0), vec3(1.0, 0.45, 0.1), smoothstep(0.0, 0.5, a)) + vec3(0.0, 0.4, 0.5) * smoothstep(0.45, 1.0, a);
    float edge = smoothstep(0.0, 0.004, uReveal - vUv.x);
    gl_FragColor = vec4(c * uAlpha * (0.5 + 0.5 * edge) + vec3(1.0) * (1.0 - edge) * 0.4 * uAlpha, 1.0);
  }`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

async function load() {
  const [meta, spots, ssn, bf] = await Promise.all([
    fetch(DATA_URL + 'meta.json').then((r) => r.json()),
    ...['spots.bin', 'ssn.bin', 'butterfly.bin'].map((f) => fetch(DATA_URL + f).then((r) => r.arrayBuffer())),
  ]);
  const dv = new DataView(spots), n = spots.byteLength / 8;
  const rot = new Uint16Array(n), lat = new Float32Array(n), lon = new Float32Array(n), area = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rot[i] = dv.getUint16(i * 8, true); lat[i] = dv.getInt16(i * 8 + 2, true) / 100; lon[i] = dv.getUint16(i * 8 + 4, true) / 100; area[i] = dv.getUint16(i * 8 + 6, true);
  }
  // where each rotation's records start (they are in rotation order), and each rotation's totals
  const start = new Int32Array(meta.nrot + 1).fill(-1), total = new Float32Array(meta.nrot), groups = new Uint16Array(meta.nrot), latSum = new Float32Array(meta.nrot);
  for (let i = n - 1; i >= 0; i--) start[rot[i]] = i;
  start[meta.nrot] = n;
  for (let r = meta.nrot - 1; r >= 0; r--) if (start[r] < 0) start[r] = start[r + 1];
  for (let i = 0; i < n; i++) { total[rot[i]] += area[i]; groups[rot[i]]++; latSum[rot[i]] += Math.abs(lat[i]) * area[i]; }
  let busiest = 0;
  for (let r = 0; r < meta.nrot; r++) if (total[r] > total[busiest]) busiest = r;
  const S = new Float32Array(ssn);
  return { meta, n, rot, lat, lon, area, start, total, groups, latSum, busiest, ssn: S, bf: new Uint8Array(bf) };
}

const yearOfRot = (M, r) => M.rotYear[0] + (r / M.nrot) * (M.rotYear[M.nrot] - M.rotYear[0]);
const dateText = (y) => { const yr = Math.floor(y), mo = Math.min(11, Math.floor((y - yr) * 12)); return `${MONTHS[mo]} ${yr}`; };

export default {
  name: "The Sun's Eleven-Year Heartbeat",
  description:
    'A hundred and forty years of sunspots, every group painted where it really was, rotation by rotation, ' +
    'while the butterfly diagram draws itself: each cycle starts at mid-latitudes and drifts to the equator. ' +
    'Then the sunspot number since 1749, the cycle length measured from it, and Spörer\'s law fitted. Data: ' +
    'Royal Greenwich Observatory, USAF/NOAA, compiled by NASA Marshall; WDC-SILSO, Royal Observatory of Belgium.',
  tags: ['sun', 'sunspots', 'solar cycle', 'butterfly diagram', 'real data', 'magnetism', 'time series'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'sun', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading 142 years of sunspots…}';
    const M = d.meta, r = LIVE.r ?? d.busiest;
    if (m.phase === 'sun')
      return `\\begin{aligned}&\\text{Carrington rotation } ${M.cr0 + r},\\ \\text{${dateText(yearOfRot(M, r))}} \\\\ &\\text{the busiest in the record: } ${hl(d.groups[r], 0)}\\ \\text{groups} \\\\ &${hl(d.total[r], 0)}\\ \\text{millionths of a hemisphere} \\\\ &\\text{each spot: a knot of magnetic field that} \\\\ &\\text{holds back heat, } {\\sim}1500\\ \\text{K cooler (drawn } 2\\times\\text{)}\\end{aligned}`;
    if (m.phase === 'cycle') {
      const y = yearOfRot(M, r), lm = d.total[r] > 0 ? d.latSum[r] / d.total[r] : 0;
      return `\\begin{aligned}&\\text{${dateText(y)}},\\ \\text{rotation } ${M.cr0 + r}:\\ ${hl(d.groups[r], 0)}\\ \\text{groups} \\\\ &\\text{mean latitude } ${hl(lm, 0)}^\\circ\\quad \\text{(27.3 days a rotation)} \\\\ &\\text{each cycle starts near } \\pm 25^\\circ\\ \\text{and drifts to the equator} \\\\ &\\text{below: the butterfly diagram, area by latitude}\\end{aligned}`;
    }
    if (m.phase === 'record') {
      const last = M.maxima[M.maxima.length - 1];
      return `\\begin{aligned}&R = 10g + s\\quad \\text{(groups, spots: Wolf's count)} \\\\ &${M.minima.length - 1}\\ \\text{cycles since } ${Math.round(M.minima[0])}:\\ \\bar T = ${hl(M.meanLength, 2)} \\pm ${hl(M.sdLength, 2)}\\ \\text{yr} \\\\ &\\text{strongest periodogram peak: } ${hl(M.periodogram.best, 2)}\\ \\text{yr} \\\\ &\\text{latest maximum } ${hl(last[0], 1)},\\ \\text{smoothed } R = ${hl(last[1], 0)}\\end{aligned}`;
    }
    return `\\begin{aligned}&\\text{Spörer's law: } |\\bar\\phi|(t) = \\phi_0 + k\\,t \\\\ &\\phi_0 = ${hl(M.sporer.lat0, 1)}^\\circ\\ \\text{at minimum},\\ k = ${hl(M.sporer.slope, 2)}^\\circ\\text{/yr} \\\\ &\\text{area-weighted, all cycles 1878–2009 stacked} \\\\ &\\text{the dynamo's band of field drifts towards the equator}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 40; cam.near = 0.05; cam.far = 100; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x020204);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false };

    // the spot map: Carrington longitude across, latitude up; white = clear photosphere
    const cv = document.createElement('canvas');
    cv.width = MAPW; cv.height = MAPH;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#fff'; g2.fillRect(0, 0, MAPW, MAPH);
    const map = new THREE.CanvasTexture(cv);
    map.wrapS = THREE.RepeatWrapping;

    const sunMat = new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms: { uMap: { value: map }, uRot: { value: 0 }, uTime: { value: 0 } } });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), sunMat);
    const tilt = new THREE.Group();
    tilt.rotation.x = THREE.MathUtils.degToRad(7.25);   // the Sun's axis leans 7.25° to the ecliptic
    tilt.add(sun);
    ctx.scene.add(tilt);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: HALO_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.position.z = -0.2;
    ctx.scene.add(halo);

    // the graphs, on the camera
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x020204, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 8;
    cam.add(card);
    const bfMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BF_FRAG, uniforms: { uBF: { value: null }, uReveal: { value: 0 }, uAlpha: { value: 0 } }, depthTest: false, depthWrite: false, transparent: true });
    const bfQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bfMat);
    bfQuad.renderOrder = 9;
    cam.add(bfQuad);
    const hud = createFatLines({ maxSegments: 6000, width: 1.4, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);

    load().then((d) => {
      if (s.disposed) return;
      const M = d.meta;
      // butterfly texture: rotations across, sine-latitude up
      const W = M.nrot, H = M.butterfly.cols, px = new Uint8Array(W * H * 4);
      for (let r = 0; r < W; r++) for (let b = 0; b < H; b++) { const v = d.bf[r * H + b], k = (b * W + r) * 4; px[k] = px[k + 1] = px[k + 2] = v; px[k + 3] = 255; }
      const tex = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
      bfMat.uniforms.uBF.value = tex;
      s.bfTex = tex;
      LIVE.d = d; s.d = d; s.ready = true;
    }).catch((err) => console.error('sun data', err));
    return { s, cv, g2, map, sun, sunMat, tilt, halo, card, bfQuad, bfMat, hud, painted: -2, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, g2, map, sun, sunMat, halo, card, bfQuad, bfMat, hud, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    hud.setResolution(width, height); hud.reset();
    // the Sun sits in the upper part of the view, the graph below
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), halfW = aspect * th;
    const dist = portrait ? 1.25 / (halfW * 0.92) : 1.25 / (th * 0.5);
    cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0);
    // on wide screens the Sun sits to the left, clear of the equations at the top right
    const sunY = (portrait ? 0.2 : 0.3) * th * dist, sunX = portrait ? 0 : -0.42 * halfW * dist;
    sun.parent.position.set(sunX, sunY, 0); halo.position.set(sunX, sunY, -0.2);
    sunMat.uniforms.uTime.value = ctx.time;
    if (!s.ready) { hud.commit(); return; }
    const d = s.d, M = d.meta;

    // ---------- which rotation(s) to paint ----------
    let r = d.busiest, spin = ctx.time * 0.35, win = 1;
    if (m.phase === 'cycle') { const rf = Math.min(1, m.u / 0.96) * (M.nrot - 1); r = Math.floor(rf); win = 3; }
    if (m.phase === 'record' || m.phase === 'sporer') r = M.nrot - 1;
    LIVE.r = r;
    sunMat.uniforms.uRot.value = spin;
    sun.rotation.y = 0;
    if (state.painted !== r) {
      state.painted = r;
      g2.fillStyle = '#fff'; g2.fillRect(0, 0, MAPW, MAPH);
      for (let k = win - 1; k >= 0; k--) {
        const rr = r - k;
        if (rr < 0) continue;
        const fade = 1 - k / win;
        for (let i = d.start[rr]; i < d.start[rr + 1]; i++) {
          const rho = Math.sqrt(2 * d.area[i] * 1e-6) * SIZE_K * (180 / Math.PI);   // degrees
          if (rho < 0.3) continue;
          const x = (d.lon[i] / 360) * MAPW, y = (0.5 - d.lat[i] / 180) * MAPH, ry = (rho / 180) * MAPH, rx = ry / Math.max(0.2, Math.cos((d.lat[i] * Math.PI) / 180));
          for (const dx of [0, -MAPW, MAPW]) {
            if (x + dx + rx < 0 || x + dx - rx > MAPW) continue;
            g2.save(); g2.translate(x + dx, y); g2.scale(rx / ry, 1);
            const gr = g2.createRadialGradient(0, 0, 0, 0, 0, ry);
            gr.addColorStop(0, `rgba(0,0,0,${0.95 * fade})`); gr.addColorStop(0.35, `rgba(0,0,0,${0.85 * fade})`);
            gr.addColorStop(0.45, `rgba(0,0,0,${0.5 * fade})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g2.fillStyle = gr; g2.beginPath(); g2.arc(0, 0, ry, 0, Math.PI * 2); g2.fill(); g2.restore();
          }
        }
      }
      map.needsUpdate = true;
    }

    // ---------- the graph panel ----------
    const Z = -1;
    const gw = portrait ? 1.8 * halfW : Math.min(1.6 * halfW, 2.2 * th), gh = portrait ? 0.5 * th : 0.52 * th;
    const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.27) * th;
    const len = m.len;
    const K = smooth(Math.min(1, (m.u * len) / 0.8)) * (1 - smooth(Math.max(0, (m.u * len - len + 0.6) / 0.6)));
    const showPanel = m.phase === 'sun' ? 0 : K;
    card.position.set(0, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.1 * th, gh + 0.1 * th, 1);
    card.material.opacity = 0.75 * showPanel;
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };
    const GOLD = 0xffd166, GREY = 0x8a93a6;
    bfQuad.visible = m.phase === 'cycle';
    if (m.phase === 'cycle') {
      // butterfly on top (70%), smoothed sunspot number beneath (30%), one time axis
      const bh = gh * 0.66, by = gy + gh * 0.34;
      bfQuad.position.set(gx + gw / 2, by + bh / 2, Z - 0.001); bfQuad.scale.set(gw, bh, 1);
      bfMat.uniforms.uReveal.value = Math.min(1, m.u / 0.96); bfMat.uniforms.uAlpha.value = K;
      seg(gx, by + bh / 2, gx + gw, by + bh / 2, GREY, 0.35 * K);                      // the equator
      const y0 = M.rotYear[0], y1 = M.rotYear[M.nrot], X = (yy) => gx + ((yy - y0) / (y1 - y0)) * gw;
      const S = d.ssn, n = S.length / 3, nowY = yearOfRot(M, r);
      let px = null, py = null;
      for (let i = 0; i < n; i++) {
        const yy = S[i * 3], sm = S[i * 3 + 2];
        if (yy < y0 || yy > nowY || !(sm >= 0)) { px = null; continue; }
        const x = X(yy), y = gy + (sm / 300) * gh * 0.3;
        if (px !== null) seg(px, py, x, y, GOLD, K);
        px = x; py = y;
      }
      for (let yy = 1880; yy <= 2010; yy += 10) seg(X(yy), gy, X(yy), gy - 0.02 * th, GREY, 0.6 * K);
    }
    if (m.phase === 'record') {
      const S = d.ssn, n = S.length / 3, y0 = 1749, y1 = M.ssn.last;
      const X = (yy) => gx + ((yy - y0) / (y1 - y0)) * gw, Y = (vv) => gy + Math.min(1, vv / 400) * gh;
      seg(gx, gy, gx + gw, gy, GREY, 0.8 * K); seg(gx, gy, gx, gy + gh, GREY, 0.8 * K);
      const draw = Math.min(1, m.u / 0.5) * n;
      for (let i = 1; i < draw; i++) seg(X(S[(i - 1) * 3]), Y(S[(i - 1) * 3 + 1]), X(S[i * 3]), Y(S[i * 3 + 1]), 0x7a5a30, 0.6 * K);
      let px = null, py = null;
      for (let i = 0; i < draw; i++) {
        const sm = S[i * 3 + 2];
        if (!(sm >= 0)) { px = null; continue; }
        const x = X(S[i * 3]), y = Y(sm);
        if (px !== null) seg(px, py, x, y, GOLD, K);
        px = x; py = y;
      }
      const km = smooth(Math.min(1, Math.max(0, (m.u - 0.5) / 0.2)));
      for (const mn of M.minima) seg(X(mn), gy, X(mn), gy + 0.08 * gh, 0x7fd4ff, km * K);
      for (let yy = 1750; yy <= 2025; yy += 25) seg(X(yy), gy, X(yy), gy - 0.02 * th, GREY, 0.6 * K);
    }
    if (m.phase === 'sporer') {
      const X = (t) => gx + ((t + 1) / 13) * gw, Y = (l) => gy + (l / 35) * gh;
      seg(gx, gy, gx + gw, gy, GREY, 0.8 * K); seg(gx, gy, gx, gy + gh, GREY, 0.8 * K);
      const e = 0.012 * th;
      for (const [t, l] of M.sporer.points) { const x = X(t), y = Y(l); seg(x - e, y, x + e, y, 0x7fd4ff, K); seg(x, y - e, x, y + e, 0x7fd4ff, K); }
      const kf = smooth(Math.min(1, Math.max(0, (m.u - 0.2) / 0.3)));
      const t1 = 11 * kf;
      if (kf > 0.01) seg(X(0), Y(M.sporer.lat0), X(t1), Y(M.sporer.lat0 + M.sporer.slope * t1), GOLD, K);
      for (let t = 0; t <= 12; t += 2) seg(X(t), gy, X(t), gy - 0.02 * th, GREY, 0.6 * K);
      for (const l of [10, 20, 30]) seg(gx, Y(l), gx - 0.02 * th, Y(l), GREY, 0.6 * K);
    }
    hud.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.card); ctx.camera.remove(state.bfQuad); ctx.camera.remove(state.hud.object);
    state.hud.dispose();
    state.card.geometry.dispose(); state.card.material.dispose();
    state.bfQuad.geometry.dispose(); state.bfMat.dispose();
    state.sun.geometry.dispose(); state.sunMat.dispose(); state.map.dispose();
    state.halo.geometry.dispose(); state.halo.material.dispose();
    if (s.bfTex) s.bfTex.dispose();
    LIVE.d = null;
  },
};
