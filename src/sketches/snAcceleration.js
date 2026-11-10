import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Universe Is Speeding Up. Pantheon+: 1701 light curves of 1550 type Ia supernovae, the exploding
// white dwarfs that all peak at nearly the same brightness, so how faint one looks says how far it is.
//   sky       each one where it exploded: its direction, and the distance its faintness gives,
//             flashing with a type Ia light curve
//   diagram   the same points become the Hubble diagram, distance modulus μ against redshift z, with
//             three universes drawn through them: matter only, empty, and the best fit
//   residual  μ minus the empty universe's: the far ones are fainter (farther) than even an empty,
//             coasting universe allows. The expansion has sped up
//   plane     the fit without assuming a flat universe: matter Ωm against dark energy ΩΛ, 1-2-3σ
//   h0        the nearby ones with distances tied to Cepheid stars: velocity = H0 × distance, and the
//             Hubble tension with the early-universe value
// tools/sn/build_sn.py makes the data and every fit (full statistical + systematic covariance).

const DATA_URL = '/data/sn/';
const PHASES = [['sky', 9], ['diagram', 9], ['residual', 10], ['plane', 10], ['h0', 10]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const CKMS = 299792.458;
const UNIT = 500;                     // Mpc per scene unit in the 3D view
const LIVE = { d: null };

// H0 dL / c for matter Om and dark energy OL (curvature 1 − Om − OL), by Simpson's rule
function dlUnit(z, Om, OL) {
  const Ok = 1 - Om - OL, E = (x) => Math.sqrt(Om * (1 + x) ** 3 + OL + Ok * (1 + x) ** 2);
  const n = 64, h = z / n;
  let s = 1 / E(0) + 1 / E(z);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) / E(i * h);
  let chi = (s * h) / 3;
  if (Ok > 1e-6) chi = Math.sinh(Math.sqrt(Ok) * chi) / Math.sqrt(Ok);
  else if (Ok < -1e-6) chi = Math.sin(Math.sqrt(-Ok) * chi) / Math.sqrt(-Ok);
  return (1 + z) * chi;
}
const muOf = (z, Om, OL, H0) => 5 * Math.log10((CKMS / H0) * dlUnit(z, Om, OL)) + 25;

const VERT = /* glsl */ `
  attribute float aB;
  attribute vec3 aCol;
  uniform float uPx;
  varying vec3 vCol;
  varying float vB;
  void main() {
    vCol = aCol; vB = aB;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPx * (0.7 + 1.6 * aB);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vB;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 4.0) + 0.15 * (1.0 - r2);
    gl_FragColor = vec4(vCol * core * (0.35 + 1.4 * vB), 1.0);
  }`;

// a type Ia light curve, roughly: an 18-day rise, a fast drop, then a slow tail (time in days from peak)
const lightCurve = (d) => (d < -18 ? 0 : d < 0 ? Math.exp(-((d / 9) ** 2)) : 0.7 * Math.exp(-d / 12) + 0.3 * Math.exp(-d / 45));

// marching squares: segments where the grid crosses `level`
function contour(grid, nx, ny, level, emit) {
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
    const pts = [];
    const edge = (v0, v1, x0, y0, x1, y1) => {
      if ((v0 < level) !== (v1 < level)) { const t = (level - v0) / (v1 - v0); pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
    };
    edge(a, b, i, j, i + 1, j); edge(b, c, i + 1, j, i + 1, j + 1); edge(c, d, i + 1, j + 1, i, j + 1); edge(d, a, i, j + 1, i, j);
    if (pts.length >= 2) emit(pts[0], pts[1]);
    if (pts.length === 4) emit(pts[2], pts[3]);
  }
}

