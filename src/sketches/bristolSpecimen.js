import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGlow } from '../lib/glow.js';
import { caption, beat } from '../lib/bit.js';

// A stool specimen, built to the Bristol Stool Form Scale (Lewis & Heaton,
// Scand. J. Gastroenterol. 1997), with sweet-corn kernels in it that you can
// examine and pull out, and a Gram-stain microscope for the rest of it.
// Units: centimetres.
//
// Shape. Types 2–4 are one log: a centreline that wanders on the floor with
// curvature κ(s) = κ₀ + κ₁ sin(2πfs/L + φ), and a radius r(s) about the
// width of the anal canal (R = 1.3–1.5 cm). The leading end is a rounded cap,
// r = R√(1 − (1 − s/c)²); the trailing end is pinched off by the sphincter,
// r = R(1 − (1 − u)^2.2), u = (L − s)/ℓ_tail, so it ends in a point. Type 2
// adds fused lumps (|sin πs/ℓ|^½, grooves where they join); types 2 and 3
// get drying cracks, drawn where a noise field n(s, arc) crosses zero — n
// varies faster along s than round the log, so the cracks run round it, as
// real ones do. Types 1 and 5 are separate pieces: knobbly nut-sized lumps,
// or soft blobs that sag to 55% of their height. Everything rests on the
// floor and sags: the part below w = 0.22R is squeezed up, y ↦ w e^{(y−w)/w},
// and spread sideways, which is what makes a flat contact patch.
//
// Corn. A kernel (Zea mays, sweet corn: about 10 × 8 × 5 mm) is a wedge with
// a rounded crown and a tip cap where it held on to the cob. Its skin, the
// pericarp, is cellulose: β(1→4)-linked glucose, which no human enzyme cuts,
// so it comes out the way it went in. Chewed kernels often come out as the
// empty skin alone (the starch inside was digested); 30% here are hulls.
// Each kernel sits in a socket carved exactly to its (slightly enlarged)
// ellipsoid: every surface vertex inside it is moved along −n to where that
// line leaves the ellipsoid. Pull the kernel and the socket stays.
//
// Numbers (all live in the equation):
//   V = ⅓∮ x·n dA over the mesh (the divergence theorem; sockets included).
//   ρ = 1.07 g/cm³ × (1 − gas fraction). Stools float because of gas, not
//   fat (Levitt & Duane, NEJM 1972); above ~6.5% gas, ρ < 1.
//   Bacteria: ~0.9 × 10¹¹ per gram wet (Sender, Fuchs & Milo, PLoS Biol 2016).
//   Cooling: lumped capacitance, T = T_air + (37 − T_air)e^{−t/τ},
//   τ = ρcV/(hA), c = 3.5 J/(g·K) (75% water × 4.18 + 25% solids × 1.5),
//   h = 10 W/(m²·K) (still air). Biot number hV/(Ak) ≈ 0.1–0.2 with
//   k = 0.5 W/(m·K): the inside lags the surface a little, so it's an estimate.
//   One second on screen is a minute of cooling (× the time warp).
//
// Microscope. At 0.9 × 10¹¹ cells/g and ρ ≈ 1.07, there are ~0.096 cells per
// µm³. A 40 µm field (oil immersion, ×1000) with ~1 µm depth of focus holds
// 0.096 × 1257 µm² × 1 µm ≈ 121 of them. Drawn Gram-stained: pink
// Gram-negative rods (Bacteroides-like), purple Gram-positive cocci and rods
// (Firmicutes), plus plant cell walls and food debris.
//
// Leaving. It comes out of an anus H cm above the floor at v = L/12 s (most
// mammals take 12 ± 7 s, whatever their size: Yang et al., Soft Matter 2017),
// as a simulated rope (see bakeExit) whose stiffness comes from its yield
// stress τ_y. τ_y falls steeply with water content (assumed 66% for type 1 up
// to 80% for type 5), so firmness is one number with three consequences:
//   - it hangs until ρgΔy = √3 τ_y, i.e. Δy = ℓ_tear = √3 τ_y/(ρg), then tears;
//   - a pile can't stand taller than h_max = 2τ_y/(ρg), so soft ones slump;
//   - stiff ones topple like a rod, soft ones fold and stay folded.
// The whole exit is simulated once when a specimen is made, recorded at 30 fps
// and played back; the mesh rides on it (every vertex lives in a frame along
// the log), and the final frame is the specimen you then examine.
//
// Tap a kernel to examine it, tap it again to pull it out; tap the stool for
// the microscope; scroll or pinch to zoom (towards the cursor). Leave it alone
// and it examines itself.

const RHO_STOOL = 1.07; // g/cm³, gas-free
const C_STOOL = 3.5; // J/(g·K)
const H_AIR = 10; // W/(m²·K)
const K_STOOL = 0.5; // W/(m·K)
const BACT_PER_G = 0.9e11;
const RHO_CORN = 1.1; // g/cm³
const WORLD_POP = 8.1e9;
const IDLE = 10; // s without a touch before the autopilot takes over
const G = 981; // cm/s²
const MU_S = 1.2; // static friction, stool on a floor (sticky)
const MU_K = 0.9;
const WATER = [0.66, 0.7, 0.73, 0.76, 0.8]; // assumed water fraction, types 1–5
const TAU_REF = 1500; // Pa, yield stress at W_REF (model, see yieldStress)
const W_REF = 0.76;
const W_SCALE = 0.015; // τ_y falls by e for every 1.5% more water
const T_EXIT = 12; // s
const EXIT_FPS = 30;
const EXIT_TILT = 0.26; // the canal points down and a little back
const EXIT_DIR = [0, -Math.cos(EXIT_TILT), -Math.sin(EXIT_TILT)];
const BRISTOL = [
  'separate hard lumps, like nuts',
  'sausage-shaped but lumpy',
  'like a sausage, with cracks on its surface',
  'like a sausage or snake, smooth and soft',
  'soft blobs with clear-cut edges',
];

// ---------- random numbers and noise (seeded, so a specimen can be rebuilt) ----------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
// 3D simplex noise (Gustavson), range about [−1, 1].
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    pm[i] = (perm[i] % 12) * 3;
  }
  const F3 = 1 / 3;
  const G3 = 1 / 6;
  const corner = (g, x, y, z) => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    return t * t * (GRAD3[g] * x + GRAD3[g + 1] * y + GRAD3[g + 2] * z);
  };
  return (x, y, z) => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - i + t;
    const y0 = y - j + t;
    const z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    return 32 * (
      corner(pm[ii + perm[jj + perm[kk]]], x0, y0, z0) +
      corner(pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
      corner(pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
      corner(pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3)
    );
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- gas pockets ----------
// One bubble per cube of side VOID_CELL, at a hashed point inside it, radius
// r₀(0.4 + 1.2u). The integer hash is the same in JS and GLSL (uint maths),
// so the pockets you see on a cut are the ones the readout counts.
// Volume fraction: spheres scattered this way fill 1 − e^{−λ⟨v⟩} of space
// (λ = 1/cell³, ⟨v⟩ = ⁴⁄₃πr₀³⟨k³⟩, ⟨k³⟩ = 1.36), less a few % because one
// per cell overlaps less than Poisson would; that factor was measured by
// Monte Carlo (2–5% over φ = 0.01–0.2) and is divided out.
const VOID_CELL = 0.45; // cm
const VOID_SEED = 0x51ed27;
function hashU(x) {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const hashCell = (a, b, c, k) => hashU((Math.imul(a, 73856093) ^ hashU((Math.imul(b, 19349663) ^ hashU((Math.imul(c, 83492791) ^ k) >>> 0)) >>> 0)) >>> 0);
const u01 = (h) => (h >>> 8) / 16777216;
const voidRadius = (phi) => (phi <= 0 ? 0 : VOID_CELL * Math.cbrt((3 * -Math.log(1 - phi)) / (4 * Math.PI * 1.36 * (1.02 + 0.17 * phi))));
// The pocket nearest to containing p: q = 1 − |p − c|/r (> 0 inside), its centre and radius.
function voidAt(x, y, z, r0, out = {}) {
  const s = VOID_CELL;
  const a = Math.floor(x / s);
  const b = Math.floor(y / s);
  const c = Math.floor(z / s);
  out.q = -1e9;
  if (r0 <= 0) return out;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const h = hashCell(a + i, b + j, c + k, VOID_SEED);
    const fx = (a + i + u01(h)) * s;
    const fy = (b + j + u01(hashU(h ^ 0x68e31da4))) * s;
    const fz = (c + k + u01(hashU(h ^ 0xb5297a4d))) * s;
    const r = r0 * (0.4 + 1.2 * u01(hashU(h ^ 0x1b56c4e9)));
    const q = 1 - Math.hypot(x - fx, y - fy, z - fz) / r;
    if (q > out.q) Object.assign(out, { q, x: fx, y: fy, z: fz, r });
  }
  return out;
}

// ---------- heat inside ----------
// Transient conduction in a long cylinder (a log) or a sphere (a lump), with
// convection h at the surface, by separation of variables:
//   θ = (T − T_air)/(37 − T_air) = Σ Cₙ e^{−ζₙ² Fo} X(ζₙ r/R),  Fo = αt/R²,  Bi = hR/k
//   cylinder: X = J₀,          ζ J₁(ζ) = Bi J₀(ζ),   Cₙ = 2J₁/(ζ(J₀² + J₁²))
//   sphere:   X = sin x / x,   1 − ζ cot ζ = Bi,     Cₙ = 4(sin ζ − ζ cos ζ)/(2ζ − sin 2ζ)
// Checked against a finite-difference solution of the radial heat equation
// (agrees to 4 decimals at Fo = 0.02–2, Bi = 0.28 and 0.6).
const HEAT_MODES = 16;
const HEAT_COLS = 33; // r/R = 0 … 1
const HEAT_ROWS = 12; // R from the thinnest to the thickest part
function besselJ(n, x) {
  // (1/π)∫₀^π cos(nτ − x sin τ) dτ by the trapezoid rule: periodic, so it converges fast.
  const M = 64;
  let s = 0;
  for (let i = 0; i <= M; i++) s += (i === 0 || i === M ? 0.5 : 1) * Math.cos(n * ((Math.PI * i) / M) - x * Math.sin((Math.PI * i) / M));
  return s / M;
}
function heatModes(sphere, Bi) {
  const f = sphere ? (z) => (1 - Bi) * Math.sin(z) - z * Math.cos(z) : (z) => z * besselJ(1, z) - Bi * besselJ(0, z);
  const out = [];
  let a = 1e-6;
  let fa = f(a);
  for (let z = 0.05; out.length < HEAT_MODES && z < 120; z += 0.05) {
    const fb = f(z);
    if (fa * fb < 0) {
      let lo = z - 0.05;
      let hi = z;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (f(lo) * f(m) <= 0) hi = m;
        else lo = m;
      }
      const zn = (lo + hi) / 2;
      const C = sphere
        ? (4 * (Math.sin(zn) - zn * Math.cos(zn))) / (2 * zn - Math.sin(2 * zn))
        : (2 * besselJ(1, zn)) / (zn * (besselJ(0, zn) ** 2 + besselJ(1, zn) ** 2));
      // The radial shape at each table column, once.
      const X = new Float64Array(HEAT_COLS);
      for (let j = 0; j < HEAT_COLS; j++) {
        const x = (zn * j) / (HEAT_COLS - 1);
        X[j] = sphere ? (x < 1e-9 ? 1 : Math.sin(x) / x) : besselJ(0, x);
      }
      out.push({ z: zn, C, X });
    }
    fa = fb;
  }
  return out;
}

// The table the shaders read, θ(r/R) at HEAT_COLS points for HEAT_ROWS
// radii (thin parts cool faster: Fo goes as 1/R²), refilled each frame.
function createHeat(sphere, Rmin, Rmax, rho) {
  const alpha = K_STOOL / 100 / (rho * C_STOOL); // cm²/s
  if (Rmax - Rmin < 0.05) Rmax = Rmin + 0.05;
  const rows = [];
  for (let i = 0; i < HEAT_ROWS; i++) {
    const R = Rmin + ((Rmax - Rmin) * i) / (HEAT_ROWS - 1);
    const Bi = (H_AIR * (R / 100)) / K_STOOL;
    rows.push({ R, Bi, modes: heatModes(sphere, Bi) });
  }
  const data = new Uint8Array(HEAT_COLS * HEAT_ROWS * 4);
  const tex = new THREE.DataTexture(data, HEAT_COLS, HEAT_ROWS, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // θ at column j (r/R = j/32) of row i, after t seconds.
  const theta = (i, j, t) => {
    const row = rows[i];
    const Fo = (alpha * t) / (row.R * row.R);
    let s = 0;
    for (const m of row.modes) s += m.C * Math.exp(-m.z * m.z * Fo) * m.X[j];
    return Math.min(1, Math.max(0, s));
  };
  let last = -1;
  const update = (t) => {
    if (Math.abs(t - last) < 0.5) return;
    last = t;
    for (let i = 0; i < HEAT_ROWS; i++) for (let j = 0; j < HEAT_COLS; j++) data[4 * (i * HEAT_COLS + j)] = Math.round(theta(i, j, t) * 255);
    tex.needsUpdate = true;
  };
  return { sphere, Rmin, Rmax, rows, alpha, tex, theta, update };
}

// ---------- GLSL ----------
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT).
const SNOISE = /* glsl */ `
vec3 bsMod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 bsMod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 bsPermute(vec4 x){return bsMod289(((x*34.0)+10.0)*x);}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=bsMod289(i);
  vec4 p=bsPermute(bsPermute(bsPermute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  vec3 ns=0.142857142857*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=1.79284291400159-0.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
// Bump mapping from a height's screen-space derivatives (Mikkelsen 2010),
// with unnormalised dFdx so the bumps keep their size in cm as you zoom.
vec3 bsBump(vec3 surfPos, vec3 n, float h, float faceDirection){
  vec3 sx=dFdx(surfPos);
  vec3 sy=dFdy(surfPos);
  vec3 r1=cross(sy,n);
  vec3 r2=cross(n,sx);
  float det=dot(sx,r1)*faceDirection;
  vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
  return normalize(abs(det)*n-grad);
}
`;

// The gas pockets (same hash as voidAt in JS), and how far a point is from
// the core of the piece it's in (ρ = r/R, for the heat and the rind).
const INSIDE = /* glsl */ `
uniform float uVoidR;
uniform vec3 uOffset;
#define BS_NODES 48
uniform vec4 uNodes[BS_NODES];
uniform float uNodeSy[BS_NODES];
uniform int uNodeN;
uniform float uRope;
uniform sampler2D uHeat;
uniform vec2 uHeatR;
uniform float uHeatOn;
uint bsHashU(uint x){ x^=x>>16u; x*=0x7feb352du; x^=x>>15u; x*=0x846ca68bu; x^=x>>16u; return x; }
uint bsHashCell(ivec3 c){ return bsHashU(uint(c.x)*73856093u ^ bsHashU(uint(c.y)*19349663u ^ bsHashU(uint(c.z)*83492791u ^ ${VOID_SEED}u))); }
float bsU01(uint h){ return float(h>>8u)/16777216.0; }
// q = 1 − |p − c|/r for the pocket nearest to containing p (> 0 inside it).
float bsVoid(vec3 p, out float r){
  r = 0.0;
  if (uVoidR <= 0.0) return -1.0;
  ivec3 c0 = ivec3(floor(p / ${VOID_CELL.toFixed(4)}));
  float best = -1e9;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++){
    ivec3 c = c0 + ivec3(i, j, k);
    uint h = bsHashCell(c);
    vec3 f = (vec3(c) + vec3(bsU01(h), bsU01(bsHashU(h ^ 0x68e31da4u)), bsU01(bsHashU(h ^ 0xb5297a4du)))) * ${VOID_CELL.toFixed(4)};
    float rr = uVoidR * (0.4 + 1.2 * bsU01(bsHashU(h ^ 0x1b56c4e9u)));
    float q = 1.0 - length(p - f) / rr;
    if (q > best){ best = q; r = rr; }
  }
  return best;
}
// Nearest piece of the rope (or blob): ρ = distance from its axis in local
// radii, with the slump's squash undone. R = the radius there.
float bsCore(vec3 p, out float R){
  float best = 1e9;
  R = 1.0;
  for (int i = 0; i < BS_NODES; i++){
    if (i >= uNodeN) break;
    vec4 a = uNodes[i];
    vec3 q = a.xyz;
    float ra = abs(a.w);
    float sy = uNodeSy[i];
    if (uRope > 0.5 && a.w > 0.0 && i + 1 < uNodeN){
      vec4 b = uNodes[i + 1];
      vec3 ab = b.xyz - q;
      float u = clamp(dot(p - q, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      q += ab * u;
      ra = mix(ra, abs(b.w), u);
      sy = mix(sy, uNodeSy[i + 1], u);
    }
    vec3 o = p - q;
    o.y /= sy;
    o.xz *= uRope > 0.5 ? sy : sqrt(sy);
    float rr = length(o) / ra;
    if (rr < best){ best = rr; R = ra; }
  }
  return best;
}
float bsTheta(float rho, float R){
  float row = clamp((R - uHeatR.x) / max(uHeatR.y - uHeatR.x, 1e-3), 0.0, 1.0);
  vec2 uv = vec2((clamp(rho, 0.0, 1.0) * ${HEAT_COLS - 1}.0 + 0.5) / ${HEAT_COLS}.0, (row * ${HEAT_ROWS - 1}.0 + 0.5) / ${HEAT_ROWS}.0);
  return texture2D(uHeat, uv).r;
}
// Inferno (Matt Zucker's polynomial fit), sRGB out.
vec3 bsInferno(float t){
  const vec3 c0 = vec3(0.00021894, 0.00165100, -0.01948090);
  const vec3 c1 = vec3(0.10651342, 0.56395644, 3.93271239);
  const vec3 c2 = vec3(11.60249308, -3.97285397, -15.94239411);
  const vec3 c3 = vec3(-41.70399613, 17.43639888, 44.35414520);
  const vec3 c4 = vec3(77.16293570, -33.40235894, -81.80730926);
  const vec3 c5 = vec3(-71.31942824, 32.62606426, 73.20951986);
  const vec3 c6 = vec3(25.13112622, -12.24266895, -23.07032500);
  t = clamp(t, 0.0, 1.0);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
// 37 °C sits at orange, not the near-white top of the map, so a warm core still has shape.
vec3 bsHeatColour(float theta){ return pow(max(bsInferno(0.1 + 0.68 * theta), 0.0), vec3(2.2)); }
// Heat colour, keeping the light/dark of the texture underneath so it still reads as a surface.
vec3 bsHeatSkin(vec3 hot, vec3 col){ return hot * clamp(0.3 + 4.0 * dot(col, vec3(0.3, 0.59, 0.11)), 0.35, 1.0) * 0.4; }
`;

// The stool's skin, added to MeshPhysicalMaterial: colour (stercobilin
// browns, darker where drier, with fibre flecks and pale undigested bits),
// a bump height in cm (grain, pits, gas pores), cracks and sockets from
// vertex attributes. Patterns are read at aRef, a point in the stool's own
// coordinates, so they move with it instead of swimming over it. The clearcoat keeps the unbumped normal: a smooth
// mucus film over a rough surface.
function stoolMaterial(uniforms) {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.8, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.08, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x3a2614) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCrack;\nattribute float aCav;\nattribute vec3 aRef;\nvarying vec3 vObj;\nvarying float vCrack;\nvarying float vCav;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = aRef;\nvCrack = aCrack;\nvCav = aCav;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('varying vec3 vObj;', 'varying vec3 vObj;\nvarying vec3 vWorld;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uType;
        uniform float uWet;
        uniform vec4 uClip;
        varying vec3 vWorld;
        uniform float uGas;
        uniform float uSeed;
        uniform float uDamp;
        uniform float uGrain;
        varying vec3 vObj;
        varying float vCrack;
        varying float vCav;
        ${SNOISE}
        ${INSIDE}
        float bsFbm(vec3 p){ return 0.5*snoise(p)+0.25*snoise(p*2.03+7.1)+0.125*snoise(p*4.01+3.3); }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Still inside the canal: not out yet.
        if (dot(uClip.xyz, vWorld) > uClip.w) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 sp = vObj + uSeed;
        float big = bsFbm(sp * 0.55);
        float mid = bsFbm(sp * 2.4);
        // Browns in linear light: type 1 is darkest (longest in the colon), 5 the palest.
        float tone = clamp(0.42 + 0.6 * big + 0.22 * mid - 0.12 * (3.0 - uType), 0.0, 1.0);
        vec3 dark = vec3(0.036, 0.016, 0.006);
        vec3 midc = vec3(0.110, 0.050, 0.016);
        vec3 clay = vec3(0.200, 0.105, 0.034);
        vec3 col = mix(dark, midc, smoothstep(0.0, 0.55, tone));
        col = mix(col, clay, smoothstep(0.55, 1.0, tone) * 0.8);
        // Fibre: dark green-brown flecks. Undigested bits: pale specks.
        float fib = smoothstep(0.80, 0.86, snoise(sp * vec3(9.0, 3.5, 9.0) + 11.0));
        col = mix(col, vec3(0.025, 0.030, 0.010), fib * 0.85);
        float pale = smoothstep(0.88, 0.93, snoise(sp * 13.0 + 31.0));
        col = mix(col, vec3(0.42, 0.30, 0.13), pale * 0.7);
        // Cracks: a sharp dark line in the middle, a softer shadow either side.
        col *= mix(1.0, 0.55, vCrack) * mix(1.0, 0.35, smoothstep(0.45, 0.8, vCrack));
        col *= mix(1.0, 0.62, vCav);                 // a socket: wetter, darker
        col *= mix(0.82, 1.0, smoothstep(0.0, 0.35, vWorld.y)); // where it touches the floor
        // Heat view: the surface temperature from the conduction solution.
        float bsR;
        float bsRho = bsCore(vWorld - uOffset, bsR);
        vec3 bsHot = bsHeatColour(bsTheta(max(bsRho, 0.97), bsR));
        col = mix(col, bsHeatSkin(bsHot, col), uHeatOn);
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float bsH = 0.040 * mid + 0.014 * snoise(sp * 9.0) + 0.006 * snoise(sp * 27.0);
        // Gas pores: little pits, more of them the more gas there is.
        float pore = smoothstep(0.86 - uGas * 1.6, 0.97 - uGas * 1.2, snoise(sp * 6.0 + 5.0));
        bsH -= 0.05 * pore;
        bsH -= 0.03 * vCrack;
        // Fine grain only when you're close enough to see it: fwidth(sp) is
        // how many cm one pixel covers, so it fades in instead of shimmering.
        float bsNear = 1.0 - smoothstep(0.004, 0.025, length(fwidth(sp)));
        bsH += uGrain * bsNear * (0.004 * snoise(sp * 55.0) + 0.002 * snoise(sp * 130.0));
        // Damp patches: the only places allowed to be glossy. Everything else
        // stays matte. uWet: 0 for a hard dry type 1, 1 for a soft type 5.
        float bsDamp = uDamp * smoothstep(0.1, 0.6, bsFbm(sp * 0.7 + 19.0) + 0.35 * (uWet - 0.5)) * (1.0 - vCrack);
        float dry = clamp(0.7 + 6.0 * bsH + 0.6 * vCrack - (uWet - 0.5) * 0.3, 0.0, 1.0);
        roughnessFactor = mix(0.62, 0.97, dry);
        roughnessFactor = mix(roughnessFactor, 0.36, bsDamp);
        roughnessFactor = mix(roughnessFactor, 0.42, vCav);
        roughnessFactor = mix(roughnessFactor, 0.9, uHeatOn);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bsBump(-vViewPosition, normal, bsH, faceDirection);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += bsHot * 0.3 * uHeatOn;`,
      );
    // The clearcoat is the mucus film: stronger on the soft types, gone in the cracks.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
      material.clearcoat *= (0.03 + 0.8 * bsDamp + 0.4 * vCav) * (1.0 - 0.6 * smoothstep(0.0, 0.05, bsH)) * (1.0 - uHeatOn);`,
    );
  };
  mat.customProgramCacheKey = () => 'bristolStool';
  return mat;
}

