import { TAU, smooth } from '../lib/motion.js';

// A robot names a mathematical object, any object it likes, and the shape on
// screen turns into it. Then it picks another. Forever, never the same twice.
//
// One representation covers everything. Every object is a function d(x) whose
// zero set is the object:
//
//   • solids with an exact signed distance (sphere, torus, polyhedra, knots…)
//   • fractals with a distance estimate (Mandelbulb, Menger sponge, Julia…)
//   • algebraic and periodic surfaces f(x) = 0 (Clebsch cubic, Kummer, gyroid…),
//     turned into an approximate distance by d = f / |∇f| (one Newton step)
//
// and one formula turns any object A into any object B:
//
//     F_s(x) = (1 − s) d_A(x) + s d_B(x) + 4s(1 − s) φ(x)
//
// a straight-line homotopy plus a flourish φ that vanishes at both ends
// (s = 0 is exactly A, s = 1 exactly B). The flourish is chosen at random:
// a sine ripple, a gyroid lattice, a swelling, or a twist of space itself
// (x ↦ R(4s(1−s)·κ·y) x, applied before evaluating). The surface drawn is
// |F_s| = ε, a thin shell, so solids and open sheets blend alike.
//
// Uniqueness: about 45 families, most with random parameters (which torus
// knot, which power of Mandelbulb, which Julia constant, which sponge level,
// which cell size…), a random orientation, a random colour palette, a random
// flourish, a random line of robot dialogue. Each visit starts a new seed.
//
// Marching: |F| / L is a safe step if L bounds |∇F|. Exact distances have
// L = 1, f/|∇f| has L ≈ 1 near the surface, a convex combination keeps the
// larger L, the flourish adds 4s(1−s)·amp·freq·√3 (ripples) or stretches
// space by √(1 + (4s(1−s)κr)²) (twist); every step is also scaled by 0.7
// for the approximate ones. The scene is clipped to a ball of radius 1.3.
//
// Every fact the robot states about an object is true. Its opinions are its
// own. Add ?shape=<id> to the address to start from a particular object.

const SEG = 11;           // seconds per object: hold, then morph to the next
const HOLD = 6.5;
const R_CLIP = 1.3;

// --- Random numbers, deterministic per (seed, index) ---------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash2 = (a, b) => Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
const between = (rng, a, b) => a + (b - a) * rng();
const choose = (rng, list) => list[Math.floor(rng() * list.length)];
const fmt = (x, d = 2) => Number(x.toFixed(d)).toString();

// --- The catalogue --------------------------------------------------------
// kind: 'sdf' (glsl returns a distance, given p in world units) or
// 'implicit' (glsl returns f(q), q = p · scale; the shader divides by |∇f|).
// params(rng) → up to four numbers, passed to the shader as vec4 k.
const KNOTS = [[2, 3, 'the trefoil'], [2, 5, 'the cinquefoil'], [3, 4, 'the (3,4) torus knot'], [3, 5, 'the (3,5) torus knot'],
  [2, 7, 'the (2,7) torus knot'], [3, 7, 'the (3,7) torus knot'], [4, 5, 'the (4,5) torus knot'], [5, 6, 'the (5,6) torus knot'],
  [4, 2, "Solomon's knot (really a link)"], [6, 3, 'the (6,3) torus link'], [6, 4, 'the (6,4) torus link']];

