import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Webb's Deep Field, pulled apart. Real data, nothing invented.
//
// The picture: JWST NIRCam, JADES deep field in GOODS-South around the Hubble Ultra Deep Field,
// a 96″ × 96″ square (3200 × 3200 pixels of 0.03″; about 1/19 of the full Moon's width). Colours
// are infrared mapped to visible: red = F444W (4.4 µm), green = F200W (2.0 µm), blue = F115W (1.15 µm).
// All 3945 objects the JADES team detected in it are cut out along their segmentation outlines
// (tools/deepfield/build_deepfield.py) and drawn as cards; what is left over (sky noise, faint
// halos) is one more picture behind them. From where we stand the two add back up to the original.
//
// Depth: every object sits at its comoving distance along its own line of sight,
//   x = D_C(z) (θx, θy, 1),  D_C(z) = (c/H₀) ∫₀^z dz′/E(z′),  E = √(Ω_m(1+z)³ + Ω_r(1+z)⁴ + Ω_Λ),
// Planck 2018: H₀ = 67.66, Ω_m = 0.3111 (incl. neutrinos), Ω_r = 9.1e-5, flat. Checked against
// astropy's Planck18: distances, lookback times and ages agree within 0.07 % from z = 0.5 to 14.
// z is spectroscopic (JADES DR4 NIRSpec, grade A/B) for 140 objects, else the EAZY photometric
// estimate with its 68 % range, drawn as a bar along the line of sight. The two stars (spikes)
// are in our own galaxy, a few kpc away; they're parked at 0.05 Gpc so they can be seen.
//
// Because each object only moves along its line of sight, the view from the origin never changes;
// only moving the camera shows the depth. The field is a needle (0.027° wide, 10 Gpc deep), so it
// is stretched sideways ×1000; the view from the origin is unchanged by that too.

const DATA_URL = '/data/deepfield/';
const H0 = 67.66, OM = 0.3111, OR = 9.1e-5, OL = 1 - OM - OR;
const C_KMS = 299792.458, HUBBLE_GYR = 977.792 / H0, GPC_PER_GYR = 0.306601; // light-years → pc
const STRETCH = 1000;
const STAR_D = 0.05;
const SKY_D = 11.2;

