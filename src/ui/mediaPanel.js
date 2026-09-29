import { SIZE_PRESETS, pickMimeType } from '../core/recorder.js';

// "Record a clip": the canvas plus the sketch's sound, saved as a video file.
// A thin UI over core/recorder.js.

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
    <div class="params-panel-header"><div class="params-panel-title">Record a clip</div></div>

    <div class="media-section">
      <label class="media-field"><span>Size</span><select data-role="size"></select></label>
      <label class="media-field"><span>Frame rate</span>
        <select data-role="fps"><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
      <label class="media-field"><span>Quality</span>
        <select data-role="mbps"><option value="6">Standard · 6 Mbps</option><option value="12" selected>High · 12 Mbps</option><option value="24">Max · 24 Mbps</option></select></label>
      <label class="media-check"><input type="checkbox" data-role="audio" checked /> Include the sketch's sound</label>
      <label class="media-check"><input type="checkbox" data-role="restart" checked /> Start the sound from the beginning</label>
      <div class="media-row">
        <button type="button" class="media-btn media-rec" data-role="record">● Record</button>
        <span class="media-time" data-role="recTime"></span>
      </div>
      <div class="media-row">
        <button type="button" class="media-btn" data-role="again" hidden>Save last recording again</button>
      </div>
      <div class="media-status" data-role="status"></div>
      <div class="media-hint" data-role="formatHint"></div>
      <div class="media-hint">The video has the animation and its sound (turn sound on first). The equation and controls aren't in it. Press <b>R</b> to start or stop.</div>
    </div>
  `;
  container.classList.add('media-panel');

  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const sizeSel = $('size');
  const recordBtn = $('record');
  const recTime = $('recTime');
  const againBtn = $('again');
  const statusEl = $('status');

  SIZE_PRESETS.forEach((p) => sizeSel.add(new Option(p.label, p.id)));
  $('formatHint').textContent = `Recording format: ${describeMime(pickMimeType(true))}.`;
  if (!recorder.supported) {
    recordBtn.disabled = true;
    statusEl.textContent = 'This browser has no MediaRecorder, so video recording is unavailable.';
  }

  // ---- recording ----
  function options() {
    return {
      sizeId: sizeSel.value,
      fps: Number($('fps').value),
      mbps: Number($('mbps').value),
      includeAudio: $('audio').checked,
      restartMusic: $('restart').checked,
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

  // Keep the REC timer live.
  setInterval(() => {
    if (recorder.recording) recTime.textContent = fmtTime(recorder.elapsed);
  }, 250);

  renderRecordState();
  return { toggleRecord };
}
