import * as THREE from 'three';
import { TAU, phaseOf, segments } from '../lib/motion.js';
import { SHELL_STRIDE, createShellBuffer, extractShell } from '../lib/voxelShell.js';

// A solid, voxelised — and the solid changes while the voxel grid gets finer
// and coarser underneath it.
//
// The shape is the zero set of a signed field that is a *convex combination*
// of three signed-distance functions,
//
//   f(p) = w₁ f₁(p) + w₂ f₂(p) + w₃ f₃(p),        w ≥ 0, Σ wₖ = 1
//   f₁ = |p| − 1.05                                 sphere
//   f₂ = d_box(p, 0.72) − 0.16                      rounded cube
//   f₃ = | (|p_xz| − 0.78, p_y) | − 0.32            torus
//
// and the weights walk sphere → cube → torus → sphere (segments with a hold,
// so each shape is visible before it leaves). Every fₖ is 1-Lipschitz, hence so
// is f, and a moving zero set of f never tears: it passes continuously through
// the topology changes (the torus's hole opens where f(0) crosses zero).
//
// Voxel (i,j,l) of an N³ grid over [−L, L]³ is filled iff its centre has
// f < 0. Because f is 1-Lipschitz, a filled voxel with f(c) < −√3·h (h = 2L/N)
// has all 26 neighbours filled as well, so it is completely hidden and is
// dropped — only the shell is ever drawn.
//
// Resolution loop:  N(t) = round( 5 · 8^((1 + sin ω_N t)/2) ),  5 ≤ N ≤ 40.
//
// Pipeline: extractShell() (lib/voxelShell.js) samples f on the CPU and packs
// only the surviving voxels — centre, h, field gradient, checker parity — into
// one instanced buffer; the vertex shader just places a cube. The shell is
// re-extracted only when N or the weights change, and the buffer is a plain
// Float32Array, so a point cloud can be fed in with packPoints() instead.

const PERIOD = 30; // one lap of the three shapes
const PERIOD_N = 15; // resolution breathes twice per lap
const N_MIN = 5;
const N_MAX = 40;
const L = 1.3;

// f(p) = w₁f₁ + w₂f₂ + w₃f₃ on the CPU — the same three SDFs as the KaTeX above.
// A zero weight skips its SDF (the hold phases evaluate just one).
function field(x, y, z, w) {
  let f = 0;
  if (w[0] !== 0) f += w[0] * (Math.sqrt(x * x + y * y + z * z) - 1.05);
  if (w[1] !== 0) {
    const dx = Math.abs(x) - 0.72;
    const dy = Math.abs(y) - 0.72;
    const dz = Math.abs(z) - 0.72;
    const outside = Math.sqrt(
      Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0) + Math.max(dz, 0) * Math.max(dz, 0),
    );
    f += w[1] * (outside + Math.min(Math.max(dx, Math.max(dy, dz)), 0) - 0.16);
  }
  if (w[2] !== 0) {
    const q = Math.sqrt(x * x + z * z) - 0.78;
    f += w[2] * (Math.sqrt(q * q + y * y) - 0.32);
  }
  return f;
}

