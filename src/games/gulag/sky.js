import * as THREE from 'three';
import { NOISE } from './materials.js';
import { rng, canvasTexture } from './world.js';

// The butts, what they drop, and what happens when it lands.
//
// A butt is a height field hanging under the cloud deck: two cheeks, each a
// super-ellipsoidal cap of radius R_c, depth R_c(1 − (d/R_c)^2.2)^0.6, joined
// by a smooth max (which leaves the cleft), with the anus at the bottom of the
// cleft. It drifts over a target, clenches, and a log comes out: the log moves
// down out of the anus at the extrusion speed (the part still inside is hidden
// by the butt itself), then falls freely, y = y₀ − ½gt², tumbling. Landing:
// it settles flat and squashes, kernels on its upper side become pickups, and
// anyone it lands on is hit.

const G = 9.81;
const RC = 3.2; // cheek radius, m
const RB = 9.5; // radius of the patch
const CHEEK_X = 0.62 * RC;

function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// Depth of the butt surface below its rim at (x, z); the anus is at (0, 0).
function buttDepth(x, z) {
  const cheek = (cx) => {
    const d = Math.hypot(x - cx, z * 0.92);
    return RC * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, d / (RC * 1.15)), 2.2)), 0.6);
  };
  let d = smax(cheek(CHEEK_X), cheek(-CHEEK_X), 1.2);
  d -= 0.35 * Math.exp(-(x * x) / 0.12) * Math.exp(-(z * z) / 9); // the cleft
  return d;
}
export const ANUS_DEPTH = buttDepth(0, 0);

function buttGeometry() {
  const NR = 70;
  const NA = 120;
  const pos = [];
  const aR = [];
  const idx = [];
  for (let j = 0; j <= NR; j++) {
    const u = j / NR;
    const rho = 0.02 + RB * Math.pow(u, 1.8);
    for (let i = 0; i < NA; i++) {
      const ph = (i / NA) * Math.PI * 2;
      const x = rho * Math.cos(ph);
      const z = rho * Math.sin(ph);
      pos.push(x, -buttDepth(x, z), z);
      aR.push(rho);
    }
  }
  for (let j = 0; j < NR; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * NA + i;
      const b = j * NA + ((i + 1) % NA);
      idx.push(a, b, a + NA, b, b + NA, a + NA);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buttMaterial(tone) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tone,
    roughness: 0.5,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.6, 0.35, 0.3),
    clearcoat: 0.1,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  const u = { uOpen: { value: 0 }, uClench: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aR; uniform float uOpen; uniform float uClench; varying float vR; varying vec3 vW;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vR = aR;
        {
          // Radial folds round the anus, smoothed out as it opens; the opening
          // pulls the rim up into the canal.
          float ph = atan(position.z, position.x);
          float near = exp(-aR * aR / 0.5);
          transformed.y += near * 0.05 * cos(14.0 * ph) * (1.0 - uOpen);
          float rim = 0.55 * uOpen;
          transformed.y += smoothstep(rim + 0.25, rim * 0.6, aR) * (0.9 * uOpen + 0.3 * uClench);
          transformed.xz *= 1.0 + smoothstep(0.9, 0.0, aR) * uOpen * 0.6;
          transformed.xz *= 1.0 - 0.04 * uClench * smoothstep(${RB.toFixed(1)}, 2.0, aR);
        }
        vW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uOpen; varying float vR; varying vec3 vW;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float mot = gNoise(vW * 0.9) * 0.5 + gNoise(vW * 3.0) * 0.25;
          diffuseColor.rgb *= 0.9 + 0.2 * mot;
          float pig = smoothstep(1.2, 0.15, vR);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.14, 0.11), pig * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.01, 0.01), smoothstep(0.35 + uOpen * 0.4, 0.05, vR));
          // Goosebumps: it is cold up there.
          float bump = smoothstep(0.6, 0.9, gNoise(vW * 22.0));
          diffuseColor.rgb *= 1.0 - bump * 0.08;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'gulag-butt';
  return m;
}

// ---- the log ----
const LOG_RINGS = 44;
const LOG_SEG = 28;

