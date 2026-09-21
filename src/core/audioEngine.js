import * as Tone from 'tone';

let mic = null;
let fft = null;
let waveformAnalyser = null;
let music = null;      // the loaded track: { name, el, url, source, gain }
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

// The analysers are shared: the mic and a loaded music track both feed them,
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

// ---- Music track ---------------------------------------------------------
// A user-supplied audio file, played through the speakers *and* routed into
// the analysers (so bass/mid/treble drive audio-reactive sketches). Needs a
// user gesture like everything else that starts audio.

export function getMusic() {
  return music;
}

export function unloadMusic() {
  if (!music) return;
  music.el.pause();
  try { music.source.disconnect(); } catch { /* already disconnected */ }
  music.gain.dispose();
  URL.revokeObjectURL(music.url);
  music = null;
}

export async function loadMusic(file) {
  await Tone.start();
  ensureAnalysers();
  unloadMusic();

  const url = URL.createObjectURL(file);
  const el = new Audio();
  el.preload = 'auto';
  el.src = url;
  await new Promise((resolve, reject) => {
    el.addEventListener('loadedmetadata', resolve, { once: true });
    el.addEventListener('error', () => reject(new Error(`Could not read "${file.name}" as audio`)), { once: true });
  });

  const source = Tone.getContext().createMediaElementSource(el);
  const gain = new Tone.Gain(1);
  Tone.connect(source, gain);
  gain.connect(fft);
  gain.connect(waveformAnalyser);
  gain.toDestination();

  music = { name: file.name, el, url, source, gain };
  audioEngine.enabled = true;
  return music;
}

// Everything audible — the music track plus any sound a sketch synthesises
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
