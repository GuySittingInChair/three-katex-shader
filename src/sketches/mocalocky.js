import { TAU } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Mocalocky: jelly blobs that hop to "neka, nooka, nocka".
//
// A cartoon, not a line fractal. Seven blobs stand on a floor and hop in time
// to a three-word chant at 112 bpm, two beats a word, then a beat of wobble:
//
//     ne-ka   two small hops      (one per beat)
//     noo-ka  one big, long hop   (over both beats; the "oo" is long)
//     noc-ka  two sharp hops      (higher, quicker landings)
//
// Each blob belongs to one word, so the hopping goes round the group.
//
// The physics is the cartoon kind, all closed-form in t:
//   • a hop is a parabola, y = 4A u(1 − u) for the hop's phase u;
//   • squash and stretch keeps the area: x scaled by (1 + s), y by 1/(1 + s),
//     squashed (s > 0) on landing and stretched (s < 0) in the air;
//   • the blobs are metaballs: F(p) = Σ r_i² / |q_i|², drawn where F > 1, so
//     neighbours melt together when they touch.
// They are cel-shaded (three flat bands of light, a white highlight and a thick
// outline where F crosses 1), and inside each blob is Kali Silk's fractal,
// p ↦ |p| / |p|^α − c, in the blob's own squashed coordinates, so the pattern
// squashes with it. Every "nocka" deals the fractal a new c.

const BPM = 112;
const BEAT = 60 / BPM;
const N = 7;
const FLOOR = -0.42;
const WORDS = ['neka', 'nooka', 'nocka', '(wobble)'];
const HUES = [0.0, 0.14, 0.3, 0.52, 0.66, 0.8, 0.92];
const RADII = [0.2, 0.16, 0.24, 0.18, 0.22, 0.15, 0.19];

// One hop over phase u ∈ [0, 1]: height (units of A) and squash.
function hop(u, sharp) {
  const y = 4 * u * (1 - u);
  const land = Math.min(u, 1 - u);
  const w = sharp ? 0.0025 : 0.005;
  const squash = 0.45 * Math.exp(-(land * land) / w);
  const stretch = 0.22 * Math.abs(1 - 2 * u) * (1 - Math.exp(-(land * land) / w)) * (y > 0.05 ? 1 : 0);
  return { y, s: squash - stretch };
}

