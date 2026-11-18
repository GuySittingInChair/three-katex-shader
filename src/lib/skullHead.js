// A human head and the skull inside it, written as signed distance functions
// and meshed with surface nets. Pure JS (no three.js), so it runs in a worker.
//
// Head coordinates, in cm: x to the subject's left, y up, z forward (out of
// the face); the origin is near the middle of the braincase. Adult sizes:
// skull length (glabella to the back) 18.4 cm, breadth 14, nasion to chin
// 11.8, orbits 4.0 × 3.5, nasal aperture 2.4 × 3.4.
//
// The skull is a shell (the vault is 6–9 mm thick) with the real holes: the
// orbits, the nasal aperture and cavity, the foramen magnum, the ear canals,
// and the small foramina where nerves come out to the face. Every surface
// point is labelled with the bone it belongs to: the facial bones by which
// part of the shape made that surface, the vault by the sutures, which are
// drawn as serrated curves (coronal, sagittal, lambdoid, squamosal).
//
// The skin is the same skull, filled in, thickened by soft tissue, with
// eyelids (closed), a nose, lips, ears and a neck added.

const S = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

function ell(x, y, z, rx, ry, rz) {
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// Capsule from a to b; r may taper from r0 to r1.
function cap(px, py, pz, ax, ay, az, bx, by, bz, r0, r1 = r0) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (r0 + (r1 - r0) * h);
}
function rbox(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  const qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// Distance to a 2D polyline, and how far along it (0…1) the nearest point is.
const _pl = { d: 0, t: 0 };
function polyline(px, py, pts, lens, total) {
  let best = Infinity;
  let bt = 0;
  let acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i];
    const ay = pts[i + 1];
    const bx = pts[i + 2] - ax;
    const by = pts[i + 3] - ay;
    const L = lens[i / 2];
    const h = Math.min(1, Math.max(0, ((px - ax) * bx + (py - ay) * by) / (L * L)));
    const d = Math.hypot(px - ax - bx * h, py - ay - by * h);
    if (d < best) {
      best = d;
      bt = (acc + h * L) / total;
    }
    acc += L;
  }
  _pl.d = best;
  _pl.t = bt;
  return _pl;
}
function prepLine(pts) {
  const lens = [];
  let total = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const L = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    lens.push(L);
    total += L;
  }
  return { pts, lens, total };
}
// Signed distance to a 2D polygon (Inigo Quilez's winding-number version).
function poly2(px, py, v) {
  const n = v.length / 2;
  let d = (px - v[0]) ** 2 + (py - v[1]) ** 2;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = v[2 * j] - v[2 * i];
    const ey = v[2 * j + 1] - v[2 * i + 1];
    const wx = px - v[2 * i];
    const wy = py - v[2 * i + 1];
    const h = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, (wx - ex * h) ** 2 + (wy - ey * h) ** 2);
    const c1 = py >= v[2 * i + 1];
    const c2 = py < v[2 * j + 1];
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
const slab = (d2, dy, w, hh, r) => {
  const qx = d2 - w;
  const qy = dy - hh;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

// ---------- landmarks ----------
const UPPER_ARCH = prepLine([0, 8.35, 1.25, 8.05, 2.15, 7.35, 2.75, 6.3, 3.15, 4.95, 3.35, 3.5, 3.4, 2.3]);
const LOWER_ARCH = prepLine([0, 8.05, 1.15, 7.8, 2.0, 7.15, 2.6, 6.1, 3.0, 4.8, 3.25, 3.4, 3.3, 2.3]);
const MAND_BODY = prepLine([0, 7.85, 1.15, 7.6, 2.05, 6.95, 2.7, 5.95, 3.3, 4.6, 3.85, 3.2, 4.3, 1.9, 4.55, 1.15]);
// The ramus outline in (z, y): angle, back edge up to the condyle's neck,
// the notch, the coronoid process, and the front edge down into the body.
const RAMUS = [1.0, -10.2, 2.6, -10.5, 4.0, -9.7, 3.6, -7.4, 3.1, -5.6, 2.75, -4.35, 2.3, -4.55, 1.45, -5.45, 0.65, -4.5, 0.25, -3.9, -0.2, -4.2, 0.05, -6.5, 0.4, -9.0];

// Teeth along the arches, from the midline back: [mesiodistal, labiolingual, crown height, kind].
// kind 0 incisor, 1 canine, 2 premolar, 3 molar.
const UPPER_TEETH = [[0.85, 0.7, 1.0, 0], [0.66, 0.62, 0.9, 0], [0.78, 0.8, 1.0, 1], [0.7, 0.9, 0.82, 2], [0.66, 0.9, 0.78, 2], [1.02, 1.1, 0.72, 3], [0.92, 1.05, 0.7, 3], [0.84, 0.98, 0.66, 3]];
const LOWER_TEETH = [[0.54, 0.6, 0.9, 0], [0.6, 0.62, 0.92, 0], [0.7, 0.78, 1.0, 1], [0.7, 0.78, 0.82, 2], [0.72, 0.82, 0.8, 2], [1.1, 1.02, 0.74, 3], [1.04, 1.0, 0.72, 3], [0.98, 0.95, 0.68, 3]];
const OCCLUSAL = -7.9;
const TEETH = [];
for (const [arch, list, upper] of [[UPPER_ARCH, UPPER_TEETH, true], [LOWER_ARCH, LOWER_TEETH, false]]) {
  for (const side of [1, -1]) {
    let s = 0.02;
    for (const [md, bl, ch, kind] of list) {
      const at = s + md / 2;
      s += md + 0.03;
      // Point and tangent at arc length `at` along the arch.
      let acc = 0;
      const { pts, lens } = arch;
      for (let i = 0; i < lens.length; i++) {
        if (acc + lens[i] >= at || i === lens.length - 1) {
          const h = (at - acc) / lens[i];
          const x = pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * h;
          const z = pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * h;
          const tx = (pts[2 * i + 2] - pts[2 * i]) / lens[i];
          const tz = (pts[2 * i + 3] - pts[2 * i + 1]) / lens[i];
          TEETH.push({ x: x * side, z, tx: tx * side, tz, md, bl, ch, kind, upper });
          break;
        }
        acc += lens[i];
      }
    }
  }
}

function tooth(t, x, y, z) {
  const dx = x - t.x;
  const dz = z - t.z;
  // u along the arch, v outwards (lips/cheek side), w from the biting edge into the gum.
  const u = dx * t.tx + dz * t.tz;
  const v = Math.abs(t.tz * dx - t.tx * dz) * 1.0;
  const w = t.upper ? y - OCCLUSAL : OCCLUSAL - y; // 0 at the biting edge
  const mid = t.ch * 0.5 + 0.4; // crown plus some root, hidden in the bone
  const wc = w - mid;
  let hu = t.md * 0.5;
  let hv = t.bl * 0.5;
  if (t.kind === 0) hv *= 0.45 + 0.55 * S(0, t.ch * 0.8, w); // thin biting edge
  if (t.kind === 1) hu *= 0.45 + 0.55 * S(0, t.ch * 0.6, w); // a point
  hu *= 0.9 + 0.1 * S(t.ch, t.ch * 0.6, w); // the neck narrows
  hv *= 0.9 + 0.1 * S(t.ch, t.ch * 0.6, w);
  let d = rbox(u, wc, v, hu, mid, hv, Math.min(0.2, hu * 0.6, hv * 0.6));
  if (t.kind >= 2 && Math.abs(u) < hu * 0.75) d = Math.max(d, 0.1 - Math.hypot(v, w + 0.02)); // central fissure
  return d;
}
function teeth(x, y, z) {
  if (y < -9.4 || y > -5.4 || z < 1.4 || z > 9.2 || Math.abs(x) > 4.0) return 9;
  let d = 9;
  for (const t of TEETH) {
    if (Math.abs(x - t.x) > 1.2 || Math.abs(z - t.z) > 1.2) continue;
    if (t.upper ? y < OCCLUSAL - 0.4 : y > OCCLUSAL + 0.4) continue;
    d = Math.min(d, tooth(t, x, y, z));
  }
  return d;
}

// ---------- the skull ----------
// Parts are kept apart (in P) so the labeller can ask which one made a surface.
const P = {};
const zig = (s) => 0.11 * Math.sin(s * 7.3) + 0.05 * Math.sin(s * 17.1 + 1.3) + 0.03 * Math.sin(s * 31.0);
function parts(x, y, z) {
  const ax = Math.abs(x);
  // Braincase: an ellipsoid, a little narrower at the forehead, flat underneath.
  const bx = x / (1 - (0.07 * (z + 0.8)) / 9.2);
  P.vault = smax(ell(bx, y - 1.6, z + 0.8, 7.0, 6.6, 9.2), -(y + 4.3), 1.8);
  P.brow = smin(cap(ax, y, z, 0.9, 0.78, 8.3, 4.2, 0.55, 7.1, 0.62, 0.5), ell(x, y - 0.75, z - 8.2, 1.3, 0.75, 0.55), 0.6);
  P.tempRoot = ell(ax - 5.9, y + 2.9, z - 0.3, 0.9, 0.8, 1.4);
  P.mastoid = ell(ax - 5.5, y + 4.7, z + 2.2, 0.85, 1.35, 1.0);
  // Upper face: the maxillae, the shelf under the orbits, the tooth-bearing arch, the palate.
  const pl = polyline(ax, z, UPPER_ARCH.pts, UPPER_ARCH.lens, UPPER_ARCH.total);
  P.maxilla = smin(
    smin(ell(x, y + 4.6, z - 6.0, 3.3, 2.7, 2.75), slab(pl.d, Math.abs(y + 6.0), 0.32, 1.05, 0.26), 0.8),
    ell(x, y + 6.05, z - 5.0, 2.7, 0.4, 3.1),
    0.5,
  );
  P.spine = cap(x, y, z, 0, -5.6, 8.3, 0, -5.65, 9.1, 0.16, 0.06);
  P.plate = ell(x, y + 3.1, z - 6.3, 4.8, 1.25, 2.3);
  P.zyg = smin(ell(ax - 4.75, y + 3.55, z - 5.5, 1.25, 1.35, 1.5), cap(ax, y, z, 4.85, -3.1, 5.8, 4.55, 0.55, 6.5, 0.5, 0.42), 0.5);
  // The arch: zygomatic in front, temporal behind (the suture is at its middle).
  const ay = y / 1.5;
  P.archF = cap(ax, ay, z, 4.9, -3.4 / 1.5, 4.6, 5.6, -3.2 / 1.5, 2.6, 0.42);
  P.archB = cap(ax, ay, z, 5.6, -3.2 / 1.5, 2.6, 6.25, -3.05 / 1.5, 0.6, 0.42);
  P.nasal = cap(x * 0.75, y, z, 0, -0.1, 8.45, 0, -2.4, 9.35, 0.42, 0.36);
  P.septum = rbox(x, y + 4.1, z - 4.4, 0.08, 1.45, 2.6, 0.05);
  // Mandible: a U-shaped body, the chin, two rami with their condyles.
  const mb = polyline(ax, z, MAND_BODY.pts, MAND_BODY.lens, MAND_BODY.total);
  const yTop = -8.75 + 0.2 * mb.t;
  const yBot = -11.6 + 1.7 * mb.t;
  let m = slab(mb.d, Math.abs(y - (yTop + yBot) / 2), 0.36 + 0.14 * mb.t, (yTop - yBot) / 2, 0.24);
  m = smin(m, ell(x, y + 11.0, z - 7.95, 1.6, 0.9, 0.55), 0.6);
  const xr = 4.6 + 0.04 * (y + 10);
  const ramus = Math.max(poly2(z, y, RAMUS), Math.abs(ax - xr) - 0.2) - 0.14;
  m = smin(m, ramus, 0.5);
  m = smin(m, ell(ax - 5.0, y + 3.55, z - 0.25, 1.0, 0.48, 0.55), 0.3);
  P.mand = Math.max(m, -(Math.hypot(ax - 2.3, y + 10.0, z - 7.15) - 0.24)); // mental foramen
  P.teeth = teeth(x, y, z);
  return P;
}

// Combine the parts. holes = false gives the filled-in skull the skin is built on.
function combine(x, y, z, holes) {
  const ax = Math.abs(x);
  let s = smin(P.vault, P.brow, 0.8);
  s = smin(s, P.maxilla, 1.2);
  s = smin(s, P.plate, 1.0);
  s = smin(s, P.tempRoot, 0.8);
  s = smin(s, P.mastoid, 0.7);
  // The temporal fossa: the hollow of the temple, behind the orbit's outer rim.
  s = smax(s, -ell(ax - 7.25, y + 1.6, z - 3.2, 1.9, 3.0, 2.5), 0.9);
  s = smin(s, P.zyg, 0.7);
  s = smin(s, P.archF, 0.35);
  s = smin(s, P.archB, 0.35);
  if (holes) {
    // Orbits, with the fissures and optic canal going back from their apex.
    s = smax(s, -ell(ax - 3.2, y + 1.7, z - 7.7, 2.0, 1.75, 2.9), 0.45);
    s = smax(s, -cap(ax, y, z, 3.0, -1.8, 6.4, 1.5, -2.0, 3.0, 0.75, 0.45), 0.3);
    // The pear-shaped nasal aperture, and the cavity behind it.
    const w = 0.8 + 0.45 * S(-2.4, -5.0, y);
    s = smax(s, -ell(x / w, y + 3.9, z - 8.9, 1.2, 1.75, 2.2) * Math.min(w, 1), 0.35);
    s = smax(s, -rbox(x, y + 4.0, z - 5.2, 1.1, 1.6, 3.4, 0.3), 0.25);
    // The cranial cavity: the floor steps up from the middle fossa to the
    // anterior fossa over the orbits, and the sphenoid body rises in the middle.
    const floor = -3.6 + 4.2 * S(2.0, 5.2, z) + 1.6 * Math.exp((-x * x) / 5) * S(-1.5, 0.5, z) * (1 - S(3.5, 5.0, z));
    const cav = smax(ell(bx(x, z), y - 1.6, z + 0.8, 6.35, 5.95, 8.55), floor - y, 0.8);
    s = smax(s, -cav, 0.15);
    s = smax(s, -(Math.hypot(x / 1.4, (z + 2.8) / 1.9) * 1.4 - 1.4), 0.2); // foramen magnum
    s = smax(s, -cap(ax, y, z, 5.0, -2.6, -1.2, 7.8, -2.6, -1.2, 0.45), 0.15); // ear canal
    s = smax(s, -(Math.hypot(ax - 2.3, y + 3.6, z - 8.15) - 0.27), 0.08); // infraorbital foramen
    s = smax(s, -(Math.hypot(ax - 2.15, y - 0.3, z - 8.35) - 0.2), 0.06); // supraorbital notch
    s = smin(s, P.spine, 0.15);
    s = smin(s, P.nasal, 0.3);
    s = Math.min(s, P.septum);
  } else {
    s = smin(s, P.nasal, 0.3);
  }
  s = Math.min(s, P.mand);
  if (holes) s = Math.min(s, P.teeth);
  return s;
}
const bx = (x, z) => x / (1 - (0.07 * (z + 0.8)) / 9.2);

export function skullSDF(x, y, z) {
  parts(x, y, z);
  return combine(x, y, z, true);
}

// ---------- bones ----------
export const BONES = [
  null,
  { name: 'Frontal bone', fact: 'The forehead and the roofs of both orbits. It starts as two halves; the seam between them (the metopic suture) is usually gone by age two.' },
  { name: 'Left parietal bone', fact: 'One of the pair that makes the roof and sides of the skull. They meet at the sagittal suture, along the top.' },
  { name: 'Right parietal bone', fact: 'One of the pair that makes the roof and sides of the skull. They meet at the sagittal suture, along the top.' },
  { name: 'Occipital bone', fact: 'The back and part of the base. The spinal cord leaves through the foramen magnum, the big hole underneath.' },
  { name: 'Left temporal bone', fact: 'Holds the ear: the ear canal goes in here, and the hearing organ sits in its petrous part, the densest bone in the body. The bump behind the ear is the mastoid process.' },
  { name: 'Right temporal bone', fact: 'Holds the ear: the ear canal goes in here, and the hearing organ sits in its petrous part, the densest bone in the body. The bump behind the ear is the mastoid process.' },
  { name: 'Sphenoid bone', fact: 'A butterfly-shaped bone that runs right across the base; only its greater wings show, at the temples. Where four bones meet there (the pterion) the skull is thinnest.' },
  { name: 'Left zygomatic bone', fact: 'The cheekbone. With part of the temporal bone it forms the zygomatic arch, which the jaw muscle (masseter) hangs from.' },
  { name: 'Right zygomatic bone', fact: 'The cheekbone. With part of the temporal bone it forms the zygomatic arch, which the jaw muscle (masseter) hangs from.' },
  { name: 'Maxillae', fact: 'The upper jaw: two bones fused in the middle. They hold the upper teeth, make most of the hard palate, and the floor of each orbit.' },
  { name: 'Nasal bones', fact: 'Just the bridge of the nose. The rest of the nose is cartilage, which is why a skull has a hole there.' },
  { name: 'Mandible', fact: 'The lower jaw: the only skull bone that moves, hinged at the temporomandibular joints just in front of the ears.' },
  { name: 'Teeth', fact: 'Not bone. The enamel on top is about 96% hydroxyapatite, the hardest substance in the body. Adults have 32.' },
  { name: 'Vomer and ethmoid', fact: 'The bony nasal septum, the wall down the middle of the nose. Only visible with the skull cut in half.' },
];

function label(x, y, z) {
  parts(x, y, z);
  const ax = Math.abs(x);
  const side = x >= 0 ? 0 : 1; // +x is the subject's left
  let best = 'vault';
  let bd = Math.abs(P.vault);
  for (const k of ['brow', 'tempRoot', 'mastoid', 'maxilla', 'spine', 'plate', 'zyg', 'archF', 'archB', 'nasal', 'septum', 'mand', 'teeth']) {
    const d = Math.abs(P[k]);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  if (best === 'teeth') return 13;
  if (best === 'mand') return 12;
  if (best === 'nasal') return 11;
  if (best === 'septum') return 14;
  if (best === 'maxilla' || best === 'spine') return 10;
  if (best === 'plate') return ax > 3.7 ? 8 + side : 10;
  if (best === 'zyg') return y > -0.4 + zig(z * 2) * 0.5 ? 1 : 8 + side;
  if (best === 'archF') return 8 + side;
  if (best === 'archB' || best === 'tempRoot' || best === 'mastoid') return 5 + side;
  if (best === 'brow') return 1;
  // The vault, by its sutures.
  if (y < -2.4 && ax < 2.6 && z > -1.2 && z < 3.6) return 7;
  const zL = -7.6 + 0.26 * (6.2 - y) + zig(x * 1.3 - y * 0.7 + 3);
  if (z < zL) return 4;
  const yS = 0.9 - 0.11 * z * z + 0.6 * zig(z * 1.5 + 5);
  if (ax > 3.2 && y < yS && z < 3.3) return 5 + side;
  const zC = 1.4 + 0.36 * (7.8 - y) + zig(x * 1.3 + y);
  if (ax > 3.6 && y < 0.6 && y > -4.2 && z > 3.0 && z < zC + 0.3) return 7;
  if (z > zC) return 1;
  return x + 0.6 * zig(y * 1.5 + z) > 0 ? 2 : 3;
}

// ---------- the skin ----------
const SK = {};
function skinParts(x, y, z) {
  const ax = Math.abs(x);
  parts(x, y, z);
  let s = combine(x, y, z, false);
  // Eye sockets show through as hollows under the brow.
  s = smax(s, -ell(ax - 3.2, y + 1.75, z - 8.3, 1.75, 1.45, 1.3), 0.6);
  s -= 0.55; // soft tissue
  s = smin(s, ell(ax - 3.6, y + 5.6, z - 5.4, 2.1, 2.6, 2.6), 1.6); // cheeks
  s = smin(s, ell(x, y + 7.4, z - 7.9, 2.6, 2.1, 1.7), 1.2); // round the mouth
  s = smin(s, ell(x, y + 11.0, z - 8.0, 2.0, 1.2, 1.2), 1.0); // chin
  SK.lid = Math.hypot(ax - 3.2, y + 1.8, z - 7.35) - 1.32;
  s = smin(s, SK.lid, 0.35);
  // Nose: bridge, tip, the wings either side, nostrils.
  let n = cap(x, y, z, 0, -0.4, 9.05, 0, -3.4, 10.75, 0.48, 0.62);
  n = smin(n, ell(x, y + 3.7, z - 10.85, 0.85, 0.75, 0.65), 0.4);
  n = smin(n, ell(ax - 1.0, y + 4.1, z - 9.75, 0.62, 0.55, 0.75), 0.35);
  n = smax(n, -ell(ax - 0.5, y + 4.38, z - 10.15, 0.27, 0.17, 0.45), 0.08);
  SK.nose = n;
  s = smin(s, n, 0.45);
  s = smax(s, -ell(x, y + 5.4, z - 9.95, 0.32, 0.7, 0.22), 0.25); // philtrum
  SK.lipU = ell(x, y + 6.5, z - 9.55 + 0.12 * x * x, 2.2, 0.55, 0.6);
  SK.lipL = ell(x, y + 7.55, z - 9.4 + 0.12 * x * x, 2.0, 0.6, 0.6);
  s = smin(s, SK.lipU, 0.35);
  s = smin(s, SK.lipL, 0.35);
  s = smax(s, -ell(x, y + 7.0, z - 9.8 + 0.12 * x * x, 2.35, 0.07, 0.9), 0.08);
  // Ears, flared out at the back: helix rim, scapha, concha.
  const a = 0.38;
  const ex = ax - 7.0;
  const ez = z + 1.3;
  const u = ex * Math.cos(a) + ez * Math.sin(a);
  const v = -ex * Math.sin(a) + ez * Math.cos(a);
  const ey = y + 2.4;
  const lobe = 1 - 0.35 * S(-1.0, -2.8, ey);
  let ear = ell(u, ey, v / lobe, 0.38, 3.0, 1.8) * lobe;
  ear = smax(ear, -ell(u - 0.36, ey + 0.4, v - 0.25, 0.36, 1.15, 0.85), 0.15);
  ear = smax(ear, -ell(u - 0.32, ey - 0.6, v + 0.2, 0.22, 2.1, 1.2), 0.1);
  SK.ear = ear;
  s = smin(s, ear, 0.3);
  s = smin(s, cap(x * 1.05, y, z, 0, -8.0, -2.6, 0, -21, -1.4, 5.2), 2.5); // neck
  return s;
}
export function skinSDF(x, y, z) {
  return skinParts(x, y, z);
}

// Where the hair is: above a hairline that runs from the forehead, round the
// temples and over the ears, to the nape.
function hairAt(x, y, z) {
  const dx = x;
  const dy = y - 1.6;
  const dz = z + 0.8;
  const l = Math.hypot(dx, dy, dz) || 1;
  const phi = Math.atan2(Math.abs(dx), dz); // 0 front, π back
  const c = (1 + Math.cos(phi)) / 2;
  let h = -0.55 + 1.12 * Math.pow(c, 1.4);
  h += 0.12 * Math.exp(-((phi - 0.75) ** 2) / 0.05); // receding at the temples
  if (phi > 1.1 && phi < 2.2) h = Math.max(h, 0.05 - 0.15 * Math.sin(((phi - 1.1) / 1.1) * Math.PI)); // round the ears
  return S(h - 0.03, h + 0.05, dy / l);
}

// ---------- meshing ----------
// Sample f on a grid, exactly near the surface and interpolated from a grid 4
// times coarser elsewhere (only the sign matters out there).
function sample(f, box, cell) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const C = 4;
  const nx = Math.ceil((x1 - x0) / cell / C) * C + 1;
  const ny = Math.ceil((y1 - y0) / cell / C) * C + 1;
  const nz = Math.ceil((z1 - z0) / cell / C) * C + 1;
  const cx = (nx - 1) / C + 1;
  const cy = (ny - 1) / C + 1;
  const cz = (nz - 1) / C + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    coarse[i + cx * (j + cy * k)] = f(x0 + i * C * cell, y0 + j * C * cell, z0 + k * C * cell);
  }
  const F = new Float32Array(nx * ny * nz);
  const band = C * cell * 1.6;
  for (let K = 0; K < cz - 1; K++) for (let J = 0; J < cy - 1; J++) for (let I = 0; I < cx - 1; I++) {
    let near = false;
    const c = [];
    for (let q = 0; q < 8; q++) {
      const v = coarse[I + (q & 1) + cx * (J + ((q >> 1) & 1) + cy * (K + (q >> 2)))];
      c.push(v);
      if (Math.abs(v) < band) near = true;
    }
    if (!near && Math.sign(Math.min(...c)) !== Math.sign(Math.max(...c))) near = true;
    for (let k = 0; k <= C; k++) for (let j = 0; j <= C; j++) for (let i = 0; i <= C; i++) {
      const gi = I * C + i;
      const gj = J * C + j;
      const gk = K * C + k;
      const idx = gi + nx * (gj + ny * gk);
      if (near) F[idx] = f(x0 + gi * cell, y0 + gj * cell, z0 + gk * cell);
      else {
        const u = i / C;
        const v = j / C;
        const w = k / C;
        F[idx] =
          (1 - w) * ((1 - v) * ((1 - u) * c[0] + u * c[1]) + v * ((1 - u) * c[2] + u * c[3])) +
          w * ((1 - v) * ((1 - u) * c[4] + u * c[5]) + v * ((1 - u) * c[6] + u * c[7]));
      }
    }
  }
  return { F, nx, ny, nz, x0, y0, z0, cell };
}

