import * as THREE from 'three';
import { TAU, clamp01 } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption, mood, inUnits } from '../lib/bit.js';

// The SIR epidemic model (Kermack & McKendrick, 1927), cast with a song. 3000 people; ten of them start
// humming it. A hummer passes it to anyone they meet at rate β, and gets sick of it at rate γ, after which
// they are immune. With s, i, r the fractions susceptible, humming and sick of it, and time in units of
// 1/γ (call it a day of humming):
//
//     ṡ = −R₀ s i,    i̇ = R₀ s i − i,    ṙ = i,        R₀ = β/γ
//
// Two exact results the crowd is checked against, live:
//   • The peak. i̇ = 0 exactly when s = 1/R₀, so the humming peaks when the share still unexposed falls
//     to 1/R₀ (that is the herd-immunity threshold), at i_max = s₀ + i₀ − 1/R₀ − ln(R₀ s₀)/R₀.
//   • The final size. Dividing ṡ by ṙ and integrating: ln(s₀/s_∞) = R₀ (1 − s_∞), solved by Newton's method.
//     Below R₀ = 1 there is no outbreak: the song fizzles with the seeds' own short chains.
//
// The crowd is a real stochastic simulation, not the ODE: Gillespie's algorithm, well mixed (anyone can
// meet anyone, which is what the equations assume, so the arcs jump across the crowd). Each passing-on is
// drawn as an arc from hummer to new hummer. Prototyped in Node over 6 seeds per R₀: final sizes land
// within about ±0.03 of the prediction (0.880–0.907 for 0.893 at R₀ = 2.5; 0.979–0.986 for 0.980 at R₀ = 4);
// the peak's s scatters around 1/R₀ by a few hundredths, because 3000 people is not infinity.
//
// The ring round the crowd is the outbreak's timeline, clockwise from the top: the gold band is the
// crowd's i(t), the white line is the ODE's. The tick inside the ring marks where the ODE's s crosses 1/R₀.
//
// Loop: four outbreaks, R₀ = 2.5, 1.5, 4, 0.9; each plays over 11 s (until all but the last few stragglers
// are done, however many days that took), then holds for 3 s. A fresh random crowd each time.

const N = 3000;
const I0 = 10;
const R0S = [2.5, 1.5, 4, 0.9];
const PLAY = 11;
const HOLD = 3;
const SLOT = PLAY + HOLD;
const LOOP = SLOT * R0S.length;
const DISC = 5;
const RING = DISC + 0.55;
const BAND = 3;            // ring height per unit of i
const HUM_HOURS = 3;       // hours a day a hummer hums
const ARC_LIFE = 0.9;      // seconds
const ARC_SEG = 10;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const mulberry = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function finalSize(R0, s0) {
  let x = R0 * s0 > 1 ? 0.5 / R0 : s0 * 0.99;
  for (let k = 0; k < 60; k++) {
    const f = Math.log(s0 / x) - R0 * (1 - x);
    x -= f / (-1 / x + R0);
    x = Math.min(Math.max(x, 1e-12), s0);
  }
  return 1 - x;
}

