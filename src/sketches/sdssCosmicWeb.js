import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Cosmic Web, Measured. 597,968 real galaxies from the Sloan Digital Sky Survey (DR18 main
// galaxy sample: every galaxy brighter than r = 17.77 in a quarter of the sky, each with a measured
// redshift, 0.005 < z < 0.2). Colour is the measured g − r colour: red = old stars (ellipticals),
// blue = star-forming (spirals). tools/sdss/build_sdss.py makes the data.
//
//   sky      directions only, what a telescope sees: every galaxy on one sphere
//   depth    each moves out to its comoving distance D(z) = (c/H₀)∫dz/E(z) (≈ cz/H₀ this close)
//   slice    a slab 24 Mpc thick sweeps through the survey: walls, filaments, voids. It starts
//            on the celestial equator, where the Sloan Great Wall is (z ≈ 0.07–0.08)
//   coma     the Coma cluster: 591 members (within 2 Mpc and 3σ in velocity, clipped). Their
//            redshifts include their orbital speeds, cz = H₀d + v, so the cluster looks stretched
//            along our line of sight (a "finger of God"); σ_v = 955 km/s measured here, published
//            ≈ 1000. Squeezing the speeds out (members pulled to the cluster distance) shows its size
//   cluster  ξ(r), the two-point correlation function: how many more neighbours a galaxy has at
//            distance r than if galaxies were scattered at random. Landy–Szalay estimator
//            (DD − 2DR + RR)/RR on a volume-limited sample (170,389 galaxies, M_r < −20.5, z < 0.1)
//            against 4× as many random points in the same footprint. Measured in redshift space, so
//            the fingers flatten it: γ = 1.36 here; in real space it's ≈ 1.8.
// Planck 2018 cosmology, same as Webb Deep Field in Depth.

const DATA_URL = '/data/sdss/';
const H0 = 67.66, OM = 0.3111, OR = 9.1e-5, OL = 1 - OM - OR, C = 299792.458;
const UNIT = 100; // Mpc per scene unit
const SHELL = 3.2;
const E = (z) => Math.sqrt(OM * (1 + z) ** 3 + OR * (1 + z) ** 4 + OL);
const ZT = 0.25, TN = 2500;
const DTAB = (() => {
  const t = new Float64Array(TN + 1), h = ZT / TN;
  for (let i = 1; i <= TN; i++) t[i] = t[i - 1] + ((C / H0) * h * (1 / E((i - 1) * h) + 4 / E((i - 0.5) * h) + 1 / E(i * h))) / 6;
  return t;
})();
const comoving = (z) => { const x = Math.min(TN - 1e-9, Math.max(0, z / (ZT / TN))), i = Math.floor(x); return DTAB[i] + (DTAB[i + 1] - DTAB[i]) * (x - i); };
const rad = (d) => (d * Math.PI) / 180;
const dirOf = (ra, dec, out) => out.set(Math.cos(rad(dec)) * Math.cos(rad(ra)), Math.sin(rad(dec)), Math.cos(rad(dec)) * Math.sin(rad(ra)));

const PHASES = [['sky', 8], ['depth', 12], ['slice', 20], ['coma', 16], ['cluster', 18], ['return', 8]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const CENTRE = dirOf(185, 32, new THREE.Vector3());         // middle of the survey
const AXIS = new THREE.Vector3(-Math.sin(rad(185)), 0, Math.cos(rad(185))); // horizontal, ⊥ to ra 185
const SLAB_HALF = 12 / UNIT;
const LIVE = { data: null };

async function load() {
  const [meta, buf] = await Promise.all([
    fetch(DATA_URL + 'meta.json').then((r) => r.json()),
    fetch(DATA_URL + 'galaxies.bin').then((r) => r.arrayBuffer()),
  ]);
  const n = meta.count;
  const ra = new Uint16Array(buf, 0, n), dec = new Uint16Array(buf, 2 * n, n), zq = new Uint16Array(buf, 4 * n, n);
  const gr = new Uint8Array(buf, 6 * n, n), flags = new Uint8Array(buf, 7 * n, n);
  const dir = new Float32Array(n * 3), D = new Float32Array(n), col = new Float32Array(n), fl = new Float32Array(n);
  const [d0, d1] = meta.dec, v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    dirOf((ra[i] / 65535) * 360, d0 + (dec[i] / 65535) * (d1 - d0), v);
    dir[i * 3] = v.x; dir[i * 3 + 1] = v.y; dir[i * 3 + 2] = v.z;
    D[i] = comoving((zq[i] / 65535) * meta.zq) / UNIT;
    col[i] = gr[i] / 200;
    fl[i] = flags[i];
  }
  // the galaxy we count neighbours round: a clustering-sample galaxy near 300 Mpc, close to the middle
  let focus = -1, best = Infinity;
  for (let i = 0; i < n; i++) {
    if (!(flags[i] & 2)) continue;
    const off = Math.abs(D[i] - 2.9) + 3 * (1 - (dir[i * 3] * CENTRE.x + dir[i * 3 + 1] * CENTRE.y + dir[i * 3 + 2] * CENTRE.z));
    if (off < best) { best = off; focus = i; }
  }
  const F = new THREE.Vector3(dir[focus * 3], dir[focus * 3 + 1], dir[focus * 3 + 2]).multiplyScalar(D[focus]);
  const near = [];
  let nVL = 0;
  for (let i = 0; i < n; i++) {
    if (!(flags[i] & 2)) continue;
    nVL++;
    const dx = dir[i * 3] * D[i] - F.x, dy = dir[i * 3 + 1] * D[i] - F.y, dz = dir[i * 3 + 2] * D[i] - F.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) * UNIT;
    if (r < 80 && i !== focus) near.push(r);
  }
  near.sort((a, b) => a - b);
  // mean density of the clustering sample: its count over the volume it fills (footprint × shell)
  const zmax = meta.xi.zmax, Dlo = comoving(0.02), Dhi = comoving(zmax);
  const footprintSr = meta.footprintSr ?? 7.9;
  const nbar = nVL / ((footprintSr / 3) * (Dhi ** 3 - Dlo ** 3));
  return { meta, n, dir, D, col, fl, focus, F, near, nbar };
}

const VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute float aD;
  attribute float aCol;
  attribute float aFlag;
  uniform float uShell, uDepth, uSlabK, uSlabW, uComaK, uComaD, uComaGlow, uPx, uFocusR, uFocusK, uMin;
  uniform vec3 uSlabN, uFocus;
  varying vec3 vColor;
  varying float vA;
  void main() {
    float D = mix(uShell, aD, uDepth);
    float member = mod(aFlag, 2.0);
    D = mix(D, uComaD + (D - uComaD) * 0.07, uComaK * member);
    vec3 p = aDir * D;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float slab = dot(p, uSlabN) / uSlabW;
    float keep = mix(1.0, exp(-slab * slab), uSlabK);
    // g - r: blue (star-forming) to warm (old stars)
    float t = smoothstep(0.45, 0.95, aCol);
    vec3 c = mix(vec3(0.35, 0.62, 1.0), vec3(1.0, 0.62, 0.32), t);
    float inF = uFocusK * step(length(p - uFocus), uFocusR) * step(1.5, aFlag);
    c = mix(c, vec3(1.0, 0.95, 0.75), inF);
    c = mix(c, vec3(1.0, 0.85, 0.55), uComaGlow * member);
    vColor = c;
    float size = uPx / max(0.05, -mv.z);
    gl_PointSize = clamp(size, uMin, 7.0) * (1.0 + inF * 0.8 + uComaGlow * member);
    vA = keep * clamp(size / uMin, 0.45, 1.0) * (0.6 + 0.4 * inF);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor * vA * uAlpha * (1.0 - r2), 1.0);
  }`;

export default {
  name: 'The Cosmic Web, Measured',
  description:
    'Six hundred thousand real galaxies from the Sloan Digital Sky Survey, each at the distance its redshift ' +
    'gives. A thin slice shows the walls and voids; the Coma cluster shows how orbital speeds stretch a ' +
    'cluster along our line of sight; and the clustering of galaxies is measured live, the same way ' +
    'astronomers do it. Data: Sloan Digital Sky Survey DR18.',
  tags: ['sdss', 'cosmic web', 'galaxies', 'redshift', 'cosmology', 'real data', 'correlation function'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        return { T, phase, u, local: T - acc, tilt: phase === 'slice' ? -6 + 76 * smooth(u) : 0 };
      }
      acc += len;
    }
    return { T, phase: 'sky', u: 0, local: 0 };
  },

  latex: (params, hl, m) => {
    const d = LIVE.data;
    if (!d) return '\\text{loading 600,000 galaxies…}';
    const meta = d.meta;
    if (m.phase === 'sky' || m.phase === 'return')
      return `\\begin{aligned}&\\text{SDSS: } ${hl(d.n, 0)}\\ \\text{galaxies, each with a measured redshift} \\\\ &\\text{all drawn at one distance: directions only} \\\\ &\\text{what a telescope sees; no web yet}\\end{aligned}`;
    if (m.phase === 'depth')
      return `\\begin{aligned}&D = \\frac{c}{H_0}\\int_0^{z}\\frac{dz'}{E(z')} \\approx \\frac{cz}{H_0}\\ \\ (z \\ll 1) \\\\ &\\text{Coma: } z = ${hl(meta.coma.z, 4)} \\Rightarrow D = ${hl(meta.coma.D, 0)}\\ \\text{Mpc} \\\\ &\\text{red: old stars};\\ \\text{blue: still making stars} \\\\ &\\text{far away only the brightest (mostly red) make the cut}\\end{aligned}`;
    if (m.phase === 'slice') {
      const tilt = Math.abs(m.tilt);
      return `\\begin{aligned}&|\\,\\mathbf{x}\\cdot\\hat n\\,| < ${hl(SLAB_HALF * UNIT, 0)}\\ \\text{Mpc: a slice through the survey} \\\\ &\\text{tilted } ${hl(tilt, 0)}^\\circ \\text{ from the celestial equator} \\\\ &${tilt < 12 ? '\\text{the Sloan Great Wall: } 1.4\\ \\text{billion ly long, at } z \\approx 0.08' : '\\text{walls and filaments round empty voids}'};\\ \\text{green ring: us}\\end{aligned}`;
    }
    if (m.phase === 'coma') {
      const sig = meta.coma.sigma, finger = (2 * sig) / H0;
      return `\\begin{aligned}&cz = H_0 d + v_{\\text{orbit}}\\quad \\text{(redshift adds both)} \\\\ &\\text{Coma: } ${hl(meta.coma.members, 0)}\\ \\text{members},\\ \\sigma_v = ${hl(sig, 0)}\\ \\text{km/s, measured here} \\\\ &\\text{finger} \\approx \\frac{2\\sigma_v}{H_0} = ${hl(finger, 0)}\\ \\text{Mpc long}${m.u > 0.45 ? ';\\ \\text{speeds removed}' : ''}\\end{aligned}`;
    }
    // cluster
    const xi = meta.xi, r = LIVE.r ?? 1.5;
    return `\\begin{aligned}&\\xi(r) = \\frac{DD - 2DR + RR}{RR}\\quad \\text{(Landy–Szalay)} \\\\ &\\text{within } ${hl(r, 1)}\\ \\text{Mpc: } ${hl(LIVE.count ?? 0, 0)}\\ \\text{neighbours, } ${hl(LIVE.expect ?? 0, 1)}\\ \\text{if random} \\\\ &\\xi \\approx (r/r_0)^{-\\gamma}:\\ r_0 = ${hl(xi.r0, 1)}\\ \\text{Mpc},\\ \\gamma = ${hl(xi.gamma, 2)}\\ \\text{(redshift space)} \\\\ &\\text{graph: measured } \\xi \\text{ (blue), fit (gold)} \\\\ &${hl(xi.n, 0)}\\ \\text{galaxies},\\ M_r < ${hl(xi.Mlim, 1)},\\ z < ${hl(xi.zmax, 2)}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.near = 0.01; cam.far = 100;
    ctx.scene.background = new THREE.Color(0x000000);
    ctx.scene.add(cam); // the ξ(r) graph rides on the camera
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 1400, width: 1.4 });
    const hud = createFatLines({ maxSegments: 400, width: 1.6, overlay: true });
    ctx.scene.add(lines.object);
    cam.add(hud.object);

    load().then((d) => {
      if (s.disposed) return;
      LIVE.data = d;
      s.d = d;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.n * 3), 3));
      g.setAttribute('aDir', new THREE.BufferAttribute(d.dir, 3));
      g.setAttribute('aD', new THREE.BufferAttribute(d.D, 1));
      g.setAttribute('aCol', new THREE.BufferAttribute(d.col, 1));
      g.setAttribute('aFlag', new THREE.BufferAttribute(d.fl, 1));
      const comaDir = dirOf(d.meta.coma.ra, d.meta.coma.dec, new THREE.Vector3());
      s.coma = comaDir.clone().multiplyScalar(d.meta.coma.D / UNIT);
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uShell: { value: SHELL }, uDepth: { value: 0 }, uSlabK: { value: 0 }, uSlabW: { value: SLAB_HALF },
          uSlabN: { value: new THREE.Vector3(0, 1, 0) }, uComaK: { value: 0 }, uComaD: { value: d.meta.coma.D / UNIT },
          uComaGlow: { value: 0 }, uPx: { value: 3 }, uAlpha: { value: 0.5 }, uMin: { value: 1.5 },
          uFocus: { value: d.F.clone() }, uFocusR: { value: 0 }, uFocusK: { value: 0 },
        },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      s.ready = true;
    }).catch((err) => console.error('sdss data', err));

    return { s, lines, hud, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, lines, hud, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height); hud.setResolution(width, height);
    lines.reset(); hud.reset();
    if (!s.ready) { lines.commit(); hud.commit(); return; }
    const d = s.d, U = s.mat.uniforms, aspect = width / height, portrait = aspect < 1;

    // ---------- what the galaxies do ----------
    let depth = 1, slabK = 0, comaK = 0, comaGlow = 0, focusK = 0, focusR = 0;
    if (m.phase === 'sky') depth = 0;
    else if (m.phase === 'depth') depth = smooth(Math.min(1, m.u / 0.75));
    else if (m.phase === 'return') depth = 1 - smooth(Math.min(1, m.u / 0.7));
    const tilt = m.tilt;
    if (m.phase === 'slice') slabK = smooth(Math.min(1, m.u / 0.12)) * (1 - smooth(Math.max(0, (m.u - 0.92) / 0.08)));
    U.uSlabN.value.set(0, 1, 0).applyAxisAngle(AXIS, rad(tilt));
    if (m.phase === 'coma') {
      comaGlow = smooth(Math.min(1, m.u / 0.2));
      comaK = smooth(Math.min(1, Math.max(0, (m.u - 0.45) / 0.2))) * (1 - smooth(Math.max(0, (m.u - 0.88) / 0.12)));
    }
    if (m.phase === 'cluster') {
      focusK = smooth(Math.min(1, m.u / 0.1)) * (1 - smooth(Math.max(0, (m.u - 0.92) / 0.08)));
      const k = Math.min(1, Math.max(0, (m.u - 0.08) / 0.8));
      focusR = 1.5 * Math.pow(60 / 1.5, k); // Mpc, growing on a log scale
    }
    U.uDepth.value = depth; U.uSlabK.value = slabK; U.uComaK.value = comaK; U.uComaGlow.value = comaGlow;
    U.uFocusK.value = focusK; U.uFocusR.value = focusR / UNIT;

    // ---------- camera ----------
    const view = (pos, look, fov, up = new THREE.Vector3(0, 1, 0)) => ({ pos, look, fov, up });
    const mix = (A, B, k) => view(A.pos.clone().lerp(B.pos, k), A.look.clone().lerp(B.look, k), A.fov + (B.fov - A.fov) * k, A.up.clone().lerp(B.up, k).normalize());
    const SKY = view(CENTRE.clone().multiplyScalar(-1.2), CENTRE.clone().multiplyScalar(3), portrait ? 95 : 75);
    const side = new THREE.Vector3().crossVectors(CENTRE, new THREE.Vector3(0, 1, 0)).normalize();
    const WIDE = view(CENTRE.clone().multiplyScalar(4).addScaledVector(side, 9).add(new THREE.Vector3(0, 4, 0)), CENTRE.clone().multiplyScalar(4), portrait ? 75 : 55);
    const n = U.uSlabN.value;
    const slabView = (k) => {
      const mid = CENTRE.clone().projectOnPlane(n).normalize().multiplyScalar(3.7);
      return view(mid.clone().addScaledVector(n, portrait ? 14 : 10.5), mid, 50, CENTRE.clone().projectOnPlane(n).normalize());
    };
    const comaSide = new THREE.Vector3().crossVectors(s.coma, new THREE.Vector3(0, 1, 0)).normalize();
    const COMA = view(s.coma.clone().addScaledVector(comaSide, portrait ? 0.75 : 0.5).add(new THREE.Vector3(0, 0.12, 0)), s.coma, 50, s.coma.clone().normalize());
    const F = d.F;
    const fSide = new THREE.Vector3().crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize();
    const FOCUS = (r) => view(F.clone().addScaledVector(fSide, Math.max(0.25, (r / UNIT) * (portrait ? 3.6 : 2.6))).add(new THREE.Vector3(0, (r / UNIT) * 0.6, 0)), F, 50);
    let vw;
    if (m.phase === 'sky') vw = SKY;
    else if (m.phase === 'depth') vw = mix(SKY, WIDE, smooth(Math.min(1, Math.max(0, (m.u - 0.15) / 0.85))));
    else if (m.phase === 'slice') vw = mix(WIDE, slabView(), smooth(Math.min(1, m.u / 0.15)));
    else if (m.phase === 'coma') vw = mix(slabView(), COMA, smooth(Math.min(1, m.u / 0.22)));
    else if (m.phase === 'cluster') vw = mix(COMA, FOCUS(Math.max(8, focusR)), smooth(Math.min(1, m.u / 0.12)));
    else vw = mix(FOCUS(60), SKY, smooth(Math.min(1, m.u / 0.6)));
    cam.position.copy(vw.pos); cam.up.copy(vw.up); cam.lookAt(vw.look);
    if (Math.abs(cam.fov - vw.fov) > 1e-3) { cam.fov = vw.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // size by the screen's short side, so tall phone screens don't fatten every point
    const fovShort = portrait ? 2 * Math.atan(Math.tan(rad(cam.fov) / 2) * aspect) : rad(cam.fov);
    U.uPx.value = (Math.min(width, height) / (2 * Math.tan(fovShort / 2))) * 0.009;
    // inside the slice only a few per cent of galaxies remain, so each is drawn bigger and brighter
    U.uMin.value = 1.6 + 1.0 * slabK;
    U.uAlpha.value = (m.phase === 'coma' || m.phase === 'cluster' ? 0.42 : 0.62) + 1.1 * slabK;

    // ---------- lines ----------
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    if (m.phase === 'slice' && slabK > 0.01) {
      // us, at the tip of the fan
      for (let q = 0; q < 32; q++) {
        const a0 = (q / 32) * Math.PI * 2, a1 = ((q + 1) / 32) * Math.PI * 2, R = 0.07;
        const e1 = new THREE.Vector3().crossVectors(n, CENTRE).normalize(), e2 = CENTRE.clone().projectOnPlane(n).normalize();
        v.set(0, 0, 0).addScaledVector(e1, Math.cos(a0) * R).addScaledVector(e2, Math.sin(a0) * R);
        w.set(0, 0, 0).addScaledVector(e1, Math.cos(a1) * R).addScaledVector(e2, Math.sin(a1) * R);
        lines.push(v, w, col(0x7dffa8, 0.9 * slabK));
      }
    }
    if (m.phase === 'coma') {
      // our line of sight through Coma
      v.copy(s.coma).multiplyScalar(0.75); w.copy(s.coma).multiplyScalar(1.25);
      lines.push(v, w, col(0xffd166, 0.35 * comaGlow));
    }
    if (m.phase === 'cluster' && focusK > 0) {
      // the counting sphere: three great circles
      const R = focusR / UNIT;
      const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
      for (let a = 0; a < 3; a++) {
        const e1 = ax[(a + 1) % 3], e2 = ax[(a + 2) % 3];
        for (let q = 0; q < 64; q++) {
          const t0 = (q / 64) * Math.PI * 2, t1 = ((q + 1) / 64) * Math.PI * 2;
          v.copy(F).addScaledVector(e1, Math.cos(t0) * R).addScaledVector(e2, Math.sin(t0) * R);
          w.copy(F).addScaledVector(e1, Math.cos(t1) * R).addScaledVector(e2, Math.sin(t1) * R);
          lines.push(v, w, col(0xffd166, 0.45 * focusK));
        }
      }
      // count round this one galaxy, and the number a random scatter would give
      let lo = 0, hi = d.near.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (d.near[mid] < focusR) lo = mid + 1; else hi = mid; }
      LIVE.r = focusR; LIVE.count = lo; LIVE.expect = (4 / 3) * Math.PI * focusR ** 3 * d.nbar;
      // ξ(r) graph on the camera: log r across, log ξ up; points appear as the sphere passes them
      const th = Math.tan(rad(cam.fov) / 2), Z = -1;
      // bottom-left on wide screens; across the bottom, inside the narrow width, on phones
      const halfW = aspect * th;
      const gw = portrait ? 2 * halfW - 0.2 * halfW : 0.62 * th, gh = portrait ? 0.32 * th : 0.5 * th;
      const gx = portrait ? -halfW + 0.12 * halfW : -halfW + 0.12 * th, gy = -th + (portrait ? 0.26 : 0.3) * th;
      const X = (r) => gx + ((Math.log(r) - Math.log(1.5)) / (Math.log(80) - Math.log(1.5))) * gw;
      const Y = (x) => gy + ((Math.log(x) - Math.log(0.02)) / (Math.log(15) - Math.log(0.02))) * gh;
      const k = focusK;
      v.set(gx, gy, Z); w.set(gx + gw, gy, Z); hud.push(v, w, col(0x8a93a6, 0.8 * k));
      v.set(gx, gy, Z); w.set(gx, gy + gh, Z); hud.push(v, w, col(0x8a93a6, 0.8 * k));
      for (const tick of [2, 5, 10, 20, 50]) { v.set(X(tick), gy, Z); w.set(X(tick), gy - 0.02 * th, Z); hud.push(v, w, col(0x8a93a6, 0.6 * k)); }
      for (const tick of [0.1, 1, 10]) { v.set(gx, Y(tick), Z); w.set(gx - 0.02 * th, Y(tick), Z); hud.push(v, w, col(0x8a93a6, 0.6 * k)); }
      const xi = d.meta.xi;
      xi.r.forEach((r, i) => {
        if (r > focusR || xi.xi[i] <= 0.02) return;
        const px = X(r), py = Y(xi.xi[i]), e = 0.014 * th;
        v.set(px - e, py, Z); w.set(px + e, py, Z); hud.push(v, w, col(0x7fd4ff, k));
        v.set(px, py - e, Z); w.set(px, py + e, Z); hud.push(v, w, col(0x7fd4ff, k));
      });
      if (focusR > 25) {
        for (let r = 2; r < 25; r *= 1.12) {
          const r2 = Math.min(25, r * 1.12);
          v.set(X(r), Y((r / xi.r0) ** -xi.gamma), Z); w.set(X(r2), Y((r2 / xi.r0) ** -xi.gamma), Z);
          hud.push(v, w, col(0xffd166, k * 0.9));
        }
      }
      // where the sphere is now
      if (focusR <= 80) { v.set(X(focusR), gy, Z); w.set(X(focusR), gy + gh, Z); hud.push(v, w, col(0xffd166, 0.25 * k)); }
    }
    lines.commit(); hud.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    state.lines.dispose(); state.hud.dispose();
    ctx.camera.remove(state.hud.object);
    if (s.points) { s.points.geometry.dispose(); s.mat.dispose(); }
    LIVE.data = null;
  },
};
