import * as THREE from 'three';

// Cheap layered sin/cos pseudo-noise over a normalized direction vector —
// no interpolation needed, just enough octave-like variation to read as
// terrain when used as a radial displacement.
function fbmDir(nx, ny, nz) {
  let value = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let o = 0; o < 4; o++) {
    value += amp * Math.sin(nx * freq * 3.1 + ny * freq * 1.7) * Math.cos(nz * freq * 2.3 - nx * freq * 0.9);
    freq *= 2.0;
    amp *= 0.5;
  }
  return value; // roughly in [-0.94, 0.94]
}

function buildGeometry(strength) {
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();

  const deepColor = new THREE.Color(0x1b3a6b);
  const midColor = new THREE.Color(0x2f7d4f);
  const highColor = new THREE.Color(0x8a6a3f);
  const peakColor = new THREE.Color(0xf0f0f0);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const height = fbmDir(v.x, v.y, v.z);
    const scale = 1 + height * strength;
    pos.setXYZ(i, v.x * scale, v.y * scale, v.z * scale);

    const t = (height + 1) * 0.5;
    let color;
    if (t < 0.35) color = deepColor.clone().lerp(midColor, t / 0.35);
    else if (t < 0.65) color = midColor.clone().lerp(highColor, (t - 0.35) / 0.3);
    else color = highColor.clone().lerp(peakColor, (t - 0.65) / 0.35);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export default {
  name: 'Displaced Icosphere',
  description: 'A noise-displaced low-poly planet, vertex-colored by elevation.',
  tags: ['mesh', 'noise', 'planet'],
  category: 'Meshes',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '\\mathbf{p} = \\hat{\\mathbf{n}}\\,\\big(1 + s \\cdot h(\\hat{\\mathbf{n}})\\big),\\quad h = \\text{layered } \\sin/\\cos \\text{ noise}',

  params: {
    displacement: { value: 0.25, min: 0, max: 0.6 },
    spin: { value: 0.15, min: -1, max: 1 },
  },

  // Displacement is baked once at setup time from the param's default value:
  // regenerating a ~2.5k-vertex geometry every frame the slider moves isn't
  // worth it for a value that's rarely tweaked live. Spin stays fully live.
  setup(ctx) {
    ctx.camera.position.set(0, 0, 3.5);

    const geometry = buildGeometry(ctx.params.displacement);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(3, 2, 4);
    ctx.scene.add(light);
    const ambient = new THREE.AmbientLight(0x8090a0, 0.6);
    ctx.scene.add(ambient);

    return { mesh, material, light, ambient };
  },

  update(ctx, state) {
    state.mesh.rotation.y += ctx.delta * ctx.params.spin;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