const E = (z) => Math.sqrt(OM * (1 + z) ** 3 + OR * (1 + z) ** 4 + OL);
function simpson(f, a, b, n) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}
// Tables on u = ln(1+z): comoving distance (Gpc) and lookback time (Gyr), integrated once.
const ZMAX = 20, TN = 2000;
const TAB = (() => {
  const du = Math.log1p(ZMAX) / TN, D = new Float64Array(TN + 1), L = new Float64Array(TN + 1);
  for (let i = 1; i <= TN; i++) {
    const a = (i - 1) * du, b = i * du;
    D[i] = D[i - 1] + (C_KMS / H0 / 1000) * simpson((u) => Math.exp(u) / E(Math.expm1(u)), a, b, 4);
    L[i] = L[i - 1] + HUBBLE_GYR * simpson((u) => 1 / E(Math.expm1(u)), a, b, 4);
  }
  return { du, D, L };
})();
const AGE0 = TAB.L[TN] + HUBBLE_GYR * simpson((u) => 1 / E(Math.expm1(u)), Math.log1p(ZMAX), Math.log1p(1e5), 2000);
function tab(arr, z) {
  const x = Math.min(TN - 1e-9, Math.max(0, Math.log1p(Math.max(0, z)) / TAB.du)), i = Math.floor(x), f = x - i;
  return arr[i] + (arr[i + 1] - arr[i]) * f;
}
const comoving = (z) => tab(TAB.D, z);
const lookback = (z) => tab(TAB.L, z);
const ageAt = (z) => AGE0 - lookback(z);
function zAtLookback(t) {
  let lo = 0, hi = ZMAX;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (lookback(m) < t) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- the loop ----------
const STOPS = [0.47, 0.77, 1.61, 3.0, 5.83, 7.0, 9.7, 'candidate'];
const STOP_S = 5;
const PHASES = [
  ['photo', 8],
  ['pull', 10],
  ['tour', STOPS.length * STOP_S],
  ['shells', 10],
  ['return', 8],
];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const SHELLS = [1, 3, 5, 7, 9, 11, 13];
const DEPTHS = ['where they are now', 'how far their light came'];

// Shared with latex(): filled when the data arrives, and by taps.
const LIVE = { data: null, pick: -1, focus: -1, depthMode: 0 };

function depthOf(d, i, mode) {
  if (d.flags[i] & 2) return STAR_D;
  const z = d.z[i];
  return mode ? lookback(z) * GPC_PER_GYR : comoving(z);
}

async function load() {
  const [meta, bin] = await Promise.all([
    fetch(DATA_URL + 'meta.json').then((r) => r.json()),
    fetch(DATA_URL + 'galaxies.bin').then((r) => r.arrayBuffer()),
  ]);
  const f = new Float32Array(bin), F = meta.fields.length, n = meta.count;
  const col = (k) => { const a = new Float32Array(n); const j = meta.fields.indexOf(k); for (let i = 0; i < n; i++) a[i] = f[i * F + j]; return a; };
  const d = { meta, n, cx: col('cx'), cy: col('cy'), w: col('w'), h: col('h'), u: col('u'), v: col('v'), uw: col('uw'), vh: col('vh'), z: col('z'), zlo: col('zlo'), zhi: col('zhi'), flags: col('flags') };
  // tour stops: the brightest-looking spectroscopic galaxy near each target z, then the
  // photometric candidate with the highest best-guess z
  d.stops = STOPS.map((zt) => {
    let best = -1, score = Infinity;
    for (let i = 0; i < n; i++) {
      if (zt === 'candidate') {
        // the most secure: highest lower bound, ignoring fits that ran off the end of the grid
        if (!(d.flags[i] & 1) && d.z[i] < 15 && d.zhi[i] < 15.5 && -d.zlo[i] < score) { score = -d.zlo[i]; best = i; }
      } else if (d.flags[i] & 1) {
        const s = Math.abs(d.z[i] - zt) - 0.002 * d.w[i];
        if (s < score) { score = s; best = i; }
      }
    }
    return best;
  });
  return d;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iSize;
  attribute vec4 iUv;
  attribute float iGain;
  uniform vec2 uAtlas;
  uniform float uPxPerUnitAt1;
  uniform float uMinPx;
  uniform float uBoost;
  varying vec2 vUv;
  varying float vGain;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float px = max(iSize.x, iSize.y) * uPxPerUnitAt1 / max(1e-6, -mv.z);
    float k = max(1.0, uMinPx / max(px, 1e-6));
    mv.xy += position.xy * iSize * k;
    // a card blown up to stay visible keeps (most of) its total light
    // only cards that are a few pixels across get the boost; close-ups keep their true colours
    float small = clamp((28.0 - px) / 22.0, 0.0, 1.0);
    vGain = iGain * mix(1.0, uBoost, small) * pow(k, -1.0);
    vUv = vec2(iUv.x + (position.x + 0.5) * iUv.z, uAtlas.y - (iUv.y + (0.5 - position.y) * iUv.w)) / uAtlas;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vGain;
  void main() {
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb * vGain, 1.0);
  }`;

export default {
  name: 'Webb Deep Field in Depth',
  description:
    "A real James Webb deep field (JADES, around the Hubble Ultra Deep Field) taken apart: all 3945 objects " +
    'in the picture moved back to their real distances from their measured redshifts. From where we stand ' +
    'it is still the same picture; step aside and it opens into a ten-billion-light-year tunnel. Tap any ' +
    'galaxy to fly to it and read how long its light has been travelling. Data: NASA, ESA, CSA, STScI, JADES ' +
    'Collaboration (DR2 NIRCam images and catalogue, DR4 NIRSpec redshifts).',
  tags: ['jwst', 'webb', 'deep field', 'redshift', 'cosmology', 'real data', 'galaxies'],
  category: 'Astronomy',
  mode: '3d',

  motion(t, params) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0, phase = PHASES[0][0], u = 0, local = 0;
    for (const [name, len] of PHASES) {
      if (T < acc + len) { phase = name; local = T - acc; u = local / len; break; }
      acc += len;
    }
    const stop = phase === 'tour' ? Math.min(STOPS.length - 1, Math.floor(local / STOP_S)) : -1;
    const stopU = phase === 'tour' ? (local - stop * STOP_S) / STOP_S : 0;
    return { T, phase, u, stop, stopU, depthMode: Math.round(params?.depth ?? 0) };
  },

  latex: (params, hl, m) => {
    const d = LIVE.data;
    const mode = Math.round(params?.depth ?? 0);
    if (!d) return '\\text{loading Webb\'s deep field…}';
    const i = LIVE.pick >= 0 ? LIVE.pick : LIVE.focus;
    if (i >= 0) {
      const star = d.flags[i] & 2, spec = d.flags[i] & 1, z = d.z[i];
      if (star) {
        return `\\begin{aligned}&\\text{a star in our own galaxy, not a galaxy} \\\\ &\\text{a few thousand light-years away: next door} \\\\ &\\text{the six spikes are Webb's hexagonal mirror}\\end{aligned}`;
      }
      if (!spec && z > 15)
        return `\\begin{aligned}&z \\approx ${hl(z, 1)}\\ \\text{from colours only} \\\\ &\\text{the fit ran off the end of its range:} \\\\ &\\text{probably noise or a faint red object much nearer}\\end{aligned}`;
      const zTex = spec
        ? `z = ${hl(z, 3)}\\ \\ (\\text{spectrum})`
        : `z \\approx ${hl(z, 2)}\\ (${hl(d.zlo[i], 1)}\\text{–}${hl(d.zhi[i], 1)},\\ \\text{colours})`;
      const head = LIVE.pick >= 0 ? '\\text{you picked this one}' : m.stop === STOPS.length - 1 ? '\\text{farthest candidate (no spectrum)}' : `\\text{stop ${m.stop + 1} of ${STOPS.length}}`;
      return `\\begin{aligned}&${head}:\\quad ${zTex} \\\\ &D_C = \\frac{c}{H_0}\\int_0^{z}\\frac{dz'}{E(z')} = ${hl(comoving(z), 2)}\\ \\text{Gpc} = ${hl(comoving(z) * 3.2616, 1)}\\ \\text{billion ly now} \\\\ &t_{\\text{light}} = \\int_0^{z}\\frac{dz'}{(1+z')H(z')} = ${hl(lookback(z), 2)}\\ \\text{Gyr}\\quad \\text{universe then: } ${hl(ageAt(z) * 1000, 0)}\\ \\text{Myr old} \\\\ &\\lambda_{\\text{seen}} = (1+z)\\,\\lambda_{\\text{sent}}:\\ \\text{its light is stretched } ${hl(1 + z, 2)}\\times\\end{aligned}`;
    }
    if (m.phase === 'photo' || m.phase === 'return')
      return `\\begin{aligned}&\\text{JWST NIRCam, JADES deep field: } 96''\\times 96'',\\ \\tfrac{1}{19}\\text{ of the Moon's width} \\\\ &${hl(d.n, 0)}\\ \\text{objects; red, green, blue} = 4.4,\\ 2.0,\\ 1.15\\,\\mu\\text{m infrared} \\\\ &\\text{every one is already at its real distance}\\end{aligned}`;
    if (m.phase === 'pull')
      return `\\begin{aligned}&\\mathbf{x}_i = D(z_i)\\,(\\theta_{x,i},\\ \\theta_{y,i},\\ 1) \\\\ &\\text{each galaxy only moves along its own line of sight,} \\\\ &\\text{so from here it is the same picture; step aside} \\\\ &\\text{depth: ${DEPTHS[mode]}; sideways stretched } ${hl(STRETCH, 0)}\\times\\end{aligned}`;
    // shells
    return `\\begin{aligned}&E(z) = \\sqrt{\\Omega_m(1+z)^3 + \\Omega_r(1+z)^4 + \\Omega_\\Lambda} \\\\ &\\Omega_m = ${hl(OM, 4)},\\ \\Omega_\\Lambda = ${hl(OL, 4)},\\ H_0 = ${hl(H0, 2)}\\ \\tfrac{\\text{km/s}}{\\text{Mpc}} \\\\ &\\text{squares: light sent } 1, 3, 5, \\dots, 13\\ \\text{billion years ago} \\\\ &${mode ? '\\text{evenly spaced: this depth is just } c\\,t_{\\text{light}}' : '\\text{bunching up: space grew while the light travelled}'},\\ \\text{age } ${hl(AGE0, 2)}\\ \\text{Gyr}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    depth: {
      value: 0, min: 0, max: 1, step: 1, options: DEPTHS,
      label: 'Depth shows',
      help: 'Where the galaxies are now (comoving distance), or how far their light travelled to reach us (light-travel time × c). The second is always shorter: space kept stretching while the light was on its way.',
    },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.near = 0.0005; cam.far = 200;
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, 1);
    cam.updateProjectionMatrix();

    const s = { ready: false, disposed: false, pick: -1, pickAt: 0, from: null, mode: 0, depthMix: 0, cam: null };
    const lines = createFatLines({ maxSegments: 900, width: 1.3 });
    lines.object.renderOrder = 2;
    ctx.scene.add(lines.object);
    ctx.scene.background = new THREE.Color(0x000000);

    const loader = new THREE.TextureLoader();
    const tex = (name) => new Promise((res, rej) => loader.load(DATA_URL + name, (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));

    Promise.all([load(), tex('atlas.jpg'), tex('sky.jpg')]).then(([d, atlas, sky]) => {
      if (s.disposed) { atlas.dispose(); sky.dispose(); return; }
      LIVE.data = d;
      s.d = d;
      const N = d.meta.size, pixRad = (d.meta.pixArcsec / 206264.806);
      s.fieldTan = (N / 2) * pixRad * STRETCH;
      // instanced cards
      const quad = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index; g.attributes.position = quad.attributes.position;
      g.instanceCount = d.n;
      s.pos = new Float32Array(d.n * 3);
      s.size = new Float32Array(d.n * 2);
      const uv = new Float32Array(d.n * 4), gain = new Float32Array(d.n).fill(1);
      s.dir = new Float32Array(d.n * 2);
      for (let i = 0; i < d.n; i++) {
        s.dir[i * 2] = -(d.cx[i] - N / 2) * pixRad * STRETCH;
        s.dir[i * 2 + 1] = -(d.cy[i] - N / 2) * pixRad * STRETCH;
        uv.set([d.u[i], d.v[i], d.uw[i], d.vh[i]], i * 4);
      }
      s.posAttr = new THREE.InstancedBufferAttribute(s.pos, 3);
      s.sizeAttr = new THREE.InstancedBufferAttribute(s.size, 2);
      s.gainAttr = new THREE.InstancedBufferAttribute(gain, 1);
      g.setAttribute('iPos', s.posAttr);
      g.setAttribute('iSize', s.sizeAttr);
      g.setAttribute('iUv', new THREE.InstancedBufferAttribute(uv, 4));
      g.setAttribute('iGain', s.gainAttr);
      atlas.generateMipmaps = true;
      atlas.minFilter = THREE.LinearMipmapLinearFilter;
      s.cardsMat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uMap: { value: atlas }, uAtlas: { value: new THREE.Vector2(...d.meta.atlas) }, uPxPerUnitAt1: { value: 1 }, uMinPx: { value: 0 }, uBoost: { value: 1 } },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.cards = new THREE.Mesh(g, s.cardsMat);
      s.cards.frustumCulled = false;
      s.cards.renderOrder = 1;
      ctx.scene.add(s.cards);
      // what is left of the picture, behind everything, only seen from (near) the origin
      const half = s.fieldTan * SKY_D;
      s.skyMat = new THREE.MeshBasicMaterial({ map: sky, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
      s.sky = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 2 * half), s.skyMat);
      s.sky.position.set(0, 0, SKY_D);
      s.sky.rotation.y = Math.PI;
      ctx.scene.add(s.sky);
      s.mode = Math.round(ctx.params.depth ?? 0);
      s.depthMix = s.mode;
      s.place = () => {
        for (let i = 0; i < d.n; i++) {
          const D0 = depthOf(d, i, 0), D1 = depthOf(d, i, 1), D = D0 + (D1 - D0) * s.depthMix;
          s.pos[i * 3] = s.dir[i * 2] * D; s.pos[i * 3 + 1] = s.dir[i * 2 + 1] * D; s.pos[i * 3 + 2] = D;
          s.size[i * 2] = d.w[i] * pixRad * STRETCH * D; s.size[i * 2 + 1] = d.h[i] * pixRad * STRETCH * D;
        }
        s.posAttr.needsUpdate = true; s.sizeAttr.needsUpdate = true;
      };
      s.place();
      s.ready = true;
    }).catch((err) => { console.error('deep field data', err); });

    // tap a galaxy to fly to it; tap empty sky to let the tour carry on
    const el = ctx.domElement;
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down || !s.ready || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      down = null;
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const v = new THREE.Vector3();
      let best = -1, bestD = 26;
      for (let i = 0; i < s.d.n; i++) {
        v.set(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]).project(cam);
        if (v.z > 1 || v.z < -1) continue;
        const sx = (v.x * 0.5 + 0.5) * r.width, sy = (0.5 - v.y * 0.5) * r.height;
        const dd = Math.hypot(sx - mx, sy - my) - Math.min(10, s.d.w[i] * 0.05);
        if (dd < bestD) { bestD = dd; best = i; }
      }
      s.pick = best === s.pick ? -1 : best;
      s.pickAt = ctx.time;
      s.from = s.cam && { ...s.cam, target: s.cam.target.clone(), dir: s.cam.dir.clone(), up: s.cam.up.clone() };
      LIVE.pick = s.pick;
    };
    el?.addEventListener('pointerdown', onDown);
    el?.addEventListener('pointerup', onUp);
    s.unbind = () => { el?.removeEventListener('pointerdown', onDown); el?.removeEventListener('pointerup', onUp); };

    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    lines.reset();
    if (!s.ready) { lines.commit(); return; }
    const d = s.d;

    // depth measure: glide between the two when the dial changes
    const mode = Math.round(ctx.params.depth ?? 0);
    const target = mode;
    if (Math.abs(s.depthMix - target) > 1e-4) {
      s.depthMix += (target - s.depthMix) * Math.min(1, ctx.delta * 2.5);
      if (Math.abs(s.depthMix - target) < 1e-3) s.depthMix = target;
      s.place();
    }
    LIVE.depthMode = mode;
    const Dof = (i) => s.pos[i * 3 + 2];
    const Dz = (z) => comoving(z) + (lookback(z) * GPC_PER_GYR - comoving(z)) * s.depthMix;

    // ---------- camera ----------
    const aspect = width / height;
    const fitFov = 2 * Math.atan(s.fieldTan / Math.min(1, aspect) / 0.97) * (180 / Math.PI);
    const farD = Dz(14);
    const UP = new THREE.Vector3(0, 1, 0);
    const ORIGIN = { target: new THREE.Vector3(0, 0, farD / 2), dir: new THREE.Vector3(0, 0, -1), dist: farD / 2, fov: fitFov, up: UP };
    // landscape: from the side, the tunnel runs across the screen; portrait: from above, it runs up it
    const SIDE = aspect >= 1
      ? { target: new THREE.Vector3(0, 0, farD * 0.5), dir: new THREE.Vector3(-0.86, 0.34, -0.38).normalize(), dist: farD, fov: 48, up: UP }
      : { target: new THREE.Vector3(0, 0, farD * 0.55), dir: new THREE.Vector3(-0.4, 0.86, -0.32).normalize(), dist: farD * 1.25, fov: 52, up: new THREE.Vector3(0, 0, 1) };
    const stopView = (i, k) => {
      const D = Dof(i);
      const t = new THREE.Vector3(s.pos[i * 3], s.pos[i * 3 + 1], D);
      const size = Math.max(s.size[i * 2], s.size[i * 2 + 1]);
      const a = -0.9 + 0.35 * Math.sin(k * 1.7);
      const dir = new THREE.Vector3(Math.sin(a), 0.28, -Math.cos(a)).normalize();
      // big galaxies fill a third of the screen; small faint ones stay small, so their noise doesn't
      const fill = Math.min(0.34, Math.max(0.1, d.w[i] / 260));
      return { target: t, dir, dist: Math.max(size / (fill * 2 * Math.tan((40 * Math.PI) / 360)), 0.004), fov: 40, up: UP };
    };
    const mix = (A, B, k) => ({
      target: A.target.clone().lerp(B.target, k),
      dir: A.dir.clone().lerp(B.dir, k).normalize(),
      dist: Math.exp(Math.log(A.dist) + (Math.log(B.dist) - Math.log(A.dist)) * k),
      fov: A.fov + (B.fov - A.fov) * k,
      up: A.up.clone().lerp(B.up, k).normalize(),
    });

    let view, focus = -1;
    if (m.phase === 'photo') view = ORIGIN;
    else if (m.phase === 'pull') view = mix(ORIGIN, SIDE, smooth(Math.min(1, m.u * 1.15)));
    else if (m.phase === 'tour') {
      focus = d.stops[m.stop];
      const prev = m.stop === 0 ? SIDE : stopView(d.stops[m.stop - 1], m.stop - 1);
      const here = stopView(focus, m.stop);
      // drift slowly round the galaxy while holding
      here.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (m.stopU - 0.3) * 0.5);
      view = mix(prev, here, smooth(Math.min(1, m.stopU / 0.32)));
    } else if (m.phase === 'shells') {
      const last = stopView(d.stops[STOPS.length - 1], STOPS.length - 1);
      const wide = { ...SIDE, dir: SIDE.dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.35 * m.u) };
      view = mix(last, wide, smooth(Math.min(1, m.u / 0.35)));
    } else {
      const wide = { ...SIDE, dir: SIDE.dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.35) };
      view = mix(wide, ORIGIN, smooth(Math.min(1, m.u / 0.8)));
    }
    if (s.pick >= 0) {
      const k = smooth(Math.min(1, (ctx.time - s.pickAt) / 1.6));
      const here = stopView(s.pick, 3);
      here.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (ctx.time - s.pickAt) * 0.08);
      view = s.from ? mix(s.from, here, k) : here;
      focus = s.pick;
    } else if (s.from && ctx.time - s.pickAt < 1.6) {
      view = mix(s.from, view, smooth((ctx.time - s.pickAt) / 1.6));
    }
    s.cam = view;
    LIVE.focus = focus;
    cam.position.copy(view.target).addScaledVector(view.dir, view.dist);
    cam.up.copy(view.up);
    cam.lookAt(view.target);
    if (Math.abs(cam.fov - view.fov) > 1e-3) { cam.fov = view.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();

    // cards: pixels per world unit at distance 1, for the minimum on-screen size
    s.cardsMat.uniforms.uPxPerUnitAt1.value = height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    // the leftover sky only makes sense from the origin
    const off = cam.position.length() / Math.max(1e-6, farD);
    const skyK = 1 - smooth(Math.min(1, off / 0.04));
    s.skyMat.opacity = skyK;
    s.sky.visible = skyK > 0.002;
    s.cardsMat.uniforms.uMinPx.value = 3.2 * (1 - skyK);
    s.cardsMat.uniforms.uBoost.value = 1 + 1.6 * (1 - skyK);

    // ---------- lines ----------
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const showFrame = (1 - skyK) * (m.phase === 'shells' ? 1 : 0.35);
    if (showFrame > 0.01) {
      const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (const [a, b] of corners) { v.set(0, 0, 0); w.set(a * s.fieldTan * farD, b * s.fieldTan * farD, farD); lines.push(v, w, col(0x5d6b88, 0.5 * showFrame)); }
      const shellK = m.phase === 'shells' ? smooth(Math.min(1, m.u * 2.5)) : 0.4;
      SHELLS.forEach((tL, j) => {
        const D = Dz(zAtLookback(tL)), h = s.fieldTan * D;
        const k = showFrame * shellK * (j === SHELLS.length - 1 ? 1 : 0.75);
        const hue = c.setHSL(0.6 - 0.62 * (j / (SHELLS.length - 1)), 0.7, 0.55).clone().multiplyScalar(k);
        for (let q = 0; q < 4; q++) {
          const [a0, b0] = corners[q], [a1, b1] = corners[(q + 1) % 4];
          v.set(a0 * h, b0 * h, D); w.set(a1 * h, b1 * h, D); lines.push(v, w, hue);
        }
      });
    }
    if (focus >= 0) {
      const i = focus, D = Dof(i);
      const P = new THREE.Vector3(s.pos[i * 3], s.pos[i * 3 + 1], D);
      // the path its light took to us
      v.set(0, 0, 0); lines.push(v, P, col(0xffd166, 0.5), col(0xffd166, 0.08));
      // ring
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const R = 0.42 * Math.max(s.size[i * 2], s.size[i * 2 + 1]);
      for (let q = 0; q < 48; q++) {
        const a0 = (q / 48) * Math.PI * 2, a1 = ((q + 1) / 48) * Math.PI * 2;
        v.copy(P).addScaledVector(right, Math.cos(a0) * R).addScaledVector(up, Math.sin(a0) * R);
        w.copy(P).addScaledVector(right, Math.cos(a1) * R).addScaledVector(up, Math.sin(a1) * R);
        if (q % 4 < 2) lines.push(v, w, col(0xffd166, 0.55));
      }
      // photometric redshift: it could be anywhere along this stretch of its sight line
      if (!(d.flags[i] & 3) && d.zhi[i] > d.zlo[i]) {
        const dx = s.dir[i * 2], dy = s.dir[i * 2 + 1], a = Dz(d.zlo[i]), b = Dz(d.zhi[i]);
        v.set(dx * a, dy * a, a); w.set(dx * b, dy * b, b);
        lines.push(v, w, col(0x7fd4ff, 0.8));
      }
    }
    lines.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    s.unbind?.();
    state.lines.dispose();
    if (s.cards) { s.cards.geometry.dispose(); s.cardsMat.uniforms.uMap.value.dispose(); s.cardsMat.dispose(); }
    if (s.sky) { s.sky.geometry.dispose(); s.skyMat.map.dispose(); s.skyMat.dispose(); }
    LIVE.data = null; LIVE.pick = -1; LIVE.focus = -1;
  },
};
