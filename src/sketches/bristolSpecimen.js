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
//   - it hangs until ρgΔy = √3 τ_y, i.e. Δy_max = √3 τ_y/(ρg), then tears;
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
        varying vec3 vObj;
        varying float vCrack;
        varying float vCav;
        ${SNOISE}
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
        col *= mix(1.0, 0.32, vCrack);               // inside a crack
        col *= mix(1.0, 0.62, vCav);                 // a socket: wetter, darker
        col *= mix(0.82, 1.0, smoothstep(0.0, 0.35, vWorld.y)); // where it touches the floor
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
        // uWet: 0 for a hard dry type 1, 1 for a soft type 5. Wet stool is
        // matte with a thin sheen, not glossy: the clearcoat stays weak.
        float dry = clamp(0.55 + 6.0 * bsH + 0.6 * vCrack - (uWet - 0.5) * 0.5, 0.0, 1.0);
        roughnessFactor = mix(0.5, 0.95, dry);
        roughnessFactor = mix(roughnessFactor, 0.42, vCav);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bsBump(-vViewPosition, normal, bsH, faceDirection);`,
      );
    // The clearcoat is the mucus film: stronger on the soft types, gone in the cracks.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
      material.clearcoat *= (0.05 + 0.6 * uWet * uWet) * (1.0 - vCrack) * (1.0 - 0.6 * smoothstep(0.0, 0.05, bsH));`,
    );
  };
  mat.customProgramCacheKey = () => 'bristolStool';
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
        diffuseColor.rgb = mix(ky, vec3(0.10, 0.048, 0.016), coat * 0.94);`,
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
// material can make, h_max = 2τ_y/(ρg).
function bakeExit({ L, radius, v, tau, rho, H, seed }) {
  const rng = mulberry32(seed ^ 0x2c1b3c6d);
  const n = Math.max(8, Math.round(L / 0.4) + 1);
  const h = L / (n - 1);
  const rhoG = rho * G;
  const tauC = tau * 10; // Pa → dyn/cm²
  const Lbreak = (Math.sqrt(3) * tauC) / rhoG;
  const hmax = (2 * tauC) / rhoG;
  const e = EXIT_DIR;
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
  const dt = 1 / 480;
  const iters = 6;
  const A = [0, 0, 0];
  const tEmit = L / v;
  const breaks = [];
  const rec = [];
  let t = 0;
  let quiet = 0;
  let drop = 0;
  let tTouch = -1;
  const place = (i) => {
    const d = i * h - v * t; // depth inside the canal
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
    rec.push({ x: Float32Array.from(x), up, sy: Float32Array.from(sy), A: [A[0], A[1], A[2]], drop });
  };
  record();
  let nextRec = 1 / EXIT_FPS;
  while (true) {
    for (let i = 0; i < n; i++) {
      if (free[i]) continue;
      if (i * h - v * t <= 0) free[i] = 1;
      else {
        xp[3 * i] = x[3 * i];
        xp[3 * i + 1] = x[3 * i + 1];
        xp[3 * i + 2] = x[3 * i + 2];
      }
    }
    t += dt;
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
    for (let it = 0; it < iters; it++) {
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
      for (let q = 0; q < SPANS.length; q++) {
        const m = SPANS[q];
        const rest = bend[q];
        for (let i = 0; i + m < n; i++) {
          if (!free[i] && !free[i + m]) continue;
          let ok = true;
          for (let j = i; j < i + m; j++) if (!link[j]) ok = false;
          if (!ok) continue;
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
          if (dy > 0) touch[j] = 1;
          else touch[i] = 1;
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
    }
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
      if (drop > Lbreak && L - top * h > 1.5) {
        link[top] = 0;
        breaks.push({ i: top, s: (top + 0.5) * h, t });
      }
    }
    while (t >= nextRec) {
      record();
      nextRec += 1 / EXIT_FPS;
    }
    if (t > tEmit + 0.2) quiet = vmax < 1.5 ? quiet + dt : 0;
    if (quiet > 0.4 || t > tEmit + 6) break;
  }
  record();
  return { kind: 'rope', n, h, rec, breaks, Lbreak, hmax, tEmit, tTouch: Math.max(0, tTouch), tEnd: (rec.length - 1) / EXIT_FPS, v, L, radius };
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
  return { geos, pieces, kernels, V, A, foot, top, box, exit, frames, H };
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
function buildFloor(kind, spec) {
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

  // Contact shadow (all floors) and a wet stain (porcelain, concrete).
  const plane = keep(new THREE.PlaneGeometry(2 * S, 2 * S));
  const ao = new THREE.Mesh(plane, keep(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: keep(footprintTexture(spec.foot, S, 'ao')), transparent: true, opacity: kind === 0 ? 0.85 : 0.7, depthWrite: false })));
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.004;
  ao.renderOrder = 1;
  group.add(ao);
  // These appear as it lands (update() scales the opacities).
  const fades = [[ao.material, ao.material.opacity]];
  if (kind !== 2) {
    const stain = new THREE.Mesh(
      plane,
      keep(new THREE.MeshPhysicalMaterial({ color: kind === 0 ? 0x3a2410 : 0x1a1408, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3, alphaMap: keep(footprintTexture(spec.foot, S, 'stain')), transparent: true, opacity: kind === 0 ? 0.75 : 0.55, depthWrite: false })),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.008;
    stain.renderOrder = 2;
    group.add(stain);
    fades.push([stain.material, stain.material.opacity]);
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
    for (let i = 0; i < spec.foot.length; i += 3) footGrid.add(`${Math.round(spec.foot[i] * 2)},${Math.round(spec.foot[i + 1] * 2)}`);
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
      const x = Math.cos(a) * r;
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
  const fade = (f) => fades.forEach(([m, o]) => (m.opacity = o * f));
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

// ---------- microscope (Gram stain, ×1000) ----------
const FIELD_UM = 40;
function makeField(rho, seed) {
  const rnd = mulberry32(seed);
  const perUm3 = (BACT_PER_G * rho) / 1e12;
  const area = Math.PI * (FIELD_UM / 2) ** 2;
  const count = Math.round(perUm3 * area * 1);
  const cells = [];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * FIELD_UM * 0.52;
    const a = rnd() * Math.PI * 2;
    const kind = rnd();
    const type = kind < 0.55 ? 'neg' : kind < 0.85 ? 'cocci' : 'pos';
    cells.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      ang: rnd() * Math.PI,
      len: type === 'cocci' ? 0 : type === 'neg' ? 1.2 + rnd() * 1.6 : 2 + rnd() * 2.5,
      chain: type === 'cocci' ? 1 + Math.floor(rnd() * 4) : 1,
      type,
      jx: 0,
      jy: 0,
    });
  }
  // Plant cell walls (fibre) and food debris.
  const walls = [];
  const nW = 1 + Math.floor(rnd() * 2);
  for (let w = 0; w < nW; w++) {
    const cx = (rnd() - 0.5) * FIELD_UM * 0.7;
    const cy = (rnd() - 0.5) * FIELD_UM * 0.7;
    const rot = rnd() * Math.PI;
    const cellsW = [];
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) if (rnd() < 0.7) cellsW.push([i * 6 + (j & 1) * 3, j * 5.2]);
    walls.push({ cx, cy, rot, cells: cellsW });
  }
  const debris = [];
  for (let i = 0; i < 14; i++) {
    debris.push({ x: (rnd() - 0.5) * FIELD_UM, y: (rnd() - 0.5) * FIELD_UM, r: 0.8 + rnd() * 3, a: rnd() * 6.28, k: rnd() });
  }
  return { cells, walls, debris, count, perUm3, area };
}

function drawField(cv, field, time) {
  const g = cv.getContext('2d');
  const W = cv.width;
  const k = W / FIELD_UM;
  g.save();
  const bg = g.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.55);
  bg.addColorStop(0, '#f6e7e4');
  bg.addColorStop(1, '#d9b9b8');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, W);
  g.translate(W / 2, W / 2);
  // Debris: amorphous, pale pink-brown.
  for (const d of field.debris) {
    g.fillStyle = d.k < 0.5 ? 'rgba(170,110,110,0.25)' : 'rgba(150,120,90,0.28)';
    g.beginPath();
    for (let s = 0; s <= 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const rr = d.r * k * (0.7 + 0.3 * Math.sin(a * 3 + d.a));
      g.lineTo(d.x * k + Math.cos(a) * rr, d.y * k + Math.sin(a) * rr);
    }
    g.fill();
  }
  // Cell walls: polygon outlines, counterstained pink.
  g.strokeStyle = 'rgba(190,80,110,0.55)';
  g.lineWidth = 0.5 * k;
  for (const w of field.walls) {
    g.save();
    g.translate(w.cx * k, w.cy * k);
    g.rotate(w.rot);
    for (const [cx, cy] of w.cells) {
      g.beginPath();
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo((cx + Math.cos(a) * 3.2) * k, (cy + Math.sin(a) * 2.8) * k);
      }
      g.closePath();
      g.stroke();
    }
    g.restore();
  }
  // Bacteria, jiggling (Brownian, slowed by the viscous matrix).
  g.lineCap = 'round';
  for (const c of field.cells) {
    c.jx += (Math.random() - 0.5) * 0.06;
    c.jy += (Math.random() - 0.5) * 0.06;
    c.jx *= 0.96;
    c.jy *= 0.96;
    const x = (c.x + c.jx) * k;
    const y = (c.y + c.jy) * k;
    if (c.type === 'cocci') {
      g.fillStyle = 'rgba(70,30,120,0.85)';
      for (let i = 0; i < c.chain; i++) {
        g.beginPath();
        g.arc(x + Math.cos(c.ang) * i * 1.0 * k, y + Math.sin(c.ang) * i * 1.0 * k, 0.48 * k, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.strokeStyle = c.type === 'neg' ? 'rgba(205,60,95,0.85)' : 'rgba(75,35,130,0.85)';
      g.lineWidth = (c.type === 'neg' ? 0.55 : 0.75) * k;
      const dx = (Math.cos(c.ang) * c.len * k) / 2;
      const dy = (Math.sin(c.ang) * c.len * k) / 2;
      g.beginPath();
      g.moveTo(x - dx, y - dy);
      g.lineTo(x + dx, y + dy);
      g.stroke();
    }
  }
  g.restore();
  // Scale bar: 10 µm.
  g.fillStyle = 'rgba(20,10,20,0.75)';
  g.fillRect(W * 0.12, W * 0.86, 10 * k, Math.max(2, W * 0.008));
  g.font = `${Math.round(W * 0.05)}px system-ui, sans-serif`;
  g.fillText('10 µm', W * 0.12, W * 0.84);
  void time;
}

const CSS = `
.bs-card{position:fixed;z-index:6;pointer-events:none;max-width:250px;padding:10px 12px;border-radius:12px;
  background:rgba(12,10,8,.82);backdrop-filter:blur(8px);color:#fff;font:13px/1.4 system-ui,sans-serif;
  box-shadow:0 8px 24px rgba(0,0,0,.45);border:1px solid rgba(255,209,102,.35);transform:translate(-50%,calc(-100% - 18px));transition:opacity .2s}
