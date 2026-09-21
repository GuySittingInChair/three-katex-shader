import * as THREE from 'three';

const ROWS = 10;
const ROW_SPACING = 0.24;
const PEG_SPACING = 0.24;
const TOP_Y = 1.6;
const BIN_GAP = 0.35;
const BALL_COUNT = 60;
const RESET_AFTER = 300;

function rowY(r) {
  return TOP_Y - r * ROW_SPACING;
}

const BOTTOM_Y = rowY(ROWS - 1) - BIN_GAP;

export default {
  name: 'Galton Board',
  description: 'A bean machine: independent left/right coin flips at each peg row build up a binomial histogram.',
  tags: ['probability', 'statistics', 'simulation'],
  category: 'Probability',
  mode: '3d',
  shaderLang: 'glsl',
  controls: 'orbit',
  latex: 'P(k) = \\binom{n}{k}\\left(\\tfrac{1}{2}\\right)^{n},\\quad n = 10',

  params: {
    speed: { value: 1.2, min: 0.3, max: 3 },
  },

  setup(ctx) {
    ctx.camera.position.set(0, 0.4, 4.2);
    ctx.camera.lookAt(0, -0.2, 0);

    const dummy = new THREE.Object3D();

    const pegGeometry = new THREE.SphereGeometry(0.035, 10, 10);
    const pegMaterial = new THREE.MeshBasicMaterial({ color: 0x9fb4c9 });
    const pegCount = (ROWS * (ROWS + 1)) / 2;
    const pegs = new THREE.InstancedMesh(pegGeometry, pegMaterial, pegCount);
    let pi = 0;
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r);
      for (let j = 0; j <= r; j++) {
        const x = (j - r / 2) * PEG_SPACING;
        dummy.position.set(x, y, 0);
        dummy.updateMatrix();
        pegs.setMatrixAt(pi++, dummy.matrix);
      }
    }
    pegs.instanceMatrix.needsUpdate = true;
    ctx.scene.add(pegs);

    const ballGeometry = new THREE.SphereGeometry(0.045, 10, 10);
    const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xffb454 });
    const balls = new THREE.InstancedMesh(ballGeometry, ballMaterial, BALL_COUNT);
    ctx.scene.add(balls);

    const binCount = ROWS + 1;
    const binGeometry = new THREE.BoxGeometry(PEG_SPACING * 0.75, 1, PEG_SPACING * 0.75);
    binGeometry.translate(0, 0.5, 0);
    const binMaterial = new THREE.MeshBasicMaterial({ color: 0x6fe3a3 });
    const bins = new THREE.InstancedMesh(binGeometry, binMaterial, binCount);
    ctx.scene.add(bins);

    const histogram = new Float32Array(binCount);

    const ballState = {
      y: new Float32Array(BALL_COUNT),
      xTarget: new Float32Array(BALL_COUNT),
      xVisual: new Float32Array(BALL_COUNT),
      rowIndex: new Int32Array(BALL_COUNT),
    };

    function spawnBall(i, stagger) {
      ballState.y[i] = TOP_Y + 0.3 + stagger;
      ballState.xTarget[i] = 0;
      ballState.xVisual[i] = 0;
      ballState.rowIndex[i] = 0;
    }

    for (let i = 0; i < BALL_COUNT; i++) {
      spawnBall(i, (i / BALL_COUNT) * 2.0);
    }

    return { pegs, balls, bins, dummy, ballState, histogram, spawnBall, landedCount: 0 };
  },

  update(ctx, state) {
    const { balls, bins, dummy, ballState, histogram, spawnBall } = state;
    const fallSpeed = 0.9 * ctx.params.speed;
    const binCount = ROWS + 1;

    for (let i = 0; i < BALL_COUNT; i++) {
      ballState.y[i] -= fallSpeed * ctx.delta;

      while (ballState.rowIndex[i] < ROWS && ballState.y[i] <= rowY(ballState.rowIndex[i])) {
        ballState.xTarget[i] += (Math.random() < 0.5 ? -1 : 1) * (PEG_SPACING / 2);
        ballState.rowIndex[i] += 1;
      }

      ballState.xVisual[i] += (ballState.xTarget[i] - ballState.xVisual[i]) * Math.min(1, ctx.delta * 8);

      if (ballState.rowIndex[i] >= ROWS && ballState.y[i] <= BOTTOM_Y) {
        let k = Math.round(ballState.xTarget[i] / PEG_SPACING + ROWS / 2);
        k = Math.max(0, Math.min(binCount - 1, k));
        histogram[k] += 1;
        state.landedCount += 1;

        if (state.landedCount >= RESET_AFTER) {
          state.landedCount = 0;
          histogram.fill(0);
        }

        spawnBall(i, Math.random() * 0.6);
      }

      dummy.position.set(ballState.xVisual[i], ballState.y[i], 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      balls.setMatrixAt(i, dummy.matrix);
    }
    balls.instanceMatrix.needsUpdate = true;

    let maxCount = 4;
    for (let k = 0; k < binCount; k++) maxCount = Math.max(maxCount, histogram[k]);

    for (let k = 0; k < binCount; k++) {
      const x = (k - ROWS / 2) * PEG_SPACING;
      const h = 0.05 + (histogram[k] / maxCount) * 1.2;
      dummy.position.set(x, BOTTOM_Y - 0.15, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      bins.setMatrixAt(k, dummy.matrix);
    }
    bins.instanceMatrix.needsUpdate = true;
    dummy.scale.set(1, 1, 1);
  },

  dispose(ctx, state) {
    state.pegs.geometry.dispose();
    state.pegs.material.dispose();
    state.balls.geometry.dispose();
    state.balls.material.dispose();
    state.bins.geometry.dispose();
    state.bins.material.dispose();
  },
};
