import * as THREE from 'three';
import { TAU, phaseOf, smooth, clamp01 } from '../lib/motion.js';

// A cloud of floating poop emojis assembles into a rocket with a robot face,
// which blinks at you, rumbles, and blasts off, launching the poops back out
// of its exhaust, which is where the loop starts again.
//
// Every poop i has a place in the cloud a_i (bobbing gently: a_i(t)) and a
// place on the rocket b_i.
//
// Assembling:  p_i = R_y(σ) ((1 − s) a_i(t) + s b_i),  σ = 2 sin(πs)
//   s blends cloud → rocket and σ swirls them in; near s = 1 each sprite turns
//   from a poop into a coloured bead of the rocket.
//
// Blast-off (progress b: 0 → 1): the rocket rises h = 11 b². Bead i leaves
// at b = 0.7 r_i (r_i: 0 at the bottom, 1 at the top, so the rocket empties
// upward), from the nozzle n_i = (0, −1.9 + h(0.7 r_i), 0), and flies a
// quadratic Bézier to its cloud spot:
//     p_i = (1 − u)² n_i + 2u(1 − u) c_i + u² a_i(t),  u_i = clamp((b − 0.7 r_i) / 0.3)
// with c_i below and to the side of the nozzle, so the poops shoot out
// downward and fan out. Every u_i reaches 1 at b = 1: all poop is back in the
// cloud, exactly where the loop begins.
//
// Loop (period 18 s): 0 – .2 just vibing · .2 – .45 assembling
//   .45 – .62 beep boop (blinks twice, then rumbles) · .62 – 1 blast off!
//
// Both shapes are sorted by height before pairing, so the bottom of the cloud
// becomes the flame (the first poops out) and the top becomes the antenna.

const PERIOD = 18;
const ASSEMBLE = 0.2;
const ROBOT = 0.45;
const BLAST = 0.62;
const LIFT = 11; // h = LIFT · b²
const NOZZLE_Y = -1.9;

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// The sprites, drawn rather than taken from an emoji font so they look the
// same on every device: one 128 px cell each, side by side.
const SPRITES = ['poop', 'hearts', 'stars', 'smileys', 'ghosts', 'planets', 'aliens'];
const MIXED = SPRITES.length; // the "everything at once" loop
const CYCLE = SPRITES.length + 1;
const spriteName = (i) => (i === MIXED ? 'everything' : SPRITES[i]);

