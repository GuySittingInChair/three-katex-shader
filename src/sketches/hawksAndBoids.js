import * as THREE from 'three';
import { TAU } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption } from '../lib/bit.js';

// Hawks and Boids, 2026 edition. Craig Reynolds's flocking rules (1987) in 3D, with what has been learned since.
//
// Each bird ("boid") steers by three rules from its neighbours: separation (don't crowd), alignment (fly the way
// they fly), cohesion (drift towards their middle). On top of Reynolds:
//   • Who counts as a neighbour. Reynolds used everyone within a fixed distance ("metric"). Ballerini et al.
//     (2008, PNAS), filming real starling flocks in 3D over Rome, found each bird reacts to its 6–7 nearest
//     neighbours however far away they are ("topological"), which keeps flocks together when they stretch.
//     Both are here; topological (k = 7) is the default. Birds also ignore whatever is in their rear blind spot.
//   • Panic spreads. A bird that sees a hawk raises its alarm a = 1 and flees. A bird that sees a neighbour
//     panic copies it after a short reaction time:  a_i ← max(own sighting, c · max over neighbours of a_j),
//     and copies their escape direction too. With c < 1 the alarm fades a little at every hop, so a wave of
//     turning runs through the flock and dies out, like the dark "agitation waves" seen in starling flocks under
//     attack. We count who actually saw a hawk and who panicked secondhand.
//   • The fountain. A fleeing bird moves away from the hawk and sideways to its line of flight, so the flock
//     splits round the hawk and closes behind it.
//   • Hawks have a hunting style: chase the nearest bird (Reynolds 1987), aim where it is going, or pick the
//     straggler, the bird furthest from its 7th neighbour (predators often take the odd one out; Hamilton's
//     "selfish herd", 1971). Hawks are faster than birds but turn worse; "agility" sets how sharply.
//   • You can paint wind, drop thermals (rising air: birds and hawks gain height), and drop decoys hawks go for.
// Live, measured from the simulation: polarisation |⟨v̂⟩| (1 = all flying one way), alarm counts, catches.
// A caught bird rejoins from the edge of the roost (no birds are harmed in the making of this equation).
//
// Neighbour search is a spatial hash on the CPU (the site renders with one shared WebGL renderer, so no WebGPU
// compute here): cells of 1.6 m, 16,384 buckets, counting sort each step, then the k nearest by insertion.
// see docs/wiki/sketches/hawksAndBoids.md

// ---------- the rules (metres, seconds) ----------
const K_NEAR = 7;                       // topological neighbours (Ballerini et al. 2008)
const R_METRIC = 3.0;                   // metric range, when chosen
const SEP_R = 1.0;                      // personal space
const W = { sep: 22, ali: 4.0, coh: 2.4, flee: 45 };
const V_MIN = 8, V_MAX = 13, A_MAX = 38;          // starling-ish speeds (m/s) and the hardest turn (m/s²)
const HAWK_CRUISE = 15, HAWK_ATTACK = 20, HAWK_A = 24;
const DETECT = 16;                      // how far a bird spots a hawk (m)
const CATCH = 1.0;
const REACT = 0.08, CALM = 1.4;          // alarm: reaction time to a neighbour, how long panic lasts (s)
const ROOST = new THREE.Vector3(0, 28, 0), ROOST_R = 42;
const DT = 1 / 60;
const CELL = 1.6, MASK = (1 << 14) - 1;

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const cellKey = (ix, iy, iz) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & MASK;

// ---------- the world ----------
function createWorld(n, seed) {
  const rnd = mulberry(seed);
  const f = () => new Float32Array(n);
  const S = {
    n, rnd,
    px: f(), py: f(), pz: f(), vx: f(), vy: f(), vz: f(), ax: f(), ay: f(), az: f(),
    alarm: f(), next: f(), sight: f(), fx: f(), fy: f(), fz: f(), nfx: f(), nfy: f(), nfz: f(), iso: f(),
    phase: f(), amp: f(), bank: f(),
    cellStart: new Int32Array(MASK + 2), sorted: new Int32Array(n), key: new Int32Array(n),
    hawks: [], caught: 0, catchTimes: [], t: 0, saw: 0, alarmed: 0, pol: 0,
    winds: [], thermals: [], decoys: [], flashes: [],
    centre: new THREE.Vector3().copy(ROOST),
  };
  for (let i = 0; i < n; i++) {
    // a loose ball, all heading roughly the same way
    const u = rnd() * 2 - 1, a = rnd() * TAU, r = 14 * Math.cbrt(rnd());
    S.px[i] = ROOST.x + r * Math.sqrt(1 - u * u) * Math.cos(a);
    S.py[i] = ROOST.y + r * u * 0.6;
    S.pz[i] = ROOST.z + r * Math.sqrt(1 - u * u) * Math.sin(a);
    S.vx[i] = 10 + rnd() * 2; S.vy[i] = rnd() - 0.5; S.vz[i] = 3 * (rnd() - 0.5);
    S.phase[i] = rnd() * TAU;
  }
  return S;
}
function makeHawk(S) {
  const a = S.rnd() * TAU;
  return {
    p: new THREE.Vector3(ROOST.x + 60 * Math.cos(a), ROOST.y + 20, ROOST.z + 60 * Math.sin(a)),
    v: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(HAWK_CRUISE),
    target: -1, lockUntil: 0, rest: 2 + S.rnd() * 3, phase: S.rnd() * TAU, amp: 0.5, bank: 0, trail: [],
  };
}

// see docs/wiki/sketches/hawksAndBoids.md, "Finding neighbours fast": sort birds into buckets by position
function buildGrid(S) {
  const { n, px, py, pz, key, cellStart, sorted } = S;
  cellStart.fill(0);
  for (let i = 0; i < n; i++) {
    const k = cellKey(Math.floor(px[i] / CELL), Math.floor(py[i] / CELL), Math.floor(pz[i] / CELL));
    key[i] = k; cellStart[k + 1]++;
  }
  for (let k = 0; k <= MASK; k++) cellStart[k + 1] += cellStart[k];
  const fill = S.fillTmp || (S.fillTmp = new Int32Array(MASK + 1));
  fill.set(cellStart.subarray(0, MASK + 1));
  for (let i = 0; i < n; i++) sorted[fill[key[i]]++] = i;
}

