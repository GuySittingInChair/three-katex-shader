import * as THREE from 'three';
import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { TAU, phaseOf } from '../lib/motion.js';
import { createFatLines, createDots } from '../lib/fatLines.js';

// A bicubic *rational* Bézier patch — the building block of NURBS — whose
// control net is fixed and whose weights move.
//
//            Σᵢⱼ wᵢⱼ Bᵢ(u) Bⱼ(v) Pᵢⱼ
//   S(u,v) = ───────────────────────── ,     Bᵢ(t) = C(3,i) (1−t)^(3−i) tⁱ
//            Σᵢⱼ wᵢⱼ Bᵢ(u) Bⱼ(v)
//
// A weight is a control point's *pull*: as wᵢⱼ → ∞ the surface is drawn onto
// Pᵢⱼ (S(⅓,⅓) → P₁₁ for w₁₁ → ∞, since B₁B₁ peaks at (⅓,⅓)), and as wᵢⱼ → 0 that
// point is ignored. Nothing about the net changes — only who is pulling.
//
// The four interior weights take turns around the 2×2 core of the net,
//
//   w_k(t) = exp( a(t) cos(ωt − kπ/2) ),   (w₁₁, w₁₂, w₂₂, w₂₁) = (w₀, w₁, w₂, w₃)
//   a(t)   = 1.4 − 0.9 cos 2ωt
//
// so a bulge of influence circulates through the patch, sharpening and
// relaxing twice per lap. Each net point is drawn with radius ∝ √w.
// The net is an egg-crate, Pᵢⱼ = (i − 3/2, 0.6 (−1)^(i+j), j − 3/2).

const PERIOD = 12;
const A0 = 1.4;
const A1 = 0.9;
const H = 0.6;
const net = (i, j) => [i - 1.5, H * ((i + j) % 2 === 0 ? 1 : -1), j - 1.5];
const WEIGHTED = [[1, 1], [1, 2], [2, 2], [2, 1]]; // (w₀ … w₃)

const NET_GLSL = `const vec3 NET[16] = vec3[16](${Array.from({ length: 16 }, (_, k) => {
  const [x, y, z] = net(Math.floor(k / 4), k % 4);
  return `vec3(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`;
}).join(', ')});`;

const SLATE = new THREE.Color(0.4, 0.44, 0.54);
const HOT = new THREE.Color(0.95, 0.72, 0.36);

export default {
  name: 'NURBS Weight Patch',
  description:
    'A bicubic rational Bézier patch on a fixed egg-crate control net. Only the weights move: the four interior ' +
    'weights wᵢⱼ = exp(a cos(ωt − kπ/2)) take turns, so the pull of the net circulates round its core while ' +
    'a(t) sharpens and relaxes it. Net points are drawn with radius ∝ √w. As a weight grows the surface is ' +
    'drawn onto its control point; try Gaussian curvature to see where the bulge bends.',
  tags: ['spline', 'nurbs', 'surface', 'rational'],
  category: 'Splines',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: morphParams({ curvatureScale: { value: 1.5, min: 0.05, max: 8 } }),

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const a = A0 - A1 * Math.cos(2 * TAU * p);
    const m = { a };
    for (let k = 0; k < 4; k++) m[`w${k}`] = Math.exp(a * Math.cos(TAU * p - (k * Math.PI) / 2));
    return m;
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    '\\mathbf S(u,v) &= \\frac{\\sum_{i,j=0}^{3} w_{ij}\\,B_i(u)B_j(v)\\,\\mathbf P_{ij}}' +
    '{\\sum_{i,j=0}^{3} w_{ij}\\,B_i(u)B_j(v)},\\qquad B_i(t)=\\tbinom3i(1-t)^{3-i}t^i \\\\' +
    '(w_{11},w_{12},w_{22},w_{21}) &= e^{a\\cos(\\omega t-k\\pi/2)} = ' +
    `(${hl(m.w0, 2)},\\ ${hl(m.w1, 2)},\\ ${hl(m.w2, 2)},\\ ${hl(m.w3, 2)}),\\quad \\text{other } w_{ij}=1 \\\\` +
    `a &= ${A0}-${A1}\\cos2\\omega t = ${hl(m.a, 2)}` +
    '\\end{aligned}',

  setup(ctx) {
    ctx.camera.position.set(0, 2.9, 3.3);
    const { mesh, material } = createMorphSurface({
      motionKeys: ['w0', 'w1', 'w2', 'w3'],
      segments: [96, 96],
      extent: 2.2,
      glsl: `
        ${NET_GLSL}
        vec4 bern(float t) {
          float s = 1.0 - t;
          return vec4(s * s * s, 3.0 * s * s * t, 3.0 * s * t * t, t * t * t);
        }
        float weight(int i, int j) {
          if (i == 1 && j == 1) return m_w0;
          if (i == 1 && j == 2) return m_w1;
          if (i == 2 && j == 2) return m_w2;
          if (i == 2 && j == 1) return m_w3;
          return 1.0;
        }
        vec3 surface(vec2 uv) {
          vec4 bu = bern(uv.x), bv = bern(uv.y);
          vec3 num = vec3(0.0);
          float den = 0.0;
          for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
              float w = weight(i, j) * bu[i] * bv[j];
              num += w * NET[i * 4 + j];
              den += w;
            }
          }
          return num / den;
        }
      `,
    });
    ctx.scene.add(mesh);

    // The control net: fixed edges, points sized by their weight.
    const edges = createFatLines({ maxSegments: 24, width: 1.5, opacity: 0.7, overlay: true });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const p = new THREE.Vector3(...net(i, j));
        if (i < 3) edges.push(p, new THREE.Vector3(...net(i + 1, j)), SLATE);
        if (j < 3) edges.push(p, new THREE.Vector3(...net(i, j + 1)), SLATE);
      }
    }
    edges.commit();
    const dots = createDots({ maxPoints: 16, overlay: true });
    ctx.scene.add(edges.object, dots.object);
    return { mesh, material, edges, dots, tmp: new THREE.Color() };
  },

  update(ctx, state) {
    updateMorphSurface(state.material, ctx);
    const { edges, dots, tmp } = state;
    const { width, height } = ctx.size;
    edges.setResolution(width, height);
    dots.setCamera(ctx.camera, height);

    dots.reset();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const k = WEIGHTED.findIndex(([a, b]) => a === i && b === j);
        const w = k < 0 ? 1 : ctx.motion[`w${k}`];
        tmp.copy(SLATE).multiplyScalar(1.6).lerp(HOT, k < 0 ? 0 : Math.max(0, Math.min(1, Math.log(w) / 2 + 0.35)));
        dots.push(new THREE.Vector3(...net(i, j)), tmp.clone(), 0.045 * Math.sqrt(w));
      }
    }
    dots.commit();
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
    state.edges.dispose();
    state.dots.dispose();
  },
};
