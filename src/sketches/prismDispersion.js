import { TAU, smooth, phaseOf } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Prism Dispersion. A beam of white light hits a 60° prism of SF11 glass (a dense flint, chosen because it spreads
// colours strongly). At each face the light bends by Snell's law, n₁ sin θ₁ = n₂ sin θ₂, and glass bends blue more
// than red because its refractive index n depends on wavelength. The Sellmeier formula with Schott's published
// coefficients for SF11 gives it:
//     n²(λ) = 1 + Σ Bᵢλ² / (λ² − Cᵢ)     → n = 1.806 (blue, 486 nm), 1.785 (yellow, 589 nm), 1.776 (red, 656 nm)
// (Checked in Python: n_d = 1.7845 and Abbe number 25.7, against Schott's 1.7847 and 25.68.)
// 24 wavelengths from 400 to 700 nm are traced through the prism as straight lines between the faces, each drawn in
// its own colour (the CIE 1931 colour-matching functions, Wyman et al. 2013 fits) and added together, so where they
// overlap they make white again. The prism turns slowly; the total bending (the deviation) is smallest when the
// light crosses the prism symmetrically: D_min = 2 asin(n sin 30°) − 60°, 66.3° for yellow.
// see docs/wiki/sketches/prismDispersion.md

const B = [1.73759695, 0.313747346, 1.89878101], C = [0.013188707, 0.0623068142, 155.23629];
const nOf = (nm) => { const l2 = (nm / 1000) ** 2; return Math.sqrt(1 + B.reduce((s, b, i) => s + (b * l2) / (l2 - C[i]), 0)); };
const APEX = Math.PI / 3;
const LOOP = 30;
const WAVES = Array.from({ length: 24 }, (_, i) => 400 + (i * 300) / 23);

// A wavelength's colour for drawing: CIE 1931 matching (Wyman et al. 2013 fits) → linear sRGB, clipped.
const lobe = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
function waveColour(l) {
  const X = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const Y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const Z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  const rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z].map((v) => Math.max(0, v));
  const top = Math.max(...rgb, 1e-6);
  return rgb.map((v) => Math.round(255 * (v / top) ** (1 / 2.2)));
}
const COLOURS = WAVES.map(waveColour);

// Bend direction d (unit) at a surface with unit normal nrm (pointing back towards where d came from), from index n1
// into n2. Returns the new direction, or null if the light is totally reflected.
function refract(d, nrm, n1, n2) {
  const r = n1 / n2, cos1 = -(d[0] * nrm[0] + d[1] * nrm[1]), k = 1 - r * r * (1 - cos1 * cos1);
  if (k < 0) return null;
  const f = r * cos1 - Math.sqrt(k);
  return [r * d[0] + f * nrm[0], r * d[1] + f * nrm[1]];
}

// Trace one ray through the prism (corners P, counter-clockwise). Returns the path's points and the final direction.
function trace(P, o, d, n) {
  const pts = [o];
  let inside = false;
  for (let bounce = 0; bounce < 4; bounce++) {
    let best = null;
    for (let e = 0; e < 3; e++) {
      const a = P[e], b = P[(e + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1];
      const den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && (!best || t < best.t)) {
        const len = Math.hypot(ex, ey);
        best = { t, out: [ey / len, -ex / len] };          // outward normal (corners counter-clockwise, y up)
      }
    }
    if (!best) break;
    const hit = [o[0] + d[0] * best.t, o[1] + d[1] * best.t];
    pts.push(hit);
    const nrm = inside ? [-best.out[0], -best.out[1]] : best.out;   // facing the incoming light
    const nd = inside ? refract(d, nrm, n, 1) : refract(d, nrm, 1, n);
    if (nd) { d = nd; inside = !inside; }
    else { const dot = d[0] * nrm[0] + d[1] * nrm[1]; d = [d[0] - 2 * dot * nrm[0], d[1] - 2 * dot * nrm[1]]; }
    o = hit;
    if (!inside) break;
  }
  return { pts, d };
}

const LIVE = { inc: 0, dRed: 0, dBlue: 0 };

