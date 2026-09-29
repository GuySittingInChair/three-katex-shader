import * as THREE from 'three';
import katex from 'katex';
import { resolveLatex } from './core/latex.js';
import 'katex/dist/katex.min.css';
import { SketchManager } from './core/SketchManager.js';
import { sketches } from './core/registry.js';
import { createCodePanel } from './ui/codePanel.js';
import { createCommentPanel } from './ui/commentPanel.js';
import { createParamsPanel } from './ui/paramsPanel.js';
import { createMediaPanel } from './ui/mediaPanel.js';
import { createExplainPanel } from './ui/explainPanel.js';
import { createReviewPanel } from './ui/reviewPanel.js';
import { createAccountButton } from './ui/accountButton.js';
import { createSketchGrid } from './ui/sketchGrid.js';
import { icon } from './ui/icons.js';
import { createCommunitySketches } from './core/communitySketches.js';
import { authorOf, profilePath } from './core/authors.js';
import { isAdmin, onAuthChange, getUser, setSharedSketchSound } from './core/community.js';
import {
  loadSettings,
  onSettingsChange,
  isPublished,
  savedParams,
  setPublished,
  saveParams,
  clearParams,
  hasSavedParams,
  soundPathOf,
  setSoundPath,
} from './core/sketchSettings.js';
import { promptSignIn } from './ui/signIn.js';
import { createFeed } from './ui/feed.js';
import { createProfilePage } from './ui/profilePage.js';
import { createToast, createViewMode } from './ui/viewMode.js';
import { createRecorder } from './core/recorder.js';
import { enableAudio, updateAudio, setSketchSound, setSoundOn, isSoundOn } from './core/audioEngine.js';
import { soundUrl, uploadSound, deleteSound } from './core/sounds.js';

// The sketch playing behind the landing page's headline.
const FEATURED = 'poopRocket';
const $ = (id) => document.getElementById(id);
const mobile = window.matchMedia('(max-width: 720px)');
// Touch screens get the swipe feed; mouse users keep drag-to-rotate.
const feedOn = window.matchMedia('(pointer: coarse)').matches;
if (feedOn) document.body.classList.add('feed-on');

// --- Routing: "/" landing page, "/s/<id>" a sketch, "/u/<name>" a profile ---
function parseRoute() {
  const s = /^\/s\/([^/]+)\/?$/.exec(location.pathname);
  if (s) return { page: 'viewer', id: decodeURIComponent(s[1]) };
  const u = /^\/u\/([^/]+)\/?$/.exec(location.pathname);
  if (u) return { page: 'profile', name: decodeURIComponent(u[1]) };
  if (/^\/sketches\/?$/.test(location.pathname)) return { page: 'sketches' };
  return { page: 'landing' };
}
const initialRoute = parseRoute();
const indexOf = (id) => sketches.findIndex((s) => s.id === id);
let pendingId = null; // a shared sketch named in the URL, still loading
let initialIndex = indexOf(FEATURED);
if (initialRoute.page === 'viewer') {
  if (indexOf(initialRoute.id) !== -1) initialIndex = indexOf(initialRoute.id);
  else pendingId = initialRoute.id;
}

