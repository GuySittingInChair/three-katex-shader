import * as THREE from 'three';
import { generateConnectome } from '../lib/flyConnectome.js';

// Neurons: one InstancedMesh, one small icosahedron per soma. `activation`
// is a per-instance attribute (it's individually different every tick, so
// it has to be); region damage used to be broadcast into a second
// per-instance attribute the same way, rewriting all ~850 entries every
// tick even though there are only 10 distinct values. It's now a tiny
// uniform array instead — `regionId` (which region each neuron belongs
// to) is the only new attribute, and it's static: set once here, never
// touched again. Three.js auto-declares `instanceMatrix` for any material
// on an InstancedMesh, but a custom ShaderMaterial has to apply it by
// hand — that's the one non-obvious line below.
//
// The uRegionDamage/uRegionStatus lookup happens here in the VERTEX
// shader, not the fragment shader: it's the same value across every pixel
// of one neuron's icosahedron, so computing it once per vertex (42, for
// this geometry) instead of once per fragment is strictly less work, and
// dynamic uniform-array indexing has always been reliably supported in
// vertex shaders — fragment-shader dynamic indexing is a dicier bet on
// older GLSL ES 1.00 hardware.
function nodeVertShader(regionCount) {
  return `
    attribute float activation;
    attribute vec3 regionColor;
    attribute float sizeJitter;
    attribute float regionId;
    varying float vActivation;
    varying vec3 vRegionColor;
    varying float vDamage;
    uniform float uRegionDamage[${regionCount}];
    uniform float uRegionStatus[${regionCount}]; // 0 healthy, 1 degraded, 2 failed

    void main() {
      int rid = int(regionId + 0.5);
      // A "failed" region always reads as fully tinted even if it crossed
      // threshold below 1.0 raw damage, so "degraded but still
      // contributing" reads visually different from "dead weight".
      vDamage = uRegionStatus[rid] > 1.5 ? 1.0 : uRegionDamage[rid];
      vActivation = activation;
      vRegionColor = regionColor;
      vec3 scaled = position * sizeJitter * (1.0 + activation * 0.8); // active neurons swell slightly
      vec4 worldPosition = instanceMatrix * vec4(scaled, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
    }
  `;
}

const NODE_FRAG = `
  precision mediump float;
  varying float vActivation;
  varying vec3 vRegionColor;
  varying float vDamage;
  uniform vec3 uDimColor;
  uniform vec3 uActiveColor;
  uniform vec3 uDamageColor;

  void main() {
    // Resting color is mostly the spec'd dim cyan, with a hint of the
    // neuron's region color so the brain's actual structure stays visible
    // at rest — pure uniform cyan across 1000+ neurons would hide it.
    vec3 rest = mix(uDimColor, vRegionColor, 0.35);
    // Lesion damage pulls the resting color toward a dull red-gray,
    // independent of momentary firing — a permanent "this pathway is hurt"
    // mark you can see even when nothing is actively cascading.
    rest = mix(rest, uDamageColor, vDamage * 0.85);
    vec3 color = mix(rest, uActiveColor, vActivation * (1.0 - vDamage * 0.7));
    // No post-process bloom pass exists in this engine yet — additive
    // blending plus a brightness boost is the same cheap glow trick the
    // particle-based sketches (N-Body, etc.) already use here.
    gl_FragColor = vec4(color * (0.6 + vActivation * 1.4 * (1.0 - vDamage * 0.6)), 1.0);
  }
`;

const DIM_COLOR = new THREE.Color(0x1a5568); // dim cyan
const ACTIVE_COLOR = new THREE.Color(0xffb020); // bright yellow/orange
const DAMAGE_COLOR = new THREE.Color(0x8a2020); // dull red — lesioned tissue
const HIGHLIGHT_EDGE = new THREE.Color(0xffe08a);
const DIM_EDGE = new THREE.Color(0x35405a);
const STATUS_LABEL = ['healthy', 'degraded', 'FAILED'];
const STATUS_DOT = ['🟢', '🟡', '🔴'];

const STIMULUS_REGIONS = {
  sugarSense: { label: '🍬 Sugar Sense', regions: ['gustatory'] },
  loomingThreat: { label: '⚠️ Looming Threat', regions: ['lc4Left', 'lc4Right'] },
};

