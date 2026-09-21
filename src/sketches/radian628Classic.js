export default {
  name: 'Radian628 — Classic',
  description: 'Iterative space-folding fractal warped by an integrated trigonometric function; the original Radian628 form, cleaned up as a standard shader sketch.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\int \\sin(kx + t)\\,dx = -\\dfrac{\\cos(kx + t)}{k}',

  params: {
    iterations: { value: 16.0, min: 4.0, max: 32.0, step: 1.0 },
    scale: { value: 1.1, min: 1.01, max: 1.5, step: 0.01 },
    speed: { value: 0.05, min: 0.005, max: 0.2, step: 0.005 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIterations;
    uniform float uScale;
    uniform float uSpeed;
    varying vec2 vUv;

    // Indefinite integral: ∫ sin(k·x + t) dx = -cos(k·x + t) / k
    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      float angle = uTime * uSpeed;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));

      for (float i = 0.0; i < 32.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.15;
        p *= uScale;
        p *= rot;

        vec2 intTerm = spatialTrigIntegral(p, 2.5 + sin(uTime * 0.2), uTime * 0.5);
        p += intTerm * 0.08;
      }

      vec2 colorIntR = spatialTrigIntegral(p + vec2(0.2, 0.0), 3.0, uTime * 0.4);
      vec2 colorIntG = spatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
      vec2 colorIntB = spatialTrigIntegral(p + vec2(0.4, 0.2), 5.0, uTime * 0.2);

      vec3 color = vec3(
        length(p + colorIntR),
        length(p + colorIntG),
        length(p + colorIntB)
      );
      color = sin(color * 67.0) * 0.5 + 0.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uIterations: { value: 16.0 }, uScale: { value: 1.1 }, uSpeed: { value: 0.05 } };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uScale.value = ctx.params.scale;
    state.uniforms.uSpeed.value = ctx.params.speed;
  },
};
