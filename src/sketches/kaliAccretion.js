import * as THREE from 'three';
import { TAU, smooth } from '../lib/motion.js';

// Kali Accretion: Kali Pearls (same base, ring finder, flow and lens), but the
// pearls fall together under gravity and merge when they touch.
//
// Each pearl is a disc of mass m ∝ R². It is pulled toward the centre of the
// screen with a softened pull of nearly constant strength g (`gravity`), and
// toward every other pearl with a ∝ m_j / (r² + ε²) (`attract`), and loses a
// little speed to drag (`drag`). A new pearl is launched sideways (`drift`), so
// it falls into a decaying orbit and spirals in.
//
// Only small rings are caught (r ≤ 0.19); pearls grow by merging, up to R = 0.5.
// When two pearls touch they merge into one, keeping mass and momentum:
//   R = √(R_a² + R_b²),   c = (m_a c_a + m_b c_b) / m,   v = (m_a v_a + m_b v_b) / m,
// and angular momentum: with I = ½ m R² and L the orbital angular momentum of
// the pair about c, the new spin is ω = (I_a ω_a + I_b ω_b + L) / I. So a
// glancing hit sets the merged pearl turning.
//
// What the pearls were is kept. On a merge both pictures (each as it was shown,
// spin and inner swirl included) are copied into one new snapshot, each point
// taken from whichever pearl it is nearer to in its own radii, so the merged pearl
// is a mosaic of everything it has swallowed. It starts stretched along the
// line of impact, as long as the pair was, and wobbles round.
//
// And it turns inside differently from its rim. Besides the rigid spin ω, each
// pearl has an inner swirl Ω: the core turns by ∫Ω more than the rim, the
// snapshot at radius r being rotated by φ(r) = ∫ω + (1 − r²)² ∫Ω. A merge stirs
// it: Ω = mass-averaged Ω of the parts + churn · (L / I + ω̄ − (I_a ω_a + I_b ω_b) / I):
// the hit itself, plus the spin the parts brought in that the bigger whole
// dilutes, so what was inside the swallowed pearls goes on whirling in the core.
// Viscosity damps Ω over `viscosity` seconds and the swirl freezes into a spiral.
// The ink around a pearl winds at `swirl` plus 0.4 ω, dragged round by its spin.
//
// Below is the Kali Ink description (base 1), unchanged.
//
// Kali Ink: Kali Scribble drawn by a nervous hand on breathing paper, in ink that bleeds.
//
// The step is Kali's p ↦ |R_i p + s_i| / |p|^α − c with a random turn R_i and
// an off-centre mirror shift s_i for every step i (as in Kali Tangle), but all
// of the random numbers come from a seed, and every `reseed` seconds the seed
// moves on. So the picture is never the same family twice: it is re-dealt, not
// just drifted.
//
// Each random number follows a Catmull-Rom curve through its values for seeds
// k−1, k, k+1, k+2, so it moves on with no jumps and no stops. How the deal
// behaves depends on the period T, so that a fast reseed still looks continuous:
//   • blend: each re-deal takes `blend` seconds (its own setting); the picture
//     holds still for the rest of the period, and when blend ≥ T it never
//     holds, it just keeps flowing;
//   • step size: under 6 s each deal moves only T/6 of a full re-deal, on top
//     of a slow deal every 9 s, so the picture changes at the same rate however
//     fast the reseed: a short T just makes the motion wigglier, not faster;
//   • flow: the pen breaks and the line directions move sqrt(6/T) times
//     faster (up to 5×), so everything keeps pace.
//
// The strokes are ink, not glow:
//   • the distance to each step's trap line is jittered by 3-octave noise,
//     d ↦ |d + j (1 + 0.15 i)(fbm(18 p) − ½)|: jagged, scratchy edges rather
//     than a smooth wobble, and shakier the deeper the step (the hand tires on
//     the fine detail);
//   • ink bleed: each colour channel gets its own small noise offset on that
//     distance, so the dye separates at the edges of a stroke like fountain-pen
//     ink in paper fibres;
//   • a second, coarser noise lifts the pen: a stroke only shows where
//     n(4 p + …) > ½, so lines break into dashes and scraps;
//   • each stroke gets its own random hue from the seed (not a steady
//     progression), so neighbouring strokes clash.
// And the paper: a slow, low-frequency warp under everything (it breathes),
// and a sub-pixel shudder re-hashed 12 times a second (line boil, as in
// hand-drawn animation, where every frame is traced again).
//
// Then the whole drawing is filmed through a cheap, dirty lens (all of it
// unnecessary). The brightest strokes, the jets, are picked out (B, a soft
// threshold on the picture) and everything optical is made from B:
//   • bloom with warm halation (B blurred at 1/2, 1/4, 1/8 size);
//   • glints: sparse points on the jets that twinkle, each with the six
//     diffraction spikes of a hexagonal iris, every spike running through the
//     spectrum toward its tip (a longer wavelength diffracts further);
//   • an anamorphic streak: B smeared far sideways, tinted blue;
//   • god rays: B smeared toward the screen centre, decaying as it goes;
//   • ghosts: reflections between lens elements land at c + κ(c − z) through
//     the centre c, so B is sampled at κ = −0.55, 0.4, … with a slightly
//     different κ per channel (dispersion), plus a rainbow halo ring;
//   • lens dirt: hexagonal bokeh specks and smudges, lit only by bloom and
//     ghosts, like grease on the front glass;
//   • lateral chromatic aberration: red and blue land a little apart, more so
//     toward the edge.
// All of it is added as light, out = 1 − (1 − I)e^(−L), which never blows
// out to white and leaves the picture exactly as it was when L = 0.

const LENS_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// The jets: only the brightest strokes, kept in colour.
const BRIGHT_FRAG = `
  uniform sampler2D tSrc;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, l) * (l - 0.5 * uThreshold), 1.0);
  }
`;

// The ring score, at a low resolution. tSrc is the picture blurred at 1/4, so a
// thin stroke is a few samples wide. Out: r = best score, g = which radius.
const SCAN_FRAG = `
  uniform sampler2D tSrc;
  uniform vec2 uZ2Uv;           // z (short side = 2) → uv offset
  uniform vec2 uUv2Z;
  varying vec2 vUv;
  float L(vec2 z) { vec3 c = texture2D(tSrc, 0.5 + z * uZ2Uv).rgb; return max(c.r, max(c.g, c.b)); }
  void main() {
    vec2 c = (vUv - 0.5) * uUv2Z;
    float best = 0.0, bestJ = 0.0;
    for (int j = 0; j < 4; j++) {           // small rings only (up to 0.19): the pearls grow by merging
      float r = 0.07 * pow(1.4, float(j));
      float b[24];
      float s = 0.0, sin_ = 0.0, sout = 0.0;
      for (int k = 0; k < 24; k++) {
        float a = 6.2831853 * float(k) / 24.0;
        vec2 e = vec2(cos(a), sin(a)) * r;
        float v = max(max(L(c + e * 0.88), L(c + e * 0.94)), max(L(c + e), max(L(c + e * 1.06), L(c + e * 1.12))));
        b[k] = v;
        s += v;
        sin_ += L(c + e * 0.5);
        sout += L(c + e * 1.5);
      }
      float mu = s / 24.0;
      float bg = max(sin_, 0.5 * (sin_ + sout)) / 24.0;   // the middle must be dark; busy surroundings count half
      // closed: the share of the circle that is clearly ink, not a gap
      float closed = 0.0;
      for (int k = 0; k < 24; k++) closed += step(bg + 0.4 * (mu - bg), b[k]);
      float sc = smoothstep(0.02, 0.08, mu - bg) * smoothstep(1.1, 1.7, mu / max(bg, 1e-3)) * pow(closed / 24.0, 2.0);
      if (sc > best) { best = sc; bestJ = float(j); }
    }
    gl_FragColor = vec4(best, bestJ / 5.0, 0.0, 1.0);
  }
`;

// Copies the disc |z − c| < R of the picture into one 256² slot of the atlas.
const CAPTURE_FRAG = `
  uniform sampler2D tSrc;
  uniform vec2 uZ2Uv;
  uniform vec3 uDisc;           // c, R
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tSrc, 0.5 + (uDisc.xy + (vUv * 2.0 - 1.0) * uDisc.z) * uZ2Uv).rgb, 1.0); }
`;

