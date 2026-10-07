import * as THREE from 'three';
import { phaseOf, smooth, clamp01 } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption, beat } from '../lib/bit.js';

// A Shahed-type drone (3.5 m long, 2.5 m span, about 200 kg) makes a pop-up attack on a gun position, and
// a twin 35 mm autocannon shoots it down. Everything is simulated at 240 Hz, then played back, with slow
// motion around the hit.
//
// The attack. It flies in at 45 m, below the tree line where the gun's radar can't see it, climbs steeply
// about 1.5–1.9 km out, and from 0.7–0.95 km dives on the target by proportional navigation, the law most
// guided missiles use: steer at N times the rate the line of sight turns,
//     a = N·V_c·(Ω × v̂),   Ω = (r × ṙ) / |r|²,   N = 3,
// with V_c the closing speed. It weaves while diving.
//
// The gun. Two barrels, 550 rounds/min each, 1175 m/s, 1.2 mrad dispersion; the rounds slow by quadratic
// drag (v̇ = −k|v|v + g, k = 1.6 × 10⁻⁴ /m, so about 850 m/s left at 2 km) and drop. Its radar only sees
// the drone above about 90 m, and it takes 1–8 s to track, identify and slew. Fire control solves
//     |r̂ + v̂ t| = v̄ t
// for the lead, with the drag-corrected flight time t = (e^{kd} − 1)/(k v₀), using a radar track: fixes
// with 1.5 mrad of noise smoothed by an α–β filter, so it lags every change of course. Checked in Node over
// 40 attacks: 30 shot down in the climb and 10 in the dive, after 25–120 rounds, at 1.2–1.6 km.
//
// The hit. One 35 mm high-explosive round is enough; where it lands decides what happens:
//   nose (the warhead): it detonates 70% of the time;
//   fuselage: it breaks in three, nose, middle with the wings, and tail with the engine;
//   a wing: that wing comes off and the rest tumbles;
//   the engine: no power, it glides down at about 6 to 1 and its warhead may go off where it lands.
// Every piece then falls as its own rigid body: v̇ = g − (ρ C_d A / 2m)|v|v, spinning, each with its own
// terminal speed √(2mg / ρC_dA) (a wing flutters down at about 10 m/s, the warhead section falls at 100).
//
// The blast. The warhead is taken as 18 kg TNT equivalent (E ≈ 75 MJ). Its shock front grows as the
// Taylor–Sedov point blast, R = 1.03 (E t² / ρ)^{1/5} (6 m at 10 ms, 11 m at 50 ms), and the casing breaks
// into fragments thrown at the Gurney velocity √(2E)·(M/C + 3/5)^{−1/2} ≈ 1.9 km/s (M/C = 1.5), slowed by
// drag: distance s(t) = ln(1 + k v₀ t)/k.

const G = 9.81;
const DT = 1 / 240;
const REC = 4;                          // record every 4th step: 60 Hz playback
const RHO = 1.2;
const V0 = 1175, K = 1.6e-4, RATE = (2 * 550) / 60, SIG = 0.0012, OPEN = 2600;
const TNT_E = 18 * 4.184e6;
const GURNEY = 2700 / Math.sqrt(1.5 + 0.6);
const SLOW = 0.1;                       // playback speed around the hit
const PRE = 9, SLOW_BEFORE = 0.2, SLOW_AFTER = 0.85, POST = 8;
const PERIOD = PRE + (SLOW_BEFORE + SLOW_AFTER) / SLOW + POST;   // display seconds per attack
const TARGET = { x: 40, y: 0, z: -30 };
const GUN = { x: 0, y: 3, z: 0 };

// ---------- small vector kit (plain objects: the simulation runs outside three.js) ----------
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
function rngOf(seed) {
  let s = (seed % 2147483646) + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  r.n = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(6.283185 * r());
  return r;
}

// Drone pieces, in the drone's frame (x forward, y up, z right), metres and kilograms.
const PIECES = {
  nose: { m: 50, cda: 0.08, off: V(1.1, 0, 0) },
  mid: { m: 90, cda: 0.25, off: V(-0.1, 0, 0) },
  tail: { m: 30, cda: 0.06, off: V(-1.4, 0, 0) },
  wingL: { m: 8, cda: 0.6, off: V(-0.6, 0, -0.8) },
  wingR: { m: 8, cda: 0.6, off: V(-0.6, 0, 0.8) },
};
const terminal = (pc) => Math.sqrt((2 * pc.m * G) / (RHO * pc.cda));

// Orientation of the airframe from its velocity and sideways acceleration (a coordinated turn banks by
// atan(a_side / g)).
function frameOf(v, a) {
  const f = norm(v);
  let right = cross(f, V(0, 1, 0));
  if (len(right) < 1e-3) right = V(0, 0, 1);
  right = norm(right);
  const bank = Math.atan2(dot(a, right), G);
  const up0 = cross(right, f);
  const up = add(mul(up0, Math.cos(bank)), mul(right, -Math.sin(bank)));
  const r2 = cross(f, up);
  return { f, u: up, r: r2 };
}