export default {
  name: 'Mocalocky',
  description:
    'Seven cel-shaded jelly blobs hop to a "neka, nooka, nocka" chant at 112 bpm, squashing on every landing and ' +
    "melting together when they touch, with Kali's fractal squashing along inside them.",
  tags: ['cartoon', '2d', 'glsl', 'metaballs', 'squash and stretch', 'kaliset', 'rhythm', 'toon shading'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params = {}) {
    const beat = t / BEAT;
    const bar = Math.floor(beat / 8);
    const inBar = beat - bar * 8; // 0..8: neka 0–2, nooka 2–4, nocka 4–6, wobble 6–8
    const word = Math.min(3, Math.floor(inBar / 2));
    const bounce = params.bounce ?? 1;
    const blobs = [];
    for (let i = 0; i < N; i++) {
      const mine = i % 3;
      let y = 0;
      let s = 0;
      if (word === mine) {
        const local = inBar - 2 * mine; // 0..2
        if (mine === 1) {
          const h = hop(local / 2, false); // one long hop
          y = 0.42 * h.y; s = h.s;
        } else {
          const h = hop(local % 1, mine === 2);
          y = (mine === 2 ? 0.3 : 0.16) * h.y; s = h.s;
        }
      } else if (word === 3) {
        s = 0.12 * Math.sin(TAU * 2 * (inBar - 6) + i) * (1 - (inBar - 6) / 2); // jelly wobble
      }
      // standing in a loose row that sways
      const x = -1.2 + (2.4 * i) / (N - 1) + 0.06 * Math.sin(t * 0.37 + i * 1.7);
      blobs.push({ x, y: y * bounce, s: s * bounce, r: RADII[i] });
    }
    const seed = bar * 3 + (word >= 2 ? 1 : 0) + (word >= 3 ? 1 : 0);
    return {
      blobs,
      word,
      syllable: Math.floor(inBar) % 2,
      seed,
      hue: (t / 70) % 1,
      kc: [0.78 + 0.18 * Math.sin(seed * 2.1), 0.58 + 0.14 * Math.sin(seed * 3.7 + 1)],
      kalpha: 2.05 + 0.3 * Math.sin(seed * 1.3 + 2),
      beatPulse: Math.exp(-((beat % 1) * 6)),
      clock: t,
    };
  },

  latex: (params, hl, m) => {
    const w = WORDS[m.word];
    const said =
      m.word === 3 ? '\\text{(wobble)}' :
      m.syllable === 0 ? `\\textbf{${w.slice(0, -2)}}\\text{-${w.slice(-2)}}` : `\\text{${w.slice(0, -2)}-}\\textbf{${w.slice(-2)}}`;
    return (
      '\\begin{aligned}' +
      `& ${said} \\\\` +
      `y &= 4A\\,u(1-u),\\quad (x, y) \\mapsto \\big((1+s)\\,x,\\ \\tfrac{y}{1+s}\\big) \\\\` +
      `F(p) &= \\textstyle\\sum_i \\frac{r_i^2}{|q_i|^2} > 1,\\quad ${BPM}\\ \\text{bpm} \\\\` +
      `\\text{inside: } p &\\mapsto \\frac{|p|}{|p|^{${hl(m.kalpha, 2)}}} - (${hl(m.kc[0], 2)},\\ ${hl(m.kc[1], 2)}) \\\\` +
      `& ${caption(m.word === 2 && m.syllable === 1 ? 'new fractal (they asked)' : m.word === 3 ? 'jelly, settling' : 'hopping, in order')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    bounce: { value: 1, min: 0, max: 2, step: 0.05 },
    goo: { value: 1, min: 0.3, max: 2, step: 0.05 },
    pattern: { value: 1, min: 0, max: 2, step: 0.05 },
    outline: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec4 uB[${N}];          // x, y (centre), r, squash
    uniform float uBH[${N}];        // hue
    uniform vec2 uKC;
    uniform float uKAlpha;
    uniform float uHue;
    uniform float uPulse;
    uniform float uClock;
    uniform float uGoo;
    uniform float uPattern;
    uniform float uOutline;
    uniform float uSat;
    varying vec2 vUv;

    const float FLOOR = ${FLOOR.toFixed(3)};

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    vec3 candy(float t) { return mix(vec3(1.0), rainbow(t), 0.75); }

    // Metaball field; also the squashed local coordinate and hue of the blob
    // that dominates here (weighted by its share of the field).
    float field(vec2 p, out vec2 lp, out float hue) {
      float F = 0.0, wsum = 0.0;
      lp = vec2(0.0); vec2 hv = vec2(0.0);
      for (int i = 0; i < ${N}; i++) {
        vec4 b = uB[i];
        vec2 q = p - b.xy;
        q.x /= 1.0 + b.w;
        q.y *= 1.0 + b.w;
        float k = b.z * b.z / (dot(q, q) + 1e-4);
        k = pow(k, 2.0 / uGoo);                       // goo: how far the blobs reach for each other
        F += k;
        float w = k * k * k;
        wsum += w;
        lp += w * q / b.z;
        hv += w * vec2(cos(6.2831 * uBH[i]), sin(6.2831 * uBH[i]));
      }
      lp /= wsum;
      hue = atan(hv.y, hv.x) / 6.2831;
      return F;
    }

    vec3 kaliInk(vec2 p, float hue) {
      float best = 1e9, bestI = 0.0;
      for (int i = 0; i < 6; i++) {
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * uKAlpha) - uKC;
        float d = min(min(abs(p.x), abs(p.y)), abs(length(p) - 1.0)) * (1.0 + 1.6 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.05 / (best + 0.05);
      return rainbow(hue + 0.5 + 0.13 * bestI) * g * g;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      float halfW = uResolution.x / min(uResolution.x, uResolution.y);
      px *= max(1.0, 1.5 / halfW);                       // narrow screens: zoom out so the whole row fits
      vec2 p = (frag - 0.5 * uResolution) * px;
      float aa = 1.5 * px;

      // --- Background: wobbly stripes above, a checker floor below.
      vec3 col;
      if (p.y > FLOOR) {
        float s = fract((p.x + p.y) * 3.0 + 0.12 * sin(p.y * 5.0 + uClock * 1.3) - uClock * 0.25);
        float stripe = smoothstep(0.48, 0.52, s) - smoothstep(0.98, 1.0, s);
        col = mix(rainbow(uHue + 0.6) * 0.18 + 0.06, rainbow(uHue + 0.7) * 0.26 + 0.1, stripe);
        col *= 1.0 + 0.25 * uPulse * exp(-abs(p.y - FLOOR) * 2.0);       // the floor thumps on the beat
      } else {
        float depth = 0.25 / (FLOOR - p.y + 0.06);
        vec2 g = vec2(p.x * depth * 2.0, depth * 1.5 + uClock * 0.6);
        float chk = mod(floor(g.x) + floor(g.y), 2.0);
        col = mix(rainbow(uHue + 0.1) * 0.22 + 0.05, vec3(0.08, 0.06, 0.1), chk);
        col *= 0.55 + 0.45 * clamp((FLOOR - p.y) * 3.0, 0.0, 1.0);
        // shadows: smaller and fainter the higher the blob is
        for (int i = 0; i < ${N}; i++) {
          vec4 b = uB[i];
          float hgt = b.y - FLOOR - b.z / (1.0 + b.w);
          vec2 q = (p - vec2(b.x, FLOOR - 0.02)) / vec2(b.z * (1.0 + b.w) * (1.0 - 0.6 * hgt), 0.035);
          col *= 1.0 - 0.6 * (1.0 - 1.2 * hgt) * smoothstep(1.0, 0.6, length(q));
        }
      }
      // horizon line
      col = mix(col, vec3(0.02), (1.0 - smoothstep(0.0, aa * 2.0, abs(p.y - FLOOR))) * uOutline);

      // --- The blobs.
      vec2 lp; float hue;
      float F = field(p, lp, hue);
      vec2 lpx, lpy; float hx, hy;
      float Fx = field(p + vec2(px, 0.0), lpx, hx);
      float Fy = field(p + vec2(0.0, px), lpy, hy);
      vec2 grad = vec2(Fx - F, Fy - F) / px;
      // f = F^(-goo/4) is |q|/r for a lone blob, so (f − 1)/|∇f| is a true distance to the edge (< 0 inside)
      float e = -0.25 * uGoo;
      float f = pow(F, e);
      vec2 gf = vec2(pow(Fx, e) - f, pow(Fy, e) - f) / px;
      float d = (f - 1.0) / max(length(gf), 2.5);          // (the floor stops specks at the necks, where ∇f → 0)

      if (d < 0.03 * uOutline + aa) {
        // fake height: flat in the middle, falling to the edge, so the shading is round
        float h = sqrt(clamp(1.0 - 1.0 / max(F, 1.0), 0.0, 1.0));
        vec3 n = normalize(vec3(-grad / max(F * F, 1.0) * 0.5, h + 0.15));
        vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
        float diff = dot(n, L);
        float band = diff > 0.6 ? 1.0 : diff > 0.15 ? 0.72 : 0.48;      // three flat bands of light
        vec3 base = candy(hue + uHue * 0.3) * band;
        vec3 ink = kaliInk(lp * 1.3 + vec2(0.0, 0.15), hue + uHue) * uPattern;
        vec3 body = base * (0.7 + 0.3 * band) + ink * band * 0.9;
        float spec = smoothstep(0.93, 0.95, dot(n, normalize(L + vec3(0.0, 0.0, 1.0))));
        body = mix(body, vec3(1.0), spec * 0.85);
        float inside = 1.0 - smoothstep(-aa, aa, d);
        float edge = uOutline > 0.0 ? smoothstep(-0.028 * uOutline - aa, -0.028 * uOutline, d) : 0.0;
        col = mix(col, body, inside);
        col = mix(col, vec3(0.02, 0.01, 0.03), max(edge, 0.0) * (1.0 - smoothstep(0.0, aa, d)) * step(0.01, uOutline));
      }

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.35 * dot(v, v);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  uniforms() {
    return {
      uB: { value: new Float32Array(4 * N) },
      uBH: { value: new Float32Array(HUES) },
      uKC: { value: [0.8, 0.6] },
      uKAlpha: { value: 2 },
      uHue: { value: 0 },
      uPulse: { value: 0 },
      uClock: { value: 0 },
      uGoo: { value: 1 },
      uPattern: { value: 1 },
      uOutline: { value: 1 },
      uSat: { value: 1 },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    m.blobs.forEach((b, i) => {
      // centre: standing on the floor (squashed height), plus the hop
      u.uB.value.set([b.x, FLOOR + b.r / (1 + b.s) + b.y, b.r, b.s], 4 * i);
    });
    u.uKC.value = m.kc;
    u.uKAlpha.value = m.kalpha;
    u.uHue.value = m.hue;
    u.uPulse.value = m.beatPulse;
    u.uClock.value = m.clock;
    u.uGoo.value = ctx.params.goo;
    u.uPattern.value = ctx.params.pattern;
    u.uOutline.value = ctx.params.outline;
    u.uSat.value = ctx.params.saturation;
  },
};
