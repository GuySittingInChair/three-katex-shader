import * as THREE from 'three';
import { phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines, createDots } from '../lib/fatLines.js';
import { caption, beat } from '../lib/bit.js';

// A supernova remnant, from the first weeks to a hundred thousand years.
//
// A star throws off M_ej of ejecta with E ≈ 10⁴⁴ J of kinetic energy into gas
// of density ρ = 1.4 m_p n. The shock passes through three regimes:
//
// 1. Free expansion. The ejecta coast at v_ej = √(10E / 3M_ej) (the edge
//    speed of a uniform sphere carrying E), so R = v_ej t.
//
// 2. Sedov–Taylor. Once the shock has swept up about its own mass of gas, the
//    ejecta no longer matter. Only E, ρ and t remain, and the only length they
//    make is (E t² / ρ)^⅕, so R = ξ₀ (E t² / ρ)^⅕ and v_s = Ṙ = 2R / 5t.
//    ξ₀ comes from Sedov's similarity ODEs, which this file solves at load
//    (RK4 from the shock inwards with the strong-shock jump conditions, then
//    ξ₀ = (25 / 16π I)^⅕ where I is the energy integral). For γ = 5/3 it gives
//    1.15167, the published value; the same solve gives the interior profile,
//    ρ/ρ₁ falling from 4 at the shock as λ^4.5 near the centre. The gas just
//    behind the shock is at T_s = 3μ m_p v_s² / 16k (μ = 0.6).
//    The two regimes are joined smoothly, R = (R_free⁻³ + R_ST⁻³)^(−⅓).
//
// 3. Snowplow. At t_tr = 2.9×10⁴ yr · E₅₁^(4/17) n^(−9/17) (Blondin et al.
//    1998) the shell has cooled enough to radiate its heat away. It collapses
//    into a thin cold shell pushed by the hot interior, R ∝ t^(2/7).
//
// Brightness: thermal bremsstrahlung, ε ∝ ρ² T^½, from the Sedov profile,
// integrated along each view ray (so the rim glows: limb brightening). Hot
// gas is drawn in X-ray false colour (blue rim, red/gold/blue ejecta knots
// for Si, S, Fe); cooled gas in Hα red and [O III] teal. Shock dents, ejecta
// fingers and late filaments are noise, not hydrodynamics.
//
// Checked in Node: ξ₀ = 1.15167; R(340 yr, n = 2, 3 M☉) = 2.1 pc (Cas A ≈ 2.5),
// R(450 yr, n = 0.3) = 3.8 pc (Tycho ≈ 3.7), and Ṙ matches 2R/5t to 0.2% at
// 10⁴ yr. Units: 1 scene unit = 1 pc. Time runs on a log scale.

const YR = 3.156e7, PC = 3.086e16, MP = 1.6726e-27, KB = 1.380649e-23, MSUN = 1.989e30;
const GAMMA = 5 / 3, MU = 0.6;
const PERIOD = 46, T_END = 40;                  // s of motion per loop; the last 6 s fade and rewind
const LOG_T0 = -1.0, LOG_T1 = 5.2;              // log₁₀(t / yr) from about 36 days to 160 000 years
const PROF_N = 64;

