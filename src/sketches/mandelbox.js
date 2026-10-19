import { TAU, phaseOf } from '../lib/motion.js';

// The Mandelbox (Tom Lowe, "Tglad", 2010): the fractal behind most modern 3D fractal art. Each step folds
// space twice, scales it, and adds the starting point back:
//
//   box fold:     x ↦ 2·clamp(x, −1, 1) − x                 (each coordinate past ±1 is mirrored back in)
//   sphere fold:  p ↦ p·(R²/r²_min)   if |p| < r_min
//                 p ↦ p·(R²/|p|²)     if r_min ≤ |p| < R    (inversion in the sphere of radius R)
//   then          p ↦ s·p + c,   c = the point being tested
//
// with R = 1, r_min = 0.5. The same mirror-and-invert idea as Kali's set (|p| then p/|p|²), but the box
// fold is a mirror in six planes and the inversion has a floor, so the result stays bounded and solid.
//
// The distance estimate is exact in the limit: carry the running scale factor dr (each fold multiplies it
// by the same factor it applied to p, then dr ↦ |s|·dr + 1), and DE = |p|/|dr|. That is what lets the
// camera march rays into it, and soft shadows and ambient occlusion ask the same DE.
//
// The scale s is the one real parameter. For |s| > 1 the set is guaranteed to lie inside the cube
// |x| ≤ 2(|s| + 1)/(|s| − 1) (shown live); in practice, for this sweep, it fills the cube |x| ≤ 2 (checked
// by escape along the axes and diagonals). Here s(t) = −2.4 − 0.5 cos(2πt/T) sweeps from −2.9 (dense,
// crystalline) to −1.9 (open chambers and arches), and the camera rides a closed orbit that swings in close
// to the faces and back out.
//
// Rendering, the modern way: ray marching with the DE, normals from its gradient (tetrahedral 4-tap), soft
// shadows from the closest miss along a shadow ray (penumbra k·d/t), 5-tap ambient occlusion, orbit-trap
// colour (how close the orbit came to the origin and to the axes), sky light, fog, ACES tone mapping.

const PERIOD = 48;
const PALETTES = ['Bone & copper', 'Jade', 'Night'];

