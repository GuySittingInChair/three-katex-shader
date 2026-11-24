import * as Tone from 'tone';
import { isSoundOn } from '../core/audioEngine.js';
import { rng } from './stage2d.js';

const TAU = Math.PI * 2;

// Sound that a sketch makes itself (rather than an uploaded file). A sketch that uses it sets `sound: 'live'`, which
// shows the site's Sound button; nothing is heard until that button is on (browsers also need a tap first).
// see docs/wiki/sketch-sound.md
//
//   setup:   const player = createSoundPlayer();
//   update:  player.loop('vela', samples, 22050);       // play a looped array of samples (switching fades over)
//            player.tones([{ freq: 330, gain: 0.2, pan: -0.5 }, …]);   // or a few steady tones
//   dispose: player.dispose();
//
// Everything goes through Tone's output, so the recorder and the audio-reactive analysers hear it too.

export function createSoundPlayer({ volume = 0.5 } = {}) {
  let ctx = null, out = null;
  let current = null;            // { key, src, gain, start, duration }
  let oscs = [];                 // for tones(): [{ osc, gain, pan }]

  function ready() {
    if (!isSoundOn()) return false;
    const t = Tone.getContext();
    if (t.state !== 'running') return false;
    if (!ctx) {
      ctx = t.rawContext;
      out = ctx.createGain();
      out.gain.value = volume;
      Tone.connect(out, Tone.getDestination());
    }
    return true;
  }
  function fadeOut(node, then) {
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(0, now + 0.25);
    setTimeout(then, 320);
  }
  function stopLoop() {
    if (!current || !ctx) { current = null; return; }
    const { src, gain } = current;
    current = null;
    fadeOut(gain, () => { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); gain.disconnect(); });
  }
  function stopTones() {
    const old = oscs;
    oscs = [];
    for (const o of old) fadeOut(o.gain, () => { try { o.osc.stop(); } catch { /* fine */ } o.osc.disconnect(); o.gain.disconnect(); o.pan.disconnect(); });
  }

  return {
    // Play `data` (a Float32Array of samples, −1…1, at `rate` per second) on a loop. Calling again with the same key
    // does nothing; a new key fades the old sound out and the new one in.
    loop(key, data, rate, { level = 1 } = {}) {
      if (!ready()) { if (current) stopLoop(); return; }
      if (current?.key === key) return;
      stopLoop();
      if (!data) return;
      const buf = ctx.createBuffer(1, data.length, rate);
      buf.copyToChannel(data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.25);
      src.connect(gain).connect(out);
      src.start();
      current = { key, src, gain, start: ctx.currentTime, duration: data.length / rate };
    },
    // Steady sine tones, updated smoothly every frame: [{ freq, gain, pan }]. An empty list (or sound off) stops them.
    tones(list) {
      if (!ready() || !list.length) { if (oscs.length) stopTones(); return; }
      while (oscs.length < list.length) {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
        osc.type = 'sine';
        gain.gain.value = 0;
        osc.connect(gain).connect(pan).connect(out);
        osc.start();
        oscs.push({ osc, gain, pan });
      }
      const now = ctx.currentTime;
      list.forEach((t, i) => {
        const o = oscs[i];
        o.osc.frequency.setTargetAtTime(t.freq, now, 0.05);
        o.gain.gain.setTargetAtTime(t.gain, now, 0.08);
        o.pan.pan.setTargetAtTime(t.pan ?? 0, now, 0.08);
      });
    },
    // Where the looping sound is now, in seconds from the start of its sample array (null if silent).
    position() {
      if (!current || !ctx) return null;
      return (ctx.currentTime - current.start) % current.duration;
    },
    playing: () => Boolean(current || oscs.length),
    dispose() { stopLoop(); stopTones(); if (out) setTimeout(() => out.disconnect(), 400); },
  };
}

// A pulsar's clicks: one short click (a brief 1,800 Hz blip with a little hiss, under a narrow bell curve) per turn, each at its exact time. The loop holds
// K turns (about half a second's worth) so that rounding its length to whole samples changes the click rate by less
// than 0.01%, even for the fastest pulsar (one turn = 31 samples).
export function pulsarClicks(P, RATE, seed = 1) {
  const K = Math.max(1, Math.round(0.5 / P)), n = Math.round(K * P * RATE), out = new Float32Array(n), r = rng(seed);
  const turn = n / RATE / K;                                       // the loop's turn, within 0.01% of P
  const width = Math.min(0.0012, 0.04 * P);                       // the pulse lasts ~4% of a turn, at most 1.2 ms
  for (let i = 0; i < n; i++) {
    const t = i / RATE, near = Math.round(t / turn - 3 * width / turn) * turn + 3 * width;   // the nearest click's centre
    const env = Math.exp(-0.5 * ((t - near) / width) ** 2);
    out[i] = env * (0.75 * Math.cos(TAU * 1800 * (t - near)) + 0.25 * (r() * 2 - 1));   // a sure click, with some hiss
  }
  return out;
}

