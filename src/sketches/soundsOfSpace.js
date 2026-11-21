import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { createSoundPlayer, pulsarClicks, strainSound } from '../lib/spaceSound.js';
import { caption } from '../lib/bit.js';

// Sounds of Space. Space is (nearly) empty, so sound can't cross it, but plenty out there rings, ticks and hums at
// frequencies of its own. This tour plays seven of them, each from real numbers, and says how much (if at all) it was
// sped up to reach your ears. Turn the Sound button on.
//   1–4. Pulsars, played at their true rate, no speed-up: one click per turn of the spinning neutron star.
//        Periods from the ATNF Pulsar Catalogue (public/data/pulsars/meta.json): Vela 0.089328 s, the Crab 0.033392 s,
//        the fastest known, J1748−2446ad, 0.001396 s, and the magnetar beside the Milky Way's central black hole,
//        J1745−2900, 3.763733 s.
//   5.   The Sun's 5-minute oscillations (helioseismology), sped up 100,000 times. The Sun rings with thousands of
//        sound waves at once; here the strongest ones, from the asymptotic pattern ν = Δν(n + l/2 + ε) with the
//        Sun's measured spacing Δν = 135.1 μHz and peak νmax = 3,090 μHz (a model of the pattern, not a list of
//        measured modes). Each mode swells and fades at random, with a lifetime of about 3 days (2.6 s here).
//   6.   GW150914, the first gravitational waves detected (LIGO, 14 Sept 2015), as recorded: the Hanford detector's
//        strain, filtered to 35–350 Hz (public/data/gw), already at frequencies we can hear, played at true speed.
//   7.   The black hole in the Perseus cluster, whose outbursts send pressure waves through the hot gas around it with
//        a period of about 9.6 million years (Fabian et al. 2003, Chandra). Raised 57 octaves (2⁵⁷ ≈ 1.4 × 10¹⁷ times),
//        that is 476 Hz, near the B♭ above middle C: the "B♭ 57 octaves below middle C". Played as a pure tone at that
//        pitch, swelling with each wave.
// The picture shows the same samples you hear (an oscilloscope), and a drawing of the source.
// see docs/wiki/sketches/soundsOfSpace.md

const RATE = 22050;
const SCENE = 11;
const PULSARS = {
  vela: { name: 'Vela pulsar', id: 'B0833−45', P: 0.089328, where: '900 light-years away; about 11,000 years old, judging by how fast it is slowing' },
  crab: { name: 'Crab pulsar', id: 'B0531+21', P: 0.033392, where: 'heart of the Crab Nebula, the supernova seen in 1054' },
  fast: { name: 'The fastest known pulsar', id: 'J1748−2446ad', P: 0.001396, where: 'in the star cluster Terzan 5' },
  magnetar: { name: 'Magnetar at the galaxy\'s centre', id: 'J1745−2900', P: 3.763733, where: 'a third of a light-year (as seen from here) from the Milky Way\'s black hole' },
};
const SCENES = ['vela', 'crab', 'fast', 'magnetar', 'sun', 'gw', 'perseus'];
const SUN = { dnu: 135.1, numax: 3090, eps: 1.4, d02: 9, speed: 1e5, life: 3 * 86400 };   // μHz, μHz, —, μHz, ×, s
const PERSEUS = { periodYears: 9.6e6, octaves: 57 };
const perseusHz = () => 2 ** PERSEUS.octaves / (PERSEUS.periodYears * 365.25 * 86400);

