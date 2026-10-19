import { TAU, phaseOf, clamp01, smooth } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Hybrid fractals: the trick behind most fractal art made since about 2011 (Mandelbulber, Mandelbulb 3D).
// Instead of one formula repeated, take two and let them alternate, step by step, according to a word:
//
//     B:  p ↦ s · σ(β(p)) + c         Mandelbox step (box fold β, sphere fold σ, scale s, add the point c)
//     M:  p ↦ 3 · μ(p) − 2(1, 1, 0)   Menger step (fold into one wedge |x| ≥ |y| ≥ |z|, scale 3 from a
//                                     corner, then fold z back at 1 so the map stays continuous)
//
// and the orbit of a point c is  p₀ = c,  p_{n+1} = W_{n mod L}(p_n)  for a word W like BBM. Neither piece
// knows about the other; the hybrid has features of both and of neither.
//
// The distance estimate carries over because both steps are made of isometries and uniform scalings: the
// running derivative is multiplied by each step's scale (k·|s| for B, with k the sphere fold's local
// factor, then +1 for the added c; 3 for M), and DE = |p|/|dr|. It is no longer exact, so how far a ray
// can safely step was measured instead: sampling 60 000 pairs of nearby points in |x| ≤ 4 at s = −2.3,
// −2.45 and −2.6, with 8 to 13 steps, the largest |DE(x) − DE(y)|/|x − y| near the surface is 1.4 (B alone),
// 1.4 (BBM), 1.5 (BM), 1.7 (BMM). A ray marching by DE/L never jumps through a surface, and 0.55 < 1/1.7,
// so the march uses 0.55·DE (with 8 steps, the shader's count). (With the textbook,
// discontinuous Menger step "if z < −1, z += 2" the same test gives 72 for BM: rays would tunnel. That is
// why the M step folds z instead.)
//
// The loop plays four words, 14 s each, cross-fading their distance estimates: B (the plain Mandelbox),
// BBM, BM, BMM. The Mandelbox scale s breathes from −2.3 to −2.6 in each; every word's set stays inside
// |x| ≤ 2 (escape-tested), which is what the camera frames. Colour shows which formula owns which
// part of the surface: each kind of step records how close its outputs came to the origin (an orbit trap,
// t_B and t_M), and ln(t_B/t_M) picks copper (Mandelbox) or steel blue (Menger). The split sits at −0.2,
// near the median of that log-ratio on the surface (measured), so both owners get a fair share.

const SEG = 14;
const FADE = 1.8;
const WORDS = ['B', 'BBM', 'BM', 'BMM'];
const LIP = { B: 1.4, BBM: 1.4, BM: 1.5, BMM: 1.7 };
const LOOP = SEG * WORDS.length;
const PALETTES = ['Copper & steel', 'Jade & bone', 'Night'];

// Bit i of the mask is 1 when step i of the word is a Menger step.
const maskOf = (w) => [...w].reduce((m, ch, i) => m + (ch === 'M' ? 2 ** i : 0), 0);

function wordAt(i, u) {
  const w = WORDS[i];
  return { w, len: w.length, mask: maskOf(w), s: -2.3 - 0.3 * Math.sin(Math.PI * u) ** 2 };
}

