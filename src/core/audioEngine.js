import * as Tone from 'tone';

let mic = null;
let fft = null;
let waveformAnalyser = null;
let recDest = null;    // MediaStreamAudioDestinationNode tapping the master output, for recording

// Shared, mutated in place every frame — sketches read ctx.audio (same
// object reference) so they always see the latest values without the
// runner needing to reassign anything.
export const audioEngine = {
  enabled: false,
  level: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  waveform: new Float32Array(128),
  spectrum: new Float32Array(64),
  Tone,
};

function dbToUnit(db) {
  return Math.max(0, Math.min(1, (db + 100) / 100));
}

// The analysers are shared: the mic and the sketch's sound both feed them,
// so every audio-reactive sketch responds to whichever is playing.
function ensureAnalysers() {
  if (!fft) fft = new Tone.Analyser({ type: 'fft', size: 64 });
  if (!waveformAnalyser) waveformAnalyser = new Tone.Analyser({ type: 'waveform', size: 128 });
}

// Requires a user gesture (call this from a click handler) since browsers
// block audio contexts and mic access until one occurs.
export async function enableAudio() {
  await Tone.start();
  try {
    mic = new Tone.UserMedia();
    await mic.open();
    ensureAnalysers();
    mic.connect(fft);
    mic.connect(waveformAnalyser);
    audioEngine.enabled = true;
  } catch (err) {
    // Tone/AudioContext is still unlocked even if mic permission was
    // denied, so sketches that only synthesize sound (ctx.audio.Tone)
    // keep working; only analysis data (bass/mid/treble) stays at 0.
    audioEngine.enabled = false;
    throw err;
  }
}

// Route any node into the shared analysers, so audio-reactive sketches move to it.
export function feedAnalysers(node) {
  ensureAnalysers();
  node.connect(fft);
  node.connect(waveformAnalyser);
  audioEngine.enabled = true;
}

// ---- The current sketch's sound ------------------------------------------
// One looping audio element whose file changes as you move between sketches.
// It plays through the speakers *and* into the analysers (so bass/mid/treble
// drive audio-reactive sketches) and the recorder. Browsers only allow sound
// after a user gesture, so it starts off and `setSoundOn(true)` must be
// called from a click. The on/off choice is remembered.

const SOUND_KEY = 'aiship:sound-on';
let sound = null; // { el, source, gain }, built on first use
let soundUrl = null;
let soundOn = false;
try {
  soundOn = localStorage.getItem(SOUND_KEY) === '1';
} catch {
  /* storage blocked: start muted */
}

function ensureSound() {
  if (sound) return sound;
  const el = new Audio();
  el.crossOrigin = 'anonymous'; // files come from Supabase storage; needed to analyse them
  el.loop = true;
  el.preload = 'auto';
  const source = Tone.getContext().createMediaElementSource(el);
  const gain = new Tone.Gain(1);
  Tone.connect(source, gain);
  ensureAnalysers();
  gain.connect(fft);
  gain.connect(waveformAnalyser);
  gain.toDestination();
  sound = { el, source, gain };
  return sound;
}

function syncSound() {
  if (!soundOn || !soundUrl) {
    sound?.el.pause();
    return;
  }
  const { el } = ensureSound();
  if (el.src !== soundUrl) el.src = soundUrl;
  audioEngine.enabled = true;
  el.play().catch(() => {
    // Autoplay blocked (no gesture yet this visit): wait for the next tap.
    const retry = () => {
      Tone.start().then(() => el.play().catch(() => {}));
    };
    window.addEventListener('pointerdown', retry, { once: true });
  });
}

// The sound for the sketch on screen (null if it has none).
export function setSketchSound(url) {
  soundUrl = url || null;
  syncSound();
}

export const isSoundOn = () => soundOn;

export async function setSoundOn(on) {
  soundOn = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* not remembered, that's all */
  }
  if (on) await Tone.start();
  syncSound();
}

// For the recorder: the playing sound, so a recording can restart it.
export function getMusic() {
  return soundUrl && sound ? sound : null;
}

// Everything audible — the sketch's sound plus anything a sketch synthesises
// through Tone — as a MediaStream for the recorder. Null if the audio
// context was never started (nothing could be playing), so the recording is
// simply video-only instead of stalling on a dead track.
export function getRecordingAudioStream() {
  const ctx = Tone.getContext();
  if (ctx.state !== 'running') return null;
  if (!recDest) {
    recDest = ctx.createMediaStreamDestination();
    Tone.getDestination().connect(recDest);
  }
  return recDest.stream;
}

export function updateAudio() {
  if (!audioEngine.enabled || !fft) return;

  const bins = fft.getValue();
  const bassEnd = 10;
  const midEnd = 32;
  let bass = 0;
  let mid = 0;
  let treble = 0;
  for (let i = 0; i < bassEnd; i++) bass += dbToUnit(bins[i]);
  for (let i = bassEnd; i < midEnd; i++) mid += dbToUnit(bins[i]);
  for (let i = midEnd; i < bins.length; i++) treble += dbToUnit(bins[i]);
  for (let i = 0; i < bins.length && i < audioEngine.spectrum.length; i++) {
    audioEngine.spectrum[i] = dbToUnit(bins[i]);
  }

  audioEngine.bass = bass / bassEnd;
  audioEngine.mid = mid / (midEnd - bassEnd);
  audioEngine.treble = treble / (bins.length - midEnd);
  audioEngine.level = (audioEngine.bass + audioEngine.mid + audioEngine.treble) / 3;

  if (waveformAnalyser) audioEngine.waveform.set(waveformAnalyser.getValue());
}
