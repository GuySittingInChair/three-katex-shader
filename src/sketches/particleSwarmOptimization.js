import * as THREE from 'three';

const SIZE = 4;
const SEGMENTS = 80;
const SWARM = 30;
const RESET_INTERVAL = 8;

function landscape(x, y) {
  return (
    Math.sin(x * 1.6) * Math.cos(y * 1.6) * 0.6 +
    0.3 * Math.sin(x * 0.8 + y * 0.8) +
    0.15 * Math.cos(x * 3.1) * Math.cos(y * 2.3)
  );
}

function landscapeGeometry() {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, landscape(x, y));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function spawnParticle() {
  const x = (Math.random() - 0.5) * SIZE;
  const y = (Math.random() - 0.5) * SIZE;
  return {
    x, y,
    vx: 0, vy: 0,
    bestX: x, bestY: y, bestVal: landscape(x, y),
  };
}

export default {
  name: 'Particle Swarm Optimization',
  description: 'A swarm of particles searching a bumpy loss landscape for its global minimum.',
  tags: ['optimization', 'swarm', 'search'],
  category: 'Optimization',
  mode: '3d',
  controls: 'orbit',
  latex: '\\vec{v}_i \\leftarrow w\\vec{v}_i + c_1 r_1(\\vec{p}_i{-}\\vec{x}_i) + c_2 r_2(\\vec{g}{-}\\vec{x}_i)',

  params: {
    speed: { value: 1.0, min: 0.2, max: 3 },
    explore: { value: 0.6, min: 0, max: 1.5 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, -3.2, 3.0);
    ctx.camera.lookAt(0, 0, 0);

    ctx.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, -1, 3);
    ctx.scene.add(dirLight);

    const geometry = landscapeGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x3a6ea5,
      metalness: 0.1,
      roughness: 0.6,
      wireframe: false,
    });
    const surface = new THREE.Mesh(geometry, material);
    ctx.scene.add(surface);

    const swarmGeom = new THREE.SphereGeometry(0.035, 8, 8);
    const swarmMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
    const swarmMesh = new THREE.InstancedMesh(swarmGeom, swarmMat, SWARM);
    ctx.scene.add(swarmMesh);

    let particles = Array.from({ length: SWARM }, spawnParticle);
    let globalBest = particles.reduce((a, b) => (a.bestVal < b.bestVal ? a : b));

    return {
      surface, geometry, material,
      swarmMesh, swarmGeom, swarmMat,
      particles,
      globalBest: { x: globalBest.bestX, y: globalBest.bestY, val: globalBest.bestVal },
      resetTimer: 0,
      dummy: new THREE.Object3D(),
    };
  },

  update(ctx, state) {
    const { swarmMesh, dummy } = state;
    const dt = Math.min(ctx.delta, 0.05) * ctx.params.speed;

    state.resetTimer += dt;
    if (state.resetTimer > RESET_INTERVAL) {
      state.resetTimer = 0;
      state.particles = Array.from({ length: SWARM }, spawnParticle);
      const best = state.particles.reduce((a, b) => (a.bestVal < b.bestVal ? a : b));
      state.globalBest = { x: best.bestX, y: best.bestY, val: best.bestVal };
    }

    const w = 0.5 * (0.3 + ctx.params.explore);
    const c1 = 1.5;
    const c2 = 1.5;
    const half = SIZE / 2;

    for (const p of state.particles) {
      const r1 = Math.random();
      const r2 = Math.random();
      p.vx = w * p.vx + c1 * r1 * (p.bestX - p.x) + c2 * r2 * (state.globalBest.x - p.x);
      p.vy = w * p.vy + c1 * r1 * (p.bestY - p.y) + c2 * r2 * (state.globalBest.y - p.y);

      const speed = Math.hypot(p.vx, p.vy);
      const maxSpeed = 2.5;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      p.x = THREE.MathUtils.clamp(p.x + p.vx * dt, -half, half);
      p.y = THREE.MathUtils.clamp(p.y + p.vy * dt, -half, half);

      const val = landscape(p.x, p.y);
      if (val < p.bestVal) {
        p.bestVal = val;
        p.bestX = p.x;
        p.bestY = p.y;
      }
      if (val < state.globalBest.val) {
        state.globalBest = { x: p.x, y: p.y, val };
      }
    }

    state.particles.forEach((p, i) => {
      dummy.position.set(p.x, p.y, landscape(p.x, p.y) + 0.04);
      dummy.updateMatrix();
      swarmMesh.setMatrixAt(i, dummy.matrix);
    });
    swarmMesh.instanceMatrix.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
    state.swarmGeom.dispose();
    state.swarmMat.dispose();
  },
};
