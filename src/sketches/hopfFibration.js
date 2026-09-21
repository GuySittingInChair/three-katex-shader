import * as THREE from 'three';
import { TAU, phaseOf, smooth, clamp01, lerp } from '../lib/motion.js';

// The Hopf fibration, with its fibers *migrating to a configuration we can
// name*: the Clifford torus.
//
// The fiber over a point of S² at colatitude θ, longitude φ is the great
// circle of S³ ⊂ ℂ²
//
//     q(τ) = ( cos(θ/2) e^{i(τ + φ/2)},  sin(θ/2) e^{i(τ − φ/2)} ),
//
// drawn here by stereographic projection from q₀ = 1. All fibers over one
// circle of latitude θ⋆ sweep out a torus |z₁| = cos(θ⋆/2), |z₂| = sin(θ⋆/2);
// at θ⋆ = π/2 that is the Clifford torus |z₁| = |z₂|, and every pair of fibers
// links exactly once.
//
// The loop (period 28 s of motion), each fiber i moving along its own meridian:
//
//   0    – ¼   the fibers leave a Fibonacci spread over S² and gather into R
//              rings of latitudes θ⋆ + Δ(r − (R−1)/2)        (s: 0 → 1)
//   ¼    – ¾   the rings, holding shape, sweep in latitude    θ⋆(t) = π/2 + A sin 2π·x
//              — the nested tori swell and shrink about the Clifford torus
//   ¾    – 1   they disperse back to the Fibonacci spread     (s: 1 → 0)
//
// θ_i(t) = (1 − s) θ_i^Fib + s (θ⋆ + Δ (r_i − (R−1)/2)),   same blend for φ_i,
// so each frame is an exact set of Hopf fibers, and the animation is nothing
// but the base points moving on S².
//
// Fibers over latitudes near 0 project to enormous circles (the projection
// pole lies on the fiber over θ = 0): measured max |P| is 8.9 at θ = 0.45 but
// 5.3 at 0.75 and 2.4 at π/2, so θ is kept above 0.75 to stay in frame.

const PERIOD = 28;
const MAX_FIBERS = 128;
const SEGMENTS = 180;
const RINGS = 5;
const RING_SPACING = 0.2;
const SWEEP_AMPLITUDE = 0.45;
const THETA_MIN = 0.75;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const VERT = `
  uniform vec2 uBase[${MAX_FIBERS}];     // (theta, phi) of each fiber's base point on S^2
  uniform float uWidth;
  attribute float aFiber;
  attribute float aS;                    // 0..1 around the fiber
  attribute float aSide;                 // -1 / +1 across the ribbon
  varying float vSide;
  varying float vTheta;

  vec3 fiberPoint(float th, float ph, float s) {
    float t = s * 6.28318530718;
    float c = cos(0.5 * th), sn = sin(0.5 * th);
    vec4 q = vec4(c * cos(t + 0.5 * ph), c * sin(t + 0.5 * ph),
                  sn * cos(t - 0.5 * ph), sn * sin(t - 0.5 * ph));
    return q.yzw / max(1.0 - q.x, 1e-3);
  }

  void main() {
    vec2 b = uBase[int(aFiber + 0.5)];
    vec3 P = fiberPoint(b.x, b.y, aS);
    vec3 T = normalize(fiberPoint(b.x, b.y, aS + 0.002) - P);

    // Camera-facing ribbon: offset in view space, perpendicular to the tangent.
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vec3 Tv = normalize(mat3(modelViewMatrix) * T);
    vec3 sv = cross(Tv, vec3(0.0, 0.0, 1.0));
    vec3 side = sv / max(length(sv), 1e-4);
    mv.xyz += side * aSide * uWidth;

    vSide = aSide;
    vTheta = b.x;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  varying float vSide;
  varying float vTheta;
  void main() {
    // Fake a lit tube across the ribbon.
    float round = sqrt(max(1.0 - vSide * vSide, 0.0));
    // Colour = where the fiber's base point sits on S^2 (its colatitude).
    float h = vTheta / 3.14159265;
    vec3 col = 0.5 + 0.5 * cos(6.2831 * (h * 0.85 + vec3(0.0, 0.33, 0.67)));
    col = mix(vec3(0.75), col, 0.75);
    gl_FragColor = vec4(col * (0.25 + 0.75 * round), 1.0);
  }
`;

function fibonacciBase(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    out.push({ theta: Math.acos(y), phi: (GOLDEN_ANGLE * i) % TAU });
  }
  return out;
}