const kD = new Float32Array(32), kI = new Int32Array(32);
// One step of 1/60 s for everyone.
function step(S, P) {
  const { n, px, py, pz, vx, vy, vz, ax, ay, az, alarm, next, sight, fx, fy, fz, nfx, nfy, nfz, iso, cellStart, sorted } = S;
  buildGrid(S);
  const metric = P.metric >= 0.5;
  const k = K_NEAR;
  const cosBlind = Math.cos(((P.blindSpot ?? 60) * Math.PI) / 360);   // half the blind angle
  const contagion = P.contagion ?? 0.8;
  let saw = 0, alarmed = 0, hx = 0, hy = 0, hz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const xi = px[i], yi = py[i], zi = pz[i];
    const vi = Math.hypot(vx[i], vy[i], vz[i]) || 1;
    const ux = vx[i] / vi, uy = vy[i] / vi, uz = vz[i] / vi;
    const ix = Math.floor(xi / CELL), iy = Math.floor(yi / CELL), iz = Math.floor(zi / CELL);
    // --- neighbours: the k nearest, or everyone within R_METRIC; nobody in the blind spot behind ---
    let m = 0;
    const r2max = metric ? R_METRIC * R_METRIC : 1e9;
    let sx = 0, sy = 0, sz = 0, mx = 0, my = 0, mz = 0, ox = 0, oy = 0, oz = 0, cnt = 0, maxA = 0, afx = 0, afy = 0, afz = 0, aw = 0;
    const reach = metric ? 2 : 1;
    for (let pass = 0; pass < 2; pass++) {
      const lo = pass === 0 ? 0 : reach + 1, hi = pass === 0 ? reach : reach + 1;
      if (pass === 1 && (metric || m >= k)) break;   // topological: widen once if fewer than k found
      for (let dx = -hi; dx <= hi; dx++) for (let dy = -hi; dy <= hi; dy++) for (let dz = -hi; dz <= hi; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < lo) continue;
        const c = cellKey(ix + dx, iy + dy, iz + dz);
        for (let q = cellStart[c], e = cellStart[c + 1]; q < e; q++) {
          const j = sorted[q];
          if (j === i) continue;
          const ddx = px[j] - xi, ddy = py[j] - yi, ddz = pz[j] - zi;
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d2 > r2max || d2 > 36) continue;
          if (ddx * ux + ddy * uy + ddz * uz < -cosBlind * Math.sqrt(d2)) continue;   // behind: can't see it
          if (metric) {
            kI[0] = j; consider(j, d2);
          } else if (m < k || d2 < kD[m - 1]) {
            let p = Math.min(m, k - 1);
            while (p > 0 && kD[p - 1] > d2) { kD[p] = kD[p - 1]; kI[p] = kI[p - 1]; p--; }
            kD[p] = d2; kI[p] = j; if (m < k) m++;
          }
        }
      }
    }
    function consider(j, d2) {
      const ddx = px[j] - xi, ddy = py[j] - yi, ddz = pz[j] - zi;
      if (d2 < SEP_R * SEP_R) { const inv = 1 / (d2 + 0.05); sx -= ddx * inv; sy -= ddy * inv; sz -= ddz * inv; }
      mx += vx[j]; my += vy[j]; mz += vz[j]; ox += ddx; oy += ddy; oz += ddz; cnt++;
      const a = alarm[j];
      if (a > maxA) maxA = a;
      if (a > 0.05) { afx += a * fx[j]; afy += a * fy[j]; afz += a * fz[j]; aw += a; }
    }
    if (!metric) for (let q = 0; q < m; q++) consider(kI[q], kD[q]);
    iso[i] = !metric && m ? Math.sqrt(kD[m - 1]) : cnt ? 1 / Math.sqrt(cnt) : 6;
    // --- hawks in view: the bird's own sighting and its own escape direction (the fountain) ---
    let s = 0, efx = 0, efy = 0, efz = 0;
    for (const h of S.hawks) {
      const rx = xi - h.p.x, ry = yi - h.p.y, rz = zi - h.p.z;
      const d = Math.hypot(rx, ry, rz);
      if (d > DETECT || d < 1e-3) continue;
      if (-(rx * ux + ry * uy + rz * uz) < -cosBlind * d) continue;     // hawk in the blind spot
      const hv = h.v.length() || 1, hdx = h.v.x / hv, hdy = h.v.y / hv, hdz = h.v.z / hv;
      const along = rx * hdx + ry * hdy + rz * hdz;
      let qx = rx - along * hdx, qy = ry - along * hdy, qz = rz - along * hdz;
      let ql = Math.hypot(qx, qy, qz);
      if (ql < 1e-3) { qx = -hdz; qy = 0; qz = hdx; ql = Math.hypot(qx, qz) || 1; }
      const w = Math.min(1, (2 * (DETECT - d)) / DETECT);
      efx += w * (qx / ql + (0.6 * rx) / d - 0.3 * hdx);
      efy += w * (qy / ql + (0.6 * ry) / d - 0.3 * hdy);
      efz += w * (qz / ql + (0.6 * rz) / d - 0.3 * hdz);
      s = Math.max(s, w);
    }
    sight[i] = s;
    // --- alarm: what I saw, or what my neighbours are doing, fading at each hop ---
    const target = Math.max(s, contagion * maxA);
    next[i] = target > alarm[i] ? alarm[i] + (target - alarm[i]) * Math.min(1, DT / REACT) : alarm[i] * Math.exp(-DT / CALM);
    if (s > 0) { const l = Math.hypot(efx, efy, efz) || 1; nfx[i] = efx / l; nfy[i] = efy / l; nfz[i] = efz / l; }
    else if (aw > 0) { const l = Math.hypot(afx, afy, afz) || 1; nfx[i] = afx / l; nfy[i] = afy / l; nfz[i] = afz / l; }
    else { nfx[i] = fx[i]; nfy[i] = fy[i]; nfz[i] = fz[i]; }
    if (s > 0) saw++;
    if (next[i] > 0.3) alarmed++;
    // --- the steering sum ---
    let gx = W.sep * sx, gy = W.sep * sy, gz = W.sep * sz;
    if (cnt) {
      gx += W.ali * (mx / cnt - vx[i]) + W.coh * (ox / cnt);
      gy += W.ali * (my / cnt - vy[i]) + W.coh * (oy / cnt);
      gz += W.ali * (mz / cnt - vz[i]) + W.coh * (oz / cnt);
    }
    const a = next[i];
    gx += W.flee * a * nfx[i]; gy += W.flee * a * nfy[i]; gz += W.flee * a * nfz[i];
    // a gentle pull towards the whole flock's middle: no bird sees that far, but every bird sees the mass of the
    // flock (models of real murmurations add the same kind of pull, towards the roost and the flock)
    const qx = S.centre.x - xi, qy = S.centre.y - yi, qz = S.centre.z - zi, ql = Math.hypot(qx, qy, qz);
    if (ql > 4) { const pull = Math.min(6, 0.11 * (ql - 4)) / ql; gx += pull * qx; gy += pull * qy * 0.6; gz += pull * qz; }
    // stay near the roost, above the ground, below the clouds
    const rx = xi - ROOST.x, ry = (yi - ROOST.y) * 1.6, rz = zi - ROOST.z, rr = Math.hypot(rx, ry, rz);
    if (rr > ROOST_R) { const pull = (0.8 * (rr - ROOST_R)) / rr; gx -= pull * rx; gy -= pull * ry; gz -= pull * rz; }
    if (yi < 6) gy += (6 - yi) * 6;
    if (yi > 70) gy -= (yi - 70) * 4;
    // painted wind, thermals
    for (const w of S.winds) {
      const d2 = (xi - w.x) ** 2 + (yi - w.y) ** 2 + (zi - w.z) ** 2;
      const g = w.life * Math.exp(-d2 / (2 * w.r * w.r));
      gx += g * w.wx * 1.4; gz += g * w.wz * 1.4;
    }
    for (const th of S.thermals) {
      const ddx = xi - th.x, ddz = zi - th.z, d = Math.hypot(ddx, ddz);
      if (d < th.r) { const g = th.life * (1 - d / th.r); gy += 14 * g; gx += (-ddz / (d + 1)) * 6 * g; gz += (ddx / (d + 1)) * 6 * g; }
    }
    // no more than A_MAX (a bit more when panicking)
    const gl = Math.hypot(gx, gy, gz), amax = A_MAX * (1 + 0.6 * a);
    if (gl > amax) { gx *= amax / gl; gy *= amax / gl; gz *= amax / gl; }
    ax[i] = gx; ay[i] = gy; az[i] = gz;
    hx += ux; hy += uy; hz += uz; cx += xi; cy += yi; cz += zi;
  }
  // move everyone at once (so the order of the loop doesn't matter)
  for (let i = 0; i < n; i++) {
    let x = vx[i] + ax[i] * DT, y = vy[i] + ay[i] * DT, z = vz[i] + az[i] * DT;
    const v = Math.hypot(x, y, z) || 1;
    const top = V_MAX * (1 + 0.35 * next[i]);
    const c = v > top ? top / v : v < V_MIN ? V_MIN / v : 1;
    x *= c; y *= c; z *= c;
    // wings: flap harder when speeding up or climbing, glide otherwise (see "How birds are drawn")
    const along = (ax[i] * x + ay[i] * y + az[i] * z) / v;
    const work = Math.max(0, along) / A_MAX + Math.max(0, y) / V_MAX;
    const ampT = 0.15 + Math.min(0.95, 2.2 * work) + 0.4 * next[i];
    S.amp[i] += (ampT - S.amp[i]) * 0.1;
    S.phase[i] += DT * TAU * (8 + 6 * next[i]) * (S.amp[i] > 0.22 ? 1 : 0.3);
    // bank into the turn: sideways acceleration over gravity
    const lat = Math.hypot(ax[i] - (along * x) / v, az[i] - (along * z) / v) * Math.sign((x * az[i] - z * ax[i]) || 1);
    S.bank[i] += (Math.atan2(lat, 9.8) - S.bank[i]) * 0.15;
    vx[i] = x; vy[i] = y; vz[i] = z;
    px[i] += x * DT; py[i] += y * DT; pz[i] += z * DT;
    alarm[i] = next[i]; fx[i] = nfx[i]; fy[i] = nfy[i]; fz[i] = nfz[i];
  }
  S.saw = saw; S.alarmed = alarmed;
  S.pol = Math.hypot(hx, hy, hz) / n;
  S.centre.set(cx / n, cy / n, cz / n);
  stepHawks(S, P);
  S.t += DT;
  for (const list of [S.winds, S.thermals, S.decoys]) for (let q = list.length - 1; q >= 0; q--) { list[q].life -= DT / list[q].span; if (list[q].life <= 0) list.splice(q, 1); }
  S.flashes = S.flashes.filter((f) => S.t - f.t < 1.2);
  while (S.catchTimes.length && S.catchTimes[0] < S.t - 60) S.catchTimes.shift();
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function stepHawks(S, P) {
  const { n, px, py, pz, vx, vy, vz, iso } = S;
  const want = Math.round(P.hawks ?? 2);
  while (S.hawks.length < want) S.hawks.push(makeHawk(S));
  if (S.hawks.length > want) S.hawks.length = want;
  const style = Math.round(P.hunt ?? 2);
  const agility = P.agility ?? 1;
  for (const h of S.hawks) {
    let aim = null, speed = HAWK_CRUISE;
    if (h.rest > 0) {
      // after a catch (or at the start): climb and circle wide of the flock
      h.rest -= DT;
      tmp.copy(h.p).sub(S.centre); tmp.y = 0;
      const d = tmp.length() || 1;
      aim = tmp2.set(h.p.x - (tmp.z / d) * 20 + (tmp.x / d) * (d < 45 ? 20 : -10), S.centre.y + 18, h.p.z + (tmp.x / d) * 20 + (tmp.z / d) * (d < 45 ? 20 : -10));
    } else {
      // a decoy within 60 m beats any bird
      let dec = null, dd = 60;
      for (const de of S.decoys) { const d = h.p.distanceTo(de.p); if (d < dd) { dd = d; dec = de; } }
      if (dec) {
        aim = tmp2.copy(dec.p); speed = HAWK_ATTACK;
        if (dd < 1.5) { dec.life = 0; S.flashes.push({ p: dec.p.clone(), t: S.t, decoy: true }); h.rest = 1.5; }
      } else {
        // pick a target
        if (style !== 2 || h.target < 0 || S.t > h.lockUntil) {
          let best = -1, score = -Infinity;
          for (let i = 0; i < n; i++) {
            const dx = px[i] - h.p.x, dy = py[i] - h.p.y, dz = pz[i] - h.p.z, d = Math.hypot(dx, dy, dz);
            const sc = style === 2 ? (d < 45 ? iso[i] * 4 - d * 0.05 : -d) : -d;
            if (sc > score) { score = sc; best = i; }
          }
          h.target = best; h.lockUntil = S.t + 3;
        }
        const i = h.target;
        if (i >= 0) {
          aim = tmp2.set(px[i], py[i], pz[i]);
          const d = aim.distanceTo(h.p);
          if (style === 1) {
            // aim ahead: where the bird will be when the hawk gets there
            const tGo = Math.min(1.5, d / HAWK_ATTACK);
            aim.x += vx[i] * tGo; aim.y += vy[i] * tGo; aim.z += vz[i] * tGo;
          }
          speed = d < 25 ? HAWK_ATTACK : HAWK_CRUISE;
          // anything within reach is caught, not only the target
          for (let j = 0; j < n; j++) {
            const ddx = px[j] - h.p.x, ddy = py[j] - h.p.y, ddz = pz[j] - h.p.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz < CATCH * CATCH) { catchBird(S, j); h.rest = 2.5; h.target = -1; break; }
          }
        }
      }
    }
    // steer: limited by agility, faster than a bird but turning worse
    tmp.copy(aim).sub(h.p).normalize().multiplyScalar(speed).sub(h.v).multiplyScalar(2.5);
    const amax = HAWK_A * agility;
    if (tmp.length() > amax) tmp.setLength(amax);
    for (const th of S.thermals) { const d = Math.hypot(h.p.x - th.x, h.p.z - th.z); if (d < th.r) tmp.y += 10 * th.life * (1 - d / th.r); }
    for (const w of S.winds) { const d2 = h.p.distanceToSquared(tmp2.set(w.x, w.y, w.z)); const g = w.life * Math.exp(-d2 / (2 * w.r * w.r)); tmp.x += g * w.wx; tmp.z += g * w.wz; }
    const lateral = tmp.clone().sub(tmp2.copy(h.v).setLength(tmp.dot(h.v) / (h.v.length() || 1)));
    h.bank += (Math.atan2(lateral.length() * Math.sign(h.v.x * tmp.z - h.v.z * tmp.x || 1), 9.8) - h.bank) * 0.1;
    h.v.addScaledVector(tmp, DT);
    h.p.addScaledVector(h.v, DT);
    if (h.p.y < 3) { h.p.y = 3; h.v.y = Math.abs(h.v.y); }
    h.amp += ((speed > HAWK_CRUISE ? 0.75 : 0.3) - h.amp) * 0.05;
    h.phase += DT * TAU * 4;
    h.trail.push(h.p.clone());
    if (h.trail.length > 110) h.trail.shift();
  }
}
function catchBird(S, j) {
  S.caught++; S.catchTimes.push(S.t);
  S.flashes.push({ p: new THREE.Vector3(S.px[j], S.py[j], S.pz[j]), t: S.t });
  // rejoin from the far edge of the roost, flying in
  const a = S.rnd() * TAU;
  S.px[j] = ROOST.x + ROOST_R * Math.cos(a); S.pz[j] = ROOST.z + ROOST_R * Math.sin(a); S.py[j] = ROOST.y + (S.rnd() - 0.3) * 10;
  S.vx[j] = -10 * Math.cos(a); S.vz[j] = -10 * Math.sin(a); S.vy[j] = 0;
  S.alarm[j] = 0; S.next[j] = 0;
}