const VERT = `
  uniform vec3 uW;
  uniform float uGap;
  uniform float uSmooth;
  attribute vec3 aCenter;
  attribute float aH;
  attribute vec3 aGrad;
  attribute float aChk;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    vec3 pos = aCenter + position * aH * uGap;
    vWorld = pos;

    // Blend the cube's face normal with the field gradient. A point-cloud
    // shell has no gradient (0,0,0) — keep the face normal then.
    vec3 nn = mix(normal, aGrad, uSmooth);
    vNormal = dot(nn, nn) > 1e-8 ? normalize(nn) : normal;

    vec3 sphere = vec3(0.16, 0.5, 0.58);
    vec3 cube = vec3(0.72, 0.52, 0.22);
    vec3 torus = vec3(0.7, 0.3, 0.42);
    vColor = (uW.x * sphere + uW.y * cube + uW.z * torus) * (0.94 + 0.06 * aChk);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 l = normalize(vec3(0.5, 0.8, 0.45));
    float diff = max(dot(n, l), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(-0.6, -0.2, -0.5));
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = vColor * (0.22 + 0.62 * diff + 0.12 * fill) + vColor * rim * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default {
  name: 'Voxel SDF Morph',
  description:
    'A sphere, a rounded cube and a torus, voxelised. The solid is the zero set of f = Σ wₖfₖ, a convex ' +
    'combination of three signed-distance functions whose weights walk sphere → cube → torus → sphere; ' +
    'a voxel is filled iff f at its centre is negative. Meanwhile the grid itself breathes between 5³ and ' +
    '40³. Buried voxels are dropped exactly (f is 1-Lipschitz, so f < −√3h means every neighbour is filled too).',
  tags: ['voxel', 'sdf', 'homotopy'],
  category: 'Voxels',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  params: {
    speed: { value: 1, min: 0, max: 4 },
    gap: { value: 0.92, min: 0.5, max: 1 },
    smoothNormals: { value: 0.35, min: 0, max: 1 },
  },

  motion(t) {
    const seg = segments(phaseOf(t, PERIOD), 3, 0.35);
    const w = [0, 0, 0];
    w[seg.index] += 1 - seg.blend;
    w[seg.next] += seg.blend;
    const N = Math.round(N_MIN * (N_MAX / N_MIN) ** ((1 + Math.sin((TAU * t) / PERIOD_N)) / 2));
    return { w1: w[0], w2: w[1], w3: w[2], N };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    'f(\\mathbf p) &= \\sum_{k=1}^{3} w_k f_k(\\mathbf p),\\qquad \\textstyle\\sum w_k = 1 \\\\' +
    'f_1 &= \\lVert\\mathbf p\\rVert-1.05,\\quad f_2 = d_{\\mathrm{box}}(\\mathbf p,0.72)-0.16,\\quad ' +
    'f_3 = \\big\\lVert(\\lVert\\mathbf p_{xz}\\rVert-0.78,\\ p_y)\\big\\rVert-0.32 \\\\' +
    `(w_1,w_2,w_3) &= (${hl(m.w1, 2)},\\ ${hl(m.w2, 2)},\\ ${hl(m.w3, 2)}) \\\\` +
    '\\text{voxel } ijl \\text{ filled} &\\iff f(\\mathbf c_{ijl})<0,\\qquad ' +
    `N=\\operatorname{round}\\big(5\\cdot 8^{(1+\\sin\\omega_N t)/2}\\big)=${hl(m.N, 0)},\\quad h=\\tfrac{2L}{N}` +
    '\\end{aligned}',

  setup(ctx) {
    ctx.camera.position.set(2.1, 1.6, 2.7);

    // Worst case is every voxel surviving; the real shell at N=40 is ~10% of that.
    const shell = createShellBuffer(N_MAX ** 3);
    const instances = new THREE.InstancedInterleavedBuffer(shell.data, SHELL_STRIDE, 1);
    instances.setUsage(THREE.DynamicDrawUsage);

    const cube = new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = cube.index;
    geometry.setAttribute('position', cube.attributes.position);
    geometry.setAttribute('normal', cube.attributes.normal);
    geometry.setAttribute('aCenter', new THREE.InterleavedBufferAttribute(instances, 3, 0));
    geometry.setAttribute('aH', new THREE.InterleavedBufferAttribute(instances, 1, 3));
    geometry.setAttribute('aGrad', new THREE.InterleavedBufferAttribute(instances, 3, 4));
    geometry.setAttribute('aChk', new THREE.InterleavedBufferAttribute(instances, 1, 7));
    geometry.instanceCount = 0; // first update() extracts the shell

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uW: { value: new THREE.Vector3(1, 0, 0) },
        uGap: { value: ctx.params.gap },
        uSmooth: { value: ctx.params.smoothNormals },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // instances are placed by aCenter, not by the base cube's bounds
    ctx.scene.add(mesh);

    // w is read by the sampler; N/w1..w3 in `built` tell update() when the shell is stale.
    const w = [1, 0, 0];
    const sample = (x, y, z) => field(x, y, z, w);
    return { mesh, material, geometry, cube, shell, instances, w, sample, built: { N: 0, w1: NaN, w2: NaN, w3: NaN } };
  },

  update(ctx, state) {
    const { w1, w2, w3, N } = ctx.motion;
    const u = state.material.uniforms;
    u.uW.value.set(w1, w2, w3);
    u.uGap.value = ctx.params.gap;
    u.uSmooth.value = ctx.params.smoothNormals;

    // gap / smoothNormals are uniforms; only N and the weights change which voxels survive.
    const b = state.built;
    if (N !== b.N || w1 !== b.w1 || w2 !== b.w2 || w3 !== b.w3) {
      state.w[0] = w1;
      state.w[1] = w2;
      state.w[2] = w3;
      extractShell(state.sample, N, L, state.shell);
      Object.assign(b, { N, w1, w2, w3 });

      // Upload just the live prefix of the buffer, not all N_MAX³ slots.
      const { instances, shell } = state;
      instances.clearUpdateRanges();
      if (shell.count > 0) instances.addUpdateRange(0, shell.count * SHELL_STRIDE);
      instances.needsUpdate = true;
      state.geometry.instanceCount = shell.count; // survivingCount
    }
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.cube.dispose();
    state.material.dispose();
  },
};
