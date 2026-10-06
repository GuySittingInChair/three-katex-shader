import * as THREE from 'three';
import { phaseOf, clamp01, smooth } from '../lib/motion.js';
import { lloydStep, cellStats, delaunayTriangles, G_HEXAGON } from '../lib/voronoi.js';
import { caption } from '../lib/bit.js';

// Lloyd's algorithm: scatter 150 points at random, draw their Voronoi cells,
// move every point to the centre of mass of its own cell, repeat. Nobody
// tells the cells to become hexagons. They do anyway.
//
// Each step can only lower the energy
//
//     G = Σᵢ ∫_{Vᵢ} |x − pᵢ|² dA / (2 n Ā²)
//
// (the average squared distance from a point to its cell's seed, made
// dimensionless), because moving a seed to its centroid minimises its own
// cell's integral, and re-drawing the cells can only lower it again. In the
// plane the least possible value is the regular hexagon's, 5/(36√3) =
// 0.080188 (Fejes Tóth). Computed exactly here, from the polygons. Checked
// in Node: random 0.165 → 0.090 after 5 steps → 0.0826 after 50.
//
// Cells are coloured by their number of sides: honey for 6, blue for 5,
// red for 7, grey for anything else. The average over interior cells is
// always close to 6, whatever the points do: Euler's formula (V − E + F = 2,
// with three cells at every corner) forces it. Lloyd doesn't change the
// average, it makes everyone average. The leftover blue–red pairs are
// defects, like dislocations in a crystal.
//
// At the end the Delaunay triangulation fades in: join two seeds when
// their cells share an edge. Each triangle's circumcircle contains no other
// seed (the empty-circle property). Loop (36 s), a new random start each time.

const N = 150;
const W = 16;
const H = 10;
const BOX = [-W / 2, -H / 2, W / 2, H / 2];
const PERIOD = 36;
const K_MAX = 60;
const RELAX_FROM = 2;
const RELAX_TO = 24;
const DUAL_AT = 25;
const SCRAMBLE_AT = 34;