// ---------- looks ----------
// Three looks for the same simulation: starlings at dusk, a sardine run, and a rumour spreading through a crowd.
const PRESETS = [
  { key: 'starlings', label: 'Murmuration', bird: 'bird', top: [0.16, 0.2, 0.42], hor: [1.0, 0.55, 0.32], bot: [0.07, 0.05, 0.08], sun: [1.0, 0.7, 0.4],
    base: [0.012, 0.01, 0.016], alarm: [0.55, 0.36, 0.2], hawk: [0.16, 0.03, 0.02], wake: [1.0, 0.85, 0.7], fog: [0.75, 0.48, 0.36], fogK: 0.0035, glow: 0.45, thr: 0.95, lit: 0.0,
    names: ['birds', 'hawk', 'hawks'] },
  { key: 'sardines', label: 'Sardine run', bird: 'fish', top: [0.05, 0.25, 0.4], hor: [0.02, 0.12, 0.22], bot: [0.0, 0.02, 0.05], sun: [0.3, 0.6, 0.7],
    base: [0.55, 0.65, 0.72], alarm: [1.4, 1.5, 1.6], hawk: [0.42, 0.52, 0.62], wake: [0.5, 0.85, 1.0], fog: [0.02, 0.12, 0.2], fogK: 0.012, glow: 0.8, thr: 0.8, lit: 1.0,
    names: ['sardines', 'dolphin', 'dolphins'] },
  { key: 'rumours', label: 'Rumour mill', bird: 'dot', top: [0.01, 0.01, 0.03], hor: [0.03, 0.02, 0.06], bot: [0.0, 0.0, 0.01], sun: [0, 0, 0],
    base: [0.25, 0.35, 0.7], alarm: [2.2, 0.5, 0.9], hawk: [2.4, 0.25, 0.15], wake: [1.0, 0.3, 0.3], fog: [0.0, 0.0, 0.02], fogK: 0.004, glow: 1.1, thr: 0.5, lit: 0.0,
    names: ['people', 'headline', 'headlines'] },
];