// --- Renderer ---
const container = $('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile.matches ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = true;
container.appendChild(renderer.domElement);

const size = { width: window.innerWidth, height: window.innerHeight };
const manager = new SketchManager(renderer, size, renderer.domElement, Math.max(initialIndex, 0));
manager.isListed = (s) => isPublished(s);

const toast = createToast();
const viewMode = createViewMode({ toast });
const recorder = createRecorder({ renderer, manager, size, getName: () => manager.getCurrent().id });

// --- Equation ---
// Re-resolved against live values every frame, but KaTeX only re-renders when
// the string changes, at most ~15 times a second. It draws into the viewer's
// overlay, or into the landing page's hero while that is showing.
const mathOverlay = $('math-overlay');
let mathTarget = mathOverlay; // null on pages that don't show the equation
let lastLatex = null;
let lastMathRender = 0;
let explainApi = null; // created below; syncMath runs once before that
const MATH_MIN_INTERVAL_MS = 66;
function syncMath(force = false) {
  const tex = resolveLatex(manager.getCurrent(), manager.getParamValues(), manager.getMotion());
  if (tex === lastLatex) return;
  const now = performance.now();
  if (!force && now - lastMathRender < MATH_MIN_INTERVAL_MS) return;
  lastMathRender = now;
  lastLatex = tex;
  explainApi?.setLatex(tex);
  if (!mathTarget) return;
  if (tex) katex.render(tex, mathTarget, { throwOnError: false, displayMode: false });
  else mathTarget.innerHTML = '';
  if (tex && mathTarget === mathOverlay && mobile.matches) fitMath();
}
// On a phone, shrink a wide equation to the screen's width instead of making
// it scroll. Measured once per sketch so the live numbers don't make it jitter.
let fittedFor = null;
function fitMath() {
  const id = manager.getCurrent().id;
  if (fittedFor === id) return;
  fittedFor = id;
  mathOverlay.style.fontSize = '';
  const ratio = mathOverlay.clientWidth / mathOverlay.scrollWidth;
  if (ratio < 1) mathOverlay.style.fontSize = `${Math.max(0.45, 0.74 * ratio * 0.97).toFixed(3)}rem`;
}
function setMathTarget(el) {
  if (el === mathTarget) return;
  if (mathTarget) mathTarget.innerHTML = '';
  mathTarget = el;
  lastLatex = null;
  syncMath(true);
}

// --- Top bar and feed caption: current sketch and who made it ---
const titleName = document.querySelector('.sketch-title-name');
const titleMeta = document.querySelector('.sketch-title-meta');
const topbarAuthor = $('topbar-author');
const feedAuthor = document.querySelector('.feed-author');
const feedProfile = document.querySelector('.feed-profile');
function renderTitle(sketch) {
  const author = authorOf(sketch);
  const pending = sketch.community?.status === 'pending' ? ' · waiting for review' : '';
  titleName.textContent = sketch.name;
  const draft = !isPublished(sketch) && !pending ? ' · draft' : '';
  titleMeta.textContent = `${sketch.category || ''}${pending}${draft}`;
  for (const a of [topbarAuthor, feedAuthor, feedProfile]) a.href = profilePath(author);
  topbarAuthor.textContent = `@${author}`;
  feedAuthor.textContent = `@${author}`;
  feedProfile.textContent = '';
  if (sketch.community?.avatar) {
    const img = document.createElement('img');
    img.src = sketch.community.avatar;
    img.alt = '';
    feedProfile.append(img);
  } else {
    feedProfile.textContent = author.slice(0, 1).toUpperCase();
  }
  document.querySelector('.feed-name').textContent = sketch.name;
  document.querySelector('.feed-meta').textContent = `${sketch.category || ''}${pending}`;
  if (page === 'viewer') document.title = `${sketch.name} · aiship`;
  else if (page === 'landing') document.title = 'aiship · learn math visually';
}

// --- Panels ---
// Desktop: the code editor docks left and one other panel docks right.
// Phone: every panel is a bottom sheet (the code editor full-screen) and only
// one is open at a time.
const panels = new Map();
function registerPanel(name, el, { button, onShow, onHide, side = 'right' } = {}) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'panel-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = icon('close');
  close.addEventListener('click', () => closePanel(name));
  el.prepend(close);
  panels.set(name, { el, button, onShow, onHide, side });
  button?.addEventListener('click', () => togglePanel(name));
}
const isPanelOpen = (name) => !panels.get(name).el.classList.contains('hidden');
function closePanel(name) {
  const p = panels.get(name);
  if (!p || !isPanelOpen(name)) return;
  p.el.classList.add('hidden');
  p.button?.classList.remove('active');
  p.onHide?.();
  syncPanelState();
}
function openPanel(name) {
  const p = panels.get(name);
  for (const [other, q] of panels) {
    if (other !== name && (mobile.matches || q.side === p.side)) closePanel(other);
  }
  closeMenu();
  p.el.classList.remove('hidden');
  p.button?.classList.add('active');
  p.onShow?.();
  syncPanelState();
}
const togglePanel = (name) => (isPanelOpen(name) ? closePanel(name) : openPanel(name));
function closeAllPanels() {
  for (const name of panels.keys()) closePanel(name);
}
function syncPanelState() {
  const open = [...panels].filter(([name]) => isPanelOpen(name));
  document.body.classList.toggle('right-open', open.some(([, p]) => p.side === 'right'));
  document.body.classList.toggle('left-open', open.some(([, p]) => p.side === 'left'));
  document.body.classList.toggle('sheet-open', open.length > 0);
}

