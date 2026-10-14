import { SIZE_PRESETS, pickMimeType } from '../core/recorder.js';
import { getUser, onAuthChange } from '../core/community.js';
import { postClip, listClips, deleteClip, clipUrl, MAX_CLIP_BYTES } from '../core/clips.js';
import { promptSignIn } from './signIn.js';

// "Record a clip": the canvas plus the sketch's sound, saved as a video file,
// then shared (phone share sheet: TikTok, Instagram, Photos …), saved, or
// posted to aiship. A thin UI over core/recorder.js and core/clips.js.

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const fmtBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);

function describeMime(mime) {
  if (!mime) return 'not supported in this browser';
  return mime.startsWith('video/mp4') ? 'MP4 (H.264 + AAC)' : 'WebM (VP9/VP8 + Opus)';
}

const touch = window.matchMedia('(pointer: coarse)').matches;

export function createMediaPanel(container, { recorder, toast, getSketchId, getSketchName }) {
  container.innerHTML = `
    <div class="params-panel-header"><div class="params-panel-title">Record a clip</div></div>

    <div class="media-section">
      <label class="media-field"><span>How</span>
        <select data-role="mode">
          <option value="smooth">Smooth: render frame by frame (no lag)</option>
          <option value="live">Live: film the screen as it plays</option>
        </select></label>
      <label class="media-field" data-role="lengthField"><span>Length</span>
        <select data-role="seconds">
          <option value="5">5 s</option><option value="10" selected>10 s</option><option value="15">15 s</option>
          <option value="30">30 s</option><option value="60">60 s</option>
        </select></label>
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
      <div class="media-progress" data-role="progress" hidden><div></div></div>
      <div class="media-status" data-role="status"></div>
      <div class="media-hint" data-role="modeHint"></div>
    </div>

    <div class="media-section" data-role="result" hidden>
      <div class="media-heading">Your clip</div>
      <video class="media-preview" data-role="preview" controls playsinline loop muted></video>
      <div class="media-row media-wrap">
        <button type="button" class="media-btn" data-role="share">Share…</button>
        <button type="button" class="media-btn" data-role="save">Save</button>
      </div>
      <label class="media-field media-caption"><span>Caption</span>
        <input data-role="caption" maxlength="300" placeholder="Say something about it (optional)" /></label>
      <div class="media-row">
        <button type="button" class="media-btn media-post" data-role="post">Post to aiship</button>
        <span class="media-time" data-role="postStatus"></span>
      </div>
    </div>

    <div class="media-section" data-role="clipsSection">
      <div class="media-heading">Clips of this sketch</div>
      <div class="media-clips" data-role="clips"></div>
    </div>
  `;
  container.classList.add('media-panel');

  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const sizeSel = $('size');
  const modeSel = $('mode');
  const recordBtn = $('record');
  const recTime = $('recTime');
  const statusEl = $('status');
  const progress = $('progress');
  const preview = $('preview');
  const postBtn = $('post');
  const postStatus = $('postStatus');

  SIZE_PRESETS.forEach((p) => sizeSel.add(new Option(p.label, p.id)));
  // Phones: vertical by default; it's what the clip will be posted as anyway.
  if (touch) sizeSel.value = window.innerHeight > window.innerWidth ? 'vertical' : '720';
  if (!recorder.smoothSupported) {
    modeSel.value = 'live';
    modeSel.options[0].disabled = true;
  }
  if (!pickMimeType()) modeSel.options[1].disabled = true;
  if (!recorder.supported) {
    recordBtn.disabled = true;
    statusEl.textContent = "This browser can't record video.";
  }

  function renderModeHint() {
    const smooth = modeSel.value === 'smooth';
    $('lengthField').hidden = !smooth;
    $('modeHint').innerHTML = smooth
      ? 'Smooth renders the animation one frame at a time, so the video never stutters, even on a phone. ' +
        "Slow devices just take longer. It includes the sketch's sound file, but not sound a sketch makes live or your microphone, and you can't steer the sketch while it renders. Format: MP4."
      : 'Live films the screen as it plays, so you can steer the sketch while recording. A busy phone may stutter. ' +
        `Format: ${describeMime(pickMimeType(true))}.`;
    $('modeHint').innerHTML += ' The equation and controls aren\'t in the video. Press <b>R</b> to start or stop.';
  }
  modeSel.addEventListener('change', renderModeHint);
  renderModeHint();

  // ---- recording ----
  function options() {
    return {
      mode: modeSel.value,
      seconds: Number($('seconds').value),
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
      toast(modeSel.value === 'smooth' ? 'Rendering your clip…' : 'Recording…  press R to stop');
    } catch (err) {
      toast(err.message);
    }
  }
  recordBtn.addEventListener('click', toggleRecord);

  function renderRecordState() {
    const rec = recorder.recording;
    const rendering = recorder.rendering;
    recordBtn.textContent = rec ? (rendering ? '■ Stop here' : '■ Stop') : '● Record';
    recordBtn.classList.toggle('recording', rec);
    for (const role of ['size', 'fps', 'mbps', 'mode', 'seconds']) $(role).disabled = rec;
    recTime.textContent = rec ? fmtTime(recorder.elapsed) : '';
    progress.hidden = !rendering;
    const s = recorder.saved;
    $('result').hidden = !s || rec;
    if (!rec && s) statusEl.textContent = `${fmtTime(s.seconds)} · ${fmtBytes(s.blob.size)}`;
    document.body.classList.toggle('is-recording', rec);
  }
  recorder.subscribe(renderRecordState);

  let shownUrl = null;
  recorder.setOnEnded((saved, err) => {
    if (err) {
      statusEl.textContent = `Couldn't record: ${err.message}`;
      toast("Couldn't record the clip");
      return;
    }
    toast(saved ? (touch ? 'Clip ready: share, save or post it' : `Saved ${saved.filename}`) : 'Recording was empty, nothing saved');
    if (!saved) {
      statusEl.textContent = 'The recording came out empty (no frames were captured).';
      return;
    }
    if (shownUrl !== saved.url) {
      shownUrl = saved.url;
      preview.src = saved.url;
      preview.play().catch(() => {});
      $('caption').value = '';
      postStatus.textContent = '';
      postBtn.disabled = false;
    }
  });

  // Live timer and render progress.
  setInterval(() => {
    if (!recorder.recording) return;
    recTime.textContent = recorder.rendering
      ? `${fmtTime(recorder.elapsed)} · ${Math.round(recorder.progress * 100)}%`
      : fmtTime(recorder.elapsed);
    progress.firstElementChild.style.width = `${recorder.progress * 100}%`;
  }, 200);

  // ---- share / save ----
  const fileOf = (s) => new File([s.blob], s.filename, { type: s.blob.type });
  const canShareFiles = () => {
    const s = recorder.saved;
    try {
      return Boolean(s && navigator.canShare?.({ files: [fileOf(s)] }));
    } catch {
      return false;
    }
  };
  $('share').addEventListener('click', async () => {
    const s = recorder.saved;
    if (!s) return;
    if (!canShareFiles()) {
      toast("This browser can't share files. Use Save, then upload it from your files.");
      return;
    }
    try {
      await navigator.share({ files: [fileOf(s)], title: getSketchName(), text: `${getSketchName()} · aiship.lol` });
    } catch (err) {
      if (err.name !== 'AbortError') toast(`Couldn't share: ${err.message}`);
    }
  });
  $('save').addEventListener('click', () => recorder.download());

  // ---- post to aiship ----
  postBtn.addEventListener('click', async () => {
    const s = recorder.saved;
    if (!s) return;
    if (!getUser()) {
      promptSignIn('login');
      return;
    }
    if (s.blob.size > MAX_CLIP_BYTES) {
      postStatus.textContent = 'Over 50 MB: record it shorter, smaller or at Standard quality.';
      return;
    }
    postBtn.disabled = true;
    postStatus.textContent = `Uploading ${fmtBytes(s.blob.size)}…`;
    try {
      const clip = await postClip(s.blob, { sketchId: s.sketchId, caption: $('caption').value, seconds: s.seconds });
      postStatus.textContent = clip.status === 'approved' ? 'Posted!' : 'Posted! Others see it once it has been reviewed.';
      toast('Clip posted');
      refreshClips();
    } catch (err) {
      postBtn.disabled = false;
      postStatus.textContent = /relation .*clips|bucket not found/i.test(err.message)
        ? "Posting isn't switched on yet (the site owner needs to run migration 0007)."
        : `Couldn't post: ${err.message}`;
    }
  });

  // ---- clips of the sketch on screen ----
  const clipsEl = $('clips');
  let clipsFor = null;
  async function refreshClips() {
    const id = getSketchId();
    clipsFor = id;
    let clips = [];
    try {
      clips = await listClips({ sketchId: id, limit: 12 });
    } catch {
      clips = []; // table not there yet, or offline: just show none
    }
    if (clipsFor !== id) return;
    clipsEl.textContent = '';
    if (!clips.length) {
      clipsEl.innerHTML = '<p class="media-hint">No clips yet. Record one and post it.</p>';
      return;
    }
    for (const clip of clips) clipsEl.append(clipCard(clip, refreshClips));
  }
  onAuthChange(() => {
    if (!container.classList.contains('hidden')) refreshClips();
  });

  renderRecordState();
  return { toggleRecord, refreshClips };
}

