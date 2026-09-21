export default {
  name: 'Radian628 — Glow',
  description: 'Radian628 with per-iteration emission accumulated into a soft glow, and the three color channels evaluated at slightly detuned integral frequencies for a chromatic-aberration fringe.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'glow'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\text{glow} = \\sum_i \\dfrac{1}{\\epsilon + |p_i|^2}',

  params: {
    iterations: { value: 16.0, min: 4.0, max: 32.0, step: 1.0 },
    scale: { value: 1.1, min: 1.01, max: 1.5, step: 0.01 },
    dispersion: { value: 0.15, min: 0.0, max: 0.6, step: 0.01 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIterations;
    uniform float uScale;
    uniform float uDispersion;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      float angle = uTime * 0.05;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));

      float glow = 0.0;
      for (float i = 0.0; i < 32.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.15;
        p *= uScale;
        p *= rot;

        vec2 intTerm = spatialTrigIntegral(p, 2.5 + sin(uTime * 0.2), uTime * 0.5);
        p += intTerm * 0.08;

        glow += 0.02 / (0.02 + dot(p, p));
      }

      // Detune each channel's frequency slightly for a dispersion fringe.
      vec2 colorIntR = spatialTrigIntegral(p + vec2(0.2, 0.0), 3.0 - uDispersion, uTime * 0.4);
      vec2 colorIntG = spatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
      vec2 colorIntB = spatialTrigIntegral(p + vec2(0.4, 0.2), 5.0 + uDispersion, uTime * 0.2);

      vec3 color = vec3(
        length(p + colorIntR),
        length(p + colorIntG),
        length(p + colorIntB)
      );
      color = sin(color * 67.0) * 0.5 + 0.5;
      color += glow * vec3(0.12, 0.06, 0.2);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uIterations: { value: 16.0 }, uScale: { value: 1.1 }, uDispersion: { value: 0.15 } };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uScale.value = ctx.params.scale;
    state.uniforms.uDispersion.value = ctx.params.dispersion;
  },
};
