import { loadMusic, getMusic, unloadMusic } from '../core/audioEngine.js';
import { SIZE_PRESETS, pickMimeType } from '../core/recorder.js';

// Right-docked panel: load a music track, and record the canvas + audio to a
// video file. Everything here is a thin UI over core/audioEngine.js (the
// track) and core/recorder.js (the recording).

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const fmtBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);

function describeMime(mime) {
  if (!mime) return 'not supported in this browser';
  const container = mime.startsWith('video/mp4') ? 'MP4 (H.264 + AAC)' : 'WebM (VP9/VP8 + Opus)';
  return container;
}

export function createMediaPanel(container, { recorder, toast }) {
  container.innerHTML = `
    <div class="params-panel-header"><div class="params-panel-title">Media</div></div>

    <div class="media-section">
      <div class="media-heading">Music</div>
      <div class="media-row">
        <button type="button" class="media-btn" data-role="load">Load audio file…</button>
        <input type="file" accept="audio/*" hidden data-role="file" />
      </div>
      <div class="media-track" data-role="track">No track loaded</div>
      <div class="media-row">
        <button type="button" class="media-btn" data-role="play" disabled>▶</button>
        <input type="range" min="0" max="1" step="0.001" value="0" data-role="seek" disabled />
        <span class="media-time" data-role="time">0:00</span>
      </div>
      <div class="media-row">
        <label class="media-check"><input type="checkbox" data-role="loop" /> Loop</label>
        <span class="media-spacer"></span>
        <span class="media-label">Volume</span>
        <input type="range" min="0" max="1" step="0.01" value="1" data-role="volume" />
      </div>
      <div class="media-hint">Plays through your speakers and drives the audio-reactive sketches (bass / mid / treble). You can also drop an audio file onto the window.</div>
    </div>

    <div class="media-section">
      <div class="media-heading">Record video</div>
      <label class="media-field"><span>Size</span><select data-role="size"></select></label>
      <label class="media-field"><span>Frame rate</span>
        <select data-role="fps"><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
      <label class="media-field"><span>Quality</span>
        <select data-role="mbps"><option value="6">Standard · 6 Mbps</option><option value="12" selected>High · 12 Mbps</option><option value="24">Max · 24 Mbps</option></select></label>
      <label class="media-check"><input type="checkbox" data-role="audio" checked /> Include audio (track + any synth sounds)</label>
      <label class="media-check"><input type="checkbox" data-role="restart" checked /> Restart the track when recording starts</label>
      <label class="media-check"><input type="checkbox" data-role="stopAtEnd" /> Stop when the track ends</label>
      <div class="media-row">
        <button type="button" class="media-btn media-rec" data-role="record">● Record</button>
        <span class="media-time" data-role="recTime"></span>
      </div>
      <div class="media-row">
        <button type="button" class="media-btn" data-role="again" hidden>Save last recording again</button>
      </div>
      <div class="media-status" data-role="status"></div>
      <div class="media-hint" data-role="formatHint"></div>
      <div class="media-hint">The file contains the canvas and audio. The equation overlay and controls are HTML on top of the canvas, so they are not recorded — to have the equation in the video, capture the window with a screen recorder such as OBS.</div>
      <div class="media-hint">WebM to MP4:<br><code>ffmpeg -i clip.webm -c:v libx264 -crf 18 -c:a aac clip.mp4</code></div>
    </div>

    <div class="media-section">
      <div class="media-heading">Keys</div>
      <div class="media-hint"><b>H</b> hide controls (cycles full → equation only → nothing) · <b>Esc</b> show controls · <b>F</b> fullscreen · <b>R</b> record / stop · <b>Space</b> play / pause the track · <b>1–8</b> notes and <b>B</b> bloom (Sound panel)</div>
    </div>
  `;
  container.classList.add('media-panel');

  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const fileInput = $('file');
  const trackEl = $('track');
  const playBtn = $('play');
  const seek = $('seek');
  const timeEl = $('time');
  const loopBox = $('loop');
  const volume = $('volume');
  const sizeSel = $('size');
  const recordBtn = $('record');
  const recTime = $('recTime');
  const againBtn = $('again');
  const statusEl = $('status');
  let scrubbing = false;

  SIZE_PRESETS.forEach((p) => sizeSel.add(new Option(p.label, p.id)));
  $('formatHint').textContent = `Recording format: ${describeMime(pickMimeType(true))}.`;
  if (!recorder.supported) {
    recordBtn.disabled = true;
    statusEl.textContent = 'This browser has no MediaRecorder, so video recording is unavailable.';
  }

  // ---- music ----
  async function loadFile(file) {
    try {
      const music = await loadMusic(file);
      trackEl.textContent = music.name;
      playBtn.disabled = false;
      seek.disabled = false;
      loopBox.checked = music.el.loop;
      volume.value = String(music.gain.gain.value);
      music.el.addEventListener('ended', syncPlay);
      music.el.addEventListener('play', syncPlay);
      music.el.addEventListener('pause', syncPlay);
      syncPlay();
      toast(`Loaded ${music.name}`);
    } catch (err) {
      toast(err.message);
    }
  }

  function syncPlay() {
    const m = getMusic();
    playBtn.textContent = m && !m.el.paused ? '⏸' : '▶';
  }

  function togglePlay() {
    const m = getMusic();
    if (!m) return;
    if (m.el.paused) m.el.play().catch((e) => toast(`Could not play: ${e.message}`));
    else m.el.pause();
  }

  $('load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  playBtn.addEventListener('click', togglePlay);
  loopBox.addEventListener('change', () => { const m = getMusic(); if (m) m.el.loop = loopBox.checked; });
  volume.addEventListener('input', () => { const m = getMusic(); if (m) m.gain.gain.value = Number(volume.value); });
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  seek.addEventListener('input', () => {
    const m = getMusic();
    if (m && Number.isFinite(m.el.duration)) m.el.currentTime = Number(seek.value) * m.el.duration;
  });
  seek.addEventListener('change', () => { scrubbing = false; });

  // ---- recording ----
  function options() {
    return {
      sizeId: sizeSel.value,
      fps: Number($('fps').value),
      mbps: Number($('mbps').value),
      includeAudio: $('audio').checked,
      restartMusic: $('restart').checked,
      stopAtMusicEnd: $('stopAtEnd').checked,
    };
  }

  function toggleRecord() {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    try {
      recorder.start(options());
      toast('Recording…  press R to stop');
    } catch (err) {
      toast(err.message);
    }
  }
  recordBtn.addEventListener('click', toggleRecord);
  againBtn.addEventListener('click', () => recorder.download());

  function renderRecordState() {
    const rec = recorder.recording;
    recordBtn.textContent = rec ? '■ Stop' : '● Record';
    recordBtn.classList.toggle('recording', rec);
    sizeSel.disabled = $('fps').disabled = $('mbps').disabled = rec;
    recTime.textContent = rec ? fmtTime(recorder.elapsed) : '';
    const s = recorder.saved;
    againBtn.hidden = !s;
    if (!rec && s) statusEl.textContent = `Saved ${s.filename} · ${fmtTime(s.seconds)} · ${fmtBytes(s.blob.size)}`;
    document.body.classList.toggle('is-recording', rec);
  }
  recorder.subscribe(renderRecordState);
  recorder.setOnEnded((saved) => {
    toast(saved ? `Saved ${saved.filename}` : 'Recording was empty — nothing saved');
    if (!saved) statusEl.textContent = 'The recording came out empty (no frames were captured).';
  });

  // Keep the seek bar, clock and REC timer live.
  setInterval(() => {
    const m = getMusic();
    if (m && !scrubbing && Number.isFinite(m.el.duration)) {
      seek.value = String(m.el.currentTime / m.el.duration);
      timeEl.textContent = `${fmtTime(m.el.currentTime)} / ${fmtTime(m.el.duration)}`;
    }
    if (recorder.recording) recTime.textContent = fmtTime(recorder.elapsed);
  }, 250);

  renderRecordState();
  return { loadFile, togglePlay, toggleRecord, unloadMusic };
}