// Merges two pearls into one atlas slot. d is the new pearl's own coordinate;
// it was stretched by 1 + E along the line of impact n when it was made, so the
// point it shows is p = d + E n (n·d) (in new radii, from the new centre). Each
// point is taken from whichever old pearl is nearer, in that pearl's own radii,
// shown as it was (spin and inner swirl), and a point outside both is folded back
// in through the nearer rim.
const MERGE_FRAG = `
  uniform sampler2D uAtlas;
  uniform vec2 uN;
  uniform float uE;
  uniform vec4 uA;              // the two pearls: centre and radius (in new radii, from the new centre), slot
  uniform vec4 uB;
  uniform vec2 uSA;             // their spin and inner swirl
  uniform vec2 uSB;
  varying vec2 vUv;
  vec3 snapAt(float slot, vec2 sv, vec2 d) {
    float a = sv.x + sv.y * pow(max(0.0, 1.0 - dot(d, d)), 2.0);
    float c = cos(a), s = sin(a);
    d = mat2(c, -s, s, c) * d;
    return texture2D(uAtlas, vec2((slot + 0.5 + 0.49 * d.x) / 8.0, 0.5 + 0.49 * d.y)).rgb;
  }
  vec2 fold(vec2 u) { float r = length(u); return r > 1.0 ? u * max(0.0, 2.0 - r) / r : u; }
  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    vec2 p = d + uE * uN * dot(uN, d);
    vec2 ua = (p - uA.xy) / uA.z, ub = (p - uB.xy) / uB.z;
    float t = smoothstep(-0.06, 0.06, length(ua) - length(ub));
    vec3 col = mix(snapAt(uA.w, uSA, fold(ua)), snapAt(uB.w, uSB, fold(ub)), t);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const COPY_FRAG = `
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }
`;

// 9-tap Gaussian along one direction, using linear filtering (5 fetches).
const BLUR_FRAG = `
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
    c += texture2D(tSrc, vUv + uStep * 1.3846154).rgb * 0.3162162;
    c += texture2D(tSrc, vUv - uStep * 1.3846154).rgb * 0.3162162;
    c += texture2D(tSrc, vUv + uStep * 3.2307692).rgb * 0.0702703;
    c += texture2D(tSrc, vUv - uStep * 3.2307692).rgb * 0.0702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Streak and rays, at a quarter of the size. Lengths are in units of
// the screen's short side (uShort turns them into uv), so they look the same
// at any size; each pixel starts its smear at a random fraction of a step,
// which turns banding into fine noise.
const FLARE_FRAG = `
  uniform sampler2D tSoft;      // B blurred at 1/4 size
  uniform vec2 uShort;
  uniform float uStreak;
  uniform float uRays;
  varying vec2 vUv;
  vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float j0 = hash(gl_FragCoord.xy);
    vec3 col = vec3(0.0);

    if (uStreak > 0.0) {
      vec3 s = vec3(0.0);
      vec2 dir = vec2(uShort.x * (1.1 / 48.0), 0.0);
      for (int j = 0; j < 48; j++) {
        float t = (float(j) + j0) / 48.0;
        vec2 o = dir * (float(j) + j0 + 0.5);
        s += exp(-3.5 * t) * (texture2D(tSoft, vUv + o).rgb + texture2D(tSoft, vUv - o).rgb);
      }
      float l = dot(s, vec3(0.3, 0.5, 0.2));
      col += uStreak * mix(vec3(l), s, 0.25) * vec3(0.35, 0.6, 1.0) * 0.07;
    }

    if (uRays > 0.0) {
      vec3 s = vec3(0.0);
      vec2 d = (vUv - 0.5) * (0.7 / 40.0);
      vec2 q = vUv - d * j0;
      float decay = 1.0;
      for (int j = 0; j < 40; j++) {
        q -= d;
        s += decay * texture2D(tSoft, q).rgb;
        decay *= 0.94;
      }
      col += uRays * s * 0.035;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tB1;
  uniform sampler2D tB2;
  uniform sampler2D tB3;
  uniform sampler2D tFlare;
  uniform vec2 uResolution;
  uniform float uOptics;
  uniform float uBloom;
  uniform float uGhosts;
  uniform float uDirt;
  uniform float uAberration;
  uniform float uSpikes;
  uniform float uClock;
  varying vec2 vUv;
  vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float hex(vec2 p) { p = abs(p); return max(p.x * 0.866 + p.y * 0.5, p.y); }
  // Grease on the front glass: hexagonal bokeh specks (bright rims) and smudges.
  float dirt(vec2 z) {
    float d = 0.0;
    for (int l = 0; l < 2; l++) {
      float sc = l == 0 ? 7.0 : 13.0;
      vec2 g = z * sc + float(l) * 17.3;
      vec2 id = floor(g), f = fract(g) - 0.5;
      float on = step(0.55, hash(id + 3.1));
      vec2 c = (vec2(hash(id), hash(id + 9.7)) - 0.5) * 0.5;
      float r = 0.18 + 0.2 * hash(id + 5.3);
      float h = hex(f - c) / r;
      d += on * (1.0 - smoothstep(0.85, 1.0, h)) * (0.35 + 0.65 * smoothstep(0.6, 0.97, h)) * (l == 0 ? 1.0 : 0.6);
    }
    float smear = noise(z * vec2(3.0, 9.0) + 2.0) * noise(z * 1.7 - 4.0);
    return d * 0.8 + smoothstep(0.25, 0.7, smear) * 0.7;
  }
  // Glints: sparse points on the jets, each with the six-spike pattern of a
  // hexagonal iris. A spike runs white, then through the spectrum toward its tip
  // (longer wavelengths diffract further). z is in short-side units.
  vec3 glints(vec2 z, float aspect) {
    const float CELL = 0.085;
    vec2 g = z / CELL;
    vec2 id0 = floor(g);
    vec3 acc = vec3(0.0);
    float ang = 0.35 + 0.015 * uClock;
    vec2 d0 = vec2(cos(ang), sin(ang)), d1 = vec2(cos(ang + 1.0472), sin(ang + 1.0472)), d2 = vec2(cos(ang + 2.0944), sin(ang + 2.0944));
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec2 id = id0 + vec2(float(i), float(j));
        float h = hash(id + 0.37);
        if (h > 0.6) continue;
        vec2 sp = (id + 0.15 + 0.7 * vec2(hash(id + 1.3), hash(id + 7.1))) * CELL;
        vec3 src = texture2D(tB2, vec2(sp.x / aspect, sp.y)).rgb;
        float lum = max(src.r, max(src.g, src.b));
        if (lum < 0.01) continue;
        float tw = 0.55 + 0.45 * sin(uClock * (1.5 + 2.5 * hash(id + 4.4)) + 6.2831 * h);
        float len = 0.09 + 0.16 * hash(id + 2.9);
        vec2 p = z - sp;
        float star = 0.0;
        vec3 col = vec3(0.0);
        for (int k = 0; k < 3; k++) {
          vec2 d = k == 0 ? d0 : k == 1 ? d1 : d2;
          float a = abs(dot(p, d)) / len, q = abs(dot(p, vec2(-d.y, d.x)));
          float s = exp(-q / (0.0016 + 0.006 * a)) * exp(-3.0 * a) * (1.0 - smoothstep(0.7, 1.0, a));
          col += s * mix(vec3(1.0), rainbow(0.85 * a + 0.05), smoothstep(0.08, 0.5, a));
        }
        col += exp(-length(p) / 0.009) * 1.5;            // the core
        acc += col * normalize(src + 0.15) * min(lum * 14.0, 3.0) * tw;
      }
    }
    return acc;
  }
  void main() {
    vec2 c = vUv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    vec2 ca = c * (0.004 + 0.03 * dot(c, c)) * uAberration * uOptics;
    vec3 scene = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
    if (uOptics <= 0.0) { gl_FragColor = vec4(scene, 1.0); return; }

    vec3 b1 = texture2D(tB1, vUv).rgb, b2 = texture2D(tB2, vUv).rgb, b3 = texture2D(tB3, vUv).rgb;
    vec3 bloom = b1 * 0.45 + b2 * 0.35 + b3 * 0.3;
    bloom += b3 * vec3(0.3, 0.07, 0.02);                              // red halation

    // ghosts at c + κ(c − z), each channel with its own κ
    vec3 ghosts = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float k = i == 0 ? -0.55 : i == 1 ? 0.4 : i == 2 ? 1.25 : i == 3 ? -1.4 : 0.75;
      vec3 g;
      for (int ch = 0; ch < 3; ch++) {
        vec2 q = 0.5 - c * k * (1.0 + 0.035 * float(ch - 1));
        float fall = pow(clamp(1.0 - length(q - 0.5) / 0.75, 0.0, 1.0), 3.0);
        g[ch] = texture2D(tB2, q)[ch] * fall;
      }
      ghosts += g * mix(vec3(1.0), rainbow(0.21 * fi + 0.55), 0.7) * (i == 2 ? 1.6 : 0.9);
    }
    // the halo: a ring at a fixed radius from the centre, split into a rainbow
    vec2 ca2 = vec2(c.x * aspect, c.y);
    vec2 hv = length(ca2) > 1e-4 ? normalize(ca2) : vec2(0.0, 1.0);
    vec3 halo;
    for (int ch = 0; ch < 3; ch++) {
      vec2 q = vUv + vec2(hv.x / aspect, hv.y) * 0.36 * (1.0 + 0.06 * float(ch - 1));
      halo[ch] = texture2D(tB3, q)[ch];
    }
    halo *= smoothstep(0.1, 0.45, length(ca2)) * 1.6;

    vec3 flare = texture2D(tFlare, vUv).rgb;
    vec3 L = uBloom * bloom * 0.9 + flare + uGhosts * (ghosts * 0.8 + halo);
    if (uSpikes > 0.0) L += uSpikes * glints(vec2(vUv.x * aspect, vUv.y), aspect);
    L += uDirt * dirt(vec2(vUv.x * aspect, vUv.y)) * (b3 * 2.5 + ghosts * 0.6 + flare * 0.5);
    L *= uOptics;
    gl_FragColor = vec4(1.0 - (1.0 - clamp(scene, 0.0, 1.0)) * exp(-L), 1.0);
  }
`;

