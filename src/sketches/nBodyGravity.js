import * as THREE from 'three';

const COUNT = 300;
const SOFTENING2 = 0.015;
const CENTRAL_MASS = 6.0;
// A gentle extra pull that only switches on past this radius — without it,
// gradual N-body "evaporation" (real, but not a good look here) slowly
// ejects particles to infinity, so a wilder chaos setting would empty the
// cloud out over a couple of minutes instead of staying a sustained swirl.
const BOUNDARY = 5;
const WALL_STRENGTH = 0.35;

// "Transform" reskins a slice of the plain point cloud as small solid
// shapes — same physics, just individually rendered via one InstancedMesh
// per shape so two same-shape ones can be told apart and matched up.
const SHAPE_DEFS = [
  { make: () => new THREE.SphereGeometry(0.055, 10, 8), color: 0xff5252 },
  { make: () => new THREE.BoxGeometry(0.09, 0.09, 0.09), color: 0x40c8ff },
  { make: () => new THREE.TetrahedronGeometry(0.075), color: 0xffe066 },
  { make: () => new THREE.OctahedronGeometry(0.07), color: 0x7cff6b },
  { make: () => new THREE.ConeGeometry(0.06, 0.11, 8), color: 0xd06bff },
  { make: () => new THREE.TorusGeometry(0.055, 0.022, 6, 12), color: 0xff9d40 },
];
const MAX_SHAPES = SHAPE_DEFS.length;
const TRANSFORM_FRACTION = 0.1;
const COLLISION_RADIUS = 0.16;
const DYING_DURATION = 0.18; // quick shrink-out when two matching shapes touch

function initParticles() {
  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 0.4 + Math.random() * 1.3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.4; // flatten into a disky cloud
    const z = r * Math.cos(phi);

    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;

    // Tangential velocity (roughly perpendicular to radius, in the xz plane) for orbit-like swirl.
    const speed = Math.sqrt(CENTRAL_MASS / (r + 0.3)) * 0.35;
    vel[i * 3] = -z * speed / r;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    vel[i * 3 + 2] = x * speed / r;
  }
  return { pos, vel };
}