// A clip in a list: the video (loads when played), who posted it, and a delete
// button on your own.
export function clipCard(clip, onDeleted) {
  const card = document.createElement('figure');
  card.className = 'clip-card';
  const v = document.createElement('video');
  v.src = clipUrl(clip.path);
  v.controls = true;
  v.playsInline = true;
  v.preload = 'metadata';
  v.loop = true;
  if (clip.width && clip.height) v.style.aspectRatio = `${clip.width} / ${clip.height}`;
  const cap = document.createElement('figcaption');
  const who = document.createElement('a');
  who.href = `/u/${clip.author?.username ?? ''}`;
  who.dataset.link = '';
  who.textContent = `@${clip.author?.username ?? 'someone'}`;
  cap.append(who);
  if (clip.status === 'pending') cap.append(' · waiting for review');
  if (clip.caption) {
    const t = document.createElement('div');
    t.className = 'clip-caption';
    t.textContent = clip.caption;
    cap.append(t);
  }
  if (getUser()?.id === clip.user_id) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'clip-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!window.confirm('Delete this clip?')) return;
      try {
        await deleteClip(clip);
        card.remove();
        onDeleted?.();
      } catch (err) {
        window.alert(`Couldn't delete it: ${err.message}`);
      }
    });
    cap.append(' ', del);
  }
  card.append(v, cap);
  return card;
}
