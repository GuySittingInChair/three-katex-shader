import * as THREE from 'three';
import { TAU, phaseOf, smooth, clamp01 } from '../lib/motion.js';

// A cloud of floating poop emojis assembles into a rocket with a robot face,
// which blinks at you, then bursts back into poop.
//
// Every poop i has a place in the cloud a_i (bobbing gently: a_i(t)), a place
// on the rocket b_i, and an outward direction v_i. One equation moves them all:
//
//     p_i = R_y(σ) ((1 − s) a_i(t) + s b_i) + β sin(πs) v_i
//
// s blends cloud → rocket. While assembling, σ = 2 sin(πs) swirls the poops
// in about the vertical axis; while bursting apart, β lifts the sin(πs) term
// so they overshoot outward on the way back to the cloud. Both extra terms
// are zero at s = 0 and s = 1, so the loop joins up. Near s = 1 each sprite
// turns from a poop into a coloured bead of the rocket.
//
// Loop (period 16 s): 0 – .25 floating · .25 – .5 assembling (s: 0 → 1)
//   .5 – .8 beep boop (blinks twice) · .8 – 1 blowing up (s: 1 → 0)
//
// Both shapes are sorted by height before pairing, so the bottom of the cloud
// becomes the flame and the top becomes the antenna.

const PERIOD = 16;
const ASSEMBLE = 0.25;
const ROBOT = 0.5;
const BURST = 0.8;
const STAGES = ['just vibing', 'assembling', 'beep boop', 'blowing up'];

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// The 💩 sprite, drawn rather than taken from an emoji font so it looks the
// same on every device.
function poopTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const tier = (cx, cy, rx, ry) => {
    const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, '#c98a4b');
    grad.addColorStop(1, '#8e5a2a');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#4e2e12';
    g.lineWidth = 3;
    g.stroke();
  };
  tier(64, 100, 52, 20);
  tier(64, 76, 40, 17);
  tier(64, 54, 28, 14);
  // The curl on top.
  g.fillStyle = '#b37440';
  g.strokeStyle = '#4e2e12';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(52, 46);
  g.quadraticCurveTo(60, 20, 76, 22);
  g.quadraticCurveTo(70, 34, 76, 46);
  g.closePath();
  g.fill();
  g.stroke();
  // Eyes and grin.
  for (const x of [50, 78]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, 72, 9, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(x + 2, 74, 5, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.strokeStyle = '#3a200c';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(64, 88, 15, 0.12 * Math.PI, 0.88 * Math.PI);
  g.closePath();
  g.fill();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- the rocket with a robot face ----------
// Each part: { area, sample(r) -> { p, c, part } }. part 1 = flame (flickers),
// part 2 = eye (blinks). `boost` gives small details more beads.
function rocketParts() {
  const SILVER = hex(0xc9d1dc);
  const RED = hex(0xe8483c);
  const PANEL = hex(0x2a3140);
  const EYE = hex(0x5ff3ff);
  const TEETH = hex(0xdfe6ee);
  const R = 0.5;
  const onBody = (x, y, out = 0) => {
    const th = x / R;
    return [(R + out) * Math.sin(th), y, (R + out) * Math.cos(th)];
  };
  const parts = [];

  const inFace = (x, y) => Math.abs(x) < 0.38 && y > -0.38 && y < 0.62;
  parts.push({
    area: TAU * R * 1.9 - 0.76,
    sample(r) {
      let x;
      let y;
      do {
        x = (TAU * r() - Math.PI) * R; // arc length around the body, 0 = facing us
        y = -1 + 1.9 * r();
      } while (inFace(x, y));
      return { p: onBody(x, y), c: y > -0.8 && y < -0.66 ? RED : SILVER, part: 0 };
    },
  });
  // The face panel, denser and a touch proud of the body so it reads cleanly.
  parts.push({
    area: 0.76 * 2,
    sample(r) {
      return { p: onBody(-0.38 + 0.76 * r(), -0.38 + r(), 0.015), c: PANEL, part: 0 };
    },
  });
  // Eyes: glowing discs, just proud of the face.
  for (const ex of [-0.17, 0.17]) {
    parts.push({
      area: Math.PI * 0.11 * 0.11 * 5,
      sample(r) {
        const rad = 0.11 * Math.sqrt(r());
        const a = TAU * r();
        return { p: onBody(ex + rad * Math.cos(a), 0.3 + rad * Math.sin(a), 0.03), c: EYE, part: 2 };
      },
    });
  }
  // Grill mouth: teeth with dark gaps.
  parts.push({
    area: 0.42 * 0.16 * 4,
    sample(r) {
      const x = -0.21 + 0.42 * r();
      const y = -0.16 + 0.16 * r();
      const gap = Math.abs(((x + 0.21) % 0.07) - 0.035) > 0.028;
      return { p: onBody(x, y, 0.03), c: gap ? PANEL : TEETH, part: 0 };
    },
  });
  // Nose cone, antenna and its light.
  parts.push({
    area: Math.PI * R * Math.hypot(R, 0.9),
    sample(r) {
      const d = Math.sqrt(r());
      const th = TAU * r();
      return { p: [R * d * Math.sin(th), 1.8 - 0.9 * d, R * d * Math.cos(th)], c: RED, part: 0 };
    },
  });
  parts.push({
    area: 0.12,
    sample(r) {
      const y = 1.8 + 0.45 * r();
      const th = TAU * r();
      return { p: [0.03 * Math.sin(th), y, 0.03 * Math.cos(th)], c: SILVER, part: 0 };
    },
  });
  parts.push({
    area: 0.25,
    sample(r) {
      const z = 2 * r() - 1;
      const a = TAU * r();
      const s = Math.sqrt(1 - z * z) * 0.1;
      return { p: [s * Math.cos(a), 2.33 + z * 0.1, s * Math.sin(a)], c: hex(0xff5a5a), part: 2 };
    },
  });
  // Three fins, clear of the face.
  for (let k = 0; k < 3; k++) {
    const phi = Math.PI / 3 + (k * TAU) / 3;
    parts.push({
      area: 0.5,
      sample(r) {
        let u = r();
        let v = r();
        if (u + v > 1) [u, v] = [1 - u, 1 - v];
        const rad = 0.48 + 0.62 * v;
        const y = -0.35 - 0.7 * u - 0.95 * v;
        return { p: [rad * Math.sin(phi), y, rad * Math.cos(phi)], c: RED, part: 0 };
      },
    });
  }
  // Flame.
  parts.push({
    area: 0.9,
    sample(r) {
      const d = Math.sqrt(r());
      const th = TAU * r();
      const rad = 0.32 * (1 - d) * (0.5 + 0.5 * r());
      const c = hex(0xffd166).map((v, i) => v + (hex(0xff6a1a)[i] - v) * d);
      return { p: [rad * Math.sin(th), -1.05 - 0.85 * d, rad * Math.cos(th)], c, part: 1 };
    },
  });
  return parts;
}

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
  uniform float uSigma;
  uniform float uBeta;
  uniform float uTime;
  uniform float uScreen;   // pixels per world unit at distance 1
  uniform float uPoopSize;
  uniform float uBeadSize;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aV;
  attribute vec3 aColor;
  attribute vec4 aWobble;  // bob frequency, bob phase, sprite spin rate, size jitter
  attribute float aPart;
  varying vec3 vColor;
  varying float vMorph;
  varying float vAngle;
  varying float vPart;

  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    vec3 a = aA + vec3(0.0, 0.15 * sin(aWobble.x * uTime + aWobble.y), 0.0);  // a_i(t)
    vec3 P = rotY(mix(a, aB, uS), uSigma) + uBeta * sin(3.14159265 * uS) * aV;
    if (aPart > 0.5 && aPart < 1.5) P.y -= uS * 0.07 * (0.5 + 0.5 * sin(uTime * 29.0 + aWobble.y * 9.0));

    vMorph = smoothstep(0.72, 1.0, uS);  // poop → bead as it lands
    vColor = aColor;
    vPart = aPart;
    vAngle = aWobble.z * uTime * (1.0 - vMorph);
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    float size = mix(uPoopSize * aWobble.w, uBeadSize, vMorph);
    gl_PointSize = size * uScreen / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform sampler2D uPoop;
  uniform float uBlink;
  varying vec3 vColor;
  varying float vMorph;
  varying float vAngle;
  varying float vPart;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vAngle), s = sin(vAngle);
    vec4 poop = texture2D(uPoop, vec2(c * q.x - s * q.y, s * q.x + c * q.y) + 0.5);

    // A little shaded sphere for the rocket's beads.
    float r2 = dot(q, q) * 4.0;
    float bead = 1.0 - smoothstep(0.85, 1.0, r2);
    vec3 n = vec3(q * 2.0, sqrt(max(1.0 - r2, 0.0)));
    float light = 0.35 + 0.75 * max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
    vec3 col = vColor * light;
    if (vPart > 1.5) col = mix(vColor * 0.92, vec3(0.16, 0.19, 0.25), uBlink); // eyes glow (unlit), then blink shut
    vec4 beadCol = vec4(col, bead);

    vec4 outCol = mix(poop, beadCol, vMorph);
    if (outCol.a < 0.35) discard;
    gl_FragColor = vec4(outCol.rgb, 1.0);
  }
