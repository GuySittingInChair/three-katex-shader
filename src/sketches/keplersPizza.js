import * as THREE from 'three';
import { TAU, clamp01, lerp, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption, mood } from '../lib/bit.js';

// Kepler's second law, sold by the slice. A planet orbits a star (the oven) at the focus of an ellipse,
// and each orbit is cut into K slices, one per equal stretch of time. Kepler (1609): the line from the
// star to the planet sweeps equal areas in equal times, so every slice holds exactly the same pizza,
// πab/K, however long and thin or short and fat it is. That is conservation of angular momentum:
// dA/dt = h/2 with h = r²ν̇ constant.
//
// Where the planet is at time t comes from Kepler's equation. The mean anomaly M = 2πt/T grows evenly;
// solve M = E − e sin E for the eccentric anomaly E (Newton's method, a few steps), then
//     x = a(cos E − e),  y = b sin E,  r = a(1 − e cos E),  ν = 2 atan(√((1+e)/(1−e)) tan(E/2)).
// The slice boundaries are the points at M = 2πk/K. Swept area grows as (ab/2)·M, which is why equal
// steps of M are equal slices. Checked in Node by summing triangles (4000 per slice): the 12 slices agree
// with πab/12 to 6 digits at e = 0, 0.3, 0.55 and 0.75.
//
// The loop is a real flight plan. Units are the Sun's: distances in AU, times in years, so Kepler's
// third law reads T² = a³. Every orbit starts at perihelion q = 1 AU, and at perihelion the engine fires
// along the motion. That keeps q and raises the eccentricity: v_p = √(GM(1+e)/q), 29.78 km/s × √(1+e).
// The orbits go e = 0 → 0.3 → 0.55 → 0.75, then retro burns bring it back down to the circle, so the
// loop closes without cheating: same place, same speed (fuel is not refunded). Since a = q/(1 − e), the
// big orbits are slower: T = a^{3/2}, 8 years at e = 0.75. One year plays in 2.4 s.

const Q = 1;                                   // perihelion distance, AU
const V_EARTH = 29.78;                         // km/s, circular speed at 1 AU
const YEAR = 2.4;                              // seconds of motion time per year
const ES = [0, 0.3, 0.55, 0.75, 0.55, 0.3];
const ORBITS = ES.map((e) => {
  const a = Q / (1 - e);
  return { e, a, b: a * Math.sqrt(1 - e * e), T: a ** 1.5 };
});
const STARTS = [];
let LOOP = 0;
for (const o of ORBITS) { STARTS.push(LOOP); LOOP += o.T * YEAR; }
const PIZZAS_PER_AU2 = 1.495978707e11 ** 2 / (Math.PI * 0.1778 ** 2); // a large pizza is 14 inches across

const solveE = (M, e) => {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
};

// Position in the orbit plane (x toward perihelion, y along the motion there) at mean anomaly M.
const at = (o, M) => {
  const E = solveE(M, o.e);
  return { x: o.a * (Math.cos(E) - o.e), y: o.b * Math.sin(E), E };
};

// Slices: K fans of triangles from the star. Each vertex knows its slice k and how far along it is (u),
// and the vertex shader finds its place on the ellipse by solving Kepler's equation itself.
const SUB = 28;
const SLICE_VERT = `
  attribute vec3 aSlice;          // k, u, rim (0 = star, 1 = on the orbit)
  uniform float uE, uA, uK;
  varying vec3 vSlice;
  void main() {
    vSlice = aSlice;
    float M = 6.2831853 * (aSlice.x + aSlice.y) / uK;
    float E = M;
    for (int i = 0; i < 10; i++) E -= (E - uE * sin(E) - M) / (1.0 - uE * cos(E));
    float b = uA * sqrt(1.0 - uE * uE);
    vec2 p = vec2(uA * (cos(E) - uE), b * sin(E)) * aSlice.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, 0.0, -p.y, 1.0);
  }
`;
const SLICE_FRAG = `
  uniform float uSwept, uK, uFade;
  varying vec3 vSlice;
  void main() {
    float k = floor(vSlice.x + 0.5);
    float pos = k + vSlice.y;
    float swept = step(pos, uSwept);
    float current = step(k, uSwept) * step(uSwept, k + 1.0);
    // Warm tones, alternating, drifting round the orbit from amber to rose.
    vec3 warm = mix(vec3(1.0, 0.58, 0.14), vec3(0.95, 0.22, 0.55), k / uK);
    vec3 col = mix(warm, warm.gbr * 0.6 + vec3(0.25, 0.1, 0.35), 0.35 * mod(k, 2.0));
    float rim = 0.25 + 0.75 * vSlice.z * vSlice.z;
    float a = (0.03 + swept * (0.3 + 0.12 * current)) * rim * uFade;
    gl_FragColor = vec4(col * a * 2.6, 1.0);
  }
`;

