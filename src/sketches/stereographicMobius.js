import * as THREE from 'three';
import { TAU, smooth } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Stereographic Projection and Möbius Maps. A see-through ball rests on a flat plane with a lamp at its very top.
// A pattern painted on the ball casts a shadow on the plane: every point of the plane is the shadow of exactly one
// point of the ball (the lamp's own point lands at infinity). That is stereographic projection, known to Hipparchus
// and used for star charts ever since. It keeps angles: circles on the ball land as circles (or straight lines) on
// the plane.
// Now move the ball, keeping the lamp on top. Slide it and the shadow slides (z ↦ z + b); lift it and the shadow
// grows (z ↦ kz); spin it about the vertical and the shadow turns (z ↦ e^{iθ}z); tip it over and something stranger
// happens: the shadow turns inside out, straight lines curving into circles. Every one of these is a Möbius map,
//     f(z) = (az + b) / (cz + d),     ad − bc ≠ 0,
// and every Möbius map comes from some motion of the ball (Arnold and Rogness, "Möbius Transformations Revealed",
// a short film, 2007). The numbers a, b, c, d shown are worked out live from where three points land: 0, 1 and ∞.
// The pattern lives on the ball: a grid of unit squares and rings, as it would be on the plane with the ball at rest.
// see docs/wiki/sketches/stereographicMobius.md

const LOOP = 48;

// The shared pattern: given the complex number w = x + iy that a point stands for, a colour.
const PATTERN = /* glsl */ `
  vec3 pattern(vec2 w) {
    float r = length(w);
    vec3 base = 0.5 + 0.45 * cos(6.2831853 * (atan(w.y, w.x) / 6.2831853 + vec3(0.0, 0.33, 0.67)));
    vec2 cell = floor(w);
    float check = mod(cell.x + cell.y, 2.0);
    vec3 col = base * (0.18 + 0.1 * check);
    vec2 f = abs(fract(w + 0.5) - 0.5) / max(fwidth(w), vec2(1e-4));
    float grid = 1.0 - min(min(f.x, f.y), 1.0);
    col = mix(col, base * 1.4 + 0.2, grid * 0.9);
    float ring = abs(fract(log2(max(r, 1e-4)) + 0.5) - 0.5) / max(fwidth(log2(max(r, 1e-4))), 1e-4);
    col = mix(col, vec3(1.0, 0.85, 0.5), (1.0 - min(ring, 1.0)) * 0.8);
    return col;
  }`;

const SPHERE_VERT = /* glsl */ `
  varying vec3 vBody;
  varying vec3 vN;
  void main() { vBody = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPHERE_FRAG = /* glsl */ `
  varying vec3 vBody;
  varying vec3 vN;
  ${PATTERN}
  void main() {
    // the ball at rest: its point q projects from its top (0, 1, 0) to w = (q.x, q.z) · 2 / (1 − q.y)
    vec3 q = normalize(vBody);
    vec2 w = vec2(q.x, q.z) * 2.0 / max(1.0 - q.y, 1e-3);
    vec3 col = pattern(w);
    float rim = pow(1.0 - abs(vN.z), 2.0);
    gl_FragColor = vec4(col * 0.9 + rim * 0.15, 0.55);
  }`;
const PLANE_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 p = modelMatrix * vec4(position, 1.0); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }`;
const PLANE_FRAG = /* glsl */ `
  uniform vec3 uC;          // ball centre
  uniform mat3 uRinv;       // undo the ball's turn
  varying vec3 vWorld;
  ${PATTERN}
  void main() {
    // the ray from the lamp (top of the ball) to this point of the plane meets the ball again at Q
    vec3 lamp = uC + vec3(0.0, 1.0, 0.0), d = vWorld - lamp;
    float s = -2.0 * d.y / dot(d, d);                    // u = lamp − centre = (0, 1, 0), so u·d = d.y
    vec3 Q = lamp + s * d;
    vec3 q = uRinv * (Q - uC);                           // that point, on the ball at rest
    vec2 w = vec2(q.x, q.z) * 2.0 / max(1.0 - q.y, 1e-4);
    vec3 col = pattern(w);
    float fade = exp(-length(vWorld.xz) * 0.045);         // fog far away
    gl_FragColor = vec4(mix(vec3(0.02, 0.025, 0.04), col, fade), 1.0);
  }`;

// The same maths in JavaScript, for the live a, b, c, d: reference point w → where its shadow lands now.
function shadowOf(w, C, R) {
  // w → point on the ball at rest (inverse projection): q = (2x, |w|² − 4 … ) for a unit ball touching at 0, lamp at 2
  const [x, y] = w, r2 = x * x + y * y;
  const q = new THREE.Vector3((4 * x) / (r2 + 4), (r2 - 4) / (r2 + 4), (4 * y) / (r2 + 4));
  const Q = q.applyMatrix3(R).add(C), lamp = C.clone().add(new THREE.Vector3(0, 1, 0));
  const dy = Q.y - lamp.y;
  if (Math.abs(dy) < 1e-9) return null;                 // shadow at infinity
  const t = -lamp.y / dy;
  return [lamp.x + t * (Q.x - lamp.x), lamp.z + t * (Q.z - lamp.z)];
}
function shadowOfInfinity(C, R) {
  const Q = new THREE.Vector3(0, 1, 0).applyMatrix3(R).add(C), lamp = C.clone().add(new THREE.Vector3(0, 1, 0));
  const dy = Q.y - lamp.y;
  if (Math.abs(dy) < 1e-7) return null;
  const t = -lamp.y / dy;
  return [lamp.x + t * (Q.x - lamp.x), lamp.z + t * (Q.z - lamp.z)];
}
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

