import * as THREE from 'three';

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
    float hue = fract(uTime * uHueSpeed + length(vPosition) * 0.3);
    vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export default {
  name: 'Torus Knot',
  description: 'A (p,q) torus knot with position-driven hue cycling.',
  tags: ['geometry', 'knot'],
  category: 'Knots',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '(p,q)\\text{-torus knot}',

  params: {
    p: { value: 2, min: 1, max: 12, step: 1, rebuild: true },
    q: { value: 3, min: 1, max: 12, step: 1, rebuild: true },
    hueSpeed: { value: 0.1, min: 0, max: 1 },
    spin: { value: 0.4, min: -2, max: 2 },
  },

  setup(ctx) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uHueSpeed: { value: ctx.params.hueSpeed } },
    });
    const geometry = new THREE.TorusKnotGeometry(
      0.7, 0.22, 200, 32, ctx.params.p, ctx.params.q
    );
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);
    return { mesh, material };
  },

  update(ctx, state) {
    state.material.uniforms.uTime.value = ctx.time;
    state.material.uniforms.uHueSpeed.value = ctx.params.hueSpeed;
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
    state.mesh.rotation.x += ctx.delta * ctx.params.spin * 0.6;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
