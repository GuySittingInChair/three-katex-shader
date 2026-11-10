import * as THREE from 'three';
import { TAU, smooth } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// Where does orbiting stop? Five sizes of the universe, each moving by the rule that really governs it.
// The tour holds each for 16 s.
//
//   01 atom     hydrogen has no orbit: the electron is a cloud of odds |ψ|². Each dot is one place a
//               measurement could find it, drawn fresh every frame. Radial densities in Bohr radii a₀:
//               1s ∝ r²e^(−2r) (Gamma(3, ½)), 2p ∝ r⁴e^(−r)·cos²θ (Gamma(5, 1)), 3d ∝ r⁶e^(−2r/3)·(3cos²θ−1)²
//               (Gamma(7, 3/2)), angles by rejection. Seen side-on.
//   02 planets  the four inner planets on their real ellipses (a, e from NASA's fact sheets), Sun at one
//               focus, timed by Kepler's equation M = E − e sin E with T = a^{3/2} years: Mercury visibly
//               speeds up at perihelion. Speed by vis-viva, v = 29.78·√(2/r − 1/a) km/s.
//   03 galaxy   a Milky-Way-like disk: every star circles at the speed the rotation curve gives for its
//               radius, Ω = v/r. Measured curves are flat (≈ 230 km/s) far beyond the visible stars; the
//               second half of the slot swaps in what stars + gas alone would give (an exponential disk,
//               scale length 3 kpc, peak matched to 230), and the outer disk falls behind. Arms are a
//               two-armed log-spiral density wave (pitch 13°) turning at 25 km/s/kpc, slower than the
//               stars, which brighten as they pass through. Inset: speed against radius, both curves.
//   04 cluster  70 galaxies in a cluster's gravity (isothermal sphere, v_c = 1000 km/s ≈ 1.02 Mpc/Gyr,
//               core 0.08 Mpc), integrated in 3-D by leapfrog once at setup; looping orbits in every
//               direction, seen from one side. The largest thing that orbits.
//   05 web      past clusters nothing goes round anything. Clusters and filaments (made up, the right
//               look) stretch with space: every distance × a(t) = e^{H₀t}, H₀ = 70 km/s/Mpc, while matter
//               slowly drains along filaments into the clusters. Viewed from one galaxy; any galaxy would
//               see the same, so there is no centre to orbit. No rotation of the universe is observed
//               (CMB: Saadeh et al. 2016).
// Each view is to scale within itself, not between views.

const SLOT = 16;
const SCALES = ['atom', 'planets', 'galaxy', 'cluster', 'web'];
const SHOW = ['tour', ...SCALES];
const FADE = 0.9;
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = mulberry(20261110);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
const rad = (d) => (d * Math.PI) / 180;

// ---- 01 atom ----
const ORB = [
  { name: '1s', k: 3, th: 0.5, ang: () => 1, view: 5, tex: 'P(r) \\propto r^{2}e^{-2r/a_0}', mean: 1.5 },
  { name: '2p', k: 5, th: 1, ang: (c) => c * c, view: 14, tex: 'P(r,\\theta) \\propto r^{4}e^{-r/a_0}\\cos^2\\theta', mean: 5 },
  { name: '3d', k: 7, th: 1.5, ang: (c) => (3 * c * c - 1) ** 2 / 4, view: 30, tex: 'P(r,\\theta) \\propto r^{6}e^{-2r/3a_0}(3\\cos^2\\theta-1)^2', mean: 10.5 },
];
const ELECTRONS = 1500;
const gammaInt = (k, th) => { let s = 0; for (let i = 0; i < k; i++) s -= Math.log(1 - Math.random()); return s * th; };
function electron(o) {
  for (;;) {
    const c = 2 * Math.random() - 1;
    if (Math.random() > o.ang(c)) continue;
    const r = gammaInt(o.k, o.th), s = Math.sqrt(1 - c * c), phi = TAU * Math.random();
    return [r * s * Math.cos(phi), r * c];
  }
}

