import * as THREE from 'three';
import { TAU, phaseOf, smooth, clamp01 } from '../lib/motion.js';

// A rocket explodes and its debris reassembles into a little green alien,
// who waves, blinks, and beams back into the ship.
//
// Every piece i is one particle with three vectors: its place on the rocket
// a_i, its place on the alien b_i, and a launch velocity v_i (outward from the
// rocket's middle, plus some scatter). One closed-form equation moves them:
//
//     p_i = (1 − s) (a_i + β (1 − e^{−kτ}) / k · v_i) + s b_i
//
// The middle term is ballistic flight with linear drag and no gravity (it's
// space): velocity v e^{−kτ}, so each piece coasts to a stop at a_i + β v_i/k.
// s blends the debris into the alien. At the end of the loop the alien morphs
// back, p_i ← R_y(2πu) ((1 − u) p_i + u a_i), one full turn so it joins up.
//
// Loop (period 18 s):   0 – .16 cruising · .16 – .40 KABOOM (τ runs)
//   .40 – .62 reassembling (s: 0 → 1, τ keeps running) · .62 – .86 hi :)
//   (wave, two blinks) · .86 – 1 back in the ship (u: 0 → 1)
//
// Pieces are matched bottom-to-top (both shapes sorted by height), so the
// rocket's flame becomes the alien's feet and its nose becomes the head.

const PERIOD = 18;
const DRAG = 1.6; // k
const EXPLODE = 0.16;
const REFORM = 0.4;
const HELLO = 0.62;
const BEAM = 0.86;
const STAGES = ['cruising', 'KABOOM', 'reassembling…', 'hi :)', 'back in the ship'];
const SHOULDER = [0.38, -0.12, 0]; // the waving arm pivots here (matches the shader)
const EYE_Y = 0.8;
const EYES = [-1, 1].map((side) => ({ center: [0.34 * side, EYE_Y, 0.56], radii: [0.22, 0.3, 0.16], rotY: 0.35 * side }));

// True if p is inside (or right at) one of the eyes, so the head leaves room for them.
function inEye(p) {
  return EYES.some(({ center, radii }) =>
    ((p[0] - center[0]) / radii[0]) ** 2 + ((p[1] - center[1]) / radii[1]) ** 2 + ((p[2] - center[2]) / (radii[2] + 0.12)) ** 2 < 1.1
  );
}

// Deterministic randomness, so the shapes are the same on every load.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function unitDir(r) {
  const z = 2 * r() - 1;
  const a = TAU * r();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), z, s * Math.sin(a)];
}

// Approximate ellipsoid surface area (Knud Thomsen), for sharing out pieces.
function ellipsoidArea(a, b, c) {
  const p = 1.6075;
  return 4 * Math.PI * ((a ** p * b ** p + a ** p * c ** p + b ** p * c ** p) / 3) ** (1 / p);
}

function ellipsoid(center, radii, color, part = 0, rotY = 0) {
  return {
    area: ellipsoidArea(...radii),
    sample(r) {
      const d = unitDir(r);
      let x = d[0] * radii[0];
      const y = d[1] * radii[1];
      let z = d[2] * radii[2];
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      [x, z] = [c * x + s * z, -s * x + c * z];
      return { p: [center[0] + x, center[1] + y, center[2] + z], c: typeof color === 'function' ? color(d) : color, part };
    },
  };
}

function capsule(from, to, radius, color, part = 0) {
  const axis = to.map((v, i) => v - from[i]);
  const len = Math.hypot(...axis);
  const u = axis.map((v) => v / len);
  const helper = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const n1 = [u[1] * helper[2] - u[2] * helper[1], u[2] * helper[0] - u[0] * helper[2], u[0] * helper[1] - u[1] * helper[0]];
  const l1 = Math.hypot(...n1);
  const e1 = n1.map((v) => v / l1);
  const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
  return {
    area: TAU * radius * len,
    sample(r) {
      const t = r();
      const a = TAU * r();
      const ca = Math.cos(a) * radius;
      const sa = Math.sin(a) * radius;
      return { p: from.map((v, i) => v + axis[i] * t + e1[i] * ca + e2[i] * sa), c: color, part };
    },
  };
}