const SHAPES = [
  {
    id: 'sphere', name: 'Sphere', kind: 'sdf', aliases: ['ball', 'orb', 'globe'],
    params: (r) => [between(r, 0.8, 1.1)],
    glsl: 'return length(p) - k.x;',
    latex: (k) => `x^2 + y^2 + z^2 = ${fmt(k[0] ** 2)}`,
    fact: () => 'For its surface area, it holds more than any other shape. Soap bubbles figured this out without help.',
  },
  {
    id: 'ellipsoid', name: 'Ellipsoid', kind: 'sdf', aliases: ['egg', 'rugby ball'],
    params: (r) => [between(r, 0.5, 1.2), between(r, 0.4, 1.0), between(r, 0.6, 1.2)],
    glsl: 'vec3 a = k.xyz; float k0 = length(p / a); float k1 = length(p / (a * a)); return k0 * (k0 - 1.0) / k1;',
    latex: (k) => `\\frac{x^2}{${fmt(k[0])}^2} + \\frac{y^2}{${fmt(k[1])}^2} + \\frac{z^2}{${fmt(k[2])}^2} = 1`,
    fact: () => 'Three different axes, so there are exactly four umbilic points, where it curves equally in every direction.',
  },
  {
    id: 'superellipsoid', name: 'Superellipsoid', kind: 'implicit', scale: 1.05, aliases: ['superegg', 'superquadric', 'squircle'],
    params: (r) => [choose(r, [0.8, 1.3, 2.5, 3.5, 5, 8])],
    glsl: 'float n = k.x; return pow(pow(abs(q.x), n) + pow(abs(q.y), n) + pow(abs(q.z), n), 1.0 / n) - 1.0;',
    latex: (k) => `|x|^{${fmt(k[0], 1)}} + |y|^{${fmt(k[0], 1)}} + |z|^{${fmt(k[0], 1)}} = 1`,
    fact: (k) => (k[0] === 2.5 ? 'With exponent 2.5 this is close to Piet Hein\'s superegg, which can stand on its end.' : 'Exponent 1 is an octahedron, 2 a sphere, and as it grows, a cube. Pick your favourite.'),
  },
  {
    id: 'torus', name: 'Torus', kind: 'sdf', aliases: ['donut', 'doughnut', 'bagel', 'ring', 'mug'],
    params: (r) => [between(r, 0.7, 0.9), between(r, 0.2, 0.42)],
    glsl: 'vec2 m = vec2(length(p.xz) - k.x, p.y); return length(m) - k.y;',
    latex: (k) => `\\big(\\sqrt{x^2+z^2} - ${fmt(k[0])}\\big)^2 + y^2 = ${fmt(k[1])}^2`,
    fact: () => 'Euler characteristic zero. Topologically it is a coffee mug, which is why mathematicians are bad at breakfast.',
  },
  {
    id: 'hornTorus', name: 'Horn torus', kind: 'sdf', aliases: ['horn'],
    params: () => [0.62],
    glsl: 'vec2 m = vec2(length(p.xz) - k.x, p.y); return length(m) - k.x;',
    latex: (k) => `\\big(\\sqrt{x^2+z^2} - ${fmt(k[0])}\\big)^2 + y^2 = ${fmt(k[0])}^2`,
    fact: () => 'The tube radius equals the ring radius, so the hole has shrunk to a single point. Do not drop anything in it.',
  },
  {
    id: 'cube', name: 'Cube', kind: 'sdf', aliases: ['box', 'dice', 'die', 'hexahedron', 'd6'],
    params: (r) => [between(r, 0.0, 0.12)],
    glsl: 'vec3 d = abs(p) - vec3(0.72 - k.x); return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - k.x;',
    latex: () => '\\max(|x|, |y|, |z|) = 0.72',
    fact: () => '6 faces, 12 edges, 8 vertices: 6 − 12 + 8 = 2, as Euler insisted.',
  },
  {
    id: 'tetrahedron', name: 'Tetrahedron', kind: 'sdf', aliases: ['d4', 'pyramid'],
    params: () => [0.55],
    glsl: 'float md = max(max(-p.x - p.y - p.z, p.x + p.y - p.z), max(-p.x + p.y + p.z, p.x - p.y + p.z)); return (md - k.x) / 1.7320508;',
    latex: (k) => `\\max(-x{-}y{-}z,\\ x{+}y{-}z,\\ {-x}{+}y{+}z,\\ x{-}y{+}z) = ${fmt(k[0])}`,
    fact: () => '4 faces, 6 edges, 4 vertices. The only Platonic solid that is its own dual.',
  },
  {
    id: 'octahedron', name: 'Octahedron', kind: 'sdf', aliases: ['d8', 'diamond'],
    params: () => [1.0],
    glsl: 'return (abs(p.x) + abs(p.y) + abs(p.z) - k.x) * 0.57735027;',
    latex: () => '|x| + |y| + |z| = 1',
    fact: () => '8 faces, 12 edges, 6 vertices. A cube, but every face and vertex swapped.',
  },
  {
    id: 'dodecahedron', name: 'Dodecahedron', kind: 'sdf', aliases: ['d12'],
    params: () => [0.78],
    glsl: `vec3 a = abs(p);
      vec3 n1 = normalize(vec3(0.0, 1.0, PHI)), n2 = normalize(vec3(1.0, PHI, 0.0)), n3 = normalize(vec3(PHI, 0.0, 1.0));
      return max(max(dot(a, n1), dot(a, n2)), dot(a, n3)) - k.x;`,
    latex: (k) => `\\max_i |\\mathbf n_i \\cdot \\mathbf x| = ${fmt(k[0])},\\ \\ \\mathbf n_i \\propto (0, \\pm1, \\pm\\varphi)\\ \\text{and cyclic}`,
    fact: () => '12 pentagons, 30 edges, 20 vertices. Plato assigned it to the universe. No pressure.',
  },
  {
    id: 'icosahedron', name: 'Icosahedron', kind: 'sdf', aliases: ['d20'],
    params: () => [0.8],
    glsl: `vec3 a = abs(p);
      float d = dot(a, vec3(0.57735027));
      d = max(d, dot(a, normalize(vec3(0.0, 1.0 / PHI, PHI))));
      d = max(d, dot(a, normalize(vec3(1.0 / PHI, PHI, 0.0))));
      d = max(d, dot(a, normalize(vec3(PHI, 0.0, 1.0 / PHI))));
      return d - k.x;`,
    latex: (k) => `\\max_i |\\mathbf n_i \\cdot \\mathbf x| = ${fmt(k[0])},\\ \\ \\mathbf n_i \\propto (\\pm1,\\pm1,\\pm1),\\ (0, \\pm\\varphi^{-1}, \\pm\\varphi)`,
    fact: () => '20 triangles, 30 edges, 12 vertices. A d20. Rolling it is still not a proof.',
  },
  {
    id: 'stellaOctangula', name: 'Stella octangula', kind: 'sdf', aliases: ['star', 'merkaba', 'stellated octahedron'],
    params: () => [0.5],
    glsl: `float a = max(max(-p.x - p.y - p.z, p.x + p.y - p.z), max(-p.x + p.y + p.z, p.x - p.y + p.z));
      vec3 m = -p;
      float b = max(max(-m.x - m.y - m.z, m.x + m.y - m.z), max(-m.x + m.y + m.z, m.x - m.y + m.z));
      return (min(a, b) - k.x) / 1.7320508;`,
    latex: () => 'T \\cup (-T),\\ \\ T = \\text{regular tetrahedron}',
    fact: () => 'Two tetrahedra through each other. Kepler named it; the edges make a cube.',
  },
  {
    id: 'cylinder', name: 'Cylinder', kind: 'sdf', aliases: ['can', 'tube', 'pipe'],
    params: (r) => [between(r, 0.45, 0.75), between(r, 0.6, 1.0)],
    glsl: 'vec2 d = abs(vec2(length(p.xz), p.y)) - k.xy; return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));',
    latex: (k) => `x^2 + z^2 \\le ${fmt(k[0])}^2,\\ \\ |y| \\le ${fmt(k[1])}`,
    fact: () => 'Its curved side is flat, intrinsically: unroll it and nothing stretches. The Gaussian curvature is 0.',
  },
  {
    id: 'doubleCone', name: 'Double cone', kind: 'implicit', scale: 1.0, aliases: ['cone', 'hourglass'],
    params: (r) => [between(r, 0.5, 1.0)],
    glsl: 'return q.x * q.x + q.z * q.z - k.x * q.y * q.y;',
    latex: (k) => `x^2 + z^2 = ${fmt(k[0])}\\,y^2`,
    fact: () => 'Slice it with a plane and you get a circle, ellipse, parabola or hyperbola. Apollonius wrote eight books about this.',
  },
  {
    id: 'hyperboloid1', name: 'Hyperboloid of one sheet', kind: 'implicit', scale: 1.4, aliases: ['cooling tower', 'hyperboloid'],
    params: (r) => [between(r, 0.3, 0.6)],
    glsl: 'return q.x * q.x + q.z * q.z - q.y * q.y - k.x;',
    latex: (k) => `x^2 + z^2 - y^2 = ${fmt(k[0])}`,
    fact: () => 'Doubly ruled: it is made entirely of straight lines, two through every point. That is why cooling towers use it.',
  },
  {
    id: 'hyperboloid2', name: 'Hyperboloid of two sheets', kind: 'implicit', scale: 1.4, aliases: [],
    params: (r) => [between(r, 0.2, 0.5)],
    glsl: 'return q.x * q.x + q.z * q.z - q.y * q.y + k.x;',
    latex: (k) => `x^2 + z^2 - y^2 = -${fmt(k[0])}`,
    fact: () => 'Two pieces that never touch. Each sheet, with the right distance, is a model of the hyperbolic plane.',
  },
  {
    id: 'saddle', name: 'Hyperbolic paraboloid', kind: 'implicit', scale: 1.3, aliases: ['saddle', 'pringle', 'pringles'],
    params: (r) => [between(r, 0.6, 1.2)],
    glsl: 'return q.y - k.x * (q.x * q.x - q.z * q.z);',
    latex: (k) => `y = ${fmt(k[0])}\\,(x^2 - z^2)`,
    fact: () => 'Also doubly ruled, also curved. Also a Pringle, which is the only reason anyone remembers it.',
  },
  {
    id: 'whitney', name: 'Whitney umbrella', kind: 'implicit', scale: 1.4, aliases: ['umbrella'],
    params: () => [1],
    glsl: 'return q.x * q.x - q.y * q.y * q.z;',
    latex: () => 'x^2 = y^2 z',
    fact: () => 'The whole z-axis satisfies the equation, so below the origin there is a bare stick, too thin for me to draw. I tried.',
  },
  {
    id: 'dingDong', name: 'Ding-dong surface', kind: 'implicit', scale: 1.5, upright: true, aliases: ['ding dong', 'bell'],
    params: () => [1],
    glsl: 'return q.x * q.x + q.z * q.z - (1.0 - q.y) * q.y * q.y;',
    latex: () => 'x^2 + z^2 = (1 - y)\\,y^2',
    fact: () => 'Yes, that is its real name. It is in the literature.',
  },
  {
    id: 'tooth', name: 'Tooth surface', kind: 'implicit', scale: 1.45, aliases: ['tooth', 'molar'],
    params: () => [1],
    glsl: 'return q.x*q.x*q.x*q.x + q.y*q.y*q.y*q.y + q.z*q.z*q.z*q.z - dot(q, q);',
    latex: () => 'x^4 + y^4 + z^4 = x^2 + y^2 + z^2',
    fact: () => 'It looks like a tooth. That is the entire reason for the name. Mathematicians are not poets.',
  },
  {
    id: 'heart', name: 'Heart surface', kind: 'implicit', scale: 1.05, upright: true, aliases: ['heart', 'love'],
    params: () => [1],
    // z is up in the usual equation; here y is up.
    glsl: 'float x = q.x, y = q.z, z = q.y; float a = x*x + 2.25*y*y + z*z - 1.0; return a*a*a - x*x*z*z*z - 0.1125*y*y*z*z*z;',
    latex: () => '\\big(x^2 + \\tfrac94 z^2 + y^2 - 1\\big)^3 = x^2 y^3 + \\tfrac{9}{80} z^2 y^3',
    fact: () => 'A sextic surface. It has no feelings, but it has degree 6.',
  },
  {
    id: 'genus2', name: 'Double torus', kind: 'implicit', scale: 0.92, aliases: ['genus 2', 'genus two', 'pretzel', 'two holes'],
    params: () => [0.03],
    glsl: 'float u = q.x + 1.0; float a = u * (u - 1.0) * (u - 1.0) * (u - 2.0) + q.y * q.y; return a * a + q.z * q.z - k.x;',
    latex: (k) => `\\big(x(x{-}1)^2(x{-}2) + y^2\\big)^2 + z^2 = ${fmt(k[0])}\\ \\ (x \\to x{+}1)`,
    fact: () => 'Genus 2: two holes. Euler characteristic 2 − 2·2 = −2.',
  },
  {
    id: 'klein', name: 'Klein bottle', kind: 'implicit', scale: 2.7, aliases: ['klein', 'bottle'],
    params: () => [1],
    glsl: `float x = q.x, y = q.y, z = q.z; float r = dot(q, q);
      float a = r - 2.0 * y - 1.0;
      return (r + 2.0 * y - 1.0) * (a * a - 8.0 * z * z) + 16.0 * x * z * a;`,
    latex: () => '(\\lvert\\mathbf x\\rvert^2{+}2y{-}1)\\big[(\\lvert\\mathbf x\\rvert^2{-}2y{-}1)^2 - 8z^2\\big] + 16xz(\\lvert\\mathbf x\\rvert^2{-}2y{-}1) = 0',
    fact: () => 'The figure-8 immersion. It has no inside, so please do not try to fill it.',
  },
  {
    id: 'roman', name: 'Roman surface', kind: 'implicit', scale: 0.42, aliases: ['steiner', 'steiner surface', 'roman'],
    params: () => [1],
    glsl: 'return q.x*q.x*q.y*q.y + q.y*q.y*q.z*q.z + q.z*q.z*q.x*q.x - q.x*q.y*q.z;',
    latex: () => 'x^2y^2 + y^2z^2 + z^2x^2 = xyz',
    fact: () => 'Jakob Steiner found it while in Rome, in 1844. It is the real projective plane, squashed into 3D.',
  },
  {
    id: 'cayley', name: 'Cayley nodal cubic', kind: 'implicit', scale: 1.0, aliases: ['cayley'],
    params: () => [1],
    glsl: 'return 4.0 * dot(q, q) + 16.0 * q.x * q.y * q.z - 1.0;',
    latex: () => '4(x^2 + y^2 + z^2) + 16xyz = 1',
    fact: () => 'Four singular points, at (½, ½, −½) and friends: the most a cubic surface can have.',
  },
  {
    id: 'clebsch', name: 'Clebsch diagonal cubic', kind: 'implicit', scale: 1.15, aliases: ['clebsch', '27 lines'],
    params: () => [1],
    glsl: `float x = q.x, y = q.y, z = q.z;
      return 81.0*(x*x*x + y*y*y + z*z*z) - 189.0*(x*x*y + x*x*z + y*y*x + y*y*z + z*z*x + z*z*y)
        + 54.0*x*y*z + 126.0*(x*y + y*z + z*x) - 9.0*(x*x + y*y + z*z) - 9.0*(x + y + z) + 1.0;`,
    latex: () => '81\\textstyle\\sum x^3 - 189\\sum x^2 y + 54xyz + 126\\sum xy - 9\\sum x^2 - 9\\sum x + 1 = 0',
    fact: () => 'Every smooth cubic surface contains exactly 27 straight lines. On this one, all 27 are real. I counted.',
  },
  {
    id: 'kummer', name: 'Kummer surface', kind: 'implicit', scale: 1.6, aliases: ['kummer'],
    params: (r) => [between(r, 1.1, 1.55)],
    glsl: `float m2 = k.x * k.x; float l = (3.0 * m2 - 1.0) / (3.0 - m2); float s = 1.4142136;
      float a = dot(q, q) - m2;
      return a * a - l * (1.0 - q.z - s * q.x) * (1.0 - q.z + s * q.x) * (1.0 + q.z + s * q.y) * (1.0 + q.z - s * q.y);`,
    latex: (k) => `(x^2{+}y^2{+}z^2 - ${fmt(k[0] ** 2)})^2 = \\lambda\\, pqrs,\\ \\ \\lambda = \\tfrac{3\\mu^2 - 1}{3 - \\mu^2}`,
    fact: () => 'Sixteen singular points, the most a quartic surface can have. Kummer, 1864.',
  },
  {
    id: 'barth', name: 'Barth sextic', kind: 'implicit', scale: 1.45, aliases: ['barth'],
    params: () => [1],
    glsl: `float p2 = PHI * PHI; float x2 = q.x*q.x, y2 = q.y*q.y, z2 = q.z*q.z; float r = x2 + y2 + z2 - 1.0;
      return 4.0 * (p2*x2 - y2) * (p2*y2 - z2) * (p2*z2 - x2) - (1.0 + 2.0*PHI) * r * r;`,
    latex: () => '4(\\varphi^2x^2 - y^2)(\\varphi^2y^2 - z^2)(\\varphi^2z^2 - x^2) = (1+2\\varphi)(x^2{+}y^2{+}z^2{-}1)^2',
    fact: () => '65 singular points, the most a sextic can have. Wolf Barth, 1996. The golden ratio is doing a lot of work here.',
  },
  {
    id: 'chmutov', name: 'Chebyshev surface', kind: 'implicit', scale: 0.8, aliases: ['chmutov', 'chebyshev'],
    params: (r) => [choose(r, [4, 5, 6, 8])],
    glsl: 'vec3 c = clamp(q, -1.0, 1.0); vec3 t = cos(k.x * acos(c)); return t.x + t.y + t.z + 0.5 * dot(q - c, q - c);',
    latex: (k) => `T_{${k[0]}}(x) + T_{${k[0]}}(y) + T_{${k[0]}}(z) = 0,\\ \\ T_n(\\cos\\theta) = \\cos n\\theta`,
    fact: () => 'Built from Chebyshev polynomials, which wiggle as much as a polynomial can. Chmutov used them to pack in singular points.',
  },
  {
    id: 'tanglecube', name: 'Tanglecube', kind: 'implicit', scale: 2.0, aliases: ['goursat', 'tangle'],
    params: () => [11.8],
    glsl: 'vec3 a = q * q; return dot(a, a) - 5.0 * (a.x + a.y + a.z) + k.x;',
    latex: () => 'x^4 - 5x^2 + y^4 - 5y^2 + z^4 - 5z^2 + 11.8 = 0',
    fact: () => 'A Goursat surface: a cube that has been thinking about becoming a sphere with holes.',
  },
  {
    id: 'cyclide', name: 'Dupin cyclide', kind: 'implicit', scale: 2.2, upright: true, aliases: ['cyclide', 'dupin'],
    // A ring cyclide needs c < μ ≤ a, with c² = a² − b².
    // b close to a keeps the two sides of the tube similar in thickness.
    params: (r) => {
      const b = between(r, 0.92, 0.97);
      const c = Math.sqrt(1 - b * b);
      return [1, b, between(r, c + 0.15, c + 0.45)];
    },
    glsl: `float a = k.x, b = k.y, mu = k.z; float c = sqrt(a*a - b*b);
      q.x += 0.31;   // centre the hole (at x ≈ 0.31 for typical b, μ)
      float s = dot(q, q) + b*b - mu*mu;
      return s*s - 4.0*(a*q.x - c*mu)*(a*q.x - c*mu) - 4.0*b*b*q.y*q.y;`,
    latex: (k) => `(\\lvert\\mathbf x\\rvert^2 + b^2 - \\mu^2)^2 = 4(ax - c\\mu)^2 + 4b^2y^2,\\ \\ b = ${fmt(k[1])},\\ \\mu = ${fmt(k[2])}`,
    fact: () => 'Every line of curvature on it is a circle. A torus that has been to the gym on one side only.',
  },
  {
    id: 'torusKnot', name: 'Torus knot', kind: 'sdf', aliases: ['knot', 'trefoil', 'cinquefoil', 'solomon', 'torus link'],
    params: (r) => {
      const [p, q] = choose(r, KNOTS);
      return [p, q, between(r, 0.08, 0.13)];
    },
    glsl: `float phi = atan(p.z, p.x); vec2 m = vec2(length(p.xz) - 0.78, p.y);
      float d = 1e9;
      for (int j = 0; j < 8; j++) {
        if (float(j) >= k.x) break;
        float th = (k.y * phi + 6.2831853 * float(j)) / k.x;
        d = min(d, length(m - 0.36 * vec2(cos(th), sin(th))));
      }
      return (d - k.z) * 0.6;`,
    latex: (k) => `\\mathbf c(t) = \\big((0.78 + 0.36\\cos ${k[1]}t)\\cos ${k[0]}t,\\ 0.36\\sin ${k[1]}t,\\ (0.78 + 0.36\\cos ${k[1]}t)\\sin ${k[0]}t\\big)`,
    fact: (k) => {
      const entry = KNOTS.find(([p, q]) => p === k[0] && q === k[1]);
      return `This one is ${entry[2]}: ${k[0]} times round the hole, ${k[1]} times through it.`;
    },
  },
  {
    id: 'hopfLink', name: 'Hopf link', kind: 'sdf', aliases: ['hopf', 'chain', 'two rings', 'linked rings'],
    params: (r) => [between(r, 0.1, 0.16)],
    glsl: `vec3 a = p + vec3(0.36, 0.0, 0.0); vec3 b = p - vec3(0.36, 0.0, 0.0);
      float d1 = length(vec2(length(a.xy) - 0.62, a.z)) - k.x;
      float d2 = length(vec2(length(b.xz) - 0.62, b.y)) - k.x;
      return min(d1, d2);`,
    latex: () => '\\text{two circles of radius } 0.62,\\ \\text{centres } 0.72 \\text{ apart, at right angles}',
    fact: () => 'Two circles linked once: linking number 1. The simplest link that is not a pair of unlinked circles.',
  },
  {
    id: 'borromean', name: 'Borromean rings', kind: 'sdf', aliases: ['borromean', 'three rings'],
    params: (r) => [between(r, 0.07, 0.11)],
    glsl: `vec2 ab = vec2(1.0, 0.5);
      float e1 = (length(p.xy / ab) - 1.0) * 0.5; float d1 = length(vec2(e1, p.z)) - k.x;
      float e2 = (length(p.yz / ab) - 1.0) * 0.5; float d2 = length(vec2(e2, p.x)) - k.x;
      float e3 = (length(p.zx / ab) - 1.0) * 0.5; float d3 = length(vec2(e3, p.y)) - k.x;
      return min(d1, min(d2, d3));`,
    latex: () => 'x^2 + \\tfrac{y^2}{0.25} = 1,\\ \\ y^2 + \\tfrac{z^2}{0.25} = 1,\\ \\ z^2 + \\tfrac{x^2}{0.25} = 1',
    fact: () => 'No two of them are linked, but all three together are. Remove any one and the rest fall apart.',
  },
  {
    id: 'menger', name: 'Menger sponge', kind: 'sdf', aliases: ['menger', 'sponge'],
    params: (r) => [choose(r, [2, 3, 4])],
    glsl: `vec3 x = p / 0.8;
      vec3 d0 = abs(x) - vec3(1.0);
      float d = length(max(d0, 0.0)) + min(max(d0.x, max(d0.y, d0.z)), 0.0);
      float s = 1.0;
      for (int m = 0; m < 4; m++) {
        if (float(m) >= k.x) break;
        vec3 a = mod(x * s, 2.0) - 1.0; s *= 3.0;
        vec3 r = abs(1.0 - 3.0 * abs(a));
        float c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s;
        d = max(d, c);
      }
      return d * 0.8;`,
    latex: (k) => `\\text{level } ${k[0]}:\\ \\text{keep } 20 \\text{ of the } 27 \\text{ sub-cubes, ${k[0]} times}`,
    fact: (k) => `Dimension log 20 / log 3 = 2.727. In the limit: zero volume, infinite surface area. This is level ${k[0]}; I have a deadline.`,
  },
  {
    id: 'sierpinski', name: 'Sierpinski tetrahedron', kind: 'sdf', aliases: ['sierpinski', 'tetrix'],
    params: (r) => [choose(r, [3, 4, 5, 6])],
    glsl: `vec3 z = p / 0.75; float s = 1.0;
      for (int i = 0; i < 6; i++) {
        if (float(i) >= k.x) break;
        if (z.x + z.y < 0.0) z.xy = -z.yx;
        if (z.x + z.z < 0.0) z.xz = -z.zx;
        if (z.y + z.z < 0.0) z.zy = -z.yz;
        z = z * 2.0 - vec3(1.0); s *= 2.0;
      }
      float md = max(max(-z.x - z.y - z.z, z.x + z.y - z.z), max(-z.x + z.y + z.z, z.x - z.y + z.z));
      return (md - 1.0) / 1.7320508 / s * 0.75;`,
    latex: (k) => `T = \\bigcup_{i=1}^{4} \\big(\\tfrac12 T + \\tfrac12 \\mathbf v_i\\big),\\ \\ \\text{level } ${k[0]}`,
    fact: () => 'Four half-size copies of itself, so its dimension is log 4 / log 2 = exactly 2. A 3D object that is secretly 2D.',
  },
  {
    id: 'mandelbulb', name: 'Mandelbulb', kind: 'sdf', aliases: ['mandelbulb', 'mandelbrot'],
    params: (r) => [choose(r, [3, 4, 5, 6, 7, 8, 9])],
    glsl: `vec3 z = p / 1.1; vec3 c = z; float dr = 1.0, r = 0.0, n = k.x;
      for (int i = 0; i < 8; i++) {
        r = length(z); if (r > 2.0) break;
        float th = acos(clamp(z.y / max(r, 1e-6), -1.0, 1.0)) * n;
        float ph = atan(z.x, z.z) * n;
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        z = pow(r, n) * vec3(sin(th) * sin(ph), cos(th), sin(th) * cos(ph)) + c;
      }
      return 0.5 * log(max(r, 1e-6)) * r / dr * 1.1;`,
    latex: (k) => `\\mathbf z \\mapsto \\mathbf z^{${k[0]}} + \\mathbf c\\ \\ (\\text{spherical power: } r^{${k[0]}},\\ ${k[0]}\\theta,\\ ${k[0]}\\varphi)`,
    fact: () => 'Daniel White and Paul Nylander, 2009. There is no true 3D Mandelbrot set, so this is the closest anyone has got.',
  },
  {
    id: 'julia', name: 'Quaternion Julia set', kind: 'sdf', aliases: ['julia', 'quaternion'],
    // c = 0.45 cos(v + τw) − (0.3, 0, 0, 0): a family that gives solid, connected sets.
    params: (r) => {
      const tau = between(r, 0, 20);
      return [[0.5, 1.2], [3.9, 1.7], [1.4, 1.3], [1.1, 2.5]].map(([v, w], i) => 0.45 * Math.cos(v + tau * w) - (i === 0 ? 0.3 : 0));
    },
    glsl: `vec4 z = vec4(p / 1.0, 0.0); float md2 = 1.0, mz2 = dot(z, z);
      for (int i = 0; i < 11; i++) {
        md2 *= 4.0 * mz2;
        z = vec4(z.x * z.x - dot(z.yzw, z.yzw), 2.0 * z.x * z.yzw) + k;
        mz2 = dot(z, z); if (mz2 > 4.0) break;
      }
      return 0.25 * sqrt(mz2 / md2) * log(mz2) * 0.6;`,
    latex: (k) => `q \\mapsto q^2 + c,\\ \\ c = ${fmt(k[0])} ${k[1] < 0 ? '' : '+'}${fmt(k[1])}i ${k[2] < 0 ? '' : '+'}${fmt(k[2])}j ${k[3] < 0 ? '' : '+'}${fmt(k[3])}k`,
    fact: () => 'A 3D slice of a 4D fractal. You are seeing one quarter of the dimensions. You are welcome.',
  },
  {
    id: 'gyroid', name: 'Gyroid', kind: 'implicit', scale: 3.4, aliases: ['gyroid'],
    params: (r) => [between(r, 2.6, 4.2)],
    glsl: 'vec3 x = q * k.x / 3.4; return sin(x.x)*cos(x.y) + sin(x.y)*cos(x.z) + sin(x.z)*cos(x.x);',
    latex: (k) => `\\sin\\omega x\\cos\\omega y + \\sin\\omega y\\cos\\omega z + \\sin\\omega z\\cos\\omega x = 0,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Alan Schoen, 1970, at NASA. Butterflies had already been using it in their wing scales for some time.',
  },
  {
    id: 'schwarzP', name: 'Schwarz P surface', kind: 'implicit', scale: 3.4, aliases: ['schwarz', 'schwarz p', 'plumber'],
    params: (r) => [between(r, 2.6, 4.2)],
    glsl: 'vec3 x = q * k.x / 3.4; return cos(x.x) + cos(x.y) + cos(x.z);',
    latex: (k) => `\\cos\\omega x + \\cos\\omega y + \\cos\\omega z = 0,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Hermann Schwarz, 1865. It splits space into two identical, interlocking halves.',
  },
  {
    id: 'schwarzD', name: 'Schwarz D surface', kind: 'implicit', scale: 3.4, aliases: ['diamond surface', 'schwarz d'],
    params: (r) => [between(r, 2.6, 4.0)],
    glsl: `vec3 x = q * k.x / 3.4; vec3 s = sin(x), c = cos(x);
      return s.x*s.y*s.z + s.x*c.y*c.z + c.x*s.y*c.z + c.x*c.y*s.z;`,
    latex: (k) => '\\textstyle\\sin\\sin\\sin + \\sin\\cos\\cos + \\cos\\sin\\cos + \\cos\\cos\\sin = 0' + `,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'The D is for diamond: its two labyrinths are shaped like the carbon bonds in a diamond.',
  },
  {
    id: 'neovius', name: 'Neovius surface', kind: 'implicit', scale: 3.4, aliases: ['neovius'],
    params: (r) => [between(r, 2.6, 4.0)],
    glsl: 'vec3 x = q * k.x / 3.4; vec3 c = cos(x); return 3.0 * (c.x + c.y + c.z) + 4.0 * c.x * c.y * c.z;',
    latex: (k) => `3(\\cos\\omega x + \\cos\\omega y + \\cos\\omega z) + 4\\cos\\omega x\\cos\\omega y\\cos\\omega z = 0,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Edvard Neovius, a student of Schwarz, 1883. The family business.',
  },
  {
    id: 'iwp', name: 'I-WP surface', kind: 'implicit', scale: 3.4, aliases: ['iwp', 'i-wp'],
    params: (r) => [between(r, 2.4, 3.6)],
    glsl: `vec3 x = q * k.x / 3.4; vec3 c = cos(x);
      return 2.0 * (c.x*c.y + c.y*c.z + c.z*c.x) - (cos(2.0*x.x) + cos(2.0*x.y) + cos(2.0*x.z));`,
    latex: (k) => `2(\\cos x\\cos y + \\cos y\\cos z + \\cos z\\cos x) = \\cos 2x + \\cos 2y + \\cos 2z,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Another of Alan Schoen\'s, named after the two lattices it separates, I and WP. He was not great at names either.',
  },
  {
    id: 'lidinoid', name: 'Lidinoid', kind: 'implicit', scale: 3.4, aliases: ['lidinoid'],
    params: (r) => [between(r, 2.0, 3.0)],
    glsl: `vec3 x = q * k.x / 3.4; vec3 s = sin(x), c = cos(x), s2 = sin(2.0 * x), c2 = cos(2.0 * x);
      return 0.5 * (s2.x*c.y*s.z + s2.y*c.z*s.x + s2.z*c.x*s.y) - 0.5 * (c2.x*c2.y + c2.y*c2.z + c2.z*c2.x) + 0.15;`,
    latex: (k) => `\\tfrac12\\textstyle\\sum \\sin 2x\\cos y\\sin z - \\tfrac12\\sum\\cos 2x\\cos 2y + 0.15 = 0,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Sven Lidin, 1990. A relative of the gyroid, with even more twisting. Formula shown is the standard approximation.',
  },
  {
    id: 'fischerKoch', name: 'Fischer–Koch S surface', kind: 'implicit', scale: 3.4, aliases: ['fischer koch', 'fischer-koch'],
    params: (r) => [between(r, 2.0, 3.0)],
    glsl: `vec3 x = q * k.x / 3.4; vec3 s = sin(x), c = cos(x), c2 = cos(2.0 * x);
      return c2.x*s.y*c.z + c.x*c2.y*s.z + s.x*c.y*c2.z;`,
    latex: (k) => `\\cos 2x\\sin y\\cos z + \\cos x\\cos 2y\\sin z + \\sin x\\cos y\\cos 2z = 0,\\ \\ \\omega = ${fmt(k[0])}`,
    fact: () => 'Werner Fischer and Elke Koch, 1987. Crystallographers, which is why it is so tidy.',
  },
];

