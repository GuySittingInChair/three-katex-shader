import * as THREE from 'three';
import { clamp01, lerp, smooth } from '../lib/motion.js';
import { caption, beat } from '../lib/bit.js';

// The Brusselator (Prigogine & Lefever, Brussels, 1968) in a round dish: the simplest chemistry that can
// both draw a pattern and keep time.
//
//     ∂ₜu = a − (b + 1)u + u²v + D_u ∇²u          u: activator (X in A → X, B + X → Y + D, 2X + Y → 3X, X → E)
//     ∂ₜv = b u − u²v       + D_v ∇²v          v: inhibitor (Y)
//
// The well-mixed steady state is u = a, v = b/a. Linearising about it with a mode e^{ikx + σt}, there are
// two ways to lose stability, and both thresholds are exact:
//     Hopf (the whole dish starts oscillating):  b > b_H = 1 + a²
//     Turing (a stationary pattern grows):       b > b_T = (1 + a √(D_u/D_v))²,  at k_c² = a/√(D_u D_v)
// Here a = 2, D_u = 1, so b_H = 5 and, with d = D_v/D_u = 8, b_T = 2.914 and λ_c = 2π/k_c = 7.47.
// The readout also shows the fastest-growing wavelength 2π/k_max at the current b (largest Re σ over k),
// and the wavelength actually measured in the dish: every half second the middle 128×128 cells are read
// back, Hann-windowed, Fourier-transformed, and the peak of the radially averaged power spectrum is
// taken. Patterns settle a little tighter than the fastest mode (checked on the CPU: λ ≈ 6.6 at b = 3.4,
// where 2π/k_max = 7.2), which is normal for a saturated Turing pattern.
//
// The loop (180 time units, 5 per second). It ends in the state it starts in, so the dish is only filled
// once (with the steady state plus ±0.02 of noise), on load:
//     0 – 30    b = 6 > b_H, d = 1: the dish oscillates. Three specks where b is 0.6 lower (they cycle
//               faster: period 3.7 vs 5.1, measured on the 0D kinetics) act as pacemakers: target waves
//    30 – 40    d → 8: the inhibitor speeds up, b_T drops below b, and a Turing pattern grows through the
//               waves, freezing their rings in place
//    55 – 70    b → 2.2 (below b_T): the pattern dissolves
//    80 – 90    b → 3.4: past b_T, stripes grow out of the molecular noise
//   120 – 135   b → 4.6: the stripes break up into hexagonal spots
//   150 – 158   b → 6: past b_H. Nothing happens; the Turing pattern is stable against the oscillation
//   158 – 168   d → 1: the inhibitor slows to the activator's pace, b_T rises past b, and the pattern melts
//               back into the oscillation the loop started with
//
// Numerics (prototyped on the CPU in Node first at dx = 1): explicit Euler, dx = 0.5, dt = 0.006 (diffusion
// is stable for dt ≤ dx²/(4 D_v) = 0.0078), 5-point Laplacian, no-flux circular wall. 256 × 256 float32
// cells, so the dish is 128 units across, about 19 wavelengths.

const SIZE = 256;
const DX = 0.5;
const DT = 0.006;
const A = 2;
const DU = 1;
const PC = 180;
const RATE = 5;
const B_LO = 2.2;
const MAX_STEPS_PER_FRAME = 40;
const LAG_RESET = 30;
const GOLDEN = 2.399963229728653;
const WIN = 128;
const PALETTES = ['Abyss', 'Ember', 'Ink'];

// Piecewise schedule: [start, end, from, to] for b, d and pacemaker strength.
const ramp = (tau, keys) => {
  let v = keys[0][2];
  for (const [t0, t1, from, to] of keys) {
    if (tau >= t1) v = to;
    else if (tau >= t0) return lerp(from, to, smooth((tau - t0) / (t1 - t0)));
  }
  return v;
};
const B_KEYS = [[55, 70, 6, B_LO], [80, 90, B_LO, 3.4], [120, 135, 3.4, 4.6], [150, 158, 4.6, 6]];
const D_KEYS = [[30, 40, 1, 8], [158, 168, 8, 1]];
const P_KEYS = [[30, 36, 0.6, 0], [160, 168, 0, 0.6]];