// --- Code panel ---
const codePanelApi = createCodePanel($('code-panel'), manager, {
  onShared: () => community.reload(),
});
registerPanel('code', $('code-panel'), { button: $('code-toggle'), side: 'left' });

// --- Sketch picker (viewer) and gallery (landing) ---
const pickerGrid = createSketchGrid($('picker-grid'), {
  onPick: (id) => {
    closePanel('picker');
    navigate(`/s/${encodeURIComponent(id)}`);
  },
  getCurrentId: () => manager.getCurrent().id,
  showDrafts: () => true,
});
registerPanel('picker', $('picker-panel'), { onShow: () => pickerGrid.refresh() });
$('sketch-title').addEventListener('click', () => togglePanel('picker'));

const landingGrid = createSketchGrid($('landing-grid'), {
  onPick: (id) => navigate(`/s/${encodeURIComponent(id)}`),
});

// --- Community: sign-in, shared sketches, admin review ---
const community = createCommunitySketches(manager, {
  onListChange: () => {
    codePanelApi.refresh();
    pickerGrid.refresh();
    landingGrid.refresh();
    profilePage.refresh();
    feed?.refresh();
    renderTitle(manager.getCurrent());
    if (pendingId && indexOf(pendingId) !== -1) {
      manager.goToId(pendingId);
      pendingId = null;
    }
  },
});
const openProfile = (name) => navigate(profilePath(name));
createAccountButton($('account-toggle'), { onOpenProfile: openProfile });
createAccountButton(document.querySelector('[data-role="page-account"]'), { onOpenProfile: openProfile });

// Landing buttons: Log in / Create account, or Your profile once signed in.
const landingLogIn = document.querySelector('[data-role="log-in"]');
const landingCreate = document.querySelector('[data-role="create-account"]');
const landingProfile = document.querySelector('[data-role="my-profile"]');
landingLogIn.addEventListener('click', () => promptSignIn('login'));
landingCreate.addEventListener('click', () => promptSignIn('create'));
onAuthChange((user, profile) => {
  const signedIn = Boolean(user && profile);
  landingLogIn.classList.toggle('hidden', signedIn);
  landingCreate.classList.toggle('hidden', signedIn);
  landingProfile.classList.toggle('hidden', !signedIn);
  if (signedIn) landingProfile.href = profilePath(profile.username);
});

// --- Profiles ---
const profilePage = createProfilePage($('profile'), {
  onPick: (id) => navigate(`/s/${encodeURIComponent(id)}`),
  onWriteSketch: () => {
    navigate(`/s/${encodeURIComponent(manager.getCurrent().id)}`);
    openPanel('code');
    codePanelApi.startNew();
  },
  onSignedOut: () => navigate('/'),
});

// --- Comments ---
const commentPanelApi = createCommentPanel($('comments-panel'), manager);
registerPanel('comments', $('comments-panel'), {
  button: $('comments-toggle'),
  onShow: () => commentPanelApi.show(),
  onHide: () => commentPanelApi.hide(),
});

// --- Params ---
const paramsPanelApi = createParamsPanel($('params-panel'), manager);
registerPanel('params', $('params-panel'), { button: $('params-toggle'), onShow: () => paramsPanelApi.refresh() });