const FLOURISHES = [
  { name: 'nothing fancy', latex: () => '0', amp: () => 0 },
  { name: 'a sine ripple', latex: (a, f) => `${fmt(a)}\\sin ${fmt(f, 1)}x\\,\\sin ${fmt(f, 1)}y\\,\\sin ${fmt(f, 1)}z` },
  { name: 'a gyroid lattice', latex: (a, f) => `${fmt(a)}\\,(\\sin ${fmt(f, 1)}x\\cos ${fmt(f, 1)}y + \\dots)` },
  { name: 'a twist of space', latex: (a) => `0,\\ \\ \\mathbf x \\mapsto R_y\\big(4s(1{-}s)\\cdot ${fmt(a)}\\,y\\big)\\,\\mathbf x` },
  { name: 'a swelling', latex: (a) => `-${fmt(a)}` },
];

const INTROS = [
  'I have chosen: {name}.',
  'Next object: {name}. I picked it at random, which is the same as picking it with confidence.',
  '{name}. You are welcome.',
  'Behold: {name}.',
  'Today I am thinking about {name}. Tomorrow, something else. It is a good life.',
  'Ah yes, {name}. A classic. I have known about it for 0.4 seconds.',
  'Presenting {name}, no relation to the previous object.',
];
const MORPHS = [
  'Turning it into {next}, via {flourish}. This is legal.',
  'Interpolating to {next}. Please keep your hands inside the homotopy.',
  'Now {next}. I am using {flourish}, for drama.',
  '(1 − s) of this, s of {next}. Easy.',
];