// ---------- the simulation: one attack, start to finish ----------
function simulate(seed) {
  const r = rngOf(seed);
  const az = (r() - 0.5) * 1.2;
  const popAt = 1500 + r() * 400, topAlt = 260 + r() * 140, diveAt = 700 + r() * 250;
  const weaveW = 0.6 + r() * 0.6, weaveA = 4 + r() * 5, delay = 1 + r() * 7;
  let p = V(TARGET.x + Math.sin(az) * 2300, 45, TARGET.z - Math.cos(az) * 2300);
  let v = mul(norm(sub(V(TARGET.x, p.y, TARGET.z), p)), 51);
  let a = V();
  let phase = 'low', seenAt = null, cool = 0, barrel = 0, pEst = null, vEst = V();
  const track = [];                     // the drone, 60 Hz
  const shots = [];                     // each round: { t, path: [{x,y,z}] at 60 Hz, tracer }
  const gunAim = [];                    // turret direction, 60 Hz
  let hit = null;
  let aim = norm(sub(p, GUN));
  let lastFC = { tof: 0, lead: 0, range: 0, Vc: 0 };
  let step = 0, t = 0;
  for (; t < 70; t += DT, step++) {
    if (!hit) {
      const los = sub(TARGET, p), hd = Math.hypot(los.x, los.z);
      if (phase === 'low' && hd < popAt) phase = 'climb';
      if (phase === 'climb' && (p.y > topAlt || hd < diveAt)) phase = 'dive';
      let acc, Vc = len(v);
      if (phase === 'climb') {
        acc = mul(sub(add(mul(norm(V(los.x, 0, los.z)), 45), V(0, 26, 0)), v), 1.2);
      } else if (phase === 'dive') {
        const vr = mul(v, -1);
        const Om = mul(cross(los, vr), 1 / dot(los, los));
        Vc = -dot(norm(los), vr);
        acc = mul(cross(Om, norm(v)), -3 * Vc);
        acc = add(acc, add(mul(norm(v), 2.0), V(0, -G * 0.35, 0)));
        acc = add(acc, mul(norm(cross(v, V(0, 1, 0))), weaveA * Math.sin(weaveW * 6.283 * t)));
      } else {
        acc = V(0, (45 - p.y) * 0.05 - v.y * 0.4, 0);
      }
      const am = len(acc); if (am > 25) acc = mul(acc, 25 / am);
      a = acc;
      v = add(v, mul(a, DT));
      const sp = len(v); if (sp > 75) v = mul(v, 75 / sp);
      p = add(p, mul(v, DT));
      lastFC.Vc = Vc;
      if (p.y < 0.5 || len(sub(p, TARGET)) < 3) { hit = { t, kind: 'reached', p, v, part: 'none', range: len(sub(p, GUN)) }; }
    }
    // fire control
    const rel = sub(p, GUN), R = len(rel);
    if (!hit) {
      if (seenAt === null && p.y > 90) seenAt = t;
      if (seenAt !== null) {
        const meas = add(p, V(r.n() * 0.0015 * R, r.n() * 0.0015 * R, r.n() * 3));
        if (!pEst) { pEst = meas; vEst = mul(norm(sub(GUN, p)), 50); }
        const pred = add(pEst, mul(vEst, DT)), res = sub(meas, pred);
        pEst = add(pred, mul(res, 0.02)); vEst = add(vEst, mul(res, 0.0009 / DT));
        const relE = sub(pEst, GUN);
        let tt = len(relE) / V0, lead = relE;
        for (let i = 0; i < 6; i++) { lead = add(relE, mul(vEst, tt)); tt = (Math.exp(K * len(lead)) - 1) / (K * V0); }
        const dir0 = norm(add(lead, V(0, 0.5 * G * tt * tt, 0)));
        aim = dir0;
        lastFC = { tof: tt, lead: Math.acos(Math.max(-1, Math.min(1, dot(dir0, norm(relE))))), range: R, Vc: lastFC.Vc };
      }
    }
    cool -= DT;
    const firing = seenAt !== null && t > seenAt + delay && R < OPEN && (!hit || t < hit.t + 0.3) && (!hit || hit.kind !== 'reached');
    if (firing && cool <= 0) {
      const e1 = norm(cross(aim, V(0, 1, 0))), e2 = cross(e1, aim);
      const dir = norm(add(aim, add(mul(e1, r.n() * SIG), mul(e2, r.n() * SIG))));
      const side = barrel++ % 2 ? 0.45 : -0.45;
      const start = add(add(GUN, mul(e1, side)), mul(dir, 3.3));
      shots.push({ t, p: start, v: mul(dir, V0), path: [], tracer: shots.length % 3 === 0, alive: true, side });
      cool = 1 / RATE;
    }
    for (const b of shots) {
      if (!b.alive) continue;
      const p0 = b.p, s = len(b.v);
      b.v = add(b.v, add(mul(b.v, -K * s * DT), V(0, -G * DT, 0)));
      b.p = add(b.p, mul(b.v, DT));
      if (b.p.y < 0 || t - b.t > 4.5) { b.alive = false; continue; }
      if (!hit) {
        const pPrev = sub(p, mul(v, DT));
        const r0 = sub(p0, pPrev), r1 = sub(b.p, p), dd = sub(r1, r0);
        const tc = Math.max(0, Math.min(1, -dot(r0, dd) / dot(dd, dd)));
        const hp = add(r0, mul(dd, tc));
        if (len(hp) < 1.0) {
          // where on the airframe: into the drone's own frame
          const fr = frameOf(v, a);
          const loc = V(dot(hp, fr.f), dot(hp, fr.u), dot(hp, fr.r));
          const part = loc.x > 0.7 ? 'nose' : Math.abs(loc.z) > 0.35 ? (loc.z < 0 ? 'wingL' : 'wingR') : loc.x < -1.0 ? 'tail' : 'mid';
          hit = { t, kind: 'hit', p: add(p, hp), at: p, v, a, part, range: R, alt: p.y, phase, rounds: shots.length, fr };
          b.alive = false;
        }
      }
    }
    if (step % REC === 0) {
      track.push({ p, v, a, phase: hit ? 'down' : phase });
      gunAim.push(aim);
      for (const b of shots) if (b.alive) b.path.push({ i: track.length - 1, p: b.p });
    }
    if (hit && t > hit.t + SLOW_AFTER + POST + 0.5) break;
    if (hit && hit.kind === 'hit' && !hit.done) { hit.done = true; hit.pieces = breakUp(hit, r); }
  }
  return { seed, track, shots, gunAim, hit, fc: lastFC, end: t, delay, seenAt };
}