// --- Explain ---
explainApi = createExplainPanel($('explain-panel'), manager);
explainApi.setLatex(lastLatex);
registerPanel('explain', $('explain-panel'), {
  button: $('explain-toggle'),
  onShow: () => explainApi.show(),
  onHide: () => explainApi.hide(),
});

// --- Review (admin only) ---
const reviewApi = createReviewPanel($('review-panel'), manager, {
  toggleButton: $('review-toggle'),
  toast,
  onReviewed: () => community.reload(),
});
registerPanel('review', $('review-panel'), { button: $('review-toggle'), onShow: () => reviewApi.show() });

// --- Media (music track + video recording) ---
const mediaApi = createMediaPanel($('media-panel'), { recorder, toast });
registerPanel('media', $('media-panel'), { button: $('media-toggle') });

// --- Dock and "more" menu ---
const DOCK = {
  'prev-btn': ['prev', ''],
  'explain-toggle': ['explain', 'Explain'],
  'params-toggle': ['params', 'Params'],
  'comments-toggle': ['comments', 'Comments'],
  'code-toggle': ['code', 'Code'],
  'hide-toggle': ['eyeOff', 'Hide'],
  'more-toggle': ['more', 'More'],
  'next-btn': ['next', ''],
};
for (const [id, [name, label]] of Object.entries(DOCK)) {
  $(id).innerHTML = `${icon(name)}${label ? `<span>${label}</span>` : ''}`;
}
$('prev-btn').addEventListener('click', () => manager.prev());
$('next-btn').addEventListener('click', () => manager.next());

const moreMenu = $('more-menu');
const moreToggle = $('more-toggle');
function closeMenu() {
  moreMenu.classList.add('hidden');
  moreToggle.setAttribute('aria-expanded', 'false');
}
moreToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = moreMenu.classList.toggle('hidden') === false;
  moreToggle.setAttribute('aria-expanded', String(open));
});
moreMenu.addEventListener('click', (e) => {
  if (e.target.closest('button')) closeMenu();
});
document.addEventListener('click', (e) => {
  if (!moreMenu.contains(e.target) && e.target !== moreToggle) closeMenu();
});

// --- Touch feed ---
let toldTap = false;
const feed = feedOn
  ? createFeed($('feed'), manager, {
      isListed: (s) => isPublished(s),
      onTap: () => {
        closeMenu();
        if (document.body.classList.contains('sheet-open')) closeAllPanels();
        else {
          viewMode.toggleClean();
          if (viewMode.view === 'clean' && !toldTap) {
            toldTap = true;
            toast('Tap again to bring the controls back');
          }
        }
      },
    })
  : null;
const FEED_BUTTONS = { explain: 'Explain', comments: 'Comments', code: 'Code', params: 'Params' };
for (const b of document.querySelectorAll('#feed-actions [data-open]')) {
  b.innerHTML = `${icon(b.dataset.open)}<span>${FEED_BUTTONS[b.dataset.open]}</span>`;
  b.addEventListener('click', () => togglePanel(b.dataset.open));
}
const interactBtn = document.querySelector('#feed-actions [data-action="interact"]');
interactBtn.innerHTML = `${icon('hand')}<span>Touch</span>`;
interactBtn.addEventListener('click', () => {
  const on = document.body.classList.toggle('feed-interact');
  interactBtn.classList.toggle('active', on);
  toast(on ? 'Touch mode: drag the sketch. Tap the hand again to swipe.' : 'Swipe up and down for more sketches');
});
const feedMore = document.querySelector('#feed-actions [data-action="more"]');
feedMore.innerHTML = `${icon('more')}<span>More</span>`;
feedMore.addEventListener('click', (e) => {
  e.stopPropagation();
  moreMenu.classList.toggle('hidden');
});

