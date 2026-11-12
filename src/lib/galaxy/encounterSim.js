// A galaxy encounter, the Toomre & Toomre (1972) way: two galaxies as soft balls of mass (dark halo included) that
// pull on each other, and stars as test particles that feel both but pull on nothing. Cheap enough to run in the
// browser, and it shows the essential thing — how a passing companion's tides raise two arms and a bridge.
// Units: kpc, Myr, solar masses. No Three.js; used by the page and by tools/galaxies/fit_m51_orbit.mjs.
//
// Each galaxy: an isothermal halo with a core, circular speed v (flat rotation curve), cut off at radius rt
//   M(r) = v² r³ / (G (r² + rc²)) for r < rt, then constant.
// Dynamical friction on the companion (future only, see below): Chandrasekhar's formula for a singular isothermal
//   halo, F = −0.428 ln Λ G M² / r² along its velocity (Binney & Tremaine 2008, eq. 8.13), with ln Λ = 3.
// The past is run without friction: friction can't be run backwards (it would speed things up), so the orbit before
// today is the frictionless one through today's position — a simplification, said so on the page.

export const G = 4.498e-12;                 // kpc³ / (M☉ Myr²)
export const KMS = 1.0227e-3;               // 1 km/s in kpc/Myr

export function halo(v_kms, rc, rt) {
  const v2 = (v_kms * KMS) ** 2;
  const M = (r) => (v2 * Math.min(r, rt) ** 3) / (G * (Math.min(r, rt) ** 2 + rc * rc));
  return { v2, rc, rt, M, Mtot: M(rt) };
}
// acceleration toward a halo's centre at offset (dx, dy, dz) from it
function pull(h, dx, dy, dz, out, k = 1) {
  const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2) + 1e-6;
  const a = (G * h.M(r)) / (r2 + 1e-6);
  out[0] -= (k * a * dx) / r; out[1] -= (k * a * dy) / r; out[2] -= (k * a * dz) / r;
}

/** seeded random numbers, so the page and the fitting script make the same stars */
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * @param {object} o
 * @param {object} o.main, o.comp      halo() objects
 * @param {number[]} o.compPos, o.compVel   the companion relative to the main galaxy TODAY (kpc, km/s), disk frame
 * @param {number} o.t0, o.t1          start and end, Myr from today (t0 < 0 < t1)
 * @param {number} o.spin              +1 or −1: the disk's sense of rotation about +z
 * @param {number} o.nDisk, o.nComp    test particles
 * @param {number} [o.every=10]        snapshot spacing, Myr
 * @param {number} [o.dt=0.5]          integration step, Myr
 */