export function gridValue(g, x, y, z) {
  const fx = Math.min(g.nx - 1.001, Math.max(0, (x - g.x0) / g.cell));
  const fy = Math.min(g.ny - 1.001, Math.max(0, (y - g.y0) / g.cell));
  const fz = Math.min(g.nz - 1.001, Math.max(0, (z - g.z0) / g.cell));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const u = fx - i;
  const v = fy - j;
  const w = fz - k;
  const { F, nx, ny } = g;
  const o = i + nx * (j + ny * k);
  const sx = 1;
  const sy = nx;
  const sz = nx * ny;
  return (
    (1 - w) * ((1 - v) * ((1 - u) * F[o] + u * F[o + sx]) + v * ((1 - u) * F[o + sy] + u * F[o + sx + sy])) +
    w * ((1 - v) * ((1 - u) * F[o + sz] + u * F[o + sx + sz]) + v * ((1 - u) * F[o + sy + sz] + u * F[o + sx + sy + sz]))
  );
}
function gridGrad(g, x, y, z, out) {
  const h = g.cell;
  out[0] = gridValue(g, x + h, y, z) - gridValue(g, x - h, y, z);
  out[1] = gridValue(g, x, y + h, z) - gridValue(g, x, y - h, z);
  out[2] = gridValue(g, x, y, z + h) - gridValue(g, x, y, z - h);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}

