// The physics of Sneeze Duel: the incompressible Navier–Stokes equations,
//
//     ∂u/∂t + (u·∇)u = −∇p + ν∇²u + f,   ∇·u = 0
//
// on a 96 × 48 grid with Stam's "stable fluids" scheme (implicit
// diffusion, pressure projection, semi-Lagrangian advection), the same
// solver as the Navier–Stokes of a Sneeze sketch. A cell is 4 mm and a step
// 0.48 ms, so speeds are in m/s and viscosity in multiples of air's. Both
// robots' heads are solid obstacles (flow held at zero inside them). The
// "draft" f is an up- or down-draft in the middle third of the room; it
// varies across the room, so it really pushes the cloud around (a uniform
// push in a closed room would just be absorbed by the pressure).
//
// Pure functions of their inputs (no DOM), so the AI can run the very same
// physics in a worker to plan its sneezes.

export const NX = 96;
export const NY = 48;
const W = NX + 2;
const SIZE = W * (NY + 2);
export const METRES_PER_CELL = 0.004;
export const SECONDS_PER_STEP = 0.00048;
export const NU_AIR = 1.5e-5;
export const SHOT_STEPS = 300; // 0.14 s of real time per sneeze
const HEAD_X = 5; // head half-size in cells
const HEAD_Y = 4;
const DRAFT_K = 0.0035; // cells/step² at full draft
const DAMAGE_K = 0.11;

// Robot 0 on the left facing right, robot 1 on the right facing left.
export const ROBOTS = [
  { x: 8, y: 20, face: 1 },
  { x: NX - 8, y: 20, face: -1 },
];

// The sneezes. U is a multiple of the power-set speed, D the mouth width in cells.
export const TYPES = {
  classic: { name: 'Classic', blurb: 'The all-rounder.', cooldown: 0, puffs: [{ at: 0, dur: 36, dAngle: 0 }], U: 1, D: 5, dye: 0.5, mult: 1, jitter: 1, self: 0 },
  pepper: { name: 'Pepper', blurb: 'A fast, accurate needle. Burns: costs you 4 HP.', cooldown: 1, puffs: [{ at: 0, dur: 22, dAngle: 0 }], U: 1.5, D: 3, dye: 0.45, mult: 2.4, jitter: 0.4, self: 4 },
  cold: { name: 'Head Cold', blurb: 'Slow, wide and heavy. Big damage if the air lets it through.', cooldown: 2, puffs: [{ at: 0, dur: 60, dAngle: 0 }], U: 0.72, D: 7, dye: 0.45, mult: 0.9, jitter: 1.2, self: 0 },
  triple: { name: 'Triple', blurb: 'Three quick sneezes, fanned out. Hard to dodge, hard to aim.', cooldown: 2, puffs: [{ at: 0, dur: 14, dAngle: -7 }, { at: 22, dur: 14, dAngle: 0 }, { at: 44, dur: 14, dAngle: 7 }], U: 1.05, D: 5, dye: 0.55, mult: 1.1, jitter: 1.4, self: 0 },
  tissue: { name: 'Tissue', blurb: 'Skip your sneeze; block 70% of the next one. Two per match.', cooldown: 0, tissue: true },
};
export const SNEEZES = ['classic', 'pepper', 'cold', 'triple'];

// Weather for a turn: draft from −1 (down) to 1 (up), viscosity in multiples of air.
export function randomWeather(rand = Math.random) {
  return { draft: Math.round((rand() * 2 - 1) * 100) / 100, visc: Math.round(15 + rand() * 65) };
}

// Sneeze speed in m/s for a power in [0, 1].
export const speedFor = (power) => 10 + 30 * power;

// The shot as fired: aim wobble grows with power², so a full-power sneeze is a gamble.
export function makeShot(shooter, type, angleDeg, power, rand = Math.random) {
  const t = TYPES[type];
  const wobble = (rand() * 2 - 1) * 11 * power * power * t.jitter;
  return { shooter, type, angle: angleDeg + wobble, aimed: angleDeg, power, wobble, U: speedFor(power) * t.U };
}

const IX = (i, j) => i + W * j;
const HEADS = ROBOTS.map((r) => {
  const cells = [];
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) if (Math.abs(i - r.x) <= HEAD_X && Math.abs(j - r.y) <= HEAD_Y) cells.push(IX(i, j));
  return cells;
});

// pressureIters: the game uses 16; the AI plans with fewer, a slightly rougher but quicker solve.
export function createRoom(weather, pressureIters = 16) {
  const a = () => new Float32Array(SIZE);
  return { u: a(), v: a(), u0: a(), v0: a(), dye: a(), dye0: a(), p: a(), div: a(), steps: 0, weather, hit: 0, pressureIters };
}

