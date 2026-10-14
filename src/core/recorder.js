import { getRecordingAudioStream, getMusic } from './audioEngine.js';
import { renderSmooth, smoothSupported } from './smoothRecorder.js';

// Records the visualisation (and whatever is audible) to a video file.
//
// Video: after every render, main.js calls captureFrame(), which copies the
// WebGL canvas into a 2D canvas *in the same task* — a WebGL canvas without
// preserveDrawingBuffer is only reliably readable right after it is drawn —
// and lets the canvas's own capture stream pick it up. Frames are throttled to
// the chosen fps. (captureStream(fps) rather than captureStream(0) plus manual
// requestFrame(): Firefox only has requestFrame on the stream, not the track,
// so a manual push silently captured nothing there.)
//
// Audio: the master output (music track + any Tone synth sounds), or none if
// audio was never started.
//
// Resolution: "match window" records exactly what is on screen; a preset
// (1080p, square, vertical …) temporarily resizes the drawing buffer — the
// canvas on screen just letterboxes — and restores it afterwards.
//
// Smooth mode (the default where WebCodecs exists — phones included) doesn't
// film the screen at all: see smoothRecorder.js. Live mode is kept for sketches
// that react to sound or to your fingers while you record.
//
// What is *not* in the file: the equation overlay and any panels are HTML on
// top of the canvas, so they are not part of the canvas pixels.

export const SIZE_PRESETS = [
  { id: 'window', label: 'Match window', w: 0, h: 0 },
  { id: '720', label: '1280 × 720 (16:9)', w: 1280, h: 720 },
  { id: '1080', label: '1920 × 1080 (16:9)', w: 1920, h: 1080 },
  { id: 'square', label: '1080 × 1080 (square)', w: 1080, h: 1080 },
  { id: 'vertical', label: '1080 × 1920 (vertical)', w: 1080, h: 1920 },
];

