import * as THREE from 'three';
import { phaseOf, segments, lerp } from '../lib/motion.js';
import { createFatLines } from '../lib/fatLines.js';

// Gram–Schmidt in a space of functions. On [0, 1] with
//
//     ⟨f, g⟩ = ∫₀¹ f(x) g(x) dx
//
// the powers 1, x, x², x³, x⁴ are a basis for polynomials of degree ≤ 4 but
// far from perpendicular: ⟨xⁱ, xʲ⟩ = 1/(i + j + 1), the Hilbert matrix
// (Hilbert's own example of a badly conditioned matrix). Gram–Schmidt
// straightens them one at a time: from each new power, subtract its
// projection onto every polynomial already made,
//
//     q_k = x^k − Σ_{j<k} ⟨x^k, q_j⟩ / ⟨q_j, q_j⟩ · q_j
//
// and q_k is perpendicular to all of them. Scaled so q_k(1) = 1 these are
// the shifted Legendre polynomials, P_k(2x − 1), with ⟨P_j, P_k⟩ = 0 for
// j ≠ k and 1/(2k + 1) for j = k (checked numerically).
//
// The grid below is the Gram matrix of the five current functions, each
// cell the cosine of the angle between two of them, ⟨f, g⟩ / (‖f‖‖g‖): it
// starts as the (normalized) Hilbert matrix, every cell bright, and ends
// diagonal. Loop (30 s): orthogonalize x, x², x³, x⁴; rescale; back to powers.

const PERIOD = 30;
const DEG = 4;
const SAMPLES = 120;
const XS = 6.4; // x ∈ [0, 1] → screen
const X0 = -3.2;
const YS = 1.45;
const Y0 = 0.8;
const CELL = 0.42;
const GRID_Y = -1.15; // the Gram matrix's top edge

// Polynomials as coefficient arrays [a₀, a₁, …]. On [0, 1], ∫ xⁿ = 1/(n + 1).
const ip = (p, q) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) s += (p[i] * q[j]) / (i + j + 1);
  return s;
};
const mono = (k) => Array.from({ length: k + 1 }, (_, i) => (i === k ? 1 : 0));
const at = (p, x) => p.reduceRight((acc, c) => acc * x + c, 0);
const mix = (p, q, t) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => lerp(p[i] ?? 0, q[i] ?? 0, t));

// The finished, monic orthogonal polynomials, and the projections each step subtracts.
const Q = [];
const STEPS = [];
for (let k = 0; k <= DEG; k++) {
  const proj = Q.map((q) => ip(mono(k), q) / ip(q, q));
  const r = mono(k);
  proj.forEach((c, j) => Q[j].forEach((a, i) => (r[i] -= c * a)));
  Q.push(r);
  STEPS.push(proj);
}
const LEGENDRE = Q.map((q) => q.map((a) => a / at(q, 1)));

// The five functions at stage `stage` (0–3: building q₁…q₄, 4: rescaling, 5: back to powers).
function current(stage, blend) {
  return Array.from({ length: DEG + 1 }, (_, i) => {
    if (stage === 5) return mix(LEGENDRE[i], mono(i), blend);
    if (stage === 4) return mix(Q[i], LEGENDRE[i], blend);
    const k = stage + 1;
    if (i < k) return Q[i];
    if (i > k) return mono(i);
    return mix(mono(k), Q[k], blend);
  });
}

