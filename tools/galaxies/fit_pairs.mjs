// Orbits for Arp's colliding pairs, chosen automatically, one pair at a time, the way fit_m51_orbit.mjs chose M51's.
//
// What is measured (tools/pairs/build_pairs.py → pairs.json): where the two galaxies are on the sky (so their
// separation across the sky, in kpc at the pair's distance), the difference of their line-of-sight speeds (redshifts),
// their light ratio, sizes and apparent shapes on the red plate. What is not measured, and is searched for here:
// how far apart they are along the line of sight, their speed across the sky (two components), and how each disk is
// tilted and which way it turns. Masses are assumed from the sizes and the light ratio (said so on the page).
//
// 1. many random orbits through today's measured positions and line-of-sight speed, kept if their past makes sense:
//    the two passed close (within ~2× their combined sizes) sometime in the last 1000 Myr — otherwise there would
//    be no tides to see — and were further apart 1000 Myr ago than today;
// 2. each kept orbit is simulated with test-star disks of several tilts (half near the tilt the photo's shapes
//    suggest, half at random) and scored against the photograph: the correlation of log brightness, *outside* the
//    two bright centres, so what is compared is the tails, bridges and plumes the encounter made;
// 3. the best few are refined by small random changes; the winner is checked again with more stars, and compared with
//    the same two disks left undisturbed (no pull on each other), the baseline the page reports beside the score.
//
// node tools/galaxies/fit_pairs.mjs [pairs.json] [arp numbers…]   →   public/data/pairs/encounters.json
import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runEncounter, halo, positionsAt, rng, G as GRAV, KMS } from '../../src/lib/galaxy/encounterSim.js';

const T0 = -1000, T1 = 1500;

/** the assumed mass model for one pair (also used by the page, from the stored numbers) */
export function massModel(p) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // bigger galaxies spin faster (roughly v ∝ size^0.5 here, 200 km/s at r½ = 4 kpc); the companion from the light
  // ratio (Tully–Fisher, L ∝ v⁴). Halo cores and edges scale with size.
  const vM = clamp(200 * Math.sqrt(p.reMain / 4), 110, 280), vC = clamp(vM * p.lightRatio ** 0.25, 70, vM);
  const reC = Math.max(0.6, p.reComp), reM = Math.max(0.6, p.reMain);
  return {
    main: { v: +vM.toFixed(1), rc: +(0.25 * reM).toFixed(2), rt: +clamp(10 * reM, 15, 70).toFixed(1) },
    comp: { v: +vC.toFixed(1), rc: +(0.25 * reC).toFixed(2), rt: +clamp(10 * reC, 10, 60).toFixed(1) },
    rdMain: reM / 1.68, rdComp: reC / 1.68,
  };
}

