import * as THREE from 'three';
import { smooth } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The Stars Within 100 Parsecs. 256,326 real stars from ESA's Gaia (data release 3): every star whose
// parallax puts it within 100 pc (326 light-years) and is measured to better than 10 %, with a good
// astrometric fit (RUWE < 1.4) and a colour. tools/gaia/build_gaia.py makes the data.
//
//   sky     from the Sun: what we see, directions only
//   bubble  each star at its distance d = 1/ϖ (ϖ in arcseconds gives parsecs). Galactic plane flat,
//           Galactic centre to the right
//   drift   x(t) = x₀ + v t for the 132,504 stars whose speed along our line of sight Gaia also
//           measured (v_tan = 4.74 μ/ϖ km/s from the proper motion μ; v_r from the spectrum). Seen from
//           the Sun, ±1.5 million years. The Hyades (305 members picked by position and shared motion;
//           measured velocity (−42.3, −19.3, −1.3) km/s, published (−42.2, −19.0, −1.5)) move as one
//   hr      the same stars rearranged by colour and true brightness, M_G = G + 5 log₁₀(ϖ/100 mas): the
//           Hertzsprung–Russell diagram. The Hyades, all one age and one distance, draw one thin line
// Velocities are relative to the Sun. Scene unit = 10 pc.

const DATA_URL = '/data/gaia/';
const PC = 10; // pc per scene unit
const PC_PER_MYR = 1.0227; // per km/s
const PHASES = [['sky', 8], ['bubble', 12], ['drift', 22], ['hr', 22], ['return', 8]];
const LOOP = PHASES.reduce((s, p) => s + p[1], 0);
const SUN = { bprp: 0.82, MG: 4.67 };
const hrX = (c) => (c - 1.9) * 2.1;
const hrY = (m) => (8 - m) * 0.42;
const LIVE = { data: null };