`;

export default {
  name: 'Poop → Robot Rocket',
  description:
    'A cloud of floating poop emojis swirls together into a rocket with a robot face, which blinks at you twice ' +
    'and then blows back into poop. Each poop i has a place in the cloud a_i and on the rocket b_i; one equation ' +
    'with a blend s, a swirl σ and a burst β moves all of them, and all three are shown live.',
  tags: ['particles', 'morph', 'emoji', 'silly'],
  category: 'Particles',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    let s = 0;
    let sigma = 0;
    let beta = 0;
    if (p >= ASSEMBLE && p < ROBOT) {
      s = smooth((p - ASSEMBLE) / (ROBOT - ASSEMBLE));
      sigma = 2 * Math.sin(Math.PI * s);
    } else if (p >= ROBOT && p < BURST) {
      s = 1;
    } else if (p >= BURST) {
      s = 1 - smooth((p - BURST) / (1 - BURST));
      beta = 1.6;
    }
    const x = clamp01((p - ROBOT) / (BURST - ROBOT));
    const blink =
      p >= ROBOT && p < BURST ? Math.max(Math.exp(-(((x - 0.35) / 0.03) ** 2)), Math.exp(-(((x - 0.7) / 0.03) ** 2))) : 0;
    const stage = p < ASSEMBLE ? 0 : p < ROBOT ? 1 : p < BURST ? 2 : 3;
    return { s, sigma, beta, blink, tilt: 0.12 * Math.sin(TAU * p), stage };
  },

  latex: (p, hl, m) =>
    '\\begin{aligned}' +
    '\\mathbf p_i &= R_y(\\sigma)\\big((1-s)\\,\\mathbf a_i(t) + s\\,\\mathbf b_i\\big) + \\beta\\sin(\\pi s)\\,\\mathbf v_i \\\\' +
    `s &= ${hl(m.s, 2)},\\quad \\sigma = ${hl(m.sigma, 2)},\\quad \\beta = ${hl(m.beta, 2)} \\\\` +
    `&\\text{${STAGES[m.stage] ?? ''}}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    poops: { value: 2200, min: 600, max: 6000, step: 100, rebuild: true },
    poopSize: { value: 0.42, min: 0.15, max: 0.9 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.3, 7.5);
    const n = Math.round(ctx.params.poops);
    const r = mulberry32(2026);

    // The cloud: a loose, wide blob.
    const cloud = [];
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const v = r() * 2 - 1;
      const w = r() * 2 - 1;
      cloud.push({ p: [u * 5.2, v * 3 + 0.2, w * 2.5 - 0.5] });
    }
    cloud.sort((a, b) => a.p[1] - b.p[1]);
    const rocket = samplePoints(rocketParts(), n, r);

    const aA = new Float32Array(n * 3);
    const aB = new Float32Array(n * 3);
    const aV = new Float32Array(n * 3);
    const aColor = new Float32Array(n * 3);
    const aWobble = new Float32Array(n * 4);
    const aPart = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = rocket[i].p;
      aA.set(cloud[i].p, i * 3);
      aB.set(b, i * 3);
      const len = Math.hypot(b[0], b[1] - 0.3, b[2]) || 1;
      aV.set([b[0] / len, (b[1] - 0.3) / len, b[2] / len], i * 3);
      aColor.set(rocket[i].c, i * 3);
      aWobble.set([0.8 + 1.4 * r(), TAU * r(), (r() - 0.5) * 2.4, 0.7 + 0.6 * r()], i * 4);
      aPart[i] = rocket[i].part;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(aB.slice(), 3)); // for bounds only
    geometry.setAttribute('aA', new THREE.BufferAttribute(aA, 3));
    geometry.setAttribute('aB', new THREE.BufferAttribute(aB, 3));
    geometry.setAttribute('aV', new THREE.BufferAttribute(aV, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    geometry.setAttribute('aWobble', new THREE.BufferAttribute(aWobble, 4));
    geometry.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));

    const texture = poopTexture();
    const uniforms = {
      uS: { value: 0 },
      uSigma: { value: 0 },
      uBeta: { value: 0 },
      uTime: { value: 0 },
      uScreen: { value: 1 },
      uPoopSize: { value: ctx.params.poopSize },
      uBeadSize: { value: 0.11 },
      uBlink: { value: 0 },
      uPoop: { value: texture },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // positions are computed in the shader
    ctx.scene.add(points);

    const starPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const z = 2 * r() - 1;
      const a = TAU * r();
      const d = 30 + 20 * r();
      const s = Math.sqrt(1 - z * z);
      starPos.set([s * Math.cos(a) * d, z * d, s * Math.sin(a) * d], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x8a96b0, size: 1.5, sizeAttenuation: false });
    ctx.scene.add(new THREE.Points(starGeo, starMat));

    return { points, geometry, material, texture, uniforms, starGeo, starMat };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uS.value = m.s;
    u.uSigma.value = m.sigma;
    u.uBeta.value = m.beta;
    u.uBlink.value = m.blink;
    u.uTime.value = ctx.time;
    u.uPoopSize.value = ctx.params.poopSize;
    u.uScreen.value = ctx.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
    state.points.rotation.y = m.tilt * m.s;
  },

  dispose(ctx, state) {
    state.geometry.dispose();
    state.material.dispose();
    state.texture.dispose();
    state.starGeo.dispose();
    state.starMat.dispose();
  },
};
