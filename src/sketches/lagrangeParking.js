import { TAU } from '../lib/motion.js';
import { createStage, rng } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Lagrange Point Parking. The Earth and the Moon, seen from a camera that turns with the Moon, so both stand still.
// A small body here feels gravity from both, plus two effects of the turning frame: a push outwards (centrifugal)
// and a sideways push on anything moving (Coriolis). In units where the Earth–Moon distance, their total mass and
// the turning rate are all 1, with μ = 0.01215 the Moon's share of the mass (the circular restricted three-body
// problem):
//     Ω(x, y) = ½(x² + y²) + (1 − μ)/r₁ + μ/r₂,    ẍ − 2ẏ = ∂Ω/∂x,    ÿ + 2ẋ = ∂Ω/∂y
// The five Lagrange points are where all the pushes cancel. L1–L3 lie on the Earth–Moon line, found by solving
// ∂Ω/∂x = 0 (bisection, here); L4 and L5 make equilateral triangles with the Earth and Moon.
// Checked: L1 326,400 km from the Earth (58,000 km short of the Moon), L2 448,900 km (64,500 km beyond), L3 381,700 km
// on the far side. L1, L2 and L3 are balance points on a hilltop: a nudge grows (at L1, 2.7-fold every 1.5 days).
// L4 and L5 are stable because μ < 0.0385: the Coriolis push turns a drift into a slow loop ("tadpole" orbits).
// Rubber ducks are dropped 0.002 (770 km) from each point, at rest, and followed with a Runge–Kutta integrator.
// The same physics, with the Sun and Earth instead (μ = 3×10⁻⁶), puts L2 1.5 million km beyond the Earth: where JWST
// orbits, needing small engine burns to stay put.
// see docs/wiki/sketches/lagrangeParking.md

