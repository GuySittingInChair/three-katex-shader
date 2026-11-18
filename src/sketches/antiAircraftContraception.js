import * as THREE from 'three';
import { phaseOf, clamp01, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption, beat } from '../lib/bit.js';

// Intercept (src/sketches/intercept.js), with the nouns swapped. A giant sperm cell, 6.4 m long and made of
// what sperm is made of (about 1100 kg/m³, so 370 kg), makes a pop-up attack on a giant egg cell. A twin
// 35 mm autocannon defends the egg. The physics is the same physics; only the cast has changed.
//
// The swim. Its flagellum beats a real travelling wave, z = A(x)·sin(k x − ω t), 2.5 m long at 2.2 Hz. In
// water at the scale of a real sperm, Taylor's swimming sheet (1951) gives the speed U = ½ ω k b² ≈ 0.7 m/s
// for this tail. But Taylor's result needs a Reynolds number Re = ρUL/μ much less than 1, and a 6 m cell
// doing 51 m/s through air has Re ≈ 2 × 10⁷. The tail does nothing. It flies by proportional navigation
// like everything else: a = N·V_c·(Ω × v̂), Ω = (r × ṙ)/|r|², N = 3.
//
// The defence, adjustable in Params (from the next attempt): rate of fire, muzzle velocity, spread, crew
// reaction time, and how many hits it takes. Rounds slow by drag (v̇ = −k|v|v + g), fire control leads the
// target by the drag-corrected flight time t = (e^{kd} − 1)/(k v₀), and works from noisy radar fixes
// smoothed by an α–β filter. Hits are tested against a capsule along the cell: head 0.5 m thick, midpiece
// 0.28 m, tail 0.15 m. Each hit is a 35 mm high-explosive burst (≈ 0.6 MJ, Taylor–Sedov front
// R = 1.03(Et²/ρ)^{1/5}, fragments at the Gurney velocity). The last one needed breaks the cell where it
// hit; each piece falls as a rigid body at its own terminal speed √(2mg/ρC_dA), and severed tail sections
// keep beating for a moment.
//
// If it gets through. Contact with the egg starts the real thing an egg does: a wave of calcium release
// sweeps across its surface, a Fisher–KPP front travelling at v = 2√(Dk) (D ≈ 20 μm²/s, k ≈ 1.25 /s, so
// 10 μm/s on a real 0.1 mm egg), and the zona pellucida hardens so nobody else gets in. Here it is scaled
// up 140,000 times, so the wave takes a few seconds to cross.

const G = 9.81;
const DT = 1 / 240;
const REC = 4;
const RHO = 1.2;
const K = 1.6e-4;
const OPEN = 2600;
const SLOW = 0.1;
const PRE = 9, SLOW_BEFORE = 0.2, SLOW_AFTER = 0.85, POST = 8;
const PERIOD = PRE + (SLOW_BEFORE + SLOW_AFTER) / SLOW + POST;
const EGG = { x: 40, y: 7.5, z: -30, r: 7 };
const GUN = { x: 0, y: 3, z: 0 };
const GURNEY = 2700 / Math.sqrt(1.5 + 0.6);
const HE_ROUND = 0.6e6;
// the tail's beat
const WAVE_K = (2 * Math.PI) / 2.5, WAVE_W = 2 * Math.PI * 2.2, TIP_B = 0.2;
const TAYLOR_U = 0.5 * WAVE_W * WAVE_K * TIP_B * TIP_B;

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
function rngOf(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  r.n = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(6.283185 * r());
  return r;
}

// Pieces along the cell (x forward). Masses at 1100 kg/m³; tail sections flutter (large C_dA for their mass).
const ORDER = ['head', 'mid', 'tail1', 'tail2', 'tail3'];
const PIECES = {
  head: { m: 185, cda: 0.25, off: V(2.35, 0, 0), x0: 1.9, x1: 2.85 },
  mid: { m: 100, cda: 0.2, off: V(1.35, 0, 0), x0: 0.85, x1: 1.9 },
  tail1: { m: 30, cda: 0.45, off: V(0.1, 0, 0), x0: -0.65, x1: 0.85 },
  tail2: { m: 30, cda: 0.45, off: V(-1.4, 0, 0), x0: -2.15, x1: -0.65 },
  tail3: { m: 28, cda: 0.4, off: V(-2.9, 0, 0), x0: -3.6, x1: -2.15 },
};
const NAMES = { head: 'the head', mid: 'the midpiece', tail1: 'the tail', tail2: 'the tail', tail3: 'the tail tip' };
const terminal = (pc) => Math.sqrt((2 * pc.m * G) / (RHO * pc.cda));
const thickness = (x) => (x > 1.9 ? 0.5 : x > 0.85 ? 0.28 : 0.15);

function frameOf(v, a) {
  const f = norm(v);
  let right = cross(f, V(0, 1, 0));
  if (len(right) < 1e-3) right = V(0, 0, 1);
  right = norm(right);
  const bank = Math.atan2(dot(a, right), G);
  const up0 = cross(right, f);
  const up = add(mul(up0, Math.cos(bank)), mul(right, -Math.sin(bank)));
  return { f, u: up, r: cross(f, up) };
}
// closest approach of segment p→q to the cell's axis (x from −3.6 to 2.85 in its own frame)
function axisHit(p, q) {
  const ax0 = V(-3.6, 0, 0), ax1 = V(2.85, 0, 0);
  const d1 = sub(q, p), d2 = sub(ax1, ax0), r = sub(p, ax0);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2);
  const den = a * e - b * b;
  let s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  const cp = add(p, mul(d1, s)), ca = add(ax0, mul(d2, t));
  return { dist: len(sub(cp, ca)), x: ca.x, point: cp };
}