function fitPair(p, log) {
  const mm = massModel(p);
  const MAIN = halo(mm.main.v, mm.main.rc, mm.main.rt), COMP = halo(mm.comp.v, mm.comp.rc, mm.comp.rt);
  const R = rng(1000 + p.arp);
  const GR = 64, half = p.half;
  const photo = Float64Array.from(p.grid);
  const valid = photo.map((v) => (v >= 0 ? 1 : 0));
  // compare only outside the two centres (inside ~1.3 r½), where the light is the galaxies' own undisturbed bulk
  const px = (x) => ((x + half) / (2 * half)) * GR;
  const mask = new Uint8Array(GR * GR);
  for (let j = 0; j < GR; j++) for (let i = 0; i < GR; i++) {
    const x = ((i + 0.5) / GR) * 2 * half - half, y = ((j + 0.5) / GR) * 2 * half - half;
    const inM = Math.hypot(x, y) < 1.3 * p.reMain, inC = Math.hypot(x - p.compXY[0], y - p.compXY[1]) < 1.3 * p.reComp;
    mask[j * GR + i] = valid[j * GR + i] && !inM && !inC ? 1 : 0;
  }
  const blur = (H) => { const O = new Float64Array(GR * GR); for (let j = 0; j < GR; j++) for (let i = 0; i < GR; i++) { let s = 0, c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && a < GR && b >= 0 && b < GR) { s += H[b * GR + a]; c++; } } O[j * GR + i] = s / c; } return O; };
  // the photo in log brightness, above its own faint floor
  const floor = 0.01;
  const P = photo.map((v) => Math.log(Math.max(v, 0) + floor));
  const corrOf = (A, Bv) => {
    let n = 0, ma = 0, mb = 0;
    for (let k = 0; k < A.length; k++) if (mask[k]) { n++; ma += A[k]; mb += Bv[k]; }
    ma /= n; mb /= n;
    let sab = 0, sa = 0, sb = 0;
    for (let k = 0; k < A.length; k++) if (mask[k]) { const a = A[k] - ma, b = Bv[k] - mb; sab += a * b; sa += a * a; sb += b * b; }
    return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : -1;
  };
  const corr = (M) => corrOf(M, P);
  // stars carry light: the companion's stars together carry lightRatio × the main galaxy's
  const image = (sim, place) => {
    const H = new Float64Array(GR * GR), wM = 1 / sim.nDisk, wC = p.lightRatio / Math.max(1, sim.nComp), q = [0, 0];
    for (let i = 0; i < sim.n; i++) {
      place(i, q);
      const a = Math.floor(px(q[0])), b = Math.floor(px(q[1]));
      if (a >= 0 && a < GR && b >= 0 && b < GR) H[b * GR + a] += i < sim.nDisk ? wM : wC;
    }
    const B = blur(H); let mx = 0; for (const v of B) mx = Math.max(mx, v);
    return B.map((v) => Math.log(v / mx + floor));
  };
  // two numbers: 'total', how well the model today matches the photo outside the centres; and 'tidal', how well
  // what the encounter CHANGED (the model minus the same two disks undisturbed) matches what the photo has beyond
  // those undisturbed disks — the tails, bridges and plumes. The undisturbed disks are free to compute: a disk left
  // alone keeps the same round-on-average spread of stars, so it is the starting disk moved to today's centre.
  const score = (sim, both = false) => {
    const pos = positionsAt(sim, 0, new Float64Array(sim.n * 3));
    const k = Math.round((0 - sim.t0) / sim.every), c = [sim.cen[k * 6], sim.cen[k * 6 + 1]];
    const M = image(sim, (i, q) => { q[0] = pos[i * 3] - c[0]; q[1] = pos[i * 3 + 1] - c[1]; });
    const total = corr(M);
    if (!sim.cen0) return both ? { total, tidal: 0 } : total;
    const U = image(sim, (i, q) => {
      const g = i < sim.nDisk ? 0 : 3, S = sim.snaps;
      q[0] = S[i * 3] - sim.cen0[g] + sim.cen[k * 6 + g] - c[0]; q[1] = S[i * 3 + 1] - sim.cen0[g + 1] + sim.cen[k * 6 + g + 1] - c[1];
    });
    const tidal = corrOf(M.map((v, j) => v - U[j]), P.map((v, j) => v - U[j]));
    return both ? { total, tidal } : 0.5 * total + tidal;
  };

  // ---- tilts: near what the photo's shapes suggest, or anything ----
  const normalFrom = (sh, flipNear, flipSpin) => {
    const ci = Math.min(0.98, Math.max(0.15, sh.q + (R() - 0.5) * 0.3)), si = Math.sqrt(1 - ci * ci);
    const ang = sh.ang + (R() - 0.5) * 0.5;
    // minor axis on the sky (perpendicular to the major axis), tilted out of the sky by the inclination
    const mx = -Math.sin(ang), my = Math.cos(ang), s = flipNear ? -1 : 1, sp = flipSpin ? -1 : 1;
    return [sp * s * si * mx, sp * s * si * my, sp * ci];
  };
  const randomNormal = () => { const z = R() * 2 - 1, a = R() * 2 * Math.PI, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), s * Math.sin(a), z]; };
  const tilt = (sh) => (R() < 0.6 ? normalFrom(sh, R() < 0.5, R() < 0.5) : randomNormal());
  const disks = (nM, nC) => ({ mainDisk: { n: nM, rd: mm.rdMain, rmax: 5 * mm.rdMain }, compDisk: { n: nC, rd: mm.rdComp, rmax: 5 * mm.rdComp } });
  const nCompFor = (nD) => Math.round(Math.max(0.3, Math.min(1, p.lightRatio)) * nD);

  // ---- 1. orbits ----
  const sepSky = Math.hypot(...p.compXY), vz = -p.dv;          // z points towards us; a larger redshift moves away
  const Mtot = MAIN.Mtot + COMP.Mtot;
  const orbits = [];
  let tried = 0;
  const reach = 2.2 * (p.reMain + p.reComp) + 4;
  for (let k = 0; k < 2500 && orbits.length < 160; k++) {
    tried++;
    const depth = (R() * 2 - 1) * 1.5 * Math.max(sepSky, 8);
    const r = Math.hypot(sepSky, depth), vesc = Math.sqrt((2 * GRAV * Mtot) / r) / KMS;
    const vt = Math.sqrt(R()) * 1.1 * vesc, a = R() * 2 * Math.PI;
    const o = { pos: [p.compXY[0], p.compXY[1], depth], vel: [vt * Math.cos(a), vt * Math.sin(a), vz] };
    const sim = runEncounter({ main: MAIN, comp: COMP, compPos: o.pos, compVel: o.vel, t0: T0, t1: 0, nDisk: 0, nComp: 0, dt: 1 });
    const passes = sim.moments.filter((m) => m.kind === 'closest' && m.t < -15);
    const sep0 = Math.hypot(sim.cen[3] - sim.cen[0], sim.cen[4] - sim.cen[1], sim.cen[5] - sim.cen[2]);
    if (passes.length && passes.length <= 3 && passes[passes.length - 1].r < reach && sep0 > 1.3 * r) orbits.push({ ...o, depth, r3: r, peri: passes[passes.length - 1], nPass: passes.length });
  }
  log(`Arp ${p.arp}: ${tried} orbits tried, ${orbits.length} with a close pass in the last ${-T0} Myr`);
  if (!orbits.length) return { arp: p.arp, ok: false, tried, why: `none of ${tried} trial orbits through today's positions passed close enough in the last billion years` };

  // ---- 2. disks of several tilts on each orbit ----
  const N1 = 1200;
  const trial = (o, nM, nC, nD = N1) => withCen0(runEncounter({ main: MAIN, comp: COMP, compPos: o.pos, compVel: o.vel, t0: T0, t1: 0, nDisk: nD, nComp: nCompFor(nD), dt: 1, every: 20, ...disks(nM, nC) }));
  const withCen0 = (sim) => { sim.cen0 = Array.from(sim.cen.slice(0, 6)); return sim; };
  const cands = [];
  for (const o of orbits) for (let k = 0; k < 3; k++) {
    const nM = tilt(p.shapeMain), nC = tilt(p.shapeComp);
    cands.push({ o, nM, nC, s: score(trial(o, nM, nC)) });
  }
  cands.sort((a, b) => b.s - a.s);
  // control: the tail score of a dozen of the sensible orbits taken evenly through the list (so mostly not good
  // ones), with 4,000 stars like the winner's check — what an orbit that merely fits the measurements scores
  const sample = cands.filter((_, j) => j % Math.max(1, Math.floor(cands.length / 12)) === 0).slice(0, 12);
  const control = sample.map((c) => score(trial(c.o, c.nM, c.nC, 4000), true).tidal).sort((a, b) => a - b);
  // ---- 3. refine the best few ----
  const jitter = (v, s) => { const w = v.map((x) => x + (R() - 0.5) * s); const l = Math.hypot(...w); return w.map((x) => x / l); };
  const top = cands.slice(0, 6);
  for (const c of top) {
    for (let it = 0; it < 25; it++) {
      const o = { ...c.o, pos: [c.o.pos[0], c.o.pos[1], c.o.pos[2] + (R() - 0.5) * 0.2 * c.o.r3], vel: [c.o.vel[0] * (1 + (R() - 0.5) * 0.2), c.o.vel[1] * (1 + (R() - 0.5) * 0.2), vz] };
      const nM = jitter(c.nM, 0.4), nC = jitter(c.nC, 0.4);
      const s = score(trial(o, nM, nC));
      if (s > c.s) {
        // keep it only if the orbit still has a sensible past
        const chk = runEncounter({ main: MAIN, comp: COMP, compPos: o.pos, compVel: o.vel, t0: T0, t1: 0, nDisk: 0, nComp: 0, dt: 1 });
        const passes = chk.moments.filter((m) => m.kind === 'closest' && m.t < -15);
        if (passes.length && passes.length <= 3 && passes[passes.length - 1].r < reach) Object.assign(c, { o: { ...o, peri: passes[passes.length - 1], nPass: passes.length, r3: Math.hypot(...o.pos) }, nM, nC, s });
      }
    }
  }
  // confirm with more stars
  const N2 = 4000;
  for (const c of top) { c.sc = score(trial(c.o, c.nM, c.nC, N2), true); c.s2 = 0.5 * c.sc.total + c.sc.tidal; }
  top.sort((a, b) => b.s2 - a.s2);
  const best = top[0];
  // baseline: the same two disks, same tilts, same places today, not pulling on each other
  const none = { ...best.o };
  const base = (() => {
    // run with the companion's mass switched off and the main galaxy's pull limited to its own stars: two separate
    // undisturbed galaxies, placed where they are today
    const solo = (h, D, nD, at) => runEncounter({ main: h, comp: halo(1, 0.5, 0.01), compPos: [500, 0, 0], compVel: [0, 0, 0], t0: -300, t1: 0, nDisk: nD, nComp: 0, dt: 1, every: 20, mainDisk: D });
    const a = solo(MAIN, disks(best.nM, best.nC).mainDisk, N2), b = solo(COMP, { ...disks(best.nM, best.nC).compDisk }, nCompFor(N2));
    const pa = positionsAt(a, 0, new Float64Array(a.n * 3)), pb = positionsAt(b, 0, new Float64Array(b.n * 3));
    const ca = [a.cen[(a.nSnap - 1) * 6], a.cen[(a.nSnap - 1) * 6 + 1], a.cen[(a.nSnap - 1) * 6 + 2]], cb = [b.cen[(b.nSnap - 1) * 6], b.cen[(b.nSnap - 1) * 6 + 1], b.cen[(b.nSnap - 1) * 6 + 2]];
    // a fake sim with both sets of stars at today's positions, for the scorer
    // (two identical snapshots, velocities zero, so the interpolation returns exactly these positions)
    const n = a.n + b.n, snaps = new Float32Array(2 * n * 6), cen = new Float32Array(12);
    for (const sn of [0, n * 6]) {
      for (let i = 0; i < a.n; i++) for (let q = 0; q < 3; q++) snaps[sn + i * 3 + q] = pa[i * 3 + q] - ca[q];
      for (let i = 0; i < b.n; i++) for (let q = 0; q < 3; q++) snaps[sn + (a.n + i) * 3 + q] = pb[i * 3 + q] - cb[q] + best.o.pos[q];
    }
    return score({ n, nDisk: a.n, nComp: b.n, nSnap: 2, every: 1, t0: 0, snaps, cen });
  })();
  // the whole story, past and future, for the moments the page lists
  const full = runEncounter({ main: MAIN, comp: COMP, compPos: best.o.pos, compVel: best.o.vel, t0: T0, t1: T1, nDisk: 0, nComp: 0, dt: 1, ...disks(best.nM, best.nC) });
  const merger = full.moments.find((m) => m.kind === 'merger');
  log(`Arp ${p.arp}: tidal ${best.sc.tidal.toFixed(3)} (random orbits ${control[control.length >> 1].toFixed(3)}), score ${best.sc.total.toFixed(3)} vs undisturbed ${base.toFixed(3)}; depth ${best.o.pos[2].toFixed(1)} kpc, closest ${best.o.peri.r.toFixed(1)} kpc ${(-best.o.peri.t).toFixed(0)} Myr ago, ${merger ? 'merge in ' + merger.t.toFixed(0) + ' Myr' : 'no merger by +' + T1}`);
  const r3 = (v) => v.map((x) => +x.toFixed(3));
  return {
    arp: p.arp, ok: true, id: p.id, name: p.name, host: p.host, mainName: p.main.name, compName: p.comp.name, mainRa: p.main.ra, mainDec: p.main.dec,
    main: mm.main, comp: mm.comp, mainDisk: { n: r3(best.nM), rd: +mm.rdMain.toFixed(2), rmax: +(5 * mm.rdMain).toFixed(2) }, compDisk: { n: r3(best.nC), rd: +mm.rdComp.toFixed(2), rmax: +(5 * mm.rdComp).toFixed(2) },
    compPos: r3(best.o.pos), compVel: best.o.vel.map((x) => +x.toFixed(1)), t0: T0, t1: T1, lightRatio: +p.lightRatio.toFixed(3),
    score: +best.sc.total.toFixed(3), tidal: +best.sc.tidal.toFixed(3), controlMedian: +control[control.length >> 1].toFixed(3), controlMax: +control[control.length - 1].toFixed(3), baseline: +base.toFixed(3), tried, sensible: orbits.length, simulated: cands.length + top.length * 26,
    closest: { t: +best.o.peri.t.toFixed(0), r: +best.o.peri.r.toFixed(1) }, passes: best.o.nPass, merger: merger ? +merger.t.toFixed(0) : null,
    measured: { sepKpc: +sepSky.toFixed(2), sepArcmin: +p.sepArcmin.toFixed(2), dv: +p.dv.toFixed(0), mpc: +p.mpc.toFixed(1), distSrc: p.distSrc, zMain: p.main.z, zComp: p.comp.z, zRefMain: p.main.zRef, zRefComp: p.comp.zRef, nedMain: p.main.nedName, nedComp: p.comp.nedName, reMain: +p.reMain.toFixed(2), reComp: +p.reComp.toFixed(2), left: p.left },
  };
}

