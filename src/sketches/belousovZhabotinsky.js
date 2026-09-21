import * as THREE from 'three';

// The Belousov–Zhabotinsky reaction, as a reaction–diffusion PDE on the GPU.
//
// Model: the two-variable (Tyson–Fife) reduction of the Oregonator, the
// standard minimal model of the BZ chemistry (Field–Körös–Noyes mechanism):
//
//     ε ∂ₜu = u(1−u) − f v (u−q)/(u+q) + ∇²u          u ~ [HBrO₂]   (activator)
//         ∂ₜv = u − v                                  v ~ oxidised catalyst (Fe³⁺ / ferriin)
//
// ε = 0.05, q = 0.002, and f — the stoichiometric factor (how much bromide the
// catalyst cycle releases) — is the control parameter. The uniform steady state
// (u*, v*) satisfies (1−u*)(u*+q) = f(u*−q) and its Jacobian
//     J = [[F_u/ε, F_v/ε], [1, −1]]
// changes stability at a Hopf bifurcation: for larger f it is a stable focus
// (the medium is *excitable*: a suprathreshold kick launches a travelling
// wave, and waves can curl into spirals); for smaller f it is an unstable
// focus (the medium *oscillates* on its own; measured period ≈ 5).
//
// The loop below is an actual BZ experiment, in chemical time τ (one loop = 100):
//
//    0 –  3   quiet dish, f = 3.2 (excitable)
//    3        a spot is stimulated → a target wave expands
//    8        the ring is cut across a diameter → its free ends curl into a
//             counter-rotating spiral pair (orientation turns by the golden
//             angle each loop, so no two loops are identical)
//    8 – 45   spiral waves fill the dish
//   45 – 95   f is swept down through the Hopf point and back:
//                 f(τ) = 3.2 − 1.8 sin²(π(τ − 45)/50)   (min 1.4 at τ = 70)
//             waves crowd together and speed up; the spirals, firing faster than
//             the medium's own period, keep it entrained
//   95 – 99   quench: inhibitor floods the dish (v → 0.75), every wave dies
//   99 – 100  the dish recovers to rest, and the loop restarts
//
// Numerics (checked on the CPU first): the reaction term is stiff — its
// Jacobian contains 2q/(u+q)² — so each cell does a backward-Euler step of the
// reaction with 4 Newton iterations, explicit 5-point diffusion, and an
// exponential update for v. dt = 0.02 (diffusion needs ≤ 0.2·dx²), dx = 0.45.
// The 0D kinetics at dt = 0.02 vs 0.002 agree to ~2% (period and amplitude);
// the 1D front speed (6.4) is converged between dx = 0.1 and 0.05. The dish is
// circular with no-flux walls. Float32 state — half floats lose the small
// increments to v.

const SIZE = 512; // cells across the dish
const DX = 0.45; // space units per cell
const DT = 0.02;
const EPS = 0.05;
const Q = 0.002;
const PC = 100; // chemical-time length of one loop
const RATE = 4; // chemical time units per second of motion
const F_HI = 3.2;
const F_LO = 1.4;
const MAX_STEPS_PER_FRAME = 60;
const LAG_RESET = 40; // chemical time units (10 s of motion) the sim may fall behind before we resync
const GOLDEN = 2.399963229728653;

const SPECIES = ['Ferroin (colour)', 'HBrO₂ (activator u)', 'Ferriin (catalyst v)'];

const steady = (f) => (-(f + Q - 1) + Math.sqrt((f + Q - 1) ** 2 + 4 * Q * (1 + f))) / 2;

function fOf(tau) {
  if (tau < 45 || tau >= 95) return F_HI;
  const s = Math.sin((Math.PI * (tau - 45)) / 50);
  return F_HI - (F_HI - F_LO) * s * s;
}

