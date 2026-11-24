import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { createSoundPlayer, ripplesSong } from '../lib/spaceSound.js';
import { caption } from '../lib/bit.js';

// Black Hole Ripples. Giant black holes in galaxy clusters push pressure waves (real sound) through the hot gas around
// them, and Chandra photographs them in X-rays. Two, Perseus and Centaurus, show a steady train of ripples; fifteen
// more show single shock fronts and bubbles instead (kind 'shocks' in the data: their main spacing is measured from the
// picture, not published, so their pitch is this sketch's reading, not a discovery). The sound is made the way NASA/CXC made their 2022
// Perseus sonification: the ripples read along lines out from the centre, a radar sweeping round, each ripple spacing
// played at its true rate raised 57 and 58 octaves (ripplesSong in lib/spaceSound.js) -- then lowered by `pitch`
// semitones (default 5, a musical fourth) for a deeper sound. Data: public/data/blackholes, made by
// tools/blackholes/build_bh.py. Turn the Sound button on.
// see docs/wiki/sketches/blackHoleRipples.md

const RATE = 22050;
const SCENE = 22;                                   // seconds per black hole = one full turn of the radar
const KPC_M = 3.0857e19;
// The black holes, in the data's order (the list grows when tools/blackholes/build_bh.py gets a new entry). Until
// the data arrives, the two with published ripples.
let IDS = ['perseus', 'centaurus'];

// The data, fetched once (see docs/wiki/js-promises-and-fetch.md): ripple tables + pictures.
const BH = { meta: null, tables: {}, imgs: {} };
function load() {
  if (BH.meta) return;
  BH.meta = 'loading';
  fetch('/data/blackholes/meta.json').then((r) => r.json()).then((meta) => {
    BH.meta = Object.fromEntries(meta.objects.map((o) => [o.id, o]));
    IDS = meta.objects.map((o) => o.id);
    for (const o of meta.objects) {
      fetch(`/data/blackholes/${o.id}.prof`).then((r) => r.arrayBuffer()).then((b) => { BH.tables[o.id] = new Int8Array(b); });
      const im = new Image(); im.src = `/data/blackholes/${o.id}.jpg`; BH.imgs[o.id] = im;
    }
  }).catch((err) => { BH.meta = null; console.error('black hole data', err); });
}

// The sound for one black hole at one setting: 57 and 58 octaves up, minus `semis` semitones (12 semitones = 1
// octave). `annoy` (0-10) stacks two shriller voices on top, 59 and 60 octaves up, and overdrives the result.
// Making it takes most of a second, so each one is kept once made.
const SONGS = {};
function songFor(id, semis, annoy) {
  const key = `${id}:${semis}:${annoy}`;
  if (!SONGS[key] && BH.meta?.[id] && BH.tables[id]) {
    // (most are raised 57 octaves like NASA's; one whose structures are tiny, Sagittarius A*, says fewer in its data)
    const o = BH.meta[id], base = (o.octave ?? 57) - semis / 12, a = annoy / 10;
    SONGS[key] = ripplesSong(o, BH.tables[id], RATE, {
      sweep: SCENE, octaves: [base, base + 1, base + 2, base + 3], mix: [1, 0.55, 0.7 * a, 0.5 * a], drive: 1 + 4 * a,
    });
  }
  return SONGS[key] || null;
}

