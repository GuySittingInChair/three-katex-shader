import { MODES, ROOTS, PRESETS } from '../core/abyss.js';

// Right-docked panel for the Abyss instrument (core/abyss.js). Every slider
// writes straight to the instrument, which applies it on its next 100 ms tick,
// so dragging is click-free at any time.

const SLIDERS = [
  ['depth', 'Depth', 'Darker and deeper: lower filters, more sub.'],
  ['bloom', 'Bloom', 'How open the whole sound is. Or use “Let it bloom” for one slow swell.'],
  ['space', 'Space', 'Reverb amount.'],
  ['life', 'Life', 'How often the bells sing.'],
  ['drift', 'Drift', 'How much the tones wander and detune.'],
  ['pressure', 'Pressure', 'The water-noise bed.'],
  ['level', 'Level', 'Master volume.'],
];

export function createSoundPanel(container, { abyss, toast }) {
  container.innerHTML = `
    <div class="params-panel-header"><div class="params-panel-title">Sound · Abyss</div></div>
    <div class="media-hint">A deep-water instrument that plays itself while you steer it. It goes to your speakers, drives the audio-reactive sketches, and is included in recordings.</div>

    <div class="media-row">
      <button type="button" class="media-btn" data-role="start">▶ Start</button>
      <button type="button" class="media-btn" data-role="bloom" disabled>🌸 Let it bloom</button>
      <button type="button" class="media-btn" data-role="ping" disabled>Ping</button>
    </div>

    <label class="media-field"><span>Preset</span><select data-role="preset"><option value="">—</option></select></label>

    <div class="media-section" data-role="sliders"></div>

    <label class="media-field"><span>Root</span><select data-role="root"></select></label>
    <label class="media-field"><span>Mode</span><select data-role="mode"></select></label>

    <div class="media-hint"><b>Keys</b> (while it is running): <b>1–8</b> play bell notes of the scale · hold <b>Shift + 1–8</b> for a pad note that swells while held · <b>B</b> let it bloom.<br>Aeolian is the darkest; Phrygian is the most uneasy; Lydian is the brightest.</div>
  `;
  container.classList.add('media-panel');
  const $ = (r) => container.querySelector(`[data-role="${r}"]`);
  const startBtn = $('start');
  const bloomBtn = $('bloom');
  const pingBtn = $('ping');
  const rows = new Map();

  const holder = $('sliders');
  for (const [key, label, hint] of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'params-panel-row';
    row.title = hint;
    row.innerHTML = `<div class="params-panel-label-row"><label class="params-panel-label">${label}</label><span class="params-panel-readout"></span></div><input type="range" min="0" max="1" step="0.01" />`;
    const input = row.querySelector('input');
    const readout = row.querySelector('.params-panel-readout');
    input.addEventListener('input', () => abyss.set(key, Number(input.value)));
    holder.appendChild(row);
    rows.set(key, { input, readout });
  }
  // Swell length, in seconds.
  {
    const row = document.createElement('div');
    row.className = 'params-panel-row';
    row.title = 'How long one “Let it bloom” gesture lasts.';
    row.innerHTML = `<div class="params-panel-label-row"><label class="params-panel-label">Swell time</label><span class="params-panel-readout"></span></div><input type="range" min="6" max="45" step="1" />`;
    const input = row.querySelector('input');
    const readout = row.querySelector('.params-panel-readout');
    input.addEventListener('input', () => abyss.set('swell', Number(input.value)));
    holder.appendChild(row);
    rows.set('swell', { input, readout, unit: ' s' });
  }

  Object.keys(PRESETS).forEach((name) => $('preset').add(new Option(name, name)));
  $('preset').addEventListener('change', (e) => { if (e.target.value) abyss.applyPreset(e.target.value); });
  ROOTS.forEach((r, i) => $('root').add(new Option(r, String(i))));
  Object.keys(MODES).forEach((m) => $('mode').add(new Option(m, m)));
  $('root').addEventListener('change', (e) => abyss.set('root', Number(e.target.value)));
  $('mode').addEventListener('change', (e) => abyss.set('mode', e.target.value));

  startBtn.addEventListener('click', async () => {
    if (abyss.running) { abyss.stop(); return; }
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    try {
      await abyss.start();
    } catch (err) {
      toast(`Could not start sound: ${err.message}`);
    } finally {
      startBtn.disabled = false;
      render();
    }
  });
  bloomBtn.addEventListener('click', () => abyss.bloomNow());
  pingBtn.addEventListener('click', () => abyss.ping());

  function render() {
    const p = abyss.params;
    for (const [key, { input, readout, unit }] of rows) {
      if (document.activeElement !== input) input.value = String(p[key]);
      readout.textContent = unit ? `${Math.round(p[key])}${unit}` : `${Math.round(p[key] * 100)}%`;
    }
    $('root').value = String(p.root);
    $('mode').value = p.mode;
    startBtn.textContent = abyss.running ? '■ Stop' : '▶ Start';
    bloomBtn.disabled = pingBtn.disabled = !abyss.running;
  }
  abyss.subscribe(render);
  render();
}
