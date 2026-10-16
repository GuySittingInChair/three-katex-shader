import { TAU } from '../lib/motion.js';
import { caption, mood, inUnits } from '../lib/bit.js';

// Kali Run: a man made of Kali Drift runs an endless hall of fractal screens,
// with something behind him and things in front of him.
//
// Everything bright here is Kali's step  p ↦ |p| / |p|^α − c:
//   • his skin is the 2D set drawn in his own body coordinates, so it moves with him;
//   • each wall is ONE picture of the set, unrolled along the hall by the
//     log-polar map  p = e^{a y} (cos(a z + s), sin(a z + s)).  It is conformal
//     (shapes are not stretched) and periodic in z, so the wall never runs out
//     and never shows a seam; the scroll s turns the picture past him and c, α
//     drift on irrational clocks, so it never shows the same picture twice;
//   • the floor and ceiling are the same unrolled set (across the width this
//     time), over the Inferno Cape field f = fbm(x + k·fbm(x + fbm(x))).
// The walls and the floor run on their own clocks, so the settings panel can
// set their speeds (3× by default), scale and style separately.
//
// The scene is ray marched. He is 13 capsules and a sphere whose joints are
// solved in JS each frame from a run cycle (phase advances with distance, so
// the feet don't skate) with punches and a kick blended on top.
//
// The chase: he only ever runs forward. The thing behind him is a little
// faster than his run, so it gains, and he sprints to get away; every fight
// slows him down. Shadows come down the hall at him and he hits them (jab,
// cross, kick). Sometimes the thing behind vanishes and is suddenly in front;
// he runs straight into it, three hits, and it bursts and re-forms behind him.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 47;

const HALF_W = 3.6; // corridor half width (walls at x = ±3.6)
const SLOT = 2.6; // one floor object slot every 2.6 m along the hall
const N_OBJ = 18; // objects sent to the shader (the ones near him)
const N_EN = 4; // shadows that come at him
const RUN = 4.4;
const SPRINT = 5.6;
const IT_SPEED = 4.8;
const N_J = 17; // joints
const WALL_STYLES = ['video wall', 'seamless', 'separate screens'];
const FLOOR_STYLES = ['kali + inferno', 'kali', 'inferno'];
const COMBO = ['jab', 'cross', 'kick'];

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

