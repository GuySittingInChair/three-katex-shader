export default {
  name: 'Radian628 — Kaleidoscope',
  description: 'The Radian628 fold-and-integrate fractal wrapped in an angular mirror fold, splitting the domain into N repeating kaleidoscope wedges before each warp step.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'kaleidoscope'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\theta \\to \\left|\\, (\\theta \\bmod \\tfrac{2\\pi}{n}) - \\tfrac{\\pi}{n} \\right|',

  params: {
    segments: { value: 5.0, min: 2.0, max: 16.0, step: 1.0 },
    iterations: { value: 14.0, min: 4.0, max: 28.0, step: 1.0 },
    scale: { value: 1.12, min: 1.01, max: 1.5, step: 0.01 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSegments;
    uniform float uIterations;
    uniform float uScale;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      // Angular mirror fold into uSegments repeating wedges.
      float r = length(p);
      float a = atan(p.y, p.x) + uTime * 0.05;
      float wedge = 6.28318530718 / uSegments;
      a = abs(mod(a, wedge) - wedge * 0.5);
      p = vec2(cos(a), sin(a)) * r;

      for (float i = 0.0; i < 28.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.16;
        p *= uScale;

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
    return { uSegments: { value: 5.0 }, uIterations: { value: 14.0 }, uScale: { value: 1.12 } };
  },

  update(ctx, state) {
    state.uniforms.uSegments.value = ctx.params.segments;
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