function logGeometry(r, L, R) {
  const pos = [];
  const col = [];
  const idx = [];
  const tail = 0.7 + r() * 0.5;
  const lump = 0.55 + r() * 0.4;
  const phase = r() * 10;
  const radius = (s) => {
    const cap = s < 0.5 * R ? R * Math.sqrt(Math.max(0, 1 - (1 - s / (0.5 * R)) ** 2)) : R;
    const u = Math.min(1, (L - s) / tail);
    const pinch = R * (1 - (1 - u) ** 2.2);
    return Math.max(0.001, Math.min(cap, pinch)) * (1 + 0.07 * Math.sin((s / lump) * Math.PI * 2 + phase));
  };
  for (let j = 0; j <= LOG_RINGS; j++) {
    const s = (j / LOG_RINGS) * L;
    const rs = radius(s);
    for (let i = 0; i <= LOG_SEG; i++) {
      const a = (i / LOG_SEG) * Math.PI * 2;
      const crack = Math.max(0, Math.sin(s * 9 + Math.sin(a * 3 + phase) * 1.4)) ** 12;
      const bumpy = 1 + 0.04 * Math.sin(a * 5 + s * 3 + phase) - crack * 0.05;
      pos.push(Math.cos(a) * rs * bumpy, s - L / 2, Math.sin(a) * rs * bumpy);
      const v = 0.9 + 0.2 * r() - crack * 0.4;
      col.push(v, v, v);
    }
  }
  for (let j = 0; j < LOG_RINGS; j++) {
    for (let i = 0; i < LOG_SEG; i++) {
      const a = j * (LOG_SEG + 1) + i;
      const b = a + LOG_SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Kernel sockets: points on the surface, with their outward normals.
  const slots = [];
  const n = 6 + Math.floor(r() * 5);
  for (let k = 0; k < n; k++) {
    const s = 0.4 + r() * (L - 1.0);
    const a = r() * Math.PI * 2;
    const rs = radius(s) * 0.93;
    slots.push({ p: new THREE.Vector3(Math.cos(a) * rs, s - L / 2, Math.sin(a) * rs), n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
  }
  return { geo: g, slots };
}

function logMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x4a2c12,
    vertexColors: true,
    roughness: 0.82,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    sheen: 0.25,
    sheenColor: new THREE.Color(0.35, 0.22, 0.1),
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vL;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        float fib = gNoise(vL * vec3(6.0, 2.0, 6.0)) * 0.5 + gNoise(vL * 24.0) * 0.3 + gNoise(vL * vec3(70.0, 20.0, 70.0)) * 0.2;
        diffuseColor.rgb *= 0.65 + 0.6 * fib;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 0.95, 0.6), gNoise(vL * 3.0)); // olive patches
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.3, 0.1), smoothstep(0.82, 0.9, gNoise(vL * 11.0)) * 0.6); // undigested bits`,
      );
  };
  m.customProgramCacheKey = () => 'gulag-log';
  return m;
}

function splatTexture(seed) {
  const r = rng(seed);
  return canvasTexture(256, (g, n) => {
    g.clearRect(0, 0, n, n);
    const c = n / 2;
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 1.6) * n * 0.42;
      const rad = (1 - d / (n * 0.5)) * (6 + r() * 26);
      g.beginPath();
      g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, rad, 0, Math.PI * 2);
      const v = 40 + r() * 30;
      g.fillStyle = `rgba(${v * 1.6 | 0},${v | 0},${v * 0.45 | 0},${0.75 + r() * 0.25})`;
      g.fill();
    }
    g.beginPath();
    g.ellipse(c, c, n * 0.18, n * 0.12, r(), 0, Math.PI * 2);
    g.fillStyle = 'rgba(70,40,16,0.95)';
    g.fill();
  });
}

