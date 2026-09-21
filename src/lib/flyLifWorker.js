// Discrete-time leaky integrate-and-fire simulation, ticking on its own
// interval independent of the render loop — this is the whole reason it's
// a worker: walking every neuron's outgoing edges every tick has no
// business competing with the main thread for frame time.
//
// Two layers of state live here:
//  - per-NEURON: potential/activation/refractory — the spiking dynamics.
//  - per-REGION: damage/status — the lesion model. A region's damage
//    scales down every outgoing signal its neurons send (proportional
//    weakening); once damage crosses failureThreshold, that scale drops
//    to exactly 0 (collapse) rather than fading forever.
//
// Protocol (postMessage):
//   in  { type: 'init', neuronCount, neuronRegion, regionCount, edges: [[src,dst,weight],...],
//         leak, threshold, fireStrength, activationDecay, refractoryTicks,
//         failureThreshold, decayRate, overloadSteepness, overloadCeiling, tickHz }
//   in  { type: 'stimulate', indices: number[], strength }  — one-shot impulse, sigmoid-saturated
//   in  { type: 'sensoryInput', visual, gustatory }         — continuous per-tick injection, also saturated
//   in  { type: 'lesion', regionIndex, amount }             — bump one region's cumulative damage
//   in  { type: 'resetBaseline' }                           — zero every neuron AND region back to healthy
//   in  { type: 'params', leak?, threshold?, fireStrength?, activationDecay?, refractoryTicks?,
//         failureThreshold?, decayRate?, overloadSteepness?, overloadCeiling? }
//   in  { type: 'stop' }
//   out { type: 'tick', activation, regionDamage, regionStatus, firedCount }  — transferred, not copied

let neuronCount = 0;
let neuronRegion = null; // Int16Array, per-neuron -> region index
let regionCount = 0;
let outgoing = []; // outgoing[i] = Float32Array pairs flattened [target, weight, target, weight, ...]
let potential, pendingInput, activation, refractory;
let regionDamage, regionStatus; // status: 0 healthy, 1 degraded, 2 failed
let regionOutputScale; // recomputed once per tick from regionDamage/regionStatus

let leak = 0.85;
let threshold = 1.0;
let fireStrength = 1.0;
let activationDecay = 0.9;
let timer = null;

// A purely excitatory network (no inhibitory edges here) with no
// refractory period is a classic runaway-saturation trap: once enough
// neurons fire, their mutual excitation is more than enough to re-trigger
// each other every single tick forever, instead of a stimulus producing a
// bounded cascade that rises and settles. Tunable, not just a constant —
// it's a real modeling knob (real refractory periods vary by neuron type).
let refractoryTicks = 5;

// Lesion model knobs.
let failureThreshold = 0.7; // one global threshold, applied per-region — see note in the sketch file
let decayRate = 0; // passive per-tick worsening (0 = damage only changes when explicitly lesioned)

// Overload model: raw injected strength is passed through a logistic
// curve before it ever touches a neuron's potential, so no slider value —
// however large — can inject an unbounded amount and blow the simulation
// into NaN/instability. steepness controls how "switch-like" the curve
// is; ceiling is the hard cap no amount of input can exceed.
let overloadSteepness = 1.0;
let overloadCeiling = 3.0;

function sigmoidSaturate(raw) {
  return overloadCeiling / (1 + Math.exp(-overloadSteepness * raw));
}

function buildAdjacency(edges) {
  const buckets = Array.from({ length: neuronCount }, () => []);
  for (const [src, dst, weight] of edges) {
    if (src < 0 || src >= neuronCount || dst < 0 || dst >= neuronCount) continue;
    buckets[src].push(dst, weight);
  }
  outgoing = buckets.map((b) => Float32Array.from(b));
}

function recomputeRegionOutputScale() {
  for (let r = 0; r < regionCount; r++) {
    regionOutputScale[r] = regionStatus[r] === 2 ? 0 : 1 - regionDamage[r];
  }
}

// Passive worsening: any region mid-damage (lesioned but not yet failed)
// creeps toward failure at decayRate/tick — a delayed-failure model, not
// an instant one. decayRate === 0 means damage only ever changes when
// explicitly lesioned (the default — nothing worsens on its own).
function stepRegionDamage() {
  for (let r = 0; r < regionCount; r++) {
    if (regionStatus[r] === 2) continue; // already failed, nothing left to lose
    if (regionDamage[r] > 0 && decayRate !== 0) {
      regionDamage[r] = Math.min(1, Math.max(0, regionDamage[r] + decayRate));
    }
    if (regionDamage[r] >= failureThreshold) {
      regionStatus[r] = 2;
    } else if (regionDamage[r] > 0) {
      regionStatus[r] = 1;
    } else {
      regionStatus[r] = 0;
    }
  }
  recomputeRegionOutputScale();
}

