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
