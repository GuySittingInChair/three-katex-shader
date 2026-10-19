import * as THREE from 'three';
import { TAU, phaseOf } from '../lib/motion.js';
import { createGlow } from '../lib/glow.js';
import { createFatLines } from '../lib/fatLines.js';
import { caption } from '../lib/bit.js';

// Kleinian limit sets, the way "Indra's Pearls" (Mumford, Series & Wright, 2002) draws them.
//
// Take two Möbius maps a, b (2×2 complex matrices of determinant 1, acting by z ↦ (αz + β)/(γz + δ)) and
// their inverses A, B. Every word in the four letters, like abAAbaB, is another Möbius map. When the group
// they make is discrete, the orbits of any point pile up on one set: the limit set Λ, a fractal curve.
//
// Grandma's recipe (ch. 6) builds a, b from their traces t_a = tr a, t_b = tr b, forcing the commutator
// abAB to be parabolic, tr(abAB) = −2 (so the curve closes up):
//     t_ab = ½ (t_a t_b − √(t_a² t_b² − 4(t_a² + t_b²)))
//     z₀ = (t_ab − 2) t_b / (t_b t_ab − 2t_a + 2i t_ab)
//     a = [ t_a/2, (t_a t_ab − 2t_b + 4i)/((2t_ab + 4) z₀) ; (t_a t_ab − 2t_b − 4i) z₀/(2t_ab − 4), t_a/2 ]
//     b = [ (t_b − 2i)/2, t_b/2 ; t_b/2, (t_b + 2i)/2 ]
// The readout recomputes tr(abAB) from the actual matrices every frame.
//
// Drawing Λ (ch. 7): depth-first search over reduced words. Each branch w ending in letter g carries three
// points, the images under w of the fixed points of the three special words ending in g (two cyclic
// commutators and g itself). Once those three points are within ε of each other, the curve there is
// drawn as two segments and the branch stops. Children are visited in a fixed cyclic order, so the
// segments come out in order along the curve; the colour runs along it.
//
// The path. Most (t_a, t_b) give non-discrete groups and a meaningless picture, so the loop stays inside
// the discrete region on the slice t_b = conj(t_a). Checked in Node, before animating: at t_a = t_b = 2 the
// limit set is exactly the Apollonian gasket; along the whole closed path (12 knots, Catmull–Rom, 240
// samples) the search terminates at depth < 18 in ≥ 89% of branches, the curve stays bounded, and it takes
// at most 65 000 segments (about 5 ms per frame). Near the edge of the discrete region (t_a → 1.87 + 0.1i)
// the curve coils into the famous double spirals; deep inside (t_a ≈ 2.1 + 0.3i) it relaxes to a wobbly
// circle; the second half of the loop is the mirror image (Im t_a < 0).

const PERIOD = 60;
const EPS = 0.006;
const MAX_LEV = 18;
const MAX_PTS = 4 * 90000;
const KNOTS = [[2.0, 0], [1.93, 0.04], [1.885, 0.1], [1.875, 0.2], [1.93, 0.32], [2.12, 0.26], [2.05, 0.0], [2.12, -0.26], [1.93, -0.32], [1.875, -0.2], [1.885, -0.1], [1.93, -0.04]];
const PALETTES = ['Pearl', 'Ember', 'Ice'];

// Complex numbers as [re, im].
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const csqrt = (a) => {
  const r = Math.hypot(a[0], a[1]);
  return [Math.sqrt((r + a[0]) / 2), Math.sign(a[1] || 1) * Math.sqrt(Math.max(0, (r - a[0]) / 2))];
};
const R = (x) => [x, 0];
const mm = (M, N) => [add(mul(M[0], N[0]), mul(M[1], N[2])), add(mul(M[0], N[1]), mul(M[1], N[3])), add(mul(M[2], N[0]), mul(M[3], N[2])), add(mul(M[2], N[1]), mul(M[3], N[3]))];
const minv = (M) => [M[3], [-M[1][0], -M[1][1]], [-M[2][0], -M[2][1]], M[0]];

