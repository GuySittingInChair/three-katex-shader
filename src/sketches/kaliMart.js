import { TAU } from '../lib/motion.js';
import { caption, inUnits } from '../lib/bit.js';

// Kali Mart: a shop whose shelves are stocked with Kali's fractal.
//
// The shelves show the 3D Kaliset, the same step as Kali Drift one dimension up,
//
//     p ↦ |p| / |p|² − c,      p ∈ ℝ³,
//
// drawn on the shelf faces with the same closest-pass colouring, and c drifts on
// irrational clocks so the stock never looks the same twice. The scene is ray
// marched: every pixel walks its ray forward by the distance to the nearest
// surface (floor, ceiling, shelf units, shelf boards, items) until it hits one.
// The floor reflects one bounce and fog takes the far aisles, which is what
// gives the depth.
//
// A shopper on autopilot works through a list of maths shapes (Hopf link,
// trefoil knot, Menger sponge, gyroid ball, Möbius strip), each an exact or
// near-exact signed distance function. It can only fetch what it can *see*:
// an item counts as spotted when the straight line to it clears every shelf.
// Otherwise it browses from one crossing to the next, looking down the cross
// aisles. When the list is done the basket is dropped back into the shop at
// random spots and a new list starts.

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 47;

// Store layout (metres). Aisles run along z at x = 6i; shelf units sit between
// them (|x − 6i − 3| < 1); cross aisles at z = 24j (shelves stop 2 m short).
const AISLE = 6;
const BLOCK = 24;
const XS = [-3, -2, -1, 0, 1, 2, 3]; // aisle indices in use
const ZS = [-2, -1, 0, 1, 2]; // cross-aisle indices in use
const EYE = 1.6;
const WALK = 2.4; // m/s
const N_ITEMS = 8;
const SHAPES = ['Hopf link', 'trefoil knot', 'Menger sponge', 'gyroid ball', 'Möbius strip'];

