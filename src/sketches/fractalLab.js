import { TAU } from '../lib/motion.js';
import { caption } from '../lib/bit.js';

// Fractal Lab: one fractal with every dial we could think of, each explained in plain words.
//
// The idea behind every picture here: each pixel is a starting point p₀ in the plane. A rule (the
// "formula") is applied to it over and over, p₀ → p₁ → p₂ → …, and the pixel's colour is one fact about
// that journey: did it run off to infinity and how fast, how close did it come to some shape (an "orbit
// trap"), which way was it pointing at the end. Neighbouring starting points can have wildly different
// journeys, and that sensitivity is what makes the endless detail.
//
// Formulas (z is p written as a complex number x + iy; z^d is "multiply the angle by d, raise the length
// to the d"):
//   Kali            p ↦ |p| / |p|^α − c       mirror into one quarter, turn inside-out, shift
//   Mandelbrot      z ↦ z^d + p₀,  z starts at c (0 is the classic set)
//   Julia           z ↦ z^d + c,   z starts at p₀
//   Burning Ship    z ↦ (|x| + i|y|)^d + p₀   mirror first, then power
//   Tricorn         z ↦ conj(z)^d + p₀        reflect across the x-axis, then power
//   Mandelbox 2D    box fold, circle fold, z ↦ s z + p₀ with s = −(α + ½)
// Every formula can also turn p by a fixed angle each step ("spin per step").
//
// You can tap anywhere: the orbit of that point (its first 32 steps) is drawn over the picture, and the
// first steps are written out in the equation panel, computed in JavaScript with the same rule as the
// shader. Without a tap the probe wanders by itself.
//
// Every param has a plain-English help line (shown under its slider) and sits in a group, so the panel
// reads top to bottom as: what shape, where you look, what colour means, light, lens tricks, overlays.

const FORMULAS = ['Kali (fold & flip)', 'Mandelbrot', 'Julia', 'Burning Ship', 'Tricorn', 'Mandelbox 2D'];
const COLOURINGS = ['Closest to axes & circle', 'Closest to a dot', 'Closest to a cross', 'Closest to a ring', 'Escape speed', 'Stripes (average angle)', 'Final direction'];
const PALETTES = ['Rainbow', 'Fire', 'Ice', 'Neon', 'Gold & ink', 'Moonlight'];
const ORBIT_N = 32;

// Picking a formula from the menu loads values that show it well (presets set their own).
const FORMULA_DEFAULTS = [
  { cX: 0.8, cY: 0.62, power: 2.15, zoom: -0.35, panX: 0, panY: 0, iterations: 18, colourBy: 0, autoTour: 1 },
  { cX: 0, cY: 0, power: 2, zoom: -0.3, panX: -0.6, panY: 0, iterations: 64, colourBy: 4, autoTour: 0 },
  { cX: -0.8, cY: 0.156, power: 2, zoom: -0.4, panX: 0, panY: 0, iterations: 48, colourBy: 4, autoTour: 1 },
  { cX: 0, cY: 0, power: 2, zoom: -0.3, panX: -0.45, panY: -0.5, iterations: 48, colourBy: 4, autoTour: 0 },
  { cX: 0, cY: 0, power: 2, zoom: -0.2, panX: -0.2, panY: 0, iterations: 48, colourBy: 4, autoTour: 0 },
  { cX: 0, cY: 0, power: 2, zoom: -1.3, panX: 0, panY: 0, iterations: 20, colourBy: 4, autoTour: 0 },
];

const G1 = '1 · Shape: the rule';
const G2 = '2 · Camera: where you look';
const G3 = '3 · Colour: what a colour means';
const G4 = '4 · Light & depth';
const G5 = '5 · Lens tricks (just for looks)';
const G6 = '6 · Teaching overlays';
const G7 = '7 · Motion';

// Plain-words story of each formula, for the equation panel.
const STORIES = [
  ['Mirror p into the top-right quarter (take absolute values),', 'turn it inside-out around the unit circle, shift by c.'],
  ['Square z (double its angle, square its length),', 'add the pixel. Pixels whose z never escapes are the set.'],
  ['Same squaring rule, but every pixel adds the same c;', 'the pixel is where z starts. Each c gives a new Julia set.'],
  ['Mirror z into the top-right quarter first, then square', 'and add the pixel. The mirror makes the hard "ship" edges.'],
  ['Reflect z across the x-axis, then square and add', 'the pixel. Three-fold symmetry instead of the bulb.'],
  ['Fold z back into a box, flip it out of a small circle,', 'scale by s and add the pixel. Architecture in 2D.'],
];

// ---- the same rule in JavaScript, for the probe's orbit -------------------------------------------
function cpow(x, y, d) {
  const r = Math.hypot(x, y);
  if (r === 0) return [0, 0];
  const a = Math.atan2(y, x) * d;
  const rd = Math.pow(r, d);
  return [rd * Math.cos(a), rd * Math.sin(a)];
}