export default {
  name: 'Hybrid Fractal',
  description:
    'Two fractal formulas taking turns inside one loop: a Mandelbox step and a Menger-sponge step, alternating ' +
    'by a word like BBM. The trick behind most modern 3D fractal art. Colour shows which formula owns which ' +
    'part of the surface; the word changes every 14 seconds.',
  tags: ['fractal', 'hybrid', 'mandelbox', 'menger', 'raymarch', '3d', 'modern'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t) {
    const tl = ((t % LOOP) + LOOP) % LOOP;
    const i = Math.floor(tl / SEG);
    const u = (tl - i * SEG) / SEG;
    const a = wordAt(i, u);
    const b = wordAt((i + 1) % WORDS.length, 0);
    const blend = smooth(clamp01((tl - i * SEG - (SEG - FADE)) / FADE));
    const nB = [...a.w].filter((ch) => ch === 'B').length;
    // Every step multiplies dr by at least its scale (the sphere fold only ever adds k ≥ 1).
    const growth = Math.abs(a.s) ** nB * 3 ** (a.len - nB);
    return { i, u, a, b, blend, nB, nM: a.len - nB, growth, lip: LIP[a.w], yaw: TAU * phaseOf(t, LOOP) };
  },

  latex: (params, hl, m) => {
    const a = m.a;
    const word = [...a.w].map((ch) => (ch === 'B' ? '\\textcolor{#e0905a}{B}' : '\\textcolor{#7fa8e0}{M}')).join('');
    const line =
      m.nM === 0
        ? 'The plain Mandelbox, for reference. Full custody.'
        : `Custody: Mandelbox ${m.nB} step${m.nB > 1 ? 's' : ''}, Menger ${m.nM}, per ${a.len}-step week.`;
    return (
      '\\begin{aligned}' +
      `B&: p \\mapsto s\\,\\sigma(\\beta(p)) + c,\\quad s = ${hl(a.s, 2)} \\\\` +
      'M&: p \\mapsto 3\\,\\mu(p) - 2\\,(1,1,0) \\\\' +
      `p_{n+1} &= W_{n \\bmod ${a.len}}(p_n),\\quad W = ${word}\\cdots \\\\` +
      `\\text{DE} &= \\tfrac{|p|}{|dr|},\\quad |dr| \\text{ grows} \\ge ${hl(m.growth, 1)}\\times \\text{ per word} \\\\` +
      `\\text{Lip} &\\approx ${m.lip.toFixed(1)}\\ \\text{(measured)} \\Rightarrow \\text{march by } 0.55\\,\\text{DE} \\\\` +
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
    uniform float uMaskA, uLenA, uSA, uMaskB, uLenB, uSB;
    varying vec2 vUv;

    float gTrapB, gTrapM;

    float hybrid(vec3 c, float mask, float len, float s) {
      vec3 p = c;
      float dr = 1.0;
      float tB = 1e9, tM = 1e9;
      for (int i = 0; i < 8; i++) {
        float bit = mod(floor(mask / exp2(mod(float(i), len))), 2.0);
        if (bit < 0.5) {
          p = clamp(p, -1.0, 1.0) * 2.0 - p;
          float r2 = dot(p, p);
          float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
          p = p * (k * s) + c;
          dr = dr * k * abs(s) + 1.0;
          tB = min(tB, dot(p, p));
        } else {
          p = abs(p);
          if (p.x < p.y) p.xy = p.yx;
          if (p.x < p.z) p.xz = p.zx;
          if (p.y < p.z) p.yz = p.zy;
          p = p * 3.0 - vec3(2.0, 2.0, 0.0);
          p.z = 1.0 - abs(p.z - 1.0);
          dr *= 3.0;
          tM = min(tM, dot(p, p));
        }
      }
      gTrapB = tB;
      gTrapM = tM;
      return length(p) / abs(dr);
    }

    float de(vec3 p) {
      if (uBlend <= 0.0) return hybrid(p, uMaskA, uLenA, uSA);
      if (uBlend >= 1.0) return hybrid(p, uMaskB, uLenB, uSB);
      float b = hybrid(p, uMaskB, uLenB, uSB);
      float bB = gTrapB, bM = gTrapM;
      float a = hybrid(p, uMaskA, uLenA, uSA);
      gTrapB = mix(gTrapB, bB, uBlend);
      gTrapM = mix(gTrapM, bM, uBlend);
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
        t += clamp(h * 0.7, 0.005, 0.3);
        if (res < 0.002 || t > 4.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }

    float ao(vec3 p, vec3 n) {
      float occ = 0.0, w = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = 0.03 * float(i);
        occ += w * (h - de(p + n * h));
        w *= 0.6;
      }
      return clamp(1.0 - 6.0 * occ, 0.0, 1.0);
    }

    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float aspect = uResolution.x / uResolution.y;
      uv.x *= aspect;
      float zoom = aspect < 1.0 ? 1.75 * aspect : 1.6;

      float H = 2.0;                                   // every word's set sits in |x| ≤ 2 (escape-tested)
      float R = 4.1 + 0.45 * cos(2.0 * uYaw);
      vec3 ro = vec3(cos(uYaw), 0.5 + 0.3 * sin(2.0 * uYaw), sin(uYaw)) * H * R;
      vec3 ta = vec3(0.0, 0.35, 0.0);           // aim a little above the centre so the set sits below the equation
      vec3 fw = normalize(ta - ro);
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      vec3 rd = normalize(fw * zoom + rt * uv.x + up * uv.y);

      vec3 sunDir = normalize(vec3(0.5, 0.75, 0.4));
      vec3 sky = mix(vec3(0.016, 0.013, 0.02), vec3(0.003, 0.004, 0.009), clamp(rd.y * 1.5 + 0.3, 0.0, 1.0));

      float t = 0.0, hit = -1.0, steps = 0.0;
      for (int i = 0; i < 170; i++) {
        float d = de(ro + rd * t);
        if (d < 0.0016 * t) { hit = t; break; }   // about a pixel: finer detail would only alias
        t += d * 0.55;
        steps += 1.0;
        if (t > H * 6.0) break;
      }

      vec3 col = sky;
      int k = int(uPalette + 0.5);
      if (hit > 0.0) {
        vec3 p = ro + rd * hit;
        de(p);
        float tb = sqrt(gTrapB), tm = sqrt(gTrapM);
        // Who owns this point: the formula whose orbit came closer to the origin.
        float own = smoothstep(-0.8, 0.4, log(tb / tm));       // 0 = Mandelbox, 1 = Menger
        float shade = clamp(min(tb, tm) * 0.6, 0.0, 1.0);
        vec3 cB, cM;
        if (k == 1) { cB = vec3(0.12, 0.42, 0.32); cM = vec3(0.85, 0.8, 0.68); }
        else if (k == 2) { cB = vec3(0.1, 0.1, 0.22); cM = vec3(0.08, 0.16, 0.2); }
        else { cB = vec3(0.72, 0.36, 0.17); cM = vec3(0.36, 0.48, 0.66); }
        vec3 base = mix(cB, cM, own) * (0.55 + 0.6 * shade);
        vec3 n = normalAt(p, 0.0005 * hit);
        float sh = softShadow(p + n * 0.002 * hit, sunDir);
        float occ = ao(p, n);
        float dif = max(dot(n, sunDir), 0.0);
        vec3 h = normalize(sunDir - rd);
        float spec = pow(max(dot(n, h), 0.0), 48.0) * sh;
        col = base * (vec3(1.15, 0.98, 0.82) * dif * sh + vec3(0.24, 0.28, 0.4) * (0.5 + 0.5 * n.y) * occ + 0.05 * occ);
        col += vec3(1.0, 0.88, 0.75) * spec * 0.35;
        if (k == 2) col += mix(vec3(1.0, 0.5, 0.2), vec3(0.3, 0.7, 1.0), own) * pow(1.0 - shade, 5.0) * 0.8 * occ;
        col = mix(col, sky, 1.0 - exp(-pow(hit / (H * 5.0), 2.0)));
      }
      col += vec3(0.85, 0.6, 0.4) * 0.06 * smoothstep(50.0, 170.0, steps) * (hit < 0.0 ? 1.0 : 0.3);

      col = aces(col * 1.45);
      col = pow(col, vec3(1.0 / 2.2));
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.45 * dot(q, q);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uYaw: { value: 0 }, uPalette: { value: 0 }, uBlend: { value: 0 },
      uMaskA: { value: 0 }, uLenA: { value: 1 }, uSA: { value: -2 },
      uMaskB: { value: 0 }, uLenB: { value: 1 }, uSB: { value: -2 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uYaw.value = m.yaw;
    u.uPalette.value = ctx.params.palette;
    u.uBlend.value = m.blend;
    u.uMaskA.value = m.a.mask; u.uLenA.value = m.a.len; u.uSA.value = m.a.s;
    u.uMaskB.value = m.b.mask; u.uLenB.value = m.b.len; u.uSB.value = m.b.s;
  },
};
