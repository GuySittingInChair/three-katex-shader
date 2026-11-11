import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Missing Mass. Real rotation curves from SPARC (Lelli, McGaugh & Schombert 2016): 175 disc galaxies whose
// gas was clocked by the 21 cm line (and Hα) and whose stars, gas and bulge were weighed from Spitzer 3.6 μm
// light and HI maps. The galaxy's stars and gas orbit at the measured speeds; orange ghosts orbit at the speed the
// visible matter alone could hold them at, and fall behind. Then every point of 147 galaxies collapses onto one
// curve, the radial acceleration relation, and the baryonic Tully–Fisher relation.
// tools/sparc/build_sparc.py makes the data and every fitted number.

const DATA_URL = '/data/sparc/sparc.json';
const GALLERY = ['DDO154', 'NGC2403', 'NGC7814', 'UGC00128', 'UGC02885', 'NGC2841'];
const GSTEP = 4;
const PHASES = [['spin', 15], ['curve', 12], ['gallery', GALLERY.length * GSTEP], ['rar', 15], ['btf', 11]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const NS = 64;                          // samples of the rotation curve passed to the shader
const N = 36000;                        // particles
const RG = 5;                           // scene radius of the outermost measured point
const MYR_PER_S = 60;                   // galaxy time: 1 s of the loop = 60 million years
const KMS_KPC = 1.0227e-3;              // 1 km/s/kpc in radians per Myr
const LIVE = { d: null };
const KIND = { dwarf: 'dwarf irregular', Sm: 'Magellanic spiral' };
const TYPES = ['S0', 'Sa', 'Sab', 'Sb', 'Sbc', 'Sc', 'Scd', 'Sd', 'Sdm', 'Sm', 'Im', 'BCD'];

const VERT = /* glsl */ `
  attribute vec4 aSeed;      // u for radius, arm angle, height, kind (0 star, 1 gas)
  uniform float uOmega[${NS}];
  uniform float uT, uRd, uRmax, uScale, uGhost, uPx, uFade;
  varying vec3 vCol;
  varying float vA;
  float omegaAt(float r) {
    float x = clamp(r / uRmax, 0.0, 1.0) * float(${NS - 1});
    int i = int(floor(x));
    float f = x - float(i);
    float a = 0.0, b = 0.0;
    for (int k = 0; k < ${NS}; k++) { if (k == i) a = uOmega[k]; if (k == i + 1) b = uOmega[k]; }
    if (i >= ${NS - 1}) b = a;
    return mix(a, b, f);
  }
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float u = aSeed.x, kind = aSeed.w;
    // stars: an exponential disc of the galaxy's own scale length; gas: spread out to the last measured point
    float r = kind < 0.5 ? -uRd * log(1.0 - u * (1.0 - exp(-uRmax / uRd))) : uRmax * (0.08 + 0.92 * sqrt(u));
    float pitch = 0.32;
    float th = aSeed.y + log(max(r, 0.05 * uRmax) / uRmax) / tan(pitch);
    th += omegaAt(r) * uT;
    float rs = r * uScale;
    vec3 p = vec3(cos(th) * rs, aSeed.z * (kind < 0.5 ? 0.06 : 0.03) * uScale * uRd * exp(-r / (2.0 * uRmax)), sin(th) * rs);
    float inner = exp(-r / (0.5 * uRd));
    vec3 star = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.86, 0.62), inner);
    vec3 gas = vec3(0.35, 0.55, 1.0);
    vec3 ghost = vec3(1.0, 0.52, 0.2);
    vCol = uGhost > 0.5 ? ghost : (kind < 0.5 ? star : gas);
    vA = (kind < 0.5 ? 0.55 + 0.9 * inner : 0.32) * uFade * (uGhost > 0.5 ? 0.5 : 1.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * (kind < 0.5 ? 1.0 : 1.4);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * exp(-r2 * 3.0), 1.0);
  }`;

const vbar = (row, d) => {
  const [, , , g, s, b] = row;
  const v2 = g * Math.abs(g) + d.UD * s * Math.abs(s) + d.UB * b * Math.abs(b);
  return Math.sqrt(Math.max(0, v2));
};
const fmtE = (x, dig = 2) => { const e = Math.floor(Math.log10(x)); return `${(x / 10 ** e).toFixed(dig)} \\times 10^{${e}}`; };
const nice = (n) => n.replace(/^(NGC|UGC|DDO|IC)0*(\d)/, '$1 $2');
const typeName = (g) => `\\text{${g.T >= 10 ? KIND.dwarf : g.T === 9 ? KIND.Sm : TYPES[g.T] + ' spiral'}}`;

export default {
  name: 'The Missing Mass',
  description:
    "Real rotation curves of 175 galaxies. Stars and gas orbit at the speeds measured from their light; orange ghosts orbit at the speed " +
    'the visible stars and gas alone could hold them at, and fall behind. Then 2696 measurements from 147 galaxies land on one curve: ' +
    'wherever the pull of what we can see drops below about 10⁻¹⁰ m/s², the real pull is stronger, by an amount set by the visible mass alone. ' +
    'Data: SPARC (Lelli, McGaugh & Schombert 2016).',
  tags: ['dark matter', 'galaxies', 'rotation curves', 'sparc', 'real data', 'tully-fisher', 'radial acceleration relation'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        if (phase === 'gallery') { const x = (T - acc) / GSTEP, k = Math.floor(x); return { T, phase, u, len, k, v: x - k }; }
        return { T, phase, u, len };
      }
      acc += len;
    }
    return { T, phase: 'spin', u: 0, len: PHASES[0][1] };
  },

  latex: (params, hl, m) => {
    const d = LIVE.d;
    if (!d) return '\\text{loading 175 rotation curves…}';
    if (m.phase === 'spin') {
      return `\\begin{aligned}&\\text{NGC 3198, 14 Mpc away, at its measured speeds} \\\\ &{\\color{#ff8533}\\text{ghosts}}\\text{: the speed its visible stars and gas} \\\\ &\\text{could hold them at:}\\ v^2 = GM(<r)/r \\\\ &1\\ \\text{s} = ${MYR_PER_S}\\ \\text{million years}\\end{aligned}`;
    }
    if (m.phase === 'curve') {
      const g = d.byName.NGC3198, last = g.curve[g.curve.length - 1], vb = vbar(last, d);
      return `\\begin{aligned}&v_{\\rm seen}^2 = {\\color{#7ee08a}v_{\\rm gas}^2} + 0.5\\,{\\color{#8cb8ff}v_{\\rm stars}^2} + 0.7\\,{\\color{#ff7a7a}v_{\\rm bulge}^2} \\\\ &\\text{at } ${hl(last[0], 0)}\\ \\text{kpc: } ${hl(last[1], 0)}\\ \\text{km/s measured, } {\\color{#ff8533}${vb.toFixed(0)}}\\ \\text{seen} \\\\ &M_{\\rm needed}/M_{\\rm seen} = (v/v_{\\rm seen})^2 = ${hl((last[1] / vb) ** 2, 1)} \\\\ &\\text{0.5, 0.7: mass per unit of 3.6 }\\mu\\text{m light}\\end{aligned}`;
    }
    if (m.phase === 'gallery') {
      const g = d.byName[GALLERY[m.k]], last = g.curve[g.curve.length - 1];
      return `\\begin{aligned}&\\text{${nice(g.name)}: } ${typeName(g)},\\ ${g.D.toFixed(0)}\\ \\text{Mpc} \\\\ &\\text{measured out to } ${hl(last[0], 0)}\\ \\text{kpc at } ${hl(last[1], 0)}\\ \\text{km/s} \\\\ &\\text{unseen share of the mass inside: } ${hl(100 * g.dark, 0)}\\% \\\\ &\\text{one of 175 galaxies in SPARC}\\end{aligned}`;
    }
    if (m.phase === 'rar') {
      const r = d.rar;
      return `\\begin{aligned}&g_{\\rm obs} = v^2/r \\ \\text{up},\\ \\ g_{\\rm seen} = v_{\\rm seen}^2/r \\ \\text{across} \\\\ &${r.n}\\ \\text{points from } ${r.ngal}\\ \\text{galaxies; grey line:} \\\\ &\\text{Newton with only what we see} \\\\ &{\\color{#ff8533}g_{\\rm obs} = g_{\\rm seen}/\\big(1 - e^{-\\sqrt{g_{\\rm seen}/g_\\dagger}}\\big)} \\\\ &g_\\dagger = ${hl(r.g0 * 1e10, 2)} \\times 10^{-10}\\ \\text{m/s}^2\\ \\text{(published 1.20)},\\ \\pm ${r.scatter.toFixed(2)}\\ \\text{dex}\\end{aligned}`;
    }
    const b = d.btf;
    return `\\begin{aligned}&M_{\\rm seen} = 0.5\\,L_{3.6} + 1.33\\,M_{\\rm HI}\\ \\text{up},\\ v_{\\rm flat}\\ \\text{across} \\\\ &${b.n}\\ \\text{galaxies: } M_{\\rm seen} \\propto v_{\\rm flat}^{\\,${hl(b.slope, 1)}}\\ \\text{(published 3.7–4)} \\\\ &\\text{scatter } ${b.scatter.toFixed(2)}\\ \\text{dex: the outer speed knows} \\\\ &\\text{the visible mass, dark matter or not}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.fov = 40; cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
    ctx.scene.background = new THREE.Color(0x010103);
    ctx.scene.add(cam);
    const s = { ready: false, disposed: false, cur: null };
    const seed = new Float32Array(N * 4);
    let rs = 12345;
    const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    for (let i = 0; i < N; i++) {
      const gas = i % 3 === 0;
      seed[i * 4] = rnd();
      // two arms with scatter; a third of the stars smooth (not in the arms)
      const arm = (rnd() < 0.5 ? 0 : Math.PI) + (rnd() < 0.35 ? rnd() * Math.PI * 2 : (rnd() - 0.5) * 0.9);
      seed[i * 4 + 1] = arm;
      const g1 = rnd(), g2 = rnd();
      seed[i * 4 + 2] = Math.sqrt(-2 * Math.log(g1 + 1e-9)) * Math.cos(2 * Math.PI * g2);
      seed[i * 4 + 3] = gas ? 1 : 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mk = (ghost) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uOmega: { value: new Float32Array(NS) }, uT: { value: 0 }, uRd: { value: 2 }, uRmax: { value: 20 }, uScale: { value: 0.2 }, uGhost: { value: ghost ? 1 : 0 }, uPx: { value: 3 }, uFade: { value: 1 } },
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
    });
    const real = new THREE.Points(geo, mk(false)), ghost = new THREE.Points(geo, mk(true));
    real.frustumCulled = ghost.frustumCulled = false;
    ctx.scene.add(ghost); ctx.scene.add(real);
    const disc = createFatLines({ maxSegments: 400, width: 1.1 });
    ctx.scene.add(disc.object);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x010103, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    card.renderOrder = 8;
    cam.add(card);
    const hud = createFatLines({ maxSegments: 9000, width: 1.3, overlay: true });
    hud.material.transparent = true;
    cam.add(hud.object);
    fetch(DATA_URL).then((r) => r.json()).then((d) => {
      if (s.disposed) return;
      d.byName = Object.fromEntries(d.galaxies.map((g) => [g.name, g]));
      for (const g of d.galaxies) {
        // the speeds as angular rates sampled evenly in radius, measured and from visible matter only
        const c = g.curve, Rm = g.Rmax;
        g.om = new Float32Array(NS); g.omBar = new Float32Array(NS);
        for (let k = 0; k < NS; k++) {
          const r = Math.max(c[0][0] * 0.5, (k / (NS - 1)) * Rm);
          let j = 0;
          while (j < c.length - 2 && c[j + 1][0] < r) j++;
          const a = c[j], b = c[Math.min(j + 1, c.length - 1)];
          const f = b[0] > a[0] ? Math.min(1, Math.max(0, (r - a[0]) / (b[0] - a[0]))) : 0;
          // inside the first point: solid-body rise to it
          const rise = r < c[0][0] ? r / c[0][0] : 1;
          const vo = (a[1] + (b[1] - a[1]) * f) * rise, vb = (vbar(a, d) + (vbar(b, d) - vbar(a, d)) * f) * rise;
          g.om[k] = (vo / Math.max(r, 1e-3)) * KMS_KPC; g.omBar[k] = (vb / Math.max(r, 1e-3)) * KMS_KPC;
        }
      }
      LIVE.d = d; s.d = d; s.ready = true;
    }).catch((err) => console.error('sparc data', err));
    return { s, geo, real, ghost, disc, card, hud, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, real, ghost, disc, card, hud, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    const aspect = width / height, portrait = aspect < 1;
    hud.setResolution(width, height); disc.setResolution(width, height);
    hud.reset(); disc.reset();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), halfW = aspect * th;
    const chartBig = m.phase === 'rar' || m.phase === 'btf';
    // camera: above the disc, tilted; the galaxy sits in the upper part, the graph below
    const dist = portrait ? (RG * 1.15) / halfW : RG / (th * 0.62);
    const el = THREE.MathUtils.degToRad(portrait ? 42 : 36), az = 0.4 + ctx.time * 0.03;
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, 0, 0);
    v.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.position.addScaledVector(v, -(portrait ? 0.28 : 0.3) * th * dist);
    if (!s.ready) { hud.commit(); disc.commit(); return; }
    const d = s.d;

    // ---------- which galaxy, and its clock ----------
    const local = m.u * m.len;
    let g = d.byName.NGC3198, tg = 0, fade = 1, ghostOn = 0;
    if (m.phase === 'spin') { tg = local; ghostOn = smooth(Math.min(1, local / 2)); fade = smooth(Math.min(1, local / 1.2)); }
    else if (m.phase === 'curve') { tg = PHASES[0][1] + local; ghostOn = 1; }
    else if (m.phase === 'gallery') {
      g = d.byName[GALLERY[m.k]]; tg = m.v * GSTEP; ghostOn = 1;
      fade = smooth(Math.min(1, m.v * GSTEP / 0.5)) * (1 - smooth(Math.max(0, (m.v * GSTEP - GSTEP + 0.4) / 0.4)));
    } else { g = d.byName.NGC3198; tg = PHASES[0][1] + PHASES[1][1] + local; fade = 1 - smooth(Math.min(1, local / 1.5)); ghostOn = 0; }
    if (m.phase === 'btf') fade = 0;
    if (m.phase === 'curve' && local > m.len - 0.5) fade = 1 - smooth((local - m.len + 0.5) / 0.5);
    if (s.cur !== g.name) {
      for (const mat of [real.material, ghost.material]) {
        const U = mat.uniforms;
        U.uRd.value = Math.min(g.Rd, g.Rmax * 0.5); U.uRmax.value = g.Rmax; U.uScale.value = RG / g.Rmax;
      }
      real.material.uniforms.uOmega.value.set(g.om); ghost.material.uniforms.uOmega.value.set(g.omBar);
      s.cur = g.name;
    }
    const px = Math.max(2, Math.min(width, height) / 300);
    for (const [mat, k] of [[real.material, fade], [ghost.material, fade * ghostOn]]) {
      mat.uniforms.uT.value = tg * MYR_PER_S; mat.uniforms.uFade.value = k; mat.uniforms.uPx.value = px;
    }
    ghost.visible = ghostOn * fade > 0.01;

    // a 10 kpc scale ring
    const ring = (R, hex, k) => {
      const rr = R * (RG / g.Rmax);
      for (let q = 0; q < 96; q++) {
        const a0 = (q / 96) * Math.PI * 2, a1 = ((q + 1) / 96) * Math.PI * 2;
        v.set(Math.cos(a0) * rr, 0, Math.sin(a0) * rr); w.set(Math.cos(a1) * rr, 0, Math.sin(a1) * rr);
        disc.push(v, w, c.set(hex).multiplyScalar(k));
      }
    };
    ring(g.Rmax, 0x3a4a66, 0.45 * fade);
    if (g.Rmax > 12) ring(10, 0x3a4a66, 0.25 * fade);

    // ---------- the graph ----------
    const Z = -1;
    const gw = portrait ? 1.8 * halfW : Math.min(1.5 * halfW, chartBig ? 1.7 * th : 2.2 * th);
    const gh = chartBig ? (portrait ? 0.95 * th : 0.98 * th) : portrait ? 0.48 * th : 0.5 * th;
    const gx = portrait ? -gw / 2 : chartBig ? -gw / 2 + 0.2 * halfW : -gw / 2, gy = -th + (portrait ? 0.3 : 0.27) * th;
    const inK = m.phase === 'gallery' ? fade : smooth(Math.min(1, local / 0.8)) * (1 - smooth(Math.max(0, (local - m.len + 0.5) / 0.5)));
    const K = m.phase === 'spin' ? inK * smooth(Math.min(1, Math.max(0, (local - 3) / 1.5))) : inK;
    card.position.set(gx + gw / 2, gy + gh / 2, Z - 0.002); card.scale.set(gw + 0.12 * th, gh + 0.12 * th, 1);
    card.material.opacity = 0.8 * K;
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const seg = (x0, y0, x1, y1, hex, k) => { v.set(x0, y0, Z); w.set(x1, y1, Z); hud.push(v, w, col(hex, k)); };
    const GREY = 0x8a93a6, ORANGE = 0xff8533;
    const e = 0.008 * th;
    if (K > 0.01) {
      seg(gx, gy, gx + gw, gy, GREY, 0.7 * K); seg(gx, gy, gx, gy + gh, GREY, 0.7 * K);
      if (!chartBig) {
        // speed against radius: measured points with error bars, the visible-matter curve, its parts
        const cv = g.curve, Rm = g.Rmax * 1.04;
        const vmax = Math.max(...cv.map((r) => r[1] + Math.min(r[2], 30))) * 1.1;
        const X = (r) => gx + (r / Rm) * gw, Y = (vv) => gy + Math.min(1, Math.max(0, vv / vmax)) * gh;
        for (let r = 10; r < Rm; r += 10) seg(X(r), gy, X(r), gy - 0.025 * th, GREY, 0.6 * K);
        for (let vv = 50; vv < vmax; vv += 50) seg(gx, Y(vv), gx - 0.02 * th, Y(vv), GREY, 0.5 * K);
        const reveal = m.phase === 'spin' ? Math.min(1, Math.max(0, (local - 3.5) / 4)) : 1;
        const parts = m.phase === 'spin' ? 0 : m.phase === 'curve' ? smooth(Math.min(1, Math.max(0, (local - 1) / 2))) : 0.6;
        const line = (fn, hex, k) => {
          let p = null;
          for (let i = 0; i < cv.length; i++) {
            if (cv[i][0] > reveal * Rm) break;
            const q = [X(cv[i][0]), Y(fn(cv[i]))];
            if (p) seg(p[0], p[1], q[0], q[1], hex, k);
            p = q;
          }
        };
        if (parts > 0.01) {
          line((r) => Math.sqrt(Math.max(0, r[3] * Math.abs(r[3]))), 0x7ee08a, 0.75 * K * parts);
          line((r) => Math.sqrt(d.UD) * Math.abs(r[4]), 0x8cb8ff, 0.75 * K * parts);
          if (cv.some((r) => r[5] > 0)) line((r) => Math.sqrt(d.UB) * Math.abs(r[5]), 0xff7a7a, 0.75 * K * parts);
        }
        line((r) => vbar(r, d), ORANGE, K);
        for (const r of cv) {
          if (r[0] > reveal * Rm) break;
          const x = X(r[0]);
          seg(x, Y(r[1] - r[2]), x, Y(r[1] + r[2]), 0xffffff, 0.35 * K);
          seg(x - e, Y(r[1]), x + e, Y(r[1]), 0xffffff, K); seg(x, Y(r[1]) - e, x, Y(r[1]) + e, 0xffffff, K);
        }
        // the Kepler fall-off the outer stars "should" follow if the visible mass were all there is
        if (m.phase === 'curve') {
          const kk = smooth(Math.min(1, Math.max(0, (local - 4) / 2)));
          const last = cv[cv.length - 1], peak = cv.reduce((a, r) => (vbar(r, d) > vbar(a, d) ? r : a), cv[0]);
          let p = null;
          for (let q = 0; q <= 40; q++) {
            const r = peak[0] + (q / 40) * (last[0] - peak[0]);
            const pt = [X(r), Y(vbar(peak, d) * Math.sqrt(peak[0] / r))];
            if (p && q % 2 === 1) seg(p[0], p[1], pt[0], pt[1], ORANGE, 0.5 * K * kk);
            p = pt;
          }
        }
      } else if (m.phase === 'rar') {
        // every point of every good curve: first where Newton and the visible matter put it, then where it is
        const r = d.rar, L0 = -12.2, L1 = -8.0;
        const X = (x) => gx + ((x - L0) / (L1 - L0)) * gw, Y = (y) => gy + Math.min(1, Math.max(0, (y - L0) / (L1 - L0))) * gh;
        for (let x = -12; x <= -8; x++) { seg(X(x), gy, X(x), gy - 0.025 * th, GREY, 0.6 * K); seg(gx, Y(x), gx - 0.025 * th, Y(x), GREY, 0.6 * K); }
        seg(X(L0), Y(L0), X(L1), Y(L1), GREY, 0.55 * K);
        const lift = smooth(Math.min(1, Math.max(0, (local - 2) / 3)));
        const ee = e * 0.7;
        for (let i = 0; i < r.n; i++) {
          const x = X(r.lgb[i]), y = Y(r.lgb[i] + (r.lgo[i] - r.lgb[i]) * lift);
          seg(x - ee, y, x + ee, y, 0x9fc0ff, 0.38 * K); seg(x, y - ee, x, y + ee, 0x9fc0ff, 0.38 * K);
        }
        const kf = smooth(Math.min(1, Math.max(0, (local - 5.5) / 1.5)));
        let p = null;
        for (let q = 0; q <= 120; q++) {
          const x = L0 + (q / 120) * (L1 - L0), gb = 10 ** x;
          const y = Math.log10(gb / (1 - Math.exp(-Math.sqrt(gb / r.g0))));
          const pt = [X(x), Y(y)];
          if (p && y < L1) seg(p[0], p[1], pt[0], pt[1], ORANGE, K * kf);
          p = pt;
        }
        // g† marked on the x axis
        const xg = X(Math.log10(r.g0));
        for (let q = 0; q < 12; q += 2) seg(xg, gy + (q / 12) * gh * 0.5, xg, gy + ((q + 1) / 12) * gh * 0.5, ORANGE, 0.45 * K * kf);
      } else {
        // baryonic Tully–Fisher
        const b = d.btf, X0 = 1.4, X1 = 2.65, Y0 = 7.6, Y1 = 11.8;
        const X = (x) => gx + ((x - X0) / (X1 - X0)) * gw, Y = (y) => gy + Math.min(1, Math.max(0, (y - Y0) / (Y1 - Y0))) * gh;
        for (const vv of [30, 50, 100, 200, 300]) seg(X(Math.log10(vv)), gy, X(Math.log10(vv)), gy - 0.025 * th, GREY, 0.6 * K);
        for (let y = 8; y <= 11; y++) seg(gx, Y(y), gx - 0.025 * th, Y(y), GREY, 0.6 * K);
        const show = Math.min(1, local / 3) * b.n, ee = e * 1.4;
        for (let i = 0; i < show; i++) {
          const x = X(b.lv[i]), y = Y(b.lm[i]);
          seg(x - ee, y, x + ee, y, 0x9fc0ff, 0.9 * K); seg(x, y - ee, x, y + ee, 0x9fc0ff, 0.9 * K);
        }
        const kf = smooth(Math.min(1, Math.max(0, (local - 3.5) / 1.5)));
        seg(X(X0), Y(b.icpt + b.slope * X0), X(X1), Y(b.icpt + b.slope * X1), ORANGE, K * kf);
      }
    }
    hud.commit(); disc.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    ctx.scene.remove(state.real); ctx.scene.remove(state.ghost);
    ctx.camera.remove(state.card); ctx.camera.remove(state.hud.object);
    state.hud.dispose(); state.disc.dispose();
    state.card.geometry.dispose(); state.card.material.dispose();
    state.geo.dispose(); state.real.material.dispose(); state.ghost.material.dispose();
    LIVE.d = null;
  },
};