if (isMainThread) {
  const src = process.argv[2] || `${os.homedir()}/projects/astro-data/out_pairs/pairs.json`;
  const only = process.argv.slice(3).map(Number);
  const all = JSON.parse(fs.readFileSync(src)).pairs.filter((p) => !only.length || only.includes(p.arp));
  const outDir = new URL('../../public/data/pairs/', import.meta.url); fs.mkdirSync(outDir, { recursive: true });
  const outFile = new URL('encounters.json', outDir);
  const prev = only.length && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile)).pairs : [];
  const results = [];
  let next = 0, running = 0;
  const nW = Math.min(all.length, Math.max(1, os.cpus().length - 4));
  await new Promise((done) => {
    const launch = () => {
      if (next >= all.length) { if (!running) done(); return; }
      const p = all[next++]; running++;
      const w = new Worker(new URL(import.meta.url), { workerData: p });
      w.on('message', (m) => { if (m.log) console.log(m.log); else results.push(m.result); });
      w.on('error', (e) => { console.error(`Arp ${p.arp} failed:`, e); results.push({ arp: p.arp, ok: false, why: String(e) }); });
      w.on('exit', () => { running--; launch(); });
    };
    for (let k = 0; k < nW; k++) launch();
  });
  const merged = [...prev.filter((x) => !results.some((r) => r.arp === x.arp)), ...results].sort((a, b) => a.arp - b.arp);
  fs.writeFileSync(outFile, JSON.stringify({ pairs: merged, note: 'Orbits chosen by tools/galaxies/fit_pairs.mjs: the best match to each photograph among orbits consistent with the measured sky positions and line-of-sight speeds. Not published fits.' }));
  console.log(`saved ${merged.filter((x) => x.ok).length} fitted pairs of ${merged.length}`);
} else {
  const result = fitPair(workerData, (s) => parentPort.postMessage({ log: s }));
  parentPort.postMessage({ result });
}