// The cut face. Inside, stool is paler and more even than its skin (the skin
// has dried and darkened in the colon), with a darker rind a couple of mm
// deep, fibre, pale undigested bits, and the gas pockets: dents that the
// light catches on the far rim. Patterns are read in the specimen's own
// coordinates (world − uOffset), so A and B cut the same way look alike.
function capMaterial(uniforms) {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.7, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uType;
        uniform float uSeed;
        varying vec3 vWorld;
        ${SNOISE}
        ${INSIDE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 lp = vWorld - uOffset;
        vec3 sp = lp + uSeed;
        float bsR;
        float bsRho = bsCore(lp, bsR);
        float tone = clamp(0.55 + 0.35 * snoise(sp * 0.9) + 0.15 * snoise(sp * 3.1) - 0.1 * (3.0 - uType), 0.0, 1.0);
        vec3 col = mix(vec3(0.085, 0.040, 0.013), vec3(0.20, 0.105, 0.036), tone);
        // The rind: the outer ~2 mm dried darker on the way through.
        col *= mix(1.0, 0.62, smoothstep(1.0 - 0.18 / bsR, 1.0, bsRho));
        float fib = smoothstep(0.74, 0.8, snoise(sp * vec3(7.0, 2.2, 7.0) + 11.0));
        col = mix(col, vec3(0.03, 0.035, 0.012), fib * 0.8);
        float pale = smoothstep(0.8, 0.86, snoise(sp * 9.0 + 31.0));
        col = mix(col, vec3(0.45, 0.33, 0.14), pale * 0.75);
        float vr;
        float vq = bsVoid(lp, vr);
        float inPocket = smoothstep(-0.04, 0.04, vq);
        col *= mix(1.0, 0.22, inPocket);
        float theta = bsTheta(bsRho, bsR);
        vec3 bsHot = bsHeatColour(theta);
        col = mix(col, bsHeatSkin(bsHot, col), uHeatOn);
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // A pocket is a hemispherical dent: depth r√(1 − (1 − q)²).
        float bsH = 0.004 * snoise(sp * 40.0) - (vq > 0.0 ? vr * sqrt(max(0.0, 1.0 - (1.0 - vq) * (1.0 - vq))) : 0.0);
        roughnessFactor = mix(0.62, 0.85, pale);
        roughnessFactor = mix(roughnessFactor, 0.9, uHeatOn);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bsBump(-vViewPosition, normal, bsH, faceDirection);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += bsHot * 0.3 * uHeatOn;`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.clearcoat *= (1.0 - inPocket) * (1.0 - uHeatOn);`,
      );
  };
  mat.customProgramCacheKey = () => 'bristolCap';
  return mat;
}

