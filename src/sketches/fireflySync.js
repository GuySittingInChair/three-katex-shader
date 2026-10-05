import * as THREE from 'three';
import { TAU, phaseOf, smooth } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { caption, beat } from '../lib/bit.js';

// Fireflies in a meadow at dusk, learning to flash together: the Kuramoto
// model (1975). Each firefly i has a phase θᵢ and flashes as θᵢ passes 0.
// Left alone it flashes at its own natural rate ωᵢ; it also nudges itself
// toward the crowd:
//
//     dθᵢ/dt = ωᵢ + (K/N) Σⱼ sin(θⱼ − θᵢ) = ωᵢ + K r sin(ψ − θᵢ)
//
// where r e^{iψ} = (1/N) Σⱼ e^{iθⱼ} measures how together they are
// (r = 0: chaos, r = 1: every flash at once). With the ωᵢ spread as a
// Lorentzian of half-width γ around ω₀, Kuramoto solved it exactly (N → ∞):
//
//     r = 0 for K < K_c = 2γ,     r = √(1 − K_c/K) above it
//
// and a firefly locks to the crowd iff |ωᵢ − ω₀| ≤ K r; the rest keep
// drifting. Here N = 300, ω₀ = 2π × 0.7 Hz, γ = 0.25 rad/s, so K_c = 0.5,
// and the ωᵢ are the Lorentzian's 300 quantiles. Checked: holding K fixed
// for a minute, the simulated r matches √(1 − K_c/K) to 3 decimals
// (0.612 vs 0.612 at K = 0.8, 0.829 vs 0.829 at K = 1.6). Since K moves
// during the loop, the live r lags behind the formula a little: that's the
// swarm taking time to agree, not an error.
//
// Lorentzian tails are long, so a few fireflies have wild natural rates and
// never lock: they're the ones still strobing at full synchrony. Real
// fireflies do this: Photinus carolinus in the Great Smoky Mountains flash
// in sync every June.
//
// The one light source besides the sky is the fireflies: a point light at
// the swarm's centre with brightness equal to their total flash, so in sync
// the whole meadow pulses.
//
// Loop (48 s): K rises from 0.05 to 1.7 and falls back. The phases are
// simulated, not a closed-form loop.

const N = 300;
const OMEGA0 = TAU * 0.7;
const GAMMA = 0.25;
const KC = 2 * GAMMA;
const PERIOD = 48;
const K_MAX = 1.7;
const FLASH_WIDTH = 0.32;           // radians of phase the flash lasts

const OMEGA = Float64Array.from({ length: N }, (_, i) => OMEGA0 + GAMMA * Math.tan(Math.PI * ((i + 0.5) / N - 0.5)));
const flashOf = (theta) => {
  const x = ((theta % TAU) + TAU) % TAU;
  const d = Math.min(x, TAU - x) / FLASH_WIDTH;
  return Math.exp(-d * d);
};

const VERT = `
  attribute float aFlash;
  varying float vFlash;
  uniform float uScale;
  void main() {
    vFlash = aFlash;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uScale * (0.5 + 2.5 * aFlash) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  varying float vFlash;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float core = exp(-d * d * 22.0);
    float halo = exp(-d * d * 4.0) * 0.3;
    // Dim enough that the tone mapping keeps the colour instead of
    // bleaching it to white.
    gl_FragColor = vec4(vec3(0.55, 1.0, 0.12) * core * (0.04 + 1.6 * vFlash) + vec3(0.45, 0.9, 0.1) * halo * vFlash, 1.0);
  }
`;