// ---------- one attempt, start to finish ----------
function simulate(seed, cfg) {
  const r = rngOf(seed);
  const V0 = cfg.v0, RATE = cfg.rate / 60, SIG = cfg.spread / 1000;
  const az = (r() - 0.5) * 1.2;
  const popAt = 1500 + r() * 400, topAlt = 260 + r() * 140, diveAt = 700 + r() * 250;
  const weaveW = 0.6 + r() * 0.6, weaveA = 4 + r() * 5, delay = cfg.reaction + r() * 2;
  const tgt = V(EGG.x, EGG.y, EGG.z);
  let p = V(EGG.x + Math.sin(az) * 2300, 45, EGG.z - Math.cos(az) * 2300);
  let v = mul(norm(sub(V(tgt.x, p.y, tgt.z), p)), 51);
  let a = V();
  let phase = 'low', seenAt = null, cool = 0, barrel = 0, pEst = null, vEst = V();
  const track = [], shots = [], gunAim = [], hits = [];
  let end = null;
  let aim = norm(sub(p, GUN));
  for (let t = 0, step = 0; t < 80; t += DT, step++) {
    if (!end) {
      const los = sub(tgt, p), hd = Math.hypot(los.x, los.z);
      if (phase === 'low' && hd < popAt) phase = 'climb';
      if (phase === 'climb' && (p.y > topAlt || hd < diveAt)) phase = 'dive';
      let acc;
      if (phase === 'climb') acc = mul(sub(add(mul(norm(V(los.x, 0, los.z)), 45), V(0, 26, 0)), v), 1.2);
      else if (phase === 'dive') {
        const vr = mul(v, -1), Om = mul(cross(los, vr), 1 / dot(los, los)), Vc = -dot(norm(los), vr);
        const terminal = len(los) < 150;   // the last 150 m: pure homing, no weaving
        acc = add(mul(cross(Om, norm(v)), -(terminal ? 4 : 3) * Vc), mul(norm(v), 2.0));
        if (!terminal) {
          acc = add(acc, V(0, -G * 0.35, 0));
          acc = add(acc, mul(norm(cross(v, V(0, 1, 0))), weaveA * Math.sin(weaveW * 6.283 * t)));
        }
      } else acc = V(0, (45 - p.y) * 0.05 - v.y * 0.4, 0);
      const am = len(acc); if (am > 25) acc = mul(acc, 25 / am);
      a = acc;
      v = add(v, mul(a, DT));
      const sp = len(v); if (sp > 75) v = mul(v, 75 / sp);
      p = add(p, mul(v, DT));
      if (len(sub(p, tgt)) < EGG.r + 0.6) {
        const n = norm(sub(p, tgt));
        end = { t, kind: 'reached', p: add(tgt, mul(n, EGG.r)), at: p, n, v, a, rounds: shots.length, hits: hits.length, range: len(sub(p, GUN)) };
      } else if (p.y < 0.5) end = { t, kind: 'crashed', p, at: p, v, a, rounds: shots.length, hits: hits.length, range: len(sub(p, GUN)) };
    }
    const rel = sub(p, GUN), R = len(rel);
    if (!end) {
      if (seenAt === null && p.y > 90) seenAt = t;
      if (seenAt !== null) {
        const meas = add(p, V(r.n() * 0.0015 * R, r.n() * 0.0015 * R, r.n() * 3));
        if (!pEst) { pEst = meas; vEst = mul(norm(sub(GUN, p)), 50); }
        const pred = add(pEst, mul(vEst, DT)), res = sub(meas, pred);
        pEst = add(pred, mul(res, 0.02)); vEst = add(vEst, mul(res, 0.0009 / DT));
        const relE = sub(pEst, GUN);
        let tt = len(relE) / V0, lead = relE;
        for (let i = 0; i < 6; i++) { lead = add(relE, mul(vEst, tt)); tt = (Math.exp(K * len(lead)) - 1) / (K * V0); }
        aim = norm(add(lead, V(0, 0.5 * G * tt * tt, 0)));
      }
    }
    cool -= DT;
    if (seenAt !== null && t > seenAt + delay && R < OPEN && !end && cool <= 0) {
      const e1 = norm(cross(aim, V(0, 1, 0))), e2 = cross(e1, aim);
      const dir = norm(add(aim, add(mul(e1, r.n() * SIG), mul(e2, r.n() * SIG))));
      const side = barrel++ % 2 ? 0.45 : -0.45;
      shots.push({ t, p: add(add(GUN, mul(e1, side)), mul(dir, 3.3)), v: mul(dir, V0), path: [], tracer: shots.length % 3 === 0, alive: true });
      cool = 1 / RATE;
    }
    for (const b of shots) {
      if (!b.alive) continue;
      const p0 = b.p, s = len(b.v);
      b.v = add(b.v, add(mul(b.v, -K * s * DT), V(0, -G * DT, 0)));
      b.p = add(b.p, mul(b.v, DT));
      if (b.p.y < 0 || t - b.t > 5) { b.alive = false; continue; }
      if (end) continue;
      const pPrev = sub(p, mul(v, DT));
      const fr = frameOf(v, a);
      const toL = (w) => V(dot(w, fr.f), dot(w, fr.u), dot(w, fr.r));
      const r0 = toL(sub(p0, pPrev)), r1 = toL(sub(b.p, p));
      const h = axisHit(r0, r1);
      if (h.dist < thickness(h.x)) {
        const part = ORDER.find((n) => h.x >= PIECES[n].x0 && h.x <= PIECES[n].x1) || 'tail3';
        const world = add(p, add(add(mul(fr.f, h.point.x), mul(fr.u, h.point.y)), mul(fr.r, h.point.z)));
        hits.push({ t, p: world, part });
        b.alive = false;
        if (hits.length >= cfg.hits) end = { t, kind: 'hit', p: world, at: p, v, a, fr, part, range: R, alt: p.y, rounds: shots.length, hits: hits.length };
      }
    }
    if (step % REC === 0) {
      track.push({ p, v, a, phase: end ? 'down' : phase });
      gunAim.push(aim);
      for (const b of shots) if (b.alive) b.path.push({ i: track.length - 1, p: b.p });
    }
    if (end && !end.done) { end.done = true; end.pieces = end.kind === 'hit' ? breakUp(end, r) : null; }
    if (end && t > end.t + SLOW_AFTER + POST + 0.5) break;
  }
  if (!end) end = { t: 70, kind: 'crashed', p, at: p, v, a, rounds: shots.length, hits: hits.length, range: 0 };
  return { track, shots, gunAim, hits, end, seenAt, cfg };
}

