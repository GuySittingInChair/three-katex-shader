import { TAU, phaseOf, clamp01, smooth } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Kaleidoscopic IFS (Knighty, 2010). Each step:
//
//     p ↦ s · R_θ · F_G(p) − (s − 1) v
//
// F_G folds all of space into one wedge of a polyhedron's mirror group G: wherever p is, reflect it across
// mirror planes until it lands in the fundamental domain. (Knighty's fold: repeat k times
// { |x|, |y|, reflect across n = (−½, −cos(π/k), √(¾ − cos²(π/k))) if on its negative side } with k = 3, 4, 5
// for the tetrahedral, octahedral and icosahedral groups, of orders 24, 48 and 120.) Then turn by R_θ, and
// scale by s toward a corner v of the wedge. Every vertex of the polyhedron folds onto v, so one step makes
// N shrunken copies of the whole, one at each of the N vertices: an iterated function system whose maps
// all share the symmetry, computed with one fold instead of N tests.
//
// Checked in Node: each fold keeps |p| (error 2 × 10⁻¹⁵), applying it twice changes nothing, and the
// orbits of the wedge's corners under the generated group have sizes 4/4/6 (tetrahedral), 6/8/12
// (octahedral), 12/20/30 (icosahedral), all folding back onto their corner. Since the folds commute with the
// group, the shape keeps the full symmetry for any turn θ.
//
// Dimension. N copies at scale 1/s give the similarity dimension D = ln N / ln s, and the Hausdorff
// dimension equals it when the copies don't overlap (Moran's open set condition); otherwise it is at most
// that. The loop plays four classic flakes, each at the scale where neighbouring copies just touch:
//     Sierpinski tetrahedron    N = 4,  s = 2      D = 2 exactly
//     octahedron flake          N = 6,  s = 2      D = ln 6/ln 2 = 2.585
//     icosahedron flake         N = 12, s = 1 + φ  D = ln 12/ln 2.618 = 2.582
//     dodecahedron flake        N = 20, s = 2 + φ  D = ln 20/ln 3.618 = 2.330
// and in each, the turn θ swings out and back (θ = 0 at the ends), and s grows by up to 12% so the copies
// pull apart as they turn. The shapes cross-fade (the two distance estimates are blended) at θ = 0.
//
// Rendering as in Mandelbox: ray-marched distance estimate |p|/sⁿ − r, soft shadows, ambient occlusion,
// colour from orbit traps and a thin-film (soap-bubble) tint that changes with viewing angle.

const PHI = (1 + Math.sqrt(5)) / 2;
const SEG = 16;
const FADE = 1.6;
const FLAKES = [
  { name: 'Sierpinski tetrahedron', group: 'tetrahedral', order: 24, k: 3, corner: 'b', N: 4, s: 2, theta: 0.45 },
  { name: 'octahedron flake', group: 'octahedral', order: 48, k: 4, corner: 'b', N: 6, s: 2, theta: 0.55 },
  { name: 'icosahedron flake', group: 'icosahedral', order: 120, k: 5, corner: 'b', N: 12, s: 1 + PHI, theta: 0.5 },
  { name: 'dodecahedron flake', group: 'icosahedral', order: 120, k: 5, corner: 'c', N: 20, s: 2 + PHI, theta: 0.45 },
];
const LOOP = SEG * FLAKES.length;
const PALETTES = ['Thin film', 'Ice', 'Ember'];

