import * as THREE from 'three';
import { phaseOf, segments, lerp } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { caption } from '../lib/bit.js';

// A sunflower head, seed by seed. Vogel's model (1979): seed n sits at
//
//     θₙ = n α,     rₙ = c √n
//
// so every seed takes the same area (πc²) and each new one is turned by the
// same angle α from the last. Everything depends on α. If α is a fraction of
// a turn, p/q, the seeds fall on q straight spokes with gaps between them.
// Sunflowers use the golden angle,
//
//     α = 360° / φ² = 137.508°,    φ = (1 + √5)/2
//
// which is as far from every fraction as an angle can be (its continued
// fraction is all 1s), so no spokes ever form and the seeds pack evenly.
// What you see instead are spirals, in two directions, and their counts are
// consecutive Fibonacci numbers.
//
// The loop walks α through the best fractions for the golden angle, the
// Fibonacci ratios 2/5, 3/8, 5/13, 8/21, 13/34 of a turn (144°, 135°,
// 138.46°, 137.14°, 137.65°: spokes, getting finer and closer to 137.5°),
// then the golden angle itself. The readouts are measured from the seeds
// every frame: the closest pair (in units of c; bigger means more even), and
// how many seeds apart each outer seed's two nearest neighbours are. Along a
// family of k spirals, neighbours are k apart, so at the golden angle these
// are the spiral counts: 55 and 89, as on many real sunflowers. On q spokes
// they're q and 2q. Checked in Node: closest pair 0.07c at 2/5, rising
// through 0.12, 0.19, 0.31, 0.49c, to 1.67c at the golden angle.
//
// Rendered as a real flower: 1200 seeds, 34 petals (also placed by the golden
// angle), in the meadow at mid-morning.

const N = 1200;
const C = 0.0042;                       // metres: seed n at c√n, head radius c√N ≈ 15 cm
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN = 360 / (PHI * PHI);
const STOPS = [
  { deg: 360 * (2 / 5), label: '2/5' },
  { deg: 360 * (3 / 8), label: '3/8' },
  { deg: 360 * (5 / 13), label: '5/13' },
  { deg: 360 * (8 / 21), label: '8/21' },
  { deg: 360 * (13 / 34), label: '13/34' },
  { deg: GOLDEN, label: 'golden' },
  { deg: GOLDEN, label: 'golden' },       // twice, so it holds longer
];
const PERIOD = 49;
const HEAD = new THREE.Vector3(0, 1.55, 0);
const HEAD_R = C * Math.sqrt(N);

// Seed positions in the head's own plane.
function seedXY(n, alphaDeg) {
  const th = (n * alphaDeg * Math.PI) / 180;
  const r = C * Math.sqrt(n + 0.5);
  return [r * Math.cos(th), r * Math.sin(th), r, th];
}

// Closest pair, and spiral counts at the rim, from a spatial hash.
function measure(alphaDeg) {
  const cell = C * 1.6;
  const grid = new Map();
  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const [x, y] = seedXY(n, alphaDeg);
    xs[n] = x;
    ys[n] = y;
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(n);
  }
  let dmin = Infinity;
  const gaps = new Map();
  for (let n = 50; n < N; n++) {
    const gx = Math.floor(xs[n] / cell);
    const gy = Math.floor(ys[n] / cell);
    let best = [Infinity, -1];
    let second = [Infinity, -1];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const m of grid.get(`${gx + dx},${gy + dy}`) || []) {
        if (m === n) continue;
        const d = Math.hypot(xs[m] - xs[n], ys[m] - ys[n]);
        if (d < best[0]) { second = best; best = [d, m]; } else if (d < second[0]) second = [d, m];
      }
    }
    dmin = Math.min(dmin, best[0]);
    if (n > 0.85 * N) {
      for (const [, m] of [best, second]) if (m >= 0) {
        const g = Math.abs(m - n);
        gaps.set(g, (gaps.get(g) || 0) + 1);
      }
    }
  }
  const top = [...gaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g).sort((a, b) => a - b);
  return { dmin: dmin / C, spirals: top };
}