$('view-toggle').addEventListener('click', () => viewMode.cycle());
$('hide-toggle').addEventListener('click', () => {
  viewMode.set('clean', false);
  if (!feedOn) toast('Press H or Esc, or click "Show controls", to bring them back');
});
$('show-controls').addEventListener('click', () => viewMode.showAll());
$('fullscreen-toggle').addEventListener('click', () => viewMode.toggleFullscreen());

const audioToggle = $('audio-toggle');
audioToggle.addEventListener('click', async () => {
  audioToggle.disabled = true;
  audioToggle.textContent = 'Enabling microphone…';
  try {
    await enableAudio();
    audioToggle.textContent = 'Microphone on';
  } catch {
    audioToggle.textContent = 'Microphone blocked';
  } finally {
    audioToggle.disabled = false;
  }
});


// --- Pages ---
const landing = $('landing');
const profileEl = $('profile');
const sketchesEl = $('sketches-page');
let page = 'viewer';
let soundReady = false; // the sound controls are set up further down
let heroVisible = true;

function showPage(next) {
  page = next;
  document.body.dataset.page = next;
  landing.hidden = next !== 'landing';
  profileEl.hidden = next !== 'profile';
  sketchesEl.hidden = next !== 'sketches';
  if (next !== 'viewer') {
    closeAllPanels();
    closeMenu();
  }
  if (next === 'landing') landing.scrollTop = 0;
  setMathTarget(next === 'viewer' ? mathOverlay : null);
  if (next === 'profile') profileEl.scrollTop = 0;
  if (next === 'sketches') {
    sketchesEl.scrollTop = 0;
    landingGrid.refresh();
    document.title = 'Sketches · aiship';
  }
  if (next === 'viewer') requestAnimationFrame(() => feed?.sync());
  if (soundReady) updateSound(); // only the viewer plays sound
  renderTitle(manager.getCurrent());
}

function applyRoute() {
  const route = parseRoute();
  if (route.page === 'viewer') {
    if (manager.getCurrent().id !== route.id && !manager.goToId(route.id)) pendingId = route.id;
    showPage('viewer');
  } else if (route.page === 'profile') {
    showPage('profile');
    profilePage.show(route.name);
  } else if (route.page === 'sketches') {
    showPage('sketches');
  } else {
    if (manager.getCurrent().id !== FEATURED) manager.goToId(FEATURED);
    showPage('landing');
  }
}

function navigate(path) {
  if (path !== location.pathname) history.pushState(null, '', path);
  applyRoute();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(new URL(a.href).pathname);
  if (a.hasAttribute('data-guide')) {
    openPanel('explain');
    explainApi.showTab('guide');
  }
});
window.addEventListener('popstate', applyRoute);

manager.onChange((sketch) => {
  renderTitle(sketch);
  updateAdminControls();
  lastLatex = null;
  syncMath(true);
  if (page === 'viewer' && parseRoute().id !== sketch.id) {
    history.replaceState(null, '', `/s/${encodeURIComponent(sketch.id)}`);
  }
});


// Stop drawing the background once the hero has scrolled out of view.
new IntersectionObserver(([entry]) => (heroVisible = entry.isIntersecting), { root: landing }).observe(
  document.querySelector('.hero')
);

applyRoute();

// --- Admin: publish or unpublish, and save slider defaults for everyone ---
const publishToggle = $('publish-toggle');
publishToggle.addEventListener('click', async () => {
  const sketch = manager.getCurrent();
  const next = !isPublished(sketch);
  try {
    await setPublished(sketch.id, next);
    toast(next ? `Published: ${sketch.name} is in the feed` : `Unpublished: ${sketch.name} is now a draft`);
  } catch (err) {
    toast(`Couldn't change it: ${err.message}`);
  }
});

