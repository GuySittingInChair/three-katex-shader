// Auto-generates a slider per entry in the current sketch's `params` schema
// — nothing sketch-specific here, every sketch that declares params gets
// this for free. Sliders write straight through SketchManager.setParam, and
// `refresh()` lets an external change (a voice command, "Reset") sync the
// displayed positions without tearing down the DOM mid-drag.

function humanize(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value, def) {
  // A param with `options` is a discrete choice: show its label, not its index.
  if (def.options) return def.options[Math.round(value)] ?? String(Math.round(value));
  const isIntStep = Number.isInteger(def.step) && def.step >= 1;
  return isIntStep ? String(Math.round(value)) : Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function createParamsPanel(container, manager) {
  container.innerHTML = `
    <div class="params-panel-header">
      <div class="params-panel-title"></div>
      <button class="params-panel-reset" type="button" title="Reset every param on this sketch back to its default">Reset</button>
    </div>
    <div class="params-panel-actions"></div>
    <div class="params-panel-list"></div>
    <div class="params-panel-voice-status"></div>
    <div class="params-panel-hint">Say a param's name to nudge it up, "less &lt;param&gt;" to bring it down, "chaos" / "calm down", or "reset".</div>
  `;

  const titleEl = container.querySelector('.params-panel-title');
  const actionsEl = container.querySelector('.params-panel-actions');
  const listEl = container.querySelector('.params-panel-list');
  const resetBtn = container.querySelector('.params-panel-reset');
  const voiceStatusEl = container.querySelector('.params-panel-voice-status');

  const rows = new Map(); // key -> { input, readoutEl, def }

  function render() {
    const sketch = manager.getCurrent();
    const schema = manager.getParamsSchema();
    const values = manager.getParamValues();
    const actions = manager.getActions();
    titleEl.textContent = sketch.name;
    listEl.innerHTML = '';
    actionsEl.innerHTML = '';
    rows.clear();

    for (const [key, action] of Object.entries(actions)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'params-panel-action';
      btn.textContent = action.label || key;
      btn.addEventListener('click', () => manager.runAction(key));
      actionsEl.appendChild(btn);
    }

    const keys = Object.keys(schema);
    if (!keys.length) {
      listEl.innerHTML = '<div class="params-panel-empty">This sketch has no adjustable parameters.</div>';
      return;
    }

    for (const key of keys) {
      const def = schema[key];
      const row = document.createElement('div');
      row.className = 'params-panel-row';

      const labelRow = document.createElement('div');
      labelRow.className = 'params-panel-label-row';

      const label = document.createElement('label');
      label.className = 'params-panel-label';
      label.textContent = humanize(key);
      label.htmlFor = `param-${key}`;

      const readout = document.createElement('span');
      readout.className = 'params-panel-readout';
      readout.textContent = formatValue(values[key], def);

      labelRow.appendChild(label);
      labelRow.appendChild(readout);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `param-${key}`;
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step ?? ((def.max - def.min) / 200 || 0.01));
      input.value = String(values[key]);

      // Rebuild params (geometry/topology, not just a uniform) trigger a
      // real teardown+rebuild — only commit that on release, or every tick
      // of a drag would blow away the very slider being dragged.
      input.addEventListener('input', () => {
        readout.textContent = formatValue(Number(input.value), def);
        if (!def.rebuild) manager.setParam(key, Number(input.value));
      });
      if (def.rebuild) {
        input.addEventListener('change', () => manager.setParam(key, Number(input.value)));
      }

      row.appendChild(labelRow);
      row.appendChild(input);
      listEl.appendChild(row);
      rows.set(key, { input, readout, def });
    }
  }

  function refresh() {
    const values = manager.getParamValues();
    for (const [key, { input, readout, def }] of rows) {
      if (!(key in values)) continue;
      input.value = String(values[key]);
      readout.textContent = formatValue(values[key], def);
    }
  }

  resetBtn.addEventListener('click', () => manager.resetParams()); // onChange (below) re-renders

  manager.onChange(() => render());
  render();

  return {
    refresh,
    setVoiceStatus(text) {
      voiceStatusEl.textContent = text;
    },
  };
}