export function createSky(scene, world, corn, { onRelease, onLand } = {}) {
  const r = rng(Date.now() & 0xffff);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const bGeo = keep(buttGeometry());
  const butts = [];
  const logs = [];
  const splats = [];
  const lMat = keep(logMaterial());
  const splatTex = [1, 2, 3].map((s) => keep(splatTexture(s)));
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0x6b2a12, transparent: true, opacity: 0.0, depthWrite: false }));
  const tones = [0xd9a58a, 0xc58f73, 0x9c6a50, 0xe0b49c, 0x7a4f3a];

  // Spray: pooled brown blobs.
  const SPRAY = 240;
  const sprayMat = keep(new THREE.MeshPhysicalMaterial({ color: 0x4a2c12, roughness: 0.5, clearcoat: 0.4 }));
  const sprayMesh = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(0.035, 1)), sprayMat, SPRAY);
  sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sprayMesh.frustumCulled = false;
  scene.add(sprayMesh);
  const spray = Array.from({ length: SPRAY }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, s: 1, live: false }));
  let sprayNext = 0;
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SPRAY; i++) sprayMesh.setMatrixAt(i, zero);

  function addButt() {
    const mat = keep(buttMaterial(new THREE.Color(tones[Math.floor(r() * tones.length)])));
    const mesh = new THREE.Mesh(bGeo, mat);
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    const a = r() * Math.PI * 2;
    group.position.set(Math.cos(a) * 30, world.deckY + 0.3, Math.sin(a) * 30);
    group.rotation.y = r() * Math.PI * 2;
    scene.add(group);
    const b = { group, mat, state: 'drift', t: 0, target: new THREE.Vector3(), cooldown: 2 + r() * 4, log: null, wobble: 0 };
    butts.push(b);
    return b;
  }

  function anusWorld(b, out = new THREE.Vector3()) {
    return out.set(0, -ANUS_DEPTH - 0.1, 0).applyMatrix4(b.group.matrixWorld);
  }

  function makeLog(b) {
    const L = 2.6 + r() * 1.4;
    const R = 0.36 + r() * 0.1;
    const { geo, slots } = logGeometry(r, L, R);
    keep(geo);
    const mesh = new THREE.Mesh(geo, lMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.85, 1, 48)), ringMat.clone());
    keep(ring.material);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const anus = anusWorld(b);
    const log = {
      mesh, ring, L, R, slots, butt: b, state: 'extrude', out: 0, t: 0, age: 0,
      pos: new THREE.Vector3(anus.x, anus.y + L / 2, anus.z), vel: new THREE.Vector3(),
      q: new THREE.Quaternion(), spin: new THREE.Vector3((r() - 0.5) * 2.2, 0, (r() - 0.5) * 2.2),
      ground: new THREE.Vector3(anus.x, 0, anus.z), kernels: [], splat: null,
      a: new THREE.Vector3(), b: new THREE.Vector3(),
    };
    mesh.position.copy(log.pos);
    logs.push(log);
    return log;
  }

  function burst(p, n, speed) {
    for (let i = 0; i < n; i++) {
      const s = spray[sprayNext];
      sprayNext = (sprayNext + 1) % SPRAY;
      const a = r() * Math.PI * 2;
      const up = 0.3 + r();
      s.p.copy(p);
      s.v.set(Math.cos(a) * speed * r(), up * speed * 0.8, Math.sin(a) * speed * r());
      s.t = 0;
      s.s = 0.5 + r() * 1.5;
      s.live = true;
    }
  }

  function land(log) {
    log.state = 'landed';
    log.t = 0;
    // Lie flat along the direction the tumble left it, squashed.
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(log.q);
    const yaw = Math.atan2(axis.x, axis.z);
    log.q0 = log.q.clone();
    log.q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    log.pos.y = log.R * 0.72;
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(log.q1);
    log.a.copy(log.pos).addScaledVector(dir, -log.L / 2).setY(0);
    log.b.copy(log.pos).addScaledVector(dir, log.L / 2).setY(0);
    burst(new THREE.Vector3(log.pos.x, 0.3, log.pos.z), 70, 7);
    // Splat on the snow.
    const tex = splatTex[Math.floor(r() * splatTex.length)];
    const sm = keep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    const splat = new THREE.Mesh(keep(new THREE.PlaneGeometry(log.L + 3, log.L + 3)), sm);
    splat.rotation.set(-Math.PI / 2, 0, r() * Math.PI * 2);
    splat.position.set(log.pos.x, 0.02, log.pos.z);
    splat.receiveShadow = true;
    scene.add(splat);
    log.splat = splat;
    log.ring.visible = false;
    onLand?.(log);
  }

  // After the squash, the kernels on its upper side are free to take; the
  // splash throws a few onto the snow.
  function seedKernels(log) {
    log.mesh.updateMatrixWorld(true);
    const nm = new THREE.Matrix3().getNormalMatrix(log.mesh.matrixWorld);
    for (const slot of log.slots) {
      const n = slot.n.clone().applyMatrix3(nm).normalize();
      if (n.y < -0.15) continue;
      const p = slot.p.clone().applyMatrix4(log.mesh.matrixWorld);
      log.kernels.push(corn.spawn(p, n, r() < 0.3));
    }
    for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
      const a = r() * Math.PI * 2;
      const d = log.R + 0.4 + r() * 2.2;
      log.kernels.push(corn.spawn(new THREE.Vector3(log.pos.x + Math.cos(a) * d, 0.06, log.pos.z + Math.sin(a) * d), new THREE.Vector3(0, 1, 0), r() < 0.3));
    }
  }

  const tmp = new THREE.Vector3();
  return {
    butts,
    logs,
    addButt,
    // Butts pick a spot above the yard (often above someone) and go.
    update(dt, t, { targets, rate, yard }) {
      const holes = [];
      for (const b of butts) {
        b.t += dt;
        b.group.updateMatrixWorld(true);
        holes.push({ x: b.group.position.x, z: b.group.position.z, r: RB * 0.75 });
        if (b.state === 'drift') {
          b.cooldown -= dt * rate;
          if (b.cooldown <= 0 && b.target.lengthSq() === 0) {
            const who = targets.length && r() < 0.7 ? targets[Math.floor(r() * targets.length)] : null;
            if (who) b.target.set(who.x + (r() - 0.5) * 3, 0, who.z + (r() - 0.5) * 3);
            else b.target.set((r() - 0.5) * yard.x * 1.8, 0, (r() - 0.5) * yard.z * 1.8);
            b.target.x = THREE.MathUtils.clamp(b.target.x, -yard.x + 1, yard.x - 1);
            b.target.z = THREE.MathUtils.clamp(b.target.z, -yard.z + 1, yard.z - 1);
          }
          const goal = b.target.lengthSq() ? b.target : tmp.set(Math.sin(t * 0.05 + b.cooldown) * 25, 0, Math.cos(t * 0.04) * 25);
          const dx = goal.x - b.group.position.x;
          const dz = goal.z - b.group.position.z;
          const d = Math.hypot(dx, dz);
          const sp = Math.min(d, 3.2 * dt);
          if (d > 1e-3) {
            b.group.position.x += (dx / d) * sp;
            b.group.position.z += (dz / d) * sp;
          }
          if (b.target.lengthSq() && d < 0.3) {
            b.state = 'clench';
            b.t = 0;
            b.log = makeLog(b);
          }
        } else if (b.state === 'clench') {
          b.mat.userData.u.uClench.value = Math.min(1, b.t / 0.5);
          b.mat.userData.u.uOpen.value = Math.min(1, b.t / 0.8);
          if (b.t > 0.8) {
            b.state = 'push';
            b.t = 0;
          }
        } else if (b.state === 'push') {
          if (!b.log || b.log.state !== 'extrude') {
            b.state = 'close';
            b.t = 0;
            b.wobble = 1;
          }
        } else if (b.state === 'close') {
          b.mat.userData.u.uOpen.value = Math.max(0, 1 - b.t / 0.6);
          b.mat.userData.u.uClench.value = Math.max(0, 1 - b.t / 0.6);
          if (b.t > 0.6) {
            b.state = 'drift';
            b.target.set(0, 0, 0);
            b.cooldown = 6 + r() * 6;
            b.log = null;
          }
        }
        // Jiggle after letting go: a damped oscillation of the cheeks.
        b.wobble *= Math.exp(-dt * 2.5);
        const w = 1 + 0.035 * b.wobble * Math.sin(b.t * 18);
        b.group.scale.set(w, 2 - w, w);
      }
      world.setHoles(holes);

      for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        log.t += dt;
        log.age += dt;
        if (log.state === 'extrude') {
          const anus = anusWorld(log.butt, tmp);
          log.out += dt * 2.6;
          log.pos.set(anus.x, anus.y + log.L / 2 - log.out, anus.z);
          log.ground.set(anus.x, 0, anus.z);
          if (log.out >= log.L) {
            log.state = 'fall';
            log.t = 0;
            log.vel.set(0, -1.5, 0);
            onRelease?.(log);
          }
        } else if (log.state === 'fall') {
          log.vel.y -= G * dt;
          log.pos.addScaledVector(log.vel, dt);
          const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(log.spin.x * dt, 0, log.spin.z * dt));
          log.q.premultiply(dq);
          if (log.pos.y - log.R < 0.3) land(log);
        } else if (log.state === 'landed') {
          const k = Math.min(1, log.t / 0.22);
          log.q.slerpQuaternions(log.q0, log.q1, 1 - (1 - k) ** 3);
          // Squash and recover a little: vertical scale overshoots then settles.
          const squash = 0.72 + 0.1 * Math.exp(-log.t * 6) * Math.cos(log.t * 30);
          log.mesh.scale.set(squash, 1, 1 / Math.sqrt(squash));
          if (log.t > 0.25 && !log.seeded) {
            log.seeded = true;
            seedKernels(log);
          }
          if (log.age > 70) {
            // Snow covers it: it sinks and the splat fades.
            const f = Math.min(1, (log.age - 70) / 6);
            log.pos.y = log.R * 0.72 - f * log.R * 2;
            log.splat.material.opacity = 1 - f;
            if (f >= 1) {
              scene.remove(log.mesh, log.splat, log.ring);
              for (const k2 of log.kernels) corn.bury(k2);
              logs.splice(i, 1);
              continue;
            }
          }
        }
        log.mesh.position.copy(log.pos);
        log.mesh.quaternion.copy(log.q);
        // Warning ring: shows where it will land, shrinking as it comes.
        if (log.state !== 'landed') {
          const h = Math.max(0, log.pos.y - log.L / 2);
          const k = THREE.MathUtils.clamp(h / 30, 0, 1);
          log.ring.visible = true;
          log.ring.position.set(log.ground.x, 0.04, log.ground.z);
          const s = log.L / 2 + 0.4 + k * 2.5;
          log.ring.scale.set(s, s, 1);
          log.ring.material.opacity = 0.35 + 0.5 * (1 - k);
        }
      }

      for (let i = 0; i < SPRAY; i++) {
        const s = spray[i];
        if (!s.live) continue;
        s.t += dt;
        s.v.y -= G * dt;
        s.p.addScaledVector(s.v, dt);
        if (s.p.y < 0.02) {
          s.p.y = 0.02;
          s.v.set(0, 0, 0);
        }
        const fade = Math.max(0, 1 - Math.max(0, s.t - 2) / 2);
        if (fade <= 0) {
          s.live = false;
          sprayMesh.setMatrixAt(i, zero);
          continue;
        }
        m4.makeScale(s.s * fade, s.s * fade * (s.p.y <= 0.021 ? 0.35 : 1), s.s * fade).setPosition(s.p);
        sprayMesh.setMatrixAt(i, m4);
      }
      sprayMesh.instanceMatrix.needsUpdate = true;
    },
    // Horizontal distance from a point to a landed log's axis, minus its radius.
    logDistance(log, x, z) {
      const ax = log.a.x;
      const az = log.a.z;
      const bx = log.b.x - ax;
      const bz = log.b.z - az;
      const t = THREE.MathUtils.clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1), 0, 1);
      return Math.hypot(x - ax - bx * t, z - az - bz * t) - log.R;
    },
    dispose() {
      for (const b of butts) scene.remove(b.group);
      for (const l of logs) scene.remove(l.mesh, l.ring, l.splat);
      scene.remove(sprayMesh);
      for (const d of disposables) d.dispose?.();
    },
  };
}
