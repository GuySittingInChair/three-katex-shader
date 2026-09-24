import * as THREE from 'three';

// Quantum Abyss Neural, rebuilt so it has no seams and moves.
//
// The original (radian-628-quantum-neural-network) shows a hard line through the
// middle and hard edges along its wedges. Both come from angular maths that is
// not single-valued across atan's branch cut (the negative x-axis):
//
//   1. non-integer angular factors, e.g. cos(1.7·arms·θ) or θ·(arms + 2 + n·2):
//      one lap around the origin does not return to the same value, so the
//      field jumps at θ = ±π;
//   2. the kaleidoscope fold mixed two *sawtooth* angles (mod(θ + π/N, 2π/N) − π/N),
//      and a sawtooth jumps at every wedge edge — blending two of them leaves a
//      hard cut along each wedge boundary.
//
// Here every angular factor is an integer, and the fold is a triangle wave
//
//   fold_N(θ) = | mod(θ + π/N, 2π/N) − π/N |        (mirror folds, continuous)
//
// with fractional sector counts crossfaded between ⌊s⌋ and ⌊s⌋ + 1. Neural
// modulation moves into phase offsets instead of multipliers.
//
// Motion: the origin of the whole field rides a closed cubic Bézier loop
// (Catmull–Rom anchors -> Bézier handles, so the loop is C¹), sampled by arc
// length so it glides at a steady pace. The loop is fully parametric — number
// of anchors, star winding, irregularity, tension, stretch, rotation, offset,
// breathing, ease, direction — see the pathXxx params. The frame also slowly
// spins. `showPath` draws the loop and the centre.
//
// Realms: `realm` runs from −1 (hell) through 0 (the abyss) to +1 (heaven), and the
// buttons jump straight to a preset. What makes each read as itself is not just
// colour, so the realm changes four things together:
//   destination  the vanishing point is the goal — a red-black pit that throbs, or a
//                light at the end of the tunnel — via depth fog toward the centre
//   geometry     hell is turbulent (more sphere inversion and warp, fewer arms,
//                camera shake, faster spin); heaven is serene and symmetric (less
//                inversion, more arms). Inversion is the noise-vs-calm dial.
//   light        god rays and slow motes in heaven; lava veins and rising embers in hell
//   grade        a fire ramp with crushed blacks vs a lifted, pearly, gold-white ramp
//
// 3D trip: the field is log-polar, so flying forward is a zoom about the vanishing
// point. Each pixel's distance from it is remapped by a power (`tunnel`, the
// perspective), and `layers` copies of the field at staggered zoom depths are
// crossfaded with sin² weights (which sum to a constant) so the flight never pops.

const N_NEURONS = 12;
const PATH_MAX_POINTS = 9; // most anchors a loop can have
const PATH_TABLE = 160; // samples per piece for the arc-length table (fine enough that its facets never show as kinks)
const PATH_UNIFORM = 64; // points sent to the shader for the overlay
const PATH_LAP = 18; // seconds per lap at pathSpeed 1
const TWO_PI = Math.PI * 2;
const FLIGHT_DEPTH = 1.8; // ln of the zoom one layer covers between being born far away and leaving near
const CURVE_SPAN = 6; // table points either side used to estimate the loop's curvature
const MIN_PACE = 0.15; // slowest the centre is ever made to crawl (a cusp would otherwise stop it)

// Anchor k sits at angle 2π·k·winding/points and radius 1 − irregularity·PATTERN[k].
// The pattern is fixed, so a given slider setting is always the same shape; at the
// defaults (5 points, irregularity 0.3) the radii are 1, .85, .95, .88, 1 — a gently
// irregular pentagon whose tightest corner is ~0.24 x pathRadius. (An earlier layout
// with one anchor far out on a side had a hairpin with turning radius ~0.01 and the
// centre visibly whipped round it: raising irregularity, or lowering pathTension,
// or winding a star, trades that gentleness for a livelier path.)
const PATH_PATTERN = [0, 0.5, 0.17, 0.4, 0, 0.6, 0.25, 0.45, 0.1];

// B(s) for the cubic with control points p0..p3 (Bernstein form).
function cubic(p0, p1, p2, p3, s, out) {
  const u = 1 - s;
  const b0 = u * u * u;
  const b1 = 3 * u * u * s;
  const b2 = 3 * u * s * s;
  const b3 = s * s * s;
  out[0] = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0];
  out[1] = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1];
}

// Fills `table` (x,y pairs) with the closed loop through the first n anchors, one
// Catmull–Rom piece converted to a cubic Bézier per anchor pair:
//   P1 = A[i] + τ(A[i+1] − A[i−1])/6,   P2 = A[i+1] − τ(A[i+2] − A[i])/6
// τ = tension: 1 is the standard Catmull–Rom curve, lower pulls the handles in
// toward straight lines between anchors, higher lets them overshoot into loops.
function sampleLoop(pts, n, tension, table) {
  const h = tension / 6;
  const p1 = [0, 0];
  const p2 = [0, 0];
  const out = [0, 0];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const d = pts[(i + 2) % n];
    p1[0] = b[0] + (c[0] - a[0]) * h;
    p1[1] = b[1] + (c[1] - a[1]) * h;
    p2[0] = c[0] - (d[0] - b[0]) * h;
    p2[1] = c[1] - (d[1] - b[1]) * h;
    for (let j = 0; j < PATH_TABLE; j++) {
      cubic(b, p1, p2, c, j / PATH_TABLE, out);
      table[k++] = out[0];
      table[k++] = out[1];
    }
  }
}

// Point a fraction f (any real; 0..1 is one lap) of the way round the sampled loop
// of `count` table points, by arc length.
function pointAlong(table, cumulative, count, f, out) {
  const target = (f - Math.floor(f)) * cumulative[count];
  let lo = 0;
  let hi = count;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = cumulative[lo + 1] - cumulative[lo] || 1;
  const w = (target - cumulative[lo]) / span;
  const a = lo * 2;
  const b = ((lo + 1) % count) * 2;
  out[0] = table[a] + (table[b] - table[a]) * w;
  out[1] = table[a + 1] + (table[b + 1] - table[a + 1]) * w;
}

// The loop's anchors for the current path params, in uv units, written into `out`.
// `breath` and `turn` are accumulated phases (see update). Returns the anchor count.
function buildAnchors(p, breath, turn, out) {
  const n = Math.round(p.pathPoints);
  const winding = Math.min(Math.round(p.pathWinding), Math.max(1, (n - 1) >> 1)); // keeps neighbours distinct
  const sx = Math.sqrt(p.pathStretch);
  const sy = 1 / sx; // stretch keeps the loop's area
  const angle = p.pathRotation + turn;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let k = 0; k < n; k++) {
    const theta = (TWO_PI * k * winding) / n;
    const r = 1 - p.pathIrregularity * PATH_PATTERN[k];
    // anchors drift a little so the loop never repeats exactly
    const x = (r * Math.cos(theta) + p.pathBreath * Math.sin(breath * 0.11 + k * 1.7)) * sx;
    const y = (r * Math.sin(theta) + p.pathBreath * Math.cos(breath * 0.13 + k * 2.3)) * sy;
    out[k][0] = (x * ca - y * sa) * p.pathRadius + p.pathOffsetX;
    out[k][1] = (x * sa + y * ca) * p.pathRadius + p.pathOffsetY;
  }
  return n;
}