export function runEncounter(o) {
  const { main, comp, t0, t1, spin = 1, nDisk = 9000, nComp = 1500, every = 10, dt = 0.5, lnL = 3, seed = 51 } = o;
  const mu = comp.Mtot / (main.Mtot + comp.Mtot);
  // ---- the centres' orbit: back from today without friction, then forward from today with it ----
  const centres = (sign, steps, friction) => {
    // relative coordinates (companion − main); the two centres follow from the centre of mass staying put
    let p = o.compPos.slice(), v = o.compVel.map((x) => x * KMS);
    const out = [{ p: p.slice(), v: v.slice() }];
    const acc = (p, v) => {
      const r = Math.hypot(...p), a = [0, 0, 0];
      if (r < 0.6) return a;                                  // merged: one galaxy, nothing left to pull apart
      // each feels the other's mass inside the separation (the larger of the two pulls dominates)
      const Mr = main.M(r) + comp.M(r);
      for (let k = 0; k < 3; k++) a[k] = (-G * Mr * p[k]) / r ** 3;
      if (friction) {
        const s = Math.hypot(...v) + 1e-9, f = (0.428 * lnL * G * comp.Mtot * Math.min(1, r / main.rt)) / Math.max(r, 1) ** 2 / (1 - mu);
        if (r < main.rt) for (let k = 0; k < 3; k++) a[k] -= (f * v[k]) / s;
      }
      return a;
    };
    const h = sign * dt;
    for (let i = 0; i < steps; i++) {
      let a = acc(p, v);
      for (let k = 0; k < 3; k++) v[k] += 0.5 * h * a[k];
      for (let k = 0; k < 3; k++) p[k] += h * v[k];
      a = acc(p, v);
      for (let k = 0; k < 3; k++) v[k] += 0.5 * h * a[k];
      // once merged, stay merged
      if (Math.hypot(...p) < 0.6) { p = [0, 0, 0]; v = [0, 0, 0]; }
      out.push({ p: p.slice(), v: v.slice() });
    }
    return out;
  };
  const nBack = Math.round(-t0 / dt), nFwd = Math.round(t1 / dt);
  const back = centres(-1, nBack, false), fwd = centres(1, nFwd, true);
  const rel = [...back.slice(1).reverse(), ...fwd];          // index 0 = t0
  const nT = rel.length;
  // main and companion centres, centre of mass fixed at the origin
  const cM = new Float64Array(nT * 3), cC = new Float64Array(nT * 3);
  for (let i = 0; i < nT; i++) for (let k = 0; k < 3; k++) { cM[i * 3 + k] = -mu * rel[i].p[k]; cC[i * 3 + k] = (1 - mu) * rel[i].p[k]; }
  const vM = (i, k) => -mu * rel[i].v[k], vC = (i, k) => (1 - mu) * rel[i].v[k];

  // ---- stars: a disk round the main galaxy, a puffy cloud round the companion, at t0 ----
  const R = rng(seed), n = nDisk + nComp;
  const x = new Float64Array(n * 3), v = new Float64Array(n * 3), born = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const disk = i < nDisk, h = disk ? main : comp, ci = disk ? cM : cC;
    let px, py, pz, ux, uy, uz;
    if (disk) {
      // exponential disk, scale length 3 kpc, 0.8–18 kpc; circular orbits in the main halo
      let rr; do { rr = -3 * Math.log(R() * R() + 1e-12); } while (rr < 0.8 || rr > 18);
      const th = R() * 2 * Math.PI, vc = Math.sqrt((G * h.M(rr)) / rr);
      px = rr * Math.cos(th); py = rr * Math.sin(th); pz = (R() - 0.5) * 0.3;
      ux = -spin * vc * Math.sin(th); uy = spin * vc * Math.cos(th); uz = 0;
      born[i * 2] = rr; born[i * 2 + 1] = 0;
    } else {
      // a round cloud of stars on circular orbits with random tilts
      const rr = 0.4 + 3.5 * R() ** 1.5, ct = R() * 2 - 1, st = Math.sqrt(1 - ct * ct), ph = R() * 2 * Math.PI;
      px = rr * st * Math.cos(ph); py = rr * st * Math.sin(ph); pz = rr * ct;
      // a velocity perpendicular to the position, random direction, circular speed
      const ax = [R() - 0.5, R() - 0.5, R() - 0.5];
      let cx = py * ax[2] - pz * ax[1], cy = pz * ax[0] - px * ax[2], cz = px * ax[1] - py * ax[0];
      const cl = Math.hypot(cx, cy, cz) + 1e-9, vc = Math.sqrt((G * h.M(rr)) / rr);
      ux = (cx / cl) * vc; uy = (cy / cl) * vc; uz = (cz / cl) * vc;
      born[i * 2] = rr; born[i * 2 + 1] = 1;
    }
    x[i * 3] = ci[0] + px; x[i * 3 + 1] = ci[1] + py; x[i * 3 + 2] = ci[2] + pz;
    const vv = disk ? vM : vC;
    v[i * 3] = vv(0, 0) + ux; v[i * 3 + 1] = vv(0, 1) + uy; v[i * 3 + 2] = vv(0, 2) + uz;
  }
  // ---- integrate the stars in the moving potential; keep snapshots (position + velocity) ----
  const per = Math.round(every / dt), nSnap = Math.floor((nT - 1) / per) + 1;
  const snaps = new Float32Array(nSnap * n * 6), cen = new Float32Array(nSnap * 6);
  const a = [0, 0, 0];
  const save = (step, si) => {
    for (let i = 0; i < n * 3; i++) { snaps[si * n * 6 + i] = x[i]; snaps[si * n * 6 + n * 3 + i] = v[i]; }
    for (let k = 0; k < 3; k++) { cen[si * 6 + k] = cM[step * 3 + k]; cen[si * 6 + 3 + k] = cC[step * 3 + k]; }
  };
  save(0, 0);
  const accel = (i, step) => {
    a[0] = a[1] = a[2] = 0;
    pull(main, x[i * 3] - cM[step * 3], x[i * 3 + 1] - cM[step * 3 + 1], x[i * 3 + 2] - cM[step * 3 + 2], a);
    pull(comp, x[i * 3] - cC[step * 3], x[i * 3 + 1] - cC[step * 3 + 1], x[i * 3 + 2] - cC[step * 3 + 2], a);
  };
  for (let step = 0; step < nT - 1; step++) {
    for (let i = 0; i < n; i++) {
      accel(i, step);
      for (let k = 0; k < 3; k++) { v[i * 3 + k] += 0.5 * dt * a[k]; x[i * 3 + k] += dt * v[i * 3 + k]; }
      accel(i, step + 1);
      for (let k = 0; k < 3; k++) v[i * 3 + k] += 0.5 * dt * a[k];
    }
    if ((step + 1) % per === 0) save(step + 1, (step + 1) / per);
    if (o.onProgress && step % 100 === 0) o.onProgress(step / (nT - 1));
  }
  // key moments: closest approaches, disk-plane crossings, today, merger
  const moments = [];
  const tOf = (i) => t0 + i * dt;
  for (let i = 1; i < nT - 1; i++) {
    const r0 = Math.hypot(...rel[i - 1].p), r1 = Math.hypot(...rel[i].p), r2 = Math.hypot(...rel[i + 1].p);
    if (r1 < r0 && r1 <= r2 && r1 > 0.6) moments.push({ t: tOf(i), kind: 'closest', r: r1 });
    if (rel[i - 1].p[2] * rel[i].p[2] < 0 && Math.hypot(rel[i].p[0], rel[i].p[1]) < 40) moments.push({ t: tOf(i), kind: 'crossing', r: Math.hypot(rel[i].p[0], rel[i].p[1]) });
  }
  const mi = rel.findIndex((q, i) => i > nBack && Math.hypot(...q.p) < 0.61);
  if (mi > 0) moments.push({ t: tOf(mi), kind: 'merger' });
  moments.push({ t: 0, kind: 'today' });
  moments.sort((p, q) => p.t - q.t);
  return { n, nDisk, nComp, nSnap, every, t0, t1: t0 + (nSnap - 1) * every, snaps, cen, born, moments, mu, Mmain: main.Mtot, Mcomp: comp.Mtot };
}

/** positions at time t (Myr), Hermite-interpolated between snapshots (uses the stored velocities) */
export function positionsAt(sim, t, out) {
  const { n, nSnap, every, t0, snaps } = sim;
  const f = Math.min(nSnap - 1 - 1e-6, Math.max(0, (t - t0) / every)), i = Math.floor(f), u = f - i, h = every;
  const A = i * n * 6, B = (i + 1) * n * 6;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  for (let j = 0; j < n * 3; j++) out[j] = h00 * snaps[A + j] + h10 * h * snaps[A + n * 3 + j] + h01 * snaps[B + j] + h11 * h * snaps[B + n * 3 + j];
  return out;
}
export function centresAt(sim, t) {
  const f = Math.min(sim.nSnap - 1 - 1e-6, Math.max(0, (t - sim.t0) / sim.every)), i = Math.floor(f), u = f - i, c = sim.cen;
  const L = (k) => c[i * 6 + k] * (1 - u) + c[(i + 1) * 6 + k] * u;
  return { main: [L(0), L(1), L(2)], comp: [L(3), L(4), L(5)] };
}