export default {
  name: 'Firefly Sync',
  description:
    'Three hundred fireflies at dusk, each with its own flashing rhythm, slowly agreeing to flash together: the ' +
    'Kuramoto model. Above a critical coupling they synchronise, as Kuramoto worked out exactly, and the ' +
    'whole meadow pulses with their light. A few with wild rhythms never join in.',
  tags: ['biology', 'synchronization', 'kuramoto', 'oscillators', 'fireflies', 'realistic', 'humor'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const K = 0.05 + (K_MAX - 0.05) * smooth(0.5 - 0.5 * Math.cos(TAU * p));
    return {
      p,
      K,
      exactR: K > KC ? Math.sqrt(1 - KC / K) : 0,
      falling: p > 0.5 ? 1 : 0,
      // Filled in by update(): the simulation's numbers.
      r: 0,
      locked: 0,
    };
  },

  latex: (params, hl, m) => {
    const line =
      m.K < KC
        ? beat(m.falling, [[0, 'Every firefly for itself.'], [1, 'The band breaks up over creative differences.']])
        : m.r < 0.5
          ? 'A band is forming. Nobody agreed to this.'
          : `Synchrony. ${N - m.locked} at the edges are still freestyling.`;
    return (
      '\\begin{aligned}' +
      '\\dot\\theta_i &= \\omega_i + K r \\sin(\\psi - \\theta_i),\\quad re^{i\\psi} = \\tfrac1N\\textstyle\\sum_j e^{i\\theta_j} \\\\' +
      `K &= ${hl(m.K, 2)}\\ ${m.K < KC ? '<' : '>'}\\ K_c = 2\\gamma = ${KC} \\\\` +
      `r &= ${hl(m.r, 3)}\\ \\text{(fireflies)},\\quad \\sqrt{1 - K_c/K} = ${hl(m.exactR, 3)}\\ \\text{(Kuramoto)} \\\\` +
      `\\text{locked} &= \\#\\{i : |\\omega_i - \\omega_0| \\le K r\\} = ${hl(m.locked, 0)}\\ \\text{of } ${N} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.05;
    const env = createEnvironment(ctx, { preset: 'dusk', fov: 50, grassHeight: 0.3, grassRadius: 16, vignette: 0.5 });
    ctx.camera.position.set(0, 1.4, 11);
    ctx.controls?.target.set(0, 1.6, 0);
    if (ctx.controls) ctx.controls.maxPolarAngle = 1.55;
    ctx.controls?.update();

    // Each firefly: a home in a loose dome over the meadow and a slow drift.
    const homes = new Float32Array(3 * N);
    const drift = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      const r = 7 * Math.sqrt(Math.random());
      const a = TAU * Math.random();
      homes.set([r * Math.cos(a), 0.4 + 2.4 * Math.random() ** 1.5, r * Math.sin(a)], 3 * i);
      drift.set([TAU * Math.random(), 0.15 + 0.2 * Math.random(), TAU * Math.random()], 3 * i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    geo.setAttribute('aFlash', new THREE.BufferAttribute(new Float32Array(N), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const swarm = new THREE.Points(geo, mat);
    swarm.frustumCulled = false;
    ctx.scene.add(swarm);

    const glow = new THREE.PointLight(0xc8ff60, 0, 25, 1.2);
    glow.position.set(0, 2.2, 0);
    ctx.scene.add(glow);

    const theta = Float64Array.from({ length: N }, () => TAU * Math.random());
    return { env, swarm, geo, mat, glow, homes, drift, theta };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    const { theta } = state;

    // Kuramoto, in mean-field form, a few small steps per frame.
    const dt = Math.min(ctx.delta, 0.1) * (ctx.params.speed ?? 1);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    let r = 0;
    for (let s = 0; s < steps; s++) {
      let C = 0;
      let S = 0;
      for (let i = 0; i < N; i++) {
        C += Math.cos(theta[i]);
        S += Math.sin(theta[i]);
      }
      C /= N;
      S /= N;
      r = Math.hypot(C, S);
      const psi = Math.atan2(S, C);
      for (let i = 0; i < N; i++) theta[i] += h * (OMEGA[i] + m.K * r * Math.sin(psi - theta[i]));
    }
    m.r = r;
    let locked = 0;
    for (let i = 0; i < N; i++) if (Math.abs(OMEGA[i] - OMEGA0) <= m.K * r) locked++;
    m.locked = locked;

    // Positions and flashes.
    const pos = state.geo.attributes.position.array;
    const flash = state.geo.attributes.aFlash.array;
    const t = ctx.time;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const [a, w, b] = [state.drift[3 * i], state.drift[3 * i + 1], state.drift[3 * i + 2]];
      pos[3 * i] = state.homes[3 * i] + 0.6 * Math.sin(w * t + a);
      pos[3 * i + 1] = state.homes[3 * i + 1] + 0.25 * Math.sin(1.7 * w * t + b);
      pos[3 * i + 2] = state.homes[3 * i + 2] + 0.6 * Math.cos(0.8 * w * t + b);
      flash[i] = flashOf(theta[i]);
      total += flash[i];
    }
    state.geo.attributes.position.needsUpdate = true;
    state.geo.attributes.aFlash.needsUpdate = true;
    state.mat.uniforms.uScale.value = ctx.size.height * 0.06;
    state.glow.intensity = 90 * (total / N);
  },

  dispose(ctx, state) {
    state.env.dispose();
  },
};