const bT = (d) => (1 + A / Math.sqrt(d)) ** 2;
const B_H = 1 + A * A;
// Fastest-growing mode of the linearisation: max over k of Re σ(k).
function fastest(b, d) {
  let best = -Infinity;
  let bk = 0;
  for (let k = 0.02; k < 2.5; k += 0.005) {
    const a11 = b - 1 - DU * k * k;
    const a22 = -A * A - d * DU * k * k;
    const T = a11 + a22;
    const D = a11 * a22 + A * A * b;
    const disc = (T * T) / 4 - D;
    const re = disc >= 0 ? T / 2 + Math.sqrt(disc) : T / 2;
    if (re > best) { best = re; bk = k; }
  }
  return { sigma: best, k: bk };
}

// In-place radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const wr = Math.cos(ang * j);
        const wi = Math.sin(ang * j);
        const a = i + j;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

// Dominant wavelength (space units) of a WIN×WIN field, and its standard deviation.
function measure(px) {
  const n = WIN;
  let mean = 0;
  for (let i = 0; i < n * n; i++) mean += px[4 * i];
  mean /= n * n;
  let varr = 0;
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (n - 1));
    for (let x = 0; x < n; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (n - 1));
      const q = px[4 * (y * n + x)] - mean;
      varr += q * q;
      re[y * n + x] = q * wx * wy;
    }
  }
  const row = (arr, y) => arr.subarray(y * n, y * n + n);
  for (let y = 0; y < n; y++) fft(row(re, y), row(im, y));
  const cr = new Float64Array(n);
  const ci = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { cr[y] = re[y * n + x]; ci[y] = im[y * n + x]; }
    fft(cr, ci);
    for (let y = 0; y < n; y++) { re[y * n + x] = cr[y]; im[y * n + x] = ci[y]; }
  }
  const P = new Float64Array(n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const kx = x < n / 2 ? x : x - n;
      const ky = y < n / 2 ? y : y - n;
      const kr = Math.round(Math.hypot(kx, ky));
      if (kr < n / 2) P[kr] += re[y * n + x] ** 2 + im[y * n + x] ** 2;
    }
  }
  let bk = 3;
  for (let k = 3; k < n / 2; k++) if (P[k] > P[bk]) bk = k;
  let sw = 0;
  let sk = 0;
  for (let k = Math.max(2, bk - 2); k <= Math.min(n / 2 - 1, bk + 2); k++) { sw += P[k]; sk += P[k] * k; }
  return { lambda: (DX * n) / (sk / sw), std: Math.sqrt(varr / (n * n)) };
}

const PASS_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const STEP_FRAG = `
  uniform sampler2D uState;
  uniform float uN, uDt, uDx, uA, uB, uDv, uPace, uSeed, uEta;
  uniform vec2 uPm[3];
  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx + uSeed) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  bool inDish(ivec2 p) { return length(vec2(p) + 0.5 - 0.5 * uN) < 0.5 * uN - 1.0; }
  vec2 nb(ivec2 q, vec2 c) { return inDish(q) ? texelFetch(uState, q, 0).rg : c; }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    if (!inDish(p)) { gl_FragColor = vec4(0.0); return; }
    vec2 s = texelFetch(uState, p, 0).rg;
    vec2 lap = (nb(p + ivec2(-1, 0), s) + nb(p + ivec2(1, 0), s) + nb(p + ivec2(0, -1), s) + nb(p + ivec2(0, 1), s) - 4.0 * s) / (uDx * uDx);
    float b = uB;
    vec2 x = vec2(p) + 0.5;
    for (int i = 0; i < 3; i++) { vec2 d = x - uPm[i]; b -= uPace * exp(-dot(d, d) * uDx * uDx / 36.0); }
    float u = s.x, v = s.y, uuv = u * u * v;
    // Molecular noise, η √dt per step: without it the dish would forget its stirring long before b
    // crosses b_T (the noise decays to below float precision), and patterns could only creep in from the wall.
    float un = u + uDt * (uA - (b + 1.0) * u + uuv + lap.x) + uEta * sqrt(uDt) * (hash(gl_FragCoord.xy) - 0.5);
    float vn = v + uDt * (b * u - uuv + uDv * lap.y);
    gl_FragColor = vec4(un, vn, 0.0, 1.0);
  }
`;

