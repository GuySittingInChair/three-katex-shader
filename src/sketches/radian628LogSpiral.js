export default {
  name: 'Radian628 — Log Spiral',
  description: 'The Radian628 fractal reworked in log-polar coordinates, turning the fold-and-integrate warp into a set of logarithmic spiral arms.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'spiral'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '(r, \\theta) \\to (\\ln r,\\ \\theta \\cdot n)',

  params: {
    arms: { value: 5.0, min: 1.0, max: 12.0, step: 1.0 },
    tightness: { value: 1.4, min: 0.5, max: 3.0, step: 0.05 },
    iterations: { value: 14.0, min: 4.0, max: 28.0, step: 1.0 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uArms;
    uniform float uTightness;
    uniform float uIterations;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      float r = length(uv);
      float a = atan(uv.y, uv.x);
      // Log-polar remap: distance from center becomes a linear axis,
      // turning multiplicative zoom into additive translation.
      vec2 p = vec2(log(r + 0.001) * uTightness, a * uArms);

      for (float i = 0.0; i < 28.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.2;
        p *= 1.08;

        vec2 intTerm = spatialTrigIntegral(p, 2.0 + sin(uTime * 0.2), uTime * 0.4 - r * 2.0);
        p += intTerm * 0.1;
      }

      vec2 colorIntR = spatialTrigIntegral(p + vec2(0.2, 0.0), 3.0, uTime * 0.4);
      vec2 colorIntG = spatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
      vec2 colorIntB = spatialTrigIntegral(p + vec2(0.4, 0.2), 5.0, uTime * 0.2);

      vec3 color = vec3(
        length(p + colorIntR),
        length(p + colorIntG),
        length(p + colorIntB)
      );
      color = sin(color * 60.0) * 0.5 + 0.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uArms: { value: 5.0 }, uTightness: { value: 1.4 }, uIterations: { value: 14.0 } };
  },

  update(ctx, state) {
    state.uniforms.uArms.value = ctx.params.arms;
    state.uniforms.uTightness.value = ctx.params.tightness;
    state.uniforms.uIterations.value = ctx.params.iterations;
  },
};