export default {
  name: 'Prism Dispersion',
  description:
    'White light through a glass prism, traced ray by ray for 24 colours. Glass bends blue light more than red, so ' +
    'the colours fan out into a rainbow; where they overlap they add back up to white. The prism turns, and the bending ' +
    'is least when the light crosses it symmetrically. Real SF11 glass, real Sellmeier formula.',
  tags: ['optics', 'refraction', 'snell', 'dispersion', 'prism', 'rainbow', 'sellmeier'],
  category: 'Optics',
  mode: '3d',

  motion(t) {
    // Untilted, a level beam meets the left face at 30°. Turning the prism clockwise by φ makes it 30° + φ. The sweep runs
    // the angle of incidence from 55° to 85°. Below 56.4° SF11 traps violet (420 nm) inside, and below 53.4° blue
    // (486 nm): total internal reflection at the far face, which light can only leave at less than asin(1/n) ≈ 33°.
    const s = 0.5 - 0.5 * Math.cos(TAU * phaseOf(t, LOOP));
    return { tilt: -(25 + 30 * smooth(s)) * (Math.PI / 180) };          // negative = clockwise (y up)
  },

  latex: (params, hl) => {
    const nY = nOf(589), dmin = (2 * Math.asin(nY * Math.sin(APEX / 2)) - APEX) * (180 / Math.PI);
    const near = Math.abs(LIVE.dYellow - dmin) < 0.6;
    return (
      '\\begin{aligned}' +
      'n_1 \\sin\\theta_1 &= n_2 \\sin\\theta_2,\\quad n^2(\\lambda) = 1 + \\sum_i \\frac{B_i\\lambda^2}{\\lambda^2 - C_i} \\\\' +
      `n &= ${hl(nOf(486), 3)}\\ (\\text{blue}),\\ ${hl(nY, 3)}\\ (\\text{yellow}),\\ ${hl(nOf(656), 3)}\\ (\\text{red}) \\\\` +
      `\\theta_{\\text{in}} &= ${hl(LIVE.inc, 1)}^\\circ\\quad D = ${hl(LIVE.dBlue, 1)}^\\circ\\ (\\text{blue}),\\ ${hl(LIVE.dRed, 1)}^\\circ\\ (\\text{red}) \\\\` +
      `D_{\\text{min}} &= 2\\arcsin(n \\sin 30^\\circ) - 60^\\circ = ${hl(dmin, 1)}^\\circ\\ (\\text{yellow}) \\\\` +
      `& ${caption(near ? 'Minimum deviation: light crossing the prism dead level.' : LIVE.trapped ? 'Blue is trapped inside: total internal reflection.' : 'Blue bends more than red. Glass has favourites.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 1.1 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const a = state.stage.area, m = ctx.motion;
    // Work in units where the prism's side is 1, y up; draw with X, Y.
    const sc = Math.min(a.w / 3.2, a.h / 1.9), cx = a.x + a.w * 0.36, cy = a.y + a.h * 0.5;
    const X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
    const rot = (p) => [p[0] * Math.cos(m.tilt) - p[1] * Math.sin(m.tilt), p[0] * Math.sin(m.tilt) + p[1] * Math.cos(m.tilt)];
    const h = Math.sqrt(3) / 2;
    const P = [[-0.5, -h / 3], [0.5, -h / 3], [0, (2 * h) / 3]].map(rot);   // counter-clockwise

    // The beam: 7 parallel rays, coming in level from the left, aimed at the left face.
    const d0 = [1, 0];
    const leftMid = [(P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2];
    const rays = Array.from({ length: 7 }, (_, i) => [-3, leftMid[1] + (i - 3) * 0.025]);
    // Angle of incidence on the left face, and the deviation for blue, yellow and red (middle ray).
    const fx = P[2][0] - P[0][0], fy = P[2][1] - P[0][1], fl = Math.hypot(fx, fy);
    const outN = [-fy / fl, fx / fl];                                       // outward normal of the left face
    LIVE.inc = (Math.acos(Math.min(1, -(d0[0] * outN[0] + d0[1] * outN[1]))) * 180) / Math.PI;
    const dev = (nm) => { const r = trace(P, rays[3], d0, nOf(nm)); return (Math.atan2(-r.d[1], r.d[0]) * 180) / Math.PI; };
    LIVE.dBlue = dev(486); LIVE.dRed = dev(656); LIVE.dYellow = dev(589);
    LIVE.trapped = trace(P, rays[3], d0, nOf(420)).pts.length > 3;   // violet bounced inside before leaving

    // white light coming in
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 2;
    for (const o of rays) {
      const r = trace(P, o, d0, 1.0001);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(X(o[0]), Y(o[1])); g.lineTo(X(r.pts[1][0]), Y(r.pts[1][1])); g.stroke();
    }
    // each colour through the prism and out
    g.lineWidth = 1.6;
    WAVES.forEach((nm, w) => {
      const [r0, g0, b0] = COLOURS[w];
      g.strokeStyle = `rgba(${r0},${g0},${b0},0.22)`;
      for (const o of rays) {
        const r = trace(P, o, d0, nOf(nm));
        g.beginPath();
        g.moveTo(X(r.pts[1][0]), Y(r.pts[1][1]));
        for (let q = 2; q < r.pts.length; q++) g.lineTo(X(r.pts[q][0]), Y(r.pts[q][1]));
        const last = r.pts[r.pts.length - 1];
        g.lineTo(X(last[0] + r.d[0] * 6), Y(last[1] + r.d[1] * 6));
        g.stroke();
      }
    });
    g.globalCompositeOperation = 'source-over';
    // the prism
    g.strokeStyle = 'rgba(200,220,255,0.75)'; g.lineWidth = 1.5;
    g.fillStyle = 'rgba(120,160,220,0.08)';
    g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); g.fill(); g.stroke();
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
