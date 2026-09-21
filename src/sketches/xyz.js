import { THREE } from '../core/sketchHelpers.js';

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAG = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uIterations;
  uniform float uScale;
  uniform float uSpeed;

  // Integrated trigonometric wave function over spatial domain
  // Indefinite Integral: S sin(k*x + t) dx = -cos(k*x + t) / k
  vec2 SpatialTrigIntegral(vec2 p, float freq, float time) {
    vec2 integrated = -cos(p * freq + time) / freq;
    return integrated;
  }

  void main() {
    vec2 st = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
    vec2 p = st * 2.0;

    float angle = uTime * uSpeed;
    mat2 rot = mat2(
      cos(angle), -sin(angle),
      sin(angle),  cos(angle)
    );

    for (float i = 0.0; i < 32.0; i++) {
      if (i >= uIterations) break;
      p = abs(p);
      p -= vec2(0.15);
      p *= uScale;
      p *= rot;

      // Inject integral term every loop iteration to continuously warp domain geometry
      vec2 intTerm = SpatialTrigIntegral(p, 2.5 + sin(uTime * 0.2), uTime * 0.5);
      p += intTerm * 0.08;
    }

    // Color evaluation with integrated vector offsets
    vec2 colorIntR = SpatialTrigIntegral(p + vec2(0.2, 0.0), 3.0, uTime * 0.4);
    vec2 colorIntG = SpatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
    vec2 colorIntB = SpatialTrigIntegral(p + vec2(0.4, 0.2), 5.0, uTime * 0.2);

    vec3 color = vec3(
      length(p + colorIntR),
      length(p + colorIntG),
      length(p + colorIntB)
    );

    color = sin(color * 67.0) * 0.5 + 0.5;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export default {
  name: 'Radian628 Integral-Warped GLSL Fractal',
  description: 'Iterative space-folding fractal warped by integrated trigonometric functions for dynamic shape variation.',
  tags: ['fractal', '2d', 'radian628', 'shadertoy', 'glsl', 'integral'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  params: {
    iterations: {
      value: 16.0,
      min: 4.0,
      max: 32.0,
      step: 1.0,
    },
    scale: {
      value: 1.1,
      min: 1.01,
      max: 1.5,
      step: 0.01,
    },
    speed: {
      value: 0.05,
      min: 0.005,
      max: 0.2,
      step: 0.005,
    },
  },

  setup(ctx) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uIterations: { value: ctx.params.iterations },
        uScale: { value: ctx.params.scale },
        uSpeed: { value: ctx.params.speed },
      },
    });

    const mesh = new THREE.Mesh(geometry, material);
    ctx.scene.add(mesh);

    return { mesh, material };
  },

  update(ctx, state) {
    state.material.uniforms.uTime.value = ctx.time;
    state.material.uniforms.uIterations.value = ctx.params.iterations;
    state.material.uniforms.uScale.value = ctx.params.scale;
    state.material.uniforms.uSpeed.value = ctx.params.speed;
  },

  dispose(ctx, state) {
    state.mesh.geometry.dispose();
    state.material.dispose();
  },
};
