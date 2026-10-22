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
// vertex attributes. The clearcoat keeps the unbumped normal: a smooth
// mucus film over a rough surface.
function stoolMaterial(uniforms) {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.22, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x5a3a20) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCrack;\nattribute float aCav;\nvarying vec3 vObj;\nvarying float vCrack;\nvarying float vCav;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvCrack = aCrack;\nvCav = aCav;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uType;
        uniform float uGas;
        uniform float uSeed;
        varying vec3 vObj;
        varying float vCrack;
        varying float vCav;
        ${SNOISE}
        float bsFbm(vec3 p){ return 0.5*snoise(p)+0.25*snoise(p*2.03+7.1)+0.125*snoise(p*4.01+3.3); }`,
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
        col *= mix(0.82, 1.0, smoothstep(0.0, 0.35, vObj.y)); // where it touches the floor
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
        float dry = clamp(0.5 + 6.0 * bsH + 0.6 * vCrack - (uType - 3.0) * 0.18, 0.0, 1.0);
        roughnessFactor = mix(0.2, 0.7, dry);
        roughnessFactor = mix(roughnessFactor, 0.22, vCav);`,
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
      material.clearcoat *= clamp((uType - 0.5) / 4.0, 0.15, 1.0) * (1.0 - vCrack);`,
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
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: new THREE.Color(0xffd27a) });
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
        roughnessFactor = mix(roughnessFactor, 0.4, coat);`,
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
// out sideways (the sag that flattens a soft thing on a floor).
function sag(p, dir, w) {
  if (p.y >= w) return;
  const y = w * Math.exp((p.y - w) / w);
  const spread = (y - p.y) * 0.9;
  const hl = Math.hypot(dir.x, dir.z) || 1;
  p.x += (dir.x / hl) * spread * Math.min(1, hl * 2);
  p.z += (dir.z / hl) * spread * Math.min(1, hl * 2);
  p.y = y;
}

function crackLine(n, width) {
  return smoothstep(width, 0, Math.abs(n));
}