// --- Which object is shown at index k ------------------------------------
let seed = (Math.random() * 2 ** 32) >>> 0;
const overrides = new Map();
const cache = new Map();

function baseType(k) {
  return Math.floor(mulberry32(hash2(seed, k))() * SHAPES.length);
}
function typeAt(k) {
  if (overrides.has(k)) return overrides.get(k);
  let t = baseType(k);
  const prev = overrides.has(k - 1) ? overrides.get(k - 1) : baseType(k - 1);
  if (t === prev) t = (t + 1) % SHAPES.length;
  return t;
}
function randomRotation(rng) {
  // A random axis and angle, as a 3×3 matrix (column-major, for GLSL).
  const u = rng() * 2 - 1;
  const th = rng() * TAU;
  const s = Math.sqrt(1 - u * u);
  const [x, y, z] = [s * Math.cos(th), u, s * Math.sin(th)];
  const a = between(rng, -0.6, 0.6);
  const c = Math.cos(a);
  const n = Math.sin(a);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y + n * z, t * x * z - n * y,
    t * x * y - n * z, t * y * y + c, t * y * z + n * x,
    t * x * z + n * y, t * y * z - n * x, t * z * z + c,
  ];
}
function pick(k) {
  if (cache.has(k)) return cache.get(k);
  const type = typeAt(k);
  const rng = mulberry32(hash2(seed ^ 0x5bd1e995, k));
  const shape = SHAPES[type];
  const k4 = [0, 0, 0, 0];
  shape.params(rng).forEach((v, i) => (k4[i] = v));
  const fl = Math.floor(rng() * FLOURISHES.length);
  const entry = {
    type,
    shape,
    k: k4,
    rot: shape.upright ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : randomRotation(rng),
    palette: [rng(), rng(), rng(), between(rng, 0.6, 1.4)],
    flourish: fl,
    amp: fl === 0 ? 0 : fl === 3 ? between(rng, 1.2, 2.6) : fl === 4 ? between(rng, 0.12, 0.25) : between(rng, 0.06, 0.14),
    freq: between(rng, 3, 7),
    intro: capitalise(choose(rng, INTROS).replace('{name}', spoken(shape))),
    morph: choose(rng, MORPHS),
  };
  cache.set(k, entry);
  return entry;
}