function birdGeometry(kind) {
  // positions, plus `aWing`: how far a vertex is out along a wing (or back along a fish), for the flap
  let P, Wg;
  if (kind === 'bird') {
    // nose +z, up +y; a diamond body, a tail fan, two swept wings
    const body = [[0, 0, 0.5], [0.07, 0, 0], [0, 0.05, 0.05], [-0.07, 0, 0], [0, -0.04, 0], [0, 0, -0.35]];
    const tri = [];
    const T = (a, b, c, wa = 0, wb = 0, wc = 0) => tri.push([a, b, c, wa, wb, wc]);
    const [n, r, t, l, b, tl] = body;
    T(n, r, t); T(n, t, l); T(n, b, r); T(n, l, b); T(tl, t, r); T(tl, l, t); T(tl, r, b); T(tl, b, l);
    T([0, 0, -0.3], [-0.13, 0, -0.55], [0.13, 0, -0.55]);
    T([0.05, 0.01, 0.16], [0.05, 0.01, -0.12], [0.78, 0.0, -0.12], 1, 1, 1);
    T([-0.05, 0.01, 0.16], [-0.78, 0.0, -0.12], [-0.05, 0.01, -0.12], 1, 1, 1);
    P = []; Wg = [];
    for (const [a, bb, c, wa, wb, wc] of tri) { P.push(...a, ...bb, ...c); Wg.push(wa, wb, wc); }
  } else if (kind === 'fish') {
    const g = new THREE.SphereGeometry(0.5, 8, 6).scale(0.1, 0.22, 1).toNonIndexed();
    P = Array.from(g.attributes.position.array); g.dispose();
    P.push(0, 0, -0.45, 0, 0.22, -0.72, 0, -0.22, -0.72);
    Wg = [];
    for (let k = 0; k < P.length; k += 3) Wg.push(0.5 - P[k + 2]);
  } else {
    const g = new THREE.OctahedronGeometry(0.22, 1);
    P = Array.from(g.attributes.position.array); g.dispose();
    Wg = P.filter((_, k) => k % 3 === 0).map(() => 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(Wg, 1));
  return geo;
}

// see docs/wiki/shaders.md and docs/wiki/instancing.md: one draw for every bird, wings flapped on the GPU
const BIRD_VERT = `
  attribute float aWing;
  attribute float aPhase;
  attribute float aAmp;
  attribute float aAlarm;
  uniform float uMode;
  varying float vAlarm;
  varying vec3 vW;
  void main() {
    vec3 p = position;
    if (uMode < 0.5) {
      // wings rotate about the body's long axis
      float ang = aAmp * sin(aPhase) * aWing;
      float r = abs(p.x);
      p.y += r * sin(ang) * 0.9;
      p.x = sign(p.x) * r * cos(ang);
    } else if (uMode < 1.5) {
      // fish: a wave runs down the body, growing towards the tail
      p.x += sin(aPhase - aWing * 4.0) * aAmp * 0.12 * aWing * aWing;
    }
    vAlarm = aAlarm;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const BIRD_FRAG = `
  uniform vec3 uBase, uAlarmCol, uFog, uLight;
  uniform float uFogK, uLit;
  varying float vAlarm;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
    float lam = 0.45 + 0.55 * abs(dot(n, uLight));
    vec3 col = mix(uBase, uAlarmCol, clamp(vAlarm, 0.0, 1.0));
    col *= mix(1.0, lam, uLit);
    float f = 1.0 - exp(-uFogK * length(vW - cameraPosition));
    gl_FragColor = vec4(mix(col, uFog, f), 1.0);
  }
