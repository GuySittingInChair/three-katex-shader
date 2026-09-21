import * as THREE from 'three';
import katex from 'katex';
import { resolveLatex } from './core/latex.js';
import 'katex/dist/katex.min.css';
import { SketchManager } from './core/SketchManager.js';
import { createCodePanel } from './ui/codePanel.js';
import { createCommentPanel } from './ui/commentPanel.js';
import { createAiPanel } from './ui/aiPanel.js';
import { createParamsPanel } from './ui/paramsPanel.js';
import { createMediaPanel } from './ui/mediaPanel.js';
import { createSoundPanel } from './ui/soundPanel.js';
import { createAbyss } from './core/abyss.js';
import { createToast, createViewMode } from './ui/viewMode.js';
import { createRecorder } from './core/recorder.js';
import { enableAudio, updateAudio } from './core/audioEngine.js';
import { createVoiceControl, parseVoiceCommand, isVoiceSupported } from './core/voiceControl.js';

const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = true;
container.appendChild(renderer.domElement);

const size = { width: window.innerWidth, height: window.innerHeight };
const manager = new SketchManager(renderer, size, renderer.domElement);

// --- View modes, recording ---
const toast = createToast();
const viewMode = createViewMode({ toast });
const recorder = createRecorder({ renderer, manager, size, getName: () => manager.getCurrent().id });

// --- Overlays ---
const label = document.getElementById('sketch-label');
const mathOverlay = document.getElementById('math-overlay');

// The equation is re-resolved against the live param values every frame, but
// KaTeX only re-renders when the resulting string actually changes — slider
// drags, voice commands and rebuilds all flow through the same path.
// An animated equation changes every frame, so re-renders are also capped
// (~15/s): a pending change simply lands on the next frame past the cap.
let lastLatex = null;
let lastMathRender = 0;
const MATH_MIN_INTERVAL_MS = 66;
function syncMath(force = false) {
  const tex = resolveLatex(manager.getCurrent(), manager.getParamValues(), manager.getMotion());
  if (tex === lastLatex) return;
  const now = performance.now();
  if (!force && now - lastMathRender < MATH_MIN_INTERVAL_MS) return;
  lastMathRender = now;
  lastLatex = tex;
  if (tex) katex.render(tex, mathOverlay, { throwOnError: false });
  else mathOverlay.innerHTML = '';
}

function renderOverlays(sketch) {
  label.textContent = `${sketch.name}  ·  ← / → to switch`;
  lastLatex = null;
  syncMath(true);
}
renderOverlays(manager.getCurrent());
manager.onChange(renderOverlays);

// --- Code panel ---
const codeToggle = document.getElementById('code-toggle');
const codePanel = document.getElementById('code-panel');
const codePanelApi = createCodePanel(codePanel, manager);
codeToggle.addEventListener('click', () => {
  codePanel.classList.toggle('hidden');
});

// --- Audio ---
const audioToggle = document.getElementById('audio-toggle');
audioToggle.addEventListener('click', async () => {
  audioToggle.disabled = true;
  audioToggle.textContent = 'Enabling…';
  try {
    await enableAudio();
    audioToggle.textContent = '🎤 Audio On';
  } catch {
    audioToggle.textContent = '🎤 Mic denied (Tone still on)';
  } finally {
    audioToggle.disabled = false;
  }
});

// --- Comments ---
const commentsToggle = document.getElementById('comments-toggle');
const commentsPanel = document.getElementById('comments-panel');
const commentPanelApi = createCommentPanel(commentsPanel, manager);
commentsToggle.addEventListener('click', () => {
  hideRightPanels(commentsPanel); // right-docked panels, keep only one open
  const isHidden = commentsPanel.classList.toggle('hidden');
  if (isHidden) commentPanelApi.hide();
  else commentPanelApi.show();
});

// --- Local AI ---
const aiToggle = document.getElementById('ai-toggle');
const aiPanel = document.getElementById('ai-panel');
createAiPanel(aiPanel, manager, {
  onInsertCode(code) {
    codePanelApi.setEditorContent(code);
    codePanel.classList.remove('hidden');
  },
});
aiToggle.addEventListener('click', () => {
  hideRightPanels(aiPanel); // right-docked panels, keep only one open
  aiPanel.classList.toggle('hidden');
});

