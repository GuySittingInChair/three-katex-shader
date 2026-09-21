// Editable-source strings (same shape the code panel edits/runs) used to
// seed a brand-new sketch. Kept as literal text, not objects, so creating a
// sketch goes through the exact same compile path as editing one.

export function shaderStarterSource(name, category) {
  return `return {
  name: ${JSON.stringify(name)},
  description: '',
  category: ${JSON.stringify(category)},
  mode: 'shader',
  params: {
    speed: { value: 1.0, min: 0, max: 5 },
  },
  fragmentShader: \`
    uniform float uTime;
    uniform float uSpeed;
    varying vec2 vUv;
    void main() {
      vec3 color = vec3(vUv, 0.5 + 0.5 * sin(uTime * uSpeed));
      gl_FragColor = vec4(color, 1.0);
    }
  \`,
  uniforms() {
    return { uSpeed: { value: 1.0 } };
  },
  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
  },
};`;
}

export function geometryStarterSource(name, category) {
  return `return {
  name: ${JSON.stringify(name)},
  description: '',
  category: ${JSON.stringify(category)},
  mode: '3d',
  controls: 'orbit',
  params: {
    spin: { value: 0.3, min: -2, max: 2 },
  },
  setup(ctx) {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshNormalMaterial({ wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);
    return { mesh };
  },
  update(ctx, state) {
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
  },
  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.mesh.material.dispose();
  },
};`;
}
