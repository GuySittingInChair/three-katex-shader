import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Oldest Light. The cosmic microwave background as Planck mapped it (the 2015 Commander map: nine
// frequencies combined so the Milky Way's own glow is removed), and its power spectrum measured here from
// that map.
//   inside     you are at the centre: this light comes from every direction, released 380,000 years after
//              the Big Bang, when the universe first became transparent
//   map        pull back, and the sphere unrolls into the familiar oval (Mollweide, equal-area) map
//   large      only the largest ripples (ℓ ≤ 20)
//   peak       only ℓ 150–300: spots about a degree across, the sound waves' first harmonic
//   spectrum   D_ℓ: how much the temperature varies at each angular scale. Measured as the
//              cross-spectrum of the two half-mission maps (their noise cancels), against Planck's own
// tools/cmb/build_cmb.py does the analysis.

const DATA_URL = '/data/cmb/';
const PHASES = [['inside', 9], ['map', 8], ['large', 8], ['peak', 9], ['spectrum', 14]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const R_IN = 4;
const LIVE = { d: null };

const VERT = /* glsl */ `
  uniform float uMorph, uS;
  uniform vec2 uShift;
  varying vec2 vUv;
  const float PI = 3.14159265;
  void main() {
    vUv = uv;
    float l = (0.5 - uv.x) * 2.0 * PI;          // Galactic longitude, increasing to the left
    float b = (uv.y - 0.5) * PI;                // latitude
    // the sky around you: l = 0 straight ahead (−z), l = 90° to the left
    vec3 sph = vec3(-sin(l) * cos(b), sin(b), -cos(l) * cos(b)) * ${R_IN.toFixed(1)};
    // Mollweide: 2θ + sin 2θ = π sin b
    float th = b;
    for (int k = 0; k < 8; k++) { float f = 2.0 * th + sin(2.0 * th) - PI * sin(b); th -= f / max(2.0 + 2.0 * cos(2.0 * th), 1e-3); }
    vec3 moll = vec3(-(2.0 * sqrt(2.0) / PI) * l * cos(th), sqrt(2.0) * sin(th), 0.0) * uS + vec3(uShift, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(sph, moll, uMorph), 1.0);
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uSky;
  uniform vec3 uW;          // weights of the full map, the large-scale band and the peak band
  uniform vec3 uRange;      // their ranges, in µK
  uniform float uDim, uGain;
  varying vec2 vUv;
  vec3 planck(float x) {    // −1 … +1: deep blue, pale blue, cream, orange, deep red
    x = clamp(x * 0.5 + 0.5, 0.0, 1.0);
    vec3 c0 = vec3(0.0, 0.0, 0.9), c1 = vec3(0.2, 0.6, 1.0), c2 = vec3(1.0, 0.93, 0.85), c3 = vec3(1.0, 0.55, 0.15), c4 = vec3(0.55, 0.0, 0.0);
    if (x < 0.25) return mix(c0, c1, x / 0.25);
    if (x < 0.5) return mix(c1, c2, (x - 0.25) / 0.25);
    if (x < 0.75) return mix(c2, c3, (x - 0.5) / 0.25);
    return mix(c3, c4, (x - 0.75) / 0.25);
  }
  void main() {
    vec3 t = texture2D(uSky, vUv).rgb * 2.0 - 1.0;
    vec3 uk = t * uRange;
    float T = dot(uk, uW);
    gl_FragColor = vec4(planck(T / 300.0 * uGain) * uDim, 1.0);
  }`;

export default {
  name: 'The Oldest Light',
  description:
    "The cosmic microwave background, the universe's first light, as the Planck satellite mapped it: first from " +
    'inside, all around you, then unrolled into the whole-sky map, then split by size. Its power spectrum is ' +
    "measured here from the map and lands on Planck's own: acoustic peaks at ℓ = 230, 538 and 815, the sound waves " +
    'of the young universe. Data: ESA/Planck Collaboration, via NASA/IPAC IRSA.',
  tags: ['cmb', 'planck', 'cosmology', 'big bang', 'power spectrum', 'real data', 'spherical harmonics'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'inside', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading the Planck sky…}';
    const M = d.meta;
    if (m.phase === 'inside')
      return `\\begin{aligned}&T_0 = 2.7255\\ \\text{K, the same in every direction to} \\\\ &\\pm ${hl(M.rms, 0)}\\ \\mu\\text{K: one part in } ${hl(2.7255e6 / M.rms, 0)} \\\\ &\\text{released 380,000 years after the Big Bang,} \\\\ &\\text{stretched } 1090\\times\\ \\text{since: now microwaves}\\end{aligned}`;
    if (m.phase === 'map')
      return `\\begin{aligned}&\\text{the whole sky, equal-area (Mollweide), Galactic} \\\\ &\\text{nine frequencies combined (Commander),} \\\\ &\\text{so the Milky Way's own glow is removed} \\\\ &\\Delta T(\\hat n) = \\textstyle\\sum_{\\ell m} a_{\\ell m} Y_{\\ell m}(\\hat n)\\end{aligned}`;
    if (m.phase === 'large')
      return `\\begin{aligned}&\\text{only } \\ell \\le 20:\\ \\text{ripples wider than } {\\sim}9^\\circ \\\\ &\\ell\\ \\text{counts ripples: about } 180^\\circ/\\ell\\ \\text{across} \\\\ &\\text{these were never in contact before the light left}\\end{aligned}`;
    if (m.phase === 'peak')
      return `\\begin{aligned}&\\text{only } 150 \\le \\ell \\le 300:\\ \\text{spots about } ${hl(180 / M.peaks[0][0], 2)}^\\circ\\ \\text{across} \\\\ &\\text{sound waves in the hot plasma, caught at the} \\\\ &\\text{moment it cleared: the first harmonic} \\\\ &\\text{(the circle is the full Moon)}\\end{aligned}`;
    const p = M.peaks, q = M.peaksPublished;
    return `\\begin{aligned}&\\mathcal{D}_\\ell = \\frac{\\ell(\\ell+1)}{2\\pi} C_\\ell,\\quad C_\\ell = \\langle |a_{\\ell m}|^2 \\rangle\\quad (\\mu\\text{K}^2) \\\\ &\\text{peaks at } \\ell = ${hl(p[0][0], 0)},\\ ${hl(p[1][0], 0)},\\ ${hl(p[2][0], 0)}\\ \\ \\text{(Planck: } ${q.map((x) => x[0]).join(',\\ ')}\\text{)} \\\\ &\\text{the first at } {\\sim}1^\\circ\\text{: space is flat} \\\\ &{\\color{#7fd4ff}\\text{measured here}}\\ (${hl(100 * M.fsky, 0)}\\%\\ \\text{of sky}),\\ {\\color{#ffd166}\\text{Planck's}}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 60; cam.near = 0.01; cam.far = 100; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x000000);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { uSky: { value: null }, uMorph: { value: 0 }, uS: { value: 1 }, uShift: { value: new THREE.Vector2() }, uW: { value: new THREE.Vector3(1, 0, 0) }, uRange: { value: new THREE.Vector3(400, 250, 150) }, uDim: { value: 1 }, uGain: { value: 1 } },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 360, 180), mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    ctx.scene.add(mesh);
    const lines = createFatLines({ maxSegments: 200, width: 1.4 });
    ctx.scene.add(lines.object);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 8;
    cam.add(card);
    const hud = createFatLines({ maxSegments: 1500, width: 1.4, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);
    Promise.all([
      fetch(DATA_URL + 'meta.json').then((r) => r.json()),
      new Promise((res, rej) => new THREE.TextureLoader().load(DATA_URL + 'sky.png', res, undefined, rej)),
    ]).then(([meta, tex]) => {
      if (s.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
      tex.wrapS = THREE.RepeatWrapping;
      mat.uniforms.uSky.value = tex;
      mat.uniforms.uRange.value.set(meta.ranges.full, meta.ranges.low, meta.ranges.peak);
      mesh.visible = true;
      LIVE.d = { meta }; s.meta = meta; s.tex = tex; s.ready = true;
    }).catch((err) => console.error('cmb data', err));
    return { s, mesh, mat, lines, card, hud, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), look: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, mat, lines, card, hud, v, w, c, look } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); hud.setResolution(width, height);
    lines.reset(); hud.reset();
    const U = mat.uniforms;
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);

    // ---------- camera and the sphere-to-map unrolling ----------
    const D = 6;
    const out = m.phase === 'inside' ? 0 : m.phase === 'map' ? smooth(Math.min(1, m.u / 0.6)) : 1;
    // fit the map: width 4√2·S within the screen, and leave room for the graph in 'spectrum'
    const graph = m.phase === 'spectrum' ? smooth(Math.min(1, m.u / 0.15)) : 0;
    const visW = 2 * aspect * th * D, visH = 2 * th * D;
    const S = Math.min((0.9 * visW) / (4 * Math.SQRT2), ((portrait ? 0.55 : 0.78) * visH) / (2 * Math.SQRT2)) * (1 - 0.4 * graph);
    U.uS.value = S;
    U.uShift.value.set(portrait ? 0 : -0.16 * visW * graph, graph * visH * 0.2 + (portrait ? 0.04 * visH : 0));
    U.uMorph.value = smooth(Math.min(1, Math.max(0, (out - 0.15) / 0.75)));
    // the peak band: fly in to a 20° patch high above the Galactic plane (l = 0°, b = 50°)
    const zoom = m.phase === 'peak' ? smooth(Math.min(1, m.u / 0.25)) * (1 - smooth(Math.max(0, (m.u - 0.82) / 0.18))) : 0;
    let th0 = (50 * Math.PI) / 180;
    for (let k = 0; k < 8; k++) th0 -= (2 * th0 + Math.sin(2 * th0) - Math.PI * Math.sin((50 * Math.PI) / 180)) / (2 + 2 * Math.cos(2 * th0));
    const zx = U.uShift.value.x, zy = U.uShift.value.y + Math.SQRT2 * Math.sin(th0) * S;
    const zoomD = (10 * (Math.PI / 180) * (2 * Math.SQRT2 / Math.PI) * S) / th;   // a 20°-tall view
    if (out === 0) {
      // inside: look slowly around the sky
      const a = 0.25 + ctx.time * 0.06;
      cam.position.set(0, 0, 0);
      look.set(-Math.sin(a), 0.15 * Math.sin(ctx.time * 0.11), -Math.cos(a));
      cam.lookAt(look);
    } else {
      // back out to look at the flattening map from the front
      const k = smooth(Math.min(1, out / 0.5));
      cam.position.set(zx * zoom, zy * zoom, D * k * (1 - zoom) + zoomD * zoom);
      look.set(0, 0, -1).lerp(v.set(0, 0, 0), k);
      cam.up.set(0, 1, 0);
      cam.lookAt(k > 0.999 ? v.set(zx * zoom, zy * zoom, 0) : look);
    }
    if (!s.ready) { lines.commit(); hud.commit(); return; }
    const M = s.meta;

    // which band is shown
    const wv = U.uW.value;
    const kL = m.phase === 'large' ? smooth(Math.min(1, m.u / 0.2)) * (1 - smooth(Math.max(0, (m.u - 0.88) / 0.12))) : 0;
    const kP = m.phase === 'peak' ? smooth(Math.min(1, m.u / 0.2)) * (1 - smooth(Math.max(0, (m.u - 0.88) / 0.12))) : 0;
    wv.set(1 - kL - kP, kL, kP);
    U.uGain.value = 1 + kL * 0.6 + kP * 1.2;
    U.uDim.value = 1 - 0.35 * graph;

    // the full Moon (0.52°) for scale, on the map's centre, in the peak band
    if (kP > 0.01) {
      // Mollweide stretches east-west by 1/cos θ less than north-south at this latitude; the circle follows
      const r = ((0.26 * Math.PI) / 180) * (2 * Math.SQRT2 / Math.PI) * S;
      const cx = zx, cy = zy;
      for (let q = 0; q < 48; q++) {
        const a0 = (q / 48) * Math.PI * 2, a1 = ((q + 1) / 48) * Math.PI * 2;
        v.set(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.002); w.set(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.002);
        lines.push(v, w, c.set(0xffffff).multiplyScalar(0.8 * kP));
      }
    }

    // ---------- the power spectrum ----------
    if (m.phase === 'spectrum') {
      const K = smooth(Math.min(1, Math.max(0, (m.u - 0.08) / 0.15))) * (1 - smooth(Math.max(0, (m.u - 0.95) / 0.05)));
      const Z = -1, halfW = aspect * th;
      const gw = portrait ? 1.8 * halfW : Math.min(1.5 * halfW, 1.9 * th), gh = portrait ? 0.42 * th : 0.5 * th;
      const gx = -gw / 2, gy = -th + (portrait ? 0.3 : 0.24) * th;
      card.position.set(0, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.1 * th, gh + 0.1 * th, 1);
      card.material.opacity = 0.75 * K;
      const L1 = 1200, Dm = 6500, X = (l) => gx + (l / L1) * gw, Y = (dd) => gy + Math.max(0, Math.min(1, dd / Dm)) * gh;
      const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, c.set(hex).multiplyScalar(k)); };
      seg(gx, gy, gx + gw, gy, 0x8a93a6, 0.8 * K); seg(gx, gy, gx, gy + gh, 0x8a93a6, 0.8 * K);
      for (let l = 200; l <= 1200; l += 200) seg(X(l), gy, X(l), gy - 0.02 * th, 0x8a93a6, 0.6 * K);
      for (let dd = 2000; dd <= 6000; dd += 2000) seg(gx, Y(dd), gx - 0.02 * th, Y(dd), 0x8a93a6, 0.6 * K);
      // Planck's published spectrum
      const P = M.published, draw = smooth(Math.min(1, Math.max(0, (m.u - 0.15) / 0.3)));
      for (let i = 1; i < P.l.length; i++) {
        if (P.l[i] > L1 * draw) break;
        seg(X(P.l[i - 1]), Y(P.D[i - 1]), X(P.l[i]), Y(P.D[i]), 0xffd166, 0.35 * K);
      }
      // measured here: binned, with cosmic-variance error bars
      const B = M.bins, e = 0.008 * th;
      for (let i = 0; i < B.l.length; i++) {
        if (B.l[i] > L1 * draw) break;
        const x = X(B.l[i]), y = Y(B.D[i]);
        seg(x, Y(B.D[i] - B.e[i]), x, Y(B.D[i] + B.e[i]), 0x7fd4ff, 0.7 * K);
        seg(x - e, y, x + e, y, 0x7fd4ff, K);
      }
      const kp = smooth(Math.min(1, Math.max(0, (m.u - 0.5) / 0.15)));
      for (const [l, dd] of M.peaks) seg(X(l), Y(dd) + 0.03 * th, X(l), Y(dd) + 0.09 * th, 0xffffff, kp * K);
    } else card.material.opacity = 0;
    lines.commit(); hud.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.camera.remove(state.card); ctx.camera.remove(state.hud.object);
    state.hud.dispose(); state.lines.dispose();
    state.card.geometry.dispose(); state.card.material.dispose();
    state.mesh.geometry.dispose(); state.mat.dispose();
    if (s.tex) s.tex.dispose();
    LIVE.d = null;
  },
};