export default {
  name: 'Gram–Schmidt → Legendre',
  description:
    'Gram–Schmidt in a space of functions: the powers x, x², x³, x⁴ are straightened one at a time, by ' +
    'subtracting their shadows on what came before, into the perpendicular Legendre polynomials. The grid is the ' +
    'angle between every pair (it starts as the Hilbert matrix) and ends diagonal. The inner products are live.',
  tags: ['hilbert space', 'gram-schmidt', 'legendre polynomials', 'orthogonality', 'functional analysis'],
  category: 'Functional Analysis',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const { index, blend } = segments(phaseOf(t, PERIOD), 6, 0.35);
    const fs = current(index, blend);
    const k = Math.min(index + 1, DEG);
    // How far the polynomial being built still leans on each earlier one.
    const leans = index < 4 ? Q.slice(0, k).map((q) => ip(fs[k], q)) : [];
    return { stage: index, blend, k, leans };
  },

  latex: (params, hl, m) => {
    let step;
    if (m.stage < 4) {
      const terms = m.leans.map((v, j) => `\\langle r, q_${j}\\rangle = ${hl(v, 3)}`).join(',\\ ');
      step =
        `q_${m.k} &= x^${m.k} - \\sum_{j<${m.k}} \\frac{\\langle x^${m.k}, q_j\\rangle}{\\langle q_j, q_j\\rangle}\\, q_j \\\\` +
        `&${terms}`;
    } else if (m.stage === 4) {
      step = 'P_k &= q_k / q_k(1):\\quad \\text{shifted Legendre } P_k(2x-1) \\\\ &\\langle P_j, P_k\\rangle = \\frac{\\delta_{jk}}{2k+1}';
    } else {
      step = '&\\text{back to } 1, x, x^2, x^3, x^4 \\\\ &\\langle x^i, x^j\\rangle = \\frac{1}{i+j+1}\\ \\text{(the Hilbert matrix)}';
    }
    return (
      '\\begin{aligned}' +
      '\\langle f, g\\rangle &= \\int_0^1 f(x)\\,g(x)\\,dx \\\\' +
      step +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 8.2);
    const lines = createFatLines({ maxSegments: (DEG + 1) * SAMPLES + 8, width: 2.2 });
    const cellGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92);
    const cellMat = new THREE.MeshBasicMaterial();
    const cells = new THREE.InstancedMesh(cellGeo, cellMat, (DEG + 1) ** 2);
    const place = new THREE.Matrix4();
    const left = -((DEG + 1) * CELL) / 2;
    for (let i = 0; i <= DEG; i++) {
      for (let j = 0; j <= DEG; j++) {
        cells.setMatrixAt(i * (DEG + 1) + j, place.makeTranslation(left + (j + 0.5) * CELL, GRID_Y - (i + 0.5) * CELL, 0));
        cells.setColorAt(i * (DEG + 1) + j, new THREE.Color());
      }
    }
    ctx.scene.add(lines.object, cells);
    return {
      lines,
      cells,
      cellGeo,
      cellMat,
      aspect: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Color(),
      axis: new THREE.Color(0x3a4254),
      palette: [0x8d96a8, 0x7cc4ff, 0xef6fa0, 0xffd166, 0x7ee0a8].map((h) => new THREE.Color(h)),
      pos: new THREE.Color(0xffd166),
      neg: new THREE.Color(0xef6fa0),
      zero: new THREE.Color(0x1a1f2b),
    };
  },

  update(ctx, state) {
    const { lines, cells, a, b, c } = state;
    const m = ctx.motion;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    const aspect = width / height;
    if (aspect !== state.aspect) {
      state.aspect = aspect;
      // Fit the drawing (about ±3.9 × ±3.3, plus room for the toolbar) to the screen.
      const tan = Math.tan((ctx.camera.fov * Math.PI) / 360);
      ctx.camera.position.setLength(Math.max(4.3, 4.2 / aspect) / tan);
    }

    const fs = current(m.stage, m.blend);
    const P = (x, y, v) => v.set(X0 + x * XS, Y0 + y * YS, 0);

    lines.reset();
    lines.push(P(0, 0, a), P(1, 0, b), state.axis);
    lines.push(P(0, -1, a), P(0, 1, b), state.axis);
    lines.push(P(1, -1, a), P(1, 1, b), state.axis);
    for (let i = 0; i <= DEG; i++) {
      // The one being built is bright; the rest are dimmer.
      const active = m.stage < 4 && i === m.k;
      c.copy(state.palette[i]).multiplyScalar(active || m.stage >= 4 ? 1 : 0.55);
      // Each drawn scaled to fill the plot; scaling a vector changes no angle.
      let peak = 1e-9;
      for (let s = 0; s <= SAMPLES; s++) peak = Math.max(peak, Math.abs(at(fs[i], s / SAMPLES)));
      let prev = at(fs[i], 0) / peak;
      for (let s = 1; s <= SAMPLES; s++) {
        const x = s / SAMPLES;
        const y = at(fs[i], x) / peak;
        lines.push(P(x - 1 / SAMPLES, prev, a), P(x, y, b), c);
        prev = y;
      }
    }
    lines.commit();

    // The Gram matrix of cosines.
    const norms = fs.map((f) => Math.sqrt(ip(f, f)));
    for (let i = 0; i <= DEG; i++) {
      for (let j = 0; j <= DEG; j++) {
        const v = ip(fs[i], fs[j]) / (norms[i] * norms[j]);
        c.copy(state.zero).lerp(v >= 0 ? state.pos : state.neg, Math.min(1, Math.abs(v)));
        cells.setColorAt(i * (DEG + 1) + j, c);
      }
    }
    cells.instanceColor.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.lines.dispose();
    state.cellGeo.dispose();
    state.cellMat.dispose();
    state.cells.dispose();
  },
};
