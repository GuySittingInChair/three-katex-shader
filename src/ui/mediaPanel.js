import katex from 'katex';
import { pickMimeType } from '../core/recorder.js';
import { getUser, onAuthChange } from '../core/community.js';
import { postClip, listClips, deleteClip, clipUrl, MAX_CLIP_BYTES } from '../core/clips.js';
import { promptSignIn } from './signIn.js';
import { icon } from './icons.js';

// "Record a clip": the canvas, the live equation and the sketch's sound, saved
// as a video file, then shared (phone share sheet: TikTok, Instagram, Photos …),
// saved, or posted to aiship. A thin UI over core/recorder.js and core/clips.js.
//
// Laid out like a camera app (preview on top, shape and length chips, one big
// shutter button), except the shutter's ring is a polar rose that fills as the
// clip renders, and the clock reads like a variable.

const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const fmtBytes = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);

function describeMime(mime) {
  if (!mime) return 'not supported in this browser';
  return mime.startsWith('video/mp4') ? 'MP4' : 'WebM';
}

const touch = window.matchMedia('(pointer: coarse)').matches;

// Chip labels for the size presets (ids from core/recorder.js).
const SHAPES = { window: 'Screen', vertical: '9:16', square: '1:1', 720: '16:9', 1080: '16:9 HD' };
const SHAPE_ORDER = ['window', 'vertical', 'square', '720', '1080'];
const LENGTHS = [5, 10, 15, 30, 60];

