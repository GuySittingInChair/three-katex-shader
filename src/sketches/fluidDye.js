export default {
  name: 'Fluid Dye',
  description: 'Domain-warped fractal noise, the classic cheap trick for convincing flowing dye/smoke.',
  tags: ['fluid', 'noise', 'shader'],
  category: 'Fluid Flow',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'f(\\mathbf{p}) = \\mathrm{fbm}\\big(\\mathbf{p} + w\\cdot\\mathrm{fbm}(\\mathbf{p} + w\\cdot\\mathrm{fbm}(\\mathbf{p} + t))\\big)',

  params: {
    speed: { value: 0.6, min: 0, max: 2 },
    warpStrength: { value: 0.8, min: 0.1, max: 2 },
    scale: { value: 3.0, min: 1, max: 8 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpeed;
    uniform float uWarpStrength;
    uniform float uScale;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float sum = 0.0;
      float amp = 0.5;
      float freq = 1.0;
      for (int i = 0; i < 5; i++) {
        sum += amp * noise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
      }
      return sum;
    }

    void main() {
      vec2 uv = vUv;
      uv.x *= uResolution.x / uResolution.y;
      uv *= uScale;

      float t = uTime * uSpeed;

      vec2 q = vec2(
        fbm(uv + t * 0.15),
        fbm(uv + vec2(5.2, 1.3) - t * 0.1)
      );
      vec2 r = vec2(
        fbm(uv + q * uWarpStrength + vec2(1.7, 9.2) + t * 0.12),
        fbm(uv + q * uWarpStrength + vec2(8.3, 2.8) - t * 0.09)
      );

      float f = fbm(uv + r * uWarpStrength);

      vec3 deep = vec3(0.02, 0.05, 0.12);
      vec3 mid = vec3(0.05, 0.35, 0.55);
      vec3 bright = vec3(0.65, 0.9, 0.95);

      vec3 color = mix(deep, mid, clamp(f * 1.4, 0.0, 1.0));
      color = mix(color, bright, clamp((f + length(r) * 0.4 - 0.6) * 1.6, 0.0, 1.0));

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uSpeed: { value: 0.6 },
      uWarpStrength: { value: 0.8 },
      uScale: { value: 3.0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uWarpStrength.value = ctx.params.warpStrength;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
