import * as THREE from 'three';

// A glow (bloom) pipeline for sketches that want to shine: the scene is
// drawn in high dynamic range, everything brighter than a threshold is
// blurred at three scales and added back, then tone-mapped (ACES) to sRGB.
//
//   const glow = createGlow(ctx, { strength: 0.9, threshold: 0.7, exposure: 1, fov: 40 });
//
// Pass `fov` (degrees, as framed on a wide screen) and the camera widens on
// tall screens, so a phone in portrait sees the same scene.
//   glow.strength = 1.2;          // adjustable any time
//   glow.dispose();               // in the sketch's dispose()
//
// Like createEnvironment, it works by setting ctx.pipeline, which
// SketchRunner uses instead of rendering straight to the sketch's target.

const QUAD_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const BRIGHT_FRAG = `
  uniform sampler2D tSrc;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 1.6 + 0.05, l), 1.0);
  }
`;

// 9-tap Gaussian along one direction, using linear filtering (5 fetches).
const BLUR_FRAG = `
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
    c += texture2D(tSrc, vUv + uStep * 1.3846154).rgb * 0.3162162;
    c += texture2D(tSrc, vUv - uStep * 1.3846154).rgb * 0.3162162;
    c += texture2D(tSrc, vUv + uStep * 3.2307692).rgb * 0.0702703;
    c += texture2D(tSrc, vUv - uStep * 3.2307692).rgb * 0.0702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = `
  uniform sampler2D tScene;
  uniform sampler2D tB1;
  uniform sampler2D tB2;
  uniform sampler2D tB3;
  uniform float uStrength;
  uniform float uExposure;
  uniform float uVignette;
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;
  vec3 rrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 c) {
    const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    return clamp(OUT * rrtOdt(IN * c), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.35 + texture2D(tB3, vUv).rgb * 0.3;
    c = (c + uStrength * bloom) * uExposure;
    c = aces(c);
    vec2 q = vUv - 0.5;
    q.x *= uResolution.x / uResolution.y;
    c *= 1.0 - uVignette * smoothstep(0.4, 1.15, length(q));
    c = toSrgb(c);
    c += (hash(vUv * uResolution + fract(uTime) * 91.0) - 0.5) / 255.0 * 1.5;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createGlow(ctx, options = {}) {
  const opts = { strength: 0.9, threshold: 0.7, exposure: 1, vignette: 0.4, ...options };
  const half = { type: THREE.HalfFloatType, depthBuffer: false };
  const { width, height } = ctx.size;
  const hdr = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
  // Three levels of blur, each at half the size of the last.
  const levels = [2, 4, 8].map((d) => ({
    d,
    a: new THREE.WebGLRenderTarget(Math.max(1, width / d), Math.max(1, height / d), half),
    b: new THREE.WebGLRenderTarget(Math.max(1, width / d), Math.max(1, height / d), half),
  }));

  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const bright = mat(BRIGHT_FRAG, { tSrc: { value: null }, uThreshold: { value: opts.threshold } });
  const blur = mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });
  const comp = mat(COMPOSITE_FRAG, {
    tScene: { value: hdr.texture },
    tB1: { value: levels[0].a.texture },
    tB2: { value: levels[1].a.texture },
    tB3: { value: levels[2].a.texture },
    uStrength: { value: opts.strength },
    uExposure: { value: opts.exposure },
    uVignette: { value: opts.vignette },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
  });

  const pass = (r, material, target) => {
    quad.material = material;
    r.setRenderTarget(target);
    r.render(quadScene, quadCam);
  };

  function fitCamera(w, h) {
    if (!opts.fov || !ctx.camera.isPerspectiveCamera) return;
    const aspect = w / h;
    const half = THREE.MathUtils.degToRad(opts.fov / 2);
    const vfov = aspect >= 1.4 ? opts.fov : THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * 1.4) / aspect));
    ctx.camera.fov = Math.min(vfov, 85);
    ctx.camera.updateProjectionMatrix();
  }
  fitCamera(width, height);

  ctx.pipeline = {
    render(r, scene, camera, target) {
      r.setRenderTarget(hdr);
      r.clear();
      r.render(scene, camera);
      let src = hdr.texture;
      for (const lv of levels) {
        // Bright parts (from the scene at the first level, then from the
        // previous level's blur), then a horizontal and a vertical blur.
        bright.uniforms.tSrc.value = src;
        bright.uniforms.uThreshold.value = lv.d === 2 ? opts.threshold : 0;
        pass(r, bright, lv.a);
        const w = lv.a.width;
        const h = lv.a.height;
        blur.uniforms.tSrc.value = lv.a.texture;
        blur.uniforms.uStep.value.set(1 / w, 0);
        pass(r, blur, lv.b);
        blur.uniforms.tSrc.value = lv.b.texture;
        blur.uniforms.uStep.value.set(0, 1 / h);
        pass(r, blur, lv.a);
        src = lv.a.texture;
      }
      comp.uniforms.uTime.value = performance.now() / 1000;
      pass(r, comp, target);
    },
    setSize(w, h) {
      hdr.setSize(w, h);
      for (const lv of levels) {
        lv.a.setSize(Math.max(1, w / lv.d), Math.max(1, h / lv.d));
        lv.b.setSize(Math.max(1, w / lv.d), Math.max(1, h / lv.d));
      }
      comp.uniforms.uResolution.value.set(w, h);
      fitCamera(w, h);
    },
  };

  return {
    set strength(v) { comp.uniforms.uStrength.value = v; },
    get strength() { return comp.uniforms.uStrength.value; },
    set exposure(v) { comp.uniforms.uExposure.value = v; },
    set threshold(v) { opts.threshold = v; },
    dispose() {
      delete ctx.pipeline;
      hdr.dispose();
      for (const lv of levels) { lv.a.dispose(); lv.b.dispose(); }
      for (const m of [bright, blur, comp]) m.dispose();
      quad.geometry.dispose();
    },
  };
}