// Fill with the steady state (a, b/a) plus a little noise.
const FILL_FRAG = `
  uniform float uA, uB, uSeed, uNoise;
  varying vec2 vUv;
  // Sine-free hash (Hoskins): sin() of large arguments is too coarse on some GPUs to make noise.
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx + uSeed) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    vec2 p = gl_FragCoord.xy;
    gl_FragColor = vec4(uA + uNoise * (hash(p) - 0.5) * 2.0, uB / uA + uNoise * (hash(p + 17.0) - 0.5) * 2.0, 0.0, 1.0);
  }
`;

export default {
  name: 'Brusselator Dish',
  description:
    'The Brusselator, the simplest chemistry that can both draw a pattern and keep time, in a round dish. ' +
    'Turning up the feed b, a pattern grows out of nothing exactly where Turing predicted, with the spacing he ' +
    'predicted (measured live by Fourier transform). Past the Hopf point the pattern holds, until the ' +
    'inhibitor slows down: then the whole dish starts to breathe, and three pacemakers send out rings.',
  tags: ['reaction-diffusion', 'chemistry', 'brusselator', 'turing', 'hopf', 'patterns', 'humor'],
  category: 'Reaction-Diffusion',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const tauAbs = RATE * t;
    const loop = Math.floor(tauAbs / PC);
    const tau = tauAbs - loop * PC;
    const b = ramp(tau, B_KEYS);
    const d = ramp(tau, D_KEYS);
    const fast = fastest(b, d);
    return {
      tauAbs, loop, tau, b, d,
      pace: ramp(tau, P_KEYS),
      bT: bT(d),
      sigma: fast.sigma,
      lamMax: (2 * Math.PI) / fast.k,
      lamC: (2 * Math.PI) / Math.sqrt(A / Math.sqrt(DU * DU * d)),
      // Filled in by update() from the dish itself.
      lamMeas: 0,
      std: 0,
    };
  },

  latex: (p, hl, m) => {
    const turing = m.b > m.bT;
    const hopf = m.b > B_H;
    const regime = turing ? (hopf ? 'Turing and Hopf both unstable' : 'Turing') : hopf ? 'Hopf: oscillating' : 'stable, well mixed';
    const patterned = m.std > 0.15;
    const spots = (2 / Math.sqrt(3)) * (Math.PI * (DX * SIZE / 2) ** 2) / (m.lamMeas * m.lamMeas);
    const line = beat(m.tau, [
      [0, 'The whole dish breathes. Three specks breathe faster and boss the rest around.'],
      [31, 'The inhibitor speeds up. Turing wants the dish back.'],
      [41, 'Turing wins, and keeps the rings as a souvenir. It usually wins at d = 8.'],
      [56, 'Feed cut. Everyone goes home.'],
      [68, 'Perfectly mixed. Nothing to see.'],
      [82, 'b is past the Turing line. Nobody has told the molecules where to stand.'],
      [100, patterned ? 'A pattern out of nothing, spaced as Turing predicted.' : 'Any moment now.'],
      [122, 'More feed. The stripes break up into spots.'],
      [138, `About ${Math.round(spots / 50) * 50} spots, all keeping the same distance. Nobody is in charge.`],
      [152, 'Past the Hopf point. The dish is allowed to oscillate. It declines.'],
      [159, 'The inhibitor slows to the activator\'s pace. The pattern loses its argument.'],
      [170, 'Back where we started. No reset needed; the chemistry did it.'],
    ]);
    return (
      '\\begin{aligned}' +
      '\\partial_t u &= a - (b+1)u + u^2 v + D_u\\nabla^2 u \\\\' +
      '\\partial_t v &= b\\,u - u^2 v + D_v \\nabla^2 v \\\\' +
      `a &= 2,\\ \\ b = ${hl(m.b, 2)},\\ \\ d = \\tfrac{D_v}{D_u} = ${hl(m.d, 2)} \\\\` +
      `b_T &= \\big(1 + \\tfrac{a}{\\sqrt d}\\big)^2 = ${hl(m.bT, 2)},\\quad b_H = 1 + a^2 = 5\\quad (\\text{${regime}}) \\\\` +
      `\\lambda &= \\tfrac{2\\pi}{k_{\\text{max}}} = ${turing ? hl(m.lamMax, 1) : '\\text{—}'}\\ \\text{(theory)},\\quad ${patterned && turing ? hl(m.lamMeas, 1) : '\\text{—}'}\\ \\text{(dish, by FFT)} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  fragmentShader: `
    uniform sampler2D uField;
    uniform vec2 uResolution;
    uniform float uN, uPalette, uTime;
    varying vec2 vUv;

    float cellU(ivec2 i) { return texelFetch(uField, clamp(i, ivec2(0), ivec2(int(uN) - 1)), 0).r; }
    float uAt(vec2 p) {
      vec2 q = p - 0.5;
      ivec2 i0 = ivec2(floor(q));
      vec2 f = fract(q);
      f = f * f * (3.0 - 2.0 * f);   // smoothed weights: no visible cell edges
      return mix(mix(cellU(i0), cellU(i0 + ivec2(1, 0)), f.x), mix(cellU(i0 + ivec2(0, 1)), cellU(i0 + ivec2(1, 1)), f.x), f.y);
    }
    vec3 palette(float t, int k) {
      if (k == 1) return mix(mix(vec3(0.05, 0.01, 0.02), vec3(0.75, 0.12, 0.05), smoothstep(0.0, 0.5, t)), vec3(1.0, 0.85, 0.45), smoothstep(0.45, 1.0, t));
      if (k == 2) return mix(vec3(0.93, 0.91, 0.86), vec3(0.08, 0.09, 0.14), smoothstep(0.15, 0.75, t));
      vec3 c = mix(vec3(0.01, 0.03, 0.10), vec3(0.03, 0.42, 0.55), smoothstep(0.0, 0.45, t));
      return mix(c, vec3(0.95, 0.78, 0.40), smoothstep(0.5, 1.0, t));
    }

    void main() {
      float aspect = uResolution.x / uResolution.y;
      // Dish fills 68% of the height on wide screens, 92% of the width on tall ones, sitting low (the
      // equation is on top).
      vec2 c = (vUv - vec2(0.5, 0.42)) * vec2(aspect, 1.0) / (aspect < 1.0 ? 0.92 * aspect : 0.68);
      float r = length(c) * 2.0;
      vec3 bg = mix(vec3(0.035, 0.04, 0.06), vec3(0.008, 0.008, 0.014), clamp(length(vUv - 0.5) * 1.5, 0.0, 1.0));
      int k = int(uPalette + 0.5);
      if (k == 2) bg = mix(vec3(0.85, 0.83, 0.78), vec3(0.6, 0.58, 0.55), clamp(length(vUv - 0.5) * 1.4, 0.0, 1.0));
      if (r > 1.04) { gl_FragColor = vec4(bg, 1.0); return; }

      vec2 p = (c + 0.5) * uN;
      float u = uAt(p);
      // The concentration as a lit height field: a glossy relief.
      float e = 0.9;
      vec2 g = vec2(uAt(p + vec2(e, 0.0)) - uAt(p - vec2(e, 0.0)), uAt(p + vec2(0.0, e)) - uAt(p - vec2(0.0, e)));
      vec3 n = normalize(vec3(-g * 0.55, 1.0));
      vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
      float t = clamp((u - 0.45) / 6.0, 0.0, 1.0);
      t = pow(t, 0.75);
      vec3 col = palette(t, k);
      float diff = 0.55 + 0.45 * max(dot(n, L), 0.0);
      float spec = pow(max(dot(n, H), 0.0), 60.0) * (k == 2 ? 0.15 : 0.5);
      col = col * diff + spec * vec3(0.9, 0.95, 1.0);
      if (k != 2) col += palette(1.0, k) * pow(t, 3.0) * 0.35;     // the hot crests glow

      // Meniscus darkening and a thin glass rim.
      col *= 1.0 - 0.35 * smoothstep(0.85, 1.0, r);
      float rim = smoothstep(0.985, 1.0, r) * (1.0 - smoothstep(1.0, 1.04, r));
      col = mix(col, k == 2 ? vec3(0.3) : vec3(0.7, 0.8, 0.95), rim * 0.5);
      col = r > 1.0 ? mix(col, bg, smoothstep(1.0, 1.04, r)) : col;
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uField: { value: null }, uN: { value: SIZE }, uPalette: { value: 0 } };
  },

  setup(ctx) {
    const renderer = ctx.renderer;
    const floatOk = renderer.extensions.has('EXT_color_buffer_float');
    const makeTarget = () =>
      new THREE.WebGLRenderTarget(SIZE, SIZE, {
        type: floatOk ? THREE.FloatType : THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
      });
    const stepMaterial = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT,
      fragmentShader: STEP_FRAG,
      uniforms: {
        uState: { value: null }, uN: { value: SIZE }, uDt: { value: DT }, uDx: { value: DX }, uA: { value: A },
        uB: { value: B_LO }, uDv: { value: 8 }, uPace: { value: 0 }, uSeed: { value: 0 }, uEta: { value: 0.01 },
        uPm: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
      },
    });
    const fillMaterial = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT,
      fragmentShader: FILL_FRAG,
      uniforms: { uA: { value: A }, uB: { value: 6 }, uSeed: { value: 0 }, uNoise: { value: 0.02 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stepMaterial);
    quad.frustumCulled = false;
    const passScene = new THREE.Scene();
    passScene.add(quad);
    const state = {
      targets: [makeTarget(), makeTarget()],
      read: 0,
      stepMaterial,
      fillMaterial,
      quad,
      passScene,
      passCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      tauSim: 0,
      pmSet: null,
      pixels: new Float32Array(WIN * WIN * 4),
      lastMeasure: -1,
      lamMeas: 0,
      std: 0,
    };
    return state;
  },

  update(ctx, state) {
    const renderer = ctx.renderer;
    const m = ctx.motion;
    state.uniforms.uPalette.value = ctx.params.palette;

    // On load, or far behind after a hidden tab: a fresh, stirred dish.
    if (state.tauSim === 0 || m.tauAbs - state.tauSim > LAG_RESET) {
      state.tauSim = m.tauAbs;
      const fm = state.fillMaterial;
      fm.uniforms.uB.value = m.b;
      fm.uniforms.uSeed.value = (m.loop * 12.9898) % 100;
      state.quad.material = fm;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(state.targets[state.read]);
      renderer.render(state.passScene, state.passCamera);
      renderer.setRenderTarget(prev);
    }
    // Pacemakers move somewhere new while they are switched off (τ = 100), kept away from the wall.
    const pmSet = m.loop + (m.tau >= 100 ? 1 : 0);
    if (pmSet !== state.pmSet) {
      state.pmSet = pmSet;
      state.stepMaterial.uniforms.uPm.value.forEach((v, i) => {
        const ang = pmSet * GOLDEN + (i * 2 * Math.PI) / 3;
        const rad = SIZE * (0.12 + 0.1 * i);
        v.set(SIZE / 2 + rad * Math.cos(ang), SIZE / 2 + rad * Math.sin(ang));
      });
    }

    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor((m.tauAbs - state.tauSim) / DT + 1e-6));
    if (steps > 0) {
      const sm = state.stepMaterial;
      sm.uniforms.uB.value = m.b;
      sm.uniforms.uDv.value = m.d * DU;
      sm.uniforms.uPace.value = m.pace;
      state.quad.material = sm;
      const prev = renderer.getRenderTarget();
      for (let i = 0; i < steps; i++) {
        sm.uniforms.uState.value = state.targets[state.read].texture;
        sm.uniforms.uSeed.value = (sm.uniforms.uSeed.value + 61.7) % 997;
        renderer.setRenderTarget(state.targets[1 - state.read]);
        renderer.render(state.passScene, state.passCamera);
        state.read = 1 - state.read;
      }
      renderer.setRenderTarget(prev);
      state.tauSim += steps * DT;
    }

    // Measure the pattern's wavelength from the middle of the dish, twice a second.
    if (ctx.time - state.lastMeasure > 0.5) {
      state.lastMeasure = ctx.time;
      const o = (SIZE - WIN) / 2;
      renderer.readRenderTargetPixels(state.targets[state.read], o, o, WIN, WIN, state.pixels);
      const r = measure(state.pixels);
      state.lamMeas = r.lambda;
      state.std = r.std;
    }
    m.lamMeas = state.lamMeas;
    m.std = state.std;
    state.uniforms.uField.value = state.targets[state.read].texture;
  },

  dispose(ctx, state) {
    state.targets.forEach((t) => t.dispose());
    state.stepMaterial.dispose();
    state.fillMaterial.dispose();
    state.quad.geometry.dispose();
  },
};
