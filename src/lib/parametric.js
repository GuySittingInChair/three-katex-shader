import * as THREE from 'three';

// Builds a triangulated BufferGeometry from a surface function surfaceFn(u, v)
// -> THREE.Vector3, with u and v both ranging over [0, 1].
//
// Always adds a `uv` attribute. With `opts.analytic`, also replaces the
// mesh-averaged vertex normals with ones from the surface's own tangent
// vectors (r_u × r_v, by finite differences) and adds a `curvature`
// attribute holding (Gaussian K, mean H) per vertex.
//
// Why bother: the grid duplicates its seam vertices, so averaged normals
// disagree across a closed surface's seam and light it with a visible line.
// The finite differences instead step *past* [0,1] (u = 1 + h, say), so a
// function that is periodic — or twisted, like the Klein bottle or Möbius
// strip — gives the same normal on both sides of the seam automatically.
// (On a non-orientable surface the sign still flips there; the shaders
// light with abs(), so that is invisible.)
export function parametricSurface(surfaceFn, uSegments = 100, vSegments = 40, opts = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= uSegments; i++) {
    const u = i / uSegments;
    for (let j = 0; j <= vSegments; j++) {
      const v = j / vSegments;
      const p = surfaceFn(u, v);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }

  const stride = vSegments + 1;
  for (let i = 0; i < uSegments; i++) {
    for (let j = 0; j < vSegments; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  if (opts.analytic) applyDifferentialGeometry(geometry, surfaceFn, uSegments, vSegments, opts.step);
  return geometry;
}

const _a = new THREE.Vector3();

// First and second partials of the surface at (u, v), as central differences.
function partials(fn, u, v, h) {
  const p = fn(u, v);
  const pu1 = fn(u + h, v), pu0 = fn(u - h, v);
  const pv1 = fn(u, v + h), pv0 = fn(u, v - h);
  const ru = pu1.clone().sub(pu0).multiplyScalar(1 / (2 * h));
  const rv = pv1.clone().sub(pv0).multiplyScalar(1 / (2 * h));
  const ruu = pu1.clone().add(pu0).addScaledVector(p, -2).multiplyScalar(1 / (h * h));
  const rvv = pv1.clone().add(pv0).addScaledVector(p, -2).multiplyScalar(1 / (h * h));
  const ruv = fn(u + h, v + h)
    .sub(fn(u + h, v - h))
    .sub(fn(u - h, v + h))
    .add(fn(u - h, v - h))
    .multiplyScalar(1 / (4 * h * h));
  return { ru, rv, ruu, rvv, ruv };
}

// Normal + (K, H) from the first/second fundamental forms. Returns null at a
// degenerate point (a pole, where r_u × r_v vanishes) or a non-finite one.
function differential(fn, u, v, h) {
  const { ru, rv, ruu, rvv, ruv } = partials(fn, u, v, h);
  const n = _a.copy(ru).cross(rv);
  const len = n.length();
  const E = ru.dot(ru), F = ru.dot(rv), G = rv.dot(rv);
  const det = E * G - F * F;
  if (!(len > 1e-9) || !(det > 1e-12)) return null;
  n.multiplyScalar(1 / len);
  const L = ruu.dot(n), M = ruv.dot(n), N = rvv.dot(n);
  const K = (L * N - M * M) / det;
  const H = (E * N - 2 * F * M + G * L) / (2 * det);
  if (!Number.isFinite(K) || !Number.isFinite(H)) return null;
  return { nx: n.x, ny: n.y, nz: n.z, K, H };
}

function applyDifferentialGeometry(geometry, fn, uSegments, vSegments, h = 1e-3) {
  const normals = geometry.getAttribute('normal');
  const stride = vSegments + 1;
  const curvature = new Float32Array((uSegments + 1) * stride * 2);
  // A pole (e.g. the centre of a disc parametrisation) has no tangent plane
  // in the parameter grid itself; sampling half a cell inward recovers it.
  const inset = 0.5 / Math.max(uSegments, vSegments);

  for (let i = 0; i <= uSegments; i++) {
    for (let j = 0; j <= vSegments; j++) {
      const u = i / uSegments;
      const v = j / vSegments;
      let d = differential(fn, u, v, h);
      if (!d) {
        const ui = Math.min(Math.max(u, inset), 1 - inset);
        const vi = Math.min(Math.max(v, inset), 1 - inset);
        d = differential(fn, ui, vi, h);
      }
      const idx = i * stride + j;
      if (d) {
        normals.setXYZ(idx, d.nx, d.ny, d.nz);
        curvature[idx * 2] = d.K;
        curvature[idx * 2 + 1] = d.H;
      } // else: keep the mesh-averaged normal, curvature stays 0
    }
  }
  normals.needsUpdate = true;
  geometry.setAttribute('curvature', new THREE.BufferAttribute(curvature, 2));
}