async function load() {
  const [meta, buf] = await Promise.all([fetch(DATA_URL + 'meta.json').then((r) => r.json()), fetch(DATA_URL + 'sn.bin').then((r) => r.arrayBuffer())]);
  const f = new Float32Array(buf), n = f.length / 7;
  const z = new Float32Array(n), mu = new Float32Array(n), err = new Float32Array(n), cal = new Uint8Array(n), sky = new Float32Array(n * 3), t0 = new Float32Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    z[i] = f[i * 7]; mu[i] = f[i * 7 + 1]; err[i] = f[i * 7 + 2]; cal[i] = f[i * 7 + 6];
    const ra = (f[i * 7 + 3] * Math.PI) / 180, dec = (f[i * 7 + 4] * Math.PI) / 180;
    const dl = 10 ** ((mu[i] - 25) / 5), D = dl / (1 + z[i]) / UNIT;   // comoving distance from the faintness
    sky[i * 3] = D * Math.cos(dec) * Math.cos(ra); sky[i * 3 + 1] = D * Math.sin(dec); sky[i * 3 + 2] = -D * Math.cos(dec) * Math.sin(ra);
    t0[i] = rnd();
  }
  const M = meta, H0 = M.H0;
  // the empty universe's μ at each supernova, for the residuals
  const muE = new Float32Array(n);
  for (let i = 0; i < n; i++) muE[i] = muOf(z[i], 0, 0, H0);
  return { meta, n, z, mu, err, cal, sky, t0, muE };
}