const LIVE = { a: [1, 0], b: [0, 0], c: [0, 0], d: [1, 0] };
const MOVES = ['\\text{slide: } z \\mapsto z + b', '\\text{lift: } z \\mapsto kz', '\\text{spin: } z \\mapsto e^{i\\theta} z', '\\text{tip over: a M\\"obius map that moves } \\infty'];

// The choreography: each move's ball centre offset (x, lift, z), spin about the vertical, and tip about the x axis.
function pose(t) {
  const u = (t % LOOP) / LOOP;
  const seg = (a, b) => smooth(Math.min(1, Math.max(0, (u - a) / (b - a))));
  const bump = (a, b) => Math.sin(Math.PI * Math.min(1, Math.max(0, (u - a) / (b - a))));
  const slide = bump(0.02, 0.2), lift = bump(0.22, 0.38), spin = seg(0.4, 0.56) - seg(0.57, 0.6), tip = bump(0.62, 0.95);
  const move = u < 0.21 ? 0 : u < 0.39 ? 1 : u < 0.61 ? 2 : 3;
  return { x: 2.2 * slide, z: 1.4 * slide, lift: 1.6 * lift, spin: TAU * 0.25 * spin, tip: 1.3 * tip, move };
}

export default {
  name: 'Stereographic Projection',
  description:
    'A see-through ball with a lamp on top casts its pattern onto the plane below. Slide the ball and the shadow ' +
    'slides; lift it and the shadow grows; spin it and it turns; tip it over and straight lines bend into circles. ' +
    'Every move is a Möbius transformation, f(z) = (az + b)/(cz + d), worked out live.',
  tags: ['stereographic projection', 'mobius transformation', 'complex analysis', 'geometry', 'riemann sphere'],
  category: 'Topology',
  mode: '3d',
  controls: 'orbit',

  motion(t) {
    return pose(t);
  },

  latex: (params, hl, m) => {
    const f = (z) => `${hl(z[0], 2)} ${z[1] < 0 ? '-' : '+'} ${hl(Math.abs(z[1]), 2)}i`;
    const L = LIVE;
    return (
      '\\begin{aligned}' +
      'f(z) &= \\frac{az + b}{cz + d} \\\\' +
      `a &= ${f(L.a)},\\quad b = ${f(L.b)} \\\\` +
      `c &= ${f(L.c)},\\quad d = ${f(L.d)} \\\\` +
      `& ${MOVES[m.move]} \\\\` +
      `& ${caption(m.tip > 0.3 ? 'Infinity just landed on the plane. It is the lamp\'s shadow.' : 'The plane is the ball, unrolled from the top.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x020309);
    camera.position.set(3.6, 4.4, 5.6);
    ctx.controls?.target.set(0.6, 0.6, 0);
    ctx.controls?.update();
    const planeMat = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERT, fragmentShader: PLANE_FRAG,
      uniforms: { uC: { value: new THREE.Vector3(0, 1, 0) }, uRinv: { value: new THREE.Matrix3() } },
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 1, 1).rotateX(-Math.PI / 2), planeMat);
    scene.add(plane);
    const ballMat = new THREE.ShaderMaterial({ vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), ballMat);
    scene.add(ball);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    scene.add(lamp);
    // a few light rays from the lamp, through the ball's equator, to the plane
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 2 * 3), 3));
    const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.35 }));
    scene.add(rays);
    return { planeMat, ball, lamp, rays, R: new THREE.Matrix3(), C: new THREE.Vector3() };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const C = state.C.set(m.x, 1 + m.lift, m.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(m.tip, m.spin, 0, 'YXZ'));
    state.ball.position.copy(C);
    state.ball.quaternion.copy(q);
    const R4 = new THREE.Matrix4().makeRotationFromQuaternion(q);
    state.R.setFromMatrix4(R4);
    state.planeMat.uniforms.uC.value.copy(C);
    state.planeMat.uniforms.uRinv.value.copy(state.R).transpose();
    state.lamp.position.set(C.x, C.y + 1, C.z);
    // rays: lamp → a point on the ball's equator (in the ball's own frame) → its shadow
    const pos = state.rays.geometry.attributes.position.array;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU, w = [2 * Math.cos(ang), 2 * Math.sin(ang)];
      const sh = shadowOf(w, C, state.R) || [C.x, C.z];
      pos.set([C.x, C.y + 1, C.z, sh[0], 0, sh[1]], k * 6);
    }
    state.rays.geometry.attributes.position.needsUpdate = true;
    // a, b, c, d from where 0, 1 and ∞ land (with d = 1; if ∞ stays at ∞ the map is a z + b)
    const w1 = shadowOf([0, 0], C, state.R), w2 = shadowOf([1, 0], C, state.R), w3 = shadowOfInfinity(C, state.R);
    if (w1 && w2) {
      if (!w3 || Math.hypot(...w3) > 1e6) Object.assign(LIVE, { a: csub(w2, w1), b: w1, c: [0, 0], d: [1, 0] });
      else {
        const c = cdiv(csub(w2, w1), csub(w3, w2));
        Object.assign(LIVE, { a: cmul(w3, c), b: w1, c, d: [1, 0] });
      }
    }
  },
};
