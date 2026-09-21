import { sketches, removeSketch as removeSketchFromRegistry } from './registry.js';
import { SketchRunner } from './SketchRunner.js';
import { Compositor } from './Compositor.js';

const TRANSITION_DURATION = 0.6;
const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export class SketchManager {
  constructor(renderer, size, domElement) {
    this.renderer = renderer;
    this.size = size;
    this.domElement = domElement;
    this.compositor = new Compositor(renderer);

    // Live param values, keyed by sketch id, independent of each sketch's
    // definition — so a slider drag or voice command never has to mutate
    // the shared registry object, and survives switching away and back.
    this.liveParams = new Map();

    this.currentIndex = 0;
    this.current = this._makeRunner(sketches[0]);
    this.current.build();

    this.incoming = null;
    this.transitionElapsed = 0;
    this.listeners = [];
  }

  _defaultParams(sketch) {
    const out = {};
    for (const [key, def] of Object.entries(sketch.params || {})) out[key] = def.value;
    return out;
  }

  // Returns the live values object for a sketch, creating it from the
  // schema defaults on first use. Reconciled against the schema every call
  // so a live-edited sketch (new/renamed/removed params from the code
  // panel) never leaves a stale or missing entry behind.
  _liveParamsFor(sketch) {
    const schema = sketch.params || {};
    let live = this.liveParams.get(sketch.id);
    if (!live) {
      live = this._defaultParams(sketch);
      this.liveParams.set(sketch.id, live);
    } else {
      for (const key of Object.keys(schema)) {
        if (!(key in live)) live[key] = schema[key].value;
      }
      for (const key of Object.keys(live)) {
        if (!(key in schema)) delete live[key];
      }
    }
    return live;
  }

  _makeRunner(sketch) {
    return new SketchRunner(sketch, this.renderer, this.size, this.domElement, this._liveParamsFor(sketch));
  }

  // --- Live param control (code-panel sliders, voice commands, …) ---

  getParamsSchema() {
    return sketches[this.currentIndex].params || {};
  }

  getParamValues() {
    return this.current.ctx.params;
  }

  // Current output of the sketch's `motion(t)` equation (null if it has none).
  getMotion() {
    return this.current.ctx.motion;
  }

  // Sketch-declared one-off commands beyond numeric params — e.g. N-Body
  // Gravity's "transform 10% of the particles". { key: { label, run(ctx, state) } }.
  getActions() {
    return sketches[this.currentIndex].actions || {};
  }

  runAction(key) {
    const action = this.getActions()[key];
    action?.run?.(this.current.ctx, this.current.state);
  }

  // A `rebuild: true` param (changes geometry/topology, not just a uniform)
  // needs a fresh setup() — everything else just mutates ctx.params in
  // place, which SketchRunner already reads live every frame.
  setParam(key, value) {
    const sketch = sketches[this.currentIndex];
    const def = sketch.params?.[key];
    if (!def) return;
    const clamped = Math.min(def.max, Math.max(def.min, value));
    this._liveParamsFor(sketch)[key] = clamped; // same object as this.current.ctx.params
    if (def.rebuild) this.reload();
  }

  resetParams() {
    const sketch = sketches[this.currentIndex];
    this.liveParams.set(sketch.id, this._defaultParams(sketch));
    this.reload();
  }

  // Nudges every param a fixed fraction of its range toward max (+1) or
  // min (-1) — the "chaos" / "calm down" voice commands and a quick way to
  // explore a sketch's whole envelope at once.
  bumpAllParams(direction) {
    const sketch = sketches[this.currentIndex];
    const schema = sketch.params || {};
    const live = this._liveParamsFor(sketch);
    let needsReload = false;
    for (const [key, def] of Object.entries(schema)) {
      const span = def.max - def.min;
      live[key] = Math.min(def.max, Math.max(def.min, live[key] + direction * span * 0.35));
      if (def.rebuild) needsReload = true;
    }
    if (needsReload) this.reload();
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit() { this.listeners.forEach((fn) => fn(this.getCurrent())); }

  getCurrent() { return sketches[this.currentIndex]; }
  getAll() { return sketches; }

  goTo(index) {
    if (this.incoming || index === this.currentIndex) return;
    if (index < 0 || index >= sketches.length) return;
    this.incoming = { runner: this._makeRunner(sketches[index]), index };
    this.incoming.runner.build();
    this.transitionElapsed = 0;
  }

  next() { this.goTo((this.currentIndex + 1) % sketches.length); }
  prev() { this.goTo((this.currentIndex - 1 + sketches.length) % sketches.length); }

  // Rebuilds the active sketch from its (possibly just-edited) definition
  // without changing currentIndex, so live code edits render immediately.
  reload() {
    if (this.incoming) return;
    const def = sketches[this.currentIndex];
    this.current.dispose();
    this.current = this._makeRunner(def);
    this.current.build();
    this._emit();
  }

  // Removes a sketch by id. Refuses to remove the last remaining one.
  // If the removed sketch is currently on screen (or mid-transition-in),
  // cuts straight to a neighboring sketch instead of crossfading.
  removeSketch(id) {
    if (sketches.length <= 1) return false;
    const idx = sketches.findIndex((s) => s.id === id);
    if (idx === -1) return false;

    if (this.incoming) {
      this.incoming.runner.dispose();
      this.incoming = null;
      this.transitionElapsed = 0;
    }

    const wasCurrent = idx === this.currentIndex;
    if (wasCurrent) this.current.dispose();

    removeSketchFromRegistry(id);

    if (wasCurrent) {
      this.currentIndex = Math.min(idx, sketches.length - 1);
      this.current = this._makeRunner(sketches[this.currentIndex]);
      this.current.build();
    } else if (idx < this.currentIndex) {
      this.currentIndex -= 1;
    }

    this._emit();
    return true;
  }

  update(time, delta) {
    this.current.update(time, delta);
    this.current.render();

    if (this.incoming) {
      this.incoming.runner.update(time, delta);
      this.incoming.runner.render();

      this.transitionElapsed += delta;
      const t = Math.min(this.transitionElapsed / TRANSITION_DURATION, 1);
      this.compositor.render(
        this.current.target.texture,
        this.incoming.runner.target.texture,
        easeInOutCubic(t)
      );

      if (t >= 1) {
        this.current.dispose();
        this.current = this.incoming.runner;
        this.currentIndex = this.incoming.index;
        this.incoming = null;
        this._emit();
      }
    } else {
      this.compositor.render(this.current.target.texture, null, 0);
    }
  }

  resize(size) {
    this.size = size;
    this.current.resize(size);
    this.incoming?.runner.resize(size);
  }
}
