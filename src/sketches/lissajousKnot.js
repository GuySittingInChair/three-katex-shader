import * as THREE from 'three';
import { parametricCurve } from '../lib/curves.js';

const VERT = `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  uniform float uTime;
  uniform float uHueSpeed;
  varying vec3 vPosition;
  void main() {
    float hue = fract(uTime * uHueSpeed + length(vPosition) * 0.5);
    vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export default {
  name: 'Lissajous Knot',
  description: '3D Lissajous curve with coprime frequencies, forming a knot.',
  tags: ['knot', 'curve'],
  category: 'Knots',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '(\\cos(n_x t),\\ \\cos(n_y t + \\varphi),\\ \\cos(n_z t))',

  // nx, ny, nz should stay pairwise coprime for the curve to be a true knot
  // rather than a link.
  params: {
    nx: { value: 3, min: 1, max: 12, step: 1, rebuild: true },
    ny: { value: 4, min: 1, max: 12, step: 1, rebuild: true },
    nz: { value: 7, min: 1, max: 12, step: 1, rebuild: true },
    tubeRadius: { value: 0.05, min: 0.01, max: 0.2, rebuild: true },
    hueSpeed: { value: 0.1, min: 0, max: 1 },
    spin: { value: 0.25, min: -2, max: 2 },
  },

  setup(ctx) {
    const { nx, ny, nz } = ctx.params;
    const phase = Math.PI / 2;
    const curve = parametricCurve(
      (t) =>
        new THREE.Vector3(
          Math.cos(nx * t) * 0.9,
          Math.cos(ny * t + phase) * 0.9,
          Math.cos(nz * t) * 0.9
        ),
      500,
      true
    );
    const geometry = new THREE.TubeGeometry(curve, 400, ctx.params.tubeRadius, 10, true);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uHueSpeed: { value: ctx.params.hueSpeed } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    state.material.uniforms.uTime.value = ctx.time;
    state.material.uniforms.uHueSpeed.value = ctx.params.hueSpeed;
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