// ---------- the rocket ----------
function rocketParts() {
  const SILVER = hex(0xd8dde6);
  const RED = hex(0xe8483c);
  const WINDOW = hex(0x7cc4ff);
  const R = 0.45;
  const parts = [];

  // Body: a cylinder with a porthole facing the camera and a red stripe.
  parts.push({
    area: TAU * R * 1.9,
    sample(r) {
      const th = TAU * r() - Math.PI;
      const y = -1 + 1.9 * r();
      const inWindow = Math.hypot(th * R, y - 0.35) < 0.2;
      const stripe = y > -0.75 && y < -0.62;
      return { p: [R * Math.sin(th), y, R * Math.cos(th)], c: inWindow ? WINDOW : stripe ? RED : SILVER, part: 0 };
    },
  });
  // Nose cone (uniform on the cone's side: distance from the tip ∝ √r).
  parts.push({
    area: Math.PI * R * Math.hypot(R, 0.95),
    sample(r) {
      const d = Math.sqrt(r());
      const th = TAU * r();
      return { p: [R * d * Math.sin(th), 1.85 - 0.95 * d, R * d * Math.cos(th)], c: RED, part: 0 };
    },
  });
  // Three fins, clear of the porthole (which faces +z).
  for (let k = 0; k < 3; k++) {
    const phi = Math.PI / 3 + (k * TAU) / 3;
    parts.push({
      area: 2 * 0.217,
      sample(r) {
        let u = r();
        let v = r();
        if (u + v > 1) [u, v] = [1 - u, 1 - v];
        const rad = 0.43 + 0.62 * v;
        const y = -0.35 - 0.7 * u - 0.95 * v;
        const side = r() < 0.5 ? -0.025 : 0.025;
        return {
          p: [rad * Math.sin(phi) + side * Math.cos(phi), y, rad * Math.cos(phi) - side * Math.sin(phi)],
          c: RED,
          part: 0,
        };
      },
    });
  }
  // Nozzle.
  parts.push({
    area: TAU * 0.36 * 0.25,
    sample(r) {
      const th = TAU * r();
      return { p: [0.36 * Math.sin(th), -1.25 + 0.25 * r(), 0.36 * Math.cos(th)], c: hex(0x4a4f5a), part: 0 };
    },
  });
  // Flame: a cone pointing down, yellow at the nozzle to orange at the tip. part 1 = flickers.
  parts.push({
    area: 0.9,
    sample(r) {
      const d = Math.sqrt(r());
      const th = TAU * r();
      const rad = 0.3 * (1 - d) * (0.6 + 0.4 * r());
      return {
        p: [rad * Math.sin(th), -1.25 - 0.8 * d, rad * Math.cos(th)],
        c: mixc(hex(0xffd166), hex(0xff6a1a), d),
        part: 1,
      };
    },
  });
  return parts;
}