// The kernel's skin: glossy yellow pericarp, tan tip cap, stool smeared on
// whatever was below the surface (uPlane, in the kernel's own frame).
function kernelMaterial(hull, seed) {
  const uniforms = {
    uPlane: { value: new THREE.Vector4(0, 0, 1, -1) },
    uHull: { value: hull ? 1 : 0 },
    uKSeed: { value: seed },
    uHover: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.2, sheenColor: new THREE.Color(0xffd27a) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aU;\nvarying float vU;\nvarying vec3 vKp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = aU;\nvKp = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uPlane;
        uniform float uHull;
        uniform float uKSeed;
        uniform float uHover;
        varying float vU;
        varying vec3 vKp;
        ${SNOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 ky = mix(vec3(0.78, 0.46, 0.05), vec3(0.70, 0.52, 0.18), uHull);
        ky *= 0.9 + 0.12 * snoise(vKp * 6.0 + uKSeed);
        ky = mix(ky, vec3(0.40, 0.29, 0.15), smoothstep(0.14, 0.05, vU)); // tip cap
        float depth = dot(uPlane.xyz, vKp) - uPlane.w;
        float edge = 0.03 + 0.05 * snoise(vKp * 9.0 + uKSeed);
        float coat = smoothstep(edge + 0.02, edge - 0.03, depth);
        coat = max(coat, smoothstep(0.55, 0.8, snoise(vKp * vec3(5.0, 16.0, 5.0) + uKSeed)) * 0.6 * smoothstep(0.25, 0.0, depth));
        diffuseColor.rgb = mix(ky, vec3(0.10, 0.048, 0.016), coat * 0.94);
        // Cut open: the starchy endosperm (pale), or, in a hull, the stool that filled it.
        if (!gl_FrontFacing) diffuseColor.rgb = mix(vec3(0.82, 0.70, 0.40), vec3(0.09, 0.045, 0.015), uHull);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, coat);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.clearcoat *= 1.0 - coat;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // A little light from inside: the pericarp is translucent.
        totalEmissiveRadiance += ky * (0.035 + 0.06 * uHull) * (1.0 - coat) + vec3(0.25, 0.18, 0.05) * uHover;`,
      );
  };
  mat.customProgramCacheKey = () => 'bristolKernel';
  return { mat, uniforms };
}

// ---------- geometry ----------
// A kernel in its own frame: y from tip (−) to crown (+), x across, z thick.
function kernelGeometry(hull) {
  const noise = makeNoise(hull ? 77 : 41);
  const g = new THREE.SphereGeometry(1, 56, 40);
  const pos = g.attributes.position;
  const aU = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y + 1) / 2; // 0 tip … 1 crown
    const w = 0.42 + 0.58 * Math.sin((Math.min(1, t / 0.78) * Math.PI) / 2);
    const th = 0.55 + 0.45 * Math.sin((Math.min(1, t / 0.7) * Math.PI) / 2);
    let X = x * 0.4 * w;
    let Y = (y > 0.3 ? 0.3 + (y - 0.3) * 0.42 : y) * 0.62;
    let Z = z * 0.25 * th;
    // A squarish crown, slightly dented in the middle.
    X *= 1 + 0.32 * Math.pow(t, 3);
    if (y > 0.8) Y -= 0.02 * (1 - Math.min(1, Math.hypot(x, z) * 3));
    if (hull) {
      Z *= 0.3;
      const c = 0.03 * noise(x * 3, y * 3, z * 3) + 0.012 * noise(x * 9, y * 9, z * 9);
      X += c * x;
      Y += c * y * 0.5;
      Z += c * Math.sign(z) * 1.5;
    } else {
      const d = 1 + 0.012 * noise(x * 5, y * 5, z * 5);
      X *= d;
      Z *= d;
    }
    pos.setXYZ(i, X, Y, Z);
    aU[i] = t;
  }
  g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  g.computeVertexNormals();
  const half = g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  // Volume by the divergence theorem, for the kernel's mass.
  let vol = 0;
  const idx = g.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const cc = new THREE.Vector3();
  for (let k = 0; k < idx.length; k += 3) {
    a.fromBufferAttribute(pos, idx[k]);
    b.fromBufferAttribute(pos, idx[k + 1]);
    cc.fromBufferAttribute(pos, idx[k + 2]);
    vol += a.dot(b.cross(cc)) / 6;
  }
  return { geo: g, half, volume: Math.abs(vol) };
}

// Squash the part of a point below w up into a contact patch, and spread it
// out sideways (the sag that flattens a soft thing on a floor). Numbers in,
// numbers out: this runs on every vertex every frame while it moves.
function sagInto(out, i, dx, dz, w) {
  const py = out[i + 1];
  if (py >= w) return;
  const y = w * Math.exp((py - w) / w);
  const spread = (y - py) * 0.9;
  const hl = Math.hypot(dx, dz) || 1;
  const k = (spread * Math.min(1, hl * 2)) / hl;
  out[i] += dx * k;
  out[i + 2] += dz * k;
  out[i + 1] = y;
}

function crackLine(n, width) {
  return smoothstep(width, 0, Math.abs(n));
}

// ---------- firmness ----------
// The yield stress τ_y: below it the stuff holds its shape like a solid,
// above it it flows. It falls steeply with water content, as it does for
// every faecal sludge measured; this exponential is a model pinned at
// 1.5 kPa for type 4 (76% water), not a measurement.
const yieldStress = (water) => TAU_REF * Math.exp(-(water - W_REF) / W_SCALE); // Pa
const waterOf = (type, shift) => WATER[type - 1] + shift / 100;

// Rotate u by the smallest rotation taking unit a to unit b (parallel transport).
function transport(u, a, b, out) {
  const kx = a[1] * b[2] - a[2] * b[1];
  const ky = a[2] * b[0] - a[0] * b[2];
  const kz = a[0] * b[1] - a[1] * b[0];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const kd = (kx * u[0] + ky * u[1] + kz * u[2]) / Math.max(1 + c, 1e-6);
  out[0] = u[0] * c + (ky * u[2] - kz * u[1]) + kx * kd;
  out[1] = u[1] * c + (kz * u[0] - kx * u[2]) + ky * kd;
  out[2] = u[2] * c + (kx * u[1] - ky * u[0]) + kz * kd;
  return out;
}

// ---------- leaving: types 2–4 ----------
// The log is a chain of nodes 0.4 cm apart, node 0 the front. Inside the canal
// the nodes are carried out at v along the canal's axis e; past the anus they
// are free. Position-based dynamics at 480 Hz: gravity, fixed segment lengths,
// bending as distance constraints over 2, 4 and 8 segments (stiffness rising
// with τ_y), and creep past the yield strain so a fold stays folded; contact
// with itself and with the floor, where Coulomb friction stops sliding unless
// the sideways push beats μ times the normal push. The part hanging from the
// anus pulls on it with stress ρgΔy (Δy = how far below the anus its lowest
// point is); past the tensile yield √3·τ_y (von Mises) it tears off. Where a
// node rests on something, it slumps towards the tallest column a yield-stress
// material can make, h_max = 2τ_y/(ρg); a node stacked on another whose top
// is above h_max flows off sideways, so a pile of folds can't stand taller either.
// The push is a pressure, not a piston: when the part already out is jammed
// against the floor and squeezed along its length, the feed slows (to a stop
// if need be) until bending creep lets it buckle and fold out of the way.
// Nor is the anus a rigid clamp: the canal's axis gives way to the bending
// moment of what hangs from it (up to 35° from its resting angle), so a stiff
// log pivots and topples instead of being held against the floor.
function bakeExit({ L, radius, v, tau, rho, H, seed }) {
  const rng = mulberry32(seed ^ 0x2c1b3c6d);
  const n = Math.max(8, Math.round(L / 0.4) + 1);
  const h = L / (n - 1);
  const rhoG = rho * G;
  const tauC = tau * 10; // Pa → dyn/cm²
  const Lbreak = (Math.sqrt(3) * tauC) / rhoG;
  const hmax = (2 * tauC) / rhoG;
  const e = EXIT_DIR.slice();
  // A person isn't a statue: the anus drifts a few mm while it happens.
  const sw = [0.3 + rng() * 0.5, 0.4 + rng() * 0.6, rng() * 6.28, rng() * 6.28, 0.2 + rng() * 0.2, 0.15 + rng() * 0.2];
  const anus = (t, out) => {
    out[0] = sw[0] * Math.sin(sw[4] * t + sw[2]);
    out[1] = H;
    out[2] = sw[1] * Math.sin(sw[5] * t + sw[3]);
    return out;
  };
  const x = new Float64Array(3 * n);
  const xp = new Float64Array(3 * n);
  const rc = new Float64Array(n);
  const sy = new Float64Array(n).fill(1);
  const syEq = new Float64Array(n);
  const link = new Uint8Array(n).fill(1); // link i ↔ i+1
  const broken = new Uint16Array(n + 1); // broken[k]: torn links before node k, so a span's check is O(1)
  const free = new Uint8Array(n);
  const touch = new Uint8Array(n);
  const R = radius(L / 2);
  for (let i = 0; i < n; i++) {
    rc[i] = Math.max(radius(i * h), 0.35 * R);
    syEq[i] = Math.min(1, Math.max(0.3, hmax / (2 * rc[i])));
  }
  const SPANS = [2, 4, 8];
  const bend = SPANS.map((m) => new Float64Array(n).fill(m * h));
  const kb = 0.9 * (1 - Math.exp(-tau / 1200));
  const epsY = Math.min(0.12, Math.max(0.004, 0.012 * Math.sqrt(tau / 1500)));
  // Only parts further apart along the rope than they are thick can collide.
  const gap = Math.ceil((2.2 * R) / h) + 1;
  // Node masses (g), for the energy books.
  const mass = new Float64Array(n);
  for (let i = 0; i < n; i++) mass[i] = rho * Math.PI * rc[i] * rc[i] * h;
  let contacts = 0;
  const dt = 1 / 480;
  const iters = 6;
  const A = [0, 0, 0];
  const breaks = [];
  const rec = [];
  const wall = performance.now();
  let steps = 0;
  let t = 0;
  let quiet = 0;
  let drop = 0;
  let tTouch = -1;
  let sOut = 0; // length pushed out so far
  let feed = 1; // share of v the push manages against what's in the way
  let tEmit = -1;
  const place = (i) => {
    const d = i * h - sOut; // depth inside the canal
    anus(t, A);
    x[3 * i] = A[0] - e[0] * d;
    x[3 * i + 1] = A[1] - e[1] * d;
    x[3 * i + 2] = A[2] - e[2] * d;
  };
  for (let i = 0; i < n; i++) {
    place(i);
    xp[3 * i] = x[3 * i];
    xp[3 * i + 1] = x[3 * i + 1];
    xp[3 * i + 2] = x[3 * i + 2];
  }
  // Frames for the skin: tangent from linked neighbours; "up" carried along
  // the rope from node 0, and node 0's carried from the last record, so the
  // surface pattern doesn't spin.
  const T = new Float64Array(3 * n);
  const support = new Int32Array(n);
  let up0 = [1, 0, 0];
  let T0prev = [-e[0], -e[1], -e[2]];
  const tmp = [0, 0, 0];
  const record = () => {
    for (let i = 0; i < n; i++) {
      const a = i > 0 && link[i - 1] ? i - 1 : i;
      const b = i < n - 1 && link[i] ? i + 1 : i;
      let tx = x[3 * b] - x[3 * a];
      let ty = x[3 * b + 1] - x[3 * a + 1];
      let tz = x[3 * b + 2] - x[3 * a + 2];
      const l = Math.hypot(tx, ty, tz) || 1;
      T[3 * i] = tx / l;
      T[3 * i + 1] = ty / l;
      T[3 * i + 2] = tz / l;
    }
    const up = new Float32Array(3 * n);
    const T0 = [T[0], T[1], T[2]];
    transport(up0, T0prev, T0, tmp);
    up0 = [tmp[0], tmp[1], tmp[2]];
    T0prev = T0;
    let u = up0;
    for (let i = 0; i < n; i++) {
      const Ti = [T[3 * i], T[3 * i + 1], T[3 * i + 2]];
      if (i > 0) u = transport(u, [T[3 * i - 3], T[3 * i - 2], T[3 * i - 1]], Ti, [0, 0, 0]);
      const d = u[0] * Ti[0] + u[1] * Ti[1] + u[2] * Ti[2];
      const ux = u[0] - d * Ti[0];
      const uy = u[1] - d * Ti[1];
      const uz = u[2] - d * Ti[2];
      const l = Math.hypot(ux, uy, uz) || 1;
      u = [ux / l, uy / l, uz / l];
      up[3 * i] = u[0];
      up[3 * i + 1] = u[1];
      up[3 * i + 2] = u[2];
    }
    anus(t, A);
    // The books, for the diagnostics: kinetic and potential energy (erg),
    // the worst stretch of any intact segment, the deepest floor overlap.
    let ek = 0;
    let ep = 0;
    let strain = 0;
    let pen = 0;
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      const v2 = ((x[k] - xp[k]) ** 2 + (x[k + 1] - xp[k + 1]) ** 2 + (x[k + 2] - xp[k + 2]) ** 2) / (dt * dt);
      ek += 0.5 * mass[i] * v2;
      ep += mass[i] * G * x[k + 1];
      if (free[i]) pen = Math.max(pen, rc[i] * sy[i] * 0.92 - x[k + 1]);
      if (i < n - 1 && link[i]) strain = Math.max(strain, Math.abs(Math.hypot(x[k + 3] - x[k], x[k + 4] - x[k + 1], x[k + 5] - x[k + 2]) - h) / h);
    }
    rec.push({ x: Float32Array.from(x), up, sy: Float32Array.from(sy), A: [A[0], A[1], A[2]], drop, ek, ep, strain, pen, contacts, out: Math.min(L, sOut), feed, e: e.slice() });
  };
  // Segment lengths: solved first and again last in every iteration, so the
  // stiff bending spans can't leave the rope stretched (that stored stretch
  // is what snapped back when a stiff log let go of the anus).
  const stretch = () => {
    for (let i = 0; i < n - 1; i++) {
      if (!link[i] || (!free[i] && !free[i + 1])) continue;
      const a = 3 * i;
      const b = a + 3;
      const dx = x[b] - x[a];
      const dy = x[b + 1] - x[a + 1];
      const dz = x[b + 2] - x[a + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-9;
      const wa = free[i];
      const wb = free[i + 1];
      const corr = (d - h) / d / (wa + wb);
      x[a] += dx * corr * wa; x[a + 1] += dy * corr * wa; x[a + 2] += dz * corr * wa;
      x[b] -= dx * corr * wb; x[b + 1] -= dy * corr * wb; x[b + 2] -= dz * corr * wb;
    }
  };
  record();
  let nextRec = 1 / EXIT_FPS;
  while (true) {
    for (let i = 0; i < n; i++) {
      if (free[i]) continue;
      if (i * h - sOut <= 0) free[i] = 1;
      else {
        xp[3 * i] = x[3 * i];
        xp[3 * i + 1] = x[3 * i + 1];
        xp[3 * i + 2] = x[3 * i + 2];
      }
    }
    t += dt;
    sOut += v * feed * dt;
    if (tEmit < 0 && sOut >= L) tEmit = t;
    steps++;
    let vmax = 0;
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      if (!free[i]) {
        place(i);
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const vel = (x[k + c] - xp[k + c]) * 0.998;
        xp[k + c] = x[k + c];
        x[k + c] += vel + (c === 1 ? -G * dt * dt : 0);
        vmax = Math.max(vmax, Math.abs(vel) / dt);
      }
    }
    touch.fill(0);
    support.fill(-1);
    for (let it = 0; it < iters; it++) {
      stretch();
      for (let q = 0; q < SPANS.length; q++) {
        const m = SPANS[q];
        const rest = bend[q];
        for (let i = 0; i + m < n; i++) {
          if (!free[i] && !free[i + m]) continue;
          if (broken[i + m] !== broken[i]) continue;
          const a = 3 * i;
          const b = 3 * (i + m);
          const dx = x[b] - x[a];
          const dy = x[b + 1] - x[a + 1];
          const dz = x[b + 2] - x[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-9;
          const wa = free[i];
          const wb = free[i + m];
          const corr = (kb * (d - rest[i])) / d / (wa + wb);
          x[a] += dx * corr * wa; x[a + 1] += dy * corr * wa; x[a + 2] += dz * corr * wa;
          x[b] -= dx * corr * wb; x[b + 1] -= dy * corr * wb; x[b + 2] -= dz * corr * wb;
        }
      }
      // Self-contact, every pair. With under ~150 nodes this beats a spatial
      // hash (measured: a 27-cell hash was 3–4× slower at n = 36–151).
      contacts = 0;
      for (let i = 0; i < n; i++) {
        if (!free[i]) continue;
        for (let j = i + gap; j < n; j++) {
          if (!free[j]) continue;
          const a = 3 * i;
          const b = 3 * j;
          const dx = x[b] - x[a];
          const dy = x[b + 1] - x[a + 1];
          const dz = x[b + 2] - x[a + 2];
          const m = (rc[i] + rc[j]) * 0.9;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= m * m) continue;
          const d = Math.sqrt(d2) || 1e-9;
          const corr = (0.5 * (d - m)) / d;
          x[a] += dx * corr; x[a + 1] += dy * corr; x[a + 2] += dz * corr;
          x[b] -= dx * corr; x[b + 1] -= dy * corr; x[b + 2] -= dz * corr;
          contacts++;
          if (dy > 0) {
            touch[j] = 1;
            support[j] = i;
          } else {
            touch[i] = 1;
            support[i] = j;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        if (!free[i]) continue;
        const k = 3 * i;
        const floor = rc[i] * sy[i] * 0.92;
        if (x[k + 1] < floor) {
          // Coulomb friction, position-based: the push back up is the normal
          // impulse; sliding is cut by μ times it, or stopped outright.
          const pen = floor - x[k + 1];
          x[k + 1] = floor;
          const dx = x[k] - xp[k];
          const dz = x[k + 2] - xp[k + 2];
          const dh = Math.hypot(dx, dz);
          const f = dh < MU_S * pen ? 1 : Math.min(1, (MU_K * pen) / dh);
          x[k] -= dx * f;
          x[k + 2] -= dz * f;
          touch[i] = 1;
          if (tTouch < 0) tTouch = t;
        }
      }
      stretch();
    }
    for (let q = 0; q < SPANS.length; q++) {
      const m = SPANS[q];
      const rest = bend[q];
      const lim = epsY * m * h;
      for (let i = 0; i + m < n; i++) {
        if (!free[i]) continue;
        const a = 3 * i;
        const b = 3 * (i + m);
        const ex = Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]) - rest[i];
        if (Math.abs(ex) > lim) rest[i] = Math.min(m * h, Math.max(0.3 * m * h, rest[i] + (ex - Math.sign(ex) * lim) * 0.5));
      }
    }
    for (let i = 0; i < n; i++) {
      if (touch[i] && sy[i] > syEq[i]) sy[i] = Math.max(syEq[i], sy[i] - (dt / 0.5) * (sy[i] - syEq[i] + 0.02));
      // Stacked above h_max: it can't hold, so it flows off what it's on.
      const j = support[i];
      if (j < 0) continue;
      const over = x[3 * i + 1] + rc[i] * sy[i] - hmax;
      if (over <= 0) continue;
      let dx = x[3 * i] - x[3 * j];
      let dz = x[3 * i + 2] - x[3 * j + 2];
      const dh = Math.hypot(dx, dz);
      if (dh < 1e-4) {
        dx = Math.cos(i * 2.4);
        dz = Math.sin(i * 2.4);
      } else {
        dx /= dh;
        dz /= dh;
      }
      const step = Math.min(over, 0.3 * rc[i]) * (dt / 0.25);
      x[3 * i] += dx * step;
      x[3 * i + 2] += dz * step;
    }
    // How hard the part that's out pushes back: the worst shortening of any
    // segment still joined to the canal. Past 2% the push can't keep up.
    let squeeze = 0;
    for (let i = n - 2; i >= 0; i--) {
      if (!link[i]) break;
      if (!free[i]) continue;
      const k = 3 * i;
      squeeze = Math.max(squeeze, 1 - Math.hypot(x[k + 3] - x[k], x[k + 4] - x[k + 1], x[k + 5] - x[k + 2]) / h);
    }
    feed += (Math.min(1, Math.max(0, 1 - (squeeze - 0.02) / 0.04)) - feed) * Math.min(1, dt / 0.1);
    // Tear-off: the hanging part's weight on the anus.
    let top = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (free[i]) {
        top = i;
        break;
      }
    }
    drop = 0;
    if (top >= 0 && top < n - 1 && link[top] && !free[top + 1]) {
      let low = Infinity;
      for (let i = top; i >= 0; i--) {
        low = Math.min(low, x[3 * i + 1] - rc[i] * 0.92);
        if (i > 0 && !link[i - 1]) break;
      }
      drop = Math.max(0, H - low);
      // It can't neck off a piece shorter than about its own thickness: that
      // would be a sliver, not a piece (and finer than the rope can resolve).
      const first = breaks.length ? breaks[breaks.length - 1].i + 1 : 0;
      if (drop > Lbreak && L - top * h > 1.5 && (top - first + 1) * h > 2.5 * R) {
        link[top] = 0;
        breaks.push({ i: top, s: (top + 0.5) * h, t });
        for (let k = top + 1; k <= n; k++) broken[k]++;
      }
    }
    // The canal swivels towards the direction the part that's out leaves in.
    if (top > 0 && top < n - 1 && link[top]) {
      const o = Math.max(0, top - Math.ceil(2 * R / h));
      let ux = x[3 * o] - x[3 * top];
      let uy = x[3 * o + 1] - x[3 * top + 1];
      let uz = x[3 * o + 2] - x[3 * top + 2];
      const ul = Math.hypot(ux, uy, uz);
      if (ul > 0.5 * h) {
        const k = Math.min(1, dt / 0.3);
        for (let c = 0; c < 3; c++) e[c] += ((c === 0 ? ux : c === 1 ? uy : uz) / ul - e[c]) * k;
        const el = Math.hypot(e[0], e[1], e[2]);
        for (let c = 0; c < 3; c++) e[c] /= el;
        const cosA = e[0] * EXIT_DIR[0] + e[1] * EXIT_DIR[1] + e[2] * EXIT_DIR[2];
        const MAXA = 0.61;
        if (cosA < Math.cos(MAXA)) {
          // Back onto the 35° cone round the resting axis.
          const px = e[0] - cosA * EXIT_DIR[0];
          const py = e[1] - cosA * EXIT_DIR[1];
          const pz = e[2] - cosA * EXIT_DIR[2];
          const pl = Math.hypot(px, py, pz) || 1;
          e[0] = EXIT_DIR[0] * Math.cos(MAXA) + (px / pl) * Math.sin(MAXA);
          e[1] = EXIT_DIR[1] * Math.cos(MAXA) + (py / pl) * Math.sin(MAXA);
          e[2] = EXIT_DIR[2] * Math.cos(MAXA) + (pz / pl) * Math.sin(MAXA);
        }
      }
    }
    while (t >= nextRec) {
      record();
      nextRec += 1 / EXIT_FPS;
    }
    if (tEmit >= 0 && t > tEmit + 0.2) quiet = vmax < 1.5 ? quiet + dt : 0;
    if (quiet > 0.4 || (tEmit >= 0 && t > tEmit + 6) || t > 3 * (L / v) + 6) break;
  }
  record();
  if (tEmit < 0) tEmit = t;
  return { kind: 'rope', n, h, dt, steps, bakeMs: performance.now() - wall, rec, breaks, Lbreak, lMin: 2.5 * R, hmax, tEmit, tTouch: Math.max(0, tTouch), tEnd: (rec.length - 1) / EXIT_FPS, v, L, radius };
}

// ---------- leaving: types 1 and 5 ----------
// Separate pieces, pushed out one after another at v, then free fall to where
// each one lands (the drift that gets it there is fixed by its fall time);
// on landing it slumps to h_max, or stays as it is if it's hard.
function planBlobs(blobs, H, hmax, spinRng) {
  const e = EXIT_DIR;
  const total = blobs.reduce((s, b) => s + 2 * b.R, 0);
  const pause = 0.55;
  const v = total / Math.max(3, T_EXIT - pause * (blobs.length - 1));
  let t = 0;
  for (const b of blobs) {
    b.t0 = t;
    b.t1 = t + (2 * b.R) / v;
    t = b.t1 + pause;
    b.p1 = [e[0] * b.R, H + e[1] * b.R, e[2] * b.R];
    b.v1 = [v * e[0], v * e[1], v * e[2]];
    b.yLand = b.y + b.R * (1 - b.squash) * 0.9;
    const dy = b.p1[1] - b.yLand;
    const fall = (b.v1[1] + Math.sqrt(b.v1[1] ** 2 + 2 * G * dy)) / G;
    b.tl = b.t1 + fall;
    b.v1[0] = (b.x - b.p1[0]) / fall;
    b.v1[2] = (b.z - b.p1[2]) / fall;
    const a = spinRng() * Math.PI * 2;
    b.axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    b.omega = b.hard ? 4 + spinRng() * 6 : 0;
  }
  const tEnd = Math.max(...blobs.map((b) => b.tl)) + 1.4;
  return { kind: 'blobs', v, tEnd, tTouch: Math.min(...blobs.map((b) => b.tl)), hmax, H, blobs };
}

// Where blob b is at time t: centre, tilt about its axis, and vertical squash.
function blobState(b, H, t, out) {
  const e = EXIT_DIR;
  if (t < b.t1) {
    const d = Math.max(0, t - b.t0) * ((2 * b.R) / (b.t1 - b.t0)) - b.R; // centre's distance past the anus
    out.c.set(e[0] * d, H + e[1] * d, e[2] * d);
    out.angle = -b.omega * (b.tl - b.t1);
    out.sy = 1;
  } else if (t < b.tl) {
    const s = t - b.t1;
    out.c.set(b.p1[0] + b.v1[0] * s, b.p1[1] + b.v1[1] * s - 0.5 * G * s * s, b.p1[2] + b.v1[2] * s);
    out.angle = -b.omega * (b.tl - t);
    out.sy = 1;
  } else {
    const k = Math.exp(-(t - b.tl) / (b.hard ? 0.06 : 0.22));
    out.sy = b.squash + (1 - b.squash) * k;
    out.c.set(b.x, b.y + (b.yLand - b.y) * k, b.z);
    out.angle = 0;
  }
  return out;
}

// ---------- reference geometry ----------
// Every vertex is stored in the frame of a "ring": t along the log, a and b
// across it (b is the frame's up). The skin puts each ring where the physics
// has it this frame, so the same mesh hangs, falls and lies on the floor.

// One piece of a log, from s0 to s1 along it. Ends: 'cap' (the rounded
// front), 'tail' (pinched off by the sphincter), 'torn' (where it snapped).
function tubeRef(noise, type, L, R, look, s0, s1, startKind, endKind) {
  const { off, tail, lumpLen, lumpAmp, crackDepth } = look;
  const len = s1 - s0;
  const NS = Math.max(8, Math.round(len * 26));
  const M = 104;
  const ds = len / NS;
  const capLen = (kind) => (kind === 'cap' ? R * 0.95 : R * 0.6);
  const radius = (s) => {
    let r = R * (1 + 0.06 * noise(s * 0.35, off, 1.7));
    const ph2 = s / lumpLen + 0.35 * noise(s * 0.2, off, 4.4);
    r *= 1 + lumpAmp * (Math.pow(Math.abs(Math.sin(Math.PI * ph2)), 0.5) - 0.62);
    const a = s - s0;
    const c0 = capLen(startKind) * (startKind === 'torn' ? 1 + 0.25 * noise(s0, off, 9) : 1);
    if (a < c0) r *= Math.sqrt(Math.max(0, 1 - (1 - a / c0) ** 2));
    if (endKind === 'tail') {
      const u = (s1 - s) / tail;
      if (u < 1) r *= 1 - Math.pow(1 - Math.max(u, 0), 2.2);
    } else {
      const b = s1 - s;
      const c1 = capLen('torn') * (1 + 0.25 * noise(s1, off, 9));
      if (b < c1) r *= Math.sqrt(Math.max(0, 1 - (1 - b / c1) ** 2));
    }
    return r;
  };
  const local = [];
  const ldir = [];
  const ring = [];
  const crack = [];
  const eligible = [];
  const rings = [];
  const endRoom = endKind === 'tail' ? tail + 0.6 : 0.9;
  const push = (k, s, cosT, sinT, pole) => {
    const r = pole ? 0 : radius(s);
    let dt = 0;
    let da = cosT;
    let db = sinT * 0.92;
    if (pole === 1) [dt, da, db] = [-1, 0, 0];
    else if (pole === 2) [dt, da, db] = [1, 0, 0];
    const dl = Math.hypot(dt, da, db);
    dt /= dl;
    da /= dl;
    db /= dl;
    let pa = cosT * r;
    let pb = sinT * r * 0.92;
    // Surface relief along the outward direction (noise read in the log's own coordinates).
    const arc = Math.atan2(sinT, cosT) * R;
    let d = 0.05 * R * noise(s * 0.5, pa * 0.5, pb * 0.5 + off) + 0.025 * noise(s * 2.2, pa * 2.2, pb * 2.2);
    const n1 = noise(s * 0.75 + 0.3 * noise(s * 0.3, arc * 0.3, off + 5), arc * 0.16, off + 17);
    const n2 = noise(s * 1.7, arc * 0.8, off + 29);
    let c = crackLine(n1, 0.05) + 0.6 * crackLine(n2, 0.035) * smoothstep(-0.2, 0.4, noise(s * 0.4, arc * 0.4, off + 41));
    c = Math.min(1, c) * smoothstep(0.3, 1.2, s - s0) * smoothstep(0.2, 1.5, s1 - s) * (pole ? 0 : 1);
    d -= crackDepth * c;
    local.push(dt * d, pa + da * d, pb + db * d);
    ldir.push(dt, da, db);
    ring.push(k);
    crack.push(c * (crackDepth > 0.05 ? 1 : 0.4));
    eligible.push(!pole && s - s0 > 1.4 && s1 - s > endRoom ? 1 : 0);
  };
  rings.push(s0);
  push(0, s0, 0, 0, 1);
  for (let i = 1; i < NS; i++) {
    rings.push(s0 + i * ds);
    for (let j = 0; j < M; j++) {
      const th = (2 * Math.PI * j) / M;
      push(i, s0 + i * ds, Math.cos(th), Math.sin(th), 0);
    }
  }
  rings.push(s1);
  push(NS, s1, 0, 0, 2);
  const last = 1 + (NS - 1) * M;
  const index = [];
  const ringStart = (i) => 1 + (i - 1) * M;
  for (let j = 0; j < M; j++) index.push(0, ringStart(1) + ((j + 1) % M), ringStart(1) + j);
  for (let i = 1; i < NS - 1; i++) {
    const a = ringStart(i);
    const b = ringStart(i + 1);
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      index.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const lr = ringStart(NS - 1);
  for (let j = 0; j < M; j++) index.push(last, lr + j, lr + ((j + 1) % M));
  return { kind: 'tube', local, ldir, ring, rings, crack, eligible, index, s0, s1, w: 0.22 * R };
}

// One lump or blob (types 1 and 5), centred on its own origin, unsquashed.
function blobRef(noise, type, R, off, squash) {
  let g = new THREE.IcosahedronGeometry(1, type === 1 ? 26 : 48);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const local = [];
  const ldir = [];
  const ring = [];
  const crack = [];
  const eligible = [];
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    let r = R * (1 + 0.13 * noise(dir.x * 1.3 + off, dir.y * 1.3, dir.z * 1.3));
    if (type === 1) r += R * 0.09 * Math.abs(noise(dir.x * 2.6, dir.y * 2.6 + off, dir.z * 2.6));
    else r += R * 0.03 * noise(dir.x * 2.2, dir.y * 2.2 + off, dir.z * 2.2);
    p.copy(dir).multiplyScalar(r);
    let c = 0;
    if (type === 1) {
      c = crackLine(noise(p.x * 1.4 + off, p.y * 1.4, p.z * 1.4), 0.04);
      p.addScaledVector(dir, -0.08 * c + 0.03 * noise(p.x * 3, p.y * 3, p.z * 3));
    } else {
      p.addScaledVector(dir, 0.02 * noise(p.x * 2, p.y * 2, p.z * 2));
    }
    // Frame axes for a blob: t = world x, a = world z, b = world y.
    local.push(p.x, p.z, p.y);
    ldir.push(dir.x, dir.z, dir.y);
    ring.push(0);
    crack.push(c);
    eligible.push(1);
  }
  const index = Array.from(g.index.array);
  g.dispose();
  return { kind: 'blob', local, ldir, ring, rings: [0], crack, eligible, index, w: 0.22 * R * squash };
}

// Blob placements for types 1 and 5: on the floor, or (type 1) on an earlier lump.
function blobLayout(type, rng, hmax) {
  const n = type === 1 ? 7 + Math.floor(rng() * 4) : 3 + Math.floor(rng() * 2);
  const placed = [];
  for (let k = 0; k < n; k++) {
    const R = type === 1 ? 0.85 + rng() * 0.4 : 1.6 + rng() * 0.6;
    // A blob taller than h_max can't hold: it slumps to it (kept above 0.35 so it stays a blob).
    const squash = Math.min(0.88, Math.max(0.35, hmax / (2 * R)));
    for (let tries = 0; tries < 40; tries++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * (type === 1 ? 3.2 : 5.5);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      let y = R * squash * 0.86;
      let clash = false;
      for (const q of placed) {
        const dh = Math.hypot(q.x - x, q.z - z);
        // Slumped blobs spread to R/√squash.
        const touch = (q.R / Math.sqrt(q.squash) + R / Math.sqrt(squash)) * 0.85;
        if (dh < touch) {
          if (type === 5) clash = true;
          else y = Math.max(y, q.y + Math.sqrt(touch * touch - dh * dh) * 0.75);
        }
      }
      if (clash || y > 2.6) continue;
      placed.push({ x, y, z, R, squash, hard: type === 1, off: rng() * 100 });
      break;
    }
  }
  return placed;
}

// ---------- frames and skin ----------
// Fill F (per ring: centre C, axes [T, S, U] in Rm, squash sy, horizontal
// tangent th) for piece pc at time t.
function tubeFrames(pc, ex, t, F, scratch) {
  const { h, rec } = ex;
  const f = Math.min(rec.length - 1.0001, Math.max(0, t * EXIT_FPS));
  const r0 = rec[Math.floor(f)];
  const r1 = rec[Math.floor(f) + 1];
  const al = f - Math.floor(f);
  const { P, U, S, Tn } = scratch;
  const ia = pc.ia;
  const ib = pc.ib;
  for (let i = ia; i <= ib; i++) {
    for (let c = 0; c < 3; c++) {
      P[3 * i + c] = r0.x[3 * i + c] + (r1.x[3 * i + c] - r0.x[3 * i + c]) * al;
      U[3 * i + c] = r0.up[3 * i + c] + (r1.up[3 * i + c] - r0.up[3 * i + c]) * al;
    }
    S[i] = r0.sy[i] + (r1.sy[i] - r0.sy[i]) * al;
  }
  for (let i = ia; i <= ib; i++) {
    const a = Math.max(ia, i - 1);
    const b = Math.min(ib, i + 1);
    const tx = P[3 * b] - P[3 * a];
    const ty = P[3 * b + 1] - P[3 * a + 1];
    const tz = P[3 * b + 2] - P[3 * a + 2];
    const l = Math.hypot(tx, ty, tz) || 1;
    Tn[3 * i] = tx / l;
    Tn[3 * i + 1] = ty / l;
    Tn[3 * i + 2] = tz / l;
  }
  const nr = pc.rings.length;
  for (let k = 0; k < nr; k++) {
    const s = pc.rings[k];
    const fi = s / h;
    let i = Math.floor(fi);
    let u = fi - i;
    let cx;
    let cy;
    let cz;
    if (i < ia || (i === ia && u < 0) || ib === ia) {
      i = ia;
      u = 0;
      const ext = s - ia * h;
      cx = P[3 * ia] + Tn[3 * ia] * ext;
      cy = P[3 * ia + 1] + Tn[3 * ia + 1] * ext;
      cz = P[3 * ia + 2] + Tn[3 * ia + 2] * ext;
    } else if (i >= ib) {
      i = ib - 1;
      u = 1;
      const ext = s - ib * h;
      cx = P[3 * ib] + Tn[3 * ib] * ext;
      cy = P[3 * ib + 1] + Tn[3 * ib + 1] * ext;
      cz = P[3 * ib + 2] + Tn[3 * ib + 2] * ext;
    } else {
      // Catmull–Rom through the nodes, so the log doesn't kink every 4 mm.
      const i0 = Math.max(ia, i - 1);
      const i3 = Math.min(ib, i + 2);
      const u2 = u * u;
      const u3 = u2 * u;
      const w0 = -0.5 * u3 + u2 - 0.5 * u;
      const w1 = 1.5 * u3 - 2.5 * u2 + 1;
      const w2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
      const w3 = 0.5 * u3 - 0.5 * u2;
      cx = w0 * P[3 * i0] + w1 * P[3 * i] + w2 * P[3 * i + 3] + w3 * P[3 * i3];
      cy = w0 * P[3 * i0 + 1] + w1 * P[3 * i + 1] + w2 * P[3 * i + 4] + w3 * P[3 * i3 + 1];
      cz = w0 * P[3 * i0 + 2] + w1 * P[3 * i + 2] + w2 * P[3 * i + 5] + w3 * P[3 * i3 + 2];
    }
    const j = Math.min(ib, i + 1);
    let tx = Tn[3 * i] + (Tn[3 * j] - Tn[3 * i]) * u;
    let ty = Tn[3 * i + 1] + (Tn[3 * j + 1] - Tn[3 * i + 1]) * u;
    let tz = Tn[3 * i + 2] + (Tn[3 * j + 2] - Tn[3 * i + 2]) * u;
    let l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    let ux = U[3 * i] + (U[3 * j] - U[3 * i]) * u;
    let uy = U[3 * i + 1] + (U[3 * j + 1] - U[3 * i + 1]) * u;
    let uz = U[3 * i + 2] + (U[3 * j + 2] - U[3 * i + 2]) * u;
    const d = ux * tx + uy * ty + uz * tz;
    ux -= d * tx;
    uy -= d * ty;
    uz -= d * tz;
    l = Math.hypot(ux, uy, uz) || 1;
    ux /= l;
    uy /= l;
    uz /= l;
    // S = U × T keeps (T, S, U) right-handed.
    const sx = uy * tz - uz * ty;
    const sy = uz * tx - ux * tz;
    const sz = ux * ty - uy * tx;
    F.C[3 * k] = cx;
    F.C[3 * k + 1] = cy;
    F.C[3 * k + 2] = cz;
    F.Rm.set([tx, ty, tz, sx, sy, sz, ux, uy, uz], 9 * k);
    F.sy[k] = S[i] + (S[j] - S[i]) * u;
    const hl = Math.hypot(tx, tz) || 1;
    F.th[2 * k] = tx / hl;
    F.th[2 * k + 1] = tz / hl;
  }
}

const _bs = { c: new THREE.Vector3(), angle: 0, sy: 1 };
const _q = new THREE.Quaternion();
const _m3 = new THREE.Matrix4();
function blobFrames(pc, plan, t, F) {
  const b = pc.blob;
  blobState(b, plan.H, t, _bs);
  _q.setFromAxisAngle(b.axis, _bs.angle);
  _m3.makeRotationFromQuaternion(_q);
  const m = _m3.elements;
  // Columns of the rotation: images of world x (t), world z (a), world y (b).
  F.Rm.set([m[0], m[1], m[2], m[8], m[9], m[10], m[4], m[5], m[6]], 0);
  F.C[0] = _bs.c.x;
  F.C[1] = _bs.c.y;
  F.C[2] = _bs.c.z;
  F.sy[0] = _bs.sy;
}

// World positions (and rigid directions) of every vertex of pc, from its frames.
function skin(pc, F, outPos, outDir) {
  const { local, ldir, ring } = pc;
  const blob = pc.kind === 'blob';
  const nv = ring.length;
  for (let v = 0; v < nv; v++) {
    const k = ring[v];
    const R = F.Rm;
    const r = 9 * k;
    const lt = local[3 * v];
    const la = local[3 * v + 1];
    const lb = local[3 * v + 2];
    let ox = R[r] * lt + R[r + 3] * la + R[r + 6] * lb;
    let oy = R[r + 1] * lt + R[r + 4] * la + R[r + 7] * lb;
    let oz = R[r + 2] * lt + R[r + 5] * la + R[r + 8] * lb;
    const dt = ldir[3 * v];
    const da = ldir[3 * v + 1];
    const db = ldir[3 * v + 2];
    const dx = R[r] * dt + R[r + 3] * da + R[r + 6] * db;
    const dy = R[r + 1] * dt + R[r + 4] * da + R[r + 7] * db;
    const dz = R[r + 2] * dt + R[r + 5] * da + R[r + 8] * db;
    // Slump, in world space: squashed vertically by sy and spread
    // sideways (across the log, or every way for a blob) to keep its volume.
    const sy = F.sy[k];
    if (sy < 0.999) {
      oy *= sy;
      if (blob) {
        const g = 1 / Math.sqrt(sy);
        ox *= g;
        oz *= g;
      } else {
        const hx = F.th[2 * k];
        const hz = F.th[2 * k + 1];
        const par = ox * hx + oz * hz;
        ox = par * hx + (ox - par * hx) / sy;
        oz = par * hz + (oz - par * hz) / sy;
      }
    }
    const i = 3 * v;
    outPos[i] = F.C[3 * k] + ox;
    outPos[i + 1] = F.C[3 * k + 1] + oy;
    outPos[i + 2] = F.C[3 * k + 2] + oz;
    sagInto(outPos, i, dx, dz, pc.w);
    if (outDir) {
      outDir[i] = dx;
      outDir[i + 1] = dy;
      outDir[i + 2] = dz;
    }
  }
}

// The pieces of a ring frame k as a THREE basis / centre, and the slump
// mapping for a single point (used for kernels).
function ringBasis(F, k, m4) {
  const R = F.Rm;
  const r = 9 * k;
  return m4.set(R[r], R[r + 3], R[r + 6], 0, R[r + 1], R[r + 4], R[r + 7], 0, R[r + 2], R[r + 5], R[r + 8], 0, 0, 0, 0, 1);
}
function slumpOffset(F, k, blob, o, inverse) {
  const sy = F.sy[k];
  if (sy >= 0.999) return o;
  const f = inverse ? 1 / sy : sy;
  o.y *= f;
  if (blob) {
    const g = inverse ? Math.sqrt(sy) : 1 / Math.sqrt(sy);
    o.x *= g;
    o.z *= g;
  } else {
    const hx = F.th[2 * k];
    const hz = F.th[2 * k + 1];
    const par = o.x * hx + o.z * hz;
    o.x = par * hx + (o.x - par * hx) / f;
    o.z = par * hz + (o.z - par * hz) / f;
  }
  return o;
}

function makeFrames(nr) {
  return { C: new Float32Array(3 * nr), Rm: new Float32Array(9 * nr), sy: new Float32Array(nr).fill(1), th: new Float32Array(2 * nr) };
}

// ---------- the specimen ----------
function buildSpecimen(type, nCorn, seed, kernelShapes, opts) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const water = waterOf(type, opts.water);
  const tau = yieldStress(water);
  const rho = RHO_STOOL * (1 - opts.gas);
  const H = opts.height;
  const pieces = [];
  let exit;
  if (type >= 2 && type <= 4) {
    const L = (type === 2 ? 12 : 14) + rng() * 4;
    const R = type === 2 ? 1.5 : 1.3 + rng() * 0.15;
    const look = {
      off: rng() * 100,
      tail: 2.2 + rng() * 1.6,
      lumpLen: 1.8 + rng() * 0.6,
      lumpAmp: type === 2 ? 0.17 : type === 3 ? 0.05 : 0.025,
      crackDepth: type === 3 ? 0.17 : type === 2 ? 0.12 : 0.025,
    };
    // The whole log's radius, for contact in the simulation.
    const whole = tubeRef(noise, type, L, R, look, 0, L, 'cap', 'tail');
    const radiusAt = (s) => {
      const k = Math.min(whole.rings.length - 2, Math.max(1, Math.round((s / L) * (whole.rings.length - 1))));
      return Math.hypot(whole.local[3 * (1 + (k - 1) * 104) + 1], whole.local[3 * (1 + (k - 1) * 104) + 2]);
    };
    exit = bakeExit({ L, radius: radiusAt, v: L / T_EXIT, tau, rho, H, seed });
    exit.radiusAt = radiusAt;
    // One mesh per piece it tore into.
    const cuts = [0, ...exit.breaks.map((b) => b.s), L];
    for (let p = 0; p < cuts.length - 1; p++) {
      const pc = p === 0 && cuts.length === 2 ? whole : tubeRef(noise, type, L, R, look, cuts[p], cuts[p + 1], p === 0 ? 'cap' : 'torn', p === cuts.length - 2 ? 'tail' : 'torn');
      pc.ia = Math.ceil(cuts[p] / exit.h - 1e-6);
      pc.ib = Math.min(exit.n - 1, Math.floor(cuts[p + 1] / exit.h + 1e-6));
      if (pc.ib <= pc.ia) pc.ib = Math.min(exit.n - 1, pc.ia + 1);
      pieces.push(pc);
    }
    const n = exit.n;
    exit.scratch = { P: new Float32Array(3 * n), U: new Float32Array(3 * n), S: new Float32Array(n), Tn: new Float32Array(3 * n) };
  } else {
    const hmax = (2 * tau * 10) / (rho * G);
    const blobs = blobLayout(type, rng, hmax);
    exit = planBlobs(blobs, H, hmax, rng);
    exit.Lbreak = (Math.sqrt(3) * tau * 10) / (rho * G);
    exit.breaks = [];
    for (const b of blobs) {
      const pc = blobRef(noise, type, b.R, b.off, b.squash);
      pc.blob = b;
      pieces.push(pc);
    }
  }
  exit.tau = tau;
  exit.water = water;
  exit.rho = rho;

  // Typed arrays, frames, and the final pose (t = end).
  for (const pc of pieces) {
    const nv = pc.ring.length;
    pc.local = Float32Array.from(pc.local);
    pc.ldir = Float32Array.from(pc.ldir);
    pc.ring = Uint16Array.from(pc.ring);
    pc.F = makeFrames(pc.rings.length);
    pc.pos = new Float32Array(3 * nv);
    pc.dir = new Float32Array(3 * nv);
  }
  const frames = (pc, t) => (pc.kind === 'blob' ? blobFrames(pc, exit, t, pc.F) : tubeFrames(pc, exit, t, pc.F, exit.scratch));
  const tEnd = exit.tEnd;
  for (const pc of pieces) {
    frames(pc, tEnd);
    skin(pc, pc.F, pc.pos, pc.dir);
  }

  // Kernels: pick surface points that face up once it's all landed.
  const kernels = [];
  const cand = [];
  pieces.forEach((pc, pi) => {
    for (let i = 0; i < pc.eligible.length; i++) {
      if (pc.eligible[i] && pc.dir[3 * i + 1] > (pc.kind === 'blob' ? 0.1 : 0.05) && rng() < 0.05) cand.push([pi, i]);
    }
  });
  const tries = cand.length;
  const m4 = new THREE.Matrix4();
  for (let t = 0; t < tries * 3 && kernels.length < nCorn && cand.length; t++) {
    const [pi, vi] = cand[Math.floor(rng() * cand.length)];
    const pc = pieces[pi];
    const P = new THREE.Vector3(pc.pos[3 * vi], pc.pos[3 * vi + 1], pc.pos[3 * vi + 2]);
    if (kernels.some((k) => k.P.distanceTo(P) < 1.5)) continue;
    const n = new THREE.Vector3(pc.dir[3 * vi], pc.dir[3 * vi + 1], pc.dir[3 * vi + 2]).normalize();
    const hull = rng() < 0.3;
    const shape = kernelShapes[hull ? 1 : 0];
    const scale = 0.9 + rng() * 0.22;
    // Lies mostly flat in the surface, crown tipped out by 12–45°.
    const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(n, ref).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    const spin = rng() * Math.PI * 2;
    const tang = t1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(t2, Math.sin(spin));
    const tilt = (12 + rng() * 33) * (Math.PI / 180);
    const yAx = tang.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(n, Math.sin(tilt)).normalize();
    const zAx = n.clone().addScaledVector(yAx, -n.dot(yAx)).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    const basis = new THREE.Matrix4().makeBasis(xAx, yAx, zAx);
    const sink = (hull ? 0.0 : -0.04) + rng() * (hull ? 0.05 : 0.12);
    const C = P.clone().addScaledVector(n, -sink);
    const half = shape.half.clone().multiplyScalar(scale);
    // The kernel's pose in its ring's frame, so it rides along while it all moves.
    const ringK = pc.ring[vi];
    const Rk = ringBasis(pc.F, ringK, new THREE.Matrix4());
    const RkT = Rk.clone().transpose();
    const Ck = new THREE.Vector3(pc.F.C[3 * ringK], pc.F.C[3 * ringK + 1], pc.F.C[3 * ringK + 2]);
    const toLocal = (p) => slumpOffset(pc.F, ringK, pc.kind === 'blob', p.clone().sub(Ck), true).applyMatrix4(RkT);
    const rel = {
      ring: ringK,
      C: toLocal(C),
      P: toLocal(P),
      n: n.clone().applyMatrix4(RkT),
      basis: m4.copy(RkT).multiply(basis).clone(),
    };
    kernels.push({ P, n, C, basis, half, hull, scale, mass: shape.volume * scale ** 3 * RHO_CORN, piece: pi, rel });
  }

  // Carve each socket in the final pose: a vertex inside a kernel's (enlarged)
  // ellipsoid goes along −dir to where that line leaves the ellipsoid. A thin
  // rim of pushed stool rises round it. The same moves are made in the
  // vertex's own frame, so the socket travels with it.
  const inv = new THREE.Matrix4();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const geos = [];
  for (let pi = 0; pi < pieces.length; pi++) {
    const pc = pieces[pi];
    const nv = pc.ring.length;
    const cav = new Float32Array(nv);
    for (const k of kernels) {
      if (k.piece !== pi) continue;
      inv.copy(k.basis).invert();
      const ax = [k.half.x * 1.07, k.half.y * 1.05, k.half.z * 1.12];
      const reach = Math.max(...ax) * 1.35;
      for (let i = 0; i < nv; i++) {
        const px = pc.pos[3 * i];
        const py = pc.pos[3 * i + 1];
        const pz = pc.pos[3 * i + 2];
        if (Math.abs(px - k.C.x) > reach || Math.abs(py - k.C.y) > reach || Math.abs(pz - k.C.z) > reach) continue;
        o.set(px - k.C.x, py - k.C.y, pz - k.C.z).applyMatrix4(inv);
        d.set(-pc.dir[3 * i], -pc.dir[3 * i + 1], -pc.dir[3 * i + 2]).transformDirection(inv);
        const ox = o.x / ax[0];
        const oy = o.y / ax[1];
        const oz = o.z / ax[2];
        const q = ox * ox + oy * oy + oz * oz;
        let move = 0;
        if (q < 1) {
          const dx = d.x / ax[0];
          const dy = d.y / ax[1];
          const dz = d.z / ax[2];
          const A = dx * dx + dy * dy + dz * dz;
          const B = 2 * (ox * dx + oy * dy + oz * dz);
          move = -(-B + Math.sqrt(B * B - 4 * A * (q - 1))) / (2 * A);
          cav[i] = 1;
          pc.crack[i] = 0;
        } else if (q < 1.45) {
          move = 0.035 * Math.sin(((q - 1) / 0.45) * Math.PI);
          cav[i] = Math.max(cav[i], 0.35 * (1 - (q - 1) / 0.45));
        }
        if (move) {
          for (let c = 0; c < 3; c++) pc.pos[3 * i + c] += pc.dir[3 * i + c] * move;
          // The same move in the vertex's frame: undo the slump, then the rotation.
          const rk = pc.ring[i];
          o.set(pc.dir[3 * i] * move, pc.dir[3 * i + 1] * move, pc.dir[3 * i + 2] * move);
          slumpOffset(pc.F, rk, pc.kind === 'blob', o, true).applyMatrix4(ringBasis(pc.F, rk, m4).transpose());
          pc.local[3 * i] += o.x;
          pc.local[3 * i + 1] += o.y;
          pc.local[3 * i + 2] += o.z;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pc.pos), 3));
    g.setAttribute('aCrack', new THREE.Float32BufferAttribute(pc.crack, 1));
    g.setAttribute('aCav', new THREE.BufferAttribute(cav, 1));
    const ref = new Float32Array(3 * nv);
    for (let i = 0; i < nv; i++) {
      const lt = pc.local[3 * i];
      const la = pc.local[3 * i + 1];
      const lb = pc.local[3 * i + 2];
      if (pc.kind === 'blob') ref.set([lt + pc.blob.off, lb, la], 3 * i);
      else ref.set([pc.rings[pc.ring[i]] + lt, lb, la], 3 * i);
    }
    g.setAttribute('aRef', new THREE.BufferAttribute(ref, 3));
    g.setIndex(pc.index);
    pc.geo = g;
    geos.push(g);
  }

  // Volume (divergence theorem) and area of the final pose; flip any piece built inside out.
  let V = 0;
  let A = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const pieceV = [];
  for (const g of geos) {
    const pos = g.attributes.position;
    const idx = g.index.array;
    let v = 0;
    for (let k = 0; k < idx.length; k += 3) {
      a.fromBufferAttribute(pos, idx[k]);
      b.fromBufferAttribute(pos, idx[k + 1]);
      c.fromBufferAttribute(pos, idx[k + 2]);
      v += a.dot(b.clone().cross(c)) / 6;
      A += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    if (v < 0) {
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
      g.index.needsUpdate = true;
    }
    V += Math.abs(v);
    pieceV.push(v);
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  // Footprint for the contact shadow / stain, and the top for steam.
  const foot = [];
  const top = [];
  for (const g of geos) {
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i += 2) {
      const y = pos.getY(i);
      if (y < 0.5) foot.push(pos.getX(i), pos.getZ(i), y);
      if (nrm.getY(i) > 0.55 && i % 6 === 0) top.push(pos.getX(i), y, pos.getZ(i));
    }
  }
  const box = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  const spec = { geos, pieces, kernels, V, A, foot, top, box, exit, frames, H, type, nCorn };
  spec.checks = checkSpecimen(spec, pieceV);
  return spec;
}

// Automated checks on a finished specimen, shown in the instruments panel.
// They catch broken geometry (NaNs, inside-out or folded pieces) and a
// simulation that went wrong (stretched rope, things sunk into the floor).
function checkSpecimen(spec, pieceV) {
  const out = [];
  const ok = (pass, text) => out.push({ pass, text });
  let finite = true;
  for (const g of spec.geos) for (const x of g.attributes.position.array) if (!Number.isFinite(x)) finite = false;
  ok(finite && Number.isFinite(spec.V) && Number.isFinite(spec.A), 'Every vertex, V and A are finite numbers');
  // The deflated count is fine (the mesh was flipped); a piece that was
  // neither way round (V ≈ 0) is broken.
  ok(pieceV.every((v) => Math.abs(v) > 1e-3), `All ${pieceV.length} piece${pieceV.length === 1 ? '' : 's'} enclose volume`);
  // Nominal shape: the rope's cylinders, or the blobs' spheres, before any sag.
  const ex = spec.exit;
  let V0 = 0;
  let A0 = 0;
  if (ex.kind === 'rope') {
    for (let i = 0; i < ex.n; i++) {
      const r = ex.radiusAt(i * ex.h);
      V0 += Math.PI * r * r * ex.h;
      A0 += 2 * Math.PI * r * ex.h;
    }
  } else {
    for (const b of ex.blobs) {
      V0 += (4 / 3) * Math.PI * b.R ** 3;
      A0 += 4 * Math.PI * b.R ** 2;
    }
  }
  ok(Math.abs(spec.V / V0 - 1) < 0.25, `Volume within 25% of the nominal shape (V/V₀ = ${fmt(spec.V / V0, 2)})`);
  ok(spec.A ** 3 >= 36 * Math.PI * spec.V ** 2, `Isoperimetric inequality A³ ≥ 36πV² holds (A/A_min = ${fmt(spec.A / Math.cbrt(36 * Math.PI * spec.V ** 2), 2)})`);
  ok(spec.A / A0 < 2.2, `Surface not folded over itself (A/A₀ = ${fmt(spec.A / A0, 2)}, under 2.2)`);
  // Fewer than asked is fine when the upward-facing surface ran out of room
  // (kernels sit at least 1.5 cm apart); none at all when some were asked for isn't.
  ok(spec.nCorn === 0 || spec.kernels.length > 0, `Corn placed: ${spec.kernels.length} of ${spec.nCorn}${spec.kernels.length < spec.nCorn ? ' (no room for more, 1.5 cm apart)' : ''}`);
  if (ex.kind === 'rope') {
    const strain = Math.max(...ex.rec.map((r) => r.strain));
    const pen = Math.max(...ex.rec.map((r) => r.pen));
    ok(strain < 0.25, `Rope segments stretched at most ${fmt(strain * 100, 1)}% (limit 25%)`);
    ok(pen < 0.2, `Deepest overlap with the floor ${fmt(pen * 10, 1)} mm (limit 2 mm)`);
    ok(ex.rec.every((r) => Number.isFinite(r.ek) && Number.isFinite(r.ep)), 'Energy stayed finite through the exit');
  }
  return out;
}

// ---------- the cut ----------
// Slice every piece with the plane n·x = d (n·x ≤ d is kept). Each triangle
// that straddles it gives one segment of the section's outline; segments
// meet at shared mesh edges, so chaining them by edge gives closed loops.
// Volumes on both sides come from the divergence theorem with the origin
// on the plane: the cap then adds nothing (x·n = 0 on it), so
// V = ⅙ Σ det(a, b, c) over the clipped triangles alone. V_kept + V_cut
// must equal V: that's one of the checks.
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _sc = new THREE.Vector3();
function section(geos, n, d) {
  const ox = n.x * d;
  const oy = n.y * d;
  const oz = n.z * d;
  const det = (p, q, r) =>
    (p[0] - ox) * ((q[1] - oy) * (r[2] - oz) - (q[2] - oz) * (r[1] - oy)) -
    (p[1] - oy) * ((q[0] - ox) * (r[2] - oz) - (q[2] - oz) * (r[0] - ox)) +
    (p[2] - oz) * ((q[0] - ox) * (r[1] - oy) - (q[1] - oy) * (r[0] - ox));
  // Fan volume of a polygon (list of points) around the plane origin.
  const fan = (poly) => {
    let v = 0;
    for (let k = 1; k + 1 < poly.length; k++) v += det(poly[0], poly[k], poly[k + 1]) / 6;
    return v;
  };
  let keptV = 0;
  let cutV = 0;
  let totalV = 0; // the same sum without the knife, for the check
  const loops = [];
  geos.forEach((g, gi) => {
    const pos = g.attributes.position.array;
    const idx = g.index.array;
    const nv = pos.length / 3;
    const dist = new Float32Array(nv);
    for (let i = 0; i < nv; i++) dist[i] = n.x * pos[3 * i] + n.y * pos[3 * i + 1] + n.z * pos[3 * i + 2] - d;
    const P = (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    const pts = new Map(); // edge key → crossing point
    const cross = (a, b) => {
      const key = a < b ? a * nv + b : b * nv + a;
      let p = pts.get(key);
      if (!p) {
        const t = dist[a] / (dist[a] - dist[b]);
        p = [pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t, pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t, pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t];
        p.key = key;
        pts.set(key, p);
      }
      return p;
    };
    // The same determinant straight from the buffer (most triangles are whole).
    const detIdx = (a, b, c) => {
      const ax = pos[3 * a] - ox, ay = pos[3 * a + 1] - oy, az = pos[3 * a + 2] - oz;
      const bx = pos[3 * b] - ox, by = pos[3 * b + 1] - oy, bz = pos[3 * b + 2] - oz;
      const cx = pos[3 * c] - ox, cy = pos[3 * c + 1] - oy, cz = pos[3 * c + 2] - oz;
      return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    };
    const next = new Map(); // segment on the outline: key → next key
    for (let k = 0; k < idx.length; k += 3) {
      const o0 = dist[idx[k]] > 0;
      const o1 = dist[idx[k + 1]] > 0;
      const o2 = dist[idx[k + 2]] > 0;
      const v6 = detIdx(idx[k], idx[k + 1], idx[k + 2]) / 6;
      totalV += v6;
      if (o0 === o1 && o1 === o2) {
        if (o0) cutV += v6;
        else keptV += v6;
        continue;
      }
      const tri = [idx[k], idx[k + 1], idx[k + 2]];
      const out = [o0, o1, o2];
      // Sutherland–Hodgman on both sides at once.
      const keep = [];
      const lose = [];
      let enter = null;
      let leave = null;
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        (out[e] ? lose : keep).push(P(a));
        if (out[e] !== out[(e + 1) % 3]) {
          const p = cross(a, b);
          keep.push(p);
          lose.push(p);
          if (out[e]) enter = p;
          else leave = p;
        }
      }
      keptV += fan(keep);
      cutV += fan(lose);
      // Walking the kept side's boundary: … → leave → (along the cap) → enter → …
      // The cap edge runs the other way round: enter → leave on the solid's outline.
      next.set(leave.key, enter.key);
    }
    // Chain into loops.
    const seen = new Set();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let k = start;
      while (k !== undefined && !seen.has(k)) {
        seen.add(k);
        loop.push(pts.get(k));
        k = next.get(k);
      }
      if (k === start && loop.length >= 3) {
        loop.piece = gi;
        loops.push(loop);
      }
    }
  });
  // 2D coordinates in the plane: u, v with u × v = n.
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
  u.addScaledVector(n, -u.dot(n)).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const flat = loops.map((loop) => loop.map((p) => new THREE.Vector2(p[0] * u.x + p[1] * u.y + p[2] * u.z, p[0] * v.x + p[1] * v.y + p[2] * v.z)));
  // Which loops are holes: inside an odd number of others of the same piece
  // (separate pieces can overlap where they landed on each other).
  const inside = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (poly[i].y > pt.y !== poly[j].y > pt.y && pt.x < ((poly[j].x - poly[i].x) * (pt.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
    }
    return c;
  };
  const depth = flat.map((f, i) => flat.reduce((s, g, j) => s + (j !== i && loops[j].piece === loops[i].piece && inside(f[0], g) ? 1 : 0), 0));
  let area = 0;
  const capPos = [];
  const capIdx = [];
  flat.forEach((f, i) => {
    const a = Math.abs(THREE.ShapeUtils.area(f));
    area += depth[i] % 2 ? -a : a;
    if (depth[i] % 2) return;
    const holes = flat.filter((g, j) => depth[j] === depth[i] + 1 && loops[j].piece === loops[i].piece && inside(g[0], f));
    const faces = THREE.ShapeUtils.triangulateShape(f, holes);
    const base = capPos.length / 3;
    for (const l of [loops[i], ...holes.map((h) => loops[flat.indexOf(h)])]) for (const p of l) capPos.push(p[0], p[1], p[2]);
    for (const [a, b, c] of faces) {
      // Face +n (out of the solid, towards the part that was cut away).
      _sa.fromArray(capPos, 3 * (base + a));
      _sb.fromArray(capPos, 3 * (base + b)).sub(_sa);
      _sc.fromArray(capPos, 3 * (base + c)).sub(_sa);
      if (_sb.cross(_sc).dot(n) >= 0) capIdx.push(base + a, base + b, base + c);
      else capIdx.push(base + a, base + c, base + b);
    }
  });
  return { area, keptV, cutV, totalV, loops, flat, depth, u, v, capPos, capIdx };
}

// The share of the cut that is gas, sampled on a grid over the section
// (scanline fill: even–odd over all loops, which also handles holes).
// Delesse (1847): on a random plane, area fraction = volume fraction.
function sectionVoids(sec, n, d, r0) {
  if (sec.area <= 0 || !sec.flat.length) return { frac: 0, samples: 0 };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const f of sec.flat) for (const p of f) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const step = Math.max(0.02, Math.sqrt(sec.area / 6000));
  const o = {};
  let total = 0;
  let gas = 0;
  const xs = [];
  for (let y = y0 + step / 2; y < y1; y += step) {
    xs.length = 0;
    for (const f of sec.flat) {
      for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
        const a = f[i];
        const b = f[j];
        if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil((xs[k] - x0) / step) * step + x0; x < xs[k + 1]; x += step) {
        // Back to 3D, on the plane (in the specimen's own coordinates, like the section).
        const px = sec.u.x * x + sec.v.x * y + n.x * d;
        const py = sec.u.y * x + sec.v.y * y + n.y * d;
        const pz = sec.u.z * x + sec.v.z * y + n.z * d;
        total++;
        if (voidAt(px, py, pz, r0, o).q > 0) gas++;
      }
    }
  }
  return { frac: total ? gas / total : 0, samples: total };
}

// ---------- where it comes from ----------
// The underside of a squatting person, as a polar grid round the anus: a
// short canal (rectal mucosa) that opens to whatever is passing, the anal
// verge with its radial folds (they flatten as the sphincter stretches), the
// pigmented perianal skin, and the two buttocks, the lower surfaces of two
// ellipsoids joined by a smooth minimum (the cleft). It fades out upwards.
const BODY_NR = 72;
const BODY_NA = 132;
function createBody() {
  const nv = (BODY_NR + 1) * BODY_NA;
  const pos = new Float32Array(3 * nv);
  const col = new Float32Array(4 * nv);
  const index = [];
  for (let j = 0; j < BODY_NR; j++) {
    for (let i = 0; i < BODY_NA; i++) {
      const a = j * BODY_NA + i;
      const b = j * BODY_NA + ((i + 1) % BODY_NA);
      index.push(a, a + BODY_NA, b, b, a + BODY_NA, b + BODY_NA);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(index);
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, sheen: 0.4, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x9a4a38),
    alphaHash: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  const e = EXIT_DIR;
  // Axes across the canal: X, and Z' = X × e (both ⟂ e).
  const X = [1, 0, 0];
  const Z = [0, e[2], -e[1]];
  const smin = (a, b, k) => {
    const hh = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - hh * hh * k * 0.25;
  };
  const lobe = (x, z, side) => {
    const dx = x - side * 7.2;
    const dz = (z + 0.8) * 0.92;
    const d = Math.hypot(dx, dz);
    return d < 10 ? 9.5 - Math.sqrt(100 - d * d) : 9.5 + (d - 10) * 3.5;
  };
  const skinCol = [0.62, 0.38, 0.28];
  const perianal = [0.27, 0.13, 0.1];
  const mucosa = [0.32, 0.045, 0.05];
  let last = '';
  function update(A, open, rise) {
    const key = `${A[0].toFixed(3)},${A[2].toFixed(3)},${open.toFixed(3)},${rise.toFixed(2)}`;
    if (key === last) return;
    last = key;
    const closed = 1 - Math.min(1, Math.max(0, (open - 0.15) / 1.0));
    const rOpen = Math.max(0.1, open);
    for (let j = 0; j <= BODY_NR; j++) {
      const u = j / BODY_NR;
      for (let i = 0; i < BODY_NA; i++) {
        const ph = (i / BODY_NA) * Math.PI * 2;
        const cp = Math.cos(ph);
        const sp = Math.sin(ph);
        const fold = Math.cos(16 * ph + 0.6 * Math.sin(5 * ph)) * (0.6 + 0.4 * Math.sin(3 * ph + 1));
        const v = j * BODY_NA + i;
        let x;
        let y;
        let z;
        let c;
        let alpha = 1;
        if (u < 0.12) {
          // The canal: up along −e, puckered when shut.
          const depth = ((0.12 - u) / 0.12) * 2.6;
          const r = rOpen * (1 + 0.25 * closed * fold);
          x = A[0] + (X[0] * cp + Z[0] * sp) * r - e[0] * depth;
          y = A[1] + (X[1] * cp + Z[1] * sp) * r - e[1] * depth;
          z = A[2] + (X[2] * cp + Z[2] * sp) * r - e[2] * depth;
          c = mucosa;
        } else {
          const w = (u - 0.12) / 0.88;
          const rho = rOpen + (19 - rOpen) * Math.pow(w, 1.7);
          const lx = rho * cp;
          const lz = rho * sp;
          const env = smin(lobe(lx, lz, 1), lobe(lx, lz, -1), 3);
          const near = rho - rOpen;
          // Folds of the anal verge: deepest when it's shut, gone when stretched.
          const verge = Math.pow(Math.max(0, 1 - near / 2.4), 2);
          let ly = env * smoothstep(0, 4.5, near) + 0.22 * closed * fold * verge * (1 - verge * 0.5);
          ly += 0.12 * (1 - closed) * smoothstep(0, 0.6, near) * smoothstep(1.6, 0.6, near); // the stretched rim bulges
          x = A[0] + lx;
          y = A[1] + ly;
          z = A[2] + lz;
          const pig = smoothstep(3.2, 1.0, near);
          c = [0, 1, 2].map((k) => skinCol[k] + (perianal[k] - skinCol[k]) * pig);
          if (near < 0.25) c = c.map((k, q) => k + (mucosa[q] - k) * (1 - near / 0.25) * 0.7);
          alpha = 1 - smoothstep(7.5, 12.5, ly);
        }
        pos[3 * v] = x;
        pos[3 * v + 1] = y + rise;
        pos[3 * v + 2] = z;
        col[4 * v] = c[0];
        col[4 * v + 1] = c[1];
        col[4 * v + 2] = c[2];
        col[4 * v + 3] = alpha * (1 - smoothstep(10, 30, rise));
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  return { mesh, update, dispose: () => (geo.dispose(), mat.dispose()) };
}

// A canvas texture over [−S, S]² of the floor: soft dark where the specimen
// is close (contact shadow), or a wet stain where it touches.
function footprintTexture(foot, S, kind) {
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const k = N / (2 * S);
  const step = kind === 'ao' ? 3 : 1;
  for (let i = 0; i < foot.length; i += 3 * step) {
    const x = (foot[i] + S) * k;
    const y = (foot[i + 1] + S) * k;
    const h = foot[i + 2];
    const rad = (kind === 'ao' ? 1.4 + h * 2.2 : 0.22 + h * 0.4) * k;
    const alpha = kind === 'ao' ? 0.05 * (1 - h * 1.4) : h < 0.12 ? 0.35 : 0.06;
    if (alpha <= 0) continue;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function noiseCanvasTexture(seed, base, spread, speckle) {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const noise = makeNoise(seed);
  const rnd = mulberry32(seed + 1);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Tileable: noise on a torus.
      const u = (x / N) * Math.PI * 2;
      const v = (y / N) * Math.PI * 2;
      let n = 0;
      for (let o = 0, f = 1.5, a = 0.5; o < 4; o++, f *= 2.1, a *= 0.5) {
        n += a * noise(Math.cos(u) * f, Math.sin(u) * f + Math.cos(v) * f, Math.sin(v) * f);
      }
      let l = base + spread * n;
      if (rnd() < speckle) l += (rnd() - 0.5) * 0.5;
      const i = 4 * (y * N + x);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, l * 255));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------- the floor ----------
function buildFloor(kind, prints) {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const S = 16;
  let floor;
  if (kind === 0) {
    // Glazed porcelain.
    floor = new THREE.Mesh(keep(new THREE.CircleGeometry(150, 96)), keep(new THREE.MeshPhysicalMaterial({ color: 0xeeece6, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 })));
  } else if (kind === 1) {
    const tex = keep(noiseCanvasTexture(5, 0.5, 0.28, 0.08));
    tex.repeat.set(10, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    const rough = keep(noiseCanvasTexture(5, 0.85, 0.2, 0.0));
    rough.repeat.set(10, 10);
    floor = new THREE.Mesh(keep(new THREE.CircleGeometry(150, 96)), keep(new THREE.MeshStandardMaterial({ color: 0xa29d96, map: tex, roughnessMap: rough, roughness: 1, bumpMap: tex, bumpScale: 0.6 })));
  } else {
    const tex = keep(noiseCanvasTexture(9, 0.45, 0.35, 0.02));
    tex.repeat.set(16, 16);
    tex.colorSpace = THREE.SRGBColorSpace;
    floor = new THREE.Mesh(keep(new THREE.CircleGeometry(150, 96)), keep(new THREE.MeshStandardMaterial({ color: 0x4a4a22, map: tex, roughness: 0.95 })));
  }
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Contact shadow (all floors) and a wet stain (porcelain, concrete), one
  // pair per specimen (two when comparing). They appear as it lands.
  const plane = keep(new THREE.PlaneGeometry(2 * S, 2 * S));
  const fades = [];
  for (const { foot, dx } of prints) {
    const ao = new THREE.Mesh(plane, keep(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: keep(footprintTexture(foot, S, 'ao')), transparent: true, opacity: kind === 0 ? 0.85 : 0.7, depthWrite: false })));
    ao.rotation.x = -Math.PI / 2;
    ao.position.set(dx, 0.004, 0);
    ao.renderOrder = 1;
    group.add(ao);
    const f = [[ao.material, ao.material.opacity]];
    if (kind !== 2) {
      const stain = new THREE.Mesh(
        plane,
        keep(new THREE.MeshPhysicalMaterial({ color: kind === 0 ? 0x3a2410 : 0x1a1408, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3, alphaMap: keep(footprintTexture(foot, S, 'stain')), transparent: true, opacity: kind === 0 ? 0.75 : 0.55, depthWrite: false })),
      );
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(dx, 0.008, 0);
      stain.renderOrder = 2;
      group.add(stain);
      f.push([stain.material, stain.material.opacity]);
    }
    fades.push(f);
  }

  if (kind === 2) {
    // Mown grass, 2–4.5 cm. None under the specimen; flattened blades next to it.
    const rnd = mulberry32(13);
    const blade = keep(new THREE.PlaneGeometry(0.16, 1, 1, 4));
    blade.translate(0, 0.5, 0);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      bp.setX(i, bp.getX(i) * (1 - y * 0.85));
      bp.setZ(i, y * y * 0.25);
    }
    blade.computeVertexNormals();
    const count = 14000;
    const mesh = new THREE.InstancedMesh(blade, keep(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), count);
    const footGrid = new Set();
    for (const { foot, dx } of prints) for (let i = 0; i < foot.length; i += 3) footGrid.add(`${Math.round((foot[i] + dx) * 2)},${Math.round(foot[i + 1] * 2)}`);
    const near = (x, z) => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (footGrid.has(`${Math.round(x * 2) + dx},${Math.round(z * 2) + dz}`)) return true;
      return false;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < count * 2 && n < count; i++) {
      const r = Math.sqrt(rnd()) * 34;
      const a = rnd() * Math.PI * 2;
      // Centred between the specimens when there are two.
      const x = Math.cos(a) * r * (prints.length > 1 ? 1.6 : 1) + prints.reduce((s, p) => s + p.dx, 0) / prints.length;
      const z = Math.sin(a) * r;
      if (footGrid.has(`${Math.round(x * 2)},${Math.round(z * 2)}`)) continue;
      const flat = near(x, z);
      const h = (2 + rnd() * 2.5) * (flat ? 0.5 : 1);
      e.set((rnd() - 0.5) * 0.5 + (flat ? -1.2 : 0), rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1 + rnd() * 0.6, h, 1));
      mesh.setMatrixAt(n, m);
      col.setHSL(0.22 + rnd() * 0.06, 0.45 + rnd() * 0.2, 0.18 + rnd() * 0.14);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // fade(f, i): print i at f of its full strength.
  const fade = (f, i = 0) => fades[i]?.forEach(([m, o]) => (m.opacity = o * f));
  return { group, fade, dispose: () => disposables.forEach((x) => x.dispose()) };
}

// ---------- steam ----------
const STEAM_N = 220;
function createSteam() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(STEAM_N * 3);
  const life = new Float32Array(STEAM_N);
  const seed = new Float32Array(STEAM_N);
  const size = new Float32Array(STEAM_N);
  for (let i = 0; i < STEAM_N; i++) {
    life[i] = 1;
    seed[i] = Math.random() * 50;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aSeed;
      attribute float aSize;
      uniform float uScale;
      uniform float uIntensity;
      varying float vA;
      varying float vSeed;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uScale / -mv.z, 512.0);
        // Fade out puffs right in front of the lens (they'd be blotches up close).
        vA = uIntensity * sin(3.14159 * aLife) * step(aLife, 0.999) * smoothstep(2.0, 7.0, -mv.z);
        vSeed = aSeed;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vSeed;
      ${SNOISE}
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float r = length(q) * 2.0;
        float n = 0.5 + 0.5 * snoise(vec3(q * 2.6, vSeed));
        float a = smoothstep(1.0, 0.1, r) * (0.35 + 0.65 * n) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a * 0.065);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, geo, mat, pos, life, size, vel: new Float32Array(STEAM_N * 3), rate: new Float32Array(STEAM_N) };
}

// ---------- microscope (Gram stain) ----------
// A smear from the spot you tapped, drawn as a procedural illustration: the
// picture is not an image of this specimen, but its numbers are real ones.
// Cell density: 0.9 × 10¹¹ per g × ρ ≈ 0.096 per µm³, so a field of area A
// with ~1 µm in focus holds ≈ 0.096·A cells. Sizes: Gram-negative rods
// (Bacteroides-like) 0.5 × 1–3 µm, Gram-positive cocci 0.8 µm and rods
// (Firmicutes) 0.8 × 2–5 µm, plant parenchyma cells 40–80 µm, corn
// pericarp cells 100–170 µm long. Field diameters are for a field number of
// 18 mm (field = 18 mm / objective).
const MAGS = [
  { label: '×100', field: 1800, bar: 500 },
  { label: '×400', field: 450, bar: 100 },
  { label: '×1000', field: 180, bar: 50 },
  { label: '×1000 ⊕', field: 45, bar: 10 },
];
const TILE_UM = 30;
// What a smear from each kind of spot carries (relative amounts).
const SITES = {
  surface: { name: 'the outer surface', bact: 0.6, mucus: 1, epi: 1, plant: 0.4, pericarp: 0 },
  interior: { name: 'inside, from the cut face', bact: 1, mucus: 0.1, epi: 0, plant: 1, pericarp: 0 },
  socket: { name: 'a corn socket', bact: 0.7, mucus: 0.5, epi: 0.3, plant: 0.3, pericarp: 1 },
  bubble: { name: 'a gas pocket on the cut', bact: 1, mucus: 0.1, epi: 0, plant: 0.6, pericarp: 0 },
};

function makeSlide(site, rho, seed, bubble) {
  const rnd = mulberry32(seed);
  const S = SITES[site];
  const perUm3 = (BACT_PER_G * rho) / 1e12;
  const big = [];
  const at = () => {
    const r = Math.sqrt(rnd()) * 950;
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const count = (k) => Math.round(k * (0.6 + 0.8 * rnd()));
  for (let i = count(10 * S.plant); i > 0; i--) {
    const [x, y] = at();
    const cs = 40 + rnd() * 40;
    const cells = [];
    const nx = 2 + Math.floor(rnd() * 4);
    const ny = 2 + Math.floor(rnd() * 3);
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) if (rnd() < 0.8) cells.push([(a + (b & 1) * 0.5) * cs, b * cs * 0.86, 0.85 + rnd() * 0.3]);
    big.push({ kind: 'plant', x, y, rot: rnd() * Math.PI, cs, cells, size: cs * (nx + ny) });
  }
  for (let i = count(5 * S.pericarp); i > 0; i--) {
    const [x, y] = at();
    const rows = 3 + Math.floor(rnd() * 4);
    const len = 100 + rnd() * 70;
    const per = 2 + Math.floor(rnd() * 3);
    big.push({ kind: 'pericarp', x: x * 0.4, y: y * 0.4, rot: rnd() * Math.PI, rows, len, w: 14 + rnd() * 6, per, size: len * per + 80 });
  }
  for (let i = count(8 + 8 * S.plant); i > 0; i--) {
    const [x, y] = at();
    const len = 150 + rnd() * 500;
    big.push({ kind: 'fibre', x, y, rot: rnd() * Math.PI, len, w: 6 + rnd() * 9, ph: rnd() * 6.28, size: len });
  }
  for (let i = count(90); i > 0; i--) {
    const [x, y] = at();
    const r = 3 + rnd() ** 2 * 40;
    big.push({ kind: 'debris', x, y, r, k: rnd(), ph: rnd() * 6.28, size: r * 1.3 });
  }
  for (let i = count(7 * S.mucus); i > 0; i--) {
    const [x, y] = at();
    const len = 300 + rnd() * 600;
    big.push({ kind: 'mucus', x, y, rot: rnd() * Math.PI, len, w: 25 + rnd() * 50, ph: rnd() * 6.28, size: len });
  }
  for (let i = count(14 * S.epi); i > 0; i--) {
    const [x, y] = at();
    big.push({ kind: 'epi', x: x * 0.6, y: y * 0.6, r: 10 + rnd() * 5, ph: rnd() * 6.28, size: 20 });
  }
  return { site, S, perUm3, perUm2: perUm3 * S.bact, big, seed, bubble, tiles: new Map(), still: null };
}

// The bacteria in one 30 µm tile, made on demand (same tile, same cells).
function slideTile(slide, i, j) {
  const key = `${i},${j}`;
  let t = slide.tiles.get(key);
  if (t) return t;
  const rnd = mulberry32(hashCell(i, j, 0, slide.seed >>> 0));
  const n = Math.round(slide.perUm2 * TILE_UM * TILE_UM * (0.9 + 0.2 * rnd()));
  const b = slide.bubble;
  t = [];
  for (let k = 0; k < n; k++) {
    const x = (i + rnd()) * TILE_UM;
    const y = (j + rnd()) * TILE_UM;
    if (b && Math.hypot(x - b.x, y - b.y) < b.r) continue;
    const kind = rnd();
    const type = kind < 0.55 ? 'neg' : kind < 0.85 ? 'cocci' : 'pos';
    t.push({
      x, y, ang: rnd() * Math.PI, type,
      len: type === 'cocci' ? 0 : type === 'neg' ? 1 + rnd() * 2 : 2 + rnd() * 3,
      chain: type === 'cocci' ? 1 + Math.floor(rnd() * 4) : 1,
      jx: 0, jy: 0,
    });
  }
  slide.tiles.set(key, t);
  return t;
}

function slideCells(slide, F) {
  const cells = [];
  const n = Math.ceil(F / 2 / TILE_UM);
  for (let i = -n - 1; i <= n; i++) for (let j = -n - 1; j <= n; j++) for (const c of slideTile(slide, i, j)) if (c.x * c.x + c.y * c.y < (F / 2) * (F / 2)) cells.push(c);
  return cells;
}

function drawBacteria(g, cells, k, jiggle) {
  g.lineCap = 'round';
  const rods = [['neg', 'rgba(205,60,95,0.88)', 0.5], ['pos', 'rgba(75,35,130,0.88)', 0.8]];
  for (const [type, colour, wd] of rods) {
    g.strokeStyle = colour;
    g.lineWidth = Math.max(0.7, wd * k);
    g.beginPath();
    for (const c of cells) {
      if (c.type !== type) continue;
      const dx = (Math.cos(c.ang) * c.len * k) / 2;
      const dy = (Math.sin(c.ang) * c.len * k) / 2;
      const x = (c.x + c.jx) * k;
      const y = (c.y + c.jy) * k;
      g.moveTo(x - dx, y - dy);
      g.lineTo(x + dx, y + dy);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(70,30,120,0.88)';
  g.beginPath();
  const rr = Math.max(0.5, 0.4 * k);
  for (const c of cells) {
    if (c.type !== 'cocci') continue;
    for (let i = 0; i < c.chain; i++) {
      const x = (c.x + c.jx + Math.cos(c.ang) * i * 0.85) * k;
      const y = (c.y + c.jy + Math.sin(c.ang) * i * 0.85) * k;
      g.moveTo(x + rr, y);
      g.arc(x, y, rr, 0, Math.PI * 2);
    }
  }
  g.fill();
  if (jiggle) {
    // Brownian, slowed by the viscous matrix: a tenth of a µm or so.
    for (const c of cells) {
      c.jx = (c.jx + (Math.random() - 0.5) * 0.06) * 0.96;
      c.jy = (c.jy + (Math.random() - 0.5) * 0.06) * 0.96;
    }
  }
}

function drawSlide(cv, slide, mag) {
  const g = cv.getContext('2d');
  const W = cv.width;
  const { field: F, bar } = MAGS[mag];
  const k = W / F;
  g.save();
  const bg = g.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.55);
  bg.addColorStop(0, '#f6e7e4');
  bg.addColorStop(1, '#d6b4b3');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, W);
  g.translate(W / 2, W / 2);
  const inView = (o) => Math.abs(o.x) < F / 2 + o.size && Math.abs(o.y) < F / 2 + o.size;
  for (const o of slide.big) {
    if (!inView(o)) continue;
    g.save();
    g.translate(o.x * k, o.y * k);
    if (o.rot) g.rotate(o.rot);
    if (o.kind === 'mucus') {
      // Mucus: a wide, faint, wavy band (it takes the pink counterstain).
      g.strokeStyle = 'rgba(214,120,150,0.13)';
      g.lineWidth = o.w * k;
      g.lineCap = 'round';
      g.beginPath();
      for (let s = 0; s <= 24; s++) {
        const u = (s / 24 - 0.5) * o.len;
        g.lineTo(u * k, Math.sin(u / 90 + o.ph) * 30 * k);
      }
      g.stroke();
    } else if (o.kind === 'fibre') {
      g.strokeStyle = 'rgba(160,110,70,0.42)';
      g.lineWidth = o.w * k;
      g.lineCap = 'round';
      g.beginPath();
      for (let s = 0; s <= 20; s++) {
        const u = (s / 20 - 0.5) * o.len;
        g.lineTo(u * k, Math.sin(u / 70 + o.ph) * 12 * k);
      }
      g.stroke();
      g.strokeStyle = 'rgba(110,70,40,0.35)';
      g.lineWidth = Math.max(0.5, 1.2 * k);
      g.stroke();
    } else if (o.kind === 'plant') {
      // Parenchyma: polygonal cell walls (cellulose, pink-ish).
      g.strokeStyle = 'rgba(185,80,110,0.6)';
      g.fillStyle = 'rgba(225,170,170,0.18)';
      g.lineWidth = Math.max(0.6, 2 * k);
      for (const [cx, cy, s] of o.cells) {
        g.beginPath();
        for (let q = 0; q < 6; q++) {
          const a = (q / 6) * Math.PI * 2 + Math.PI / 6;
          g.lineTo((cx + Math.cos(a) * o.cs * 0.55 * s) * k, (cy + Math.sin(a) * o.cs * 0.5 * s) * k);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
    } else if (o.kind === 'pericarp') {
      // Corn skin: long, thick-walled cells in rows, pale yellow.
      g.strokeStyle = 'rgba(170,120,40,0.75)';
      g.fillStyle = 'rgba(240,210,120,0.3)';
      g.lineWidth = Math.max(0.8, 3 * k);
      for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.per; c++) {
        const x = (c - o.per / 2 + ((r & 1) ? 0.5 : 0)) * o.len;
        const y = (r - o.rows / 2) * o.w;
        g.beginPath();
        if (g.roundRect) g.roundRect(x * k, y * k, o.len * 0.97 * k, o.w * 0.9 * k, 3 * k);
        else g.rect(x * k, y * k, o.len * 0.97 * k, o.w * 0.9 * k);
        g.fill();
        g.stroke();
      }
    } else if (o.kind === 'debris') {
      g.fillStyle = o.k < 0.5 ? 'rgba(170,110,110,0.26)' : 'rgba(150,115,80,0.3)';
      g.beginPath();
      for (let s = 0; s <= 10; s++) {
        const a = (s / 10) * Math.PI * 2;
        const rr = o.r * k * (0.7 + 0.3 * Math.sin(a * 3 + o.ph));
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.fill();
    } else if (o.kind === 'epi') {
      // A shed lining cell: pale cytoplasm, dark nucleus.
      g.fillStyle = 'rgba(220,140,160,0.45)';
      g.beginPath();
      for (let s = 0; s <= 7; s++) {
        const a = (s / 7) * Math.PI * 2;
        g.lineTo(Math.cos(a) * o.r * k * (0.85 + 0.15 * Math.sin(a * 2 + o.ph)), Math.sin(a) * o.r * k);
      }
      g.fill();
      g.fillStyle = 'rgba(120,40,90,0.75)';
      g.beginPath();
      g.arc(0, 0, 3.8 * k, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // Bacteria: a haze at ×100 (a µm is a fifth of a pixel), a still picture
  // at ×400, alive at ×1000.
  if (k < 0.5) {
    g.fillStyle = `rgba(150,60,110,${Math.min(0.35, slide.perUm2 * 1.6)})`;
    g.beginPath();
    g.arc(0, 0, W / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(110,40,120,0.35)';
    const rnd = mulberry32(slide.seed);
    for (let i = 0; i < 2500; i++) {
      const r = Math.sqrt(rnd()) * F / 2;
      const a = rnd() * 6.283;
      g.fillRect(Math.cos(a) * r * k, Math.sin(a) * r * k, 1, 1);
    }
  } else if (k < 1.5) {
    if (!slide.still || slide.still.mag !== mag) {
      const cv2 = document.createElement('canvas');
      cv2.width = cv2.height = W;
      const g2 = cv2.getContext('2d');
      g2.translate(W / 2, W / 2);
      drawBacteria(g2, slideCells(slide, F), k, false);
      slide.still = { mag, cv: cv2 };
    }
    g.drawImage(slide.still.cv, -W / 2, -W / 2);
  } else {
    if (!slide.live || slide.live.mag !== mag) slide.live = { mag, cells: slideCells(slide, F) };
    drawBacteria(g, slide.live.cells, k, true);
  }
  const b = slide.bubble;
  if (b) {
    // An air bubble under the coverslip: a clear middle and a thick dark rim.
    g.fillStyle = '#f3e9e8';
    g.beginPath();
    g.arc(b.x * k, b.y * k, b.r * k, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,25,30,0.8)';
    g.lineWidth = Math.max(3, Math.min(W * 0.05, b.r * 0.06 * k));
    g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(20,10,20,0.8)';
  g.fillRect(W * 0.12, W * 0.86, bar * k, Math.max(3, W * 0.009));
  g.font = `${Math.round(W * 0.05)}px system-ui, sans-serif`;
  g.fillText(`${bar} µm`, W * 0.12, W * 0.84);
}

const CSS = `
.bs-card{position:fixed;z-index:6;pointer-events:none;max-width:250px;padding:10px 12px;border-radius:12px;
  background:rgba(12,10,8,.82);backdrop-filter:blur(8px);color:#fff;font:13px/1.4 system-ui,sans-serif;
  box-shadow:0 8px 24px rgba(0,0,0,.45);border:1px solid rgba(255,209,102,.35);transform:translate(-50%,calc(-100% - 18px));transition:opacity .2s}
.bs-card b{color:#ffd166}
.bs-card small{display:block;color:rgba(255,255,255,.6);margin-top:4px}
.bs-loupe{position:fixed;z-index:6;width:240px;pointer-events:none;transition:opacity .2s}
.bs-loupe canvas{display:block;width:240px;height:240px;border-radius:50%;border:4px solid #1b1b1f;box-shadow:0 0 0 1px rgba(255,255,255,.2),0 12px 30px rgba(0,0,0,.6)}
.bs-loupe .bs-mags{display:flex;gap:4px;justify-content:center;margin-top:6px;pointer-events:auto}
.bs-loupe .bs-text{margin-top:6px;padding:8px 10px;border-radius:10px;background:rgba(12,10,8,.85);color:#fff;font:12px/1.4 system-ui,sans-serif}
.bs-loupe .bs-text small{display:block;margin-top:4px;color:rgba(255,255,255,.55)}
.bs-dot{position:fixed;z-index:6;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #ffd166;border-radius:50%;pointer-events:none}
.bs-tag{position:fixed;z-index:5;pointer-events:none;transform:translate(-50%,-100%);padding:2px 9px;border-radius:999px;
  font:600 13px/1.5 system-ui,sans-serif;color:#111;background:#ffd166;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.bs-tag.a{background:#8fd3ff}
.bs-btn{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#eee;border-radius:8px;
  padding:4px 8px;font:12px/1.2 system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.bs-btn:hover{background:rgba(255,255,255,.14)}
.bs-btn.on{background:#ffd166;color:#111;border-color:#ffd166}
.bs-hud{position:fixed;z-index:6;left:12px;top:64px;width:300px;max-height:calc(100vh - 150px);overflow:auto;color:#eee;
  font:12px/1.35 system-ui,sans-serif;background:rgba(12,10,8,.78);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);
  border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.45);scrollbar-width:thin}
.bs-hud.closed{width:auto}
.bs-hud.closed .bs-body{display:none}
.bs-hud header{display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;user-select:none;font-weight:600;color:#ffd166}
.bs-hud header span{flex:1}
.bs-body{padding:0 10px 10px}
.bs-row{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;align-items:center}
.bs-row .t{margin-left:auto;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.7)}
.bs-hud label{display:flex;align-items:center;gap:6px;margin:3px 0;color:rgba(255,255,255,.75)}
.bs-hud input[type=range]{flex:1;accent-color:#ffd166}
.bs-hud details{margin-top:6px;border-top:1px solid rgba(255,255,255,.08);padding-top:4px}
.bs-hud summary{cursor:pointer;color:#ffd166;font-weight:600;padding:2px 0}
.bs-hud table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.bs-hud td{padding:2px 2px;vertical-align:top}
.bs-hud td:nth-child(2){text-align:right;white-space:nowrap}
.bs-hud tr[data-tip]{cursor:help}
.bs-hud tr[data-tip]:hover td{background:rgba(255,255,255,.05)}
.bs-badge{display:inline-block;min-width:34px;text-align:center;font-size:9px;font-weight:700;letter-spacing:.04em;border-radius:4px;padding:1px 3px;margin-left:4px}
.bs-badge.SIM{background:#2f6f4f;color:#d6ffe6}.bs-badge.MODEL{background:#6b5326;color:#ffe9b8}.bs-badge.REF{background:#3a4a7a;color:#dbe4ff}
.bs-tip{margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);min-height:2.7em}
.bs-hud canvas{display:block;width:100%;height:96px;margin-top:4px;border-radius:6px;background:rgba(0,0,0,.3)}
.bs-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;color:rgba(255,255,255,.65);font-size:11px}
.bs-legend i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:3px;vertical-align:middle}
.bs-check{display:flex;gap:6px;margin:2px 0}.bs-check b{width:12px}
.bs-diff{color:#ffd166}
@media (max-width:640px){.bs-hud{top:auto;bottom:86px;left:8px;width:calc(100vw - 16px);max-height:45vh}.bs-hud.closed{width:auto}
  .bs-loupe{width:200px}.bs-loupe canvas{width:200px;height:200px}}
`;

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '?');
const RAD = Math.PI / 180;
const NODE_MAX = 48;
const VIEWS_KEY = 'aiship.bristol.views';
// What each badge means, shown when you point at one.
const BADGE = {
  SIM: 'SIM: computed from this specimen\'s geometry or simulation.',
  MODEL: 'MODEL: an assumed relation or estimate. Plausible, not measured here.',
  REF: 'REF: a number taken from the literature.',
};
const SPEC_KEYS = ['bristol', 'water', 'corn', 'gas', 'height'];

// One specimen's pose at play time t: skin, anus and body, the canal clip,
// kernels riding along, and the node list the shaders use for depth/heat.
const _m4 = new THREE.Matrix4();
const _o = new THREE.Vector3();
function poseView(v, play, dt) {
  const spec = v.spec;
  const ex = spec.exit;
  const t = Math.min(play.t, ex.tEnd);
  if (t !== v.lastT) {
    v.lastT = t;
    for (let i = 0; i < spec.pieces.length; i++) {
      const pc = spec.pieces[i];
      spec.frames(pc, t);
      const g = v.meshes[i].geometry;
      skin(pc, pc.F, g.attributes.position.array);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
    setNodes(v, t);
  }
  // The anus: where it is, and how wide whatever is passing makes it.
  const H = spec.H;
  let A = [0, H, 0];
  let open = 0.1;
  let tLeave;
  let drop = 0;
  let out;
  let L;
  let eA = EXIT_DIR;
  if (ex.kind === 'rope') {
    const f = Math.min(ex.rec.length - 1.0001, t * EXIT_FPS);
    const r0 = ex.rec[Math.floor(f)];
    const r1 = ex.rec[Math.floor(f) + 1];
    const al = f - Math.floor(f);
    A = r0.A.map((a, i) => a + (r1.A[i] - a) * al);
    eA = r0.e.map((a, i) => a + (r1.e[i] - a) * al);
    const el = Math.hypot(eA[0], eA[1], eA[2]);
    eA = eA.map((a) => a / el);
    out = r0.out + (r1.out - r0.out) * al;
    if (out > 0 && out < ex.L) open = Math.max(0.1, ex.radiusAt(out) + 0.05);
    tLeave = ex.tEmit + 0.8;
    drop = r0.drop + (r1.drop - r0.drop) * al;
    out = Math.min(ex.L, out);
    L = ex.L;
  } else {
    for (const b of ex.blobs) {
      if (t < b.t0 || t > b.t1) continue;
      const d = (t - b.t0) * ((2 * b.R) / (b.t1 - b.t0)) - b.R;
      open = Math.max(open, Math.sqrt(Math.max(0, b.R * b.R - d * d)) + 0.05);
    }
    tLeave = Math.max(...ex.blobs.map((b) => b.t1)) + 0.8;
    out = ex.blobs.reduce((s, b) => s + Math.min(2 * b.R, Math.max(0, (t - b.t0) * ex.v)), 0);
    L = ex.blobs.reduce((s, b) => s + 2 * b.R, 0);
  }
  const leaving = t < tLeave;
  const rise = 34 * smoothstep(tLeave, tLeave + 2.6, play.clock);
  v.body.mesh.visible = rise < 30;
  if (v.body.mesh.visible) v.body.update(A, open, rise);
  // Anything still deeper than 1.6 cm in the canal isn't drawn.
  const e = eA;
  const clipW = -(e[0] * A[0] + e[1] * A[1] + e[2] * A[2]) + 1.6;
  // uClip works in world space: shift it by the group's offset.
  const shift = -(e[0] * v.group.position.x);
  v.uniforms.uClip.value.set(-e[0], -e[1], -e[2], rise > 1 ? 1e6 : clipW + shift);
  const landed = smoothstep(ex.tTouch, ex.tEnd, t);
  // Kernels riding in the stool.
  for (const k of v.kernels) {
    if (k.state !== 'in') continue;
    const pc = spec.pieces[k.piece];
    const rel = k.rel;
    const F = pc.F;
    ringBasis(F, rel.ring, _m4);
    const Ck = _o.set(F.C[3 * rel.ring], F.C[3 * rel.ring + 1], F.C[3 * rel.ring + 2]).clone();
    const blob = pc.kind === 'blob';
    k.C.copy(Ck).add(slumpOffset(F, rel.ring, blob, rel.C.clone().applyMatrix4(_m4), false));
    k.P.copy(Ck).add(slumpOffset(F, rel.ring, blob, rel.P.clone().applyMatrix4(_m4), false));
    k.n.copy(rel.n).applyMatrix4(_m4).normalize();
    k.mesh.position.copy(k.C);
    k.mesh.quaternion.setFromRotationMatrix(_m4.multiply(rel.basis));
    k.mesh.visible = -e[0] * k.C.x - e[1] * k.C.y - e[2] * k.C.z < clipW - 0.6 || rise > 1;
  }
  void dt;
  return { A, open, tLeave, leaving, rise, landed, drop, out, L };
}

// The rope's nodes (or the blobs' centres) for the shaders' depth metric:
// position, radius (negative where the rope is torn after this node) and squash.
function setNodes(v, t) {
  const ex = v.spec.exit;
  const U = v.uniforms;
  const nodes = U.uNodes.value;
  const sy = U.uNodeSy.value;
  if (ex.kind === 'rope') {
    const f = Math.min(ex.rec.length - 1.0001, t * EXIT_FPS);
    const r0 = ex.rec[Math.floor(f)];
    const r1 = ex.rec[Math.floor(f) + 1];
    const al = f - Math.floor(f);
    const stride = Math.ceil(ex.n / NODE_MAX);
    let m = 0;
    for (let i = 0; i < ex.n && m < NODE_MAX; i += stride, m++) {
      const j = Math.min(ex.n - 1, i + stride);
      const torn = ex.breaks.some((b) => b.t <= t && b.i >= i && b.i < j);
      const lerp = (a, b) => a + (b - a) * al;
      nodes[m].set(lerp(r0.x[3 * i], r1.x[3 * i]), lerp(r0.x[3 * i + 1], r1.x[3 * i + 1]), lerp(r0.x[3 * i + 2], r1.x[3 * i + 2]), v.rc[i] * (torn ? -1 : 1));
      sy[m] = Math.max(0.2, lerp(r0.sy[i], r1.sy[i]));
    }
    U.uNodeN.value = m;
  } else {
    ex.blobs.forEach((b, i) => {
      blobState(b, ex.H, t, _bs);
      nodes[i].set(_bs.c.x, _bs.c.y, _bs.c.z, -b.R);
      sy[i] = _bs.sy;
    });
    U.uNodeN.value = Math.min(NODE_MAX, ex.blobs.length);
  }
}

// ---------- the instruments panel ----------
function drawHud(state, ctx, now) {
  const { w, out } = state;
  const { params } = ctx;
  const live = w.live;
  const spec = live.spec;
  const ex = spec.exit;
  const p = w.play;
  const tEnd = Math.max(ex.tEnd, w.pinned?.spec.exit.tEnd ?? 0);
  out.time.textContent = `t = ${fmt(p.t, 2)} / ${fmt(tEnd, 1)} s${p.paused ? ' · paused' : ''}`;
  state.hud.querySelector('[data-act=pause]').textContent = p.paused ? '▶︎' : '⏸';
  state.hud.querySelector('[data-act=cut]').classList.toggle('on', now.cutOn);
  state.hud.querySelector('[data-act=heat]').classList.toggle('on', now.heatOn);
  state.hud.querySelector('[data-act=pin]').classList.toggle('on', !!w.pinned);
  state.hud.querySelector('[data-act=pin]').textContent = w.pinned ? 'Unpin A' : 'Pin as A';
  out.knife.style.display = now.cutOn ? '' : 'none';
  for (const inp of out.knife.querySelectorAll('input')) if (document.activeElement !== inp) inp.value = params[inp.dataset.in];

  // Measurements, each with what kind of number it is.
  const rows = [];
  const row = (label, value, badge, tip) => rows.push({ label, value, badge, tip });
  row('Volume V', `${fmt(spec.V, 1)} cm³`, 'SIM', 'Divergence theorem over the final mesh, V = ⅓∮x·n dA, sockets included.');
  row('Surface A', `${fmt(spec.A, 0)} cm²`, 'SIM', 'Sum of the mesh\'s triangle areas.');
  row('Density ρ', `${fmt(now.rho, 3)} g/cm³`, 'MODEL', '1.07 g/cm³ assumed for gas-free stool, times (1 − gas fraction). Stools float from gas, not fat (Levitt & Duane 1972).');
  row('Mass', `${fmt(now.mStool, 1)} g`, 'MODEL', 'ρV: simulated volume times modelled density.');
  row('Bacteria', `${fmt(BACT_PER_G * now.mStool / 1e12, 1)} × 10¹²`, 'REF', '0.9 × 10¹¹ cells per wet gram (Sender, Fuchs & Milo, PLoS Biol 2016) × the mass.');
  row('Yield stress τ_y', ex.tau >= 1000 ? `${fmt(ex.tau / 1000, 2)} kPa` : `${fmt(ex.tau, 0)} Pa`, 'MODEL', 'An exponential in water content pinned at 1.5 kPa for 76% water. The shape matches faecal-sludge data; the numbers are a model, not measurements.');
  row('Tears when hanging', `${fmt(Math.max((Math.sqrt(3) * ex.tau * 10) / (now.rho * G), ex.lMin ?? 0), 1)} cm`, 'MODEL', 'ℓ_tear = √3·τ_y/(ρg): its own weight reaches the tensile yield stress (von Mises). Never shorter than 2.5R: a piece can\'t neck off thinner than it is thick.');
  row('T, lumped', `${fmt(now.T, 1)} °C`, 'MODEL', 'One temperature for the whole thing (Newton cooling), τ = ρcV/(hA) = ' + fmt(now.tau / 60, 0) + ' min, h = 10 W/m²K (still air).');
  row('T core / skin', `${fmt(now.Tc, 1)} / ${fmt(now.Ts, 1)} °C`, 'MODEL', 'Exact conduction series for an infinitely long cylinder (or a sphere, for lumps) of the thickest radius, with the same h. Ignores the floor and the ends.');
  if (now.cutOn && live.sec) {
    const sec = live.sec;
    row('Cut area', `${fmt(sec.area, 2)} cm²`, 'SIM', 'The section\'s outline, chained from where the knife crosses each triangle; holes subtracted.');
    row('Volume kept', `${fmt(sec.keptV, 1)} cm³ (${fmt((100 * sec.keptV) / spec.V, 0)}%)`, 'SIM', 'Divergence theorem over the clipped triangles with the origin on the knife, so the cut face adds nothing.');
    row('Gas on the cut', `${fmt((live.voids?.frac ?? 0) * 100, 1)}% (φ ${fmt(params.gas * 100, 1)}%)`, 'SIM', `Share of ${live.voids?.samples ?? 0} grid points on the cut that fall in a gas pocket. Delesse (1847): area fraction = volume fraction, on average over cuts.`);
  }
  const html = rows
    .map((r) => `<tr data-tip="${(`<b>${r.label}</b>: ${r.tip}<br><small>${BADGE[r.badge]}</small>`).replace(/"/g, '&quot;')}"><td>${r.label}</td><td>${r.value}<span class="bs-badge ${r.badge}">${r.badge}</span></td></tr>`)
    .join('');
  if (out.table.innerHTML !== html) out.table.innerHTML = html;

  // Temperature against time: lumped, core and skin of the thickest part, and the thinnest core.
  const hp = out.heatPlot;
  if (hp.closest('details').open) {
    const g = hp.getContext('2d');
    const W = hp.width;
    const Hh = hp.height;
    g.clearRect(0, 0, W, Hh);
    const h = live.heat;
    const Tair = now.Tair;
    const tMax = Math.max(4 * now.tau, w.tReal * 1.15, 60);
    const X = (t) => 30 + ((W - 40) * t) / tMax;
    const Y = (T) => 10 + (Hh - 34) * (1 - (T - Tair) / Math.max(37 - Tair, 1));
    g.strokeStyle = 'rgba(255,255,255,.15)';
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '20px system-ui';
    g.beginPath();
    g.moveTo(30, Y(37));
    g.lineTo(30, Y(Tair));
    g.lineTo(W - 10, Y(Tair));
    g.stroke();
    g.fillText('37°', 0, Y(37) + 6);
    g.fillText(`${Math.round(Tair)}°`, 0, Y(Tair));
    g.fillText(`${fmt(tMax / 60, 0)} min`, W - 90, Hh - 4);
    const curve = (colour, f, dash) => {
      g.strokeStyle = colour;
      g.lineWidth = 3;
      g.setLineDash(dash || []);
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = (tMax * i) / 80;
        g.lineTo(X(t), Y(f(t)));
      }
      g.stroke();
      g.setLineDash([]);
    };
    const top = HEAT_ROWS - 1;
    curve('#6fd3ff', (t) => Tair + (37 - Tair) * h.theta(0, 0, t));
    curve('#c77dff', (t) => Tair + (37 - Tair) * h.theta(top, HEAT_COLS - 1, t));
    curve('#ffb347', (t) => Tair + (37 - Tair) * h.theta(top, 0, t));
    curve('#ffffff', (t) => Tair + (37 - Tair) * Math.exp(-t / now.tau), [8, 6]);
    g.strokeStyle = 'rgba(255,209,102,.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(w.tReal), 6);
    g.lineTo(X(w.tReal), Hh - 24);
    g.stroke();
  }

  // The exit's books: energy and the worst stretch, frame by frame.
  const ep = out.exitPlot;
  if (ep.closest('details').open) {
    const g = ep.getContext('2d');
    const W = ep.width;
    const Hh = ep.height;
    g.clearRect(0, 0, W, Hh);
    g.font = '20px system-ui';
    g.fillStyle = 'rgba(255,255,255,.6)';
    if (ex.kind !== 'rope') {
      g.fillText('Separate pieces: thrown, not simulated as a rope.', 12, Hh / 2);
      out.exitText.textContent = 'Each lump is pushed out at v, falls ballistically and slumps to h_max on landing.';
    } else {
      const rec = ex.rec;
      const eMax = Math.max(...rec.map((r) => r.ek + r.ep)) || 1;
      const sMax = Math.max(0.05, ...rec.map((r) => r.strain));
      const X = (i) => 10 + ((W - 20) * i) / (rec.length - 1);
      const Y = (v) => 8 + (Hh - 20) * (1 - v);
      const line = (colour, f) => {
        g.strokeStyle = colour;
        g.lineWidth = 3;
        g.beginPath();
        rec.forEach((r, i) => g.lineTo(X(i), Y(f(r))));
        g.stroke();
      };
      line('#ffd166', (r) => (r.ek + r.ep) / eMax);
      line('#7fffb2', (r) => r.ek / eMax);
      line('#ff6b6b', (r) => (0.5 * r.strain) / sMax);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      for (const b of ex.breaks) {
        g.beginPath();
        g.moveTo(X(b.t * EXIT_FPS), 4);
        g.lineTo(X(b.t * EXIT_FPS), Hh - 8);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,209,102,.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X(Math.min(rec.length - 1, p.t * EXIT_FPS)), 0);
      g.lineTo(X(Math.min(rec.length - 1, p.t * EXIT_FPS)), Hh);
      g.stroke();
      const r = rec[Math.min(rec.length - 1, Math.round(p.t * EXIT_FPS))];
      out.exitText.innerHTML =
        `Now: kinetic ${fmt(r.ek / 1e4, 1)} mJ, gravity ${fmt(r.ep / 1e4, 0)} mJ, worst stretch ${fmt(r.strain * 100, 1)}%, ${r.contacts} self-contacts. ` +
        `${ex.steps} steps of ${fmt(ex.dt * 1000, 2)} ms (fixed, so replays are identical), baked in ${fmt(ex.bakeMs, 0)} ms. ` +
        'Bending energy isn\'t on the books, so a stiff log springing back shows as a rise. Grey ticks: tears.';
    }
  }

  // A / B.
  const ab = out.ab;
  ab.closest('details').style.display = w.pinned ? '' : 'none';
  if (w.pinned) {
    const A = w.pinned;
    const B = live;
    const nm = { bristol: 'Bristol type', water: 'Extra water', corn: 'Corn', gas: 'Gas fraction', height: 'Drop height' };
    const pv = (k, v) => (k === 'bristol' ? Math.round(v) + 1 : k === 'gas' ? fmt(v, 3) : v);
    const diffs = SPEC_KEYS.filter((k) => A.params[k] !== B.params[k]);
    const sum = (v) => {
      const e = v.spec.exit;
      const r = RHO_STOOL * (1 - v.gas);
      const tau = (r * C_STOOL * v.spec.V) / (H_AIR * v.spec.A * 1e-4);
      return {
        'Water': `${fmt(e.water * 100, 1)}%`,
        'Yield stress': e.tau >= 1000 ? `${fmt(e.tau / 1000, 2)} kPa` : `${fmt(e.tau, 0)} Pa`,
        'Tears at': `${fmt((Math.sqrt(3) * e.tau * 10) / (r * G), 1)} cm`,
        'Pieces': e.kind === 'rope' ? 1 + e.breaks.length : e.blobs.length,
        'Volume': `${fmt(v.spec.V, 1)} cm³`,
        'Area': `${fmt(v.spec.A, 0)} cm²`,
        'Density': `${fmt(r, 3)}`,
        'Mass': `${fmt(r * v.spec.V, 1)} g`,
        'Cooling τ': `${fmt(tau / 60, 0)} min`,
        'T now': `${fmt(now.Tair + (37 - now.Tair) * Math.exp(-w.tReal / tau), 1)} °C`,
        'Cut area': v.sec && now.cutOn ? `${fmt(v.sec.area, 2)} cm²` : '–',
      };
    };
    const a = sum(A);
    const b = sum(B);
    ab.innerHTML =
      `<div style="margin:2px 0 6px">Same seed. ${diffs.length ? `B differs in: <span class="bs-diff">${diffs.map((k) => `${nm[k]} ${pv(k, A.params[k])} → ${pv(k, B.params[k])}`).join(', ')}</span>, so every difference below comes from ${diffs.length === 1 ? 'that' : 'those'}.` : 'No dials changed yet: change one and B is rebuilt beside A.'}</div>` +
      `<table><tr><td></td><td style="color:#8fd3ff">A</td><td style="color:#ffd166;text-align:right">B</td></tr>${Object.keys(a)
        .map((k) => `<tr><td>${k}</td><td>${a[k]}</td><td style="text-align:right${a[k] !== b[k] ? ';color:#ffd166' : ''}">${b[k]}</td></tr>`)
        .join('')}</table>`;
  }

  // Checks.
  const checks = [...spec.checks];
  if (now.cutOn && live.sec) {
    // The two clipped halves against the whole mesh, summed without the knife.
    const sec = live.sec;
    const err = Math.abs(sec.keptV + sec.cutV - sec.totalV) / sec.totalV;
    checks.push({ pass: err < 1e-6, text: `Cut volumes add up: V_kept + V_cut = V to ${err.toExponential(0)}` });
  }
  const passed = checks.filter((c) => c.pass).length;
  out.checksTitle.textContent = `Checks · ${passed}/${checks.length} pass`;
  out.checksTitle.style.color = passed === checks.length ? '' : '#ff8f8f';
  const ch = checks.map((c) => `<div class="bs-check"><b style="color:${c.pass ? '#7fffb2' : '#ff6b6b'}">${c.pass ? '✓' : '✗'}</b><span>${c.text}</span></div>`).join('');
  if (out.checks.innerHTML !== ch) out.checks.innerHTML = ch;

  // Saved views.
  const vs = w.views.map((_, i) => `<button class="bs-btn" data-view="${i}">${i + 1}</button>`).join('');
  if (out.views.innerHTML !== vs) out.views.innerHTML = vs;
}

export default {
  name: 'Bristol Specimen',
  description:
    'An anatomically honest stool on the Bristol scale, with sweet corn in it, watched as it leaves. Its firmness is a yield ' +
    'stress that falls with water content: it hangs until its own weight tears it, slumps if it is soft, folds or topples as it lands. ' +
    'Cut it open to see the gas pockets (and check Delesse\'s rule), watch the heat leave its core, tap anywhere for a Gram stain at ' +
    '×100 to ×1000, pin one and compare it with another, and step the exit frame by frame. Every number says whether it is simulated, modelled or from the literature.',
  tags: ['biology', 'anatomy', 'corn', 'microscope', 'bacteria', 'cooling', 'heat equation', 'Bessel', 'rheology', 'yield stress', 'stereology', 'interactive', 'humor', 'realistic'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',
  wheelZoom: true,

  motion() {
    return {
      V: 0, A: 0, rho: RHO_STOOL, mStool: 0, mCorn: 0, N: 1, tau: 0, tMin: 0, T: 37, Tair: 21, Bi: 0, cornLeft: 0, cornTotal: 0, event: '', since: 99,
      water: 0.76, tauY: TAU_REF, Lb: 25, lMin: 0, hmax: 29, drop: 0, v: 1, out: 0, L: 0, H: 15, leaving: false, pieces: 1,
      cut: false, cutA: 0, keptV: 0, gasCut: 0, phi: 0, heat: false, sphere: false, Fo: 0, BiR: 0, Rth: 1, Tc: 37, Ts: 37,
    };
  },

  latex: (params, hl, m) => {
    const type = Math.round(params.bristol ?? 3) + 1;
    const e = Math.floor(Math.log10(Math.max(m.N, 1)));
    const floats = m.rho < 1;
    const line =
      beat(m.since, [[0, m.event], [4, '']]) ||
      (m.leaving
        ? m.Lb >= m.H
          ? 'Firm enough to reach the floor in one piece.'
          : m.lMin > m.Lb
            ? `Too soft to hang at all: it necks off in pieces about ${fmt(m.lMin, 1)} cm long, the shortest a piece this thick can be.`
            : `Anything hanging more than ${fmt(m.Lb, 1)} cm tears off under its own weight.`
        : '') ||
      (m.cut && m.cutA > 0 ? 'Delesse, 1847: on any flat cut, the share of area that is holes is the share of volume.' : '') ||
      (m.heat ? 'Thin bits cool first: the Fourier number goes as 1/R².' : '') ||
      (floats ? 'Floats: the gas, not the fat (Levitt & Duane, 1972).' : '') ||
      (m.T - m.Tair > 6 ? 'Steaming: warm, wet air meeting cold air.' : '') ||
      (m.T - m.Tair < 1 ? 'Room temperature. Now it is just a sculpture.' : 'Cooling exactly as fast as Newton said it would.');
    const tauTex = m.tauY >= 1e4 ? `${hl(m.tauY / 1000, 0)}\\,\\text{kPa}` : m.tauY >= 1000 ? `${hl(m.tauY / 1000, 2)}\\,\\text{kPa}` : `${hl(m.tauY, 0)}\\,\\text{Pa}`;
    const big = (x) => (x > 999 ? '\\gg 1\\,\\text{m}' : `${hl(x, 1)}\\,\\text{cm}`);
    // A piece can't neck off shorter than about its own thickness (2.5R), so
    // when the weight criterion is shorter than that, that's the real limit.
    const tear = m.lMin > m.Lb
      ? `\\max\\big(\\tfrac{\\sqrt3\\,\\tau_y}{\\rho g},\\,2.5R\\big) = \\max(${hl(m.Lb, 1)}, ${hl(m.lMin, 1)}) = ${big(m.lMin)}`
      : `\\tfrac{\\sqrt3\\,\\tau_y}{\\rho g} = ${big(m.Lb)}`;
    const rows = [
      `\\text{Bristol type ${type}} &: \\text{${BRISTOL[type - 1]}}`,
      `\\tau_y &= 1.5\\,\\text{kPa}\\; e^{-(w - 76\\%)/1.5\\%} = ${tauTex}\\quad (w = ${hl(m.water * 100, 1)}\\%\\ \\text{water})`,
      `\\ell_{\\text{tear}} &= ${tear}\\quad (\\text{hanging now: } ${hl(m.drop, 1)}\\,\\text{cm}),\\quad h_{\\text{pile}} = \\tfrac{2\\tau_y}{\\rho g} = ${big(m.hmax)}`,
      `v &= \\tfrac{L}{12\\,\\text{s}} = ${hl(m.v, 2)}\\,\\tfrac{\\text{cm}}{\\text{s}}:\\quad ${hl(m.out, 1)}\\text{ of }${hl(m.L, 1)}\\,\\text{cm out, in }${m.pieces}\\text{ piece${m.pieces === 1 ? '' : 's'}}`,
      `V &= \\tfrac13\\textstyle\\oint \\mathbf x\\cdot\\mathbf n\\,dA = ${hl(m.V, 1)}\\,\\text{cm}^3,\\quad A = ${hl(m.A, 0)}\\,\\text{cm}^2`,
      `\\rho &= ${RHO_STOOL}\\,(1-\\varphi_{\\text{gas}}) = ${hl(m.rho, 3)}\\,\\tfrac{\\text{g}}{\\text{cm}^3}\\ ${floats ? '< 1:\\ \\text{floats}' : '> 1:\\ \\text{sinks}'}`,
      `m &= \\rho V + m_{\\text{corn}} = ${hl(m.mStool, 1)} + ${hl(m.mCorn, 2)}\\,\\text{g}`,
    ];
    if (m.cut && m.cutA > 0) {
      rows.push(
        `A_{\\text{cut}} &= ${hl(m.cutA, 2)}\\,\\text{cm}^2,\\quad V_{\\text{kept}} = \\tfrac16\\textstyle\\sum \\det(\\mathbf a,\\mathbf b,\\mathbf c) = ${hl(m.keptV, 1)}\\,\\text{cm}^3\\ (${hl((100 * m.keptV) / Math.max(m.V, 1e-9), 0)}\\%)`,
        `A_A &= V_V\\ \\text{(Delesse)}:\\quad \\text{gas on the cut } ${hl(m.gasCut * 100, 1)}\\%\\ \\text{ vs }\\ \\varphi = ${hl(m.phi * 100, 1)}\\%`,
      );
    } else if (!m.heat) {
      rows.push(`N_{\\text{bact}} &\\approx 0.9\\times10^{11}\\,\\tfrac{1}{\\text{g}}\\cdot\\rho V = ${hl(m.N / 10 ** e, 1)}\\times10^{${e}} \\approx ${hl(m.N / WORLD_POP, 0)}\\times\\text{everyone alive}`);
    }
    if (m.heat) {
      const shape = m.sphere ? '\\tfrac{\\sin(\\zeta_n r/R)}{\\zeta_n r/R}' : 'J_0(\\zeta_n r/R)';
      const eig = m.sphere ? '1 - \\zeta\\cot\\zeta = \\text{Bi}' : '\\zeta J_1(\\zeta) = \\text{Bi}\\,J_0(\\zeta)';
      rows.push(
        `\\theta &= \\textstyle\\sum_n C_n\\, e^{-\\zeta_n^2 \\text{Fo}}\\, ${shape},\\quad ${eig}`,
        `\\text{Fo} &= \\tfrac{\\alpha t}{R^2} = ${hl(m.Fo, 3)},\\quad \\text{Bi} = \\tfrac{hR}{k} = ${hl(m.BiR, 2)}\\quad (R = ${hl(m.Rth, 2)}\\,\\text{cm})`,
        `& T_{\\text{core}} = ${hl(m.Tc, 1)}\\,{}^\\circ\\text{C},\\quad T_{\\text{skin}} = ${hl(m.Ts, 1)}\\,{}^\\circ\\text{C}\\quad (\\text{lumped: } ${hl(m.T, 1)}\\,{}^\\circ\\text{C},\\ t = ${hl(m.tMin, 0)}\\,\\text{min})`,
      );
    } else {
      rows.push(
        `T &= T_{\\text{air}} + (37 - T_{\\text{air}})\\,e^{-t/\\tau},\\quad \\tau = \\tfrac{\\rho c V}{hA} = ${hl(m.tau / 60, 0)}\\,\\text{min}`,
        `& t = ${hl(m.tMin, 0)}\\,\\text{min}:\\quad T = ${hl(m.T, 1)}\\,{}^\\circ\\text{C}\\quad (\\text{Bi} = ${hl(m.Bi, 2)})`,
      );
    }
    if (!m.heat || !m.cut) rows.push(`\\text{corn} &: ${hl(m.cornLeft, 0)}\\text{ of }${m.cornTotal}\\text{ kernels left; cellulose, and no human enzyme cuts }\\beta(1{\\to}4)`);
    rows.push(`& ${caption(line)}`);
    return `\\begin{aligned}${rows.join(' \\\\')}\\end{aligned}`;
  },

  params: {
    bristol: {
      value: 3, min: 0, max: 4, step: 1, options: BRISTOL.map((d, i) => `Type ${i + 1}: ${d}`),
      group: 'Specimen', label: 'Bristol type',
      help: 'The Bristol Stool Form Scale, 1 (hard lumps, slow transit) to 5 (soft blobs). Types 6 and 7 are mush and liquid: no shape to build.',
    },
    water: {
      value: 0, min: -4, max: 5, step: 0.5, group: 'Specimen', label: 'Extra water (%)',
      help: 'Shifts the water content away from the type\'s usual. Every 1.5% more water divides the firmness (yield stress) by e: wetter ones tear off sooner and slump.',
    },
    corn: { value: 9, min: 0, max: 24, step: 1, group: 'Specimen', label: 'Corn kernels', help: 'How many kernels are in it. About 3 in 10 come out as empty hulls.' },
    gas: { value: 0.03, min: 0, max: 0.2, step: 0.005, group: 'Specimen', label: 'Gas fraction', help: 'Share of the volume that is gas pockets (you see them on a cut). Above about 0.065 it floats.' },
    height: { value: 15, min: 6, max: 35, step: 1, group: 'Scene', label: 'Drop height (cm)', help: 'How high the anus is above the floor. Higher: more of it hangs, so softer ones tear off.' },
    surface: { value: 0, min: 0, max: 2, step: 1, options: ['Porcelain', 'Concrete', 'Lawn'], group: 'Scene', label: 'Floor', help: 'What it landed on.' },
    airTemp: { value: 20, min: -5, max: 35, step: 1, group: 'Scene', label: 'Air temperature (°C)', help: 'Colder air: more steam, faster cooling.' },
    speed: { value: 1, min: 0, max: 5, step: 0.1, group: 'Scene', label: 'Time warp', help: '1 = one minute of cooling per second on screen. The exit itself always plays in real time.' },
    cut: { value: 0, min: 0, max: 1, step: 1, options: ['Off', 'On'], group: 'Cutaway', label: 'Cut it open', help: 'Slice it with a flat knife and look inside: gas pockets, a darker rind, cut corn.' },
    cutPos: { value: 0, min: -1, max: 1, step: 0.01, group: 'Cutaway', label: 'Knife position', help: 'Where the knife is, from one side of the specimen (−1) to the other (+1).' },
    cutAngle: { value: 90, min: 0, max: 360, step: 1, group: 'Cutaway', label: 'Knife direction (°)', help: 'Turns the knife round the vertical. The part on the side the arrow points to is taken away.' },
    cutTilt: { value: 0, min: -85, max: 85, step: 1, group: 'Cutaway', label: 'Knife tilt (°)', help: '0 is a vertical cut; ±85 is nearly flat, like slicing the top off.' },
    heat: { value: 0, min: 0, max: 1, step: 1, options: ['Off', 'On'], group: 'Look', label: 'Heat view', help: 'Colour by temperature, from the exact heat-conduction solution: hot core, cooler skin, thin bits first.' },
    damp: { value: 0.5, min: 0, max: 1, step: 0.05, group: 'Look', label: 'Damp patches', help: 'How much of the surface is wet enough to shine. The rest stays matte.' },
    grain: { value: 1, min: 0, max: 2, step: 0.1, group: 'Look', label: 'Fine grain', help: 'Sub-millimetre texture that only appears when you zoom right in.' },
    backdrop: { value: 0, min: 0, max: 2, step: 1, options: ['Dark', 'Grey studio', 'Black'], group: 'Studio', label: 'Backdrop' },
    keyAngle: { value: 140, min: 0, max: 360, step: 1, group: 'Studio', label: 'Key light direction (°)', help: 'Walks the main light round the specimen.' },
    fill: { value: 0.5, min: 0, max: 1.5, step: 0.05, group: 'Studio', label: 'Fill light', help: 'Soft cool light that lifts the shadows.' },
    rim: { value: 0.8, min: 0, max: 2.5, step: 0.05, group: 'Studio', label: 'Rim light', help: 'Light from behind that outlines the edges.' },
    turntable: { value: 0, min: 0, max: 30, step: 1, group: 'Studio', label: 'Turntable (°/s)', help: 'Circle the camera round it. 0 to stop.' },
  },

  actions: {
    fresh: { label: 'Fresh one', run: (ctx, st) => st.w.fresh(false) },
    replay: { label: 'Watch it leave again', run: (ctx, st) => st.w.replay() },
    skip: { label: 'Skip to the landing', run: (ctx, st) => st.w.skip() },
    pin: { label: 'Pin as A / unpin (compare)', run: (ctx, st) => st.w.pin() },
    pluckAll: { label: 'Remove all corn', run: (ctx, st) => st.w.pluckAll() },
    overview: { label: 'Back to overview', run: (ctx, st) => st.w.overview() },
  },

  setup(ctx) {
    const { scene, renderer, camera, controls } = ctx;
    const el = renderer.domElement;
    scene.background = new THREE.Color(0x0d0c0b);
    scene.fog = new THREE.Fog(0x0d0c0b, 90, 200);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    // Kept low: a bright room reflected in a wet surface is what made everything look varnished.
    scene.environmentIntensity = 0.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
    key.position.set(-26, 46, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 140 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0xc4d6ff, 0.5);
    fill.position.set(30, 18, -10);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(8, 14, -40);
    // Light bounced off the floor: what lets you see anything's underside.
    const bounce = new THREE.DirectionalLight(0xfff4ea, 0.55);
    bounce.position.set(6, -30, 10);
    scene.add(key, key.target, fill, rim, bounce);

    const glow = createGlow(ctx, { fov: 32, strength: 0.1, threshold: 1.8, exposure: 1.0, vignette: 0.55 });

    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 220;
    controls.maxPolarAngle = 1.45;
    controls.screenSpacePanning = true;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    const card = document.createElement('div');
    card.className = 'bs-card';
    card.style.opacity = '0';
    const loupe = document.createElement('div');
    loupe.className = 'bs-loupe';
    loupe.style.opacity = '0';
    const loupeCanvas = document.createElement('canvas');
    loupeCanvas.width = loupeCanvas.height = 480;
    const mags = document.createElement('div');
    mags.className = 'bs-mags';
    const loupeText = document.createElement('div');
    loupeText.className = 'bs-text';
    loupe.append(loupeCanvas, mags, loupeText);
    const dot = document.createElement('div');
    dot.className = 'bs-dot';
    dot.style.display = 'none';
    const tagA = document.createElement('div');
    tagA.className = 'bs-tag a';
    tagA.textContent = 'A · pinned';
    const tagB = document.createElement('div');
    tagB.className = 'bs-tag';
    tagB.textContent = 'B · live';
    tagA.style.display = tagB.style.display = 'none';
    const hud = document.createElement('div');
    hud.className = 'bs-hud';
    document.body.append(card, loupe, dot, tagA, tagB, hud);

    const kernelShapes = [kernelGeometry(false), kernelGeometry(true)];
    const steam = createSteam();
    scene.add(steam.points);
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.75 }));
    strand.visible = false;
    scene.add(strand);

    // Everything that changes lives in `w`: SketchRunner keeps a shallow copy
    // of the returned state, so handlers and actions must share one object.
    const w = {
      seed: 1 + Math.floor(Math.random() * 1e6),
      built: '',
      floorKind: -1,
      live: null, // the specimen the dials control (B when comparing)
      pinned: null, // A: a frozen copy to compare against
      spec: null,
      pieces: [],
      kernels: [],
      floor: null,
      clock: 0,
      born: 0,
      tReal: 0,
      lastUser: -99,
      focus: null,
      fly: null,
      auto: { next: 5, step: 'idle' },
      event: '',
      eventAt: -99,
      loupe: null,
      mag: 2,
      raycaster: new THREE.Raycaster(),
      hover: null,
      lastHoverAt: 0,
      play: { t: 0, clock: 0, done: false, gone: false, seenBreaks: 0, director: true, paused: false },
      cutN: new THREE.Vector3(0, 0, 1),
      cutD: 0,
      cutOn: false,
      hudAt: -1,
      views: [],
    };
    try {
      w.views = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]').slice(0, 6);
    } catch {
      w.views = [];
    }

    // ---- a specimen on screen: meshes, kernels, cut face, body, heat ----
    function makeView(spec, seed, gas) {
      const type = spec.type;
      const ex = spec.exit;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
      const uniforms = {
        uType: { value: type }, uGas: { value: gas }, uSeed: { value: (seed % 997) * 0.37 },
        uWet: { value: Math.min(1, Math.max(0, (ex.water - 0.66) / 0.15)) },
        uClip: { value: new THREE.Vector4(0, 1, 0, 1e6) },
        uDamp: { value: 0.5 }, uGrain: { value: 1 },
        uVoidR: { value: voidRadius(gas) }, uOffset: { value: new THREE.Vector3() },
        uNodes: { value: Array.from({ length: NODE_MAX }, () => new THREE.Vector4()) },
        uNodeSy: { value: new Float32Array(NODE_MAX).fill(1) },
        uNodeN: { value: 0 }, uRope: { value: ex.kind === 'rope' ? 1 : 0 },
        uHeat: { value: null }, uHeatR: { value: new THREE.Vector2() }, uHeatOn: { value: 0 },
      };
      const mat = stoolMaterial(uniforms);
      const capMat = capMaterial(uniforms);
      mat.clippingPlanes = [plane];
      mat.clipShadows = true;
      const group = new THREE.Group();
      scene.add(group);
      const meshes = spec.geos.map((g) => {
        const m = new THREE.Mesh(g, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        group.add(m);
        return m;
      });
      const kernels = spec.kernels.map((k, i) => {
        const { mat: kmat, uniforms: ku } = kernelMaterial(k.hull, i * 3.7 + (seed % 101));
        kmat.clippingPlanes = [plane];
        kmat.clipShadows = true;
        const mesh = new THREE.Mesh(kernelShapes[k.hull ? 1 : 0].geo, kmat);
        mesh.scale.setScalar(k.scale);
        mesh.position.copy(k.C);
        mesh.quaternion.setFromRotationMatrix(k.basis);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The surface plane, in the kernel's frame (before its scale).
        const nl = k.n.clone().applyQuaternion(mesh.quaternion.clone().invert());
        const pl = k.P.clone().sub(k.C).applyQuaternion(mesh.quaternion.clone().invert()).divideScalar(k.scale);
        ku.uPlane.value.set(nl.x, nl.y, nl.z, nl.dot(pl));
        group.add(mesh);
        return { ...k, mesh, mat: kmat, uniforms: ku, state: 'in', t: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), index: i + 1 };
      });
      const cap = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
      cap.receiveShadow = true;
      cap.visible = false;
      group.add(cap);
      const body = createBody();
      group.add(body.mesh);
      // Node radii for the heat/rind metric, and the heat table.
      let rc;
      let heat;
      if (ex.kind === 'rope') {
        const R = ex.radiusAt(ex.L / 2);
        rc = Float32Array.from({ length: ex.n }, (_, i) => Math.max(ex.radiusAt(i * ex.h), 0.35 * R));
        heat = createHeat(false, Math.min(...rc), Math.max(...rc), ex.rho);
      } else {
        rc = Float32Array.from(ex.blobs.map((b) => b.R));
        heat = createHeat(true, Math.min(...rc), Math.max(...rc), ex.rho);
      }
      uniforms.uHeat.value = heat.tex;
      uniforms.uHeatR.value.set(heat.Rmin, heat.Rmax);
      return { spec, seed, gas, group, meshes, kernels, mat, capMat, uniforms, plane, cap, body, heat, rc, lastT: -1, secKey: '', sec: null, voids: null, voidKey: '', voidAt: 0, cutSide: false };
    }
    function disposeView(v) {
      if (!v) return;
      scene.remove(v.group);
      v.meshes.forEach((m) => m.geometry.dispose());
      v.kernels.forEach((k) => k.mat.dispose());
      v.cap.geometry.dispose();
      v.mat.dispose();
      v.capMat.dispose();
      v.body.dispose();
      v.heat.tex.dispose();
    }
    const paramsOf = (p) => Object.fromEntries(SPEC_KEYS.map((k) => [k, p[k]]));
    const sigOf = (p, seed) => `${Math.round(p.bristol) + 1}|${Math.round(p.corn)}|${seed}|${p.water}|${p.height}|${p.gas}`;
    function buildFrom(p, seed) {
      const type = Math.round(p.bristol) + 1;
      const spec = buildSpecimen(type, Math.round(p.corn), seed, kernelShapes, { water: p.water, gas: p.gas, height: p.height });
      const v = makeView(spec, seed, p.gas);
      v.params = paramsOf(p);
      return v;
    }

    function build(params) {
      disposeView(w.live);
      w.live = buildFrom(params, w.seed);
      w.spec = w.live.spec;
      w.pieces = w.live.meshes;
      w.kernels = w.live.kernels;
      w.built = sigOf(params, w.seed);
      if (w.pinned && w.pinned.seed !== w.seed) {
        // A fresh seed: rebuild A from its own dials with the new one.
        const p = w.pinned.params;
        disposeView(w.pinned);
        w.pinned = buildFrom(p, w.seed);
      }
      placePinned();
      w.floorKind = -1; // the floor's stain follows the footprints
      startPlay();
    }
    // A sits to the left of B, far enough apart that the two bodies don't meet.
    function placePinned() {
      if (!w.pinned) return;
      const bb = w.live.spec.box;
      const ba = w.pinned.spec.box;
      const x = Math.min(-40, bb.min.x - 8 - ba.max.x);
      w.pinned.group.position.x = x;
      w.pinned.uniforms.uOffset.value.set(x, 0, 0);
    }

    function startPlay() {
      w.play = { t: 0, clock: 0, done: false, gone: false, seenBreaks: 0, director: w.play.director, paused: false };
      w.tReal = 0;
      w.focus = null;
      closeLoupe();
      for (const v of [w.live, w.pinned]) {
        if (!v) continue;
        v.lastT = -1;
        for (const k of v.kernels) {
          // Put plucked kernels back where they were.
          k.state = 'in';
          k.t = 0;
        }
      }
      if (w.play.director) {
        const p = exitPose();
        flyTo(p.target, p.pos, 1.0);
      }
    }

    function rebuildFloor(kind) {
      if (w.floor) {
        scene.remove(w.floor.group);
        w.floor.dispose();
      }
      const prints = [{ foot: w.live.spec.foot, dx: 0 }];
      if (w.pinned) prints.push({ foot: w.pinned.spec.foot, dx: w.pinned.group.position.x });
      w.floor = buildFloor(kind, prints);
      scene.add(w.floor.group);
      w.floorKind = kind;
    }

    // ---- camera ----
    const fit = (r) => {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      return r / t / Math.min(1, camera.aspect * 1.1);
    };
    // Both specimens' boxes, in world space.
    const sceneBox = () => {
      const b = w.live.spec.box.clone();
      if (w.pinned) b.union(w.pinned.spec.box.clone().translate(w.pinned.group.position));
      return b;
    };
    const overviewPose = () => {
      const b = sceneBox();
      const c = b.getCenter(new THREE.Vector3());
      const r = b.getSize(new THREE.Vector3()).length() / 2;
      const dist = Math.min(controls.maxDistance, Math.max(14, fit(r) * 1.05));
      const dir = new THREE.Vector3(w.pinned ? 0.15 : 0.6, 0.48, 0.85).normalize();
      return { target: new THREE.Vector3(c.x, 0.9, c.z), pos: new THREE.Vector3(c.x, 0.9, c.z).addScaledVector(dir, dist) };
    };
    // From the side and a little below the anus: the whole drop in frame.
    const exitPose = () => {
      const H = w.live.spec.H;
      const b = sceneBox();
      const c = b.getCenter(new THREE.Vector3());
      const target = new THREE.Vector3(c.x * (w.pinned ? 1 : 0.5), H * 0.42 + 1, c.z * 0.5);
      const r = Math.max(H * 0.5 + 4, b.getSize(new THREE.Vector3()).length() * 0.4, w.pinned ? 0.5 * -w.pinned.group.position.x + 12 : 0);
      const dist = Math.min(controls.maxDistance, fit(r));
      // As low as the orbit allows (camera just above the target's level), so the anus is seen from below.
      const dir = w.pinned ? new THREE.Vector3(0.12, 0.13, 1) : new THREE.Vector3(1, 0.13, 0.42);
      return { target, pos: target.clone().addScaledVector(dir.normalize(), dist) };
    };
    function flyTo(target, pos, dur = 1.3) {
      w.fly = { t: 0, dur, t0: controls.target.clone(), p0: camera.position.clone(), t1: target, p1: pos };
    }
    function focusKernel(k) {
      w.focus = k;
      const target = k.mesh.position.clone();
      const view = camera.position.clone().sub(controls.target).normalize();
      const dir = k.n.clone().multiplyScalar(0.9).add(view.multiplyScalar(0.7)).normalize();
      if (dir.y < 0.35) dir.y = 0.35;
      dir.normalize();
      flyTo(target, target.clone().addScaledVector(dir, 4.2));
    }
    w.overview = () => {
      w.focus = null;
      closeLoupe();
      const o = overviewPose();
      flyTo(o.target, o.pos);
    };
    w.saveView = () => {
      w.views.unshift({ p: camera.position.toArray(), t: controls.target.toArray() });
      w.views = w.views.slice(0, 6);
      try {
        localStorage.setItem(VIEWS_KEY, JSON.stringify(w.views));
      } catch {
        // Private window or blocked storage: the view still works this session.
      }
      w.hudAt = -1;
    };
    w.goView = (i) => {
      const v = w.views[i];
      if (!v) return;
      w.lastUser = w.clock;
      w.play.director = false;
      flyTo(new THREE.Vector3(...v.t), new THREE.Vector3(...v.p));
    };

    // ---- pulling a kernel out ----
    function pluck(k) {
      if (k.state !== 'in' || !k.mesh.visible) return;
      k.state = 'tug';
      k.t = 0;
      k.uniforms.uHover.value = 0;
      if (w.focus === k) w.focus = null;
      w.cardFor = k;
      w.cardUntil = w.clock + 3.5;
      w.event = k.hull
        ? 'Only the hull: the starch inside was digested; the cellulose skin never is.'
        : 'Retrieved intact. A full tour of the gut, and not a scratch on it.';
      w.eventAt = w.clock;
    }
    w.pluckAll = () => {
      w.kernels.forEach((k, i) => setTimeout(() => pluck(k), i * 140));
    };
    w.fresh = (auto) => {
      w.seed = 1 + Math.floor(Math.random() * 1e6);
      w.built = '';
      w.play.director = true;
      w.event = auto ? 'A fresh one. Not the same one reheated. We checked.' : 'A fresh one.';
      w.eventAt = w.clock;
    };
    w.replay = () => {
      w.play.director = true;
      startPlay();
    };
    w.skip = () => {
      w.play.paused = false;
      w.play.t = Math.max(w.live.spec.exit.tEnd, w.pinned?.spec.exit.tEnd ?? 0);
      w.play.clock = Math.max(w.play.clock, w.play.t + 6);
    };
    // Frame by frame through the recorded exit (the simulation ran at a fixed
    // 480 Hz and was recorded at 30 fps, so every replay is identical).
    w.pause = () => {
      w.play.paused = !w.play.paused;
      w.play.director = false;
      w.hudAt = -1;
    };
    w.step = (dir) => {
      const p = w.play;
      const tEnd = Math.max(w.live.spec.exit.tEnd, w.pinned?.spec.exit.tEnd ?? 0);
      p.paused = true;
      p.director = false;
      p.t = Math.min(tEnd, Math.max(0, Math.round(p.t * EXIT_FPS + dir) / EXIT_FPS));
      p.done = p.t >= tEnd;
      // Stepping back brings the body back down; stepping forward keeps it gone if it was.
      p.clock = dir < 0 ? p.t : Math.max(p.t, Math.min(p.clock, p.t + 0.001));
      w.hudAt = -1;
    };
    // Pin the current specimen as A (it slides left); B is a fresh copy of it
    // with the same seed, so anything that differs is down to the dials.
    w.pin = () => {
      if (w.pinned) {
        disposeView(w.pinned);
        w.pinned = null;
        w.event = 'Unpinned. Back to one.';
      } else {
        w.pinned = w.live;
        w.live = null;
        build(ctx.params);
        w.event = 'Pinned as A. Same seed, so whatever B does differently is down to the dials you change.';
      }
      w.eventAt = w.clock;
      w.floorKind = -1;
      w.play.director = true;
      startPlay();
      w.hudAt = -1;
    };

    // ---- microscope ----
    function setMag(i) {
      w.mag = i;
      [...mags.children].forEach((b, j) => b.classList.toggle('on', j === i));
      if (w.loupe) writeLoupeText();
    }
    MAGS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'bs-btn';
      b.textContent = m.label;
      b.title = `${m.field} µm across`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        w.lastUser = w.clock;
        setMag(i);
      });
      mags.append(b);
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'bs-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLoupe();
    });
    mags.append(closeBtn);
    setMag(2);
    function writeLoupeText() {
      const s = w.loupe.slide;
      const M = MAGS[w.mag];
      const area = Math.PI * (M.field / 2) ** 2;
      const expect = s.perUm2 * area;
      const b = s.bubble;
      loupeText.innerHTML =
        `<b style="color:#ffd166">Gram stain ${M.label}</b> · ${M.field} µm across · from ${s.S.name}<br>` +
        `${fmt(s.perUm3, 3)} cells/µm³ × 1 µm in focus × ${fmt(area / 1000, 0)}k µm² ≈ <b>${expect < 1e4 ? fmt(expect, 0) : `${fmt(expect / 1000, 0)}k`}</b> cells in this field` +
        (b ? `<br>${b.inside ? 'You sampled a gas pocket' : 'A gas pocket is next to this spot'}, ${fmt((2 * b.r) / 1000, 1)} mm across.` : '') +
        `<br><span style="color:#ff8fae">Pink</span>: Gram-negative rods. <span style="color:#b9a0ff">Purple</span>: Gram-positive.` +
        '<small>Procedural illustration: the sizes and the density are real; the picture is drawn, not imaged from this specimen.</small>';
    }
    function openLoupe(point, info) {
      w.loupe = { point: point.clone(), slide: makeSlide(info.site, info.rho, Math.floor(Math.random() * 1e6), info.bubble) };
      writeLoupeText();
      loupe.style.opacity = '1';
      dot.style.display = 'block';
      w.event = info.site === 'bubble'
        ? 'A gas pocket: nothing to smear but its walls.'
        : 'About half of what you are looking at, by dry weight, is bacteria (Stephen & Cummings, 1980).';
      w.eventAt = w.clock;
    }
    function closeLoupe() {
      w.loupe = null;
      loupe.style.opacity = '0';
      dot.style.display = 'none';
    }

    // ---- pointer ----
    const ndc = new THREE.Vector2();
    const castAt = (e) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      w.raycaster.setFromCamera(ndc, camera);
    };
    const allViews = () => [w.live, w.pinned].filter(Boolean);
    // Raycasts don't know about clipping: drop hits on the part that's cut away.
    const kept = (hit, v) => v.plane.distanceToPoint(hit.point) >= -1e-3;
    const firstHit = (objects) => {
      const hits = w.raycaster.intersectObjects(objects, false);
      for (const h of hits) {
        const v = allViews().find((x) => x.meshes.includes(h.object) || x.cap === h.object || x.kernels.some((k) => k.mesh === h.object));
        if (v && (h.object === v.cap || kept(h, v))) return { ...h, view: v };
      }
      return null;
    };
    const solids = () => allViews().flatMap((v) => [...v.meshes, ...(v.cap.visible ? [v.cap] : [])]);
    const kernelAt = (e) => {
      castAt(e);
      const live = w.kernels.filter((k) => k.state === 'in' && k.mesh.visible);
      const hit = firstHit(live.map((k) => k.mesh));
      const stoolHit = firstHit(solids());
      if (!hit || (stoolHit && stoolHit.distance < hit.distance - 0.05)) return null;
      return live.find((k) => k.mesh === hit.object) || null;
    };
    // What a smear from this hit would be: surface, socket, inside or a gas pocket.
    function sampleAt(hit) {
      const v = hit.view;
      const rho = RHO_STOOL * (1 - v.gas);
      if (hit.object === v.cap) {
        const p = hit.point.clone().sub(v.group.position);
        const r0 = voidRadius(v.gas);
        const o = voidAt(p.x, p.y, p.z, r0);
        const rUm = o.r * 1e4;
        // In a pocket, or near enough that its wall shows at ×100 (900 µm).
        if (o.q > -900 / Math.max(rUm, 1)) {
          return { site: o.q > 0 ? 'bubble' : 'interior', rho, bubble: { x: (1 - o.q) * rUm, y: 0, r: rUm, inside: o.q > 0 } };
        }
        return { site: 'interior', rho };
      }
      const cav = hit.object.geometry.attributes.aCav;
      const f = hit.face;
      const c = Math.max(cav.getX(f.a), cav.getX(f.b), cav.getX(f.c));
      return { site: c > 0.3 ? 'socket' : 'surface', rho };
    }
    let down = null;
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      w.lastUser = w.clock;
      w.fly = null;
      w.play.director = false;
      const k = kernelAt(e);
      down = { x: e.clientX, y: e.clientY, t: performance.now(), k };
      if (k) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    const onUp = (e) => {
      if (!down) return;
      const d = down;
      down = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
      if (d.k) {
        if (w.focus === d.k) pluck(d.k);
        else {
          closeLoupe();
          focusKernel(d.k);
        }
        return;
      }
      castAt(e);
      const hit = firstHit(solids());
      w.focus = null;
      if (hit) openLoupe(hit.point, sampleAt(hit));
      else closeLoupe();
    };
    const onMove = (e) => {
      if (e.pointerType === 'touch' || down) return;
      const now = performance.now();
      if (now - w.lastHoverAt < 50) return;
      w.lastHoverAt = now;
      const k = kernelAt(e);
      if (w.hover && w.hover !== k) w.hover.uniforms.uHover.value = 0;
      w.hover = k;
      if (k) k.uniforms.uHover.value = 0.25;
      el.style.cursor = k ? 'pointer' : '';
    };
    const onStart = () => {
      w.lastUser = w.clock;
      w.fly = null;
      w.play.director = false;
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    controls.addEventListener('start', onStart);

    // ---- the instruments panel ----
    hud.innerHTML = `
      <header><span>Instruments</span><b class="bs-fold">▾</b></header>
      <div class="bs-body">
        <div class="bs-row">
          <button class="bs-btn" data-act="cut">Cutaway</button>
          <button class="bs-btn" data-act="heat">Heat</button>
          <button class="bs-btn" data-act="pin">Pin as A</button>
        </div>
        <div class="bs-row">
          <button class="bs-btn" data-act="replay" title="Watch it leave again">⏮</button>
          <button class="bs-btn" data-act="back" title="One frame back (1/30 s)">◀</button>
          <button class="bs-btn" data-act="pause" title="Pause / play">⏸</button>
          <button class="bs-btn" data-act="fwd" title="One frame on">▶</button>
          <button class="bs-btn" data-act="skip" title="Skip to the landing">⏭</button>
          <span class="t" data-out="time"></span>
        </div>
        <div data-out="knife">
          <label>Knife <input type="range" min="-1" max="1" step="0.01" data-in="cutPos"></label>
          <label>Turn <input type="range" min="0" max="360" step="1" data-in="cutAngle"></label>
          <label>Tilt <input type="range" min="-85" max="85" step="1" data-in="cutTilt"></label>
        </div>
        <details open><summary>Measurements</summary><table data-out="table"></table></details>
        <details data-sec="heat"><summary>Temperature</summary><canvas data-out="heatPlot" width="560" height="192"></canvas>
          <div class="bs-legend"><span><i style="background:#ffb347"></i>core</span><span><i style="background:#c77dff"></i>skin</span><span><i style="background:#fff"></i>lumped</span><span><i style="background:#6fd3ff"></i>thinnest core</span></div></details>
        <details data-sec="exit"><summary>Exit simulation</summary><canvas data-out="exitPlot" width="560" height="192"></canvas>
          <div class="bs-legend"><span><i style="background:#7fffb2"></i>kinetic</span><span><i style="background:#ffd166"></i>kinetic + gravity</span><span><i style="background:#ff6b6b"></i>worst stretch</span></div>
          <div data-out="exitText" style="margin-top:4px;color:rgba(255,255,255,.7)"></div></details>
        <details data-sec="ab"><summary>A / B</summary><div data-out="ab"></div></details>
        <details><summary data-out="checksTitle">Checks</summary><div data-out="checks"></div></details>
        <div class="bs-row" style="margin-top:8px"><button class="bs-btn" data-act="save">★ Save view</button><span data-out="views" class="bs-row" style="margin:0"></span></div>
        <div class="bs-tip" data-out="tip">Point at (or tap) a measurement for what it means and where it comes from.</div>
      </div>`;
    const $h = (q) => hud.querySelector(q);
    const out = Object.fromEntries([...hud.querySelectorAll('[data-out]')].map((n) => [n.dataset.out, n]));
    if (window.innerWidth < 640) hud.classList.add('closed');
    $h('header').addEventListener('click', () => {
      hud.classList.toggle('closed');
      $h('.bs-fold').textContent = hud.classList.contains('closed') ? '▸' : '▾';
    });
    if (hud.classList.contains('closed')) $h('.bs-fold').textContent = '▸';
    // Keep the camera still while using the panel.
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    hud.addEventListener('wheel', (e) => e.stopPropagation());
    const acts = {
      cut: () => (ctx.params.cut = ctx.params.cut ? 0 : 1),
      heat: () => (ctx.params.heat = ctx.params.heat ? 0 : 1),
      pin: () => w.pin(),
      replay: () => w.replay(),
      back: () => w.step(-1),
      pause: () => w.pause(),
      fwd: () => w.step(1),
      skip: () => w.skip(),
      save: () => w.saveView(),
    };
    hud.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        w.lastUser = w.clock;
        acts[b.dataset.act]?.();
        w.hudAt = -1;
        return;
      }
      const v = e.target.closest('[data-view]');
      if (v) w.goView(+v.dataset.view);
      const tr = e.target.closest('[data-tip]');
      if (tr) out.tip.innerHTML = tr.dataset.tip;
    });
    hud.addEventListener('pointerover', (e) => {
      const tr = e.target.closest('[data-tip]');
      if (tr) out.tip.innerHTML = tr.dataset.tip;
    });
    hud.addEventListener('input', (e) => {
      const k = e.target.dataset.in;
      if (k) {
        ctx.params[k] = +e.target.value;
        w.lastUser = w.clock;
      }
    });

    build(ctx.params);
    rebuildFloor(Math.round(ctx.params.surface));
    const o = exitPose();
    w.fly = null;
    controls.target.copy(o.target);
    camera.position.copy(o.pos);
    controls.update();

    return {
      w, glow, pmrem, envTarget, style, card, loupe, dot, tagA, tagB, hud, out, loupeCanvas, kernelShapes, steam, strand, key, fill, rim,
      onDown, onUp, onMove, onStart, build, rebuildFloor, flyTo, overviewPose, exitPose, focusKernel, pluck, openLoupe, closeLoupe, disposeView, placePinned,
    };
  },

  update(ctx, state) {
    const { w, steam, strand, card, loupe, dot } = state;
    const { params, camera, controls, scene } = ctx;
    const dt = Math.min(ctx.delta, 1 / 20);
    w.clock += dt;

    // Rebuild when the specimen's dials change.
    const sig = `${Math.round(params.bristol) + 1}|${Math.round(params.corn)}|${w.seed}|${params.water}|${params.height}|${params.gas}`;
    if (sig !== w.built) {
      state.build(params);
      w.born = w.clock;
    }
    if (w.floorKind !== Math.round(params.surface)) state.rebuildFloor(Math.round(params.surface));

    const live = w.live;
    const views = [live, w.pinned].filter(Boolean);
    const spec = live.spec;
    const ex = spec.exit;
    const play = w.play;

    // ---- studio ----
    const bg = [0x0d0c0b, 0x2b2b2e, 0x000000][Math.round(params.backdrop)] ?? 0x0d0c0b;
    if (scene.background.getHex() !== bg) {
      scene.background.setHex(bg);
      scene.fog.color.setHex(bg);
    }
    // The key light (and its shadow box) follows whatever is on show.
    const ka = params.keyAngle * RAD;
    const sb = live.spec.box.clone();
    if (w.pinned) sb.union(w.pinned.spec.box.clone().translate(w.pinned.group.position));
    const sc = sb.getCenter(new THREE.Vector3());
    state.key.target.position.set(sc.x, 0, sc.z);
    state.key.position.set(sc.x + Math.cos(ka) * 34, 46, sc.z + Math.sin(ka) * 34);
    const ext = Math.max(20, sb.getSize(new THREE.Vector3()).length() / 2 + 6);
    const sh = state.key.shadow.camera;
    if (sh.right !== ext) {
      Object.assign(sh, { left: -ext, right: ext, top: ext, bottom: -ext });
      sh.updateProjectionMatrix();
    }
    state.fill.intensity = params.fill;
    state.rim.intensity = params.rim;
    controls.autoRotate = params.turntable > 0 && !w.fly;
    controls.autoRotateSpeed = params.turntable / 6; // OrbitControls: 2 = 30 s a turn = 12°/s

    // ---- the exit, played back from the simulation ----
    if (!play.paused) {
      play.clock += dt;
      const tEnd = Math.max(...views.map((v) => v.spec.exit.tEnd));
      if (!play.done) {
        play.t = Math.min(tEnd, play.t + dt);
        if (play.t >= tEnd) play.done = true;
      }
    }
    const cutOn = params.cut >= 0.5;
    const heatOn = params.heat >= 0.5;
    const poses = views.map((v) => poseView(v, play, dt));
    const P = poses[0];
    Object.assign(ctx.motion, { drop: P.drop, out: P.out, L: P.L, v: ex.v });
    if (ex.kind === 'rope') {
      while (play.seenBreaks < ex.breaks.length && ex.breaks[play.seenBreaks].t <= play.t) {
        const b = ex.breaks[play.seenBreaks++];
        w.event = ex.lMin > ex.Lbreak
          ? `Torn off ${fmt(b.s, 1)} cm along: too soft to hold up even one ${fmt(ex.lMin, 1)} cm piece.`
          : `Torn off ${fmt(b.s, 1)} cm along: ${fmt(ex.Lbreak, 1)} cm hanging weighs more than its yield stress can hold.`;
        w.eventAt = w.clock;
      }
    }
    if (play.done && play.clock < P.tLeave && !play.paused) play.clock = P.tLeave; // skipped
    poses.forEach((p, i) => w.floor.fade(p.landed, i));

    // The director: watch it leave, then (once the body has gone) look at the result.
    if (play.director && P.rise >= 30 && !play.overviewed) {
      play.overviewed = true;
      w.overview();
      w.auto.next = Math.max(w.auto.next, w.clock + 5);
    }

    // ---- physics readout ----
    const gas = params.gas;
    const rho = RHO_STOOL * (1 - gas);
    const mStool = rho * spec.V;
    const left = w.kernels.filter((k) => k.state === 'in');
    const mCorn = left.reduce((s, k) => s + k.mass, 0);
    const Tair = params.airTemp;
    if (!play.paused) w.tReal += dt * 60 * params.speed;
    const cool = (v) => {
      const r = RHO_STOOL * (1 - v.gas);
      const tau = (r * C_STOOL * v.spec.V) / (H_AIR * v.spec.A * 1e-4);
      return { tau, T: Tair + (37 - Tair) * Math.exp(-w.tReal / tau) };
    };
    const { tau, T } = cool(live);
    const Bi = (H_AIR * (spec.V / spec.A) * 0.01) / K_STOOL;
    const rhoG = rho * G;
    // Conduction: the thickest part's core and skin.
    const hb = live.heat;
    const top = HEAT_ROWS - 1;
    const Tc = Tair + (37 - Tair) * hb.theta(top, 0, w.tReal);
    const Ts = Tair + (37 - Tair) * hb.theta(top, HEAT_COLS - 1, w.tReal);
    for (const v of views) {
      v.heat.update(w.tReal);
      v.uniforms.uHeatOn.value += ((heatOn ? 1 : 0) - v.uniforms.uHeatOn.value) * Math.min(1, dt * 6);
      v.uniforms.uDamp.value = params.damp;
      v.uniforms.uGrain.value = params.grain;
    }
    if (live.uniforms.uGas.value !== gas) {
      live.uniforms.uGas.value = gas;
      live.uniforms.uVoidR.value = voidRadius(gas);
    }

    // ---- the knife: one plane, the same in each specimen's own coordinates ----
    const az = params.cutAngle * RAD;
    const el = params.cutTilt * RAD;
    const n = w.cutN.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const box = spec.box;
    const c = box.getCenter(new THREE.Vector3());
    const hsz = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const reach = Math.abs(n.x) * hsz.x + Math.abs(n.y) * hsz.y + Math.abs(n.z) * hsz.z;
    const d = n.dot(c) + params.cutPos * reach;
    let secLive = null;
    for (const v of views) {
      if (cutOn) v.plane.set(n.clone().negate(), d + n.dot(v.group.position));
      else v.plane.set(new THREE.Vector3(0, 1, 0), 1e6);
      if (cutOn !== v.cutSide) {
        // Cut kernels show their insides (back faces); whole ones don't need to.
        v.cutSide = cutOn;
        for (const k of v.kernels) {
          k.mat.side = cutOn ? THREE.DoubleSide : THREE.FrontSide;
          k.mat.needsUpdate = true;
        }
      }
      v.cap.visible = cutOn;
      if (!cutOn) continue;
      const key = `${d.toFixed(4)}|${n.x.toFixed(4)},${n.y.toFixed(4)},${n.z.toFixed(4)}|${v.lastT}`;
      if (key !== v.secKey) {
        v.secKey = key;
        v.sec = section(v.spec.geos, n, d);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(v.sec.capPos, 3));
        const nrm = new Float32Array(v.sec.capPos.length);
        for (let i = 0; i < nrm.length; i += 3) nrm.set([n.x, n.y, n.z], i);
        g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        g.setIndex(v.sec.capIdx);
        v.cap.geometry.dispose();
        v.cap.geometry = g;
      }
      // Gas on the cut: sampled once the plane has stayed put for a moment.
      if (v.voidKey !== `${key}|${v.gas}` && w.clock - v.voidAt > 0.25 && v.sec) {
        v.voidKey = `${key}|${v.gas}`;
        v.voidAt = w.clock;
        v.voids = sectionVoids(v.sec, n, d, voidRadius(v.gas));
      }
      if (v === live) secLive = v.sec;
    }
    w.cutOn = cutOn;

    Object.assign(ctx.motion, {
      V: spec.V, A: spec.A, rho, mStool, mCorn, N: BACT_PER_G * mStool, tau, tMin: w.tReal / 60, T, Tair, Bi,
      cornLeft: left.length, cornTotal: w.kernels.length, event: w.event, since: w.clock - w.eventAt,
      water: ex.water, tauY: ex.tau, Lb: (Math.sqrt(3) * ex.tau * 10) / rhoG, lMin: ex.lMin ?? 0, hmax: (2 * ex.tau * 10) / rhoG,
      H: spec.H, leaving: P.leaving, pieces: ex.kind === 'rope' ? 1 + play.seenBreaks : ex.blobs.length,
      cut: cutOn, cutA: secLive ? secLive.area : 0, keptV: secLive ? secLive.keptV : 0, gasCut: live.voids?.frac ?? 0, phi: gas,
      heat: heatOn, sphere: hb.sphere, Fo: (hb.alpha * w.tReal) / hb.Rmax ** 2, BiR: hb.rows[top].Bi, Rth: hb.Rmax, Tc, Ts,
    });

    // ---- steam: vapour supply e_s(T) − RH·e_s(T_air) (Magnus), visible when the air is colder ----
    const es = (t) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));
    const supply = Math.max(0, es(T) - 0.5 * es(Tair)) / (es(37) - 0.5 * es(20));
    const intensity = Math.min(1.4, supply * Math.min(1, Math.max(0, (T - Tair) / 10))) * P.landed;
    steam.mat.uniforms.uIntensity.value = intensity;
    steam.mat.uniforms.uScale.value = ctx.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const tops = spec.top;
    for (let i = 0; i < STEAM_N; i++) {
      if (steam.life[i] >= 1) {
        if (Math.random() > intensity * 0.12 || !tops.length) continue;
        const j = 3 * Math.floor(Math.random() * (tops.length / 3));
        steam.pos.set([tops[j], tops[j + 1] + 0.35, tops[j + 2]], 3 * i);
        steam.vel.set([(Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4], 3 * i);
        steam.life[i] = 0;
        steam.rate[i] = 1 / (2.5 + Math.random() * 2.5);
        steam.size[i] = 0.6;
        continue;
      }
      steam.life[i] = Math.min(1, steam.life[i] + dt * steam.rate[i]);
      const x = steam.pos[3 * i];
      const y = steam.pos[3 * i + 1];
      const z = steam.pos[3 * i + 2];
      // Curl-ish drift from a slowly turning swirl.
      steam.vel[3 * i] += Math.sin(y * 0.7 + w.clock * 0.8 + i) * 0.6 * dt;
      steam.vel[3 * i + 2] += Math.cos(x * 0.5 + w.clock * 0.6 + i * 0.3) * 0.6 * dt;
      steam.pos[3 * i] = x + steam.vel[3 * i] * dt;
      steam.pos[3 * i + 1] = y + steam.vel[3 * i + 1] * dt;
      steam.pos[3 * i + 2] = z + steam.vel[3 * i + 2] * dt;
      steam.size[i] += dt * 1.4;
    }
    steam.geo.attributes.position.needsUpdate = true;
    steam.geo.attributes.aLife.needsUpdate = true;
    steam.geo.attributes.aSize.needsUpdate = true;

    // ---- kernels in flight (B's: A's stay put) ----
    let strandOn = false;
    for (const k of w.kernels) {
      if (k.state === 'tug') {
        k.t += dt;
        const u = Math.min(1, k.t / 0.35);
        const wob = Math.sin(k.t * 60) * 0.03 * (1 - u);
        k.mesh.position.copy(k.C).addScaledVector(k.n, 0.22 * u * u + wob);
        strandOn = true;
        const a = k.P.clone().addScaledVector(k.n, -0.1);
        const b = k.mesh.position.clone();
        strand.position.copy(a).add(b).multiplyScalar(0.5);
        strand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        strand.scale.set(0.05 * (1 - u * 0.6), a.distanceTo(b) + 0.01, 0.05 * (1 - u * 0.6));
        if (u >= 1) {
          k.state = 'fly';
          k.t = 0;
          const h = new THREE.Vector3(k.n.x, 0, k.n.z);
          if (h.lengthSq() < 0.04) h.set(Math.random() - 0.5, 0, Math.random() - 0.5);
          h.normalize();
          k.vel.copy(h).multiplyScalar(38 + Math.random() * 14);
          k.vel.y = 45 + Math.random() * 15;
          k.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
        }
      } else if (k.state === 'fly') {
        k.t += dt;
        const steps = 4;
        const h = dt / steps;
        const rest = k.half.z * (k.hull ? 1.2 : 1.05);
        for (let s = 0; s < steps; s++) {
          k.vel.y -= G * h;
          k.mesh.position.addScaledVector(k.vel, h);
          if (k.mesh.position.y < rest) {
            k.mesh.position.y = rest;
            if (k.vel.y < 0) k.vel.y *= -0.3;
            k.vel.x *= 0.7;
            k.vel.z *= 0.7;
            k.spin.multiplyScalar(0.6);
            // Sliding friction on the floor.
            const sp = Math.hypot(k.vel.x, k.vel.z);
            if (sp > 0) {
              const dec = Math.min(sp, 300 * h);
              k.vel.x -= (k.vel.x / sp) * dec;
              k.vel.z -= (k.vel.z / sp) * dec;
            }
          }
        }
        const sw = k.spin.length();
        if (sw > 0.01) k.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(k.spin.clone().normalize(), sw * dt));
        if (k.t < 0.08) {
          strandOn = true;
          const a = k.P.clone().addScaledVector(k.n, -0.1);
          const b = k.mesh.position.clone();
          strand.position.copy(a).add(b).multiplyScalar(0.5);
          strand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          strand.scale.set(0.02 * (1 - k.t / 0.08), a.distanceTo(b), 0.02 * (1 - k.t / 0.08));
        }
        if (k.mesh.position.y <= rest + 0.01 && Math.abs(k.vel.y) < 8 && Math.hypot(k.vel.x, k.vel.z) < 2) {
          k.state = 'settle';
          k.t = 0;
          // Lie on whichever flat face is nearer the floor.
          const zw = new THREE.Vector3(0, 0, 1).applyQuaternion(k.mesh.quaternion);
          const up = new THREE.Vector3(0, zw.y >= 0 ? 1 : -1, 0);
          const yw = new THREE.Vector3(0, 1, 0).applyQuaternion(k.mesh.quaternion);
          yw.y = 0;
          if (yw.lengthSq() < 1e-4) yw.set(1, 0, 0);
          yw.normalize();
          const zAx = up;
          const xAx = new THREE.Vector3().crossVectors(yw, zAx);
          k.q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yw, zAx));
          k.q0 = k.mesh.quaternion.clone();
        }
      } else if (k.state === 'settle') {
        k.t += dt;
        const u = Math.min(1, k.t / 0.35);
        k.mesh.quaternion.slerpQuaternions(k.q0, k.q1, u * u * (3 - 2 * u));
        if (u >= 1) k.state = 'out';
      }
    }
    strand.visible = strandOn;

    // ---- autopilot: examine, pull, step back; a fresh one when it's done ----
    const idle = w.clock - w.lastUser > IDLE;
    if (idle && P.rise >= 30 && !w.fly && w.clock > w.auto.next && !play.paused) {
      const a = w.auto;
      const inK = w.kernels.filter((k) => k.state === 'in' && k.mesh.visible);
      if (a.step === 'focus' && w.focus) {
        state.pluck(w.focus);
        a.step = 'back';
        a.next = w.clock + 2.4;
      } else if (a.step === 'back') {
        w.overview();
        a.step = 'idle';
        a.next = w.clock + 4;
      } else if (inK.length && T - Tair > 0.5) {
        state.focusKernel(inK[Math.floor(Math.random() * inK.length)]);
        a.step = 'focus';
        a.next = w.clock + 3.2;
      } else {
        w.fresh(true);
        a.next = w.clock + 6;
      }
    }

    // ---- camera flight ----
    if (w.fly) {
      const f = w.fly;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      const s = u * u * (3 - 2 * u);
      controls.target.lerpVectors(f.t0, f.t1, s);
      camera.position.lerpVectors(f.p0, f.p1, s);
      if (u >= 1) w.fly = null;
    }

    // ---- labels that follow the 3D scene ----
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const toScreen = (p) => {
      const v = p.clone().project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, behind: v.z > 1 };
    };
    const cardK = w.focus || (w.cardFor && w.clock < w.cardUntil ? w.cardFor : null);
    if (cardK) {
      const s = toScreen(cardK.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
      card.style.left = `${s.x}px`;
      card.style.top = `${s.y}px`;
      const dims = `${fmt(cardK.half.y * 20, 0)} × ${fmt(cardK.half.x * 20, 0)} × ${fmt(cardK.half.z * 20, 1)} mm`;
      const html = cardK.state === 'in'
        ? `<b>Kernel ${cardK.index}</b> · ${cardK.hull ? 'empty hull' : 'intact'}<br>${dims} · ${fmt(cardK.mass, 2)} g<br>` +
          `${cardK.hull ? 'Just the pericarp: the starch inside was digested.' : 'Pericarp: cellulose. Starch inside: untouched.'}` +
          '<small>Tap it again to pull it out</small>'
        : `<b>Out.</b> ${fmt(cardK.mass, 2)} g of corn${cardK.hull ? ' (hull only)' : ''}.<small>${w.kernels.filter((k) => k.state === 'in').length} left in there</small>`;
      if (card.innerHTML !== html) card.innerHTML = html;
      card.style.opacity = s.behind ? '0' : '1';
    } else {
      card.style.opacity = '0';
    }
    if (w.loupe) {
      const s = toScreen(w.loupe.point);
      dot.style.left = `${s.x}px`;
      dot.style.top = `${s.y}px`;
      const lw = loupe.offsetWidth || 240;
      let lx = s.x + 30;
      let ly = s.y - 300;
      if (lx + lw > window.innerWidth - 12) lx = s.x - 30 - lw;
      lx = Math.max(12, lx);
      ly = Math.max(60, Math.min(window.innerHeight - (loupe.offsetHeight || 420) - 12, ly));
      loupe.style.left = `${lx}px`;
      loupe.style.top = `${ly}px`;
      if (ctx.frame % 2 === 0) drawSlide(state.loupeCanvas, w.loupe.slide, w.mag);
    }
    // A and B name tags, over each specimen.
    const tagAt = (tag, v) => {
      if (!v || !w.pinned) {
        tag.style.display = 'none';
        return;
      }
      const b = v.spec.box;
      const s = toScreen(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 1.5, (b.min.z + b.max.z) / 2).add(v.group.position));
      tag.style.display = s.behind ? 'none' : 'block';
      tag.style.left = `${s.x}px`;
      tag.style.top = `${s.y}px`;
    };
    tagAt(state.tagA, w.pinned);
    tagAt(state.tagB, live);

    // ---- instruments (a few times a second) ----
    if (w.clock - w.hudAt > 0.2 || w.hudAt < 0) {
      w.hudAt = w.clock;
      drawHud(state, ctx, { T, Tair, tau, Tc, Ts, cutOn, heatOn, rho, mStool });
    }
  },

  dispose(ctx, state) {
    const el = ctx.renderer.domElement;
    el.removeEventListener('pointerdown', state.onDown, { capture: true });
    window.removeEventListener('pointerup', state.onUp);
    el.removeEventListener('pointermove', state.onMove);
    ctx.controls?.removeEventListener('start', state.onStart);
    if (ctx.controls) ctx.controls.autoRotate = false;
    el.style.cursor = '';
    for (const x of [state.card, state.loupe, state.dot, state.tagA, state.tagB, state.hud, state.style]) x.remove();
    state.disposeView(state.w.live);
    state.disposeView(state.w.pinned);
    state.w.floor?.dispose();
    state.kernelShapes.forEach((s) => s.geo.dispose());
    state.steam.geo.dispose();
    state.steam.mat.dispose();
    state.strand.geometry.dispose();
    state.strand.material.dispose();
    state.glow.dispose();
    state.envTarget.dispose();
    state.pmrem.dispose();
    ctx.renderer.localClippingEnabled = false;
    ctx.scene.environment = null;
    ctx.scene.fog = null;
  },
};
