import * as THREE from 'three';
import { TAU, smooth } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createSoundPlayer } from '../lib/spaceSound.js';
import { caption } from '../lib/bit.js';

// Dark Saturn: the "black Saturn" of five-dimensional gravity (Elvang & Figueras, JHEP 2007, hep-th/0701035).
// In a universe with four space dimensions, Einstein's equations allow a black hole shaped like a ring (a black
// ring, horizon S¹ × S²), which can't exist in our three. Black Saturn is an exact solution with a round black hole
// (horizon S³) sitting inside a black ring, both in balance: the ring's spin keeps it from collapsing, and nothing
// holds them apart. (A newer paper, Armas, arXiv:2611.20701, 16 Nov 2026, lets both spin in two planes at once.)
//
// Every number shown comes from the paper's exact formulas (eqs. 3.20–3.43, units G = 1), for three dimensionless
// parameters 0 < κ₃ < κ₂ < κ₁ < 1 and the balance condition (3.20), which fixes c̄₂. Checked in Node: each horizon
// satisfies its Smarr relation ⅔M = TS + ΩJ to 10⁻¹⁵, the masses and spins add up to the totals, and a 5-D
// Schwarzschild black hole gives the paper's reference area 2√2.
// The loop visits four balanced saturns (found by solving the formulas):
//   A  c̄₂ = 0: the hole has no spin of its own (J_BH = 0) yet turns, dragged round by the ring (frame dragging);
//   B  hole and ring co-rotating;
//   C  the hole spinning backwards just enough to be held still (Ω_BH = 0);
//   D  the hole counter-rotating.
// The picture is a 3-D slice and is not to exact scale: the hole's radius is from its area (A = 2π²r³), the ring's
// radius from the thin-ring estimate R ≈ 1/(√2 Ω), and its thickness from its area (A ≈ 2πR · 4πr²).
// The sound is a sonification, not a real sound: one tone per horizon, pitch rising with how fast it turns.
// see docs/wiki/sketches/darkSaturn.md

function saturn(k1, k2, k3) {
  const s = Math.sqrt, pi = Math.PI;
  const c = (1 / k2) * ((k1 - k2) / s(k1 * (1 - k2) * (1 - k3) * (k1 - k3)) - 1);          // balance (3.20), ε = +1
  const d = 1 + k2 * c, X = k1 * k2 * (1 - k2) * (1 - k3) * c * c;
  const M = ((3 * pi) / 4) * (k3 * (1 - k1 + k2) - 2 * k2 * k3 * (k1 - k2) * c + k2 * (k1 - k2 * k3 * (1 + k1 - k2)) * c * c) / (k3 * d * d);
  const J = (pi / (k3 * d ** 3)) * s(k2 / (2 * k1 * k3)) * (k3 * k3 - c * k3 * ((k1 - k2) * (1 - k1 + k3) + k2 * (1 - k3)) + c * c * k2 * k3 * ((k1 - k2) * (k1 - k3) + k1 * (1 + k1 - k2 - k3)) - c ** 3 * k1 * k2 * (k1 - k2 * k3 * (2 + k1 - k2 - k3)));
  const MBH = ((3 * pi) / 4) * (k3 * (1 - k1) + X) / (k3 * d);
  const JBH = -pi * s((k1 * k2) / (2 * k3)) * c * (k3 * (1 - k1) + X) / (k3 * d * d);
  const OBH = d * s((k2 * k3) / (2 * k1)) * (k3 * (1 - k1) - k1 * (1 - k2) * (1 - k3) * c) / (k3 * (1 - k1) + X);
  const OBR = d * s((k1 * k3) / (2 * k2)) * (k3 - k2 * (1 - k3) * c) / (k3 - k3 * (k1 - k2) * c + k1 * k2 * (1 - k3) * c * c);
  const ABH = 4 * pi * pi * s((2 * (1 - k1) ** 3) / ((1 - k2) * (1 - k3))) * (1 + X / (k3 * (1 - k1))) / (d * d);
  const ABR = 4 * pi * pi * s((2 * k2 * (k2 - k3) ** 3) / (k1 * (k1 - k3) * (1 - k3))) * (1 - (k1 - k2) * c + (k1 * k2 * (1 - k3) * c * c) / k3) / (d * d);
  const TBH = (1 / (2 * pi)) * s(((1 - k2) * (1 - k3)) / (2 * (1 - k1))) * d * d / (1 + X / (k3 * (1 - k1)));
  const TBR = (1 / (2 * pi)) * s((k1 * (1 - k3) * (k1 - k3)) / (2 * k2 * (k2 - k3))) * d * d / (1 - (k1 - k2) * c + (k1 * k2 * (1 - k3) * c * c) / k3);
  const aH = (A) => (3 / 16) * s(3 / pi) * A / M ** 1.5, om = (O) => s(8 / (3 * pi)) * O * s(M), tau = (T) => s((32 * pi) / 3) * T * s(M);
  return {
    c, M, J, MBH, JBH, OBH, OBR, ABH, ABR,
    j: Math.sign(J) * s(((27 * pi) / 32) * (J * J) / M ** 3),
    aBH: aH(ABH), aBR: aH(ABR), omBH: om(OBH), omBR: om(OBR), tBH: tau(TBH), tBR: tau(TBR),
  };
}