const paramsAdmin = document.createElement('div');
paramsAdmin.className = 'params-admin hidden';
paramsAdmin.innerHTML = `
  <button type="button" class="btn btn-primary" data-role="save">Save as default for everyone</button>
  <button type="button" class="btn btn-ghost" data-role="forget">Forget saved defaults</button>
  <p class="params-admin-note">Visitors start from the saved values instead of the ones in the code.</p>
`;
$('params-panel').append(paramsAdmin);
paramsAdmin.querySelector('[data-role="save"]').addEventListener('click', async () => {
  const sketch = manager.getCurrent();
  const values = {};
  for (const [key, value] of Object.entries(manager.getParamValues())) {
    if (typeof value === 'number' && Number.isFinite(value)) values[key] = value;
  }
  try {
    await saveParams(sketch.id, values);
    toast(`Saved: everyone now starts ${sketch.name} with these settings`);
  } catch (err) {
    toast(`Couldn't save: ${err.message}`);
  }
});
paramsAdmin.querySelector('[data-role="forget"]').addEventListener('click', async () => {
  const sketch = manager.getCurrent();
  try {
    await clearParams(sketch.id);
    manager.resetParams();
    paramsPanelApi.refresh();
    toast(`${sketch.name} is back to the defaults in its code`);
  } catch (err) {
    toast(`Couldn't change it: ${err.message}`);
  }
});

function updateAdminControls() {
  const sketch = manager.getCurrent();
  const admin = isAdmin();
  publishToggle.classList.toggle('hidden', !admin || Boolean(sketch.community));
  publishToggle.textContent = isPublished(sketch) ? 'Unpublish this sketch' : 'Publish this sketch';
  const hasParams = Object.keys(sketch.params || {}).length > 0;
  paramsAdmin.classList.toggle('hidden', !admin || !hasParams);
  paramsAdmin.querySelector('[data-role="forget"]').classList.toggle('hidden', !hasSavedParams(sketch.id));
}

onSettingsChange(() => {
  manager.setDefaultOverrides(savedParams());
  paramsPanelApi.refresh();
  pickerGrid.refresh();
  landingGrid.refresh();
  profilePage.refresh();
  feed?.refresh();
  renderTitle(manager.getCurrent());
  updateAdminControls();
});
onAuthChange(() => {
  pickerGrid.refresh();
  landingGrid.refresh();
  updateAdminControls();
});
loadSettings();

// --- Keyboard (viewer only) ---
function isTypingTarget(el) {
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable;
}
window.addEventListener('keydown', (e) => {
  if (page !== 'viewer' || isTypingTarget(e.target)) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'n') manager.next();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'p') manager.prev();

  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  const key = e.key.toLowerCase();
  if (key === 'h') viewMode.cycle();
  else if (key === 'escape') {
    if (!moreMenu.classList.contains('hidden')) closeMenu();
    else if (document.body.classList.contains('sheet-open')) closeAllPanels();
    else viewMode.showAll();
  } else if (key === 'f') viewMode.toggleFullscreen();
  else if (key === 'r') mediaApi.toggleRecord();
  else if (key === 'e') togglePanel('explain');
  else if (e.key === ' ' && e.target?.tagName !== 'BUTTON') {
    e.preventDefault();
    toggleSound();
  }
});

// --- Desktop: the wheel flips through sketches, like a feed ---
// One flick = one sketch. A trackpad keeps sending wheel events as it coasts,
// so after a flip the wheel is ignored until it has been still for a moment.
// Ctrl + wheel (and trackpad pinch, which arrives as Ctrl + wheel) zooms.
if (!feedOn) {
  let wheelSum = 0;
  let lastWheel = 0;
  let flippedAt = 0;
  let armed = true;
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      if (page !== 'viewer') return;
      e.preventDefault();
      const now = performance.now();
      const quiet = now - lastWheel > 220; // a new gesture, not a coast
      lastWheel = now;
      if (e.ctrlKey || e.metaKey) {
        const { controls, camera } = manager.current.ctx;
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        offset.multiplyScalar(Math.exp(e.deltaY * 0.002));
        camera.position.copy(controls.target).add(offset);
        controls.update();
        return;
      }
      if (quiet) wheelSum = 0;
      if (!armed) {
        if (!quiet && now - flippedAt < 1200) return;
        armed = true;
      }
      wheelSum += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (Math.abs(wheelSum) < 60) return;
      if (wheelSum > 0) manager.next();
      else manager.prev();
      wheelSum = 0;
      armed = false;
      flippedAt = now;
    },
    { passive: false }
  );
}

