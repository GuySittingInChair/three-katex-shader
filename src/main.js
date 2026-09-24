import * as THREE from 'three';
import katex from 'katex';
import { resolveLatex } from './core/latex.js';
import 'katex/dist/katex.min.css';
import { SketchManager } from './core/SketchManager.js';
import { sketches } from './core/registry.js';
import { createCodePanel } from './ui/codePanel.js';
import { createCommentPanel } from './ui/commentPanel.js';
import { createAiPanel } from './ui/aiPanel.js';
import { createParamsPanel } from './ui/paramsPanel.js';
import { createMediaPanel } from './ui/mediaPanel.js';
import { createSoundPanel } from './ui/soundPanel.js';
import { createExplainPanel } from './ui/explainPanel.js';
import { createReviewPanel } from './ui/reviewPanel.js';
import { createAccountButton } from './ui/accountButton.js';
import { createSketchGrid } from './ui/sketchGrid.js';
import { icon } from './ui/icons.js';
import { createCommunitySketches } from './core/communitySketches.js';
import { signIn } from './core/community.js';
import { createAbyss } from './core/abyss.js';
import { createToast, createViewMode } from './ui/viewMode.js';
import { createRecorder } from './core/recorder.js';
import { enableAudio, updateAudio } from './core/audioEngine.js';
import { createVoiceControl, parseVoiceCommand, isVoiceSupported } from './core/voiceControl.js';

const FEATURED = 'hopfFibration';
const $ = (id) => document.getElementById(id);
const mobile = window.matchMedia('(max-width: 720px)');

// --- Routing: "/" is the landing page, "/s/<id>" a sketch ---
function parseRoute() {
  const m = /^\/s\/([^/]+)\/?$/.exec(location.pathname);
  return m ? { page: 'viewer', id: decodeURIComponent(m[1]) } : { page: 'landing' };
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

const toast = createToast();
const viewMode = createViewMode({ toast });
const recorder = createRecorder({ renderer, manager, size, getName: () => manager.getCurrent().id });

// --- Equation ---
// Re-resolved against live values every frame, but KaTeX only re-renders when
// the string changes, at most ~15 times a second. It draws into the viewer's
// overlay, or into the landing page's hero while that is showing.
const mathOverlay = $('math-overlay');
const heroEquation = $('hero-equation');
let mathTarget = mathOverlay;
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
  if (tex) katex.render(tex, mathTarget, { throwOnError: false, displayMode: false });
  else mathTarget.innerHTML = '';
}
function setMathTarget(el) {
  if (el === mathTarget) return;
  mathTarget.innerHTML = '';
  mathTarget = el;
  lastLatex = null;
  syncMath(true);
}

// --- Top bar: current sketch ---
const titleName = document.querySelector('.sketch-title-name');
const titleMeta = document.querySelector('.sketch-title-meta');
function renderTitle(sketch) {
  titleName.textContent = sketch.name;
  titleMeta.textContent = sketch.community
    ? `by @${sketch.community.author}${sketch.community.status === 'pending' ? ' · waiting for review' : ''}`
    : sketch.category || '';
  document.title = page === 'viewer' ? `${sketch.name} · aiship` : 'aiship · learn math visually';
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
    updateSketchCount();
    renderTitle(manager.getCurrent());
    if (pendingId && indexOf(pendingId) !== -1) {
      manager.goToId(pendingId);
      pendingId = null;
    }
  },
});
createAccountButton($('account-toggle'), { toast });
document.querySelector('[data-role="landing-signin"]').addEventListener('click', () => signIn());

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

// --- AI ---
createAiPanel($('ai-panel'), manager, {
  onInsertCode(code) {
    codePanelApi.setEditorContent(code);
    openPanel('code');
  },
});
registerPanel('ai', $('ai-panel'), { button: $('ai-toggle') });

// --- Sound (the Abyss instrument) ---
const abyss = createAbyss();
createSoundPanel($('sound-panel'), { abyss, toast });
registerPanel('sound', $('sound-panel'), { button: $('sound-toggle') });

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

$('view-toggle').addEventListener('click', () => viewMode.cycle());
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

// Drop an audio file anywhere on the window to load it as the music track.
window.addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('audio/'));
  if (!file) return;
  e.preventDefault();
  mediaApi.loadFile(file);
});

