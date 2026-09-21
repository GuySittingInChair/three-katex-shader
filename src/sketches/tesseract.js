import * as THREE from 'three';

function popcount(n) {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

function buildVertices4D() {
  const verts = [];
  for (let i = 0; i < 16; i++) {
    verts.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  }
  return verts;
}

function buildEdges() {
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      if (popcount(i ^ j) === 1) edges.push([i, j]);
    }
  }
  return edges;
}

export default {
  name: 'Tesseract',
  description: 'A 4D hypercube rotating through the XW and YZ planes, perspective-projected into 3D.',
  tags: ['4d', 'hypercube', 'wireframe'],
  category: '4D',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex:
    "x'{=}x\\cos\\alpha{-}w\\sin\\alpha,\\ w'{=}x\\sin\\alpha{+}w\\cos\\alpha\\ (XW),\\quad y'{=}y\\cos\\beta{-}z\\sin\\beta,\\ z'{=}y\\sin\\beta{+}z\\cos\\beta\\ (YZ)",

  params: {
    speed: { value: 0.6, min: 0, max: 2 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 4.5);

    const vertices4D = buildVertices4D();
    const edges = buildEdges();

    const positions = new Float32Array(edges.length * 2 * 3);
    const colors = new Float32Array(edges.length * 2 * 3);

    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      const wA = (vertices4D[a][3] + 1) * 0.5;
      const wB = (vertices4D[b][3] + 1) * 0.5;
      const colorA = new THREE.Color().setHSL(0.55 + wA * 0.3, 0.8, 0.5 + wA * 0.2);
      const colorB = new THREE.Color().setHSL(0.55 + wB * 0.3, 0.8, 0.5 + wB * 0.2);
      colors[e * 6 + 0] = colorA.r;
      colors[e * 6 + 1] = colorA.g;
      colors[e * 6 + 2] = colorA.b;
      colors[e * 6 + 3] = colorB.r;
      colors[e * 6 + 4] = colorB.g;
      colors[e * 6 + 5] = colorB.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const lines = new THREE.LineSegments(geometry, material);
    ctx.scene.add(lines);

    return { lines, geometry, material, vertices4D, edges };
  },

  update(ctx, state) {
    const { geometry, vertices4D, edges } = state;
    const posAttr = geometry.attributes.position;

    const a = ctx.time * ctx.params.speed;
    const b = ctx.time * ctx.params.speed * 0.61;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);

    const perspectiveW = 2.5;
    const rotated = vertices4D.map(([x, y, z, w]) => {
      const x1 = x * ca - w * sa;
      const w1 = x * sa + w * ca;
      const y1 = y * cb - z * sb;
      const z1 = y * sb + z * cb;
      const scale = perspectiveW / (perspectiveW - w1);
      return [x1 * scale, y1 * scale, z1 * scale];
    });

    for (let e = 0; e < edges.length; e++) {
      const [ia, ib] = edges[e];
      const pa = rotated[ia];
      const pb = rotated[ib];
      posAttr.setXYZ(e * 2, pa[0], pa[1], pa[2]);
      posAttr.setXYZ(e * 2 + 1, pb[0], pb[1], pb[2]);
    }
    posAttr.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
  },
};