// Corner of the wedge (the vertex direction) for fold k: b = (sc, 0, ½), c = (0, sc, cos(π/k)), normalised.
function corner(k, which) {
  const cp = Math.cos(Math.PI / k);
  const sc = Math.sqrt(0.75 - cp * cp);
  const v = which === 'b' ? [sc, 0, 0.5] : [0, sc, cp];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

function flakeAt(i, u) {
  const f = FLAKES[i];
  const bump = Math.sin(Math.PI * u) ** 2;
  return { ...f, v: corner(f.k, f.corner), th: f.theta * Math.sin(TAU * u) * (0.6 + 0.4 * bump), sNow: f.s * (1 + 0.12 * bump) };
}

export default {
  name: 'Kaleidoscopic IFS',
  description:
    'Fold space into one wedge of a polyhedron\'s mirror group, turn it, scale it toward a vertex, repeat: ' +
    'Knighty\'s kaleidoscopic IFS. One fold does the work of N copies, so the Sierpinski tetrahedron and the ' +
    'octahedron, icosahedron and dodecahedron flakes all come from the same few lines. Their dimension ' +
    'ln N / ln s is shown live as the copies turn and pull apart.',
  tags: ['fractal', 'kifs', 'ifs', 'symmetry', 'raymarch', '3d', 'modern'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const tl = ((t % LOOP) + LOOP) % LOOP;
    const i = Math.floor(tl / SEG);
    const u = (tl - i * SEG) / SEG;
    const a = flakeAt(i, u);
    const b = flakeAt((i + 1) % FLAKES.length, 0);
    const blend = smooth(clamp01((tl - i * SEG - (SEG - FADE)) / FADE));
    return {
      i, u, a, b, blend,
      D: Math.log(a.N) / Math.log(a.sNow),
      D0: Math.log(a.N) / Math.log(a.s),
      yaw: TAU * phaseOf(t, 40),
    };
  },

  latex: (params, hl, m) => {
    const a = m.a;
    const sNames = { 2: '2', [1 + PHI]: '(1+\\varphi)', [2 + PHI]: '(2+\\varphi)' };
    const line =
      m.u < 0.06 || m.u > 0.94
        ? `${a.name}: copies just touching, D = ln ${a.N}/ln ${a.s.toFixed(3)} exactly.`
        : `Fold into one wedge out of ${a.order}. Do the work once; the symmetry copies it ${a.order - 1} times.`;
    return (
      '\\begin{aligned}' +
      'p &\\mapsto s\\,R_\\theta\\,F_G(p) - (s-1)\\,v \\\\' +
      `G &= \\text{${a.group}}\\ (|G| = ${a.order}),\\quad v = \\text{vertex}:\\ N = ${a.N}\\ \\text{copies} \\\\` +
      `\\theta &= ${hl((a.th * 180) / Math.PI, 0)}^\\circ,\\quad s = ${sNames[a.s] ?? a.s.toFixed(3)} \\times ${hl(a.sNow / a.s, 3)} = ${hl(a.sNow, 3)} \\\\` +
      `D &\\le \\frac{\\ln N}{\\ln s} = \\frac{\\ln ${a.N}}{\\ln ${a.sNow.toFixed(2)}} = ${hl(m.D, 3)}\\quad (= \\text{if the copies don't overlap}) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uTime, uYaw, uPalette, uBlend;
    uniform float uKA, uSA, uThA, uKB, uSB, uThB;
    uniform vec3 uVA, uVB;
    varying vec2 vUv;

    float gTrap;
    float gLayer;

    mat3 rotAxis(vec3 a, float t) {
      float c = cos(t), s = sin(t), C = 1.0 - c;
      return mat3(c + a.x * a.x * C, a.y * a.x * C + a.z * s, a.z * a.x * C - a.y * s,
                  a.x * a.y * C - a.z * s, c + a.y * a.y * C, a.z * a.y * C + a.x * s,
                  a.x * a.z * C + a.y * s, a.y * a.z * C - a.x * s, c + a.z * a.z * C);
    }

    float kifs(vec3 p, float k, float s, float th, vec3 v) {
      float cp = cos(3.14159265 / k);
      vec3 nc = vec3(-0.5, -cp, sqrt(0.75 - cp * cp));
      mat3 R = rotAxis(normalize(vec3(0.3, 0.5, 0.8)), th);
      float scale = 1.0;
      float trap = 1e9;
      float layer = 0.0;
      int kk = int(k + 0.5);
      for (int i = 0; i < 11; i++) {
        for (int j = 0; j < 5; j++) {
          if (j >= kk) break;
          p.xy = abs(p.xy);
          p -= 2.0 * min(0.0, dot(p, nc)) * nc;
        }
        p = R * p;
        p = p * s - v * (s - 1.0);
        scale *= s;
        float d = length(p - v * 0.5);
        if (d < trap) { trap = d; layer = float(i); }
      }
      gTrap = trap;
      gLayer = layer;
      return length(p) / scale - 0.004;
    }

    float de(vec3 p) {
      if (uBlend <= 0.0) return kifs(p, uKA, uSA, uThA, uVA);
      if (uBlend >= 1.0) return kifs(p, uKB, uSB, uThB, uVB);
      float b = kifs(p, uKB, uSB, uThB, uVB);
      float tb = gTrap, lb = gLayer;
      float a = kifs(p, uKA, uSA, uThA, uVA);
      gTrap = mix(gTrap, tb, uBlend);
      gLayer = mix(gLayer, lb, uBlend);
      return mix(a, b, uBlend);
    }

    vec3 normalAt(vec3 p, float e) {
      const vec2 k = vec2(1.0, -1.0);
      return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e) + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
    }

    float softShadow(vec3 ro, vec3 rd) {
      float res = 1.0;
      float t = 0.01;
      for (int i = 0; i < 36; i++) {
        float h = de(ro + rd * t);
        res = min(res, 10.0 * h / t);
        t += clamp(h, 0.004, 0.2);
        if (res < 0.002 || t > 3.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    float ao(vec3 p, vec3 n) {
      float occ = 0.0, w = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = 0.025 * float(i);
        occ += w * (h - de(p + n * h));
        w *= 0.6;
      }
      return clamp(1.0 - 9.0 * occ, 0.0, 1.0);
    }

    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float aspect = uResolution.x / uResolution.y;
      uv.x *= aspect;
      float zoom = aspect < 1.0 ? 1.9 * aspect : 1.9;

      vec3 ro = vec3(cos(uYaw), 0.4 + 0.2 * sin(2.0 * uYaw), sin(uYaw)) * 2.55;
      vec3 ta = vec3(0.0, 0.32, 0.0);           // aim above the centre so the shape sits below the equation
      vec3 fw = normalize(ta - ro);
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * zoom + rt * uv.x + up * uv.y);

      vec3 sunDir = normalize(vec3(0.5, 0.8, 0.3));
      vec3 sky = mix(vec3(0.016, 0.012, 0.022), vec3(0.003, 0.004, 0.009), clamp(rd.y * 1.5 + 0.4, 0.0, 1.0));

      float t = 0.0, hit = -1.0, steps = 0.0;
      for (int i = 0; i < 130; i++) {
        float d = de(ro + rd * t);
        if (d < 0.0006 * t) { hit = t; break; }
        t += d * 0.9;
        steps += 1.0;
        if (t > 7.0) break;
      }

      vec3 col = sky;
      int k = int(uPalette + 0.5);
      if (hit > 0.0) {
        vec3 p = ro + rd * hit;
        de(p);
        float trap = gTrap, layer = gLayer;
        vec3 n = normalAt(p, 0.0005 * hit);
        float sh = softShadow(p + n * 0.003, sunDir);
        float occ = ao(p, n);
        float dif = max(dot(n, sunDir), 0.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
        vec3 base;
        if (k == 1) base = mix(vec3(0.55, 0.75, 0.95), vec3(0.95, 0.98, 1.0), clamp(trap, 0.0, 1.0));
        else if (k == 2) base = mix(vec3(0.6, 0.12, 0.04), vec3(1.0, 0.7, 0.3), clamp(trap * 1.3, 0.0, 1.0));
        else base = 0.55 + 0.45 * cos(6.2831 * (0.8 * fres + 0.035 * layer + 0.55 * trap + vec3(0.0, 0.33, 0.67)));
        vec3 h = normalize(sunDir - rd);
        float spec = pow(max(dot(n, h), 0.0), 64.0) * sh;
        col = base * (vec3(1.1, 0.98, 0.85) * dif * sh * 0.9 + vec3(0.22, 0.26, 0.38) * (0.5 + 0.5 * n.y) * occ + 0.04);
        col += spec * 0.45 + base * fres * 0.25 * occ;
        col = mix(col, sky, 1.0 - exp(-pow(hit / 9.0, 2.0)));
      }
      col += vec3(0.5, 0.6, 1.0) * 0.07 * smoothstep(30.0, 130.0, steps) * (hit < 0.0 ? 1.0 : 0.25);

      col = aces(col * 1.1);
      col = pow(col, vec3(1.0 / 2.2));
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.45 * dot(q, q);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    const v = () => ({ value: [0, 0, 1] });
    return {
      uYaw: { value: 0 }, uPalette: { value: 0 }, uBlend: { value: 0 },
      uKA: { value: 3 }, uSA: { value: 2 }, uThA: { value: 0 }, uVA: v(),
      uKB: { value: 4 }, uSB: { value: 2 }, uThB: { value: 0 }, uVB: v(),
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uYaw.value = m.yaw;
    u.uPalette.value = ctx.params.palette;
    u.uBlend.value = m.blend;
    u.uKA.value = m.a.k; u.uSA.value = m.a.sNow; u.uThA.value = m.a.th; u.uVA.value = m.a.v;
    u.uKB.value = m.b.k; u.uSB.value = m.b.sNow; u.uThB.value = m.b.th; u.uVB.value = m.b.v;
  },
};