// --- Voice commands ---
// Drives the same manager.setParam/resetParams/bumpAllParams the sliders use.
const voiceToggle = $('voice-toggle');
let voiceActive = false;
const voice = createVoiceControl({
  onResult(transcript) {
    const action = parseVoiceCommand(
      transcript,
      manager.getParamsSchema(),
      manager.getParamValues(),
      manager.getActions()
    );
    if (!action) return;
    if (action.type === 'set') manager.setParam(action.key, action.value);
    else if (action.type === 'reset') manager.resetParams();
    else if (action.type === 'bulk') manager.bumpAllParams(action.direction);
    else if (action.type === 'action') manager.runAction(action.key);
    paramsPanelApi.refresh();
    paramsPanelApi.setVoiceStatus(
      action.type === 'unrecognized' ? `Heard "${transcript}", no match` : `✓ "${transcript}"`
    );
  },
  onInterim(transcript) {
    paramsPanelApi.setVoiceStatus(`Hearing: "${transcript}"`);
  },
  onStateChange(state, detail) {
    if (state === 'error') paramsPanelApi.setVoiceStatus(`Microphone error: ${detail}`);
    else if (state === 'listening') paramsPanelApi.setVoiceStatus('Listening…');
  },
});
if (!isVoiceSupported() || !voice) {
  voiceToggle.disabled = true;
  voiceToggle.title = 'Voice commands need a Chromium-based browser';
} else {
  voiceToggle.addEventListener('click', () => {
    voiceActive = !voiceActive;
    if (voiceActive) {
      voice.start();
      voiceToggle.textContent = 'Voice commands: listening';
      openPanel('params'); // show the sliders so commands visibly do something
      paramsPanelApi.setVoiceStatus('Listening. Try "more gravity" or "chaos"');
    } else {
      voice.stop();
      voiceToggle.textContent = 'Voice commands';
    }
  });
}

// --- Pages ---
const landing = $('landing');
let page = 'viewer';
let heroVisible = true;

function showPage(next) {
  page = next;
  document.body.dataset.page = next;
  landing.hidden = next !== 'landing';
  if (next === 'landing') {
    closeAllPanels();
    closeMenu();
    landing.scrollTop = 0;
    setMathTarget(heroEquation);
  } else {
    setMathTarget(mathOverlay);
  }
  renderTitle(manager.getCurrent());
}

function applyRoute() {
  const route = parseRoute();
  if (route.page === 'viewer') {
    if (manager.getCurrent().id !== route.id && !manager.goToId(route.id)) pendingId = route.id;
    showPage('viewer');
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
  lastLatex = null;
  syncMath(true);
  if (page === 'viewer' && parseRoute().id !== sketch.id) {
    history.replaceState(null, '', `/s/${encodeURIComponent(sketch.id)}`);
  }
});

function updateSketchCount() {
  document.querySelector('[data-role="sketch-count"]').textContent = String(sketches.length);
}
updateSketchCount();

// Stop drawing the background once the hero has scrolled out of view.
new IntersectionObserver(([entry]) => (heroVisible = entry.isIntersecting), { root: landing }).observe(
  document.querySelector('.hero')
);

showPage(initialRoute.page);

// --- Keyboard (viewer only) ---
window.addEventListener('keyup', (e) => {
  if (/^Digit[1-8]$/.test(e.code)) abyss.noteOff(e.code); // release a held pad note
});

function isTypingTarget(el) {
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable;
}
window.addEventListener('keydown', (e) => {
  if (page !== 'viewer' || isTypingTarget(e.target)) return;
  if (e.key === 'ArrowRight' || e.key === 'n') manager.next();
  if (e.key === 'ArrowLeft' || e.key === 'p') manager.prev();

  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  const key = e.key.toLowerCase();
  const digit = /^Digit([1-8])$/.exec(e.code);
  if (digit) {
    if (!e.repeat) abyss.noteOn(Number(digit[1]) - 1, e.shiftKey, e.code);
    return;
  }
  if (key === 'b') abyss.bloomNow();
  else if (key === 'h') viewMode.cycle();
  else if (key === 'escape') {
    if (!moreMenu.classList.contains('hidden')) closeMenu();
    else if (document.body.classList.contains('sheet-open')) closeAllPanels();
    else viewMode.showAll();
  } else if (key === 'f') viewMode.toggleFullscreen();
  else if (key === 'r') mediaApi.toggleRecord();
  else if (key === 'e') togglePanel('explain');
  else if (e.key === ' ' && e.target?.tagName !== 'BUTTON') {
    e.preventDefault();
    mediaApi.togglePlay();
  }
});

// --- Loop ---
const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();
  if (page === 'viewer' || heroVisible) {
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