export default {
  name: 'Black Hole Ripples',
  description:
    'Seventeen black holes humming through the hot gas around them, from real Chandra X-ray data: Perseus and ' +
    'Centaurus with their famous sound-wave ripples, fifteen more with shock fronts and bubbles, from Cygnus A to ' +
    'the shrillest of all, Centaurus A, and our own galaxy\'s Sagittarius A*. Played the way NASA made its black ' +
    'hole sound (57 octaves up), pitched down a little, with an annoy slider. Sound on.',
  tags: ['astronomy', 'sound', 'sonification', 'black holes', 'galaxy clusters', 'X-ray', 'real data'],
  category: 'Astronomy',
  mode: '3d',
  sound: 'live',

  // hole 0 = a tour, 22 s each; 1, 2, 3 … = stay on that black hole
  motion(t, params) {
    const pick = Math.round(params?.hole ?? 0);
    const k = pick > 0 ? Math.min(pick, IDS.length) - 1 : Math.floor(t / SCENE) % IDS.length;
    return { id: IDS[k], tScene: t % SCENE };
  },

  latex: (params, hl, m) => {
    const o = BH.meta?.[m.id];
    if (!o) return '\\text{loading the Chandra data…}';
    const base = o.octave ?? 57, f0 = (o.cs_kms * 1e3) / (o.wave_kpc * KPC_M), oct = base - params.pitch / 12, f = f0 * 2 ** oct;
    const how = o.kind === 'shocks' ? 'shocks and bubbles; size measured here, rough'
      : o.kind === 'gas' ? 'hot gas; size measured here, rough' : 'published ripples';
    return '\\begin{aligned}' +
      `&\\text{${o.name} (${how})} \\\\` +
      `&f = c_s/\\lambda = ${o.cs_kms}\\ \\text{km/s} \\,/\\, ${hl(o.wave_kpc, o.wave_kpc < 0.1 ? 4 : 1)}\\ \\text{kpc} = ${hl(f0 * 1e15, 2)} \\times 10^{-15}\\ \\text{Hz} \\\\` +
      `&\\times 2^{${base}} \\text{, down } ${hl(params.pitch, 0)} \\text{ semitones} = \\times 2^{${hl(oct, 2)}}:\\ ${hl(f, 0)}\\ \\text{Hz} \\\\` +
      '&' + caption('Sound button on to hear it. The line is the radar; the wave below is the sound itself.') +
      '\\end{aligned}';
  },

  params: {
    pitch: { value: 5, min: 0, max: 24, step: 1 },   // semitones lower than NASA's 57 octaves (12 = one octave)
    hole: { value: 0, min: 0, max: 17, step: 1 },    // 0 = tour all of them; 1, 2, 3 … = stay on one (in the data's order)
    annoy: { value: 0, min: 0, max: 10, step: 1 },   // 0 = as measured; 10 = two shrill octaves on top, overdriven
  },

  setup(ctx) {
    load();
    return { stage: createStage(ctx, { glow: 1.0 }), player: createSoundPlayer({ volume: 0.5 }), pitch: null, since: 0 };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area, id = m.id, t = ctx.time;

    // The sliders make a new sound only once they have been still for half a second (each takes most of a second).
    const want = `${Math.round(ctx.params.pitch)}:${Math.round(ctx.params.annoy)}`;
    if (want !== state.wanted) { state.wanted = want; state.since = t; }
    if (state.pitch === null || (want !== state.pitch && t - state.since > 0.5)) state.pitch = want;
    const [semis, annoy] = state.pitch.split(':').map(Number);
    const song = songFor(id, semis, annoy);
    state.player.loop(song ? `${id}:${state.pitch}` : 'none', song, RATE);

    // The real Chandra picture of the ripples (bright = squeezed gas, dark = stretched; north up, east left) and the
    // radar line the sound is reading right now. see docs/wiki/sketches/blackHoleRipples.md
    const cx = a.x + a.w / 2, cy = a.y + a.h * 0.5, size = Math.min(a.w, a.h) * 0.5;   // below the equation
    const o = BH.meta?.[id], img = BH.imgs[id];
    if (o && img?.complete) {
      const px = size / (2 * o.imgHalfArcsec);
      g.save(); g.beginPath(); g.arc(cx, cy, size / 2, 0, TAU); g.clip();
      g.drawImage(img, cx - size / 2, cy - size / 2, size, size); g.restore();
      const pos = state.player.position(), ang = (TAU * (pos ?? m.tScene)) / SCENE;   // one turn per loop
      const grad = g.createLinearGradient(cx, cy, cx + Math.cos(ang) * o.rmax * px, cy - Math.sin(ang) * o.rmax * px);
      grad.addColorStop(0, 'rgba(140,230,255,0.2)'); grad.addColorStop(1, 'rgba(140,230,255,0.95)');
      g.strokeStyle = grad; g.lineWidth = 2.5; g.beginPath();
      g.moveTo(cx + Math.cos(ang) * o.rmin * px, cy - Math.sin(ang) * o.rmin * px);
      g.lineTo(cx + Math.cos(ang) * o.rmax * px, cy - Math.sin(ang) * o.rmax * px); g.stroke();
      g.strokeStyle = 'rgba(140,230,255,0.22)'; g.lineWidth = 1;
      for (const rr of [o.rmin, o.rmax]) { g.beginPath(); g.arc(cx, cy, rr * px, 0, TAU); g.stroke(); }
    } else {
      g.font = state.stage.font(13); g.fillStyle = 'rgba(200,210,230,0.7)'; g.textAlign = 'center';
      g.fillText('loading the Chandra data…', cx, cy);
    }

    // The oscilloscope: 60 ms of the very samples being played. see docs/wiki/sketch-sound.md
    const oy = a.y + a.h * 0.86, oh = a.h * 0.09;
    g.strokeStyle = 'rgba(120,140,190,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(a.x, oy); g.lineTo(a.x + a.w, oy); g.stroke();
    if (song) {
      const pos = state.player.position() ?? m.tScene, win = 0.06, i0 = Math.floor((pos - win / 2) * RATE);
      const count = Math.round(win * RATE), stepPx = a.w / count;
      g.strokeStyle = 'rgb(140,230,255)'; g.lineWidth = 1.4; g.beginPath();
      for (let q = 0; q < count; q++) {
        const idx = ((i0 + q) % song.length + song.length) % song.length, x = a.x + q * stepPx, y = oy - song[idx] * oh;
        if (q) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }

    g.font = state.stage.font(15, '600'); g.fillStyle = 'rgba(235,240,255,0.95)'; g.textAlign = 'center';
    const ty = cy + size / 2 + 10;                                // the title under the picture
    g.fillText(o ? o.name : 'Black Hole Ripples', cx, ty);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(200,210,230,0.75)';
    if (o) g.fillText(`${o.dist} away; ${o.note}`, cx, ty + 18);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.player.dispose();
    state.stage.dispose();
  },
};
