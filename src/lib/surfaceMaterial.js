import * as THREE from 'three';

// One material for every parametric-surface sketch, replacing the VERT/FRAG
// pair each of them used to paste in. Reads the `uv` and `curvature`
// attributes parametricSurface(…, { analytic: true }) provides.
//
// Sketch side, in three lines:
//   params: { ...surfaceParams(), myCoeff: {...} }
//   setup:  material = createSurfaceMaterial(ctx.params, geometry)
//   update: updateSurfaceMaterial(state.material, ctx)

export const SHADING_OPTIONS = ['Iridescent', 'Gaussian curvature', 'Mean curvature', 'UV checker', 'Normals'];

// GLSL colormaps, shared with raymarched sketches (interpolated into their
// fragment source). Diverging for signed Gaussian curvature (blue = saddle,
// red = dome, so a minimal surface reads as uniformly blue), sequential for
// |mean curvature|.
export const COLORMAP_GLSL = `
  vec3 divergingColor(float t) {            // t in [-1, 1]
    vec3 neg = vec3(0.15, 0.36, 0.86);
    vec3 pos = vec3(0.90, 0.28, 0.16);
    return mix(vec3(0.93), t > 0.0 ? pos : neg, abs(t));
  }
  vec3 sequentialColor(float t) {           // t in [0, 1], viridis anchors
    vec3 a = vec3(0.27, 0.00, 0.33);
    vec3 b = vec3(0.13, 0.57, 0.55);
    vec3 c = vec3(0.99, 0.91, 0.14);
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, t * 2.0 - 1.0);
  }
`;

// The standard param block. Spread it into a sketch's `params` and override
// individual entries: `{ ...surfaceParams({ curvatureScale: {...} }), coeff: {...} }`.
export function surfaceParams(overrides = {}) {
  return {
    hueSpeed: { value: 0.08, min: 0, max: 1 },
    spin: { value: 0.2, min: -2, max: 2 },
    shading: { value: 0, min: 0, max: SHADING_OPTIONS.length - 1, step: 1, options: SHADING_OPTIONS },
    // How hard curvature saturates the colormap; depends on the surface's size.
    curvatureScale: { value: 1, min: 0.05, max: 8 },
    gridScale: { value: 12, min: 2, max: 48, step: 1 },
    // Horizontal cutting plane, as a fraction of the surface's own height
    // (0 = bottom, 1 = off). Lets you see inside self-intersecting surfaces.
    slice: { value: 1, min: 0, max: 1 },
    ...overrides,
  };
}

const VERT = `
  attribute vec2 curvature;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec2 vCurv;
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    vCurv = curvature;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SURFACE_FRAG = `
  uniform float uTime;
  uniform float uHueSpeed;
  uniform float uShading;
  uniform float uCurvatureScale;
  uniform float uGridScale;
  uniform float uSlice;
  uniform float uExtent;
  uniform float uYMin;
  uniform float uYMax;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec2 vCurv;
  ${COLORMAP_GLSL}

  void main() {
    if (uSlice < 0.999 && vPosition.y > mix(uYMin, uYMax, uSlice)) discard;

    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    // Headlight, |n.z| so both faces (and a non-orientable surface's flipped
    // normals) light identically.
    float shade = 0.35 + 0.65 * abs(n.z);

    int mode = int(uShading + 0.5);
    vec3 base;
    if (mode == 1) {
      base = divergingColor(tanh(vCurv.x * uCurvatureScale));
    } else if (mode == 2) {
      base = sequentialColor(tanh(abs(vCurv.y) * uCurvatureScale));
    } else if (mode == 3) {
      vec2 g = floor(vUv * uGridScale);
      base = vec3(mod(g.x + g.y, 2.0) < 0.5 ? 0.92 : 0.32);
    } else if (mode == 4) {
      base = n * 0.5 + 0.5;
      shade = 1.0;
    } else {
      float hue = fract(uTime * uHueSpeed + length(vPosition) / uExtent * 0.3);
      base = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    }
    gl_FragColor = vec4(base * shade, 1.0);
  }
`;

// The uniform set SURFACE_FRAG reads. `extent` is the surface's radius from
// the origin (hue falloff); yMin/yMax bound the slice plane.
export function surfaceUniforms(extent = 1, yMin = -1, yMax = 1) {
  return {
    uTime: { value: 0 },
    uHueSpeed: { value: 0 },
    uShading: { value: 0 },
    uCurvatureScale: { value: 1 },
    uGridScale: { value: 12 },
    uSlice: { value: 1 },
    uExtent: { value: extent },
    uYMin: { value: yMin },
    uYMax: { value: yMax },
  };
}

export function createSurfaceMaterial(params, geometry) {
  // Farthest vertex from the *origin* (not the bounding-sphere radius, which
  // is measured from the bounding box's centre): the slice plane and the hue
  // falloff both work in object space around the origin.
  let extent = 1;
  let yMin = -1;
  let yMax = 1;
  const pos = geometry?.getAttribute('position');
  if (pos) {
    let max2 = 0;
    yMin = Infinity;
    yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      max2 = Math.max(max2, x * x + y * y + z * z);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    extent = Math.sqrt(max2) || 1;
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SURFACE_FRAG,
    side: THREE.DoubleSide,
    uniforms: surfaceUniforms(extent, yMin, yMax),
  });
  updateSurfaceMaterial(material, { time: 0, params });
  return material;
}

export function updateSurfaceMaterial(material, ctx) {
  const u = material.uniforms;
  const p = ctx.params;
  u.uTime.value = ctx.time;
  u.uHueSpeed.value = p.hueSpeed ?? 0.05;
  u.uShading.value = p.shading;
  u.uCurvatureScale.value = p.curvatureScale;
  u.uGridScale.value = p.gridScale ?? 12;
  u.uSlice.value = p.slice ?? 1;
}