// How the robot says a name mid-sentence: proper names keep their capital.
const PROPER = /^(Klein|Roman|Cayley|Clebsch|Kummer|Barth|Chebyshev|Dupin|Hopf|Borromean|Menger|Sierpinski|Mandelbulb|Schwarz|Neovius|I-WP|Lidinoid|Fischer|Whitney|Stella|Ding)/;
const capitalise = (t) => t[0].toUpperCase() + t.slice(1);
const spoken = (shape) => `the ${PROPER.test(shape.name) ? shape.name : shape.name[0].toLowerCase() + shape.name.slice(1)}`;

// Looks up a typed request: an id, a name or an alias, else nothing.
function findShape(text) {
  const t = text.trim().toLowerCase();
  if (!t) return -1;
  let i = SHAPES.findIndex((s) => s.id.toLowerCase() === t || s.name.toLowerCase() === t || s.aliases.includes(t));
  if (i === -1) i = SHAPES.findIndex((s) => s.name.toLowerCase().includes(t) || s.aliases.some((a) => a.includes(t) || t.includes(a)));
  return i;
}

// --- The shader ------------------------------------------------------------
const objectFns = SHAPES.map((s, i) =>
  s.kind === 'sdf'
    ? `float obj${i}(vec3 p, vec4 k) { ${s.glsl} }`
    : `float imp${i}(vec3 q, vec4 k) { ${s.glsl} }
       float obj${i}(vec3 p, vec4 k) {
         const float S = ${s.scale.toFixed(4)};
         vec3 q = p * S;
         const float e = 0.002;
         float f1 = imp${i}(q + vec3( e, -e, -e), k), f2 = imp${i}(q + vec3(-e, -e,  e), k);
         float f3 = imp${i}(q + vec3(-e,  e, -e), k), f4 = imp${i}(q + vec3( e,  e,  e), k);
         vec3 g = (vec3(1, -1, -1) * f1 + vec3(-1, -1, 1) * f2 + vec3(-1, 1, -1) * f3 + vec3(1, 1, 1) * f4) / (4.0 * e);
         return 0.25 * (f1 + f2 + f3 + f4) / max(length(g), 1e-4) / S;
       }`
).join('\n');
const dispatch = SHAPES.map((s, i) => `if (id == ${i}) return obj${i}(p, k);`).join('\n    ');

