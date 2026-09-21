// Voxel shell producer — decides *which* voxels exist, off the GPU.
//
// Pure functions over typed arrays (no THREE, no DOM), so the same code can
// run on the main thread or inside a Worker (see flyLifWorker.js) and the
// result is a plain Float32Array that transfers zero-copy.
//
// Output layout, SHELL_STRIDE floats per surviving voxel, ready to be wrapped
// in one THREE.InstancedInterleavedBuffer:
//
//   [ cx cy cz | h | gx gy gz | chk ]
//     centre     size  field     checker
//                      gradient  parity (0 | 1)
//
// Two producers fill it:
//   extractShell — samples a signed field on an N³ grid over [−L, L]³
//   packPoints   — takes explicit centres (e.g. a COLMAP / DUSt3R point cloud)
// The renderer only ever sees the packed shell, so it can't tell them apart.

export const SHELL_STRIDE = 8;

const SQRT3 = Math.sqrt(3);

// A shell buffer with room for `capacity` voxels; `count` is how many are live.
export function createShellBuffer(capacity) {
  return { data: new Float32Array(capacity * SHELL_STRIDE), count: 0 };
}

// Voxel (i,j,l) of an N³ grid over [−L, L]³, h = 2L/N, is filled iff its centre
// has f < 0. If f is 1-Lipschitz, f(c) < −√3·h puts all 26 neighbours inside
// the solid too, so that voxel can never be seen: only −√3·h ≤ f < 0 survives.
//
// sample(x, y, z) → f. Writes into `out` (a createShellBuffer result) and
// returns it; `out.count` is the number of surviving voxels. If `out` is too
// small the excess voxels are dropped rather than overrunning.
export function extractShell(sample, N, L, out) {
  const data = out.data;
  const capacity = data.length / SHELL_STRIDE;
  const h = (2 * L) / N;
  const buried = -SQRT3 * h;
  const e = 0.5 * h;
  let count = 0;

  for (let l = 0; l < N; l++) {
    const z = (l + 0.5) * h - L;
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) * h - L;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * h - L;
        const f = sample(x, y, z);
        if (f >= 0 || f < buried) continue;
        if (count === capacity) {
          out.count = count;
          return out;
        }

        // Field gradient by the tetrahedron trick: 4 samples, no axis bias.
        const f0 = sample(x + e, y - e, z - e);
        const f1 = sample(x - e, y - e, z + e);
        const f2 = sample(x - e, y + e, z - e);
        const f3 = sample(x + e, y + e, z + e);
        let gx = f0 - f1 - f2 + f3;
        let gy = -f0 - f1 + f2 + f3;
        let gz = -f0 + f1 - f2 + f3;
        const len = Math.hypot(gx, gy, gz);
        // A vanishing gradient becomes (0,0,0); the vertex shader then keeps
        // the cube's own face normal.
        if (len > 0) {
          gx /= len;
          gy /= len;
          gz /= len;
        } else {
          gx = gy = gz = 0;
        }

        const o = count * SHELL_STRIDE;
        data[o] = x;
        data[o + 1] = y;
        data[o + 2] = z;
        data[o + 3] = h;
        data[o + 4] = gx;
        data[o + 5] = gy;
        data[o + 6] = gz;
        data[o + 7] = (i + j + l) & 1;
        count++;
      }
    }
  }
  out.count = count;
  return out;
}

// Explicit centres instead of a field: `points` is xyz triples, `h` a shared
// voxel size (number) or one size per point (Float32Array). `normals` (xyz
// triples, unit length) is optional — without it the cubes keep their face
// normals. Points are assumed to already be a shell, so nothing is culled.
export function packPoints(points, h, out, normals = null) {
  const data = out.data;
  const n = Math.min(points.length / 3, data.length / SHELL_STRIDE);
  const perPoint = typeof h !== 'number';

  for (let p = 0; p < n; p++) {
    const o = p * SHELL_STRIDE;
    const s = p * 3;
    data[o] = points[s];
    data[o + 1] = points[s + 1];
    data[o + 2] = points[s + 2];
    data[o + 3] = perPoint ? h[p] : h;
    data[o + 4] = normals ? normals[s] : 0;
    data[o + 5] = normals ? normals[s + 1] : 0;
    data[o + 6] = normals ? normals[s + 2] : 0;
    data[o + 7] = p & 1;
  }
  out.count = n;
  return out;
}