const DRAW = {
  poop(g) {
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
    g.fillStyle = '#b37440';
    g.beginPath();
    g.moveTo(52, 46);
    g.quadraticCurveTo(60, 20, 76, 22);
    g.quadraticCurveTo(70, 34, 76, 46);
    g.closePath();
    g.fill();
    g.stroke();
    eyes(g, 50, 78, 72);
    grin(g, 64, 88, 15, '#3a200c');
  },
  hearts(g) {
    const grad = g.createLinearGradient(0, 20, 0, 110);
    grad.addColorStop(0, '#ff6b7d');
    grad.addColorStop(1, '#c81d3c');
    g.fillStyle = grad;
    g.strokeStyle = '#7a0f24';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(64, 110);
    g.bezierCurveTo(8, 72, 16, 18, 64, 42);
    g.bezierCurveTo(112, 18, 120, 72, 64, 110);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(42, 46, 10, 6, -0.6, 0, TAU);
    g.fill();
  },
  stars(g) {
    const grad = g.createLinearGradient(0, 12, 0, 116);
    grad.addColorStop(0, '#ffe680');
    grad.addColorStop(1, '#f0a500');
    g.fillStyle = grad;
    g.strokeStyle = '#8a5a00';
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 24 : 56;
      g.lineTo(64 + r * Math.cos(a), 68 + r * Math.sin(a));
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#3a2600';
    for (const x of [55, 73]) {
      g.beginPath();
      g.arc(x, 66, 4.5, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#3a2600';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 74, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  },
  smileys(g) {
    const grad = g.createRadialGradient(50, 44, 8, 64, 64, 56);
    grad.addColorStop(0, '#ffe36e');
    grad.addColorStop(1, '#f5b70a');
    g.fillStyle = grad;
    g.strokeStyle = '#a0700a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 64, 52, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = '#3b2a05';
    for (const x of [46, 82]) {
      g.beginPath();
      g.ellipse(x, 52, 7, 11, 0, 0, TAU);
      g.fill();
    }
    grin(g, 64, 70, 28, '#3b2a05');
  },
  ghosts(g) {
    g.fillStyle = '#f4f6ff';
    g.strokeStyle = '#8f98c2';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 56, 42, Math.PI, 0);
    g.lineTo(106, 110);
    for (let k = 0; k < 4; k++) {
      const x0 = 106 - k * 21;
      g.quadraticCurveTo(x0 - 5, 96, x0 - 10.5, 104);
      g.quadraticCurveTo(x0 - 16, 114, x0 - 21, 104);
    }
    g.lineTo(22, 56);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1d2a';
    for (const x of [50, 78]) {
      g.beginPath();
      g.ellipse(x, 58, 8, 12, 0, 0, TAU);
      g.fill();
    }
    g.beginPath();
    g.ellipse(64, 82, 6, 8, 0, 0, TAU);
    g.fill();
  },
  planets(g) {
    const ring = (from, to) => {
      g.strokeStyle = '#f0c27a';
      g.lineWidth = 7;
      g.beginPath();
      g.ellipse(64, 66, 60, 16, -0.35, from, to);
      g.stroke();
    };
    ring(Math.PI, TAU); // the half behind the planet
    const grad = g.createRadialGradient(52, 50, 6, 64, 64, 38);
    grad.addColorStop(0, '#c4a6ff');
    grad.addColorStop(1, '#4b2a8c');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(64, 64, 36, 0, TAU);
    g.fill();
    ring(0, Math.PI); // and the half in front
  },
  aliens(g) {
    g.fillStyle = '#6fdc5c';
    g.strokeStyle = '#2f7a24';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(64, 62, 44, 52, 0, 0, TAU);
    g.fill();
    g.stroke();
    for (const side of [-1, 1]) {
      g.fillStyle = '#0d0d12';
      g.beginPath();
      g.ellipse(64 + 20 * side, 64, 13, 22, 0.5 * side, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(64 + 20 * side - 4, 56, 4, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#1f5a18';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(56, 96);
    g.lineTo(72, 96);
    g.stroke();
  },
};
function eyes(g, x1, x2, y) {
  for (const x of [x1, x2]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, y, 9, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(x + 2, y + 2, 5, 0, TAU);
    g.fill();
  }
}
function grin(g, x, y, r, outline) {
  g.fillStyle = '#fff';
  g.strokeStyle = outline;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(x, y, r, 0.12 * Math.PI, 0.88 * Math.PI);
  g.closePath();
  g.fill();
  g.stroke();
}

function spriteAtlas() {
  const c = document.createElement('canvas');
  c.width = 128 * SPRITES.length;
  c.height = 128;
  const g = c.getContext('2d');
  SPRITES.forEach((name, i) => {
    g.save();
    g.translate(128 * i, 0);
    DRAW[name](g);
    g.restore();
  });
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
  uniform float uBlast;    // blast-off progress b (0 before it starts)
  uniform float uShake;
  uniform float uTime;
  uniform float uScreen;   // pixels per world unit at distance 1
  uniform float uPoopSize;
  uniform float uCur;      // this loop's sprite (${MIXED} = a random one each)
  uniform float uNext;     // the sprite the exhaust launches for the next loop
  uniform float uBeadSize;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aSpray;   // c_i − n_i: where the exhaust flings this poop
  attribute float aRelease; // r_i
  attribute vec3 aColor;
  attribute vec4 aWobble;  // bob frequency, bob phase, sprite spin rate, size jitter
  attribute float aPart;
  varying vec3 vColor;
  varying float vMorph;
  varying float vAngle;
  varying float vPart;
  varying float vSprite;

  vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    vec3 a = aA + vec3(0.0, 0.15 * sin(aWobble.x * uTime + aWobble.y), 0.0);  // a_i(t)
    vec3 P;
    float age = clamp((uBlast - 0.7 * aRelease) / 0.3, 0.0, 1.0);             // u_i
    bool released = uBlast > 0.0 && uBlast > 0.7 * aRelease;
    if (released) {
      // Out the exhaust: a quadratic Bézier from the nozzle to the cloud.
      float br = 0.7 * aRelease;
      vec3 n = vec3(0.0, ${NOZZLE_Y.toFixed(2)} + ${LIFT.toFixed(1)} * br * br, 0.0);
      vec3 c = n + aSpray;
      P = (1.0 - age) * (1.0 - age) * n + 2.0 * age * (1.0 - age) * c + age * age * a;
      vMorph = 1.0 - smoothstep(0.0, 0.12, age);   // bead → poop as it leaves
    } else {
      // Assembling, then riding the rocket up.
      P = rotY(mix(a, aB, uS), uSigma) + vec3(0.0, ${LIFT.toFixed(1)} * uBlast * uBlast, 0.0);
      if (aPart > 0.5 && aPart < 1.5) P.y -= uS * 0.07 * (0.5 + 0.5 * sin(uTime * 29.0 + aWobble.y * 9.0));
      P.x += uShake * sin(uTime * 71.0 + aB.y * 3.0);
      vMorph = smoothstep(0.72, 1.0, uS);  // poop → bead as it lands
    }
    float pick = released ? uNext : uCur;
    vSprite = pick > ${MIXED - 0.5} ? floor(fract(aWobble.y * 7.13) * ${SPRITES.length}.0) : pick;
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
  varying float vSprite;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vAngle), s = sin(vAngle);
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) + 0.5;  // spun, within this sprite's cell
    vec4 poop = texture2D(uPoop, vec2((clamp(r.x, 0.0, 1.0) + vSprite) / ${SPRITES.length}.0, r.y));
    if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) poop.a = 0.0;

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
    'A cloud of floating emojis swirls together into a rocket with a robot face, which blinks at you, rumbles ' +
    'and blasts off, launching the next batch out of its exhaust: poop, hearts, stars, smileys, ghosts, planets, ' +
    'aliens, then everything at once. The equation on screen is whichever one is moving them, live.',
  tags: ['particles', 'morph', 'emoji', 'silly'],
  category: 'Particles',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const cur = ((Math.floor(t / PERIOD) % CYCLE) + CYCLE) % CYCLE;
    const s = p < ASSEMBLE ? 0 : p < ROBOT ? smooth((p - ASSEMBLE) / (ROBOT - ASSEMBLE)) : 1;
    const sigma = p >= ASSEMBLE && p < ROBOT ? 2 * Math.sin(Math.PI * s) : 0;
    const b = p < BLAST ? 0 : (p - BLAST) / (1 - BLAST);
    const x = clamp01((p - ROBOT) / (BLAST - ROBOT));
    const beeping = p >= ROBOT && p < BLAST;
    const blink = beeping ? Math.max(Math.exp(-(((x - 0.25) / 0.035) ** 2)), Math.exp(-(((x - 0.55) / 0.035) ** 2))) : 0;
    // Rumble for the last moments before lift-off, easing off as it climbs.
    const shake = beeping ? 0.035 * smooth((x - 0.75) / 0.25) : p >= BLAST ? 0.035 * (1 - smooth(b / 0.15)) : 0;
    const stage = p < ASSEMBLE ? 0 : p < ROBOT ? 1 : p < BLAST ? 2 : 3;
    return { s, sigma, b, h: LIFT * b * b, blink, shake, tilt: 0.12 * Math.sin(TAU * p), stage, cur, next: (cur + 1) % CYCLE };
  },

  // Shows whichever formula is moving the poops right now.
  latex: (p, hl, m) => {
    const labels = [
      `just ${spriteName(m.cur)} vibing`,
      `assembling ${spriteName(m.cur)}`,
      'beep boop',
      `blast off! next up: ${spriteName(m.next)}`,
    ];
    const label = `&\\text{${labels[m.stage] ?? ''}}`;
    if (m.stage < 3) {
      return (
        '\\begin{aligned}' +
        '\\mathbf p_i &= R_y(\\sigma)\\big((1-s)\\,\\mathbf a_i(t) + s\\,\\mathbf b_i\\big),\\quad \\sigma = 2\\sin(\\pi s) \\\\' +
        `s &= ${hl(m.s, 2)},\\quad \\sigma = ${hl(m.sigma, 2)} \\\\` +
        label +
        '\\end{aligned}'
      );
    }
    return (
      '\\begin{aligned}' +
      '\\mathbf p_i &= (1-u_i)^2\\,\\mathbf n_i + 2u_i(1-u_i)\\,\\mathbf c_i + u_i^2\\,\\mathbf a_i(t) \\\\' +
      'u_i &= \\operatorname{clamp}\\big((b - 0.7\\,r_i)/0.3\\big),\\quad h = 11\\,b^2 \\\\' +
      `b &= ${hl(m.b, 2)},\\quad h = ${hl(m.h, 2)} \\\\` +
      label +
      '\\end{aligned}'
    );
  },

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
    const aSpray = new Float32Array(n * 3);
    const aRelease = new Float32Array(n);
    const aColor = new Float32Array(n * 3);
    const aWobble = new Float32Array(n * 4);
    const aPart = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = rocket[i].p;
      aA.set(cloud[i].p, i * 3);
      aB.set(b, i * 3);
      // Bottom beads leave first; a little jitter so it streams rather than steps.
      aRelease[i] = clamp01(i / n + (r() - 0.5) * 0.06);
      const ang = TAU * r();
      const fan = 1.2 + 2.2 * r();
      aSpray.set([Math.cos(ang) * fan, -(2 + 2.5 * r()), Math.sin(ang) * fan * 0.6], i * 3);
      aColor.set(rocket[i].c, i * 3);
      aWobble.set([0.8 + 1.4 * r(), TAU * r(), (r() - 0.5) * 2.4, 0.7 + 0.6 * r()], i * 4);
      aPart[i] = rocket[i].part;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(aB.slice(), 3)); // for bounds only
    geometry.setAttribute('aA', new THREE.BufferAttribute(aA, 3));
    geometry.setAttribute('aB', new THREE.BufferAttribute(aB, 3));
    geometry.setAttribute('aSpray', new THREE.BufferAttribute(aSpray, 3));
    geometry.setAttribute('aRelease', new THREE.BufferAttribute(aRelease, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    geometry.setAttribute('aWobble', new THREE.BufferAttribute(aWobble, 4));
    geometry.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));

    const texture = spriteAtlas();
    const uniforms = {
      uS: { value: 0 },
      uSigma: { value: 0 },
      uBlast: { value: 0 },
      uShake: { value: 0 },
      uTime: { value: 0 },
      uScreen: { value: 1 },
      uPoopSize: { value: ctx.params.poopSize },
      uBeadSize: { value: 0.11 },
      uBlink: { value: 0 },
      uPoop: { value: texture },
      uCur: { value: 0 },
      uNext: { value: 1 },
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
    u.uBlast.value = m.b;
    u.uShake.value = m.shake;
    u.uBlink.value = m.blink;
    u.uTime.value = ctx.time;
    u.uPoopSize.value = ctx.params.poopSize;
    u.uCur.value = m.cur;
    u.uNext.value = m.next;
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