export default {
  name: 'The Universe Is Speeding Up',
  description:
    'Fifteen hundred type Ia supernovae, the standard candles of cosmology, placed where they exploded, then ' +
    'turned into the Hubble diagram that showed the expansion of the universe is accelerating. Fitted here ' +
    'with the full published covariance: matter 33%, dark energy the rest, acceleration at 6.7σ, and the ' +
    'Hubble constant from the Cepheid-calibrated ones. Data: Pantheon+ (Scolnic et al. 2022, Brout et al. 2022).',
  tags: ['supernovae', 'dark energy', 'hubble diagram', 'cosmology', 'pantheon+', 'real data', 'hubble tension'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) return { T, phase, u: (T - acc) / len, len };
      acc += len;
    }
    return { T, phase: 'sky', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading 1701 supernovae…}';
    const M = d.meta;
    if (m.phase === 'sky')
      return `\\begin{aligned}&\\mu = m - M = 5\\log_{10}\\frac{d_L}{10\\ \\text{pc}} \\\\ &\\text{every type Ia peaks near } M = -19.3 \\\\ &\\text{so faintness gives distance: } ${hl(M.n, 0)}\\ \\text{light curves} \\\\ &\\text{placed at } D = d_L/(1+z),\\ \\text{out to } z = 2.26\\end{aligned}`;
    if (m.phase === 'diagram')
      return `\\begin{aligned}&\\mu(z) = 5\\log_{10}\\Big[(1+z)\\frac{c}{H_0}\\!\\int_0^z\\!\\frac{dz'}{E(z')}\\Big] + 25 \\\\ &E^2 = \\Omega_m(1+z)^3 + \\Omega_\\Lambda \\\\ &{\\color{#8a93a6}\\text{matter only}},\\ {\\color{#d8dee9}\\text{empty}},\\ {\\color{#ffd166}\\Omega_m = ${M.Om.toFixed(3)}\\ \\text{(best, flat)}}\\end{aligned}`;
    if (m.phase === 'residual')
      return `\\begin{aligned}&\\Delta\\mu = \\mu - \\mu_{\\text{empty}}:\\ \\text{above zero is fainter, so farther} \\\\ &\\text{far ones sit } {\\approx}\\,0.15\\text{–}0.2\\ \\text{mag above: the expansion sped up} \\\\ &\\Delta\\chi^2:\\ \\text{matter only } +${hl(M.alts.matterOnly, 0)},\\ \\text{empty } +${hl(M.alts.empty, 0)} \\\\ &\\Omega_m = ${hl(M.Om, 3)} \\pm ${hl((M.OmHi - M.OmLo) / 2, 3)}\\quad \\text{(published } 0.334 \\pm 0.018\\text{)}\\end{aligned}`;
    if (m.phase === 'plane')
      return `\\begin{aligned}&\\text{without assuming a flat universe:} \\\\ &\\Omega_m = ${hl(M.plane.best[0], 2)},\\ \\Omega_\\Lambda = ${hl(M.plane.best[1], 2)}\\quad (1,2,3\\sigma) \\\\ &q_0 = \\tfrac{\\Omega_m}{2} - \\Omega_\\Lambda < 0\\ \\text{above the line: speeding up} \\\\ &\\text{the best slowing universe is } ${hl(M.sigmaAccel, 1)}\\sigma\\ \\text{out}\\end{aligned}`;
    return `\\begin{aligned}&v = cz = H_0\\, d\\quad \\text{(${M.nH0} supernovae, } 0.023 < z < 0.15) \\\\ &\\text{gold: } ${hl(LIVE.ncal || 0, 0)}\\ \\text{light curves in galaxies with Cepheids} \\\\ &H_0 = ${hl(M.H0, 1)}\\ \\text{km/s/Mpc}\\ \\text{(published } 73.0 \\pm 1.0\\text{)} \\\\ &\\text{early universe (Planck): } {\\color{#7fd4ff}67.4}\\text{: the Hubble tension}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 45; cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x000000);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 9000, width: 1.5 });
    ctx.scene.add(lines.object);
    load().then((d) => {
      if (s.disposed) return;
      const g = new THREE.BufferGeometry();
      s.pos = new Float32Array(d.n * 3); s.B = new Float32Array(d.n); s.col = new Float32Array(d.n * 3);
      g.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(s.B, 1));
      g.setAttribute('aCol', new THREE.BufferAttribute(s.col, 3));
      s.geo = g;
      s.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uPx: { value: 4 } }, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      // colour by redshift: near ones blue-white, far ones amber
      const c = new THREE.Color(), a = new THREE.Color(0x9fd0ff), b = new THREE.Color(0xffb36b);
      for (let i = 0; i < d.n; i++) { c.copy(a).lerp(b, Math.min(1, Math.max(0, Math.log10(d.z[i] / 0.01) / Math.log10(100)))); s.col.set([c.r, c.g, c.b], i * 3); }
      s.baseCol = s.col.slice();
      LIVE.ncal = d.cal.reduce((x, y) => x + y, 0);
      // model curves, sampled once
      const zs = []; for (let k = 0; k <= 200; k++) zs.push(10 ** (-3 + (k / 200) * Math.log10(2300)));
      const M = d.meta;
      s.curves = {
        zs,
        matter: zs.map((zz) => muOf(zz, 1, 0, M.H0)), empty: zs.map((zz) => muOf(zz, 0, 0, M.H0)), best: zs.map((zz) => muOf(zz, M.Om, 1 - M.Om, M.H0)),
      };
      // the plane's grid
      const P = M.plane, nx = P.om[2], ny = P.ol[2];
      s.contours = [2.3, 6.18, 11.83].map((L) => { const segs = []; contour(P.dchi2, nx, ny, L, (p, q) => segs.push([p, q])); return segs; });
      LIVE.d = d; s.d = d; s.ready = true;
    }).catch((err) => console.error('sn data', err));
    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), look: new THREE.Vector3(), camFrom: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c, look } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    lines.setResolution(width, height); lines.reset();
    if (!s.ready) { lines.commit(); return; }
    const d = s.d, M = d.meta, n = d.n;

    // ---------- graph frame: a 2D panel in the z = 0 plane, sized to the screen ----------
    const GW = portrait ? 4.4 : 7.2, GH = portrait ? 5.2 : 4.0;
    const gx = -GW / 2 - (portrait ? 0 : 0.5), gy = -GH / 2 - (portrait ? 0.9 : 0.55);
    // camera: orbiting the sky, then square on to the panel
    const toGraph = m.phase === 'sky' ? smooth(Math.max(0, (m.u - 0.8) / 0.2)) : 1;
    const ang = 0.5 + ctx.time * 0.05;
    const fitD = (portrait ? GW / aspect : GH) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (portrait ? 1.25 : 1.75);
    const P0 = state.camFrom.set(Math.cos(ang) * 11, 4.5, Math.sin(ang) * 11);
    const ly = (portrait ? -0.3 : -0.35) * toGraph;   // square on: no tilt, so the axes stay upright
    cam.position.set(P0.x * (1 - toGraph), P0.y * (1 - toGraph) + ly, P0.z * (1 - toGraph) + fitD * toGraph);
    look.set(0, ly, 0);
    cam.lookAt(look);

    // ---------- where each supernova is in each view ----------
    const lz = (zz) => (Math.log10(zz) + 3) / (Math.log10(2.3) + 3);
    const viewPos = (phase, i, out) => {
      const zz = d.z[i];
      if (phase === 'sky') return out.set(d.sky[i * 3], d.sky[i * 3 + 1], d.sky[i * 3 + 2]);
      if (phase === 'diagram') return out.set(gx + lz(zz) * GW, gy + ((d.mu[i] - 28) / (47 - 28)) * GH, 0);
      if (phase === 'residual' || phase === 'plane') return out.set(gx + lz(zz) * GW, gy + ((d.mu[i] - d.muE[i] + 0.9) / 1.5) * GH, 0);
      // h0: velocity against distance, nearby only
      const dist = 10 ** ((d.mu[i] - 25) / 5);
      return out.set(gx + (dist / 700) * GW, gy + ((CKMS * zz) / 45000) * GH, 0);
    };
    const order = PHASES.map((p) => p[0]);
    const k = order.indexOf(m.phase), prev = order[(k + order.length - 1) % order.length];
    const morph = smooth(Math.min(1, m.u / 0.22));
    const days = ctx.time * 30;                                   // light-curve clock: 30 days a second
    let ncal = 0;
    for (let i = 0; i < n; i++) {
      // staggered: nearer supernovae move first
      const st = Math.min(1, Math.max(0, (morph * 1.6 - 0.6 * lz(d.z[i]))));
      const e = smooth(st);
      viewPos(prev, i, v); viewPos(m.phase, i, w);
      if (m.phase === 'sky' && prev === 'h0') { v.copy(w); } // the loop restarts from the sky
      v.lerp(w, m.phase === 'sky' ? 1 : e);
      s.pos[i * 3] = v.x; s.pos[i * 3 + 1] = v.y; s.pos[i * 3 + 2] = v.z;
      let b = 0.35;
      if (m.phase === 'sky') b = 0.15 + 0.85 * lightCurve(((days / 120 + d.t0[i]) % 1) * 120 - 30);
      let a = 1;
      if (m.phase === 'plane') a = 1 - smooth(Math.min(1, m.u / 0.3));
      if (m.phase === 'h0') { const near = d.z[i] < 0.15 || d.cal[i]; a = near ? 1 : 0; if (d.cal[i]) { b = 1; ncal++; } }
      if (prev === 'h0' && m.phase === 'sky') a = smooth(Math.min(1, m.u / 0.15));
      s.B[i] = b * a;
      const cc = d.cal[i] && m.phase === 'h0' ? [1, 0.82, 0.4] : [s.baseCol[i * 3], s.baseCol[i * 3 + 1], s.baseCol[i * 3 + 2]];
      s.col[i * 3] = cc[0] * a; s.col[i * 3 + 1] = cc[1] * a; s.col[i * 3 + 2] = cc[2] * a;
    }
    s.geo.attributes.position.needsUpdate = true; s.geo.attributes.aB.needsUpdate = true; s.geo.attributes.aCol.needsUpdate = true;
    s.mat.uniforms.uPx.value = Math.max(2.5, Math.min(width, height) / 260);

    // ---------- lines ----------
    const col = (hex, kk) => c.set(hex).multiplyScalar(kk);
    const seg = (x0, y0, x1, y1, hex, kk) => { v.set(x0, y0, 0); w.set(x1, y1, 0); lines.push(v, w, col(hex, kk)); };
    const K = m.phase === 'sky' ? 0 : smooth(Math.min(1, m.u / 0.25)) * (1 - smooth(Math.max(0, (m.u - 0.93) / 0.07)));
    if (m.phase === 'sky') {
      // the Milky Way: a small cross at the centre, where we are
      const r = 0.15;
      seg(-r, 0, r, 0, 0xd8dee9, 0.6); v.set(0, 0, -r); w.set(0, 0, r); lines.push(v, w, col(0xd8dee9, 0.6));
    } else {
      seg(gx, gy, gx + GW, gy, 0x8a93a6, 0.8 * K); seg(gx, gy, gx, gy + GH, 0x8a93a6, 0.8 * K);
    }
    const curve = (ys, Y, hex, kk, dash) => {
      const zs = s.curves.zs;
      for (let q = 1; q < zs.length; q++) {
        if (dash && q % 4 < 2) continue;
        const y0 = Y(ys[q - 1], q - 1), y1 = Y(ys[q], q);
        if (y0 < gy || y1 < gy || y0 > gy + GH || y1 > gy + GH) continue;
        seg(gx + lz(zs[q - 1]) * GW, y0, gx + lz(zs[q]) * GW, y1, hex, kk);
      }
    };
    if (m.phase === 'diagram' || m.phase === 'residual') {
      const resid = m.phase === 'residual';
      const Y = resid ? (y, q) => gy + ((y - s.curves.empty[q] + 0.9) / 1.5) * GH : (y) => gy + ((y - 28) / 19) * GH;
      const kk = K * smooth(Math.min(1, Math.max(0, (m.u - 0.25) / 0.2)));
      curve(s.curves.matter, Y, 0x8a93a6, kk);
      curve(s.curves.empty, Y, 0xd8dee9, kk, true);
      curve(s.curves.best, Y, 0xffd166, kk);
      for (const t of [0.001, 0.01, 0.1, 1]) seg(gx + lz(t) * GW, gy, gx + lz(t) * GW, gy - 0.1, 0x8a93a6, 0.7 * K);
      if (resid) {
        // binned averages with error bars
        const kb = K * smooth(Math.min(1, Math.max(0, (m.u - 0.35) / 0.2)));
        for (const b of M.bins) {
          const x = gx + lz(b.z) * GW, y = gy + ((b.d + 0.9) / 1.5) * GH, e = (b.e / 1.5) * GH, h = 0.06;
          seg(x, y - e, x, y + e, 0xffffff, kb); seg(x - h, y, x + h, y, 0xffffff, kb);
        }
      }
    }
    if (m.phase === 'plane') {
      const P = M.plane, X = (om) => gx + (om / 1.0) * GW, Y = (ol) => gy + (ol / 1.4) * GH;
      const kk = K * smooth(Math.min(1, Math.max(0, (m.u - 0.2) / 0.25)));
      const hexes = [0xffd166, 0xffb36b, 0xb0603a];
      s.contours.forEach((segs, li) => {
        for (const [p, q] of segs) seg(X(p[0] / (P.om[2] - 1)), Y((p[1] / (P.ol[2] - 1)) * 1.4), X(q[0] / (P.om[2] - 1)), Y((q[1] / (P.ol[2] - 1)) * 1.4), hexes[li], kk * (1 - 0.2 * li));
      });
      // flat universes, and the line between speeding up and slowing down
      seg(X(0), Y(1), X(1), Y(0), 0x7fd4ff, 0.7 * kk);
      for (let q = 0; q < 20; q += 2) seg(X(q / 20), Y(q / 40), X((q + 1) / 20), Y((q + 1) / 40), 0xd8dee9, 0.7 * kk);
      const bx = X(P.best[0]), by = Y(P.best[1]), h = 0.08;
      seg(bx - h, by, bx + h, by, 0xffffff, kk); seg(bx, by - h, bx, by + h, 0xffffff, kk);
      for (const t of [0.5, 1]) { seg(X(t), gy, X(t), gy - 0.1, 0x8a93a6, 0.7 * K); seg(gx, Y(t), gx - 0.1, Y(t), 0x8a93a6, 0.7 * K); }
    }
    if (m.phase === 'h0') {
      const X = (dd) => gx + (dd / 700) * GW, Y = (vv) => gy + (vv / 45000) * GH;
      const kk = K * smooth(Math.min(1, Math.max(0, (m.u - 0.3) / 0.25)));
      seg(X(0), Y(0), X(Math.min(700, 45000 / M.H0)), Y(Math.min(45000, 700 * M.H0)), 0xffd166, kk);
      seg(X(0), Y(0), X(Math.min(700, 45000 / 67.4)), Y(Math.min(45000, 700 * 67.4)), 0x7fd4ff, kk);
      for (const t of [200, 400, 600]) seg(X(t), gy, X(t), gy - 0.1, 0x8a93a6, 0.7 * K);
    }
    LIVE.ncal = LIVE.ncal || ncal;
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