// Surface nets: one vertex per cell the surface passes through (the mean of
// where it crosses the cell's edges), one quad per crossed grid edge. Each
// vertex is then pulled onto the exact surface with one Newton step of f.
const EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7];
function nets(g, f) {
  const { F, nx, ny, nz, x0, y0, z0, cell } = g;
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let q = 0; q < 8; q++) {
      const v = F[i + (q & 1) + nx * (j + ((q >> 1) & 1) + ny * (k + (q >> 2)))];
      corner[q] = v;
      if (v < 0) mask |= 1 << q;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let e = 0; e < 24; e += 2) {
      const a = EDGES[e];
      const b = EDGES[e + 1];
      const va = corner[a];
      const vb = corner[b];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
      n++;
    }
    vid[cidx(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[i + nx * (j + ny * k)];
    const inside = v0 < 0;
    // Edge along x from (i,j,k): the cells around it share i.
    if (i < nx - 1 && inside !== F[i + 1 + nx * (j + ny * k)] < 0) {
      quad(vid[cidx(i, j - 1, k - 1)], vid[cidx(i, j, k - 1)], vid[cidx(i, j, k)], vid[cidx(i, j - 1, k)], !inside);
    }
    if (j < ny - 1 && inside !== F[i + nx * (j + 1 + ny * k)] < 0) {
      quad(vid[cidx(i - 1, j, k - 1)], vid[cidx(i - 1, j, k)], vid[cidx(i, j, k)], vid[cidx(i, j, k - 1)], !inside);
    }
    if (k < nz - 1 && inside !== F[i + nx * (j + ny * (k + 1))] < 0) {
      quad(vid[cidx(i - 1, j - 1, k)], vid[cidx(i, j - 1, k)], vid[cidx(i, j, k)], vid[cidx(i - 1, j, k)], !inside);
    }
  }
  const P3 = Float32Array.from(pos);
  const N3 = new Float32Array(P3.length);
  const gr = [0, 0, 0];
  for (let v = 0; v < P3.length; v += 3) {
    gridGrad(g, P3[v], P3[v + 1], P3[v + 2], gr);
    const d = f(P3[v], P3[v + 1], P3[v + 2]);
    if (Math.abs(d) < cell) {
      P3[v] -= gr[0] * d;
      P3[v + 1] -= gr[1] * d;
      P3[v + 2] -= gr[2] * d;
    }
    gridGrad(g, P3[v], P3[v + 1], P3[v + 2], gr);
    N3[v] = gr[0];
    N3[v + 1] = gr[1];
    N3[v + 2] = gr[2];
  }
  const I = P3.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
  // Make sure the triangles face outwards (the winding above depends on axis conventions).
  let vol = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t];
    const b = 3 * I[t + 1];
    const c = 3 * I[t + 2];
    vol +=
      P3[a] * (P3[b + 1] * P3[c + 2] - P3[b + 2] * P3[c + 1]) -
      P3[a + 1] * (P3[b] * P3[c + 2] - P3[b + 2] * P3[c]) +
      P3[a + 2] * (P3[b] * P3[c + 1] - P3[b + 1] * P3[c]);
  }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) [I[t + 1], I[t + 2]] = [I[t + 2], I[t + 1]];
  return { pos: P3, nrm: N3, idx: I };
}

