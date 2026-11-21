// Ring and shell galaxies: the collision that most likely made each shape, chosen automatically, the way
// fit_pairs.mjs chooses the orbits of Arp's pairs, and with the same simulation (src/lib/galaxy/encounterSim.js).
//
// RINGS (Lynds & Toomre 1976; Appleton & Struck-Marcell 1996): a smaller galaxy drops through a disk near its centre.
//   Its pull, sudden and inward, makes every star's orbit swing in and then out together, and the outswing travels
//   outwards as a ring. Measured (tools/motion/build_shapes.py): the ring's size and shape on a deep image, and, where
//   one is visible, the companion's position and light. Searched for: the companion's distance along our line of sight
//   and its 3D velocity today (so when and where it went through), its mass (around what its light suggests), and the
//   disk's tilt (near what the ring's shape suggests). Kept: orbits that passed through the inner disk (closer than
//   0.45 × the ring's radius) at a steep angle, 20–600 Myr ago, once.
// SHELLS (Quinn 1984; Hernquist & Quinn 1988): a small galaxy falls almost straight through a big elliptical and is torn
//   apart. Its stars swing back and forth through the centre, each with its own period, and pile up at their turning
//   points: arcs at growing radii, alternating sides. Searched for: the direction of the plunge, how deep and how
//   long ago it was, how far out it fell from and how much light the debris has.
//
// Scored against the image as the pairs are, by the correlation of log brightness:
//   rings: model vs photo inside 1.5 × the ring (not the nucleus, not the companion); baseline: the same disk undisturbed;
//   shells: (photo ÷ its smooth version) vs (model ÷ the same smooth version), beyond 0.6 r½; check: the same debris
//   turned by 90°, and a dozen random plunges.
// node tools/galaxies/fit_shapes.mjs [shapes.json] [tags…]  →  public/data/pairs/shapes.json
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runEncounter, halo, positionsAt, rng, G as GRAV, KMS } from '../../src/lib/galaxy/encounterSim.js';

const GR = 64;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** the relative orbit, exactly as encounterSim integrates it without friction; returns samples every `every` Myr */
function relOrbit(main, comp, p0, v0kms, T, dt = 1, every = 1) {
  let p = p0.slice(), v = v0kms.map((x) => x * KMS);
  const sgn = Math.sign(T) || 1, h = sgn * dt, n = Math.round(Math.abs(T) / dt), out = [{ t: 0, p: p.slice(), v: v.slice() }];
  const acc = (q) => { const r = Math.hypot(...q); if (r < 0.6) return [0, 0, 0]; const Mr = main.M(r) + comp.M(r); return q.map((x) => (-GRAV * Mr * x) / r ** 3); };
  for (let i = 1; i <= n; i++) {
    let a = acc(p); for (let k = 0; k < 3; k++) v[k] += 0.5 * h * a[k];
    for (let k = 0; k < 3; k++) p[k] += h * v[k];
    a = acc(p); for (let k = 0; k < 3; k++) v[k] += 0.5 * h * a[k];
    if (Math.hypot(...p) < 0.6) return { merged: true, out };
    if (i % every === 0) out.push({ t: i * h, p: p.slice(), v: v.slice() });
  }
  return { merged: false, out, p, v: v.map((x) => x / KMS) };
}

