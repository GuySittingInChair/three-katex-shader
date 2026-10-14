import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getMusic } from './audioEngine.js';

// "Smooth" recording: instead of filming the screen while it plays (which, on a
// phone, makes the animation stutter *and* the video with it), the animation is
// paused and stepped by exactly 1/fps per frame, each frame is handed straight
// to the device's video encoder (WebCodecs), and the result is muxed into an
// MP4. A slow device just takes longer; the clip itself is always perfectly
// smooth at the chosen frame rate.
//
// Sound: the sketch's sound file (if it has one) is decoded and encoded
// alongside, starting from its beginning. Sound a sketch synthesises live
// (Tone) can't be rendered this way; "Live" mode in the panel still records that.
//
// main.js hands over control of the clock via `timeline`:
//   { get() -> seconds, set(seconds), step(time, delta) }  — step renders one frame.

export const smoothSupported = () =>
  typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

// H.264 Baseline (4.0: up to 1080p, then 3.1: 720p). Baseline has no B-frames:
// Main/High let encoders (Firefox's, measured) emit frames out of order, which
// mp4-muxer can't store — three of every four frames went missing.
const AVC = ['avc1.420028', 'avc1.42001f'];

async function pickVideoConfig(w, h, fps, bitrate) {
  const base = { width: w, height: h, framerate: fps, bitrate, bitrateMode: 'variable', latencyMode: 'quality' };
  for (const codec of AVC) {
    const config = { ...base, codec, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(config).catch(() => ({}))).supported) return { config, muxCodec: 'avc' };
  }
  const vp9 = { ...base, codec: 'vp09.00.40.08' };
  if ((await VideoEncoder.isConfigSupported(vp9).catch(() => ({}))).supported) return { config: vp9, muxCodec: 'vp9' };
  return null;
}

async function pickAudioConfig(sampleRate, numberOfChannels) {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [codec, muxCodec] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const config = { codec, sampleRate, numberOfChannels, bitrate: 192000 };
    if ((await AudioEncoder.isConfigSupported(config).catch(() => ({}))).supported) return { config, muxCodec };
  }
  return null;
}

// The first `seconds` of the sketch's sound, decoded. Null if there is none.
async function loadMusic(seconds) {
  const music = getMusic();
  if (!music?.el.src) return null;
  const bytes = await (await fetch(music.el.src)).arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const buffer = await ctx.decodeAudioData(bytes);
  const loop = music.el.loop;
  const frames = Math.round(seconds * buffer.sampleRate);
  const channels = Math.min(2, buffer.numberOfChannels);
  // Planar float32, looping the track if the clip is longer (like the player does).
  const planar = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    const dst = planar.subarray(c * frames, (c + 1) * frames);
    if (loop) for (let i = 0; i < frames; i++) dst[i] = src[i % src.length];
    else dst.set(src.subarray(0, Math.min(frames, src.length)));
  }
  return { planar, frames, channels, sampleRate: buffer.sampleRate };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Renders `seconds` of animation at `fps` into an MP4 Blob.
// `canvas` must already be at the output size (even width and height).
// `shouldStop()` ends the clip early (what's rendered so far is kept).
export async function renderSmooth({ canvas, timeline, seconds, fps, mbps, includeAudio, onProgress, shouldStop }) {
  const w = canvas.width;
  const h = canvas.height;
  const picked = await pickVideoConfig(w, h, fps, Math.round(mbps * 1e6));
  if (!picked) throw new Error(`This device can't encode ${w}×${h} video. Try a smaller size.`);

  let music = null;
  let audio = null;
  if (includeAudio) {
    music = await loadMusic(seconds).catch((err) => {
      console.warn('Smooth recording: no sound', err);
      return null;
    });
    if (music) audio = await pickAudioConfig(music.sampleRate, music.channels);
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.muxCodec, width: w, height: h, frameRate: fps },
    ...(audio ? { audio: { codec: audio.muxCodec, numberOfChannels: music.channels, sampleRate: music.sampleRate } } : {}),
    fastStart: 'in-memory', // index at the front: plays and uploads cleanly everywhere
  });

  let failure = null;
  let encoded = 0;
  const isAvc = picked.muxCodec === 'avc';
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      encoded++;
      if (isAvc && meta?.decoderConfig) meta = withCleanAvcC(chunk, meta);
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => { failure = e; },
  });
  encoder.configure(picked.config);

  const total = Math.max(1, Math.round(seconds * fps));
  const dt = 1 / fps;
  const t0 = timeline.get();
  const keyEvery = fps * 2;
  let n = 0;
  try {
    for (; n < total; n++) {
      if (failure) throw failure;
      if (shouldStop?.()) break;
      timeline.step(t0 + n * dt, dt); // draws the frame into the canvas
      // Read the canvas in the same task it was drawn in (no preserveDrawingBuffer).
      const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: n % keyEvery === 0 });
      frame.close();
      onProgress?.(n + 1, total);
      // Let the encoder catch up (keeps memory flat on slow phones), and give the
      // page a chance to paint the progress bar.
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4));
      await nextFrame();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    timeline.set(t0 + n * dt);
  }

  const clipSeconds = n / fps;
  // Some software encoders (Firefox's) silently skip frames to hold the bitrate.
  if (encoded < n) console.warn(`Smooth recording: encoder kept ${encoded} of ${n} frames (${picked.config.codec})`);
  if (audio && n) await encodeAudio(muxer, audio.config, music, clipSeconds);

  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), seconds: clipSeconds, mime: 'video/mp4' };
}

async function encodeAudio(muxer, config, music, seconds) {
  let failure = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(config);
  const frames = Math.min(music.frames, Math.round(seconds * music.sampleRate));
  const block = 4096;
  for (let start = 0; start < frames; start += block) {
    const len = Math.min(block, frames - start);
    const data = new Float32Array(len * music.channels);
    for (let c = 0; c < music.channels; c++) {
      data.set(music.planar.subarray(c * music.frames + start, c * music.frames + start + len), c * len);
    }
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: music.sampleRate,
      numberOfFrames: len,
      numberOfChannels: music.channels,
      timestamp: Math.round((start * 1e6) / music.sampleRate),
      data,
    });
    encoder.encode(ad);
    ad.close();
    if (failure) throw failure;
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

// The H.264 header (avcC) a browser hands over isn't always well-formed:
// Firefox's has a stray byte at the start of the SPS, which strict players
// reject. Rebuild it from the SPS/PPS that the key frame carries in-band.
function withCleanAvcC(chunk, meta) {
  const data = new Uint8Array(chunk.byteLength);
  chunk.copyTo(data);
  let sps = null;
  let pps = null;
  for (let i = 0; i + 4 <= data.length; ) {
    const len = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
    if (len <= 0 || i + 4 + len > data.length) break;
    const nal = data.subarray(i + 4, i + 4 + len);
    const type = nal[0] & 0x1f;
    if (type === 7 && !sps) sps = nal;
    if (type === 8 && !pps) pps = nal;
    i += 4 + len;
  }
  if (!sps || !pps) return meta;
  const avcC = new Uint8Array(11 + sps.length + pps.length);
  avcC.set([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff]);
  avcC.set(sps, 8);
  avcC.set([1, pps.length >> 8, pps.length & 0xff], 8 + sps.length);
  avcC.set(pps, 11 + sps.length);
  return { ...meta, decoderConfig: { ...meta.decoderConfig, description: avcC } };
}
