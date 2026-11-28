import * as THREE from 'three';
import { clamp01, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption, mood, beat } from '../lib/bit.js';

// The Empty Throne: ecological incumbency, and what happens when the incumbent leaves.
//
// After the dinosaur-killing asteroid 66 million years ago, small mammals that had lived under the dinosaurs
// for 150 million years grew, within about 25 million years, into elephants and whales. The niches were empty.
// Today the big-animal niches are held by one species. Since humans spread, most land mammals over 44 kg
// (the usual cut-off for "megafauna") have gone, and our biomass is about 8.6 times that of all wild mammals
// put together (Bar-On et al. 2018, by carbon). We are the incumbent sitting on the throne. This sketch
// lifts us off and lets three survivors that do well around us — brown rats, feral pigs, crows — try for it.
//
// The model (see docs/wiki/sketches/emptyThrone.md for the plain-English version):
//   • Each species is a point z = (x, y): x = log10(body mass in kg), y = way of life, from −1 (hunting in
//     water) through plants (−0.5), mixed diet (0) and meat (+0.5) to carrion and tools (+1).
//   • It climbs an adaptive landscape F (Lande 1976):  Δz = G ∇F(z) · Δt / T_gen  + drift.
//     F = a gentle "small generalist" hill + five empty niches (peaks) − crowding by neighbours
//         − H · σ((x − log10 44) / 0.22) · 3.2          ← the humans, H = 1 present, 0 gone.
//   • Generation time grows with size, T_gen = T₀ (M/M₀)^¼ (the usual quarter-power scaling), so big animals
//     evolve more slowly per year.
//   • A speed limit from real fossils: Evans et al. 2012 (PNAS 109:4187) found that mammal lineages needed at
//     least 1.6, 5.1 and 10 million generations to get 100, 1000 and 5000 times heavier. No species here may
//     grow faster than that curve (after a free first doubling). For crows (birds) that limit is borrowed.
//   • Species split (rate falls as the lineage fills up) and die out (rate rises where F is low).
//   • Body-plan fit: each lineage gets more out of the niches its anatomy suits (rats swim and run, pigs
//     browse and tusk, crows scavenge), a deliberate assumption, labelled as such.
// Prototyped in Node over 8 seeds: with the humans gone, by 30 My rats reach 100–650 kg (pack hunters,
// sometimes divers), pigs 0.6–1.3 t (browsers, apex predators, divers), crows ~15–25 kg flightless
// scavengers (or stay small when beaten to it). With the humans staying, nothing passes ~40 kg. Which
// lineage takes which peak differs from run to run: whoever arrives first keeps it. That is incumbency again.
//
// Loop: today (1 My with humans), the lift, 30 My of radiation, a hold, a rewind. A new seed every loop.

// ---------- the model ----------
const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// Founders: mass today, way of life, generation time in years.
const LINEAGES = [
  { key: 'rat', name: 'Brown rat', x0: Math.log10(0.35), y0: 0.0, tgen: 0.4, col: [0.35, 1.0, 0.62], css: '#5effa0', k: 0.35 },
  { key: 'pig', name: 'Feral pig', x0: Math.log10(80), y0: -0.15, tgen: 2.0, col: [1.0, 0.38, 0.55], css: '#ff6a90', k: 0.325 },
  { key: 'crow', name: 'Crow', x0: Math.log10(0.5), y0: 0.6, tgen: 3.5, col: [0.5, 0.62, 1.0], css: '#86a0ff', k: 0.57 },
];
// The empty niches. fit = how well a rat, pig, crow body plan suits it (an assumption).
const PEAKS = [
  { key: 'diver', label: 'Big diver', x: 2.3, y: -0.85, a: 2.0, fit: [1.25, 0.6, 0.55] },
  { key: 'browser', label: 'Forest browser', x: 2.55, y: -0.4, a: 2.1, fit: [0.6, 1.25, 0.4] },
  { key: 'pack', label: 'Pack hunter', x: 1.6, y: 0.4, a: 1.7, fit: [1.3, 0.55, 0.9] },
  { key: 'apex', label: 'Apex predator', x: 2.65, y: 0.62, a: 2.3, fit: [0.6, 1.2, 1.0] },
  { key: 'scav', label: 'Clever scavenger', x: 0.85, y: 0.9, a: 1.8, fit: [0.6, 0.4, 1.4] },
];
const X44 = Math.log10(44);
const SX = 0.42, SY = 0.17;
const HUMAN_DEPTH = 3.2, HUMAN_EDGE = 0.22;

// Fitness potential F and its gradient (without crowding). lin = −1 gives the shared landscape that is drawn.
function land(x, y, H, lin = -1) {
  let F = 0.9 * Math.exp(-(y * y) / 0.35 - ((x - 0.4) / 1.7) ** 2);
  let Fx = F * (-2 * (x - 0.4) / 1.7 ** 2), Fy = F * (-2 * y / 0.35);
  const p0 = 0.8 * Math.exp(-((x - 1.85) ** 2) / 0.18 - ((y + 0.15) ** 2) / 0.08);   // today's feral-pig niche
  F += p0; Fx += p0 * (-(x - 1.85) / 0.09); Fy += p0 * (-(y + 0.15) / 0.04);
  for (const p of PEAKS) {
    const g = p.a * (lin < 0 ? 1 : p.fit[lin]) * Math.exp(-((x - p.x) ** 2) / (2 * SX * SX) - ((y - p.y) ** 2) / (2 * SY * SY));
    F += g; Fx += g * (-(x - p.x) / (SX * SX)); Fy += g * (-(y - p.y) / (SY * SY));
  }
  const s = 1 / (1 + Math.exp(-(x - X44) / HUMAN_EDGE));
  F -= HUMAN_DEPTH * H * s; Fx -= (HUMAN_DEPTH * H * s * (1 - s)) / HUMAN_EDGE;
  if (x < -1.3) { F -= 4 * (x + 1.3) ** 2; Fx -= 8 * (x + 1.3); }
  if (x > 3.6) { F -= 4 * (x - 3.6) ** 2; Fx -= 8 * (x - 3.6); }
  if (Math.abs(y) > 1.05) { const e = Math.abs(y) - 1.05; F -= 6 * e * e; Fy -= 12 * e * Math.sign(y); }
  return [F, Fx, Fy];
}

// Evans et al. 2012: fewest generations seen for a 100×, 1000×, 5000× increase. Straight lines between.
const EVANS = [[0, 0], [1.6e6, 2], [5.1e6, 3], [10e6, Math.log10(5000)]];
function evansMaxLogFold(g) {
  for (let k = 1; k < EVANS.length; k++) if (g <= EVANS[k][0]) {
    const [g0, f0] = EVANS[k - 1], [g1, f1] = EVANS[k];
    return f0 + ((f1 - f0) * (g - g0)) / (g1 - g0);
  }
  const [g0, f0] = EVANS[2], [g1, f1] = EVANS[3];
  return f1 + ((f1 - f0) * (g - g1)) / (g1 - g0);
}
function evansMinGens(logFold) {
  for (let k = 1; k < EVANS.length; k++) if (logFold <= EVANS[k][1]) {
    const [g0, f0] = EVANS[k - 1], [g1, f1] = EVANS[k];
    return g0 + ((g1 - g0) * (logFold - f0)) / (f1 - f0);
  }
  const [g0, f0] = EVANS[2], [g1, f1] = EVANS[3];
  return g1 + ((g1 - g0) * (logFold - f1)) / (f1 - f0);
}