// The four balanced saturns (κ₁, κ₂, κ₃), found by solving the formulas: c̄₂ = 0; co-rotating; Ω_BH = 0; counter-rotating.
const KEYS = [
  { k: [0.9, 0.5, 0.35162], name: 'A', line: 'This hole has no spin of its own. The ring drags it round anyway.' },
  { k: [0.9, 0.5, 0.2], name: 'B', line: 'Hole and ring spinning the same way. Matching outfits.' },
  { k: [0.9, 0.5, 0.39121], name: 'C', line: 'The hole spins backwards just enough to stand still. Exhausting.' },
  { k: [0.95, 0.7, 0.69], name: 'D', line: 'Hole spinning against the ring. Still in balance. Still dark.' },
];
const RING_TEXT = 'YOU WILL HAVE NO FRIENDS AND DIE ALONE';   // what the ring says (owner's request, 2026-11-21)
const MOVE = 4, HOLD = 8, LOOP = KEYS.length * (MOVE + HOLD);

const HORIZON_VERT = /* glsl */ `
  varying vec3 vN, vView, vLocal;
  void main() {
    vLocal = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const HORIZON_FRAG = /* glsl */ `
  uniform float uTurn, uRing, uTextH;
  uniform vec3 uRim;
  uniform sampler2D uText;
  varying vec3 vN, vView, vLocal;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 5.0);   // only the very edge glows
    // bands drifting round the spin axis (y), at the horizon's own angular velocity
    // the hole turns about y; the ring is built flat in its own x–y plane (then laid down), so its angle is atan(y, x)
    float ang = (uRing > 0.5 ? atan(vLocal.y, vLocal.x) : atan(vLocal.z, vLocal.x)) + uTurn;
    float band = 0.5 + 0.5 * cos(ang * (uRing > 0.5 ? 24.0 : 10.0));
    vec3 col = uRim * (f * 1.5 + 0.05 * band * (0.3 + f)) + vec3(0.003);
    // the ring's message, written round its top and bottom faces and carried round at the ring's own speed
    if (uRing > 0.5) {
      float tubeAng = atan(vLocal.z, length(vLocal.xy) - 1.0);          // where on the tube's cross-section
      float across = abs(abs(tubeAng) - 1.5707963) * sign(length(vLocal.xy) - 1.0);
      vec2 st = vec2(fract(-ang / 6.2831853), 0.5 - across / uTextH);
      float ink = (st.y > 0.0 && st.y < 1.0) ? texture2D(uText, st).r : 0.0;
      col += uRim * ink * 0.55;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const LIVE = { s: saturn(...KEYS[0].k), key: KEYS[0] };

export default {
  name: 'Dark Saturn',
  description:
    'A black hole wearing a ring that is also a black hole: "black Saturn", an exact solution of Einstein\'s equations ' +
    'in five-dimensional spacetime (Elvang and Figueras, 2007). The ring\'s spin holds it up; it can even drag the ' +
    'central hole round. Every number is from the exact solution. With sound on, each horizon hums at its own spin.',
  tags: ['black holes', 'black saturn', 'black ring', 'higher dimensions', 'general relativity', 'astronomy', 'sound'],
  category: 'Physics',
  mode: '3d',
  controls: 'orbit',
  sound: 'live',

  motion(t) {
    const u = t % LOOP, seg = Math.floor(u / (MOVE + HOLD)), w = u - seg * (MOVE + HOLD);
    const a = KEYS[seg], b = KEYS[(seg + 1) % KEYS.length];
    const f = w < HOLD ? 0 : smooth((w - HOLD) / MOVE);
    return { k: a.k.map((x, i) => x + (b.k[i] - x) * f), key: f < 0.5 ? a : b, t };
  },

  latex: (params, hl, m) => {
    const s = LIVE.s;
    return (
      '\\begin{aligned}' +
      `&j = ${hl(s.j, 3)},\\quad \\kappa = (${m.k.map((x) => x.toFixed(2)).join(',')}) \\\\` +
      `&\\text{hole: } a_H = ${hl(s.aBH, 3)},\\ \\omega = ${hl(s.omBH, 3)},\\ J_{BH}/J = ${hl(s.JBH / s.J, 3)} \\\\` +
      `&\\text{ring: } a_H = ${hl(s.aBR, 3)},\\ \\omega = ${hl(s.omBR, 3)} \\\\` +
      `&a_H^{\\text{total}} = ${hl(s.aBH + s.aBR, 3)} < 2\\sqrt2\\ \\text{(5-D Schwarzschild)} \\\\` +
      `& ${caption(LIVE.key.line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x010104);
    const glow = createGlow(ctx, { fov: 40, strength: 0.8, threshold: 0.5, exposure: 1, vignette: 0.6 });
    camera.position.set(0, 2.6, 6.2);
    ctx.controls?.target.set(0, 0, 0);
    ctx.controls?.update();
    // the ring's message: a strip of text drawn once on a canvas, repeated three times round the ring
    // see docs/wiki/textures.md and docs/wiki/sketches/darkSaturn.md
    const cv = document.createElement('canvas');
    cv.width = 4096; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fff'; g.font = 'bold 100px system-ui, sans-serif';
    const fit = Math.min(1, (0.9 * cv.width / 3) / g.measureText(RING_TEXT).width);   // each copy fills 90% of its third
    g.font = `bold ${Math.floor(100 * fit)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) g.fillText(RING_TEXT, (i + 0.5) * cv.width / 3, cv.height / 2);
    const text = new THREE.CanvasTexture(cv);
    text.minFilter = THREE.LinearFilter; text.generateMipmaps = false;   // no mipmaps: the wrap-round seam would show
    text.colorSpace = THREE.NoColorSpace;
    const mat = (rim, ring) => new THREE.ShaderMaterial({
      vertexShader: HORIZON_VERT, fragmentShader: HORIZON_FRAG,
      uniforms: { uTurn: { value: 0 }, uRing: { value: ring ? 1 : 0 }, uRim: { value: new THREE.Color(rim) },
        uText: { value: text }, uTextH: { value: 2 } },
    });
    const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat(0xffb46a, false));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 48, 220), mat(0x8fb8ff, true));
    ring.rotation.x = Math.PI / 2;                                  // lying flat, round the hole's spin axis
    scene.add(hole, ring);
    // background stars
    const n = 1800, pos = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.randomDirection().multiplyScalar(60 + Math.random() * 40); pos.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9aa6c8, size: 0.12, sizeAttenuation: true })));
    return { glow, hole, ring, text, turnBH: 0, turnBR: 0, player: createSoundPlayer({ volume: 0.35 }) };
  },

  update(ctx, state) {
    const m = ctx.motion, s = saturn(...m.k);
    LIVE.s = s; LIVE.key = m.key;
    // sizes in units of √M (the natural length for a 5-D mass), scaled to the screen
    const unit = 1 / Math.sqrt(s.M), k = 2.2;
    const rBH = Math.cbrt(s.ABH / (2 * Math.PI * Math.PI)) * unit * k;
    let R = (1 / (Math.SQRT2 * Math.abs(s.OBR))) * unit * k;
    const rT = Math.sqrt(s.ABR / (8 * Math.PI * Math.PI * (R / (unit * k)))) * unit * k;
    R = Math.max(R, rBH + rT * 1.6 + 0.15);                         // keep the drawing from overlapping
    state.hole.scale.setScalar(rBH);
    state.ring.scale.set(R, R, 1);
    const tube = Math.min(0.45, rT / R);
    if (Math.abs(tube - (state.tube ?? -1)) > 0.004) {              // rebuild the ring only when its thickness changes
      state.tube = tube;
      state.ring.geometry.dispose();
      state.ring.geometry = new THREE.TorusGeometry(1, tube, 40, 200);
      // keep the letters the same shape: the text strip spans this much of the tube's cross-section (radians)
      state.ring.material.uniforms.uTextH.value = (2 * Math.PI / 3) * (256 / (4096 / 3)) / tube;
    }
    // turning: angular velocity in units of 1/√M, slowed so the eye can follow
    const dt = ctx.delta * (ctx.params.speed ?? 1);
    state.turnBH += s.omBH * dt * 1.5;
    state.turnBR += s.omBR * dt * 1.5;
    state.hole.material.uniforms.uTurn.value = state.turnBH;
    state.ring.material.uniforms.uTurn.value = state.turnBR;
    // sonification: pitch 330 Hz × 2^ω (one octave up per unit of reduced angular velocity), hole left, ring right
    state.player.tones([
      { freq: 330 * 2 ** s.omBH, gain: 0.18, pan: -0.4 },
      { freq: 330 * 2 ** s.omBR, gain: 0.14, pan: 0.4 },
    ]);
  },

  dispose(ctx, state) {
    state.player.dispose();
    state.text.dispose();
    state.glow.dispose();
  },
};
