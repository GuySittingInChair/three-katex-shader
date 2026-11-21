import { TAU } from '../lib/motion.js';
import { createStage } from '../lib/stage2d.js';
import { caption } from '../lib/bit.js';

// Roche Limit Shredder. A small moon made of 300 boulders held together only by their own gravity (a "rubble
// pile", as many real small moons and asteroids are), orbiting a planet and slowly dragged inwards. The planet pulls
// harder on the moon's near side than its far side; that difference, the tide, grows as 1/r³ as the moon comes
// closer, while the moon's own gravity holding it together stays the same. Inside a certain distance the tide wins
// and the moon is pulled apart into a ring: the Roche limit (Édouard Roche, 1848).
//     rigid ball:  d = 1.26 Rₚ (ρₚ/ρₘ)^(1/3)      fluid ball (stretches first, breaks earlier):  d = 2.44 Rₚ (ρₚ/ρₘ)^(1/3)
// Units: G = 1, planet mass 1, planet radius Rₚ = 0.25; the moon has mass 0.001. Every boulder pulls every other
// (softened by 0.004 so close pairs stay finite) and boulders that touch push apart like stiff, slightly squashy
// balls. A gentle drag (0.4% of the velocity per unit time) makes the orbit shrink; it stops once the moon breaks.
// The moon's radius is measured live (90% of boulders within it; the smallest value this run, since it stretches
// before it breaks), and the two limits use the density that gives.
// Checked (Node, and the live readout in the browser): the moon settles to a radius of about 0.06, which puts the
// limits at about 0.75 and 1.45, and it comes apart at r ≈ 1.07–1.09: between the two, as a loose pile should.
// A few boulders on the edge are flung off in the first seconds, before the pile settles.
// see docs/wiki/sketches/rocheShredder.md

const NB = 300, MP = 1, RP = 0.25, MOON = 1e-3, SIZE = 0.0032, STIFF = 0.06, DAMP = 0.5, SOFT = 0.004, DRAG = 0.004, R0 = 1.6;
const DT = 0.004, STEPS = 24, LOOP = 30;

function makeMoon() {
  const pts = [];
  for (let q = 0; pts.length < NB; q++) {
    const rr = Math.sqrt(q) * 2 * SIZE * 0.95, a = q * 2.39996;
    pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  const v0 = Math.sqrt(MP / R0);
  // orbiting, and turning once per orbit (one face always to the planet, like our Moon)
  return { b: pts.map(([x, y]) => ({ x: R0 + x, y, vx: -y * (v0 / R0), vy: v0 + x * (v0 / R0) })), t: 0, drag: true, broke: null };
}
function stepMoon(mo) {
  const { b } = mo, n = b.length, mp = MOON / NB, c = 2 * DAMP * Math.sqrt(STIFF * mp);
  const ax = new Float64Array(n), ay = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = b[i], r2 = p.x * p.x + p.y * p.y, r = Math.sqrt(r2);
    ax[i] -= (MP * p.x) / (r2 * r); ay[i] -= (MP * p.y) / (r2 * r);
    if (mo.drag) { ax[i] -= DRAG * p.vx; ay[i] -= DRAG * p.vy; }
    for (let j = i + 1; j < n; j++) {
      const q = b[j], dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      const f = mp / Math.pow(d2 + SOFT * SOFT, 1.5);
      let fx = f * dx, fy = f * dy;
      if (d < 2 * SIZE) {
        const nx = dx / d, ny = dy / d, vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny, fc = (STIFF * (2 * SIZE - d) - c * vn) / mp;
        fx -= fc * nx; fy -= fc * ny;
      }
      ax[i] += fx; ay[i] += fy; ax[j] -= fx; ay[j] -= fy;
    }
  }
  for (let i = 0; i < n; i++) { const p = b[i]; p.vx += ax[i] * DT; p.vy += ay[i] * DT; p.x += p.vx * DT; p.y += p.vy * DT; }
  mo.t += DT;
}
function measure(mo) {
  const { b } = mo, n = b.length;
  let cx = 0, cy = 0;
  for (const p of b) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  const ds = b.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((x, y) => x - y);
  return { r: Math.hypot(cx, cy), size: ds[Math.floor(n * 0.9)] };
}

const LIVE = { r: R0, size: 0.07, rigid: 0, fluid: 0, broke: null };