const T_PRE = -1;     // My: the run starts a million years before the humans go
const T_END = 30;     // My
const DT = 0.01;      // My per step (10,000 years)
const FRAME = 5;      // steps per stored frame (50,000 years)
const STEPS = Math.round((T_END - T_PRE) / DT);
const FRAMES = Math.floor(STEPS / FRAME) + 1;
const frameOf = (tMy) => ((tMy - T_PRE) / (DT * FRAME));
const G_SEL = 3e-7, D_DRIFT = 4e-9, CROWD = 1.1, CROWD_W2 = 2 * 0.2 * 0.2;
const LAMBDA = 0.9, MU = 0.12, CAP = 26;

// One history of life, computed a few hundred steps at a time so a new one can be prepared during a loop.
function createRun(seed, release) {
  const rnd = mulberry(seed);
  const sp = [];
  const live = [];
  const add = (lin, x, y, parent, frame, gens, xstart) => {
    const s = { id: sp.length, lin, born: frame, died: -1, parent, x, y, gens, xstart, F: 0, xs: [], ys: [], gs: [] };
    sp.push(s); live.push(s); return s;
  };
  for (let l = 0; l < 3; l++) {
    const L = LINEAGES[l];
    for (let k = 0; k < 4; k++) add(l, L.x0 + 0.15 * gauss(rnd), L.y0 + 0.08 * gauss(rnd), -1, 0, 0, L.x0);
  }
  let st = 0, frame = 0;
  const run = { sp, frames: 0, done: false, release, seed };
  run.step = (n) => {
    for (let q = 0; q < n && st <= STEPS; q++, st++) {
      const t = T_PRE + st * DT;
      const H = release ? (t < 0 ? 1 : 0) : 1;
      for (const s of live) {
        const L = LINEAGES[s.lin];
        let [F, Fx, Fy] = land(s.x, s.y, H, s.lin);
        for (const o of live) {
          if (o === s) continue;
          const dx = s.x - o.x, dy = (s.y - o.y) / 0.45;
          const g = CROWD * Math.exp(-(dx * dx + dy * dy) / CROWD_W2);
          F -= g; Fx += (g * 2 * dx) / CROWD_W2; Fy += (g * 2 * dy) / CROWD_W2 / 0.45;
        }
        s.F = F;
        const gens = (DT * 1e6) / (L.tgen * 10 ** (0.25 * (s.x - L.x0)));
        let nx = s.x + G_SEL * Fx * gens + Math.sqrt(2 * D_DRIFT * gens) * gauss(rnd);
        const ny = s.y + 0.6 * (G_SEL * Fy * gens + Math.sqrt(2 * D_DRIFT * gens) * gauss(rnd));
        if (t >= 0) {
          s.gens += gens;
          nx = Math.min(nx, s.xstart + Math.max(0.3, evansMaxLogFold(s.gens)));
        }
        s.x = nx; s.y = ny;
        if (t < 0) s.xstart = nx;
      }
      const counts = [0, 0, 0];
      for (const s of live) counts[s.lin]++;
      for (let k = live.length - 1; k >= 0; k--) {
        const s = live[k];
        const mu = MU + 1.2 / (1 + Math.exp(3 * (s.F - 0.2)));
        if (rnd() < mu * DT && counts[s.lin] > 1) { s.died = frame; live.splice(k, 1); counts[s.lin]--; continue; }
        if (rnd() < LAMBDA * Math.max(0, 1 - counts[s.lin] / CAP) * DT) {
          const c = add(s.lin, s.x + 0.06 * gauss(rnd), s.y + 0.05 * gauss(rnd), s.id, frame, s.gens, s.xstart);
          c.F = s.F; counts[s.lin]++;
        }
      }
      if (st % FRAME === 0) {
        for (const s of live) { s.xs.push(s.x); s.ys.push(s.y); s.gs.push(s.gens); }
        frame++;
        run.frames = frame;
      }
    }
    if (st > STEPS && !run.done) { for (const s of live) s.died = frame; run.done = true; }
    return run.done;
  };
  return run;
}

// A species' trait at a fractional frame (null if not alive then).
function traitAt(s, f) {
  const k = f - s.born;
  const last = (s.died < 0 ? s.xs.length : s.died - s.born) - 1;
  if (k < 0 || k > last || last < 0) return null;
  const k0 = Math.floor(k), k1 = Math.min(last, k0 + 1), u = k - k0;
  return { x: s.xs[k0] + (s.xs[k1] - s.xs[k0]) * u, y: s.ys[k0] + (s.ys[k1] - s.ys[k0]) * u, g: s.gs[k0] + (s.gs[k1] - s.gs[k0]) * u };
}

