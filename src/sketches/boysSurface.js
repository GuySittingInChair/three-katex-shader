import { morphParams, createMorphSurface, updateMorphSurface } from '../lib/morphSurface.js';
import { phaseOf, segments } from '../lib/motion.js';

// Steiner's Roman surface deforming into Boy's surface, and back.
//
// Both are maps of the closed unit disc |w| ≤ 1 into R³ whose boundary circle
// is glued antipodally (w ~ −w) — i.e. two immersions/parametrisations of the
// real projective plane. Because they share that domain, a straight-line
// homotopy between them is a legitimate continuous family of maps:
//
//   r_s(w) = (1 − s) R(w) + s B(w)
//
//   R(w) = c·(yz, zx, xy)  with (x, y) = 2w/(1+|w|²), z = (1−|w|²)/(1+|w|²)
//          (a point of the unit sphere, so R is even: R(w) = R(−w) on |w| = 1),
//          rotated so its 3-fold axis is vertical, c = 2.2
//   B(w) = g/|g|²   (Bryant–Kusner)   g = (−3/2 Im[w(1−w⁴)/D], −3/2 Re[w(1+w⁴)/D],
//                                          Im[(1+w⁶)/D] − 1/2),  D = w⁶ + √5 w³ − 1
//
// Intermediate frames are maps, not necessarily immersions — they pass through
// pinch points (the Roman surface has six of them; Boy's surface has none),
// which is the whole point of watching the transformation.

const PERIOD = 16;

export default {
  name: "Boy's Surface",
  description:
    "Steiner's Roman surface deforming into Boy's surface: r_s = (1−s)·Roman + s·Boy over the same disc " +
    '(boundary glued antipodally), so it is a continuous family of maps of the projective plane. The Roman ' +
    "surface's six pinch points open up into Boy's single triple point. s(t) is a closed-form loop with holds " +
    'on each end, shown live.',
  tags: ['topology', 'surface', 'homotopy', 'non-orientable'],
  category: 'Topology',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: morphParams({ curvatureScale: { value: 0.8, min: 0.05, max: 8 } }),

  motion(t) {
    const { index, blend } = segments(phaseOf(t, PERIOD), 2, 0.4);
    return { s: index === 0 ? blend : 1 - blend };
  },

  latex: (p, hl, m) => {
    const tag = m.s < 0.02 ? "\\ \\text{(Roman surface)}" : m.s > 0.98 ? "\\ \\text{(Boy's surface)}" : '';
    return (
      '\\begin{aligned}' +
      `\\mathbf r_s(w) &= (1-s)\\,\\mathbf R(w) + s\\,\\mathbf B(w),\\quad |w|\\le 1,\\quad s = ${hl(m.s, 2)}${tag} \\\\` +
      '\\mathbf R &= 2.2\\,(yz,\\ zx,\\ xy),\\quad (x{+}iy,\\ z)=\\big(\\tfrac{2w}{1+|w|^2},\\ \\tfrac{1-|w|^2}{1+|w|^2}\\big) \\\\' +
      '\\mathbf B &= \\tfrac{g}{\\lVert g\\rVert^2},\\ \\ g=\\big({-}\\tfrac32\\mathrm{Im}\\tfrac{w(1-w^4)}{D},\\ {-}\\tfrac32\\mathrm{Re}\\tfrac{w(1+w^4)}{D},\\ ' +
      '\\mathrm{Im}\\tfrac{1+w^6}{D}-\\tfrac12\\big),\\ \\ D=w^6+\\sqrt5\\,w^3-1' +
      '\\end{aligned}'
    );
  },

  setup(ctx) {
    ctx.camera.position.set(0, 2.2, 3.1);
    const { mesh, material } = createMorphSurface({
      motionKeys: ['s'],
      segments: [110, 165],
      extent: 1.7,
      glsl: `
        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
        vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

        // Bryant–Kusner Boy's surface, vertical axis = +y.
        vec3 boy(vec2 w) {
          vec2 w2 = cmul(w, w), w3 = cmul(w2, w), w4 = cmul(w2, w2), w6 = cmul(w3, w3);
          vec2 den = w6 + 2.2360679775 * w3 - vec2(1.0, 0.0);
          float g1 = -1.5 * cdiv(cmul(w, vec2(1.0, 0.0) - w4), den).y;
          float g2 = -1.5 * cdiv(cmul(w, vec2(1.0, 0.0) + w4), den).x;
          float g3 = cdiv(vec2(1.0, 0.0) + w6, den).y - 0.5;
          vec3 g = vec3(g1, g2, g3);
          float gg = dot(g, g);
          vec3 p = gg > 1e-12 ? g / gg : vec3(0.0);
          return vec3(p.x, p.z, -p.y);
        }

        // Steiner's Roman surface with its 3-fold axis (1,1,1) turned to +y.
        vec3 roman(vec2 w) {
          float s = dot(w, w);
          float x = 2.0 * w.x / (1.0 + s), y = 2.0 * w.y / (1.0 + s), z = (1.0 - s) / (1.0 + s);
          vec3 p = 2.2 * vec3(y * z, z * x, x * y);
          vec3 e1 = vec3(1.0, -1.0, 0.0) / 1.41421356;
          vec3 ey = vec3(1.0, 1.0, 1.0) / 1.7320508;
          vec3 e2 = vec3(-1.0, -1.0, 2.0) / 2.4494897;
          return vec3(dot(p, e1), dot(p, ey), dot(p, e2));
        }

        vec3 surface(vec2 uv) {
          // Disc in polar form. Nudged off the exact centre, where (u, v) is degenerate.
          float rho = 0.004 + 0.996 * uv.x;
          float phi = uv.y * 6.28318530718;
          vec2 w = rho * vec2(cos(phi), sin(phi));
          vec3 b = boy(w);
          b.y += 0.78;                      // Boy's surface hangs below its triple point; recentre
          return mix(roman(w), b, m_s);
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