export default {
  name: 'Roche Limit Shredder',
  description:
    'A moon made of three hundred boulders held together only by its own gravity spirals slowly towards its planet. ' +
    'The planet pulls its near side harder than its far side, and the closer it gets the bigger that difference. At ' +
    'the Roche limit the moon is torn apart, and the pieces spread into a ring.',
  tags: ['astronomy', 'roche limit', 'tides', 'planetary rings', 'n-body', 'gravity'],
  category: 'Physics',
  mode: '3d',

  motion(t) {
    return { cyc: Math.floor(t / LOOP), tLoop: t % LOOP };
  },

  latex: (params, hl, m) => {
    const L = LIVE;
    const line = L.broke != null ? `Broke up at r = ${L.broke.toFixed(2)}. It is a ring now. Rings do not complain.`
      : L.r > L.fluid ? 'Moon intact, spiralling in. Tides: mild.' : 'Inside the fluid limit. The boulders are starting to disagree.';
    return (
      '\\begin{aligned}' +
      'd_{\\text{rigid}} &= 1.26\\,R_p\\,(\\rho_p/\\rho_m)^{1/3} = ' + hl(L.rigid, 2) + ' \\\\' +
      'd_{\\text{fluid}} &= 2.44\\,R_p\\,(\\rho_p/\\rho_m)^{1/3} = ' + hl(L.fluid, 2) + ' \\\\' +
      `r &= ${hl(L.r, 2)}\\quad \\text{moon radius } ${hl(L.size, 3)}\\quad (R_p = 0.25) \\\\` +
      `& ${caption(line)}` +
      '\\end{aligned}'
    );
  },

  params: {
    speed: { value: 1, min: 0, max: 3 },
  },

  setup(ctx) {
    return { stage: createStage(ctx, { glow: 1.0 }), cyc: -1, mo: null };
  },

  update(ctx, state) {
    const { g } = state.stage.begin(ctx);
    const m = ctx.motion;
    if (m.cyc !== state.cyc) { state.cyc = m.cyc; state.mo = makeMoon(); LIVE.broke = null; LIVE.size = Infinity; }
    const mo = state.mo;
    const steps = Math.round(STEPS * (ctx.params.speed ?? 1));
    for (let s = 0; s < steps; s++) stepMoon(mo);
    const mz = measure(mo);
    if (mo.drag && mz.size > 0.3) { mo.drag = false; }
    if (LIVE.broke == null && mz.size > 0.12) LIVE.broke = mz.r;
    LIVE.size = Math.min(LIVE.size, mz.size);    // the moon's settled size: smallest seen this run (it stretches before it breaks)
    LIVE.r = mz.r;
    const ratio = Math.cbrt(MP / MOON) * (LIVE.size / RP);                   // (ρp/ρm)^(1/3)
    LIVE.rigid = 1.26 * RP * ratio; LIVE.fluid = 2.44 * RP * ratio;

    const sq = state.stage.square(6), sc = sq.s / 3.6, cx = sq.x + sq.s / 2, cy = sq.y + sq.s / 2;
    const X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
    // the two limits
    g.setLineDash([5, 6]); g.lineWidth = 1.2;
    [[LIVE.rigid, 'rgba(255,150,120,0.7)', 'rigid limit'], [LIVE.fluid, 'rgba(120,200,255,0.7)', 'fluid limit']].forEach(([r, col, label]) => {
      g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r * sc, 0, TAU); g.stroke();
      g.fillStyle = col; g.font = state.stage.font(11); g.textAlign = 'left'; g.fillText(label, X(r * 0.72), Y(r * 0.72));
    });
    g.setLineDash([]);
    // the planet
    const grad = g.createRadialGradient(cx - 0.08 * sc, cy - 0.08 * sc, 0.02 * sc, cx, cy, RP * sc);
    grad.addColorStop(0, 'rgb(250,210,160)'); grad.addColorStop(1, 'rgb(170,110,70)');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, RP * sc, 0, TAU); g.fill();
    // the boulders
    g.fillStyle = 'rgb(225,232,255)';
    const br = Math.max(1.2, SIZE * sc * 1.1);
    for (const p of mo.b) { g.beginPath(); g.arc(X(p.x), Y(p.y), br, 0, TAU); g.fill(); }
    state.stage.end();
  },

  dispose(ctx, state) {
    state.stage.dispose();
  },
};