// ---------- the alien ----------
function alienParts() {
  const GREEN = hex(0x6fdc5c);
  const BODY = hex(0x57c248);
  const DARK = hex(0x0d0d12);
  const parts = [];
  const head = ellipsoid([0, 0.75, 0], [0.85, 0.62, 0.68], GREEN);
  parts.push({
    area: head.area,
    sample(r) {
      let pt = head.sample(r);
      for (let tries = 0; tries < 20 && inEye(pt.p); tries++) pt = head.sample(r);
      return pt;
    },
  });
  // Big eyes (part 2 → blink), with a glint up and to the left.
  for (const { center, radii, rotY } of EYES) {
    parts.push(
      ellipsoid(center, radii, (d) => (d[0] * -0.4 + d[1] * 0.55 + d[2] * 0.7 > 0.85 ? hex(0xffffff) : DARK), 2, rotY)
    );
  }
  // Antennae with glowing tips.
  for (const side of [-1, 1]) {
    parts.push(capsule([0.28 * side, 1.25, 0], [0.55 * side, 1.95, -0.05], 0.035, GREEN));
    parts.push(ellipsoid([0.55 * side, 1.95, -0.05], [0.11, 0.11, 0.11], hex(0xd8ff5a)));
  }
  // Smile: a short arc on the front of the head.
  parts.push({
    area: 0.06,
    sample(r) {
      const a = Math.PI + 0.55 + (Math.PI - 1.1) * r();
      const x = 0.2 * Math.cos(a);
      const y = 0.52 + 0.2 * Math.sin(a) + 0.02 * (r() - 0.5);
      const z = 0.68 * Math.sqrt(Math.max(0, 1 - (x / 0.85) ** 2 - ((y - 0.75) / 0.62) ** 2)) + 0.015;
      return { p: [x, y, z], c: hex(0x1b4d1f), part: 0 };
    },
  });
  parts.push(ellipsoid([0, -0.35, 0], [0.42, 0.55, 0.38], BODY));
  // Arms: the right one is raised to wave (part 3 → pivots at the shoulder).
  parts.push(capsule([-0.38, -0.12, 0], [-0.8, -0.62, 0.12], 0.1, BODY));
  parts.push(ellipsoid([-0.82, -0.66, 0.13], [0.13, 0.13, 0.13], BODY));
  parts.push(capsule(SHOULDER, [0.78, 0.42, 0.1], 0.1, BODY, 3));
  parts.push(ellipsoid([0.8, 0.46, 0.1], [0.13, 0.13, 0.13], BODY, 3));
  // Legs and feet.
  for (const side of [-1, 1]) {
    parts.push(capsule([0.2 * side, -0.82, 0], [0.26 * side, -1.42, 0.05], 0.12, BODY));
    parts.push(ellipsoid([0.28 * side, -1.5, 0.12], [0.17, 0.12, 0.22], hex(0x4fb542)));
  }
  return parts;
}

// n points spread over the parts in proportion to their area, sorted by height.
function samplePoints(parts, n, r) {
  const total = parts.reduce((sum, p) => sum + p.area, 0);
  const counts = parts.map((p) => Math.floor((n * p.area) / total));
  let missing = n - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; missing > 0; i = (i + 1) % parts.length, missing--) counts[i]++;
  const out = [];
  parts.forEach((part, i) => {
    for (let k = 0; k < counts[i]; k++) out.push(part.sample(r));
  });
  return out.sort((a, b) => a.p[1] - b.p[1]);
}

const VERT = `
  uniform float uS;
  uniform float uTau;
  uniform float uK;
  uniform float uBeta;
  uniform float uBack;
  uniform float uFlash;
  uniform float uWave;
  uniform float uBlink;
  uniform float uTime;
  uniform float uSize;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aV;
  attribute vec3 aColA;
  attribute vec3 aColB;
  attribute vec4 aSpin;   // tumble axis (xyz) and rate (w)
  attribute vec2 aPart;   // x: rocket part (1 = flame); y: alien part (2 = eye, 3 = waving arm)
  attribute float aScale;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vFlash;

  mat3 rotAxis(vec3 a, float ang) {
    float c = cos(ang), s = sin(ang), t = 1.0 - c;
    return mat3(
      t * a.x * a.x + c,       t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
      t * a.x * a.y - s * a.z, t * a.y * a.y + c,       t * a.y * a.z + s * a.x,
      t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c
    );
  }
  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }
  vec3 alienPose(vec3 b) {
    if (aPart.y > 2.5) {
      vec3 shoulder = vec3(${SHOULDER.join(', ')});
      vec3 d = b - shoulder;
      float c = cos(uWave), s = sin(uWave);
      return shoulder + vec3(c * d.x - s * d.y, s * d.x + c * d.y, d.z);
    }
    if (aPart.y > 1.5) b.y = ${EYE_Y.toFixed(2)} + (b.y - ${EYE_Y.toFixed(2)}) * uBlink;
    return b;
  }

  void main() {
    vec3 debris = aA + aV * uBeta * (1.0 - exp(-uK * uTau)) / uK;
    vec3 P = mix(debris, alienPose(aB), uS);
    P = rotY(mix(P, aA, uBack), 6.28318530718 * uBack);

    float rocket = 1.0 - uS + uS * uBack; // 1 while it's a rocket, 0 while it's an alien
    if (aPart.x > 0.5) P.y -= rocket * 0.08 * (0.5 + 0.5 * sin(uTime * 31.0 + aSpin.w * 47.0));

    float tumble = aSpin.w * (uTau * (1.0 - uS) + 2.5 * sin(3.14159265 * uBack));
    mat3 R = rotAxis(aSpin.xyz, tumble);
    vec3 local = R * (position * uSize * aScale);
    vNormal = normalize(normalMatrix * (R * normal));
    vColor = mix(mix(aColA, aColB, uS), aColA, uBack);
    vFlash = uFlash * (0.55 + 0.45 * fract(aSpin.w * 13.7));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(P + local, 1.0);
  }
`;

