import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

function paletteColor(t, out) {
  out.x = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.0));
  out.y = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.33));
  out.z = 0.5 + 0.5 * Math.cos(TWO_PI * (t + 0.67));
}

export default {
  name: 'Audio-Reactive Mesh',
  description: 'A vertex-displaced icosphere driven by the live frequency spectrum.',
  tags: ['audio', 'visualization', 'mesh'],
  category: 'Visualization',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '\\mathbf{p}_i = \\hat{\\mathbf{d}}_i \\big(1 + s\\cdot X_{\\text{bin}(\\hat{\\mathbf{d}}_i)}\\big)',

  params: {
    displacement: { value: 2, min: 0.1, max: 6 },
    spin: { value: 0.2, min: -1, max: 1 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 3.2);

    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const posAttr = geometry.attributes.position;
    const count = posAttr.count;

    const directions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();
      directions[i * 3] = v.x;
      directions[i * 3 + 1] = v.y;
      directions[i * 3 + 2] = v.z;
    }

    const colors = new Float32Array(count * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);

    const light = new THREE.DirectionalLight(0xffffff, 2.0);
    light.position.set(2, 3, 4);
    ctx.scene.add(light);
    const ambient = new THREE.AmbientLight(0x404050, 1.2);
    ctx.scene.add(ambient);

    return { mesh, geometry, material, directions, count, light, ambient, colorTmp: new THREE.Vector3() };
  },

  update(ctx, state) {
    const { geometry, directions, count, colorTmp } = state;
    const posAttr = geometry.attributes.position;
    const colorAttr = geometry.attributes.color;
    const spectrum = ctx.audio;
    const useReal = spectrum?.enabled;

    for (let i = 0; i < count; i++) {
      const dx = directions[i * 3];
      const dy = directions[i * 3 + 1];
      const dz = directions[i * 3 + 2];

      const angle = Math.atan2(dz, dx);
      const normalized = angle / TWO_PI + 0.5;
      let bin = Math.floor(normalized * 64);
      if (bin < 0) bin = 0;
      if (bin > 63) bin = 63;

      let value;
      if (useReal) {
        value = spectrum.spectrum[bin];
      } else {
        value = 0.3 + 0.25 * Math.sin(bin * 0.4 + ctx.time * 1.5)
          + 0.15 * Math.sin(bin * 0.9 - ctx.time * 2.1);
        value = Math.max(0, value);
      }

      const scale = 1 + value * ctx.params.displacement;
      posAttr.setXYZ(i, dx * scale, dy * scale, dz * scale);

      paletteColor(0.55 + value * 0.5, colorTmp);
      colorAttr.setXYZ(i, colorTmp.x, colorTmp.y, colorTmp.z);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
    ctx.scene.remove(state.light);
    ctx.scene.remove(state.ambient);
  },
};
