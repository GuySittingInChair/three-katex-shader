import * as THREE from 'three';
import { skinMaterial, clothMaterial, plainMaterial, createFilth } from './materials.js';

// A prisoner: an MPFB human (game_engine rig, 53 bones) animated entirely in
// code. Nothing is keyframed: every frame the skeleton goes back to its rest
// pose and is then posed by a few rules:
//   - feet: each foot stays planted until it is too far from where it should
//     be (beside the hips, ahead by the velocity), then swings there on an arc;
//   - legs and arms: two-bone IK. For a chain of lengths a, b from root p to
//     target t (distance d), the middle joint sits at angle A from the line
//     p→t, cos A = (a² + d² − b²)/(2ad) (law of cosines), on the side the pole
//     points to;
//   - pelvis height from the crouch and the gait, spine lean, head aim;
//   - fingers curl into fists; the face runs on the ARKit shape keys.
// The game sets `pose` (where to go, what the hands do) and calls animate().

const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _a = V();
const _b = V();
const _c = V();
const _d = V();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

const FINGERS = ['index', 'middle', 'ring', 'pinky'];

function kindOf(name) {
  const n = name.toLowerCase();
  if (n.includes('suit')) return 'cloth';
  if (n.includes('teeth')) return 'teeth';
  if (n.includes('tongue')) return 'tongue';
  if (n.includes('shoes')) return 'shoes';
  if (n.includes('eyebrow')) return 'brows';
  if (n.includes('eyelash')) return 'lashes';
  if (n.includes('high-poly') || n.includes('low-poly') || n.includes('eye')) return 'eyes';
  if (n.includes('short') || n.includes('hair')) return 'hair';
  return 'skin';
}