// Largest eigenvalue of the uniform steady state at this f.
function linearStability(f) {
  const s = steady(f);
  const Fu = 1 - 2 * s - (f * s * 2 * Q) / (s + Q) ** 2;
  const Fv = (-f * (s - Q)) / (s + Q);
  const a = Fu / EPS;
  const b = Fv / EPS;
  const T = a - 1;
  const D = -a - b;
  const disc = (T * T) / 4 - D;
  return disc < 0 ? { re: T / 2, im: Math.sqrt(-disc) } : { re: T / 2 + Math.sqrt(disc), im: 0 };
}

const STAGES = [
  [0, 3, 'quiet dish'],
  [3, 8, 'stimulus: target wave'],
  [8, 45, 'wave cut: spiral pair'],
  [45, 95, 'sweeping f through the Hopf point'],
  [95, 100, 'quench: inhibitor floods the dish'],
];
const stageOf = (tau) => (STAGES.find(([a, b]) => tau >= a && tau < b) || STAGES[0])[2];

// ---------------------------------------------------------------- GPU passes

const PASS_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const STEP_FRAG = `
  uniform sampler2D uState;    // r = u, g = v
  uniform float uN;
  uniform float uDt;
  uniform float uDx;
  uniform float uEps;
  uniform float uQ;
  uniform float uF;
  uniform float uQuench;
  varying vec2 vUv;

  bool inDish(ivec2 p) {
    vec2 c = vec2(p) + 0.5 - 0.5 * uN;
    return length(c) < 0.5 * uN - 1.0;
  }
  float nb(ivec2 q, float centre) {           // no-flux wall: outside neighbours mirror the centre
    return inDish(q) ? texelFetch(uState, q, 0).r : centre;
  }

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    if (!inDish(p)) { gl_FragColor = vec4(0.0); return; }

    vec2 s0 = texelFetch(uState, p, 0).rg;
    float u = s0.x, v = s0.y;

    float lap = nb(p + ivec2(-1, 0), u) + nb(p + ivec2(1, 0), u)
              + nb(p + ivec2(0, -1), u) + nb(p + ivec2(0, 1), u) - 4.0 * u;
    float ut = u + (uDt / (uDx * uDx)) * lap;   // explicit diffusion

    // Reaction: backward Euler, w - ut - (dt/eps) R(w) = 0, by Newton.
    float w = ut;
    for (int it = 0; it < 4; it++) {
      float R  = w * (1.0 - w) - uF * v * (w - uQ) / (w + uQ);
      float g  = w - ut - (uDt / uEps) * R;
      float dR = 1.0 - 2.0 * w - uF * v * 2.0 * uQ / ((w + uQ) * (w + uQ));
      w -= g / (1.0 - (uDt / uEps) * dR);
      w = clamp(w, 0.0, 1.5);
    }
    float vn = w + (v - w) * exp(-uDt);          // dv/dt = u - v, exact for constant u
    if (uQuench > 0.5) vn = min(vn + 0.35 * uDt, 0.75);
    gl_FragColor = vec4(w, vn, 0.0, 1.0);
  }
`;

// One-shot events: fill with rest state, stimulate a spot, cut across a diameter.
const EVENT_FRAG = `
  uniform sampler2D uState;
  uniform float uN;
  uniform float uDx;
  uniform float uMode;         // 0 fill, 1 stimulate, 2 cut
  uniform vec2 uCenter;        // space units from the dish centre
  uniform float uRadius;
  uniform vec2 uDir;           // cut: erase the half-plane dot(pos, uDir) > 0
  uniform vec2 uRest;
  varying vec2 vUv;

  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 s = texelFetch(uState, p, 0).rg;
    vec2 pos = (gl_FragCoord.xy - 0.5 * uN) * uDx;
    if (uMode < 0.5) {
      s = uRest;
    } else if (uMode < 1.5) {
      if (length(pos - uCenter) < uRadius) s.x = 0.8;
    } else {
      if (dot(pos, uDir) > 0.0 && length(pos) < uRadius) s = uRest;
    }
    gl_FragColor = vec4(s, 0.0, 1.0);
  }
`;

