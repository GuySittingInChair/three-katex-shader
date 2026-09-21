import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { audioEngine } from './audioEngine.js';

const FULLSCREEN_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

function flattenParams(schema) {
  const out = {};
  for (const [key, def] of Object.entries(schema || {})) out[key] = def.value;
  return out;
}

// Wraps one sketch: owns its scene, camera, controls, and render target.
export class SketchRunner {
  // `paramValues` is the live {key: value} object SketchManager tracks per
  // sketch id (shared by reference — mutating it, e.g. from a slider or a
  // voice command, is immediately visible to update() next frame). Falls
  // back to fresh schema defaults if constructed without one.
  constructor(sketch, renderer, size, domElement, paramValues) {
    this.sketch = sketch;
    this.renderer = renderer;
    this.domElement = domElement;

    this.target = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    });

    this.ctx = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(75, size.width / size.height, 0.01, 1000),
      controls: null,
      renderer,
      target: this.target,
      size: { ...size },
      time: 0,
      delta: 0,
      frame: 0,
      params: paramValues || flattenParams(sketch.params),
      // Shared singleton, mutated in place every frame by audioEngine.js —
      // always current, no reassignment needed here.
      audio: audioEngine,
      // A sketch that declares `motion(t, params) -> { name: number, … }`
      // is driven by an equation, not by dials: `motionTime` is seconds of
      // that motion (scaled by the sketch's `speed` param, if it has one, so
      // changing speed never makes the phase jump) and `motion` is the
      // equation's current output, shared by the geometry/shader updates and
      // the LaTeX overlay so they always show the same numbers.
      motionTime: 0,
      motion: null,
    };
    this.ctx.camera.position.set(0, 0, 3);

    this.state = null;
    this.built = false;
  }

  build() {
    if (this.built) return;

    if (this.sketch.mode === '2d') {
      throw new Error(`Sketch "${this.sketch.name}": mode '2d' is reserved but not yet implemented.`);
    }

    if (this.sketch.mode === 'shader') {
      // Manager supplies the fullscreen quad + ortho camera.
      this.ctx.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const uniforms = {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(this.ctx.size.width, this.ctx.size.height) },
        ...(this.sketch.uniforms ? this.sketch.uniforms() : {}),
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: this.sketch.fragmentShader,
        uniforms,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      this.ctx.scene.add(quad);
      this.state = { quad, material, uniforms };
    }

    this._stepMotion(0);

    if (this.sketch.setup) {
      const returned = this.sketch.setup(this.ctx);
      this.state = { ...(this.state || {}), ...(returned || {}) };
    }

    if (this.sketch.controls === 'orbit') {
      this.ctx.controls = new OrbitControls(this.ctx.camera, this.domElement);
      this.ctx.controls.enableDamping = true;
    }

    this.built = true;
  }

  update(time, delta) {
    if (!this.built) return;
    this.ctx.time = time;
    this.ctx.delta = delta;
    this.ctx.frame++;
    if (this.ctx.controls) this.ctx.controls.update();
    this._stepMotion(delta);
    if (this.state?.uniforms?.uTime) this.state.uniforms.uTime.value = time;
    this.sketch.update?.(this.ctx, this.state);
  }

  _stepMotion(delta) {
    if (!this.sketch.motion) return;
    this.ctx.motionTime += delta * (this.ctx.params.speed ?? 1);
    this.ctx.motion = this.sketch.motion(this.ctx.motionTime, this.ctx.params);
  }

  render() {
    if (!this.built) return;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.ctx.scene, this.ctx.camera);
    this.renderer.setRenderTarget(prev);
  }

  resize(size) {
    this.ctx.size = { ...size };
    this.target.setSize(size.width, size.height);
    if (this.ctx.camera.isPerspectiveCamera) {
      this.ctx.camera.aspect = size.width / size.height;
      this.ctx.camera.updateProjectionMatrix();
    }
    if (this.state?.uniforms?.uResolution) {
      this.state.uniforms.uResolution.value.set(size.width, size.height);
    }
    this.sketch.resize?.(this.ctx, this.state);
  }

  dispose() {
    if (!this.built) return;
    this.sketch.dispose?.(this.ctx, this.state);
    // Defensive teardown: forgetting dispose() should degrade, not leak.
    this.ctx.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material?.dispose?.();
    });
    this.ctx.scene.clear();
    this.ctx.controls?.dispose();
    this.target.dispose();
    this.state = null;
    this.built = false;
  }
}