// Best first. MP4/H.264 opens everywhere (and is what most sites want) but is
// only available in some browsers; WebM is the reliable fallback.
//
// The list depends on whether there is an audio track: declaring an audio codec
// (…,opus) for a video-only stream makes Firefox's MediaRecorder never finish —
// stop() never fires and no data is delivered (measured) — so video-only
// recordings must use codec-free / video-codec-only types.
const MIME_WITH_AUDIO = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
const MIME_VIDEO_ONLY = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickMimeType(withAudio = true) {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = withAudio ? MIME_WITH_AUDIO : MIME_VIDEO_ONLY;
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

const pad = (n) => String(n).padStart(2, '0');
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Longest side of a "Match window" recording. Phones have very tall, very dense
// screens; past this the encoder (and the upload) only gets slower.
const MAX_SIDE = 1920;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export function createRecorder({ renderer, manager, size, getName, timeline }) {
  let mediaRecorder = null;
  let chunks = [];
  let recCanvas = null;
  let recCtx = null;
  let lastFrameAt = 0;
  let frameInterval = 1000 / 30;
  let startedAt = 0;
  let mime = null;
  let saved = null; // last finished recording: { blob, url, filename, seconds }
  let sizeLock = null; // { pixelRatio } to restore, when a preset resized the canvas
  let onEnded = null;
  let musicEndedHandler = null;
  let smooth = null; // { stop, progress } while a smooth clip is rendering
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn(api));

  function lockSize(w, h) {
    sizeLock = { pixelRatio: renderer.getPixelRatio() };
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false); // false: leave the canvas's on-screen CSS size alone
    size.width = w;
    size.height = h;
    manager.resize(size);
  }

  function unlockSize() {
    if (!sizeLock) return;
    renderer.setPixelRatio(sizeLock.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, true);
    size.width = window.innerWidth;
    size.height = window.innerHeight;
    manager.resize(size);
    sizeLock = null;
  }

  const api = {
    get recording() { return smooth !== null || (mediaRecorder !== null && mediaRecorder.state !== 'inactive'); },
    // True while a smooth clip is rendering: main.js must not advance or draw the sketch.
    get rendering() { return smooth !== null; },
    get progress() { return smooth ? smooth.progress : 0; },
    get sizeLocked() { return sizeLock !== null; },
    get elapsed() { return smooth ? smooth.seconds : api.recording ? (performance.now() - startedAt) / 1000 : 0; },
    get saved() { return saved; },
    get mime() { return mime; },
    supported: pickMimeType() !== null || smoothSupported(),
    smoothSupported: smoothSupported(),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // opts: { mode: 'smooth'|'live', seconds, sizeId, fps, mbps, includeAudio, restartMusic, stopAtMusicEnd }
    start(opts = {}) {
      if (api.recording) return;
      if (opts.mode !== 'live' && smoothSupported()) {
        startSmooth(opts);
        return;
      }
      if (!pickMimeType()) throw new Error('This browser cannot record video (no MediaRecorder support).');

      const preset = SIZE_PRESETS.find((p) => p.id === opts.sizeId) || SIZE_PRESETS[0];
      if (preset.w) lockSize(preset.w, preset.h);

      const w = renderer.domElement.width;
      const h = renderer.domElement.height;
      recCanvas = document.createElement('canvas');
      recCanvas.width = w;
      recCanvas.height = h;
      recCtx = recCanvas.getContext('2d', { alpha: false });
      recCtx.fillStyle = '#000';
      recCtx.fillRect(0, 0, w, h);

      const fps = opts.fps || 30;
      frameInterval = 1000 / fps;
      // Ask the capture stream for twice the target rate: browsers' canvas samplers
      // deliver only part of the requested rate (measured ~70% in Firefox), and our
      // own throttle in captureFrame() is what actually sets the output fps.
      const videoStream = recCanvas.captureStream(Math.min(120, fps * 2));

      const tracks = [...videoStream.getVideoTracks()];
      const audioStream = opts.includeAudio === false ? null : getRecordingAudioStream();
      if (audioStream) tracks.push(...audioStream.getAudioTracks());

      mime = pickMimeType(Boolean(audioStream));
      chunks = [];
      mediaRecorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType: mime,
        videoBitsPerSecond: Math.round((opts.mbps || 12) * 1e6),
        ...(audioStream ? { audioBitsPerSecond: 192000 } : {}),
      });
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = finish;
      mediaRecorder.onerror = (e) => console.error('MediaRecorder error', e.error || e);

      // Music: optionally restart from 0 so the video and track begin together,
      // and optionally end the recording when the track does.
      const music = getMusic();
      if (music && audioStream) {
        if (opts.restartMusic) {
          music.el.currentTime = 0;
          music.el.play().catch(() => {});
        }
        if (opts.stopAtMusicEnd && !music.el.loop) {
          musicEndedHandler = () => api.stop();
          music.el.addEventListener('ended', musicEndedHandler, { once: true });
        }
      }

      startedAt = performance.now();
      lastFrameAt = 0;
      mediaRecorder.start(500);
      emit();
    },

    // Called by the render loop right after each frame is drawn.
    captureFrame() {
      if (!api.recording || !recCtx) return;
      const now = performance.now();
      if (now - lastFrameAt < frameInterval - 2) return;
      lastFrameAt = now;
      recCtx.drawImage(renderer.domElement, 0, 0, recCanvas.width, recCanvas.height);
    },

    stop() {
      if (smooth) {
        smooth.stop = true; // the render loop ends the clip after the current frame
        return;
      }
      if (!api.recording) return;
      const music = getMusic();
      if (music && musicEndedHandler) music.el.removeEventListener('ended', musicEndedHandler);
      musicEndedHandler = null;
      mediaRecorder.stop(); // -> finish()
    },

    setOnEnded(fn) { onEnded = fn; },

    // Save (or re-save) the last finished recording.
    download() {
      if (!saved) return;
      const a = document.createElement('a');
      a.href = saved.url;
      a.download = saved.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  };

  function finish() {
    const seconds = (performance.now() - startedAt) / 1000;
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    chunks = [];
    mediaRecorder = null;
    recCanvas = null;
    recCtx = null;
    unlockSize();

    keep(blob, ext, seconds);
  }

  // Keeps the finished clip for Share / Save / Post. On a phone a download
  // link just opens a player, so there the panel offers the share sheet instead.
  function keep(blob, ext, seconds) {
    if (saved) URL.revokeObjectURL(saved.url);
    saved = blob.size
      ? { blob, url: URL.createObjectURL(blob), filename: `${getName()}-${timestamp()}.${ext}`, seconds, sketchId: getName() }
      : null;
    if (saved && !window.matchMedia('(pointer: coarse)').matches) api.download();
    emit();
    if (onEnded) onEnded(saved);
  }

  async function startSmooth(opts) {
    const preset = SIZE_PRESETS.find((p) => p.id === opts.sizeId) || SIZE_PRESETS[0];
    let w = preset.w;
    let h = preset.h;
    if (!w) {
      const k = Math.min(1, MAX_SIDE / Math.max(renderer.domElement.width, renderer.domElement.height));
      w = renderer.domElement.width * k;
      h = renderer.domElement.height * k;
    }
    lockSize(even(w), even(h));
    smooth = { stop: false, progress: 0, seconds: 0 };
    const fps = opts.fps || 30;
    // The clip gets its own copy of the sound; the live one would only be out of step.
    const music = getMusic();
    const wasPlaying = music && !music.el.paused;
    if (wasPlaying) music.el.pause();
    if (music && opts.restartMusic !== false) music.el.currentTime = 0;
    emit();
    try {
      const out = await renderSmooth({
        canvas: renderer.domElement,
        timeline,
        seconds: opts.seconds || 10,
        fps,
        mbps: opts.mbps || 12,
        includeAudio: opts.includeAudio !== false,
        shouldStop: () => smooth.stop,
        onProgress: (n, total) => {
          smooth.progress = n / total;
          smooth.seconds = n / fps;
        },
      });
      smooth = null;
      unlockSize();
      if (wasPlaying) music.el.play().catch(() => {});
      keep(out.blob, 'mp4', out.seconds);
    } catch (err) {
      console.error('Smooth recording failed', err);
      smooth = null;
      unlockSize();
      if (wasPlaying) music.el.play().catch(() => {});
      emit();
      if (onEnded) onEnded(null, err);
    }
  }

  return api;
}