async function load() {
  const [meta, buf] = await Promise.all([
    fetch(DATA_URL + 'meta.json').then((r) => r.json()),
    fetch(DATA_URL + 'stars.bin').then((r) => r.arrayBuffer()),
  ]);
  const n = meta.count, dv = new DataView(buf);
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), hr = new Float32Array(n * 2);
  const col = new Float32Array(n), mag = new Float32Array(n), fl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 16, g = (k) => dv.getInt16(o + k, true);
    // Galactic (x to the centre, y along rotation, z to the north pole) → scene (x, z up as y, −y)
    pos[i * 3] = g(0) / 300 / PC; pos[i * 3 + 1] = g(4) / 300 / PC; pos[i * 3 + 2] = -g(2) / 300 / PC;
    vel[i * 3] = g(6) / 100; vel[i * 3 + 1] = g(10) / 100; vel[i * 3 + 2] = -g(8) / 100;
    // stored to 0.02 in colour and 0.1 mag; spread each star within its step so the diagram has no grid
    const c = (dv.getUint8(o + 12) + Math.random() - 0.5) / 50, M = (dv.getUint8(o + 13) + Math.random() - 0.5) / 10 - 5;
    col[i] = c; mag[i] = M; fl[i] = dv.getUint8(o + 14);
    hr[i * 2] = hrX(c); hr[i * 2 + 1] = hrY(M);
  }
  return { meta, n, pos, vel, hr, col, mag, fl };
}

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec2 aHR;
  attribute float aCol;
  attribute float aMag;
  attribute float aFlag;
  uniform float uT, uRVOnly, uHR, uPx, uHy, uMin;
  uniform vec3 uHRCentre;
  uniform mat3 uHRBasis;
  varying vec3 vColor;
  varying float vA;
  // BP − RP to a star's colour: blue-white hot stars to red cool ones
  vec3 starColour(float c) {
    vec3 a = vec3(0.62, 0.74, 1.0), b = vec3(1.0, 0.97, 0.92), d = vec3(1.0, 0.82, 0.55), e = vec3(1.0, 0.48, 0.28);
    return c < 0.8 ? mix(a, b, smoothstep(-0.2, 0.8, c)) : c < 1.6 ? mix(b, d, smoothstep(0.8, 1.6, c)) : mix(d, e, smoothstep(1.6, 3.2, c));
  }
  void main() {
    float rv = mod(aFlag, 2.0);
    float hy = step(1.5, mod(aFlag, 4.0));
    vec3 p = aPos + aVel * (uT * ${PC_PER_MYR.toFixed(4)} / ${PC.toFixed(1)}) * rv;
    vec3 h = uHRCentre + uHRBasis * vec3(aHR, 0.0);
    p = mix(p, h, uHR);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // luminous stars draw bigger: size grows with true brightness, gently
    float lum = clamp((14.0 - aMag) / 16.0, 0.0, 1.0);
    float size = uPx * (0.5 + 1.6 * lum * lum) / max(0.05, -mv.z);
    gl_PointSize = clamp(size, uMin, 9.0) * (1.0 + hy * uHy * (0.9 + 1.4 * uHR));
    vColor = mix(starColour(aCol), vec3(0.45, 1.0, 0.6), hy * uHy * 0.85);
    vA = mix(1.0, rv, uRVOnly) * clamp(size / uMin, 0.35, 1.0) * (0.35 + 0.65 * lum) * (1.0 + hy * uHy * (1.0 + 2.0 * uHR));
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
    gl_FragColor = vec4(vColor * vA * uAlpha * (1.0 - r2) * (1.0 - r2), 1.0);
  }`;

export default {
  name: 'The Stars Within 100 Parsecs',
  description:
    "A quarter of a million real stars from ESA's Gaia: every well-measured star within 326 light-years of " +
    'the Sun, each at its distance from its parallax. Run time forward and back with their measured ' +
    'velocities and the Hyades cluster travels as one; then the same stars sort themselves by colour and ' +
    'true brightness into the Hertzsprung–Russell diagram. Data: ESA/Gaia/DPAC (Gaia DR3).',
  tags: ['gaia', 'stars', 'parallax', 'hr diagram', 'hyades', 'real data', 'milky way'],
  category: 'Astronomy',
  mode: '3d',

  motion(t) {
    const T = ((t % LOOP) + LOOP) % LOOP;
    let acc = 0;
    for (const [phase, len] of PHASES) {
      if (T < acc + len) {
        const u = (T - acc) / len;
        const myr = phase === 'drift' ? 1.5 * Math.sin(2 * Math.PI * Math.min(1, Math.max(0, (u - 0.1) / 0.8))) : 0;
        return { T, phase, u, myr };
      }
      acc += len;
    }
    return { T, phase: 'sky', u: 0, myr: 0 };
  },

  latex: (params, hl, m) => {
    const d = LIVE.data;
    if (!d) return '\\text{loading 256,000 stars…}';
    const meta = d.meta;
    if (m.phase === 'sky' || m.phase === 'return')
      return `\\begin{aligned}&\\text{Gaia DR3: } ${hl(meta.count, 0)}\\ \\text{stars within } 100\\ \\text{pc} = 326\\ \\text{light-years} \\\\ &\\text{seen from the Sun: directions only} \\\\ &d = \\frac{1}{\\varpi}\\quad (\\varpi\\text{: parallax, the yearly wobble as Earth orbits})\\end{aligned}`;
    if (m.phase === 'bubble')
      return `\\begin{aligned}&d\\,[\\text{pc}] = \\frac{1000}{\\varpi\\,[\\text{mas}]},\\quad \\text{every star measured to} < 10\\% \\\\ &\\text{flat: the Milky Way's disk; Galactic centre to the right} \\\\ &\\text{green: the Hyades cluster, } ${hl(meta.hyades.members, 0)}\\ \\text{stars at } 47\\ \\text{pc}\\end{aligned}`;
    if (m.phase === 'drift') {
      const v = meta.hyades.velocity;
      return `\\begin{aligned}&\\mathbf{x}(t) = \\mathbf{x}_0 + \\mathbf{v}\\,t,\\quad t = ${hl(m.myr, 2)}\\ \\text{million years} \\\\ &v_{\\text{tan}} = 4.74\\,\\frac{\\mu}{\\varpi}\\ \\text{km/s},\\ \\ v_r \\text{ from the spectrum: } ${hl(meta.withRV, 0)}\\ \\text{stars have both} \\\\ &\\text{Hyades: } \\mathbf{v} = (${hl(v[0], 1)}, ${hl(v[1], 1)}, ${hl(v[2], 1)})\\ \\text{km/s, all together}\\end{aligned}`;
    }
    return `\\begin{aligned}&M_G = G + 5\\log_{10}\\frac{\\varpi}{100\\ \\text{mas}}\\quad \\text{(true brightness)} \\\\ &\\text{across: colour } BP - RP;\\ \\text{up: brighter} \\\\ &\\text{main sequence; white dwarfs below; giants above} \\\\ &\\text{Sun } (${hl(SUN.bprp, 2)}, ${hl(SUN.MG, 2)}):\\ \\text{green ring};\\ \\text{Hyades: one line}\\end{aligned}`;
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const cam = ctx.camera;
    cam.near = 0.005; cam.far = 200;
    ctx.scene.background = new THREE.Color(0x000000);
    const s = { ready: false, disposed: false };
    const lines = createFatLines({ maxSegments: 600, width: 1.4 });
    ctx.scene.add(lines.object);
    load().then((d) => {
      if (s.disposed) return;
      LIVE.data = d; s.d = d;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.n * 3), 3));
      g.setAttribute('aPos', new THREE.BufferAttribute(d.pos, 3));
      g.setAttribute('aVel', new THREE.BufferAttribute(d.vel, 3));
      g.setAttribute('aHR', new THREE.BufferAttribute(d.hr, 2));
      g.setAttribute('aCol', new THREE.BufferAttribute(d.col, 1));
      g.setAttribute('aMag', new THREE.BufferAttribute(d.mag, 1));
      g.setAttribute('aFlag', new THREE.BufferAttribute(d.fl, 1));
      s.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uT: { value: 0 }, uRVOnly: { value: 0 }, uHR: { value: 0 }, uPx: { value: 3 }, uHy: { value: 0 }, uMin: { value: 1.3 },
          uAlpha: { value: 0.9 }, uHRCentre: { value: new THREE.Vector3() }, uHRBasis: { value: new THREE.Matrix3() },
        },
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
      });
      s.points = new THREE.Points(g, s.mat);
      s.points.frustumCulled = false;
      ctx.scene.add(s.points);
      s.ready = true;
    }).catch((err) => console.error('gaia data', err));
    return { s, lines, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
  },

  update(ctx, state) {
    const { s, lines, v, w, c } = state;
    const cam = ctx.camera, m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height); lines.reset();
    if (!s.ready) { lines.commit(); return; }
    const U = s.mat.uniforms, aspect = width / height, portrait = aspect < 1, d = s.d;

    // ---------- what the stars do ----------
    let hrK = 0, rvOnly = 0, hy = 0;
    if (m.phase === 'bubble') hy = smooth(Math.min(1, Math.max(0, (m.u - 0.4) / 0.3)));
    if (m.phase === 'drift') { rvOnly = smooth(Math.min(1, m.u / 0.1)) * (1 - smooth(Math.max(0, (m.u - 0.92) / 0.08))); hy = 1; }
    if (m.phase === 'hr') { hrK = smooth(Math.min(1, m.u / 0.3)) * (1 - smooth(Math.max(0, (m.u - 0.9) / 0.1))); hy = smooth(Math.min(1, Math.max(0, (m.u - 0.55) / 0.15))) * (1 - smooth(Math.max(0, (m.u - 0.85) / 0.05))); }
    U.uT.value = m.myr; U.uRVOnly.value = rvOnly; U.uHR.value = hrK; U.uHy.value = hy;

    // ---------- camera ----------
    const view = (pos, look, fov) => ({ pos, look, fov });
    const mix = (A, B, k) => view(A.pos.clone().lerp(B.pos, k), A.look.clone().lerp(B.look, k), A.fov + (B.fov - A.fov) * k);
    const hyC = new THREE.Vector3(d.meta.hyades.centre[0], d.meta.hyades.centre[2], -d.meta.hyades.centre[1]).divideScalar(PC);
    const SKY = view(new THREE.Vector3(0, 0, 0), hyC.clone().normalize(), portrait ? 100 : 80);
    const orbitA = 0.6 + 0.35 * Math.sin((m.T / LOOP) * Math.PI * 2);
    const BUBBLE = view(new THREE.Vector3(Math.cos(orbitA) * 23, 7.5, Math.sin(orbitA) * 23).multiplyScalar(portrait ? 1.95 : 1), new THREE.Vector3(0, 0, 0), 50);
    // the HR diagram stands where the camera is looking from BUBBLE, facing it
    const hrPos = BUBBLE.pos.clone().multiplyScalar(0.55);
    const fwd = BUBBLE.look.clone().sub(hrPos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const hrCentre = hrPos.clone().addScaledVector(fwd, portrait ? 33 : 12.5);
    U.uHRCentre.value.copy(hrCentre);
    U.uHRBasis.value.set(right.x, up.x, -fwd.x, right.y, up.y, -fwd.y, right.z, up.z, -fwd.z);
    // aim at the middle of the plotted area (colour −0.3…4.6, M_G 17.5…−2.5), not its origin
    const HR = view(hrPos.clone().addScaledVector(right, 1.0).addScaledVector(up, 0.2), hrCentre.clone().addScaledVector(right, 1.0).addScaledVector(up, 0.2), 50);
    let vw;
    if (m.phase === 'sky') vw = SKY;
    else if (m.phase === 'bubble') vw = mix(SKY, BUBBLE, smooth(Math.min(1, m.u / 0.45)));
    else if (m.phase === 'drift') vw = BUBBLE;
    else if (m.phase === 'hr') vw = mix(BUBBLE, HR, hrK);
    else vw = mix(BUBBLE, SKY, smooth(Math.min(1, m.u / 0.8)));
    cam.position.copy(vw.pos); cam.up.set(0, 1, 0); cam.lookAt(vw.look);
    if (Math.abs(cam.fov - vw.fov) > 1e-3) { cam.fov = vw.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    const fovShort = portrait ? 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect) : (cam.fov * Math.PI) / 180;
    U.uPx.value = (Math.min(width, height) / (2 * Math.tan(fovShort / 2))) * (m.phase === 'sky' ? 0.03 : 0.05);
    U.uMin.value = m.phase === 'sky' ? 1.1 : 1.3;
    U.uAlpha.value = m.phase === 'sky' ? 1.4 : 1.25 + 0.5 * rvOnly - 0.5 * hrK;

    // ---------- lines ----------
    const col = (hex, k) => c.set(hex).multiplyScalar(k);
    const ring = (C, R, e1, e2, hex, k) => {
      for (let q = 0; q < 48; q++) {
        const a0 = (q / 48) * Math.PI * 2, a1 = ((q + 1) / 48) * Math.PI * 2;
        v.copy(C).addScaledVector(e1, Math.cos(a0) * R).addScaledVector(e2, Math.sin(a0) * R);
        w.copy(C).addScaledVector(e1, Math.cos(a1) * R).addScaledVector(e2, Math.sin(a1) * R);
        lines.push(v, w, col(hex, k));
      }
    };
    const camR = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), camU = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const bubbleK = m.phase === 'sky' ? 0 : 1 - hrK;
    if (bubbleK > 0.01 && m.phase !== 'sky') {
      // the 100 pc edge in the Galactic plane, and the Sun
      ring(new THREE.Vector3(), 10, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0x5d6b88, 0.45 * bubbleK);
      ring(new THREE.Vector3(), 0.35, camR, camU, 0x7dffa8, 0.9 * bubbleK);
      // towards the Galactic centre
      v.set(10.4, 0, 0); w.set(12, 0, 0); lines.push(v, w, col(0xffd166, 0.6 * bubbleK));
    }
    if (hrK > 0.01) {
      const P = (x, y) => hrCentre.clone().addScaledVector(right, x).addScaledVector(up, y);
      const k = hrK;
      // axes: colour 0 → 4.5 across, M_G 17 → −2 up
      v.copy(P(hrX(-0.3), hrY(17.5))); w.copy(P(hrX(4.6), hrY(17.5))); lines.push(v, w, col(0x8a93a6, 0.7 * k));
      v.copy(P(hrX(-0.3), hrY(17.5))); w.copy(P(hrX(-0.3), hrY(-2.5))); lines.push(v, w, col(0x8a93a6, 0.7 * k));
      for (let x = 0; x <= 4; x++) { v.copy(P(hrX(x), hrY(17.5))); w.copy(P(hrX(x), hrY(17.9))); lines.push(v, w, col(0x8a93a6, 0.6 * k)); }
      for (let M = 0; M <= 15; M += 5) { v.copy(P(hrX(-0.3), hrY(M))); w.copy(P(hrX(-0.42), hrY(M))); lines.push(v, w, col(0x8a93a6, 0.6 * k)); }
      ring(P(hrX(SUN.bprp), hrY(SUN.MG)), 0.34, right, up, 0x7dffa8, 0.95 * k);
    }
    lines.commit();
  },

  dispose(ctx, state) {
    const s = state.s;
    s.disposed = true;
    state.lines.dispose();
    if (s.points) { s.points.geometry.dispose(); s.mat.dispose(); }
    LIVE.data = null;
  },
};
