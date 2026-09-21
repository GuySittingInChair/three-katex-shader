import * as THREE from 'three';

const NODE_COUNT = 40;
const REST_LENGTH = 0.5;
const CENTER_PULL = 0.02;
const DAMPING = 0.9;
// Two nodes landing close together in the initial random layout produced a
// near-singular repulsion force (softening was 0.0001) that got added
// straight into velocity with no cap — the whole graph would rocket off
// screen within the first handful of frames. A larger softening term plus
// a hard speed clamp below keeps any single close encounter bounded.
const SOFTENING2 = 0.02;
const MAX_NODE_SPEED = 0.4;

function buildGraph() {
  const nodes = Array.from({ length: NODE_COUNT }, () => ({
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: (Math.random() - 0.5) * 2,
    vx: 0, vy: 0, vz: 0,
  }));

  const edgeSet = new Set();
  const edges = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const links = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < links; k++) {
      const j = Math.floor(Math.random() * NODE_COUNT);
      if (j === i) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([i, j]);
    }
  }
  return { nodes, edges };
}

export default {
  name: 'Force-Directed Graph',
  description: 'A random network settling into a stable layout under repulsion, spring edges, and centering.',
  tags: ['graph', 'network', 'layout'],
  category: 'Graphs & Networks',
  mode: '3d',
  controls: 'orbit',
  latex: '\\vec{F}_{rep} = \\dfrac{k_r}{d^2},\\quad \\vec{F}_{spring} = k_s\\,(d - d_0)',

  params: {
    repulsion: { value: 1.2, min: 0.2, max: 4 },
    springStiffness: { value: 1.0, min: 0.2, max: 4 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 4.5);

    const { nodes, edges } = buildGraph();

    const nodeGeom = new THREE.SphereGeometry(0.04, 8, 8);
    nodeGeom.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(NODE_COUNT * 3), 3));

    // InstancedMesh's built-in per-instance color (MeshBasicMaterial's
    // vertexColors + setColorAt) renders nothing at all on this three.js
    // version — a manual attribute + tiny ShaderMaterial sidesteps it.
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
    });
    const nodeMesh = new THREE.InstancedMesh(nodeGeom, nodeMat, NODE_COUNT);
    nodeMesh.frustumCulled = false;
    const instanceColor = nodeGeom.attributes.instanceColor;
    const color = new THREE.Color();
    for (let i = 0; i < NODE_COUNT; i++) {
      color.setHSL(0.55, 0.7, 0.6).toArray(instanceColor.array, i * 3);
    }
    instanceColor.needsUpdate = true;
    ctx.scene.add(nodeMesh);

    const edgePositions = new Float32Array(edges.length * 2 * 3);
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6699cc, transparent: true, opacity: 0.5 });
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    ctx.scene.add(edgeLines);

    return {
      nodes, edges,
      nodeMesh, nodeGeom, nodeMat,
      edgeLines, edgeGeom, edgeMat,
      dummy: new THREE.Object3D(),
      color,
      instanceColor,
    };
  },

  update(ctx, state) {
    const { nodes, edges, nodeMesh, edgeLines, dummy, color, instanceColor } = state;
    const kr = 0.01 * ctx.params.repulsion;
    const ks = ctx.params.springStiffness;

    for (let i = 0; i < NODE_COUNT; i++) {
      const ni = nodes[i];
      let fx = 0, fy = 0, fz = 0;

      for (let j = 0; j < NODE_COUNT; j++) {
        if (i === j) continue;
        const nj = nodes[j];
        const dx = ni.x - nj.x;
        const dy = ni.y - nj.y;
        const dz = ni.z - nj.z;
        const d2 = dx * dx + dy * dy + dz * dz + SOFTENING2;
        const f = kr / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
        fz += (dz / d) * f;
      }

      fx -= ni.x * CENTER_PULL;
      fy -= ni.y * CENTER_PULL;
      fz -= ni.z * CENTER_PULL;

      // Accumulate only — damping and the speed clamp are applied once,
      // below, after the spring forces are added too. Clamping here and
      // then adding unbounded spring forces afterward was the bug: a
      // stiff spring integrated with an implicit dt=1 step is unstable on
      // its own, and nothing was bounding it before position integration.
      ni.vx += fx;
      ni.vy += fy;
      ni.vz += fz;
    }

    for (const [i, j] of edges) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;
      const stretch = (d - REST_LENGTH) * ks;
      const fx = (dx / d) * stretch;
      const fy = (dy / d) * stretch;
      const fz = (dz / d) * stretch;
      a.vx += fx; a.vy += fy; a.vz += fz;
      b.vx -= fx; b.vy -= fy; b.vz -= fz;
    }

    for (let i = 0; i < NODE_COUNT; i++) {
      const n = nodes[i];
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.vz *= DAMPING;

      const speed2 = n.vx * n.vx + n.vy * n.vy + n.vz * n.vz;
      if (speed2 > MAX_NODE_SPEED * MAX_NODE_SPEED) {
        const s = MAX_NODE_SPEED / Math.sqrt(speed2);
        n.vx *= s; n.vy *= s; n.vz *= s;
      }

      n.x += n.vx;
      n.y += n.vy;
      n.z += n.vz;

      dummy.position.set(n.x, n.y, n.z);
      dummy.updateMatrix();
      nodeMesh.setMatrixAt(i, dummy.matrix);

      const speed = Math.hypot(n.vx, n.vy, n.vz);
      color.setHSL(0.58, 0.7, THREE.MathUtils.clamp(0.4 + speed * 4, 0.4, 0.85)).toArray(instanceColor.array, i * 3);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;

    const posAttr = edgeLines.geometry.attributes.position;
    edges.forEach(([i, j], k) => {
      const a = nodes[i];
      const b = nodes[j];
      posAttr.array[k * 6] = a.x;
      posAttr.array[k * 6 + 1] = a.y;
      posAttr.array[k * 6 + 2] = a.z;
      posAttr.array[k * 6 + 3] = b.x;
      posAttr.array[k * 6 + 4] = b.y;
      posAttr.array[k * 6 + 5] = b.z;
    });
    posAttr.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.nodeGeom.dispose();
    state.nodeMat.dispose();
    state.edgeGeom.dispose();
    state.edgeMat.dispose();
  },
};