function stepJS(f, p, p0, c, alpha) {
  let [x, y] = p;
  if (f === 0) {
    const r2 = Math.max(x * x + y * y, 1e-12);
    const k = 1 / Math.pow(r2, alpha / 2);
    return [Math.abs(x) * k - c[0], Math.abs(y) * k - c[1]];
  }
  if (f === 5) {
    x = Math.max(-1, Math.min(1, x)) * 2 - x;
    y = Math.max(-1, Math.min(1, y)) * 2 - y;
    const r2 = x * x + y * y;
    const k = r2 < 0.25 ? 4 : r2 < 1 ? 1 / r2 : 1;
    const s = -(alpha + 0.5);
    return [x * k * s + p0[0], y * k * s + p0[1]];
  }
  if (f === 3) { x = Math.abs(x); y = Math.abs(y); }
  if (f === 4) y = -y;
  const [a, b] = cpow(x, y, alpha);
  const add = f === 2 ? c : p0;
  return [a + add[0], b + add[1]];
}

function viewMap(z, m) {
  const cs = Math.cos(m.rot), sn = Math.sin(m.rot);
  return [m.pan[0] + (cs * z[0] - sn * z[1]) / m.zoom, m.pan[1] + (sn * z[0] + cs * z[1]) / m.zoom];
}

function prepare(q, params, t) {
  // kaleidoscope: fold the angle into one wedge of 2π/n, mirrored
  let [x, y] = q;
  const n = Math.round(params.symmetry);
  if (n > 1) {
    const w = TAU / n;
    let a = Math.atan2(y, x);
    a = ((a % w) + w) % w;
    a = Math.abs(a - w / 2);
    const r = Math.hypot(x, y);
    x = r * Math.cos(a); y = r * Math.sin(a);
  }
  if (params.warp > 0) {
    const wx = 0.15 * params.warp * Math.sin(3 * y + 0.5 * t);
    const wy = 0.15 * params.warp * Math.sin(3 * x - 0.4 * t);
    x += wx; y += wy;
  }
  return [x, y];
}

function orbitJS(start, m, params) {
  const f = Math.round(params.formula);
  const p0 = start;
  let p = f === 1 || f === 3 || f === 4 ? [...m.c] : f === 5 ? [...p0] : [...p0];
  const pts = [p];
  let escaped = -1;
  const sc = Math.cos(params.spin), ss = Math.sin(params.spin);
  for (let i = 0; i < Math.min(params.iterations, ORBIT_N - 1); i++) {
    p = stepJS(f, p, p0, m.c, m.alpha);
    if (params.spin !== 0) p = [sc * p[0] - ss * p[1], ss * p[0] + sc * p[1]];
    pts.push(p);
    if (escaped < 0 && p[0] * p[0] + p[1] * p[1] > (f === 0 ? 1e4 : 256)) { escaped = i + 1; break; }
  }
  return { pts, escaped };
}

const opt = (labels) => ({ step: 1, min: 0, max: labels.length - 1, options: labels });