export default {
  name: 'N-Body Gravity',
  description:
    'A softened-gravity particle cloud orbiting under mutual Newtonian attraction — turn up "chaos" ' +
    '(by hand, by voice, or by making noise) to loosen the central pull, or transform a slice of it ' +
    'into matchable shapes that vanish when two of the same kind collide.',
  tags: ['physics', 'gravity', 'particles', 'chaos'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',
  latex: '\\vec{a}_i = G\\sum_{j\\ne i} \\dfrac{m_j\\,(\\vec{r}_j - \\vec{r}_i)}{(|\\vec{r}_j-\\vec{r}_i|^2 + \\epsilon^2)^{3/2}}',

  params: {
    gravity: { value: 1.2, min: 0.1, max: 5 },
    speed: { value: 1.0, min: 0.1, max: 3 },
    // Dials how bound vs. wild the system is — see update() for what it
    // actually changes. Also driven live by ctx.audio.bass, so it rises on
    // its own with the mic on and settles back down in quiet stretches.
    chaos: { value: 0.15, min: 0, max: 1 },
    // How many distinct shape "species" the transform action can assign —
    // only same-species pairs annihilate each other on contact.
    shapeTypes: { value: 3, min: 1, max: MAX_SHAPES, step: 1 },
  },

  // Voice commands and the Params panel both call these by key — see
  // core/voiceControl.js (phrase matching) and ui/paramsPanel.js (buttons).
  actions: {
    transform: {
      label: `Transform ${Math.round(TRANSFORM_FRACTION * 100)}%`,
      run(ctx, state) {
        const n = Math.max(1, Math.round(COUNT * TRANSFORM_FRACTION));
        const candidates = [];
        for (let i = 0; i < COUNT; i++) {
          if (state.alive[i] && state.shapeType[i] === -1) candidates.push(i);
        }
        const typeCount = Math.max(1, Math.min(Math.round(ctx.params.shapeTypes), MAX_SHAPES));
        for (let k = 0; k < n && candidates.length; k++) {
          const pick = Math.floor(Math.random() * candidates.length);
          const i = candidates.splice(pick, 1)[0];
          state.shapeType[i] = Math.floor(Math.random() * typeCount);
        }
      },
    },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 1.2, 4.5);

    const { pos, vel } = initParticles();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const colors = new Float32Array(COUNT * 3);
    const color = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      color.setHSL(0.55, 0.8, 0.6);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    ctx.scene.add(points);

    // One InstancedMesh per shape "species", sized for the worst case
    // (every particle transformed into that one shape) — cheap to over-
    // allocate at this scale, and it means transform() never has to touch
    // the GPU-side buffers, only how many instances of each are drawn.
    const shapeMeshes = SHAPE_DEFS.map(({ make, color: hex }) => {
      const mesh = new THREE.InstancedMesh(
        make(),
        new THREE.MeshBasicMaterial({ color: hex }),
        COUNT
      );
      mesh.count = 0;
      ctx.scene.add(mesh);
      return mesh;
    });

    return {
      points,
      geometry,
      material,
      shapeMeshes,
      dummy: new THREE.Object3D(),
      pos,
      vel,
      acc: new Float32Array(COUNT * 3),
      color,
      audioChaos: 0, // smoothed, sound-driven top-up on top of the chaos param
      shapeType: new Int8Array(COUNT).fill(-1), // -1 = still a plain point
      alive: new Uint8Array(COUNT).fill(1),
      dying: new Float32Array(COUNT), // >0 while shrinking out after a match
    };
  },

  update(ctx, state) {
    const { pos, vel, acc, geometry, color, alive, shapeType, dying } = state;
    const dt = Math.min(ctx.delta, 0.033) * ctx.params.speed;
    const G = ctx.params.gravity;

    // Sound tops up the chaos dial on its own — bass hits push it up fast,
    // it decays back down in quiet — on top of whatever the slider/voice
    // command set. With the mic off ctx.audio.bass just stays 0.
    const follow = Math.min(ctx.delta * 4, 1);
    state.audioChaos += (ctx.audio.bass * 1.1 - state.audioChaos) * follow;
    state.audioChaos = Math.min(1, Math.max(0, state.audioChaos));
    const chaos = Math.min(1.4, ctx.params.chaos + state.audioChaos);

    // What "chaos" actually loosens: less central dominance (particles
    // aren't held in a tidy disk), stronger mutual coupling (real N-body
    // dynamics instead of near-independent orbits), and less softening
    // (close encounters can actually sling things instead of being
    // smoothed away) — plus a bit of random jitter as raw energy input.
    // Softening keeps a floor so a close pass slings rather than divides
    // by ~zero.
    const centralMass = CENTRAL_MASS * (1 - 0.7 * Math.min(chaos, 1));
    const mutualMass = 0.02 * (1 + 6 * chaos);
    const softening2 = Math.max(SOFTENING2 * (1 - 0.85 * Math.min(chaos, 1)), SOFTENING2 * 0.15);
    const kick = chaos * 0.6;

    acc.fill(0);

    // Central attractor pulling everything toward the origin (dead
    // particles are frozen where they died and skip physics entirely).
    for (let i = 0; i < COUNT; i++) {
      if (!alive[i]) continue;
      const ix = i * 3;
      const dx = -pos[ix];
      const dy = -pos[ix + 1];
      const dz = -pos[ix + 2];
      const d2 = dx * dx + dy * dy + dz * dz + softening2;
      const invD3 = G * centralMass / (d2 * Math.sqrt(d2));
      acc[ix] += dx * invD3;
      acc[ix + 1] += dy * invD3;
      acc[ix + 2] += dz * invD3;

      // Soft wall: negligible inside BOUNDARY, grows quadratically past it,
      // reusing dx/dy/dz (already the exact, unsoftened vector to center).
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > BOUNDARY) {
        const pull = (r - BOUNDARY) * (r - BOUNDARY) * WALL_STRENGTH;
        acc[ix] += (dx / r) * pull;
        acc[ix + 1] += (dy / r) * pull;
        acc[ix + 2] += (dz / r) * pull;
      }
    }

    // Mutual pairwise attraction (unit mass per particle) — and, piggy-
    // backing on the same pair loop, the shape-matching collision check:
    // two ALIVE particles of the same (non -1) shape type within
    // COLLISION_RADIUS of each other both die.
    const collisionR2 = COLLISION_RADIUS * COLLISION_RADIUS;
    for (let i = 0; i < COUNT; i++) {
      if (!alive[i]) continue;
      const ix = i * 3;
      let ax = 0, ay = 0, az = 0;
      for (let j = i + 1; j < COUNT; j++) {
        if (!alive[j]) continue;
        const jx = j * 3;
        const dx = pos[jx] - pos[ix];
        const dy = pos[jx + 1] - pos[ix + 1];
        const dz = pos[jx + 2] - pos[ix + 2];
        const rawD2 = dx * dx + dy * dy + dz * dz;

        if (shapeType[i] !== -1 && shapeType[i] === shapeType[j] && rawD2 < collisionR2) {
          alive[i] = 0;
          alive[j] = 0;
          dying[i] = DYING_DURATION;
          dying[j] = DYING_DURATION;
          continue; // no force between two particles that just annihilated
        }

        const d2 = rawD2 + softening2;
        const invD3 = G * mutualMass / (d2 * Math.sqrt(d2));
        const fx = dx * invD3, fy = dy * invD3, fz = dz * invD3;
        ax += fx; ay += fy; az += fz;
        acc[jx] -= fx; acc[jx + 1] -= fy; acc[jx + 2] -= fz;
      }
      acc[ix] += ax; acc[ix + 1] += ay; acc[ix + 2] += az;
    }

    for (let i = 0; i < COUNT; i++) {
      if (!alive[i]) continue; // frozen in place while it shrinks out
      const ix = i * 3;
      vel[ix] += acc[ix] * dt;
      vel[ix + 1] += acc[ix + 1] * dt;
      vel[ix + 2] += acc[ix + 2] * dt;
      if (kick > 0) {
        // Raw energy injection, not just a looser force law — reads as
        // "boiling" rather than just "orbiting faster".
        vel[ix] += (Math.random() - 0.5) * kick * dt;
        vel[ix + 1] += (Math.random() - 0.5) * kick * dt;
        vel[ix + 2] += (Math.random() - 0.5) * kick * dt;
      }
      pos[ix] += vel[ix] * dt;
      pos[ix + 1] += vel[ix + 1] * dt;
      pos[ix + 2] += vel[ix + 2] * dt;
    }

    // Final pass: point colors (velocity-tinted, or hidden black for
    // anything that's ever been shaped — additive blending makes black
    // invisible so it never double-renders alongside its mesh instance),
    // dying-timer countdown, and bucketing into one instance list per
    // shape species for the render below.
    const colorAttr = geometry.attributes.color;
    const groups = Array.from({ length: MAX_SHAPES }, () => []);
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      if (shapeType[i] === -1) {
        const speed = Math.sqrt(vel[ix] * vel[ix] + vel[ix + 1] * vel[ix + 1] + vel[ix + 2] * vel[ix + 2]);
        color.setHSL(0.62 - Math.min(speed * 0.4, 0.5), 0.85, 0.6);
        colorAttr.array[ix] = color.r;
        colorAttr.array[ix + 1] = color.g;
        colorAttr.array[ix + 2] = color.b;
        continue;
      }

      colorAttr.array[ix] = 0;
      colorAttr.array[ix + 1] = 0;
      colorAttr.array[ix + 2] = 0;

      if (!alive[i]) {
        if (dying[i] <= 0) continue; // fully gone — not drawn as anything
        dying[i] -= ctx.delta;
      }
      groups[shapeType[i]].push(i);
    }
    geometry.attributes.position.needsUpdate = true;
    colorAttr.needsUpdate = true;

    const { dummy, shapeMeshes } = state;
    for (let g = 0; g < MAX_SHAPES; g++) {
      const mesh = shapeMeshes[g];
      const members = groups[g];
      mesh.count = members.length;
      for (let slot = 0; slot < members.length; slot++) {
        const i = members[slot];
        const ix = i * 3;
        const scale = alive[i] ? 1 : Math.max(0, dying[i] / DYING_DURATION);
        dummy.position.set(pos[ix], pos[ix + 1], pos[ix + 2]);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(slot, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
    for (const mesh of state.shapeMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  },
};