// Small seeded generator, so every visit starts with the same first list.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same as the shader: shelf units fill |mod(x, 6) − 3| < 1, |mod(z, 24) − 12| < 10.
const inShelf = (x, z) => {
  const xr = (((x % AISLE) + AISLE) % AISLE) - 3;
  const zr = (((z % BLOCK) + BLOCK) % BLOCK) - 12;
  return Math.abs(xr) < 1.0 && Math.abs(zr) < 10.0;
};
// Line of sight between two floor points: no shelf in the way.
function canSee(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
  for (let i = 1; i < n; i++) if (inShelf(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
  return true;
}
const snap = (v, step) => step * Math.round(v / step);

// Route along aisles and cross aisles to a point on an aisle line (x = 6i).
function route(cam, tx, tz) {
  if (Math.abs(cam.x - tx) < 0.05) return [[tx, tz]];
  const onCross = Math.abs(cam.z - snap(cam.z, BLOCK)) < 0.05;
  let zc;
  if (onCross) zc = snap(cam.z, BLOCK);
  else {
    const lo = BLOCK * Math.floor(cam.z / BLOCK);
    const cost = (z) => Math.abs(cam.z - z) + Math.abs(tz - z);
    zc = cost(lo) <= cost(lo + BLOCK) ? lo : lo + BLOCK;
  }
  return [[cam.x, zc], [tx, zc], [tx, tz]];
}

export default {
  name: 'Kali Mart',
  description:
    "A shop stocked with Kali's fractal. The shelves show the 3D Kaliset p ↦ |p|/|p|² − c, the aisles are ray " +
    'marched with a reflecting floor, and a shopper on autopilot hunts for maths shapes (Hopf link, trefoil, Menger ' +
    'sponge, gyroid, Möbius strip) that keep being dropped back in random places.',
  tags: ['fractal', '3d', 'glsl', 'kaliset', 'raymarching', 'sdf', 'autopilot', 'quasi-periodic'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  // The fractal's drift (closed form). The shopper is a simulation, in update().
  motion(t) {
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.62 + 0.12 * s(1) + 0.05 * s(R3, 2.1),
      cy: 0.5 + 0.1 * s(PHI, 1.3),
      cz: 0.58 + 0.12 * s(R2, 0.7) + 0.04 * s(PHI * R3, 2.9),
      hue: ((t * W * 0.6) / TAU) % 1,
    };
  },

  latex: (params, hl, m) => {
    const list = (m.list || []).map((it) =>
      `& ${it.done ? '\\checkmark' : '\\square'}\\ \\text{${it.name}}` +
      (it.dist != null ? `\\ \\textcolor{#9aa3b2}{(${hl(it.dist, 1)}\\,\\text{m})}` : '') + ' \\\\');
    return (
      '\\begin{aligned}' +
      `\\text{shelves: } p &\\mapsto \\frac{|p|}{|p|^2} - c,\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)},\\ ${hl(m.cz, 2)}) \\\\` +
      `\\text{ray: } t &\\mapsto t + \\min(d_{\\text{floor}}, d_{\\text{shelf}}, d_{\\text{items}}) \\\\` +
      `\\text{walked} &= ${inUnits(hl, m.walked || 0, { per: 20, of: 'm', name: 'aisles' })} \\\\[4pt]` +
      `\\text{list:}\\quad ` + list.join('') +
      `& ${caption(m.caption || '')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    detail: { value: 9, min: 4, max: 14, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec3 uC;
    uniform float uHue;
    uniform vec3 uCam;
    uniform float uYaw;
    uniform float uPitch;
    uniform vec3 uItemPos[${N_ITEMS}];
    uniform float uItemType[${N_ITEMS}];
    uniform float uItemScale[${N_ITEMS}];
    uniform float uDetail;
    uniform float uGlow;
    uniform float uSat;
    varying vec2 vUv;

    const float FAR = 70.0;

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
    float sdSeg(vec3 p, vec3 a, vec3 b) {
      vec3 pa = p - a, ba = b - a;
      return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
    }
    vec3 trefoil(float t) { return 0.15 * vec3(sin(t) + 2.0 * sin(2.0 * t), cos(t) - 2.0 * cos(2.0 * t), -sin(3.0 * t)); }

    // The five shapes, about 0.5 m across.
    float shape(float type, vec3 p) {
      if (type < 0.5) {                               // Hopf link: two rings, each through the other
        float a = sdTorus(p - vec3(-0.2, 0.0, 0.0), 0.36, 0.065);
        float b = sdTorus((p - vec3(0.2, 0.0, 0.0)).xzy, 0.36, 0.065);
        return min(a, b);
      }
      if (type < 1.5) {                               // trefoil knot: a tube round the (2,3) torus knot
        float d = 1e9;
        vec3 a = trefoil(0.0);
        for (int i = 1; i <= 36; i++) {
          vec3 b = trefoil(6.2831853 * float(i) / 36.0);
          d = min(d, sdSeg(p, a, b));
          a = b;
        }
        return d - 0.07;
      }
      if (type < 2.5) {                               // Menger sponge, level 3
        vec3 q = p / 0.36;
        float d = sdBox(q, vec3(1.0));
        float s = 1.0;
        for (int m = 0; m < 3; m++) {
          vec3 a = mod(q * s, 2.0) - 1.0;
          s *= 3.0;
          vec3 r = abs(1.0 - 3.0 * abs(a));
          float c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s;
          d = max(d, c);
        }
        return d * 0.36;
      }
      if (type < 3.5) {                               // gyroid ball
        float g = abs(dot(sin(p * 13.0), cos(p.yzx * 13.0))) / 13.0 - 0.025;
        return max(length(p) - 0.42, g * 0.6);
      }
      float a = atan(p.z, p.x);                       // Möbius strip: a segment turning half as fast as it goes round
      vec2 q = rot(0.5 * a) * vec2(length(p.xz) - 0.32, p.y);
      vec2 e = abs(q) - vec2(0.13, 0.012);
      return (length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)) * 0.8 - 0.008;
    }

    // Scene: returns (distance, material). Materials: 0 floor, 1 ceiling,
    // 2 shelf face, 3 shelf board, 10 + k item k. itemD/itemK: nearest item.
    float itemD; float itemK;
    vec2 map(vec3 p) {
      vec2 res = vec2(p.y, 0.0);
      float ceil_ = 4.0 - p.y;
      if (ceil_ < res.x) res = vec2(ceil_, 1.0);

      vec3 q = vec3(mod(p.x, 6.0) - 3.0, p.y, mod(p.z, 24.0) - 12.0);
      float body = sdBox(q - vec3(0.0, 1.2, 0.0), vec3(0.72, 1.2, 10.0));
      if (body < res.x) res = vec2(body, 2.0);
      float yb = p.y - 0.6 * clamp(floor(p.y / 0.6 + 0.5), 0.0, 4.0);
      float board = sdBox(vec3(q.x, yb, q.z), vec3(0.98, 0.025, 10.0));
      if (board < res.x) res = vec2(board, 3.0);

      itemD = 1e9; itemK = -1.0;
      for (int k = 0; k < ${N_ITEMS}; k++) {
        float sc = uItemScale[k];
        if (sc < 0.01) continue;
        vec3 r = p - uItemPos[k];
        float d = length(r) - 0.6 * sc;               // bounding sphere first: cheap when far
        if (d < 0.25) {
          r.xz = rot(uTime * 0.7 + float(k) * 1.3) * r.xz;
          r.yz = rot(0.45) * r.yz;
          d = shape(uItemType[k], r / sc) * sc;
        }
        if (d < itemD) { itemD = d; itemK = float(k); }
        if (d < res.x) res = vec2(d, 10.0 + float(k));
      }
      return res;
    }

    vec3 normalAt(vec3 p, float t) {
      vec2 e = vec2(1.0, -1.0) * 0.0015 * (1.0 + 0.1 * t);
      return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                       e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
    }

    // The stock: each shelf face is cut into product boxes, and every box shows
    // its own slice of the 3D Kaliset (z picked by a hash of the box), coloured
    // by the step of the orbit's closest pass as in Kali Drift.
    vec3 kali(vec3 pos, vec3 n, float t) {
      vec2 f = abs(n.x) > 0.5 ? pos.zy : pos.xy;
      vec2 cell = vec2(0.7, 0.6);
      vec2 id = floor(f / cell);
      vec2 uv = fract(f / cell) - 0.5;
      float h = fract(sin(dot(id + floor(pos.x / 6.0) * vec2(13.1, 7.7), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 p = vec3(uv * vec2(2.6, 2.2), 0.3 + 0.9 * h);
      float best = 1e9, bestI = 0.0;
      float iters = mix(uDetail, 3.0, clamp(t / 40.0, 0.0, 1.0));   // far shelves: fewer levels, no shimmer
      for (int i = 0; i < 14; i++) {
        if (float(i) >= iters) break;
        p = abs(p) / max(dot(p, p), 1e-4) - uC;
        float d = min(min(abs(p.x), abs(p.y)), min(abs(p.z), abs(length(p) - 1.0))) * (1.0 + 0.8 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.04 / (best + 0.04);
      vec3 c = rainbow(uHue + h * 0.6 + 0.14 * bestI) * g * g * 1.4 + rainbow(uHue + h) * 0.06;
      // the gap between boxes
      vec2 e = abs(uv) - vec2(0.46, 0.42);
      return c * (1.0 - 0.9 * smoothstep(-0.01, 0.01, max(e.x, e.y)));
    }

    vec3 itemColour(float k) {
      int i = int(k);
      float type = 0.0;
      for (int j = 0; j < ${N_ITEMS}; j++) if (j == i) type = uItemType[j];
      return 0.15 + 0.85 * rainbow(0.05 + type * 0.21);
    }

    // Colour of a surface hit, without the reflection.
    vec3 surface(vec3 pos, vec3 n, float mat, vec3 rd, float t) {
      float strip = smoothstep(0.16, 0.1, abs(mod(pos.x + 3.0, 6.0) - 3.0)) * step(1.0, mod(pos.z, 4.0));
      float light = 0.25 + 0.75 * clamp(n.y, 0.0, 1.0);
      if (mat < 0.5) {                                 // floor: dark tiles
        vec2 g = abs(fract(pos.xz) - 0.5);
        float line = smoothstep(0.49, 0.5, max(g.x, g.y));
        return vec3(0.018, 0.016, 0.025) * (1.0 + line);
      }
      if (mat < 1.5) return vec3(0.015, 0.012, 0.02) + strip * vec3(1.6, 1.45, 1.3);   // ceiling + light strips
      if (mat < 2.5) return kali(pos, n, t);              // the stock
      if (mat < 3.5) {                                 // boards: dark metal, lit from above, coloured lip
        float lip = smoothstep(0.9, 0.97, abs(mod(pos.x, 6.0) - 3.0));
        return vec3(0.03) * light + rainbow(uHue + 0.3) * lip * 0.25;
      }
      vec3 c = itemColour(mat - 10.0);
      float rim = pow(1.0 - abs(dot(n, -rd)), 2.0);
      return c * (1.8 + 0.8 * light) + vec3(1.0) * rim * 0.6;
    }

    vec2 march(vec3 ro, vec3 rd, int steps, out float glowK, out float glow) {
      float t = 0.02;
      float mat = -1.0;
      glow = 0.0; glowK = -1.0;
      float bestItem = 1e9;
      for (int i = 0; i < 110; i++) {
        if (i >= steps) break;
        vec3 p = ro + rd * t;
        vec2 h = map(p);
        // halo around the items, so you can spot them down an aisle
        glow += exp(-itemD * 2.5) * 0.02;
        if (itemD < bestItem) { bestItem = itemD; glowK = itemK; }
        if (h.x < 0.0015 * t) { mat = h.y; break; }
        t += h.x * 0.85;
        if (t > FAR) break;
      }
      return vec2(t, mat);
    }

    vec3 fog(vec3 col, float t) {
      return mix(col, rainbow(uHue + 0.55) * 0.035, 1.0 - exp(-t * 0.045));
    }

    void main() {
      // Field of view from the short side, but on a tall phone screen from 60 % of
      // the long side, so portrait still looks down the aisle instead of at floor and ceiling.
      float fit = max(min(uResolution.x, uResolution.y), 0.6 * max(uResolution.x, uResolution.y));
      vec2 uv = (vUv * uResolution - 0.5 * uResolution) / (0.5 * fit);
      vec3 fw = vec3(sin(uYaw) * cos(uPitch), sin(uPitch), cos(uYaw) * cos(uPitch));
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * 1.25 + uv.x * rt + uv.y * up);

      float gk, gl;
      vec2 hit = march(uCam, rd, 110, gk, gl);
      vec3 col = vec3(0.0);
      if (hit.y >= 0.0) {
        vec3 pos = uCam + rd * hit.x;
        vec3 n = normalAt(pos, hit.x);
        col = surface(pos, n, hit.y, rd, hit.x);
        if (hit.y < 0.5) {                             // glossy floor: one reflected bounce
          vec3 rr = reflect(rd, n);
          float gk2, gl2;
          vec2 h2 = march(pos + n * 0.01, rr, 60, gk2, gl2);
          vec3 rc = vec3(0.0);
          if (h2.y >= 0.0) {
            vec3 p2 = pos + n * 0.01 + rr * h2.x;
            rc = surface(p2, normalAt(p2, h2.x), h2.y, rr, hit.x + h2.x);
          }
          if (gk2 >= 0.0) rc += itemColour(gk2) * gl2 * uGlow;
          rc = fog(rc, h2.x);
          float fres = 0.18 + 0.5 * pow(1.0 - abs(rd.y), 4.0);
          col += rc * fres;
        }
      }
      col = fog(col, hit.x);
      if (gk >= 0.0) col += itemColour(gk) * gl * uGlow;

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
      uC: { value: [0.62, 0.5, 0.58] },
      uHue: { value: 0 },
      uCam: { value: [0, EYE, 0] },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uItemPos: { value: new Float32Array(3 * N_ITEMS) },
      uItemType: { value: new Float32Array(N_ITEMS) },
      uItemScale: { value: new Float32Array(N_ITEMS) },
      uDetail: { value: 9 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
    };
  },

  setup() {
    const rand = rng(628);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const shop = {
      rand,
      cam: { x: 0, z: 2, yaw: 0, pitch: 0 },
      path: [],
      mode: 'browse', // browse | scan | fetch | checkout
      timer: 0,
      sinceFound: 0,
      walked: 0,
      target: -1,
      list: [], // [{ type, done }]
      items: [], // { type, x, z, y, vy, scale, status: 'shelf' | 'falling' | 'flying' | 'basket' }
      caption: 'opening time',
    };
    const spot = () => {
      // A free place on an aisle, not too close to the shopper.
      for (;;) {
        const x = AISLE * pick(XS);
        const z = BLOCK * pick(ZS.slice(0, -1)) + 3 + rand() * 18;
        if (Math.hypot(x - shop.cam.x, z - shop.cam.z) > 10) return [x, z];
      }
    };
    shop.newList = () => {
      const types = [0, 1, 2, 3, 4].sort(() => rand() - 0.5).slice(0, 3);
      shop.list = types.map((type) => ({ type, done: false }));
      shop.items = Array.from({ length: N_ITEMS }, (_, i) => {
        const [x, z] = spot();
        const type = i < 3 ? types[i] : Math.floor(rand() * SHAPES.length);
        // Dropped in: everything falls from the ceiling at the start of a list.
        return { type, x, z, y: 3.4 + 0.4 * rand(), vy: 0, scale: 1, status: 'falling' };
      });
    };
    shop.spot = spot;
    shop.pick = pick;
    shop.newList();
    return { shop };
  },

  update(ctx, state) {
    const { shop } = state;
    const dt = Math.min(0.1, ctx.delta) * (ctx.params.speed ?? 1);
    const cam = shop.cam;
    const t = ctx.time;
    const fw = [Math.sin(cam.yaw), Math.cos(cam.yaw)];

    // Items: falling ones drop under gravity and bounce once, flying ones go
    // into the basket (just below the view).
    for (const it of shop.items) {
      if (it.status === 'falling') {
        it.vy -= 9.81 * dt;
        it.y += it.vy * dt;
        if (it.y < 1.1) {
          it.y = 1.1;
          it.vy = Math.abs(it.vy) > 1.5 ? -it.vy * 0.35 : 0;
          if (it.vy === 0) it.status = 'shelf';
        }
      } else if (it.status === 'flying') {
        it.fly += dt / 0.7;
        const bx = cam.x + fw[0] * 0.7, bz = cam.z + fw[1] * 0.7, by = EYE - 0.75;
        const k = Math.min(1, it.fly);
        it.x += (bx - it.x) * Math.min(1, dt * 8);
        it.z += (bz - it.z) * Math.min(1, dt * 8);
        it.y += (by - it.y) * Math.min(1, dt * 8);
        it.scale = 1 - k;
        if (k >= 1) it.status = 'basket';
      }
    }

    const wanted = (it) => it.status === 'shelf' && shop.list.some((l) => !l.done && l.type === it.type);
    const visible = (it) => Math.hypot(it.x - cam.x, it.z - cam.z) < 28 && canSee(cam.x, cam.z, it.x, it.z);

    // Look for list items in sight (or, after 40 s with nothing, ask staff).
    if (shop.mode === 'browse' || shop.mode === 'scan') {
      shop.sinceFound += dt;
      let best = -1, bestD = Infinity;
      shop.items.forEach((it, i) => {
        if (!wanted(it)) return;
        const d = Math.hypot(it.x - cam.x, it.z - cam.z);
        if ((visible(it) || shop.sinceFound > 40) && d < bestD) { best = i; bestD = d; }
      });
      if (best >= 0) {
        const it = shop.items[best];
        shop.caption = shop.sinceFound > 40 ? 'asked a member of staff' : `spotted: ${SHAPES[it.type]}`;
        shop.mode = 'fetch';
        shop.target = best;
        shop.path = route(cam, it.x, it.z);
      }
    }

    if (shop.mode === 'scan') {
      // At a crossing: look left, right, then carry on.
      shop.timer -= dt;
      cam.yaw = shop.scanYaw + 1.1 * Math.sin((1 - shop.timer / 2.4) * TAU);
      if (shop.timer <= 0) { shop.mode = 'browse'; shop.path = []; }
    } else if (shop.mode === 'checkout') {
      shop.timer -= dt;
      if (shop.timer <= 0) {
        shop.newList();
        shop.mode = 'browse';
        shop.sinceFound = 0;
        shop.caption = 'basket dropped; restocking at random';
      }
    } else {
      if (!shop.path.length && shop.mode === 'browse') {
        // Wander to a random crossing next to this one.
        const ix = Math.round(cam.x / AISLE), iz = Math.round(cam.z / BLOCK);
        const nx = Math.max(XS[0], Math.min(XS.at(-1), ix + Math.round(shop.rand() * 4 - 2)));
        const nz = Math.max(ZS[0], Math.min(ZS.at(-1), iz + (shop.rand() < 0.5 ? -1 : 1)));
        shop.path = route(cam, nx * AISLE, nz * BLOCK);
        if (shop.mode === 'browse' && shop.sinceFound < 40) shop.caption = 'browsing';
      }
      const wp = shop.path[0];
      if (wp) {
        const dx = wp[0] - cam.x, dz = wp[1] - cam.z;
        const d = Math.hypot(dx, dz);
        const stopAt = shop.mode === 'fetch' && shop.path.length === 1 ? 1.2 : 0;
        const step = Math.min(WALK * dt, Math.max(0, d - stopAt));
        if (d > 1e-4) {
          cam.x += (dx / d) * step;
          cam.z += (dz / d) * step;
          shop.walked += step;
          let dy = Math.atan2(dx, dz) - cam.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          cam.yaw += dy * Math.min(1, dt * 3.5);
        }
        if (d - stopAt < 0.02) {
          shop.path.shift();
          if (!shop.path.length) {
            if (shop.mode === 'fetch') {
              const it = shop.items[shop.target];
              if (it.status === 'shelf') {
                it.status = 'flying';
                it.fly = 0;
                const entry = shop.list.find((l) => !l.done && l.type === it.type);
                if (entry) entry.done = true;
                shop.sinceFound = 0;
                shop.caption = `got the ${SHAPES[it.type]}`;
              }
              if (shop.list.every((l) => l.done)) {
                shop.mode = 'checkout';
                shop.timer = 3;
                shop.caption = `checkout: 0 dollars, ${shop.list.length} topological curiosities`;
              } else shop.mode = 'browse';
            } else if (Math.abs(cam.z - snap(cam.z, BLOCK)) < 0.05) {
              shop.mode = 'scan';
              shop.timer = 2.4;
              shop.scanYaw = cam.yaw;
            }
          }
        }
      }
    }

    // Look slightly down at an item being fetched, level otherwise.
    let pitchTo = -0.04;
    if (shop.mode === 'fetch') {
      const it = shop.items[shop.target];
      const d = Math.hypot(it.x - cam.x, it.z - cam.z);
      if (d < 6) pitchTo = Math.atan2(it.y - EYE, d);
    }
    cam.pitch += (pitchTo - cam.pitch) * Math.min(1, dt * 3);

    // Uniforms.
    const m = ctx.motion;
    const u = state.uniforms;
    u.uC.value = [m.cx, m.cy, m.cz];
    u.uHue.value = m.hue;
    u.uCam.value = [cam.x, EYE + 0.03 * Math.sin(shop.walked * 3.6), cam.z]; // a little step bob
    u.uYaw.value = cam.yaw;
    u.uPitch.value = cam.pitch;
    shop.items.forEach((it, i) => {
      u.uItemPos.value[3 * i] = it.x;
      u.uItemPos.value[3 * i + 1] = it.y + (it.status === 'shelf' ? 0.08 * Math.sin(t * 1.5 + i) : 0);
      u.uItemPos.value[3 * i + 2] = it.z;
      u.uItemType.value[i] = it.type;
      u.uItemScale.value[i] = it.status === 'basket' ? 0 : it.scale;
    });
    u.uDetail.value = ctx.params.detail;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;

    // For the equation overlay.
    Object.assign(m, {
      walked: shop.walked,
      caption: shop.caption,
      list: shop.list.map((l) => {
        let dist = null;
        if (!l.done) {
          for (const it of shop.items) {
            if (it.type === l.type && it.status === 'shelf' && visible(it)) {
              const d = Math.hypot(it.x - cam.x, it.z - cam.z);
              if (dist == null || d < dist) dist = d;
            }
          }
        }
        return { name: SHAPES[l.type], done: l.done, dist };
      }),
    });
  },
};