function regionColorFor(regions, regionIndex, i) {
  const c = new THREE.Color(regions[regionIndex[i]].color);
  return [c.r, c.g, c.b];
}

function fmtPct(x) {
  return `${Math.round(x * 100)}%`;
}

function buildHud() {
  const el = document.createElement('div');
  el.style.cssText =
    // Bottom-left, clear of #sketch-label — deliberately not bottom-right,
    // where the generic Params panel docks (confirmed by screenshot: with
    // both open at once, this sketch's own controls need the Params panel
    // for its sliders/actions, so collision there is the likely case, not
    // an edge case).
    'position:fixed;left:20px;bottom:60px;z-index:16;background:rgba(10,10,14,0.88);' +
    'color:#dff3ff;font:12px/1.5 system-ui,sans-serif;padding:12px 14px;border-radius:8px;' +
    'border:1px solid rgba(255,255,255,0.15);width:250px;max-height:78vh;overflow-y:auto;';
  el.innerHTML = `
    <div style="font-weight:600;margin-bottom:4px;">Fly Connectome</div>
    <div data-field="fps">FPS: —</div>
    <div data-field="firing">Firing: —</div>
    <div data-field="stimulus">Stimulus: idle</div>
    <div data-field="torture">Torture Loop: off</div>
    <button data-action="reset" style="margin-top:8px;width:100%;background:#2a1a1a;color:#ffb0b0;
      border:1px solid rgba(255,140,140,0.4);border-radius:5px;padding:6px;cursor:pointer;font-size:12px;">
      ♻️ Reset to Baseline
    </button>

    <div style="margin-top:10px;font-weight:600;color:#9fd7ff;">Picked neuron</div>
    <div data-field="picked" style="color:#ffe08a;">click a neuron…</div>
    <div data-field="picked-detail" style="color:rgba(223,243,255,0.75);"></div>

    <div style="margin-top:10px;font-weight:600;color:#9fd7ff;">Regions</div>
    <div data-field="region-list" style="font-size:11px;"></div>

    <div style="margin-top:10px;font-weight:600;color:#9fd7ff;">Snapshots</div>
    <div style="display:flex;gap:4px;margin-top:2px;">
      <input data-field="snapshot-name" placeholder="label" style="flex:1;min-width:0;background:#1a1a20;
        color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 6px;font-size:11px;" />
      <button data-action="snapshot" style="background:#1a1a20;color:#fff;border:1px solid rgba(255,255,255,0.2);
        border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;">💾 Save</button>
    </div>
    <div data-field="snapshot-list" style="font-size:11px;margin-top:4px;"></div>
    <div data-field="diff-result" style="font-size:11px;margin-top:4px;"></div>
  `;
  document.body.appendChild(el);
  return el;
}