const SIDE_COLOURS = {
  4: new THREE.Color(0.45, 0.47, 0.52),
  5: new THREE.Color(0.22, 0.45, 0.85),
  6: new THREE.Color(0.96, 0.72, 0.28),
  7: new THREE.Color(0.85, 0.25, 0.22),
  other: new THREE.Color(0.4, 0.4, 0.45),
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The iterations of one loop, computed as they're needed (~5 ms each).
function createRun(loop) {
  const r = rng(loop * 7919 + 13);
  const iters = [Array.from({ length: N }, () => [BOX[0] + r() * W, BOX[1] + r() * H])];
  const Gs = [];
  return {
    loop,
    pointsAt(k) {
      while (iters.length <= Math.ceil(k) + 1) {
        const step = lloydStep(iters[iters.length - 1], BOX);
        Gs[iters.length - 1] = step.G;
        iters.push(step.next);
      }
      const i = Math.floor(k);
      const f = k - i;
      return iters[i].map(([x, y], j) => [x + (iters[i + 1][j][0] - x) * f, y + (iters[i + 1][j][1] - y) * f]);
    },
  };
}

function circumcircle(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const a2 = a[0] ** 2 + a[1] ** 2;
  const b2 = b[0] ** 2 + b[1] ** 2;
  const c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
}

export default {
  name: "Lloyd's Relaxation",
  description:
    'Random Voronoi cells, each repeatedly moving its seed to its own centre of mass, become a honeycomb. ' +
    'The exact energy falls toward the hexagon\'s 5/(36√3); cells are coloured by their number of sides; at ' +
    'the end the Delaunay triangulation, the dual, fades in with its empty circumcircles.',
  tags: ['voronoi', 'lloyd', 'centroidal voronoi', 'delaunay', 'optimization', 'geometry', 'humor'],
  category: 'Geometry',
  mode: '3d',

  motion(t) {
    const loopT = phaseOf(t, PERIOD) * PERIOD;
    const u = clamp01((loopT - RELAX_FROM) / (RELAX_TO - RELAX_FROM));
    return {
      loop: Math.floor(t / PERIOD),
      loopT,
      k: K_MAX * u ** 1.8,           // slow at first, so the big early moves are visible
      dual: smooth((loopT - DUAL_AT) / 2) * (1 - smooth((loopT - SCRAMBLE_AT) / 1)),
      // Filled in by update().
      G: 0, hex: 0, meanSides: 6, defects: 0,
    };
  },

  latex: (params, hl, m) => {
    const line = m.loopT >= SCRAMBLE_AT
      ? 'Scrambling. They will do it all again, and they still will not have been told.'
      : m.dual > 0.5
        ? 'The dual: join neighbours. No seed is ever inside a triangle\'s circle.'
        : m.k < 0.05
          ? '150 random points. Nobody has told them about hexagons.'
          : 'Every cell moves its seed to its own centre of mass. Nobody asked them to become hexagons.';
    return (
      '\\begin{aligned}' +
      `\\mathbf p_i &\\leftarrow \\frac{1}{|V_i|}\\int_{V_i} \\mathbf x\\, dA,\\quad \\text{step } ${hl(m.k, 1)} \\\\` +
      `G &= \\frac{\\sum_i \\int_{V_i} |\\mathbf x - \\mathbf p_i|^2\\, dA}{2 n \\bar A^2} = ${hl(m.G, 5)} \\ \\to\\ \\tfrac{5}{36\\sqrt3} = ${G_HEXAGON.toFixed(5)} \\\\` +
      `\\text{sides} &= ${hl(m.meanSides, 2)}\\ \\text{on average (Euler: 6)},\\quad \\text{bee approval} = ${hl(m.hex * 100, 0)}\\%\\ \\textcolor{#9aa3b2}{(\\text{hexagons})} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    // Flat: an orthographic camera fitted to the box.
    ctx.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    ctx.scene.background = new THREE.Color(0x0b0c10);

    const MAXV = N * 16;
    const fillPos = new Float32Array(MAXV * 3 * 3);
    const fillCol = new Float32Array(MAXV * 3 * 3);
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3).setUsage(THREE.DynamicDrawUsage));
    fillGeo.setAttribute('color', new THREE.BufferAttribute(fillCol, 3).setUsage(THREE.DynamicDrawUsage));
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    fill.frustumCulled = false;
    ctx.scene.add(fill);

    const lineGeo = (count) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      return g;
    };
    const edges = new THREE.LineSegments(lineGeo(MAXV), new THREE.LineBasicMaterial({ color: 0x14151b }));
    edges.position.z = 0.01;
    const dual = new THREE.LineSegments(lineGeo(N * 6), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    dual.position.z = 0.02;
    const circles = new THREE.LineSegments(lineGeo(N * 2 * 48), new THREE.LineBasicMaterial({ color: 0x9fd7ff, transparent: true, opacity: 0 }));
    circles.position.z = 0.03;
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0x1b1408, size: 4, sizeAttenuation: false }));
    dots.position.z = 0.04;
    for (const o of [edges, dual, circles, dots]) {
      o.frustumCulled = false;
      ctx.scene.add(o);
    }
    const state = { fill, fillGeo, edges, dual, circles, dots, run: null };
    this.resize(ctx, state);
    return state;
  },

  resize(ctx, state) {
    // Fit the box between the equation (top ~25%) and the toolbar (bottom ~10%):
    // on a wide screen height is the limit, on a phone width is.
    const aspect = ctx.size.width / ctx.size.height;
    const halfH = Math.max(0.86 * H, (0.55 * W) / aspect);
    const cam = ctx.camera;
    cam.left = -halfH * aspect;
    cam.right = halfH * aspect;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.position.set(0, 0.15 * halfH, 5);   // box centre 42% up the screen
    cam.updateProjectionMatrix();
  },

  update(ctx, state) {
    const m = ctx.motion;
    if (!state.run || state.run.loop !== m.loop) state.run = createRun(m.loop);
    const pts = state.run.pointsAt(m.k);
    const step = lloydStep(pts, BOX);       // cells, and G at exactly these points
    const cells = step.cells;
    const stats = cellStats(cells, BOX);

    // Statistics over interior cells.
    let inner = 0;
    let hex = 0;
    let sum = 0;
    stats.sides.forEach((s, i) => {
      if (stats.boundary[i]) return;
      inner++;
      sum += s;
      if (s === 6) hex++;
    });
    m.G = step.G;
    m.hex = hex / inner;
    m.meanSides = sum / inner;

    // Cells, as triangle fans coloured by side count.
    const pos = state.fillGeo.attributes.position.array;
    const col = state.fillGeo.attributes.color.array;
    let v = 0;
    const edgePos = state.edges.geometry.attributes.position.array;
    let e = 0;
    cells.forEach((poly, i) => {
      const c = SIDE_COLOURS[stats.sides[i]] || SIDE_COLOURS.other;
      const shade = stats.boundary[i] ? 0.45 : 1;
      const [cx, cy] = pts[i];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        pos.set([cx, cy, 0, a[0], a[1], 0, b[0], b[1], 0], v * 3);
        // A little darker at the rim of each cell.
        for (const [w, idx] of [[1, v], [0.8, v + 1], [0.8, v + 2]]) col.set([c.r * w * shade, c.g * w * shade, c.b * w * shade], idx * 3);
        v += 3;
        edgePos.set([a[0], a[1], 0, b[0], b[1], 0], e * 6);
        e++;
      }
    });
    state.fillGeo.setDrawRange(0, v);
    state.fillGeo.attributes.position.needsUpdate = true;
    state.fillGeo.attributes.color.needsUpdate = true;
    state.edges.geometry.setDrawRange(0, e * 2);
    state.edges.geometry.attributes.position.needsUpdate = true;

    const dotPos = state.dots.geometry.attributes.position.array;
    pts.forEach(([x, y], i) => dotPos.set([x, y, 0], i * 3));
    state.dots.geometry.attributes.position.needsUpdate = true;

    // The Delaunay dual and its empty circumcircles, interior triangles only.
    state.dual.material.opacity = 0.85 * m.dual;
    state.circles.material.opacity = 0.35 * m.dual;
    if (m.dual > 0) {
      const tris = delaunayTriangles(stats.neighbours).filter(([a, b, c]) => !stats.boundary[a] && !stats.boundary[b] && !stats.boundary[c]);
      const dp = state.dual.geometry.attributes.position.array;
      const cp = state.circles.geometry.attributes.position.array;
      let d = 0;
      let cc = 0;
      stats.neighbours.forEach((ns, i) => ns.forEach((j) => {
        if (j > i && d < N * 6) dp.set([pts[i][0], pts[i][1], 0, pts[j][0], pts[j][1], 0], 6 * d++);
      }));
      for (const [a, b, c] of tris) {
        const [ux, uy, r] = circumcircle(pts[a], pts[b], pts[c]);
        for (let s = 0; s < 48 && cc < N * 2 * 48; s++) {
          const t0 = (s / 48) * Math.PI * 2;
          const t1 = ((s + 1) / 48) * Math.PI * 2;
          cp.set([ux + r * Math.cos(t0), uy + r * Math.sin(t0), 0, ux + r * Math.cos(t1), uy + r * Math.sin(t1), 0], 6 * cc++);
        }
      }
      state.dual.geometry.setDrawRange(0, d * 2);
      state.circles.geometry.setDrawRange(0, cc * 2);
      state.dual.geometry.attributes.position.needsUpdate = true;
      state.circles.geometry.attributes.position.needsUpdate = true;
    }
  },

  dispose(ctx, state) {
    for (const o of [state.fill, state.edges, state.dual, state.circles, state.dots]) {
      o.geometry.dispose();
      o.material.dispose();
    }
  },
};
