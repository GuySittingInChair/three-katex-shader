import * as THREE from 'three';
import { TAU, smooth } from '../lib/motion.js';

// Kali Accretion: a Kali fractal draining into a fixed core at the centre of the screen.
//
// The base fractal (`base`) and the ring finder are those of Kali Pearls: any
// stroke that closes into too round a ring (`roundness`) is caught.
//
// The core never moves and never changes size (`core` is its radius R_c). Mass
// only goes in:
//   • The ink falls in. With q = R_c²/|z|² (1 at the rim, falling off like
//     gravity), the picture at z is drawn from R_{q(1.5 + 1.2 pull·s)} e^{0.4 pull·q·s} z:
//     wound into spiral arms, and scrolled outward as the phase s runs 0 → 1
//     every 4 s, so what is seen keeps moving inward and round. Two copies half
//     a cycle apart are cross-faded (each fades out before it jumps back), so
//     the fall never stops.
//   • A caught ring falls in on a spiral, ṙ = −0.1 pull (1 + R_c/r) and
//     θ̇ = 0.45 √pull r^{−3/2} (faster as it nears, as an orbit does), and is
//     stretched along its orbit by (r₀/r)^1.2 and thinned as much across it (so
//     its area stays the same), into an arc, the way a tide pulls a body apart.
//   • When it reaches the rim it is swallowed. The core's picture is pressed
//     inward to make room and the newcomer is wrapped round the rim from where
//     it came in, its area kept, so the oldest material ends up in the middle.
//
// Everything orbits the same way, and what falls in brings that turning with it.
// The core spins at ω and swirls at Ω: its picture at ρ (in core radii) is turned
// by φ(ρ) = ∫ω + (1 − ρ²)² ∫Ω, so the middle turns further than the rim and the
// layers wind into a spiral. Each swallow adds Ω += 3·spin·R²/R_c² (R the ring's
// radius: the more it brought, the harder it stirs) and a quarter of that to ω,
// and both die away over `settle` seconds (ω three times more slowly), so the
// spiral freezes until the next one lands.
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
    for (int j = 0; j < 4; j++) {           // small rings only (up to 0.19)
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

// Swallowing: the core's picture (slot 0, as it was shown) is pressed inward
// to radius a, and the newcomer (slot uSlot) is wrapped once round the band
// a < ρ < 1, centred on the angle where it came in, in the same frame it fell in
// (along the orbit, and across it).
const FEED_FRAG = `
  uniform sampler2D uAtlas;
  uniform float uSlot;
  uniform float uAng;
  uniform float uA;
  uniform vec2 uOld;            // the core's spin and swirl when it ate
  varying vec2 vUv;
  vec3 snapAt(float slot, vec2 sv, vec2 d) {
    float a = sv.x + sv.y * pow(max(0.0, 1.0 - dot(d, d)), 2.0);
    float c = cos(a), s = sin(a);
    d = mat2(c, -s, s, c) * d;
    return texture2D(uAtlas, vec2((slot + 0.5 + 0.49 * d.x) / 6.0, 0.5 + 0.49 * d.y)).rgb;
  }
  vec2 fold(vec2 u) { float r = length(u); return r > 1.0 ? u * max(0.0, 2.0 - r) / r : u; }
  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float rho = length(d);
    vec3 old = snapAt(0.0, uOld, fold(d / uA));
    float da = mod(atan(d.y, d.x) - uAng + 3.14159265, 6.2831853) - 3.14159265;
    vec2 u = vec2(da / 3.14159265, (rho - 0.5 * (1.0 + uA)) / (0.5 * (1.0 - uA)));
    vec2 t = vec2(-sin(uAng), cos(uAng)), r = vec2(cos(uAng), sin(uAng));
    vec3 nw = snapAt(uSlot, vec2(0.0), fold(u.x * t + u.y * r));
    gl_FragColor = vec4(mix(old, nw, smoothstep(uA - 0.03, uA + 0.03, rho)), 1.0);
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

const kaliLine = (num, m, hl) =>
  `p &\\mapsto \\frac{${num}}{|p|^{\\alpha}} - c,\\quad \\alpha = ${hl(m.alpha, 2)},\\quad c = (${hl(m.cx, 2)},\\ ${hl(m.cy, 2)}) \\\\`;
const NUMER = ['|R_{a_i} p + s_i|', '|R_{a_i} p + s_i|', '|p|', '|p|'];

export default {
  name: 'Kali Accretion',
  description:
    'A Kali fractal draining into a fixed core: the ink spirals in, rings caught from it are pulled into arcs as they fall, ' +
    'and each one swallowed is wrapped round the rim and stirs the core, which winds its layers into a spiral before it settles.',
  tags: ['fractal', '2d', 'glsl', 'kaliset', 'inversion', 'noise', 'fbm', 'orbit trap', 'random', 'flow', 'circle detection', 'gravity', 'accretion', 'spiral'],
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
    kaliLine(NUMER[m.base], m, hl) +
    `z &\\mapsto R_{q(1.5 + 1.2\\cdot${hl(params.pull, 2)}\\,s)}\\, e^{0.4\\cdot${hl(params.pull, 2)}\\,q s} z,\\quad q = \\tfrac{R_c^2}{|z|^2},\\ \\ R_c = ${hl(params.core, 2)} \\\\` +
    `\\dot r &= -0.1\\cdot${hl(params.pull, 2)}\\,\\big(1 + \\tfrac{R_c}{r}\\big),\\quad \\dot\\theta \\propto r^{-3/2},\\quad \\text{stretch } (r_0/r)^{1.2} \\\\` +
    `\\phi(\\rho) &= \\textstyle\\int\\omega + (1 - \\rho^2)^2\\!\\int\\Omega,\\quad \\Delta\\Omega = 3\\cdot${hl(params.spin, 2)}\\,\\tfrac{R^2}{R_c^2},\\quad \\dot\\Omega = -\\tfrac{\\Omega}{${hl(params.settle, 1)}}` +
    '\\end{aligned}',

  params: {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    base: { value: 0, min: 0, max: BASES.length - 1, step: 1, options: BASES },
    pull: { value: 1, min: 0, max: 3, step: 0.05 },
    spin: { value: 1, min: 0, max: 3, step: 0.05 },
    settle: { value: 8, min: 0.5, max: 60, step: 0.5 },
    core: { value: 0.25, min: 0.1, max: 0.5, step: 0.01 },
    roundness: { value: 0.45, min: 0.3, max: 0.98, step: 0.01 },
    chaos: { value: 0.6, min: 0, max: 1, step: 0.01 },
    warp: { value: 0.35, min: 0, max: 1, step: 0.01 },
    reseed: { value: 9, min: 0.1, max: 300, step: 0.05 },
    blend: { value: 2.25, min: 0.05, max: 60, step: 0.05 },
    jitter: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    bleed: { value: 1, min: 0, max: 3, step: 0.05 },
    shudder: { value: 1, min: 0, max: 4, step: 0.05 },
    breathe: { value: 1, min: 0, max: 3, step: 0.05 },
    breaks: { value: 0.5, min: 0, max: 1, step: 0.01 },
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
    uniform vec4 uCore;           // radius, fall phase s, turning direction, flash
    uniform vec2 uCoreSpin;       // the core's spin and swirl since its picture was last made
    uniform float uCoreOn;
    uniform float uPull;
    uniform vec4 uB[5];           // falling rings: r, θ, radius, opacity (0 = none)
    uniform vec4 uBQ[5];          // stretch, atlas slot, flash
    uniform sampler2D uAtlas;     // six 256² snapshots: the core, then the falling rings
    varying vec2 vUv;

    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    // The ink falls in: wound into arms near the core and scrolled outward as s runs 0 → 1.
    vec2 flowIn(vec2 z, float s) {
      float q = min(1.0, uCore.x * uCore.x / max(dot(z, z), 1e-4));
      return rot(uCore.z * q * (1.5 + 1.2 * uPull * s)) * z * exp(0.4 * uPull * q * s);
    }

    vec3 rainbow(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.333, 0.667))); }
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

    vec3 shade(vec2 z, vec2 n) {
      if (uBase < 0.5) return shadeTangle(z);
      if (uBase < 1.5) return shadeInk(z);
      if (uBase < 2.5) return shadeDrift(z);
      return shadeSilk(z, n);
    }
    // Silk's field, carried along with the ink
    vec2 silkN(vec2 z) {
      vec2 fz = z * 1.3 + 0.3 * vec2(sin(uClock * 0.029), cos(uClock * 0.037));
      return vec2(fbm(fz + vec2(0.0, uClock * 0.045)), fbm(fz + vec2(5.2, 1.3) - uClock * 0.038));
    }
    vec3 fallen(vec2 z, float s) {
      z = flowIn(z, s);
      return shade(z, uBase > 2.5 ? silkN(z) : vec2(0.0));
    }

    // A snapshot at d (in its own radii), turned by spin, and the middle by the swirl too: φ(ρ) = spin + swirl (1 − ρ²)².
    vec3 snapAt(float slot, vec2 sv, vec2 d) {
      float a = sv.x + sv.y * pow(max(0.0, 1.0 - dot(d, d)), 2.0);
      float c = cos(a), s = sin(a);
      d = mat2(c, -s, s, c) * d;
      return texture2D(uAtlas, vec2((slot + 0.5 + 0.49 * d.x) / 6.0, 0.5 + 0.49 * d.y)).rgb;
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z0 = (frag - 0.5 * uResolution) * px;
      bool ink = uBase > 0.5 && uBase < 1.5;
      // the paper breathes: a slow, low-frequency warp (smooth, so once per pixel)
      vec2 breathe = (ink ? uBreathe : 0.0) * 0.05 * (vec2(fbm3(z0 * 1.1 + vec2(0.0, uClock * 0.06)), fbm3(z0 * 1.1 + vec2(4.3, 1.9) - uClock * 0.05)) - 0.5);
      // line boil: a sub-pixel shudder, re-hashed 12 times a second
      float frame = floor(uClock * 12.0);
      vec2 shudder = (ink ? uShudder : 0.0) * 0.8 * px * (vec2(hash(vec2(frame, 3.1)), hash(vec2(frame, 7.7))) - 0.5);
      // two copies of the fall, half a cycle apart, each faded out before it jumps back
      float s1 = uCore.y, s2 = fract(uCore.y + 0.5);
      float w1 = uPull > 1e-3 ? 1.0 - abs(2.0 * s1 - 1.0) : 1.0;
      vec3 col = vec3(0.0);
      for (int j = 0; j < 2; j++) {            // 2 samples, diagonally
        vec2 zz = (frag + vec2(j == 0 ? -0.25 : 0.25) - 0.5 * uResolution) * px + breathe + shudder;
        col += w1 * fallen(zz, s1);
        if (w1 < 0.999) col += (1.0 - w1) * fallen(zz, s2);
      }
      col *= 0.5;
      vec2 z = z0;
      if (ink) col += vec3(0.035, 0.02, 0.05) * (0.7 + 0.6 * noise(z * 60.0)) + vec3(0.02, 0.0, 0.04) * noise(z * 2.0 + uClock * 0.02);

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      float m = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.4 * m)) / max(m, 1e-4);

      float Rc = uCore.x, rp = length(z);
      col *= 1.0 - 0.45 * (1.0 - smoothstep(Rc, 1.7 * Rc, rp));   // the ink thins as it goes in

      // the caught rings, drawn out along their orbits as they fall
      for (int k = 0; k < 5; k++) {
        vec4 B = uB[k];
        if (B.w <= 0.0) continue;
        float e = uBQ[k].x;
        float da = mod(atan(z.y, z.x) - B.y + 3.14159265, 6.2831853) - 3.14159265;
        vec2 uv = vec2(da * B.x / (B.z * e), (rp - B.x) * e / B.z);   // along the orbit, across it
        float r = length(uv);
        if (r >= 1.0) continue;
        vec2 t = vec2(-sin(B.y), cos(B.y)), rr = vec2(cos(B.y), sin(B.y));
        vec3 snap = snapAt(uBQ[k].y, vec2(0.0), uv.x * t + uv.y * rr) * (1.0 + uBQ[k].z);
        col = mix(col, snap, (1.0 - smoothstep(0.75, 1.0, r)) * B.w);
      }

      // the core: everything it has eaten, the oldest in the middle, wound by its spin and swirl
      if (uCoreOn > 0.5) {
        vec2 d = z / Rc;
        float r = length(d);
        vec3 core = snapAt(0.0, uCoreSpin, d * min(1.0, 0.999 / max(r, 1e-4))) * (1.0 + 0.6 * uCore.w);
        col = mix(col, core, 1.0 - smoothstep(0.95, 1.0, r));
        // the rim glows in the colour beneath it, brighter for a moment when it eats
        col += core * (0.3 + 1.2 * uCore.w) * exp(-pow((r - 1.0) * 12.0, 2.0));
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
      uCore: { value: [0.25, 0, 1, 0] },
      uCoreSpin: { value: [0, 0] },
      uCoreOn: { value: 0 },
      uPull: { value: 1 },
      uB: { value: new Float32Array(20) },
      uBQ: { value: new Float32Array(20) },
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
    const C = L.core;
    const Rc = p.core;

    // Everything runs on the motion clock, so it keeps pace with `speed` and with
    // smooth recording. Going back in time (a reset) starts the core afresh.
    if (m.clock < L.clock - 1e-3) {
      L.rings.length = L.feeds.length = 0;
      Object.assign(C, { spin: 0, swirl: 0, w: 0, W: 0, flash: 0 });
      L.coreReady = false;
    }
    const dt = Math.min(0.1, Math.max(0, m.clock - L.clock));
    L.clock = m.clock;
    L.roundness = p.roundness;
    L.Rc = Rc;

    // the core turns and swirls, and settles
    C.spin += C.w * dt;
    C.swirl += C.W * dt;
    C.w *= Math.exp(-dt / (3 * p.settle));
    C.W *= Math.exp(-dt / p.settle);
    C.flash *= Math.exp(-3 * dt);

    // the rings fall in on a spiral, after a moment to be seen
    for (const b of L.rings) {
      if (m.clock - b.caught < 0.6) continue;
      b.r -= 0.1 * p.pull * (1 + Rc / b.r) * dt;
      b.th += L.dir * Math.min(4, 0.45 * Math.sqrt(p.pull) * b.r ** -1.5) * dt;
    }
    // and are swallowed at the rim: wrapped round it (in render, in order), and they stir the core
    L.rings = L.rings.filter((b) => {
      if (b.r > Rc) return true;
      const share = Math.min(0.6, (b.R / Rc) ** 2); // its area, as a share of the core's
      L.feeds.push({ slot: b.slot, ang: b.th, a: Math.sqrt(1 - share), old: [C.spin, C.swirl] });
      C.spin = C.swirl = 0; // baked into the new picture
      C.W += L.dir * 3 * p.spin * share;
      C.w += L.dir * 0.75 * p.spin * share;
      C.flash = 1;
      L.eaten++;
      return false;
    });

    u.uB.value.fill(0);
    u.uBQ.value.fill(0);
    L.rings.forEach((b, k) => {
      const e = Math.max(1, Math.min((b.r0 / b.r) ** 1.2, (2.5 * b.r) / b.R)); // pulled out along the orbit
      u.uB.value.set([b.r, b.th, b.R, smooth((m.clock - b.caught) / 0.4)], 4 * k);
      u.uBQ.value.set([e, b.slot, 0.6 * Math.exp(-3 * (m.clock - b.caught)), 0], 4 * k);
    });
    u.uCore.value = [Rc, (m.clock / 4) % 1, L.dir, C.flash];
    u.uCoreSpin.value = [C.spin, C.swirl];
    u.uCoreOn.value = L.coreReady ? 1 : 0;
    u.uPull.value = p.pull;
    u.uAtlas.value = L.atlas;
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
    // The ring finder: the picture blurred at 1/4 → ring score at a short side
    // of 72 → read back → the best ring is copied into an atlas slot (1..5; slot
    // 0 is the core).
    const soft = rt(4);
    const softB = rt(4);
    const scanH = 72;
    const scanDims = (w, h) => [Math.round((scanH * w) / Math.min(w, h)), Math.round((scanH * h) / Math.min(w, h))];
    const scanRT = new THREE.WebGLRenderTarget(...scanDims(ctx.size.width, ctx.size.height), { depthBuffer: false });
    let scanBuf = new Uint8Array(scanRT.width * scanRT.height * 4);
    const atlas = new THREE.WebGLRenderTarget(256 * 6, 256, { depthBuffer: false });
    atlas.scissorTest = true;
    const feedRT = new THREE.WebGLRenderTarget(256, 256, { depthBuffer: false }); // the atlas can't be read while drawn into
    const feedMat = mat(FEED_FRAG, {
      uAtlas: { value: atlas.texture },
      uSlot: { value: 1 },
      uAng: { value: 0 },
      uA: { value: 0.8 },
      uOld: { value: new THREE.Vector2() },
    });
    const toSlot = (r, material, slot) => {
      atlas.viewport.set(256 * slot, 0, 256, 256);
      atlas.scissor.copy(atlas.viewport); // the clear before a render ignores the viewport: keep it to this slot
      pass(r, material, atlas);
    };
    const feed = (r, g) => {
      const U = feedMat.uniforms;
      U.uSlot.value = g.slot;
      U.uAng.value = g.ang;
      U.uA.value = g.a;
      U.uOld.value.set(...g.old);
      pass(r, feedMat, feedRT);
      copyMat.uniforms.tSrc.value = feedRT.texture;
      toSlot(r, copyMat, 0);
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
        if (Math.hypot(x, y) < lens.Rc + R + 0.05) continue; // not in or touching the core
        if (lens.rings.some((b) => Math.hypot(x - b.r * Math.cos(b.th), y - b.r * Math.sin(b.th)) < R + 2 * b.R + 0.03)) continue;
        best = { score, x, y, R };
      }
      if (!best) return;
      const slot = [1, 2, 3, 4, 5].find((s) => !lens.rings.some((b) => b.slot === s));
      captureMat.uniforms.uDisc.value.set(best.x, best.y, best.R);
      toSlot(r, captureMat, slot);
      const r0 = Math.hypot(best.x, best.y);
      lens.rings.push({ r: r0, r0, th: Math.atan2(best.y, best.x), R: best.R, slot, caught: lens.clock });
    };

    // update() writes plain numbers here; render() copies them into the materials.
    const lens = { on: true, flare: {}, comp: {}, rings: [], feeds: [], clock: 0, lastScan: -1, roundness: 0.45, Rc: 0.25, atlas: atlas.texture };
    lens.core = { spin: 0, swirl: 0, w: 0, W: 0, flash: 0 };
    lens.dir = 1; // everything turns the same way (anticlockwise)
    lens.eaten = 0;
    lens.coreReady = false;
    const apply = (material, values) => {
      for (const k in values) material.uniforms[k].value = values[k];
    };

    ctx.pipeline = {
      render(r, sceneToDraw, camera, target) {
        for (const g of lens.feeds.splice(0)) feed(r, g); // in order: each one builds on the core the last one made
        r.setRenderTarget(scene);
        r.render(sceneToDraw, camera);
        if (!lens.coreReady) {
          // the core starts as whatever was at the centre
          captureMat.uniforms.uDisc.value.set(0, 0, lens.Rc);
          toSlot(r, captureMat, 0);
          lens.coreReady = true;
        }
        if (lens.rings.length < 5 && Math.abs(lens.clock - lens.lastScan) >= 0.5) {
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
        lens.rings.length = 0;
      },
    };

    lens.dispose = () => {
      delete ctx.pipeline;
      for (const t of [scene, bright, flareRT, soft, softB, scanRT, atlas, feedRT, ...levels.flatMap((lv) => [lv.a, lv.b])]) t.dispose();
      for (const m of [brightMat, copyMat, blurMat, flareMat, compMat, scanMat, captureMat, feedMat]) m.dispose();
      quad.geometry.dispose();
    };
    return { lens };
  },

  dispose(ctx, state) {
    state.lens.dispose();
  },
};