export default {
  name: 'Fly Connectome',
  description:
    'A synthetic but structurally realistic fruit-fly connectome, simulated as a leaky integrate-and-fire ' +
    'network in a Web Worker — click a neuron to inspect it, trigger a sensory cascade, lesion a pathway ' +
    "and watch it fail, then snapshot and diff conditions to see which pathway controlled what.",
  tags: ['neuroscience', 'graph', 'simulation', 'connectome', 'lesion'],
  category: 'Graphs & Networks',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex:
    '\\tau\\dot{V}_i = -V_i + s\\big(\\textstyle\\sum_j w_{ij}(1{-}d_{r(j)})S_j\\big), ' +
    '\\ \\dot{d}_r = \\delta,\\ \\ \\text{scale}_r = [d_r{<}\\theta]\\,(1{-}d_r)',

  params: {
    leak: { value: 0.85, min: 0.5, max: 0.98 },
    threshold: { value: 1.0, min: 0.3, max: 3 },
    fireStrength: { value: 1.0, min: 0.2, max: 3 },
    activationDecay: { value: 0.9, min: 0.5, max: 0.99 },
    refractoryTicks: { value: 5, min: 0, max: 15, step: 1 },
    // Lesion / degradation model.
    failureThreshold: { value: 0.7, min: 0.1, max: 0.95 },
    decayRate: { value: 0, min: 0, max: 0.02 },
    // Overload model — raw slider value, always passed through the
    // sigmoid before it touches a neuron, so no setting here can blow the
    // simulation up regardless of how far it's turned up.
    overloadSteepness: { value: 1.0, min: 0.2, max: 4 },
    overloadCeiling: { value: 3.0, min: 0.5, max: 8 },
    visualInput: { value: 0, min: 0, max: 5 },
    gustatoryInput: { value: 0, min: 0, max: 5 },
  },

  // Auto-appear as buttons in the Params panel and answer to voice
  // commands, same mechanism N-Body Gravity's transform button uses.
  actions: {
    sugarSense: { label: STIMULUS_REGIONS.sugarSense.label, run: (ctx, state) => state.stimulate('sugarSense') },
    loomingThreat: { label: STIMULUS_REGIONS.loomingThreat.label, run: (ctx, state) => state.stimulate('loomingThreat') },
    lesionRandom: { label: '🔥 Random Lesion', run: (ctx, state) => state.lesionRandom() },
    lesionSelected: { label: '🎯 Lesion Selected', run: (ctx, state) => state.lesionSelected() },
    resetBaseline: { label: '♻️ Reset to Baseline', run: (ctx, state) => state.resetBaseline() },
    // A button label is set once when the panel renders, not live — so
    // rather than fight that to show "Start"/"Stop", the toggle state is
    // just surfaced in this sketch's own HUD (which *is* updated every
    // frame) via the "Torture Loop" status line.
    tortureLoop: { label: '💀 Torture Loop (toggle)', run: (ctx, state) => state.toggleTorture(ctx) },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.35, 3.4);

    const data = generateConnectome(1);
    const { neuronCount, positions, regionIndex, regions, neuronsByRegion, edges } = data;
    const regionCount = regions.length;

    // --- Neurons: one InstancedMesh ---
    const nodeGeometry = new THREE.IcosahedronGeometry(0.014, 1);
    const activationAttr = new THREE.InstancedBufferAttribute(new Float32Array(neuronCount), 1);
    const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(neuronCount * 3), 3);
    const jitterAttr = new THREE.InstancedBufferAttribute(new Float32Array(neuronCount), 1);
    // Which region each neuron belongs to — set once, never touched again.
    // Region damage itself lives in a uniform array (below), not here.
    const regionIdAttr = new THREE.InstancedBufferAttribute(new Float32Array(neuronCount), 1);
    for (let i = 0; i < neuronCount; i++) {
      const [r, g, b] = regionColorFor(regions, regionIndex, i);
      colorAttr.setXYZ(i, r, g, b);
      jitterAttr.setX(i, 0.75 + Math.random() * 0.6);
      regionIdAttr.setX(i, regionIndex[i]);
    }
    nodeGeometry.setAttribute('activation', activationAttr);
    nodeGeometry.setAttribute('regionColor', colorAttr);
    nodeGeometry.setAttribute('sizeJitter', jitterAttr);
    nodeGeometry.setAttribute('regionId', regionIdAttr);

    const nodeMaterial = new THREE.ShaderMaterial({
      vertexShader: nodeVertShader(regionCount),
      fragmentShader: NODE_FRAG,
      uniforms: {
        uDimColor: { value: DIM_COLOR },
        uActiveColor: { value: ACTIVE_COLOR },
        uDamageColor: { value: DAMAGE_COLOR },
        uRegionDamage: { value: new Float32Array(regionCount) },
        uRegionStatus: { value: new Float32Array(regionCount) },
      },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    const nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, neuronCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < neuronCount; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.updateMatrix();
      nodeMesh.setMatrixAt(i, dummy.matrix);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    ctx.scene.add(nodeMesh);

    // --- Synapses: one LineSegments, one BufferGeometry ---
    const edgePositions = new Float32Array(edges.length * 2 * 3);
    const edgeColors = new Float32Array(edges.length * 2 * 3);
    edges.forEach(([src, dst], e) => {
      const a = e * 6;
      edgePositions[a] = positions[src * 3];
      edgePositions[a + 1] = positions[src * 3 + 1];
      edgePositions[a + 2] = positions[src * 3 + 2];
      edgePositions[a + 3] = positions[dst * 3];
      edgePositions[a + 4] = positions[dst * 3 + 1];
      edgePositions[a + 5] = positions[dst * 3 + 2];
      for (let k = 0; k < 6; k += 3) {
        edgeColors[a + k] = DIM_EDGE.r;
        edgeColors[a + k + 1] = DIM_EDGE.g;
        edgeColors[a + k + 2] = DIM_EDGE.b;
      }
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    edgeGeometry.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    ctx.scene.add(edgeLines);

    // Outgoing-edge index lookup, for highlighting a clicked neuron's
    // downstream wiring without touching the whole edge buffer.
    const outgoingEdgeIndices = Array.from({ length: neuronCount }, () => []);
    edges.forEach(([src], e) => outgoingEdgeIndices[src].push(e));

    // --- Worker-driven LIF + lesion simulation ---
    const worker = new Worker(new URL('../lib/flyLifWorker.js', import.meta.url), { type: 'module' });
    worker.postMessage({
      type: 'init',
      neuronCount,
      neuronRegion: Array.from(regionIndex),
      regionCount,
      edges,
      leak: ctx.params.leak,
      threshold: ctx.params.threshold,
      fireStrength: ctx.params.fireStrength,
      activationDecay: ctx.params.activationDecay,
      refractoryTicks: ctx.params.refractoryTicks,
      failureThreshold: ctx.params.failureThreshold,
      decayRate: ctx.params.decayRate,
      overloadSteepness: ctx.params.overloadSteepness,
      overloadCeiling: ctx.params.overloadCeiling,
      tickHz: 24,
    });

    const hud = buildHud();
    const field = (name) => hud.querySelector(`[data-field="${name}"]`);

    // See the shallow-copy note further down (on `sim`) for why this is a
    // separate object rather than top-level fields on `state`.
    const regionIdIndices = (id) => {
      const ri = regions.findIndex((r) => r.id === id);
      return ri === -1 ? [] : neuronsByRegion[ri];
    };

    const sim = {
      firedCount: 0,
      stimulusLabel: 'idle',
      stimulusUntil: 0,
      regionDamage: new Array(regionCount).fill(0),
      regionStatus: new Array(regionCount).fill(0),
      pickedNeuron: -1,
      snapshots: [], // { label, regionDamage: number[], regionStatus: number[] }
      diffSelection: [], // up to 2 indices into snapshots
      // Fixed neuron-index lists for the two continuous overload sliders —
      // computed once here rather than every frame in update().
      visualIndices: [...regionIdIndices('lc4Left'), ...regionIdIndices('lc4Right')],
      gustatoryIndices: regionIdIndices('gustatory'),
      allSensoryIndices: [...regionIdIndices('lc4Left'), ...regionIdIndices('lc4Right'), ...regionIdIndices('gustatory')],
      // Reused every frame in update() (just the two `raw` fields get
      // written) instead of building a fresh array-of-objects each time —
      // postMessage still structured-clones it regardless, but this skips
      // the send-side allocation.
      sensoryInputPayload: [
        { indices: null, raw: 0 }, // .indices filled in below, once visualIndices/gustatoryIndices exist
        { indices: null, raw: 0 },
      ],
      // Self-running demo: cycles through the dramatic effects on its own
      // timer so you don't have to click through them by hand.
      tortureActive: false,
      nextTortureAt: 0,
    };
    sim.sensoryInputPayload[0].indices = sim.visualIndices;
    sim.sensoryInputPayload[1].indices = sim.gustatoryIndices;

    function regionRow(ri) {
      const d = sim.regionDamage[ri];
      const st = sim.regionStatus[ri];
      return `${STATUS_DOT[st]} ${regions[ri].label} — ${fmtPct(d)}`;
    }

    function renderRegionList() {
      field('region-list').innerHTML = regions.map((r, ri) => regionRow(ri)).join('<br>');
    }

    function renderSnapshotList() {
      const rows = sim.snapshots.map((snap, i) => {
        const sel = sim.diffSelection.includes(i);
        const tag = sel ? (sim.diffSelection.indexOf(i) === 0 ? ' [A]' : ' [B]') : '';
        return `<div data-snapshot-idx="${i}" style="cursor:pointer;padding:2px 4px;border-radius:3px;${
          sel ? 'background:rgba(255,224,138,0.18);color:#ffe08a;' : 'color:rgba(223,243,255,0.85);'
        }">${snap.label}${tag}</div>`;
      });
      field('snapshot-list').innerHTML = rows.join('') || '<span style="color:rgba(223,243,255,0.5)">no snapshots yet</span>';

      field('snapshot-list').querySelectorAll('[data-snapshot-idx]').forEach((row) => {
        row.addEventListener('click', () => {
          const idx = Number(row.dataset.snapshotIdx);
          const pos = sim.diffSelection.indexOf(idx);
          if (pos !== -1) sim.diffSelection.splice(pos, 1);
          else {
            sim.diffSelection.push(idx);
            if (sim.diffSelection.length > 2) sim.diffSelection.shift();
          }
          renderSnapshotList();
          renderDiff();
        });
      });
    }

    function renderDiff() {
      if (sim.diffSelection.length !== 2) {
        field('diff-result').innerHTML = '';
        return;
      }
      const [a, b] = sim.diffSelection.map((i) => sim.snapshots[i]);
      const rows = regions
        .map((r, ri) => {
          const da = a.regionDamage[ri], db = b.regionDamage[ri];
          const delta = db - da;
          if (Math.abs(delta) < 0.01 && a.regionStatus[ri] === b.regionStatus[ri]) return null;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
          const changed = a.regionStatus[ri] !== b.regionStatus[ri] ? ' <b>status changed</b>' : '';
          return `${r.label}: ${fmtPct(da)} → ${fmtPct(db)} ${arrow}${changed}`;
        })
        .filter(Boolean);
      field('diff-result').innerHTML =
        `<div style="margin-top:2px;color:#9fd7ff;">${a.label} → ${b.label}:</div>` +
        (rows.length ? rows.join('<br>') : 'no meaningful difference');
    }

    // SketchRunner.build() does `this.state = {...this.state, ...returned}`
    // — a SHALLOW copy of whatever setup() returns. Object references (a
    // DOM node, an array, the Worker itself) still work fine after that,
    // since both the original and the copy point at the same object — but
    // a *primitive* field reassigned later from a closure that captured
    // the original `state` variable (worker.onmessage, stimulate(), etc.)
    // would silently write to an object update() never sees again. `sim`
    // sidesteps it: it's copied by reference, so every closure and
    // update() keep reading/writing the same live object.
    const state = {
      nodeMesh,
      nodeGeometry,
      nodeMaterial,
      edgeGeometry,
      edgeMaterial,
      edgeLines,
      worker,
      hud,
      activation: new Float32Array(neuronCount),
      sim,
      fpsWindow: [],
      highlightedEdges: [],

      stimulate(name) {
        const spec = STIMULUS_REGIONS[name];
        if (!spec) return;
        const indices = spec.regions.flatMap(regionIdIndices);
        worker.postMessage({ type: 'stimulate', indices, strength: ctx.params.threshold * 1.6 });
        sim.stimulusLabel = spec.label;
        sim.stimulusUntil = ctx.time + 2.5;
      },

      lesionRandom() {
        const ri = Math.floor(Math.random() * regionCount);
        worker.postMessage({ type: 'lesion', regionIndex: ri, amount: 0.35 + Math.random() * 0.3 });
      },

      lesionSelected() {
        if (sim.pickedNeuron === -1) return;
        worker.postMessage({ type: 'lesion', regionIndex: regionIndex[sim.pickedNeuron], amount: 0.4 });
      },

      resetBaseline() {
        worker.postMessage({ type: 'resetBaseline' });
      },

      toggleTorture(ctx) {
        sim.tortureActive = !sim.tortureActive;
        if (sim.tortureActive) sim.nextTortureAt = ctx.time; // fire the first effect immediately
      },

      // One random dramatic effect per call — update() below calls this
      // on its own timer while the loop is active. Weighted so lesions and
      // the overload burst (the two "torture" effects proper) show up
      // more than the gentler one-shot stimuli, with an occasional reset
      // so the demo doesn't just accumulate damage forever.
      runTortureEffect(ctx) {
        const roll = Math.random();
        if (roll < 0.2) this.stimulate('sugarSense');
        else if (roll < 0.4) this.stimulate('loomingThreat');
        else if (roll < 0.7) this.lesionRandom();
        else if (roll < 0.92) {
          // Every sensory pathway at once — still sigmoid-clamped, so this
          // is "more inputs firing together", not "a bigger raw number".
          worker.postMessage({ type: 'stimulate', indices: sim.allSensoryIndices, strength: ctx.params.threshold * 3 });
          sim.stimulusLabel = '💥 Overload Burst';
          sim.stimulusUntil = ctx.time + 2.5;
        } else {
          this.resetBaseline();
        }
      },

      saveSnapshot(label) {
        sim.snapshots.push({
          label: label || `snapshot ${sim.snapshots.length + 1}`,
          regionDamage: sim.regionDamage.slice(),
          regionStatus: sim.regionStatus.slice(),
        });
        renderSnapshotList();
      },
    };

    // The HUD's region list only needs to repaint when a value in it
    // actually moved — worth checking before touching innerHTML at 24Hz,
    // since most ticks (nothing currently lesioned/decaying) change nothing.
    let lastRenderedDamage = null;
    let lastRenderedStatus = null;
    function regionStateChanged(damage, status) {
      if (!lastRenderedDamage) return true;
      for (let r = 0; r < damage.length; r++) {
        if (damage[r] !== lastRenderedDamage[r] || status[r] !== lastRenderedStatus[r]) return true;
      }
      return false;
    }

    worker.onmessage = (e) => {
      if (e.data.type !== 'tick') return;
      state.activation = e.data.activation;
      sim.firedCount = e.data.firedCount;
      const regionListDirty = regionStateChanged(e.data.regionDamage, e.data.regionStatus);
      sim.regionDamage = e.data.regionDamage;
      sim.regionStatus = e.data.regionStatus;
      activationAttr.array.set(state.activation);
      activationAttr.needsUpdate = true;
      // 10 floats each, straight into the uniforms the vertex shader
      // already looks up by regionId — no per-neuron broadcast anymore.
      nodeMaterial.uniforms.uRegionDamage.value.set(sim.regionDamage);
      nodeMaterial.uniforms.uRegionStatus.value.set(sim.regionStatus);

      if (regionListDirty) {
        renderRegionList();
        lastRenderedDamage = sim.regionDamage.slice();
        lastRenderedStatus = sim.regionStatus.slice();
      }
    };
    worker.onerror = (err) => console.error('[fly-connectome] worker error:', err.message);

    // --- Raycasting: click a neuron, highlight its downstream wiring ---
    function onClick(event) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, ctx.camera);
      const hits = raycaster.intersectObject(nodeMesh);
      if (!hits.length) return;

      const i = hits[0].instanceId;
      sim.pickedNeuron = i;
      const ri = regionIndex[i];
      const region = regions[ri];
      const damage = sim.regionDamage[ri];
      const status = sim.regionStatus[ri];
      const decayRate = ctx.params.decayRate;
      const distance = Math.max(0, ctx.params.failureThreshold - damage);
      const ticksToFailure = status === 2 ? 0 : decayRate > 0 ? Math.ceil(distance / decayRate) : Infinity;

      field('picked').textContent = `#${i} · ${region.label}`;
      field('picked-detail').innerHTML =
        `${STATUS_DOT[status]} ${STATUS_LABEL[status]} · damage ${fmtPct(damage)}<br>` +
        `distance to failure: ${fmtPct(distance)}<br>` +
        `weight vs. baseline: ${status === 2 ? '−100%' : `−${fmtPct(damage)}`}<br>` +
        `est. ticks to failure: ${Number.isFinite(ticksToFailure) ? ticksToFailure : 'stable'}`;

      // Reset previously-highlighted edges, then light up this neuron's
      // outgoing wiring.
      const colors = edgeGeometry.attributes.color;
      for (const e of state.highlightedEdges) {
        const a = e * 2;
        colors.setXYZ(a, DIM_EDGE.r, DIM_EDGE.g, DIM_EDGE.b);
        colors.setXYZ(a + 1, DIM_EDGE.r, DIM_EDGE.g, DIM_EDGE.b);
      }
      const outgoing = outgoingEdgeIndices[i];
      for (const e of outgoing) {
        const a = e * 2;
        colors.setXYZ(a, HIGHLIGHT_EDGE.r, HIGHLIGHT_EDGE.g, HIGHLIGHT_EDGE.b);
        colors.setXYZ(a + 1, HIGHLIGHT_EDGE.r, HIGHLIGHT_EDGE.g, HIGHLIGHT_EDGE.b);
      }
      colors.needsUpdate = true;
      state.highlightedEdges = outgoing;

      // A direct, user-triggered stimulus too — clicking a neuron fires it.
      worker.postMessage({ type: 'stimulate', indices: [i], strength: ctx.params.threshold * 2 });
    }
    ctx.renderer.domElement.addEventListener('click', onClick);
    state.onClick = onClick;

    // These buttons live inside `hud`, which dispose() removes wholesale —
    // no separate cleanup needed (unlike the canvas click listener above,
    // which outlives this sketch and so must be explicitly unhooked).
    hud.querySelector('[data-action="reset"]').addEventListener('click', () => state.resetBaseline());
    const nameInput = hud.querySelector('[data-field="snapshot-name"]');
    hud.querySelector('[data-action="snapshot"]').addEventListener('click', () => {
      state.saveSnapshot(nameInput.value.trim());
      nameInput.value = '';
    });

    renderRegionList();
    renderSnapshotList();

    return state;
  },

  update(ctx, state) {
    // Only post 'params' when a slider actually moved, not unconditionally
    // every frame — the worker already holds these values, so a resend
    // with nothing changed is pure waste.
    const p = ctx.params;
    const prev = state.lastParams;
    if (
      !prev ||
      prev.leak !== p.leak ||
      prev.threshold !== p.threshold ||
      prev.fireStrength !== p.fireStrength ||
      prev.activationDecay !== p.activationDecay ||
      prev.refractoryTicks !== p.refractoryTicks ||
      prev.failureThreshold !== p.failureThreshold ||
      prev.decayRate !== p.decayRate ||
      prev.overloadSteepness !== p.overloadSteepness ||
      prev.overloadCeiling !== p.overloadCeiling
    ) {
      state.worker.postMessage({
        type: 'params',
        leak: p.leak,
        threshold: p.threshold,
        fireStrength: p.fireStrength,
        activationDecay: p.activationDecay,
        refractoryTicks: p.refractoryTicks,
        failureThreshold: p.failureThreshold,
        decayRate: p.decayRate,
        overloadSteepness: p.overloadSteepness,
        overloadCeiling: p.overloadCeiling,
      });
      state.lastParams = { ...p };
    }

    // Continuous overload sliders — sent every frame so turning one down
    // stops the injection promptly; the worker re-saturates this through
    // the same sigmoid a one-shot stimulate() uses, every single tick, so
    // holding a slider at max forever still can't exceed overloadCeiling.
    if (ctx.params.visualInput > 0 || ctx.params.gustatoryInput > 0) {
      const payload = state.sim.sensoryInputPayload;
      payload[0].raw = ctx.params.visualInput;
      payload[1].raw = ctx.params.gustatoryInput;
      state.worker.postMessage({ type: 'sensoryInput', regions: payload });
    }

    // Torture loop: while active, fire one random dramatic effect every
    // ~2.5-4s on its own — no more clicking through them by hand.
    if (state.sim.tortureActive && ctx.time >= state.sim.nextTortureAt) {
      state.runTortureEffect(ctx);
      state.sim.nextTortureAt = ctx.time + 2.5 + Math.random() * 1.5;
    }

    state.fpsWindow.push(ctx.delta);
    if (state.fpsWindow.length > 30) state.fpsWindow.shift();
    const avgDelta = state.fpsWindow.reduce((a, b) => a + b, 0) / state.fpsWindow.length;

    const hud = state.hud;
    hud.querySelector('[data-field="fps"]').textContent = `FPS: ${Math.round(1 / Math.max(avgDelta, 1e-4))}`;
    hud.querySelector('[data-field="firing"]').textContent = `Firing: ${state.sim.firedCount}`;
    hud.querySelector('[data-field="stimulus"]').textContent =
      `Stimulus: ${ctx.time < state.sim.stimulusUntil ? state.sim.stimulusLabel : 'idle'}`;
    hud.querySelector('[data-field="torture"]').textContent =
      `Torture Loop: ${state.sim.tortureActive ? '💀 ON' : 'off'}`;
  },

  dispose(ctx, state) {
    state.worker.postMessage({ type: 'stop' });
    state.worker.terminate();
    ctx.renderer.domElement.removeEventListener('click', state.onClick);
    state.hud.remove();
    state.nodeGeometry.dispose();
    state.nodeMaterial.dispose();
    state.edgeGeometry.dispose();
    state.edgeMaterial.dispose();
  },
};
