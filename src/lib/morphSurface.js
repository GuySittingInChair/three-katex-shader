import * as THREE from 'three';
import { SURFACE_FRAG, surfaceUniforms, updateSurfaceMaterial, SHADING_OPTIONS } from './surfaceMaterial.js';

// A parametric surface evaluated entirely on the GPU, so it can change shape
// every frame — the surface is *an equation with moving coefficients*, not a
// mesh that gets rebuilt.
//
// The sketch supplies GLSL defining
//     vec3 surface(vec2 uv)          // uv in [0,1]²
// which may read the motion values as uniforms named `m_<key>` (one float per
// key in `motionKeys`). The vertex shader takes the surface's first and
// second partials by central differences and derives the normal and the
// Gaussian (K) and mean (H) curvature from them — so curvature shading is
// live while the surface is changing.
//
// Differences step *past* [0,1] (uv ± h), so surfaces that close up — or close
// with a twist, like the Möbius strip — light continuously across their seam.
// `surface` therefore has to be defined a little outside the unit square.

// Standard params for a morph sketch: how fast the loop runs, plus how it's drawn.
export function morphParams(overrides = {}) {
  return {
    speed: { value: 1, min: 0, max: 4 },
    shading: { value: 0, min: 0, max: SHADING_OPTIONS.length - 1, step: 1, options: SHADING_OPTIONS },
    curvatureScale: { value: 1, min: 0.05, max: 8 },
    gridScale: { value: 16, min: 2, max: 48, step: 1 },
    ...overrides,
  };
}

function gridGeometry(uSeg, vSeg) {
  const count = (uSeg + 1) * (vSeg + 1);
  const uvs = new Float32Array(count * 2);
  const indices = [];
  const stride = vSeg + 1;
  for (let i = 0; i <= uSeg; i++) {
    for (let j = 0; j <= vSeg; j++) {
      const k = (i * stride + j) * 2;
      uvs[k] = i / uSeg;
      uvs[k + 1] = j / vSeg;
    }
  }
  for (let i = 0; i < uSeg; i++) {
    for (let j = 0; j < vSeg; j++) {
      const a = i * stride + j;
      const c = a + stride;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  // three needs a `position` attribute to size the draw; the shader ignores it.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function vertexShader(glsl, motionKeys) {
  const uniforms = motionKeys.map((k) => `uniform float m_${k};`).join('\n');
  return `
    ${uniforms}
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec2 vCurv;

    ${glsl}

    void main() {
      const float h = 0.01;
      vec2 p = uv;
      vec3 S   = surface(p);
      vec3 Su1 = surface(p + vec2(h, 0.0));
      vec3 Su0 = surface(p - vec2(h, 0.0));
      vec3 Sv1 = surface(p + vec2(0.0, h));
      vec3 Sv0 = surface(p - vec2(0.0, h));
      vec3 ru  = (Su1 - Su0) / (2.0 * h);
      vec3 rv  = (Sv1 - Sv0) / (2.0 * h);
      vec3 ruu = (Su1 - 2.0 * S + Su0) / (h * h);
      vec3 rvv = (Sv1 - 2.0 * S + Sv0) / (h * h);
      vec3 ruv = (surface(p + vec2(h, h)) - surface(p + vec2(h, -h))
                - surface(p + vec2(-h, h)) + surface(p + vec2(-h, -h))) / (4.0 * h * h);

      vec3 n = cross(ru, rv);
      float len = length(n);
      n = len > 1e-8 ? n / len : vec3(0.0, 0.0, 1.0);

      float E = dot(ru, ru), F = dot(ru, rv), G = dot(rv, rv);
      float det = E * G - F * F;
      float L = dot(ruu, n), M = dot(ruv, n), N = dot(rvv, n);
      float K = 0.0, H = 0.0;
      if (det > 1e-10) {
        K = (L * N - M * M) / det;
        H = (E * N - 2.0 * F * M + G * L) / (2.0 * det);
      }

      vPosition = S;
      vNormal = normalize(normalMatrix * n);
      vUv = uv;
      vCurv = vec2(K, H);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(S, 1.0);
    }
  `;
}

// Returns { mesh, material }. Add `mesh` to the scene; call
// updateMorphSurface(material, ctx) each frame.
export function createMorphSurface({ glsl, motionKeys, segments = [200, 64], extent = 2 }) {
  const uniforms = surfaceUniforms(extent);
  for (const k of motionKeys) uniforms[`m_${k}`] = { value: 0 };

  const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader(glsl, motionKeys),
    fragmentShader: SURFACE_FRAG,
    side: THREE.DoubleSide,
    uniforms,
  });
  const mesh = new THREE.Mesh(gridGeometry(segments[0], segments[1]), material);
  // Vertices are placed by the shader, so three's own bounds (all zeros) are meaningless.
  mesh.frustumCulled = false;
  return { mesh, material };
}

export function updateMorphSurface(material, ctx) {
  updateSurfaceMaterial(material, ctx);
  const m = ctx.motion || {};
  for (const [k, v] of Object.entries(m)) {
    const u = material.uniforms[`m_${k}`];
    if (u) u.value = v;
  }
}