// The last hit splits the cell where it struck: the parts ahead, the part hit, the parts behind.
function breakUp(hit, r) {
  const fr = hit.fr;
  const toW = (o) => add(add(mul(fr.f, o.x), mul(fr.u, o.y)), mul(fr.r, o.z));
  const i = ORDER.indexOf(hit.part);
  const groups = [ORDER.slice(0, i), [hit.part], ORDER.slice(i + 1)].filter((g) => g.length);
  const events = [];
  const bodies = groups.map((names) => {
    const m = names.reduce((s, n) => s + PIECES[n].m, 0);
    const cda = names.reduce((s, n) => s + PIECES[n].cda, 0);
    const c = mul(names.reduce((s, n) => add(s, mul(PIECES[n].off, PIECES[n].m)), V()), 1 / m);
    const away = norm(add(sub(toW(c), sub(hit.p, hit.at)), V(r.n() * 0.3, r.n() * 0.3 + 0.2, r.n() * 0.3)));
    const tailOnly = names.every((n) => n.startsWith('tail'));
    return {
      names, m, cda, c,
      p: add(hit.at, toW(c)), v: add(hit.v, mul(away, 3 + r() * 8)),
      q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(fr.f.x, fr.f.y, fr.f.z), new THREE.Vector3(fr.u.x, fr.u.y, fr.u.z), new THREE.Vector3(fr.r.x, fr.r.y, fr.r.z))),
      w: new THREE.Vector3(r.n(), r.n(), r.n()).normalize().multiplyScalar(tailOnly ? 6 + r() * 8 : 1.5 + r() * 4),
      landed: false, path: [],
    };
  });
  const dq = new THREE.Quaternion();
  for (let step = 0, t = hit.t; t < hit.t + SLOW_AFTER + POST + 0.5; t += DT, step++) {
    for (const b of bodies) {
      if (!b.landed) {
        const sp = len(b.v);
        b.v = add(b.v, add(V(0, -G * DT, 0), mul(b.v, (-0.5 * RHO * b.cda * sp * DT) / b.m)));
        b.p = add(b.p, mul(b.v, DT));
        const wl = b.w.length();
        if (wl > 1e-6) { dq.setFromAxisAngle(b.w.clone().divideScalar(wl), wl * DT); b.q.premultiply(dq); }
        if (b.p.y <= 0.3) { b.landed = true; b.p = V(b.p.x, 0.3, b.p.z); b.w.multiplyScalar(0); events.push({ t, type: 'dust', p: b.p }); }
      }
      if (step % REC === 0) b.path.push({ p: b.p, q: b.q.clone() });
    }
  }
  return { bodies, events };
}