// A recorded signal as sound: column `col` of a table of `cols` numbers per row (n rows at fs a second), resampled to
// RATE, scaled to a comfortable loudness, then 1.4 s of quiet before it repeats. Used for LIGO's GW150914 strain
// (public/data/gw/strain.bin, column 1: the Hanford detector, filtered to 35–350 Hz, 4096 samples a second).
export function strainSound(strain, cols, col, n, fs, RATE) {
  const dur = n / fs, len = Math.round((dur + 1.4) * RATE), out = new Float32Array(len);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(strain[i * cols + col]));
  for (let i = 0; i < Math.round(dur * RATE); i++) {
    const x = (i / RATE) * fs, k = Math.floor(x), f = x - k;
    const a = strain[Math.min(n - 1, k) * cols + col], b = strain[Math.min(n - 1, k + 1) * cols + col];
    const edge = Math.min(1, i / 400, (Math.round(dur * RATE) - i) / 400);
    out[i] = (0.9 * (a + (b - a) * f) * edge) / peak;
  }
  return out;
}

// Ripples in a galaxy cluster's hot gas, as sound: after NASA/CXC's 2022 Perseus sonification, which "extracted the
// sound waves in radial directions" and "resynthesized" them 57 and 58 octaves up. `table` holds 360 radial profiles
// (one per degree, int8, n samples 1" apart from rmin outwards) of how much brighter or dimmer the X-ray gas is than its
// smooth glow: the pressure waves the black hole sends out. For each direction we measure which ripple spacings are
// present (a Fourier transform of the profile: how strong each spacing is). A spacing becomes a pitch the way a real
// wave's would: wave speed / spacing = how many crests pass a point each second, then x 2^57 (and x 2^58, softer). A
// "radar" turns once every `sweep` seconds and the strengths follow it, so as the ripples crowd or spread in different
// directions the sound glides. Data: tools/blackholes/build_bh.py; see docs/wiki/sketches/blackHoleRipples.md
export function ripplesSong(meta, table, RATE, { sweep = 20, octaves = [57, 58], mix = [1, 0.55], seed = 3, drive = 1 } = {}) {
  const n = meta.n, len = Math.round(sweep * RATE), out = new Float32Array(len), r = rng(seed);
  // spacings to listen for: from 0.4x to 2.5x the published ripple wavelength (in arcseconds on the sky)
  const lam = meta.wave_kpc / meta.kpc_per_arcsec, NF = 48;
  const lams = Array.from({ length: NF }, (_, j) => lam * 0.4 * (2.5 / 0.4) ** (j / (NF - 1)));
  // strength of each spacing in each direction (Hann-windowed profile, one Fourier coefficient per spacing)
  const A = new Float32Array(360 * NF);
  for (let k = 0; k < 360; k++) for (let j = 0; j < NF; j++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.sin((Math.PI * i) / (n - 1)) ** 2, v = (table[k * n + i] / 127) * w, ph = (TAU * i) / lams[j];
      re += v * Math.cos(ph); im += v * Math.sin(ph);
    }
    A[k * NF + j] = Math.hypot(re, im) / n;
  }
  // a little smoothing across neighbouring directions (the profiles are already 6 degree wedges)
  const S = new Float32Array(A.length);
  for (let k = 0; k < 360; k++) for (let j = 0; j < NF; j++) {
    let s = 0; for (let d = -2; d <= 2; d++) s += A[((k + d + 360) % 360) * NF + j] * [0.1, 0.2, 0.4, 0.2, 0.1][d + 2];
    S[k * NF + j] = s;
  }
  // the gas is lumpy at every size; the ripples are the spacings that stand out. Compare each spacing with its own
  // typical strength over all directions, and sharpen (power 3), so the clear ripple tones sing and the lumps fade
  for (let j = 0; j < NF; j++) {
    const col = Array.from({ length: 360 }, (_, k) => S[k * NF + j]).sort((x, y) => x - y), med = col[180] || 1e-9;
    for (let k = 0; k < 360; k++) S[k * NF + j] = (S[k * NF + j] / med) ** 3;
  }
  const SIN = new Float32Array(4096); for (let i = 0; i < 4096; i++) SIN[i] = Math.sin((TAU * i) / 4096);
  octaves.forEach((oct, v) => {
    for (let j = 0; j < NF; j++) {
      // the pitch of this spacing: crests per second = sound speed / spacing, sped up 2^oct
      const hz = (2 ** oct) / (lams[j] * meta.secPerArcsec);
      if (hz > RATE * 0.45) continue;
      const inc = (hz / RATE) * 4096; let ph = r() * 4096;
      for (let i = 0; i < len; i++) {
        const deg = (360 * i) / len, k0 = Math.floor(deg) % 360, f = deg - Math.floor(deg);
        const amp = S[k0 * NF + j] + (S[((k0 + 1) % 360) * NF + j] - S[k0 * NF + j]) * f;
        out[i] += mix[v] * amp * SIN[ph & 4095]; ph += inc; if (ph >= 4096) ph -= 4096;
      }
    }
  });
  // loudness: set by the typical level (98th percentile), not the single loudest moment, then rounded off gently
  // (tanh) so the rare loud bursts don't clip -- otherwise a few strong directions leave the rest nearly silent.
  // `drive` above 1 pushes harder into that rounding: overdrive, like a guitar amp turned up, adding rasp
  const mags = Array.from(out, Math.abs).sort((x, y) => x - y), p98 = mags[Math.floor(mags.length * 0.98)] || 1;
  for (let i = 0; i < len; i++) out[i] = 0.8 * Math.tanh((1.1 * drive * out[i]) / p98);
  return out;
}
