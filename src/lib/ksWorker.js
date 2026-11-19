import { createKS } from './ksSpectral.js';

// Runs the Kuramoto–Sivashinsky solver off the main thread, so a slow step
// (about 10 ms on a 128 × 128 grid) never stutters the animation. It keeps
// to `speed` units of simulated time per real second when it can, and sends
// the field back up to about 30 times a second.
// see docs/wiki/sketches/kuramotoSivashinsky.md

let ks = null;
let params = { dt: 0.1, spacing: 0.9, speed: 6, drive: 0 };
let force = null;
let owed = 0;
let last = 0;

function tick() {
  const now = performance.now();
  owed += ((now - last) / 1000) * (params.speed / params.dt);
  last = now;
  owed = Math.min(owed, 6); // fall behind gracefully rather than pile up work
  let n = 0;
  while (owed >= 1 && n < 6) {
    ks.step(params.dt, params.spacing, force, params.drive);
    owed -= 1;
    n++;
  }
  if (n) {
    const field = Float32Array.from(ks.field());
    postMessage(field, [field.buffer]);
  }
  setTimeout(tick, 33);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    ks = createKS(m.size);
    ks.seed();
    Object.assign(params, m.params);
    last = performance.now();
    tick();
  } else if (m.type === 'params') {
    Object.assign(params, m.params);
  } else if (m.type === 'force') {
    force = m.force;
  }
};