export default {
  name: 'Fractal Lab',
  description:
    'One fractal, every dial: six formulas (Kali, Mandelbrot, Julia, Burning Ship, Tricorn, Mandelbox), six ways ' +
    'to turn a journey into colour, light, lens tricks and teaching overlays, each explained in plain words ' +
    'under its slider. Tap anywhere to see that point\'s journey drawn step by step.',
  tags: ['fractal', 'kali', 'mandelbrot', 'julia', 'explorer', 'interactive', 'teaching'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  motion(t, params) {
    const f = Math.round(params.formula);
    const tour = params.autoTour > 0.5;
    const w = TAU * t / 50;
    let c = [params.cX, params.cY];
    if (tour) {
      if (f === 0) c = [params.cX + 0.18 * Math.cos(w), params.cY + 0.18 * Math.sin(2 * w) * 0.6];
      else if (f === 2) c = [0.7885 * Math.cos(w * 0.5 + 2.2), 0.7885 * Math.sin(w * 0.5 + 2.2)];
      else c = [params.cX + 0.25 * Math.cos(w), params.cY + 0.25 * Math.sin(w)];
    }
    const alpha = params.power + (tour ? 0.08 * Math.sin(w * 0.7) : 0);
    const zoom = Math.exp(params.zoom) * (1 + params.zoomPulse * 0.25 * Math.sin(TAU * t / 13));
    // drift is measured in screens, so it stays gentle at any zoom
    const pan = [params.panX + (params.drift * 0.3 * Math.sin(TAU * t / 37)) / zoom, params.panY + (params.drift * 0.3 * Math.sin(TAU * t / 29)) / zoom];
    const rot = params.rotate + params.drift * 0.15 * Math.sin(TAU * t / 41);
    const m = { c, alpha, zoom, pan, rot, t, f };

    // the probe: a tapped point, or a slow wander
    const tap = params.__tap;
    const zs = tap && params.probe > 0.5 ? tap : [0.55 * Math.sin(TAU * t / 23), 0.4 * Math.sin(TAU * t / 17 + 1)];
    const start = prepare(viewMap(zs, m), params, t);
    const orb = orbitJS(start, m, params);
    return { ...m, probeScreen: zs, start, orbit: orb.pts, escaped: orb.escaped };
  },

  latex: (params, hl, m) => {
    const f = m.f;
    const c = `(${hl(m.c[0], 3)},\\ ${hl(m.c[1], 3)})`;
    const a = hl(m.alpha, 2);
    const eq = [
      `p &\\mapsto \\frac{|p|}{|p|^{${a}}} - c,\\quad c = ${c}`,
      `z &\\mapsto z^{${a}} + p_0,\\quad z_0 = ${c}`,
      `z &\\mapsto z^{${a}} + c,\\quad c = ${c},\\ z_0 = p_0`,
      `z &\\mapsto (|x| + i|y|)^{${a}} + p_0,\\quad z_0 = ${c}`,
      `z &\\mapsto \\bar z^{\\,${a}} + p_0,\\quad z_0 = ${c}`,
      `z &\\mapsto ${hl(-(m.alpha + 0.5), 2)}\\cdot\\text{fold}(z) + p_0`,
    ][f];
    const fmt = (p) => `(${p[0].toFixed(2)},\\,${p[1].toFixed(2)})`;
    const pts = m.orbit.slice(0, 3).map(fmt).join('\\to ');
    const fate = m.escaped > 0 ? `\\text{escapes at step } ${m.escaped}` : `\\text{stays (${m.orbit.length - 1} steps)}`;
    const [s1, s2] = STORIES[f];
    return (
      '\\begin{aligned}' +
      `${eq} \\\\` +
      `& ${caption(s1)} \\\\` +
      `& ${caption(s2)} \\\\` +
      `\\text{journey: } & ${pts}\\to\\cdots \\\\` +
      `& ${fate}` +
      '\\end{aligned}'
    );
  },

  params: {
    formula: { value: 0, ...opt(FORMULAS), group: G1, label: 'Formula', help: 'The rule repeated on every pixel. Each one gives a different family of shapes.' },
    power: { value: 2.15, min: 1.2, max: 5, step: 0.01, group: G1, label: 'Power', help: 'Kali: how hard it turns inside out. Mandelbrot-type: the exponent (2 = classic, 3 = three arms). Mandelbox: the scale.' },
    cX: { value: 0.8, min: -1.5, max: 1.5, step: 0.001, group: G1, label: 'Constant c (x)', help: 'The fixed shift added every step. Tiny changes reshape the whole picture. With Auto tour on, c circles around this value.' },
    cY: { value: 0.62, min: -1.5, max: 1.5, step: 0.001, group: G1, label: 'Constant c (y)', help: 'The other half of c. For Julia it picks which Julia set; for Mandelbrot-type it is where z starts.' },
    iterations: { value: 18, min: 2, max: 64, step: 1, group: G1, label: 'Steps', help: 'How many times the rule repeats. More steps = finer detail, but slower.' },
    spin: { value: 0, min: -1.5, max: 1.5, step: 0.01, group: G1, label: 'Spin per step', help: 'Turn the point by this angle after every step. Bends everything into spirals.' },
    symmetry: { value: 1, min: 1, max: 12, step: 1, group: G1, label: 'Kaleidoscope', help: 'Copy one pie slice around the centre this many times, mirrored, like a kaleidoscope. 1 = off.' },
    warp: { value: 0, min: 0, max: 2, step: 0.01, group: G1, label: 'Liquid warp', help: 'Ripple the plane with slow waves before the rule starts. Makes it look poured.' },

    zoom: { value: -0.35, min: -1.5, max: 6, step: 0.01, group: G2, label: 'Zoom', help: 'Magnification, on a log scale: +2.3 is 10× closer.' },
    panX: { value: 0, min: -2.5, max: 2.5, step: 0.001, group: G2, label: 'Move left/right', help: 'Slide the view sideways (in the units of the rule).' },
    panY: { value: 0, min: -2.5, max: 2.5, step: 0.001, group: G2, label: 'Move up/down', help: 'Slide the view up or down.' },
    rotate: { value: 0, min: -3.1416, max: 3.1416, step: 0.01, group: G2, label: 'Turn view', help: 'Rotate the camera (the picture itself does not change).' },
    drift: { value: 0.3, min: 0, max: 1.5, step: 0.01, group: G2, label: 'Drift', help: 'Let the camera wander and turn slowly on its own.' },
    zoomPulse: { value: 0.3, min: 0, max: 1, step: 0.01, group: G2, label: 'Zoom pulse', help: 'Breathe in and out a little.' },
    smoothing: { value: 1, ...opt(['Off (fast)', '4 samples', '9 samples']), group: G2, label: 'Edge smoothing', help: 'Average several points inside each pixel so fine lines stop flickering. Costs speed.' },

    colourBy: { value: 0, ...opt(COLOURINGS), group: G3, label: 'Colour means…', help: 'Which fact about each point\'s journey becomes its colour. Axes & circle / dot / cross / ring: how close the journey passed to that shape (bright = very close). Escape speed: how fast it ran away. Stripes: the average direction it pointed. Final direction: where it pointed at the end.' },
    trapSize: { value: 0.5, min: 0, max: 2, step: 0.01, group: G3, label: 'Trap shape size', help: 'Where the dot sits, how far the cross is offset, or the ring\'s radius. Turn on "Show trap" to see it.' },
    depthFade: { value: 0.8, min: 0, max: 3, step: 0.01, group: G3, label: 'Depth fade', help: 'Make later steps count for less. High = big clean shapes drawn by the first few steps; 0 = every step counts, which looks like grain.' },
    backdrop: { value: 0.5, min: 0, max: 2, step: 0.01, group: G3, label: 'Backdrop', help: 'A soft colour wash behind the lines, from where the first step landed. 0 = black background.' },
    lineWidth: { value: 0.35, min: 0.02, max: 1, step: 0.01, group: G3, label: 'Line thickness', help: 'How close counts as "close" for the trap colourings. Small = thin sharp lace, large = soft fat strokes.' },
    palette: { value: 0, ...opt(PALETTES), group: G3, label: 'Palette', help: 'The set of colours the value is looked up in.' },
    hueShift: { value: 0, min: 0, max: 1, step: 0.01, group: G3, label: 'Hue shift', help: 'Slide every colour along the palette.' },
    colourSpread: { value: 1, min: 0.1, max: 4, step: 0.01, group: G3, label: 'Colour spread', help: 'How fast colour changes from step to step. High = many bands.' },
    colourCycle: { value: 0.15, min: 0, max: 2, step: 0.01, group: G3, label: 'Colour cycling', help: 'Scroll the palette over time, so colours flow through the shape.' },
    saturation: { value: 1, min: 0, max: 1.6, step: 0.01, group: G3, label: 'Saturation', help: '0 = black and white, 1 = normal, higher = louder colours.' },
    brightness: { value: 1, min: 0.2, max: 3, step: 0.01, group: G3, label: 'Brightness', help: 'Overall exposure. Highlights roll off softly, never to flat white.' },
    contrast: { value: 1, min: 0.5, max: 2, step: 0.01, group: G3, label: 'Contrast', help: 'Push darks darker and lights lighter.' },
    invert: { value: 0, ...opt(['Off', 'On']), group: G3, label: 'Invert', help: 'Swap light and dark: lace on a bright page.' },

    relief: { value: 0.6, min: 0, max: 2, step: 0.01, group: G4, label: 'Relief (3D look)', help: 'Treat brightness as height, like a landscape, and shine a light across it. Turns flat colour into carved metal.' },
    lightAngle: { value: 0.8, min: -3.1416, max: 3.1416, step: 0.01, group: G4, label: 'Light direction', help: 'Which side the relief light comes from.' },
    shine: { value: 0.4, min: 0, max: 1.5, step: 0.01, group: G4, label: 'Shine', help: 'Glossy highlights on the relief, like polish.' },
    glow: { value: 0.6, min: 0, max: 2, step: 0.01, group: G4, label: 'Glow', help: 'A soft halo of light around the brightest lines, as if they were neon.' },
    outline: { value: 0, min: 0, max: 2, step: 0.01, group: G4, label: 'Ink outline', help: 'Draw dark lines wherever colour changes sharply, like a comic.' },

    fringe: { value: 0, min: 0, max: 2, step: 0.01, group: G5, label: 'Colour fringing', help: 'Red and blue drift apart toward the edges, like a cheap lens or 3D glasses. (Called chromatic aberration.) Costs speed.' },
    vignette: { value: 0.5, min: 0, max: 1.5, step: 0.01, group: G5, label: 'Dark corners', help: 'Darken the corners to pull your eye to the middle. (Called vignette.)' },
    grain: { value: 0.15, min: 0, max: 1, step: 0.01, group: G5, label: 'Film grain', help: 'Fine flickering noise, like old film.' },
    scanlines: { value: 0, min: 0, max: 1, step: 0.01, group: G5, label: 'TV lines', help: 'Horizontal stripes like an old CRT television.' },

    showOrbit: { value: 1, ...opt(['Off', 'On']), group: G6, label: 'Show a journey', help: 'Draw one point\'s journey: dot 0 is where it starts, each line is one step of the rule. Tap the picture to choose the point.' },
    probe: { value: 0, ...opt(['Wanders', 'Where I tapped']), group: G6, label: 'Journey starts…', help: 'Let the starting point wander by itself, or keep it where you tapped. Tapping switches this on.' },
    orbitSteps: { value: 8, min: 2, max: ORBIT_N - 1, step: 1, group: G6, label: 'Journey length', help: 'How many steps of the journey to draw. Chaotic orbits jump all over; a few steps are easier to follow.' },
    showTrap: { value: 0, ...opt(['Off', 'On']), group: G6, label: 'Show trap', help: 'Draw the dot, cross or ring the colouring measures distance to.' },
    showGrid: { value: 0, ...opt(['Off', 'On']), group: G6, label: 'Show axes & unit circle', help: 'The x and y axes and the circle |p| = 1. For Kali, points inside the circle get flung outside it.' },

    speed: { value: 1, min: 0, max: 3, step: 0.01, group: G7, label: 'Speed', help: 'How fast everything that moves by itself moves. 0 = freeze.' },
    autoTour: { value: 1, ...opt(['Off', 'On']), group: G7, label: 'Auto tour', help: 'Move c (and the power) slowly by itself so the shape keeps changing. Off = only your sliders.' },
  },

  actions: {
    lace: { label: 'Kali lace', run: (ctx, st) => preset(ctx, st, { ...FORMULA_DEFAULTS[0], formula: 0, palette: 0 }) },
    mandel: { label: 'Classic Mandelbrot', run: (ctx, st) => preset(ctx, st, { formula: 1, power: 2, cX: 0, cY: 0, colourBy: 4, palette: 0, iterations: 64, symmetry: 1, zoom: -0.3, panX: -0.6, panY: 0, autoTour: 0 }) },
    julia: { label: 'Julia spirals', run: (ctx, st) => preset(ctx, st, { formula: 2, power: 2, colourBy: 4, palette: 2, iterations: 48, symmetry: 1, zoom: -0.4, panX: 0, panY: 0, autoTour: 1 }) },
    ship: { label: 'Burning ship', run: (ctx, st) => preset(ctx, st, { formula: 3, power: 2, cX: 0, cY: 0, colourBy: 4, palette: 1, iterations: 56, zoom: 3.2, panX: -1.755, panY: -0.03, symmetry: 1, autoTour: 0 }) },
    kaleido: { label: 'Kaleidoscope', run: (ctx, st) => preset(ctx, st, { formula: 0, power: 2.2, cX: 0.75, cY: 0.4, colourBy: 0, palette: 4, symmetry: 6, warp: 0.4, glow: 1, zoom: -0.3 }) },
    random: { label: 'Surprise me', run: (ctx, st) => preset(ctx, st, surprise()) },
  },

  fragmentShader: `
    uniform vec2 uResolution;
    uniform float uTime, uClock;
    uniform int uFormula, uColourBy, uPalette, uSmooth, uSymmetry;
    uniform vec2 uC, uPan;
    uniform float uAlpha, uZoom, uRot, uIter, uSpin, uWarp;
    uniform float uDepth, uBack, uTrap, uWidth, uHue, uSpread, uCycle, uSat, uBright, uContrast, uInvert;
    uniform float uRelief, uLight, uShine, uGlow, uOutline;
    uniform float uFringe, uVignette, uGrain, uScan;
    uniform float uShowOrbit, uShowTrap, uShowGrid, uOrbitN;
    uniform vec2 uOrbit[${ORBIT_N}];
    varying vec2 vUv;

    vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
    vec2 cpow(vec2 z, float d) {
      float r = length(z);
      if (r == 0.0) return vec2(0.0);
      float a = atan(z.y, z.x) * d;
      return pow(r, d) * vec2(cos(a), sin(a));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    vec3 palette(float x) {
      if (uPalette == 1) return clamp(vec3(1.5 * x, 1.5 * x - 0.5, 2.0 * x - 1.4), 0.0, 1.0) * 0.6 + 0.4 * (0.5 + 0.5 * cos(6.2831 * (x * 0.3 + vec3(0.0, 0.08, 0.15))));
      if (uPalette == 2) return 0.5 + 0.5 * cos(6.2831 * (x * 0.7 + vec3(0.55, 0.6, 0.68)));
      if (uPalette == 3) return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.85, 0.15, 0.5)));
      if (uPalette == 4) return 0.5 + 0.5 * cos(6.2831 * (x * 0.5 + vec3(0.02, 0.1, 0.22)));
      if (uPalette == 5) return vec3(0.75, 0.82, 1.0) * (0.55 + 0.45 * cos(6.2831 * x));
      return 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.0, 0.333, 0.667)));
    }

    vec2 viewMap(vec2 z) {
      float c = cos(uRot), s = sin(uRot);
      return uPan + mat2(c, s, -s, c) * z / uZoom;
    }

    vec2 prepare(vec2 q) {
      if (uSymmetry > 1) {
        float w = 6.2831853 / float(uSymmetry);
        float a = atan(q.y, q.x);
        a = mod(a, w);
        a = abs(a - 0.5 * w);
        q = length(q) * vec2(cos(a), sin(a));
      }
      if (uWarp > 0.0) q += 0.15 * uWarp * vec2(sin(3.0 * q.y + 0.5 * uClock), sin(3.0 * q.x - 0.4 * uClock));
      return q;
    }

    // One pixel: run the rule, return colour (rgb) and a value for relief (a).
    vec4 shade(vec2 z) {
      vec2 p0 = prepare(viewMap(z));
      vec2 p = (uFormula == 1 || uFormula == 3 || uFormula == 4) ? uC : p0;
      float bail = uFormula == 0 ? 1e4 : 256.0;
      float trap = 1e9, trapStep = 0.0, glowAcc = 0.0;
      float stripe = 0.0, n = 0.0, escaped = 0.0, r1 = 0.0;
      vec2 sc = vec2(cos(uSpin), sin(uSpin));
      for (int i = 0; i < 64; i++) {
        if (float(i) >= uIter) break;
        if (uFormula == 0) {
          float r2 = max(dot(p, p), 1e-12);
          p = abs(p) / pow(r2, 0.5 * uAlpha) - uC;
        } else if (uFormula == 5) {
          p = clamp(p, -1.0, 1.0) * 2.0 - p;
          float r2 = dot(p, p);
          float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
          p = p * k * -(uAlpha + 0.5) + p0;
        } else {
          vec2 q = p;
          if (uFormula == 3) q = abs(q);
          if (uFormula == 4) q.y = -q.y;
          p = cpow(q, uAlpha) + (uFormula == 2 ? uC : p0);
        }
        if (uSpin != 0.0) p = cmul(p, sc);
        n += 1.0;

        if (i == 0) r1 = length(p);
        float d;
        if (uColourBy == 0) d = min(min(abs(p.x), abs(p.y)), abs(length(p) - 1.0));
        else if (uColourBy == 2) d = min(abs(p.x - uTrap), abs(p.y - uTrap));
        else if (uColourBy == 3) d = abs(length(p) - uTrap);
        else d = length(p - vec2(uTrap, 0.0));
        float dw = d * (1.0 + uDepth * float(i));        // later steps count for less
        if (dw < trap) { trap = dw; trapStep = float(i); }
        glowAcc += exp(-dw * 6.0 / uWidth) / (1.0 + float(i));
        stripe += 0.5 + 0.5 * sin(3.0 * atan(p.y, p.x));

        float r2 = dot(p, p);
        if (r2 > bail) { escaped = 1.0; break; }
      }

      float v, inten;
      if (uColourBy <= 3) {
        float w = 0.1 * uWidth;
        inten = pow(w / (trap + w), 2.0) * 1.6 + uGlow * 0.04 * glowAcc;
        v = trapStep * 0.14 + 0.05 * r1;
      } else if (uColourBy == 4) {
        if (escaped > 0.5) {
          float nu = n + 1.0 - log2(max(log(dot(p, p)) * 0.5, 1e-6) / log(2.0)) / log2(max(uAlpha, 1.01));
          v = sqrt(max(nu, 0.0)) * 0.22;           // square root: more bands near the edge
          inten = 0.9 + uGlow * 0.6 * exp(-nu * 0.08);
        } else { v = 0.0; inten = uFormula == 0 ? 0.6 : 0.0; }
      } else if (uColourBy == 5) {
        v = stripe / max(n, 1.0);
        inten = escaped > 0.5 || uFormula == 0 ? 0.95 : 0.25;
      } else {
        v = atan(p.y, p.x) / 6.2831 + 0.5;
        inten = escaped > 0.5 || uFormula == 0 ? 0.95 : 0.2;
      }
      float hue = uHue + uCycle * uClock * 0.05;
      vec3 col = palette(v * uSpread + hue) * inten;
      // the backdrop: a soft wash from where the first step landed
      col += uBack * 0.14 * palette(hue + 0.5 + 0.12 * log(r1 + 0.05));
      return vec4(col, v * uSpread);
    }

    vec4 sampled(vec2 z, float px) {
      if (uSmooth == 0) return shade(z);
      vec4 s = vec4(0.0);
      int m = uSmooth == 1 ? 2 : 3;
      float fm = float(m);
      for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
        if (i >= m || j >= m) continue;
        s += shade(z + (vec2(float(i), float(j)) + 0.5 - 0.5 * fm) / fm * px);
      }
      return s / (fm * fm);
    }

    float segDist(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
      return length(pa - ba * h);
    }

    void main() {
      vec2 frag = vUv * uResolution;
      float px = 1.0 / (0.5 * min(uResolution.x, uResolution.y));
      vec2 z = (frag - 0.5 * uResolution) * px;

      vec4 s = sampled(z, px);
      vec3 col = s.rgb;
      if (uFringe > 0.0) {
        vec2 off = z * uFringe * 0.012;
        col.r = sampled(z + off, px).r;
        col.b = sampled(z - off, px).b;
      }

      // relief: brightness as a height field, lit from one side
      float h = dot(col, vec3(0.3, 0.5, 0.2)) + 0.15 * s.a;
      vec2 g = vec2(dFdx(h), dFdy(h)) / px * 0.004;
      if (uRelief > 0.0) {
        vec3 n = normalize(vec3(-g * uRelief * 6.0, 1.0));
        vec3 L = normalize(vec3(cos(uLight), sin(uLight), 0.9));
        float lit = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
        col *= mix(1.0, 0.35 + 0.9 * lit, clamp(uRelief, 0.0, 1.0));
        col += uShine * spec * 0.5 * clamp(uRelief, 0.0, 1.0) * (0.3 + col);
      }
      if (uOutline > 0.0) col *= 1.0 - clamp(length(g) * uOutline * 40.0, 0.0, 0.85);

      // tone: saturation, contrast, exposure that rolls off instead of clipping
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = max(mix(vec3(lum), col, uSat), 0.0);
      col *= uBright;
      float mx = max(max(col.r, col.g), col.b);
      col *= (1.0 - exp(-1.3 * mx)) / max(mx, 1e-4);
      col = clamp(0.5 + (col - 0.5) * uContrast, 0.0, 1.0);
      if (uInvert > 0.5) col = 1.0 - col;
      col = max(col, vec3(0.012, 0.01, 0.02) * (1.0 - uInvert));

      // overlays, in the rule's own coordinates mapped back to the screen
      float ic = cos(uRot), is = sin(uRot);
      mat2 back = mat2(ic, -is, is, ic);
      #define TO_SCREEN(q) (back * ((q) - uPan) * uZoom)
      if (uShowGrid > 0.5) {
        vec2 o = TO_SCREEN(vec2(0.0));
        vec2 ax = back * vec2(1.0, 0.0), ay = back * vec2(0.0, 1.0);
        float d = min(abs(dot(z - o, vec2(-ax.y, ax.x))), abs(dot(z - o, vec2(-ay.y, ay.x))));
        d = min(d, abs(length(z - o) - uZoom));
        col = mix(col, vec3(0.85, 0.9, 1.0), 0.55 * smoothstep(1.5 * px, 0.0, d));
      }
      if (uShowTrap > 0.5 && uColourBy >= 1 && uColourBy <= 3) {
        float d;
        vec2 o = TO_SCREEN(vec2(0.0));
        if (uColourBy == 1) d = abs(length(z - TO_SCREEN(vec2(uTrap, 0.0))) - 4.0 * px);
        else if (uColourBy == 3) d = abs(length(z - o) - uTrap * uZoom);
        else {
          vec2 a = TO_SCREEN(vec2(uTrap, 0.0)), b = TO_SCREEN(vec2(0.0, uTrap));
          vec2 ax = back * vec2(1.0, 0.0), ay = back * vec2(0.0, 1.0);
          d = min(abs(dot(z - a, vec2(-ay.y, ay.x))), abs(dot(z - b, vec2(-ax.y, ax.x))));
        }
        col = mix(col, vec3(1.0, 0.85, 0.3), 0.8 * smoothstep(1.8 * px, 0.0, d));
      }
      if (uShowOrbit > 0.5) {
        float dl = 1e9, dd = 1e9, idx = 0.0;
        vec2 prev = TO_SCREEN(uOrbit[0]);
        dd = length(z - prev);
        for (int i = 1; i < ${ORBIT_N}; i++) {
          if (float(i) >= uOrbitN) break;
          vec2 q = TO_SCREEN(uOrbit[i]);
          dl = min(dl, segDist(z, prev, q) * (1.0 + 0.25 * float(i)));    // later steps fainter
          float e = length(z - q);
          if (e < dd) { dd = e; idx = float(i); }
          prev = q;
        }
        col = mix(col, vec3(1.0), 0.45 * smoothstep(1.4 * px, 0.0, dl));
        vec3 dotCol = idx == 0.0 ? vec3(1.0) : 0.6 + 0.4 * cos(6.2831 * (idx / 12.0 + vec3(0.0, 0.33, 0.67)));
        float r = (idx == 0.0 ? 7.0 : 4.5) * px;
        col = mix(col, vec3(0.0), smoothstep(r + 2.5 * px, r + 0.5 * px, dd) * 0.8);
        col = mix(col, dotCol, smoothstep(r, r - 1.5 * px, dd));
      }

      // lens tricks
      vec2 v = vUv - 0.5;
      col *= 1.0 - uVignette * 0.9 * dot(v, v) * 2.0;
      col += uGrain * 0.08 * (hash(frag + fract(uClock * 7.13) * 100.0) - 0.5);
      col *= 1.0 - uScan * 0.35 * (0.5 + 0.5 * sin(frag.y * 3.14159 * 0.66));
      gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
    }
  `,

  uniforms() {
    return {
      uClock: { value: 0 },
      uFormula: { value: 0 }, uColourBy: { value: 0 }, uPalette: { value: 0 }, uSmooth: { value: 1 }, uSymmetry: { value: 1 },
      uC: { value: [0.62, 0.52] }, uPan: { value: [0, 0] },
      uAlpha: { value: 2 }, uZoom: { value: 1 }, uRot: { value: 0 }, uIter: { value: 18 }, uSpin: { value: 0 }, uWarp: { value: 0 },
      uDepth: { value: 0.8 }, uBack: { value: 0.5 }, uTrap: { value: 0.5 }, uWidth: { value: 0.35 }, uHue: { value: 0 }, uSpread: { value: 1 }, uCycle: { value: 0 },
      uSat: { value: 1 }, uBright: { value: 1 }, uContrast: { value: 1 }, uInvert: { value: 0 },
      uRelief: { value: 0.6 }, uLight: { value: 0.8 }, uShine: { value: 0.4 }, uGlow: { value: 0.6 }, uOutline: { value: 0 },
      uFringe: { value: 0 }, uVignette: { value: 0.5 }, uGrain: { value: 0.15 }, uScan: { value: 0 },
      uShowOrbit: { value: 1 }, uShowTrap: { value: 0 }, uShowGrid: { value: 0 }, uOrbitN: { value: 0 },
      uOrbit: { value: new Float32Array(ORBIT_N * 2) },
    };
  },

  setup(ctx) {
    const el = ctx.domElement;
    let down = false;
    const toPlane = (e) => {
      const r = el.getBoundingClientRect();
      const s = 0.5 * Math.min(r.width, r.height);
      return [(e.clientX - r.left - r.width / 2) / s, -(e.clientY - r.top - r.height / 2) / s];
    };
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      down = true;
      ctx.params.__tap = toPlane(e);
      ctx.params.probe = 1;
    };
    const onMove = (e) => { if (down) ctx.params.__tap = toPlane(e); };
    const onUp = () => { down = false; };
    el?.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return { off: () => {
      el?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    } };
  },

  update(ctx, state) {
    const m = ctx.motion;
    const p = ctx.params;
    const u = state.uniforms;
    const f = Math.round(p.formula);
    if (state.lastFormula === undefined) state.lastFormula = f;
    if (f !== state.lastFormula) {
      state.lastFormula = f;
      Object.assign(p, FORMULA_DEFAULTS[f]);
    }
    u.uClock.value = ctx.motionTime;
    u.uFormula.value = m.f;
    u.uColourBy.value = Math.round(p.colourBy);
    u.uPalette.value = Math.round(p.palette);
    u.uSmooth.value = Math.round(p.smoothing);
    u.uSymmetry.value = Math.round(p.symmetry);
    u.uC.value = m.c;
    u.uPan.value = m.pan;
    u.uAlpha.value = m.alpha;
    u.uZoom.value = m.zoom;
    u.uRot.value = m.rot;
    u.uIter.value = p.iterations;
    u.uSpin.value = p.spin;
    u.uWarp.value = p.warp;
    u.uTrap.value = p.trapSize;
    u.uDepth.value = p.depthFade;
    u.uBack.value = p.backdrop;
    u.uWidth.value = p.lineWidth;
    u.uHue.value = p.hueShift;
    u.uSpread.value = p.colourSpread;
    u.uCycle.value = p.colourCycle;
    u.uSat.value = p.saturation;
    u.uBright.value = p.brightness;
    u.uContrast.value = p.contrast;
    u.uInvert.value = p.invert;
    u.uRelief.value = p.relief;
    u.uLight.value = p.lightAngle;
    u.uShine.value = p.shine;
    u.uGlow.value = p.glow;
    u.uOutline.value = p.outline;
    u.uFringe.value = p.fringe;
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uScan.value = p.scanlines;
    u.uShowOrbit.value = p.showOrbit;
    u.uShowTrap.value = p.showTrap;
    u.uShowGrid.value = p.showGrid;
    const o = u.uOrbit.value;
    const n = Math.min(m.orbit.length, Math.round(p.orbitSteps) + 1, ORBIT_N);
    for (let i = 0; i < n; i++) {
      // far-flung points (an escaping orbit) are clamped so the line still points the right way
      const [x, y] = m.orbit[i];
      const r = Math.hypot(x, y), k = r > 50 ? 50 / r : 1;
      o[2 * i] = x * k; o[2 * i + 1] = y * k;
    }
    u.uOrbitN.value = n;
  },

  dispose(ctx, state) {
    state.off?.();
  },
};

