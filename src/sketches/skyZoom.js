import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// From the Whole Sky to One Galaxy. One continuous zoom, ×26,000, from a 78° view of the southern sky
// to a single spiral galaxy in the Webb deep field. Everything is real and on one projection (gnomonic:
// the sky projected onto a flat sheet touching it at the target, x = −ξ so east is left), so every
// level lines up with the next:
//   stars        Gaia DR3, drawn live: G < 8.5 within 62°, G < 12 within 15°, G < 16 within 2.9°. Fainter
//                stars appear as you zoom, the way a bigger telescope shows more
//   1°, 15′      Digitized Sky Survey 2 (photographic plates, blue/red/infrared), via NASA SkyView
//   96″          JWST NIRCam, JADES deep field (same picture as Webb Deep Field in Depth)
//   19″          the target at Webb's full resolution, 0.03″ a pixel
// The zoom is exponential, h(t) = h₀e^{−kt}: the view shrinks by the same factor every second.
// tools/zoom/build_zoom.py makes the data.

const DATA_URL = '/data/zoom/';
const ARCSEC = Math.PI / 648000;
const H0 = Math.tan((39 * Math.PI) / 180);  // half of the widest view's short side (78°), inside the 62° star list
const H1 = 6.5 * ARCSEC;                    // the galaxy (about 9″ across) fills the view
const PHASES = [['wide', 5], ['zoom', 42], ['galaxy', 10], ['out', 7]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const ZOOM_K = Math.log(H0 / H1) / PHASES[1][1];
const MOON = 15.5 * 60 * ARCSEC;            // the full Moon's radius
// the galaxy's numbers (Planck 2018; see Webb Deep Field in Depth)
const COSMO = (() => {
  const H = 67.66, OM = 0.3111, OR = 9.1e-5, OL = 1 - OM - OR, E = (z) => Math.sqrt(OM * (1 + z) ** 3 + OR * (1 + z) ** 4 + OL);
  const simpson = (f, a, b, n = 2000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return (s * h) / 3; };
  const hub = 977.792 / H;
  const look = (z) => hub * simpson((x) => 1 / ((1 + x) * E(x)), 0, z);
  const age0 = hub * simpson((u) => 1 / E(Math.expm1(u)), 0, Math.log1p(1e5), 6000);
  return { look, age0, D: (z) => (299792.458 / H / 1000) * simpson((x) => 1 / E(x), 0, z) };
})();
const LIVE = { data: null };

const fmtAngle = (h) => {
  const w = (2 * Math.atan(h)) / (Math.PI / 180); // h is on the flat sheet; the angle is 2·atan(h)
  if (w >= 1) return { v: w, u: '^\\circ', d: w >= 10 ? 0 : 1 };
  if (w * 60 >= 1) return { v: w * 60, u: "'", d: w * 60 >= 10 ? 0 : 1 };
  return { v: w * 3600, u: "''", d: w * 3600 >= 10 ? 0 : 1 };
};

const STAR_VERT = /* glsl */ `
  attribute float aG;
  attribute float aC;
  uniform float uGlim, uAlpha, uScale;
  varying vec3 vColor;
  varying float vA;
  vec3 starColour(float c) {
    vec3 a = vec3(0.65, 0.76, 1.0), b = vec3(1.0, 0.97, 0.93), d = vec3(1.0, 0.8, 0.55);
    return c < 0.8 ? mix(a, b, smoothstep(-0.2, 0.8, c)) : mix(b, d, smoothstep(0.8, 2.2, c));
  }
  void main() {
    float over = uGlim - aG;                     // magnitudes brighter than the limit
    vA = uAlpha * smoothstep(-0.6, 0.8, over);
    gl_PointSize = clamp((1.8 + 1.05 * max(over, 0.0)) * uScale, 1.2, 13.0);
    vColor = starColour(aC);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 5.0) + 0.25 * (1.0 - r2);
    gl_FragColor = vec4(vColor * core * vA * 1.7, 1.0);
  }`;
const IMG_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    // fade the last few per cent of every image, so no level has a hard edge
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = smoothstep(0.0, 0.06, min(e.x, e.y));
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb, uAlpha * edge);
  }`;
const IMG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export default {
  name: 'From the Whole Sky to One Galaxy',
  description:
    'One continuous zoom, 26,000 times, from eighty degrees of the southern sky down to a single spiral ' +
    'galaxy in the James Webb deep field, through real data at every step: Gaia stars, photographic sky ' +
    "survey plates, then Webb itself. The galaxy's light left it eight billion years ago. Data: ESA/Gaia/DPAC; " +
    'Digitized Sky Survey 2 via NASA SkyView; NASA, ESA, CSA, STScI, JADES Collaboration.',
  tags: ['zoom', 'powers of ten', 'jwst', 'gaia', 'sky survey', 'real data', 'scale'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        let h = H0;
        if (phase === 'zoom') h = H0 * Math.exp(-ZOOM_K * len * u);
        else if (phase === 'galaxy') h = H1;
        else if (phase === 'out') h = H1 * Math.exp(Math.log(H0 / H1) * smooth(u));
        return { T, phase, u, h };
      }
      acc += len;
    }
    return { T, phase: 'wide', u: 0, h: H0 };
  },

  latex: (params, hl, m) => {
    const d = LIVE.data;
    if (!d) return '\\text{loading the sky…}';
    const a = fmtAngle(m.h), zoom = H0 / m.h;
    const src = m.h > 1.2 * (Math.PI / 180) ? '\\text{Gaia DR3 stars}' : m.h > 6 * 60 * ARCSEC ? '\\text{Digitized Sky Survey (photographic plates)}' : '\\text{JWST NIRCam, JADES}';
    if (m.phase === 'galaxy') {
      const z = d.meta.target.z, look = COSMO.look(z);
      return `\\begin{aligned}&\\text{one spiral galaxy, } ${hl(a.v, a.d)}${a.u}\\ \\text{across};\\ z \\approx ${hl(z, 2)}\\ \\text{(from its colours)} \\\\ &t_{\\text{light}} = ${hl(look, 1)}\\ \\text{billion years}:\\ \\text{it left before the Sun formed } (4.6) \\\\ &\\text{now } ${hl(COSMO.D(z) * 3.2616, 1)}\\ \\text{billion light-years away; the universe was } ${hl(COSMO.age0 - look, 1)}\\ \\text{Gyr old}\\end{aligned}`;
    }
    const moon = (2 * MOON) / (2 * m.h);
    return `\\begin{aligned}&h(t) = h_0\\,e^{-kt},\\quad k = ${hl(ZOOM_K, 3)}\\,\\text{s}^{-1}:\\ \\times 10 \\text{ every } ${hl(Math.LN10 / ZOOM_K, 1)}\\ \\text{s} \\\\ &\\text{view } ${hl(a.v, a.d)}${a.u}\\ \\text{tall},\\quad \\text{zoom } \\times${hl(zoom, zoom < 10 ? 1 : 0)} \\\\ &${src} \\\\ &${[m.h < 1.5 * (Math.PI / 180) && m.h > 40 * ARCSEC ? '\\text{circle: the full Moon}' : '', m.h < 25 * 60 * ARCSEC && m.h > 8 * ARCSEC ? "\\text{square: Webb's picture}" : ''].filter(Boolean).join(';\\ ') || '\\phantom{x}'} \\\\ &${m.h > 0.5 ? '\\text{the constellation Fornax; Orion and Sirius off to the upper left}' : `\\text{the view is } ${hl(1 / moon, 1 / moon < 10 ? 2 : 0)}\\times \\text{ the Moon's width}`}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    // a flat, orthographic view of the tangent plane
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    cam.position.set(0, 0, 5);
    ctx.camera = cam;
    ctx.scene.background = new THREE.Color(0x000000);
    const s = { ready: false, disposed: false, levels: [] };
    const lines = createFatLines({ maxSegments: 300, width: 1.4 });
    lines.object.renderOrder = 5;
    ctx.scene.add(lines.object);
    const loader = new THREE.TextureLoader();
    fetch(DATA_URL + 'meta.json').then((r) => r.json()).then(async (meta) => {
      const buf = await fetch(DATA_URL + 'stars.bin').then((r) => r.arrayBuffer());
      const textures = await Promise.all(meta.levels.map((L) => new Promise((res, rej) => loader.load(DATA_URL + L.file, res, undefined, rej))));
      if (s.disposed) { textures.forEach((t) => t.dispose()); return; }
      // stars
      const f = new Float32Array(buf), n = f.length / 4;
      const pos = new Float32Array(n * 3), G = new Float32Array(n), C = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos[i * 3] = -f[i * 4]; pos[i * 3 + 1] = f[i * 4 + 1]; G[i] = f[i * 4 + 2]; C[i] = f[i * 4 + 3]; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aG', new THREE.BufferAttribute(G, 1));
      g.setAttribute('aC', new THREE.BufferAttribute(C, 1));
      s.starMat = new THREE.ShaderMaterial({
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
        uniforms: { uGlim: { value: 6 }, uAlpha: { value: 1 }, uScale: { value: 1 } },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.stars = new THREE.Points(g, s.starMat);
      s.stars.frustumCulled = false;
      s.stars.renderOrder = 0;
      ctx.scene.add(s.stars);
      // image levels, coarse to fine
      meta.levels.forEach((L, k) => {
        const t = textures[k];
        t.colorSpace = THREE.NoColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
        const mat = new THREE.ShaderMaterial({ vertexShader: IMG_VERT, fragmentShader: IMG_FRAG, uniforms: { uMap: { value: t }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.size, L.size), mat);
        mesh.position.set(-L.cx, L.cy, 0);
        mesh.renderOrder = 1 + k;
        mesh.frustumCulled = false;
        ctx.scene.add(mesh);
        s.levels.push({ ...L, mesh, mat, half: L.size / 2, pixel: L.size / t.image.width });
      });
      LIVE.data = { meta };
      s.meta = meta;
      s.ready = true;
    }).catch((err) => console.error('zoom data', err));
    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height); lines.reset();
    const aspect = width / height;
    // keep the same sky on screen: the view's short side is 2h
    const hy = aspect >= 1 ? m.h : m.h / aspect, hx = hy * aspect;
    cam.left = -hx; cam.right = hx; cam.top = hy; cam.bottom = -hy;
    cam.updateProjectionMatrix();
    if (!s.ready) { lines.commit(); return; }
    const h = Math.min(hx, hy);
    const screenPx = (2 * hy) / height; // radians per screen pixel

    // stars: the faint limit deepens as we zoom; they make way for the photographs
    const glim = Math.min(16.3, 7.0 + 2.5 * Math.log10(H0 / h));
    s.starMat.uniforms.uGlim.value = glim;
    s.starMat.uniforms.uScale.value = Math.min(1.6, Math.max(0.8, Math.min(width, height) / 700));
    // each image fades in once its pixels are about as fine as the screen's and it fills the view
    let cover = 0;
    for (const L of s.levels) {
      const fill = smooth(Math.min(1, Math.max(0, (L.half / h - 0.75) / 0.6)));
      const sharp = smooth(Math.min(1, Math.max(0, (2.5 - L.pixel / screenPx) / 1.5)));
      const a = L.file.startsWith('jades') ? Math.max(fill, smooth(Math.min(1, Math.max(0, (L.half * 3 / h - 0.6) / 0.6)))) * sharp : fill * sharp;
      L.mat.uniforms.uAlpha.value = a;
      L.mesh.visible = a > 0.003;
      if (!L.file.startsWith('jades')) cover = Math.max(cover, a);
    }
    s.starMat.uniforms.uAlpha.value = 1 - 0.85 * cover;

    // ---------- outlines ----------
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const circle = (x, y, R, hex, k) => {
      for (let q = 0; q < 96; q++) {
        const a0 = (q / 96) * Math.PI * 2, a1 = ((q + 1) / 96) * Math.PI * 2;
        v.set(x + Math.cos(a0) * R, y + Math.sin(a0) * R, 1); w.set(x + Math.cos(a1) * R, y + Math.sin(a1) * R, 1);
        lines.push(v, w, col(hex, k));
      }
    };
    const band = (lo, hi, x) => smooth(Math.min(1, Math.max(0, (x - lo) / ((hi - lo) * 0.25)))) * smooth(Math.min(1, Math.max(0, (hi - x) / ((hi - lo) * 0.25))));
    const lh = Math.log(h);
    const moonK = band(Math.log(40 * ARCSEC), Math.log(1.5 * (Math.PI / 180)), lh);
    if (moonK > 0.01) circle(0, 0, MOON, 0xd8dee9, 0.55 * moonK);
    const jades = s.levels.find((L) => L.file === 'jades_96.jpg');
    const sqK = band(Math.log(8 * ARCSEC), Math.log(25 * 60 * ARCSEC), lh);
    if (jades && sqK > 0.01) {
      const x = -jades.cx, y = jades.cy, r = jades.half;
      const P = [[-r, -r], [r, -r], [r, r], [-r, r]];
      for (let q = 0; q < 4; q++) { v.set(x + P[q][0], y + P[q][1], 1); w.set(x + P[(q + 1) % 4][0], y + P[(q + 1) % 4][1], 1); lines.push(v, w, col(0xffd166, 0.7 * sqK)); }
    }
    if (m.phase === 'galaxy') circle(0, 0, 5.2 * ARCSEC, 0xffd166, 0.5 * smooth(Math.min(1, m.u / 0.2)) * (1 - smooth(Math.max(0, (m.u - 0.85) / 0.15))));
    lines.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    state.lines.dispose();
    if (s.stars) { s.stars.geometry.dispose(); s.starMat.dispose(); }
    for (const L of s.levels) { L.mesh.geometry.dispose(); L.mat.uniforms.uMap.value.dispose(); L.mat.dispose(); }
    LIVE.data = null;
  },
};