function fit(T, log) {
  const R = rng(7000 + [...T.tag].reduce((a, c) => a + c.charCodeAt(0), 0));
  const half = T.half, photo = Float64Array.from(T.grid), floor = 0.01;
  const cell = (x, y) => { const a = Math.floor(((x + half) / (2 * half)) * GR), b = Math.floor(((y + half) / (2 * half)) * GR); return a >= 0 && a < GR && b >= 0 && b < GR ? b * GR + a : -1; };
  const xy = (k) => [(((k % GR) + 0.5) / GR) * 2 * half - half, ((Math.floor(k / GR) + 0.5) / GR) * 2 * half - half];
  const blur = (H) => { const O = new Float64Array(GR * GR); for (let j = 0; j < GR; j++) for (let i = 0; i < GR; i++) { let s = 0, c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && a < GR && b >= 0 && b < GR) { s += H[b * GR + a]; c++; } } O[j * GR + i] = s / c; } return O; };
  const corr = (A, B, mask) => {
    let n = 0, ma = 0, mb = 0; for (let k = 0; k < A.length; k++) if (mask[k]) { n++; ma += A[k]; mb += B[k]; }
    ma /= n; mb /= n; let sab = 0, sa = 0, sb = 0;
    for (let k = 0; k < A.length; k++) if (mask[k]) { const a = A[k] - ma, b = B[k] - mb; sab += a * b; sa += a * a; sb += b * b; }
    return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : -1;
  };
  // the star map of a simulation today, centred on the main galaxy; weights per group
  const starMap = (sim, wMain, wComp, rot = 0) => {
    const pos = positionsAt(sim, 0, new Float64Array(sim.n * 3));
    const k = Math.round((0 - sim.t0) / sim.every), c = [sim.cen[k * 6], sim.cen[k * 6 + 1]];
    const H = new Float64Array(GR * GR), cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < sim.n; i++) {
      const x = pos[i * 3] - c[0], y = pos[i * 3 + 1] - c[1], j = cell(x * cr - y * sr, x * sr + y * cr);
      if (j >= 0) H[j] += i < sim.nDisk ? wMain : wComp;
    }
    return blur(H);
  };
  const r3 = (v) => v.map((x) => +x.toFixed(3));
  const base = { tag: T.tag, kind: T.kind, label: T.label, host: T.host, ok: true };

  if (T.kind === 'ring') {
    // ---- the disk and the intruder ----
    const a = T.ringA, rd = 0.45 * a, rmax = 1.45 * a + 2;
    const vM = clamp(200 * Math.sqrt(a / 8), 140, 260);
    const MAIN = halo(vM, 0.6 * rd, Math.max(30, 4 * a));
    const q = T.ringQ, ci = clamp(q, 0.2, 0.99), si = Math.sqrt(1 - ci * ci);
    const normalNear = (flip, spin, jitter) => {
      const c2 = clamp(ci + (R() - 0.5) * jitter, 0.15, 0.995), s2 = Math.sqrt(1 - c2 * c2), ang = T.ringAng + (R() - 0.5) * jitter;
      const mx = -Math.sin(ang), my = Math.cos(ang), s = flip ? -1 : 1, sp = spin ? -1 : 1;
      return [sp * s * s2 * mx, sp * s * s2 * my, sp * c2];
    };
    const hasComp = !!T.compXY, sep = hasComp ? Math.hypot(...T.compXY) : 0;
    const lr = hasComp ? T.lightRatio : 0.3;
    const compFor = (m) => halo(vM * Math.sqrt(m), clamp(0.25 * a, 0.8, 3), Math.max(30, 4 * a));
    // photo: log brightness; mask: inside 1.5 a, outside the nucleus and the companion
    const P = photo.map((v) => Math.log(Math.max(v, 0) + floor));
    const mask = new Uint8Array(GR * GR);
    for (let k = 0; k < GR * GR; k++) {
      const [x, y] = xy(k), r = Math.hypot(x, y);
      const nearComp = hasComp && Math.hypot(x - T.compXY[0], y - T.compXY[1]) < Math.max(0.3 * sep, 0.35 * a);
      mask[k] = photo[k] >= 0 && r < 1.5 * a && r > 0.15 * a && !nearComp ? 1 : 0;
    }
    const logImg = (H) => { let mx = 0; for (const v of H) mx = Math.max(mx, v); return H.map((v) => Math.log(v / mx + floor)); };
    const scoreSim = (sim) => corr(logImg(starMap(sim, 1 / Math.max(1, sim.nDisk), lr / Math.max(1, sim.nComp))), P, mask);
    // ---- 1. orbits: today's companion where it is seen (or anywhere nearby, for the Cartwheel), going back in time
    //      through the inner disk once, steeply, 20–600 Myr ago ----
    const orbits = []; let tried = 0;
    for (let k = 0; k < 20000 && orbits.length < 140; k++) {
      tried++;
      const m = clamp(lr * 10 ** ((R() - 0.5) * 0.8), 0.08, 1.5) * (hasComp ? 1 : 1);
      const COMP = compFor(hasComp ? m : 0.1 + 0.5 * R());
      let pos;
      if (hasComp) pos = [T.compXY[0], T.compXY[1], (R() * 2 - 1) * 2.5 * sep];
      else { const d = a * (1.5 + 6 * R()), z = R() * 2 - 1, ph = R() * 2 * Math.PI, s = Math.sqrt(1 - z * z); pos = [d * s * Math.cos(ph), d * s * Math.sin(ph), d * z]; }
      const r = Math.hypot(...pos), vesc = Math.sqrt((2 * GRAV * (MAIN.M(r) + COMP.M(r))) / r) / KMS;
      // moving away from the disk today (it has been through): a random direction in the outward hemisphere
      let dir; do { const z = R() * 2 - 1, ph = R() * 2 * Math.PI, s = Math.sqrt(1 - z * z); dir = [s * Math.cos(ph), s * Math.sin(ph), z]; } while (dir[0] * pos[0] + dir[1] * pos[1] + dir[2] * pos[2] < 0.3 * r);
      const sp = vesc * (0.6 + 0.9 * R()), vel = dir.map((x) => x * sp);
      const back = relOrbit(MAIN, COMP, pos, vel, -650, 1, 1);
      if (back.merged) continue;
      let best = null, nClose = 0;
      for (let i = 1; i < back.out.length - 1; i++) {
        const r0 = Math.hypot(...back.out[i - 1].p), r1 = Math.hypot(...back.out[i].p), r2 = Math.hypot(...back.out[i + 1].p);
        if (r1 < r0 && r1 <= r2) { if (r1 < 2 * a) nClose++; if (!best || r1 < best.r) best = { r: r1, t: back.out[i].t, p: back.out[i].p, v: back.out[i].v }; }
      }
      if (!best || best.r > 0.45 * a || best.r < 0.7 || best.t > -20 || best.t < -600 || nClose > 1) continue;
      orbits.push({ pos, vel, m: hasComp ? m : COMP.Mtot / MAIN.Mtot, COMP, impact: best });
    }
    log(`${T.tag}: ${tried} orbits tried, ${orbits.length} went through the inner disk`);
    if (!orbits.length) return { ...base, ok: false, why: `none of ${tried} trial orbits went through the inner disk` };
    // ---- 2. disks of several tilts on each orbit, scored ----
    const T0 = (o) => 20 * Math.round((o.impact.t - 120) / 20);      // a whole number of snapshots, so one falls exactly on today
    const run = (o, n, nStars) => runEncounter({ main: MAIN, comp: o.COMP, compPos: o.pos, compVel: o.vel, t0: T0(o), t1: 0, nDisk: nStars, nComp: Math.round(nStars * 0.25), dt: 1, every: 20, mainDisk: { n, rd, rmax }, compDisk: { n: [0, 0, 1], rd: clamp(0.2 * a, 0.6, 2.5), rmax: clamp(0.6 * a, 2, 7) } });
    // the tilt that makes the ring cross the disk steeply: keep only tilts where the impact is within 45° of the normal
    const steep = (o, n) => { const v = o.impact.v, s = Math.hypot(...v); return Math.abs(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / s > Math.cos(Math.PI / 4); };
    const cands = [];
    for (const o of orbits) {
      let tries = 0;
      for (let j = 0; j < 2 && tries < 30; tries++) {
        const n = normalNear(R() < 0.5, R() < 0.5, 0.25);
        if (!steep(o, n)) continue;
        j++; cands.push({ o, n, s: scoreSim(run(o, n, 1500)) });
      }
    }
    if (!cands.length) return { ...base, ok: false, why: 'no orbit crossed the disk steeply at a tilt the ring allows' };
    cands.sort((x, y) => y.s - x.s);
    const sample = cands.filter((_, j) => j % Math.max(1, Math.floor(cands.length / 12)) === 0).slice(0, 12);
    const control = sample.map((c) => scoreSim(run(c.o, c.n, 4000))).sort((x, y) => x - y);
    // ---- 3. refine the best few ----
    const top = cands.slice(0, 5);
    for (const c of top) for (let it = 0; it < 18; it++) {
      const pos = hasComp ? [T.compXY[0], T.compXY[1], c.o.pos[2] + (R() - 0.5) * 0.3 * sep] : c.o.pos.map((x) => x * (1 + (R() - 0.5) * 0.15));
      const vel = c.o.vel.map((x) => x * (1 + (R() - 0.5) * 0.15));
      const n = (() => { const w = c.n.map((x) => x + (R() - 0.5) * 0.2); const l = Math.hypot(...w); return w.map((x) => x / l); })();
      const back = relOrbit(MAIN, c.o.COMP, pos, vel, -650);
      if (back.merged) continue;
      let best = null, nClose = 0;
      for (let i = 1; i < back.out.length - 1; i++) { const r0 = Math.hypot(...back.out[i - 1].p), r1 = Math.hypot(...back.out[i].p), r2 = Math.hypot(...back.out[i + 1].p); if (r1 < r0 && r1 <= r2) { if (r1 < 2 * a) nClose++; if (!best || r1 < best.r) best = { r: r1, t: back.out[i].t, p: back.out[i].p, v: back.out[i].v }; } }
      if (!best || best.r > 0.45 * a || best.r < 0.7 || best.t > -20 || best.t < -600 || nClose > 1) continue;
      const o = { ...c.o, pos, vel, impact: best };
      if (!steep(o, n)) continue;
      const s = scoreSim(run(o, n, 1500));
      if (s > c.s) Object.assign(c, { o, n, s });
    }
    for (const c of top) c.s2 = scoreSim(run(c.o, c.n, 5000));
    top.sort((x, y) => y.s2 - x.s2);
    const b = top[0];
    // baseline: the same disk, same tilt, nobody passing
    const solo = runEncounter({ main: MAIN, comp: halo(1, 0.5, 0.01), compPos: [500, 0, 0], compVel: [0, 0, 0], t0: -200, t1: 0, nDisk: 5000, nComp: 0, dt: 1, every: 20, mainDisk: { n: b.n, rd, rmax } });
    const baseline = scoreSim(solo);
    const imp = b.o.impact, vimp = Math.hypot(...imp.v) / KMS;
    const tilt = Math.round((Math.acos(Math.abs(imp.v.reduce((s, x, j) => s + x * b.n[j], 0)) / Math.hypot(...imp.v)) * 180) / Math.PI);
    log(`${T.tag}: score ${b.s2.toFixed(3)} (undisturbed disk ${baseline.toFixed(3)}, random sensible orbits ${control[control.length >> 1].toFixed(3)}); through ${imp.r.toFixed(1)} kpc from the centre ${(-imp.t).toFixed(0)} Myr ago at ${vimp.toFixed(0)} km/s, ${tilt}° from the axis; mass ratio ${b.o.m.toFixed(2)}`);
    return {
      ...base, main: { v: +vM.toFixed(1), rc: +(0.6 * rd).toFixed(2), rt: +Math.max(30, 4 * a).toFixed(1) },
      comp: { v: +(vM * Math.sqrt(b.o.COMP.Mtot / MAIN.Mtot)).toFixed(1), rc: +clamp(0.25 * a, 0.8, 3).toFixed(2), rt: +Math.max(30, 4 * a).toFixed(1) },
      mainDisk: { n: r3(b.n), rd: +rd.toFixed(2), rmax: +rmax.toFixed(2) }, compDisk: { n: [0, 0, 1], rd: +clamp(0.2 * a, 0.6, 2.5).toFixed(2), rmax: +clamp(0.6 * a, 2, 7).toFixed(2) },
      compPos: r3(b.o.pos), compVel: b.o.vel.map((x) => +x.toFixed(1)), t0: T0(b.o), t1: 600, lightRatio: +lr.toFixed(3), nCompFrac: 0.25,
      score: +b.s2.toFixed(3), baseline: +baseline.toFixed(3), controlMedian: +control[control.length >> 1].toFixed(3), controlMax: +control[control.length - 1].toFixed(3),
      tried, sensible: orbits.length, simulated: cands.length + top.length * 19 + 12,
      impact: { t: +imp.t.toFixed(0), r: +imp.r.toFixed(1), v: +vimp.toFixed(0), tilt }, massRatio: +(b.o.COMP.Mtot / MAIN.Mtot).toFixed(3), compSeen: hasComp,
      measured: { ringKpc: +a.toFixed(2), ringQ: +q.toFixed(2), compXY: T.compXY?.map((x) => +x.toFixed(2)) ?? null, lightRatio: hasComp ? +T.lightRatio.toFixed(2) : null, mpc: T.mpc, distSrc: T.distSrc, ned: T.nedName, z: T.z, zRef: T.zRef, image: T.image, kpcPerArcmin: +(T.kpcPerPix * 60 / T.pixArcsec).toFixed(3) },
      centreRa: T.centreRa, centreDec: T.centreDec,
    };
  }

  // ---- SHELLS ----
  const re = T.re, vH = clamp(260 * Math.sqrt(re / 10), 180, 330);
  const HOST = halo(vH, clamp(0.08 * re, 0.5, 2), 200);
  const smooth = Float64Array.from(T.smooth);
  let tot = 0; for (let k = 0; k < photo.length; k++) if (photo[k] > 0) tot += photo[k];
  const clip = (x) => clamp(x, -1, 1.5);
  const Pr = photo.map((v, k) => clip(Math.log((Math.max(v, 0) + 0.002) / (smooth[k] + 0.002))));
  const mask = new Uint8Array(GR * GR);
  // stars and neighbouring galaxies (far brighter than their surroundings, unlike shells) are left out, with a margin
  const bright = new Uint8Array(GR * GR);
  for (let j = 0; j < GR; j++) for (let i = 0; i < GR; i++) if (Pr[j * GR + i] >= 1.0) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && a2 < GR && b2 >= 0 && b2 < GR) bright[b2 * GR + a2] = 1; }
  for (let k = 0; k < GR * GR; k++) { const [x, y] = xy(k), r = Math.hypot(x, y); mask[k] = photo[k] >= 0 && r > 0.6 * re && r < half && !bright[k] ? 1 : 0; }
  // the model's residual: (smooth host + debris) ÷ smooth host
  const scoreD = (D, f) => { let s = 0; for (const v of D) s += v; const k = (f * tot) / Math.max(s, 1e-12); return corr(D.map((v, j) => clip(Math.log((smooth[j] + k * v + 0.002) / (smooth[j] + 0.002)))), Pr, mask); };
  const bestF = (D) => { let b = { s: -2, f: 0 }; for (const f of [0.01, 0.02, 0.04, 0.08, 0.15]) { const s = scoreD(D, f); if (s > b.s) b = { s, f }; } return b; };
  // a small galaxy, light enough (about 1/100 of the host's mass within 4 kpc of its centre) that the first close pass
  // tears it apart completely, as the shells say happened: with a heavier one a bound core survives and keeps orbiting
  const SAT = () => halo(22, 0.5, 4);
  // a plunge: pericentre at rp along unit vector e, moving along u (perpendicular), with the speed that turns it round
  // at apocentre ra; run forward tp Myr to get today's state
  const Phi = (r) => { let s = 0; const n = 400; for (let i = 0; i < n; i++) { const x = r + ((i + 0.5) / n) * (2000 - r); s += (GRAV * HOST.M(x)) / (x * x) * ((2000 - r) / n); } return -s; };
  const plunge = (rp, ra, e, u, tp, m) => {
    const S = SAT(), vp = Math.sqrt(Math.max(0, 2 * (Phi(ra) - Phi(rp)))) / KMS;
    const fwd = relOrbit(HOST, S, e.map((x) => x * rp), u.map((x) => x * vp), tp, 1, 1e9);
    if (fwd.merged) return null;
    return { pos: fwd.p, vel: fwd.v, S, m, rp, ra, e, u, tp };
  };
  const randUnit = () => { const z = R() * 2 - 1, ph = R() * 2 * Math.PI, s = Math.sqrt(1 - z * z); return [s * Math.cos(ph), s * Math.sin(ph), z]; };
  const perp = (e) => { let u = randUnit(); const d = u[0] * e[0] + u[1] * e[1] + u[2] * e[2]; u = u.map((x, j) => x - d * e[j]); const l = Math.hypot(...u); return u.map((x) => x / l); };
  const runP = (pl, nS) => runEncounter({ main: HOST, comp: pl.S, compPos: pl.pos, compVel: pl.vel, t0: -25 * Math.round((pl.tp + 250) / 25), t1: 0, nDisk: 0, nComp: nS, dt: 1, every: 25, compDisk: { n: [0, 0, 1], rd: 0.7, rmax: 2.5 } });
  const draw = () => {
    const e = randUnit();
    return plunge(0.8 + 2.5 * R(), half * (0.4 + 0.9 * R()), e, perp(e), Math.round(400 + 2800 * R()), 0);
  };
  const cands = []; let tried = 0;
  while (cands.length < 260 && tried < 600) {
    tried++; const pl = draw(); if (!pl) continue;
    const D = starMap(runP(pl, 1200), 0, 1); const bf = bestF(D);
    cands.push({ pl, s: bf.s, f: bf.f });
  }
  cands.sort((x, y) => y.s - x.s);
  const control = cands.filter((_, j) => j % Math.floor(cands.length / 12) === 0).slice(0, 12).map((c) => bestF(starMap(runP(c.pl, 4000), 0, 1)).s).sort((x, y) => x - y);
  const top = cands.slice(0, 6);
  for (const c of top) for (let it = 0; it < 18; it++) {
    const jit = (v, s) => { const w = v.map((x) => x + (R() - 0.5) * s); const l = Math.hypot(...w); return w.map((x) => x / l); };
    const e = jit(c.pl.e, 0.3); let u = jit(c.pl.u, 0.3); const d = u.reduce((s, x, j) => s + x * e[j], 0); u = u.map((x, j) => x - d * e[j]); const lu = Math.hypot(...u); u = u.map((x) => x / lu);
    const pl = plunge(clamp(c.pl.rp * (1 + (R() - 0.5) * 0.4), 0.7, 4), clamp(c.pl.ra * (1 + (R() - 0.5) * 0.3), 0.3 * half, 1.4 * half), e, u, Math.round(clamp(c.pl.tp * (1 + (R() - 0.5) * 0.25), 300, 3500)), 0);
    if (!pl) continue;
    const bf = bestF(starMap(runP(pl, 1200), 0, 1));
    if (bf.s > c.s) Object.assign(c, { pl, s: bf.s, f: bf.f });
  }
  for (const c of top) { const D = starMap(runP(c.pl, 5000), 0, 1); const bf = bestF(D); c.s2 = bf.s; c.f2 = bf.f; c.rot = scoreD(blur(rot90(D)), bf.f); }
  function rot90(D) { const O = new Float64Array(GR * GR); for (let j = 0; j < GR; j++) for (let i = 0; i < GR; i++) O[i * GR + (GR - 1 - j)] = D[j * GR + i]; return O; }
  top.sort((x, y) => y.s2 - x.s2);
  const b = top[0], pl = b.pl;
  log(`${T.tag}: score ${b.s2.toFixed(3)} (turned 90° ${b.rot.toFixed(3)}, random plunges ${control[control.length >> 1].toFixed(3)}); pericentre ${pl.rp.toFixed(1)} kpc, fell from ${pl.ra.toFixed(0)} kpc, first pass ${pl.tp} Myr ago, debris light ${(b.f2 * 100).toFixed(1)}%`);
  // the satellite's orbit: e at pericentre, its sky direction (where the shells line up)
  const skyAng = Math.round((Math.atan2(pl.e[1], pl.e[0]) * 180) / Math.PI), los = Math.round((Math.asin(clamp(pl.e[2], -1, 1)) * 180) / Math.PI);
  return {
    ...base, main: { v: +vH.toFixed(1), rc: +HOST.rc.toFixed(2), rt: 200 }, comp: { v: 22, rc: 0.5, rt: 4 },
    mainDisk: { n: [0, 0, 1], rd: +(re / 1.82).toFixed(2), rmax: +(2.5 * re).toFixed(2), round: true }, compDisk: { n: [0, 0, 1], rd: 0.7, rmax: 2.5 },
    compPos: r3(pl.pos), compVel: pl.vel.map((x) => +x.toFixed(1)), t0: -25 * Math.round((pl.tp + 250) / 25), t1: 1500, lightRatio: +b.f2.toFixed(3), nCompFrac: 0.6,
    score: +b.s2.toFixed(3), rotated: +b.rot.toFixed(3), controlMedian: +control[control.length >> 1].toFixed(3), controlMax: +control[control.length - 1].toFixed(3),
    tried, sensible: cands.length, simulated: cands.length + top.length * 19 + 12,
    plunge: { rp: +pl.rp.toFixed(1), ra: +pl.ra.toFixed(0), tp: pl.tp, skyAng, los, debrisLight: b.f2 },
    measured: { re: +re.toFixed(2), q: +T.q.toFixed(2), mpc: T.mpc, distSrc: T.distSrc, ned: T.nedName, z: T.z, zRef: T.zRef, image: T.image, kpcPerArcmin: +(T.kpcPerPix * 60 / T.pixArcsec).toFixed(3) },
    centreRa: T.centreRa, centreDec: T.centreDec,
  };
}