const PHI = (1 + Math.sqrt(5)) / 2;
const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const W = TAU / 61;

// The fractal underneath, each as in its own sketch (same step, traps, colours
// and drift clocks): pick it with `base`.
const BASES = ['Kali Tangle', 'Kali Ink', 'Kali Drift', 'Kali Silk'];
const baseMotion = [
  (t) => { // Kali Tangle
    const w = TAU / 53, s = (k, ph = 0) => Math.sin(w * k * t + ph);
    return {
      cx: 0.78 + 0.22 * s(1, 0.4) + 0.08 * s(R3, 1.1),
      cy: 0.6 + 0.16 * s(PHI, 2.3) + 0.06 * s(R2 * PHI, 0.9),
      alpha: 2.05 + 0.4 * s(R2, 1.7) + 0.12 * s(PHI * R3, 0.2),
      theta: 0.8 * s(1 / PHI, 0.6),
      zoom: Math.exp(0.4 + 0.45 * s(1 / R3, 2.0)),
      hue: ((t * w * 0.7) / TAU) % 1,
    };
  },
  (t) => { // Kali Ink
    const s = (k, ph = 0) => Math.sin(W * k * t + ph);
    return {
      cx: 0.8 + 0.2 * s(1, 2.7) + 0.07 * s(R3, 1.5),
      cy: 0.6 + 0.15 * s(PHI, 0.1) + 0.06 * s(R2 * PHI, 1.8),
      alpha: 2.05 + 0.35 * s(R2, 0.4) + 0.1 * s(PHI * R3, 2.6),
      theta: 0.6 * s(1 / PHI, 0.9),
      zoom: Math.exp(0.4 + 0.35 * s(1 / R3, 1.2)),
      hue: 0,
    };
  },
  (t) => { // Kali Drift
    const w = TAU / 47, s = (k, ph = 0) => Math.sin(w * k * t + ph);
    return {
      cx: 0.8 + 0.28 * s(1) + 0.1 * s(R3, 2.1),
      cy: 0.62 + 0.18 * s(PHI, 1.3) + 0.08 * s(R2 * PHI, 0.4),
      alpha: 2.15 + 0.5 * s(R2, 0.7) + 0.15 * s(PHI * R3, 2.9),
      theta: 0.6 * s(1 / PHI, 2.6) + 0.25 * s(R3 / PHI, 1.1),
      zoom: Math.exp(0.35 + 0.6 * s(1 / R3, 4.0) + 0.15 * s(R2 * R3, 0.9)),
      hue: ((t * w * 0.6) / TAU) % 1,
    };
  },
  (t) => { // Kali Silk
    const w = TAU / 59, s = (k, ph = 0) => Math.sin(w * k * t + ph);
    return {
      cx: 0.8 + 0.2 * s(1, 1.9) + 0.07 * s(R3, 0.3),
      cy: 0.6 + 0.14 * s(PHI, 0.5) + 0.06 * s(R2 * PHI, 2.2),
      alpha: 2.1 + 0.3 * s(R2, 2.4) + 0.1 * s(PHI * R3, 1.4),
      theta: 0.7 * s(1 / PHI, 1.6),
      zoom: Math.exp(0.35 + 0.4 * s(1 / R3, 0.8)),
      hue: ((t * w * 0.8) / TAU) % 1,
    };
  },
];

// How each base maps the screen into its fractal's plane, p = zoom·R_{−θ}(z + pan)
// (as its shader does it), so a pearl can ride along.
const baseFrame = (m) => {
  const t = m.clock;
  const pan =
    m.base === 0 ? [0.35 * Math.sin(t * 0.031), 0.35 * Math.cos(t * 0.023 + 1)]
    : m.base === 1 ? [0.3 * Math.sin(t * 0.027), 0.3 * Math.cos(t * 0.033 + 2)]
    : [0, 0];
  return { th: m.theta, zoom: m.zoom, pan };
};