const SPRITE_VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const SPRITE_FRAG = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = exp(-d * d * 18.0);
    float halo = exp(-d * d * 3.5) * 0.25;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;

function sliceGeometry(K) {
  const data = [];
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < SUB; j++) {
      const u0 = j / SUB;
      const u1 = (j + 1) / SUB;
      data.push(k, u0, 0, k, u0, 1, k, u1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(data);
  g.setAttribute('aSlice', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr.length), 3));
  return g;
}

export default {
  name: "Kepler's Pizza",
  description:
    'A planet orbits a star, and each orbit is sliced into equal stretches of time. The slices look ' +
    'nothing alike, long and thin far out, short and fat near the star, but every one holds exactly the same ' +
    'area: Kepler\'s second law. Engine burns at the closest point stretch the orbit, and the bigger orbits ' +
    'take longer, by Kepler\'s third law, T² = a³.',
  tags: ['physics', 'astronomy', 'kepler', 'orbits', 'gravity', 'humor'],
  category: 'Physics',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const tl = ((t % LOOP) + LOOP) % LOOP;
    let i = ORBITS.length - 1;
    while (STARTS[i] > tl) i--;
    const o = ORBITS[i];
    const prev = ORBITS[(i + ORBITS.length - 1) % ORBITS.length];
    const since = tl - STARTS[i];
    const M = (TAU * since) / (o.T * YEAR);
    const { x, y, E } = at(o, M);
    const r = o.a * (1 - o.e * Math.cos(E));
    const nu = Math.atan2(y, x);
    // ṙ = e sin ν · √(GM/p); in AU per year with GM = 4π².
    const p = o.a * (1 - o.e * o.e);
    const rdot = o.e * Math.sin(nu) * Math.sqrt((4 * Math.PI * Math.PI) / p);
    const speed = V_EARTH * Math.sqrt(2 / r - 1 / o.a);
    const ease = smooth(clamp01(since / 2.2));
    return {
      i,
      e: o.e,
      a: o.a,
      b: o.b,
      T: o.T,
      M,
      E,
      nu: ((nu * 180) / Math.PI + 360) % 360,
      r,
      rdot,
      speed,
      x,
      y,
      since,
      dv: V_EARTH * (Math.sqrt(1 + o.e) - Math.sqrt(1 + prev.e)),
      raising: o.e > prev.e ? 1 : 0,
      // Camera framing glides from the last orbit to this one.
      frameA: lerp(prev.a * (1 + prev.e * 0.35), o.a * (1 + o.e * 0.35), ease),
      frameX: lerp(-prev.a * prev.e, -o.a * o.e, ease),
      fade: smooth(clamp01(since / 0.6)),
    };
  },

  latex: (params, hl, m) => {
    const K = Math.round(params.slices ?? 12);
    const area = (Math.PI * m.a * m.b) / K;
    const pizzas = area * PIZZAS_PER_AU2;
    const exp = Math.floor(Math.log10(pizzas));
    const line =
      m.since < 2 * YEAR * 0.35 && m.dv !== 0
        ? m.raising
          ? `Burn at perihelion. Longer route, same pizza per second.`
          : m.e === 0
            ? 'Retro burn, back to a circle. Every slice a normal slice. Fuel not refunded.'
            : 'Retro burn. Shorter route.'
        : m.e === 0
          ? 'Circular orbit. Every slice a normal slice.'
          : mood([m.rdot], {
              '-': 'Falling toward the oven. Speeding up. Slices getting short and fat.',
              '+': 'Climbing away. Slowing down. Slices getting long and thin. Same pizza.',
              0: 'Turning point.',
            }, 1e-6);
    return (
      '\\begin{aligned}' +
      `r &= \\frac{a(1-e^2)}{1+e\\cos\\nu} = \\frac{${hl(m.a, 2)}(1-${hl(m.e, 2)}^2)}{1+${hl(m.e, 2)}\\cos ${hl(m.nu, 0)}^\\circ} = ${hl(m.r, 2)}\\ \\text{AU} \\\\` +
      `M &= E - e\\sin E:\\quad ${hl(m.M, 2)} = ${hl(m.E, 2)} - ${hl(m.e, 2)}\\sin ${hl(m.E, 2)},\\quad |v| = ${hl(m.speed, 1)}\\ \\text{km/s} \\\\` +
      `T^2 &= a^3:\\quad ${hl(m.T, 2)}^2 = ${hl(m.a, 2)}^3\\ \\ (\\text{years, AU}),\\quad \\Delta v_{\\text{burn}} = ${hl(m.dv, 2)}\\ \\text{km/s} \\\\` +
      `\\text{each slice} &= \\frac{\\pi a b}{${K}} = ${hl(area, 3)}\\ \\text{AU}^2 = ${hl(pizzas / 10 ** exp, 1)}\\times10^{${exp}}\\ \\text{large pizzas} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    slices: { value: 12, min: 4, max: 24, step: 1 },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x030308);
    camera.near = 0.05;
    camera.far = 400;
    const glow = createGlow(ctx, { fov: 42, strength: 0.85, threshold: 0.55, exposure: 1, vignette: 0.55 });
    camera.position.set(-1.2, 4.2, 4.6);
    ctx.controls?.target.set(0, 0, 0);
    ctx.controls?.update();

    const sliceMat = new THREE.ShaderMaterial({
      vertexShader: SLICE_VERT,
      fragmentShader: SLICE_FRAG,
      uniforms: { uE: { value: 0 }, uA: { value: 1 }, uK: { value: 12 }, uSwept: { value: 0 }, uFade: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const slices = new THREE.Mesh(sliceGeometry(12), sliceMat);
    slices.frustumCulled = false;
    scene.add(slices);

    const lines = createFatLines({ maxSegments: 1800, width: 1.6 });
    const bright = createFatLines({ maxSegments: 400, width: 2.6 });
    scene.add(lines.object, bright.object);

    // Star, planet and burn flash as glowing sprites; a few thousand faint background stars.
    const spriteMat = (scale) =>
      new THREE.ShaderMaterial({
        vertexShader: SPRITE_VERT,
        fragmentShader: SPRITE_FRAG,
        uniforms: { uScale: { value: scale } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
    const bodies = new THREE.BufferGeometry();
    bodies.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    bodies.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(9), 3));
    bodies.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(3), 1));
    const bodyMat = spriteMat(1);
    const bodyPts = new THREE.Points(bodies, bodyMat);
    bodyPts.frustumCulled = false;
    bodyPts.renderOrder = 5;
    scene.add(bodyPts);

    const NS = 2500;
    const stars = new THREE.BufferGeometry();
    const sp = new Float32Array(3 * NS);
    const sc = new Float32Array(3 * NS);
    const ss = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(150);
      sp.set([v.x, v.y, v.z], 3 * i);
      const w = 0.12 + 0.35 * Math.random() ** 4;
      const warm = Math.random();
      sc.set([w * (0.8 + 0.2 * warm), w * 0.85, w * (1.05 - 0.25 * warm)], 3 * i);
      ss[i] = 0.5 + Math.random();
    }
    stars.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
    stars.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
    const starMat = spriteMat(1);
    const starPts = new THREE.Points(stars, starMat);
    starPts.frustumCulled = false;
    scene.add(starPts);

    return { glow, slices, sliceMat, K: 12, lines, bright, bodies, bodyMat, starMat, dir: new THREE.Vector3(), c: new THREE.Color(), v: new THREE.Vector3(), w: new THREE.Vector3() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { lines, bright, c, v, w } = state;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);
    bright.setResolution(width, height);

    const K = Math.round(ctx.params.slices ?? 12);
    if (K !== state.K) {
      state.slices.geometry.dispose();
      state.slices.geometry = sliceGeometry(K);
      state.K = K;
    }
    const u = state.sliceMat.uniforms;
    u.uE.value = m.e;
    u.uA.value = m.a;
    u.uK.value = K;
    u.uSwept.value = (m.M / TAU) * K;
    u.uFade.value = m.fade;

    const P = (x, y, out) => out.set(x, 0, -y);

    // Every orbit of the flight plan, faint; the current one bright, with its slice cuts.
    lines.reset();
    bright.reset();
    const N = 160;
    for (const o of ORBITS.slice(0, 4)) {
      const current = o.e === m.e;
      const target = current ? bright : lines;
      const k = current ? 0.55 : 0.12;
      for (let j = 0; j < N; j++) {
        const t0 = (TAU * j) / N;
        const t1 = (TAU * (j + 1)) / N;
        P(o.a * (Math.cos(t0) - o.e), o.b * Math.sin(t0), v);
        P(o.a * (Math.cos(t1) - o.e), o.b * Math.sin(t1), w);
        c.setRGB(0.55 * k, 0.75 * k, 1.0 * k);
        target.push(v, w, c);
      }
    }
    const o = ORBITS[m.i];
    for (let k = 0; k < K; k++) {
      const q = at(o, (TAU * k) / K);
      P(q.x, q.y, w);
      v.set(0, 0, 0);
      const lit = (m.M / TAU) * K >= k ? 0.5 : 0.15;
      c.setRGB(1.0 * lit * m.fade, 0.7 * lit * m.fade, 0.4 * lit * m.fade);
      lines.push(v, w, c);
    }
    // Trail: the last fifth of an orbit behind the planet, fading out.
    const TR = 90;
    for (let j = 0; j < TR; j++) {
      const M0 = m.M - (0.2 * TAU * (j + 1)) / TR;
      const M1 = m.M - (0.2 * TAU * j) / TR;
      if (M0 < 0) break;
      const a0 = at(o, M0);
      const a1 = at(o, M1);
      P(a0.x, a0.y, v);
      P(a1.x, a1.y, w);
      const f = (1 - j / TR) ** 2 * 1.6;
      c.setRGB(0.5 * f, 0.9 * f, 1.2 * f);
      bright.push(v, w, c);
    }
    lines.commit();
    bright.commit();

    // Bodies: oven (star), planet, burn flash.
    const pos = state.bodies.attributes.position.array;
    const col = state.bodies.attributes.aColor.array;
    const size = state.bodies.attributes.aSize.array;
    const flicker = 1 + 0.04 * Math.sin(ctx.time * 7.3) + 0.03 * Math.sin(ctx.time * 11.1);
    pos.set([0, 0, 0], 0);
    col.set([2.6 * flicker, 1.3 * flicker, 0.45 * flicker], 0);
    size[0] = 1.6;
    P(m.x, m.y, v);
    pos.set([v.x, v.y, v.z], 3);
    col.set([0.9, 1.5, 2.2], 3);
    size[1] = 0.7;
    const burn = m.dv !== 0 ? Math.exp(-m.since / 0.35) : 0;
    pos.set([v.x, v.y, v.z], 6);
    col.set([2.5 * burn, 1.4 * burn, 0.6 * burn], 6);
    size[2] = 0.6 + 1.4 * (1 - burn);
    state.bodies.attributes.position.needsUpdate = true;
    state.bodies.attributes.aColor.needsUpdate = true;
    state.bodies.attributes.aSize.needsUpdate = true;
    state.bodyMat.uniforms.uScale.value = height * 0.5;
    state.starMat.uniforms.uScale.value = height * 0.5;

    // Frame the current orbit, keeping whatever direction the viewer has turned the camera to.
    const ctl = ctx.controls;
    if (ctl) {
      state.dir.copy(ctx.camera.position).sub(ctl.target).normalize();
      const d = 3.2 + 2.3 * m.frameA;
      // Aim a little above the orbit so it sits below the equation.
      ctl.target.set(m.frameX, 0.12 * d, 0);
      ctx.camera.position.copy(ctl.target).addScaledVector(state.dir, d);
    }
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.lines.dispose();
    state.bright.dispose();
  },
};