const FRAG = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vFlash;
  void main() {
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, normalize(vec3(0.4, 0.8, 0.6))), 0.0);
    float rim = pow(1.0 - max(n.z, 0.0), 2.0);
    vec3 col = vColor * (0.28 + 0.75 * diff) + rim * 0.12 * vColor;
    vec3 fire = mix(vec3(0.95, 0.32, 0.06), vec3(1.0, 0.82, 0.35), vFlash);
    gl_FragColor = vec4(mix(col, fire, clamp(vFlash, 0.0, 1.0)), 1.0);
  }
`;

export default {
  name: 'Rocket → Alien',
  description:
    'A rocket explodes into debris (drag, no gravity: it’s space) that reassembles into a little green alien, ' +
    'who waves, blinks twice and beams back into the ship. Each piece i is one particle with a rocket position ' +
    'a_i, an alien position b_i and a launch velocity v_i; one closed-form equation moves all of them, and τ, s ' +
    'and u are shown live.',
  tags: ['particles', 'morph', 'ballistics', 'silly'],
  category: 'Particles',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const tau = p < EXPLODE ? 0 : (Math.min(p, HELLO) - EXPLODE) * PERIOD;
    const s = p < REFORM ? 0 : p < HELLO ? smooth((p - REFORM) / (HELLO - REFORM)) : 1;
    const back = p < BEAM ? 0 : smooth((p - BEAM) / (1 - BEAM));
    const hello = p >= HELLO && p < BEAM;
    const x = clamp01((p - HELLO) / (BEAM - HELLO));
    const blinkPulse = Math.max(Math.exp(-(((x - 0.3) / 0.025) ** 2)), Math.exp(-(((x - 0.72) / 0.025) ** 2)));
    const stage = p < EXPLODE ? 0 : p < REFORM ? 1 : p < HELLO ? 2 : p < BEAM ? 3 : 4;
    return {
      tau,
      s,
      back,
      flash: stage === 1 ? Math.exp(-1.6 * tau) : 0,
      wave: hello ? 0.5 * Math.sin(TAU * 3 * x) : 0,
      blink: hello ? 1 - 0.92 * blinkPulse : 1,
      bob: 0.12 * Math.sin(TAU * 2 * p),
      stage,
    };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    '\\mathbf p_i &= (1-s)\\Big(\\mathbf a_i + \\beta\\,\\tfrac{1-e^{-k\\tau}}{k}\\,\\mathbf v_i\\Big) + s\\,\\mathbf b_i \\\\' +
    '\\mathbf p_i &\\leftarrow R_y(2\\pi u)\\big((1-u)\\,\\mathbf p_i + u\\,\\mathbf a_i\\big) \\\\' +
    `\\tau &= ${hl(m.tau, 2)}\\ \\text{s},\\quad s = ${hl(m.s, 2)},\\quad u = ${hl(m.back, 2)},\\quad k = ${DRAG},\\quad \\beta = ${hl(p.kaboom, 2)} \\\\` +
    `&\\text{${STAGES[m.stage] ?? ''}}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    kaboom: { value: 1, min: 0.3, max: 2.5 },
    pieces: { value: 7000, min: 1500, max: 16000, step: 500, rebuild: true },
    pieceSize: { value: 0.045, min: 0.02, max: 0.09 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.3, 6.2);
    const n = Math.round(ctx.params.pieces);
    const r = mulberry32(628);
    const ship = samplePoints(rocketParts(), n, r);
    const alien = samplePoints(alienParts(), n, r);

    const aA = new Float32Array(n * 3);
    const aB = new Float32Array(n * 3);
    const aV = new Float32Array(n * 3);
    const aColA = new Float32Array(n * 3);
    const aColB = new Float32Array(n * 3);
    const aSpin = new Float32Array(n * 4);
    const aPart = new Float32Array(n * 2);
    const aScale = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = ship[i].p;
      const b = alien[i].p;
      aA.set(a, i * 3);
      aB.set(b, i * 3);
      aColA.set(ship[i].c, i * 3);
      aColB.set(alien[i].c, i * 3);
      // Outward from the rocket's middle, plus scatter.
      const len = Math.hypot(...a) || 1;
      const speed = 2.2 + 2.6 * r();
      const scatter = unitDir(r);
      for (let k = 0; k < 3; k++) aV[i * 3 + k] = (a[k] / len) * speed + scatter[k] * 1.2;
      const axis = unitDir(r);
      aSpin.set([...axis, (r() < 0.5 ? -1 : 1) * (2 + 6 * r())], i * 4);
      aPart.set([ship[i].part, alien[i].part], i * 2);
      aScale[i] = 0.6 + 0.8 * r();
    }

    const base = new THREE.OctahedronGeometry(1, 0);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('normal', base.getAttribute('normal'));
    geometry.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 3));
    geometry.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 3));
    geometry.setAttribute('aV', new THREE.InstancedBufferAttribute(aV, 3));
    geometry.setAttribute('aColA', new THREE.InstancedBufferAttribute(aColA, 3));
    geometry.setAttribute('aColB', new THREE.InstancedBufferAttribute(aColB, 3));
    geometry.setAttribute('aSpin', new THREE.InstancedBufferAttribute(aSpin, 4));
    geometry.setAttribute('aPart', new THREE.InstancedBufferAttribute(aPart, 2));
    geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
    geometry.instanceCount = n;
    base.dispose();

    const uniforms = {
      uS: { value: 0 },
      uTau: { value: 0 },
      uK: { value: DRAG },
      uBeta: { value: ctx.params.kaboom },
      uBack: { value: 0 },
      uFlash: { value: 0 },
      uWave: { value: 0 },
      uBlink: { value: 1 },
      uTime: { value: 0 },
      uSize: { value: ctx.params.pieceSize },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // positions are computed in the shader
    ctx.scene.add(mesh);

    // A few stars, so it's clearly space.
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const d = unitDir(r);
      const dist = 30 + 20 * r();
      starPos.set([d[0] * dist, d[1] * dist, d[2] * dist], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x8a96b0, size: 1.6, sizeAttenuation: false });
    const stars = new THREE.Points(starGeo, starMat);
    ctx.scene.add(stars);

    return { mesh, geometry, material, uniforms, stars, starGeo, starMat };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uS.value = m.s;
    u.uTau.value = m.tau;
    u.uBack.value = m.back;
    u.uFlash.value = m.flash;
    u.uWave.value = m.wave;
    u.uBlink.value = m.blink;
    u.uTime.value = ctx.time;
    u.uBeta.value = ctx.params.kaboom;
    u.uSize.value = ctx.params.pieceSize;
    state.mesh.position.y = m.bob;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
    state.starGeo.dispose();
    state.starMat.dispose();
  },
};
