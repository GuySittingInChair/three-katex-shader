export default {
  name: 'Marble Texture',
  description: 'Classic fbm-perturbed sine veining — the procedural marble/stone look.',
  tags: ['procedural', 'noise', 'texture'],
  category: 'Procedural Textures',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'm(\\mathbf{x}) = \\sin\\big((x + \\tau \\cdot \\text{fbm}(s\\mathbf{x})) \\cdot f\\big)',

  params: {
    turbulence: { value: 3.0, min: 0.5, max: 8 },
    veinFrequency: { value: 8.0, min: 2, max: 20 },
    scale: { value: 2.5, min: 1, max: 6 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uTurbulence;
    uniform float uVeinFrequency;
    uniform float uScale;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.03;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = vUv;
      uv.x *= uResolution.x / uResolution.y;

      vec2 p = uv * uScale + vec2(uTime * 0.02, 0.0);
      float n = fbm(p);

      float marble = sin((uv.x * uScale + n * uTurbulence) * uVeinFrequency);
      float vein = abs(marble);

      vec3 base = vec3(0.93, 0.9, 0.85);
      vec3 dark = vec3(0.15, 0.14, 0.16);
      vec3 color = mix(dark, base, smoothstep(0.05, 0.6, vein));

      // Slight warm/cool tint variation from the underlying fbm field.
      color += (n - 0.5) * 0.05;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uTurbulence: { value: 3.0 }, uVeinFrequency: { value: 8.0 }, uScale: { value: 2.5 } };
  },

  update(ctx, state) {
    state.uniforms.uTurbulence.value = ctx.params.turbulence;
    state.uniforms.uVeinFrequency.value = ctx.params.veinFrequency;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