const FRAG = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform int uA;
  uniform int uB;
  uniform vec4 uKA;
  uniform vec4 uKB;
  uniform mat3 uRA;
  uniform mat3 uRB;
  uniform vec4 uPalA;
  uniform vec4 uPalB;
  uniform float uS;
  uniform int uFl;
  uniform float uAmp;
  uniform float uFreq;
  uniform float uSafety;
  varying vec2 vUv;

  const float PHI = 1.618033988749895;
  const float R_CLIP = ${R_CLIP.toFixed(2)};

  ${objectFns}

  float shape(int id, vec3 p, vec4 k) {
    ${dispatch}
    return length(p) - 1.0;
  }

  float bump() { return 4.0 * uS * (1.0 - uS); }

  vec3 warp(vec3 p) {
    if (uFl != 3) return p;
    float a = bump() * uAmp * p.y;
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  }

  float flourish(vec3 p) {
    float w = bump() * uAmp;
    if (uFl == 1) return w * sin(uFreq * p.x) * sin(uFreq * p.y) * sin(uFreq * p.z);
    if (uFl == 2) { vec3 x = uFreq * p; return w * (sin(x.x) * cos(x.y) + sin(x.y) * cos(x.z) + sin(x.z) * cos(x.x)) / 1.5; }
    if (uFl == 4) return -w;
    return 0.0;
  }

  // F_s, the blended field.
  float field(vec3 p) {
    vec3 x = warp(p);
    float a = uS < 0.999 ? shape(uA, uRA * x, uKA) : 0.0;
    float b = uS > 0.001 ? shape(uB, uRB * x, uKB) : 0.0;
    return mix(a, b, uS) + flourish(x);
  }

  // The drawn surface: a thin shell |F| = ε, clipped to a ball.
  float scene(vec3 p) {
    return max(abs(field(p)) - 0.008, length(p) - R_CLIP);
  }

  vec3 normalAt(vec3 p) {
    const float e = 0.0015;
    vec2 h = vec2(1.0, -1.0);
    return normalize(h.xyy * scene(p + h.xyy * e) + h.yyx * scene(p + h.yyx * e)
                   + h.yxy * scene(p + h.yxy * e) + h.xxx * scene(p + h.xxx * e));
  }

  vec3 palette(vec4 pal, float t) {
    return 0.5 + 0.42 * cos(6.2831853 * (pal.w * t + pal.xyz));
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    // Keep the whole ball in view on tall screens.
    float zoom = max(1.0, 1.25 / (uResolution.x / uResolution.y));
    vec3 ro = vec3(0.0, 1.3, 4.1) * zoom;
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 2.1 + uv.x * rt + uv.y * up);
    // Shift the subject left on wide screens, out from under the equation.
    if (uResolution.x > 1.3 * uResolution.y) ro -= rt * 0.55;

    vec3 bg = mix(vec3(0.018, 0.02, 0.035), vec3(0.05, 0.045, 0.08), clamp(0.6 - 0.5 * uv.y, 0.0, 1.0));
    vec3 col = bg;

    // March from where the ray enters the clipping ball.
    float bq = dot(ro, rd), cq = dot(ro, ro) - R_CLIP * R_CLIP, disc = bq * bq - cq;
    if (disc > 0.0) {
      float t = max(0.0, -bq - sqrt(disc));
      float tEnd = -bq + sqrt(disc);
      bool hit = false;
      int steps = 0;
      for (int i = 0; i < 180; i++) {
        steps = i;
        float d = scene(ro + rd * t);
        if (d < 0.0012) { hit = true; break; }
        t += clamp(d * uSafety, 0.001, 0.25);
        if (t > tEnd) break;
      }
      if (hit) {
        vec3 p = ro + rd * t;
        vec3 n = normalAt(p);
        if (dot(n, rd) > 0.0) n = -n;
        float tc = 0.35 * dot(n, vec3(0.3, 0.8, 0.5)) + 0.45 * length(p) + 0.15 * p.y;
        vec3 base = mix(palette(uPalA, tc), palette(uPalB, tc), smoothstep(0.0, 1.0, uS));
        vec3 l = normalize(vec3(-0.5, 0.9, 0.6));
        float diff = max(dot(n, l), 0.0);
        float fill = 0.5 + 0.5 * n.y;
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 40.0);
        // Ambient occlusion: how open the space is just off the surface.
        float ao = 0.0;
        for (int j = 1; j <= 4; j++) {
          float h = 0.04 * float(j);
          ao += (h - scene(p + n * h)) / h;
        }
        ao = clamp(1.0 - 0.3 * ao, 0.25, 1.0) * (1.0 - 0.4 * float(steps) / 180.0);
        col = base * (0.18 + 0.75 * diff + 0.22 * fill) * ao + 0.25 * spec + 0.18 * rim * base;
        col = mix(col, bg, smoothstep(0.85, 1.0, length(p) / R_CLIP) * 0.3);
      }
    }
    // Gentle tone curve: never blown out.
    col = col / (1.0 + 0.35 * col);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- The robot, a speech bubble in the corner --------------------------------
