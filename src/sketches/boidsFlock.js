import * as THREE from 'three';

const COUNT = 120;
const BOUND = 1.5;
const UP = new THREE.Vector3(0, 1, 0);

function makeBoids() {
  const boids = [];
  for (let i = 0; i < COUNT; i++) {
    boids.push({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * BOUND * 2,
        (Math.random() - 0.5) * BOUND * 2,
        (Math.random() - 0.5) * BOUND * 2
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5),
        (Math.random() - 0.5),
        (Math.random() - 0.5)
      ),
    });
  }
  return boids;
}

export default {
  name: 'Boids Flock',
  description: 'Emergent flocking behavior from three simple local rules: separation, alignment, cohesion.',
  tags: ['emergence', 'flocking', 'agents'],
  category: 'Emergence',
  mode: '3d',
  controls: 'orbit',
  latex:
    '\\vec{v}_i \\mathrel{+}= w_s\\,\\vec{S}_i + w_a\\,\\vec{A}_i + w_c\\,\\vec{C}_i,\\quad \\vec{p}_i \\mathrel{+}= \\vec{v}_i\\,\\Delta t',

  params: {
    separation: { value: 1.5, min: 0, max: 3 },
    alignment: { value: 1.2, min: 0, max: 3 },
    cohesion: { value: 1.0, min: 0, max: 3 },
    speed: { value: 1.0, min: 0.2, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.6, 3.6);

    // Was 0.02 × 0.06 — at this camera distance that's under a pixel, which
    // is why the flock looked like it wasn't doing anything.
    const geometry = new THREE.ConeGeometry(0.05, 0.17, 6); // tip already points along +Y
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3));

    // InstancedMesh's built-in per-instance color (MeshBasicMaterial's
    // vertexColors + setColorAt) renders nothing at all on this three.js
    // version — a manual attribute + tiny ShaderMaterial sidesteps it.
    const material = new THREE.ShaderMaterial({
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
    const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
    mesh.frustumCulled = false;
    ctx.scene.add(mesh);

    const boids = makeBoids();

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const instanceColor = geometry.attributes.instanceColor;
    boids.forEach((b, i) => {
      dummy.position.copy(b.pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.55, 0.7, 0.6).toArray(instanceColor.array, i * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;

    return { mesh, boids, dummy, color, instanceColor };
  },

  update(ctx, state) {
    const { mesh, boids, dummy, color, instanceColor } = state;
    const dt = Math.min(ctx.delta, 0.05);
    const maxSpeed = 1.2 * ctx.params.speed;
    const maxForce = 0.06;
    const perception = 0.5;
    const perception2 = perception * perception;

    const steerS = new THREE.Vector3();
    const steerA = new THREE.Vector3();
    const steerC = new THREE.Vector3();
    const diff = new THREE.Vector3();

    for (let i = 0; i < boids.length; i++) {
      const bi = boids[i];
      steerS.set(0, 0, 0);
      steerA.set(0, 0, 0);
      steerC.set(0, 0, 0);
      let count = 0;

      for (let j = 0; j < boids.length; j++) {
        if (i === j) continue;
        const bj = boids[j];
        diff.subVectors(bi.pos, bj.pos);
        const d2 = diff.lengthSq();
        if (d2 < perception2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          steerS.addScaledVector(diff, 1 / d);
          steerA.add(bj.vel);
          steerC.add(bj.pos);
          count++;
        }
      }

      if (count > 0) {
        steerA.divideScalar(count).sub(bi.vel);
        steerC.divideScalar(count).sub(bi.pos);
      }
      if (steerS.lengthSq() > maxForce * maxForce) steerS.setLength(maxForce);
      if (steerA.lengthSq() > maxForce * maxForce) steerA.setLength(maxForce);
      if (steerC.lengthSq() > maxForce * maxForce) steerC.setLength(maxForce);

      bi.vel
        .addScaledVector(steerS, ctx.params.separation)
        .addScaledVector(steerA, ctx.params.alignment)
        .addScaledVector(steerC, ctx.params.cohesion);

      // Soft boundary steering back toward center.
      const edge = BOUND;
      ['x', 'y', 'z'].forEach((axis) => {
        if (bi.pos[axis] > edge) bi.vel[axis] -= (bi.pos[axis] - edge) * 0.05;
        if (bi.pos[axis] < -edge) bi.vel[axis] -= (bi.pos[axis] + edge) * 0.05;
      });

      if (bi.vel.lengthSq() > maxSpeed * maxSpeed) bi.vel.setLength(maxSpeed);
      if (bi.vel.lengthSq() < 0.0001) bi.vel.set(0.1, 0, 0);

      bi.pos.addScaledVector(bi.vel, dt);
    }

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      dummy.position.copy(b.pos);
      const dir = b.vel.clone().normalize();
      dummy.quaternion.setFromUnitVectors(UP, dir);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const speed = b.vel.length() / maxSpeed;
      color.setHSL(0.6 - speed * 0.35, 0.75, 0.55).toArray(instanceColor.array, i * 3);
    }
    mesh.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.mesh.material.dispose();
  },
};
