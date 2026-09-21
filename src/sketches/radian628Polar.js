export default {
  name: 'Radian628 — Polar Bloom',
  description: 'Radian628 rebuilt directly in polar coordinates: radius and angle are warped by independent trigonometric integrals each iteration instead of folding a Cartesian plane.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'polar'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'r \\to r + \\!\\int\\! \\sin(kr+t)\\,dr,\\quad \\theta \\to \\theta + \\!\\int\\! \\sin(k\\theta+t)\\,d\\theta',

  params: {
    iterations: { value: 14.0, min: 4.0, max: 28.0, step: 1.0 },
    radialFreq: { value: 3.0, min: 0.5, max: 8.0, step: 0.1 },
    angularFreq: { value: 4.0, min: 0.5, max: 12.0, step: 0.1 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIterations;
    uniform float uRadialFreq;
    uniform float uAngularFreq;
    varying vec2 vUv;

    float trigIntegral(float x, float freq, float time) {
      return -cos(x * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      float r = length(uv);
      float a = atan(uv.y, uv.x);

      for (float i = 0.0; i < 28.0; i++) {
        if (i >= uIterations) break;
        r = fract(r * 1.3) ;
        a += trigIntegral(r, uAngularFreq, uTime * 0.4) * 0.5;
        r += trigIntegral(a, uRadialFreq, uTime * 0.5) * 0.15;
      }

      vec2 p = vec2(r * cos(a), r * sin(a));
      float rTerm = trigIntegral(r, 5.0, uTime * 0.3);
      float aTerm = trigIntegral(a, 6.0, uTime * 0.2);

      vec3 color = vec3(
        0.5 + 0.5 * sin(p.x * 20.0 + rTerm * 10.0),
        0.5 + 0.5 * sin(p.y * 20.0 + aTerm * 10.0),
        0.5 + 0.5 * sin((r + a) * 15.0)
      );
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uIterations: { value: 14.0 }, uRadialFreq: { value: 3.0 }, uAngularFreq: { value: 4.0 } };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uRadialFreq.value = ctx.params.radialFreq;
    state.uniforms.uAngularFreq.value = ctx.params.angularFreq;
  },
};
