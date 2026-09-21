import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Constant-pixel-width lines whose endpoints change every frame.
// `overlay: true` draws on top of everything (no depth test), for control nets over a surface.
//
// A sketch writes segment endpoints (and colours) into typed arrays it owns
// and calls `commit()`; nothing is reallocated, so it is safe to run
// every frame. (LineSegmentsGeometry.setPositions makes new GPU buffers on
// each call — fine once, a leak per frame.)
//
//   const lines = createFatLines({ maxSegments: 200, width: 2 });
//   lines.push(a, b, colorA, colorB)  ...  lines.commit();  lines.reset() next frame
export function createFatLines({ maxSegments, width = 2, opacity = 1, overlay = false }) {
  const positions = new Float32Array(maxSegments * 6);
  const colors = new Float32Array(maxSegments * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);

  const material = new LineMaterial({
    linewidth: width,
    vertexColors: true,
    transparent: opacity < 1,
    opacity,
    worldUnits: false,
    depthTest: !overlay,
  });
  const object = new LineSegments2(geometry, material);
  if (overlay) object.renderOrder = 10;
  object.frustumCulled = false; // endpoints move every frame; the bounds computed at creation are stale
  geometry.instanceCount = 0;

  let n = 0;
  return {
    object,
    material,
    geometry,
    reset() {
      n = 0;
    },
    // a, b: THREE.Vector3 (or {x,y,z}); ca, cb: THREE.Color (or {r,g,b}). cb defaults to ca.
    push(a, b, ca, cb = ca) {
      if (n >= maxSegments) return;
      const k = n * 6;
      positions[k] = a.x; positions[k + 1] = a.y; positions[k + 2] = a.z;
      positions[k + 3] = b.x; positions[k + 4] = b.y; positions[k + 5] = b.z;
      colors[k] = ca.r; colors[k + 1] = ca.g; colors[k + 2] = ca.b;
      colors[k + 3] = cb.r; colors[k + 4] = cb.g; colors[k + 5] = cb.b;
      n++;
    },
    commit() {
      geometry.instanceCount = n;
      geometry.attributes.instanceStart.data.needsUpdate = true;
      geometry.attributes.instanceColorStart.data.needsUpdate = true;
    },
    // LineMaterial needs the drawing-buffer size in pixels to turn `width` into world units.
    setResolution(w, h) {
      material.resolution.set(w, h);
    },
    setWidth(px) {
      material.linewidth = px;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// Round, soft-edged points sized in world units (so they shrink with distance).
export function createDots({ maxPoints, radius = 0.06, overlay = false }) {
  const positions = new Float32Array(maxPoints * 3);
  const colors = new Float32Array(maxPoints * 3);
  const sizes = new Float32Array(maxPoints);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: !overlay,
    uniforms: { uScale: { value: 500 } },
    vertexShader: `
      uniform float uScale;
      attribute vec3 aColor;
      attribute float aSize;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(2.0, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = length(q);
        if (r > 1.0) discard;
        float rim = smoothstep(1.0, 0.7, r);
        float shade = 0.65 + 0.35 * (1.0 - r);
        gl_FragColor = vec4(vColor * shade, rim);
      }
    `,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  if (overlay) object.renderOrder = 11;

  let n = 0;
  return {
    object,
    material,
    reset() {
      n = 0;
    },
    push(p, color, r = radius) {
      if (n >= maxPoints) return;
      positions[n * 3] = p.x; positions[n * 3 + 1] = p.y; positions[n * 3 + 2] = p.z;
      colors[n * 3] = color.r; colors[n * 3 + 1] = color.g; colors[n * 3 + 2] = color.b;
      sizes[n] = r * 2;
      n++;
    },
    commit() {
      geometry.setDrawRange(0, n);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    },
    // Pixels per world unit at distance 1: h / (2 tan(fov/2)).
    setCamera(camera, heightPx) {
      material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