// ---------- geometry ----------
const SKIN = { color: 0xd6e7ee, emissive: 0x335f78, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.92 };
// A section of flagellum as a tube whose rings follow the beat; rebuilt each frame (a few hundred vertices).
function makeFlagellum(x0, x1, mat) {
  const RINGS = Math.max(8, Math.round((x0 - x1) * 18)), SEG = 10;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(RINGS * SEG * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG;
    idx.push(a, c, b, b, c, d);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const update = (t, amp) => {
    for (let i = 0; i < RINGS; i++) {
      const x = x0 + ((x1 - x0) * i) / (RINGS - 1);
      const s = (0.85 - x) / 4.45;                         // 0 at the midpiece, 1 at the tip
      const A = amp * (0.03 + TIP_B * s);
      const ph = WAVE_K * (0.85 - x) - WAVE_W * t;
      const z = A * Math.sin(ph), dz = -A * WAVE_K * Math.cos(ph) + amp * TIP_B / 4.45 * Math.sin(ph) * -1;
      const nl = Math.hypot(dz, 1), nx = -dz / nl, nz = 1 / nl;
      const rad = 0.09 - 0.07 * s;
      for (let j = 0; j < SEG; j++) {
        const phi = (j / SEG) * Math.PI * 2, cy = Math.cos(phi) * rad, cs = Math.sin(phi) * rad;
        const k = (i * SEG + j) * 3;
        pos[k] = x + nx * cs; pos[k + 1] = cy; pos[k + 2] = z + nz * cs;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  update(0, 1);
  return { mesh, update };
}
function spermParts() {
  const skin = new THREE.MeshStandardMaterial(SKIN);
  const acro = new THREE.MeshStandardMaterial({ ...SKIN, color: 0xeaf6ff, emissive: 0x7fd0ff, emissiveIntensity: 1.4, opacity: 0.8 });
  const mito = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.1, 0.4) });
  // each piece is an outer group (placed in the world) around one inner group (shifted so it turns about its own spot)
  const wrap = (...meshes) => { const outer = new THREE.Group(), inner = new THREE.Group(); inner.add(...meshes); outer.add(inner); return outer; };
  const h = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skin); h.scale.set(0.47, 0.3, 0.37); h.position.x = 2.35;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), acro);
  cap.rotation.z = -Math.PI / 2; cap.scale.set(0.33, 0.49, 0.39); cap.position.x = 2.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.05, 20).rotateZ(-Math.PI / 2).translate(1.37, 0, 0), skin);
  // the mitochondrial sheath: a helix wound round the midpiece
  const helix = new THREE.Curve();
  helix.getPoint = (u, out = new THREE.Vector3()) => out.set(0.88 + u * 0.98, Math.cos(u * 6.283 * 9) * 0.185, Math.sin(u * 6.283 * 9) * 0.185);
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(helix, 360, 0.025, 6, false), mito);
  const tails = {
    tail1: makeFlagellum(0.85, -0.65, skin),
    tail2: makeFlagellum(-0.65, -2.15, skin),
    tail3: makeFlagellum(-2.15, -3.6, skin),
  };
  const groups = { head: wrap(h, cap), mid: wrap(body, sheath) };
  for (const n of ['tail1', 'tail2', 'tail3']) groups[n] = wrap(tails[n].mesh);
  return { groups, tails, mats: [skin, acro, mito] };
}

const COL = { tracer: new THREE.Color(6, 2.6, 0.8), round: new THREE.Color(0.9, 0.5, 0.2), frag: new THREE.Color(3, 2, 1) };