const MU = 0.01215, D_KM = 384400;
const LOOP = 45, SPAN = 60;                      // 60 time units (about 9 months) per loop
const r3 = (dx, dy) => { const r = Math.hypot(dx, dy); return r * r * r; };
function accel(x, y, vx, vy) {
  const a = 1 - MU, d1 = r3(x + MU, y), d2 = r3(x - 1 + MU, y);
  return [2 * vy + x - (a * (x + MU)) / d1 - (MU * (x - 1 + MU)) / d2, -2 * vx + y - (a * y) / d1 - (MU * y) / d2];
}
function rk4(s, h) {
  const f = ([x, y, vx, vy]) => { const [ax, ay] = accel(x, y, vx, vy); return [vx, vy, ax, ay]; };
  const k1 = f(s), k2 = f(s.map((v, i) => v + (h / 2) * k1[i])), k3 = f(s.map((v, i) => v + (h / 2) * k2[i])), k4 = f(s.map((v, i) => v + h * k3[i]));
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
const omegaX = (x) => x - ((1 - MU) * (x + MU)) / Math.abs(x + MU) ** 3 - (MU * (x - 1 + MU)) / Math.abs(x - 1 + MU) ** 3;
const bisect = (a, b) => { for (let i = 0; i < 100; i++) { const m = (a + b) / 2; if (omegaX(a) * omegaX(m) <= 0) b = m; else a = m; } return (a + b) / 2; };
const LP = [
  [bisect(0.5, 1 - MU - 1e-6), 0], [bisect(1 - MU + 1e-6, 1.5), 0], [bisect(-1.5, -MU - 1e-6), 0],
  [0.5 - MU, Math.sqrt(3) / 2], [0.5 - MU, -Math.sqrt(3) / 2],
];
const NAMES = ['L1', 'L2', 'L3', 'L4', 'L5'];

function dropDucks(seed) {
  const r = rng(seed), ducks = [];
  LP.forEach(([x, y], k) => {
    for (let q = 0; q < 5; q++) {
      const a = r() * TAU;
      ducks.push({ k, s: [x + 0.002 * Math.cos(a), y + 0.002 * Math.sin(a), 0, 0], trail: [], gone: false });
    }
  });
  return { ducks, t: 0 };
}

const LIVE = { t: 0, parked: [0, 0, 0, 0, 0] };

export default {
  name: 'Lagrange Point Parking',
  description:
    'The Earth and Moon seen from a camera turning with them, and five places where a rubber duck could park: the ' +
    'Lagrange points, where gravity and the turning balance. Drop ducks near each and watch. Three spots are hilltops ' +
    'and the ducks roll off; two are valleys guarded by the Coriolis effect, and the ducks loop round and stay.',
  tags: ['astronomy', 'orbits', 'three-body problem', 'lagrange points', 'jwst', 'gravity', 'humor'],
  category: 'Physics',
  mode: '3d',

  motion(t) {
    return { cyc: Math.floor(t / LOOP), tSim: ((t % LOOP) / LOOP) * SPAN };
  },

  latex: (params, hl, m) => {
    const days = (LIVE.t * 27.32) / TAU;
    const stay = LIVE.parked;
    return (
      '\\begin{aligned}' +
      '\\Omega &= \\tfrac12(x^2 + y^2) + \\frac{1-\\mu}{r_1} + \\frac{\\mu}{r_2},\\quad \\mu = 0.01215 \\\\' +
      '\\ddot x - 2\\dot y &= \\partial_x\\Omega,\\quad \\ddot y + 2\\dot x = \\partial_y\\Omega \\\\' +
      `&\\text{day } ${hl(days, 0)}:\\ \\text{ducks still parked} \\\\` +
      `&L_1\\,${stay[0]}/5\\ \\ L_2\\,${stay[1]}/5\\ \\ L_3\\,${stay[2]}/5\\ \\ L_4\\,${stay[3]}/5\\ \\ L_5\\,${stay[4]}/5 \\\\` +
      `& ${caption(days < 4 ? 'Ducks parked at all five points. For now.' : stay[0] + stay[1] + stay[2] === 0 ? 'L1, L2, L3: hilltops. L4, L5: valleys. Ducks voted with their feet.' : 'The hilltop ducks are starting to roll.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    const stage = createStage(ctx, { glow: 0.9 });
    return { stage, cyc: -1, sim: null, map: null, mapKey: '' };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    if (m.cyc !== state.cyc) { state.cyc = m.cyc; state.sim = dropDucks(m.cyc + 1); }
    const sim = state.sim;
    const H = 0.004;
    while (sim.t < m.tSim) {
      for (const d of sim.ducks) {
        if (d.gone) continue;
        d.s = rk4(d.s, H);
        if (Math.hypot(d.s[0], d.s[1]) > 2.2 || Math.hypot(d.s[0] + MU, d.s[1]) < 0.02 || Math.hypot(d.s[0] - 1 + MU, d.s[1]) < 0.006) d.gone = true;
      }
      sim.t += H;
      if (Math.round(sim.t / H) % 10 === 0) for (const d of sim.ducks) if (!d.gone) { d.trail.push(d.s[0], d.s[1]); if (d.trail.length > 600) d.trail.splice(0, 2); }
    }
    LIVE.t = sim.t;
    LIVE.parked = LP.map(([x, y], k) => sim.ducks.filter((d) => d.k === k && !d.gone && Math.hypot(d.s[0] - x, d.s[1] - y) < 0.1).length);

    // View: x from −1.45 to 1.45, y the same, fitted to a square.
    const sq = state.stage.square(6), sc = sq.s / 2.9, cx = sq.x + sq.s / 2, cy = sq.y + sq.s / 2;
    const X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
    // The landscape: contour lines of Ω (the "height" a duck feels), computed once per screen size.
    const key = `${Math.round(sq.s)}`;
    if (state.mapKey !== key) {
      state.mapKey = key;
      const R = 220, cv = document.createElement('canvas');
      cv.width = cv.height = R;
      const cg = cv.getContext('2d'), img = cg.createImageData(R, R);
      for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const x = -1.45 + (2.9 * (i + 0.5)) / R, y = 1.45 - (2.9 * (j + 0.5)) / R;
        const om = 0.5 * (x * x + y * y) + (1 - MU) / Math.hypot(x + MU, y) + MU / Math.hypot(x - 1 + MU, y);
        const v = Math.log(om), band = Math.abs(((v * 18) % 1) - 0.5) * 2;
        const line = Math.max(0, 1 - band * 6), base = Math.max(0, Math.min(1, (2.2 - v) * 0.9));
        const k = (j * R + i) * 4;
        img.data[k] = 20 + 40 * base + 120 * line; img.data[k + 1] = 24 + 60 * base + 140 * line; img.data[k + 2] = 50 + 110 * base + 200 * line; img.data[k + 3] = 255;
      }
      cg.putImageData(img, 0, 0);
      state.map = cv;
    }
    g.save();
    g.beginPath(); g.rect(sq.x, sq.y, sq.s, sq.s); g.clip();          // keep escaping ducks inside the frame
    g.globalAlpha = 0.55;
    g.drawImage(state.map, sq.x, sq.y, sq.s, sq.s);
    g.globalAlpha = 1;
    // Earth, Moon (sizes exaggerated), the Moon's orbit as seen from outside
    g.strokeStyle = 'rgba(150,170,210,0.3)'; g.setLineDash([3, 5]);
    g.beginPath(); g.arc(X(-MU), Y(0), sc, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgb(90,160,255)'; g.beginPath(); g.arc(X(-MU), Y(0), 9, 0, TAU); g.fill();
    g.fillStyle = 'rgb(210,210,200)'; g.beginPath(); g.arc(X(1 - MU), Y(0), 4.5, 0, TAU); g.fill();
    // Lagrange points
    g.font = state.stage.font(12); g.textAlign = 'center';
    LP.forEach(([x, y], k) => {
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(x) - 5, Y(y)); g.lineTo(X(x) + 5, Y(y)); g.moveTo(X(x), Y(y) - 5); g.lineTo(X(x), Y(y) + 5); g.stroke();
      g.fillStyle = 'rgba(230,235,250,0.85)'; g.fillText(NAMES[k], X(x), Y(y) - 10);
    });
    // Ducks and their trails: yellow, like any respectable rubber duck.
    for (const d of sim.ducks) {
      if (d.trail.length > 3) {
        g.strokeStyle = d.k >= 3 ? 'rgba(255,215,90,0.55)' : 'rgba(255,150,90,0.55)'; g.lineWidth = 1.2;
        g.beginPath();
        for (let q = 0; q < d.trail.length; q += 2) (q ? g.lineTo(X(d.trail[q]), Y(d.trail[q + 1])) : g.moveTo(X(d.trail[q]), Y(d.trail[q + 1])));
        g.stroke();
      }
      if (!d.gone) { g.fillStyle = 'rgb(255,225,80)'; g.beginPath(); g.arc(X(d.s[0]), Y(d.s[1]), 3.2, 0, TAU); g.fill(); }
    }
    g.restore();
    g.fillStyle = 'rgba(210,220,240,0.7)'; g.textAlign = 'left'; g.font = state.stage.font(11);
    g.fillText(`L1 ${Math.round((LP[0][0] + MU) * D_KM).toLocaleString('en')} km from Earth · L2 ${Math.round((LP[1][0] + MU) * D_KM).toLocaleString('en')} km`, sq.x, sq.y + sq.s + 14);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