// One log (types 2–4). Returns positions, outward directions, crack
// strength, and which vertices may hold a kernel.
function tubePiece(rng, noise, type, L, R, x0, z0, heading) {
  const NS = Math.round(L * 26);
  const M = 104;
  const ds = L / NS;
  const k0 = (rng() - 0.5) * 0.12;
  const k1 = (0.05 + rng() * 0.11) * (rng() < 0.5 ? -1 : 1);
  const fr = 0.6 + rng() * 0.8;
  const ph = rng() * Math.PI * 2;
  const line = [];
  let x = x0;
  let z = z0;
  let ang = heading;
  for (let i = 0; i <= NS; i++) {
    line.push([x, z, ang]);
    const s = i * ds;
    ang += (k0 + k1 * Math.sin((2 * Math.PI * fr * s) / L + ph)) * ds;
    x += Math.cos(ang) * ds;
    z += Math.sin(ang) * ds;
  }
  const cap = R * 0.95;
  const tail = 2.2 + rng() * 1.6;
  const lumpLen = 1.8 + rng() * 0.6;
  const off = rng() * 100;
  const lumpAmp = type === 2 ? 0.17 : type === 3 ? 0.05 : 0.025;
  const radius = (s) => {
    let r = R * (1 + 0.06 * noise(s * 0.35, off, 1.7));
    const ph2 = s / lumpLen + 0.35 * noise(s * 0.2, off, 4.4);
    r *= 1 + lumpAmp * (Math.pow(Math.abs(Math.sin(Math.PI * ph2)), 0.5) - 0.62);
    if (s < cap) r *= Math.sqrt(Math.max(0, 1 - (1 - s / cap) ** 2));
    const u = (L - s) / tail;
    if (u < 1) r *= 1 - Math.pow(1 - Math.max(u, 0), 2.2);
    return r;
  };
  const crackDepth = type === 3 ? 0.17 : type === 2 ? 0.12 : 0.025;
  const w = 0.22 * R;
  const positions = [];
  const dirs = [];
  const crack = [];
  const eligible = [];
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const push = (s, cosT, sinT, ring, pole) => {
    const [cx, cz, a] = line[ring];
    const r = pole ? 0 : radius(s);
    const T = [Math.cos(a), 0, Math.sin(a)];
    const B = [-Math.sin(a), 0, Math.cos(a)];
    if (pole === 1) dir.set(-T[0], 0, -T[2]);
    else if (pole === 2) dir.set(T[0], 0, T[2]);
    else dir.set(B[0] * cosT, sinT * 0.92, B[2] * cosT).normalize();
    const u = (L - s) / tail;
    const yc = 0.82 * R * (u < 1 ? 0.35 + 0.65 * (1 - Math.pow(1 - Math.max(u, 0), 2.2)) : 1);
    p.set(cx + B[0] * cosT * r, yc + sinT * r * 0.92, cz + B[2] * cosT * r);
    // Surface relief along the outward direction.
    const arc = Math.atan2(sinT, cosT) * R;
    let d = 0.05 * R * noise(p.x * 0.5, p.y * 0.5, p.z * 0.5 + off) + 0.025 * noise(p.x * 2.2, p.y * 2.2, p.z * 2.2);
    const n1 = noise(s * 0.75 + 0.3 * noise(s * 0.3, arc * 0.3, off + 5), arc * 0.16, off + 17);
    const n2 = noise(s * 1.7, arc * 0.8, off + 29);
    let c = crackLine(n1, 0.05) + 0.6 * crackLine(n2, 0.035) * smoothstep(-0.2, 0.4, noise(s * 0.4, arc * 0.4, off + 41));
    c = Math.min(1, c) * smoothstep(-0.45, 0.25, dir.y) * smoothstep(0.3, 1.2, s) * smoothstep(0.2, 1.5, L - s);
    d -= crackDepth * c;
    p.addScaledVector(dir, d);
    sag(p, dir, w);
    positions.push(p.x, p.y, p.z);
    dirs.push(dir.x, dir.y, dir.z);
    crack.push(c * (crackDepth > 0.05 ? 1 : 0.4));
    eligible.push(!pole && dir.y > 0.05 && s > 1.4 && L - s > tail + 0.6 ? 1 : 0);
  };
  push(0, 0, 0, 0, 1);
  for (let i = 1; i < NS; i++) {
    for (let j = 0; j < M; j++) {
      const th = (2 * Math.PI * j) / M;
      push(i * ds, Math.cos(th), Math.sin(th), i, 0);
    }
  }
  push(L, 0, 0, NS, 2);
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
  return { positions, dirs, crack, eligible, index };
}

// One lump or blob (types 1 and 5).
function blobPiece(rng, noise, type, cx, cy, cz, R, squash) {
  let g = new THREE.IcosahedronGeometry(1, type === 1 ? 26 : 48);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const off = rng() * 100;
  const w = 0.22 * R * squash;
  const positions = [];
  const dirs = [];
  const crack = [];
  const eligible = [];
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    let r = R * (1 + 0.13 * noise(dir.x * 1.3 + off, dir.y * 1.3, dir.z * 1.3));
    if (type === 1) r += R * 0.09 * Math.abs(noise(dir.x * 2.6, dir.y * 2.6 + off, dir.z * 2.6));
    else r += R * 0.03 * noise(dir.x * 2.2, dir.y * 2.2 + off, dir.z * 2.2);
    p.set(cx + dir.x * r, cy + dir.y * r * squash, cz + dir.z * r);
    let c = 0;
    if (type === 1) {
      c = crackLine(noise(p.x * 1.4 + off, p.y * 1.4, p.z * 1.4), 0.04) * smoothstep(-0.3, 0.3, dir.y);
      p.addScaledVector(dir, -0.08 * c + 0.03 * noise(p.x * 3, p.y * 3, p.z * 3));
    } else {
      p.addScaledVector(dir, 0.02 * noise(p.x * 2, p.y * 2, p.z * 2));
    }
    if (cy - R * squash < w * 2) sag(p, dir, w);
    positions.push(p.x, p.y, p.z);
    dirs.push(dir.x, dir.y, dir.z);
    crack.push(c);
    eligible.push(dir.y > 0.1 ? 1 : 0);
  }
  const index = Array.from(g.index.array);
  g.dispose();
  return { positions, dirs, crack, eligible, index };
}

