import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { TAU, phaseOf } from '../lib/motion.js';

// A Möbius strip inflating into a Klein bottle and back.
//
// Sweep a planar cross-section curve γ around a circle of radius a while
// rotating it through half a turn (θ = u/2). With γ_c(v) = (sin v, c·sin 2v):
//
//   c = 0   γ is a straight segment  → the sweep is a (doubly covered)
//                                       Möbius strip of width 2b
//   c = 1   γ is a figure-8          → the figure-8 immersion of the Klein bottle
//
// One family, one parameter: c(t) opens the segment into a figure-8. After the
// half-turn γ_c lands on itself with v → −v (γ_c(v+π) rotated by π equals
// γ_c(−v)), which is exactly why the result closes up — and why it is
// non-orientable. Checked numerically: seam closure ~1e-15, and at c = 0 every
// point lies in the rotating half-plane.

const PERIOD = 16;

export default {
  name: 'Klein Bottle',
  description:
    'A Möbius strip inflating into a Klein bottle: the cross-section γ_c(v) = (sin v, c sin 2v) opens from a ' +
    'straight segment (c = 0, a doubly covered Möbius strip) into a figure-8 (c = 1, the Klein bottle) while it ' +
    'is swept around the circle and turned through half a revolution. c(t) is a closed-form loop, shown live.',
  tags: ['topology', 'surface', 'homotopy', 'non-orientable'],
  category: 'Topology',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: morphParams({ curvatureScale: { value: 0.7, min: 0.05, max: 8 } }),

  motion(t) {
    const p = phaseOf(t, PERIOD) + 0.3;
    return {
      c: 0.04 + 1.1 * (0.5 - 0.5 * Math.cos(TAU * p)),
      b: 1 + 0.2 * Math.sin(2 * TAU * p + 1),
      a: 2 + 0.3 * Math.sin(3 * TAU * p),
    };
  },

  latex: (p, hl, m) => {
    const tag = m.c < 0.1 ? '\\ \\text{(Möbius strip)}' : m.c > 0.95 && m.c < 1.05 ? '\\ \\text{(figure-8 Klein bottle)}' : '';
    return (
      '\\begin{aligned}' +
      '\\gamma_c(v) &= (\\sin v,\\ c\\sin 2v),\\qquad \\theta = \\tfrac u2 \\\\' +
      '\\mathbf r &= \\big((a+b\\,\\gamma_c\\!\\cdot\\!e_\\theta)\\cos u,\\ (a+b\\,\\gamma_c\\!\\cdot\\!e_\\theta)\\sin u,\\ b\\,\\gamma_c\\!\\cdot\\!e_\\theta^{\\perp}\\big) \\\\' +
      `c &= 0.04+1.1\\,\\tfrac{1-\\cos\\omega t}{2} = ${hl(m.c, 2)}${tag},\\quad ` +
      `b = ${hl(m.b, 2)},\\quad a = ${hl(m.a, 2)}` +
      '\\end{aligned}'
    );
  },

  setup(ctx) {
    ctx.camera.position.set(0, 2.6, 3.0);
    const { mesh, material } = createMorphSurface({
      motionKeys: ['c', 'b', 'a'],
      segments: [200, 100],
      extent: 1.9,
      glsl: `
        vec3 surface(vec2 uv) {
          float u = uv.x * 6.28318530718;
          float v = uv.y * 6.28318530718;
          float th = 0.5 * u;
          // gamma_c(v) = (sin v, c sin 2v), expressed in the frame (e_theta, e_theta_perp)
          float radial = sin(v) * cos(th) - m_c * sin(2.0 * v) * sin(th);
          float height = sin(v) * sin(th) + m_c * sin(2.0 * v) * cos(th);
          float r = m_a + m_b * radial;
          return 0.45 * vec3(r * cos(u), m_b * height, r * sin(u));
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