// Ambient occlusion from the distance field: how much the field shrinks
// along the normal compared with an open surface.
function occlusion(g, pos, nrm) {
  const ao = new Float32Array(pos.length / 3);
  for (let v = 0; v < ao.length; v++) {
    let occ = 0;
    let wsum = 0;
    for (const [dd, w] of [[0.25, 1], [0.6, 0.7], [1.2, 0.45], [2.2, 0.3]]) {
      const d = gridValue(g, pos[3 * v] + nrm[3 * v] * dd, pos[3 * v + 1] + nrm[3 * v + 1] * dd, pos[3 * v + 2] + nrm[3 * v + 2] * dd);
      occ += (w * Math.max(0, dd - d)) / dd;
      wsum += w;
    }
    ao[v] = Math.max(0, 1 - (1.3 * occ) / wsum);
  }
  return ao;
}

export function buildHead({ skullCell = 0.16, skinCell = 0.25 } = {}) {
  const t0 = Date.now();
  // Skull.
  const sg = sample(skullSDF, [-7.8, -12.3, -10.7, 7.8, 8.7, 10.2], skullCell);
  const skull = nets(sg, skullSDF);
  skull.ao = occlusion(sg, skull.pos, skull.nrm);
  const nv = skull.pos.length / 3;
  skull.bone = new Float32Array(nv);
  for (let v = 0; v < nv; v++) skull.bone[v] = label(skull.pos[3 * v], skull.pos[3 * v + 1], skull.pos[3 * v + 2]);
  // Sutures: where neighbouring vertices belong to different bones.
  skull.suture = new Float32Array(nv);
  const I = skull.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t];
    const b = I[t + 1];
    const c = I[t + 2];
    const ba = skull.bone[a];
    if (ba !== skull.bone[b] || ba !== skull.bone[c] || skull.bone[b] !== skull.bone[c]) {
      skull.suture[a] = skull.suture[b] = skull.suture[c] = 1;
    }
  }
  // Where to look at each bone from: the middle of its open (unoccluded) surface, and its mean normal.
  const views = BONES.map(() => [0, 0, 0, 0, 0, 0, 0]);
  for (let v = 0; v < nv; v++) {
    if (skull.ao[v] < 0.8) continue;
    const s = views[skull.bone[v]];
    for (let c = 0; c < 3; c++) {
      s[c] += skull.pos[3 * v + c];
      s[3 + c] += skull.nrm[3 * v + c];
    }
    s[6]++;
  }
  skull.views = views.map((s) => (s[6] ? [s[0] / s[6], s[1] / s[6], s[2] / s[6], s[3], s[4], s[5]] : null));
  const t1 = Date.now();
  // Skin.
  const kg = sample(skinSDF, [-8.4, -19, -11.6, 8.4, 9.6, 12.4], skinCell);
  const skin = nets(kg, skinSDF);
  skin.ao = occlusion(kg, skin.pos, skin.nrm);
  const kv = skin.pos.length / 3;
  // Per-vertex regions: lips, hair, eyebrows, the line of the closed eyelids.
  skin.region = new Float32Array(4 * kv);
  for (let v = 0; v < kv; v++) {
    const x = skin.pos[3 * v];
    const y = skin.pos[3 * v + 1];
    const z = skin.pos[3 * v + 2];
    skinParts(x, y, z);
    const ax = Math.abs(x);
    const lips = S(0.32, 0.04, Math.min(SK.lipU, SK.lipL)) * S(8.6, 9.3, z) * (1 - S(1.9, 2.4, ax));
    const hair = hairAt(x, y, z) * (1 - S(0.6, 0.15, SK.ear));
    const browD = cap(ax, y, z, 1.0, 1.25, 9.0, 4.3, 1.05, 7.75, 0.0) - 0.42 + 0.12 * S(1.0, 4.3, ax);
    const brow = S(0.2, -0.15, browD) * (z > 6.5 ? 1 : 0);
    const lash = S(0.1, 0.0, Math.abs(y + 1.95 + 0.06 * (ax - 3.2) ** 2)) * S(0.3, 0.05, SK.lid) * S(1.3, 0.9, Math.abs(ax - 3.2));
    skin.region.set([lips, hair, brow, lash], 4 * v);
  }
  return { skull, skin, field: kg, ms: { skull: t1 - t0, skin: Date.now() - t1 } };
}