export default {
  name: 'Mandelbox',
  description:
    'The Mandelbox: fold space in a box, invert it in a sphere, scale, repeat. The fractal behind most modern 3D ' +
    'fractal art, rendered the modern way (ray-marched distance estimate, soft shadows, ambient occlusion, ' +
    'orbit-trap colour). Its scale s sweeps from deep chambers to dense crystal while the camera circles it.',
  tags: ['fractal', 'mandelbox', 'raymarch', '3d', 'modern'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const p = phaseOf(t, PERIOD);
    const s = -2.4 - 0.5 * Math.cos(TAU * p);
    const half = (2 * (Math.abs(s) + 1)) / (Math.abs(s) - 1);
    return { s, half, p, yaw: TAU * phaseOf(t, PERIOD * 2) };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    'x &\\mapsto 2\\,\\mathrm{clamp}(x,-1,1) - x \\quad\\text{(box fold)} \\\\' +
    'p &\\mapsto p\\,\\tfrac{R^2}{\\max(|p|^2,\\ r_{\\text{min}}^2)}\\ \\ \\text{if } |p| < R \\quad\\text{(sphere fold)} \\\\' +
    `p &\\mapsto s\\,p + c,\\quad s = -2.4 - 0.5\\cos\\tfrac{2\\pi t}{T} = ${hl(m.s, 2)} \\\\` +
    `\\text{DE} &= \\tfrac{|p|}{|dr|},\\quad dr \\mapsto |s|\\,dr + 1,\\qquad |x| \\le \\tfrac{2(|s|+1)}{|s|-1} = ${hl(m.half, 2)}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3 },
    palette: { value: 0, min: 0, max: PALETTES.length - 1, step: 1, options: PALETTES },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uTime, uS, uYaw, uPalette;
    varying vec2 vUv;

    vec4 gTrap;

    float de(vec3 c) {
      vec3 p = c;
      float dr = 1.0;
      vec4 trap = vec4(1e9);
      for (int i = 0; i < 12; i++) {
        p = clamp(p, -1.0, 1.0) * 2.0 - p;
        float r2 = dot(p, p);
        float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
        p *= k;
        dr *= k;
        p = uS * p + c;
        dr = dr * abs(uS) + 1.0;
        trap = min(trap, vec4(abs(p), dot(p, p)));
      }
      gTrap = trap;
      return length(p) / abs(dr);
    }

    vec3 normalAt(vec3 p, float e) {
      const vec2 k = vec2(1.0, -1.0);
      return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e) + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
    }

    float softShadow(vec3 ro, vec3 rd, float tmax) {
      float res = 1.0;
      float t = 0.01;
      for (int i = 0; i < 40; i++) {
        float h = de(ro + rd * t);
        res = min(res, 10.0 * h / t);
        t += clamp(h, 0.005, 0.4);
        if (res < 0.002 || t > tmax) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    float ao(vec3 p, vec3 n, float scale) {
      float occ = 0.0;
      float w = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = scale * 0.06 * float(i);
        occ += w * (h - de(p + n * h));
        w *= 0.6;
      }
      return clamp(1.0 - 3.5 * occ / scale, 0.0, 1.0);
    }

    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

    vec3 surface(int k, vec4 tr) {
      float a = clamp(sqrt(tr.w) * 0.35, 0.0, 1.0);
      float b = clamp(min(tr.x, min(tr.y, tr.z)) * 1.5, 0.0, 1.0);
      if (k == 1) return mix(vec3(0.05, 0.22, 0.17), vec3(0.55, 0.85, 0.7), a) * (0.6 + 0.4 * b);
      if (k == 2) return mix(vec3(0.05, 0.06, 0.14), vec3(0.35, 0.45, 0.85), a) + vec3(0.9, 0.5, 0.2) * pow(1.0 - b, 6.0);
      return mix(vec3(0.62, 0.3, 0.14), vec3(0.88, 0.84, 0.76), a) * (0.7 + 0.3 * b);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float aspect = uResolution.x / uResolution.y;
      uv.x *= aspect;
      // On tall screens widen the view so the box still fits across.
      float zoom = aspect < 1.0 ? 1.6 * aspect : 1.6;

      // A closed orbit round the box, close enough to fill the screen with one corner and its chambers.
      float H = 2.0;                                   // the set fills |x| ≤ 2
      float R = 2.9 + 0.6 * cos(2.0 * uYaw);           // swing in close to the faces and out again
      vec3 ro = vec3(cos(uYaw), 0.45 + 0.3 * sin(2.0 * uYaw), sin(uYaw)) * H * R;
      vec3 ta = vec3(0.0, -0.1 * H, 0.0);
      vec3 fw = normalize(ta - ro);
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * zoom + rt * uv.x + up * uv.y);

      vec3 sunDir = normalize(vec3(0.55, 0.75, 0.35));
      vec3 skyTop = vec3(0.004, 0.005, 0.01), skyHor = vec3(0.018, 0.014, 0.02);
      vec3 sky = mix(skyHor, skyTop, clamp(rd.y * 1.5 + 0.3, 0.0, 1.0));
      sky += vec3(1.0, 0.7, 0.45) * pow(max(dot(rd, sunDir), 0.0), 60.0) * 0.25;

      float t = 0.0;
      float tmax = H * 4.0;
      float hit = -1.0;
      float steps = 0.0;
      for (int i = 0; i < 140; i++) {
        vec3 p = ro + rd * t;
        float d = de(p);
        float eps = 0.0007 * t;
        if (d < eps) { hit = t; break; }
        t += d * 0.9;
        steps += 1.0;
        if (t > tmax) break;
      }

      vec3 col = sky;
      int k = int(uPalette + 0.5);
      if (hit > 0.0) {
        vec3 p = ro + rd * hit;
        de(p);
        vec4 tr = gTrap;
        vec3 n = normalAt(p, 0.0005 * hit);
        vec3 base = surface(k, tr);
        float sh = softShadow(p + n * 0.002 * hit, sunDir, H * 2.0);
        float occ = ao(p, n, 0.08 * H);
        float dif = max(dot(n, sunDir), 0.0);
        float bounce = 0.5 + 0.5 * n.y;
        vec3 h = normalize(sunDir - rd);
        float spec = pow(max(dot(n, h), 0.0), 48.0) * sh;
        col = base * (vec3(1.15, 0.98, 0.8) * dif * sh + vec3(0.25, 0.3, 0.42) * bounce * occ + 0.05 * occ);
        col += vec3(1.0, 0.85, 0.7) * spec * 0.35;
        float fog = 1.0 - exp(-pow(hit / (H * 5.0), 2.0));
        col = mix(col, sky, fog);
      }
      // A faint glow where rays grazed the surface without hitting.
      col += vec3(0.9, 0.55, 0.3) * 0.06 * smoothstep(40.0, 140.0, steps) * (hit < 0.0 ? 1.0 : 0.3);

      col = aces(col * 1.1);
      col = pow(col, vec3(1.0 / 2.2));
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.45 * dot(q, q);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return { uS: { value: -2.4 }, uYaw: { value: 0 }, uPalette: { value: 0 } };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uS.value = m.s;
    u.uYaw.value = m.yaw;
    u.uPalette.value = ctx.params.palette;
  },
};