const ROBOT_SVG = `
  <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
    <rect x="30" y="2" width="4" height="10" rx="2" fill="#e8b84a"/>
    <circle cx="32" cy="4" r="4" fill="#ffd166" class="rb-bulb"/>
    <rect x="8" y="12" width="48" height="42" rx="10" fill="#ffd166" stroke="#8a6414" stroke-width="2"/>
    <circle cx="23" cy="30" r="5" fill="#2a1a05"/><circle cx="41" cy="30" r="5" fill="#2a1a05"/>
    <circle cx="24.5" cy="28.5" r="1.6" fill="#fff"/><circle cx="42.5" cy="28.5" r="1.6" fill="#fff"/>
    <rect class="rb-mouth" x="22" y="41" width="20" height="4" rx="2" fill="#2a1a05"/>
  </svg>`;

function createRobot() {
  const el = document.createElement('div');
  el.className = 'shape-robot';
  el.innerHTML = `${ROBOT_SVG}<div class="shape-robot-bubble"><span></span></div>`;
  const style = document.createElement('style');
  style.textContent = `
    .shape-robot { position: fixed; left: 16px; bottom: 96px; z-index: 14; display: flex; align-items: flex-end; gap: 8px;
      max-width: min(420px, calc(100vw - 32px)); pointer-events: none; }
    .shape-robot svg { flex: none; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }
    .shape-robot-bubble { background: rgba(14, 15, 22, 0.88); color: #eef1f7; border: 1px solid rgba(255,255,255,0.14);
      border-radius: 14px 14px 14px 4px; padding: 9px 12px; font: 14px/1.4 system-ui, sans-serif; min-height: 1.4em; }
    .shape-robot.talking .rb-mouth { animation: rb-talk 0.16s infinite alternate; transform-origin: 32px 43px; }
    @keyframes rb-talk { to { transform: scaleY(2.2); } }
    body[data-view='clean'] .shape-robot, body[data-view='equation'] .shape-robot, .shape-robot.away { display: none; }
    @media (pointer: coarse) { .shape-robot { bottom: 150px; } .shape-robot-bubble { font-size: 13px; } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(el);
  const text = el.querySelector('span');
  let timer = null;
  return {
    say(line, voice) {
      clearInterval(timer);
      let i = 0;
      el.classList.add('talking');
      text.textContent = '';
      timer = setInterval(() => {
        i += 2;
        text.textContent = line.slice(0, i);
        if (i >= line.length) {
          clearInterval(timer);
          el.classList.remove('talking');
        }
      }, 40);
      if (voice && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(line.replace(/[()]/g, ''));
        u.pitch = 0.4;
        u.rate = 1.05;
        speechSynthesis.speak(u);
      }
    },
    // Only on a sketch's own page, not over the landing page or a profile.
    setAway(away) {
      el.classList.toggle('away', away);
    },
    dispose() {
      clearInterval(timer);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      el.remove();
      style.remove();
    },
  };
}

// Where to jump so the next object starts transforming now.
function jumpTarget(t) {
  const k = Math.floor(t / SEG);
  const local = t - k * SEG;
  return local < HOLD ? { k, at: k * SEG + HOLD } : { k: k + 1, at: (k + 1) * SEG + HOLD };
}

export default {
  name: 'Robot Picks a Shape',
  description:
    'A robot names a mathematical object (a Klein bottle, the Barth sextic, a torus knot, a Menger sponge, a ' +
    'Mandelbulb, about 45 kinds with random parameters) and the shape turns into it by one formula: ' +
    'F_s = (1 − s) d_A + s d_B + 4s(1 − s)φ. Different every time. Ask it for a shape with the Params panel.',
  tags: ['implicit surfaces', 'homotopy', 'raymarch', 'algebraic geometry', 'fractals', 'knots', 'robots', 'humor'],
  category: 'Algebraic Art',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const k = Math.floor(t / SEG);
    const local = t - k * SEG;
    return { k, local, s: smooth((local - HOLD) / (SEG - HOLD)) };
  },

  latex: (params, hl, m) => {
    const A = pick(m.k);
    const B = pick(m.k + 1);
    const how = (e) =>
      e.shape.kind === 'implicit'
        ? 'd = f/\\lvert\\nabla f\\rvert'
        : ['menger', 'sierpinski', 'mandelbulb', 'julia'].includes(e.shape.id)
          ? 'd = \\text{distance estimate}'
          : 'd = \\text{signed distance}';
    if (m.s < 0.002) {
      return (
        '\\begin{aligned}' +
        `&\\textbf{${A.shape.name.replace(/–/g, '\\text{–}')}} \\\\` +
        `&${A.shape.latex(A.k)} \\\\` +
        `&${how(A)},\\ \\ \\text{next in } ${hl(HOLD - m.local, 1)}\\,\\text{s}` +
        '\\end{aligned}'
      );
    }
    const fl = FLOURISHES[A.flourish];
    return (
      '\\begin{aligned}' +
      `F_s &= (1-s)\\,d_{\\text{${A.shape.name}}} + s\\,d_{\\text{${B.shape.name}}} + 4s(1-s)\\,\\phi,\\quad s = ${hl(m.s, 2)} \\\\` +
      `\\phi &= ${fl.latex(A.amp, A.freq)}\\quad\\text{(${fl.name})} \\\\` +
      `\\text{${B.shape.name}}&:\\ ${B.shape.latex(B.k)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  actions: {
    next: {
      label: '🎲 Next shape',
      run(ctx) {
        ctx.motionTime = jumpTarget(ctx.motionTime).at;
      },
    },
    ask: {
      label: '💬 Ask for a shape',
      run(ctx, state) {
        const want = window.prompt('Which mathematical object? (anything: "klein bottle", "d20", "pringle", "trefoil"…)');
        if (want == null) return;
        const { k, at } = jumpTarget(ctx.motionTime);
        const i = findShape(want);
        const target = i >= 0 ? i : Math.floor(Math.random() * SHAPES.length);
        overrides.set(k + 1, target);
        cache.delete(k + 1);
        cache.delete(k + 2);
        ctx.motionTime = at;
        state.lastK = k;            // so update() doesn't announce over this
        const name = SHAPES[target].name;
        state.robot.say(
          i >= 0
            ? `${name}? Excellent choice. I was going to pick that.`
            : `I do not know "${want.slice(0, 40)}". Here is ${spoken(SHAPES[target])}, which is basically the same if you squint.`,
          state.voice
        );
        state.announced = 'morph';
        state.asked = k + 1;
      },
    },
    voice: {
      label: '🔊 Robot voice on/off',
      run(ctx, state) {
        state.voice = !state.voice;
        state.robot.say(state.voice ? 'Voice on. Hello.' : 'Voice off. I will think quietly.', state.voice);
      },
    },
  },

  fragmentShader: FRAG,

  uniforms() {
    return {
      uA: { value: 0 },
      uB: { value: 1 },
      uKA: { value: [0, 0, 0, 0] },
      uKB: { value: [0, 0, 0, 0] },
      uRA: { value: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      uRB: { value: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      uPalA: { value: [0, 0, 0, 1] },
      uPalB: { value: [0, 0, 0, 1] },
      uS: { value: 0 },
      uFl: { value: 0 },
      uAmp: { value: 0 },
      uFreq: { value: 4 },
      uSafety: { value: 0.7 },
    };
  },

  setup(ctx) {
    seed = (Math.random() * 2 ** 32) >>> 0;
    overrides.clear();
    cache.clear();
    const asked = new URLSearchParams(window.location.search).get('shape');
    const i = asked ? findShape(asked) : -1;
    if (i >= 0) overrides.set(0, i);
    return { robot: createRobot(), voice: false, lastK: null, announced: null, asked: null };
  },

  update(ctx, state) {
    // Compiling ~45 shapes stalls the first frames; don't let that eat the
    // first object's turn.
    if (ctx.frame < 4) {
      ctx.motionTime = 0;
      ctx.motion = this.motion(0);
    }
    const m = ctx.motion;
    const A = pick(m.k);
    const B = pick(m.k + 1);
    const u = state.uniforms;
    u.uA.value = A.type;
    u.uB.value = B.type;
    u.uKA.value = A.k;
    u.uKB.value = B.k;
    u.uRA.value = A.rot;
    u.uRB.value = B.rot;
    u.uPalA.value = A.palette;
    u.uPalB.value = B.palette;
    u.uS.value = m.s;
    u.uFl.value = A.flourish;
    u.uAmp.value = A.amp;
    u.uFreq.value = A.freq;
    // Safe step: 1/L for the blend and the flourish, a bit less for estimates.
    const w = 4 * m.s * (1 - m.s);
    const L = A.flourish === 3 ? Math.sqrt(1 + (w * A.amp * R_CLIP) ** 2) : 1 + w * A.amp * A.freq * 1.8;
    u.uSafety.value = 0.7 / L;

    state.robot.setAway(!window.location.pathname.startsWith('/s/'));

    // The robot talks when a new object arrives, and when the morph begins.
    if (state.lastK !== m.k) {
      state.lastK = m.k;
      state.announced = 'intro';
      const intro = state.asked === m.k ? `As requested: ${spoken(A.shape)}.` : A.intro;
      state.robot.say(`${intro} ${A.shape.fact(A.k)}`, state.voice);
    } else if (m.local >= HOLD && state.announced !== 'morph') {
      state.announced = 'morph';
      state.robot.say(
        A.morph.replace('{next}', spoken(B.shape)).replace('{flourish}', FLOURISHES[A.flourish].name),
        state.voice
      );
    }
  },

  dispose(ctx, state) {
    state.robot.dispose();
  },
};