// After the hit: each piece is a rigid body falling under gravity and drag, spinning.
function breakUp(hit, r) {
  const fr = hit.fr;
  const toW = (o) => add(add(mul(fr.f, o.x), mul(fr.u, o.y)), mul(fr.r, o.z));
  const events = [];
  let groups;
  let detonate = false;
  if (hit.part === 'nose' && r() < 0.7) detonate = true;
  if (detonate) groups = [['nose'], ['mid'], ['tail'], ['wingL'], ['wingR']];
  else if (hit.part === 'nose' || hit.part === 'mid') groups = [['nose'], ['mid', 'wingL', 'wingR'], ['tail']];
  else if (hit.part === 'tail') groups = [['nose', 'mid', 'wingL', 'wingR'], ['tail']];
  else groups = [[hit.part], ['nose', 'mid', 'tail', ...['wingL', 'wingR'].filter((w) => w !== hit.part)]];
  // the 35 mm high-explosive round itself bursts on impact (about 0.11 kg of explosive, ≈ 0.6 MJ);
  // the warhead (≈ 75 MJ) sometimes goes with it
  events.push(detonate ? { t: hit.t, type: 'blast', p: hit.at, E: TNT_E, frags: 420 } : { t: hit.t, type: 'blast', p: hit.p, E: 0.6e6, frags: 90 });
  const glide = hit.part === 'tail';
  const bodies = groups.map((names) => {
    const m = names.reduce((s, n) => s + PIECES[n].m, 0);
    const cda = names.reduce((s, n) => s + PIECES[n].cda, 0);
    const c = mul(names.reduce((s, n) => add(s, mul(PIECES[n].off, PIECES[n].m)), V()), 1 / m);
    const kick = detonate ? 25 + r() * 50 : names.length === 1 ? 4 + r() * 8 : 1 + r() * 2;
    const away = norm(add(sub(toW(c), sub(hit.p, hit.at)), V(r.n() * 0.3, r.n() * 0.3 + 0.2, r.n() * 0.3)));
    const spin = names.length === 1 && names[0].startsWith('wing') ? 8 + r() * 10 : names.length >= 4 && glide ? 0 : 1.5 + r() * 5 + (detonate ? 8 : 0);
    return {
      names, m, cda, c,
      p: add(hit.at, toW(c)), v: add(hit.v, mul(away, kick)),
      q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(fr.f.x, fr.f.y, fr.f.z), new THREE.Vector3(fr.u.x, fr.u.y, fr.u.z), new THREE.Vector3(fr.r.x, fr.r.y, fr.r.z))),
      w: new THREE.Vector3(r.n(), r.n(), r.n()).normalize().multiplyScalar(spin),
      glide: glide && names.length >= 4, landed: false, path: [], hasWarhead: names.includes('nose') && !detonate,
    };
  });
  // integrate to the ground, recording at 60 Hz from the hit
  const dq = new THREE.Quaternion();
  for (let step = 0, t = hit.t; t < hit.t + SLOW_AFTER + POST + 0.5; t += DT, step++) {
    for (const b of bodies) {
      if (!b.landed) {
        if (b.glide) {
          // unpowered: settles into a 6:1 glide at about 42 m/s, still roughly on course
          const hd = norm(V(b.v.x, 0, b.v.z));
          const want = add(mul(hd, 41.5), V(0, -7, 0));
          b.v = add(b.v, mul(sub(want, b.v), DT * 0.8));
        } else {
          const sp = len(b.v);
          b.v = add(b.v, add(V(0, -G * DT, 0), mul(b.v, (-0.5 * RHO * b.cda * sp * DT) / b.m)));
        }
        b.p = add(b.p, mul(b.v, DT));
        const wl = b.w.length();
        if (wl > 1e-6) { dq.setFromAxisAngle(b.w.clone().divideScalar(wl), wl * DT); b.q.premultiply(dq); }
        if (b.p.y <= 0.3) {
          b.landed = true; b.p = V(b.p.x, 0.3, b.p.z);
          events.push({ t, type: 'dust', p: b.p });
          if (b.hasWarhead && r() < 0.5) events.push({ t, type: 'blast', p: V(b.p.x, 0.5, b.p.z), E: TNT_E, frags: 300 });
        }
      }
      if (step % REC === 0) b.path.push({ p: b.p, q: b.q.clone() });
    }
  }
  return { bodies, events, detonate };
}

