import { TAU } from '../lib/motion.js';
import { caption, mood, inUnits } from '../lib/bit.js';

// Kali Run: a man made of Kali Drift, walking an endless hall of fractal screens,
// with something behind him.
//
// Everything bright here is Kali's step  p ↦ |p| / |p|^α − c:
//   • his skin is the 2D set drawn in his own body coordinates, so it moves with him;
//   • every wall screen runs its own copy, c and α nudged by a hash of the screen;
//   • floor and ceiling are the Inferno Cape field f = fbm(x + k·fbm(x + fbm(x)))
//     (domain-warped noise, molten cracks where sin(f) crosses zero), with the
//     cracks coloured from the same drifting palette.
// c, α and the palette drift on irrational clocks (as in Kali Drift), so the
// hall never shows the same picture twice.
//
// The scene is ray marched. He is 13 capsules and a sphere whose joints are
// solved in JS each frame from a walk cycle (phase advances with distance
// walked, so the feet don't skate); the floor objects are the maths shapes
// from Kali Mart, placed by a hash of their slot along the hall.
//
// The chase: the thing behind him closes in while he walks; when the gap is
// under 6 m he runs, and pulls away, so the gap breathes. Every so often it
// vanishes, and comes back *in front* of him. He stops, turns round and runs
// the other way, and it is behind him again.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 47;

const HALF_W = 3.6; // corridor half width (walls at x = ±3.6)
const SLOT = 2.6; // one floor object slot every 2.6 m along the hall
const N_OBJ = 18; // objects sent to the shader (the ones near him)
const WALK = 1.9;
const RUN = 4.4;
const N_J = 17; // joints

