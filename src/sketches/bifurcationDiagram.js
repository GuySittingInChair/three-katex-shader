export default {
  name: 'Bifurcation Diagram',
  description: 'The logistic map period-doubling into chaos, rendered per-pixel.',
  tags: ['chaos', 'logistic-map'],
  category: 'Chaos',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'x_{n+1} = r\\,x_n(1-x_n),\\quad r \\in [2.4,\\ 4.0]',

  params: {
    iterations: { value: 200, min: 50, max: 300 },
    highlightSpeed: { value: 0.15, min: 0, max: 2 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform float uIterations;
    uniform float uHighlightSpeed;
    varying vec2 vUv;

    void main() {
      float r = mix(2.4, 4.0, vUv.x);
      float x = 0.5;

      // Burn-in: let the orbit settle before sampling it.
      for (int i = 0; i < 100; i++) {
        x = r * x * (1.0 - x);
      }

      float density = 0.0;
      const int MAX_ITER = 300;
      for (int i = 0; i < MAX_ITER; i++) {
        if (i >= int(uIterations)) break;
        x = r * x * (1.0 - x);
        float dist = abs(x - vUv.y);
        density += smoothstep(0.006, 0.0, dist);
      }
      density = clamp(density, 0.0, 1.0);

      float rHighlight = 2.4 + mod(uTime * uHighlightSpeed, 1.6);
      float highlight = smoothstep(0.01, 0.0, abs(r - rHighlight)) * 0.5;

      vec3 base = vec3(0.05, 0.03, 0.08);
      vec3 attractorColor = 0.5 + 0.5 * cos(6.2831 * (vUv.y * 1.2 + vec3(0.0, 0.33, 0.67)));
      vec3 color = base + attractorColor * density;
      color += vec3(1.0, 0.9, 0.3) * highlight;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uIterations: { value: 200 }, uHighlightSpeed: { value: 0.15 } };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uHighlightSpeed.value = ctx.params.highlightSpeed;
  },
};
