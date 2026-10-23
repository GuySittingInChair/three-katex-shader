import * as THREE from 'three';

// Sweet-corn kernels, at the scale of the butts that dropped them: about 16 cm
// instead of 1 cm. Food goes as volume, so a kernel 16× longer holds 16³ ≈ 4000×
// the food: 0.35 g × 0.86 kcal/g × 4096 ≈ 1200 kcal... which would make one
// kernel half a day's ration, so the game charges a camp-sized 300 kcal (it was
// partly digested on the way). About 30% are empty hulls: the pericarp is
// cellulose, β(1→4)-linked glucose, and no human enzyme cuts it: 0 kcal.

export const KERNEL_KCAL = 300;
const CAP = 600;

function kernelGeometry() {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    // A wedge: wide rounded crown (+y), tapering to the tip cap (−y), flattened.
    const taper = 1 + Math.min(0, y) * 0.5;
    x *= 0.5 * taper;
    z *= 0.32 * taper;
    y *= 0.62;
    if (y > 0.45) y = 0.45 + (y - 0.45) * 0.5; // flat-ish crown
    p.setXYZ(i, x, y, z);
  }
  g.scale(0.16, 0.16, 0.16);
  g.computeVertexNormals();
  return g;
}

export function createCorn(scene) {
  const geo = kernelGeometry();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    sheen: 0.2,
    sheenColor: new THREE.Color(1, 0.9, 0.5),
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const kernels = [];
  const free = [];
  for (let i = CAP - 1; i >= 0; i--) free.push(i);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAP; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  }
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const whole = new THREE.Color(0.95, 0.68, 0.12);
  const hullC = new THREE.Color(0.9, 0.78, 0.45);
  const smear = new THREE.Color(0.45, 0.28, 0.1);

  function write(k) {
    if (k.state === 'gone') {
      mesh.setMatrixAt(k.i, zero);
      return;
    }
    m4.compose(k.p, k.q, k.s);
    mesh.setMatrixAt(k.i, m4);
  }

  return {
    kernels,
    // A kernel at p, crown along n (out of the surface it sits in).
    spawn(p, n, hull) {
      if (!free.length) return null;
      const i = free.pop();
      const q = new THREE.Quaternion().setFromUnitVectors(up, n.clone().normalize());
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2));
      const k = { i, p: p.clone(), q, s: new THREE.Vector3(1, 1, 1).multiplyScalar(hull ? 0.95 : 1), v: new THREE.Vector3(), hull, state: 'rest', claim: null };
      // Hulls look almost the same: you only find out when you eat one.
      const c = (hull ? hullC : whole).clone().lerp(smear, 0.25 + Math.random() * 0.3);
      mesh.setColorAt(i, c);
      mesh.instanceColor.needsUpdate = true;
      kernels.push(k);
      write(k);
      return k;
    },
    // Thrown out of a pocket: a short ballistic hop onto the snow.
    toss(p, hull, dir) {
      const k = this.spawn(p, up, hull);
      if (!k) return null;
      k.state = 'fly';
      k.v.set(dir.x * 2 + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, dir.z * 2 + (Math.random() - 0.5) * 2);
      return k;
    },
    nearest(p, maxD, skip) {
      let best = null;
      let bd = maxD;
      for (const k of kernels) {
        if (k.state === 'gone' || k.state === 'fly' || k.state === 'held' || (skip && skip(k))) continue;
        const d = Math.hypot(k.p.x - p.x, k.p.z - p.z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      return best;
    },
    hold(k, pos) {
      k.state = 'held';
      k.p.copy(pos);
      write(k);
    },
    take(k) {
      if (k.state === 'gone') return;
      k.state = 'gone';
      write(k);
      free.push(k.i);
      kernels.splice(kernels.indexOf(k), 1);
    },
    bury(k) {
      if (k && k.state !== 'gone' && k.state !== 'held') this.take(k);
    },
    update(dt) {
      let dirty = false;
      for (const k of kernels) {
        if (k.state !== 'fly') continue;
        k.v.y -= 9.81 * dt;
        k.p.addScaledVector(k.v, dt);
        k.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt * 9, dt * 5, 0)));
        if (k.p.y < 0.05) {
          k.p.y = 0.05;
          k.state = 'rest';
          k.q.setFromUnitVectors(up, new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize());
        }
        write(k);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },
    flush() {
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