function preset(ctx, state, values) {
  const defaults = { spin: 0, warp: 0, rotate: 0, symmetry: 1, autoTour: 1, hueShift: 0 };
  Object.assign(ctx.params, defaults, values);
  state.lastFormula = Math.round(ctx.params.formula);
}

function surprise() {
  const r = (a, b) => a + Math.random() * (b - a);
  const pick = (n) => Math.floor(Math.random() * n);
  const formula = Math.random() < 0.55 ? 0 : pick(FORMULAS.length);
  return {
    formula,
    power: formula === 0 ? r(1.6, 2.4) : formula === 5 ? r(1.2, 2.2) : pick(3) + 2,
    cX: formula === 0 ? r(0.3, 1.0) : r(-0.4, 0.4),
    cY: formula === 0 ? r(0.2, 0.9) : r(-0.4, 0.4),
    colourBy: pick(COLOURINGS.length),
    palette: pick(PALETTES.length),
    spin: Math.random() < 0.3 ? r(-0.4, 0.4) : 0,
    symmetry: Math.random() < 0.3 ? pick(6) + 3 : 1,
    warp: Math.random() < 0.3 ? r(0.2, 0.8) : 0,
    hueShift: Math.random(),
    iterations: formula === 0 ? 14 + pick(10) : 40,
    zoom: formula === 0 ? r(-0.6, 0) : formula === 5 ? -1.4 : r(-0.3, 0.3),
    panX: 0,
    panY: 0,
  };
}
