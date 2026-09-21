// Small helpers for writing a sketch's `motion(t, params)` equation.
// All of them are pure functions of motion-time, so a sketch's animation is a
// closed-form loop you can write down (and show in KaTeX), not a simulation.

export const TAU = Math.PI * 2;

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, x) => a + (b - a) * x;
export const smooth = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

// Where we are in a loop of `period` seconds, as a phase in [0, 1).
export const phaseOf = (t, period) => (((t / period) % 1) + 1) % 1;

// For a loop made of `n` equal segments (e.g. "shape A → B → C → back to A"):
// returns { index, next, blend } where blend eases 0→1 across the segment
// after holding still for a `hold` fraction of it — so each shape is actually
// visible before the next transformation starts.
export function segments(phase, n, hold = 0.3) {
  const scaled = phase * n;
  const index = Math.min(n - 1, Math.floor(scaled));
  const local = scaled - index;
  return {
    index,
    next: (index + 1) % n,
    blend: smooth((local - hold / 2) / (1 - hold)),
  };
}
