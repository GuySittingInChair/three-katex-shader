export default {
  name: 'Radian628 — Julia Hybrid',
  description: 'Radian628\'s integral warp injected into a complex Julia iteration z → z² + c, where c itself drifts by the same trigonometric integral.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'julia'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'z_{n+1} = z_n^2 + c + \\varepsilon\\!\\int\\! \\sin(kz_n + t)\\,dz',

  params: {
    cReal: { value: -0.55, min: -1.0, max: 1.0, step: 0.01 },
    cImag: { value: 0.58, min: -1.0, max: 1.0, step: 0.01 },
    warpAmt: { value: 0.06, min: 0.0, max: 0.3, step: 0.005 },
    iterations: { value: 60.0, min: 10.0, max: 120.0, step: 1.0 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uCReal;
    uniform float uCImag;
    uniform float uWarpAmt;
    uniform float uIterations;
    varying vec2 vUv;

    vec2 cMul(vec2 a, vec2 b) {
      return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
    }

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.2;
      uv.x *= uResolution.x / uResolution.y;

      vec2 z = uv;
      vec2 c = vec2(uCReal, uCImag);

      float iterFrac = 0.0;
      for (float i = 0.0; i < 120.0; i++) {
        if (i >= uIterations) break;
        z = cMul(z, z) + c;

        vec2 warp = spatialTrigIntegral(z, 2.0 + sin(uTime * 0.15), uTime * 0.3);
        z += warp * uWarpAmt;

        if (dot(z, z) > 16.0) break;
        iterFrac = i / uIterations;
      }

      float smoothIter = iterFrac + (1.0 - log2(max(log(dot(z, z) + 1e-6), 0.0001)));
      vec3 hue = 0.5 + 0.5 * cos(6.2831 * (smoothIter * 0.9 + vec3(0.0, 0.33, 0.67)) + uTime * 0.1);
      gl_FragColor = vec4(hue, 1.0);
    }
  `,

  uniforms() {
    return {
      uCReal: { value: -0.55 },
      uCImag: { value: 0.58 },
      uWarpAmt: { value: 0.06 },
      uIterations: { value: 60.0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uCReal.value = ctx.params.cReal;
    state.uniforms.uCImag.value = ctx.params.cImag;
    state.uniforms.uWarpAmt.value = ctx.params.warpAmt;
    state.uniforms.uIterations.value = ctx.params.iterations;
  },
};
