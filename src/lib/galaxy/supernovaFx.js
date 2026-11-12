import * as THREE from 'three';

// Draws supernova events (from eventEngine.js) in a galaxy's own frame (kpc). One Points object for the debris of
// up to SLOTS explosions at once and one for their flashes; each event only writes a few uniforms, so a burst of
// many explosions costs nothing extra in JavaScript.
// ARTISTIC: what an explosion looks like here — the flash, the shell, its size on screen and the slowed-down
// timing (a real one brightens over weeks and fades over months) — is illustration, shaped loosely by type:
// Type Ia rise fast and fade steadily; Type II-P stay bright on a plateau; their debris glows red (hydrogen).

const SLOTS = 32, PER = 360;
const TYPE_ID = { Ia: 0, Ibc: 1, II: 2 };

const VERT = /* glsl */ `
  attribute float aSlot;
  attribute vec3 aDir;
  attribute float aSpeed;
  uniform vec4 uEv[${SLOTS}];     // position (kpc), start time
  uniform vec4 uEvB[${SLOTS}];    // type, duration, intensity, size (kpc)
  uniform float uTime, uPx;
  varying vec3 vCol;
  varying float vA;
  void main() {
    int s = int(aSlot);
    vec4 E = uEv[s], B = uEvB[s];
    float age = uTime - E.w, dur = B.y;
    float u = age / dur;
    if (age < 0.0 || u > 2.4 || B.z <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    // the shell: fast at first, slowing as it sweeps up gas
    float r = B.w * aSpeed * (1.0 - exp(-2.2 * u));
    vec3 p = E.xyz + aDir * r;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float glow = exp(-1.6 * u) * (0.35 + 0.65 * smoothstep(0.0, 0.08, u));
    vec3 hot = vec3(0.85, 0.92, 1.0), red = vec3(1.0, 0.42, 0.3), teal = vec3(0.55, 0.9, 1.0);
    vec3 late = B.x < 0.5 ? vec3(1.0, 0.75, 0.45) : B.x < 1.5 ? teal : red;   // Ia: iron/cobalt; Ib/c: oxygen; II: hydrogen
    vCol = mix(hot, late, smoothstep(0.05, 0.6, u));
    // fade the debris in as the shell opens (all of it starts in one spot, which would add up to a white blob)
    vA = glow * (0.5 + 0.5 * aSpeed) * min(1.5, 0.4 + 0.3 * B.z) * 0.8 * smoothstep(0.01, 0.12, u);
    gl_PointSize = uPx * (0.6 + aSpeed) / max(0.05, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vCol * vA * exp(-r2 * 2.5), 1.0);
  }`;
const FLASH_VERT = /* glsl */ `
  attribute float aSlot;
  uniform vec4 uEv[${SLOTS}];
  uniform vec4 uEvB[${SLOTS}];
  uniform float uTime, uPx;
  varying float vA;
  varying vec3 vCol;
  void main() {
    int s = int(aSlot);
    vec4 E = uEv[s], B = uEvB[s];
    float age = uTime - E.w, u = age / B.y;
    if (age < 0.0 || u > 2.4 || B.z <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    // light curve, by type: rise; then Ia fades steadily, II-P holds a plateau then drops, Ib/c fades fast
    float rise = smoothstep(0.0, 0.07, u);
    float fall = B.x < 0.5 ? exp(-2.0 * u) : B.x < 1.5 ? exp(-2.8 * u) : (u < 0.6 ? 0.85 : 0.85 * exp(-5.0 * (u - 0.6)));
    vA = rise * fall * min(1.6, 0.5 + 0.4 * B.z);
    vCol = B.x < 0.5 ? vec3(0.85, 0.9, 1.0) : B.x < 1.5 ? vec3(0.8, 0.9, 1.0) : vec3(1.0, 0.85, 0.75);
    vec4 mv = modelViewMatrix * vec4(E.xyz, 1.0);
    gl_PointSize = uPx * 3.0 * (0.4 + 0.6 * vA) * B.w / max(0.05, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FLASH_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vCol;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q) * 2.0;
    if (r > 1.0) discard;
    float core = exp(-r * r * 60.0) * 0.8, halo = exp(-r * 6.0) * 0.35;
    float spikes = (exp(-abs(q.x) * 90.0) + exp(-abs(q.y) * 90.0)) * (1.0 - r) * 0.6;
    gl_FragColor = vec4(vCol * vA * (core + halo + spikes), 1.0);
  }`;

export function createSupernovaFx({ shellKpc = 0.35 } = {}) {
  const slot = new Float32Array(SLOTS * PER), dir = new Float32Array(SLOTS * PER * 3), speed = new Float32Array(SLOTS * PER);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < SLOTS * PER; i++) {
    slot[i] = Math.floor(i / PER);
    // directions over a sphere, clumpy like real ejecta (a few big plumes)
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    dir.set([s * Math.cos(a), s * Math.sin(a), z], i * 3);
    speed[i] = 0.55 + 0.45 * rnd() ** 0.5;
  }
  const uniforms = {
    uEv: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, 0, -1e9)) },
    uEvB: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 1, 0, shellKpc)) },
    uTime: { value: 0 }, uPx: { value: 400 },
  };
  const mk = (n, vert, frag, attrs) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    for (const [k, v, sz] of attrs) g.setAttribute(k, new THREE.BufferAttribute(v, sz));
    const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5;
    return p;
  };
  const debris = mk(SLOTS * PER, VERT, FRAG, [['aSlot', slot, 1], ['aDir', dir, 3], ['aSpeed', speed, 1]]);
  const flashes = mk(SLOTS, FLASH_VERT, FLASH_FRAG, [['aSlot', Float32Array.from({ length: SLOTS }, (_, i) => i), 1]]);
  const group = new THREE.Group();
  group.add(debris, flashes);
  const owner = new Array(SLOTS).fill(null);
  let rr = 0;
  return {
    group,
    /** start drawing an event; the oldest slot is reused when all are busy */
    add(e) {
      let k = owner.findIndex((o, i) => !o || uniforms.uTime.value - uniforms.uEv.value[i].w > o.duration * 2.4);
      if (k < 0) { k = rr; rr = (rr + 1) % SLOTS; }
      owner[k] = e;
      uniforms.uEv.value[k].set(e.pos[0], e.pos[1], e.pos[2], e.t0);
      uniforms.uEvB.value[k].set(TYPE_ID[e.type] ?? 2, e.duration, e.intensity, shellKpc * (e.provenance === 'OBSERVED' ? 1.3 : 1));
    },
    /** events currently visible, with how bright they are now (for picking) */
    active(now) { return owner.filter((o, i) => o && now - uniforms.uEv.value[i].w < o.duration * 2.4); },
    update(now, pxScale) { uniforms.uTime.value = now; uniforms.uPx.value = pxScale; },
    clear() { owner.fill(null); uniforms.uEvB.value.forEach((v) => v.setZ(0)); },
    dispose() { for (const p of [debris, flashes]) { p.geometry.dispose(); p.material.dispose(); } },
  };
}