// Shortest signed angle from a to b.
const wrapDelta = (a, b) => ((((b - a) % TAU) + 3 * Math.PI) % TAU) - Math.PI;

export default {
  name: 'Hopf Fibration',
  description:
    'S³ fibers, stereographically projected. The fibers over a Fibonacci spread of S² migrate along their ' +
    'meridians into rings of latitude — tori of Villarceau circles, the middle one the Clifford torus ' +
    '|z₁| = |z₂| where every pair of fibers links once — then the rings sweep in latitude about it and disperse ' +
    'again. θ⋆(t) and the blend s(t) are closed-form and shown live; colour is the fiber’s latitude on S².',
  tags: ['topology', 'geometry', 'homotopy'],
  category: 'Topology',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const s = p < 0.25 ? smooth(p / 0.25) : p > 0.75 ? smooth((1 - p) / 0.25) : 1;
    const x = clamp01((p - 0.25) / 0.5);
    return {
      s,
      theta: Math.PI / 2 + SWEEP_AMPLITUDE * Math.sin(TAU * x),
    };
  },

  latex: (p, hl, m) => {
    const clifford = m.s > 0.98 && Math.abs(m.theta - Math.PI / 2) < 0.03 ? '\\ \\text{(Clifford torus)}' : '';
    return (
      '\\begin{aligned}' +
      'q(\\tau) &= \\big(\\cos\\tfrac\\theta2\\,e^{i(\\tau+\\phi/2)},\\ \\sin\\tfrac\\theta2\\,e^{i(\\tau-\\phi/2)}\\big)\\in S^3 \\\\' +
      `\\theta_i &= (1-s)\\,\\theta_i^{\\mathrm{Fib}} + s\\,\\big(\\theta_\\star + ${RING_SPACING}\\,(r_i-\\tfrac{${RINGS - 1}}{2})\\big),\\quad s = ${hl(m.s, 2)} \\\\` +
      `\\theta_\\star &= \\tfrac\\pi2 + ${SWEEP_AMPLITUDE}\\sin(\\cdot) = ${hl(m.theta, 2)}\\ \\text{rad}${clifford}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 4 },
    fiberCount: { value: 60, min: 15, max: MAX_FIBERS, step: 1, rebuild: true },
    width: { value: 0.06, min: 0.015, max: 0.15 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.5, 8.5);
    const count = Math.round(ctx.params.fiberCount);

    // One ribbon per fiber: (SEGMENTS + 1) rungs of 2 vertices.
    const perFiber = (SEGMENTS + 1) * 2;
    const fiber = new Float32Array(count * perFiber);
    const s = new Float32Array(count * perFiber);
    const side = new Float32Array(count * perFiber);
    const position = new Float32Array(count * perFiber * 3); // unused by the shader; three needs it to size the draw
    const indices = [];
    for (let f = 0; f < count; f++) {
      for (let j = 0; j <= SEGMENTS; j++) {
        for (let k = 0; k < 2; k++) {
          const v = f * perFiber + j * 2 + k;
          fiber[v] = f;
          s[v] = j / SEGMENTS;
          side[v] = k === 0 ? -1 : 1;
        }
        if (j < SEGMENTS) {
          const a = f * perFiber + j * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aFiber', new THREE.BufferAttribute(fiber, 1));
    geometry.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geometry.setIndex(indices);

    const base = Array.from({ length: MAX_FIBERS }, () => new THREE.Vector2(Math.PI / 2, 0));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: { uBase: { value: base }, uWidth: { value: ctx.params.width } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // vertices are placed by the shader
    ctx.scene.add(mesh);

    return { mesh, material, base, count, fib: fibonacciBase(count) };
  },

  update(ctx, state) {
    const { s, theta } = ctx.motion;
    const { count, fib, base } = state;
    const perRing = Math.ceil(count / RINGS);

    for (let i = 0; i < count; i++) {
      const r = i % RINGS;
      const col = Math.floor(i / RINGS);
      const thetaRing = theta + RING_SPACING * (r - (RINGS - 1) / 2);
      const phiRing = (TAU * (col + 0.5 * r)) / perRing;

      // Migrate along the meridian (θ) and the shorter way round (φ); never let a
      // fiber's latitude reach the pole-lines, whose projections run off to infinity.
      const th = Math.min(Math.PI - 0.05, Math.max(THETA_MIN, lerp(fib[i].theta, thetaRing, s)));
      const ph = fib[i].phi + s * wrapDelta(fib[i].phi, phiRing);
      base[i].set(th, ph);
    }
    state.material.uniforms.uWidth.value = ctx.params.width;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