const kaliLine = (num, m, hl) =>
  `p &\\mapsto \\frac{${num}}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\`;
const baseLatex = [
  (params, hl, m) =>
    kaliLine('|R_{a_i} p + s_i|', m, hl) +
    `a_i(t) &= ${hl(params.chaos, 2)}\\,\\big(2\\pi\\,h(i) + \\omega_i t\\big),\\quad d_i = \\min\\big(|p_i\\cdot n_{b_i} - o_i|,\\ \\big||p_i - q_i| - \\rho_i\\big|\\big)\\,(1 + 0.7\\,i) \\\\` +
    '\\text{colour} &= \\textstyle\\sum_i \\text{rainbow}(h_i)\\,\\Big(\\frac{w}{d_i + w}\\Big)^2 e^{-0.12 i} \\\\',
  (params, hl, m) =>
    kaliLine('|R_{a_i} p + s_i|', m, hl) +
    `(a_i, s_i, h_i) &= \\text{CR}\\big(\\text{rand}_{${m.k}-1\\,..\\,${m.k}+2}(i),\\ u = ${hl(m.u, 2)}\\big)\\ \\text{step } ${hl(m.amp, 2)} \\\\` +
    `d_i &= \\big|\\,p_i\\cdot n_i - o_i + ${hl(params.jitter, 2)}\\,(1 + 0.15\\,i)\\,(\\text{fbm}_3(18p_i) - \\tfrac12) + \\beta_{rgb}\\big| \\\\` +
    '\\text{ink} &= \\textstyle\\sum_i \\text{rainbow}(h_i)\\,\\Big(\\frac{w}{d_i(1+0.6i) + w}\\Big)^2\\,[\\text{noise}(4p_i) > \\tfrac12] \\\\',
  (params, hl, m) =>
    kaliLine('|p|', m, hl) +
    `d &= \\min_i\\ \\min\\big(|x_i|,\\ |y_i|,\\ \\big||p_i| - 1\\big|\\big)\\,(1 + 0.8\\,i),\\quad \\text{hue} = ${hl(m.hue, 2)} + 0.14\\,i^* \\\\`,
  (params, hl, m) =>
    `p &\\mapsto \\frac{|p|}{|p|^{\\alpha(z)}} - c(z),\\quad c(z) = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) + ${hl(params.warp, 2)}\\,\\big(n(z) - \\tfrac12\\big) \\\\` +
    `\\alpha(z) &= ${hl(m.alpha, 2)} + 1.5\\cdot${hl(params.warp, 2)}\\,\\big(n_1(z) - n_2(z)\\big),\\quad \\text{glow} = \\textstyle\\sum_i \\Big(\\frac{w}{|p_i \\cdot u_i|(1+0.6i) + w}\\Big)^2 \\\\`,
];

export default {
  name: 'Kali Accretion',
  description:
    'Kali Pearls under gravity: the frozen rings fall toward the centre and toward each other, and merge when they touch, keeping ' +
    'mass, momentum and angular momentum. The merged pearl is a mosaic of what it swallowed, and its core whirls on with the ' +
    'spin the parts brought in (φ(r) = ∫ω + (1 − r²)²∫Ω) until viscosity freezes it into a spiral.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'fbm', 'orbit trap', 'random', 'flow', 'circle detection', 'gravity', 'physics', 'angular momentum'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params = {}) {
    const base = Math.min(BASES.length - 1, Math.max(0, Math.round(params.base ?? 0)));
    const period = params.reseed ?? 9;
    const x = t / period;
    const k = Math.floor(x);
    const blend = params.blend ?? 2.25;
    const hold = Math.min(0.98, Math.max(0, 1 - blend / period)); // the part of each period spent holding still
    const lin = Math.min(1, Math.max(0, (x - k - hold) / (1 - hold)));
    const u = lin + (smooth(lin) - lin) * Math.min(1, hold / 0.3); // eased while holding, linear (C¹ with Catmull-Rom) when not
    const seeds = (j) => [j - 1, j, j + 1, j + 2].map((v) => ((v % 997) + 997) % 997);
    const ks = Math.floor(t / 9);
    return {
      ...baseMotion[base](t),
      base,
      k: k % 997,
      seeds: seeds(k),
      u,
      slowSeeds: seeds(ks),
      slowU: t / 9 - ks,
      amp: Math.min(1, Math.max(0.01, period / 6)),
      flow: Math.min(5, Math.max(1, Math.sqrt(6 / period))),
      clock: t,
    };
  },

  latex: (params, hl, m) =>
    '\\begin{aligned}' +
    baseLatex[m.base](params, hl, m) +
    `\\text{pearl} &\\Leftarrow \\big[S(\\mu - b)\\,S(\\mu / b)\\,f^2 \\ge ${hl(params.roundness, 2)}\\big],\\ \\ |z' - c_k|^2 = |z - c_k|^2 - R_k^2,\\ \\ \\arg \\mathrel{+}= ${hl(params.swirl, 2)}\\,a_k\\tfrac{R_k^2}{|z - c_k|^2} \\\\` +
    `R_k &= R_{k,0}\\,\\big(1 - \\text{smooth}\\tfrac{a_k - ${hl(params.hold, 1)}}{${hl(params.vanish, 1)}}\\big),\\quad c_k(t) = R_{\\theta} P_k / \\text{zoom} - \\text{pan}(t)\\ \\ (\\text{ride } ${hl(params.ride, 2)}) \\\\` +
    `\\ddot c_k &= -${hl(params.gravity, 2)}\\,\\frac{c_k}{\\sqrt{|c_k|^2 + 0.04}} + ${hl(params.attract, 2)}\\textstyle\\sum_j m_j \\frac{c_j - c_k}{(|c_j - c_k|^2 + 0.01)^{3/2}} - ${hl(params.drag, 2)}\\,\\dot c_k,\\quad m \\propto R^2,\\quad |\\dot c_0| = ${hl(params.drift, 2)} \\\\` +
    `R &= \\sqrt{R_a^2 + R_b^2},\\ \\ \\omega = \\frac{I_a\\omega_a + I_b\\omega_b + L}{I},\\ \\ \\Omega = \\bar\\Omega + ${hl(params.churn, 2)}\\big(\\tfrac{L}{I} + \\bar\\omega - \\tfrac{I_a\\omega_a + I_b\\omega_b}{I}\\big),\\ \\ \\dot\\Omega = -\\tfrac{\\Omega}{${hl(params.viscosity, 1)}},\\ \\ \\phi(r) = \\textstyle\\int\\omega + (1 - r^2)^2\\!\\int\\Omega \\\\` +
    `\\text{ink} &\\mathrel{+}= ${hl(params.contact, 2)}\\,\\text{edge}_k\\,\\big[1 < \\tfrac{|z - c_k|}{R_k} < 1.7\\big],\\quad \\text{inside} = \\text{snap}_k \\vee ${hl(params.glass, 2)}\\,\\text{ink}\\big(c_k + d(0.55 + 0.25|d/R_k|^2)\\big) \\\\` +
    `\\text{out} &= 1 - (1 - I)\\,e^{-L},\\ \\ L = ${hl(params.optics, 2)}\\big(${hl(params.bloom, 2)}\\,G\\!*\\!B + ${hl(params.spikes, 2)}\\,\\text{PSF}_{6}\\!*\\!B + ${hl(params.streak, 2)}\\,S_x\\!*\\!B + ${hl(params.ghosts, 2)}\\textstyle\\sum_k B\\big(c + \\kappa_k(c - z)\\big) + \\dots\\big)` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    base: { value: 0, min: 0, max: BASES.length - 1, step: 1, options: BASES },
    chaos: { value: 0.6, min: 0, max: 1, step: 0.01 },
    warp: { value: 0.35, min: 0, max: 1, step: 0.01 },
    reseed: { value: 9, min: 0.1, max: 300, step: 0.05 },
    blend: { value: 2.25, min: 0.05, max: 60, step: 0.05 },
    jitter: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    bleed: { value: 1, min: 0, max: 3, step: 0.05 },
    shudder: { value: 1, min: 0, max: 4, step: 0.05 },
    breathe: { value: 1, min: 0, max: 3, step: 0.05 },
    breaks: { value: 0.5, min: 0, max: 1, step: 0.01 },
    roundness: { value: 0.45, min: 0.3, max: 0.98, step: 0.01 },
    hold: { value: 14, min: 0, max: 60, step: 0.5 },
    vanish: { value: 4, min: 0.2, max: 30, step: 0.1 },
    swirl: { value: 0.25, min: 0, max: 1.5, step: 0.01 },
    pearls: { value: 6, min: 0, max: 6, step: 1 },
    contact: { value: 1, min: 0, max: 3, step: 0.05 },
    glass: { value: 0.35, min: 0, max: 1, step: 0.01 },
    ride: { value: 0.3, min: 0, max: 1, step: 0.01 },
    drift: { value: 0.4, min: 0, max: 1, step: 0.01 },
    gravity: { value: 0.25, min: 0, max: 1.5, step: 0.01 },
    attract: { value: 0.1, min: 0, max: 1, step: 0.01 },
    drag: { value: 0.15, min: 0, max: 2, step: 0.01 },
    churn: { value: 3, min: 0, max: 5, step: 0.05 },
    viscosity: { value: 8, min: 0.2, max: 60, step: 0.1 },
    iterations: { value: 12, min: 4, max: 20, step: 1 },
    glow: { value: 1, min: 0, max: 2.5, step: 0.05 },
    saturation: { value: 1, min: 0, max: 1.5, step: 0.05 },
    optics: { value: 1, min: 0, max: 2, step: 0.05 },
    bloom: { value: 1, min: 0, max: 2.5, step: 0.05 },
    spikes: { value: 1, min: 0, max: 3, step: 0.05 },
    streak: { value: 1, min: 0, max: 3, step: 0.05 },
    rays: { value: 0.7, min: 0, max: 3, step: 0.05 },
    ghosts: { value: 1, min: 0, max: 3, step: 0.05 },
    dirt: { value: 0.7, min: 0, max: 3, step: 0.05 },
    aberration: { value: 1, min: 0, max: 4, step: 0.05 },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform vec2 uC;
    uniform float uAlpha;
    uniform float uTheta;
    uniform float uZoom;
    uniform vec4 uS;              // seeds k−1 .. k+2
    uniform float uU;
    uniform vec4 uSlowS;          // the slow (9 s) deal
    uniform float uSlowU;
    uniform float uAmp;
    uniform float uFlow;
    uniform float uClock;
    uniform float uJitter;
    uniform float uBleed;
    uniform float uShudder;
    uniform float uBreathe;
    uniform float uBreaks;
    uniform float uIterations;
    uniform float uGlow;
    uniform float uSat;
    uniform float uBase;          // 0 Tangle, 1 Ink, 2 Drift, 3 Silk
    uniform float uHue;
    uniform float uChaos;
    uniform float uWarp;
    uniform vec4 uP[6];           // pearls: c, shown radius, flow radius (0 = none)
    uniform vec4 uQ[6];           // pearls: opacity, twist (wound by swirl and spin), atlas slot, flash
    uniform sampler2D uAtlas;     // eight 256² snapshots side by side
    uniform vec2 uSpin[6];        // each pearl's turn since its snapshot (rigid spin, riding) and inner swirl
    uniform vec3 uSquash[6];      // impact direction n and squash s: d ↦ d + s n (n·d)
    uniform float uGlass;
    uniform float uContact;
    varying vec2 vUv;

    // The ink flows around each pearl: |z' − c|² = |z − c|² − R², turned by τ R²/|z − c|².
    // Inside a pearl the glass shows the strands behind it, magnified: z' = c + d(0.55 + 0.25|d/R|²).
    vec2 flowAround(vec2 z) {
      for (int k = 0; k < 6; k++) {
        vec2 d = z - uP[k].xy;
        float R = uP[k].z;
        if (R > 0.0 && dot(d, d) < R * R) return uP[k].xy + d * (0.55 + 0.25 * dot(d, d) / (R * R));
      }
      for (int k = 0; k < 6; k++) {
        float R2 = uP[k].w * uP[k].w;
        if (R2 <= 0.0) continue;
        vec2 d = z - uP[k].xy;
        float r2 = max(dot(d, d), R2 + 1e-6);
        float q = R2 / r2;
        float a = uQ[k].y * q;
        z = uP[k].xy + mat2(cos(a), sin(a), -sin(a), cos(a)) * d * sqrt(1.0 - q);
      }
      return z;
    }

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float h(float n) { return fract(sin(n * 127.1 + 4.7) * 43758.5453); }
    // Catmull-Rom through four values: passes through b at u = 0 and c at u = 1, smooth across.
    float cr(float a, float b, float c, float d, float u) {
      return b + 0.5 * u * (c - a + u * (2.0 * a - 5.0 * b + 4.0 * c - d + u * (3.0 * (b - c) + d - a)));
    }
    vec3 crv(vec3 a, vec3 b, vec3 c, vec3 d, float u) {
      return b + 0.5 * u * (c - a + u * (2.0 * a - 5.0 * b + 4.0 * c - d + u * (3.0 * (b - c) + d - a)));
    }
    float seq(float n, vec4 S, float u) {
      return cr(h(n + S.x * 71.3), h(n + S.y * 71.3), h(n + S.z * 71.3), h(n + S.w * 71.3), u);
    }
    // A random number for step i: the fast deal, a step of size uAmp from the slow one.
    float rs(float i, float k) {
      float n = i * 13.7 + k;
      float fast = seq(n, uS, uU);
      return uAmp > 0.999 ? fast : mix(seq(n, uSlowS, uSlowU), fast, uAmp);
    }
    vec3 inkOf(float fi, vec4 S, float u) {
      float n = fi * 5.1;
      return crv(rainbow(h(n + S.x * 3.7)), rainbow(h(n + S.y * 3.7)), rainbow(h(n + S.z * 3.7)), rainbow(h(n + S.w * 3.7)), u);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    float fbm(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.03 + 1.7) + 0.2 * noise(p * 4.01 + 3.1); }   // Silk's field
    // three octaves, for scratchy edges (centred on ½)
    float fbm3(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.13 + 5.1) + 0.2 * noise(p * 4.37 + 9.7); }

    vec3 shadeInk(vec2 z) {
      z += 0.3 * vec2(sin(uClock * 0.027), cos(uClock * 0.033 + 2.0));
      vec2 p = uZoom * (rot(uTheta) * z);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 20; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        p = rot(6.2831 * rs(fi, 0.1) * 0.6) * p;
        float r2 = max(dot(p, p), 1e-6);
        vec2 sh = 0.4 * (vec2(rs(fi, 0.2), rs(fi, 0.3)) - 0.5);
        p = abs(p + sh) / pow(r2, 0.5 * uAlpha) - uC;
        // a shaky line: random direction and offset, wobbled by noise
        float b = 6.2831 * rs(fi, 0.4) + uClock * 0.05 * uFlow;
        float d = dot(p, vec2(cos(b), sin(b))) - (rs(fi, 0.5) - 0.5) * 1.2;
        d += uJitter * (1.0 + 0.15 * fi) * 0.06 * (fbm3(p * 18.0 + fi * 7.1) - 0.5);   // scratchy, and the hand tires
        // ink bleed: each channel's edge sits a little differently
        vec2 pb = p * 30.0 + fi * 2.3;
        vec3 dc = abs(d + uBleed * 0.012 * (vec3(noise(pb), noise(pb + 17.1), noise(pb + 31.7)) - 0.5)) * (1.0 + 0.6 * fi);
        float pen = smoothstep(0.5 * uBreaks - 0.08, 0.5 * uBreaks + 0.08, noise(p * 4.0 + vec2(fi * 3.3, uClock * 0.15 * uFlow)));
        float w = 0.008 + 0.016 * rs(fi, 0.6);
        vec3 g = w / (dc + w * vec3(1.0, 1.0 + 0.25 * uBleed, 1.0 + 0.5 * uBleed));
        // each stroke its own random hue: blend the seeds' colours, not their hue numbers
        vec3 ink = inkOf(fi, uS, uU);
        if (uAmp < 0.999) ink = mix(inkOf(fi, uSlowS, uSlowU), ink, uAmp);
        ink = clamp(ink, 0.0, 1.0);
        col += ink * g * g * pen * exp(-0.12 * fi) * 2.6;
      }
      return col * uGlow;
    }

    // Kali Tangle: a random turn and an off-centre mirror every step, and every
    // step its own random line and circle to glow against.
    vec3 shadeTangle(vec2 z) {
      z += 0.06 * uChaos * sin(z.yx * 3.1 + vec2(uClock * 0.21, uClock * 0.17));   // a slow wobble
      z += 0.35 * vec2(sin(uClock * 0.031), cos(uClock * 0.023 + 1.0));   // pan
      vec2 p = uZoom * (rot(uTheta) * z);
      vec3 col = vec3(0.0);
      float r1 = 0.0;
      for (int i = 0; i < 24; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        p = rot(uChaos * (6.2831 * h(fi + 0.13) + uClock * 0.25 * (2.0 * h(fi + 0.71) - 1.0))) * p;
        float r2 = max(dot(p, p), 1e-6);
        vec2 sh = uChaos * 0.45 * (vec2(h(fi + 31.7), h(fi + 37.3)) - 0.5) * vec2(sin(uClock * 0.05 * (1.0 + h(fi + 41.0))), 1.0);
        p = abs(p + sh) / pow(r2, 0.5 * uAlpha) - uC;
        if (i == 0) r1 = length(p);
        float b = 6.2831 * h(fi + 3.7) + uClock * 0.07 * (2.0 * h(fi + 5.1) - 1.0);
        float dl = abs(dot(p, vec2(cos(b), sin(b))) - (h(fi + 9.2) - 0.5) * 1.2);
        vec2 q = (vec2(h(fi + 11.3), h(fi + 13.9)) - 0.5) * 1.6;
        float dc = abs(length(p - q) - 0.25 - 0.55 * h(fi + 17.1));
        float d = min(dl, dc) * (1.0 + 0.7 * fi);
        float w = 0.012 + 0.018 * h(fi + 21.0);
        float hue = uHue + h(fi * 1.37 + (dl < dc ? 0.0 : 40.0));
        float g = w / (d + w);
        float ink = 0.55 + 0.45 * sin(dot(p, vec2(5.3, 3.1)) * (1.0 + h(fi + 45.0)) + fi);
        col += rainbow(hue) * g * g * ink * exp(-0.12 * fi) * 2.4;
      }
      vec3 back = rainbow(uHue + 0.5 + 0.12 * log(r1 + 0.05)) * 0.12;
      return back + uGlow * col;
    }

    // Kali Drift: the plain set, coloured by the depth of the closest pass to
    // the mirror axes or the unit circle.
    vec3 shadeDrift(vec2 z) {
      vec2 p = uZoom * (rot(uTheta) * z);
      float best = 1e9, bestI = 0.0, r1 = 0.0;
      for (int i = 0; i < 24; i++) {
        if (float(i) >= uIterations) break;
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * uAlpha) - uC;
        float r = length(p);
        if (i == 0) r1 = r;
        float d = min(min(abs(p.x), abs(p.y)), abs(r - 1.0)) * (1.0 + 0.8 * float(i));
        if (d < best) { best = d; bestI = float(i); }
      }
      float g = 0.035 / (best + 0.035);
      vec3 lines = rainbow(uHue + 0.14 * bestI + 0.05 * r1) * g * g * 1.6;
      vec3 back = rainbow(uHue + 0.5 + 0.12 * log(r1 + 0.05)) * 0.14;
      return back + uGlow * lines;
    }

    // Kali Silk: c and α picked per point by the noise field n.
    vec3 shadeSilk(vec2 z, vec2 n) {
      vec2 c = uC + uWarp * (n - 0.5);
      float alpha = uAlpha + uWarp * 1.5 * (n.x - n.y);
      vec2 p = uZoom * (rot(uTheta) * (z + uWarp * 0.8 * (n - 0.5)));
      vec3 col = vec3(0.0);
      float r1 = 0.0;
      for (int i = 0; i < 24; i++) {
        if (float(i) >= uIterations) break;
        float fi = float(i);
        float r2 = max(dot(p, p), 1e-6);
        p = abs(p) / pow(r2, 0.5 * alpha) - c;
        if (i == 0) r1 = length(p);
        float a = 2.39996 * fi + uTheta * 2.0;
        float d = min(abs(dot(p, vec2(cos(a), sin(a)))), abs(length(p) - 0.6 - 0.4 * n.x)) * (1.0 + 0.6 * fi);
        float g = 0.014 / (d + 0.014);
        col += rainbow(uHue + 0.9 * n.x - 0.6 * n.y + 0.17 * fi) * g * g * exp(-0.14 * fi) * 1.8;
      }
      vec3 back = rainbow(uHue + 0.5 + 1.2 * n.y + 0.1 * log(r1 + 0.05)) * 0.11;
      return back + uGlow * col;
    }

    // Every base sees the plane after the ink has flowed around the pearls.
    vec3 shade(vec2 z, vec2 n) {
      z = flowAround(z);
      if (uBase < 0.5) return shadeTangle(z);
      if (uBase < 1.5) return shadeInk(z);
      if (uBase < 2.5) return shadeDrift(z);
      return shadeSilk(z, n);
    }

    // A pearl's snapshot at d (in its own radii), turned back by its spin, and the
    // core by its inner swirl as well: φ(r) = spin + swirl (1 − r²)².
    vec3 snapAt(float slot, vec2 sv, vec2 d) {
      float a = sv.x + sv.y * pow(max(0.0, 1.0 - dot(d, d)), 2.0);
      float c = cos(a), s = sin(a);
      d = mat2(c, -s, s, c) * d;
      return texture2D(uAtlas, vec2((slot + 0.5 + 0.49 * d.x) / 8.0, 0.5 + 0.49 * d.y)).rgb;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z0 = (frag - 0.5 * uResolution) * px;
      bool ink = uBase > 0.5 && uBase < 1.5;
      // Silk's field (smooth, so once per pixel), carried round the pearls too
      vec2 n = vec2(0.0);
      if (uBase > 2.5) {
        vec2 fz = flowAround(z0) * 1.3 + 0.3 * vec2(sin(uClock * 0.029), cos(uClock * 0.037));
        n = vec2(fbm(fz + vec2(0.0, uClock * 0.045)), fbm(fz + vec2(5.2, 1.3) - uClock * 0.038));
      }
      // the paper breathes: a slow, low-frequency warp (smooth, so once per pixel)
      vec2 breathe = (ink ? uBreathe : 0.0) * 0.05 * (vec2(fbm3(z0 * 1.1 + vec2(0.0, uClock * 0.06)), fbm3(z0 * 1.1 + vec2(4.3, 1.9) - uClock * 0.05)) - 0.5);
      // line boil: a sub-pixel shudder, re-hashed 12 times a second
      float frame = floor(uClock * 12.0);
      vec2 shudder = (ink ? uShudder : 0.0) * 0.8 * px * (vec2(hash(vec2(frame, 3.1)), hash(vec2(frame, 7.7))) - 0.5);
      vec3 col = vec3(0.0);
      for (int j = 0; j < 4; j++) {            // 2×2 supersampling
        vec2 o = (vec2(float(j / 2), float(j - 2 * (j / 2))) - 0.25) * 0.5;
        col += shade((frag + o - 0.5 * uResolution) * px + breathe + shudder, n);
      }
      col *= 0.25;
      // dark paper with a faint grain
      vec2 z = (frag - 0.5 * uResolution) * px;
      if (ink) col += vec3(0.035, 0.02, 0.05) * (0.7 + 0.6 * noise(z * 60.0)) + vec3(0.02, 0.0, 0.04) * noise(z * 2.0 + uClock * 0.02);

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      float m = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.4 * m)) / max(m, 1e-4);

      // Strands that pass close to a pearl's rim catch its light: the colour of
      // the nearest edge of the pearl, in ripples running outward. Only strands
      // light up (the backdrop stays as it is), added as light so it never clips.
      vec3 Lc = vec3(0.0);
      float strand = smoothstep(0.12, 0.45, max(col.r, max(col.g, col.b)));
      for (int k = 0; k < 6; k++) {
        float R = uP[k].z;
        if (R <= 0.0 || uContact <= 0.0) continue;
        vec2 d = z - uP[k].xy;
        float r = length(d) / R;
        if (r < 0.97 || r > 1.7) continue;
        vec3 edge = snapAt(uQ[k].z, uSpin[k], 0.8 * d / (r * R));
        float band = smoothstep(0.97, 1.03, r) * (1.0 - smoothstep(1.03, 1.7, r));
        float ripple = 0.65 + 0.35 * sin(60.0 * (r - 1.0) * R - 4.0 * uClock);
        Lc += edge * band * ripple * uQ[k].x;
      }
      col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * exp(-2.5 * uContact * strand * Lc);

      // the pearls, frozen as they were caught (already toned and graded), with
      // the live strands showing through the glass
      for (int k = 0; k < 6; k++) {
        float R = uP[k].z;
        if (R <= 0.0) continue;
        vec2 d = (z - uP[k].xy) / R;
        d += uSquash[k].z * uSquash[k].xy * dot(uSquash[k].xy, d);   // squashed along n, for a moment
        float r = length(d);
        if (r >= 1.0) continue;
        vec3 snap = snapAt(uQ[k].z, uSpin[k], d) * (1.0 + uQ[k].w);
        float mask = (1.0 - smoothstep(0.82, 1.0, r)) * uQ[k].x;
        col = mix(col, mix(snap, max(snap, col), uGlass), mask);
        col += snap * 0.5 * smoothstep(0.8, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r)) * uQ[k].x;   // a faint rim
      }

      vec2 v = vUv - 0.5;
      col *= 1.0 - 0.45 * dot(v, v);
      gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
    }
  `,

  uniforms() {
    return {
      uC: { value: [0.8, 0.6] },
      uAlpha: { value: 2 },
      uTheta: { value: 0 },
      uZoom: { value: 2 },
      uS: { value: [996, 0, 1, 2] },
      uU: { value: 0 },
      uSlowS: { value: [996, 0, 1, 2] },
      uSlowU: { value: 0 },
      uAmp: { value: 1 },
      uFlow: { value: 1 },
      uClock: { value: 0 },
      uJitter: { value: 0.5 },
      uBleed: { value: 1 },
      uShudder: { value: 1 },
      uBreathe: { value: 1 },
      uBreaks: { value: 0.5 },
      uIterations: { value: 12 },
      uGlow: { value: 1 },
      uSat: { value: 1 },
      uBase: { value: 0 },
      uHue: { value: 0 },
      uChaos: { value: 0.6 },
      uWarp: { value: 0.35 },
      uSpin: { value: new Float32Array(12) },
      uSquash: { value: new Float32Array(18) },
      uGlass: { value: 0.35 },
      uContact: { value: 1 },
      uP: { value: new Float32Array(24) },
      uQ: { value: new Float32Array(24) },
      uAtlas: { value: null },
    };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const u = state.uniforms;
    u.uC.value = [m.cx, m.cy];
    u.uAlpha.value = m.alpha;
    u.uTheta.value = m.theta;
    u.uZoom.value = m.zoom;
    u.uS.value = m.seeds;
    u.uU.value = m.u;
    u.uSlowS.value = m.slowSeeds;
    u.uSlowU.value = m.slowU;
    u.uAmp.value = m.amp;
    u.uFlow.value = m.flow;
    u.uClock.value = m.clock;
    u.uJitter.value = ctx.params.jitter;
    u.uBleed.value = ctx.params.bleed;
    u.uShudder.value = ctx.params.shudder;
    u.uBreathe.value = ctx.params.breathe;
    u.uBreaks.value = ctx.params.breaks;
    u.uIterations.value = ctx.params.iterations;
    u.uGlow.value = ctx.params.glow;
    u.uSat.value = ctx.params.saturation;
    u.uBase.value = m.base;
    u.uHue.value = m.hue;
    u.uChaos.value = ctx.params.chaos;
    u.uWarp.value = ctx.params.warp;

    const p = ctx.params;
    const L = state.lens;

    // Pearls age on the motion clock, so they keep pace with `speed` and with
    // smooth recording. Going back in time (a reset) drops them all.
    if (m.clock < L.clock - 1e-3) L.pearls.length = L.merges.length = 0;
    const dt = Math.min(0.1, Math.max(0, m.clock - L.clock));
    L.clock = m.clock;
    L.roundness = p.roundness;
    L.drift = p.drift;
    L.max = p.pearls;
    // Riding: each step, a pearl is carried the way the strands around it are.
    // The base maps the screen into its fractal's plane as P = zoom·R_{−θ}(z + pan),
    // so the point under the pearl last frame is now at R_θ P / zoom − pan.
    const f0 = L.frame;
    const f = (L.frame = baseFrame(m));
    const [hx, hy] = L.half;
    const live = (q) => q.R * (1 - smooth((m.clock - q.born - p.hold) / p.vanish)); // the radius as shown
    for (const q of L.pearls) {
      const c0 = Math.cos(f0.th), s0 = Math.sin(f0.th);
      const vx = q.x + f0.pan[0], vy = q.y + f0.pan[1];
      const P = [f0.zoom * (c0 * vx + s0 * vy), f0.zoom * (-s0 * vx + c0 * vy)];
      const c = Math.cos(f.th), s = Math.sin(f.th);
      q.x += p.ride * ((c * P[0] - s * P[1]) / f.zoom - f.pan[0] - q.x);
      q.y += p.ride * ((s * P[0] + c * P[1]) / f.zoom - f.pan[1] - q.y);
      q.R = Math.min(0.55, 1.4 * q.R0, Math.max(0.6 * q.R0, q.R * (1 + p.ride * (f0.zoom / f.zoom - 1)))); // scales with the zoom, within reason
      q.spin += p.ride * (f.th - f0.th);
    }

    // Gravity: a softened pull of strength `gravity` toward the centre, and
    // `attract` m_j / (r² + ε²) toward every other pearl (m = (R / 0.2)², so a
    // middling pearl weighs 1), less drag. Speeds are kept under 1.5.
    const mass = (q) => (live(q) / 0.2) ** 2;
    const acc = L.pearls.map((q) => {
      const r = Math.hypot(q.x, q.y);
      let ax = (-p.gravity * q.x) / Math.sqrt(r * r + 0.04), ay = (-p.gravity * q.y) / Math.sqrt(r * r + 0.04);
      for (const o of L.pearls) {
        if (o === q) continue;
        const dx = o.x - q.x, dy = o.y - q.y, d2 = dx * dx + dy * dy + 0.01;
        const g = (p.attract * mass(o)) / (d2 * Math.sqrt(d2));
        ax += g * dx;
        ay += g * dy;
      }
      return [ax, ay];
    });
    L.pearls.forEach((q, k) => {
      const damp = Math.exp(-p.drag * dt);
      q.v[0] = (q.v[0] + acc[k][0] * dt) * damp;
      q.v[1] = (q.v[1] + acc[k][1] * dt) * damp;
      const sp = Math.hypot(q.v[0], q.v[1]);
      if (sp > 1.5) { q.v[0] *= 1.5 / sp; q.v[1] *= 1.5 / sp; }
      q.x += q.v[0] * dt;
      q.y += q.v[1] * dt;
      // the rigid spin and the inner swirl turn the snapshot; viscosity damps the swirl
      q.spin += q.w * dt;
      q.swirl += q.W * dt;
      q.W *= Math.exp(-dt / p.viscosity);
      q.wind += (p.swirl + 0.4 * q.w) * dt; // the ink around winds at swirl, dragged round by the spin
    });
    // The screen edges bounce them back (rarely needed: gravity holds them in).
    for (const q of L.pearls) {
      const R = live(q);
      for (const [axis, h] of [[0, hx], [1, hy]]) {
        const x = axis === 0 ? q.x : q.y;
        if (Math.abs(x) + R <= h || R >= h) continue;
        const side = Math.sign(x);
        if (axis === 0) q.x = side * (h - R); else q.y = side * (h - R);
        if (q.v[axis] * side > 0) {
          q.s0 = 0.22 * Math.min(1, Math.abs(q.v[axis]) / 0.3);
          q.v[axis] *= -0.7;
          q.hit = m.clock;
          q.n = axis === 0 ? [-side, 0] : [0, -side];
        }
      }
    }

    // Merging: two pearls that touch become one, keeping mass, momentum and
    // angular momentum (I = ½ m R², L the pair's orbital angular momentum about
    // the new centre). Both pictures are copied into a new snapshot (in render,
    // in order), stretched along the line of impact as long as the pair was.
    for (let merged = true; merged; ) {
      merged = false;
      for (let i = 0; i < L.pearls.length && !merged; i++) {
        for (let j = i + 1; j < L.pearls.length && !merged; j++) {
          const a = L.pearls[i], b = L.pearls[j];
          const Ra = live(a), Rb = live(b);
          const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
          if (dist >= Ra + Rb || Ra < 0.01 || Rb < 0.01) continue;
          const slot = [0, 1, 2, 3, 4, 5, 6, 7].find((s) => !L.pearls.some((q) => q.slot === s));
          const ma = Ra * Ra, mb = Rb * Rb, M = ma + mb;
          const x = (ma * a.x + mb * b.x) / M, y = (ma * a.y + mb * b.y) / M;
          const v = [(ma * a.v[0] + mb * b.v[0]) / M, (ma * a.v[1] + mb * b.v[1]) / M];
          const R = Math.min(0.5, Math.sqrt(M));
          const Lorb = [a, b].reduce((s, q, k) => s + [ma, mb][k] * ((q.x - x) * (q.v[1] - v[1]) - (q.y - y) * (q.v[0] - v[0])), 0);
          const I = 0.5 * M * R * R, Ia = 0.5 * ma * Ra * Ra, Ib = 0.5 * mb * Rb * Rb;
          const w = Math.max(-4, Math.min(4, (Ia * a.w + Ib * b.w + Lorb) / I));
          // the inner swirl: what the parts were already swirling, plus the hit (L / I)
          // and the spin the parts brought in that the bigger whole dilutes
          const wBar = (ma * a.w + mb * b.w) / M, wOwn = (Ia * a.w + Ib * b.w) / I;
          const W = Math.max(-6, Math.min(6, (ma * a.W + mb * b.W) / M + p.churn * (Lorb / I + wBar - wOwn)));
          const n = dist > 1e-6 ? [dx / dist, dy / dist] : [1, 0];
          const along = (q, Rq) => Math.abs((q.x - x) * n[0] + (q.y - y) * n[1]) + Rq;
          const Renc = Math.max(R, along(a, Ra), along(b, Rb));
          const rel = (q, Rq) => [(q.x - x) / R, (q.y - y) / R, Rq / R, q.slot];
          L.merges.push({ slot, n, E: Renc / R - 1, A: rel(a, Ra), B: rel(b, Rb), SA: [a.spin, a.swirl], SB: [b.spin, b.swirl] });
          const c = {
            x, y, R, R0: R, v, slot, spin: 0, swirl: 0, w, W,
            born: (ma * a.born + mb * b.born) / M, caught: Math.min(a.caught, b.caught),
            wind: (ma * a.wind + mb * b.wind) / M, hit: m.clock, n, s0: R / Renc - 1,
          };
          L.pearls.splice(j, 1);
          L.pearls.splice(i, 1, c);
          L.mergeCount = (L.mergeCount ?? 0) + 1;
          merged = true;
        }
      }
    }
    L.pearls = L.pearls.filter((q) => m.clock - q.born < p.hold + p.vanish);
    u.uP.value.fill(0);
    u.uQ.value.fill(0);
    u.uSpin.value.fill(0);
    u.uSquash.value.fill(0);
    L.pearls.forEach((q, k) => {
      const age = m.clock - q.born;
      const ph = Math.max(0, (age - p.hold) / p.vanish);
      const R = q.R * (1 - smooth(ph));
      u.uP.value.set([q.x, q.y, R, R * smooth((m.clock - q.caught) / 0.8)], 4 * k);
      // a merge leaves the pearl stretched along the line of impact (a bounce
      // squashes it), and it wobbles back round
      const since = m.clock - q.hit;
      const squash = q.s0 * Math.exp(-5 * since) * Math.cos(12 * since);
      const flash = 0.6 * Math.exp(-3 * (m.clock - q.caught)) + Math.min(0.5, 1.5 * Math.abs(q.s0)) * Math.exp(-5 * since);
      u.uQ.value.set([1 - smooth(2 * ph - 1), q.wind, q.slot, flash], 4 * k);
      u.uSpin.value.set([q.spin, q.swirl], 2 * k);
      u.uSquash.value.set([q.n[0], q.n[1], squash], 3 * k);
    });
    u.uAtlas.value = L.atlas;
    u.uGlass.value = p.glass;
    u.uContact.value = p.contact;
    L.on = p.optics > 0;
    Object.assign(L.flare, { uStreak: p.streak, uRays: p.rays });
    Object.assign(L.comp, { uClock: m.clock, uSpikes: p.spikes, uOptics: p.optics, uBloom: p.bloom, uGhosts: p.ghosts, uDirt: p.dirt, uAberration: p.aberration });
  },

  // The lens: picture → B (the jets) → blurs at 1/2, 1/4, 1/8 → spikes, streak
  // and rays at 1/4 → composite.
  setup(ctx) {
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    const rt = (d) => new THREE.WebGLRenderTarget(Math.max(1, ctx.size.width / d), Math.max(1, ctx.size.height / d), half);
    const scene = rt(1);
    const bright = rt(2);
    const levels = [2, 4, 8].map((d) => ({ d, a: rt(d), b: rt(d) }));
    const flareRT = rt(4);

    const quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    quadScene.add(quad);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = (frag, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: LENS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const brightMat = mat(BRIGHT_FRAG, { tSrc: { value: scene.texture }, uThreshold: { value: 0.6 } });
    const copyMat = mat(COPY_FRAG, { tSrc: { value: null } });
    const blurMat = mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });
    const flareMat = mat(FLARE_FRAG, {
      tSoft: { value: levels[1].a.texture },
      uShort: { value: new THREE.Vector2() },
      uStreak: { value: 1 },
      uRays: { value: 1 },
    });
    const compMat = mat(COMPOSITE_FRAG, {
      tScene: { value: scene.texture },
      tB1: { value: levels[0].a.texture },
      tB2: { value: levels[1].a.texture },
      tB3: { value: levels[2].a.texture },
      tFlare: { value: flareRT.texture },
      uResolution: { value: new THREE.Vector2() },
      uOptics: { value: 1 },
      uBloom: { value: 1 },
      uGhosts: { value: 1 },
      uDirt: { value: 1 },
      uAberration: { value: 1 },
      uSpikes: { value: 1 },
      uClock: { value: 0 },
    });
    const sizeUniforms = (w, h) => {
      compMat.uniforms.uResolution.value.set(w, h);
      const s = Math.min(w, h);
      flareMat.uniforms.uShort.value.set(s / w, s / h);
    };
    sizeUniforms(ctx.size.width, ctx.size.height);

    const pass = (r, material, target) => {
      quad.material = material;
      r.setRenderTarget(target);
      r.render(quadScene, quadCam);
    };
    // The pearl machinery: the picture blurred at 1/4 → ring score at a short
    // side of 72 → read back → the best ring is copied into an atlas slot.
    const soft = rt(4);
    const softB = rt(4);
    const scanH = 72;
    const scanDims = (w, h) => [Math.round((scanH * w) / Math.min(w, h)), Math.round((scanH * h) / Math.min(w, h))];
    const scanRT = new THREE.WebGLRenderTarget(...scanDims(ctx.size.width, ctx.size.height), { depthBuffer: false });
    let scanBuf = new Uint8Array(scanRT.width * scanRT.height * 4);
    const atlas = new THREE.WebGLRenderTarget(256 * 8, 256, { depthBuffer: false });
    atlas.scissorTest = true;
    const mergeRT = new THREE.WebGLRenderTarget(256, 256, { depthBuffer: false }); // the atlas can't be read while drawn into
    const mergeMat = mat(MERGE_FRAG, {
      uAtlas: { value: atlas.texture },
      uN: { value: new THREE.Vector2() },
      uE: { value: 0 },
      uA: { value: new THREE.Vector4() },
      uB: { value: new THREE.Vector4() },
      uSA: { value: new THREE.Vector2() },
      uSB: { value: new THREE.Vector2() },
    });
    const toSlot = (r, material, slot) => {
      atlas.viewport.set(256 * slot, 0, 256, 256);
      atlas.scissor.copy(atlas.viewport); // the clear before a render ignores the viewport: keep it to this slot
      pass(r, material, atlas);
    };
    const merge = (r, g) => {
      const U = mergeMat.uniforms;
      U.uN.value.set(...g.n);
      U.uE.value = g.E;
      U.uA.value.set(...g.A);
      U.uB.value.set(...g.B);
      U.uSA.value.set(...g.SA);
      U.uSB.value.set(...g.SB);
      pass(r, mergeMat, mergeRT);
      copyMat.uniforms.tSrc.value = mergeRT.texture;
      toSlot(r, copyMat, g.slot);
    };
    const scanMat = mat(SCAN_FRAG, { tSrc: { value: soft.texture }, uZ2Uv: { value: new THREE.Vector2() }, uUv2Z: { value: new THREE.Vector2() } });
    const captureMat = mat(CAPTURE_FRAG, { tSrc: { value: scene.texture }, uZ2Uv: scanMat.uniforms.uZ2Uv, uDisc: { value: new THREE.Vector3() } });
    const zUniforms = (w, h) => {
      const s = Math.min(w, h);
      scanMat.uniforms.uZ2Uv.value.set((0.5 * s) / w, (0.5 * s) / h);
      scanMat.uniforms.uUv2Z.value.set((2 * w) / s, (2 * h) / s);
    };
    zUniforms(ctx.size.width, ctx.size.height);

    const scan = (r) => {
      copyMat.uniforms.tSrc.value = scene.texture;
      pass(r, copyMat, soft);
      blurMat.uniforms.tSrc.value = soft.texture;
      blurMat.uniforms.uStep.value.set(1 / soft.width, 0);
      pass(r, blurMat, softB);
      blurMat.uniforms.tSrc.value = softB.texture;
      blurMat.uniforms.uStep.value.set(0, 1 / soft.height);
      pass(r, blurMat, soft);
      pass(r, scanMat, scanRT);
      r.readRenderTargetPixels(scanRT, 0, 0, scanRT.width, scanRT.height, scanBuf);

      const { x: ax, y: ay } = scanMat.uniforms.uUv2Z.value; // the screen is ax × ay in z
      const W = scanRT.width;
      let best = null;
      lens.top = 0;
      for (let i = 0; i < scanBuf.length; i += 4) {
        const score = scanBuf[i] / 255;
        lens.top = Math.max(lens.top, score);
        if (score < lens.roundness || (best && score <= best.score)) continue;
        const px = (i / 4) % W;
        const py = Math.floor(i / 4 / W);
        const R = 1.3 * 0.07 * 1.4 ** Math.round((5 * scanBuf[i + 1]) / 255);
        const x = ((px + 0.5) / W - 0.5) * ax;
        const y = ((py + 0.5) / scanRT.height - 0.5) * ay;
        if (Math.abs(x) + R > ax / 2 || Math.abs(y) + R > ay / 2) continue;
        if (lens.pearls.some((q) => Math.hypot(x - q.x, y - q.y) < R + q.R + 0.03)) continue;
        best = { score, x, y, R };
      }
      if (!best) return;
      const slot = [0, 1, 2, 3, 4, 5, 6, 7].find((s) => !lens.pearls.some((q) => q.slot === s));
      captureMat.uniforms.uDisc.value.set(best.x, best.y, best.R);
      toSlot(r, captureMat, slot);
      // launched sideways (either way round, hashed from the time it was caught), so it falls into an orbit
      const h = (Math.sin(lens.clock * 91.7 + slot * 7.3) * 43758.5453) % 1;
      const r0 = Math.hypot(best.x, best.y);
      const [tx, ty] = r0 > 1e-3 ? [-best.y / r0, best.x / r0] : [1, 0];
      const sense = Math.abs(h) < 0.5 ? 1 : -1;
      lens.pearls.push({
        x: best.x, y: best.y, R: best.R, R0: best.R, slot, born: lens.clock, caught: lens.clock,
        v: [sense * lens.drift * tx, sense * lens.drift * ty],
        spin: 0, swirl: 0, w: 0, W: 0, wind: 0, hit: -1e9, n: [1, 0], s0: 0,
      });
    };

    // update() writes plain numbers here; render() copies them into the materials.
    const lens = { on: true, flare: {}, comp: {}, pearls: [], merges: [], clock: 0, lastScan: -1, roundness: 0.55, max: 4, atlas: atlas.texture };
    lens.half = [ctx.size.width / Math.min(ctx.size.width, ctx.size.height), ctx.size.height / Math.min(ctx.size.width, ctx.size.height)];
    lens.frame = { th: 0, zoom: 1, pan: [0, 0] };
    const apply = (material, values) => {
      for (const k in values) material.uniforms[k].value = values[k];
    };

    ctx.pipeline = {
      render(r, sceneToDraw, camera, target) {
        for (const g of lens.merges.splice(0)) merge(r, g); // in order: a merge may read the slot an earlier one wrote
        r.setRenderTarget(scene);
        r.render(sceneToDraw, camera);
        if (lens.pearls.length < Math.min(6, lens.max) && Math.abs(lens.clock - lens.lastScan) >= 0.5) {
          lens.lastScan = lens.clock;
          scan(r);
        }
        apply(compMat, lens.comp);
        if (lens.on) {
          apply(flareMat, lens.flare);
          pass(r, brightMat, bright);
          let src = bright.texture;
          for (const lv of levels) {
            copyMat.uniforms.tSrc.value = src;
            pass(r, copyMat, lv.a);
            blurMat.uniforms.tSrc.value = lv.a.texture;
            blurMat.uniforms.uStep.value.set(1 / lv.a.width, 0);
            pass(r, blurMat, lv.b);
            blurMat.uniforms.tSrc.value = lv.b.texture;
            blurMat.uniforms.uStep.value.set(0, 1 / lv.a.height);
            pass(r, blurMat, lv.a);
            src = lv.a.texture;
          }
          pass(r, flareMat, flareRT);
        }
        pass(r, compMat, target);
      },
      setSize(w, h) {
        scene.setSize(w, h);
        bright.setSize(Math.max(1, w / 2), Math.max(1, h / 2));
        for (const lv of levels) {
          lv.a.setSize(Math.max(1, w / lv.d), Math.max(1, h / lv.d));
          lv.b.setSize(Math.max(1, w / lv.d), Math.max(1, h / lv.d));
        }
        flareRT.setSize(Math.max(1, w / 4), Math.max(1, h / 4));
        sizeUniforms(w, h);
        soft.setSize(Math.max(1, w / 4), Math.max(1, h / 4));
        softB.setSize(Math.max(1, w / 4), Math.max(1, h / 4));
        scanRT.setSize(...scanDims(w, h));
        scanBuf = new Uint8Array(scanRT.width * scanRT.height * 4);
        zUniforms(w, h);
        lens.half = [w / Math.min(w, h), h / Math.min(w, h)];
        lens.pearls.length = 0;
        lens.merges.length = 0;
      },
    };

    lens.dispose = () => {
      delete ctx.pipeline;
      for (const t of [scene, bright, flareRT, soft, softB, scanRT, atlas, mergeRT, ...levels.flatMap((lv) => [lv.a, lv.b])]) t.dispose();
      for (const m of [brightMat, copyMat, blurMat, flareMat, compMat, scanMat, captureMat, mergeMat]) m.dispose();
      quad.geometry.dispose();
    };
    return { lens };
  },

  dispose(ctx, state) {
    state.lens.dispose();
  },
};