// Sedov's similarity solution. u = Ṙ f(λ), ρ = ρ₁ g(λ), p = ρ₁ Ṙ² h(λ), λ = r/R.
function solveSedov(steps = 4000) {
  const G = GAMMA;
  const deriv = (l, f, g, h) => {
    const a = f - l;
    const gp = (1.5 * f + (2 * a * f) / l - (3 * h) / (a * g)) / ((-a * a) / g + (h * G) / (g * g));
    const fp = ((-2 * g * f) / l - a * gp) / g;
    const hp = h * (3 / a + (G * gp) / g);
    return [fp, gp, hp];
  };
  const energy = (l, y) => (0.5 * y[1] * y[0] * y[0] + y[2] / (G - 1)) * l * l;
  let l = 1, y = [2 / (G + 1), (G + 1) / (G - 1), 2 / (G + 1)];   // strong-shock jump
  const dl = -(1 - 1e-3) / steps;
  const ls = [l], ys = [y];
  let I = 0;
  for (let i = 0; i < steps; i++) {
    const step = (k, s) => y.map((v, j) => v + s * k[j]);
    const k1 = deriv(l, ...y), k2 = deriv(l + dl / 2, ...step(k1, dl / 2));
    const k3 = deriv(l + dl / 2, ...step(k2, dl / 2)), k4 = deriv(l + dl, ...step(k3, dl));
    const yn = y.map((v, j) => v + (dl / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    I += (-dl * (energy(l, y) + energy(l + dl, yn))) / 2;
    y = yn; l += dl;
    ls.push(l); ys.push(y);
  }
  // emission ε ∝ g² √(h/g), sampled at λ = i/63 and normalised to 1 at the shock
  const prof = new Float32Array(PROF_N);
  for (let i = 0; i < PROF_N; i++) {
    const lam = i / (PROF_N - 1);
    const k = Math.min(steps, Math.max(0, Math.round((1 - lam) / (-dl))));
    const [, g, h] = ys[k];
    prof[i] = lam < 1e-3 ? 0 : g * g * Math.sqrt(h / g);
  }
  const top = prof[PROF_N - 1];
  for (let i = 0; i < PROF_N; i++) prof[i] /= top;
  return { xi0: (25 / (16 * Math.PI * I)) ** 0.2, prof };
}
const SEDOV = solveSedov();

// Each loop is a different star in a different neighbourhood (seeded by the loop number).
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function remnant(k) {
  const rnd = mulberry(k * 7919 + 13);
  const ia = k % 3 === 0 ? true : rnd() < 0.35;        // the first one is a Type Ia
  const n = 10 ** (-1 + 2 * rnd());                      // atoms per cm³: 0.1 … 10
  const E51 = ia ? 0.8 + 0.6 * rnd() : 0.6 + 1.4 * rnd();
  const Mej = ia ? 1.4 : 3 + 5 * rnd();                  // M☉
  const E = E51 * 1e44, rho = 1.4 * MP * n * 1e6, M = Mej * MSUN;
  const vej = Math.sqrt((10 * E) / (3 * M));
  const Rsw = Math.cbrt((3 * M) / (4 * Math.PI * rho));
  const ttr = 2.9e4 * YR * E51 ** (4 / 17) * n ** (-9 / 17);
  const Rb = (t) => ((vej * t) ** -3 + (SEDOV.xi0 * ((E * t * t) / rho) ** 0.2) ** -3) ** (-1 / 3);
  const Rtr = Rb(ttr);
  const R = (t) => (t < ttr ? Rb(t) : Rtr * (t / ttr) ** (2 / 7));
  return { k, ia, n, E51, Mej, vej, tsw: Rsw / vej, ttr, Rtr, R, seed: rnd() * 100, spin: 0.03 + 0.3 * rnd() };
}
const cache = new Map();
const remnantFor = (k) => { if (!cache.has(k)) { if (cache.size > 8) cache.clear(); cache.set(k, remnant(k)); } return cache.get(k); };

// loop time (s) ↔ physical time (s)
const tPhys = (lt) => 10 ** (LOG_T0 + (LOG_T1 - LOG_T0) * clamp01(lt / T_END)) * YR;
const ltOf = (t) => (Math.log10(t / YR) - LOG_T0) / (LOG_T1 - LOG_T0) * T_END;

// The camera director: [start (s), shot]
const SHOTS = [[0, 'wide'], [7, 'limb'], [13, 'wide'], [19, 'dolly'], [26, 'top'], [32, 'limb'], [37, 'wide']];

function sci(hl, x, digits = 2) {
  if (x < 1e4) return hl(x, x < 10 ? digits : 0);
  const e = Math.floor(Math.log10(x));
  return `${hl(x / 10 ** e, digits)}\\times10^{${e}}`;
}

export default {
  name: 'Supernova Remnant',
  description:
    'A star explodes and its shock sweeps up the galaxy around it: free expansion, then the Sedov–Taylor blast ' +
    'wave R = ξ₀(Et²/ρ)^⅕ with ξ₀ solved live from Sedov’s equations, then a cooling snowplow shell. ' +
    'Each loop is a new star in new gas, from 36 days to 160 000 years.',
  tags: ['supernova', 'blast wave', 'Sedov–Taylor', 'similarity solution', 'dimensional analysis', 'astrophysics', 'glow'],
  category: 'Physics',

  mode: '3d',

  motion(t) {
    const k = Math.floor(t / PERIOD);
    const lt = phaseOf(t, PERIOD) * PERIOD;
    const s = remnantFor(k);
    const tp = tPhys(lt);
    const R = s.R(tp), v = (s.R(tp * 1.001) - s.R(tp * 0.999)) / (0.002 * tp);
    const m = {
      k, lt, s, years: tp / YR,
      R: R / PC, v: v / 1e3,
      T: (3 * MU * MP * v * v) / (16 * KB),
      phase: tp < s.tsw ? 'free' : tp < s.ttr ? 'sedov' : 'snowplow',
      yrPerSec: lt < T_END ? (tp / YR) * Math.LN10 * ((LOG_T1 - LOG_T0) / T_END) : 0,
      ltSw: ltOf(s.tsw), ltTr: ltOf(s.ttr),
      flash: Math.exp(-(tp / YR) * 365.25 / 111.4),             // ⁵⁶Co → ⁵⁶Fe, τ = 111.4 d
      fade: smooth(clamp01(lt / 0.6)) * (1 - smooth(clamp01((lt - (PERIOD - 2.5)) / 2.5))),
    };
    // after t_tr the shell thins and fragments over about half a decade in time
    m.cool = smooth(clamp01(Math.log10(tp / s.ttr) * 2 + 0.4));
    m.ej = 1 / (1 + (tp / (3 * s.tsw)) ** 1.5);                 // ejecta knots fade as they mix in
    let shot = SHOTS[0], next = PERIOD;
    for (let i = 0; i < SHOTS.length; i++) if (lt >= SHOTS[i][0]) { shot = SHOTS[i]; next = SHOTS[i + 1]?.[0] ?? PERIOD; }
    m.shot = shot[1]; m.shotT = lt - shot[0]; m.shotLen = next - shot[0];
    return m;
  },

  latex: (params, hl, m) => {
    if (!m.s) return '';
    const s = m.s;
    const line1 = m.phase === 'free'
      ? `R = v_{ej}\\,t,\\quad v_{ej} = \\sqrt{\\tfrac{10E}{3M_{ej}}} = ${hl(s.vej / 1e3, 0)}\\,\\text{km/s},\\quad R = ${sci(hl, m.R)}\\,\\text{pc}`
      : m.phase === 'sedov'
        ? `R = \\xi_0\\Big(\\frac{E\\,t^2}{\\rho}\\Big)^{1/5} = ${hl(m.R, 2)}\\,\\text{pc},\\quad \\xi_0 = ${hl(SEDOV.xi0, 4)}`
        : `R = R_{tr}\\Big(\\frac{t}{t_{tr}}\\Big)^{2/7} = ${hl(m.R, 1)}\\,\\text{pc},\\quad t_{tr} = ${sci(hl, s.ttr / YR, 1)}\\,\\text{yr}`;
    const line2 = `v_s = \\dot R = ${hl(m.v, 0)}\\,\\text{km/s},\\quad T_s = \\frac{3\\mu m_p v_s^2}{16k} = ${sci(hl, m.T, 1)}\\,\\text{K}`;
    const age = `t = ${sci(hl, m.years, m.years < 10 ? 2 : 1)}\\,\\text{yr}`;
    const line3 = m.years < 1
      ? `${age},\\quad L \\propto e^{-t/111\\,\\text{d}} = ${hl(m.flash, 2)}\\quad (^{56}\\text{Co} \\to {}^{56}\\text{Fe})`
      : `${age},\\ \\ n = ${hl(s.n, 2)}\\,\\text{cm}^{-3},\\ \\ E = ${hl(s.E51, 2)}\\times10^{44}\\,\\text{J},\\ \\ M_{ej} = ${hl(s.Mej, 1)}\\,M_\\odot`;
    const ly = m.R * 3.2616;
    const line = beat(m.lt, [
      [0, `Remnant #${m.k + 1}: a ${s.ia ? 'white dwarf (Type Ia)' : 'collapsed massive star'}. The light is cobalt-56 decaying; the shock has barely started.`],
      [Math.min(6, m.ltSw - 3), `Coasting at ${Math.round(s.vej / 1e3).toLocaleString('en-US')} km/s. Nothing has noticed it yet.`],
      [m.ltSw, 'It has swept up its own mass in gas. From here on it remembers only E, the gas density and t.'],
      [m.ltSw + 6, `Radius ${ly.toFixed(0)} light-years, about ${(ly / 4.24).toFixed(0)} times the distance from the Sun to Proxima Centauri.`],
      [Math.min(m.ltTr, T_END - 6), 'Cool enough to radiate. The hot shell collapses into a thin cold one and coasts, R growing as t to the power 2/7.'],
      [T_END, 'The shock has slowed to the speed of sound in the gas. The remnant becomes part of the galaxy. Next star.'],
    ].sort((a, b) => a[0] - b[0]));
    return '\\begin{aligned}' + `& ${line1} \\\\ & ${line2} \\\\ & ${line3} \\\\ & ${caption(line)}` + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    glow: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const { scene } = ctx;
    scene.background = new THREE.Color(0x010206);
    const glow = createGlow(ctx, { fov: 42, strength: 0.9, threshold: 0.6, exposure: 1.0, vignette: 0.5 });

    // Stars: a shell that travels with the camera, so they always look infinitely far.
    const starGeo = new THREE.BufferGeometry();
    const NS = 2400, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3);
    const rnd = mulberry(4242);
    for (let i = 0; i < NS; i++) {
      const z = 2 * rnd() - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      sp.set([r * Math.cos(a), z, r * Math.sin(a)], i * 3);
      const b = 0.15 + 0.85 * rnd() ** 6, warm = rnd();
      sc.set([b * (0.8 + 0.3 * warm), b * 0.85, b * (1.15 - 0.4 * warm)], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    stars.frustumCulled = false;
    scene.add(stars);

    // The remnant: a ray-marched volume inside a bounding sphere.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCam: { value: new THREE.Vector3() }, uR: { value: 1 }, uProf: { value: SEDOV.prof },
          uInner: { value: 0.6 }, uCompress: { value: 1 }, uHot: { value: 1 }, uEj: { value: 1 }, uFil: { value: 0 }, uWisp: { value: 0 },
          uGain: { value: 1 }, uSeed: { value: 0 }, uPwn: { value: 0 },
        },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `varying vec3 vW;
          uniform vec3 uCam; uniform float uR, uProf[${PROF_N}], uInner, uCompress, uHot, uEj, uFil, uWisp, uGain, uSeed, uPwn;
          float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float noise(vec3 x) {
            vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
          }
          float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
          float prof(float l) {
            float x = clamp(l, 0.0, 1.0) * ${(PROF_N - 1).toFixed(1)};
            int i = int(floor(x)); int j = min(i + 1, ${PROF_N - 1});
            return mix(uProf[i], uProf[j], x - float(i));
          }
          // emission density at p (in units of the shock radius); march() multiplies by the step length
          vec3 emit(vec3 p) {
            float r = length(p);
            vec3 d = p / max(r, 1e-4);
            float dent = fbm(d * 2.2 + uSeed);
            float l = r / (1.0 + (0.06 + 0.05 * uFil) * (dent - 0.5));   // the shock radius varies with direction
            if (l > 1.0) return vec3(0.0);
            // shocked gas: the Sedov profile, squeezed into a thin shell once it cools
            float lc = 1.0 - (1.0 - l) * uCompress;
            float e = lc > 0.0 ? prof(lc) : 0.0;
            float rim = smoothstep(0.93, 1.0, lc);
            if (e > 0.002 && uFil > 0.001) {
              float n = fbm(p * 5.0 + uSeed * 1.7);
              float ridge = pow(1.0 - abs(2.0 * n - 1.0), 6.0);
              e *= mix(1.0, 0.04 + 5.0 * ridge, uFil);
            }
            // hot-phase wisps: finer, softer ridges in the X-ray shell (as in Tycho or SN 1006)
            float wisp = 0.0;
            if (e > 0.002 && uWisp > 0.001) {
              float n = fbm(p * 6.0 - uSeed * 2.3);
              wisp = pow(1.0 - abs(2.0 * n - 1.0), 7.0);
              e *= mix(1.0, 0.06 + 5.5 * wisp, uWisp);
            }
            vec3 hotRim = vec3(0.35, 0.65, 2.2) * (0.6 + 0.8 * dent), warm = vec3(1.2, 0.55, 0.35);
            vec3 oiii = vec3(0.12, 0.95, 0.75), ha = vec3(1.7, 0.2, 0.26);
            vec3 cs = mix(mix(ha, oiii, rim * 0.85), mix(warm, hotRim, 0.35 + 0.65 * rim), uHot);
            cs = mix(cs, vec3(0.55, 0.9, 2.0), clamp(wisp * uWisp * 1.2, 0.0, 0.45));   // wisp crests run hotter
            vec3 col = cs * e;
            // ejecta knots (Rayleigh–Taylor fingers behind the contact surface), X-ray false colour
            if (uEj > 0.01 && l > 0.25 && l < 0.97) {
              float f = fbm(p * 6.5 + uSeed * 3.1);
              float lo = mix(0.3, 0.72, 1.0 - uEj);
              float knot = smoothstep(0.6, 0.72, f) * smoothstep(lo, lo + 0.1, l) * (1.0 - smoothstep(0.86, 0.95, l + 0.08 * f));
              float which = noise(p * 1.7 - uSeed);
              vec3 elem = which < 0.4 ? vec3(1.6, 0.35, 0.25) : which < 0.62 ? vec3(1.5, 1.05, 0.3) : vec3(0.35, 0.6, 1.6);   // Si, S, Fe
              col += elem * knot * uEj * 0.5;
            }
            return col;
          }
          // ∫ emit along [ta, tb] of the ray, N steps
          vec3 march(vec3 ro, vec3 rd, float ta, float tb, float jit) {
            const int N = 28;
            float dt = (tb - ta) / float(N);
            vec3 col = vec3(0.0);
            if (dt <= 0.0) return col;
            for (int k = 0; k < N; k++) col += emit(ro + rd * (ta + (float(k) + jit) * dt));
            return col * dt;
          }
          void main() {
            vec3 ro = uCam / uR, rd = normalize(vW - uCam);        // units of the shock radius
            const float B = 1.1;
            float b = dot(ro, rd), c = dot(ro, ro), h = b * b - c + B * B;
            if (h < 0.0) discard;
            h = sqrt(h);
            float t0 = max(-b - h, 0.0), t1 = -b + h;
            if (t1 <= 0.0) discard;
            float jit = hash(vec3(gl_FragCoord.xy, uSeed));
            // only the shell emits (r > uInner): march the part of the ray outside the inner ball
            vec3 col;
            float hi = b * b - c + uInner * uInner;
            if (hi > 0.0) {
              hi = sqrt(hi);
              float i0 = -b - hi, i1 = -b + hi;
              col = march(ro, rd, t0, max(t0, i0), jit) + march(ro, rd, max(t0, i1), t1, jit);
            } else {
              col = march(ro, rd, t0, t1, jit);
            }
            // pulsar wind nebula: a Gaussian blob, integrated along the ray exactly
            if (uPwn > 0.0) {
              const float S = 0.06;
              float imp2 = max(c - b * b, 0.0);
              float through = -b > 0.0 ? 1.0 : 0.5 * exp(-b * b / (S * S));
              col += vec3(0.5, 0.75, 1.4) * uPwn * 1.7725 * S * exp(-imp2 / (S * S)) * through;
            }
            gl_FragColor = vec4(col * uGain, 1.0);
          }`,
      }),
    );
    shell.frustumCulled = false;
    scene.add(shell);

    const lines = createFatLines({ maxSegments: 16, width: 2 });
    const dots = createDots({ maxPoints: 8 });
    scene.add(lines.object, dots.object);
    return { glow, stars, shell, lines, dots, c: new THREE.Color(), v: new THREE.Vector3(), w: new THREE.Vector3(), tgt: new THREE.Vector3() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    if (!m) return;
    const s = m.s, cam = ctx.camera;
    const { shell, lines, dots, c, v, w, tgt } = state;
    const R = m.R, g = ctx.params.glow;
    state.glow.strength = 0.9 * g;

    // ── camera director ────────────────────────────────────────────────
    // Wide shots pull back as R^0.75, so the remnant still grows on screen.
    const wideD = 4 * R ** 0.75 * 10 ** 0.25;
    const az = 0.6 + 0.05 * m.lt + s.seed, u = m.shotT / m.shotLen;
    tgt.set(0, 0, 0);
    if (m.shot === 'wide') {
      const D = wideD * (1.08 - 0.08 * u), el = 0.28;
      cam.position.set(D * Math.cos(el) * Math.cos(az), D * Math.sin(el), D * Math.cos(el) * Math.sin(az));
    } else if (m.shot === 'top') {
      const D = wideD * 1.05, el = 1.15 - 0.25 * u;
      cam.position.set(D * Math.cos(el) * Math.cos(az), D * Math.sin(el), D * Math.cos(el) * Math.sin(az));
    } else if (m.shot === 'limb') {
      // close on one side of the rim, where limb brightening is strongest
      const a = az + 0.4;
      tgt.set(0.75 * R * Math.cos(a + 1.3), 0.1 * R, 0.75 * R * Math.sin(a + 1.3));
      const D = R * (3.6 - 0.4 * u);
      cam.position.set(D * Math.cos(a), 0.35 * R, D * Math.sin(a));
    } else {
      // dolly out from just beyond the rim, slightly off-centre
      const D = R * (2.4 + 1.6 * smooth(u)), el = 0.12;
      tgt.set(0.25 * R * Math.cos(az + 1.6), 0, 0.25 * R * Math.sin(az + 1.6));
      cam.position.set(D * Math.cos(el) * Math.cos(az), D * Math.sin(el), D * Math.cos(el) * Math.sin(az));
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(tgt);
    const dist = cam.position.length();
    cam.near = Math.max(1e-4, Math.min(0.02 * R, 0.01 * dist));
    cam.far = dist * 50 + R * 10;
    cam.updateProjectionMatrix();
    state.stars.position.copy(cam.position);
    state.stars.scale.setScalar(cam.far * 0.8);

    // ── the remnant ────────────────────────────────────────────────────
    const U = shell.material.uniforms;
    shell.scale.setScalar(R);
    U.uCam.value.copy(cam.position);
    U.uR.value = R;
    U.uCompress.value = 1 + 2.5 * m.cool;
    U.uInner.value = m.ej > 0.01 ? 0.25 : 0.62 + 0.25 * m.cool;
    U.uFil.value = m.cool;
    U.uWisp.value = (0.4 + 0.55 * smooth(clamp01((m.lt - m.ltSw) / 4))) * (1 - m.cool);
    U.uHot.value = smooth(clamp01((Math.log10(m.T) - 5.6) / 0.9));
    U.uEj.value = m.ej;
    U.uSeed.value = s.seed;
    U.uPwn.value = s.ia ? 0 : 0.6 * smooth(clamp01((m.years - 30) / 300)) * (1 - 0.7 * m.cool);
    U.uGain.value = 0.45 * g * m.fade * (1 + 2.5 * m.cool) * (1 + 2.5 * (1 - smooth(clamp01((Math.log10(m.years) + 0.5) / 2))));

    // the explosion's light, and (for a core collapse) the pulsar left behind
    lines.reset(); dots.reset();
    const k = (r, gg, b, x) => c.setRGB(r * x * m.fade, gg * x * m.fade, b * x * m.fade);
    if (m.flash > 0.01) dots.push(v.set(0, 0, 0), k(3, 2.6, 2.2, 6 * m.flash), dist * 0.05 * (0.4 + 0.6 * m.flash));
    if (!s.ia && m.years > 3) {
      dots.push(v.set(0, 0, 0), k(1.4, 1.8, 3, 1.5), Math.max(R * 0.012, dist * 0.004));
      const a = ctx.time * 9 * s.spin * 10, tilt = 0.5;
      const L = R * 0.18;
      w.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).multiplyScalar(L);
      const beamCol = k(0.6, 0.9, 2.2, 0.8);
      lines.push(v.set(0, 0, 0), w, beamCol, c.clone().multiplyScalar(0.05));
      lines.push(v.set(0, 0, 0), w.clone().negate(), beamCol, c.clone().multiplyScalar(0.05));
    }
    lines.setResolution(ctx.size.width, ctx.size.height);
    dots.setCamera(cam, ctx.size.height);
    lines.commit(); dots.commit();
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.lines.dispose(); state.dots.dispose();
    state.stars.geometry.dispose(); state.stars.material.dispose();
    state.shell.geometry.dispose(); state.shell.material.dispose();
  },
};