// The Sun: modes l = 0, 1, 2 near νmax, each a sine whose size wanders (a random walk pulled back to its average, with
// the mode's lifetime), loudest near νmax. 12 s, the ends cross-faded so it loops smoothly.
function sunSong(seed) {
  const r = rng(seed), dur = 12, n = dur * RATE, out = new Float32Array(n);
  const modes = [];
  for (let k = 15; k <= 30; k++) for (const l of [0, 1, 2]) {
    let nu = SUN.dnu * (k + l / 2 + SUN.eps);
    if (l === 2) nu -= SUN.d02;
    const vis = [1, 1.5, 0.5][l], env = Math.exp(-0.5 * ((nu - SUN.numax) / 320) ** 2);
    modes.push({ f: (nu * 1e-6) * SUN.speed, a: vis * env, ph: r() * TAU });
  }
  const tau = SUN.life / SUN.speed, step = 256;
  for (const m of modes) {
    let amp = m.a, x = 0;
    for (let i = 0; i < n; i += step) {
      // Ornstein–Uhlenbeck: amp drifts back towards its average m.a, with random kicks, over the lifetime tau
      x += (-x * (step / RATE)) / tau + Math.sqrt((2 * step) / RATE / tau) * (r() * 2 - 1) * 1.7;
      amp = m.a * Math.max(0, 1 + 0.8 * x);
      for (let j = i; j < Math.min(n, i + step); j++) out[j] += amp * Math.sin(TAU * m.f * (j / RATE) + m.ph);
    }
  }
  const fade = Math.round(1.5 * RATE);
  for (let i = 0; i < fade; i++) { const w = i / fade; out[i] = out[i] * w + out[n - fade + i] * (1 - w); }
  const trimmed = out.subarray(0, n - fade);
  let peak = 0; for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
  return trimmed.map((v) => (0.8 * v) / peak);
}
// Perseus: the scaled-up pitch, with soft overtones, swelling once each 1.5 s like the gas ripples drawn.
function perseusSong() {
  const f = perseusHz(), dur = 6, n = dur * RATE, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE, swell = 0.55 + 0.45 * Math.sin(TAU * (t / 1.5));
    out[i] = 0.55 * swell * (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t));
  }
  return out;
}

const SONGS = {};
let GW = null;                                                    // the strain data, once fetched
function songFor(key) {
  if (SONGS[key]) return SONGS[key];
  if (PULSARS[key]) SONGS[key] = pulsarClicks(PULSARS[key].P, RATE, key.length);
  else if (key === 'sun') SONGS[key] = sunSong(7);
  else if (key === 'perseus') SONGS[key] = perseusSong();
  else if (key === 'gw' && GW) SONGS[key] = strainSound(GW.S, GW.cols, 1, GW.n, GW.fs, RATE);
  return SONGS[key] || null;
}

const LIVE = { scene: 'vela' };