// A small recurrent network whose state (12 numbers) steers the field.
function makeNetwork() {
  const N = N_NEURONS;
  const weights = new Float32Array(N * N);
  const inputWeights = new Float32Array(N * 8);
  const bias = new Float32Array(N);
  let seed = 0x51a7e;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296; // one line: a bare `return` + newline would return undefined
  }
  for (let i = 0; i < weights.length; i++) weights[i] = (rand() * 2 - 1) * 0.42;
  for (let i = 0; i < inputWeights.length; i++) inputWeights[i] = (rand() * 2 - 1) * 0.65;
  for (let i = 0; i < N; i++) bias[i] = (rand() * 2 - 1) * 0.08;
  return { N, weights, inputWeights, bias, state: new Float32Array(N), next: new Float32Array(N) };
}

function stepNetwork(net, params, time, out) {
  const { N } = net;
  const inputs = new Float32Array(8);
  inputs[0] = Math.sin(time * 0.37);
  inputs[1] = Math.sin(time * 1.13);
  inputs[2] = Math.tanh(params.baseFreq / 4);
  inputs[3] = Math.tanh(params.warpAmt * 2);
  inputs[4] = Math.tanh(params.iterations / 16);
  inputs[5] = Math.sin(params.arms * 0.73);
  inputs[6] = Math.tanh(params.nonlinear);
  let activity = 0;
  for (let i = 0; i < N; i++) activity += Math.abs(net.state[i]);
  inputs[7] = Math.tanh(activity / N);

  const { neuralMemory: memory, neuralChaos: chaos, neuralMutation: mutation } = params;
  for (let i = 0; i < N; i++) {
    let sum = net.bias[i];
    for (let j = 0; j < 8; j++) sum += net.inputWeights[i * 8 + j] * inputs[j];
    for (let j = 0; j < N; j++) sum += net.weights[i * N + j] * net.state[j];
    sum *= 1 + chaos * 0.12 * Math.sin(time * 0.31 + i * 1.73);
    net.next[i] = Math.tanh(sum);
  }
  for (let i = 0; i < N; i++) net.state[i] = net.state[i] * memory + net.next[i] * (1 - memory);

  // Micro-mutation: not training, just a slow drift through nearby regimes.
  if (mutation > 0) {
    for (let i = 0; i < net.weights.length; i++) {
      net.weights[i] += Math.sin(time * 0.017 + i * 12.9898) * 0.00001 * mutation;
    }
  }
  for (let i = 0; i < N; i++) out[i] = net.state[i];
}

const PARAMS = {
  // --- motion ---
  speed: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
  spin: { value: 0.06, min: -0.5, max: 0.5, step: 0.005 },
  showPath: { value: 0.0, min: 0.0, max: 1.0, step: 1.0 },

  // --- realm: hell <-> heaven (the buttons set these for you) ---
  realm: { value: 0.0, min: -1.0, max: 1.0, step: 0.01 }, // -1 hell · 0 the abyss · +1 heaven
  realmStrength: { value: 1.0, min: 0.0, max: 1.0, step: 0.01 }, // how much of the realm's look and feel is applied
  realmChaos: { value: 1.0, min: 0.0, max: 1.0, step: 0.01 }, // …how much it reshapes the fractal itself: turbulent hell, serene heaven
  glowRays: { value: 1.0, min: 0.0, max: 2.0, step: 0.01 }, // heaven: god rays and halo · hell: lava veins
  embers: { value: 1.0, min: 0.0, max: 2.0, step: 0.01 }, // sparks rising in hell, slow motes of light in heaven
  heat: { value: 1.0, min: 0.0, max: 2.0, step: 0.01 }, // heat shimmer (hell) / drifting haze (heaven)

  // --- 3D trip ---
  flightSpeed: { value: 0.2, min: -1.5, max: 1.5, step: 0.01 }, // fly toward the vanishing point (zooms per second); negative = backwards
  tunnel: { value: 1.0, min: 0.5, max: 1.6, step: 0.01 }, // perspective: <1 pinches detail toward the centre, >1 flattens
  layers: { value: 2.0, min: 1.0, max: 4.0, step: 1.0 }, // depth layers crossfaded into an endless zoom (1 = flat, no flight; GPU cost x layers)
  depthFog: { value: 0.35, min: 0.0, max: 2.0, step: 0.01 }, // haze that thickens toward the vanishing point
  shake: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 }, // camera shake (much stronger in hell)

  // --- path: shape ---
  pathPoints: { value: 5.0, min: 3.0, max: 9.0, step: 1.0 }, // anchors on the loop
  pathWinding: { value: 1.0, min: 1.0, max: 3.0, step: 1.0 }, // 2+ visits anchors in star order (pentagram, …)
  pathIrregularity: { value: 0.3, min: 0.0, max: 0.6, step: 0.01 }, // 0 = regular polygon
  pathTension: { value: 1.0, min: 0.4, max: 1.3, step: 0.01 }, // 1 = Catmull–Rom; lower = straighter, higher = loopier
  pathStretch: { value: 1.0, min: 0.5, max: 2.0, step: 0.01 }, // >1 wide, <1 tall

  // --- path: placement ---
  pathRadius: { value: 0.55, min: 0.0, max: 1.6, step: 0.01 },
  pathRotation: { value: 0.0, min: -3.14, max: 3.14, step: 0.01 },
  pathTurn: { value: 0.0, min: -1.0, max: 1.0, step: 0.01 }, // rad/s the loop itself turns at
  pathOffsetX: { value: 0.0, min: -1.5, max: 1.5, step: 0.01 },
  pathOffsetY: { value: 0.0, min: -1.0, max: 1.0, step: 0.01 },

  // --- path: motion ---
  pathSpeed: { value: 1.0, min: -4.0, max: 4.0, step: 0.05 }, // negative runs the loop backwards
  pathEase: { value: 0.0, min: 0.0, max: 0.9, step: 0.01 }, // 0 = steady pace; up = lingers at one end of the loop
  pathCornerSlow: { value: 1.0, min: 0.0, max: 1.0, step: 0.01 }, // 1 = slow down for tight corners; 0 = constant speed (whips round stars)
  pathBreath: { value: 0.06, min: 0.0, max: 0.25, step: 0.005 }, // how far the anchors drift
  pathBreathRate: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },

  // --- field ---
  baseFreq: { value: 2.8, min: 0.5, max: 8.0, step: 0.1 },
  warpAmt: { value: 0.22, min: 0.0, max: 0.8, step: 0.01 },
  // The fold map is chaotic: past ~8 iterations neighbouring pixels decorrelate
  // and the image turns to noise. 4-7 shows the fractal; raise it for finer,
  // noisier detail.
  iterations: { value: 6.0, min: 1.0, max: 32.0, step: 1.0 },
  spiralTightness: { value: 1.6, min: 0.2, max: 4.0, step: 0.05 },
  arms: { value: 6.0, min: 1.0, max: 16.0, step: 1.0 },
  waveStrength: { value: 0.8, min: 0.0, max: 2.0, step: 0.01 },
  phaseFeedback: { value: 0.45, min: 0.0, max: 2.0, step: 0.01 },
  // Sphere inversion is what makes the fold map chaotic: at the original 0.7 about
  // half of a 60 s run is fine-grained noise, at ~0.2 the rings and spirals stay.
  inversion: { value: 0.22, min: 0.0, max: 2.0, step: 0.01 },
  nonlinear: { value: 0.35, min: 0.0, max: 2.0, step: 0.01 },
  frequencyCount: { value: 6.0, min: 1.0, max: 8.0, step: 1.0 },
  probability: { value: 1.0, min: 0.0, max: 2.0, step: 0.01 },
  colorSaturation: { value: 1.25, min: 0.5, max: 3.0, step: 0.1 },

  // --- colour pipeline: base colour -> contrast -> glow -> rare emission -> tone map ---
  hueSpread: { value: 3.0, min: 1.0, max: 6.0, step: 0.1 }, // how many palette regions one frame spans (the raw phase only covers a sliver of the wheel)
  bandHardness: { value: 0.7, min: 0.0, max: 1.0, step: 0.01 }, // 0 = smooth gradient between palette regions, 1 = hard poster bands
  seams: { value: 0.55, min: 0.0, max: 1.0, step: 0.01 }, // dark hairlines where palette regions meet
  contrast: { value: 1.3, min: 0.6, max: 3.0, step: 0.05 }, // >1 pushes the weak structure toward black
  glow: { value: 1.0, min: 0.0, max: 3.0, step: 0.01 }, // soft atmospheric glow around the probability shells
  emission: { value: 1.0, min: 0.0, max: 3.0, step: 0.01 }, // strength of the rare emissive (cyan / magenta) structures
  exposure: { value: 1.2, min: 0.3, max: 2.5, step: 0.01 },
  layerSeparation: { value: 2.0, min: 1.0, max: 4.0, step: 0.1 }, // 1 = old soft depth crossfade; higher = less double exposure between depth layers

  // --- neural ---
  neuralInfluence: { value: 0.75, min: 0.0, max: 2.0, step: 0.01 },
  neuralMemory: { value: 0.82, min: 0.0, max: 0.99, step: 0.01 },
  neuralChaos: { value: 0.18, min: 0.0, max: 1.0, step: 0.01 },
  neuralMutation: { value: 0.0, min: 0.0, max: 0.15, step: 0.001 },
};