export default {
  name: 'Belousov–Zhabotinsky',
  description:
    'The BZ reaction as it is actually run: an Oregonator reaction–diffusion dish on the GPU. A stimulus launches a ' +
    'target wave, cutting it breaks it into a spiral pair, the stoichiometric factor f is then swept down through the ' +
    "Hopf bifurcation where the medium starts to oscillate on its own (the spirals keep it entrained) and back, and " +
    'an inhibitor quench resets the dish. Colour is ferroin: reduced red, oxidised blue. The equation shows f, the ' +
    'steady state’s eigenvalue and the stage live; poke the dish to add your own waves.',
  tags: ['reaction-diffusion', 'chemistry', 'oregonator', 'excitable-media', 'simulation'],
  category: 'Reaction-Diffusion',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const tauAbs = RATE * t;
    const loop = Math.floor(tauAbs / PC);
    const tau = tauAbs - loop * PC;
    const f = fOf(tau);
    const { re, im } = linearStability(f);
    return { tauAbs, loop, tau, f, re, im, quench: tau >= 95 && tau < 99 ? 1 : 0 };
  },

  latex: (p, hl, m) => {
    const sweeping = m.tau >= 45 && m.tau < 95;
    const fRow = sweeping
      ? `f(\\tau) = 3.2 - 1.8\\sin^2\\tfrac{\\pi(\\tau-45)}{50} = ${hl(m.f, 2)}`
      : `f = ${hl(m.f, 2)}\\ (\\text{held})`;
    const regime = m.re < 0 ? 'excitable' : 'oscillatory';
    const lam =
      m.im > 1e-9
        ? `${hl(m.re, 1)} \\pm ${hl(m.im, 1)}\\,i`
        : hl(m.re, 1);
    return (
      '\\begin{array}{l}' +
      '\\varepsilon\\,\\partial_t u = u(1-u) - f\\,v\\,\\tfrac{u-q}{u+q} + \\nabla^2 u,\\qquad \\partial_t v = u - v \\\\' +
      'u \\leftrightarrow [\\mathrm{HBrO_2}],\\ \\ v \\leftrightarrow [\\mathrm{Fe^{3+}}],\\ \\ \\varepsilon = 0.05,\\ q = 0.002 \\\\' +
      `${fRow},\\quad \\lambda_{*} = ${lam}\\ \\text{(${regime})} \\\\` +
      `\\tau = ${hl(m.tau, 0)}\\ \\text{— ${stageOf(m.tau)}}` +
      '\\end{array}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 4 },
    species: { value: 0, min: 0, max: SPECIES.length - 1, step: 1, options: SPECIES },
  },

  actions: {
    poke: {
      label: 'Poke the dish',
      run(ctx, state) {
        // A random spot well inside the dish.
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * SIZE * DX * 0.4;
        state.pending?.push({ type: 'stim', x: Math.cos(a) * r, y: Math.sin(a) * r });
      },
    },
  },

  fragmentShader: `
    uniform sampler2D uField;
    uniform vec2 uResolution;
    uniform float uN;
    uniform float uSpecies;
    varying vec2 vUv;

    vec2 cell(ivec2 i) {
      ivec2 c = clamp(i, ivec2(0), ivec2(int(uN) - 1));
      return texelFetch(uField, c, 0).rg;
    }
    // Bilinear on the float texture (no linear filtering needed).
    vec2 stateAt(vec2 p) {
      vec2 q = p - 0.5;
      ivec2 i0 = ivec2(floor(q));
      vec2 f = fract(q);
      return mix(mix(cell(i0), cell(i0 + ivec2(1, 0)), f.x),
                 mix(cell(i0 + ivec2(0, 1)), cell(i0 + ivec2(1, 1)), f.x), f.y);
    }

    void main() {
      // Dish fills 92% of the screen height, centred.
      vec2 c = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) / 0.92;   // dish radius = 0.5
      float r = length(c) * 2.0;                                                 // 1 at the rim
      vec3 bg = mix(vec3(0.05, 0.05, 0.07), vec3(0.015, 0.015, 0.025), clamp(length(vUv - 0.5) * 1.6, 0.0, 1.0));

      if (r > 1.03) { gl_FragColor = vec4(bg, 1.0); return; }

      vec2 st = stateAt((c + 0.5) * uN);
      float u = st.x, v = st.y;
      int mode = int(uSpecies + 0.5);
      vec3 col;
      if (mode == 1) {
        float t = clamp(u / 0.7, 0.0, 1.0);
        col = mix(vec3(0.02, 0.03, 0.10), vec3(0.98, 0.85, 0.35), pow(t, 0.7));
      } else if (mode == 2) {
        float t = clamp(v / 0.6, 0.0, 1.0);
        col = mix(vec3(0.72, 0.12, 0.08), vec3(0.08, 0.36, 0.85), t);
      } else {
        // Ferroin: reduced Fe(II) is red, oxidised Fe(III) is blue. The wave front
        // (high u) is where the catalyst is being oxidised, so it reads as a bright edge.
        float ox = smoothstep(0.0, 0.5, v);
        float front = smoothstep(0.05, 0.6, u);
        col = mix(vec3(0.70, 0.12, 0.08), vec3(0.07, 0.34, 0.82), ox);
        col = mix(col, vec3(0.55, 0.82, 1.0), front * 0.75);
      }

      // Liquid depth: meniscus darkening toward the wall, plus a thin glass rim.
      col *= 1.0 - 0.3 * smoothstep(0.8, 1.0, r);
      float rim = smoothstep(0.985, 1.0, r) * (1.0 - smoothstep(1.0, 1.03, r));
      col = mix(col, vec3(0.75, 0.8, 0.9), rim * 0.55);
      col = r > 1.0 ? mix(col, bg, smoothstep(1.0, 1.03, r)) : col;
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uField: { value: null },
      uN: { value: SIZE },
      uSpecies: { value: 0 },
    };
  },

  setup(ctx) {
    const renderer = ctx.renderer;
    // Float32 state: half floats drop the small per-step increments of v.
    const floatOk = renderer.extensions.has('EXT_color_buffer_float');
    if (!floatOk) console.warn('EXT_color_buffer_float unavailable: falling back to half-float, BZ dynamics will be inaccurate.');
    const makeTarget = () =>
      new THREE.WebGLRenderTarget(SIZE, SIZE, {
        type: floatOk ? THREE.FloatType : THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });

    const stepMaterial = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT,
      fragmentShader: STEP_FRAG,
      uniforms: {
        uState: { value: null },
        uN: { value: SIZE },
        uDt: { value: DT },
        uDx: { value: DX },
        uEps: { value: EPS },
        uQ: { value: Q },
        uF: { value: F_HI },
        uQuench: { value: 0 },
      },
    });
    const eventMaterial = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT,
      fragmentShader: EVENT_FRAG,
      uniforms: {
        uState: { value: null },
        uN: { value: SIZE },
        uDx: { value: DX },
        uMode: { value: 0 },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 3 },
        uDir: { value: new THREE.Vector2(0, 1) },
        uRest: { value: new THREE.Vector2() },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stepMaterial);
    quad.frustumCulled = false;
    const passScene = new THREE.Scene();
    passScene.add(quad);
    const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const state = {
      targets: [makeTarget(), makeTarget()],
      read: 0,
      stepMaterial,
      eventMaterial,
      quad,
      passScene,
      passCamera,
      tauSim: 0, // chemical time actually simulated so far (absolute)
      lastLoop: 0,
      done: { stim: false, cut: false },
      pending: [], // events queued by the "poke" action
    };

    // Start from the uniform rest state.
    const rest = steady(F_HI);
    runEvent(renderer, state, { mode: 0, rest: [rest, rest] });
    return state;
  },

  update(ctx, state) {
    const renderer = ctx.renderer;
    const m = ctx.motion;
    const u = state.uniforms; // runner-owned display uniforms
    u.uSpecies.value = ctx.params.species;

    // After a long pause (backgrounded tab) the motion clock has run far ahead of
    // the simulation. Don't replay the scripted events on top of each other:
    // resync to a quiet dish and only fire the events still to come this loop.
    if (m.tauAbs - state.tauSim > LAG_RESET) {
      const r0 = steady(m.f);
      runEvent(renderer, state, { mode: 0, rest: [r0, r0] });
      state.tauSim = m.tauAbs;
      state.lastLoop = m.loop;
      state.done.stim = m.tau >= 3;
      state.done.cut = m.tau >= 8;
    }

    // New loop: re-arm the scripted events.
    if (m.loop !== state.lastLoop) {
      state.lastLoop = m.loop;
      state.done.stim = false;
      state.done.cut = false;
    }

    const rest = steady(m.f);
    const angle = m.loop * GOLDEN;
    const dir = [Math.cos(angle), Math.sin(angle)];

    // Scripted protocol events, then user pokes.
    if (m.tau >= 3 && !state.done.stim) {
      state.done.stim = true;
      runEvent(renderer, state, { mode: 1, center: [0, 0], radius: 3 });
    }
    if (m.tau >= 8 && !state.done.cut) {
      state.done.cut = true;
      runEvent(renderer, state, { mode: 2, dir, radius: 38, rest: [rest, rest] });
    }
    while (state.pending.length) {
      const p = state.pending.shift();
      runEvent(renderer, state, { mode: 1, center: [p.x, p.y], radius: 3 });
    }

    // Catch the simulation up to chemical time, at a fixed dt.
    let steps = Math.floor((m.tauAbs - state.tauSim) / DT + 1e-6);
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME; // fall behind rather than stall the frame
    }
    if (steps > 0) {
      const prevTarget = renderer.getRenderTarget();
      const sm = state.stepMaterial;
      sm.uniforms.uF.value = m.f;
      sm.uniforms.uQuench.value = m.quench;
      state.quad.material = sm;
      for (let i = 0; i < steps; i++) {
        sm.uniforms.uState.value = state.targets[state.read].texture;
        renderer.setRenderTarget(state.targets[1 - state.read]);
        renderer.render(state.passScene, state.passCamera);
        state.read = 1 - state.read;
      }
      renderer.setRenderTarget(prevTarget);
      state.tauSim += steps * DT;
    }
    u.uField.value = state.targets[state.read].texture;
  },

  dispose(ctx, state) {
    state.targets.forEach((t) => t.dispose());
    state.stepMaterial.dispose();
    state.eventMaterial.dispose();
    state.quad.geometry.dispose();
  },
};

// Applies one event pass (fill / stimulate / cut) to the current state.
function runEvent(renderer, state, ev) {
  const em = state.eventMaterial;
  em.uniforms.uState.value = state.targets[state.read].texture;
  em.uniforms.uMode.value = ev.mode;
  if (ev.center) em.uniforms.uCenter.value.set(ev.center[0], ev.center[1]);
  if (ev.radius) em.uniforms.uRadius.value = ev.radius;
  if (ev.dir) em.uniforms.uDir.value.set(ev.dir[0], ev.dir[1]);
  if (ev.rest) em.uniforms.uRest.value.set(ev.rest[0], ev.rest[1]);
  state.quad.material = em;
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(state.targets[1 - state.read]);
  renderer.render(state.passScene, state.passCamera);
  renderer.setRenderTarget(prevTarget);
  state.read = 1 - state.read;
}