export default {
  name: 'Sounds of Space',
  description:
    'Seven real sounds from space, played from real numbers: four pulsars clicking at their true rates, the Sun ringing ' +
    'with its 5-minute oscillations (sped up 100,000 times), the first gravitational waves ever detected, exactly as ' +
    'LIGO heard them, and the black hole in the Perseus cluster, humming a B♭ 57 octaves too low to hear. Sound on.',
  tags: ['astronomy', 'sound', 'sonification', 'pulsars', 'helioseismology', 'gravitational waves', 'black holes', 'real data'],
  category: 'Astronomy',
  mode: '3d',
  sound: 'live',

  motion(t) {
    const k = Math.floor(t / SCENE) % SCENES.length;
    return { scene: SCENES[k], tScene: t % SCENE };
  },

  latex: (params, hl, m) => {
    const s = m.scene, p = PULSARS[s];
    const tail = '\\\\ &' + caption('Sound button on to hear it. The wave drawn is the sound you hear.');
    if (p) {
      const f = 1 / p.P;
      return '\\begin{aligned}' +
        `&\\text{${p.name} (${p.id})} \\\\` +
        `&P = ${hl(p.P, 6)}\\ \\text{s}\\ \\Rightarrow\\ ${hl(f, f < 2 ? 3 : 1)}\\ \\text{turns a second} \\\\` +
        '&\\text{speed-up: none (real time)}' + tail + '\\end{aligned}';
    }
    if (s === 'sun') return '\\begin{aligned}' +
      '&\\text{The Sun\'s 5-minute oscillations} \\\\' +
      `&\\nu \\approx \\Delta\\nu\\,(n + \\tfrac{l}{2} + \\varepsilon),\\ \\Delta\\nu = ${SUN.dnu}\\ \\mu\\text{Hz},\\ \\nu_{\\text{max}} = ${SUN.numax}\\ \\mu\\text{Hz} \\\\` +
      `&\\times ${SUN.speed.toLocaleString('en').replace(/,/g, '{,}')}:\\ ${hl(SUN.numax * 1e-6 * SUN.speed, 0)}\\ \\text{Hz}\\quad (1\\ \\text{s heard} = ${hl(SUN.speed / 3600, 1)}\\ \\text{hours})` + tail + '\\end{aligned}';
    if (s === 'gw') return '\\begin{aligned}' +
      '&\\text{GW150914: two black holes merging (LIGO Hanford)} \\\\' +
      '&\\text{strain} \\sim 10^{-21},\\ 35 \\to 250\\ \\text{Hz} \\\\' +
      '&\\text{speed-up: none (as recorded, 14 Sept 2015)}' + tail + '\\end{aligned}';
    const f = perseusHz();
    return '\\begin{aligned}' +
      '&\\text{The Perseus cluster\'s black hole} \\\\' +
      `&\\text{period } 9.6 \\times 10^6\\ \\text{years} = ${hl(1 / (PERSEUS.periodYears * 365.25 * 86400) * 1e15, 2)} \\times 10^{-15}\\ \\text{Hz} \\\\` +
      `&\\times 2^{57}:\\ ${hl(f, 0)}\\ \\text{Hz, near B}\\flat\\ (466\\ \\text{Hz})` + tail + '\\end{aligned}';
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 1.0 });
    if (!GW) {
      Promise.all([fetch('/data/gw/meta.json').then((r) => r.json()), fetch('/data/gw/strain.bin').then((r) => r.arrayBuffer())])
        .then(([meta, buf]) => { GW = { S: new Float32Array(buf), cols: 6, n: meta.strain.n, fs: meta.fs }; })
        .catch((err) => console.error('gw data', err));
    }
    return { stage, player: createSoundPlayer({ volume: 0.45 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area, s = m.scene;
    const song = songFor(s);
    state.player.loop(s, song, RATE);
    LIVE.scene = s;

    // The source, drawn in the upper part of the area.
    const cx = a.x + a.w / 2, cy = a.y + a.h * 0.34, R = Math.min(a.w, a.h) * 0.2, t = ctx.time;
    if (PULSARS[s]) {
      const P = PULSARS[s].P;
      // a neutron star with two beams; turns visibly only if slower than about 7 turns a second, else a steady blur
      const ang = P > 0.14 ? (TAU * t) / P : 0;
      g.save(); g.translate(cx, cy);
      if (P > 0.14) {
        g.rotate(ang);
        for (const sgn of [1, -1]) {
          const grad = g.createLinearGradient(0, 0, sgn * R * 2.2, 0);
          grad.addColorStop(0, 'rgba(150,200,255,0.9)'); grad.addColorStop(1, 'rgba(150,200,255,0)');
          g.fillStyle = grad; g.beginPath(); g.moveTo(0, 0); g.lineTo(sgn * R * 2.2, -R * 0.18); g.lineTo(sgn * R * 2.2, R * 0.18); g.closePath(); g.fill();
        }
      } else {
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, R * 2);
        grad.addColorStop(0, 'rgba(150,200,255,0.55)'); grad.addColorStop(1, 'rgba(150,200,255,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(0, 0, R * 2, 0, TAU); g.fill();
      }
      g.restore();
      g.fillStyle = 'rgb(235,240,255)'; g.beginPath(); g.arc(cx, cy, R * 0.18, 0, TAU); g.fill();
    } else if (s === 'sun') {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
      grad.addColorStop(0, 'rgb(255,230,160)'); grad.addColorStop(0.75, 'rgb(255,160,60)'); grad.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, TAU); g.fill();
      // shimmering rings, like a map of the surface moving in and out
      for (let k = 1; k <= 5; k++) {
        const w = 0.5 + 0.5 * Math.sin(t * (2 + k * 0.7) + k);
        g.strokeStyle = `rgba(255,250,220,${0.12 + 0.25 * w})`; g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, (R * k) / 5.2, 0, TAU); g.stroke();
      }
    } else if (s === 'gw') {
      // two black holes spiralling in during the chirp, drawn from the loop's timing
      const pos = state.player.position() ?? (t % 2);
      const tc = 0.43, u = Math.max(0, Math.min(1, pos / tc)), sep = R * (1.1 - 0.95 * u ** 3), ph = 18 * (1 - (1 - u) ** 0.375) * TAU;
      if (pos < tc) for (const sgn of [1, -1]) { g.fillStyle = 'rgb(10,10,14)'; g.strokeStyle = 'rgba(255,190,120,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(cx + sgn * sep * Math.cos(ph), cy + sgn * sep * Math.sin(ph), R * 0.16, 0, TAU); g.fill(); g.stroke(); }
      else { g.strokeStyle = 'rgba(255,190,120,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 0.24, 0, TAU); g.stroke(); }
      for (let k = 0; k < 6; k++) { const rr = ((t * 0.6 + k / 6) % 1) * R * 2.4; g.strokeStyle = `rgba(255,190,120,${0.35 * (1 - rr / (R * 2.4))})`; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke(); }
    } else {
      // Perseus: ripples spreading through hot gas from the central black hole
      for (let k = 0; k < 7; k++) {
        const rr = ((t / 1.5 + k / 7) % 1) * R * 2.4;
        g.strokeStyle = `rgba(190,140,255,${0.6 * (1 - rr / (R * 2.4))})`; g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
      }
      g.fillStyle = 'rgb(8,6,12)'; g.strokeStyle = 'rgba(220,190,255,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, R * 0.15, 0, TAU); g.fill(); g.stroke();
    }

    // The oscilloscope: the very samples being played, around the current moment.
    const oy = a.y + a.h * 0.78, oh = a.h * 0.16, ow = a.w;
    g.strokeStyle = 'rgba(120,140,190,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(a.x, oy); g.lineTo(a.x + ow, oy); g.stroke();
    if (song) {
      const pos = state.player.position() ?? (m.tScene % (song.length / RATE));
      // window: 40 ms for steady sounds, a whole turn for slow pulsars, the whole chirp for GW150914
      const win = s === 'gw' ? 0.6 : PULSARS[s] ? Math.min(Math.max(0.04, PULSARS[s].P * 3), 4) : 0.04;
      const i0 = s === 'gw' ? 0 : Math.floor((pos - win / 2) * RATE), count = Math.round(win * RATE), stepPx = ow / count;
      g.strokeStyle = 'rgb(140,230,255)'; g.lineWidth = 1.4; g.beginPath();
      const stride = Math.max(1, Math.floor(count / 1500));
      for (let q = 0; q < count; q += stride) {
        const idx = ((i0 + q) % song.length + song.length) % song.length;
        const x = a.x + q * stepPx, y = oy - song[idx] * oh;
        if (q) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.font = state.stage.font(11); g.fillStyle = 'rgba(200,210,230,0.7)'; g.textAlign = 'left';
      g.fillText(`the sound itself: ${win >= 1 ? win.toFixed(1) + ' s' : Math.round(win * 1000) + ' ms'} of it`, a.x, oy + oh + 14);
    }
    g.font = state.stage.font(15, '600'); g.fillStyle = 'rgba(235,240,255,0.95)'; g.textAlign = 'center';
    const title = PULSARS[s] ? PULSARS[s].name : s === 'sun' ? 'The Sun, ringing' : s === 'gw' ? 'Two black holes merging, 1.3 billion years ago' : 'The black hole in the Perseus cluster';
    g.fillText(title, cx, a.y + 6);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(200,210,230,0.75)';
    const sub = PULSARS[s] ? PULSARS[s].where : s === 'sun' ? 'thousands of sound waves trapped inside it, each a few minutes long' : s === 'gw' ? 'its 4 km arms stretched by about a thousandth of a proton\'s width' : '250 million light-years away; ripples about 36,000 light-years apart';
    g.fillText(sub, cx, a.y + 24);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.player.dispose();
    state.stage.dispose();
  },
};
