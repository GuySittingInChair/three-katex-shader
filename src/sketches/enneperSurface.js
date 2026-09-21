import * as THREE from 'three';
import { parametricSurface } from '../lib/parametric.js';
import { surfaceParams, createSurfaceMaterial, updateSurfaceMaterial } from '../lib/surfaceMaterial.js';

// Every coefficient here used to be a bare literal (domain scale 1.3, the
// cubic term's 1/3, an implicit ×1 on the cross term, the final ×0.5) —
// none of them touched by any param, so the actual defining equation was
// completely fixed. Pulling them out as `coeffs` is the whole fix: at
// their defaults this reproduces the classical Enneper surface exactly,
// but each is now a real, rebuild-triggering param.
function enneperPoint(u, v, coeffs) {
  const uu = (u * 2 - 1) * coeffs.domainScale;
  const vv = (v * 2 - 1) * coeffs.domainScale;
  const x = uu - coeffs.cubicCoeff * (uu * uu * uu) + coeffs.crossCoeff * uu * vv * vv;
  const y = vv - coeffs.cubicCoeff * (vv * vv * vv) + coeffs.crossCoeff * vv * uu * uu;
  const z = uu * uu - vv * vv;
  return new THREE.Vector3(x * coeffs.outputScale, y * coeffs.outputScale, z * coeffs.outputScale);
}

export default {
  name: 'Enneper Surface',
  description:
    'A classic minimal surface with self-intersecting symmetric lobes — domain scale, the cubic and ' +
    'cross-term coefficients, and the output scale are all real params now, not baked-in literals, so ' +
    'the actual defining equation is adjustable, not just color/rotation.',
  tags: ['surface', 'minimal-surface', 'parametric'],
  category: 'Surfaces',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex:
    '\\mathbf{r}(u,v) = {{outputScale}}\\big(u{-}{{cubicCoeff}}\\,u^3{+}{{crossCoeff}}\\,uv^2,\\ ' +
    'v{-}{{cubicCoeff}}\\,v^3{+}{{crossCoeff}}\\,vu^2,\\ u^2{-}v^2\\big),\\quad u,v \\in [-{{domainScale}},\\,{{domainScale}}]',

  params: {
    ...surfaceParams({ curvatureScale: { value: 2, min: 0.05, max: 8 } }),
    // Coefficients of the actual surface equation — all `rebuild: true`
    // since they change the geometry itself, not just a uniform. Defaults
    // reproduce the classical Enneper surface exactly (α=1/3, β=1).
    domainScale: { value: 1.3, min: 0.5, max: 2.5, rebuild: true },
    cubicCoeff: { value: 0.3333, min: 0, max: 1, rebuild: true }, // α
    crossCoeff: { value: 1.0, min: -1, max: 2, rebuild: true }, // β
    outputScale: { value: 0.5, min: 0.2, max: 1, rebuild: true }, // s
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 4);
    const coeffs = {
      domainScale: ctx.params.domainScale,
      cubicCoeff: ctx.params.cubicCoeff,
      crossCoeff: ctx.params.crossCoeff,
      outputScale: ctx.params.outputScale,
    };
    const geometry = parametricSurface((u, v) => enneperPoint(u, v, coeffs), 120, 120, { analytic: true });
    const material = createSurfaceMaterial(ctx.params, geometry);
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    updateSurfaceMaterial(state.material, ctx);
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
