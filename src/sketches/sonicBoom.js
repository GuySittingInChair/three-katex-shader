import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Sonic Boom. A robot flies left to right singing one note (A, 440 Hz), faster on every lap: Mach 0.5, 0.9, 1.0,
// 1.5, 2.0 (Mach number M = its speed ÷ the speed of sound). Every 1/440 s it sends out a ring of sound that spreads
// at the speed of sound c from wherever the robot was at that moment. The picture is slowed down about 80 times:
// one ring every 0.18 s, each standing for one wave of the note. Ahead of the robot the rings bunch up, behind they
// spread out: the Doppler effect,
//     f_ahead = f / (1 − M),   f_behind = f / (1 + M)       (listener straight ahead or behind, still air)
// At M = 1 the rings pile into one wall. Faster than sound, the robot outruns its own rings, and they meet along a
// cone of half-angle μ with sin μ = 1/M: the Mach cone. Everything inside heard it; outside, nothing yet. The cone
// sweeping over you is the boom.
// The two microphones time the rings arriving (rings − 1, divided by the time from first to last, over the last
// 2 s); that measured pitch is shown next to the formula's prediction. Slowing the picture down doesn't change it:
// both rates are slowed by the same factor.
// see docs/wiki/sketches/sonicBoom.md

const LAPS = [0.5, 0.9, 1.0, 1.5, 2.0];
const LAP = 11;                  // seconds per lap
const F = 440;                   // the note, Hz
const EVERY = 0.18;              // one ring every 0.18 s in the picture (one wave of the note)

const LIVE = { M: 0.5, ahead: null, behind: null };

export default {
  name: 'Sonic Boom',
  description:
    'A robot sings one note while flying faster each lap. Ahead of it the sound waves bunch up and the note sounds ' +
    'higher; behind, they stretch and it sounds lower. At the speed of sound they pile into a wall, and beyond it the ' +
    'robot outruns its own song, which trails behind in a cone: the sonic boom.',
  tags: ['doppler effect', 'sound', 'mach cone', 'waves', 'supersonic', 'humor'],
  category: 'Waves',
  mode: '3d',

  motion(t) {
    const lapN = Math.floor(t / LAP), lap = lapN % LAPS.length;
    return { lap, lapN, M: LAPS[lap], tLap: t % LAP };
  },

  latex: (params, hl, m) => {
    const M = m.M;
    const ahead = M < 1 ? F / (1 - M) : null;
    const line = M < 1 ? (M < 0.7 ? 'Cruising. Ahead it sounds higher, behind lower. Same note, honestly.' : 'Nearly sonic. The note ahead is getting silly.')
      : M === 1 ? 'Exactly Mach 1: every ring piles into one wall in front. The note ahead is "infinity Hz".'
      : 'Supersonic. Ahead: silence. Then the cone arrives all at once.';
    return (
      '\\begin{aligned}' +
      `M &= v/c = ${hl(M, 1)} \\\\` +
      `f_{\\text{ahead}} &= \\frac{f}{1-M} = ${ahead ? `${hl(ahead, 0)}\\ \\text{Hz}` : '\\text{none: the robot arrives first}'}` +
      (LIVE.ahead != null && M < 1 ? `\\ \\ (\\text{mic: } ${hl(LIVE.ahead, 0)})` : '') + ' \\\\' +
      `f_{\\text{behind}} &= \\frac{f}{1+M} = ${hl(F / (1 + M), 0)}\\ \\text{Hz}` +
      (LIVE.behind != null ? `\\ \\ (\\text{mic: } ${hl(LIVE.behind, 0)})` : '') + ' \\\\' +
      (M > 1 ? `\\sin\\mu &= 1/M\\quad \\mu = ${hl((Math.asin(1 / M) * 180) / Math.PI, 1)}^\\circ \\\\` : '') +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 1.0 }) };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion, a = state.stage.area, M = m.M;
    LIVE.M = M;
    // Picture units: sound travels 1 unit a second, the robot M units a second.
    const T = m.tLap;
    const span = Math.max(M, 0.7) * LAP;          // how far the robot travels in a lap
    const k = (a.w * 0.8) / span;                  // pixels per picture unit
    const x0 = a.x + a.w * 0.1, yc = a.y + a.h / 2;
    const robotX = x0 + M * T * k;
    const every = EVERY;
    g.lineWidth = 1.4;
    for (let te = 0; te <= T; te += every) {
      const r = (T - te) * k;
      const cx = x0 + M * te * k;
      if (r > a.w * 1.5) continue;
      const age = (T - te) / LAP;
      g.strokeStyle = `rgba(120,200,255,${Math.max(0.08, 0.85 - age * 0.9)})`;
      g.beginPath(); g.arc(cx, yc, r, 0, TAU); g.stroke();
    }
    // The Mach cone: two lines from the robot, half-angle μ.
    if (M > 1) {
      const mu = Math.asin(1 / M), len = M * T * k;
      g.strokeStyle = 'rgba(255,200,90,0.95)'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(robotX - len * Math.cos(mu), yc - len * Math.sin(mu)); g.lineTo(robotX, yc);
      g.lineTo(robotX - len * Math.cos(mu), yc + len * Math.sin(mu)); g.stroke();
    }
    // Microphones ahead (right) and behind (left). Each ring reaches a mic when it has spread that far; the mic's
    // pitch is (rings heard − 1) ÷ (time between the first and last of them), over the last 2 s, in units of the
    // emission rate (1 ring per EVERY seconds = 440 Hz).
    const micA = a.x + a.w * 0.97, micB = a.x + a.w * 0.03;
    const heard = (mx) => {
      const times = [];
      for (let te = 0; te <= T; te += every) {
        const hit = te + Math.abs(mx - (x0 + M * te * k)) / k;
        if (hit <= T && hit > T - 2) times.push(hit);
      }
      times.sort((p, q) => p - q);
      return times;
    };
    const pitch = (times) => (times.length >= 3 ? ((times.length - 1) / (times[times.length - 1] - times[0])) * every * F : null);
    const tA = heard(micA), tB = heard(micB);
    LIVE.ahead = robotX < micA ? pitch(tA) : null;
    LIVE.behind = pitch(tB);
    const nA = tA.filter((h) => h > T - 0.3).length, nB = tB.filter((h) => h > T - 0.3).length;
    [[micA, nA], [micB, nB]].forEach(([mx, n]) => {
      g.fillStyle = n ? 'rgba(255,240,200,0.95)' : 'rgba(150,160,180,0.6)';
      g.beginPath(); g.arc(mx, yc, 5 + Math.min(6, n * 0.5), 0, TAU); g.fill();
    });
    // The robot: a small glowing disc with a speech bubble note.
    g.fillStyle = 'rgb(255,240,210)';
    g.beginPath(); g.arc(robotX, yc, 7, 0, TAU); g.fill();
    g.font = state.stage.font(14); g.fillStyle = 'rgba(255,230,160,0.9)'; g.textAlign = 'center';
    g.fillText('♪ A', robotX, yc - 14);
    g.font = state.stage.font(11); g.fillStyle = 'rgba(200,210,230,0.7)';
    g.fillText('mic behind', micB, yc + 24); g.fillText('mic ahead', micA, yc + 24);
    g.fillText(`lap ${m.lap + 1}: Mach ${M}`, a.x + a.w / 2, a.y + a.h - 4);
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