// The shutter ring: r(θ) = R(1 + ε cos kθ), as an SVG path in a 100 × 100 box.
const ROSE = { R: 44, eps: 0.045, k: 12 };
const ROSE_TEX = `r(\\theta) = 1 + \\tfrac{1}{20}\\cos ${ROSE.k}\\theta`;
function rosePath() {
  const pts = [];
  for (let i = 0; i <= 360; i++) {
    const th = (i / 360) * 2 * Math.PI - Math.PI / 2; // start at 12 o'clock
    const r = ROSE.R * (1 + ROSE.eps * Math.cos(ROSE.k * th));
    pts.push(`${(50 + r * Math.cos(th)).toFixed(2)},${(50 + r * Math.sin(th)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

// Panel choices are remembered per browser (a convenience; defaults if storage is blocked).
const STORE_KEY = 'aiship.record';
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: just don't remember */
  }
}

const chips = (role, items) =>
  `<div class="rec-chips" role="radiogroup" data-role="${role}">${items
    .map(([value, label]) => `<button type="button" role="radio" class="rec-chip" data-value="${value}">${label}</button>`)
    .join('')}</div>`;

export function createMediaPanel(container, { recorder, toast, getSketchId, getSketchName }) {
  const rose = rosePath();
  container.innerHTML = `
    <div class="params-panel-header rec-header">
      <div class="params-panel-title">Record</div>
      ${chips('mode', [['smooth', 'Smooth'], ['live', 'Live']]).replace('rec-chips', 'rec-chips rec-seg')}
    </div>

    <div class="rec-stage" data-role="stage">
      <canvas data-role="previewCanvas"></canvas>
      <div class="rec-pill" data-role="pill"><i></i><span data-role="pillText">Preview</span></div>
    </div>

    <div class="rec-controls">
      ${chips('shape', SHAPE_ORDER.map((id) => [id, SHAPES[id]]))}
      <div data-role="lengthRow">${chips('seconds', LENGTHS.map((n) => [n, `${n}s`]))}</div>
      <div class="rec-live-note" data-role="liveNote">Records until you stop it.</div>
      <div class="rec-layers">
        <button type="button" class="rec-toggle" data-role="eqToggle" aria-pressed="true">${icon('sigma')}Equation</button>
        <button type="button" class="rec-toggle" data-role="tagToggle" aria-pressed="true">${icon('tag')}Name tag</button>
        <button type="button" class="rec-toggle" data-role="audioToggle" aria-pressed="true">${icon('volume')}Sound</button>
      </div>
    </div>

    <div class="rec-shutter-row">
      <button type="button" class="rec-side rec-last" data-role="last" title="Your last clip" disabled></button>
      <button type="button" class="rec-shutter" data-role="record" aria-label="Record">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path class="rec-ring-track" d="${rose}" />
          <path class="rec-ring-fill" data-role="ring" d="${rose}" pathLength="1" />
        </svg>
        <span class="rec-core"></span>
      </button>
      <button type="button" class="rec-side" data-role="gear" title="More settings" aria-expanded="false">${icon('gear')}</button>
    </div>
    <div class="rec-clock" data-role="clock"></div>
    <div class="media-status" data-role="status"></div>

    <div class="rec-more" data-role="more" hidden>
      <div class="rec-more-row"><span>Equation sits</span>${chips('eqPos', [['top', 'Top'], ['bottom', 'Bottom']])}</div>
      <div class="rec-more-row"><span>Frame rate</span>${chips('fps', [['30', '30'], ['60', '60']])}</div>
      <div class="rec-more-row"><span>Quality</span>${chips('mbps', [['6', 'Std'], ['12', 'High'], ['24', 'Max']])}</div>
      <label class="media-check"><input type="checkbox" data-role="restart" checked /> Start the sound from the beginning</label>
      <div class="media-hint" data-role="modeHint"></div>
    </div>

    <div class="rec-result" data-role="result" hidden>
      <video class="media-preview" data-role="preview" controls playsinline loop muted></video>
      <div class="rec-actions">
        <button type="button" class="rec-action" data-role="share">${icon('share')}<span>Share</span></button>
        <button type="button" class="rec-action" data-role="save">${icon('save')}<span>Save</span></button>
        <button type="button" class="rec-action rec-action-post" data-role="post">${icon('send')}<span>Post</span></button>
      </div>
      <input class="rec-caption" data-role="caption" maxlength="300" placeholder="Caption for aiship (optional)" />
      <div class="media-time" data-role="postStatus"></div>
    </div>

    <div class="media-section" data-role="clipsSection">
      <div class="media-heading">Clips of this sketch</div>
      <div class="media-clips" data-role="clips"></div>
    </div>
  `;
  container.classList.add('media-panel');

  const $ = (role) => container.querySelector(`[data-role="${role}"]`);
  const recordBtn = $('record');
  const statusEl = $('status');
  const preview = $('preview');
  const postBtn = $('post');
  const postStatus = $('postStatus');
  const stage = $('stage');
  const previewCanvas = $('previewCanvas');
  const ring = $('ring');
  const clock = $('clock');

  // ---- settings state ----
  const prefs = {
    mode: recorder.smoothSupported ? 'smooth' : 'live',
    // Phones: vertical by default; it's what the clip will be posted as anyway.
    shape: touch ? (window.innerHeight > window.innerWidth ? 'vertical' : '720') : 'window',
    seconds: '10',
    fps: '30',
    mbps: '12',
    eqPos: 'top',
    equation: true,
    tag: true,
    audio: true,
    restart: true,
    ...loadPrefs(),
  };
  if (!recorder.smoothSupported) prefs.mode = 'live';
  if (!pickMimeType() && recorder.smoothSupported) prefs.mode = 'smooth';

  const groups = ['mode', 'shape', 'seconds', 'fps', 'mbps', 'eqPos'];
  const toggles = { eqToggle: 'equation', tagToggle: 'tag', audioToggle: 'audio' };

  function render() {
    for (const g of groups) {
      for (const b of $(g).children) {
        const on = b.dataset.value === String(prefs[g]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
      }
    }
    for (const [role, key] of Object.entries(toggles)) $(role).setAttribute('aria-pressed', prefs[key]);
    $('restart').checked = prefs.restart;
    const smooth = prefs.mode === 'smooth';
    $('lengthRow').hidden = !smooth;
    $('liveNote').hidden = smooth;
    $('modeHint').innerHTML = smooth
      ? 'Smooth renders one frame at a time, so the clip never stutters, even on a phone; slow devices just take longer. ' +
        "Sound: the sketch's sound file (not live synth or your mic). You can't steer the sketch while it renders. MP4."
      : `Live films the screen as it plays, so you can steer the sketch while recording. A busy phone may stutter. ${describeMime(pickMimeType(true))}.`;
    $('modeHint').innerHTML += ' Press <b>R</b> to start or stop.';
    sizeStage();
    savePrefs(prefs);
  }

  for (const g of groups) {
    $(g).addEventListener('click', (e) => {
      const b = e.target.closest('.rec-chip');
      if (!b || b.disabled || recorder.recording) return;
      prefs[g] = b.dataset.value;
      render();
    });
  }
  for (const [role, key] of Object.entries(toggles)) {
    $(role).addEventListener('click', () => {
      if (recorder.recording) return;
      prefs[key] = !prefs[key];
      render();
    });
  }
  $('restart').addEventListener('change', (e) => {
    prefs.restart = e.target.checked;
    render();
  });
  $('gear').addEventListener('click', () => {
    const more = $('more');
    more.hidden = !more.hidden;
    $('gear').setAttribute('aria-expanded', !more.hidden);
  });
  if (!recorder.smoothSupported) $('mode').children[0].disabled = true;
  if (!pickMimeType()) $('mode').children[1].disabled = true;
  if (!recorder.supported) {
    recordBtn.disabled = true;
    statusEl.textContent = "This browser can't record video.";
  }

  // ---- preview: the clip's shape, framing and overlay, live ----
  // The stage takes the clip's shape at the largest size the panel allows.
  function sizeStage() {
    const { w, h } = recorder.outputSize(prefs.shape);
    const avail = stage.parentElement.clientWidth || 300;
    const maxH = Math.max(160, window.innerHeight * (touch ? 0.32 : 0.42));
    const k = Math.min(avail / w, maxH / h);
    const cw = Math.round(w * k);
    const ch = Math.round(h * k);
    stage.style.width = `${cw}px`;
    stage.style.height = `${ch}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(cw * dpr);
    const ph = Math.round(ch * dpr);
    if (previewCanvas.width !== pw || previewCanvas.height !== ph) {
      previewCanvas.width = pw;
      previewCanvas.height = ph;
    }
  }
  const previewOptions = () => ({
    sizeId: prefs.shape,
    equation: prefs.equation ? prefs.eqPos : 'off',
    tag: prefs.tag,
  });
  window.addEventListener('resize', () => {
    if (!container.classList.contains('hidden')) sizeStage();
  });

  // ---- recording ----
  function options() {
    return {
      mode: prefs.mode,
      seconds: Number(prefs.seconds),
      sizeId: prefs.shape,
      fps: Number(prefs.fps),
      mbps: Number(prefs.mbps),
      includeAudio: prefs.audio,
      restartMusic: prefs.restart,
      equation: prefs.equation ? prefs.eqPos : 'off',
      tag: prefs.tag,
    };
  }

  function toggleRecord() {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    try {
      recorder.start(options());
      toast(prefs.mode === 'smooth' ? 'Rendering your clip…' : 'Recording…  press R to stop');
    } catch (err) {
      toast(err.message);
    }
  }
  recordBtn.addEventListener('click', toggleRecord);

  // The clock under the shutter, typeset. Idle, it shows the ring's own equation.
  let clockTex = null;
  function setClock(tex) {
    if (tex === clockTex) return;
    clockTex = tex;
    katex.render(tex, clock, { throwOnError: false });
  }
  function tick() {
    const rec = recorder.recording;
    const rendering = recorder.rendering;
    const t = recorder.elapsed;
    let p = 0;
    if (rendering) p = recorder.progress;
    else if (rec) p = (t % 60) / 60; // live: a minute hand
    ring.style.strokeDashoffset = String(1 - p);
    if (rendering) {
      setClock(`t = ${t.toFixed(1)}\\,\\text{s} \\;/\\; ${prefs.seconds}\\,\\text{s} \\quad ${Math.round(p * 100)}\\%`);
      $('pillText').textContent = `Rendering ${fmtTime(t)}`;
    } else if (rec) {
      setClock(`t = ${t.toFixed(1)}\\,\\text{s}`);
      $('pillText').textContent = `REC ${fmtTime(t)}`;
    } else {
      setClock(ROSE_TEX);
    }
  }
  setInterval(() => {
    if (recorder.recording) tick();
  }, 100);

  function renderRecordState() {
    const rec = recorder.recording;
    recordBtn.classList.toggle('recording', rec);
    recordBtn.setAttribute('aria-label', rec ? 'Stop' : 'Record');
    container.classList.toggle('is-rec', rec);
    for (const g of groups) for (const b of $(g).children) b.disabled = rec;
    for (const role of Object.keys(toggles)) $(role).disabled = rec;
    if (!rec) $('pillText').textContent = 'Preview';
    if (!recorder.smoothSupported) $('mode').children[0].disabled = true;
    if (!pickMimeType()) $('mode').children[1].disabled = true;
    const s = recorder.saved;
    $('result').hidden = !s || rec;
    if (!rec && s) statusEl.textContent = `${fmtTime(s.seconds)} · ${fmtBytes(s.blob.size)}`;
    else if (rec) statusEl.textContent = '';
    document.body.classList.toggle('is-recording', rec);
    tick();
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
      // The last-clip thumbnail beside the shutter, like a camera roll.
      const last = $('last');
      last.disabled = false;
      last.innerHTML = '';
      const thumb = document.createElement('video');
      thumb.src = saved.url;
      thumb.muted = true;
      thumb.playsInline = true;
      thumb.preload = 'metadata';
      last.append(thumb);
    }
  });
  $('last').addEventListener('click', () => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }));

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
      postStatus.textContent = 'Over 50 MB: record it shorter, smaller or at Std quality.';
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

  render();
  renderRecordState();
  return {
    toggleRecord,
    refreshClips,
    show() {
      sizeStage();
      document.body.classList.add('rec-panel-open');
      recorder.setPreview(previewCanvas, previewOptions);
      refreshClips();
    },
    hide() {
      document.body.classList.remove('rec-panel-open');
      recorder.setPreview(null);
    },
  };
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
