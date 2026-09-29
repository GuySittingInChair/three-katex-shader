import * as THREE from 'three';
import { phaseOf, smooth, lerp } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// The dragon curve as folded paper. Fold a strip in half n times, then open
// every crease to the same angle φ. Walking along the strip, segment k turns
// by ±φ at each crease:
//
//     z_{k+1} = z_k + e^{iθ_k},   θ_k = θ_{k−1} + φ ε_k
//
// where ε_k = ±1 is the regular paper-folding sequence: write k = 2^a·m with m
// odd; ε_k = +1 if m ≡ 1 (mod 4), −1 if m ≡ 3. At φ = 180° every crease is
// shut and the strip lies folded flat; at φ = 90° it is Heighway's dragon
// curve (checked: 4096 unit segments on 4096 distinct lattice edges, so it
// never retraces itself); smaller φ opens it into curling spirals.
//
// Loop (24 s): unfold 180° → 90° · hold the dragon · keep opening to 36° ·
//   fold all the way back to 180°. The view refits the whole strip each frame.

const PERIOD = 24;
const DEG = Math.PI / 180;

function foldSigns(count) {
  const eps = new Int8Array(count);
  for (let k = 1; k < count; k++) {
    let m = k;
    while (m % 2 === 0) m /= 2;
    eps[k] = m % 4 === 1 ? 1 : -1;
  }
  return eps;
}

function phiAt(p) {
  if (p < 0.3) return lerp(180, 90, smooth(p / 0.3));
  if (p < 0.45) return 90;
  if (p < 0.65) return lerp(90, 36, smooth((p - 0.45) / 0.2));
  return lerp(36, 180, smooth((p - 0.65) / 0.35));
}

export default {
  name: 'Dragon Curve Unfolding',
  description:
    'A strip of paper folded in half 12 times, with every crease opening to the same angle φ. At 180° it lies ' +
    'folded flat, at 90° it is the dragon curve, and below that it opens into curling spirals. The equation shows ' +
    'φ live.',
  tags: ['fractal', 'paper folding', 'curve'],
  category: 'Fractals',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    return { phi: phiAt(phaseOf(t, PERIOD)) };
  },

  latex: (params, hl, m) => {
    const label = Math.abs(m.phi - 90) < 0.5 ? '\\text{the dragon curve}' : m.phi > 179.5 ? '\\text{folded flat}' : '';
    return (
      '\\begin{aligned}' +
      'z_{k+1} &= z_k + e^{i\\theta_k},\\quad \\theta_k = \\theta_{k-1} + \\varphi\\,\\varepsilon_k \\\\' +
      '\\varepsilon_k &= \\pm 1\\ \\text{(paper-folding sequence)},\\quad k < 2^{' +
      Math.round(params.folds) +
      '} \\\\' +
      `\\varphi &= ${hl(m.phi, 1)}^\\circ\\quad ${label}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    folds: { value: 12, min: 6, max: 14, step: 1, rebuild: true },
    width: { value: 1.6, min: 0.5, max: 4 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8);
    const count = 2 ** Math.round(ctx.params.folds);
    const lines = createFatLines({ maxSegments: count, width: ctx.params.width });
    ctx.scene.add(lines.object);
    const colors = Array.from({ length: count }, (_, k) =>
      new THREE.Color().setHSL(0.58 + 0.34 * (k / count), 0.6, 0.58)
    );
    return {
      lines,
      count,
      eps: foldSigns(count),
      colors,
      xs: new Float64Array(count + 1),
      ys: new Float64Array(count + 1),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
    };
  },

  update(ctx, state) {
    const { lines, count, eps, colors, xs, ys, a, b } = state;
    const phi = ctx.motion.phi * DEG;

    let x = 0;
    let y = 0;
    let theta = 0;
    xs[0] = 0;
    ys[0] = 0;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (let k = 0; k < count; k++) {
      if (k > 0) theta += phi * eps[k];
      x += Math.cos(theta);
      y += Math.sin(theta);
      xs[k + 1] = x;
      ys[k + 1] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Fit the whole strip in view.
    const span = Math.max(maxX - minX, (maxY - minY) * 1.2, 1);
    const scale = 8.5 / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    lines.setWidth(ctx.params.width);
    lines.reset();
    for (let k = 0; k < count; k++) {
      a.set((xs[k] - cx) * scale, (ys[k] - cy) * scale, 0);
      b.set((xs[k + 1] - cx) * scale, (ys[k + 1] - cy) * scale, 0);
      lines.push(a, b, colors[k]);
    }
    lines.commit();
  },

  dispose(ctx, state) {
    state.lines.dispose();
  },
};