.bs-card b{color:#ffd166}
.bs-card small{display:block;color:rgba(255,255,255,.6);margin-top:4px}
.bs-loupe{position:fixed;z-index:6;width:220px;pointer-events:none;transition:opacity .2s}
.bs-loupe canvas{display:block;width:220px;height:220px;border-radius:50%;border:4px solid #1b1b1f;box-shadow:0 0 0 1px rgba(255,255,255,.2),0 12px 30px rgba(0,0,0,.6)}
.bs-loupe div{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(12,10,8,.82);color:#fff;font:12px/1.4 system-ui,sans-serif}
.bs-dot{position:fixed;z-index:6;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #ffd166;border-radius:50%;pointer-events:none}
`;

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '?');

export default {
  name: 'Bristol Specimen',
  description:
    'An anatomically honest stool on the Bristol scale, with sweet corn in it, watched as it leaves. Its firmness is a yield ' +
    'stress that falls with water content: it hangs until its own weight tears it, slumps if it is soft, folds or topples as it lands. ' +
    'Then tap a kernel to examine it and tap again to pull it out; tap the stool for a Gram-stained look at ×1000; zoom right in. ' +
    'Volume by the divergence theorem, mass, bacteria count and Newton cooling, all live.',
  tags: ['biology', 'anatomy', 'corn', 'microscope', 'bacteria', 'cooling', 'rheology', 'yield stress', 'interactive', 'humor', 'realistic'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',
  wheelZoom: true,

  motion() {
    return {
      V: 0, A: 0, rho: RHO_STOOL, mStool: 0, mCorn: 0, N: 1, tau: 0, tMin: 0, T: 37, Tair: 21, Bi: 0, cornLeft: 0, cornTotal: 0, event: '', since: 99,
      water: 0.76, tauY: TAU_REF, Lb: 25, hmax: 29, drop: 0, v: 1, out: 0, L: 0, H: 15, leaving: false, pieces: 1,
    };
  },

  latex: (params, hl, m) => {
    const type = Math.round(params.bristol ?? 3) + 1;
    const e = Math.floor(Math.log10(Math.max(m.N, 1)));
    const floats = m.rho < 1;
    const line =
      beat(m.since, [[0, m.event], [4, '']]) ||
      (m.leaving ? (m.Lb < m.H ? `Anything hanging more than ${fmt(m.Lb, 1)} cm tears off under its own weight.` : 'Firm enough to reach the floor in one piece.') : '') ||
      (floats ? 'Floats: the gas, not the fat (Levitt & Duane, 1972).' : '') ||
      (m.T - m.Tair > 6 ? 'Steaming: warm, wet air meeting cold air.' : '') ||
      (m.T - m.Tair < 1 ? 'Room temperature. Now it is just a sculpture.' : 'Cooling exactly as fast as Newton said it would.');
    const tauTex = m.tauY >= 1e4 ? `${hl(m.tauY / 1000, 0)}\\,\\text{kPa}` : m.tauY >= 1000 ? `${hl(m.tauY / 1000, 2)}\\,\\text{kPa}` : `${hl(m.tauY, 0)}\\,\\text{Pa}`;
    const big = (x) => (x > 999 ? '\\gg 1\\,\\text{m}' : `${hl(x, 1)}\\,\\text{cm}`);
    return (
      '\\begin{aligned}' +
      `\\text{Bristol type ${type}} &: \\text{${BRISTOL[type - 1]}} \\\\` +
      `\\tau_y &= 1.5\\,\\text{kPa}\\; e^{-(w - 76\\%)/1.5\\%} = ${tauTex}\\quad (w = ${hl(m.water * 100, 1)}\\%\\ \\text{water}) \\\\` +
      `\\Delta y_{\\text{max}} &= \\tfrac{\\sqrt3\\,\\tau_y}{\\rho g} = ${big(m.Lb)}\\quad (\\text{hanging now: } ${hl(m.drop, 1)}\\,\\text{cm}),\\quad h_{\\text{max}} = \\tfrac{2\\tau_y}{\\rho g} = ${big(m.hmax)} \\\\` +
      `v &= \\tfrac{L}{12\\,\\text{s}} = ${hl(m.v, 2)}\\,\\tfrac{\\text{cm}}{\\text{s}}:\\quad ${hl(m.out, 1)}\\text{ of }${hl(m.L, 1)}\\,\\text{cm out, in }${m.pieces}\\text{ piece${m.pieces === 1 ? '' : 's'}} \\\\` +
      `V &= \\tfrac13\\textstyle\\oint \\mathbf x\\cdot\\mathbf n\\,dA = ${hl(m.V, 1)}\\,\\text{cm}^3,\\quad A = ${hl(m.A, 0)}\\,\\text{cm}^2 \\\\` +
      `\\rho &= ${RHO_STOOL}\\,(1-\\varphi_{\\text{gas}}) = ${hl(m.rho, 3)}\\,\\tfrac{\\text{g}}{\\text{cm}^3}\\ ${floats ? '< 1:\\ \\text{floats}' : '> 1:\\ \\text{sinks}'} \\\\` +
      `m &= \\rho V + m_{\\text{corn}} = ${hl(m.mStool, 1)} + ${hl(m.mCorn, 2)}\\,\\text{g} \\\\` +
      `N_{\\text{bact}} &\\approx 0.9\\times10^{11}\\,\\tfrac{1}{\\text{g}}\\cdot\\rho V = ${hl(m.N / 10 ** e, 1)}\\times10^{${e}} \\approx ${hl(m.N / WORLD_POP, 0)}\\times\\text{everyone alive} \\\\` +
      `T &= T_{\\text{air}} + (37 - T_{\\text{air}})\\,e^{-t/\\tau},\\quad \\tau = \\tfrac{\\rho c V}{hA} = ${hl(m.tau / 60, 0)}\\,\\text{min} \\\\` +
      `& t = ${hl(m.tMin, 0)}\\,\\text{min}:\\quad T = ${hl(m.T, 1)}\\,{}^\\circ\\text{C}\\quad (\\text{Bi} = ${hl(m.Bi, 2)}) \\\\` +
      `\\text{corn} &: ${hl(m.cornLeft, 0)}\\text{ of }${m.cornTotal}\\text{ kernels left; cellulose, and no human enzyme cuts }\\beta(1{\\to}4) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
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
    gas: { value: 0.03, min: 0, max: 0.2, step: 0.005, group: 'Specimen', label: 'Gas fraction', help: 'Share of the volume that is gas bubbles. Above about 0.065 it floats.' },
    height: { value: 15, min: 6, max: 35, step: 1, group: 'Scene', label: 'Drop height (cm)', help: 'How high the anus is above the floor. Higher: more of it hangs, so softer ones tear off.' },
    surface: { value: 0, min: 0, max: 2, step: 1, options: ['Porcelain', 'Concrete', 'Lawn'], group: 'Scene', label: 'Floor', help: 'What it landed on.' },
    airTemp: { value: 20, min: -5, max: 35, step: 1, group: 'Scene', label: 'Air temperature (°C)', help: 'Colder air: more steam, faster cooling.' },
    speed: { value: 1, min: 0, max: 5, step: 0.1, group: 'Scene', label: 'Time warp', help: '1 = one minute of cooling per second on screen. The exit itself always plays in real time.' },
  },

  actions: {
    fresh: { label: 'Fresh one', run: (ctx, st) => st.w.fresh(false) },
    replay: { label: 'Watch it leave again', run: (ctx, st) => st.w.replay() },
    skip: { label: 'Skip to the landing', run: (ctx, st) => st.w.skip() },
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

    const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
    key.position.set(-26, 46, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 10, far: 120 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0xc4d6ff, 0.5);
    fill.position.set(30, 18, -10);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(8, 14, -40);
    // Light bounced off the floor: what lets you see anything's underside.
    const bounce = new THREE.DirectionalLight(0xfff4ea, 0.55);
    bounce.position.set(6, -30, 10);
    scene.add(key, fill, rim, bounce);

    const glow = createGlow(ctx, { fov: 32, strength: 0.1, threshold: 1.8, exposure: 1.0, vignette: 0.55 });

    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 150;
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
    loupeCanvas.width = loupeCanvas.height = 440;
    const loupeText = document.createElement('div');
    loupe.append(loupeCanvas, loupeText);
    const dot = document.createElement('div');
    dot.className = 'bs-dot';
    dot.style.display = 'none';
    document.body.append(card, loupe, dot);

    const kernelShapes = [kernelGeometry(false), kernelGeometry(true)];
    const stoolUniforms = {
      uType: { value: 4 }, uGas: { value: 0.03 }, uSeed: { value: 0 }, uWet: { value: 0.5 },
      uClip: { value: new THREE.Vector4(0, 1, 0, 1e6) },
    };
    const stoolMat = stoolMaterial(stoolUniforms);
    const steam = createSteam();
    scene.add(steam.points);
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.75 }));
    strand.visible = false;
    scene.add(strand);
    const body = createBody();
    scene.add(body.mesh);

    // Everything that changes lives in `w`: SketchRunner keeps a shallow copy
    // of the returned state, so handlers and actions must share one object.
    const w = {
      seed: 1 + Math.floor(Math.random() * 1e6),
      built: '',
      floorKind: -1,
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
      raycaster: new THREE.Raycaster(),
      hover: null,
      lastHoverAt: 0,
      play: { t: 0, clock: 0, done: false, gone: false, seenBreaks: 0, director: true },
    };

    function clearSpecimen() {
      for (const m of w.pieces) {
        scene.remove(m);
        m.geometry.dispose();
      }
      for (const k of w.kernels) {
        scene.remove(k.mesh);
        k.mat.dispose();
      }
      w.pieces = [];
      w.kernels = [];
    }

    function build(params) {
      clearSpecimen();
      const type = Math.round(params.bristol) + 1;
      const spec = buildSpecimen(type, Math.round(params.corn), w.seed, kernelShapes, { water: params.water, gas: params.gas, height: params.height });
      w.spec = spec;
      stoolUniforms.uType.value = type;
      stoolUniforms.uWet.value = Math.min(1, Math.max(0, (spec.exit.water - 0.66) / 0.15));
      stoolUniforms.uSeed.value = (w.seed % 997) * 0.37;
      for (const g of spec.geos) {
        const m = new THREE.Mesh(g, stoolMat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        scene.add(m);
        w.pieces.push(m);
      }
      spec.kernels.forEach((k, i) => {
        const { mat, uniforms } = kernelMaterial(k.hull, i * 3.7 + (w.seed % 101));
        const mesh = new THREE.Mesh(kernelShapes[k.hull ? 1 : 0].geo, mat);
        mesh.scale.setScalar(k.scale);
        mesh.position.copy(k.C);
        mesh.quaternion.setFromRotationMatrix(k.basis);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The surface plane, in the kernel's frame (before its scale).
        const nl = k.n.clone().applyQuaternion(mesh.quaternion.clone().invert());
        const pl = k.P.clone().sub(k.C).applyQuaternion(mesh.quaternion.clone().invert()).divideScalar(k.scale);
        uniforms.uPlane.value.set(nl.x, nl.y, nl.z, nl.dot(pl));
        scene.add(mesh);
        w.kernels.push({ ...k, mesh, mat, uniforms, state: 'in', t: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), index: i + 1 });
      });
      w.built = `${type}|${Math.round(params.corn)}|${w.seed}|${params.water}|${params.height}`;
      w.floorKind = -1; // the floor's stain follows the footprint
      startPlay();
    }

    function startPlay() {
      w.play = { t: 0, clock: 0, done: false, gone: false, seenBreaks: 0, director: w.play.director };
      w.tReal = 0;
      w.focus = null;
      closeLoupe();
      for (const k of w.kernels) {
        if (k.state === 'in') continue;
        // Put plucked kernels back where they were.
        k.state = 'in';
        k.t = 0;
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
      w.floor = buildFloor(kind, w.spec);
      scene.add(w.floor.group);
      w.floorKind = kind;
    }

    // ---- camera ----
    const fit = (r) => {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      return r / t / Math.min(1, camera.aspect * 1.1);
    };
    const overviewPose = () => {
      const b = w.spec.box;
      const c = b.getCenter(new THREE.Vector3());
      const r = b.getSize(new THREE.Vector3()).length() / 2;
      const dist = Math.min(controls.maxDistance, Math.max(14, fit(r) * 1.05));
      const dir = new THREE.Vector3(0.6, 0.48, 0.85).normalize();
      return { target: new THREE.Vector3(c.x, 0.9, c.z), pos: new THREE.Vector3(c.x, 0.9, c.z).addScaledVector(dir, dist) };
    };
    // From the side and a little below the anus: the whole drop in frame.
    const exitPose = () => {
      const H = w.spec.H;
      const b = w.spec.box;
      const c = b.getCenter(new THREE.Vector3());
      const target = new THREE.Vector3(c.x * 0.5, H * 0.42 + 1, c.z * 0.5);
      const r = Math.max(H * 0.5 + 4, b.getSize(new THREE.Vector3()).length() * 0.4);
      const dist = Math.min(controls.maxDistance, fit(r));
      // As low as the orbit allows (camera just above the target's level), so the anus is seen from below.
      const dir = new THREE.Vector3(1, 0.13, 0.42).normalize();
      return { target, pos: target.clone().addScaledVector(dir, dist) };
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
      w.play.t = w.spec.exit.tEnd;
      w.play.clock = Math.max(w.play.clock, w.spec.exit.tEnd + 6);
    };

    // ---- microscope ----
    function openLoupe(point, rho) {
      w.loupe = { point: point.clone(), field: makeField(rho, Math.floor(Math.random() * 1e6)) };
      const f = w.loupe.field;
      loupeText.innerHTML =
        `<b style="color:#ffd166">Gram stain, ×1000</b> (${FIELD_UM} µm across)<br>` +
        `${fmt(f.perUm3, 3)} bacteria/µm³ × ${fmt(f.area, 0)} µm² × 1 µm in focus ≈ <b>${f.count}</b> cells.<br>` +
        '<span style="color:#ff8fae">Pink</span>: Gram-negative rods (Bacteroides-like). <span style="color:#b9a0ff">Purple</span>: Gram-positive (Firmicutes).';
      loupe.style.opacity = '1';
      dot.style.display = 'block';
      w.event = 'About half of what you are looking at, by dry weight, is bacteria (Stephen & Cummings, 1980).';
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
    const kernelAt = (e) => {
      castAt(e);
      const live = w.kernels.filter((k) => k.state === 'in' && k.mesh.visible);
      const hit = w.raycaster.intersectObjects(live.map((k) => k.mesh), false)[0];
      const stoolHit = w.raycaster.intersectObjects(w.pieces, false)[0];
      if (!hit || (stoolHit && stoolHit.distance < hit.distance - 0.05)) return null;
      return live.find((k) => k.mesh === hit.object) || null;
    };
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
      const hit = w.raycaster.intersectObjects(w.pieces, false)[0];
      if (hit) {
        w.focus = null;
        openLoupe(hit.point, ctx.motion?.rho ?? RHO_STOOL);
      } else {
        w.focus = null;
        closeLoupe();
      }
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

    build(ctx.params);
    rebuildFloor(Math.round(ctx.params.surface));
    const o = exitPose();
    w.fly = null;
    controls.target.copy(o.target);
    camera.position.copy(o.pos);
    controls.update();

    return {
      w, glow, pmrem, envTarget, style, card, loupe, dot, loupeCanvas, kernelShapes, stoolMat, stoolUniforms, steam, strand, key, body,
      onDown, onUp, onMove, onStart, build, rebuildFloor, flyTo, overviewPose, exitPose, focusKernel, pluck, openLoupe, closeLoupe,
    };
  },

  update(ctx, state) {
    const { w, steam, strand, card, loupe, dot, body, stoolUniforms } = state;
    const { params, camera, controls } = ctx;
    const dt = Math.min(ctx.delta, 1 / 20);
    w.clock += dt;

    // Rebuild when the specimen's dials change.
    const sig = `${Math.round(params.bristol) + 1}|${Math.round(params.corn)}|${w.seed}|${params.water}|${params.height}`;
    if (sig !== w.built) {
      state.build(params);
      w.born = w.clock;
    }
    if (w.floorKind !== Math.round(params.surface)) state.rebuildFloor(Math.round(params.surface));

    const spec = w.spec;
    const ex = spec.exit;
    const play = w.play;

    // ---- the exit, played back from the simulation ----
    play.clock += dt;
    const wasDone = play.done;
    if (!play.done) {
      play.t = Math.min(ex.tEnd, play.t + dt);
      if (play.t >= ex.tEnd) play.done = true;
    }
    if (!wasDone) {
      for (let i = 0; i < spec.pieces.length; i++) {
        const pc = spec.pieces[i];
        spec.frames(pc, play.t);
        const g = w.pieces[i].geometry;
        skin(pc, pc.F, g.attributes.position.array);
        g.attributes.position.needsUpdate = true;
        g.computeVertexNormals();
        g.computeBoundingSphere();
      }
    }
    // The anus: where it is, and how wide whatever is passing makes it.
    const H = spec.H;
    let A = [0, H, 0];
    let open = 0.1;
    let tLeave;
    if (ex.kind === 'rope') {
      const f = Math.min(ex.rec.length - 1.0001, play.t * EXIT_FPS);
      const r0 = ex.rec[Math.floor(f)];
      const r1 = ex.rec[Math.floor(f) + 1];
      const al = f - Math.floor(f);
      A = r0.A.map((a, i) => a + (r1.A[i] - a) * al);
      const out = ex.v * play.t;
      if (out > 0 && out < ex.L) open = Math.max(0.1, ex.radiusAt(out) + 0.05);
      tLeave = ex.tEmit + 0.8;
      Object.assign(ctx.motion, { drop: r0.drop + (r1.drop - r0.drop) * al, out: Math.min(ex.L, out), L: ex.L, v: ex.v });
      while (play.seenBreaks < ex.breaks.length && ex.breaks[play.seenBreaks].t <= play.t) {
        const b = ex.breaks[play.seenBreaks++];
        w.event = `Torn off ${fmt(b.s, 1)} cm along: ${fmt(ex.Lbreak, 1)} cm hanging weighs more than its yield stress can hold.`;
        w.eventAt = w.clock;
      }
    } else {
      for (const b of ex.blobs) {
        if (play.t < b.t0 || play.t > b.t1) continue;
        const d = (play.t - b.t0) * ((2 * b.R) / (b.t1 - b.t0)) - b.R;
        open = Math.max(open, Math.sqrt(Math.max(0, b.R * b.R - d * d)) + 0.05);
      }
      tLeave = Math.max(...ex.blobs.map((b) => b.t1)) + 0.8;
      const outLen = ex.blobs.reduce((s, b) => s + Math.min(2 * b.R, Math.max(0, (play.t - b.t0) * ex.v)), 0);
      const total = ex.blobs.reduce((s, b) => s + 2 * b.R, 0);
      Object.assign(ctx.motion, { drop: 0, out: outLen, L: total, v: ex.v });
    }
    const leaving = play.t < tLeave;
    if (play.done && play.clock < tLeave) play.clock = tLeave; // skipped
    const rise = 34 * smoothstep(tLeave, tLeave + 2.6, play.clock);
    body.mesh.visible = rise < 30;
    if (body.mesh.visible) body.update(A, open, rise);
    // Anything still deeper than 1.6 cm in the canal isn't drawn.
    const e = EXIT_DIR;
    const clipW = -(e[0] * A[0] + e[1] * A[1] + e[2] * A[2]) + 1.6;
    stoolUniforms.uClip.value.set(-e[0], -e[1], -e[2], rise > 1 ? 1e6 : clipW);
    const landed = smoothstep(ex.tTouch, ex.tEnd, play.t);
    w.floor.fade(landed);

    // The director: watch it leave, then (once the body has gone) look at the result.
    if (play.director && rise >= 30 && !play.overviewed) {
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
    const tau = (rho * C_STOOL * spec.V) / (H_AIR * spec.A * 1e-4);
    const Tair = params.airTemp;
    w.tReal += dt * 60 * params.speed;
    const T = Tair + (37 - Tair) * Math.exp(-w.tReal / tau);
    const Bi = (H_AIR * (spec.V / spec.A) * 0.01) / K_STOOL;
    const rhoG = rho * G;
    Object.assign(ctx.motion, {
      V: spec.V, A: spec.A, rho, mStool, mCorn, N: BACT_PER_G * mStool, tau, tMin: w.tReal / 60, T, Tair, Bi,
      cornLeft: left.length, cornTotal: w.kernels.length, event: w.event, since: w.clock - w.eventAt,
      water: ex.water, tauY: ex.tau, Lb: (Math.sqrt(3) * ex.tau * 10) / rhoG, hmax: (2 * ex.tau * 10) / rhoG,
      H, leaving, pieces: ex.kind === 'rope' ? 1 + play.seenBreaks : ex.blobs.length,
    });

    // ---- steam: vapour supply e_s(T) − RH·e_s(T_air) (Magnus), visible when the air is colder ----
    const es = (t) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));
    const supply = Math.max(0, es(T) - 0.5 * es(Tair)) / (es(37) - 0.5 * es(20));
    const intensity = Math.min(1.4, supply * Math.min(1, Math.max(0, (T - Tair) / 10))) * landed;
    steam.mat.uniforms.uIntensity.value = intensity;
    steam.mat.uniforms.uScale.value = ctx.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const top = spec.top;
    for (let i = 0; i < STEAM_N; i++) {
      if (steam.life[i] >= 1) {
        if (Math.random() > intensity * 0.12 || !top.length) continue;
        const j = 3 * Math.floor(Math.random() * (top.length / 3));
        steam.pos.set([top[j], top[j + 1] + 0.35, top[j + 2]], 3 * i);
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

    // ---- kernels riding in the stool ----
    const m4 = new THREE.Matrix4();
    const o = new THREE.Vector3();
    for (const k of w.kernels) {
      if (k.state !== 'in') continue;
      const pc = spec.pieces[k.piece];
      const rel = k.rel;
      const F = pc.F;
      ringBasis(F, rel.ring, m4);
      const Ck = o.set(F.C[3 * rel.ring], F.C[3 * rel.ring + 1], F.C[3 * rel.ring + 2]).clone();
      const blob = pc.kind === 'blob';
      k.C.copy(Ck).add(slumpOffset(F, rel.ring, blob, rel.C.clone().applyMatrix4(m4), false));
      k.P.copy(Ck).add(slumpOffset(F, rel.ring, blob, rel.P.clone().applyMatrix4(m4), false));
      k.n.copy(rel.n).applyMatrix4(m4).normalize();
      k.mesh.position.copy(k.C);
      k.mesh.quaternion.setFromRotationMatrix(m4.multiply(rel.basis));
      k.mesh.visible = -e[0] * k.C.x - e[1] * k.C.y - e[2] * k.C.z < clipW - 0.6 || rise > 1;
    }

    // ---- kernels in flight ----
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
    if (idle && rise >= 30 && !w.fly && w.clock > w.auto.next) {
      const a = w.auto;
      const inK = w.kernels.filter((k) => k.state === 'in');
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
      const lw = 220;
      let lx = s.x + 30;
      let ly = s.y - 280;
      if (lx + lw > window.innerWidth - 12) lx = s.x - 30 - lw;
      lx = Math.max(12, lx);
      ly = Math.max(60, Math.min(window.innerHeight - 380, ly));
      loupe.style.left = `${lx}px`;
      loupe.style.top = `${ly}px`;
      if (ctx.frame % 2 === 0) drawField(state.loupeCanvas, w.loupe.field, w.clock);
    }
  },

  dispose(ctx, state) {
    const el = ctx.renderer.domElement;
    el.removeEventListener('pointerdown', state.onDown, { capture: true });
    window.removeEventListener('pointerup', state.onUp);
    el.removeEventListener('pointermove', state.onMove);
    ctx.controls?.removeEventListener('start', state.onStart);
    el.style.cursor = '';
    state.card.remove();
    state.loupe.remove();
    state.dot.remove();
    state.style.remove();
    for (const m of state.w.pieces) m.geometry.dispose();
    for (const k of state.w.kernels) k.mat.dispose();
    state.w.floor?.dispose();
    state.kernelShapes.forEach((s) => s.geo.dispose());
    state.stoolMat.dispose();
    state.steam.geo.dispose();
    state.steam.mat.dispose();
    state.strand.geometry.dispose();
    state.strand.material.dispose();
    state.body.dispose();
    state.glow.dispose();
    state.envTarget.dispose();
    state.pmrem.dispose();
    ctx.scene.environment = null;
    ctx.scene.fog = null;
  },
};