// ---------- geometry ----------
function droneParts(edgeColor) {
  const body = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6, metalness: 0.3, emissive: edgeColor, emissiveIntensity: 0.06 });
  const edge = new THREE.LineBasicMaterial({ color: edgeColor });
  const mk = (geo) => { const g = new THREE.Group(); g.add(new THREE.Mesh(geo, body)); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edge)); return g; };
  const nose = mk(new THREE.CylinderGeometry(0.12, 0.22, 1.1, 14).rotateZ(-Math.PI / 2).translate(1.1, 0, 0));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), body); tip.position.x = 1.65; nose.add(tip);
  const mid = mk(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 14).rotateZ(-Math.PI / 2).translate(-0.1, 0, 0));
  const tail = mk(new THREE.CylinderGeometry(0.22, 0.14, 0.8, 14).rotateZ(-Math.PI / 2).translate(-1.25, 0, 0));
  const prop = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, 0.07), body); b.rotation.x = (i * Math.PI) / 2; prop.add(b); }
  prop.position.x = -1.68; tail.add(prop);
  const exhaust = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.4) }));
  exhaust.position.x = -1.62; tail.add(exhaust);
  const wing = (s) => {
    const sh = new THREE.Shape();
    sh.moveTo(0.4, 0); sh.lineTo(-1.45, 1.25 * s); sh.lineTo(-1.6, 1.25 * s); sh.lineTo(-1.2, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02).rotateX(Math.PI / 2);
    const g = mk(geo);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.03), body); fin.position.set(-1.45, 0.15, 1.25 * s); g.add(fin);
    return g;
  };
  return { nose, mid, tail, wingL: wing(-1), wingR: wing(1), prop, exhaust, mats: [body, edge] };
}

const COL = {
  tracer: new THREE.Color(6, 2.6, 0.8),
  round: new THREE.Color(0.9, 0.5, 0.2),
  frag: new THREE.Color(3, 2, 1),
};

