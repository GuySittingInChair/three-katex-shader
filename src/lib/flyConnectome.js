// A synthetic but structurally realistic fruit-fly (Drosophila) connectome:
// real region names and their real rough relationships (sensory input ->
// relay/association -> descending output), positioned and wired to
// actually cascade start-to-finish — but the positions, counts, and edges
// are generated, not pulled from FlyWire. The real dataset is ~130k
// neurons behind an authenticated CAVE API; this is deliberately not that.
//
// Regions, per side where the real anatomy is bilateral:
//   LC4 visual      — looming-threat detectors, optic lobe, bilateral
//   gustatory       — sugar-sensing afferents, entering via the SEZ
//   antennal lobe   — first olfactory relay, bilateral
//   mushroom body   — Kenyon cells, the learning/memory hub
//   central complex — navigation/state, sits on the midline
//   descending      — output toward motor circuits, posterior
//   interneuron     — generic filler population wiring the rest together

const REGIONS = [
  { id: 'lc4Left', label: 'LC4 visual (L)', count: 24, color: 0x62c8ff, center: [-1.1, 0.35, 0.55], spread: 0.22, layer: 0 },
  { id: 'lc4Right', label: 'LC4 visual (R)', count: 24, color: 0x62c8ff, center: [1.1, 0.35, 0.55], spread: 0.22, layer: 0 },
  { id: 'gustatory', label: 'Gustatory (sugar)', count: 26, color: 0xffb562, center: [0, -0.55, 0.75], spread: 0.2, layer: 0 },
  { id: 'alLeft', label: 'Antennal lobe (L)', count: 34, color: 0x8ee08e, center: [-0.55, 0.05, 0.65], spread: 0.2, layer: 1 },
  { id: 'alRight', label: 'Antennal lobe (R)', count: 34, color: 0x8ee08e, center: [0.55, 0.05, 0.65], spread: 0.2, layer: 1 },
  { id: 'interneuron', label: 'Interneuron pool', count: 420, color: 0x8a8aa8, center: [0, 0, 0.1], spread: 0.95, layer: 1 },
  { id: 'mushroomLeft', label: 'Mushroom body (L)', count: 90, color: 0xe0c25a, center: [-0.45, 0.4, -0.15], spread: 0.3, layer: 2 },
  { id: 'mushroomRight', label: 'Mushroom body (R)', count: 90, color: 0xe0c25a, center: [0.45, 0.4, -0.15], spread: 0.3, layer: 2 },
  { id: 'centralComplex', label: 'Central complex', count: 60, color: 0xd070e0, center: [0, -0.05, -0.35], spread: 0.24, layer: 2 },
  { id: 'descending', label: 'Descending (output)', count: 46, color: 0xff6a6a, center: [0, -0.6, -0.85], spread: 0.22, layer: 3 },
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds the connectome once: neuron positions/regions plus a directed,
// weighted edge list wired to flow layer 0 (sensory) -> 1 -> 2 -> 3
// (output), with denser local/recurrent wiring inside each region so it
// reads as a real brain, not a strict feedforward net.
export function generateConnectome(seed = 1) {
  const rand = mulberry32(seed);
  const gauss = () => {
    // Box-Muller, clamped — keeps each region a soft blob, not a hard ball.
    const u = Math.max(rand(), 1e-6), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const positions = [];
  const regionIndex = []; // per-neuron index into REGIONS
  const neuronsByRegion = REGIONS.map(() => []);

  REGIONS.forEach((region, ri) => {
    for (let i = 0; i < region.count; i++) {
      const [cx, cy, cz] = region.center;
      const x = cx + gauss() * region.spread * 0.35;
      const y = cy + gauss() * region.spread * 0.35;
      const z = cz + gauss() * region.spread * 0.35;
      const idx = positions.length / 3;
      positions.push(x, y, z);
      regionIndex.push(ri);
      neuronsByRegion[ri].push(idx);
    }
  });

  const neuronCount = positions.length / 3;
  const dist2 = (a, b) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    return (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
  };

  // Edge (i -> j, weight). A Map keyed "i:j" dedupes while building.
  const edgeMap = new Map();
  function addEdge(i, j, weight) {
    if (i === j) return;
    const key = `${i}:${j}`;
    const existing = edgeMap.get(key);
    edgeMap.set(key, existing ? Math.min(1, existing + weight) : weight);
  }

  // 1. Local recurrent wiring: each neuron connects to a handful of its
  // nearest neighbors within the same region — the "it looks like a real
  // dense brain" density, and the substrate recurrence rides on.
  REGIONS.forEach((region, ri) => {
    const members = neuronsByRegion[ri];
    const k = Math.min(5, members.length - 1);
    for (const i of members) {
      const ranked = members
        .filter((j) => j !== i)
        .map((j) => [j, dist2(i, j)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, k);
      for (const [j] of ranked) addEdge(i, j, 0.25 + rand() * 0.25);
    }
  });

  // 2. Feedforward wiring: each region connects to the nearest few
  // neurons in every region one layer ahead — this is what makes a
  // stimulus actually arrive at the output layer instead of dying out
  // locally.
  REGIONS.forEach((region, ri) => {
    const nextLayerRegions = REGIONS
      .map((r, rj) => ({ r, rj }))
      .filter(({ r }) => r.layer === region.layer + 1);
    if (!nextLayerRegions.length) return;

    for (const i of neuronsByRegion[ri]) {
      for (const { rj } of nextLayerRegions) {
        const targets = neuronsByRegion[rj];
        const k = Math.min(3, targets.length);
        const ranked = targets.map((j) => [j, dist2(i, j)]).sort((a, b) => a[1] - b[1]).slice(0, k);
        for (const [j] of ranked) addEdge(i, j, 0.4 + rand() * 0.4);
      }
    }
  });

  const edges = [];
  for (const [key, weight] of edgeMap) {
    const [i, j] = key.split(':').map(Number);
    edges.push([i, j, weight]);
  }

  return {
    neuronCount,
    positions: new Float32Array(positions),
    regionIndex: new Int16Array(regionIndex),
    regions: REGIONS,
    neuronsByRegion,
    edges, // [srcIndex, dstIndex, weight][]
  };
}