// The Kali Drift parameters on a clock t (as kaliDrift.js), with a phase so
// two copies on the same clock still differ.
function drift(t, ph = 0) {
  const s = (k, p = 0) => Math.sin(W * k * t + p + ph);
  return {
    cx: 0.8 + 0.22 * s(1) + 0.08 * s(R3, 2.1),
    cy: 0.62 + 0.15 * s(PHI, 1.3) + 0.06 * s(R2 * PHI, 0.4),
    alpha: 2.1 + 0.35 * s(R2, 0.7) + 0.1 * s(PHI * R3, 2.9),
    theta: 0.5 * s(1 / PHI, 2.6) + 0.2 * s(R3 / PHI, 1.1),
    zoom: 0.3 * s(1 / R3, 4.0) + 0.1 * s(R2 * R3, 0.9),
    hue: (((t * W * 0.6) / TAU + ph * 0.1) % 1 + 1) % 1,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export default {
  name: 'Kali Run',
  description:
    'A man made of Kali Drift runs an endless hall whose walls and floor are one moving Kali fractal, fighting ' +
    'the shadows that come at him. Something follows him, and sometimes it is in front of him instead.',
  tags: ['fractal', '3d', 'glsl', 'kaliset', 'raymarching', 'sdf', 'autopilot', 'chase', 'log-polar', 'domain warping'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    return drift(t);
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    `\\text{him: } p &\\mapsto \\frac{|p|}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\ c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\` +
    `\\text{walls: } p_0 &= e^{a y}\\big(\\cos(a z + s),\\ \\sin(a z + s)\\big),\\quad s = ${hl(m.wScroll ?? 0, 2)},\\ \\alpha_w = ${hl(m.wAlpha ?? 2, 2)} \\\\` +
    `\\text{floor: } p_0 &= e^{a x}\\big(\\cos(a z + s'),\\ \\sin(a z + s')\\big) \\;+\\; \\text{fbm}\\big(x + k\\,\\text{fbm}(x + \\text{fbm}(x))\\big) \\\\` +
    `\\text{gap} &= ${hl(m.gap ?? 0, 1)}\\,\\text{m},\\quad \\dot{\\text{gap}} = ${hl(m.dgap ?? 0, 2)}\\,\\text{m/s},\\quad \\text{hits} = ${hl(m.hits ?? 0, 0)} \\\\` +
    `\\text{run} &= ${inUnits(hl, m.run || 0, { per: 3.2, of: 'm', name: 'screens' })} \\\\` +
    `& ${caption(m.caption || '')}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    wallStyle: { value: 0, min: 0, max: WALL_STYLES.length - 1, step: 1, options: WALL_STYLES },
    wallSpeed: { value: 3, min: 0, max: 8, step: 0.1 },
    wallScale: { value: 1, min: 0.4, max: 2.5, step: 0.05 },
    floorStyle: { value: 0, min: 0, max: FLOOR_STYLES.length - 1, step: 1, options: FLOOR_STYLES },
    floorSpeed: { value: 3, min: 0, max: 8, step: 0.1 },
    floorScale: { value: 1, min: 0.4, max: 2.5, step: 0.05 },
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
    uniform vec2 uWC;            // walls: their own drifting Kali
    uniform float uWAlpha;
    uniform float uWHue;
    uniform float uWTheta;
    uniform float uWScroll;
    uniform float uWZoom;
    uniform float uWScale;
    uniform float uWStyle;
    uniform vec2 uFC;            // floor and ceiling
    uniform float uFAlpha;
    uniform float uFHue;
    uniform float uFTheta;
    uniform float uFScroll;
    uniform float uFZoom;
    uniform float uFScale;
    uniform float uFStyle;
    uniform float uFT;           // floor clock (Inferno flow)
    uniform vec3 uCamPos;
    uniform vec3 uCamTarget;
    uniform vec3 uJ[${N_J}];
    uniform vec3 uGuy;
    uniform float uGuyYaw;
    uniform vec3 uChaser;
    uniform float uChaserYaw;
    uniform float uChaserFade;
    uniform float uChaserHit;
    uniform vec4 uEn[${N_EN}];         // shadows: xyz, w = size (0 = none)
    uniform float uEnHit[${N_EN}];     // how far each has burst
    uniform vec4 uSpark;               // the last hit: xyz, w = brightness
    uniform vec4 uObj[${N_OBJ}];        // xyz position, w = scale (0 = none)
    uniform float uObjType[${N_OBJ}];
    uniform float uDetail;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    const float FAR = 60.0;
    const float HALF_W = ${HALF_W.toFixed(2)};
    const float CEIL = 10.0;
    const float PI = 3.14159265;

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
    vec3 kali2(vec2 p, vec2 c, float alpha, float iters, float hue) {
      float best = 1e9, bestI = 0.0;
      for (int i = 0; i < 14; i++) {
        if (float(i) >= iters) break;
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * alpha) - c;
        float d = min(min(abs(p.x), abs(p.y)), abs(length(p) - 1.0)) * (1.0 + 0.8 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.035 / (best + 0.035);
      return rainbow(hue + 0.14 * bestI) * g * g * 1.6 + rainbow(hue + 0.5) * 0.08;
    }

    // The log-polar unrolling: a strip (u along the hall, v across) onto the plane.
    // Conformal, and periodic in u with period 2π, so an endless strip shows one
    // picture with no seam.
    vec2 unroll(float u, float v) { return exp(v) * vec2(cos(u), sin(u)); }

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
      vec2 fl = vec2(0.0, uFT * flow);
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
      col = mix(col, rainbow(uFHue + 0.8 * f + 0.3 * r.x) * 1.3, crack * 0.6);
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
      if (length(p - uGuy - vec3(0.0, 0.95, 0.0)) > 1.6) return length(p - uGuy - vec3(0.0, 0.95, 0.0)) - 1.4;
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
      d = smin(d, length(p - uJ[11]) - 0.065, 0.03);                // fists
      d = smin(d, length(p - uJ[14]) - 0.065, 0.03);
      return d;
    }

    // ---- Shadows (it, and the small ones): a spiky blob with two eyes, size s.
    float shadowBody(vec3 q, float yaw, float s) {
      q.xz = rot(-yaw) * q.xz;
      q /= s;
      float spikes = sin(5.0 * q.x + uTime * 2.1) * sin(5.0 * q.y - uTime * 1.7) * sin(5.0 * q.z + uTime * 1.3);
      return (length(q * vec3(1.0, 0.8, 1.0)) - 1.15 - 0.28 * spikes) * 0.5 * s;
    }
    float shadowEyes(vec3 q, float yaw, float s) {
      q.xz = rot(-yaw) * q.xz;
      q.x = abs(q.x);
      return length(q - vec3(0.28, 0.3, 0.9) * s) - 0.09 * s;
    }

    // Scene: (distance, material). 0 floor, 1 ceiling, 2 walls, 3 him, 4 shadow, 5 eyes, 10+k objects.
    float objD; float objK; float chD; float gD; float enGlow; float bodyHit;
    vec2 map(vec3 p) {
      vec2 res = vec2(p.y, 0.0);
      if (CEIL - p.y < res.x) res = vec2(CEIL - p.y, 1.0);
      float wall = HALF_W - abs(p.x);
      if (wall < res.x) res = vec2(wall, 2.0);
      float g = guy(p);
      gD = g;
      if (g < res.x) res = vec2(g, 3.0);
      chD = 1e9; enGlow = 0.0; bodyHit = 0.0;
      if (uChaserFade > 0.01) {
        vec3 q = p - uChaser;
        float s = uChaserFade;
        float b = length(q) - 1.45 * s;
        chD = b > 0.5 ? b : shadowBody(q, uChaserYaw, s);
        if (chD < res.x) { res = vec2(chD, 4.0); bodyHit = uChaserHit; }
        if (b < 0.5) {
          float e = shadowEyes(q, uChaserYaw, s);
          if (e < res.x) res = vec2(e, 5.0);
        }
        enGlow += exp(-max(chD, 0.0) * 3.0) * uChaserHit;
      }
      for (int k = 0; k < ${N_EN}; k++) {
        vec4 en = uEn[k];
        if (en.w < 0.01) continue;
        vec3 q = p - en.xyz;
        float b = length(q) - 1.45 * en.w;
        float d = b > 0.4 ? b : shadowBody(q, PI, en.w);
        if (d < res.x) { res = vec2(d, 4.0); bodyHit = uEnHit[k]; }
        if (b < 0.4) {
          float e = shadowEyes(q, PI, en.w);
          if (e < res.x) res = vec2(e, 5.0);
        }
        chD = min(chD, d);
        enGlow += exp(-max(d, 0.0) * 3.0) * uEnHit[k];
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

    // ---- The walls: one unrolled Kali picture per wall, scrolling past.
    vec3 wallColour(vec3 pos, float t) {
      float side = sign(pos.x);
      if (pos.y < 0.35) return vec3(0.02, 0.018, 0.025);   // skirting
      if (uWStyle > 1.5) {                                 // separate screens, each its own Kali
        vec2 f = vec2(pos.z / 3.2, (pos.y - 0.35) / 2.4);
        vec2 id = floor(f) + vec2(side * 101.0, 0.0);
        vec2 uv = fract(f) - 0.5;
        float h1 = hash(id), h2 = hash(id + 7.3), h3 = hash(id + 3.1);
        vec2 e = abs(uv) - vec2(0.46, 0.44);
        float bezel = smoothstep(-0.005, 0.005, max(e.x, e.y));
        if (bezel > 0.99) return vec3(0.02, 0.018, 0.025);
        vec2 z = uv * vec2(3.2 / 2.4, 1.0) * (1.6 + 1.8 * h3) / uWScale;
        z = rot(h1 * 6.28 + uWTheta) * z;
        vec3 col = kali2(z, uWC + 0.18 * (vec2(h1, h2) - 0.5), uWAlpha + 0.5 * (h2 - 0.5), iterAt(t), uWHue + h1 * 0.7);
        return col * (1.0 - bezel) * 0.95;
      }
      float a = 6.2831853 / 32.0 / uWScale;                 // one full turn of the picture per 32 m of wall
      vec2 p = unroll(pos.z * a + uWScroll + side * 1.3, (pos.y - 5.0) * a + uWZoom);
      p = rot(uWTheta) * p - side * vec2(0.21, 0.13);       // off-centre, so the picture isn't mirror-symmetric
      vec3 col = kali2(p, uWC, uWAlpha, iterAt(t), uWHue + 0.17 * side) * 0.95;
      if (uWStyle < 0.5) {                                 // video wall: thin bezels over the one picture
        vec2 f = abs(fract(vec2(pos.z / 3.2, (pos.y - 0.35) / 2.4)) - 0.5);
        float d = min((0.5 - f.x) * 3.2, (0.5 - f.y) * 2.4);   // metres to the nearest bezel
        float w = 0.035 + 0.0015 * t;
        col *= mix(0.06, 1.0, smoothstep(w * 0.6, w, d));
      }
      return col;
    }

    // ---- Floor and ceiling: the same unrolling across the width, over Inferno Cape.
    vec3 floorColour(vec3 pos, bool fl, float t) {
      vec3 inf = vec3(0.0), kal = vec3(0.0);
      if (uFStyle < 0.5 || uFStyle > 1.5)
        inf = inferno(pos.xz * 0.35 * uFScale + (fl ? vec2(0.0) : vec2(13.0, 7.0)), fl ? -0.12 : 0.09, t);
      if (uFStyle < 1.5) {
        float a = 6.2831853 / 24.0 / uFScale;
        vec2 p = unroll(pos.z * a + (fl ? uFScroll : 1.0 - uFScroll), pos.x * a + uFZoom);
        p = rot(uFTheta + (fl ? 0.0 : 1.1)) * p - vec2(0.17, 0.23);
        kal = kali2(p, uFC, uFAlpha, iterAt(t) - 1.0, uFHue + (fl ? 0.0 : 0.4));
      }
      vec3 col = uFStyle < 0.5 ? inf * 0.4 + kal * 0.7 : uFStyle < 1.5 ? kal * 0.75 : inf * 0.5;
      return col * (fl ? 1.0 : 0.8);
    }

    vec3 surface(vec3 pos, vec3 n, float mat, vec3 rd, float t, float hit) {
      if (mat < 1.5) {
        bool floor_ = mat < 0.5;
        vec3 col = floorColour(pos, floor_, t);
        if (floor_) {
          vec2 dg = pos.xz - uGuy.xz;                    // his shadow
          col *= 1.0 - 0.75 * exp(-dot(dg, dg) / 0.3);
          vec2 dc = pos.xz - uChaser.xz;                 // its red light
          col += vec3(1.0, 0.08, 0.05) * 0.7 * uChaserFade * exp(-dot(dc, dc) / 5.0);
          vec2 ds = pos.xz - uSpark.xz;                  // the flash of a hit
          col += vec3(1.0, 0.9, 0.7) * uSpark.w * 0.6 * exp(-dot(ds, ds) / 3.0);
        }
        return col;
      }
      if (mat < 2.5) return wallColour(pos, t);
      if (mat < 3.5) {                                   // him: Kali Drift skin in his own coordinates
        vec3 l = pos - uGuy;
        l.xz = rot(-uGuyYaw) * l.xz;
        vec2 z = vec2(l.x * 1.7 + l.z * 1.1, l.y * 1.7 - 1.6);
        vec3 col = kali2(z, uC, uAlpha, max(4.0, uDetail - 2.0), uHue) * 1.6;
        float rim = pow(1.0 - abs(dot(n, -rd)), 3.0);
        col += vec3(1.0, 0.45, 0.15) * 0.35 * clamp(-n.y, 0.0, 1.0);   // lit from the burning floor
        return col + rainbow(uHue + 0.5) * rim * 0.6;
      }
      if (mat < 4.5) {                                   // a shadow: black with an ember rim; a hit one shatters into colour
        float rim = pow(1.0 - abs(dot(n, -rd)), 2.5);
        vec3 col = vec3(0.005) + vec3(1.0, 0.2, 0.05) * rim * 0.9;
        vec3 l = pos * 2.5;
        vec3 burst = kali2(vec2(l.x + l.z, l.y), uC, uAlpha, 7.0, uHue + 0.3) * 3.0;
        return mix(col, burst, clamp(hit * 1.5, 0.0, 1.0));
      }
      if (mat < 5.5) return vec3(3.0, 0.25, 0.1);        // eyes
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

      float t = 0.02, mat = -1.0, hit = 0.0;
      float glowO = 0.0, glowC = 0.0, glowG = 0.0, glowE = 0.0, glowS = 0.0, bestO = 1e9, glowK = -1.0;
      for (int i = 0; i < 120; i++) {
        vec3 p = uCamPos + rd * t;
        vec2 h = map(p);
        glowO += exp(-objD * 2.5) * 0.016;
        if (objD < bestO) { bestO = objD; glowK = objK; }
        glowC += exp(-chD * 1.5) * 0.03;
        glowG += exp(-gD * 5.0) * 0.02;
        glowE += enGlow * 0.03;
        glowS += exp(-length(p - uSpark.xyz) * 5.0) * uSpark.w * 0.06;
        if (h.x < 0.0015 * t) { mat = h.y; hit = bodyHit; break; }
        t += h.x * 0.85;
        if (t > FAR) break;
      }
      vec3 col = vec3(0.0);
      if (mat >= 0.0) {
        vec3 pos = uCamPos + rd * t;
        col = surface(pos, normalAt(pos, t), mat, rd, t, hit);
      }
      col = mix(col, vec3(0.03, 0.01, 0.015), 1.0 - exp(-t * 0.035));
      if (glowK >= 0.0) col += objColour(glowK) * glowO * uGlow;
      col += vec3(1.0, 0.1, 0.04) * glowC * uGlow;
      col += rainbow(uHue + 0.15) * glowG * uGlow;      // his halo, so he reads against the walls
      col += rainbow(uHue + 0.6) * glowE * uGlow;       // shadows bursting
      col += vec3(1.0, 0.92, 0.75) * glowS * uGlow;     // the hit itself

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
      uWC: { value: [0.8, 0.62] },
      uWAlpha: { value: 2.1 },
      uWHue: { value: 0 },
      uWTheta: { value: 0 },
      uWScroll: { value: 0 },
      uWZoom: { value: 0 },
      uWScale: { value: 1 },
      uWStyle: { value: 0 },
      uFC: { value: [0.8, 0.62] },
      uFAlpha: { value: 2.1 },
      uFHue: { value: 0 },
      uFTheta: { value: 0 },
      uFScroll: { value: 0 },
      uFZoom: { value: 0 },
      uFScale: { value: 1 },
      uFStyle: { value: 0 },
      uFT: { value: 0 },
      uCamPos: { value: [0, 2.4, -4.6] },
      uCamTarget: { value: [0, 1.2, 2] },
      uJ: { value: new Float32Array(3 * N_J) },
      uGuy: { value: [0, 0, 0] },
      uGuyYaw: { value: 0 },
      uChaser: { value: [0, 1.6, -14] },
      uChaserYaw: { value: 0 },
      uChaserFade: { value: 1 },
      uChaserHit: { value: 0 },
      uEn: { value: new Float32Array(4 * N_EN) },
      uEnHit: { value: new Float32Array(N_EN) },
      uSpark: { value: [0, -10, 0, 0] },
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
        guy: { x: 0, z: 0, yaw: 0, speed: RUN, phase: 0, lean: 0, sprint: false, atk: null, combo: 0 },
        it: { x: 0, z: -14, fade: 1, hit: 0, hits: 0, flash: 0 },
        en: [], // shadows coming down the hall
        spark: { x: 0, y: -10, z: 0, w: 0 },
        cam: { look: 0, x: 0, y: 2.05, z: -3.5 },
        mode: 'chase', // chase | vanish | front | burst | reform (what the thing behind him is doing)
        timer: 0,
        nextAmbush: 24,
        nextSpawn: 2,
        nextLook: 9,
        lookTimer: 0,
        seed: 1,
        wt: 0, // wall clock
        ft: 0, // floor clock
        dist: 0,
        hits: 0,
        gapPrev: 14,
        dgap: 0,
        caption: 'running',
        capT: 0,
      },
    };
  },

  update(ctx, state) {
    const R = state.run;
    const P = ctx.params;
    const dt = Math.min(0.1, ctx.delta) * (P.speed ?? 1);
    const g = R.guy, it = R.it;
    const rnd = () => slotRand(R.seed++, 11);
    const say = (s, hold = 1.6) => {
      if (R.capT > 0.4 && hold < R.capT) return; // a short caption never cuts off a long one
      R.caption = s; R.capT = hold;
    };
    R.wt += dt * (P.wallSpeed ?? 3);
    R.ft += dt * (P.floorSpeed ?? 3);
    R.capT -= dt;

    // --- The thing behind him.
    const gap = () => g.z - it.z;
    if (R.mode === 'chase') {
      if (!g.sprint && gap() < 6) { g.sprint = true; say('sprinting'); }
      if (g.sprint && gap() > 13) g.sprint = false;
      it.z += IT_SPEED * dt;
      it.z = Math.min(it.z, g.z - 2.4); // close, never on him
      R.nextAmbush -= dt;
      if (R.nextAmbush <= 0 && gap() > 5 && !g.atk) { R.mode = 'vanish'; R.timer = 0.9; say('where did it go', 1.2); }
    } else if (R.mode === 'vanish') {
      R.timer -= dt;
      it.z += IT_SPEED * dt;
      it.fade = Math.max(0, R.timer / 0.9);
      if (R.timer <= 0) {
        it.z = g.z + 11; // back, in front of him
        it.x = g.x * 0.5;
        it.hits = 0;
        g.combo = 0; // jab, cross, kick
        R.mode = 'front';
        say('it was in front the whole time', 2.2);
      }
    } else if (R.mode === 'front') {
      it.fade = Math.min(1, it.fade + dt / 0.7);
      it.z -= 1.8 * dt; // it comes at him; he doesn't slow down
      it.z = Math.max(it.z, g.z + 1.75);
    } else if (R.mode === 'burst') {
      it.hit = Math.min(1, it.hit + dt / 0.9);
      it.fade = 1 - it.hit * it.hit;
      it.z += 6 * (1 - it.hit) * dt; // knocked on down the hall
      if (it.hit >= 1) {
        R.mode = 'reform';
        it.z = g.z - 24; it.x = g.x; it.fade = 0; it.hit = 0;
      }
    } else if (R.mode === 'reform') {
      it.z += IT_SPEED * dt;
      it.fade = Math.min(1, it.fade + dt / 1.5);
      if (it.fade >= 1) { R.mode = 'chase'; R.nextAmbush = 18 + 12 * rnd(); say("and it's behind him again", 2); }
    }
    it.flash = Math.max(0, it.flash - dt * 4);
    it.x += (g.x - it.x) * Math.min(1, dt * (R.mode === 'front' ? 1.5 : 0.8));

    // --- Shadows coming down the hall at him.
    R.nextSpawn -= dt;
    if (R.nextSpawn <= 0 && R.en.length < N_EN && R.mode === 'chase') {
      R.en.push({ x: (rnd() - 0.5) * 2 * (HALF_W - 1.2), z: g.z + 26 + 8 * rnd(), size: 0, burst: -1 });
      R.nextSpawn = 1.6 + 2.6 * rnd();
    }
    for (const e of R.en) {
      if (e.burst < 0) {
        e.size = Math.min(1, e.size + dt / 0.6);
        e.z -= 2.4 * dt;
        if (e.z - g.z < 12) e.x += (g.x - e.x) * Math.min(1, dt * 1.6); // it wants him
        e.z = Math.max(e.z, g.z + 1.3); // waits its turn
      } else {
        e.burst = Math.min(1, e.burst + dt / 0.7);
        e.z += 7 * (1 - e.burst) * dt; // knocked flying
        e.y = (e.y ?? 0) + 2.5 * (1 - e.burst) * dt;
      }
    }
    R.en = R.en.filter((e) => e.burst < 1 && e.z > g.z - 8);

    // --- Fighting: whoever is in reach gets the next move of the combo.
    const strike = (target) => {
      const kind = COMBO[g.combo++ % COMBO.length];
      g.atk = { t: 0, dur: kind === 'kick' ? 0.55 : 0.36, kind, target, hit: false };
    };
    if (!g.atk) {
      if (R.mode === 'front' && it.z - g.z < 2.0 && it.fade > 0.6) strike('it');
      else {
        const e = R.en.find((e) => e.burst < 0 && e.size > 0.6 && e.z - g.z < 1.6);
        if (e) strike(e);
      }
    }
    if (g.atk) {
      const A = g.atk;
      A.t += dt;
      if (!A.hit && A.t > A.dur * 0.45) {
        A.hit = true;
        const hy = A.kind === 'kick' ? 0.75 : 1.4;
        if (A.target === 'it') {
          it.hits += 1;
          it.z += 0.5;
          it.flash = 1;
          Object.assign(R.spark, { x: it.x, y: hy, z: it.z - 1.0, w: 1.4 });
          if (it.hits >= 3) { R.mode = 'burst'; it.hit = 0; R.hits += 1; say('straight through it', 2.2); }
          else say(A.kind, 1);
        } else {
          A.target.burst = 0;
          R.hits += 1;
          Object.assign(R.spark, { x: A.target.x, y: hy, z: A.target.z - 0.5, w: 1 });
          say(A.kind, 0.9);
        }
      }
      if (A.t >= A.dur) g.atk = null;
    }
    R.spark.w = Math.max(0, R.spark.w - dt * 3.5);

    // --- He runs forward, always; sprinting when it's close, slowed by a fight.
    let target = g.sprint ? SPRINT : RUN;
    if (g.atk && gap() > 3.5) target *= 0.65;
    g.speed += (target - g.speed) * Math.min(1, dt * 2.5);

    // Weave round the floor objects in the next few metres.
    let tx = g.x * 0.98;
    const k0 = Math.round(g.z / SLOT);
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      const o = slotObject(k);
      if (!o) continue;
      const ahead = o.z - g.z;
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
    g.z += g.speed * dt;
    R.dist += g.speed * dt;
    const want = Math.atan2(vx / Math.max(dt, 1e-4), Math.max(g.speed, 0.5)) * 0.6;
    g.yaw += wrap(want - g.yaw) * Math.min(1, dt * 6);

    const gp = gap();
    R.dgap = lerp(R.dgap, (gp - R.gapPrev) / Math.max(dt, 1e-4), Math.min(1, dt * 3));
    R.gapPrev = gp;
    if (R.capT <= 0 && R.mode === 'chase') R.caption = mood([R.dgap], { '-': "it's gaining", '+': 'pulling away', '0': 'running' }, 0.05);

    // --- His run cycle: phase advances with distance, so the feet don't skate.
    const cycle = 1.25 + 0.2 * g.speed; // metres per full stride (two steps)
    g.phase += ((g.speed * dt) / cycle) * TAU;
    const amp = Math.min(1, g.speed / RUN) * 0.75 + 0.25;
    g.lean += (Math.min(1, g.speed / RUN) * 0.35 - g.lean) * Math.min(1, dt * 4);
    const ph = g.phase;
    const bob = 0.05 * amp * Math.abs(Math.sin(ph));
    const F = [Math.sin(g.yaw), Math.cos(g.yaw)];
    const Rt = [Math.cos(g.yaw), -Math.sin(g.yaw)];
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
    let [hL, kL, aL, tL] = leg(1, ph);
    let [hR, kR, aR, tR] = leg(-1, ph + Math.PI);
    let [sL, eL, wL] = arm(1, ph);
    let [sR, eR, wR] = arm(-1, ph + Math.PI);
    const pelvis = [0, 1.0 + bob, 0];
    const chest = [0, 1.38 + bob, g.lean * 0.38];
    const head = [0, 1.66 + bob, g.lean * 0.5];

    // The strike, blended over the run: out fast, back slower.
    if (g.atk) {
      const k = Math.min(1, g.atk.t / g.atk.dur);
      const e = k < 0.45 ? Math.sin((k / 0.45) * Math.PI * 0.5) : Math.cos(((k - 0.45) / 0.55) * Math.PI * 0.5);
      if (g.atk.kind === 'kick') {
        // right leg straight out at hip height
        const y = 0.95 + bob;
        hR = [-0.11, y, 0];
        kR = lerp3(kR, [-0.1, y - 0.12, 0.43], e);
        aR = lerp3(aR, [-0.07, y - 0.24, 0.87], e);
        tR = lerp3(tR, [-0.07, y - 0.12, 0.97], e);
        chest[2] -= 0.12 * e; head[2] -= 0.16 * e; // leaning back into it
      } else {
        const side = g.atk.kind === 'jab' ? 1 : -1;
        const sh = side > 0 ? sL : sR;
        const s2 = [sh[0] - side * 0.04 * e, sh[1], sh[2] + 0.1 * e]; // the shoulder drives forward
        const el = lerp3(side > 0 ? eL : eR, [side * 0.14, sh[1] - 0.03, s2[2] + 0.3], e);
        const fist = lerp3(side > 0 ? wL : wR, [side * 0.05, sh[1] - 0.02, s2[2] + 0.6], e);
        if (side > 0) [sL, eL, wL] = [s2, el, fist];
        else [sR, eR, wR] = [s2, el, fist];
        chest[2] += 0.06 * e; head[2] += 0.08 * e;
      }
    }
    const J = [hL, kL, aL, hR, kR, aR, pelvis, chest, head, sL, eL, wL, sR, eR, wR, tL, tR].map((j) => W3(...j));

    // --- Camera: behind and to one side. Every so often it swings round in
    // front of him to show what's following (never while it's in front).
    R.nextLook -= dt;
    const calm = R.mode === 'chase' && !g.atk;
    if (R.nextLook <= 0 && calm && R.lookTimer <= 0) { R.lookTimer = 3.2; R.nextLook = 11 + 6 * rnd(); }
    if (R.lookTimer > 0) R.lookTimer -= dt;
    if (R.mode !== 'chase') R.lookTimer = 0;
    R.cam.look += ((R.lookTimer > 0 ? 1 : 0) - R.cam.look) * Math.min(1, dt * 2);
    const orbit = R.cam.look * (Math.PI - 0.55);
    const back = 3.5 - 0.5 * R.cam.look;
    const cx = g.x - Math.sin(orbit) * back + Math.cos(orbit) * 0.9;
    const cz = g.z - Math.cos(orbit) * back - Math.sin(orbit) * 0.9;
    R.cam.x += (Math.max(-(HALF_W - 0.4), Math.min(HALF_W - 0.4, cx)) - R.cam.x) * Math.min(1, dt * 5);
    R.cam.z += (cz - R.cam.z) * Math.min(1, dt * 5);
    R.cam.y = 2.05 + 0.15 * R.cam.look;
    const camTarget = [g.x, 1.15, g.z + 2 * (1 - R.cam.look)];

    // --- Uniforms.
    const m = ctx.motion;
    const u = state.uniforms;
    u.uC.value = [m.cx, m.cy];
    u.uAlpha.value = m.alpha;
    u.uHue.value = m.hue;
    const wd = drift(R.wt, 1.7);
    u.uWC.value = [wd.cx, wd.cy];
    u.uWAlpha.value = wd.alpha;
    u.uWHue.value = wd.hue;
    u.uWTheta.value = wd.theta;
    u.uWScroll.value = R.wt * 0.05;
    u.uWZoom.value = wd.zoom;
    u.uWScale.value = P.wallScale ?? 1;
    u.uWStyle.value = P.wallStyle ?? 0;
    const fd = drift(R.ft, 4.1);
    u.uFC.value = [fd.cx, fd.cy];
    u.uFAlpha.value = fd.alpha;
    u.uFHue.value = fd.hue;
    u.uFTheta.value = fd.theta;
    u.uFScroll.value = R.ft * 0.06;
    u.uFZoom.value = fd.zoom;
    u.uFScale.value = P.floorScale ?? 1;
    u.uFStyle.value = P.floorStyle ?? 0;
    u.uFT.value = R.ft;
    u.uCamPos.value = [R.cam.x, R.cam.y, R.cam.z];
    u.uCamTarget.value = camTarget;
    J.forEach((j, i) => u.uJ.value.set(j, 3 * i));
    u.uGuy.value = [g.x, 0, g.z];
    u.uGuyYaw.value = g.yaw;
    u.uChaser.value = [it.x, 1.6 + 0.12 * Math.sin(ctx.time * 1.7), it.z];
    u.uChaserYaw.value = Math.atan2(g.x - it.x, g.z - it.z); // it faces him
    u.uChaserFade.value = it.fade;
    u.uChaserHit.value = Math.max(it.flash * 0.7, R.mode === 'burst' ? 1 - 0.5 * it.hit : 0);
    for (let i = 0; i < N_EN; i++) {
      const e = R.en[i];
      const s = e ? 0.5 * e.size * (e.burst < 0 ? 1 : 1 - e.burst * e.burst) : 0;
      u.uEn.value.set(e ? [e.x, 0.85 + (e.y ?? 0) + 0.08 * Math.sin(ctx.time * 2.3 + i), e.z, s] : [0, 0, 0, 0], 4 * i);
      u.uEnHit.value[i] = e && e.burst >= 0 ? 1 - 0.4 * e.burst : 0;
    }
    u.uSpark.value = [R.spark.x, R.spark.y, R.spark.z, R.spark.w];
    // The N_OBJ slots nearest him, biased ahead.
    const first = Math.round(g.z / SLOT) - 5;
    for (let i = 0; i < N_OBJ; i++) {
      const o = slotObject(first + i);
      const y = o ? 0.6 * o.scale : 0;
      u.uObj.value.set(o ? [o.x, y, o.z, o.scale] : [0, 0, 0, 0], 4 * i);
      u.uObjType.value[i] = o ? o.type : 0;
    }
    u.uDetail.value = P.detail;
    u.uGlow.value = P.glow;
    u.uSat.value = P.saturation;

    Object.assign(m, { gap: gp, dgap: R.dgap, run: R.dist, hits: R.hits, caption: R.caption, wScroll: R.wt * 0.05, wAlpha: wd.alpha });
  },
};