`;
const SKY_VERT = `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `
  uniform vec3 uTop, uHor, uBot, uSun, uSunDir;
  varying vec3 vD;
  void main() {
    float y = vD.y;
    vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-y * 6.0, 0.0, 1.0), 0.5));
    float s = max(0.0, dot(normalize(vD), uSunDir));
    c += uSun * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// A smooth swirl with no sources or sinks (the curl of a field of sines): the hawks' wakes drift along it.
function curl(x, y, z, t, out) {
  const a = 0.21, b = 0.17, c = 0.19;
  out.set(
    -b * Math.cos(z * b + t) - 0.5 * Math.cos(y * 0.43 + t * 1.3),
    -c * Math.cos(x * c + t * 0.7) - 0.5 * Math.cos(z * 0.47 - t),
    -a * Math.cos(y * a + t * 1.1) - 0.5 * Math.cos(x * 0.41 + t * 0.8),
  );
  return out;
}

const LIVE = { pol: 0, saw: 0, alarmed: 0, caught: 0, perMin: 0, n: 0, preset: 0, metric: 0 };

export default {
  name: 'Hawks and Boids',
  description:
    'Reynolds\'s 1987 boids in 3D: a murmuration of up to 4,000 birds, each watching its 7 nearest neighbours as real ' +
    'starlings do, hunted by hawks. Panic spreads from bird to bird in waves, the flock fountains round each attack, ' +
    'and you can paint wind, drop thermals and set out decoys. Also as a sardine run and a rumour spreading through a crowd.',
  tags: ['emergence', 'boids', 'flocking', 'murmuration', 'predator prey', 'agent-based', 'collective behaviour', 'contagion'],
  category: 'Emergence',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    return { t };
  },

  latex: (params, hl) => {
    const P = PRESETS[LIVE.preset];
    const [many, one, ones] = P.names;
    const nb = LIVE.metric ? `\\text{within } ${R_METRIC}\\,\\text{m}` : `\\text{${K_NEAR} nearest}`;
    let line;
    if (LIVE.preset === 2) {
      line = LIVE.saw > 0
        ? `${LIVE.saw} ${LIVE.saw === 1 ? 'person has' : 'people have'} seen the ${one}. ${LIVE.alarmed} are passing it on.`
        : LIVE.alarmed > 20 ? `Nobody has seen the ${one} for a while. ${LIVE.alarmed} are still passing it on.` : 'A calm crowd, all drifting the same way. Suspicious.';
    } else if (LIVE.saw > 0) {
      line = `${LIVE.saw} ${many} saw a ${one}. ${LIVE.alarmed} panicked.`;
    } else if (LIVE.pol > 0.85) line = LIVE.preset === 0 ? 'Flying as one. The hawks find this rude.' : 'No leader, no plan, mostly fine.';
    else line = `Splitting and regrouping around the ${ones}.`;
    return (
      '\\begin{aligned}' +
      '\\dot{\\mathbf v}_i &= k_s\\,\\text{sep} + k_a\\,\\text{align} + k_c\\,\\text{cohere} + k_f\\,a_i\\,\\hat{\\mathbf f}_i + \\mathbf w(\\mathbf x_i) \\\\' +
      `a_i &\\leftarrow \\max\\big(\\text{saw},\\ ${hl(params.contagion ?? 0.8, 2)}\\max_{j} a_j\\big)\\quad j \\in ${nb} \\\\` +
      `\\left|\\langle \\hat{\\mathbf v} \\rangle\\right| &= ${hl(LIVE.pol, 2)},\\ \\ \\text{alarmed } ${hl(LIVE.alarmed, 0)}\\ (\\text{saw it: } ${hl(LIVE.saw, 0)}) \\\\` +
      `\\text{caught} &= ${hl(LIVE.caught, 0)}\\ \\ (${hl(LIVE.perMin, 0)}\\,/\\text{min}) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, label: 'Speed' },
    birds: { value: 1800, min: 300, max: 4000, step: 100, rebuild: true, group: 'Flock', label: 'Birds', help: 'How many. Over about 3,000 may slow a phone down.' },
    metric: { value: 0, min: 0, max: 1, step: 1, group: 'Flock', label: 'Neighbours (0 = 7 nearest, 1 = within 3 m)', help: '0 is how real starlings do it (topological). 1 is Reynolds\'s 1987 rule (metric): watch stretched flocks fall apart.' },
    blindSpot: { value: 60, min: 0, max: 160, step: 5, group: 'Flock', label: 'Blind spot behind (degrees)', help: 'Neighbours and hawks in this cone behind a bird go unseen.' },
    contagion: { value: 0.8, min: 0, max: 0.98, step: 0.01, group: 'Flock', label: 'Panic contagion', help: 'How much of a neighbour\'s panic a bird copies. 0: only birds that see the hawk react. Near 1: waves cross the whole flock.' },
    hawks: { value: 2, min: 0, max: 6, step: 1, group: 'Hawks', label: 'Hawks' },
    agility: { value: 1, min: 0.3, max: 2.5, step: 0.05, group: 'Hawks', label: 'Hawk agility', help: 'How hard a hawk can turn. Birds turn at up to 38 m/s²; a hawk at 24 × this.' },
    hunt: { value: 2, min: 0, max: 2, step: 1, group: 'Hawks', label: 'Hunting style (0 nearest, 1 aim ahead, 2 straggler)', help: '0: chase the nearest bird (Reynolds 1987). 1: fly to where it will be. 2: lock onto the bird furthest from its neighbours.' },
    size: { value: 2.5, min: 1, max: 5, step: 0.1, group: 'Look', label: 'Drawn size', help: 'Birds are drawn this many times life size so you can see them.' },
    glow: { value: 1, min: 0, max: 2, group: 'Look', label: 'Glow' },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    const narrow = ctx.size.width < 600;
    const n = Math.round(narrow ? Math.min(ctx.params.birds ?? 1800, 1200) : ctx.params.birds ?? 1800);
    const S = createWorld(n, 7);
    const glow = createGlow(ctx, { fov: 50, strength: 0.45, threshold: 0.95, exposure: 1, vignette: 0.45 });
    camera.near = 0.1; camera.far = 1200;
    camera.position.set(ROOST.x - 22, ROOST.y + 4, ROOST.z + 44);
    ctx.controls?.target.copy(ROOST);
    ctx.controls?.update();

    const sunDir = new THREE.Vector3(-0.6, 0.06, -0.8).normalize();
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: sunDir } },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
    sky.frustumCulled = false;
    scene.add(sky);

    const birdMat = new THREE.ShaderMaterial({
      vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG, side: THREE.DoubleSide,
      uniforms: { uMode: { value: 0 }, uBase: { value: new THREE.Color() }, uAlarmCol: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uFogK: { value: 0.004 }, uLit: { value: 0 }, uLight: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() } },
    });
    const hawkMat = birdMat.clone();
    // flock and hawks each need their own copy of each shape, because the per-bird numbers live on the geometry
    const kinds = ['bird', 'fish', 'dot'];
    const geos = Object.fromEntries(kinds.map((k) => [k, birdGeometry(k)]));
    const hawkGeos = Object.fromEntries(kinds.map((k) => [k, birdGeometry(k)]));
    const attrs = (count) => ({
      aPhase: new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
      aAmp: new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
      aAlarm: new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
    });
    const flockAttrs = attrs(n), hawkAttrs = attrs(6);
    const flock = new THREE.InstancedMesh(geos.bird, birdMat, n);
    const hawkMesh = new THREE.InstancedMesh(hawkGeos.bird, hawkMat, 6);
    for (const m of [flock, hawkMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }

    // see docs/wiki/lines-and-points.md: hawk wakes, tools, catch flashes
    const wakes = createFatLines({ maxSegments: 6 * 110 * 2, width: 2.2 });
    const marks = createFatLines({ maxSegments: 3000, width: 1.6 });
    for (const l of [wakes, marks]) { l.material.blending = THREE.AdditiveBlending; l.material.transparent = true; l.material.depthWrite = false; scene.add(l.object); }

    // ---------- the panel: looks and tools ----------
    const host = ctx.renderer.domElement.parentElement || document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;right:14px;bottom:86px;z-index:6;width:min(330px,calc(100% - 28px));background:rgba(5,8,16,0.78);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:9px 11px;color:#d7e0ea;font:12px system-ui,sans-serif;backdrop-filter:blur(6px);box-sizing:border-box;';
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.innerHTML = '<div data-r="looks" style="display:flex;gap:5px;margin-bottom:6px"></div><div data-r="tools" style="display:flex;gap:5px"></div><div data-r="hint" style="margin-top:6px;color:#8a9bb0;line-height:1.3"></div>';
    host.appendChild(panel);
    const ui = { preset: 0, tool: 'look', drag: null };
    const TOOLS = [
      ['look', 'Look', 'Drag to look around. The camera follows the flock.'],
      ['wind', 'Wind', 'Drag across the sky to paint a gust. It fades after 8 seconds.'],
      ['thermal', 'Thermal', 'Tap to drop a column of rising air. Birds and hawks ride it up.'],
      ['decoy', 'Decoy', 'Tap to set out a decoy. Hawks within 60 m go for it instead.'],
    ];
    const btn = (row, text, on) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text;
      b.style.cssText = 'flex:1 1 0;padding:4px 4px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:#cdd8e4;font:600 11.5px system-ui;cursor:pointer;white-space:nowrap;';
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); paint(); });
      panel.querySelector(`[data-r="${row}"]`).appendChild(b);
      return b;
    };
    const lookBtns = PRESETS.map((p, k) => btn('looks', p.label, () => { ui.preset = k; applyPreset(); }));
    const toolBtns = TOOLS.map(([key, label]) => btn('tools', label, () => { ui.tool = key; if (ctx.controls) ctx.controls.enabled = key === 'look'; }));
    const paint = () => {
      lookBtns.forEach((b, k) => { const on = ui.preset === k; b.style.background = on ? 'rgba(255,200,140,0.16)' : 'transparent'; b.style.borderColor = on ? '#ffc88c' : 'rgba(255,255,255,0.18)'; });
      toolBtns.forEach((b, k) => { const on = ui.tool === TOOLS[k][0]; b.style.background = on ? 'rgba(140,200,255,0.16)' : 'transparent'; b.style.borderColor = on ? '#8cc8ff' : 'rgba(255,255,255,0.18)'; });
      panel.querySelector('[data-r="hint"]').textContent = TOOLS.find((t) => t[0] === ui.tool)[2];
    };
    const applyPreset = () => {
      const P = PRESETS[ui.preset];
      skyMat.uniforms.uTop.value.setRGB(...P.top); skyMat.uniforms.uHor.value.setRGB(...P.hor);
      skyMat.uniforms.uBot.value.setRGB(...P.bot); skyMat.uniforms.uSun.value.setRGB(...P.sun);
      for (const [mat, base] of [[birdMat, P.base], [hawkMat, P.hawk]]) {
        mat.uniforms.uMode.value = P.bird === 'bird' ? 0 : P.bird === 'fish' ? 1 : 2;
        mat.uniforms.uBase.value.setRGB(...base);
        mat.uniforms.uAlarmCol.value.setRGB(...(mat === hawkMat ? base : P.alarm));
        mat.uniforms.uFog.value.setRGB(...P.fog);
        mat.uniforms.uFogK.value = P.fogK;
        mat.uniforms.uLit.value = P.lit;
      }
      flock.geometry = geos[P.bird]; hawkMesh.geometry = hawkGeos[P.bird];
      for (const [k, a] of Object.entries(flockAttrs)) geos[P.bird].setAttribute(k, a);
      for (const [k, a] of Object.entries(hawkAttrs)) hawkGeos[P.bird].setAttribute(k, a);
      glow.threshold = P.thr;
      state.preset = P;
    };
    const state = {};

    // ---------- tools: pointer on the sky ----------
    const canvas = ctx.renderer.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = (e) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      plane.constant = -S.centre.y;
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, p) ? p : null;
    };
    const onDown = (e) => {
      if (ui.tool === 'look') return;
      const p = hitPoint(e);
      if (!p) return;
      if (ui.tool === 'thermal') { S.thermals.push({ x: p.x, z: p.z, r: 9, life: 1, span: 20 }); if (S.thermals.length > 6) S.thermals.shift(); }
      else if (ui.tool === 'decoy') { S.decoys.push({ p, life: 1, span: 12 }); if (S.decoys.length > 4) S.decoys.shift(); }
      else if (ui.tool === 'wind') ui.drag = p;
    };
    const onMove = (e) => {
      if (ui.tool !== 'wind' || !ui.drag) return;
      const p = hitPoint(e);
      if (!p) return;
      const d = p.clone().sub(ui.drag);
      if (d.length() > 3) {
        const w = d.clone().setLength(Math.min(18, d.length() * 0.9));
        S.winds.push({ x: ui.drag.x, y: S.centre.y, z: ui.drag.z, wx: w.x, wz: w.z, r: 12, life: 1, span: 8 });
        if (S.winds.length > 24) S.winds.shift();
        ui.drag = p;
      }
    };
    const onUp = () => { ui.drag = null; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    Object.assign(state, {
      S, glow, sky, skyMat, birdMat, hawkMat, geos, hawkGeos, flock, hawkMesh, flockAttrs, hawkAttrs, wakes, marks, panel, ui,
      canvas, onDown, onMove, onUp, acc: 0, m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler(),
      v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
      lastCentre: S.centre.clone(),
    });
    applyPreset();
    paint();
    return state;
  },

  update(ctx, state) {
    const { S, ui, wakes, marks, v, w, c } = state;
    const P = PRESETS[ui.preset];
    const { width, height } = ctx.size;
    wakes.setResolution(width, height);
    marks.setResolution(width, height);
    state.glow.strength = P.glow * (ctx.params.glow ?? 1);
    state.panel.style.display = document.body.dataset.view === 'clean' ? 'none' : '';
    if (ctx.controls && ui.tool !== 'look') ctx.controls.enabled = false;

    // fixed steps of 1/60 s, at most 3 per frame
    state.acc += Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1);
    let steps = 0;
    while (state.acc >= DT && steps < 3) { step(S, ctx.params); state.acc -= DT; steps++; }
    if (steps === 3) state.acc = 0;

    LIVE.pol = S.pol; LIVE.saw = S.saw; LIVE.alarmed = S.alarmed; LIVE.caught = S.caught; LIVE.n = S.n;
    LIVE.perMin = S.catchTimes.length * (60 / Math.max(10, Math.min(60, S.t)));
    LIVE.preset = ui.preset; LIVE.metric = (ctx.params.metric ?? 0) >= 0.5 ? 1 : 0;

    // the camera drifts with the flock
    if (ctx.controls) {
      v.copy(S.centre).sub(state.lastCentre).multiplyScalar(0.04);
      state.lastCentre.add(v);
      ctx.controls.target.add(v);
      ctx.camera.position.add(v);
    }

    // see docs/wiki/instancing.md: place every bird, nose along its velocity, banked into its turn
    const size = ctx.params.size ?? 2.5;
    const place = (mesh, at, k, x, y, z, vx, vy, vz, bank, phase, amp, alarm, sc) => {
      v.set(vx, vy, vz).normalize();
      state.m.lookAt(w.set(0, 0, 0), v.negate(), state.up);   // lookAt points -z at the target; our nose is +z
      state.q.setFromRotationMatrix(state.m);
      state.q.multiply(state.q2.setFromAxisAngle(w.set(0, 0, 1), -bank));
      state.m.compose(state.s.set(x, y, z), state.q, w.set(sc, sc, sc));
      mesh.setMatrixAt(k, state.m);
      at.aPhase.array[k] = phase; at.aAmp.array[k] = amp; at.aAlarm.array[k] = alarm;
    };
    for (let i = 0; i < S.n; i++) place(state.flock, state.flockAttrs, i, S.px[i], S.py[i], S.pz[i], S.vx[i], S.vy[i], S.vz[i], S.bank[i], S.phase[i], Math.min(1.2, S.amp[i]), Math.min(1, S.alarm[i] * 1.4), size * 0.2);
    S.hawks.forEach((h, k) => place(state.hawkMesh, state.hawkAttrs, k, h.p.x, h.p.y, h.p.z, h.v.x, h.v.y, h.v.z, h.bank, h.phase, h.amp, 0, size * 0.2 * (P.bird === 'dot' ? 4 : 2.6)));
    state.hawkMesh.count = S.hawks.length;
    for (const mesh of [state.flock, state.hawkMesh]) mesh.instanceMatrix.needsUpdate = true;
    for (const at of [state.flockAttrs, state.hawkAttrs]) for (const a of Object.values(at)) a.needsUpdate = true;

    // hawk wakes: the path behind each hawk, carried off along a swirl and fading
    wakes.reset();
    for (const h of S.hawks) {
      const T = h.trail.length;
      for (let q = 1; q < T; q++) {
        const age = (T - q) / 110;
        const drift = age * age * 9;
        curl(h.trail[q - 1].x * 0.3, h.trail[q - 1].y * 0.3, h.trail[q - 1].z * 0.3, S.t * 0.6, state.s);
        v.copy(h.trail[q - 1]).addScaledVector(state.s, drift);
        curl(h.trail[q].x * 0.3, h.trail[q].y * 0.3, h.trail[q].z * 0.3, S.t * 0.6, state.s);
        w.copy(h.trail[q]).addScaledVector(state.s, drift);
        const a = (1 - age) ** 2 * 0.5;
        c.setRGB(P.wake[0] * a, P.wake[1] * a, P.wake[2] * a);
        wakes.push(v, w, c);
      }
    }
    wakes.commit();

    // tools and catches
    marks.reset();
    const ring = (cx, cy, cz, r, col, a, vertical = false) => {
      for (let k = 0; k < 24; k++) {
        const a0 = (k / 24) * TAU, a1 = ((k + 1) / 24) * TAU;
        if (vertical) { v.set(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cz); w.set(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cz); }
        else { v.set(cx + r * Math.cos(a0), cy, cz + r * Math.sin(a0)); w.set(cx + r * Math.cos(a1), cy, cz + r * Math.sin(a1)); }
        c.setRGB(col[0] * a, col[1] * a, col[2] * a);
        marks.push(v, w, c);
      }
    };
    for (const th of S.thermals) {
      // a rising, turning helix of air
      for (let k = 0; k < 90; k++) {
        const u0 = k / 90, u1 = (k + 1) / 90;
        const y0 = 4 + u0 * 60, y1 = 4 + u1 * 60;
        const a0 = u0 * 18 + S.t * 1.5, a1 = u1 * 18 + S.t * 1.5;
        const r0 = th.r * (0.5 + 0.5 * u0), r1 = th.r * (0.5 + 0.5 * u1);
        v.set(th.x + r0 * Math.cos(a0), y0, th.z + r0 * Math.sin(a0));
        w.set(th.x + r1 * Math.cos(a1), y1, th.z + r1 * Math.sin(a1));
        const a = th.life * 0.35 * Math.sin(Math.PI * u0);
        c.setRGB(1.0 * a, 0.7 * a, 0.35 * a);
        marks.push(v, w, c);
      }
    }
    for (const wd of S.winds) {
      // short streaks along the gust
      const l = Math.hypot(wd.wx, wd.wz) || 1;
      for (let k = 0; k < 5; k++) {
        const ph = ((S.t * 0.8 + k / 5) % 1);
        const ox = (k - 2) * 2.5 * (-wd.wz / l), oz = (k - 2) * 2.5 * (wd.wx / l);
        v.set(wd.x + ox + wd.wx * (ph - 0.5) * 1.2, wd.y, wd.z + oz + wd.wz * (ph - 0.5) * 1.2);
        w.copy(v).add(state.s.set(wd.wx * 0.3, 0, wd.wz * 0.3));
        const a = wd.life * 0.6 * Math.sin(Math.PI * ph);
        c.setRGB(0.5 * a, 0.8 * a, 1.0 * a);
        marks.push(v, w, c);
      }
    }
    for (const de of S.decoys) { const pulse = 0.6 + 0.4 * Math.sin(S.t * 8); ring(de.p.x, de.p.y, de.p.z, 0.8 + 0.3 * pulse, [1.0, 0.85, 0.3], de.life * pulse, true); ring(de.p.x, de.p.y, de.p.z, 0.8 + 0.3 * pulse, [1.0, 0.85, 0.3], de.life * pulse); }
    for (const f of S.flashes) { const u = (S.t - f.t) / 1.2; ring(f.p.x, f.p.y, f.p.z, 0.5 + u * 5, f.decoy ? [1.0, 0.85, 0.3] : P.alarm, (1 - u) * 0.9, true); }
    marks.commit();
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.wakes.dispose(); state.marks.dispose();
    for (const g of [...Object.values(state.geos), ...Object.values(state.hawkGeos)]) g.dispose();
    state.birdMat.dispose(); state.hawkMat.dispose();
    state.sky.geometry.dispose(); state.skyMat.dispose();
    state.panel.remove();
    state.canvas.removeEventListener('pointerdown', state.onDown);
    state.canvas.removeEventListener('pointermove', state.onMove);
    window.removeEventListener('pointerup', state.onUp);
    if (ctx.controls) ctx.controls.enabled = true;
  },
};
