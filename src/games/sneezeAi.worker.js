// Sneeze Duel's top AI: it plans by running the game's own Navier–Stokes
// physics (with a quicker, slightly rougher pressure solve), trying a spread
// of aims and powers for its sneeze and keeping the one that would do the
// most damage, before its own aim wobble, which it can't control any more
// than you can. It reports progress as it goes.
import { simulateShot, makeShot } from './sneezeSim.js';

const steady = () => 0.5; // no wobble while planning
const PLAN_ITERS = 8;

self.onmessage = ({ data }) => {
  const { id, weather, shooter, type } = data;
  const tries = [];
  let best = { angle: 0, power: 0.8, damage: -1 };
  const tryShot = (angle, power) => {
    const damage = simulateShot(weather, makeShot(shooter, type, angle, power, steady), PLAN_ITERS);
    tries.push({ angle, power, damage });
    if (damage > best.damage) best = { angle, power, damage };
    self.postMessage({ id, progress: tries.length, total: 6, angle, damage });
  };
  // Coarse: four aims at a strong-but-steady power; then refine around the best.
  for (const angle of [-12, -4, 4, 12]) tryShot(angle, 0.78);
  tryShot(best.angle + (best.angle > 0 ? -4 : 4), 0.78);
  tryShot(best.angle, 0.9);
  self.postMessage({ id, done: true, ...best });
};