// ---- 02 planets ----
const PLANETS = [
  { name: 'Mercury', a: 0.387, e: 0.2056, w: 77, M0: 174, c: 0xb9b1a8, r: 0.06 },
  { name: 'Venus', a: 0.723, e: 0.0068, w: 131, M0: 50, c: 0xe8c98a, r: 0.08 },
  { name: 'Earth', a: 1.0, e: 0.0167, w: 103, M0: 358, c: 0x7fb4ff, r: 0.085 },
  { name: 'Mars', a: 1.524, e: 0.0934, w: 336, M0: 19, c: 0xe07a5f, r: 0.07 },
];
const YEARS_PER_S = 1 / 6;
function kepler(M, e) { let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
function planetAt(p, years) {
  const b = p.a * Math.sqrt(1 - p.e * p.e), w = rad(p.w);
  const E = kepler(rad(p.M0) + (TAU * years) / p.a ** 1.5, p.e);
  const x = p.a * (Math.cos(E) - p.e), y = b * Math.sin(E);
  const X = x * Math.cos(w) - y * Math.sin(w), Y = x * Math.sin(w) + y * Math.cos(w);
  return { X, Y, v: 29.78 * Math.sqrt(2 / Math.hypot(X, Y) - 1 / p.a) };
}

// ---- 03 galaxy ----
const MYR_PER_S = 20;
const KMS_KPC = 1.0227e-3; // 1 km/s/kpc in radians per Myr
const GAL_R = 16.5;
const vFlat = (r) => 230 * (1 - Math.exp(-r / 1.4));
const mVis = (r) => 1 - (1 + r / 3) * Math.exp(-r / 3);
let visNorm = 1;
{ let best = 0; for (let r = 0.1; r < 20; r += 0.05) best = Math.max(best, Math.sqrt(mVis(r) / r)); visNorm = 230 / best; }
const vVis = (r) => visNorm * Math.sqrt(mVis(r) / Math.max(r, 0.05));
const STARS = Array.from({ length: 2600 }, (_, i) => ({
  r: i === 0 ? 8.2 : i % 6 === 0 ? 0.2 + Math.abs(gauss()) * 0.9 : Math.min(16, 1 - 3.5 * Math.log(1 - rnd() * 0.985)),
  a: i === 0 ? 0 : TAU * rnd(),
  m: 0.4 + rnd() * 0.6,
}));
const ARM_GAS = Array.from({ length: 900 }, (_, i) => ({ r: 2.6 + rnd() * 12.5, arm: i % 2, j: gauss() * 0.06 }));
const PITCH = Math.tan(rad(13));
const PATTERN = 25;
// angle after `myr`, flat curve until `swap`, then visible-only (closed form, so motion stays a function of time)
function starAngle(s, myr, swap) {
  const a = Math.min(myr, swap), b = Math.max(0, myr - swap);
  return s.a + ((vFlat(s.r) * a + vVis(s.r) * b) / s.r) * KMS_KPC;
}

// ---- 04 cluster ----
const GYR_PER_S = 0.15;
const VC = 1.0227, RC = 0.08, CL_R = 1.8;
const CL_SAMPLES = 480, CL_DT = (SLOT * GYR_PER_S) / CL_SAMPLES, TRAIL = 24;
const CLUSTER = (() => {
  const gals = Array.from({ length: 70 }, () => {
    const r = 0.15 + 1.3 * Math.cbrt(rnd()), c = 2 * rnd() - 1, ph = TAU * rnd(), s = Math.sqrt(1 - c * c), sig = VC / Math.SQRT2;
    return { p: [r * s * Math.cos(ph), r * s * Math.sin(ph), r * c], v: [gauss() * sig, gauss() * sig, gauss() * sig], size: 0.03 + rnd() * 0.04, path: [] };
  });
  for (let k = 0; k <= CL_SAMPLES; k++) {
    for (const g of gals) g.path.push([g.p[0], g.p[1]]);
    const n = 8, h = CL_DT / n;
    for (let j = 0; j < n; j++) for (const g of gals) {
      const r2 = g.p[0] ** 2 + g.p[1] ** 2 + g.p[2] ** 2 + RC * RC, f = -(VC * VC) / r2;
      for (let i = 0; i < 3; i++) g.v[i] += f * g.p[i] * h;
      for (let i = 0; i < 3; i++) g.p[i] += g.v[i] * h;
    }
  }
  return gals;
})();

// ---- 05 cosmic web ----
const H0 = 70 * 1.0227e-3; // per Gyr
const WEB_GYR_PER_S = 0.8;
const WEB = (() => {
  const nodes = Array.from({ length: 16 }, () => [2 * rnd() - 1, 2 * rnd() - 1]);
  const pts = [];
  const edges = [];
  nodes.forEach((n, i) => {
    nodes.map((m, j) => [j, Math.hypot(m[0] - n[0], m[1] - n[1])]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3)
      .forEach(([j, d]) => { if (d < 0.9 && !edges.some(([a, b]) => a === j && b === i)) edges.push([i, j]); });
  });
  for (const n of nodes) for (let k = 0; k < 28; k++) pts.push({ p: [n[0] + gauss() * 0.03, n[1] + gauss() * 0.03], home: n, node: true });
  for (const [i, j] of edges) {
    const a = nodes[i], b = nodes[j];
    for (let k = 0; k < 26; k++) {
      const t = rnd(), w = 0.018 * (1 - Math.abs(t - 0.5));
      pts.push({ p: [a[0] + (b[0] - a[0]) * t + gauss() * w, a[1] + (b[1] - a[1]) * t + gauss() * w], home: t < 0.5 ? a : b, node: false });
    }
  }
  for (let k = 0; k < 60; k++) pts.push({ p: [2 * rnd() - 1, 2 * rnd() - 1], home: null, node: false });
  let here = 0;
  pts.forEach((w, i) => { if (Math.hypot(...w.p) < Math.hypot(...pts[here].p)) here = i; });
  return { pts, here };
})();
const webAt = (w, gyr) => {
  if (!w.home || w.node) return w.p;
  const f = Math.exp(-0.02 * gyr / WEB_GYR_PER_S);
  return [w.home[0] + (w.p[0] - w.home[0]) * f, w.home[1] + (w.p[1] - w.home[1]) * f];
};

const TITLES = {
  atom: '01\\ \\text{atom: no orbit, a cloud of odds}',
  planets: '02\\ \\text{planets: ellipses, Sun at a focus}',
  galaxy: '03\\ \\text{galaxy: everything at about one speed}',
  cluster: '04\\ \\text{cluster: the last thing that orbits}',
  web: '05\\ \\text{cosmic web: orbiting stops}',
};

export default {
  name: 'Where Orbiting Stops',
  description:
    'From the atom to the cosmic web: an electron that has no orbit at all, planets on Kepler ellipses, a galaxy ' +
    'whose stars all move at about the same speed (dark matter, switched off halfway to show the difference), ' +
    'galaxies looping round a cluster, and past that, the expansion of space, where orbiting stops. Each scale ' +
    'runs on its real equation, shown live.',
  tags: ['gravity', 'orbits', 'kepler', 'dark matter', 'cosmology', 'quantum'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',

  motion(t, params) {
    const show = SHOW[Math.round(params?.show ?? 0)] ?? 'tour';
    let scale, local;
    if (show === 'tour') {
      const k = Math.floor(t / SLOT);
      scale = SCALES[((k % SCALES.length) + SCALES.length) % SCALES.length];
      local = t - k * SLOT;
    } else {
      scale = show;
      local = ((t % (SLOT * 4)) + SLOT * 4) % (SLOT * 4);
    }
    const span = show === 'tour' ? SLOT : SLOT * 4;
    const fade = show === 'tour' ? Math.min(1, smooth(Math.min(local, span - local) / FADE)) : 1;
    const orb = ORB[Math.min(2, Math.floor((local % SLOT) / (SLOT / 3)))];
    const swap = (SLOT / 2) * MYR_PER_S;
    const myr = (local % SLOT) * MYR_PER_S;
    const years = local * YEARS_PER_S;
    const merc = planetAt(PLANETS[0], years);
    const sunPeriod = (TAU * 8.2) / ((myr < swap ? vFlat(8.2) : vVis(8.2)) * KMS_KPC);
    const webGyr = (local % SLOT) * WEB_GYR_PER_S;
    return {
      scale, local, fade, orb, years, merc, myr, swap, sunPeriod,
      darkMatter: myr < swap,
      gyr: (local % SLOT) * GYR_PER_S,
      webGyr, webA: Math.exp(H0 * webGyr),
    };
  },

  latex: (params, hl, m) => {
    const head = `&${TITLES[m.scale]} \\\\`;
    if (m.scale === 'atom')
      return `\\begin{aligned}${head} &${m.orb.tex} \\\\ &\\text{hydrogen } ${m.orb.name}:\\ \\langle r\\rangle = ${hl(m.orb.mean, 1)}\\,a_0,\\quad a_0 = 0.053\\,\\text{nm} \\\\ &\\text{each dot: one place it could be found}\\end{aligned}`;
    if (m.scale === 'planets')
      return `\\begin{aligned}${head} &M = E - e\\sin E,\\quad T = a^{3/2}\\ \\text{yr} \\\\ &v = 29.78\\sqrt{\\tfrac{2}{r} - \\tfrac{1}{a}}\\ \\tfrac{\\text{km}}{\\text{s}},\\quad \\text{year } ${hl(m.years, 2)} \\\\ &\\text{Mercury: } r = ${hl(Math.hypot(m.merc.X, m.merc.Y), 3)}\\,\\text{AU},\\ v = ${hl(m.merc.v, 1)}\\,\\text{km/s}\\end{aligned}`;
    if (m.scale === 'galaxy')
      return `\\begin{aligned}${head} &\\Omega(r) = v(r)/r,\\quad ${m.darkMatter ? 'v(r) = 230\\,(1 - e^{-r/1.4})\\ \\text{km/s}' : 'v = v_{\\text{stars+gas}}(r)'} \\\\ &${m.darkMatter ? '\\text{measured (dark matter in)}' : '\\text{what stars + gas alone would give}'} \\\\ &t = ${hl(m.myr, 0)}\\ \\text{Myr},\\quad \\text{Sun\'s orbit: } ${hl(m.sunPeriod, 0)}\\ \\text{Myr}\\end{aligned}`;
    if (m.scale === 'cluster')
      return `\\begin{aligned}${head} &\\ddot{\\mathbf{x}} = -\\frac{v_c^2\\,\\mathbf{x}}{r^2 + r_c^2},\\quad v_c = 1000\\ \\text{km/s} \\\\ &t = ${hl(m.gyr, 2)}\\ \\text{Gyr},\\quad \\text{70 galaxies, seen side-on}\\end{aligned}`;
    return `\\begin{aligned}${head} &d(t) = a(t)\\,d_0,\\quad a(t) = e^{H_0 t},\\quad H_0 = 70\\ \\tfrac{\\text{km/s}}{\\text{Mpc}} \\\\ &t = ${hl(m.webGyr, 1)}\\ \\text{Gyr},\\quad a = ${hl(m.webA, 2)} \\\\ &\\text{no centre to go round; no rotation seen}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    show: { value: 0, min: 0, max: SHOW.length - 1, step: 1, options: SHOW },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 7.5);
    const dots = createDots({ maxPoints: 4200, radius: 0.015 });
    const lines = createFatLines({ maxSegments: 3200, width: 1.2 });
    ctx.scene.add(lines.object, dots.object);
    return { dots, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), planetC: PLANETS.map((p) => new THREE.Color(p.c)) };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { dots, lines, v, w, c } = state;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    dots.setCamera(ctx.camera, height);
    // fit the view to the screen, portrait or landscape
    const halfH = ctx.camera.position.length() * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2);
    const R = 0.9 * Math.min(halfH, halfH * (width / height));
    const f = m.fade;
    const col = (hex, k = 1) => c.set(hex).multiplyScalar(f * k);
    const dot = (x, y, hex, r, k = 1) => { v.set(x, y, 0); dots.push(v, col(hex, k), r); };
    const seg = (x0, y0, x1, y1, hex, k = 1) => { v.set(x0, y0, 0); w.set(x1, y1, 0); lines.push(v, w, col(hex, k)); };
    dots.reset();
    lines.reset();

    if (m.scale === 'atom') {
      const px = R / m.orb.view;
      for (let i = 0; i < ELECTRONS; i++) { const [x, z] = electron(m.orb); dot(x * px, z * px, 0x8fb8ff, 0.012, 0.8); }
      dot(0, 0, 0xff7a7a, 0.07);
    } else if (m.scale === 'planets') {
      const px = R / 1.7;
      dot(0, 0, 0xffe7a3, 0.22);
      PLANETS.forEach((p, i) => {
        const b = p.a * Math.sqrt(1 - p.e * p.e), wr = rad(p.w), N = 120;
        let prev = null;
        for (let j = 0; j <= N; j++) {
          const E = (TAU * j) / N, x = p.a * (Math.cos(E) - p.e), y = b * Math.sin(E);
          const X = (x * Math.cos(wr) - y * Math.sin(wr)) * px, Y = (x * Math.sin(wr) + y * Math.cos(wr)) * px;
          if (prev) seg(prev[0], prev[1], X, Y, 0x56625a, 0.6);
          prev = [X, Y];
        }
        const q = planetAt(p, m.years);
        v.set(q.X * px, q.Y * px, 0); dots.push(v, c.copy(state.planetC[i]).multiplyScalar(f), p.r);
      });
    } else if (m.scale === 'galaxy') {
      const px = R / GAL_R, pat = PATTERN * KMS_KPC * m.myr;
      for (const g of ARM_GAS) {
        const a = Math.log(g.r / 2) / PITCH + pat + g.arm * Math.PI + g.j;
        dot(Math.cos(a) * g.r * px, Math.sin(a) * g.r * px, 0x3c5a9a, 0.05, 0.5);
      }
      STARS.forEach((s, i) => {
        const a = starAngle(s, m.myr, m.swap);
        const armA = Math.log(s.r / 2) / PITCH + pat;
        let d = (((a - armA) % Math.PI) + Math.PI) % Math.PI; d = Math.min(d, Math.PI - d);
        const inArm = s.r < 2.5 ? 0 : Math.exp(-(((d * s.r * Math.sin(rad(13))) / 0.5) ** 2));
        const x = Math.cos(a) * s.r * px, y = Math.sin(a) * s.r * px;
        if (i === 0) dot(x, y, 0xffcc66, 0.06);
        else if (inArm > 0.35) dot(x, y, 0xa0beff, 0.014, 0.5 + 0.5 * inArm);
        else dot(x, y, 0xe6e1d2, 0.011, 0.25 + 0.4 * s.m);
      });
      dot(0, 0, 0xffdcaa, 0.16, 0.3);
      // inset: speed against radius, measured (green) and stars + gas only (red); the one in use is bright
      const ix = R * 0.45, iy = -R * 0.72, iw = R * 0.5, ih = R * 0.28;
      seg(ix, iy, ix + iw, iy, 0x56625a); seg(ix, iy, ix, iy + ih, 0x56625a);
      for (let r = 0.2; r < 16; r += 0.2) {
        const X0 = ix + ((r - 0.2) / 16) * iw, X1 = ix + (r / 16) * iw;
        seg(X0, iy + (vFlat(r - 0.2) / 300) * ih, X1, iy + (vFlat(r) / 300) * ih, 0x7dffa8, m.darkMatter ? 1 : 0.3);
        seg(X0, iy + (vVis(r - 0.2) / 300) * ih, X1, iy + (vVis(r) / 300) * ih, 0xff7a7a, m.darkMatter ? 0.3 : 1);
      }
    } else if (m.scale === 'cluster') {
      const px = R / CL_R, k = Math.min(CL_SAMPLES, Math.floor(m.gyr / CL_DT));
      dot(0, 0, 0xff7a7a, 1.1, 0.12);
      for (const g of CLUSTER) {
        for (let j = Math.max(1, k - TRAIL); j <= k; j++) {
          const a = g.path[j - 1], b = g.path[j];
          seg(a[0] * px, a[1] * px, b[0] * px, b[1] * px, 0x9aa79d, 0.15 + (0.35 * (j - k + TRAIL)) / TRAIL);
        }
        const p = g.path[k];
        dot(p[0] * px, p[1] * px, 0xffecc8, g.size);
      }
      dot(0, 0, 0xfff0d2, 0.1);
    } else {
      const px = R, a = m.webA, here = webAt(WEB.pts[WEB.here], m.webGyr);
      for (const pt of WEB.pts) {
        const p = webAt(pt, m.webGyr), x = (p[0] - here[0]) * a * px, y = (p[1] - here[1]) * a * px;
        if (Math.abs(x) > R * 1.6 || Math.abs(y) > R * 1.6) continue;
        dot(x, y, pt.node ? 0xffe6be : 0x8fb8ff, pt.node ? 0.02 : 0.014, pt.node ? 0.9 : 0.6);
      }
      for (let j = 0; j < 40; j++) {
        const a0 = (TAU * j) / 40, a1 = (TAU * (j + 1)) / 40, r = 0.07;
        seg(Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r, 0x7dffa8);
      }
    }
    dots.commit();
    lines.commit();
  },

  dispose(ctx, state) {
    state.dots.dispose();
    state.lines.dispose();
  },
};
