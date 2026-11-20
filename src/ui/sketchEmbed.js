import * as THREE from 'three';
import { SketchRunner } from '../core/SketchRunner.js';
import { Compositor } from '../core/Compositor.js';
import { sketches } from '../core/registry.js';

// A live, animated sketch inside a wiki page. In the page's Markdown:
//
//   <div class="wiki-embed" data-sketch="gradientPlane" data-caption="Gradient Plane, running"></div>
//
// It gets its own small canvas and runs the sketch with the same SketchRunner
// the main viewer uses. It only animates while on screen, and is cleaned up
// when the page changes. Pick sketches that keep their state inside setup
// (a few, like diffusionLimitedAggregation, keep it at file level and would
// share it with the main viewer).

const live = new Set();

export function mountEmbeds(root) {
  disposeEmbeds();
  for (const el of root.querySelectorAll('.wiki-embed[data-sketch]')) {
    const sketch = sketches.find((s) => s.id === el.dataset.sketch);
    if (!sketch) {
      el.textContent = `(No sketch called ${el.dataset.sketch}.)`;
      continue;
    }
    el.innerHTML = `<div class="wiki-embed-frame"><canvas></canvas></div>
      <div class="wiki-embed-caption"><span></span> <a data-link href="/s/${encodeURIComponent(sketch.id)}">Open it full screen →</a></div>`;
    el.querySelector('.wiki-embed-caption span').textContent = el.dataset.caption || sketch.name;
    live.add(embed(el.querySelector('canvas'), sketch));
  }
}

export function disposeEmbeds() {
  for (const e of live) e.dispose();
  live.clear();
}

function embed(canvas, sketch) {
  let renderer = null;
  let runner = null;
  let compositor = null;
  let raf = 0;
  let last = 0;
  let time = 0;
  let visible = false;
  const size = () => {
    const w = Math.max(1, canvas.clientWidth);
    return { width: w, height: Math.round(w * 0.5625) };
  };
  function start() {
    if (renderer) return;
    const s = size();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(s.width, s.height, false);
    compositor = new Compositor(renderer);
    runner = new SketchRunner(sketch, renderer, s, canvas);
    runner.build?.();
  }
  function frame(now) {
    raf = 0;
    if (!visible || !runner) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    runner.update(time, dt);
    runner.render();
    compositor.render(runner.target.texture, null, 0);
    raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      start();
      last = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }
  });
  io.observe(canvas);
  return {
    dispose() {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      runner?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss?.();
      runner = renderer = null;
    },
  };
}