function nicheOf(x, y) {
  let best = null, bd = 0.5;
  for (const p of PEAKS) {
    const d = Math.hypot((x - p.x) / 1.0, (y - p.y) / 0.4);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const EPITHET = { diver: 'natator', browser: 'frondator', pack: 'lupinus', apex: 'tyrannus', scav: 'faber' };
const ROLE = {
  rat: { diver: 'giant diving rat', browser: 'grazing rat', pack: 'pack-hunting rat', apex: 'apex rat', scav: 'scavenging rat', none: 'rat' },
  pig: { diver: 'river-diving pig', browser: 'forest-browsing pig', pack: 'pack-hunting pig', apex: 'tusked apex predator', scav: 'scavenging pig', none: 'pig' },
  crow: { diver: 'flightless diving crow', browser: 'grazing ground crow', pack: 'flightless pack crow', apex: 'flightless terror crow', scav: 'tool-using scavenger crow', none: 'crow' },
};
function describe(lin, x, y) {
  const L = LINEAGES[lin];
  const p = nicheOf(x, y);
  const big = x > X44;
  const flightless = lin === 2 && x > Math.log10(2);
  const genus = lin === 0 ? (big ? 'Megarattus' : 'Rattus') : lin === 1 ? (big && x > 2.3 ? 'Megasus' : 'Sus') : flightless ? 'Terrocorvus' : 'Corvus';
  const epithet = p ? EPITHET[p.key] : lin === 0 ? 'norvegicus' : lin === 1 ? 'scrofa' : 'corone';
  let role = ROLE[L.key][p ? p.key : 'none'];
  if (!p && flightless) role = 'flightless crow';
  return { genus, epithet, role, niche: p, flightless };
}

// ---------- the timeline ----------
const PRE = 9, LIFT = 4, RAD = 46, HOLD = 6, RESET = 2.5;
const LOOP = PRE + LIFT + RAD + HOLD + RESET;
const RAD_POW = 1.7;
function tMyOf(local) {
  if (local < PRE) return T_PRE + (local / PRE) * -T_PRE;
  if (local < PRE + LIFT) return 0;
  if (local < PRE + LIFT + RAD) return T_END * ((local - PRE - LIFT) / RAD) ** RAD_POW;
  return T_END;
}
function localOf(tMy) {
  if (tMy <= 0) return ((tMy - T_PRE) / -T_PRE) * PRE;
  return PRE + LIFT + RAD * (tMy / T_END) ** (1 / RAD_POW);
}
function motionOf(t) {
  const slot = Math.floor(t / LOOP);
  const local = t - slot * LOOP;
  const phase = local < PRE ? 'today' : local < PRE + LIFT ? 'lift' : local < PRE + LIFT + RAD ? 'radiate' : local < LOOP - RESET ? 'hold' : 'reset';
  const lift = phase === 'today' ? 0 : phase === 'lift' ? smooth((local - PRE) / LIFT) : phase === 'reset' ? 1 - smooth((local - (LOOP - RESET)) / RESET) : 1;
  return {
    slot, local, phase, lift, tMy: tMyOf(local),
    // filled in by update()
    world: 1, counts: [0, 0, 0], maxKg: [0, 0, 0], big: null, dBig: 0, claimed: 0,
  };
}

// ---------- drawing helpers ----------
// see docs/wiki/shaders.md: the landscape's height is computed on the GPU from the same formula as land().
const WX = 2.6, WZ = 4.2, XC = 1.1, YS = 0.85;
const toX = (x) => (x - XC) * WX;
const toZ = (y) => -y * WZ;
const heightOf = (F) => Math.max(-3.2, F) * YS;

const PEAK_GLSL = PEAKS.map((p) => `F += ${p.a.toFixed(3)} * exp(-pow(x - ${p.x.toFixed(3)}, 2.0) / ${(2 * SX * SX).toFixed(4)} - pow(y - ${p.y.toFixed(3)}, 2.0) / ${(2 * SY * SY).toFixed(4)});`).join('\n');
const LAND_GLSL = `
  float landF(float x, float y, float H) {
    float F = 0.9 * exp(-(y * y) / 0.35 - pow((x - 0.4) / 1.7, 2.0));
    F += 0.8 * exp(-pow(x - 1.85, 2.0) / 0.18 - pow(y + 0.15, 2.0) / 0.08);
    ${PEAK_GLSL}
    F -= ${HUMAN_DEPTH.toFixed(2)} * H / (1.0 + exp(-(x - ${X44.toFixed(4)}) / ${HUMAN_EDGE.toFixed(3)}));
    return F;
  }
`;
const SURF_VERT = `
  uniform float uH;
  varying float vF;
  varying vec2 vT;
  varying vec3 vW;
  ${LAND_GLSL}
  void main() {
    vec3 p = position;
    float x = p.x / ${WX.toFixed(2)} + ${XC.toFixed(2)};
    float y = -p.z / ${WZ.toFixed(2)};
    float F = landF(x, y, uH);
    vF = F; vT = vec2(x, y);
    p.y = max(-3.2, F) * ${YS.toFixed(2)};
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SURF_FRAG = `
  uniform float uH;
  uniform vec3 uPeakCol[${PEAKS.length}];
  uniform vec2 uPeakXY[${PEAKS.length}];
  varying float vF;
  varying vec2 vT;
  varying vec3 vW;
  void main() {
    float x = vT.x, y = vT.y;
    // height colour: deep blue-black valleys, teal slopes
    float h = smoothstep(-1.0, 2.6, vF);
    vec3 col = mix(vec3(0.012, 0.016, 0.035), vec3(0.03, 0.12, 0.14), h);
    // contour lines of F, every 0.25
    float c = vF * 4.0;
    float lw = fwidth(c);
    float line = 1.0 - smoothstep(0.0, 1.2 * lw, abs(fract(c + 0.5) - 0.5));
    col += line * mix(vec3(0.04, 0.09, 0.12), vec3(0.12, 0.3, 0.32), h) * 0.9;
    // body-mass decades (0.1 kg, 1 kg, 10 kg, 100 kg, 1 t) and the 44 kg line
    float dx = fwidth(x);
    float dec = 1.0 - smoothstep(0.0, 1.5 * dx, abs(fract(x + 0.5) - 0.5));
    col += dec * vec3(0.05, 0.06, 0.09);
    float m44 = 1.0 - smoothstep(0.0, 2.0 * dx, abs(x - ${X44.toFixed(4)}));
    col += m44 * vec3(0.35, 0.22, 0.06) * (0.35 + 0.65 * uH) * step(0.5, fract(y * 8.0));
    // the humans' crater glows amber while they're here
    float s = 1.0 / (1.0 + exp(-(x - ${X44.toFixed(4)}) / ${HUMAN_EDGE.toFixed(3)}));
    col += uH * s * vec3(0.16, 0.08, 0.02) * (0.6 + 0.4 * line);
    // niches glow in the colour of whoever holds them
    for (int k = 0; k < ${PEAKS.length}; k++) {
      vec2 d = (vec2(x, y) - uPeakXY[k]) / vec2(${SX.toFixed(2)}, ${SY.toFixed(2)});
      float g = exp(-0.5 * dot(d, d));
      col += uPeakCol[k] * g * (0.25 + 0.75 * line);
    }
    // fade out at the edges into the background
    float e = smoothstep(-1.45, -1.0, x) * smoothstep(3.75, 3.3, x) * smoothstep(1.2, 0.95, abs(y));
    gl_FragColor = vec4(col * e, 1.0);
  }
`;
const ORB_VERT = `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main() {
    vP = normalize(position);
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const ORB_FRAG = `
  uniform float uFade; uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    float fr = pow(1.0 - max(0.0, dot(vN, vV)), 2.5);
    // city lights: a speckle of tiny sparks that twinkle
    vec3 q = floor(vP * 46.0);
    float sp = step(0.86, hash(q)) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(q + 7.0) * 40.0));
    vec3 col = vec3(1.0, 0.62, 0.22) * (0.08 + 1.6 * fr) + vec3(1.0, 0.8, 0.45) * sp * 0.9;
    gl_FragColor = vec4(col * uFade, 1.0);
  }
`;
const SPRITE_VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(2.0, aSize * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPRITE_FRAG = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vColor * (exp(-d * d * 9.0) + exp(-d * d * 2.2) * 0.25), 1.0);
  }
`;

// ---------- the creature drawer (2D canvas) ----------
// Side views built from a handful of shapes whose proportions follow the species' traits. A sketch of a
// body plan, not a reconstruction.
function drawCreature(g, lin, x, y, scale, colour, alpha = 1) {
  const L = LINEAGES[lin];
  const lenM = L.k * Math.cbrt(10 ** x);            // body length in metres, from mass
  const s = lenM * scale;                            // pixels
  const aq = clamp01((-y - 0.45) / 0.35);            // water
  const br = clamp01(1 - Math.abs(y + 0.4) / 0.3);   // plants
  const hu = clamp01((y - 0.15) / 0.35) * clamp01(1 - (y - 0.8) / 0.2); // meat
  const sc = clamp01((y - 0.7) / 0.2);               // carrion and tools
  const grow = clamp01((x - L.x0) / 2.2);            // how far from the founder
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = colour;
  g.fillStyle = 'rgba(6,10,18,0.85)';
  g.lineWidth = Math.max(1.2, Math.min(2.4, s / 60));
  g.shadowColor = colour;
  g.shadowBlur = 10;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const ell = (cx, cy, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); g.fill(); g.stroke(); };
  const line = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.stroke(); };
  const legs = (xs, top, len, w) => { for (const lx of xs) { g.lineWidth = w; line([lx, top, lx + 0.02 * s, top + len]); } };
  if (lin === 0) {
    // rat: long body, pointed snout, round ear, long tail
    const rx = 0.5 * s * (1 + 0.25 * aq), ry = 0.2 * s * (1 + 0.3 * hu * grow + 0.15 * br - 0.25 * aq);
    const legL = 0.14 * s * (1 + 1.6 * hu * grow + 0.8 * br * grow) * (1 - 0.75 * aq);
    const cy = -(legL + ry * 0.85);
    const base = g.lineWidth;
    legs([-0.32 * s, -0.25 * s, 0.25 * s, 0.33 * s], cy + ry * 0.6, legL + ry * 0.25, base * (1 + 1.5 * grow));
    g.lineWidth = base;
    if (aq > 0.3) { ell(-0.3 * s, -0.04 * s, 0.12 * s * aq, 0.03 * s, 0.3); ell(0.3 * s, -0.04 * s, 0.1 * s * aq, 0.03 * s, -0.2); }
    // tail: long and thin, or a flat paddle in water, or shorter on a hunter
    const tl = s * (0.9 - 0.45 * hu * grow - 0.4 * br * grow);
    g.lineWidth = base * (1 + 3 * aq);
    g.beginPath(); g.moveTo(-rx * 0.9, cy); g.quadraticCurveTo(-rx - tl * 0.5, cy + ry * 1.6, -rx - tl, cy + ry * (0.6 - aq)); g.stroke();
    g.lineWidth = base;
    ell(0, cy, rx, ry);
    const hr = 0.16 * s * (1 + 0.35 * hu * grow + 0.15 * br);
    const hx = rx * 0.95, hy = cy - ry * 0.45 + 0.05 * aq * s;
    const sn = 0.2 * s * (1 + 0.5 * hu * grow - 0.4 * br * grow);
    g.beginPath(); g.moveTo(hx - hr * 0.4, hy - hr); g.lineTo(hx + hr + sn, hy + hr * 0.1); g.lineTo(hx - hr * 0.2, hy + hr * 0.9); g.closePath(); g.fill(); g.stroke();
    if (hu * grow > 0.4) { g.lineWidth = base * 0.8; line([hx + hr + sn * 0.6, hy + hr * 0.1, hx + hr + sn * 0.55, hy + hr * 0.5]); g.lineWidth = base; }
    if (aq < 0.7) ell(hx - hr * 0.2, hy - hr * 0.9, 0.07 * s * (1 - aq), 0.07 * s * (1 - aq));
    g.fillStyle = colour; g.beginPath(); g.arc(hx + hr * 0.45, hy - hr * 0.2, Math.max(1, 0.018 * s), 0, 7); g.fill();
  } else if (lin === 1) {
    // pig: barrel body, snout disc, tusks, short legs
    const rx = 0.5 * s * (1 + 0.15 * aq - 0.05 * br), ry = 0.27 * s * (1 + 0.25 * aq + 0.1 * br);
    const legL = 0.17 * s * (1 + 1.1 * hu * grow + 1.1 * br * grow - 0.5 * aq);
    const cy = -(legL + ry * 0.8);
    const base = g.lineWidth;
    legs([-0.34 * s, -0.26 * s, 0.24 * s, 0.33 * s], cy + ry * 0.55, legL + ry * 0.3, base * (2 + 2.5 * grow));
    g.lineWidth = base;
    g.beginPath(); g.moveTo(-rx * 0.95, cy - ry * 0.2); g.bezierCurveTo(-rx * 1.2, cy - ry * 0.7, -rx * 1.25, cy + ry * 0.1, -rx * 1.1, cy - ry * 0.3); g.stroke();
    ell(0, cy, rx, ry);
    const neck = 0.15 * s * br * grow;           // a browser lifts its head into the branches
    const hx = rx * 0.9, hy = cy - ry * 0.25 - neck;
    const hl = 0.3 * s * (1 + 0.45 * hu * grow), hh = 0.2 * s * (1 + 0.3 * hu * grow);
    g.beginPath(); g.moveTo(hx - 0.1 * s, hy - hh); g.lineTo(hx + hl, hy - hh * 0.2); g.lineTo(hx + hl, hy + hh * 0.45); g.lineTo(hx - 0.05 * s, hy + hh * 0.9); g.closePath(); g.fill(); g.stroke();
    ell(hx + hl, hy + hh * 0.12, 0.025 * s, hh * 0.32);
    g.beginPath(); g.moveTo(hx, hy - hh * 0.9); g.lineTo(hx - 0.02 * s, hy - hh * 1.6); g.lineTo(hx + 0.09 * s, hy - hh * 0.95); g.closePath(); g.fill(); g.stroke();
    const tusk = 0.05 * s + 0.2 * s * hu * grow;
    if (tusk > 0.06 * s) { g.lineWidth = base * 1.3; g.beginPath(); g.moveTo(hx + hl * 0.8, hy + hh * 0.4); g.quadraticCurveTo(hx + hl * 0.95 + tusk * 0.4, hy + hh * 0.3, hx + hl * 0.85 + tusk * 0.5, hy - tusk * 0.6); g.stroke(); g.lineWidth = base; }
    g.fillStyle = colour; g.beginPath(); g.arc(hx + hl * 0.45, hy - hh * 0.4, Math.max(1, 0.016 * s), 0, 7); g.fill();
  } else {
    // crow: on the wing-folded perch posture when small; upright and long-legged once flightless
    const fl = clamp01((x - Math.log10(2)) / 0.8);
    const legL = s * (0.12 + 0.38 * fl * (1 - aq) + 0.1 * hu * fl);
    const bodyR = 0.24 * s * (1 + 0.15 * fl), bodyH = 0.15 * s * (1 + 0.35 * fl + 0.3 * aq);
    const tilt = -0.45 * (1 - fl) - 0.9 * aq - 0.25 * fl;
    const cy = -(legL + bodyH * 0.7);
    const base = g.lineWidth;
    g.lineWidth = base * (1 + 1.5 * fl);
    line([-0.02 * s, cy + bodyH * 0.6, -0.04 * s, cy + bodyH * 0.6 + legL * 0.55, 0.0, -0.01 * s]);
    line([0.06 * s, cy + bodyH * 0.6, 0.08 * s, cy + bodyH * 0.6 + legL * 0.5, 0.1 * s, -0.01 * s]);
    g.lineWidth = base;
    g.beginPath(); g.moveTo(-bodyR * 0.8, cy); g.lineTo(-bodyR * 1.9 * (1 - 0.4 * fl), cy + bodyH * 0.8 * (1 - 0.5 * aq)); g.lineTo(-bodyR * 1.6 * (1 - 0.4 * fl), cy + bodyH * 1.3); g.closePath(); g.fill(); g.stroke();
    ell(0, cy, bodyR, bodyH, tilt);
    const wing = 1 - 0.75 * fl;
    ell(-0.03 * s, cy - bodyH * 0.1, bodyR * 0.95 * wing + 0.02 * s, bodyH * 0.55 * (1 - 0.3 * aq), tilt + 0.1);
    const neckUp = 0.12 * s * fl + 0.05 * s * aq;
    const hx = bodyR * 0.85, hy = cy - bodyH * 0.9 - neckUp;
    const hr = 0.1 * s * (1 + 0.25 * sc * fl + 0.15 * hu * fl);
    if (neckUp > 0.02 * s) { g.lineWidth = base * 3; line([bodyR * 0.55, cy - bodyH * 0.4, hx, hy]); g.lineWidth = base; }
    ell(hx, hy, hr, hr);
    const bl = 0.2 * s * (1 + 0.6 * hu * fl + 0.2 * sc - 0.25 * aq), bd = 0.07 * s * (1 + 1.3 * hu * fl + 0.6 * sc * fl);
    g.beginPath(); g.moveTo(hx + hr * 0.7, hy - bd * 0.6); g.quadraticCurveTo(hx + hr + bl * 0.8, hy - bd * 0.7, hx + hr + bl, hy + bd * (0.2 + 0.5 * hu * fl));
    g.quadraticCurveTo(hx + hr + bl * 0.5, hy + bd * 0.4, hx + hr * 0.7, hy + bd * 0.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = colour; g.beginPath(); g.arc(hx + hr * 0.25, hy - hr * 0.2, Math.max(1, 0.015 * s), 0, 7); g.fill();
  }
  g.restore();
  return lenM;
}
function drawHuman(g, scale) {
  const h = 1.75 * scale;
  g.save();
  g.strokeStyle = 'rgba(255,190,110,0.55)';
  g.setLineDash([4, 4]);
  g.lineWidth = 1.3;
  g.beginPath(); g.arc(0, -h + h * 0.07, h * 0.07, 0, 7); g.stroke();
  g.beginPath();
  g.moveTo(0, -h + h * 0.14); g.lineTo(0, -h * 0.47);
  g.moveTo(-h * 0.13, -h * 0.75); g.lineTo(0, -h * 0.8); g.lineTo(h * 0.13, -h * 0.75);
  g.moveTo(-h * 0.08, 0); g.lineTo(0, -h * 0.47); g.lineTo(h * 0.08, 0);
  g.stroke();
  g.restore();
}

const fmtKg = (x) => {
  const kg = 10 ** x;
  if (kg >= 1000) return `${(kg / 1000).toFixed(kg >= 1e4 ? 0 : 1)} t`;
  if (kg >= 10) return `${kg.toFixed(0)} kg`;
  if (kg >= 1) return `${kg.toFixed(1)} kg`;
  return `${Math.round(kg * 1000)} g`;
};
const fmtGens = (g) => (g >= 1e6 ? `${(g / 1e6).toFixed(1)} million` : g >= 1e3 ? `${Math.round(g / 1e3)} thousand` : `${Math.round(g)}`);

export default {
  name: 'The Empty Throne',
  description:
    'Humans are the asteroid. While we sit on every big-animal niche, nothing new over 44 kg can evolve. ' +
    'Lift us off and watch brown rats, feral pigs and crows climb an adaptive landscape for 30 million years, ' +
    'into pack hunters, divers, tusked predators and flightless scavengers, no faster than the fossil record allows. ' +
    'Drag through deep time, keep the humans in to compare, and tap any species to see its body.',
  tags: ['biology', 'evolution', 'ecology', 'adaptive landscape', 'incumbency', 'megafauna', 'simulation', 'humor'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',

  motion: (t) => motionOf(t),

  latex: (params, hl, m) => {
    const tLine = m.tMy < 0
      ? `t = ${hl(m.tMy, 2)}\\ \\text{My}\\ (\\text{today}),\\ \\ H = 1`
      : `t = ${hl(m.tMy, 1)}\\ \\text{My},\\ \\ H = ${m.world ? hl(1 - m.lift, 0) : '1'}`;
    const n = m.counts;
    const counts = `\\textcolor{${LINEAGES[0].css}}{${n[0]}\\ \\text{rats}}\\ \\ \\textcolor{${LINEAGES[1].css}}{${n[1]}\\ \\text{pigs}}\\ \\ \\textcolor{${LINEAGES[2].css}}{${n[2]}\\ \\text{crows}}\\ \\text{(species)}`;
    let ev = `T_{\\text{gen}} = T_0\\,(M/M_0)^{1/4}`;
    if (m.big && m.big.logFold > 0.3 && m.tMy > 0) {
      const f = 10 ** m.big.logFold;
      ev = `\\text{biggest: }\\times${hl(f, 0)}\\ \\text{in } ${hl(m.big.gens / 1e6, 1)}\\text{M gens}\\ \\ (\\text{Evans: } \\ge ${hl(evansMinGens(m.big.logFold) / 1e6, 1)}\\text{M})`;
    }
    let line;
    if (!m.world) {
      line = beat(m.local, [
        [0, 'Today. 8 billion humans, 62 kg each, on every niche above 44 kg.'],
        [PRE, 'In this world the humans stay. Same 30 million years.'],
        [PRE + LIFT + 8, 'Nothing over about 40 kg gets a chance. The throne is taken.'],
        [LOOP - RESET - HOLD, 'Thirty million years. Still rats. Slightly larger rats.'],
        [LOOP - RESET, 'Rewinding.'],
      ]);
    } else if (m.phase === 'today') line = 'Today. Humans outweigh all wild mammals 8.6 to 1.';
    else if (m.phase === 'lift') line = 'The asteroid leaves. Nobody files the paperwork for the vacancy.';
    else if (m.phase === 'radiate') {
      line = m.tMy < 0.6
        ? 'Above 44 kg: open for the first time in 50,000 years.'
        : mood([m.dBig], {
            '+': m.claimed < 3 ? 'Getting bigger. Nobody is stopping them.' : `${m.claimed} thrones taken. The new owners are not giving them back.`,
            '0': `${m.claimed} of 5 thrones taken. The new owners are settling in.`,
            '-': 'A giant has died out. Its niche is up for grabs.',
          }, 2e-4);
    } else if (m.phase === 'hold') line = 'First to a peak keeps it. That is incumbency.';
    else line = 'Rewinding 30 million years. Humans reinstalled.';
    return (
      '\\begin{aligned}' +
      '\\Delta \\bar z &= \\tfrac{G}{T_{\\text{gen}}}\\,\\nabla F(\\bar z)\\,\\Delta t \\quad z = (\\log_{10} M,\\ \\text{diet}) \\\\' +
      'F &= \\textstyle\\sum_k A_k\\,\\phi_k(z) - \\text{crowding} - H\\,\\sigma\\big(\\tfrac{\\log_{10} M - \\log_{10} 44}{0.22}\\big) \\\\' +
      `& ${tLine} \\\\` +
      `& ${counts} \\\\` +
      `& ${ev} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, label: 'Speed', help: 'How fast deep time plays. 0 stops it; the scrubber still works.' },
    glow: { value: 1, min: 0, max: 2, label: 'Glow' },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x02030a);
    camera.near = 0.05;
    camera.far = 200;
    const glow = createGlow(ctx, { fov: 40, strength: 0.85, threshold: 0.6, exposure: 1, vignette: 0.55 });
    // aim right of centre so the landscape sits left of the panel, and low enough to clear the equation
    const narrow = ctx.size.width < 600;
    camera.position.set(narrow ? 0.9 : 2.2, narrow ? 14 : 11.5, narrow ? 12 : 14.5);
    ctx.controls?.target.set(narrow ? 0.9 : 2.2, narrow ? -1.2 : 0.4, 0.3);
    ctx.controls?.update();

    // see docs/wiki/mesh-geometry-material.md and docs/wiki/uniforms.md: the landscape
    const surfMat = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      uniforms: {
        uH: { value: 1 },
        uPeakCol: { value: PEAKS.map(() => new THREE.Vector3()) },
        uPeakXY: { value: PEAKS.map((p) => new THREE.Vector2(p.x, p.y)) },
      },
      side: THREE.DoubleSide,
    });
    const surfGeo = new THREE.PlaneGeometry(toX(3.8) - toX(-1.5), 2 * 1.25 * WZ, 260, 150).rotateX(-Math.PI / 2);
    surfGeo.translate((toX(3.8) + toX(-1.5)) / 2, 0, 0);
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.frustumCulled = false;
    scene.add(surf);

    // the humans: an orb of city lights sitting in the crater it makes
    const orbMat = new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, uniforms: { uFade: { value: 1 }, uTime: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.55, 64, 40), orbMat);
    const orbHome = new THREE.Vector3(toX(2.75), heightOf(land(2.75, 0, 1)[0]) + 1.3, toZ(0.05));
    orb.position.copy(orbHome);
    scene.add(orb);

    // see docs/wiki/lines-and-points.md: species as glowing dots, their histories as trails
    const MAXP = 140;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * MAXP), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(3 * MAXP), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAXP), 1));
    geo.setDrawRange(0, 0);
    const dotMat = new THREE.ShaderMaterial({ vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: { uScale: { value: 1 } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const dots = new THREE.Points(geo, dotMat);
    dots.frustumCulled = false;
    scene.add(dots);
    const trails = createFatLines({ maxSegments: 9000, width: 1.5 });
    const ring = createFatLines({ maxSegments: 64, width: 2.2 });
    // trails glow and fade by adding light, so an old trail dims away instead of turning into a dark scratch
    for (const t of [trails, ring]) { t.material.blending = THREE.AdditiveBlending; t.material.transparent = true; t.material.depthWrite = false; }
    scene.add(trails.object, ring.object);

    // ---------- the panel and labels (DOM) ----------
    const host = ctx.renderer.domElement.parentElement || document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const labels = document.createElement('div');
    labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;font:600 11px system-ui,sans-serif;letter-spacing:.04em;';
    host.appendChild(labels);
    const mkLabel = (text, css) => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = `position:absolute;white-space:nowrap;transform:translate(-50%,-100%);color:#9fb2c4;text-shadow:0 0 6px #000;${css || ''}`; labels.appendChild(d); return d; };
    const peakLabels = PEAKS.map((p) => mkLabel(p.label.toUpperCase()));
    const axisLabels = [[-1, '100 g'], [0, '1 kg'], [1, '10 kg'], [X44, '44 kg'], [2, '100 kg'], [3, '1 t']].map(([x, t]) => ({ x, el: mkLabel(t, `color:${x === X44 ? '#d79a4a' : '#6f8296'};font-weight:500;`) }));
    const sideLabels = [[-0.95, 'water'], [-0.45, 'plants'], [0, 'mixed'], [0.5, 'meat'], [0.95, 'carrion']].map(([y, t]) => ({ y, el: mkLabel(t, 'color:#6f8296;font-weight:500;transform:translate(0,-50%);') }));
    const massTitle = mkLabel('BODY MASS →', 'color:#7f93a8;');
    const humanLabel = mkLabel('HUMANS', 'color:#ffbf70;font-size:12px;');

    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;right:14px;bottom:86px;z-index:6;width:min(340px,calc(100% - 28px));background:rgba(5,8,16,0.82);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 12px;color:#d7e0ea;font:13px system-ui,sans-serif;backdrop-filter:blur(6px);box-sizing:border-box;';
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('wheel', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div data-r="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>
      <div data-r="more">
        <canvas data-r="cv" style="width:100%;height:150px;display:block;border-radius:8px;background:rgba(0,0,0,0.25)"></canvas>
        <div data-r="card" style="margin:6px 0 8px;line-height:1.35;min-height:3.9em"></div>
      </div>
      <div data-r="bar" style="position:relative;height:30px;cursor:pointer;touch-action:none">
        <div style="position:absolute;left:0;right:0;top:12px;height:4px;border-radius:2px;background:rgba(255,255,255,0.12)"></div>
        <div data-r="fill" style="position:absolute;left:0;top:12px;height:4px;border-radius:2px;background:linear-gradient(90deg,#ffbf70,#5effa0)"></div>
        <div data-r="knob" style="position:absolute;top:6px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#e8f0f8;box-shadow:0 0 8px #9fd"></div>
        <div data-r="ticks" style="position:absolute;left:0;right:0;top:20px;font-size:10px;color:#7f93a8"></div>
      </div>`;
    host.appendChild(panel);
    const $ = (r) => panel.querySelector(`[data-r="${r}"]`);
    const ui = { open: !narrow, world: 1, focus: -1, sel: null, selRun: null, dragging: false, autoLin: 0, autoAt: 0, lastTap: -1e9 };
    const chip = (text, title, on) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; b.title = title;
      b.style.cssText = 'flex:1 1 auto;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:#cdd8e4;font:600 12px system-ui;cursor:pointer;';
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); paintChips(); });
      $('row').appendChild(b);
      return b;
    };
    const worldBtns = [
      chip('Humans gone', 'Lift the humans off at t = 0', () => { ui.world = 1; ui.sel = null; }),
      chip('Humans stay', 'The same history, but the humans never leave', () => { ui.world = 0; ui.sel = null; }),
    ];
    const linBtns = LINEAGES.map((L, l) => chip(L.key === 'rat' ? 'Rats' : L.key === 'pig' ? 'Pigs' : 'Crows', `Follow the ${L.name.toLowerCase()} lineage`, () => { ui.focus = ui.focus === l ? -1 : l; ui.sel = null; }));
    // on a phone the creature view starts folded away so the landscape stays visible
    const openBtn = chip('', 'Show or hide the creature', () => { ui.open = !ui.open; });
    openBtn.style.flex = '0 0 auto';
    const paintChips = () => {
      openBtn.textContent = ui.open ? '▾ Hide' : '▸ Creature';
      $('more').style.display = ui.open ? '' : 'none';
      worldBtns.forEach((b, k) => { const on = (k === 0) === (ui.world === 1); b.style.background = on ? (k === 0 ? 'rgba(94,255,160,0.16)' : 'rgba(255,191,112,0.18)') : 'transparent'; b.style.borderColor = on ? (k === 0 ? '#5effa0' : '#ffbf70') : 'rgba(255,255,255,0.18)'; });
      linBtns.forEach((b, l) => { const on = ui.focus === l; b.style.background = on ? LINEAGES[l].css + '33' : 'transparent'; b.style.borderColor = on ? LINEAGES[l].css : 'rgba(255,255,255,0.18)'; b.style.color = LINEAGES[l].css; });
    };
    paintChips();
    // deep-time ticks
    const ticks = [[-1, '−1 My'], [0, 'now'], [1, '1'], [5, '5'], [10, '10'], [20, '20'], [30, '30 My']];
    for (const [tm, txt] of ticks) {
      const d = document.createElement('span');
      d.textContent = txt;
      d.style.cssText = `position:absolute;left:${(100 * localOf(tm)) / (LOOP - RESET)}%;transform:translateX(-50%);top:0`;
      if (tm === -1) d.style.transform = 'none';
      if (tm === 30) d.style.transform = 'translateX(-100%)';
      $('ticks').appendChild(d);
    }
    // dragging the scrubber moves the sketch's own clock
    const bar = $('bar');
    const scrubTo = (e) => {
      const r = bar.getBoundingClientRect();
      const u = clamp01((e.clientX - r.left) / r.width);
      const slot = Math.floor(ctx.motionTime / LOOP);
      ctx.motionTime = slot * LOOP + Math.min(LOOP - RESET - 0.01, u * (LOOP - RESET));
    };
    bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); ui.dragging = true; bar.setPointerCapture(e.pointerId); scrubTo(e); });
    bar.addEventListener('pointermove', (e) => { if (ui.dragging) scrubTo(e); });
    const endDrag = () => { ui.dragging = false; };
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);

    // tap a species on the landscape to select it
    const canvas = ctx.renderer.domElement;
    let downAt = null;
    const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      let best = null, bd = 28;
      for (const p of ui.screen || []) {
        const d = Math.hypot(p.sx - px, p.sy - py);
        if (d < bd) { bd = d; best = p.s; }
      }
      if (best) { ui.sel = best; ui.selRun = ui.run; ui.focus = best.lin; ui.open = true; ui.lastTap = performance.now(); paintChips(); }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const cv = $('cv');
    return {
      glow, surf, surfGeo, surfMat, orb, orbMat, orbHome, geo, dotMat, dots, trails, ring, MAXP,
      labels, peakLabels, axisLabels, sideLabels, massTitle, humanLabel, panel, ui, cv, card: $('card'), fill: $('fill'), knob: $('knob'),
      canvas, onDown, onUp,
      runs: new Map(), pending: null,
      v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color(), c2: new THREE.Color(), proj: new THREE.Vector3(),
      bigHist: [],
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { ui, trails, ring, v, w, c } = state;
    const { width, height } = ctx.size;
    trails.setResolution(width, height);
    ring.setResolution(width, height);
    state.glow.strength = 0.85 * (ctx.params.glow ?? 1);

    // see docs/wiki/randomness.md: one seeded history per loop, both worlds; the next loop's is prepared meanwhile
    const key = (slot, world) => `${slot}:${world}`;
    const need = (slot, world) => {
      const k = key(slot, world);
      if (!state.runs.has(k)) state.runs.set(k, createRun(1 + ((((slot % 997) + 997) % 997) * 7919), world === 1));
      return state.runs.get(k);
    };
    const run = need(m.slot, ui.world);
    if (!run.done) run.step(STEPS + 1);
    const other = need(m.slot, 1 - ui.world);
    if (!other.done) other.step(60);
    else for (const wd of [1, 0]) { const nx = need(m.slot + 1, wd); if (!nx.done) { nx.step(60); break; } }
    for (const k of state.runs.keys()) { const s = Number(k.split(':')[0]); if (s < m.slot - 1 || s > m.slot + 1) state.runs.delete(k); }
    if (ui.run !== run) { ui.run = run; if (ui.selRun !== run) ui.sel = null; state.bigHist = []; }

    m.world = ui.world;
    const H = ui.world ? 1 - m.lift : 1;
    state.surfMat.uniforms.uH.value = H;
    const f = Math.min(run.frames - 1.001, frameOf(m.tMy));

    // the orb lifts away (or stays)
    const orbUp = ui.world ? m.lift : 0;
    state.orb.position.copy(state.orbHome).add(v.set(0, 9 * orbUp * orbUp, -2 * orbUp));
    state.orb.scale.setScalar(1 - 0.5 * orbUp);
    state.orbMat.uniforms.uFade.value = (1 - orbUp) ** 1.5;
    state.orbMat.uniforms.uTime.value = ctx.time;
    state.orb.visible = orbUp < 0.995;

    // species now
    const pos = state.geo.attributes.position.array, col = state.geo.attributes.aColor.array, size = state.geo.attributes.aSize.array;
    let n = 0;
    const counts = [0, 0, 0], maxX = [-9, -9, -9];
    let big = null;
    const screen = [];
    const peakBest = PEAKS.map(() => ({ d: 0.45, lin: -1 }));
    trails.reset();
    const TRAIL = 50;
    const place = (x, y, out) => out.set(toX(x), heightOf(land(x, y, H)[0]) + 0.1, toZ(y));
    const fade = (l) => (ui.focus < 0 || ui.focus === l ? 1 : 0.28);
    for (const s of run.sp) {
      if (s.born > f + 1) continue;
      const diedF = s.died < 0 ? Infinity : s.died;
      if (diedF < f - TRAIL) continue;
      const L = LINEAGES[s.lin];
      const now = traitAt(s, f);
      // trail: the last 2.5 My of its path, fading with age; a dead species' trail fades out
      const k1 = Math.min(Math.floor(f) - s.born, s.xs.length - 1);
      const k0 = Math.max(0, Math.floor(f) - TRAIL - s.born);
      const fa = fade(s.lin);
      let prevOk = false;
      for (let k = k0; k <= k1; k++) {
        place(s.xs[k], s.ys[k], w);
        if (k === k0 && s.parent >= 0 && k === 0) {
          const p = run.sp[s.parent];
          const pk = s.born - p.born;
          if (pk >= 0 && pk < p.xs.length) { place(p.xs[pk], p.ys[pk], v); prevOk = true; }
        }
        if (prevOk) {
          const age = (f - (s.born + k)) / TRAIL;
          const a = Math.max(0, 1 - age) ** 1.4 * 0.55 * fa * (now ? 1 : 0.5);
          c.setRGB(L.col[0] * a, L.col[1] * a, L.col[2] * a);
          trails.push(v, w, c);
        }
        v.copy(w); prevOk = true;
      }
      if (!now) continue;
      counts[s.lin]++;
      maxX[s.lin] = Math.max(maxX[s.lin], now.x);
      if (m.tMy > 0 && (!big || now.x > big.x)) big = { x: now.x, logFold: now.x - s.xstart, gens: now.g, lin: s.lin };
      place(now.x, now.y, v);
      if (n < state.MAXP) {
        pos[3 * n] = v.x; pos[3 * n + 1] = v.y + 0.05; pos[3 * n + 2] = v.z;
        const sel = ui.sel === s;
        const b = (sel ? 2.4 : 1.3) * fa;
        col[3 * n] = L.col[0] * b; col[3 * n + 1] = L.col[1] * b; col[3 * n + 2] = L.col[2] * b;
        size[3 * 0 + n] = (0.22 + 0.13 * (now.x + 1.5)) * (sel ? 1.6 : 1);
        n++;
      }
      state.proj.copy(v).project(ctx.camera);
      screen.push({ s, sx: (state.proj.x * 0.5 + 0.5) * width, sy: (-state.proj.y * 0.5 + 0.5) * height });
      PEAKS.forEach((p, k) => {
        const d = Math.hypot(now.x - p.x, (now.y - p.y) / 0.4);
        if (d < peakBest[k].d) peakBest[k] = { d, lin: s.lin };
      });
    }
    trails.commit();
    state.geo.setDrawRange(0, n);
    state.geo.attributes.position.needsUpdate = true;
    state.geo.attributes.aColor.needsUpdate = true;
    state.geo.attributes.aSize.needsUpdate = true;
    state.dotMat.uniforms.uScale.value = height * 0.5;
    ui.screen = screen;
    let claimed = 0;
    PEAKS.forEach((p, k) => {
      const lb = peakBest[k];
      const u = state.surfMat.uniforms.uPeakCol.value[k];
      if (lb.lin >= 0) { claimed++; const L = LINEAGES[lb.lin]; const a = 0.22 * (1 - lb.d / 0.45) * (1 - H); u.set(L.col[0] * a, L.col[1] * a, L.col[2] * a); }
      else u.set(0, 0, 0);
      state.peakLabels[k].style.color = lb.lin >= 0 && H < 0.5 ? LINEAGES[lb.lin].css : '#9fb2c4';
    });
    m.counts = counts;
    m.maxKg = maxX.map((x) => 10 ** x);
    m.big = big;
    m.claimed = claimed;
    state.bigHist.push([ctx.time, big ? big.x : 0]);
    while (state.bigHist.length > 2 && state.bigHist[0][0] < ctx.time - 1) state.bigHist.shift();
    m.dBig = state.bigHist.length > 1 ? state.bigHist[state.bigHist.length - 1][1] - state.bigHist[0][1] : 0;

    // the selected species (yours, or the focus lineage's biggest, changing every 7 s)
    let sel = ui.sel && traitAt(ui.sel, f) ? ui.sel : null;
    if (!sel) {
      if (ui.sel && performance.now() - ui.lastTap < 1e9) ui.sel = null;
      if (performance.now() - ui.autoAt > 7000) { ui.autoAt = performance.now(); ui.autoLin = (ui.autoLin + 1) % 3; }
      const want = ui.focus >= 0 ? ui.focus : ui.autoLin;
      let bx = -9;
      for (const p of screen) if (p.s.lin === want) { const t = traitAt(p.s, f); if (t.x > bx) { bx = t.x; sel = p.s; } }
    }
    ring.reset();
    if (sel) {
      const t = traitAt(sel, f);
      place(t.x, t.y, v);
      const L = LINEAGES[sel.lin];
      const r = 0.25 + 0.08 * (t.x + 1.5);
      for (let k = 0; k < 40; k++) {
        const a0 = (k / 40) * Math.PI * 2, a1 = ((k + 1) / 40) * Math.PI * 2;
        state.w.set(v.x + r * Math.cos(a0), v.y + 0.06, v.z + r * Math.sin(a0));
        state.proj.set(v.x + r * Math.cos(a1), v.y + 0.06, v.z + r * Math.sin(a1));
        c.setRGB(L.col[0] * 0.9, L.col[1] * 0.9, L.col[2] * 0.9);
        ring.push(state.w, state.proj, c);
      }
    }
    ring.commit();

    // ---------- labels ----------
    const project = (X, Y, Z, el, dy = 0) => {
      state.proj.set(X, Y, Z).project(ctx.camera);
      const on = state.proj.z < 1 && Math.abs(state.proj.x) < 1.1 && Math.abs(state.proj.y) < 1.1;
      el.style.display = on ? '' : 'none';
      if (on) { el.style.left = `${(state.proj.x * 0.5 + 0.5) * width}px`; el.style.top = `${(-state.proj.y * 0.5 + 0.5) * height + dy}px`; }
    };
    PEAKS.forEach((p, k) => {
      const hgt = heightOf(land(p.x, p.y, H)[0]);
      project(toX(p.x), hgt + 0.35, toZ(p.y), state.peakLabels[k]);
      state.peakLabels[k].style.opacity = String(0.35 + 0.65 * (1 - H));
    });
    for (const a of state.axisLabels) project(toX(a.x), heightOf(land(a.x, -1.15, H)[0]), toZ(-1.18), a.el, 16);
    for (const a of state.sideLabels) project(toX(-1.25), heightOf(land(-1.25, a.y, H)[0]), toZ(a.y), a.el);
    project(toX(1.2), heightOf(land(1.2, -1.15, H)[0]), toZ(-1.18), state.massTitle, 32);
    project(state.orb.position.x, state.orb.position.y + 1.7 * state.orb.scale.x, state.orb.position.z, state.humanLabel);
    state.humanLabel.style.opacity = String(state.orbMat.uniforms.uFade.value);

    // the site's clean view (Hide, or a tap on a phone) hides the panel too
    state.panel.style.display = document.body.dataset.view === 'clean' ? 'none' : '';

    // ---------- the scrubber ----------
    const u = Math.min(1, m.local / (LOOP - RESET));
    state.fill.style.width = `${100 * u}%`;
    state.knob.style.left = `${100 * u}%`;

    // ---------- the drawer ----------
    const cv = state.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(cv.clientWidth * dpr), ch = Math.round(cv.clientHeight * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    if (sel && cw > 0 && ui.open) {
      const t = traitAt(sel, f);
      const L = LINEAGES[sel.lin];
      const d = describe(sel.lin, t.x, t.y);
      // sizes in metres: the founder, the descendant, a 1.75 m human for scale
      const lenNow = L.k * Math.cbrt(10 ** t.x), lenFounder = L.k * Math.cbrt(10 ** L.x0);
      const tallest = Math.max(1.75, lenNow * 0.75);
      const scale = Math.min((ch * 0.78) / tallest, (cw * 0.62) / Math.max(lenNow * 1.6, 0.6));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cw / dpr, Hh = ch / dpr, ground = Hh - 14;
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(8, ground); g.lineTo(W - 8, ground); g.stroke();
      g.save(); g.translate(22, ground); drawHuman(g, scale); g.restore();
      g.save(); g.translate(48 + lenFounder * scale * 0.5, ground); drawCreature(g, sel.lin, L.x0, L.y0, scale, L.css, 0.45); g.restore();
      g.save(); g.translate(Math.min(W - lenNow * scale * 0.75 - 8, 70 + lenFounder * scale + lenNow * scale * 0.7), ground); drawCreature(g, sel.lin, t.x, t.y, scale, L.css); g.restore();
      g.fillStyle = 'rgba(160,180,200,0.7)'; g.font = '10px system-ui';
      g.fillText('1.75 m human (absent)', 8, Hh - 2);
      g.textAlign = 'right'; g.fillText(`founder: ${L.name.toLowerCase()} → ${m.tMy > 0 ? `${m.tMy.toFixed(1)} My later` : 'today'}`, W - 8, Hh - 2); g.textAlign = 'left';
      const gens = m.tMy > 0 ? `${fmtGens(t.g)} generations ${ui.world ? 'since the humans left' : 'with the humans still here'}` : `generation time ${L.tgen} years`;
      state.card.innerHTML =
        `<div style="color:${L.css};font-weight:700"><i>${d.genus} ${d.epithet}</i> <span style="color:#9fb2c4;font-weight:500">· ${d.role}</span></div>` +
        `<div>${fmtKg(t.x)} · ${d.niche ? d.niche.label.toLowerCase() : 'generalist'}${d.flightless ? ' · flightless' : ''}</div>` +
        `<div style="color:#8a9bb0;font-size:12px">${gens}${ui.sel === sel ? '' : ' · tap any dot to pick one'}</div>`;
    } else {
      state.card.innerHTML = '<div style="color:#8a9bb0">Tap a dot to see that species.</div>';
    }
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.trails.dispose();
    state.ring.dispose();
    state.surfGeo.dispose(); state.surfMat.dispose();
    state.orb.geometry.dispose(); state.orbMat.dispose();
    state.geo.dispose(); state.dotMat.dispose();
    state.labels.remove();
    state.panel.remove();
    state.canvas.removeEventListener('pointerdown', state.onDown);
    state.canvas.removeEventListener('pointerup', state.onUp);
  },
};