// Deterministic per-slot random numbers (same slot, same object, forever).
function slotRand(k, j) {
  let t = (Math.imul(k | 0, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d);
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}
function slotObject(k) {
  if (slotRand(k, 0) > 0.72) return null; // some slots are empty
  const scale = 0.75 + 0.55 * slotRand(k, 3);
  return {
    x: (slotRand(k, 1) - 0.5) * 2 * (HALF_W - 0.9),
    z: k * SLOT + (slotRand(k, 4) - 0.5) * 1.2,
    type: Math.floor(slotRand(k, 2) * 5),
    scale,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export default {
  name: 'Kali Run',
  description:
    'A man made of Kali Drift walks an endless hall of fractal screens over an Inferno Cape floor, weaving ' +
    'round maths shapes. Something follows him. Sometimes it is in front of him instead, and he turns and runs.',
  tags: ['fractal', '3d', 'glsl', 'kaliset', 'raymarching', 'sdf', 'autopilot', 'chase', 'domain warping'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.8 + 0.22 * s(1) + 0.08 * s(R3, 2.1),
      cy: 0.62 + 0.15 * s(PHI, 1.3) + 0.06 * s(R2 * PHI, 0.4),
      alpha: 2.1 + 0.35 * s(R2, 0.7) + 0.1 * s(PHI * R3, 2.9),
      hue: ((t * W * 0.6) / TAU) % 1,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `\\text{him, screens: } p &\\mapsto \\frac{|p|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\ c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `\\text{floor: } f &= \\text{fbm}\\big(x + k\\,\\text{fbm}(x + \\text{fbm}(x))\\big) \\\\` +
    `\\text{gap} &= ${hl(m.gap ?? 0, 1)}\\,\\text{m},\\quad \\dot{\\text{gap}} = ${hl(m.dgap ?? 0, 2)}\\,\\text{m/s} \\\\` +
    `\\text{run} &= ${inUnits(hl, m.run || 0, { per: 3.2, of: 'm', name: 'screens' })} \\\\` +
    `& ${caption(m.caption || '')}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    detail: { value: 9, min: 4, max: 14, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uC;
    uniform float uAlpha;
    uniform float uHue;
    uniform vec3 uCamPos;
    uniform vec3 uCamTarget;
    uniform vec3 uJ[${N_J}];
    uniform vec3 uGuy;
    uniform float uGuyYaw;
    uniform vec3 uChaser;
    uniform float uChaserYaw;
    uniform float uChaserFade;
    uniform vec4 uObj[${N_OBJ}];        // xyz position, w = scale (0 = none)
    uniform float uObjType[${N_OBJ}];
    uniform float uDetail;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    const float FAR = 60.0;
    const float HALF_W = ${HALF_W.toFixed(2)};
    const float CEIL = 10.0;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
    float sdCap(vec3 p, vec3 a, vec3 b, float r) {
      vec3 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
    }
    float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
    vec3 trefoil(float t) { return 0.15 * vec3(sin(t) + 2.0 * sin(2.0 * t), cos(t) - 2.0 * cos(2.0 * t), -sin(3.0 * t)); }

    // ---- Kali's step, 2D, coloured by the step of the closest pass (Kali Drift).
    vec3 kali2(vec2 p, vec2 c, float alpha, float iters, float hueOff) {
      float best = 1e9, bestI = 0.0;
      for (int i = 0; i < 14; i++) {
        if (float(i) >= iters) break;
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * alpha) - c;
        float d = min(min(abs(p.x), abs(p.y)), abs(length(p) - 1.0)) * (1.0 + 0.8 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.035 / (best + 0.035);
      return rainbow(uHue + hueOff + 0.14 * bestI) * g * g * 1.6 + rainbow(uHue + 0.5 + hueOff) * 0.08;
    }

    // ---- Inferno Cape field: warped fbm with molten cracks.
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p, int oct) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        if (i >= oct) break;
        v += a * noise(p); p *= 2.02; a *= 0.5;
      }
      return v;
    }
    vec3 inferno(vec2 p, float flow, float t) {
      int oct = t < 18.0 ? 5 : 3;                       // far floor: fewer octaves
      vec2 fl = vec2(0.0, uTime * flow);
      p += fl;
      vec2 q = vec2(fbm(p, oct), fbm(p + vec2(5.2, 1.3), oct));
      vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) - fl * 0.6, oct),
                    fbm(p + 4.0 * q + vec2(8.3, 2.8) - fl * 0.6, oct));
      float f = fbm(p + 4.0 * r, oct);
      float crack = pow(1.0 - abs(sin((f + r.x * 0.5) * 14.0)), 4.0);
      float heat = clamp(f * 0.7 + crack * 0.9, 0.0, 1.4);
      vec3 col = vec3(0.03, 0.02, 0.025);
      col = mix(col, vec3(0.55, 0.08, 0.02), smoothstep(0.15, 0.45, heat));
      col = mix(col, vec3(1.0, 0.35, 0.03), smoothstep(0.45, 0.85, heat));
      col = mix(col, vec3(1.0, 0.85, 0.4), smoothstep(0.85, 1.3, heat));
      // the cracks run in Kali colours
      col = mix(col, rainbow(uHue + 0.8 * f + 0.3 * r.x) * 1.3, crack * 0.6);
      return col;
    }

    // ---- The floor objects (the five shapes from Kali Mart, ~0.5 m across).
    float shape(float type, vec3 p) {
      if (type < 0.5) return min(sdTorus(p - vec3(-0.2, 0.0, 0.0), 0.36, 0.065), sdTorus((p - vec3(0.2, 0.0, 0.0)).xzy, 0.36, 0.065));
      if (type < 1.5) {
        float d = 1e9; vec3 a = trefoil(0.0);
        for (int i = 1; i <= 30; i++) { vec3 b = trefoil(6.2831853 * float(i) / 30.0); d = min(d, sdCap(p, a, b, 0.0)); a = b; }
        return d - 0.07;
      }
      if (type < 2.5) {
        vec3 q = p / 0.36; float d = sdBox(q, vec3(1.0)); float s = 1.0;
        for (int m = 0; m < 3; m++) {
          vec3 a = mod(q * s, 2.0) - 1.0; s *= 3.0; vec3 r = abs(1.0 - 3.0 * abs(a));
          d = max(d, (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s);
        }
        return d * 0.36;
      }
      if (type < 3.5) return max(length(p) - 0.42, (abs(dot(sin(p * 13.0), cos(p.yzx * 13.0))) / 13.0 - 0.025) * 0.6);
      float a = atan(p.z, p.x);
      vec2 q = rot(0.5 * a) * vec2(length(p.xz) - 0.32, p.y);
      vec2 e = abs(q) - vec2(0.13, 0.012);
      return (length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)) * 0.8 - 0.008;
    }

    // ---- Him: capsules between the joints solved in JS.
    float guy(vec3 p) {
      if (length(p - uGuy - vec3(0.0, 0.95, 0.0)) > 1.4) return length(p - uGuy - vec3(0.0, 0.95, 0.0)) - 1.2;
      float d = sdCap(p, uJ[6], uJ[7], 0.15);                       // torso
      d = smin(d, sdCap(p, uJ[0], uJ[3], 0.1), 0.06);              // hips
      d = smin(d, sdCap(p, uJ[9], uJ[12], 0.075), 0.06);           // shoulders
      d = smin(d, sdCap(p, uJ[7], uJ[8], 0.05), 0.05);             // neck
      d = smin(d, length(p - uJ[8]) - 0.12, 0.04);                  // head
      d = smin(d, sdCap(p, uJ[0], uJ[1], 0.08), 0.04);             // legs
      d = smin(d, sdCap(p, uJ[1], uJ[2], 0.062), 0.03);
      d = smin(d, sdCap(p, uJ[3], uJ[4], 0.08), 0.04);
      d = smin(d, sdCap(p, uJ[4], uJ[5], 0.062), 0.03);
      d = smin(d, sdCap(p, uJ[2], uJ[15], 0.045), 0.03);           // feet
      d = smin(d, sdCap(p, uJ[5], uJ[16], 0.045), 0.03);
      d = smin(d, sdCap(p, uJ[9], uJ[10], 0.055), 0.04);           // arms
      d = smin(d, sdCap(p, uJ[10], uJ[11], 0.045), 0.03);
      d = smin(d, sdCap(p, uJ[12], uJ[13], 0.055), 0.04);
      d = smin(d, sdCap(p, uJ[13], uJ[14], 0.045), 0.03);
      return d;
    }

    // ---- It: a spiky shadow with two eyes, shrinking away when it fades.
    float chaserBody(vec3 p) {
      vec3 q = p - uChaser;
      float r = 1.15 * uChaserFade;
      if (length(q) > r + 0.7) return length(q) - r - 0.5;
      q.xz = rot(-uChaserYaw) * q.xz;
      float spikes = sin(5.0 * q.x + uTime * 2.1) * sin(5.0 * q.y - uTime * 1.7) * sin(5.0 * q.z + uTime * 1.3);
      return (length(q * vec3(1.0, 0.8, 1.0)) - r - 0.28 * spikes * uChaserFade) * 0.5;
    }
    float chaserEyes(vec3 p) {
      vec3 q = p - uChaser;
      q.xz = rot(-uChaserYaw) * q.xz;
      q.x = abs(q.x);
      return length(q - vec3(0.28, 0.3, 0.9) * uChaserFade) - 0.09 * uChaserFade;
    }

    // Scene: (distance, material). 0 floor, 1 ceiling, 2 walls, 3 him, 4 it, 5 its eyes, 10+k objects.
    float objD; float objK; float chD; float gD;
    vec2 map(vec3 p) {
      vec2 res = vec2(p.y, 0.0);
      if (CEIL - p.y < res.x) res = vec2(CEIL - p.y, 1.0);
      float wall = HALF_W - abs(p.x);
      if (wall < res.x) res = vec2(wall, 2.0);
      float g = guy(p);
      gD = g;
      if (g < res.x) res = vec2(g, 3.0);
      chD = 1e9;
      if (uChaserFade > 0.01) {
        chD = chaserBody(p);
        if (chD < res.x) res = vec2(chD, 4.0);
        float e = chaserEyes(p);
        if (e < res.x) res = vec2(e, 5.0);
      }
      objD = 1e9; objK = -1.0;
      for (int k = 0; k < ${N_OBJ}; k++) {
        vec4 o = uObj[k];
        if (o.w < 0.01) continue;
        vec3 q = p - o.xyz;
        float d = length(q) - 0.6 * o.w;
        if (d < 0.25) {
          q.xz = rot(uTime * 0.6 + float(k) * 1.7) * q.xz;
          q.yz = rot(0.4) * q.yz;
          d = shape(uObjType[k], q / o.w) * o.w;
        }
        if (d < objD) { objD = d; objK = float(k); }
        if (d < res.x) res = vec2(d, 10.0 + float(k));
      }
      return res;
    }

    vec3 normalAt(vec3 p, float t) {
      vec2 e = vec2(1.0, -1.0) * 0.0015 * (1.0 + 0.1 * t);
      return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                       e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
    }

    vec3 objColour(float k) {
      float type = 0.0;
      int i = int(k);
      for (int j = 0; j < ${N_OBJ}; j++) if (j == i) type = uObjType[j];
      return 0.15 + 0.85 * rainbow(0.05 + type * 0.21);
    }

    float iterAt(float t) { return mix(uDetail, 4.0, clamp(t / 40.0, 0.0, 1.0)); }

    vec3 surface(vec3 pos, vec3 n, float mat, vec3 rd, float t) {
      if (mat < 1.5) {                                   // floor / ceiling: Inferno Cape in Kali colours
        bool floor_ = mat < 0.5;
        vec3 col = inferno(pos.xz * 0.35 + (floor_ ? vec2(0.0) : vec2(13.0, 7.0)), floor_ ? -0.12 : 0.09, t) * (floor_ ? 0.5 : 0.4);
        if (floor_) {
          vec2 dg = pos.xz - uGuy.xz;                    // his shadow
          col *= 1.0 - 0.75 * exp(-dot(dg, dg) / 0.3);
          vec2 dc = pos.xz - uChaser.xz;                 // its red light
          col += vec3(1.0, 0.08, 0.05) * 0.7 * uChaserFade * exp(-dot(dc, dc) / 5.0);
        }
        return col;
      }
      if (mat < 2.5) {                                   // walls: a grid of screens, each running Kali
        vec2 f = vec2(pos.z / 3.2, (pos.y - 0.35) / 2.4);
        vec2 id = floor(f) + vec2(sign(pos.x) * 101.0, 0.0);
        vec2 uv = fract(f) - 0.5;
        float h1 = hash(id), h2 = hash(id + 7.3), h3 = hash(id + 3.1);
        vec2 e = abs(uv) - vec2(0.46, 0.44);
        float bezel = smoothstep(-0.005, 0.005, max(e.x, e.y));
        if (pos.y < 0.35 || bezel > 0.99) return vec3(0.02, 0.018, 0.025) + vec3(0.5, 0.15, 0.05) * 0.08 * (1.0 - bezel);
        vec2 z = uv * vec2(3.2 / 2.4, 1.0) * (1.6 + 1.8 * h3);
        z = rot(h1 * 6.28) * z;
        vec3 col = kali2(z, uC + 0.18 * (vec2(h1, h2) - 0.5), uAlpha + 0.5 * (h2 - 0.5), iterAt(t), h1 * 0.7);
        return col * (1.0 - bezel) * 0.95;
      }
      if (mat < 3.5) {                                   // him: Kali Drift skin in his own coordinates
        vec3 l = pos - uGuy;
        l.xz = rot(-uGuyYaw) * l.xz;
        vec2 z = vec2(l.x * 1.7 + l.z * 1.1, l.y * 1.7 - 1.6);
        vec3 col = kali2(z, uC, uAlpha, max(4.0, uDetail - 2.0), 0.0) * 1.6;
        float rim = pow(1.0 - abs(dot(n, -rd)), 3.0);
        col += vec3(1.0, 0.45, 0.15) * 0.35 * clamp(-n.y, 0.0, 1.0);   // lit from the burning floor
        return col + rainbow(uHue + 0.5) * rim * 0.6;
      }
      if (mat < 4.5) {                                   // it: black, with an ember rim
        float rim = pow(1.0 - abs(dot(n, -rd)), 2.5);
        return vec3(0.005) + vec3(1.0, 0.2, 0.05) * rim * 0.9;
      }
      if (mat < 5.5) return vec3(3.0, 0.25, 0.1);        // its eyes
      vec3 c = objColour(mat - 10.0);
      float rim = pow(1.0 - abs(dot(n, -rd)), 2.0);
      return c * (1.2 + 0.5 * clamp(n.y, 0.0, 1.0)) + vec3(1.0) * rim * 0.5;
    }

    void main() {
      float fit = max(min(uResolution.x, uResolution.y), 0.6 * max(uResolution.x, uResolution.y));
      vec2 uv = (vUv * uResolution - 0.5 * uResolution) / (0.5 * fit);
      vec3 fw = normalize(uCamTarget - uCamPos);
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * 1.2 + uv.x * rt + uv.y * up);

      float t = 0.02, mat = -1.0;
      float glowO = 0.0, glowC = 0.0, glowG = 0.0, bestO = 1e9, glowK = -1.0;
      for (int i = 0; i < 120; i++) {
        vec3 p = uCamPos + rd * t;
        vec2 h = map(p);
        glowO += exp(-objD * 2.5) * 0.016;
        if (objD < bestO) { bestO = objD; glowK = objK; }
        glowC += exp(-chD * 1.5) * 0.03 * uChaserFade;
        glowG += exp(-gD * 5.0) * 0.02;
        if (h.x < 0.0015 * t) { mat = h.y; break; }
        t += h.x * 0.85;
        if (t > FAR) break;
      }
      vec3 col = vec3(0.0);
      if (mat >= 0.0) {
        vec3 pos = uCamPos + rd * t;
        col = surface(pos, normalAt(pos, t), mat, rd, t);
      }
      col = mix(col, vec3(0.03, 0.01, 0.015), 1.0 - exp(-t * 0.035));
      if (glowK >= 0.0) col += objColour(glowK) * glowO * uGlow;
      col += vec3(1.0, 0.1, 0.04) * glowC * uGlow;
      col += rainbow(uHue + 0.15) * glowG * uGlow;      // his halo, so he reads against the screens

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      float m = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.5 * m)) / max(m, 1e-4);
      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.5 * dot(v, v);
      gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
    }
  `,

  uniforms() {
    return {
      uC: { value: [0.8, 0.62] },
      uAlpha: { value: 2.1 },
      uHue: { value: 0 },
      uCamPos: { value: [0, 2.4, -4.6] },
      uCamTarget: { value: [0, 1.2, 2] },
      uJ: { value: new Float32Array(3 * N_J) },
      uGuy: { value: [0, 0, 0] },
      uGuyYaw: { value: 0 },
      uChaser: { value: [0, 1.6, -14] },
      uChaserYaw: { value: 0 },
      uChaserFade: { value: 1 },
      uObj: { value: new Float32Array(4 * N_OBJ) },
      uObjType: { value: new Float32Array(N_OBJ) },
      uDetail: { value: 9 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
    };
  },

  setup() {
    return {
      run: {
        guy: { x: 0, z: 0, dir: 1, yaw: 0, speed: WALK, phase: 0, lean: 0 },
        it: { x: 0, z: -16, fade: 1 },
        cam: { yaw: 0, look: 0, x: 0, y: 2.4, z: -4.6 },
        mode: 'walk', // walk | run | vanish | appear | startle | turn
        timer: 0,
        nextAmbush: 22,
        nextLook: 9,
        lookTimer: 0,
        dist: 0,
        gapPrev: 16,
        dgap: 0,
        caption: 'a walk',
      },
    };
  },

  update(ctx, state) {
    const R = state.run;
    const dt = Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1);
    const g = R.guy, it = R.it;
    const gap = () => (g.z - it.z) * g.dir; // > 0: it is behind him

    // --- The chase.
    let target = g.speed;
    if (R.mode === 'walk' || R.mode === 'run') {
      if (R.mode === 'walk' && gap() < 6) { R.mode = 'run'; R.caption = 'running'; }
      if (R.mode === 'run' && gap() > 13) { R.mode = 'walk'; }
      target = R.mode === 'run' ? RUN : WALK;
      // It walks a little faster than he does and runs a little slower.
      const itSpeed = R.mode === 'run' ? 3.9 : 2.5;
      it.z += g.dir * itSpeed * dt;
      it.fade = Math.min(1, it.fade + dt / 0.8);
      R.nextAmbush -= dt;
      if (R.nextAmbush <= 0 && gap() > 4) { R.mode = 'vanish'; R.timer = 0.9; R.caption = 'where did it go'; }
    } else if (R.mode === 'vanish') {
      R.timer -= dt;
      it.fade = Math.max(0, R.timer / 0.9);
      target = WALK;
      if (R.timer <= 0) {
        // Back, in front of him.
        it.z = g.z + g.dir * 7;
        it.x = g.x * 0.5;
        R.mode = 'appear';
        R.timer = 0.8;
        R.caption = 'it was in front the whole time';
      }
    } else if (R.mode === 'appear') {
      R.timer -= dt;
      it.fade = Math.min(1, 1 - R.timer / 0.8);
      target = 0;
      if (R.timer <= 0) { R.mode = 'startle'; R.timer = 0.6; }
    } else if (R.mode === 'startle') {
      R.timer -= dt;
      target = 0;
      it.z -= g.dir * 1.2 * dt; // it drifts towards him
      if (R.timer <= 0) { R.mode = 'turn'; R.timer = 0.9; R.yaw0 = g.yaw; R.caption = 'turning round (180°, no questions)'; }
    } else if (R.mode === 'turn') {
      R.timer -= dt;
      target = 0;
      const k = 1 - Math.max(0, R.timer) / 0.9;
      g.yaw = R.yaw0 + Math.PI * (k * k * (3 - 2 * k));
      if (R.timer <= 0) {
        g.dir = -g.dir;
        g.yaw = g.dir > 0 ? 0 : Math.PI;
        R.mode = 'run';
        R.caption = 'running the other way';
        R.nextAmbush = 18 + 12 * slotRand(Math.floor(R.dist), 9);
      }
    }
    g.speed += (target - g.speed) * Math.min(1, dt * (target === 0 ? 6 : 2));

    // --- Weave round the floor objects in the next few metres.
    let tx = g.x * 0.98;
    const k0 = Math.round(g.z / SLOT);
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      const o = slotObject(k);
      if (!o) continue;
      const ahead = (o.z - g.z) * g.dir;
      const clear = 0.55 + 0.45 * o.scale;
      if (ahead > -0.3 && ahead < 3.5 && Math.abs(o.x - g.x) < clear) {
        let side = Math.sign(g.x - o.x) || 1;
        if (Math.abs(o.x + side * clear) > HALF_W - 0.6) side = -side;
        tx = o.x + side * (clear + 0.15);
      }
    }
    tx = Math.max(-(HALF_W - 0.6), Math.min(HALF_W - 0.6, tx));
    const vx = (tx - g.x) * Math.min(1, dt * 2.5);
    g.x += vx;
    g.z += g.dir * g.speed * dt;
    R.dist += g.speed * dt;
    if (R.mode !== 'turn') {
      const base = g.dir > 0 ? 0 : Math.PI;
      const want = base + Math.atan2(vx / Math.max(dt, 1e-4), Math.max(g.speed, 0.5)) * g.dir * 0.6;
      g.yaw += wrap(want - g.yaw) * Math.min(1, dt * 6);
    }
    it.x += (g.x - it.x) * Math.min(1, dt * 0.8);

    const gp = gap();
    R.dgap = lerp(R.dgap, (gp - R.gapPrev) / Math.max(dt, 1e-4), Math.min(1, dt * 3));
    R.gapPrev = gp;
    if (R.mode === 'walk') R.caption = mood([R.dgap], { '-': "it's gaining", '+': 'losing it', '0': 'a walk' }, 0.05);

    // --- His walk cycle: phase advances with distance, so the feet don't skate.
    const cycle = 1.25 + 0.2 * g.speed; // metres per full stride (two steps)
    g.phase += (g.speed * dt / cycle) * TAU;
    const amp = Math.min(1, g.speed / RUN) * 0.75 + (g.speed > 0.2 ? 0.25 : g.speed * 1.25);
    g.lean += (Math.min(1, g.speed / RUN) * 0.35 - g.lean) * Math.min(1, dt * 4);
    const ph = g.phase;
    const bob = 0.05 * amp * Math.abs(Math.sin(ph));
    const F = [Math.sin(g.yaw), Math.cos(g.yaw)];
    const Rt = [Math.cos(g.yaw), -Math.sin(g.yaw)];
    const J = [];
    const W3 = (x, y, z) => [g.x + x * Rt[0] + z * F[0], y, g.z + x * Rt[1] + z * F[1]];
    const leg = (side, p) => {
      const a = amp * 0.62 * Math.sin(p); // thigh swing, + = forward
      const kb = amp * (0.25 + 0.9 * Math.max(0, Math.sin(p + 1.9))); // knee bends on the way through
      const hip = [side * 0.11, 0.95 + bob, 0];
      const knee = [hip[0], hip[1] - 0.45 * Math.cos(a), hip[2] + 0.45 * Math.sin(a)];
      const b = a - kb;
      const ankle = [hip[0], knee[1] - 0.45 * Math.cos(b), knee[2] + 0.45 * Math.sin(b)];
      const toe = [hip[0], ankle[1] - 0.03, ankle[2] + 0.16];
      return [hip, knee, ankle, toe];
    };
    const arm = (side, p) => {
      const a = -amp * 0.7 * Math.sin(p);
      const eb = 0.3 + amp * 0.9;
      const sh = [side * 0.23, 1.43 + bob, g.lean * 0.42];
      const el = [sh[0], sh[1] - 0.29 * Math.cos(a), sh[2] + 0.29 * Math.sin(a)];
      const c = a + eb;
      const hand = [sh[0], el[1] - 0.27 * Math.cos(c), el[2] + 0.27 * Math.sin(c)];
      return [sh, el, hand];
    };
    const [hL, kL, aL, tL] = leg(1, ph);
    const [hR, kR, aR, tR] = leg(-1, ph + Math.PI);
    const [sL, eL, wL] = arm(1, ph);
    const [sR, eR, wR] = arm(-1, ph + Math.PI);
    const pelvis = [0, 1.0 + bob, 0];
    const chest = [0, 1.38 + bob, g.lean * 0.38];
    const head = [0, 1.66 + bob, g.lean * 0.5];
    // Order matches uJ[] in the shader.
    [hL, kL, aL, hR, kR, aR, pelvis, chest, head, sL, eL, wL, sR, eR, wR, tL, tR].forEach((j) => J.push(W3(...j)));

    // --- Camera: behind and to one side, lagging his turns. Every so often it
    // swings round in front of him to show what's behind.
    R.nextLook -= dt;
    if (R.nextLook <= 0 && (R.mode === 'walk' || R.mode === 'run') && R.lookTimer <= 0) { R.lookTimer = 3.2; R.nextLook = 11 + 6 * slotRand(Math.floor(R.dist), 7); }
    if (R.lookTimer > 0) R.lookTimer -= dt;
    if (R.mode !== 'walk' && R.mode !== 'run') R.lookTimer = 0; // an ambush cancels a look back
    const lookWant = R.lookTimer > 0 ? 1 : 0;
    R.cam.look += (lookWant - R.cam.look) * Math.min(1, dt * 2);
    // While he turns round, the camera turns with him (so it never stares at a wall).
    const camYawWant = R.mode === 'turn' ? g.yaw : g.dir > 0 ? 0 : Math.PI;
    R.cam.yaw += wrap(camYawWant - R.cam.yaw) * Math.min(1, dt * (R.mode === 'turn' ? 8 : 1.6));
    const orbit = R.cam.yaw + R.cam.look * (Math.PI - 0.55);
    const back = 3.5 - 0.5 * R.cam.look;
    const cx = g.x + Math.sin(orbit) * -back + Math.cos(orbit) * 0.9;
    const cz = g.z + Math.cos(orbit) * -back - Math.sin(orbit) * 0.9;
    R.cam.x += (Math.max(-(HALF_W - 0.4), Math.min(HALF_W - 0.4, cx)) - R.cam.x) * Math.min(1, dt * 5);
    R.cam.z += (cz - R.cam.z) * Math.min(1, dt * 5);
    R.cam.y = 2.05 + 0.15 * R.cam.look;
    const fz = Math.cos(R.cam.yaw), fx = Math.sin(R.cam.yaw);
    const camTarget = [g.x + fx * 2 * (1 - R.cam.look), 1.15, g.z + fz * 2 * (1 - R.cam.look)];

    // --- Uniforms.
    const m = ctx.motion;
    const u = state.uniforms;
    u.uC.value = [m.cx, m.cy];
    u.uAlpha.value = m.alpha;
    u.uHue.value = m.hue;
    u.uCamPos.value = [R.cam.x, R.cam.y, R.cam.z];
    u.uCamTarget.value = camTarget;
    J.forEach((j, i) => u.uJ.value.set(j, 3 * i));
    u.uGuy.value = [g.x, 0, g.z];
    u.uGuyYaw.value = g.yaw;
    u.uChaser.value = [it.x, 1.6 + 0.12 * Math.sin(ctx.time * 1.7), it.z];
    u.uChaserYaw.value = Math.atan2(g.x - it.x, g.z - it.z); // it faces him
    u.uChaserFade.value = it.fade;
    // The N_OBJ slots nearest him, biased ahead of where he's going.
    const first = Math.round(g.z / SLOT) - (g.dir > 0 ? 5 : N_OBJ - 6);
    for (let i = 0; i < N_OBJ; i++) {
      const o = slotObject(first + i);
      const y = o ? 0.6 * o.scale : 0;
      u.uObj.value.set(o ? [o.x, y, o.z, o.scale] : [0, 0, 0, 0], 4 * i);
      u.uObjType.value[i] = o ? o.type : 0;
    }
    u.uDetail.value = ctx.params.detail;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;

    Object.assign(m, { gap: gp, dgap: R.dgap, run: R.dist, caption: R.caption });
  },
};