export default {
  name: 'Intercept',
  description:
    'A Shahed-type drone pops up from behind the tree line and dives on a gun position by proportional ' +
    'navigation; a twin 35 mm autocannon solves the intercept and shoots it down. Then physics takes over: ' +
    'the airframe breaks into tumbling rigid bodies, and sometimes the warhead goes off in a Taylor–Sedov blast.',
  tags: ['physics', 'ballistics', 'proportional navigation', 'rigid bodies', 'blast wave', 'drone', 'glow'],
  category: 'Physics',

  mode: '3d',

  motion(t) {
    const loop = Math.floor(t / PERIOD);
    return { loop, dt: phaseOf(t, PERIOD) * PERIOD, fade: 1 };
  },

  latex: (params, hl, m) => {
    if (!m.ready) return '\\text{Simulating the attack…}';
    let l1, l2, l3;
    if (m.stage === 'approach') {
      l1 = m.phase === 'low'
        ? '\\text{Low and fast, under the tree line: the radar can\'t see it.}'
        : `\\mathbf a = N V_c\\,\\boldsymbol\\Omega \\times \\hat{\\mathbf v},\\ \\ \\boldsymbol\\Omega = \\frac{\\mathbf r \\times \\dot{\\mathbf r}}{|\\mathbf r|^2},\\ \\ N = 3,\\ V_c = ${hl(m.Vc, 0)}\\,\\text{m/s}`;
      l2 = m.firing
        ? `|\\hat{\\mathbf r} + \\hat{\\mathbf v}t| = \\bar v\\,t,\\ \\ t = \\frac{e^{kd}-1}{k v_0} = ${hl(m.tof, 2)}\\,\\text{s},\\ \\ \\text{lead } ${hl(m.lead * 1000, 0)}\\,\\text{mrad}`
        : `\\text{range } ${hl(m.range, 0)}\\,\\text{m},\\ \\text{altitude } ${hl(m.alt, 0)}\\,\\text{m}${m.seen ? ',\\ \\text{tracking}' : ''}`;
      l3 = `\\dot{\\mathbf v} = -k|\\mathbf v|\\mathbf v + \\mathbf g,\\ \\ k = 1.6\\times10^{-4}\\,\\text{m}^{-1}:\\ ${hl(m.rounds, 0)}\\ \\text{rounds fired}`;
    } else {
      l1 = `\\text{hit: ${m.partName}, at } ${hl(m.hitRange, 0)}\\,\\text{m},\\ ${hl(m.hitAlt, 0)}\\,\\text{m up, after } ${hl(m.hitRounds, 0)}\\ \\text{rounds}`;
      l2 = m.blastR != null
        ? `R = 1.03\\left(\\frac{E t^2}{\\rho}\\right)^{1/5} = ${hl(m.blastR, 1)}\\,\\text{m}\\ (t = ${hl(m.blastT * 1000, 1)}\\,\\text{ms}),\\ \\ v_f = \\sqrt{2E}\\left(\\tfrac{M}{C}+\\tfrac35\\right)^{-1/2} = ${hl(GURNEY / 1000, 2)}\\,\\text{km/s}`
        : `\\dot{\\mathbf v} = \\mathbf g - \\frac{\\rho C_d A}{2m}|\\mathbf v|\\mathbf v,\\ \\ v_t = \\sqrt{\\frac{2mg}{\\rho C_d A}}`;
      l3 = `v_t:\\ \\text{wing } ${hl(terminal(PIECES.wingL), 0)},\\ \\text{tail } ${hl(terminal(PIECES.tail), 0)},\\ \\text{warhead section } ${hl(terminal(PIECES.nose), 0)}\\ \\text{m/s}`;
    }
    const line = m.stage === 'approach'
      ? beat(m.simT - m.t0, [[0, 'A pop-up attack: stay low, climb near the target, then dive.'], [3, m.firing ? 'Fire control leads the target by its predicted flight time.' : m.seen ? 'Tracked. Identifying, slewing the turret.' : 'Low and fast, under the radar.']])
      : m.slow ? `Slow motion, ${Math.round(SLOW * 100)}% speed.` : m.blastR != null ? 'The blast front outruns the fragments, then fades to a sound wave.' : 'Each piece falls at its own terminal speed.';
    return '\\begin{aligned}' + `& ${l1} \\\\ & ${l2} \\\\ & ${l3} \\\\ & ${caption(line)}` + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0.2, max: 3 },
    glow: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const { scene } = ctx;
    scene.background = new THREE.Color(0x03060b);
    scene.fog = new THREE.FogExp2(0x060b12, 0.00028);
    // moonlit night sky: brighter toward the horizon and the moon, so tree lines and the drone stand out
    const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD;
        void main() {
          float h = max(vD.y, 0.0);
          vec3 c = mix(vec3(0.07, 0.11, 0.17), vec3(0.008, 0.015, 0.035), pow(h, 0.45));
          vec3 moon = normalize(vec3(-0.55, 0.45, -0.7));
          float m = max(dot(normalize(vD), moon), 0.0);
          c += vec3(0.5, 0.6, 0.8) * (pow(m, 900.0) * 30.0 + pow(m, 30.0) * 0.08);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.renderOrder = -1;
    scene.add(sky);
    const glow = createGlow(ctx, { fov: 50, strength: 0.9, threshold: 0.8, exposure: 1.1, vignette: 0.6 });
    ctx.camera.near = 0.5; ctx.camera.far = 20000; ctx.camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight(0x51607a, 0x0a0806, 0.7));
    const moon = new THREE.DirectionalLight(0xbfd2ff, 1.2); moon.position.set(-600, 900, 400); scene.add(moon);

    // Ground: gentle hills, dark, with a faint 100 m grid that glows; tree lines the drone hides behind.
    const groundGeo = new THREE.PlaneGeometry(12000, 12000, 200, 200).rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i), d = Math.hypot(x, z);
      gp.setY(i, smooth((d - 400) / 1500) * (14 * Math.sin(x * 0.0021) * Math.cos(z * 0.0017) + 9 * Math.sin((x + z) * 0.0043)));
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({
      uniforms: { uFog: { value: new THREE.Color(0x060b12) } },
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; varying vec3 vN; uniform vec3 uFog;
        void main() {
          vec2 g = abs(fract(vW.xz / 100.0 - 0.5) - 0.5) / fwidth(vW.xz / 100.0);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float shade = 0.5 + 0.5 * max(dot(normalize(vN), normalize(vec3(-0.5, 0.8, 0.3))), 0.0);
          vec3 c = vec3(0.012, 0.02, 0.026) * shade + vec3(0.05, 0.16, 0.2) * line * 0.6;
          float d = length(vW - cameraPosition);
          c = mix(c, uFog, 1.0 - exp(-d * 0.00028));
          gl_FragColor = vec4(c, 1.0);
        }`,
      extensions: { derivatives: true },
    }));
    scene.add(ground);
    {
      const r = rngOf(77);
      const geo = new THREE.ConeGeometry(4, 16, 6).translate(0, 8, 0);
      const trees = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 }), 2600);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < 2600; i++) {
        // windbreaks: rows across the approach, 600 m–3 km out
        const row = Math.floor(r() * 9), dist = 600 + row * 300 + r() * 30, along = (r() - 0.5) * 2600;
        const ang = (r() - 0.5) * 0.04;
        p.set(along * Math.cos(ang), 0, -dist + along * Math.sin(ang));
        const sc = 0.7 + r() * 0.7; s.set(sc, sc, sc); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
        mtx.compose(p, q, s); trees.setMatrixAt(i, mtx);
      }
      scene.add(trees);
    }

    // The gun: base, turret, twin barrels; muzzle flashes at the tips.
    const gun = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.6 });
    gun.add(new THREE.Mesh(new THREE.BoxGeometry(7, 2, 3.4).translate(0, 1, 0), steel));
    const turret = new THREE.Group(); turret.position.set(0, 2.6, 0);
    turret.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 2.4), steel));
    const elev = new THREE.Group(); turret.add(elev);
    const flashes = [];
    for (const z of [-0.45, 0.45]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 10).rotateZ(-Math.PI / 2).translate(1.6, 0, 0), steel);
      barrel.position.z = z; elev.add(barrel);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5, 2) }));
      fl.position.set(3.35, 0, z); fl.visible = false; elev.add(fl); flashes.push(fl);
    }
    gun.add(turret); gun.position.set(GUN.x, 0, GUN.z); scene.add(gun);
    const pad = new THREE.Mesh(new THREE.RingGeometry(14, 15, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.5, 0.6) }));
    pad.position.set(TARGET.x, 0.3, TARGET.z); scene.add(pad);

    const parts = droneParts(new THREE.Color(1.6, 1.1, 0.6));
    const drone = new THREE.Group();
    const pieceGroups = {};
    for (const n of Object.keys(PIECES)) { pieceGroups[n] = new THREE.Group(); pieceGroups[n].add(parts[n]); }
    scene.add(drone);

    const tracers = createFatLines({ maxSegments: 400, width: 2.2 });
    const rounds = createFatLines({ maxSegments: 400, width: 1.0 });
    const frags = createFatLines({ maxSegments: 500, width: 1.4 });
    scene.add(tracers.object, rounds.object, frags.object);

    // blast: flash, fireball, Sedov shell, dust rings
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.5, 1.8), transparent: true, opacity: 0.3, wireframe: true, depthWrite: false }));
    const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.5, 0.8), transparent: true, depthWrite: false }));
    const smokeMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, transparent: true, depthWrite: false });
    const smoke = Array.from({ length: 10 }, () => new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), smokeMat));
    scene.add(shell, fireball, ...smoke);
    const dusts = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b5c45, transparent: true, depthWrite: false })); scene.add(m); return m; });

    return {
      glow, ground, gun, turret, elev, flashes, drone, parts, pieceGroups, tracers, rounds, frags, shell, fireball, smoke, smokeMat, dusts,
      sim: null, loop: -1, timeline: null, camT: 0,
      v3: new THREE.Vector3(), v3b: new THREE.Vector3(), basis: new THREE.Matrix4(),
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { tracers, rounds, frags, pieceGroups, parts, drone } = state;
    const { width, height } = ctx.size;
    for (const l of [tracers, rounds, frags]) l.setResolution(width, height);
    state.glow.strength = 0.9 * ctx.params.glow;

    // a new attack each loop
    if (state.loop !== m.loop) {
      state.loop = m.loop;
      let sim, seed = 1000 + m.loop * 7919;
      for (let k = 0; k < 6; k++) { sim = simulate(seed + k); if (sim.hit && sim.hit.kind === 'hit') break; }
      state.sim = sim;
      // display time → simulation time: real time, except slow motion around the hit
      const th = sim.hit.t;
      state.timeline = { t0: Math.max(0, th - PRE), th };
    }
    const sim = state.sim, tl = state.timeline;
    const d = m.dt;
    let simT;
    if (d < PRE) simT = tl.th - PRE + d;
    else if (d < PRE + (SLOW_BEFORE + SLOW_AFTER) / SLOW) simT = tl.th - SLOW_BEFORE + (d - PRE) * SLOW;
    else simT = tl.th + SLOW_AFTER + (d - PRE - (SLOW_BEFORE + SLOW_AFTER) / SLOW);
    simT = Math.max(0, simT);
    const slow = d >= PRE && d < PRE + (SLOW_BEFORE + SLOW_AFTER) / SLOW;
    const fi = Math.min(sim.track.length - 1, Math.max(0, Math.round(simT / (DT * REC))));
    const hit = sim.hit;
    const after = simT >= hit.t;
    m.ready = true; m.simT = simT; m.t0 = tl.t0; m.slow = slow;

    // ---- drone (whole, before the hit) ----
    const tr = sim.track[fi];
    drone.visible = !after;
    for (const n of Object.keys(PIECES)) {
      const g = pieceGroups[n];
      if (!after) { if (g.parent !== drone) drone.add(g); g.position.set(0, 0, 0); g.quaternion.identity(); }
    }
    if (!after) {
      const fr = frameOf(tr.v, tr.a);
      state.basis.makeBasis(new THREE.Vector3(fr.f.x, fr.f.y, fr.f.z), new THREE.Vector3(fr.u.x, fr.u.y, fr.u.z), new THREE.Vector3(fr.r.x, fr.r.y, fr.r.z));
      drone.quaternion.setFromRotationMatrix(state.basis);
      drone.position.set(tr.p.x, tr.p.y, tr.p.z);
      parts.prop.rotation.x += 0.9;
      parts.exhaust.visible = true;
    }

    // ---- pieces (after the hit) ----
    const bodies = hit.pieces ? hit.pieces.bodies : [];
    const pi = Math.max(0, Math.round((simT - hit.t) / (DT * REC)));
    for (const b of bodies) {
      for (const n of b.names) {
        const g = pieceGroups[n];
        if (after) {
          if (g.parent !== ctx.scene) ctx.scene.add(g);
          const s = b.path[Math.min(b.path.length - 1, pi)];
          // the piece's own part offset, carried by the body's rotation
          state.v3.set(PIECES[n].off.x - b.c.x, PIECES[n].off.y - b.c.y, PIECES[n].off.z - b.c.z).applyQuaternion(s.q);
          g.position.set(s.p.x, s.p.y, s.p.z).add(state.v3);
          g.quaternion.copy(s.q);
          // parts are modelled about the drone's origin; shift so the piece rotates about its own spot
          g.children[0].position.set(-PIECES[n].off.x, -PIECES[n].off.y, -PIECES[n].off.z);
        } else {
          g.children[0].position.set(0, 0, 0);
        }
      }
    }
    if (after) parts.exhaust.visible = !!bodies.find((b) => b.glide && b.names.includes('tail'));

    // ---- gun ----
    const aim = sim.gunAim[fi];
    state.turret.rotation.y = Math.atan2(-aim.z, aim.x);
    state.elev.rotation.z = Math.asin(Math.max(-1, Math.min(1, aim.y)));
    let firedNow = 0, fired = 0;
    for (const s of sim.shots) { if (s.t <= simT) { fired++; if (simT - s.t < 1 / 30) firedNow++; } }
    state.flashes.forEach((f, i) => { f.visible = firedNow > 0 && (Math.floor(simT * RATE) % 2 === i || slow); f.scale.setScalar(0.7 + Math.random() * 0.6); });

    // ---- rounds and tracers ----
    tracers.reset(); rounds.reset();
    for (const s of sim.shots) {
      if (s.t > simT || !s.path.length) continue;
      const k = fi - s.path[0].i;
      if (k < 1 || k >= s.path.length) continue;
      const a = s.path[k - 1].p, b = s.path[k].p;
      // interpolate inside the 60 Hz step for smooth slow motion
      const f = clamp01((simT / (DT * REC)) - Math.floor(simT / (DT * REC)));
      const head = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      const tailLen = slow ? 0.12 : 1;
      const tail = { x: head.x - (b.x - a.x) * tailLen * 3, y: head.y - (b.y - a.y) * tailLen * 3, z: head.z - (b.z - a.z) * tailLen * 3 };
      if (s.tracer) tracers.push(tail, head, COL.tracer); else rounds.push(tail, head, COL.round);
    }
    tracers.commit(); rounds.commit();

    // ---- blasts, fragments, dust ----
    const events = hit.pieces ? hit.pieces.events : [];
    const blast = events.filter((e) => e.type === 'blast' && e.t <= simT).pop();
    frags.reset();
    m.blastR = null;
    state.shell.visible = state.fireball.visible = false;
    if (blast) {
      const bt = Math.max(1e-4, simT - blast.t);
      const big = blast.E > 1e7;
      // everything about a blast scales with E^(1/3): the shell, the fireball, how long it lasts
      const sc = Math.cbrt(blast.E / TNT_E);
      const R = 1.03 * ((blast.E * bt * bt) / RHO) ** 0.2;
      if (big && bt < 0.6) { m.blastR = R; m.blastT = bt; }
      // a shock front is nearly invisible: draw it as a faint ripple that fades as it weakens
      state.shell.visible = R < 45 * sc;
      state.shell.position.set(blast.p.x, blast.p.y, blast.p.z); state.shell.scale.setScalar(R);
      state.shell.material.opacity = (big ? 0.14 : 0.07) * (1 - clamp01(R / (45 * sc)));
      state.fireball.visible = bt < 1.2 * sc;
      state.fireball.position.copy(state.shell.position); state.fireball.scale.setScalar(Math.min(11 * sc, (2 + bt * 60) * sc));
      state.fireball.material.opacity = 1 - clamp01(bt / (1.2 * sc));
      const sr = rngOf(Math.floor(blast.t * 1000));
      for (let i = 0; i < blast.frags; i++) {
        const u = sr() * 2 - 1, ph = sr() * 6.283, sq = Math.sqrt(1 - u * u);
        const kd = 0.004 + sr() * 0.01;                     // drag per metre, 2–10 g fragments
        const v0 = GURNEY * (0.7 + 0.3 * sr());
        const s1 = Math.log(1 + kd * v0 * bt) / kd, s0 = Math.log(1 + kd * v0 * Math.max(0, bt - (slow ? 0.004 : 0.03))) / kd;
        if (s1 > 450 || bt > 1.5) continue;
        const dir = V(sq * Math.cos(ph), u, sq * Math.sin(ph));
        frags.push(add(blast.p, mul(dir, s0)), add(blast.p, mul(dir, s1)), COL.frag);
      }
      state.smoke.forEach((s, i) => {
        const sr2 = rngOf(i + 11);
        s.visible = bt > 0.05 && (big || i < 4);
        s.position.set(blast.p.x + (sr2() - 0.5) * 8 * sc, blast.p.y + (sr2() - 0.2) * 6 * sc + bt * 2, blast.p.z + (sr2() - 0.5) * 8 * sc);
        s.scale.setScalar((3 + Math.min(bt, 6) * 2.2 * (0.7 + sr2() * 0.6)) * Math.max(sc, 0.35));
      });
      state.smokeMat.opacity = 0.75 * (1 - clamp01((bt - 4) / 6));
    } else state.smoke.forEach((s) => (s.visible = false));
    frags.commit();
    const dusts = events.filter((e) => e.type === 'dust' && e.t <= simT);
    state.dusts.forEach((mm, i) => {
      const e = dusts[i];
      mm.visible = !!e;
      if (!e) return;
      const age = simT - e.t;
      mm.position.set(e.p.x, 0.4, e.p.z); mm.scale.setScalar(1 + age * 6); mm.material.opacity = Math.max(0, 0.6 - age * 0.25);
    });

    // ---- readouts ----
    m.stage = after ? 'down' : 'approach';
    m.phase = tr.phase;
    const relG = sub(tr.p, GUN);
    m.range = len(relG); m.alt = tr.p.y; m.rounds = fired;
    m.seen = sim.seenAt != null && simT >= sim.seenAt;
    m.firing = fired > 0;
    // live fire-control numbers for the current geometry
    {
      let tt = m.range / V0, lead = relG;
      for (let i = 0; i < 5; i++) { lead = add(relG, mul(tr.v, tt)); tt = (Math.exp(K * len(lead)) - 1) / (K * V0); }
      m.tof = tt; m.lead = Math.acos(Math.max(-1, Math.min(1, dot(norm(lead), norm(relG)))));
      const los = sub(TARGET, tr.p);
      m.Vc = Math.max(0, dot(tr.v, norm(los)));
    }
    m.partName = { nose: 'the nose (warhead)', mid: 'the fuselage', tail: 'the engine', wingL: 'the left wing', wingR: 'the right wing' }[hit.part] || '';
    m.hitRange = hit.range; m.hitAlt = hit.alt; m.hitRounds = hit.rounds;

    // ---- camera director ----
    const cam = ctx.camera;
    const look = state.v3b;
    const hp = hit.at;
    const fov = (deg) => { if (Math.abs(cam.fov - deg) > 0.01) { cam.fov = deg; cam.updateProjectionMatrix(); } };
    if (d < 3.2) {
      // establishing: low beside the gun, its barrels in the foreground, looking out where it's coming from
      const out = norm(V(tr.p.x - GUN.x, 0, tr.p.z - GUN.z));
      const side = V(-out.z, 0, out.x);
      cam.position.set(GUN.x - out.x * 11 + side.x * 6, 3.2, GUN.z - out.z * 11 + side.z * 6);
      look.set(GUN.x + out.x * 400, 40, GUN.z + out.z * 400); fov(40);
    } else if (d < PRE - 2.6) {
      // chase: behind and above the drone, kept level so the ground and tree lines stay in view
      const fh = norm(V(tr.v.x, 0, tr.v.z));
      cam.position.set(tr.p.x - fh.x * 18, tr.p.y + 5, tr.p.z - fh.z * 18);
      look.set(tr.p.x + fh.x * 40, tr.p.y - 9, tr.p.z + fh.z * 40); fov(58);
    } else if (!slow && !after) {
      // gun camera: from the turret, zooming on the target
      cam.position.set(GUN.x - aim.x * 8, GUN.y + 3.5, GUN.z - aim.z * 8);
      look.set(tr.p.x, tr.p.y, tr.p.z);
      fov(Math.max(1.5, Math.min(30, 2 * Math.atan(18 / Math.max(1, m.range)) * 57.3)));
    } else if (slow) {
      // slow motion: orbit the hit
      const ang = (d - PRE) * 0.35 + 0.6;
      const rad = blast ? 55 : 24;
      cam.position.set(hp.x + Math.cos(ang) * rad, hp.y + 7, hp.z + Math.sin(ang) * rad);
      look.set(hp.x, hp.y, hp.z); fov(50);
    } else {
      // the fall: a side view following the heaviest piece down to the ground
      const heavy = bodies.reduce((a, b) => (b.m > a.m ? b : a), bodies[0]);
      const s = heavy.path[Math.min(heavy.path.length - 1, pi)];
      const side = norm(cross(hit.v, V(0, 1, 0)));
      // from above and to the side, so the ground it's falling toward is behind it
      cam.position.set(s.p.x + side.x * 60, s.p.y + 28, s.p.z + side.z * 60);
      look.set(s.p.x, s.p.y - 6, s.p.z); fov(44);
    }
    cam.lookAt(look);
  },

  dispose(ctx, state) {
    state.glow.dispose();
    for (const l of [state.tracers, state.rounds, state.frags]) l.dispose();
    ctx.scene.traverse((o) => { o.geometry?.dispose(); });
  },
};