// --- The sketch's sound ---
// Built-in sketches: the admin's sound (sketch settings). Shared sketches:
// the author's, heard by others once approved.
function soundPathFor(sketch) {
  const c = sketch.community;
  if (!c) return soundPathOf(sketch.id);
  if (!c.soundPath) return null;
  return c.soundStatus === 'approved' || c.mine || isAdmin() ? c.soundPath : null;
}
const canEditSound = (sketch) => (sketch.community ? sketch.community.mine || isAdmin() : isAdmin());

const soundButtons = [$('sound-toggle'), document.querySelector('#feed-actions [data-action="sound"]')];
function updateSound() {
  const sketch = manager.getCurrent();
  const path = soundPathFor(sketch);
  setSketchSound(page === 'viewer' ? soundUrl(path) : null);
  const on = isSoundOn();
  for (const b of soundButtons) {
    b.classList.toggle('hidden', !path);
    b.classList.toggle('active', on);
    b.classList.toggle('sound-waiting', Boolean(path) && !on);
    b.innerHTML = `${icon(on ? 'volume' : 'volumeOff')}<span>${on ? 'Sound on' : 'Sound'}</span>`;
  }
  const editable = canEditSound(sketch) && Boolean(getUser());
  $('sound-upload').classList.toggle('hidden', !editable);
  $('sound-upload').textContent = path || sketch.community?.soundPath ? "Replace this sketch's sound" : 'Add a sound to this sketch';
  $('sound-remove').classList.toggle('hidden', !editable || !(sketch.community ? sketch.community.soundPath : path));
}
async function toggleSound() {
  await setSoundOn(!isSoundOn());
  updateSound();
}
for (const b of soundButtons) b.addEventListener('click', toggleSound);

// Adding, replacing or removing the current sketch's sound.
async function applySound(path) {
  const sketch = manager.getCurrent();
  const old = sketch.community ? sketch.community.soundPath : soundPathOf(sketch.id);
  if (sketch.community) {
    const row = await setSharedSketchSound(sketch.community.id, path);
    await community.reload();
    return row.sound_status;
  }
  await setSoundPath(sketch.id, path);
  if (old && old !== path) deleteSound(old);
  return 'approved';
}
const soundFile = $('sound-file');
$('sound-upload').addEventListener('click', () => soundFile.click());
soundFile.addEventListener('change', async () => {
  const file = soundFile.files[0];
  soundFile.value = '';
  if (!file) return;
  toast('Uploading sound…');
  try {
    const status = await applySound(await uploadSound(file));
    if (!isSoundOn()) await setSoundOn(true);
    updateSound();
    toast(status === 'pending' ? 'Sound added. Others will hear it once it has been reviewed.' : 'Sound added');
  } catch (err) {
    toast(`Couldn't add the sound: ${err.message}`);
  }
});
$('sound-remove').addEventListener('click', async () => {
  if (!window.confirm("Remove this sketch's sound?")) return;
  try {
    await applySound(null);
    updateSound();
    toast('Sound removed');
  } catch (err) {
    toast(`Couldn't remove it: ${err.message}`);
  }
});
manager.onChange(updateSound);
onSettingsChange(updateSound);
onAuthChange(() => updateSound());
soundReady = true;
updateSound();

// --- Loop ---
const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();
  if (page === 'viewer' || (page === 'landing' && heroVisible)) {
    updateAudio();
    manager.update(time, delta);
    recorder.captureFrame(); // straight after the draw: the canvas is only readable now
    syncMath();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// --- Resize ---
window.addEventListener('resize', () => {
  if (recorder.sizeLocked) return; // a fixed export size is in force until the recording ends
  size.width = window.innerWidth;
  size.height = window.innerHeight;
  renderer.setSize(size.width, size.height);
  manager.resize(size);
});