function tick() {
  stepRegionDamage();

  let firedCount = 0;
  for (let i = 0; i < neuronCount; i++) {
    potential[i] = potential[i] * leak + pendingInput[i];
    pendingInput[i] = 0;
    activation[i] *= activationDecay;

    if (refractory[i] > 0) {
      refractory[i]--;
      continue; // input still accumulates above; it just can't cross threshold yet
    }

    if (potential[i] > threshold) {
      activation[i] = 1;
      potential[i] = -0.3; // small negative floor, not just 0 — extra margin against instant re-trigger
      refractory[i] = refractoryTicks;
      firedCount++;
      const scale = regionOutputScale[neuronRegion[i]];
      if (scale > 0) {
        const out = outgoing[i];
        for (let k = 0; k < out.length; k += 2) {
          pendingInput[out[k]] += out[k + 1] * fireStrength * scale;
        }
      }
    }
  }

  // Transfer the buffers out (zero-copy) and allocate fresh ones to keep
  // writing into — cheap, and avoids the main thread reading a buffer
  // that's simultaneously being mutated here. Region arrays are tiny
  // (10 entries) so copying those plainly is not worth transferring.
  const snapshot = activation.slice();
  self.postMessage(
    {
      type: 'tick',
      activation: snapshot,
      regionDamage: Array.from(regionDamage),
      regionStatus: Array.from(regionStatus),
      firedCount,
    },
    [snapshot.buffer]
  );
}

function applyParams(msg) {
  if (msg.leak != null) leak = msg.leak;
  if (msg.threshold != null) threshold = msg.threshold;
  if (msg.fireStrength != null) fireStrength = msg.fireStrength;
  if (msg.activationDecay != null) activationDecay = msg.activationDecay;
  if (msg.refractoryTicks != null) refractoryTicks = Math.round(msg.refractoryTicks);
  if (msg.failureThreshold != null) failureThreshold = msg.failureThreshold;
  if (msg.decayRate != null) decayRate = msg.decayRate;
  if (msg.overloadSteepness != null) overloadSteepness = msg.overloadSteepness;
  if (msg.overloadCeiling != null) overloadCeiling = msg.overloadCeiling;
}

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    neuronCount = msg.neuronCount;
    regionCount = msg.regionCount;
    neuronRegion = Int16Array.from(msg.neuronRegion);
    potential = new Float32Array(neuronCount);
    pendingInput = new Float32Array(neuronCount);
    activation = new Float32Array(neuronCount);
    refractory = new Float32Array(neuronCount);
    regionDamage = new Float32Array(regionCount);
    regionStatus = new Uint8Array(regionCount);
    regionOutputScale = new Float32Array(regionCount).fill(1);
    applyParams(msg);
    buildAdjacency(msg.edges || []);
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000 / (msg.tickHz || 24));
  } else if (msg.type === 'stimulate') {
    const saturated = sigmoidSaturate(msg.strength ?? threshold * 1.5);
    for (const i of msg.indices || []) {
      if (i >= 0 && i < neuronCount) pendingInput[i] += saturated;
    }
  } else if (msg.type === 'sensoryInput') {
    // Continuous per-tick injection for the overload sliders — same
    // saturation curve as a one-shot stimulate(), just applied every tick
    // for as long as the slider stays up, so "turn it up forever" still
    // can't exceed overloadCeiling per tick.
    const regions = msg.regions || []; // [{ indices, raw }]
    for (const { indices, raw } of regions) {
      if (!raw) continue;
      const saturated = sigmoidSaturate(raw);
      for (const i of indices) {
        if (i >= 0 && i < neuronCount) pendingInput[i] += saturated;
      }
    }
  } else if (msg.type === 'lesion') {
    if (msg.regionIndex >= 0 && msg.regionIndex < regionCount) {
      regionDamage[msg.regionIndex] = Math.min(1, Math.max(0, regionDamage[msg.regionIndex] + (msg.amount ?? 0.4)));
    }
  } else if (msg.type === 'resetBaseline') {
    potential.fill(0);
    pendingInput.fill(0);
    activation.fill(0);
    refractory.fill(0);
    regionDamage.fill(0);
    regionStatus.fill(0);
    recomputeRegionOutputScale();
  } else if (msg.type === 'params') {
    applyParams(msg);
  } else if (msg.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};