function grandma(ta, tb) {
  const p = mul(ta, tb);
  const tab = div(sub(p, csqrt(sub(mul(p, p), mul(R(4), add(mul(ta, ta), mul(tb, tb)))))), R(2));
  const z0 = div(mul(sub(tab, R(2)), tb), add(sub(mul(tb, tab), mul(R(2), ta)), mul([0, 2], tab)));
  const a = [
    div(ta, R(2)),
    div(add(sub(mul(ta, tab), mul(R(2), tb)), [0, 4]), mul(add(mul(R(2), tab), R(4)), z0)),
    div(mul(sub(sub(mul(ta, tab), mul(R(2), tb)), [0, 4]), z0), sub(mul(R(2), tab), R(4))),
    div(ta, R(2)),
  ];
  const b = [div(sub(tb, [0, 2]), R(2)), div(tb, R(2)), div(tb, R(2)), div(add(tb, [0, 2]), R(2))];
  return { a, b, tab };
}

// Attracting (or parabolic) fixed point of a Möbius map: the one where |γz + δ| ≥ 1.
function fixpt(M) {
  const c = M[2];
  const amd = sub(M[0], M[3]);
  const s = csqrt(add(mul(amd, amd), mul(R(4), mul(M[1], c))));
  const z1 = div(add(amd, s), mul(R(2), c));
  const z2 = div(sub(amd, s), mul(R(2), c));
  const n1 = Math.hypot(...add(mul(c, z1), M[3]));
  const n2 = Math.hypot(...add(mul(c, z2), M[3]));
  return n1 >= n2 ? z1 : z2;
}

// Generators (a, b, A, B) flattened for the search, and each letter's three special fixed points.
function groupData(ta, tb) {
  const { a, b, tab } = grandma(ta, tb);
  const g = [a, b, minv(a), minv(b)];
  const word = (...idx) => idx.reduce((M, i) => mm(M, g[i]), [R(1), R(0), R(0), R(1)]);
  const gens = new Float64Array(32);
  g.forEach((M, i) => gens.set(M.flat(), 8 * i));
  const fixes = new Float64Array(24);
  for (let i = 0; i < 4; i++) {
    const i1 = (i + 1) % 4, i2 = (i + 2) % 4, i3 = (i + 3) % 4;
    [fixpt(word(i1, i2, i3, i)), fixpt(g[i]), fixpt(word(i3, i2, i1, i))].forEach((z, k) => fixes.set(z, 6 * i + 2 * k));
  }
  const comm = word(0, 1, 2, 3);
  return { gens, fixes, tab, trComm: add(comm[0], comm[3]) };
}

