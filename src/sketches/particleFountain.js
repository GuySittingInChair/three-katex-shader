import * as THREE from 'three';

const COUNT = 500;
const GRAVITY = 1.6;
const FLOOR_Y = -0.05;

export default {
  name: 'Particle Fountain',
  description: 'A gravity-fed particle emitter: ballistic motion, per-particle lifespan, additive glow.',
  tags: ['particles', 'physics'],
  category: 'Particles',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '\\mathbf{x}(t) = \\mathbf{x}_0 + \\mathbf{v}_0 t - \\tfrac{1}{2} g t^2 \\hat{y}',

  params: {
    emitSpeed: { value: 2.0, min: 0.5, max: 4 },
    spread: { value: 0.6, min: 0, max: 2 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 1.0, 4.5);
    ctx.camera.lookAt(0, 0.8, 0);

    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const ages = new Float32Array(COUNT);
    const lifespans = new Float32Array(COUNT);

    function respawn(i) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

      const spread = ctx.params.spread;
      const speed = ctx.params.emitSpeed;
      velocities[i * 3 + 0] = (Math.random() - 0.5) * spread;
      velocities[i * 3 + 1] = speed * (0.8 + Math.random() * 0.4);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * spread;

      ages[i] = 0;
      lifespans[i] = 1.5 + Math.random() * 1.0;
    }

    for (let i = 0; i < COUNT; i++) {
      respawn(i);
      ages[i] = Math.random() * lifespans[i];
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.9;
      colors[i * 3 + 2] = 0.6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    ctx.scene.add(points);

    return { points, positions, colors, velocities, ages, lifespans, respawn };
  },

  update(ctx, state) {
    const { points, positions, colors, velocities, ages, lifespans, respawn } = state;

    for (let i = 0; i < COUNT; i++) {
      ages[i] += ctx.delta;

      velocities[i * 3 + 1] -= GRAVITY * ctx.delta;

      positions[i * 3 + 0] += velocities[i * 3 + 0] * ctx.delta;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * ctx.delta;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * ctx.delta;

      const lifeFrac = Math.min(ages[i] / lifespans[i], 1);
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.9 * (1 - lifeFrac) + 0.25 * lifeFrac;
      colors[i * 3 + 2] = 0.6 * (1 - lifeFrac);

      if (ages[i] >= lifespans[i] || positions[i * 3 + 1] < FLOOR_Y) {
        respawn(i);
      }
    }

    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
  },

  dispose(ctx, state) {
    state.points.geometry.dispose();
    state.points.material.dispose();
  },
};
