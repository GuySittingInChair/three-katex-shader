export default {
  name: 'Radian628 — Multi-Frequency',
  description: 'Four octaves of the Radian628 trigonometric integral, summed at falling amplitude like an FBM stack, for a richer and more turbulent domain warp.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'fbm'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\sum_{k=1}^{4} \\tfrac{1}{k}\\!\\int\\! \\sin(k f x + t)\\,dx',

  params: {
    baseFreq: { value: 2.0, min: 0.5, max: 6.0, step: 0.1 },
    warpAmt: { value: 0.1, min: 0.0, max: 0.4, step: 0.01 },
    iterations: { value: 14.0, min: 4.0, max: 28.0, step: 1.0 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBaseFreq;
    uniform float uWarpAmt;
    uniform float uIterations;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    vec2 layeredWarp(vec2 p, float time) {
      vec2 warp = vec2(0.0);
      float amp = 1.0;
      float freq = uBaseFreq;
      for (float k = 1.0; k <= 4.0; k += 1.0) {
        warp += spatialTrigIntegral(p, freq, time / k) * amp;
        freq *= 1.9;
        amp *= 0.5;
      }
      return warp;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      for (float i = 0.0; i < 28.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.15;
        p *= 1.1;

        p += layeredWarp(p, uTime * 0.5) * uWarpAmt;
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
    return { uBaseFreq: { value: 2.0 }, uWarpAmt: { value: 0.1 }, uIterations: { value: 14.0 } };
  },

  update(ctx, state) {
    state.uniforms.uBaseFreq.value = ctx.params.baseFreq;
    state.uniforms.uWarpAmt.value = ctx.params.warpAmt;
    state.uniforms.uIterations.value = ctx.params.iterations;
  },
};