// The depth-first search, with no allocation per node: a stack of matrices in one Float64Array.
function makeSearch() {
  const out = new Float32Array(MAX_PTS * 2);
  const M = new Float64Array((MAX_LEV + 2) * 8);
  const lastG = new Int8Array(MAX_LEV + 2);
  const child = new Int8Array(MAX_LEV + 2);
  const G = new Float64Array(32);
  const F = new Float64Array(24);
  const px = [0, 0, 0];
  const py = [0, 0, 0];
  const times = (lev, j) => {
    const o = lev * 8, q = (lev + 1) * 8, g = j * 8;
    const a0 = M[o], a1 = M[o + 1], b0 = M[o + 2], b1 = M[o + 3], c0 = M[o + 4], c1 = M[o + 5], d0 = M[o + 6], d1 = M[o + 7];
    const e0 = G[g], e1 = G[g + 1], f0 = G[g + 2], f1 = G[g + 3], g0 = G[g + 4], g1 = G[g + 5], h0 = G[g + 6], h1 = G[g + 7];
    M[q] = a0 * e0 - a1 * e1 + b0 * g0 - b1 * g1; M[q + 1] = a0 * e1 + a1 * e0 + b0 * g1 + b1 * g0;
    M[q + 2] = a0 * f0 - a1 * f1 + b0 * h0 - b1 * h1; M[q + 3] = a0 * f1 + a1 * f0 + b0 * h1 + b1 * h0;
    M[q + 4] = c0 * e0 - c1 * e1 + d0 * g0 - d1 * g1; M[q + 5] = c0 * e1 + c1 * e0 + d0 * g1 + d1 * g0;
    M[q + 6] = c0 * f0 - c1 * f1 + d0 * h0 - d1 * h1; M[q + 7] = c0 * f1 + c1 * f0 + d0 * h1 + d1 * h0;
  };
  return {
    out,
    run(gens, fixes, eps) {
      G.set(gens);
      F.set(fixes);
      const eps2 = eps * eps;
      let n = 0;
      let maxHit = 0;
      for (let start = 0; start < 4; start++) {
        let lev = 0;
        M.set(G.subarray(start * 8, start * 8 + 8), 0);
        lastG[0] = start;
        child[0] = -1;
        while (lev >= 0) {
          if (child[lev] === -1) {
            const o = lev * 8, last = lastG[lev];
            for (let k = 0; k < 3; k++) {
              const zr = F[last * 6 + 2 * k], zi = F[last * 6 + 2 * k + 1];
              const nr = M[o] * zr - M[o + 1] * zi + M[o + 2], ni = M[o] * zi + M[o + 1] * zr + M[o + 3];
              const dr = M[o + 4] * zr - M[o + 5] * zi + M[o + 6], di = M[o + 4] * zi + M[o + 5] * zr + M[o + 7];
              const dd = dr * dr + di * di;
              px[k] = (nr * dr + ni * di) / dd;
              py[k] = (ni * dr - nr * di) / dd;
            }
            const close = (px[0] - px[1]) ** 2 + (py[0] - py[1]) ** 2 < eps2 && (px[1] - px[2]) ** 2 + (py[1] - py[2]) ** 2 < eps2;
            if (close || lev + 1 >= MAX_LEV) {
              if (!close) maxHit++;
              if (n + 4 <= MAX_PTS) {
                const w = 2 * n;
                out[w] = px[0]; out[w + 1] = py[0]; out[w + 2] = px[1]; out[w + 3] = py[1];
                out[w + 4] = px[1]; out[w + 5] = py[1]; out[w + 6] = px[2]; out[w + 7] = py[2];
                n += 4;
              }
              lev--;
              continue;
            }
            child[lev] = 0;
          }
          if (child[lev] >= 3) { lev--; continue; }
          const last = lastG[lev];
          const j = child[lev] === 0 ? (last + 1) % 4 : child[lev] === 1 ? last : (last + 3) % 4;
          child[lev]++;
          times(lev, j);
          lastG[lev + 1] = j;
          child[lev + 1] = -1;
          lev++;
        }
      }
      return { n, maxHit };
    },
  };
}

function pathAt(u) {
  const n = KNOTS.length;
  const x = u * n;
  const i = Math.floor(x);
  const f = x - i;
  const P = (k) => KNOTS[((k % n) + n) % n];
  const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}

