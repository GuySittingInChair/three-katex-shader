import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { SHADING_OPTIONS } from '../lib/surfaceMaterial.js';
import { phaseOf, segments } from '../lib/motion.js';

// The Bonnet (associate-family) bending of a helicoid into a catenoid:
//
//   x = cos α sinh v sin u + sin α cosh v cos u
//   y = −cos α sinh v cos u + sin α cosh v sin u
//   z = u cos α + v sin α
//
// α = 0 is the helicoid, α = π/2 the catenoid. Every member is a minimal
// surface (H ≡ 0) and every bending is an isometry — the metric E, F, G does
// not change — so Gaussian curvature K at a given (u, v) is the same all the
// way through (Gauss's Theorema Egregium, visibly: with Gaussian-curvature
// shading the colours ride along with the surface points while the shape
// rolls up). Checked numerically: max |H| ≈ 1e-7, max relative change of K
// and of E, F, G ≈ 4e-7 across α ∈ [0, π/2].

const PERIOD = 18;

export default {
  name: 'Helicoid ↔ Catenoid',
  description:
    'A helicoid bending, without stretching, into a catenoid — the Bonnet transformation, α(t) looping 0 → π/2 → 0. ' +
    'It stays minimal (H = 0) throughout and Gaussian curvature never changes at any given point of the surface, ' +
    'so in Gaussian-curvature shading the colours travel with the surface as it rolls up into a cylinder.',
  tags: ['surface', 'minimal-surface', 'homotopy', 'isometry'],
  category: 'Surfaces',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: morphParams({
    shading: { value: 1, min: 0, max: SHADING_OPTIONS.length - 1, step: 1, options: SHADING_OPTIONS },
    curvatureScale: { value: 1.6, min: 0.05, max: 8 },
  }),

  motion(t) {
    const { index, blend } = segments(phaseOf(t, PERIOD), 2, 0.35);
    const towardCatenoid = index === 0 ? blend : 1 - blend;
    return { alpha: (Math.PI / 2) * towardCatenoid };
  },

  latex: (p, hl, m) => {
    const tag = m.alpha < 0.02 ? '\\ \\text{(helicoid)}' : m.alpha > Math.PI / 2 - 0.02 ? '\\ \\text{(catenoid)}' : '';
    return (
      '\\begin{aligned}' +
      'x &= \\cos\\alpha\\,\\sinh v\\sin u+\\sin\\alpha\\,\\cosh v\\cos u \\\\' +
      'y &= -\\cos\\alpha\\,\\sinh v\\cos u+\\sin\\alpha\\,\\cosh v\\sin u \\\\' +
      'z &= u\\cos\\alpha+v\\sin\\alpha \\\\' +
      `\\alpha &= ${hl(m.alpha, 2)}${tag},\\qquad H\\equiv 0,\\ K(u,v)\\text{ unchanged}` +
      '\\end{aligned}'
    );
  },

  setup(ctx) {
    ctx.camera.position.set(0, 1.6, 5.2);
    const { mesh, material } = createMorphSurface({
      motionKeys: ['alpha'],
      segments: [180, 90],
      extent: 2.1,
      glsl: `
        vec3 surface(vec2 uv) {
          float u = (uv.x * 2.0 - 1.0) * 3.14159265359;
          float v = (uv.y * 2.0 - 1.0) * 1.5;
          float ca = cos(m_alpha), sa = sin(m_alpha);
          vec3 p = vec3(ca * sinh(v) * sin(u) + sa * cosh(v) * cos(u),
                       -ca * sinh(v) * cos(u) + sa * cosh(v) * sin(u),
                        u * ca + v * sa);
          return 0.6 * vec3(p.x, p.z, p.y);   // helicoid/catenoid axis along +y
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