// One outbreak, start to finish: Gillespie events [day, type (1 infect / 0 recover), who, from].
function outbreak(R0, seed) {
  const rnd = mulberry(seed);
  const order = Array.from({ length: N }, (_, k) => k);
  for (let k = N - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  const inf = order.slice(0, I0);
  const sus = order.slice(I0);
  const events = [];
  let t = 0;
  while (inf.length) {
    const a = (R0 * sus.length * inf.length) / N;
    const tot = a + inf.length;
    t += -Math.log(1 - rnd()) / tot;
    const from = inf[Math.floor(rnd() * inf.length)];
    if (rnd() * tot < a) {
      const k = Math.floor(rnd() * sus.length);
      const who = sus[k];
      sus[k] = sus[sus.length - 1];
      sus.pop();
      inf.push(who);
      events.push([t, 1, who, from]);
    } else {
      const k = inf.indexOf(from);
      inf[k] = inf[inf.length - 1];
      inf.pop();
      events.push([t, 0, from, -1]);
    }
  }
  // The ODE over the same days (RK4), for the ring's white line.
  const M = 600;
  const s = new Float64Array(M + 1);
  const i = new Float64Array(M + 1);
  s[0] = (N - I0) / N;
  i[0] = I0 / N;
  const h = t / M;
  const f = (S, I) => [-R0 * S * I, R0 * S * I - I];
  let peakDay = -1;
  for (let k = 0; k < M; k++) {
    const [a1, b1] = f(s[k], i[k]);
    const [a2, b2] = f(s[k] + (h * a1) / 2, i[k] + (h * b1) / 2);
    const [a3, b3] = f(s[k] + (h * a2) / 2, i[k] + (h * b2) / 2);
    const [a4, b4] = f(s[k] + h * a3, i[k] + h * b3);
    s[k + 1] = s[k] + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    i[k + 1] = i[k] + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    if (peakDay < 0 && s[k] >= 1 / R0 && s[k + 1] < 1 / R0) peakDay = (k + 1) * h;
  }
  return { R0, events, days: t, odeS: s, odeI: i, peakDay, init: order.slice(0, I0) };
}

// The timeline shown: up to the last moment at least 2% of the peak (and 3 people) were still humming.
// After that the tail is a few stragglers; their events are played out when the timeline ends.
function shownDays(events) {
  let I = I0;
  let peak = I0;
  for (const e of events) { I += e[1] ? 1 : -1; peak = Math.max(peak, I); }
  const thresh = Math.max(3, 0.02 * peak);
  I = I0;
  let tEnd = events.length ? events[events.length - 1][0] : 1;
  let last = 0;
  for (const e of events) { I += e[1] ? 1 : -1; if (I > thresh) last = e[0]; }
  return Math.min(tEnd, Math.max(last * 1.08, 1));
}

const SPRITE_VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.5, aSize * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPRITE_FRAG = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = exp(-d * d * 10.0);
    float halo = exp(-d * d * 2.5) * 0.2;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;

export default {
  name: 'Earworm SIR',
  description:
    'A song spreads through a crowd of 3000 by the SIR epidemic model: hummers pass it on, then get sick of it ' +
    'and become immune. Every passing-on is an arc. The humming peaks exactly when the share who never heard it ' +
    'drops to 1/R₀, and the final number who caught it lands on Kermack and McKendrick\'s formula from 1927. ' +
    'Below R₀ = 1 the song never catches on.',
  tags: ['biology', 'epidemiology', 'sir', 'stochastic', 'gillespie', 'networks', 'humor'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const tl = ((t % LOOP) + LOOP) % LOOP;
    const k = Math.floor(tl / SLOT);
    const local = tl - k * SLOT;
    const R0 = R0S[k];
    const s0 = (N - I0) / N;
    return {
      slot: Math.floor(t / SLOT),
      R0,
      local,
      play: clamp01(local / PLAY),
      holding: local >= PLAY ? 1 : 0,
      predFinal: finalSize(R0, s0),
      predPeak: R0 * s0 > 1 ? s0 + I0 / N - 1 / R0 - Math.log(R0 * s0) / R0 : I0 / N,
      // Filled in by update() from the crowd.
      day: 0, s: s0, i: I0 / N, r: 0, di: 0, sAtPeak: 0, peaked: 0, humDays: 0,
    };
  },

  latex: (params, hl, m) => {
    const pct = Math.round(100 * m.r);
    const line = m.holding
      ? m.R0 < 1
        ? 'R₀ < 1. The song never caught on. The band blames the algorithm.'
        : `${pct}% caught it. Getting over a song takes months; here it takes three seconds.`
      : m.play < 0.04
        ? 'Ten people hum it in public.'
        : mood([m.di], {
            '+': 'The song is spreading. Nobody can stop humming it.',
            '-': 'Past the peak. People are getting sick of it.',
            0: 'Holding steady.',
          }, 1e-4);
    const sp = m.peaked && m.R0 > 1 ? hl(m.sAtPeak, 2) : '\\text{—}';
    return (
      '\\begin{aligned}' +
      '\\dot s &= -R_0\\, s\\, i,\\quad \\dot i = R_0\\, s\\, i - i,\\quad \\dot r = i \\\\' +
      `R_0 &= ${hl(m.R0, 1)},\\ \\ \\text{day } ${hl(m.day, 1)}:\\ \\ s = ${hl(m.s, 3)},\\ i = ${hl(m.i, 3)},\\ r = ${hl(m.r, 3)} \\\\` +
      `\\text{peak at } s &= 1/R_0 = ${m.R0 > 1 ? hl(1 / m.R0, 2) : '\\text{(none)}'}\\ \\text{(theory)},\\ \\ ${sp}\\ \\text{(crowd)} \\\\` +
      `\\ln\\tfrac{s_0}{s_\\infty} &= R_0(1 - s_\\infty) \\Rightarrow 1 - s_\\infty = ${hl(m.predFinal, 3)}\\ \\text{(theory)},\\ \\ ${hl(m.r, 3)}\\ \\text{(crowd)} \\\\` +
      `\\text{humming} &= ${inUnits(hl, m.humDays * HUM_HOURS, { per: 4, of: 'h', name: 'Eurovision finals', digits: 0 })} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x030308);
    camera.near = 0.05;
    camera.far = 200;
    const glow = createGlow(ctx, { fov: 42, strength: 0.8, threshold: 0.55, exposure: 1, vignette: 0.55 });
    camera.position.set(0, 25, 10.5);
    ctx.controls?.target.set(0, 0, -2.7);
    ctx.controls?.update();

    // The crowd, on a sunflower spiral.
    const home = new Float32Array(3 * N);
    for (let k = 0; k < N; k++) {
      const r = DISC * Math.sqrt((k + 0.5) / N);
      home.set([r * Math.cos(k * GOLDEN), 0, r * Math.sin(k * GOLDEN)], 3 * k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(home, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      uniforms: { uScale: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const crowd = new THREE.Points(geo, mat);
    crowd.frustumCulled = false;
    scene.add(crowd);

    const arcs = createFatLines({ maxSegments: 2700, width: 1.0 });
    const ring = createFatLines({ maxSegments: 1400, width: 2.2 });
    scene.add(arcs.object, ring.object);

    return {
      glow, geo, mat, home, arcs, ring,
      slot: null, run: null, ptr: 0,
      status: new Uint8Array(N), since: new Float32Array(N),
      live: [], ringI: new Float32Array(721), lastDay: 0, I: I0, S: N - I0,
      iHist: [],
      c: new THREE.Color(), tip: new THREE.Color(), v: new THREE.Vector3(), w: new THREE.Vector3(),
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { arcs, ring, c, v, w, home, status, since } = state;
    const { width, height } = ctx.size;
    arcs.setResolution(width, height);
    ring.setResolution(width, height);
    const now = ctx.time;

    // A new outbreak: a fresh crowd and a fresh run.
    if (m.slot !== state.slot) {
      state.slot = m.slot;
      state.run = outbreak(m.R0, 1 + ((m.slot * 7919) >>> 0));
      state.run.shown = shownDays(state.run.events);
      state.ptr = 0;
      status.fill(0);
      since.fill(-10);
      for (const k of state.run.init) { status[k] = 1; since[k] = now; }
      state.live = [];
      state.ringI.fill(0);
      state.S = N - I0;
      state.I = I0;
      state.lastDay = 0;
      state.humDays = 0;
      state.peakI = I0;
      state.sAtPeak = 1;
      state.iHist = [];
    }
    const run = state.run;
    const day = m.holding ? run.days : m.play * run.shown;

    // Play the events up to today.
    const ev = run.events;
    while (state.ptr < ev.length && ev[state.ptr][0] <= day) {
      const [t, type, who, from] = ev[state.ptr++];
      state.humDays += state.I * (t - state.lastDay);
      state.lastDay = t;
      if (type === 1) {
        status[who] = 1;
        since[who] = now;
        state.S--;
        state.I++;
        if (state.live.length < 260 && !m.holding) state.live.push([from, who, now]);
      } else {
        status[who] = 2;
        state.I--;
      }
      // Peak of a lightly smoothed i: the raw count jitters by ±1 at every event.
      if (state.I > state.peakI + 2) { state.peakI = state.I; state.sAtPeak = state.S / N; }
      const slotIdx = Math.min(720, Math.floor((t / run.shown) * 720));
      state.ringI[slotIdx] = Math.max(state.ringI[slotIdx], state.I / N);
    }
    if (day > state.lastDay) { state.humDays += state.I * (day - state.lastDay); state.lastDay = day; }
    state.iHist.push([day, state.I / N]);
    while (state.iHist.length > 2 && state.iHist[0][0] < day - 0.4) state.iHist.shift();
    m.day = day;
    m.s = state.S / N;
    m.i = state.I / N;
    m.r = 1 - m.s - m.i;
    m.di = state.iHist.length > 1 ? state.iHist[state.iHist.length - 1][1] - state.iHist[0][1] : 0;
    m.sAtPeak = state.sAtPeak;
    m.peaked = state.peakI > 3 * I0 && state.I < 0.8 * state.peakI ? 1 : 0;
    m.humDays = state.humDays;

    // People: unexposed cold blue, hummers gold and pulsing to the beat (120 bpm), sick of it a dim violet.
    const col = state.geo.attributes.aColor.array;
    const size = state.geo.attributes.aSize.array;
    const pulse = 0.75 + 0.25 * Math.cos(TAU * 2 * now);
    for (let k = 0; k < N; k++) {
      const st = status[k];
      if (st === 0) { col[3 * k] = 0.16; col[3 * k + 1] = 0.3; col[3 * k + 2] = 0.62; size[k] = 0.17; }
      else if (st === 1) {
        const flash = 1 + 3 * Math.exp(-(now - since[k]) / 0.25);
        const g = pulse * flash;
        col[3 * k] = 1.9 * g; col[3 * k + 1] = 1.15 * g; col[3 * k + 2] = 0.32 * g; size[k] = 0.3;
      } else { col[3 * k] = 0.36; col[3 * k + 1] = 0.18; col[3 * k + 2] = 0.5; size[k] = 0.15; }
    }
    state.geo.attributes.aColor.needsUpdate = true;
    state.geo.attributes.aSize.needsUpdate = true;
    state.mat.uniforms.uScale.value = height * 0.5;

    // Arcs: drawn out over 0.3 s, then fading.
    arcs.reset();
    state.live = state.live.filter((a) => now - a[2] < ARC_LIFE);
    for (const [from, to, t0] of state.live) {
      const age = now - t0;
      const grow = Math.min(1, age / 0.3);
      const fade = (1 - age / ARC_LIFE) ** 1.5;
      const ax = home[3 * from], az = home[3 * from + 2];
      const bx = home[3 * to], bz = home[3 * to + 2];
      const h = 0.15 + 0.14 * Math.hypot(bx - ax, bz - az);
      const P = (u, out) => out.set(ax + (bx - ax) * u, 4 * h * u * (1 - u), az + (bz - az) * u);
      P(0, v);
      for (let j = 1; j <= ARC_SEG; j++) {
        const u = (j / ARC_SEG) * grow;
        P(u, w);
        const f = fade * (0.2 + 0.8 * (j / ARC_SEG)) * 0.55;
        c.setRGB(1.3 * f, 0.8 * f, 0.25 * f);
        arcs.push(v, w, c);
        v.copy(w);
      }
    }
    arcs.commit();

    // The ring: a faint full circle, the crowd's i(t) as a band, the ODE as a line, and the 1/R₀ tick.
    ring.reset();
    const ang = (u) => Math.PI / 2 - TAU * u;     // clockwise from the top
    const at = (u, rr, out) => out.set(rr * Math.cos(ang(u)), 0, -rr * Math.sin(ang(u)));
    for (let k = 0; k < 180; k++) {
      at(k / 180, RING, v);
      at((k + 1) / 180, RING, w);
      c.setRGB(0.12, 0.14, 0.22);
      ring.push(v, w, c);
    }
    const shown = Math.floor(m.play * 720);
    let last = 0;
    for (let k = 0; k <= shown; k++) {
      last = state.ringI[k] || last;
      if (last <= 0) continue;
      at(k / 720, RING, v);
      at(k / 720, RING + BAND * last, w);
      c.setRGB(0.42, 0.24, 0.06);
      ring.push(v, w, c, state.tip.setRGB(0.8, 0.5, 0.14));
    }
    // The ODE was solved over all run.days; the ring shows the first run.shown of them.
    const M = run.odeI.length - 1;
    const ks = Math.min(M, Math.ceil(m.play * M * (run.shown / run.days)));
    const toU = M * (run.shown / run.days);
    for (let k = 0; k < ks; k++) {
      at(k / toU, RING + BAND * run.odeI[k], v);
      at((k + 1) / toU, RING + BAND * run.odeI[k + 1], w);
      c.setRGB(0.75, 0.8, 0.95);
      ring.push(v, w, c);
    }
    if (run.peakDay > 0) {
      const u = run.peakDay / run.shown;
      at(u, RING - 0.4, v);
      at(u, RING - 0.08, w);
      c.setRGB(0.5, 0.6, 0.9);
      ring.push(v, w, c);
    }
    ring.commit();
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.arcs.dispose();
    state.ring.dispose();
  },
};