export class Prisoner {
  constructor(gltf, { name, tint, tone, stubble } = {}) {
    this.name = name;
    this.group = new THREE.Group();
    this.model = gltf.scene;
    this.group.add(this.model);
    this.bones = {};
    let top = 0;
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.geometry.computeBoundingBox();
        top = Math.max(top, o.geometry.boundingBox.max.y);
      }
    });
    this.filth = createFilth(top);
    this.model.updateMatrixWorld(true);
    const head = this.bones.head.getWorldPosition(V());
    this.materials = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const src = o.material;
      const kind = kindOf(src.name || o.name);
      let m;
      if (kind === 'skin') m = skinMaterial(src.map, this.filth, { tone, head, stubble });
      else if (kind === 'cloth') m = clothMaterial(src, this.filth, tint);
      else m = plainMaterial(src, this.filth, kind);
      o.material = m;
      this.materials.push(m);
      if (o.morphTargetDictionary && 'jawOpen' in o.morphTargetDictionary) this.face = o;
    });

    // Measure the rest pose (the group is still at the origin, unrotated).
    this.group.updateMatrixWorld(true);
    this.rest = new Map();
    for (const b of Object.values(this.bones)) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
    const wp = (n) => this.bones[n].getWorldPosition(V());
    const dist = (a, b) => wp(a).distanceTo(wp(b));
    this.len = {
      thigh: dist('thigh_l', 'calf_l'),
      calf: dist('calf_l', 'foot_l'),
      upper: dist('upperarm_l', 'lowerarm_l'),
      fore: dist('lowerarm_l', 'hand_l'),
    };
    this.ankleH = wp('foot_l').y;
    this.pelvisH = wp('pelvis').y;
    this.hipW = Math.abs(wp('thigh_l').x - wp('thigh_r').x) / 2;
    this.height = top;
    this.footRestQ = {
      l: this.bones.foot_l.getWorldQuaternion(new THREE.Quaternion()),
      r: this.bones.foot_r.getWorldQuaternion(new THREE.Quaternion()),
    };
    // Which way the model faces: from the heels to the balls of the feet.
    const fwd = wp('ball_l').sub(wp('foot_l')).setY(0).normalize();
    this.facingOffset = Math.atan2(fwd.x, fwd.z); // 0 when the model faces +z

    // State the game drives.
    this.pos = V();
    this.vel = V();
    this.yaw = 0;
    this.pose = {
      crouch: 0, // 0 stand .. 1 squat
      lean: 0, // forward lean, radians
      look: null, // world point to look at
      hands: { l: null, r: null }, // world targets, or null for walking arms
      fist: { l: 0.2, r: 0.2 },
      ko: 0, // 0 up .. 1 flat on his back
      flinch: 0, // arms over the head
    };
    this.faceW = {};
    this.blink = { next: 1 + Math.random() * 3, t: -1 };
    this.feet = {
      l: { pos: V(), from: V(), to: V(), t: 1, dur: 0.3, swinging: false, side: 1 },
      r: { pos: V(), from: V(), to: V(), t: 1, dur: 0.3, swinging: false, side: -1 },
    };
    this.gait = 0;
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    for (const f of Object.values(this.feet)) {
      this.idealFoot(f, f.pos, 0);
      f.swinging = false;
    }
  }

  forward(out = V()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  right(out = V()) {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  idealFoot(f, out, lead) {
    // The model's left foot is on its +x side; with the model facing +z,
    // its left is +x, which is −right() here.
    this.right(_d);
    out.copy(this.pos).addScaledVector(_d, -f.side * this.hipW * 1.05).addScaledVector(this.vel, lead);
    out.y = 0;
    return out;
  }

  setFace(name, w) {
    this.faceW[name] = w;
  }

  // ---- skeleton helpers ----
  rotateWorld(bone, q) {
    bone.parent.getWorldQuaternion(_q2);
    bone.getWorldQuaternion(_q3);
    _q3.premultiply(q);
    bone.quaternion.copy(_q2.invert().multiply(_q3));
    bone.updateMatrixWorld(true);
  }

  setWorldQ(bone, q) {
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(q));
    bone.updateMatrixWorld(true);
  }

  aim(bone, child, target) {
    const p = bone.getWorldPosition(_a);
    const from = child.getWorldPosition(_b).sub(p).normalize();
    const to = _c.copy(target).sub(p).normalize();
    _q.setFromUnitVectors(from, to);
    this.rotateWorld(bone, _q);
  }

  twoBone(a, b, c, la, lb, target, pole) {
    const p = a.getWorldPosition(V());
    const d = V().copy(target).sub(p);
    const dist = THREE.MathUtils.clamp(d.length(), Math.abs(la - lb) + 1e-3, (la + lb) * 0.999);
    d.normalize();
    const t = V().copy(p).addScaledVector(d, dist);
    const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = V().copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const mid = V().copy(p).addScaledVector(d, cosA * la).addScaledVector(perp, sinA * la);
    this.aim(a, b, mid);
    this.aim(b, c, t);
  }

  // ---- the frame ----
  animate(dt, time) {
    const B = this.bones;
    const P = this.pose;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    for (const [b, r] of this.rest) {
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
    // Knocked out: lie back, pivoting on the heels.
    const ko = P.ko;
    this.group.position.copy(this.pos);
    this.group.position.y = ko * 0.11;
    this.group.quaternion.setFromAxisAngle(UP, this.yaw - this.facingOffset);
    if (ko > 0) {
      _q.setFromAxisAngle(V().set(1, 0, 0), -ko * Math.PI * 0.5);
      this.group.quaternion.multiply(_q);
    }
    this.group.updateMatrixWorld(true);
    const fwd = this.forward(V());
    const right = this.right(V());

    // Feet.
    const run = speed > 2.2;
    for (const k of ['l', 'r']) {
      const f = this.feet[k];
      const o = this.feet[k === 'l' ? 'r' : 'l'];
      if (f.swinging) {
        f.t += dt / f.dur;
        this.idealFoot(f, f.to, f.dur * 0.55);
        if (f.t >= 1) {
          f.swinging = false;
          f.pos.copy(f.to);
        }
      } else {
        const ideal = this.idealFoot(f, _a, 0.32 * Math.min(1, 0.5 + speed * 0.2));
        const far = f.pos.distanceTo(ideal);
        const thresh = Math.max(0.1, speed * 0.24);
        if (far > thresh && (!o.swinging || (run && o.t > 0.6))) {
          f.swinging = true;
          f.t = 0;
          f.dur = THREE.MathUtils.clamp(0.42 - speed * 0.06, 0.2, 0.42);
          f.from.copy(f.pos);
          f.to.copy(ideal);
        }
      }
    }
    if (ko < 0.05) {
      // Pelvis: lower when crouching, a dip as weight lands on a foot.
      const swing = this.feet.l.swinging ? this.feet.l : this.feet.r.swinging ? this.feet.r : null;
      const bob = swing ? Math.sin(Math.PI * swing.t) * (run ? 0.045 : 0.025) : 0;
      const mid = V().addVectors(this.feet.l.swinging ? this.feet.r.pos : this.feet.l.pos, this.feet.r.swinging ? this.feet.l.pos : this.feet.r.pos).multiplyScalar(0.5);
      const h = this.pelvisH - 0.012 - P.crouch * 0.42 + bob - (run ? 0.04 : 0);
      const pw = V().copy(this.pos).lerp(mid, 0.35).addScaledVector(fwd, -P.crouch * 0.12 + speed * 0.015);
      pw.y = h;
      B.pelvis.position.copy(B.pelvis.parent.worldToLocal(pw));
      B.pelvis.updateMatrixWorld(true);
      // Hips sway towards the planted foot; the body leans into the run.
      const lean = P.lean + speed * 0.05 + P.crouch * 0.35;
      const side = swing ? (swing === this.feet.l ? -1 : 1) * Math.sin(Math.PI * swing.t) * 0.05 : 0;
      for (const n of ['spine_01', 'spine_02', 'spine_03']) {
        _q.setFromAxisAngle(right, -lean / 3);
        this.rotateWorld(B[n], _q);
        _q.setFromAxisAngle(fwd, side / 3);
        this.rotateWorld(B[n], _q);
      }
      // Legs.
      for (const k of ['l', 'r']) {
        const f = this.feet[k];
        const t = V().copy(f.swinging ? _b.copy(f.from).lerp(f.to, smooth(f.t)) : f.pos);
        const lift = f.swinging ? Math.sin(Math.PI * f.t) * (run ? 0.16 : 0.09) : 0;
        t.y = this.ankleH + lift;
        const pole = V().copy(fwd).multiplyScalar(1).addScaledVector(right, k === 'l' ? -0.15 : 0.15);
        this.twoBone(B[`thigh_${k}`], B[`calf_${k}`], B[`foot_${k}`], this.len.thigh, this.len.calf, t, pole);
        // Foot flat on the ground (toe a little up mid-swing).
        _q.setFromAxisAngle(UP, this.yaw - this.facingOffset);
        _q2.copy(_q).multiply(this.footRestQ[k]);
        if (f.swinging) _q2.premultiply(_q3.setFromAxisAngle(right, -Math.sin(Math.PI * f.t) * 0.3));
        this.setWorldQ(B[`foot_${k}`], _q2);
      }
    } else {
      for (const n of ['spine_01', 'spine_02']) {
        _q.setFromAxisAngle(right, 0.08 * ko);
        this.rotateWorld(B[n], _q);
      }
    }

    // Head: turn towards the look point, shared between neck and head.
    if (P.look) {
      const head = B.head.getWorldPosition(V());
      const dir = V().copy(P.look).sub(head);
      const flat = Math.hypot(dir.x, dir.z) || 1e-6;
      let yaw = Math.atan2(dir.x, dir.z) - this.yaw;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      yaw = THREE.MathUtils.clamp(yaw, -1.2, 1.2);
      const pitch = THREE.MathUtils.clamp(Math.atan2(dir.y, flat), -0.8, 0.9);
      for (const [n, w] of [['neck_01', 0.45], ['head', 0.55]]) {
        _q.setFromAxisAngle(UP, yaw * w);
        this.rotateWorld(B[n], _q);
        _q.setFromAxisAngle(this.right(V()), -pitch * w);
        this.rotateWorld(B[n], _q);
      }
    }

    // Arms.
    const swingL = this.feet.r.swinging ? Math.sin(Math.PI * this.feet.r.t) : this.feet.l.swinging ? -Math.sin(Math.PI * this.feet.l.t) : 0;
    for (const k of ['l', 'r']) {
      const s = k === 'l' ? 1 : -1;
      const shoulder = B[`upperarm_${k}`].getWorldPosition(V());
      let target = P.hands[k];
      let pole;
      if (P.flinch > 0.01) {
        // Hands over the head.
        const head = B.head.getWorldPosition(V());
        target = V().copy(head).addScaledVector(UP, 0.14).addScaledVector(fwd, 0.08).addScaledVector(right, -s * 0.07).lerp(target ?? head, 0);
        pole = V().copy(right).multiplyScalar(-s).addScaledVector(UP, -0.2);
      } else if (target) {
        pole = V().copy(right).multiplyScalar(-s * 0.7).addScaledVector(UP, -0.6).addScaledVector(fwd, -0.3);
      } else {
        const sw = (k === 'l' ? swingL : -swingL) * Math.min(1, speed * 0.4);
        const reach = (this.len.upper + this.len.fore) * 0.92;
        target = V().copy(shoulder)
          .addScaledVector(UP, -reach * Math.cos(sw * 0.5))
          .addScaledVector(fwd, reach * Math.sin(sw * 0.5) + 0.04 + P.crouch * 0.25)
          .addScaledVector(right, -s * 0.07);
        if (ko > 0.05) target = V().copy(shoulder).addScaledVector(right, -s * 0.5).addScaledVector(UP, -0.1);
        pole = V().copy(fwd).multiplyScalar(-1).addScaledVector(right, -s * 0.3);
      }
      if (ko > 0.05) pole = V().copy(UP).multiplyScalar(-1);
      this.twoBone(B[`upperarm_${k}`], B[`lowerarm_${k}`], B[`hand_${k}`], this.len.upper, this.len.fore, target, pole);
      this.curl(k, P.fist[k]);
    }

    // Face: blink, plus whatever the game asked for, eased.
    if (this.face) {
      const b = this.blink;
      b.next -= dt;
      if (b.next <= 0) {
        b.t = 0;
        b.next = 2 + Math.random() * 4;
      }
      let blink = 0;
      if (b.t >= 0) {
        b.t += dt;
        blink = Math.sin(Math.min(1, b.t / 0.16) * Math.PI);
        if (b.t > 0.16) b.t = -1;
      }
      const dict = this.face.morphTargetDictionary;
      const inf = this.face.morphTargetInfluences;
      const want = { ...this.faceW };
      want.eyeBlinkLeft = Math.max(want.eyeBlinkLeft ?? 0, blink, ko);
      want.eyeBlinkRight = Math.max(want.eyeBlinkRight ?? 0, blink, ko);
      for (const n in dict) {
        const w = want[n] ?? 0;
        const i = dict[n];
        const rate = n.startsWith('eyeBlink') ? 1 : Math.min(1, dt * 10);
        inf[i] += (w - inf[i]) * rate;
      }
    }
    void time;
  }

  curl(k, amount) {
    const B = this.bones;
    for (const f of FINGERS) {
      for (let j = 1; j <= 3; j++) {
        const bone = B[`${f}_0${j}_${k}`];
        if (!bone) continue;
        _q.setFromAxisAngle(_d.set(1, 0, 0), amount * (j === 1 ? 1.25 : 1.45));
        bone.quaternion.multiply(_q);
      }
    }
    const t = B[`thumb_02_${k}`];
    if (t) t.quaternion.multiply(_q.setFromAxisAngle(_d.set(1, 0, 0), amount * 0.6));
    B[`hand_${k}`].updateMatrixWorld(true);
  }

  headPos(out = V()) {
    return this.bones.head.getWorldPosition(out);
  }

  handPos(k, out = V()) {
    return this.bones[`hand_${k}`].getWorldPosition(out);
  }

  // Geometry and textures are shared with the loaded glTF (every round clones
  // it), so only the materials made here are ours to free.
  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

function smooth(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}