// --- Params (auto-generated sliders, one per sketch param) ---
const paramsToggle = document.getElementById('params-toggle');
const paramsPanel = document.getElementById('params-panel');
const paramsPanelApi = createParamsPanel(paramsPanel, manager);
paramsToggle.addEventListener('click', () => {
  hideRightPanels(paramsPanel); // right-docked panels, keep only one open
  paramsPanel.classList.toggle('hidden');
});

// --- Sound (the Abyss instrument) ---
const abyss = createAbyss();
const soundToggle = document.getElementById('sound-toggle');
const soundPanel = document.getElementById('sound-panel');
createSoundPanel(soundPanel, { abyss, toast });
soundToggle.addEventListener('click', () => {
  hideRightPanels(soundPanel);
  soundPanel.classList.toggle('hidden');
});

// --- Media (music track + video recording) ---
const mediaToggle = document.getElementById('media-toggle');
const mediaPanel = document.getElementById('media-panel');
const mediaApi = createMediaPanel(mediaPanel, { recorder, toast });
mediaToggle.addEventListener('click', () => {
  hideRightPanels(mediaPanel);
  mediaPanel.classList.toggle('hidden');
});
document.getElementById('view-toggle').addEventListener('click', () => viewMode.cycle());

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

// Hides the other right-docked panels, leaving `except` alone — shared
// by Comments/AI/Params/Media so only one is ever open at a time.
function hideRightPanels(except) {
  for (const panel of [commentsPanel, aiPanel, paramsPanel, mediaPanel, soundPanel]) {
    if (panel === except) continue;
    panel.classList.add('hidden');
    if (panel === commentsPanel) commentPanelApi.hide();
  }
}

// --- Voice commands ---
// Drives the same manager.setParam/resetParams/bumpAllParams the sliders
// above use, so a spoken command and a dragged slider are indistinguishable
// to the rest of the app — see core/voiceControl.js for the phrase grammar.
const voiceToggle = document.getElementById('voice-toggle');
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
      action.type === 'unrecognized' ? `🗣️ heard "${transcript}" — no match` : `🗣️ ✓ "${transcript}"`
    );
  },
  onInterim(transcript) {
    // Live partial text — proof the mic is actually being heard at all,
    // independent of whether it ever resolves into a matched command.
    paramsPanelApi.setVoiceStatus(`🗣️ hearing: "${transcript}"`);
  },
  onStateChange(state, detail) {
    if (state === 'error') paramsPanelApi.setVoiceStatus(`🗣️ mic error: ${detail}`);
    else if (state === 'listening') paramsPanelApi.setVoiceStatus('🗣️ listening…');
  },
});

if (!isVoiceSupported() || !voice) {
  voiceToggle.disabled = true;
  voiceToggle.title = 'Voice commands need a Chromium-based browser (Web Speech API not available here)';
} else {
  voiceToggle.addEventListener('click', () => {
    voiceActive = !voiceActive;
    if (voiceActive) {
      voice.start();
      voiceToggle.textContent = '🗣️ Listening…';
      voiceToggle.classList.add('active');
      hideRightPanels(paramsPanel);
      paramsPanel.classList.remove('hidden'); // show sliders so commands are visibly doing something
      paramsPanelApi.refresh();
      paramsPanelApi.setVoiceStatus('🗣️ listening — try "more gravity" or "chaos"');
    } else {
      voice.stop();
      voiceToggle.textContent = '🗣️ Voice';
      voiceToggle.classList.remove('active');
    }
  });
}

// --- Controls ---
window.addEventListener('keyup', (e) => {
  if (/^Digit[1-8]$/.test(e.code)) abyss.noteOff(e.code); // release a held pad note
});

function isTypingTarget(el) {
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable;
}
window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) return;
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
  else if (key === 'escape') viewMode.showAll();
  else if (key === 'f') viewMode.toggleFullscreen();
  else if (key === 'r') mediaApi.toggleRecord();
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
  updateAudio();
  manager.update(time, delta);
  recorder.captureFrame(); // straight after the draw: the canvas is only readable now
  syncMath();
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
