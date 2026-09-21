import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { TAU, phaseOf } from '../lib/motion.js';

// A Möbius strip that broadens, thins and re-concentrates its twist on a
// closed loop — every coefficient below is an explicit function of time, and
// the equation on screen shows the numbers the animation is using right now.
//
//   r(u,v) = ((R + ρ cos θ) cos u, (R + ρ cos θ) sin u, ρ sin θ)
//   θ = u/2 + a sin u          ρ = w (v − ½)
//
// θ(2π) − θ(0) = π for *every* a, so the strip always closes with exactly one
// half-twist; `a` only slides where along the loop that twist happens.
// Once w/2 exceeds R the strip sweeps through its own axis and passes through
// itself — the broad Möbius band is a cross-cap in disguise.

const PERIOD = 14; // seconds of motion per loop

export default {
  name: 'Möbius Strip',
  description:
    'A Möbius strip broadening, thinning and sliding its half-twist around the loop — width w(t), twist ' +
    'concentration a(t) and radius R(t) are closed-form functions of time, shown live in the equation. ' +
    'Past w ≈ 2 the band sweeps through its own axis. Try Gaussian curvature shading: the strip is ' +
    'developable (K = 0) when thin and picks up curvature as it broadens and the twist concentrates.',
  tags: ['topology', 'surface', 'homotopy'],
  category: 'Topology',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: morphParams({ curvatureScale: { value: 2, min: 0.05, max: 8 } }),

  motion(t) {
    const p = phaseOf(t, PERIOD) + 0.12;
    return {
      w: 1.2 - 0.95 * Math.cos(TAU * p),
      a: 0.5 * Math.sin(2 * TAU * p),
      R: 1 + 0.1 * Math.sin(3 * TAU * p),
    };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    '\\mathbf r &= \\big((R+\\rho\\cos\\theta)\\cos u,\\ (R+\\rho\\cos\\theta)\\sin u,\\ \\rho\\sin\\theta\\big) \\\\' +
    '\\theta &= \\tfrac u2 + a\\sin u,\\qquad \\rho = w\\,(v-\\tfrac12) \\\\' +
    `w &= 1.2-0.95\\cos\\omega t = ${hl(m.w, 2)},\\quad a = 0.5\\sin 2\\omega t = ${hl(m.a, 2)},\\quad ` +
    `R = 1+0.1\\sin 3\\omega t = ${hl(m.R, 2)}` +
    '\\end{aligned}',

  setup(ctx) {
    ctx.camera.position.set(0, 3.0, 3.6);
    const { mesh, material } = createMorphSurface({
      motionKeys: ['w', 'a', 'R'],
      segments: [240, 40],
      extent: 2.4,
      glsl: `
        vec3 surface(vec2 uv) {
          float u = uv.x * 6.28318530718;
          float theta = 0.5 * u + m_a * sin(u);
          float rho = m_w * (uv.y - 0.5);
          float r = m_R + rho * cos(theta);
          return vec3(r * cos(u), rho * sin(theta), r * sin(u));
        }
      `,
    });
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    updateMorphSurface(state.material, ctx);
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
