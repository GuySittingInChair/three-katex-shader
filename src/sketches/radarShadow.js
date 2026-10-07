import * as THREE from 'three';
import { phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines, createDots } from '../lib/fatLines.js';
import { caption, beat } from '../lib/bit.js';

// A drone finds a target, then flies the path a radar is least likely to see.
//
// 1. Finding it (Johnson criteria). A camera "detects" a target when enough
//    pixel pairs span it: N = h / (2 R · IFOV) cycles across the target's
//    critical size h at range R. The chance of detection is
//        P = (N/N50)^E / (1 + (N/N50)^E),   E = 2.7 + 0.7 · N/N50,
//    with N50 = 1 cycle for detection. Here h = 2.5 m (a towed gun), and the
//    zoom camera resolves IFOV = 0.18 mrad, so P passes ½ at 6.9 km.
//
// 2. Hiding from the radar. A radar's echo falls off as 1/r⁴ (out and back),
//    so a drone flying at constant speed along a path γ collects echo energy
//    proportional to the exposure J[γ] = ∫ ds / r⁴. The path of least exposure
//    is a geodesic of the metric ds/r⁴, and that metric is conformally flat:
//    with w = z⁻³ (z = x + iy, radar at 0), |dw| = 3 r⁻⁴ |dz|, so
//        J = ⅓ ∫ |dw|,
//    and the best path is a straight line in the w-plane. Mapped back, a line
//    Re(w e^(−iφ)) = c is r³ = a³ cos(3θ + φ): a sinusoidal spiral, three-lobed,
//    that swings wide of the radar before cutting in. (Valid while the
//    endpoints are less than 60° apart as seen from the radar, so the line
//    doesn't wind round w = 0.)
//    More generally, for a sensor whose signal falls as 1/rⁿ the map is
//    w = z^(1−n): n = 1 gives logarithmic spirals (w = log z), n = 2 (a camera
//    or IR seeker, one-way) gives circles through the sensor, n = 4 (radar,
//    two-way) gives the spiral above. The planning phase sweeps n from 0 to 4.
//    Checked in Node: integrating ds/r⁴ along the drawn curve reproduces
//    |Δw|/3 to 5 figures, every perturbation raises it, and the curve fits
//    the r⁻³cos(3θ+φ) family to 10⁻¹³.
//
// 3. Was it seen? The radar integrates echo energy; the integrated
//    signal-to-noise ratio S is proportional to J. North's approximation for
//    a steady target: P_d = ½ erfc(√(−ln P_fa) − √(S + ½)), P_fa = 10⁻⁶. With
//    the scale set so the straight path ends at S = 20, the straight path is
//    found 87% of the time and the curved one 40%. Less, not never.
//
// Background: the radar is a 16-element phased array, half a wavelength apart,
// sweeping its beam. Its one-way pattern is the array factor
//     AF(θ) = sin(Nψ/2) / (N sin(ψ/2)),   ψ = π sin(θ − θ_beam),
// and the echo goes through it twice, so the field drawn is AF⁴ / r⁴: a main
// lobe, sidelobes 26 dB down, and the faint rings of each outgoing pulse.
//
// Units: 1 scene unit = 1 km. Drone at about 60 km/h; shown about 60× real time.

const A = { r: 8, th: (-20 * Math.PI) / 180 };          // where the drone spots the target
const B = { r: 3, th: (35 * Math.PI) / 180 };           // the target, 3 km from the radar
const H_CRIT = 2.5;                                      // m
const IFOV = 0.00018;                                    // rad
const N50 = 1;
const PFA = 1e-6;
const S_LINE = 20;                                       // integrated SNR at the end of the straight path
const PERIOD = 38;
const T_FIND = 8, T_PLAN = 14, T_FLY = 33;               // phase ends (s)
const BEAM_PERIOD = 3.2;                                 // s per sweep (sped up)
const ELEMENTS = 16;

const cart = (p) => ({ x: p.r * Math.cos(p.th), y: p.r * Math.sin(p.th) });
const PA = cart(A), PB = cart(B);

