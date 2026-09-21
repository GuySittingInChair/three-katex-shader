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
    float hue = fract(uTime * uHueSpeed + length(vPosition) * 0.4);
    vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function trefoilPoint(t) {
  const x = Math.sin(t) + 2 * Math.sin(2 * t);
  const y = Math.cos(t) - 2 * Math.cos(2 * t);
  const z = -Math.sin(3 * t);
  return new THREE.Vector3(x, y, z).multiplyScalar(0.3);
}

export default {
  name: 'Trefoil Knot',
  description: 'The simplest nontrivial knot, from its explicit parametric curve.',
  tags: ['knot', 'curve'],
  category: 'Knots',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '(\\sin t + 2\\sin 2t,\\ \\cos t - 2\\cos 2t,\\ -\\sin 3t)',

  params: {
    tubeRadius: { value: 0.06, min: 0.01, max: 0.2, rebuild: true },
    hueSpeed: { value: 0.1, min: 0, max: 1 },
    spin: { value: 0.3, min: -2, max: 2 },
  },

  setup(ctx) {
    const curve = parametricCurve(trefoilPoint, 300, true);
    const geometry = new THREE.TubeGeometry(curve, 300, ctx.params.tubeRadius, 12, true);
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
