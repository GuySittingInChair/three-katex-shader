import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Foucault's Pendulum. In 1851 Léon Foucault hung a 28 kg ball on a 67 m wire in the Panthéon in Paris; over the
// day its swing slowly turned, clockwise, proving the Earth spins. Nothing pushes the swing round: the floor turns
// underneath it. At the North Pole the floor turns a full circle in one sidereal day (23.93 h); at latitude φ only
// the part of the Earth's spin about the local vertical counts, so the swing plane turns at
//     ω = Ω sin φ = 15.04° per hour × sin φ,    once round every 23.93 h / |sin φ|
// Paris (48.85° N): 11.3° an hour, 31.8 h. At the equator it doesn't turn at all; in the south it turns the other way.
// Left: seen from the stars, the swing stays in one plane and the floor turns under it. Right: seen standing on the
// floor, the floor is still and the swing turns. Same pendulum, two points of view.
// Time-lapse: one hour a second. The swing itself is drawn slowed down (a real 67 m pendulum swings once every
// 16.4 s, so in an hour-a-second time-lapse it would be a blur); the turning rate is the real one.
// see docs/wiki/sketches/foucaultPendulum.md

const OMEGA_DEG_H = 360 / 23.9345;               // the Earth's spin, degrees per hour (sidereal day)
const PLACES = [['North Pole', 90], ['Oslo', 59.91], ['Paris, the Panthéon', 48.85], ['Quito', -0.18], ['Sydney', -33.87]];
const STAY = 12;                                 // seconds (= hours) at each place
const SWING = 1.1;                               // drawn swings per second

const LIVE = { place: '', lat: 90, hours: 0, turned: 0 };

export default {
  name: "Foucault's Pendulum",
  description:
    'A pendulum swinging over a floor on the spinning Earth, in time-lapse. Seen from the stars it swings in one fixed ' +
    'plane while the floor turns beneath it; seen from the floor, the swing slowly turns round. At the pole once a day, ' +
    'in Paris once every 32 hours, at the equator never, and in Sydney the other way.',
  tags: ['physics', 'foucault pendulum', 'coriolis', 'rotating frame', 'earth rotation', 'astronomy'],
  category: 'Physics',
  mode: '3d',

  motion(t) {
    const i = Math.floor(t / STAY) % PLACES.length, hours = t % STAY;
    const [name, lat] = PLACES[i];
    const rate = OMEGA_DEG_H * Math.sin((lat * Math.PI) / 180);       // degrees per hour, + = counter-clockwise from above
    return { i, name, lat, hours, rate, t };
  },

  latex: (params, hl, m) => {
    const s = Math.sin((m.lat * Math.PI) / 180);
    const period = Math.abs(s) > 0.01 ? 23.93 / Math.abs(s) : null;
    const dir = m.lat > 0.5 ? 'clockwise' : m.lat < -0.5 ? 'anticlockwise' : 'not at all';
    return (
      '\\begin{aligned}' +
      '\\omega &= \\Omega\\sin\\varphi = 15.04^\\circ/\\text{h} \\times \\sin\\varphi \\\\' +
      `\\varphi &= ${hl(m.lat, 2)}^\\circ\\ (\\text{${m.name}}):\\ \\omega = ${hl(Math.abs(m.rate), 2)}^\\circ/\\text{h},\\ \\text{${dir}} \\\\` +
      `T &= \\frac{23.93\\,\\text{h}}{|\\sin\\varphi|} = ${period ? `${hl(period, 1)}\\ \\text{h}` : '\\infty'} \\\\` +
      `&\\text{after } ${hl(m.hours, 1)}\\ \\text{h: turned } ${hl(Math.abs(m.rate * m.hours), 1)}^\\circ \\\\` +
      `& ${caption(period ? 'The pendulum is not turning. You are.' : 'At the equator the floor does not turn under it. Nor does it.')}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 0.9 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area;
    // The floor's turn under the stars, and the swing's turn on the floor, in radians (counter-clockwise from above
    // counts positive; in the north the floor turns counter-clockwise, so the swing turns clockwise on it).
    const floorTurn = ((m.rate * m.hours) * Math.PI) / 180;
    const R = Math.min(a.w / 4.4, a.h / 2.4) * (state.stage.wide ? 1 : 1.5);
    const centres = state.stage.wide
      ? [[a.x + a.w * 0.25, a.y + a.h * 0.5], [a.x + a.w * 0.75, a.y + a.h * 0.5]]
      : [[a.x + a.w * 0.5, a.y + a.h * 0.25], [a.x + a.w * 0.5, a.y + a.h * 0.75]];
    const rr = state.stage.wide ? R : Math.min(R, a.h * 0.22);
    const phase = TAU * SWING * m.t;
    [['seen from the stars', floorTurn, 0], ['seen standing on the floor', 0, -floorTurn]].forEach(([label, floorAng, swingAng], k) => {
      const [cx, cy] = centres[k];
      // the floor: a disc with compass tiles, turned by floorAng
      g.save(); g.translate(cx, cy); g.rotate(-floorAng);           // canvas y is down, so negate to turn anticlockwise
      g.fillStyle = 'rgb(22,26,38)'; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,140,190,0.35)'; g.lineWidth = 1;
      for (let q = 0; q < 24; q++) { const ang = (q / 24) * TAU; g.beginPath(); g.moveTo(Math.cos(ang) * rr * 0.86, Math.sin(ang) * rr * 0.86); g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); g.stroke(); }
      g.fillStyle = 'rgba(200,210,240,0.8)'; g.font = state.stage.font(11); g.textAlign = 'center';
      ['N', 'E', 'S', 'W'].forEach((d, q) => { const ang = -Math.PI / 2 + (q * Math.PI) / 2; g.fillText(d, Math.cos(ang) * rr * 0.78, Math.sin(ang) * rr * 0.78 + 4); });
      g.restore();
      // the swing: a bob going back and forth along a line turned by swingAng, leaving a fading trail
      const dir = -swingAng;
      const amp = rr * 0.7;
      g.strokeStyle = 'rgba(255,200,110,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - Math.cos(dir) * amp, cy - Math.sin(dir) * amp); g.lineTo(cx + Math.cos(dir) * amp, cy + Math.sin(dir) * amp); g.stroke();
      // sand trace: the last few hours of swings, each at the plane it had then
      g.lineWidth = 1.1;
      for (let q = 0; q < 60; q++) {
        const back = q * 0.08;                                        // hours ago
        if (back > m.hours) break;
        const ang = k === 1 ? -(((m.rate * (m.hours - back)) * Math.PI) / 180) : 0;
        g.strokeStyle = `rgba(255,170,90,${0.35 * (1 - q / 60)})`;
        g.beginPath(); g.moveTo(cx - Math.cos(-ang) * amp, cy - Math.sin(-ang) * amp); g.lineTo(cx + Math.cos(-ang) * amp, cy + Math.sin(-ang) * amp); g.stroke();
      }
      const bx = cx + Math.cos(dir) * amp * Math.cos(phase), by = cy + Math.sin(dir) * amp * Math.cos(phase);
      g.fillStyle = 'rgb(255,225,150)'; g.beginPath(); g.arc(bx, by, 6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(210,220,240,0.8)'; g.font = state.stage.font(12); g.textAlign = 'center';
      g.fillText(label, cx, cy + rr + 18);
    });
    LIVE.place = m.name;
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