// The pieces for a Bristol type, laid out around the origin.
function layout(type, rng, noise) {
  const out = [];
  if (type >= 2 && type <= 4) {
    const L = (type === 2 ? 12 : 14) + rng() * 4;
    const R = type === 2 ? 1.5 : 1.3 + rng() * 0.15;
    const heading = rng() * Math.PI * 2;
    out.push(tubePiece(rng, noise, type, L, R, -Math.cos(heading) * L * 0.45, -Math.sin(heading) * L * 0.45, heading));
    // Sometimes a short second piece, broken off.
    if (rng() < 0.45) {
      const h2 = heading + (rng() - 0.5) * 2.4;
      const L2 = 4 + rng() * 3;
      const sx = Math.cos(heading + Math.PI / 2) * (R * 2.6 + 0.8);
      const sz = Math.sin(heading + Math.PI / 2) * (R * 2.6 + 0.8);
      out.push(tubePiece(rng, noise, type, L2, R * 0.95, sx - Math.cos(h2) * L2 * 0.5, sz - Math.sin(h2) * L2 * 0.5, h2));
    }
  } else {
    const n = type === 1 ? 7 + Math.floor(rng() * 4) : 3 + Math.floor(rng() * 2);
    const placed = [];
    for (let k = 0; k < n; k++) {
      const R = type === 1 ? 0.85 + rng() * 0.4 : 1.6 + rng() * 0.6;
      const squash = type === 1 ? 0.85 : 0.55;
      let best = null;
      for (let tries = 0; tries < 40; tries++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * (type === 1 ? 3.2 : 4.2);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        // Rest on the floor, or on top of an earlier lump.
        let y = R * squash * 0.86;
        let clash = false;
        for (const q of placed) {
          const dh = Math.hypot(q.x - x, q.z - z);
          const touch = (q.R + R) * 0.85;
          if (dh < touch) {
            if (type === 5) clash = true;
            else y = Math.max(y, q.y + Math.sqrt(touch * touch - dh * dh) * 0.75);
          }
        }
        if (clash || y > 2.6) continue;
        best = { x, y, z, R, squash };
        break;
      }
      if (!best) continue;
      placed.push(best);
      out.push(blobPiece(rng, noise, type, best.x, best.y, best.z, best.R, best.squash));
    }
  }
  return out;
}

