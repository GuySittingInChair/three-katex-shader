import { smooth } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Mirage. Light travels slightly slower in denser air, so it bends towards denser (cooler) air. Air's refractive
// index is about n = 1 + 2.93×10⁻⁴ × (273.15 K / T) at sea-level pressure, and the paraxial ray equation (rays almost
// level) is y″ = dn/dy: a ray curves towards larger n.
// Act 1, hot road: the air touching the road is ΔT warmer, T(y) = 293 K + ΔT e^(−y/0.15 m). Rays aimed slightly
// down curve back up before touching the road, so you see sky (and an upside-down copy of the distant robot) where
// the road should be: the "puddle". Checked in Node: with ΔT = 20 K, rays down to 0.34° below level come back up,
// grazing the road about 300 m ahead.
// Act 2, cold sea: cold air sits under warm, T(y) = 293 K − ΔT e^(−y/2 m). Rays curve down towards the cold layer,
// so distant things appear lifted and stretched ("looming"; in strong layers, a Fata Morgana).
// The side view is stretched upwards (about 80 times on a laptop screen; the label shows the actual figure): real
// mirage angles are tiny, a fraction of a degree.
// see docs/wiki/sketches/mirage.md

const EYE = 1.6, ROBOT_X = 450, ROBOT_H = 3, XMAX = 640, DX = 0.5, RAYS = 90;
const LOOP = 40;
const nAir = (T) => 1 + 2.93e-4 * (273.15 / T);

function makeAir(act, dT) {
  const h = act === 0 ? 0.15 : 2.0, sign = act === 0 ? 1 : -1;
  const T = (y) => 293 + sign * dT * Math.exp(-Math.max(0, y) / h);
  const dndy = (y) => (nAir(T(y + 1e-3)) - nAir(T(y - 1e-3))) / 2e-3;
  return { T, dndy };
}
// Trace a ray from the eye with starting slope s; returns its path and what it hits (robot, road or sky).
function traceRay(air, s) {
  let x = 0, y = EYE, v = s;
  const pts = [[x, y]];
  while (x < XMAX) {
    const y0 = y;
    v += air.dndy(y) * (1 + v * v) * DX;
    y += v * DX; x += DX;
    if (x >= ROBOT_X && x - DX < ROBOT_X && y >= 0 && y <= ROBOT_H) { pts.push([x, y]); return { pts, hit: 'robot', at: y }; }
    if (y <= 0) { pts.push([x, 0]); return { pts, hit: 'road' }; }
    if (pts.length < 400 && Math.floor(x / 8) !== Math.floor((x - DX) / 8)) pts.push([x, y]);
    if (y > 8 && y > y0) { pts.push([x, y]); return { pts, hit: 'sky' }; }
  }
  pts.push([x, y]);
  return { pts, hit: 'sky' };
}

const LIVE = { direct: 0, copies: 0 };