function setBoundary(b, x) {
  for (let i = 1; i <= NX; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  for (let j = 1; j <= NY; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
  x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
  x[IX(0, NY + 1)] = 0.5 * (x[IX(1, NY + 1)] + x[IX(0, NY)]);
  x[IX(NX + 1, 0)] = 0.5 * (x[IX(NX, 0)] + x[IX(NX + 1, 1)]);
  x[IX(NX + 1, NY + 1)] = 0.5 * (x[IX(NX, NY + 1)] + x[IX(NX + 1, NY)]);
}

function solidHeads(u, v) {
  for (const cells of HEADS) {
    for (const n of cells) {
      u[n] = 0;
      v[n] = 0;
    }
  }
}

function relax(b, x, x0, a, c, iters) {
  for (let k = 0; k < iters; k++) {
    for (let j = 1; j <= NY; j++) {
      for (let i = 1; i <= NX; i++) {
        const n = IX(i, j);
        x[n] = (x0[n] + a * (x[n - 1] + x[n + 1] + x[n - W] + x[n + W])) / c;
      }
    }
    setBoundary(b, x);
  }
}

function advect(b, d, d0, u, v) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      const x = Math.min(NX + 0.5, Math.max(0.5, i - u[n]));
      const y = Math.min(NY + 0.5, Math.max(0.5, j - v[n]));
      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      const s1 = x - i0;
      const t1 = y - j0;
      d[n] =
        (1 - s1) * ((1 - t1) * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) +
        s1 * ((1 - t1) * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
    }
  }
  setBoundary(b, d);
}

function project(u, v, p, div, iters) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      div[n] = -0.5 * (u[n + 1] - u[n - 1] + v[n + W] - v[n - W]);
      p[n] = 0;
    }
  }
  setBoundary(0, div);
  setBoundary(0, p);
  relax(0, p, div, 1, 4, iters);
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      u[n] -= 0.5 * (p[n + 1] - p[n - 1]);
      v[n] -= 0.5 * (p[n + W] - p[n - W]);
    }
  }
  setBoundary(1, u);
  setBoundary(2, v);
  solidHeads(u, v);
}

// One step of the room, with the shot's jets (if they're on) and the draft.
// Adds the dye arriving at the target's face to room.hit.
export function stepRoom(room, shot) {
  const { u, v, u0, v0, dye, dye0, weather } = room;
  if (shot && !TYPES[shot.type].tissue) {
    const t = TYPES[shot.type];
    const r = ROBOTS[shot.shooter];
    const mx = r.x + r.face * (HEAD_X + 2);
    const my = r.y - 1;
    const ug = (shot.U * SECONDS_PER_STEP) / METRES_PER_CELL; // cells per step
    for (const puff of t.puffs) {
      const k = room.steps - puff.at;
      if (k < 0 || k >= puff.dur) continue;
      const env = Math.sin((Math.PI * (k + 0.5)) / puff.dur);
      const ang = ((shot.angle + puff.dAngle) * Math.PI) / 180;
      const vx = r.face * Math.cos(ang) * ug * env;
      const vy = Math.sin(ang) * ug * env;
      const half = (t.D - 1) / 2;
      for (let dj = -half; dj <= half; dj++) {
        for (let di = 0; di < 3; di++) {
          const n = IX(mx + r.face * di, Math.round(my + dj));
          u[n] = vx;
          v[n] = vy;
          dye[n] = Math.min(1.5, dye[n] + t.dye * env);
        }
      }
    }
  }
  // The draft: up or down in the middle third, strongest in the centre.
  if (weather.draft) {
    const mid = NX / 2;
    for (let i = mid - 16; i <= mid + 16; i++) {
      const c = Math.cos((Math.PI * (i - mid)) / 32);
      const f = weather.draft * DRAFT_K * c * c;
      for (let j = 1; j <= NY; j++) v[IX(i, j)] += f;
    }
  }
  const nu = (weather.visc * NU_AIR * SECONDS_PER_STEP) / METRES_PER_CELL ** 2;
  const iters = room.pressureIters < 16 ? 4 : Math.min(20, 4 + Math.ceil(nu * 40));
  u0.set(u);
  v0.set(v);
  relax(1, u, u0, nu, 1 + 4 * nu, iters);
  relax(2, v, v0, nu, 1 + 4 * nu, iters);
  project(u, v, room.p, room.div, room.pressureIters);
  u0.set(u);
  v0.set(v);
  advect(1, u, u0, u0, v0);
  advect(2, v, v0, u0, v0);
  project(u, v, room.p, room.div, room.pressureIters);
  dye0.set(dye);
  advect(0, dye, dye0, u, v);

  // Dye flowing onto the target's face (the three columns in front of it).
  if (shot && !TYPES[shot.type].tissue) {
    const tg = ROBOTS[1 - shot.shooter];
    const front = tg.x + tg.face * (HEAD_X + 1);
    let flux = 0;
    for (let c = 0; c < 3; c++) {
      const i = front + tg.face * c;
      for (let j = tg.y - HEAD_Y - 1; j <= tg.y + HEAD_Y + 1; j++) {
        const n = IX(i, j);
        flux += dye[n] * Math.max(0, -tg.face * u[n] * 1); // flow toward the face
      }
    }
    room.hit += flux;
  }
  room.steps++;
}

// Damage for the dye that reached the face (before any tissue).
export function damageOf(room, shot) {
  return Math.round(room.hit * DAMAGE_K * TYPES[shot.type].mult);
}

// Run a whole shot without drawing it (for the AI, and tests).
export function simulateShot(weather, shot, pressureIters = 16) {
  const room = createRoom(weather, pressureIters);
  for (let s = 0; s < SHOT_STEPS; s++) stepRoom(room, shot);
  return damageOf(room, shot);
}

// For drawing: dye and vorticity, cell by cell (row 0 at the bottom).
export function sample(room, out) {
  const { u, v, dye } = room;
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const n = IX(i, j);
      const o = ((j - 1) * NX + (i - 1)) * 2;
      out[o] = dye[n];
      out[o + 1] = 0.5 * (v[n + 1] - v[n - 1] - (u[n + W] - u[n - W]));
    }
  }
}

export const HEAD = { x: HEAD_X, y: HEAD_Y };
