// Runs the encounter simulation off the main thread (a few seconds of work), reporting progress.
import { runEncounter, halo } from './encounterSim.js';

self.onmessage = (e) => {
  const p = e.data;
  const sim = runEncounter({
    ...p, main: halo(p.main.v, p.main.rc, p.main.rt), comp: halo(p.comp.v, p.comp.rc, p.comp.rt),
    onProgress: (f) => self.postMessage({ progress: f }),
  });
  self.postMessage({ sim }, [sim.snaps.buffer, sim.cen.buffer, sim.born.buffer]);
};