export default {
  name: 'Mirage',
  description:
    'Light bends towards cooler, denser air. Over a hot road it curves back up before reaching the ground, so the ' +
    'road ahead shows a patch of sky and an upside-down copy of a distant robot: the puddle that never gets closer. ' +
    'Over a cold sea it curves down instead and the robot looms. Every ray traced through the real temperature layer.',
  tags: ['optics', 'refraction', 'mirage', 'atmosphere', 'ray tracing', 'fata morgana'],
  category: 'Optics',
  mode: '3d',

  motion(t) {
    const u = t % LOOP;
    if (u < 24) return { act: 0, dT: 25 * smooth(Math.min(1, u / 14)) };
    return { act: 1, dT: 10 * smooth(Math.min(1, (u - 24) / 10)) };
  },

  latex: (params, hl, m) => {
    const line = m.act === 0
      ? m.dT < 3 ? 'Road and air the same temperature. Nothing to see.' : LIVE.copies ? 'An upside-down robot on the road. It is the sky, bent.' : 'The puddle appears ahead. It will never get closer.'
      : 'Cold air under warm: rays curve down; the robot looms.';
    return (
      '\\begin{aligned}' +
      'n &= 1 + 2.93\\times10^{-4}\\,\\frac{273.15\\,\\text{K}}{T},\\quad y\'\' = \\frac{dn}{dy} \\\\' +
      (m.act === 0
        ? `T(y) &= 293\\,\\text{K} + ${hl(m.dT, 1)}\\,\\text{K}\\ e^{-y/0.15\\,\\text{m}}\\quad \\text{(hot road)} \\\\`
        : `T(y) &= 293\\,\\text{K} - ${hl(m.dT, 1)}\\,\\text{K}\\ e^{-y/2\\,\\text{m}}\\quad \\text{(cold sea)} \\\\`) +
      `&\\text{rays hitting the robot: } ${LIVE.direct} \\text{ upright}` + (m.act === 0 ? `,\\ ${LIVE.copies} \\text{ flipped}` : '') + ' \\\\' +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.8 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const a = state.stage.area, m = ctx.motion;
    const air = makeAir(m.act, m.dT);
    // Side view on top (x: 0–640 m across, y: 0–6 m up), "what you see" strip on the right.
    const vw = a.w * 0.8, vh = a.h * 0.62, vx = a.x, vy = a.y + a.h * 0.05;
    const X = (x) => vx + (x / XMAX) * vw, Y = (y) => vy + vh - (y / 6) * vh;
    // sky, road
    const sky = g.createLinearGradient(0, vy, 0, vy + vh);
    sky.addColorStop(0, 'rgb(14,22,48)'); sky.addColorStop(1, 'rgb(40,60,110)');
    g.fillStyle = sky; g.fillRect(vx, vy, vw, vh);
    g.fillStyle = m.act === 0 ? 'rgb(52,44,40)' : 'rgb(20,40,60)';
    g.fillRect(vx, Y(0), vw, 6);
    // the robot
    g.fillStyle = 'rgb(255,200,90)';
    const rw = 6;
    g.fillRect(X(ROBOT_X) - rw / 2, Y(ROBOT_H), rw, Y(0) - Y(ROBOT_H));
    g.beginPath(); g.arc(X(ROBOT_X), Y(ROBOT_H) - 5, 5, 0, Math.PI * 2); g.fill();
    // the eye
    g.fillStyle = 'white'; g.beginPath(); g.arc(X(0) + 3, Y(EYE), 4, 0, Math.PI * 2); g.fill();

    // The fan of rays: slopes from −0.55° to +0.12°.
    const view = [];
    let direct = 0, copies = 0;
    for (let i = 0; i < RAYS; i++) {
      const s = ((-0.55 + (0.67 * i) / (RAYS - 1)) * Math.PI) / 180;
      const r = traceRay(air, s);
      view.push({ s, r });
      if (r.hit === 'robot') {
        // a flipped copy: the ray reached the robot going upwards after having dipped below it
        const minY = Math.min(...r.pts.map((p) => p[1]));
        const flipped = minY < r.at - 1e-6 && r.pts[r.pts.length - 1][1] > r.pts[r.pts.length - 2][1];
        r.flipped = flipped;
        if (flipped) copies++; else direct++;
      }
      g.strokeStyle = r.hit === 'robot' ? (r.flipped ? 'rgba(255,110,60,0.8)' : 'rgba(255,200,90,0.75)') : r.hit === 'road' ? 'rgba(150,110,80,0.35)' : 'rgba(120,180,255,0.45)';
      g.lineWidth = r.hit === 'robot' ? 1.6 : 1;
      g.beginPath();
      r.pts.forEach((p, k) => (k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
    }
    LIVE.direct = direct; LIVE.copies = copies;

    // What you see: each ray's colour, highest ray at the top.
    const sx = vx + vw + a.w * 0.06, sw = a.w * 0.12;
    const rowH = vh / RAYS;
    view.forEach((v, i) => {
      const yy = vy + vh - (i + 1) * rowH;
      g.fillStyle = v.r.hit === 'robot' ? (v.r.flipped ? 'rgb(255,110,60)' : 'rgb(255,210,100)') : v.r.hit === 'road' ? (m.act === 0 ? 'rgb(70,58,50)' : 'rgb(25,55,80)') : 'rgb(70,110,190)';
      g.fillRect(sx, yy, sw, rowH + 0.5);
    });
    g.strokeStyle = 'rgba(200,210,230,0.6)'; g.lineWidth = 1; g.strokeRect(sx, vy, sw, vh);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(210,220,240,0.8)'; g.textAlign = 'center';
    g.fillText('what you see', sx + sw / 2, vy + vh + 16);
    g.fillStyle = 'rgb(255,210,100)'; g.fillText('robot', sx + sw / 2, vy + vh + 30);
    g.fillStyle = 'rgb(255,110,60)'; g.fillText('flipped robot', sx + sw / 2, vy + vh + 44);
    g.textAlign = 'left';
    const stretch = (vh / 6) / (vw / XMAX);            // how much more a metre up is drawn than a metre across
    g.fillText(`side view, stretched upwards ×${Math.round(stretch)} (0–640 m across, 0–6 m up)`, vx, vy + vh + 16);
    // Temperature profile, small, under the view.
    const ty = vy + vh + 30, th = a.h * 0.22, tw = a.w * 0.35;
    g.strokeStyle = 'rgba(255,150,90,0.9)'; g.lineWidth = 1.6; g.beginPath();
    for (let q = 0; q <= 40; q++) {
      const y = (q / 40) * 2, T = air.T(y);
      const x = vx + ((T - 280) / 40) * tw, yy = ty + th - (y / 2) * th;
      if (q) g.lineTo(x, yy); else g.moveTo(x, yy);
    }
    g.stroke();
    g.fillStyle = 'rgba(210,220,240,0.7)';
    g.fillText('air temperature, 0–2 m up (280–320 K across)', vx, ty - 4);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