export default {
  name: 'Kleinian Necklace',
  description:
    'Two Möbius maps, built from their traces by Grandma\'s recipe from "Indra\'s Pearls", and every word ' +
    'you can spell with them and their inverses. Their orbits pile up on a fractal curve, the limit set, ' +
    'drawn by depth-first search over the words. The traces travel through the discrete groups: from the ' +
    'Apollonian gasket, to double spirals at the edge, to a calm wobbly circle deep inside.',
  tags: ['fractal', 'kleinian', 'mobius', 'limit-set', 'indras-pearls', 'modern'],
  category: 'Fractals',

  mode: '3d',
  controls: 'orbit',

  motion(t) {
    const u = phaseOf(t, PERIOD);
    const ta = pathAt(u);
    return { u, ta, tb: [ta[0], -ta[1]], segs: 0, maxHit: 0, tab: [0, 0], trComm: [0, 0] };
  },

  latex: (params, hl, m) => {
    const z = (c, d = 3) => `${hl(c[0], d)} ${c[1] < 0 ? '-' : '+'} ${hl(Math.abs(c[1]), d)}\\,i`;
    const near2 = Math.hypot(m.ta[0] - 2, m.ta[1]) < 0.03;
    const line = near2
      ? 't_a = t_b = 2: the Apollonian gasket. Every circle touches its neighbours.'
      : m.ta[0] < 1.95 && Math.abs(m.ta[1]) < 0.17
        ? 'Near the edge of the discrete groups, the curve coils into double spirals.'
        : m.ta[0] > 2.04
          ? 'Deep inside: a wobbly circle. Still a fractal, just a calm one.'
          : 'Every word in a, b, A, B is a pearl on this curve. We stop at ε.';
    return (
      '\\begin{aligned}' +
      '&\\operatorname{tr} a = t_a,\\ \\operatorname{tr} b = t_b,\\ \\operatorname{tr}(abAB) = -2\\quad\\text{(Grandma\'s recipe)} \\\\' +
      `t_a &= ${z(m.ta)},\\quad t_b = \\bar t_a \\\\` +
      `t_{ab} &= \\tfrac12\\big(t_at_b - \\sqrt{t_a^2t_b^2 - 4(t_a^2+t_b^2)}\\big) = ${z(m.tab)} \\\\` +
      `\\operatorname{tr}(abAB) &= ${z(m.trComm)}\\quad\\text{(from the matrices)} \\\\` +
      `\\Lambda &: ${hl(m.segs, 0)}\\ \\text{segments, words up to length ${MAX_LEV}},\\ \\varepsilon = ${EPS} \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  setup(ctx) {
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x020206);
    camera.near = 0.01;
    camera.far = 100;
    camera.position.set(0, 0, 5);
    ctx.controls?.target.set(0, 0, 0);
    if (ctx.controls) ctx.controls.enableRotate = false;
    ctx.controls?.update();
    const glow = createGlow(ctx, { fov: 40, strength: 0.9, threshold: 0.45, exposure: 1, vignette: 0.5 });
    const lines = createFatLines({ maxSegments: MAX_PTS / 2, width: 1.3 });
    scene.add(lines.object);
    return { glow, lines, search: makeSearch(), c: new THREE.Color(), v: new THREE.Vector3(), w: new THREE.Vector3(), fit: 2.2 };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const { lines, search, c, v, w } = state;
    const { width, height } = ctx.size;
    lines.setResolution(width, height);

    const gd = groupData(m.ta, m.tb);
    const { n } = search.run(gd.gens, gd.fixes, EPS);
    m.segs = n / 2;
    m.tab = gd.tab;
    m.trComm = gd.trComm;

    // On wide screens lay the (tall) curve on its side.
    const wide = width > height;
    const out = search.out;
    let ext = 0;
    for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(out[2 * i + 1]));

    const pal = Math.round(ctx.params.palette);
    const hueAt = (s) => {
      if (pal === 1) return c.setHSL(0.02 + 0.1 * (0.5 + 0.5 * Math.sin(TAU * s)), 0.9, 0.55);
      if (pal === 2) return c.setHSL(0.5 + 0.12 * Math.sin(TAU * s), 0.6, 0.62);
      return c.setHSL(s, 0.65, 0.6);
    };
    lines.reset();
    const shift = 0.05 * ctx.time;
    for (let i = 0; i < n; i += 2) {
      const x0 = out[2 * i], y0 = out[2 * i + 1], x1 = out[2 * i + 2], y1 = out[2 * i + 3];
      if (wide) { v.set(y0, -x0, 0); w.set(y1, -x1, 0); } else { v.set(x0, y0, 0); w.set(x1, y1, 0); }
      hueAt((i / n + shift) % 1);
      c.multiplyScalar(1.15);
      lines.push(v, w, c);
    }
    lines.commit();

    // Fit the curve to the screen (smoothly), leaving room for the equation on top.
    const halfV = THREE.MathUtils.degToRad(ctx.camera.fov / 2);
    const aspect = width / height;
    const needW = wide ? ext : 1.05;
    const needH = wide ? 1.05 : ext;
    const dist = Math.max(needH / Math.tan(halfV) / 0.6, needW / (Math.tan(halfV) * aspect) / 0.9);
    state.fit += (dist - state.fit) * Math.min(1, ctx.delta * 6);
    ctx.camera.position.set(0, 0.12 * state.fit * Math.tan(halfV), state.fit);
    ctx.controls?.target.set(0, ctx.camera.position.y, 0);
  },

  dispose(ctx, state) {
    state.glow.dispose();
    state.lines.dispose();
  },
};
