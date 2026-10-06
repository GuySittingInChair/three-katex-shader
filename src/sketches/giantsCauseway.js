import * as THREE from 'three';
import { phaseOf, clamp01, smooth } from '../lib/motion.js';
import { createEnvironment } from '../lib/environment.js';
import { lloydStep, cellStats } from '../lib/voronoi.js';
import { caption } from '../lib/bit.js';

// Basalt columns by the sea, as Voronoi cells relaxing by Lloyd's algorithm
// (see Lloyd's Relaxation for the maths). Each column is the prism over one
// cell; each keeps its own height while its outline changes, so you can
// watch the same column turn from a lumpy pentagon into a hexagon.
//
// Honesty about the geology: real columns at the Giant's Causeway formed as
// a thick lava flow cooled and contracted and cracked, the cracks advancing
// layer by layer into the cooling rock. The crack pattern also drifts toward
// hexagons as it matures. Lloyd's algorithm is a different process that
// arrives at the same shape, because hexagons are what minimise the
// relevant kind of energy in the plane. Most real columns there have 5, 6
// or 7 sides, the most common being 6.
//
// Readouts (interior columns): how many are hexagons, the average number of
// sides (Euler's formula keeps it at 6), and the exact Lloyd energy G, which
// heads for the hexagon's 5/(36√3) = 0.0802.
//
// Loop (32 s): fresh, irregular columns rise, relax for 20 s, stand, and sink.

const N = 130;
const W = 6.4;                   // metres
const D = 4.4;
const BOX = [-W / 2, -D / 2, W / 2, D / 2];
const PERIOD = 32;
const K_MAX = 45;
const GAP = 0.022;               // joint width between columns, metres
const SEA = 0;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRun(loop) {
  const r = rng(loop * 104729 + 7);
  const iters = [Array.from({ length: N }, () => [BOX[0] + r() * W, BOX[1] + r() * D])];
  // Each column's own height: stepping down toward the sea (−z), plus its own bit.
  const own = Array.from({ length: N }, () => r());
  // Which columns are shown: a ragged blob, decided once from where each
  // column started, so none pop in or out as they move. (The ones on the
  // edge of the box are cut flat by it, so they're never shown.)
  const lobes = [r() * 6.28, r() * 6.28];
  const shown = iters[0].map(([x, z]) => {
    const th = Math.atan2(z, x);
    const rim = 0.88 + 0.1 * Math.sin(3 * th + lobes[0]) + 0.06 * Math.sin(5 * th + lobes[1]);
    return (x / (W / 2)) ** 2 + (z / (D / 2)) ** 2 < rim * rim;
  });
  return {
    loop,
    own,
    shown,
    pointsAt(k) {
      while (iters.length <= Math.ceil(k) + 1) iters.push(lloydStep(iters[iters.length - 1], BOX).next);
      const i = Math.floor(k);
      const f = k - i;
      return iters[i].map(([x, y], j) => [x + (iters[i + 1][j][0] - x) * f, y + (iters[i + 1][j][1] - y) * f]);
    },
  };
}

function rippleTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // A tileable normal map from a sum of waves with whole-number wavenumbers.
  const waves = Array.from({ length: 10 }, (_, i) => [Math.round(Math.cos(i * 2.4) * (2 + i)), Math.round(Math.sin(i * 2.4) * (2 + i)), Math.random() * 6.28, 1 / (2 + i)]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0;
    let dy = 0;
    for (const [kx, ky, ph, a] of waves) {
      const c0 = Math.cos((2 * Math.PI * (kx * x + ky * y)) / size + ph) * a;
      dx += kx * c0;
      dy += ky * c0;
    }
    const i = 4 * (y * size + x);
    img.data[i] = 128 + 18 * dx;
    img.data[i + 1] = 128 + 18 * dy;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

export default {
  name: "Giant's Causeway",
  description:
    'Basalt columns rising from the sea, shaped as Voronoi cells that relax by Lloyd\'s algorithm: each moves ' +
    'to its own centre of mass until most are hexagons. Hexagon share, average sides (Euler: 6) and the exact ' +
    'energy are live.',
  tags: ['voronoi', 'lloyd', 'geology', 'basalt', 'hexagons', 'realistic', 'humor'],
  category: 'Geometry',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    return {
      loop: Math.floor(t / PERIOD),
      loopT,
      k: K_MAX * clamp01((loopT - 2.5) / 20) ** 1.7,
      rise: smooth(loopT / 2.5) * (1 - smooth((loopT - (PERIOD - 2.5)) / 2.5)),
      hex: 0, meanSides: 6, G: 0,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT > PERIOD - 2.5
      ? 'Back into the sea. More lava is coming.'
      : m.k < 0.05
        ? 'Fresh lava, cracked any old how.'
        : m.hex > 0.6
          ? 'Legend says the giant Finn McCool built it. The legend leaves out Lloyd\'s algorithm.'
          : 'Each column moves to the centre of its own cell. Hexagons are not on the agenda. They happen anyway.';
    return (
      '\\begin{aligned}' +
      `\\mathbf p_i &\\leftarrow \\text{centroid}(V_i),\\quad \\text{step } ${hl(m.k, 1)} \\\\` +
      `\\text{hexagons} &= ${hl(m.hex * 100, 0)}\\%,\\quad \\text{average sides} = ${hl(m.meanSides, 2)}\\ \\text{(Euler: 6)} \\\\` +
      `G &= ${hl(m.G, 4)} \\to \\tfrac{5}{36\\sqrt3} = 0.0802 \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    ctx.camera.near = 0.05;
    const env = createEnvironment(ctx, {
      preset: 'meadow', fov: 42, sun: [24, 215], grass: false, fog: 0.008, shadowRadius: 5, exposure: 0.6,
    });
    env.ground.visible = false;
    ctx.camera.position.set(2.2, 2.6, 6.6);
    ctx.controls?.target.set(0, 0.8, -0.5);
    if (ctx.controls) ctx.controls.maxPolarAngle = 1.45;
    ctx.controls?.update();

    const ripples = rippleTexture();
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(300, 64).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: 0x06202a, roughness: 0.22, metalness: 0, normalMap: ripples, normalScale: new THREE.Vector2(0.5, 0.5),
        clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.6,
      })
    );
    sea.position.y = SEA;
    sea.receiveShadow = true;
    ctx.scene.add(sea);

    // All the columns in one dynamic mesh, rebuilt each frame.
    const MAXV = N * 14 * 9;
    const pos = new Float32Array(MAXV * 3);
    const nor = new Float32Array(MAXV * 3);
    const col = new Float32Array(MAXV * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const columns = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.5 }));
    columns.castShadow = true;
    columns.receiveShadow = true;
    columns.frustumCulled = false;
    ctx.scene.add(columns);

    return { env, sea, ripples, columns, geo, run: null };
  },

  update(ctx, state) {
    state.env.update(ctx);
    const m = ctx.motion;
    state.ripples.offset.set(ctx.time * 0.004, ctx.time * 0.0025);
    if (!state.run || state.run.loop !== m.loop) state.run = createRun(m.loop);
    const pts = state.run.pointsAt(m.k);
    const step = lloydStep(pts, BOX);
    const stats = cellStats(step.cells, BOX);
    let inner = 0;
    let hex = 0;
    let sum = 0;
    stats.sides.forEach((s, i) => {
      if (stats.boundary[i]) return;
      inner++;
      sum += s;
      if (s === 6) hex++;
    });
    m.hex = hex / inner;
    m.meanSides = sum / inner;
    m.G = step.G;

    // Prisms. Board coordinates (x, z) = (cell x, cell y).
    const pos = state.geo.attributes.position.array;
    const nor = state.geo.attributes.normal.array;
    const col = state.geo.attributes.color.array;
    let v = 0;
    const put = (x, y, z, nx, ny, nz, r, g, b) => {
      pos[3 * v] = x; pos[3 * v + 1] = y; pos[3 * v + 2] = z;
      nor[3 * v] = nx; nor[3 * v + 1] = ny; nor[3 * v + 2] = nz;
      col[3 * v] = r; col[3 * v + 1] = g; col[3 * v + 2] = b;
      v++;
    };
    step.cells.forEach((poly, i) => {
      if (poly.length < 3 || stats.boundary[i] || !state.run.shown[i]) return;
      const [cx, cz] = pts[i];
      // Step down toward the sea (−z), each column a little different.
      const back = 1 - (cz - BOX[1]) / D;                 // 1 at the back, 0 at the sea
      const h = SEA - 0.3 + (0.35 + 1.7 * back * back + 0.3 * state.run.own[i]) * m.rise;
      const shade = 0.05 + 0.025 * state.run.own[i];
      // Shrink toward the seed to open up the joints.
      const ring = poly.map(([x, z]) => {
        const dx = x - cx;
        const dz = z - cz;
        const len = Math.hypot(dx, dz) || 1;
        const s = Math.max(0, len - GAP) / len;
        return [cx + dx * s, cz + dz * s];
      });
      // Top: a fan, slightly lighter (weathered).
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % ring.length];
        put(cx, h, cz, 0, 1, 0, shade * 1.6, shade * 1.5, shade * 1.4);
        put(b[0], h, b[1], 0, 1, 0, shade * 1.35, shade * 1.28, shade * 1.2);
        put(a[0], h, a[1], 0, 1, 0, shade * 1.35, shade * 1.28, shade * 1.2);
      }
      // Sides, down below the waterline.
      const bottom = SEA - 0.5;
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % ring.length];
        let nx = b[1] - a[1];
        let nz = -(b[0] - a[0]);
        const l = Math.hypot(nx, nz) || 1;
        nx /= l;
        nz /= l;
        const s = shade * 0.85;
        put(a[0], h, a[1], nx, 0, nz, s, s, s);
        put(b[0], h, b[1], nx, 0, nz, s, s, s);
        put(b[0], bottom, b[1], nx, 0, nz, s * 0.6, s * 0.62, s * 0.65);
        put(a[0], h, a[1], nx, 0, nz, s, s, s);
        put(b[0], bottom, b[1], nx, 0, nz, s * 0.6, s * 0.62, s * 0.65);
        put(a[0], bottom, a[1], nx, 0, nz, s * 0.6, s * 0.62, s * 0.65);
      }
    });
    state.geo.setDrawRange(0, v);
    for (const k of ['position', 'normal', 'color']) state.geo.attributes[k].needsUpdate = true;
  },

  dispose(ctx, state) {
    state.env.dispose();
    state.ripples.dispose();
    state.geo.dispose();
    state.columns.material.dispose();
  },
};