// Geodesic of the metric ds / rⁿ between A and B (polar endpoints), as a polyline of {x, y}.
function geodesic(n, samples = 400) {
  const beta = 1 - n;
  const pts = [];
  if (Math.abs(beta) < 1e-4) {
    // w = log z: a straight line in (ln r, θ) is a logarithmic spiral
    for (let i = 0; i <= samples; i++) {
      const s = i / samples;
      const r = Math.exp(Math.log(A.r) + (Math.log(B.r) - Math.log(A.r)) * s);
      const th = A.th + (B.th - A.th) * s;
      pts.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
    }
    return pts;
  }
  // w = z^β, taking arg w = β·θ from the endpoints so the branch is continuous
  const wA = { x: A.r ** beta * Math.cos(beta * A.th), y: A.r ** beta * Math.sin(beta * A.th) };
  const wB = { x: B.r ** beta * Math.cos(beta * B.th), y: B.r ** beta * Math.sin(beta * B.th) };
  let arg = beta * A.th;
  let prev = Math.atan2(wA.y, wA.x);
  for (let i = 0; i <= samples; i++) {
    const s = i / samples;
    const wx = wA.x + (wB.x - wA.x) * s, wy = wA.y + (wB.y - wA.y) * s;
    const a = Math.atan2(wy, wx);
    let d = a - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); arg += d; prev = a;
    const r = Math.hypot(wx, wy) ** (1 / beta), th = arg / beta;
    pts.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
  }
  return pts;
}
// cumulative arc length and exposure ∫ds/r⁴ along a polyline
function measure(pts) {
  const s = [0], J = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ds = Math.hypot(b.x - a.x, b.y - a.y);
    const r = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
    s.push(s[i - 1] + ds); J.push(J[i - 1] + ds / r ** 4);
  }
  return { pts, s, J, L: s[s.length - 1], Jt: J[J.length - 1] };
}
function at(path, dist) {
  const { pts, s, J } = path;
  const d = Math.max(0, Math.min(path.L, dist));
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] < d) lo = m; else hi = m; }
  const f = (d - s[lo]) / Math.max(1e-9, s[hi] - s[lo]);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f, J: J[lo] + (J[hi] - J[lo]) * f };
}
const CURVE = measure(geodesic(4, 1200));
const LINE = measure(Array.from({ length: 401 }, (_, i) => ({ x: PA.x + ((PB.x - PA.x) * i) / 400, y: PA.y + ((PB.y - PA.y) * i) / 400 })));
const K_SNR = S_LINE / LINE.Jt;
// the whole of the family member the drone flies: r³ = a³ cos(3θ + φ), here as r⁻³ cos(−3θ − ψ) = c
const FAMILY = (() => {
  const wA = { x: A.r ** -3 * Math.cos(-3 * A.th), y: A.r ** -3 * Math.sin(-3 * A.th) };
  const wB = { x: B.r ** -3 * Math.cos(-3 * B.th), y: B.r ** -3 * Math.sin(-3 * B.th) };
  const nx = -(wB.y - wA.y), ny = wB.x - wA.x, nl = Math.hypot(nx, ny);
  let c = (wA.x * nx + wA.y * ny) / nl, psi = Math.atan2(ny, nx);
  if (c < 0) { c = -c; psi += Math.PI; }
  return { a: (1 / c) ** (1 / 3), phi: psi };
})();

// inbound leg: from 5 km beyond A, on the line from the target through A
const INB = (() => { const dx = PA.x - PB.x, dy = PA.y - PB.y, l = Math.hypot(dx, dy); return { x: PA.x + (dx / l) * 5, y: PA.y + (dy / l) * 5 }; })();