export default {
  name: 'Radian628 — Quantum Abyss Bézier',
  description:
    'Quantum Abyss Neural without the seams: every angular term is single-valued, the kaleidoscope folds are ' +
    'continuous mirror folds, and the whole field is centred on a point that glides round a closed cubic ' +
    'Bézier loop while the frame slowly spins. The loop is fully adjustable — points, star winding, ' +
    'irregularity, tension, stretch, rotation, offset, direction, ease and corner slow-down are all pathXxx ' +
    'params. Turn on showPath to see the curve. The realm slider (and the Hell / Heaven buttons) turns the ' +
    'abyss into a fall through a burning pit or a climb toward a light, as an endless 3D flight along that ' +
    'curve: flight speed, perspective, depth layers, fog and shake are all parameters.',

  tags: ['fractal', '2d', 'radian628', 'glsl', 'quantum', 'neural', 'bezier', 'seamless', 'kaleidoscope', 'motion'],

  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  latex: 'z_{n+1}=F(z_n,\\Psi_n,|\\Psi_n|^2,N_t),\\qquad \\mathbf c(t)=\\sum_{i=0}^{3} b_{i,3}(s)\\,\\mathbf P_i',

  params: PARAMS,

  // One-click realms. They just set params, so everything stays adjustable afterwards.
  actions: {
    hell: {
      label: 'Descend into Hell',
      run(ctx) {
        Object.assign(ctx.params, {
          realm: -1, realmStrength: 1, realmChaos: 1, glowRays: 1.2, embers: 1.4, heat: 1.2,
          flightSpeed: 0.5, tunnel: 0.7, layers: 3, depthFog: 1.2, shake: 0.5,
          spin: 0.12, pathSpeed: 1.4,
        });
      },
    },
    heaven: {
      label: 'Ascend to Heaven',
      run(ctx) {
        Object.assign(ctx.params, {
          realm: 1, realmStrength: 1, realmChaos: 1, glowRays: 1.3, embers: 0.9, heat: 0.6,
          flightSpeed: 0.18, tunnel: 0.85, layers: 3, depthFog: 0.5, shake: 0,
          spin: 0.03, pathSpeed: 0.7,
        });
      },
    },
    abyss: {
      label: 'Return to the Abyss',
      run(ctx) {
        Object.assign(ctx.params, {
          realm: 0, realmStrength: 1, realmChaos: 1, glowRays: 1, embers: 1, heat: 1,
          flightSpeed: 0.2, tunnel: 1, layers: 2, depthFog: 0.35, shake: 0,
          spin: 0.06, pathSpeed: 1,
        });
      },
    },
  },

  fragmentShader: `
    uniform float uT;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uSpin;
    uniform float uShowPath;
    uniform vec2 uPath[${PATH_UNIFORM}];

    uniform float uBaseFreq;
    uniform float uWarpAmt;
    uniform float uIterations;
    uniform float uSpiralTightness;
    uniform float uArms;
    uniform float uWaveStrength;
    uniform float uPhaseFeedback;
    uniform float uInversion;
    uniform float uNonlinear;
    uniform float uFrequencyCount;
    uniform float uProbability;
    uniform float uColorSaturation;
    uniform float uNeuralInfluence;
    uniform float uNeural[${N_NEURONS}];

    uniform float uRealm;      // signed, already scaled by realmStrength: -1 hell .. +1 heaven
    uniform float uRays;
    uniform float uEmbers;
    uniform float uHeat;
    uniform float uFlight;     // flight phase, in zoom cycles
    uniform float uTunnel;
    uniform float uLayers;
    uniform float uFogDensity;

    uniform float uHueSpread;
    uniform float uBandHardness;
    uniform float uSeams;
    uniform float uContrast;
    uniform float uGlow;
    uniform float uEmission;
    uniform float uExposure;
    uniform float uLayerSeparation;

    varying vec2 vUv;

    #define PI 3.14159265359
    #define TAU 6.28318530718
    #define EPS 0.0001
    #define NU(i) uNeural[i]
    #define ZOOM_RANGE ${FLIGHT_DEPTH.toFixed(2)}

    mat2 rotation(float a) {
      float c = cos(a);
      float s = sin(a);
      return mat2(c, -s, s, c);
    }

    // Radian628-style trigonometric integral.
    vec2 trigIntegral(vec2 p, float freq, float phase) {
      return -cos(p * freq + phase) / max(freq, EPS);
    }

    // Sum of trig integrals at geometrically rising frequency.
    vec2 radianField(vec2 p, float t, float iteration) {
      vec2 field = vec2(0.0);
      float freq = uBaseFreq;
      float amplitude = 1.0;
      for (float k = 1.0; k <= 8.0; k += 1.0) {
        if (k > uFrequencyCount) break;
        float localAngle = t * (0.08 + k * 0.037) + iteration * 0.11;
        vec2 q = rotation(localAngle) * p;
        float localPhase = t * (0.25 + k * 0.071) + sin(iteration * 0.31 + k) * 0.7;
        field += trigIntegral(q, freq, localPhase) * (amplitude / pow(k, 0.72));
        freq *= 1.73;
        amplitude *= 0.49;
      }
      return field;
    }

    // Integer arm count: every angular factor below is a whole number of turns,
    // so cos(k·θ) and sin(k·θ) agree on both sides of atan's branch cut.
    float armsI() { return floor(uArms + 0.5); }

    vec2 logarithmicCoordinates(vec2 p, float t) {
      float r = length(p) + EPS;
      float angle = atan(p.y, p.x);
      float logR = log(r) * uSpiralTightness;
      float radialWave = sin(logR * 4.0 - t * 1.3);
      // was cos((logR + angle·arms)·1.7 + …): 1.7·arms is not an integer -> a jump at θ = ±π
      float angularWave = cos(logR * 1.7 + angle * floor(armsI() * 1.7 + 0.5) + t * 0.7);
      float displacement = radialWave * angularWave;
      vec2 radial = p / r;
      vec2 tangent = vec2(-radial.y, radial.x);
      p += tangent * displacement * uWarpAmt * 0.55;
      p += radial * displacement * uWarpAmt * 0.25;
      return p;
    }

    vec2 quantumWave(vec2 p, float t, float iteration) {
      float r = length(p) + EPS;
      float angle = atan(p.y, p.x);
      float logR = log(r);
      float A = armsI();
      vec2 psi = vec2(0.0);

      float phase1 = r * 13.0 - t * 2.1 + iteration * 0.17;
      psi += vec2(cos(phase1), sin(phase1)) * 0.65;

      float phase2 = angle * A + r * 8.0 + t * 1.3;
      psi += vec2(cos(phase2), sin(phase2)) * 0.45;

      float phase3 = logR * 11.0 + angle * A - t * 1.7 + iteration * 0.23;
      psi += vec2(cos(phase3), sin(phase3)) * 0.35;

      float phase4 = r * 21.0 + angle * (A + 3.0) + t * 0.9;
      psi += vec2(cos(phase4), sin(phase4)) * 0.22;

      float chaos = sin(r * 17.0 + angle * 4.0 + t * 0.37 + iteration * 0.51);
      float phase5 = r * 31.0 - angle * 7.0 + chaos * uNonlinear * 3.0;
      psi += vec2(cos(phase5), sin(phase5)) * 0.12;

      return psi;
    }

    float probabilityDensity(vec2 psi) {
      float probability = dot(psi, psi);
      return probability / (1.0 + probability);
    }

    float neuralEnergy() {
      float e = 0.0;
      for (int i = 0; i < ${N_NEURONS}; i++) e += abs(uNeural[i]);
      return e / ${N_NEURONS}.0;
    }

    // Mirror fold of an angle into [0, π/n]: a triangle wave, continuous for
    // every θ and, for whole n, identical on either side of the branch cut.
    float foldAngle(float a, float n) {
      float w = TAU / n;
      return abs(mod(a + 0.5 * w, w) - 0.5 * w);
    }

    // Fractional sector counts: crossfade the two neighbouring whole counts.
    float sectorFold(float a, float s) {
      float n = floor(s);
      return mix(foldAngle(a, n), foldAngle(a, n + 1.0), smoothstep(0.0, 1.0, s - n));
    }

    vec2 quantumFold(vec2 p, float t, out float orbit, out float totalProbability, out float finalPhase) {
      orbit = 0.0;
      totalProbability = 0.0;
      finalPhase = 0.0;
      float infl = uNeuralInfluence;

      for (float i = 0.0; i < 32.0; i++) {
        if (i >= uIterations) break;

        float r = length(p) + EPS;
        float angle = atan(p.y, p.x) + NU(0) * infl * 0.28;
        r *= 1.0 + NU(1) * infl * 0.06;
        p += vec2(cos(angle + NU(2)), sin(angle + NU(2))) * NU(3) * infl * 0.018;

        float sectorsA = max(1.0, uArms + NU(4) * infl * 3.0 + 1.5 * sin(t * 0.17 + i * 0.07));
        float sectorsB = max(1.0, uArms + 2.0 + NU(5) * infl * 2.5 + 1.2 * cos(t * 0.23 + i * 0.11));
        float symmetryMix = 0.5 + 0.5 * sin(r * (5.0 + NU(6) * 3.0) - t * (0.8 + NU(7) * 0.5) + i * (0.31 + NU(8) * 0.1));
        // both folds are continuous, so their blend is too
        angle = mix(sectorFold(angle, sectorsA), sectorFold(angle, sectorsB), symmetryMix);
        p = vec2(cos(angle), sin(angle)) * r;
        p = abs(p);
        p -= 0.35 + NU(6) * infl * 0.10 + 0.12 * sin(t * 0.6 + i * 0.45);

        vec2 field = radianField(p * (0.35 + i * 0.035), t + i * 0.31 + NU(9) * 0.5, i);
        p += field * uWarpAmt * 1.15 * (1.0 + NU(10) * infl * 0.8);

        vec2 psi = rotation(NU(11) * infl * 0.4) * quantumWave(p, t, i);
        float probability = probabilityDensity(psi);
        totalProbability += probability;
        float phase = atan(psi.y, psi.x);
        finalPhase = phase;

        float feedback = sin(probability * 12.0 + length(field) * 3.0 + phase * 2.0 + t + NU(9) * 2.0);
        probability *= 1.0 + NU(10) * infl * 0.6;

        vec2 radial = p / max(length(p), EPS);
        vec2 tangent = vec2(-radial.y, radial.x);
        p += radial * probability * uWaveStrength * 0.065;
        p += tangent * feedback * uPhaseFeedback * 0.045;
        p += tangent * sin(length(p) * (8.0 + NU(3) * 5.0) + phase * 3.0 + t) * NU(7) * infl * 0.025;

        float nonlinearField = sin(probability * 18.0 + length(p) * 7.0 - phase * 3.0 + NU(8) * 4.0);
        p += field * nonlinearField * uNonlinear * 0.045;

        // sphere inversion
        float d = dot(p, p);
        float inverseAmount = clamp(uInversion + NU(1) * infl * 0.35, 0.0, 1.5);
        p /= mix(1.0, max(d, 0.025), inverseAmount);
        p = abs(p);
        p -= 0.27 + field * 0.06;
        p += sin(p.yx * (5.0 + NU(4) * 4.0) + t) * NU(2) * infl * 0.008;

        // orbit traps
        orbit += exp(-8.0 * abs(length(p) - 0.5));
        orbit += exp(-12.0 * abs(p.x * p.y));
        orbit += probability * exp(-5.0 * length(p));
        orbit += neuralEnergy() * 0.08 * (1.0 + NU(11));

        float scale = 0.92 + 0.04 * sin(t * 0.4 + i * 0.7 + probability * 3.0) + NU(0) * infl * 0.012;
        p *= scale;
      }
      return p;
    }

    // ---- spectral palette -------------------------------------------------------
    // Six discrete regions round the colour wheel instead of a continuous cosine rainbow.
    // Each owns a stretch of the wheel (magenta and cyan are the narrow accents) and only
    // blends into the next over the last part of its stretch, so neighbouring structures
    // land in visibly different regions instead of averaging into one teal/purple.
    // Each region also says how much it may emit: cyan strongly, magenta a little, teal
    // and deep blue barely, navy and violet never.
    #define R1 0.20
    #define R2 0.38
    #define R3 0.54
    #define R4 0.68
    #define R5 0.92

    vec3 regionColor(float i) {
      if (i < 0.5) return vec3(0.010, 0.018, 0.070);  // dark navy
      if (i < 1.5) return vec3(0.030, 0.110, 0.460);  // deep blue
      if (i < 2.5) return vec3(0.000, 0.720, 1.000);  // electric cyan
      if (i < 3.5) return vec3(0.000, 0.520, 0.450);  // teal
      if (i < 4.5) return vec3(0.300, 0.060, 0.580);  // deep violet
      return vec3(0.800, 0.040, 0.550);               // magenta accent
    }

    float regionEmission(float i) {
      if (i < 0.5) return 0.0;
      if (i < 1.5) return 0.12;
      if (i < 2.5) return 1.0;
      if (i < 3.5) return 0.06;
      if (i < 4.5) return 0.0;
      return 0.35;
    }

    // x: position on the wheel (any real). Returns the pigment, how emissive that spot of
    // the wheel is allowed to be, and the distance (in wheel units) to the nearest
    // region boundary, for the seams.
    vec3 spectral(float x, out float emitSelect, out float boundaryDist) {
      x = fract(x);
      float i = 0.0, a = 0.0, b = R1;
      if (x >= R1) { i = 1.0; a = R1; b = R2; }
      if (x >= R2) { i = 2.0; a = R2; b = R3; }
      if (x >= R3) { i = 3.0; a = R3; b = R4; }
      if (x >= R4) { i = 4.0; a = R4; b = R5; }
      if (x >= R5) { i = 5.0; a = R5; b = 1.0; }
      float f = (x - a) / (b - a);
      float soft = mix(1.0, 0.04, uBandHardness);    // share of the region used for the blend
      float w = smoothstep(1.0 - soft, 1.0, f);
      float j = mod(i + 1.0, 6.0);
      emitSelect = mix(regionEmission(i), regionEmission(j), w);
      float blendMid = b - 0.5 * soft * (b - a);     // where this region hands over to the next
      boundaryDist = min(abs(x - blendMid), x - a);
      return mix(regionColor(i), regionColor(j), w);
    }

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    // Everything the tone map needs, kept apart until the very end.
    struct Shade {
      vec3 base;       // pigment x diffuse brightness
      vec3 glow;       // soft atmospheric glow
      vec3 emit;       // sparse, genuinely emissive light
      float structure; // 0..1 grading input for the realms
    };

    float segmentDistance(vec2 p, vec2 a, vec2 b) {
      vec2 ab = b - a;
      float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      return length(p - a - ab * h);
    }

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // Twinkling points of light on a jittered grid that drifts upward: embers in
    // hell, motes in heaven.
    float sparks(vec2 uv, float t, float scale, float rise, float sway) {
      vec2 g = uv * scale + vec2(sway * sin(t * 0.7 + uv.y * 3.0), -rise * t);
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash21(id);
      vec2 jitter = (vec2(hash21(id + 7.1), hash21(id + 3.3)) - 0.5) * 0.6;
      float twinkle = 0.55 + 0.45 * sin(t * (2.0 + 5.0 * h) + h * 40.0);
      return step(0.92, h) * smoothstep(0.12, 0.0, length(f - jitter)) * twinkle;
    }

    // Gradient maps for the realms, x = luminance 0..1.
    vec3 hellRamp(float x) {
      vec3 c = mix(vec3(0.015, 0.0, 0.02), vec3(0.45, 0.02, 0.0), smoothstep(0.0, 0.35, x));
      c = mix(c, vec3(1.0, 0.32, 0.02), smoothstep(0.3, 0.65, x));
      return mix(c, vec3(1.0, 0.85, 0.35), smoothstep(0.65, 1.0, x));
    }
    vec3 heavenRamp(float x) {
      // deep sky -> pale blue -> pearl -> gold -> white, spread over the whole range so detail survives
      vec3 c = mix(vec3(0.28, 0.40, 0.74), vec3(0.62, 0.73, 0.96), smoothstep(0.0, 0.3, x));
      c = mix(c, vec3(0.96, 0.88, 0.93), smoothstep(0.25, 0.55, x));
      c = mix(c, vec3(1.0, 0.92, 0.70), smoothstep(0.5, 0.82, x));
      return mix(c, vec3(1.0), smoothstep(0.85, 1.0, x));
    }

    // Shading of the field at field-space point p, split into base colour, glow and emission
    // (blended over the depth layers, then exposed and tone mapped once in main), plus a 0..1
    // "structure" scalar for the realm grade. The fractal and the network are untouched;
    // only how their outputs become colour is decided here, in stages:
    //   1 base colour  where on the spectral wheel this point sits (phase, orbit, interference;
    //                  the network only nudges the wheel position and the saturation)
    //   2 structure    diffuse brightness from orbit traps + probability through a contrast
    //                  curve, dark seams at region boundaries, no brightness floor
    //   3 glow         a faint haze of the local pigment around the probability shells
    //   4 emission     a sparse mask: thin interference veins and coherent phase fronts, gated
    //                  by the wheel region (cyan yes, magenta a little, the rest no)
    Shade fieldColor(vec2 p, float t) {
      float hell = max(-uRealm, 0.0);
      float infl = uNeuralInfluence;
      p = logarithmicCoordinates(p, t);

      float orbit;
      float totalProbability;
      float finalPhase;
      vec2 q = quantumFold(p, t, orbit, totalProbability, finalPhase);
      // orbit sums over every iteration; the colour code below is tuned for ~0-3
      orbit = orbit / max(uIterations, 1.0) * 4.0;
      // quantumFold also adds neuralEnergy()·0.08·(1 + NU(11)) to the orbit on every
      // iteration: the same amount for every pixel, i.e. a global brightness knob driven by
      // the network. Take it back out here (leaving quantumFold as it is) so the orbit only
      // measures structure.
      float orbitS = max(orbit - 4.0 * neuralEnergy() * 0.08 * (1.0 + NU(11)), 0.0);

      float r = length(q) + EPS;
      float angle = atan(q.y, q.x);
      vec2 finalPsi = rotation(NU(3) * infl * 0.3) * quantumWave(q, t, uIterations);
      float finalProbability = probabilityDensity(finalPsi);
      float phase = atan(finalPsi.y, finalPsi.x);

      // Integer multiples of phase and angle; the neural terms are phase offsets.
      float interference = sin(phase * 7.0 + NU(4) * 3.0 + r * (11.0 + NU(5) * 5.0) - t * 1.2);
      interference *= sin(r * (19.0 + NU(6) * 7.0) - angle * (armsI() + 2.0) + NU(7) * 2.0 + t * 0.73);

      float bands = pow(clamp(finalProbability, 0.0, 1.0), 2.7) * uProbability;
      bands *= 1.0 + NU(8) * infl * 0.25;
      bands = clamp(bands, 0.0, 1.5);

      // ---- 1. base colour -----------------------------------------------------------
      // Measured: in any one frame the raw phase term only covers a sliver of the wheel
      // (at calm moments ~90% of pixels sit within a tenth of it) and that sliver drifts, so
      // mapping it straight onto a palette paints the whole frame one colour. Stretch it
      // (hueSpread) and let interference and probability, which vary locally, move points
      // across region boundaries too. When the fold map settles near a fixed point, only the
      // probability summed over the iterations still varies across the screen, so it's in too.
      float colorPhase = (phase / TAU + orbitS * 0.015) * uHueSpread
                       + interference * 0.55 + finalProbability * 1.2 + totalProbability * 0.3 + t * 0.018;
      colorPhase += NU(3) * 0.08 + NU(8) * 0.16 + NU(9) * 0.05;   // network: hue position only
      float emitSelect, boundaryDist;
      vec3 pigment = spectral(colorPhase, emitSelect, boundaryDist);
      float sat = uColorSaturation * (1.0 + 0.15 * clamp(NU(10), -1.0, 1.0) * infl);
      pigment = max(mix(vec3(luma(pigment)), pigment, sat), 0.0);

      // ---- 2. structural contrast -----------------------------------------------------
      // Diffuse brightness from the features that actually vary across the frame: the
      // orbit traps (normalised orbit sits in a narrow ~2.7-4 band, so it is windowed to
      // that), probability and interference. Contrast curve, no floor: weak structure goes
      // dark. The palette's own dark regions (navy, violet) add the rest of the range.
      float oN = smoothstep(2.4, 3.9, orbitS);
      float pN = smoothstep(0.05, 0.55, finalProbability);
      float iN = 0.5 + 0.5 * interference;
      float tN = smoothstep(1.0, 2.6, totalProbability);
      float structural = 0.35 * oN + 0.25 * pN + 0.2 * iN + 0.2 * tN;
      structural *= 1.0 + 0.1 * clamp(NU(11), -1.0, 1.0) * infl;   // network: structural intensity, bounded
      float diffuse = pow(smoothstep(0.22, 0.85, structural), uContrast);
      // Seams: dark hairlines where two palette regions meet, a constant ~1-2 px wide.
      // The wheel position's screen derivative is taken through cos/sin so the atan branch
      // cut (a jump of 1 in colorPhase) doesn't read as a steep gradient.
      vec2 wheel = vec2(cos(TAU * colorPhase), sin(TAU * colorPhase));
      float dWheel = length(fwidth(wheel)) / TAU + 1e-5;
      float seam = (1.0 - smoothstep(0.6, 2.2, boundaryDist / dWheel)) * (1.0 - smoothstep(0.03, 0.12, dWheel));
      vec3 base = pigment * diffuse * (1.0 - uSeams * seam);

      // ---- 3. selective glow ------------------------------------------------------------
      // A faint haze of the local pigment (so navy glows navy, i.e. barely) around the
      // probability shells and the fold centre. Soft-clamped: it can't pile up.
      float shell = exp(-16.0 * abs(finalProbability - 0.48));
      float haze = clamp(0.65 * shell + 0.35 * exp(-1.8 * r) * finalProbability, 0.0, 1.0);
      vec3 glow = mix(pigment, vec3(luma(pigment)), 0.25) * haze * (0.35 + 0.65 * diffuse) * 0.12 * uGlow;

      // ---- 4. rare emission ------------------------------------------------------------
      // Structure that may emit: thin interference veins (the old threshold of 0.55 lit up a
      // large part of the frame), and peaks where probability and orbit traps coincide. Both
      // are gated by a coherent phase front that slides through the field, and then by the
      // spectral region, so only cyan (and a little magenta) structures ever emit.
      float veinEdge = 0.66 + 0.05 * clamp(NU(11), -1.0, 1.0) * infl;   // network: mask threshold
      float vein = smoothstep(veinEdge, 0.97, abs(interference));
      float front = pow(0.5 + 0.5 * cos(phase * 3.0 - t * 0.9 + NU(9) * 2.0), 4.0);
      float peak = smoothstep(0.42, 0.68, finalProbability) * smoothstep(3.0, 3.9, orbitS);
      float emissionMask = clamp(vein * (0.4 + 0.6 * front) + peak * front, 0.0, 1.0);
      emissionMask = smoothstep(0.02, 0.3, emissionMask * emitSelect) * (1.0 - seam);
      vec3 emissive = pigment / max(max(pigment.r, max(pigment.g, pigment.b)), 1e-3);   // full-strength hue
      float emissionStrength = 3.2 * uEmission
          * (1.0 + 0.25 * clamp(NU(10), -1.0, 1.0) * infl)   // network: bounded, and only where the mask is
          * (1.0 + hell * 0.6 * uRays);                       // lava veins in hell
      vec3 emit = emissive * emissionMask * emissionStrength;

      float structure = 0.5 + 0.5 * sin(TAU * colorPhase + 1.3 * interference);
      return Shade(base, glow, emit, mix(structure, clamp(0.3 + bands, 0.0, 1.0), 0.3));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      float t = uT;
      float hell = max(-uRealm, 0.0);
      float heaven = max(uRealm, 0.0);

      // Heat shimmer in hell, slow drifting haze in heaven: a small warp of the whole frame.
      uv += uHeat * (hell * 0.012 * vec2(sin(uv.y * 23.0 + t * 2.7), cos(uv.x * 19.0 + t * 2.1))
                   + heaven * 0.006 * vec2(sin(uv.y * 7.0 + t * 0.6), cos(uv.x * 6.0 + t * 0.5)));

      // The vanishing point is the Bézier centre; q0 is the pixel's offset from it.
      vec2 q0 = uv - uCenter;
      float rs = length(q0);
      vec2 dir = rs > 1e-5 ? q0 / rs : vec2(1.0, 0.0);
      float breath = 1.0 + 0.075 * sin(t * 0.31) + NU(0) * uNeuralInfluence * 0.025;
      float turn = NU(2) * uNeuralInfluence * 0.12 + uSpin;

      vec3 fogColor = mix(vec3(0.02, 0.015, 0.04), vec3(0.30, 0.035, 0.0), hell);
      fogColor = mix(fogColor, vec3(0.85, 0.78, 0.66), heaven);

      // Depth layers: the same field at staggered zoom depths. A layer is born far away
      // (phase 0, faint and foggy), grows toward the camera and fades out (phase 1). The
      // weights are sin² raised to layerSeparation and normalised, so they still sum to 1 and
      // the loop has no seam in time; above 1 each pixel is dominated by one layer instead of
      // an even double exposure of two unrelated fields (which averaged their colours).
      int layers = int(uLayers + 0.5);
      float weights[4];
      float wsum = 0.0;
      for (int k = 0; k < 4; k++) {
        weights[k] = 0.0;
        if (k >= layers) continue;
        float phase = layers == 1 ? 0.0 : fract(uFlight + float(k) / float(layers));
        float s = sin(PI * phase);
        weights[k] = layers == 1 ? 1.0 : pow(s * s, uLayerSeparation) + 1e-6;
        wsum += weights[k];
      }
      vec3 base = vec3(0.0);
      vec3 glow = vec3(0.0);
      vec3 emit = vec3(0.0);
      float structure = 0.0;
      float fogStructure = 0.3 - 0.2 * hell + 0.55 * heaven; // what fog does to the grade input
      for (int k = 0; k < 4; k++) {
        if (k >= layers) break;
        float phase = layers == 1 ? 0.0 : fract(uFlight + float(k) / float(layers));
        float weight = weights[k] / wsum;
        // perspective: a power of the distance from the vanishing point, scaled by the layer's depth
        vec2 p = dir * (pow(max(rs, 1e-4), uTunnel) * exp(-ZOOM_RANGE * phase)) * breath;
        Shade layer = fieldColor(rotation(turn) * p, t);
        float young = layers == 1 ? 0.0 : 1.0 - phase;
        float fog = 1.0 - exp(-uFogDensity * (1.0 - 0.35 * heaven) * (1.6 * exp(-2.4 * rs) + 0.8 * young));
        base += weight * mix(layer.base, fogColor, fog);
        glow += weight * layer.glow * (1.0 - fog);
        emit += weight * layer.emit * (1.0 - 0.85 * fog);
        structure += weight * mix(layer.structure, fogStructure, fog);
      }

      // Hell's pit throbs; the pulse also drives the glow around the vanishing point below.
      float pulse = 1.0 + hell * 0.6 * pow(0.5 + 0.5 * sin(t * 2.2), 6.0);

      // Tone map, in two steps so emission is separated before highlights are compressed.
      // (The old path multiplied everything by a drifting exposure and a neural pulse, then
      // ran ACES and pow(0.82), which lifted every shadow into the milky mid-tones.)
      // 1) base + glow: extended Reinhard on luminance, hue and saturation kept, slope 1 at
      //    black so darks stay dark; it only rolls off what is already bright.
      vec3 diffuseHdr = (base + glow) * uExposure;
      float Ld = luma(diffuseHdr);
      float white = 1.6;
      vec3 color = diffuseHdr * ((1.0 + Ld / (white * white)) / (1.0 + Ld));
      // 2) add the emission, then a soft shoulder on the brightest channel above a knee
      //    (again preserving hue); only light well past 1 drifts toward white, so pale
      //    cores stay rare.
      color += emit * uExposure;
      float peakC = max(color.r, max(color.g, color.b));
      float knee = 0.72;
      if (peakC > knee) {
        float over = peakC - knee;
        float mapped = knee + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
        color *= mapped / peakC;
        color = mix(color, vec3(mapped), clamp((peakC - 1.2) * 0.12, 0.0, 0.45));
      }

      // Grade: re-map luminance through the realm's ramp, keeping a little of the original hue.
      float L = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 tint = mix(vec3(1.0), clamp(color / max(L, 1e-3), 0.6, 1.6), 0.25);
      color = mix(color, hellRamp(pow(clamp(mix(L, structure, 0.5), 0.0, 1.0), 1.15)) * tint, hell);
      color = mix(color, heavenRamp(clamp(0.05 + 0.9 * mix(L, structure, 0.75), 0.0, 1.0)) * tint, heaven);

      // Heaven: rays fanning out of the vanishing point, and a halo. Only whole-number
      // multiples of the angle, so there is no seam.
      float th = atan(q0.y, q0.x);
      float ray = 0.5 + 0.5 * cos(14.0 * th + 0.35 * t + 1.7 * sin(3.0 * th - 0.5 * t));
      color += heaven * uRays * pow(ray, 6.0) * exp(-rs * 1.8) * vec3(1.0, 0.9, 0.6) * 0.32;
      color += heaven * uRays * exp(-rs * 6.0) * vec3(1.0, 0.95, 0.8) * 0.28;
      color += hell * exp(-rs * 7.0) * pulse * vec3(0.9, 0.12, 0.0) * 0.35;   // the pit's throat

      // Embers rise fast in hell; motes drift slowly in heaven.
      float amount = (hell + heaven) * uEmbers;
      if (amount > 0.001) {
        float rise = hell > 0.0 ? 0.55 : 0.07;
        float sway = hell > 0.0 ? 0.6 : 0.15;
        float sp = sparks(uv, t, 6.0, rise, sway) + 0.8 * sparks(uv + 3.7, t, 11.0, rise * 1.4, sway) + 0.6 * sparks(uv + 9.1, t, 19.0, rise * 1.9, sway);
        vec3 sparkColor = hell > 0.0 ? vec3(1.0, 0.42, 0.08) * 1.6 : vec3(1.0, 0.95, 0.75) * 1.1;
        color += sp * sparkColor * amount * 0.9;
      }

      // vignette: soot in hell, almost none in heaven
      float vignette = mix(mix(0.32, 0.5, hell), 0.10, heaven);
      color *= 1.0 - vignette * smoothstep(0.35, 1.65, length(uv));

      if (uShowPath > 0.5) {
        float dMin = 1e9;
        for (int k = 0; k < ${PATH_UNIFORM - 1}; k++) dMin = min(dMin, segmentDistance(uv, uPath[k], uPath[k + 1]));
        float line = smoothstep(0.010, 0.003, dMin);
        float marker = smoothstep(0.04, 0.028, length(uv - uCenter));
        color = mix(color, vec3(0.95, 1.0, 1.0), max(line * 0.75, marker));
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    const value = (name) => ({ value: PARAMS[name].value });
    return {
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uSpin: { value: 0 },
      uShowPath: value('showPath'),
      uPath: { value: Array.from({ length: PATH_UNIFORM }, () => new THREE.Vector2()) },
      uBaseFreq: value('baseFreq'),
      uWarpAmt: value('warpAmt'),
      uIterations: value('iterations'),
      uSpiralTightness: value('spiralTightness'),
      uArms: value('arms'),
      uWaveStrength: value('waveStrength'),
      uPhaseFeedback: value('phaseFeedback'),
      uInversion: value('inversion'),
      uNonlinear: value('nonlinear'),
      uFrequencyCount: value('frequencyCount'),
      uProbability: value('probability'),
      uColorSaturation: value('colorSaturation'),
      uNeuralInfluence: value('neuralInfluence'),
      uNeural: { value: new Float32Array(N_NEURONS) },
      uRealm: { value: 0 },
      uRays: value('glowRays'),
      uEmbers: value('embers'),
      uHeat: value('heat'),
      uFlight: { value: 0 },
      uTunnel: value('tunnel'),
      uLayers: value('layers'),
      uFogDensity: value('depthFog'),
      uHueSpread: value('hueSpread'),
      uBandHardness: value('bandHardness'),
      uSeams: value('seams'),
      uContrast: value('contrast'),
      uGlow: value('glow'),
      uEmission: value('emission'),
      uExposure: value('exposure'),
      uLayerSeparation: value('layerSeparation'),
    };
  },

  setup() {
    const count = PATH_MAX_POINTS * PATH_TABLE;
    return {
      clock: 0,
      spin: 0,
      flight: 0, // accumulated flight phase, in zoom cycles
      turn: 0, // accumulated pathTurn: the loop's own rotation, on the field clock
      pathTime: 0, // integral of pathSpeed: where the centre is along the loop
      breath: 0, // integral of pathSpeed x pathBreathRate: the anchors' drift phase
      lap: 0,
      net: makeNetwork(),
      anchors: Array.from({ length: PATH_MAX_POINTS }, () => [0, 0]),
      table: new Float64Array(count * 2),
      cumulative: new Float64Array(count + 1), // arc length up to each table point
      timeCum: new Float64Array(count + 1), // the same, weighted by 1/pace: time to reach each table point
      here: [0, 0],
    };
  },

  update(ctx, state) {
    const p = ctx.params;
    const u = state.uniforms;
    const dt = ctx.delta * p.speed;
    state.clock += dt;

    // The realm, as a signed strength: hell < 0 < heaven. It reshapes the fractal (effective
    // params below), speeds or calms the flight and spin, and drives the look in the shader.
    const realm = p.realm * p.realmStrength;
    const hell = Math.max(-realm, 0);
    const heaven = Math.max(realm, 0);
    const chaos = p.realmChaos;
    state.spin += dt * p.spin * (1 + 2 * hell);
    state.flight += dt * p.flightSpeed * (1 + 0.6 * hell - 0.3 * heaven);
    state.turn += dt * p.pathTurn;
    state.pathTime += ctx.delta * p.pathSpeed;
    state.breath += ctx.delta * p.pathSpeed * p.pathBreathRate;
    state.lap = state.pathTime / PATH_LAP;

    const { anchors, table, cumulative } = state;
    const n = buildAnchors(p, state.breath, state.turn, anchors);
    sampleLoop(anchors, n, p.pathTension, table);

    // Arc-length table, so the centre glides at a steady pace along the loop.
    const count = n * PATH_TABLE;
    cumulative[0] = 0;
    for (let i = 0; i < count; i++) {
      const a = i * 2;
      const b = ((i + 1) % count) * 2;
      cumulative[i + 1] = cumulative[i] + Math.hypot(table[b] - table[a], table[b + 1] - table[a + 1]);
    }
    // Corner slow-down: the centre keeps a bounded lateral acceleration, so its pace drops
    // like sqrt(R / R0) where the loop's radius of curvature R falls below R0. A lap still
    // takes the same time — it is faster on the straights. Nothing changes while R >= R0
    // (the default loop's tightest corner is just above it), so this only matters for
    // stars, low tension, strong stretch and the like.
    const R0 = 0.25 * p.pathRadius;
    const slow = p.pathCornerSlow;
    const { timeCum } = state;
    timeCum[0] = 0;
    for (let i = 0; i < count; i++) {
      let pace = 1;
      if (slow > 0 && R0 > 1e-6) {
        const a = ((i - CURVE_SPAN + count) % count) * 2;
        const b = i * 2;
        const c = ((i + CURVE_SPAN) % count) * 2;
        const ab = Math.hypot(table[b] - table[a], table[b + 1] - table[a + 1]);
        const bc = Math.hypot(table[c] - table[b], table[c + 1] - table[b + 1]);
        const ca = Math.hypot(table[a] - table[c], table[a + 1] - table[c + 1]);
        const area2 = Math.abs((table[b] - table[a]) * (table[c + 1] - table[a + 1]) - (table[b + 1] - table[a + 1]) * (table[c] - table[a]));
        if (area2 > 1e-12) {
          const radius = (ab * bc * ca) / (2 * area2); // circumradius of three nearby table points
          pace = 1 + slow * (Math.min(1, Math.max(MIN_PACE, Math.sqrt(radius / R0))) - 1);
        }
      }
      timeCum[i + 1] = timeCum[i] + (cumulative[i + 1] - cumulative[i]) / pace;
    }

    // Ease: f = lap − e·sin(2π·lap)/2π keeps increasing for e < 1, but its speed varies
    // between 1 − e and 1 + e per lap, so the centre lingers on one side of the loop.
    const eased = state.lap - (p.pathEase * Math.sin(TWO_PI * state.lap)) / TWO_PI;
    pointAlong(table, timeCum, count, eased, state.here);
    // Camera shake nudges the vanishing point: barely there in heaven, violent in hell.
    const shake = p.shake * (0.15 + 0.85 * hell) * 0.03;
    const c = state.clock;
    u.uCenter.value.set(
      state.here[0] + shake * (Math.sin(c * 23.1) + 0.6 * Math.sin(c * 37.7 + 1.3) + 0.4 * Math.sin(c * 61.3 + 2.9)),
      state.here[1] + shake * (Math.sin(c * 19.7 + 0.7) + 0.6 * Math.sin(c * 43.1 + 2.1) + 0.4 * Math.sin(c * 71.9 + 0.4)),
    );

    // Evenly spaced points on the loop for the showPath overlay (last == first).
    const path = u.uPath.value;
    for (let k = 0; k < PATH_UNIFORM; k++) {
      pointAlong(table, cumulative, count, k / (PATH_UNIFORM - 1), state.here);
      path[k].set(state.here[0], state.here[1]);
    }
    pointAlong(table, timeCum, count, eased, state.here);

    u.uT.value = state.clock;
    u.uSpin.value = state.spin;
    u.uShowPath.value = p.showPath;
    u.uBaseFreq.value = p.baseFreq;
    // Effective fractal params: inversion is the noise-vs-calm dial, so hell turns it up
    // (plus warp and wave strength, fewer arms) and heaven turns it down (more arms).
    u.uWarpAmt.value = p.warpAmt * (1 + (0.5 * hell - 0.25 * heaven) * chaos);
    u.uIterations.value = p.iterations;
    u.uSpiralTightness.value = p.spiralTightness;
    u.uArms.value = Math.max(1, p.arms + Math.round((4 * heaven - 2 * hell) * chaos));
    u.uWaveStrength.value = p.waveStrength * (1 + 0.6 * hell * chaos);
    u.uPhaseFeedback.value = p.phaseFeedback;
    u.uInversion.value = Math.max(0, p.inversion + (0.28 * hell - 0.04 * heaven) * chaos);
    u.uNonlinear.value = p.nonlinear;
    u.uFrequencyCount.value = p.frequencyCount;
    u.uProbability.value = p.probability;
    u.uColorSaturation.value = p.colorSaturation;
    u.uNeuralInfluence.value = p.neuralInfluence;

    u.uRealm.value = realm;
    u.uRays.value = p.glowRays;
    u.uEmbers.value = p.embers;
    u.uHeat.value = p.heat;
    u.uFlight.value = state.flight;
    u.uTunnel.value = p.tunnel;
    u.uLayers.value = p.layers;
    u.uFogDensity.value = p.depthFog;
    u.uHueSpread.value = p.hueSpread;
    u.uBandHardness.value = p.bandHardness;
    u.uSeams.value = p.seams;
    u.uContrast.value = p.contrast;
    u.uGlow.value = p.glow;
    u.uEmission.value = p.emission;
    u.uExposure.value = p.exposure;
    u.uLayerSeparation.value = p.layerSeparation;

    stepNetwork(state.net, p, state.clock, u.uNeural.value);
  },
};