// ---------- the specimen ----------
function buildSpecimen(type, nCorn, seed, kernelShapes) {
  const rng = mulberry32(seed);
  const noise = makeNoise(seed);
  const pieces = layout(type, rng, noise);

  // Kernels: pick surface points that face up-ish, away from each other.
  const kernels = [];
  const cand = [];
  pieces.forEach((pc, pi) => {
    for (let i = 0; i < pc.eligible.length; i++) if (pc.eligible[i] && rng() < 0.05) cand.push([pi, i]);
  });
  const tries = cand.length;
  for (let t = 0; t < tries * 3 && kernels.length < nCorn && cand.length; t++) {
    const [pi, vi] = cand[Math.floor(rng() * cand.length)];
    const pc = pieces[pi];
    const P = new THREE.Vector3(pc.positions[3 * vi], pc.positions[3 * vi + 1], pc.positions[3 * vi + 2]);
    if (kernels.some((k) => k.P.distanceTo(P) < 1.5)) continue;
    const n = new THREE.Vector3(pc.dirs[3 * vi], pc.dirs[3 * vi + 1], pc.dirs[3 * vi + 2]).normalize();
    const hull = rng() < 0.3;
    const shape = kernelShapes[hull ? 1 : 0];
    const scale = 0.9 + rng() * 0.22;
    // Lies mostly flat in the surface, crown tipped out by 8–35°.
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
    kernels.push({ P, n, C, basis, half, hull, scale, mass: shape.volume * scale ** 3 * RHO_CORN, piece: pi });
  }

  // Carve each socket: a vertex inside a kernel's (enlarged) ellipsoid goes
  // along −dir to where that line leaves the ellipsoid. A thin rim of pushed
  // stool rises round it.
  const inv = new THREE.Matrix4();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const geos = [];
  for (let pi = 0; pi < pieces.length; pi++) {
    const pc = pieces[pi];
    const nv = pc.positions.length / 3;
    const cav = new Float32Array(nv);
    for (const k of kernels) {
      if (k.piece !== pi) continue;
      inv.copy(k.basis).invert();
      const ax = [k.half.x * 1.07, k.half.y * 1.05, k.half.z * 1.12];
      const reach = Math.max(...ax) * 1.35;
      for (let i = 0; i < nv; i++) {
        const px = pc.positions[3 * i];
        const py = pc.positions[3 * i + 1];
        const pz = pc.positions[3 * i + 2];
        if (Math.abs(px - k.C.x) > reach || Math.abs(py - k.C.y) > reach || Math.abs(pz - k.C.z) > reach) continue;
        o.set(px - k.C.x, py - k.C.y, pz - k.C.z).applyMatrix4(inv);
        d.set(-pc.dirs[3 * i], -pc.dirs[3 * i + 1], -pc.dirs[3 * i + 2]).transformDirection(inv);
        const ox = o.x / ax[0];
        const oy = o.y / ax[1];
        const oz = o.z / ax[2];
        const q = ox * ox + oy * oy + oz * oz;
        if (q < 1) {
          const dx = d.x / ax[0];
          const dy = d.y / ax[1];
          const dz = d.z / ax[2];
          const A = dx * dx + dy * dy + dz * dz;
          const B = 2 * (ox * dx + oy * dy + oz * dz);
          const t = (-B + Math.sqrt(B * B - 4 * A * (q - 1))) / (2 * A);
          pc.positions[3 * i] -= pc.dirs[3 * i] * t;
          pc.positions[3 * i + 1] -= pc.dirs[3 * i + 1] * t;
          pc.positions[3 * i + 2] -= pc.dirs[3 * i + 2] * t;
          cav[i] = 1;
          pc.crack[i] = 0;
        } else if (q < 1.45) {
          const lip = 0.035 * Math.sin(((q - 1) / 0.45) * Math.PI);
          pc.positions[3 * i] += pc.dirs[3 * i] * lip;
          pc.positions[3 * i + 1] += pc.dirs[3 * i + 1] * lip;
          pc.positions[3 * i + 2] += pc.dirs[3 * i + 2] * lip;
          cav[i] = Math.max(cav[i], 0.35 * (1 - (q - 1) / 0.45));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pc.positions, 3));
    g.setAttribute('aCrack', new THREE.Float32BufferAttribute(pc.crack, 1));
    g.setAttribute('aCav', new THREE.BufferAttribute(cav, 1));
    g.setIndex(pc.index);
    geos.push(g);
  }

  // Volume (divergence theorem) and area; flip any piece built inside out.
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
  return { geos, kernels, V, A, foot, top, box };
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
  if (kind !== 2) {
    const stain = new THREE.Mesh(
      plane,
      keep(new THREE.MeshPhysicalMaterial({ color: kind === 0 ? 0x3a2410 : 0x1a1408, roughness: 0.15, clearcoat: 1, alphaMap: keep(footprintTexture(spec.foot, S, 'stain')), transparent: true, opacity: kind === 0 ? 0.75 : 0.55, depthWrite: false })),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.008;
    stain.renderOrder = 2;
    group.add(stain);
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
  return { group, dispose: () => disposables.forEach((x) => x.dispose()) };
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
    'An anatomically honest stool on the Bristol scale, with sweet corn in it. Tap a kernel to examine it and tap again to ' +
    'pull it out (it leaves its socket behind); tap the stool for a Gram-stained look at its bacteria at ×1000; zoom right in. ' +
    'Volume by the divergence theorem, mass, bacteria count and Newton cooling, all live.',
  tags: ['biology', 'anatomy', 'corn', 'microscope', 'bacteria', 'cooling', 'interactive', 'humor', 'realistic'],
  category: 'Biology',

  mode: '3d',
  controls: 'orbit',
  wheelZoom: true,

  motion() {
    return { V: 0, A: 0, rho: RHO_STOOL, mStool: 0, mCorn: 0, N: 1, tau: 0, tMin: 0, T: 37, Tair: 21, Bi: 0, cornLeft: 0, cornTotal: 0, event: '', since: 99 };
  },

  latex: (params, hl, m) => {
    const type = Math.round(params.bristol ?? 3) + 1;
    const e = Math.floor(Math.log10(Math.max(m.N, 1)));
    const floats = m.rho < 1;
    const line =
      beat(m.since, [[0, m.event], [4, '']]) ||
      (floats ? 'Floats: the gas, not the fat (Levitt & Duane, 1972).' : '') ||
      (m.T - m.Tair > 6 ? 'Steaming: warm, wet air meeting cold air.' : '') ||
      (m.T - m.Tair < 1 ? 'Room temperature. Now it is just a sculpture.' : 'Cooling exactly as fast as Newton said it would.');
    return (
      '\\begin{aligned}' +
      `\\text{Bristol type ${type}} &: \\text{${BRISTOL[type - 1]}} \\\\` +
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
    corn: { value: 9, min: 0, max: 24, step: 1, group: 'Specimen', label: 'Corn kernels', help: 'How many kernels are in it. About 3 in 10 come out as empty hulls.' },
    gas: { value: 0.03, min: 0, max: 0.2, step: 0.005, group: 'Specimen', label: 'Gas fraction', help: 'Share of the volume that is gas bubbles. Above about 0.065 it floats.' },
    surface: { value: 0, min: 0, max: 2, step: 1, options: ['Porcelain', 'Concrete', 'Lawn'], group: 'Scene', label: 'Floor', help: 'What it landed on.' },
    airTemp: { value: 20, min: -5, max: 35, step: 1, group: 'Scene', label: 'Air temperature (°C)', help: 'Colder air: more steam, faster cooling.' },
    speed: { value: 1, min: 0, max: 5, step: 0.1, group: 'Scene', label: 'Time warp', help: '1 = one minute of cooling per second on screen.' },
  },

  actions: {
    fresh: { label: 'Fresh one', run: (ctx, st) => st.w.fresh(false) },
    pluckAll: { label: 'Remove all corn', run: (ctx, st) => st.w.pluckAll() },
    overview: { label: 'Back to overview', run: (ctx, st) => st.w.overview() },
  },

  setup(ctx) {
    const { scene, renderer, camera, controls } = ctx;
    const el = renderer.domElement;
    scene.background = new THREE.Color(0x0d0c0b);
    scene.fog = new THREE.Fog(0x0d0c0b, 70, 160);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.45;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-26, 46, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 10, far: 120 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0xc4d6ff, 0.45);
    fill.position.set(30, 18, -10);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(8, 14, -40);
    scene.add(key, fill, rim);

    const glow = createGlow(ctx, { fov: 32, strength: 0.1, threshold: 1.8, exposure: 1.0, vignette: 0.55 });

    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 90;
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
    const stoolUniforms = { uType: { value: 4 }, uGas: { value: 0.03 }, uSeed: { value: 0 } };
    const stoolMat = stoolMaterial(stoolUniforms);
    const steam = createSteam();
    scene.add(steam.points);
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.3 }));
    strand.visible = false;
    scene.add(strand);

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
      const spec = buildSpecimen(type, Math.round(params.corn), w.seed, kernelShapes);
      w.spec = spec;
      stoolUniforms.uType.value = type;
      stoolUniforms.uSeed.value = (w.seed % 997) * 0.37;
      for (const g of spec.geos) {
        const m = new THREE.Mesh(g, stoolMat);
        m.castShadow = true;
        m.receiveShadow = true;
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
      w.built = `${type}|${Math.round(params.corn)}|${w.seed}`;
      w.floorKind = -1; // the floor's stain follows the footprint
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
    const overviewPose = () => {
      const b = w.spec.box;
      const c = b.getCenter(new THREE.Vector3());
      const r = b.getSize(new THREE.Vector3()).length() / 2;
      const dist = Math.max(14, (r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05);
      const dir = new THREE.Vector3(0.6, 0.48, 0.85).normalize();
      return { target: new THREE.Vector3(c.x, 0.9, c.z), pos: new THREE.Vector3(c.x, 0.9, c.z).addScaledVector(dir, dist) };
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
      if (k.state !== 'in') return;
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
      w.tReal = 0;
      w.focus = null;
      closeLoupe();
      w.event = auto ? 'A fresh one. Not the same one reheated. We checked.' : 'A fresh one.';
      w.eventAt = w.clock;
      w.needOverview = true;
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
      const live = w.kernels.filter((k) => k.state === 'in');
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
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    controls.addEventListener('start', onStart);

    build(ctx.params);
    rebuildFloor(Math.round(ctx.params.surface));
    const o = overviewPose();
    controls.target.copy(o.target);
    camera.position.copy(o.pos);
    controls.update();

    return {
      w, glow, pmrem, envTarget, style, card, loupe, dot, loupeCanvas, kernelShapes, stoolMat, steam, strand, key,
      onDown, onUp, onMove, onStart, build, rebuildFloor, flyTo, overviewPose, focusKernel, pluck, openLoupe, closeLoupe,
    };
  },

  update(ctx, state) {
    const { w, steam, strand, card, loupe, dot } = state;
    const { params, camera, controls } = ctx;
    const dt = Math.min(ctx.delta, 1 / 20);
    w.clock += dt;

    // Rebuild when the specimen's dials change.
    const sig = `${Math.round(params.bristol) + 1}|${Math.round(params.corn)}|${w.seed}`;
    if (sig !== w.built) {
      state.build(params);
      w.born = w.clock;
    }
    if (w.floorKind !== Math.round(params.surface)) state.rebuildFloor(Math.round(params.surface));
    if (w.needOverview) {
      w.needOverview = false;
      const o = state.overviewPose();
      state.flyTo(o.target, o.pos, 1.6);
    }

    // ---- physics readout ----
    const spec = w.spec;
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
    Object.assign(ctx.motion, {
      V: spec.V, A: spec.A, rho, mStool, mCorn, N: BACT_PER_G * mStool, tau, tMin: w.tReal / 60, T, Tair, Bi,
      cornLeft: left.length, cornTotal: w.kernels.length, event: w.event, since: w.clock - w.eventAt,
    });

    // ---- steam: vapour supply e_s(T) − RH·e_s(T_air) (Magnus), visible when the air is colder ----
    const es = (t) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));
    const supply = Math.max(0, es(T) - 0.5 * es(Tair)) / (es(37) - 0.5 * es(20));
    const intensity = Math.min(1.4, supply * Math.min(1, Math.max(0, (T - Tair) / 10)));
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
          k.vel.y -= 981 * h;
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
    if (idle && !w.fly && w.clock > w.auto.next) {
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
    state.glow.dispose();
    state.envTarget.dispose();
    state.pmrem.dispose();
    ctx.scene.environment = null;
    ctx.scene.fog = null;
  },
};