function erfc(x) {
  // Numerical Recipes erfc (|error| < 1.2e-7)
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const pDetect = (S) => 0.5 * erfc(Math.sqrt(-Math.log(PFA)) - Math.sqrt(S + 0.5));
function johnson(R) {
  const N = H_CRIT / (2 * R * 1000 * IFOV);
  const x = N / N50, E = 2.7 + 0.7 * x;
  return { N, P: x ** E / (1 + x ** E) };
}

const COL = {
  curve: new THREE.Color(1.6, 1.05, 0.35),
  line: new THREE.Color(1.3, 0.25, 0.22),
  family: new THREE.Color(0.35, 0.24, 0.08),
  grid: new THREE.Color(0.05, 0.12, 0.16),
  drone: new THREE.Color(2.2, 2.1, 1.9),
  target: new THREE.Color(1.8, 0.3, 1.2),
  radar: new THREE.Color(0.4, 1.6, 1.5),
  sight: new THREE.Color(0.5, 0.9, 1.4),
};
const W3 = (p, h = 0.02) => new THREE.Vector3(p.x, h, -p.y);   // plane (x, y) → world (x, h, −y)

export default {
  name: 'Radar Shadow',
  description:
    'A drone spots a target by the Johnson criteria, then flies the path a radar is least likely to see: radar echo ' +
    'falls as 1/r⁴, the map w = z⁻³ turns that exposure into plain length, and the best route is the sinusoidal ' +
    'spiral r³ = a³cos(3θ+φ). Behind it, the radar’s phased-array beam sweeps the field.',
  tags: ['radar', 'geodesic', 'conformal map', 'calculus of variations', 'phased array', 'drone', 'glow'],
  category: 'Physics',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const lt = phaseOf(t, PERIOD) * PERIOD;
    const m = { lt, phase: lt < T_FIND ? 'find' : lt < T_PLAN ? 'plan' : lt < T_FLY ? 'fly' : 'arrive', beam: (t / BEAM_PERIOD) * Math.PI * 2 };
    // 1. inbound, camera on the target
    const fi = clamp01(lt / T_FIND);
    m.inbound = { x: INB.x + (PA.x - INB.x) * smooth(fi), y: INB.y + (PA.y - INB.y) * smooth(fi) };
    const R = Math.hypot(m.inbound.x - PB.x, m.inbound.y - PB.y);
    const j = johnson(R);
    m.R = R; m.N = j.N; m.Pj = j.P;
    // 2. the sensor exponent sweeps 0 → 4 (1 = log spiral, 2 = circle, 4 = radar)
    m.n = 4 * smooth(clamp01((lt - T_FIND - 0.3) / (T_PLAN - T_FIND - 1.3)));
    // 3. both drones at the same speed; the straight one finishes early
    const f = clamp01((lt - T_PLAN) / (T_FLY - T_PLAN));
    const v = CURVE.L / (T_FLY - T_PLAN);
    const c = at(CURVE, f * CURVE.L), l = at(LINE, f * (T_FLY - T_PLAN) * v);
    m.cur = c; m.lin = l;
    m.Jc = c.J; m.Jl = l.J;
    m.Pc = pDetect(K_SNR * c.J); m.Pl = pDetect(K_SNR * l.J);
    m.fly = f;
    m.fade = smooth(clamp01(lt / 0.8)) * (1 - smooth(clamp01((lt - (PERIOD - 1.2)) / 1.2)));
    return m;
  },

  latex: (params, hl, m) => {
    const line1 = m.phase === 'find'
      ? `N = \\frac{h}{2R\\,\\mathrm{IFOV}} = ${hl(m.N, 2)},\\quad P = \\frac{(N/N_{50})^E}{1+(N/N_{50})^E} = ${hl(m.Pj, 2)}\\quad (R = ${hl(m.R, 1)}\\,\\text{km})`
      : `J[\\gamma] = \\int_\\gamma \\frac{ds}{r^{n}},\\quad w = z^{1-n} \\Rightarrow J = \\tfrac{1}{|1-n|}\\int |dw|\\quad (n = ${hl(m.phase === 'plan' ? m.n : 4, 2)})`;
    const line2 = m.phase === 'plan'
      ? (m.n < 0.5 ? '\\text{no sensor: the straight line}' : Math.abs(m.n - 1) < 0.25 ? 'n = 1:\\ \\text{a logarithmic spiral}' : Math.abs(m.n - 2) < 0.25 ? 'n = 2\\ (\\text{camera, one-way}):\\ \\text{a circle through the sensor}' : m.n > 3.75 ? 'n = 4\\ (\\text{radar, two-way}):\\ r^3 = a^3\\cos(3\\theta + \\varphi)' : `\\text{geodesic of } ds/r^{${m.n.toFixed(1)}}`)
      : `r^3 = a^3 \\cos(3\\theta + \\varphi),\\ \\ a = ${hl(FAMILY.a, 1)}\\,\\text{km}`;
    const line3 = m.phase === 'fly' || m.phase === 'arrive'
      ? `J_{\\text{curve}} = ${hl(m.Jc * 1000, 2)},\\ J_{\\text{straight}} = ${hl(m.Jl * 1000, 2)}\\ \\ (\\times 10^{-3}\\,\\text{km}^{-3}) \\\\ & P_d = \\tfrac12\\operatorname{erfc}\\!\\big(\\sqrt{-\\ln P_{fa}} - \\sqrt{S+\\tfrac12}\\big) = ${hl(m.Pc, 2)}\\ \\text{curved},\\ ${hl(m.Pl, 2)}\\ \\text{straight}`
      : `\\text{AF}(\\theta) = \\frac{\\sin(N\\psi/2)}{N\\sin(\\psi/2)},\\ \\ \\psi = \\pi\\sin(\\theta - \\theta_b),\\ \\ \\text{echo} \\propto \\text{AF}^4/r^4`;
    const line = beat(m.lt, [
      [0, 'Searching. The camera needs about one pixel pair across the target.'],
      [T_FIND - 1.2, 'Target. Now: how to get there without being seen?'],
      [T_FIND + 0.5, 'The best path depends on how fast the sensor fades with distance.'],
      [T_PLAN, 'Flying the radar geodesic. The red ghost goes straight.'],
      [T_PLAN + 9, 'Twice as far, about 40% less echo.'],
      [T_FLY, `Seen ${Math.round(m.Pc * 100)}% of the time instead of ${Math.round(pDetect(S_LINE) * 100)}%. Less, not never.`],
    ]);
    return '\\begin{aligned}' + `& ${line1} \\\\ & ${line2} \\\\ & ${line3} \\\\ & ${caption(line)}` + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    glow: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const { scene } = ctx;
    scene.background = new THREE.Color(0x02050a);
    const glow = createGlow(ctx, { fov: 40, strength: 0.85, threshold: 0.75, exposure: 1.0, vignette: 0.55 });
    ctx.camera.position.set(4.5, 15.5, 9.5);
    ctx.controls?.target.set(4.2, 0, -2.6);
    ctx.controls?.update();

    // The radar field: two-way array pattern over 1/r⁴, plus the outgoing pulse rings.
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uBeam: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 }, uFade: { value: 1 } },
        vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = vec2(w.x, -w.z); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `varying vec2 vP; uniform float uBeam, uTime, uGain, uFade;
          float af(float d) {
            float psi = 3.14159265 * sin(d);
            float den = ${ELEMENTS.toFixed(1)} * sin(psi * 0.5);
            return abs(den) < 1e-4 ? 1.0 : sin(${ELEMENTS.toFixed(1)} * psi * 0.5) / den;
          }
          void main() {
            float r = max(length(vP), 0.12);
            float th = atan(vP.y, vP.x);
            float d = th - uBeam;
            float front = step(0.0, cos(d));
            float g = af(d); g = g * g; g = g * g * front;                  // AF⁴, two-way
            float echo = g * pow(2.2 / r, 4.0);                             // over r⁴
            float avg = 0.06 * pow(2.2 / r, 4.0);                           // beam-averaged level
            float rings = 0.0;
            float pulse = fract(r / 4.0 - uTime * 0.9);                     // pulses leaving the antenna
            rings = smoothstep(0.985, 1.0, pulse) * front * (0.3 + 0.7 * g) * exp(-r * 0.12);
            float grid = (1.0 - smoothstep(0.0, 0.03, abs(fract(r / 2.0 + 0.5) - 0.5) * 2.0)) * 0.6;   // 2 km range rings
            vec3 c = vec3(0.08, 0.55, 0.52) * (1.0 - exp(-1.6 * echo)) * 2.6
                   + vec3(0.04, 0.22, 0.24) * (1.0 - exp(-avg))
                   + vec3(0.25, 0.9, 0.85) * rings
                   + vec3(0.03, 0.08, 0.1) * grid * exp(-r * 0.06);
            float edge = 1.0 - smoothstep(14.0, 19.0, r);
            gl_FragColor = vec4(c * uGain * uFade * edge, 1.0);
          }`,
      }),
    );
    scene.add(field);

    const lines = createFatLines({ maxSegments: 4200, width: 2.4 });
    const thin = createFatLines({ maxSegments: 2400, width: 1.2 });
    const dots = createDots({ maxPoints: 64 });
    scene.add(lines.object, thin.object, dots.object);
    return { glow, field, lines, thin, dots, trail: [], ghostTrail: [], c: new THREE.Color() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { lines, thin, dots, field, c } = state;
    const { width, height } = ctx.size;
    lines.setResolution(width, height); thin.setResolution(width, height); dots.setCamera(ctx.camera, height);
    const g = ctx.params.glow;
    field.material.uniforms.uBeam.value = m.beam;
    field.material.uniforms.uTime.value = ctx.time;
    field.material.uniforms.uGain.value = g;
    field.material.uniforms.uFade.value = m.fade;
    state.glow.strength = 0.85 * g;
    const fade = m.fade;
    const k = (col, s = 1) => c.copy(col).multiplyScalar(s * fade);

    lines.reset(); thin.reset(); dots.reset();
    // radar and target
    dots.push(W3({ x: 0, y: 0 }, 0.05), k(COL.radar, 1.4), 0.22);
    const pulse = 0.85 + 0.15 * Math.sin(ctx.time * 6);
    dots.push(W3(PB, 0.05), k(COL.target, m.phase === 'find' && m.Pj < 0.5 ? 0.45 : pulse), 0.18);

    // the full family member, faint: three lobes of r³ = a³cos(3θ+φ)
    if (m.phase !== 'find') {
      const showF = m.phase === 'plan' ? smooth(clamp01((m.n - 3.4) / 0.6)) : 1;
      let prev = null;
      for (let i = 0; i <= 1200; i++) {
        const th = (i / 1200) * Math.PI * 2;
        const cv = Math.cos(3 * th + FAMILY.phi);
        if (cv <= 0) { prev = null; continue; }
        const r = FAMILY.a * Math.cbrt(cv);
        const p = W3({ x: r * Math.cos(th), y: r * Math.sin(th) }, 0.01);
        if (prev) thin.push(prev, p, k(COL.family, showF));
        prev = p;
      }
    }

    if (m.phase === 'find') {
      // drone inbound; the camera's line of sight brightens with P
      const d = m.inbound;
      dots.push(W3(d, 0.3), k(COL.drone), 0.11);
      lines.push(W3(d, 0.3), W3(PB, 0.05), k(COL.sight, 0.15 + 0.8 * m.Pj));
      thin.push(W3(INB, 0.3), W3(d, 0.3), k(COL.drone, 0.25));
    } else {
      // straight line (red, faint) and the geodesic for the current sensor exponent
      for (let i = 1; i < LINE.pts.length; i += 2) {
        if ((i >> 3) % 2) continue;  // dashed
        lines.push(W3(LINE.pts[i - 1], 0.2), W3(LINE.pts[i], 0.2), k(COL.line, 0.55));
      }
      const pts = m.phase === 'plan' ? geodesic(m.n, 600) : CURVE.pts;
      const step = m.phase === 'plan' ? 1 : 2;
      for (let i = step; i < pts.length; i += step) {
        // the stretch already flown is bright
        const s = m.phase !== 'plan' && CURVE.s[i] / CURVE.L <= m.fly ? 1.0 : 0.45;
        lines.push(W3(pts[i - step], 0.25), W3(pts[i], 0.25), k(COL.curve, s));
      }
      if (m.phase !== 'plan') {
        // the two drones; the straight one is a ghost and flashes when the radar's odds of seeing it pass ½
        dots.push(W3(m.cur, 0.3), k(COL.drone), 0.12);
        const seen = m.Pl > 0.5;
        dots.push(W3(m.lin, 0.3), k(COL.line, seen ? 1.4 + 0.6 * Math.sin(ctx.time * 14) : 0.8), seen ? 0.14 : 0.1);
        if (seen) {
          const p = W3(m.lin, 0.3), r = 0.35 + 0.1 * Math.sin(ctx.time * 8);
          for (let a = 0; a < 24; a++) {
            const a0 = (a / 24) * Math.PI * 2, a1 = ((a + 1) / 24) * Math.PI * 2;
            lines.push(new THREE.Vector3(p.x + r * Math.cos(a0), p.y, p.z + r * Math.sin(a0)), new THREE.Vector3(p.x + r * Math.cos(a1), p.y, p.z + r * Math.sin(a1)), k(COL.line, 1.2));
          }
        }
      } else {
        dots.push(W3(PA, 0.3), k(COL.drone), 0.11);
      }
    }
    lines.commit(); thin.commit(); dots.commit();
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.lines.dispose(); state.thin.dispose(); state.dots.dispose();
    state.field.geometry.dispose(); state.field.material.dispose();
  },
};