if (isMainThread) {
  const src = process.argv[2] || `${os.homedir()}/projects/astro-data/out_shapes/shapes.json`;
  const only = process.argv.slice(3);
  const all = JSON.parse(fs.readFileSync(src)).targets.filter((t) => !only.length || only.includes(t.tag));
  const outFile = new URL('../../public/data/pairs/shapes.json', import.meta.url);
  const prev = only.length && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile)).fits : [];
  const results = []; let next = 0, running = 0;
  const nW = Math.min(all.length, Math.max(1, os.cpus().length - 4));
  await new Promise((done) => {
    const launch = () => {
      if (next >= all.length) { if (!running) done(); return; }
      const t = all[next++]; running++;
      const w = new Worker(new URL(import.meta.url), { workerData: t });
      w.on('message', (m) => { if (m.log) console.log(m.log); else results.push(m.result); });
      w.on('error', (e) => { console.error(`${t.tag} failed:`, e); results.push({ tag: t.tag, ok: false, why: String(e) }); });
      w.on('exit', () => { running--; launch(); });
    };
    for (let k = 0; k < nW; k++) launch();
  });
  const order = (x) => all.findIndex((t) => t.tag === x.tag);
  const merged = [...prev.filter((x) => !results.some((r) => r.tag === x.tag)), ...results].sort((a, b) => order(a) - order(b));
  fs.writeFileSync(outFile, JSON.stringify({ fits: merged, note: 'Collisions chosen by tools/galaxies/fit_shapes.mjs: the best match to each deep image among simple ring-making and shell-making encounters. Not published fits.' }));
  console.log(`saved ${merged.filter((x) => x.ok).length} of ${merged.length}`);
} else {
  parentPort.postMessage({ result: fit(workerData, (s) => parentPort.postMessage({ log: s })) });
}