export default {
  name: 'Anti-Aircraft Contraception',
  description:
    'A giant sperm cell makes a pop-up attack on a giant egg, and a twin 35 mm autocannon defends it. ' +
    'Proportional navigation, drag-corrected lead, rigid-body breakup. Turn the defence down in Params and ' +
    'sometimes it gets through, and the egg’s calcium wave sweeps across it.',
  tags: ['physics', 'ballistics', 'proportional navigation', 'biology', 'fisher wave', 'humor', 'glow'],
  category: 'Physics',

  mode: '3d',

  motion(t) {
    return { loop: Math.floor(t / PERIOD), dt: phaseOf(t, PERIOD) * PERIOD };
  },

  latex: (params, hl, m) => {
    if (!m.ready) return '\\text{Simulating the attempt…}';
    const tally = `\\text{so far: shot down } ${hl(m.down, 0)},\\ \\text{fertilized } ${hl(m.fert, 0)}`;
    let l1, l2, l3, line;
    if (m.stage === 'approach') {
      l1 = m.phase === 'low'
        ? `U = \\tfrac12\\omega k b^2 = ${hl(TAYLOR_U, 2)}\\,\\text{m/s (Taylor, for } Re \\ll 1),\\ \\ Re = \\tfrac{\\rho U L}{\\mu} = ${hl(m.Re / 1e7, 1)}\\times10^{7}`
        : `\\mathbf a = N V_c\\,\\boldsymbol\\Omega \\times \\hat{\\mathbf v},\\ \\ \\boldsymbol\\Omega = \\frac{\\mathbf r \\times \\dot{\\mathbf r}}{|\\mathbf r|^2},\\ \\ N = 3,\\ V_c = ${hl(m.Vc, 0)}\\,\\text{m/s}`;
      l2 = m.firing
        ? `|\\hat{\\mathbf r} + \\hat{\\mathbf v}t| = \\bar v\\,t,\\ \\ t = \\frac{e^{kd}-1}{k v_0} = ${hl(m.tof, 2)}\\,\\text{s},\\ \\ \\text{lead } ${hl(m.lead * 1000, 0)}\\,\\text{mrad}`
        : `\\text{range } ${hl(m.range, 0)}\\,\\text{m},\\ \\text{altitude } ${hl(m.alt, 0)}\\,\\text{m}${m.seen ? ',\\ \\text{tracking}' : ''}`;
      l3 = `v_0 = ${hl(m.cfg.v0, 0)}\\,\\text{m/s},\\ ${hl(m.rounds, 0)}\\ \\text{rounds},\\ ${hl(m.hits, 0)}/${m.cfg.hits}\\ \\text{hits};\\ \\ ${tally}`;
      line = m.phase === 'low'
        ? (m.Re > 0 ? 'The tail is beating. In air, at this size, it achieves nothing.' : '')
        : m.firing ? 'Fire control leads the target by its predicted flight time.' : m.seen ? 'Tracked. Identifying, slewing the turret.' : 'A pop-up attack: low, then climb, then dive.';
    } else if (m.stage === 'reached') {
      l1 = `\\text{contact, after } ${hl(m.endRounds, 0)}\\ \\text{rounds and } ${hl(m.endHits, 0)}\\ \\text{hit${m.endHits === 1 ? '' : 's'}}`;
      l2 = `v = 2\\sqrt{Dk} = 10\\,\\mu\\text{m/s}\\ \\ (D = 20\\,\\mu\\text{m}^2/\\text{s},\\ k = 1.25\\,\\text{s}^{-1}),\\ \\text{here scaled } \\times 1.4\\times10^{5}`;
      l3 = tally;
      line = m.slow ? 'Slow motion, 10% speed.' : m.waveFrac < 1 ? 'Fertilized. The calcium wave crosses the egg and the zona hardens.' : 'No one else is getting in.';
    } else if (m.stage === 'crashed') {
      l1 = '\\text{it hit the ground short of the egg}'; l2 = '\\text{proportional navigation, but the dive ran out of height}'; l3 = tally; line = 'It happens.';
    } else {
      l1 = `\\text{stopped: ${NAMES[m.part]}, at } ${hl(m.endRange, 0)}\\,\\text{m},\\ ${hl(m.endAlt, 0)}\\,\\text{m up, ${m.endHits} hit${m.endHits === 1 ? '' : 's'}, } ${hl(m.endRounds, 0)}\\ \\text{rounds}`;
      l2 = `\\dot{\\mathbf v} = \\mathbf g - \\frac{\\rho C_d A}{2m}|\\mathbf v|\\mathbf v,\\ \\ v_t = \\sqrt{\\frac{2mg}{\\rho C_d A}}:\\ \\text{head } ${hl(terminal(PIECES.head), 0)},\\ \\text{tail } ${hl(terminal(PIECES.tail2), 0)}\\,\\text{m/s}`;
      l3 = tally;
      line = m.slow ? 'Slow motion, 10% speed.' : 'The severed tail keeps beating for a while. It still achieves nothing.';
    }
    return '\\begin{aligned}' + `& ${l1} \\\\ & ${l2} \\\\ & ${l3} \\\\ & ${caption(line)}` + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0.2, max: 3 },
    rate: { value: 1100, min: 300, max: 2200, step: 50 },        // rounds/min, both barrels
    muzzle: { value: 1175, min: 400, max: 1400, step: 25 },       // m/s
    spread: { value: 1.2, min: 0.3, max: 8, step: 0.1 },          // mrad
    reaction: { value: 4, min: 0, max: 15, step: 0.5 },           // s from first track to opening fire
    hits: { value: 1, min: 1, max: 6, step: 1 },                  // hits needed to stop it
    glow: { value: 1, min: 0, max: 2 },
  },

  setup(ctx) {
    const { scene } = ctx;
    scene.background = new THREE.Color(0x03060b);
    scene.fog = new THREE.FogExp2(0x060b12, 0.00028);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD;
        void main() {
          float h = max(vD.y, 0.0);
          vec3 c = mix(vec3(0.07, 0.11, 0.17), vec3(0.008, 0.015, 0.035), pow(h, 0.45));
          float m = max(dot(normalize(vD), normalize(vec3(-0.55, 0.45, -0.7))), 0.0);
          c += vec3(0.5, 0.6, 0.8) * (pow(m, 900.0) * 30.0 + pow(m, 30.0) * 0.08);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.renderOrder = -1; scene.add(sky);
    const glow = createGlow(ctx, { fov: 50, strength: 0.9, threshold: 0.8, exposure: 1.1, vignette: 0.6 });
    ctx.camera.near = 0.3; ctx.camera.far = 20000; ctx.camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight(0x51607a, 0x0a0806, 0.8));
    const moon = new THREE.DirectionalLight(0xbfd2ff, 1.3); moon.position.set(-600, 900, 400); scene.add(moon);

    const groundGeo = new THREE.PlaneGeometry(12000, 12000, 200, 200).rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i), d = Math.hypot(x, z);
      gp.setY(i, smooth((d - 400) / 1500) * (14 * Math.sin(x * 0.0021) * Math.cos(z * 0.0017) + 9 * Math.sin((x + z) * 0.0043)));
    }
    groundGeo.computeVertexNormals();
    scene.add(new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({
      uniforms: { uFog: { value: new THREE.Color(0x060b12) } },
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; varying vec3 vN; uniform vec3 uFog;
        void main() {
          vec2 g = abs(fract(vW.xz / 100.0 - 0.5) - 0.5) / fwidth(vW.xz / 100.0);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float shade = 0.5 + 0.5 * max(dot(normalize(vN), normalize(vec3(-0.5, 0.8, 0.3))), 0.0);
          vec3 c = vec3(0.012, 0.02, 0.026) * shade + vec3(0.05, 0.16, 0.2) * line * 0.6;
          c = mix(c, uFog, 1.0 - exp(-length(vW - cameraPosition) * 0.00028));
          gl_FragColor = vec4(c, 1.0);
        }`,
      extensions: { derivatives: true },
    })));
    {
      const r = rngOf(77);
      const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 16, 6).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 }), 2600);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < 2600; i++) {
        const row = Math.floor(r() * 9), dist = 600 + row * 300 + r() * 30, along = (r() - 0.5) * 2600;
        p.set(along, 0, -dist); const sc = 0.7 + r() * 0.7; s.set(sc, sc, sc); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
        mtx.compose(p, q, s); trees.setMatrixAt(i, mtx);
      }
      scene.add(trees);
    }

    // the gun
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
    gun.add(turret); scene.add(gun);

    // The egg: cytoplasm with the calcium wave, the zona pellucida around it, corona cells around that.
    const eggU = { uDir: { value: new THREE.Vector3(0, 1, 0) }, uFront: { value: -1 }, uZona: { value: 0 }, uTime: { value: 0 } };
    const egg = new THREE.Mesh(new THREE.SphereGeometry(EGG.r, 64, 40), new THREE.ShaderMaterial({
      uniforms: eggU, transparent: true,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uDir; uniform float uFront, uTime;
        void main() {
          float fres = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
          vec3 rest = vec3(0.55, 0.32, 0.36) * (0.25 + 0.9 * fres);
          float grain = 0.5 + 0.5 * sin(vN.x * 40.0 + uTime * 0.6) * sin(vN.y * 37.0) * sin(vN.z * 43.0);
          rest += vec3(0.12, 0.05, 0.06) * grain;
          vec3 c = rest;
          if (uFront >= 0.0) {
            float th = acos(clamp(dot(vN, uDir), -1.0, 1.0));       // angle from where it touched
            float behind = 1.0 - smoothstep(uFront - 0.02, uFront + 0.02, th);
            float edge = exp(-pow((th - uFront) / 0.08, 2.0));
            c = mix(c, vec3(0.25, 0.75, 0.95) * (0.4 + 0.8 * fres), behind * 0.85) + vec3(1.2, 2.2, 2.6) * edge;
          }
          gl_FragColor = vec4(c, 0.92);
        }`,
    }));
    egg.position.set(EGG.x, EGG.y, EGG.z);
    const zona = new THREE.Mesh(new THREE.SphereGeometry(EGG.r * 1.14, 48, 32), new THREE.ShaderMaterial({
      uniforms: eggU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform float uZona;
        void main() {
          float fres = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
          vec3 c = mix(vec3(0.35, 0.5, 0.6), vec3(1.4, 1.6, 1.8), uZona) * fres;
          gl_FragColor = vec4(c, fres * (0.35 + 0.5 * uZona));
        }`,
    }));
    zona.position.copy(egg.position);
    const corona = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: 0x9a7d6a, emissive: 0x2a1810, roughness: 0.8, transparent: true, opacity: 0.85 }), 220);
    {
      const r = rngOf(5), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < 220; i++) {
        const u = r() * 2 - 1, ph = r() * 6.283, sq = Math.sqrt(1 - u * u), rad = EGG.r * (1.25 + r() * 0.35);
        p.set(EGG.x + sq * Math.cos(ph) * rad, EGG.y + u * rad, EGG.z + sq * Math.sin(ph) * rad);
        const sc = 0.7 + r() * 0.8; s.set(sc, sc * 0.8, sc); q.setFromAxisAngle(new THREE.Vector3(r(), r(), r()).normalize(), r() * 6);
        mtx.compose(p, q, s); corona.setMatrixAt(i, mtx);
      }
    }
    scene.add(egg, zona, corona);

    const parts = spermParts();
    const cell = new THREE.Group();
    scene.add(cell);

    const tracers = createFatLines({ maxSegments: 500, width: 2.2 });
    const rounds = createFatLines({ maxSegments: 500, width: 1.0 });
    const frags = createFatLines({ maxSegments: 200, width: 1.4 });
    scene.add(tracers.object, rounds.object, frags.object);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.5, 1.8), transparent: true, opacity: 0.1, wireframe: true, depthWrite: false }));
    const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.5, 0.8), transparent: true, depthWrite: false }));
    const puffMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, transparent: true, depthWrite: false });
    const puffs = Array.from({ length: 4 }, () => new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), puffMat));
    scene.add(shell, fireball, ...puffs);
    const dusts = Array.from({ length: 5 }, () => { const mm = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b5c45, transparent: true, depthWrite: false })); scene.add(mm); return mm; });

    return {
      glow, turret, elev, flashes, egg, zona, eggU, parts, cell, tracers, rounds, frags, shell, fireball, puffs, puffMat, dusts,
      sim: null, loop: -1, tally: { down: 0, fert: 0 }, counted: -1, v3: new THREE.Vector3(), look: new THREE.Vector3(), basis: new THREE.Matrix4(),
    };
  },

  update(ctx, state) {
    const m = ctx.motion, P = ctx.params;
    const { tracers, rounds, frags, parts, cell } = state;
    const { width, height } = ctx.size;
    for (const l of [tracers, rounds, frags]) l.setResolution(width, height);
    state.glow.strength = 0.9 * P.glow;

    if (state.loop !== m.loop) {
      // count the attempt that just finished, then run the next one with the current settings
      if (state.sim && state.counted !== state.loop) {
        state.counted = state.loop;
        if (state.sim.end.kind === 'reached') state.tally.fert++; else state.tally.down++;
      }
      state.loop = m.loop;
      state.sim = simulate(2000 + m.loop * 7919, { rate: P.rate, v0: P.muzzle, spread: P.spread, reaction: P.reaction, hits: Math.round(P.hits) });
    }
    const sim = state.sim, end = sim.end;
    const d = m.dt;
    const slowLen = (SLOW_BEFORE + SLOW_AFTER) / SLOW;
    let simT = d < PRE ? end.t - PRE + d : d < PRE + slowLen ? end.t - SLOW_BEFORE + (d - PRE) * SLOW : end.t + SLOW_AFTER + (d - PRE - slowLen);
    simT = Math.max(0, simT);
    const slow = d >= PRE && d < PRE + slowLen;
    const fi = Math.min(sim.track.length - 1, Math.max(0, Math.round(simT / (DT * REC))));
    const after = simT >= end.t;
    const tr = sim.track[fi];
    m.ready = true; m.slow = slow; m.cfg = sim.cfg; m.down = state.tally.down; m.fert = state.tally.fert;

    // ---- the cell ----
    const g = parts.groups;
    const broken = after && end.kind === 'hit';
    cell.visible = !broken && !(after && end.kind === 'crashed');
    if (!broken) {
      for (const n of ORDER) { if (g[n].parent !== cell) cell.add(g[n]); g[n].position.set(0, 0, 0); g[n].quaternion.identity(); g[n].children[0].position.set(0, 0, 0); }
      const fr = frameOf(tr.v, tr.a);
      state.basis.makeBasis(new THREE.Vector3(fr.f.x, fr.f.y, fr.f.z), new THREE.Vector3(fr.u.x, fr.u.y, fr.u.z), new THREE.Vector3(fr.r.x, fr.r.y, fr.r.z));
      cell.quaternion.setFromRotationMatrix(state.basis);
      if (after && end.kind === 'reached') {
        // head against the egg, nose in, tail still beating
        const n = end.n;
        cell.position.set(end.p.x + n.x * 2.6, end.p.y + n.y * 2.6, end.p.z + n.z * 2.6);
        cell.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-n.x, -n.y, -n.z));
      } else cell.position.set(tr.p.x, tr.p.y, tr.p.z);
      const beat = after && end.kind === 'reached' ? Math.exp(-(simT - end.t) / 4) : 1;
      for (const n of ['tail1', 'tail2', 'tail3']) parts.tails[n].update(simT, beat);
    } else {
      const bodies = end.pieces.bodies;
      const pi = Math.max(0, Math.round((simT - end.t) / (DT * REC)));
      for (const b of bodies) {
        const s = b.path[Math.min(b.path.length - 1, pi)];
        for (const n of b.names) {
          const grp = g[n];
          if (grp.parent !== ctx.scene) ctx.scene.add(grp);
          state.v3.set(PIECES[n].off.x - b.c.x, PIECES[n].off.y - b.c.y, PIECES[n].off.z - b.c.z).applyQuaternion(s.q);
          grp.position.set(s.p.x, s.p.y, s.p.z).add(state.v3);
          grp.quaternion.copy(s.q);
          grp.children[0].position.set(-PIECES[n].off.x, -PIECES[n].off.y, -PIECES[n].off.z);
          if (parts.tails[n]) parts.tails[n].update(simT, Math.exp(-(simT - end.t) / 2.5));   // still beating, uselessly
        }
      }
    }

    // ---- the egg ----
    const eu = state.eggU;
    eu.uTime.value = ctx.time;
    if (after && end.kind === 'reached') {
      const age = simT - end.t;
      eu.uDir.value.set(end.n.x, end.n.y, end.n.z);
      eu.uFront.value = Math.min(Math.PI + 0.1, age * 0.55);   // the Fisher front's angle round the egg
      eu.uZona.value = clamp01((age - 1.5) / 4);
      m.waveFrac = eu.uFront.value / Math.PI;
    } else { eu.uFront.value = -1; eu.uZona.value = 0; m.waveFrac = 0; }

    // ---- gun, rounds, tracers ----
    const aim = sim.gunAim[fi];
    state.turret.rotation.y = Math.atan2(-aim.z, aim.x);
    state.elev.rotation.z = Math.asin(Math.max(-1, Math.min(1, aim.y)));
    let fired = 0, recent = 0;
    for (const s of sim.shots) if (s.t <= simT) { fired++; if (simT - s.t < 1 / 30) recent++; }
    state.flashes.forEach((f, i) => { f.visible = recent > 0 && (Math.floor(simT * 18) % 2 === i || slow); });
    tracers.reset(); rounds.reset();
    const frac = clamp01(simT / (DT * REC) - Math.floor(simT / (DT * REC)));
    for (const s of sim.shots) {
      if (s.t > simT || !s.path.length) continue;
      const k = fi - s.path[0].i;
      if (k < 1 || k >= s.path.length) continue;
      const a = s.path[k - 1].p, b = s.path[k].p;
      const head = V(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac, a.z + (b.z - a.z) * frac);
      const L = slow ? 0.36 : 3;
      const tail = V(head.x - (b.x - a.x) * L, head.y - (b.y - a.y) * L, head.z - (b.z - a.z) * L);
      if (s.tracer) tracers.push(tail, head, COL.tracer); else rounds.push(tail, head, COL.round);
    }
    tracers.commit(); rounds.commit();

    // ---- the most recent 35 mm burst ----
    const burst = sim.hits.filter((h) => h.t <= simT).pop();
    frags.reset();
    state.shell.visible = state.fireball.visible = false;
    state.puffs.forEach((p) => (p.visible = false));
    if (burst && simT - burst.t < 6) {
      const bt = Math.max(1e-4, simT - burst.t);
      const R = 1.03 * ((HE_ROUND * bt * bt) / RHO) ** 0.2;
      state.shell.visible = R < 9; state.shell.position.set(burst.p.x, burst.p.y, burst.p.z); state.shell.scale.setScalar(R);
      state.shell.material.opacity = 0.08 * (1 - clamp01(R / 9));
      state.fireball.visible = bt < 0.25; state.fireball.position.copy(state.shell.position);
      state.fireball.scale.setScalar(0.4 + bt * 10); state.fireball.material.opacity = 1 - clamp01(bt / 0.25);
      const sr = rngOf(Math.floor(burst.t * 1000));
      for (let i = 0; i < 90; i++) {
        const u = sr() * 2 - 1, ph = sr() * 6.283, sq = Math.sqrt(1 - u * u), kd = 0.01 + sr() * 0.02, v0 = GURNEY * (0.6 + 0.4 * sr());
        const s1 = Math.log(1 + kd * v0 * bt) / kd, s0 = Math.log(1 + kd * v0 * Math.max(0, bt - (slow ? 0.004 : 0.03))) / kd;
        if (bt > 0.6) continue;
        const dir = V(sq * Math.cos(ph), u, sq * Math.sin(ph));
        frags.push(add(burst.p, mul(dir, s0)), add(burst.p, mul(dir, s1)), COL.frag);
      }
      state.puffs.forEach((p, i) => {
        const r2 = rngOf(i + 3);
        p.visible = bt > 0.03;
        p.position.set(burst.p.x + (r2() - 0.5) * 2, burst.p.y + (r2() - 0.3) * 1.5 + bt * 0.8, burst.p.z + (r2() - 0.5) * 2);
        p.scale.setScalar(0.8 + Math.min(bt, 5) * 0.7);
      });
      state.puffMat.opacity = 0.7 * (1 - clamp01((bt - 2) / 4));
    }
    frags.commit();
    const dusts = end.pieces ? end.pieces.events.filter((e) => e.t <= simT) : [];
    state.dusts.forEach((mm, i) => {
      const e = dusts[i]; mm.visible = !!e; if (!e) return;
      const age = simT - e.t; mm.position.set(e.p.x, 0.4, e.p.z); mm.scale.setScalar(1 + age * 5); mm.material.opacity = Math.max(0, 0.6 - age * 0.25);
    });

    // ---- readouts ----
    m.stage = !after ? 'approach' : end.kind === 'hit' ? 'down' : end.kind;
    m.phase = tr.phase;
    const relG = sub(tr.p, GUN);
    m.range = len(relG); m.alt = tr.p.y; m.rounds = fired; m.hits = sim.hits.filter((h) => h.t <= simT).length;
    m.seen = sim.seenAt != null && simT >= sim.seenAt; m.firing = fired > 0;
    let tt = m.range / sim.cfg.v0, lead = relG;
    for (let i = 0; i < 5; i++) { lead = add(relG, mul(tr.v, tt)); tt = (Math.exp(K * len(lead)) - 1) / (K * sim.cfg.v0); }
    m.tof = tt; m.lead = Math.acos(Math.max(-1, Math.min(1, dot(norm(lead), norm(relG)))));
    m.Vc = Math.max(0, dot(tr.v, norm(sub(V(EGG.x, EGG.y, EGG.z), tr.p))));
    m.Re = (RHO * len(tr.v) * 6.45) / 1.8e-5;
    m.part = end.part; m.endRange = end.range; m.endAlt = end.alt ?? end.p.y; m.endRounds = end.rounds; m.endHits = end.hits;

    // ---- camera director ----
    const cam = ctx.camera, look = state.look;
    const fov = (deg) => { if (Math.abs(cam.fov - deg) > 0.01) { cam.fov = deg; cam.updateProjectionMatrix(); } };
    if (d < 3.2) {
      // beside the egg and the gun, looking out where it's coming from
      const out = norm(V(tr.p.x - EGG.x, 0, tr.p.z - EGG.z)), side = V(-out.z, 0, out.x);
      cam.position.set(EGG.x - out.x * 30 + side.x * 14, 6, EGG.z - out.z * 30 + side.z * 14);
      look.set(EGG.x + out.x * 400, 40, EGG.z + out.z * 400); fov(42);
    } else if (d < PRE - 2.6) {
      // chase: behind and above, kept level; the tail beats in front of the lens
      const fh = norm(V(tr.v.x, 0, tr.v.z));
      cam.position.set(tr.p.x - fh.x * 14, tr.p.y + 4, tr.p.z - fh.z * 14);
      look.set(tr.p.x + fh.x * 40, tr.p.y - 8, tr.p.z + fh.z * 40); fov(58);
    } else if (!slow && !after) {
      cam.position.set(GUN.x - aim.x * 8, GUN.y + 3.5, GUN.z - aim.z * 8);
      look.set(tr.p.x, tr.p.y, tr.p.z);
      fov(Math.max(1.5, Math.min(30, 2 * Math.atan(18 / Math.max(1, m.range)) * 57.3)));
    } else if (end.kind === 'reached') {
      // round the egg: the contact point first, then the wave
      const c = V(EGG.x, EGG.y, EGG.z), n = end.n;
      const ang = (d - PRE) * 0.12;
      const radius = slow ? 26 : 40;
      const base = Math.atan2(n.z, n.x) + 0.7;
      cam.position.set(c.x + Math.cos(base + ang) * radius, c.y + 9 + n.y * 10, c.z + Math.sin(base + ang) * radius);
      look.set(slow ? end.p.x : c.x, slow ? end.p.y : c.y, slow ? end.p.z : c.z); fov(48);
    } else if (slow || !end.pieces) {
      const hp = end.at, ang = (d - PRE) * 0.35 + 0.6;
      cam.position.set(hp.x + Math.cos(ang) * 22, hp.y + 6, hp.z + Math.sin(ang) * 22);
      look.set(hp.x, hp.y, hp.z); fov(50);
    } else {
      const heavy = end.pieces.bodies.reduce((a, b) => (b.m > a.m ? b : a));
      const s = heavy.path[Math.min(heavy.path.length - 1, Math.max(0, Math.round((simT - end.t) / (DT * REC))))];
      const side = norm(cross(end.v, V(0, 1, 0)));
      cam.position.set(s.p.x + side.x * 55, s.p.y + 24, s.p.z + side.z * 55);
      look.set(s.p.x, s.p.y - 5, s.p.z); fov(44);
    }
    cam.lookAt(look);
  },

  dispose(ctx, state) {
    state.glow.dispose();
    for (const l of [state.tracers, state.rounds, state.frags]) l.dispose();
    ctx.scene.traverse((o) => { o.geometry?.dispose(); });
  },
};
