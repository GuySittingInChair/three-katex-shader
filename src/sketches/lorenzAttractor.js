import * as THREE from 'three';

const POINTS = 3000;
const SIGMA = 10;
const BETA = 8 / 3;
const DT = 0.005;

function lorenzDerivative(s, rho) {
  return [
    SIGMA * (s[1] - s[0]),
    s[0] * (rho - s[2]) - s[1],
    s[0] * s[1] - BETA * s[2],
  ];
}

// One RK4 step of the Lorenz system.
function lorenzStep(s, dt, rho) {
  const k1 = lorenzDerivative(s, rho);
  const s2 = [s[0] + (dt / 2) * k1[0], s[1] + (dt / 2) * k1[1], s[2] + (dt / 2) * k1[2]];
  const k2 = lorenzDerivative(s2, rho);
  const s3 = [s[0] + (dt / 2) * k2[0], s[1] + (dt / 2) * k2[1], s[2] + (dt / 2) * k2[2]];
  const k3 = lorenzDerivative(s3, rho);
  const s4 = [s[0] + dt * k3[0], s[1] + dt * k3[1], s[2] + dt * k3[2]];
  const k4 = lorenzDerivative(s4, rho);
  return [
    s[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

// Maps raw Lorenz-space coordinates into a display-friendly, centered range.
function toDisplay(s, out, idx) {
  out[idx] = s[0] * 0.06;
  out[idx + 1] = s[1] * 0.06;
  out[idx + 2] = (s[2] - 25) * 0.06;
}

export default {
  name: 'Lorenz Attractor',
  description: 'The classic chaotic butterfly, traced live by RK4-integrated trajectory.',
  tags: ['chaos', 'ode', 'attractor'],
  category: 'Dynamical Systems',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: '\\dot x = \\sigma(y-x),\\quad \\dot y = x({{rho}} - z) - y,\\quad \\dot z = xy - \\beta z,\\quad \\sigma{=}10,\\ \\beta{=}\\tfrac83',

  params: {
    speed: { value: 12, min: 1, max: 60 },
    rho: { value: 28, min: 10, max: 40 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0, 4);

    let sim = [0.1, 0, 0];
    const positions = new Float32Array(POINTS * 3);
    // Pre-run the simulation so the trail starts full rather than growing
    // from a single point.
    for (let i = 0; i < POINTS; i++) {
      sim = lorenzStep(sim, DT, ctx.params.rho);
      toDisplay(sim, positions, i * 3);
    }

    const colors = new Float32Array(POINTS * 3);
    const dim = new THREE.Color(0x1a0a2e);
    const bright = new THREE.Color(0x8ef6ff);
    const tmp = new THREE.Color();
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      tmp.lerpColors(dim, bright, Math.pow(t, 1.5));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    ctx.scene.add(line);

    return { line, geometry, positions, sim };
  },

  update(ctx, state) {
    const steps = Math.round(ctx.params.speed);
    for (let i = 0; i < steps; i++) {
      state.sim = lorenzStep(state.sim, DT, ctx.params.rho);
      state.positions.copyWithin(0, 3);
      toDisplay(state.sim, state.positions, (POINTS - 1) * 3);
    }
    state.geometry.attributes.position.needsUpdate = true;
    state.line.rotation.y += ctx.delta * 0.05;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.line.material.dispose();
  },
};