const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]);

function petalGeometry() {
  // A ray floret: a long, slightly cupped, curling strap with a pointed tip.
  const geo = new THREE.PlaneGeometry(1, 1, 4, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;               // across, 0..1
    const v = p.getY(i) + 0.5;               // along, 0..1
    const width = 0.032 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (1 - 0.35 * v);
    const x = (u - 0.5) * width;
    const y = v * 0.085;
    const z = 0.012 * Math.sin(Math.PI * v) - 4 * (u - 0.5) ** 2 * 0.008 - 0.02 * v * v;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

export default {
  name: 'Sunflower Phyllotaxis',
  description:
    'A real-looking sunflower whose 1200 seeds follow Vogel\'s model: seed n at angle n·α, radius c√n. As α ' +
    'steps through the Fibonacci fractions 2/5, 3/8, 5/13, 8/21, 13/34 of a turn, the seeds line up in spokes; at ' +
    'the golden angle, 137.5°, they pack evenly in Fibonacci spirals. Closest pair and spiral counts measured live.',
  tags: ['biology', 'phyllotaxis', 'golden angle', 'fibonacci', 'number theory', 'sunflower', 'realistic', 'humor'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const { index, next, blend } = segments(phaseOf(t, PERIOD), STOPS.length, 0.55);
    return {
      alpha: lerp(STOPS[index].deg, STOPS[next].deg, blend),
      stop: blend < 0.001 || STOPS[index].deg === STOPS[next].deg ? index : blend > 0.999 ? next : -1,
      // Filled in by update().
      dmin: 0,
      spirals: [0, 0],
    };
  },

  latex: (params, hl, m) => {
    const s = m.stop >= 0 ? STOPS[m.stop] : null;
    const which = !s
      ? '\\text{(changing)}'
      : s.label === 'golden'
        ? '= 360^\\circ/\\varphi^2'
        : `= 360^\\circ \\times ${s.label}`;
    const [a, b] = m.spirals;
    const line = !s
      ? 'Adjusting the angle. Every seed moves; the rule stays the same.'
      : s.label === 'golden'
        ? `No spokes: the golden ratio resists every fraction. ${a} and ${b} spirals${FIB.has(a) && FIB.has(b) ? ', both Fibonacci' : ''}.`
        : `${s.label.split('/')[1]} straight spokes, with gaps. The bees are unimpressed.`;
    return (
      '\\begin{aligned}' +
      '\\theta_n &= n\\,\\alpha,\\quad r_n = c\\sqrt{n},\\quad n = 0, \\dots, 1199 \\\\' +
      `\\alpha &= ${hl(m.alpha, 3)}^\\circ\\ ${which} \\\\` +
      `\\text{closest pair} &= ${hl(m.dmin, 2)}\\,c,\\quad \\text{neighbours at the rim: } ${hl(a, 0)} \\text{ and } ${hl(b, 0)} \\text{ seeds apart} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.01;
    const env = createEnvironment(ctx, {
      preset: 'meadow', fov: 36, sun: [32, 25], grassHeight: 0.35, grassRadius: 12, shadowRadius: 1.2,
    });
    ctx.camera.position.set(0.22, 1.72, 0.98);
    ctx.controls?.target.set(0, 1.55, 0);
    ctx.controls?.update();
    const { scene } = ctx;

    // The whole flower head, facing the camera (its own +z), nodding a little.
    const head = new THREE.Group();
    head.position.copy(HEAD);
    head.rotation.x = -0.12;
    scene.add(head);

    // The receptacle: a shallow dome behind the seeds, and green bracts behind that.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(HEAD_R * 1.04, 64),
      new THREE.MeshStandardMaterial({ color: 0x120903, roughness: 0.9 })
    );
    disc.position.z = -0.003;
    disc.castShadow = true;
    head.add(disc);
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.15, 32, 12, 0, Math.PI * 2, 0, 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3d5a1c, roughness: 0.8 })
    );
    back.scale.z = 0.35;
    back.position.z = -0.01;
    back.castShadow = true;
    head.add(back);

    // Seeds: one instanced, slightly flattened teardrop each.
    const seedGeo = new THREE.SphereGeometry(1, 10, 6);
    seedGeo.scale(1.0, 0.75, 0.45);       // ellipse area 2.4c², 75% of each seed's πc²
    const seeds = new THREE.InstancedMesh(seedGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), N);
    const col = new THREE.Color();
    for (let n = 0; n < N; n++) {
      // Young florets in the middle are green-yellow, mature seeds dark brown.
      const f = n / N;
      col.setHSL(lerp(0.16, 0.06, Math.min(1, f * 5)), lerp(0.6, 0.5, f), lerp(0.3, 0.09, Math.min(1, f * 4)) + 0.02 * Math.sin(n * 7.1));
      seeds.setColorAt(n, col);
    }
    seeds.castShadow = true;
    seeds.receiveShadow = true;
    head.add(seeds);

    // Petals: 34 of them, placed by the golden angle too, in two layers.
    const petalGeo = petalGeometry();
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf2b90f, roughness: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 34; i++) {
      const th = (i * GOLDEN * Math.PI) / 180;
      const petal = new THREE.Mesh(petalGeo, petalMat);
      const layer = i % 2;
      petal.position.set(Math.cos(th) * HEAD_R * 0.98, Math.sin(th) * HEAD_R * 0.98, -0.004 - layer * 0.004);
      petal.rotation.z = th - Math.PI / 2;
      petal.rotateX(0.25 + layer * 0.12);
      petal.scale.setScalar(1 + 0.15 * Math.sin(i * 2.3));
      petal.castShadow = true;
      head.add(petal);
    }

    // Stem and two leaves.
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f7a2a, roughness: 0.7 });
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.05), new THREE.Vector3(0.02, 0.7, -0.06), new THREE.Vector3(0, 1.35, -0.07), new THREE.Vector3(0, HEAD.y - 0.02, -0.05),
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 40, 0.012, 10), stemMat);
    stem.castShadow = true;
    scene.add(stem);
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.09, 0.03, 0.1, 0.16, 0, 0.24);
    leafShape.bezierCurveTo(-0.1, 0.16, -0.09, 0.03, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 12);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b22, roughness: 0.65, side: THREE.DoubleSide });
    for (const [y, side] of [[0.95, 1], [1.2, -1]]) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(0.01 * side, y, -0.06);
      leaf.rotation.set(0.9, 0, -side * 1.1);
      leaf.castShadow = true;
      scene.add(leaf);
    }

    return {
      env, head, seeds, seedGeo, petalGeo, petalMat, stemMat, leafGeo, leafMat,
      lastAlpha: null, lastMeasure: { dmin: 0, spirals: [0, 0] },
      m4: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1),
    };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    const { m4, q, p, s, z } = state;

    if (m.alpha !== state.lastAlpha) {
      for (let n = 0; n < N; n++) {
        const [x, y, r, th] = seedXY(n, m.alpha);
        // The head is slightly domed; seeds point outwards along their radius.
        p.set(x, y, 0.012 * (1 - (r / HEAD_R) ** 2));
        q.setFromAxisAngle(z, th);
        const size = C * (0.95 + 0.25 * (n / N));
        s.set(size, size, size);
        m4.compose(p, q, s);
        state.seeds.setMatrixAt(n, m4);
      }
      state.seeds.instanceMatrix.needsUpdate = true;
      state.lastMeasure = measure(m.alpha);
      state.lastAlpha = m.alpha;
    }
    m.dmin = state.lastMeasure.dmin;
    m.spirals = state.lastMeasure.spirals;

    // A breeze: the head sways a little.
    state.head.rotation.y = 0.03 * Math.sin(ctx.time * 0.7);
    state.head.rotation.z = 0.015 * Math.sin(ctx.time * 0.9 + 1);
  },

  dispose(ctx, state) {
    state.env.dispose();
    for (const x of [state.seedGeo, state.petalGeo, state.petalMat, state.stemMat, state.leafGeo, state.leafMat]) x.dispose();
  },
};
