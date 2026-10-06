// Exact Voronoi geometry in the plane, for a few hundred points.
//
//   const cells = voronoiCells(points, box)   // points: [[x, y], …], box: [x0, y0, x1, y1]
//   cells[i] = [[x, y], …]                    // convex polygon, counter-clockwise
//
// Each cell is the box clipped by the perpendicular bisector between its
// point and every other point (O(n²), fine for n ≲ 400). Everything else is
// computed exactly from the polygons: area, centroid, the second moment
// ∫|x − p|² dA (so the Lloyd/CVT energy is exact, not sampled), neighbours,
// and the Delaunay triangulation (the dual: two points are joined iff their
// cells share an edge).

// Keep the part of polygon `poly` where (x − m)·n ≤ 0.
function clip(poly, mx, my, nx, ny) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny;
    const db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

export function voronoiCells(points, box) {
  const [x0, y0, x1, y1] = box;
  return points.map(([px, py], i) => {
    let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    // Nearest points first: they cut the most, so later clips are cheap.
    const order = points
      .map(([qx, qy], j) => [(qx - px) ** 2 + (qy - py) ** 2, j])
      .filter(([, j]) => j !== i)
      .sort((a, b) => a[0] - b[0]);
    for (const [d2, j] of order) {
      // Once the furthest vertex is closer than half the distance to q,
      // no bisector from here on can cut the cell.
      let r2 = 0;
      for (const v of poly) r2 = Math.max(r2, (v[0] - px) ** 2 + (v[1] - py) ** 2);
      if (d2 > 4 * r2) break;
      const [qx, qy] = points[j];
      poly = clip(poly, (px + qx) / 2, (py + qy) / 2, qx - px, qy - py);
      if (poly.length === 0) break;
    }
    return poly;
  });
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function polygonCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return a === 0 ? poly[0] : [cx / (3 * a), cy / (3 * a)];
}

// ∫ |x − p|² dA over the polygon, exactly: fan of triangles from p, each
// contributing (area/6)(|a|² + |b|² + |c|² + a·b + b·c + c·a) with c = 0.
export function secondMoment(poly, [px, py]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const ax = poly[i][0] - px;
    const ay = poly[i][1] - py;
    const bx = poly[(i + 1) % poly.length][0] - px;
    const by = poly[(i + 1) % poly.length][1] - py;
    const area = (ax * by - bx * ay) / 2;
    s += (area / 6) * (ax * ax + ay * ay + bx * bx + by * by + ax * bx + ay * by);
  }
  return s;
}

// Lloyd's algorithm, one step: every point moves to its cell's centroid.
// Returns the new points and the normalised energy G before the move:
//
//     G = Σᵢ ∫_{Vᵢ} |x − pᵢ|² dA / (2 n Ā²),   Ā = mean cell area
//
// (the standard normalised second moment: ÷ dimension, so a square is 1/12).
//
// For regular hexagons G = 5/(36√3) = 0.080188, the least possible
// (Fejes Tóth); squares give 1/12 = 0.0833.
export function lloydStep(points, box) {
  const cells = voronoiCells(points, box);
  let energy = 0;
  let area = 0;
  cells.forEach((c, i) => {
    energy += secondMoment(c, points[i]);
    area += polygonArea(c);
  });
  const mean = area / points.length;
  return {
    cells,
    next: cells.map((c, i) => (c.length ? polygonCentroid(c) : points[i])),
    G: energy / (2 * points.length * mean * mean),
  };
}

export const G_HEXAGON = 5 / (36 * Math.sqrt(3));

// Which cells share an edge (Voronoi neighbours = Delaunay edges), found by
// matching edge endpoints; and how many sides each cell has. Cells touching
// the box are flagged, so statistics can use interior cells only.
export function cellStats(cells, box, eps = 1e-7) {
  const [x0, y0, x1, y1] = box;
  const key = (p) => `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;
  const edges = new Map();
  const sides = [];
  const boundary = [];
  cells.forEach((poly, i) => {
    let n = 0;
    let onBox = false;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k];
      const b = poly[(k + 1) % poly.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
      n++;
      const touches = (p) => Math.abs(p[0] - x0) < 1e-9 || Math.abs(p[0] - x1) < 1e-9 || Math.abs(p[1] - y0) < 1e-9 || Math.abs(p[1] - y1) < 1e-9;
      if (touches(a) || touches(b)) onBox = true;
      const ka = key(a);
      const kb = key(b);
      const e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!edges.has(e)) edges.set(e, []);
      edges.get(e).push(i);
    }
    sides.push(n);
    boundary.push(onBox);
  });
  const neighbours = cells.map(() => new Set());
  for (const owners of edges.values()) {
    if (owners.length === 2) {
      neighbours[owners[0]].add(owners[1]);
      neighbours[owners[1]].add(owners[0]);
    }
  }
  return { sides, boundary, neighbours };
}

// Delaunay triangles from the neighbour sets: i < j < k, all mutually adjacent.
export function delaunayTriangles(neighbours) {
  const tris = [];
  neighbours.forEach((ni, i) => {
    for (const j of ni) {
      if (j <= i) continue;
      for (const k of neighbours[j]) if (k > j && ni.has(k)) tris.push([i, j, k]);
    }
  });
  return tris;
}
