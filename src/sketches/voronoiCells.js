export default {
  name: 'Voronoi Cells',
  description: 'Animated cellular (Worley) noise field.',
  tags: ['shader', 'noise'],
  category: 'Shaders',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'F_1(\\mathbf{x}) = \\min_i \\lVert \\mathbf{x} - p_i(t) \\rVert',

  params: {
    speed: { value: 0.5, min: 0, max: 3 },
    density: { value: 6.0, min: 2, max: 20 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uDensity;
    varying vec2 vUv;

    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv * uDensity;
      vec2 cell = floor(uv);
      vec2 f = fract(uv);

      float minDist = 8.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 neighbor = vec2(float(x), float(y));
          vec2 point = hash2(cell + neighbor);
          point = 0.5 + 0.5 * sin(uTime * uSpeed + 6.2831 * point);
          float dist = length(neighbor + point - f);
          minDist = min(minDist, dist);
        }
      }

      vec3 color = 0.5 + 0.5 * cos(minDist * 4.0 + vec3(0.0, 2.0, 4.0));
      gl_FragColor = vec4(color * (1.0 - minDist * 0.3), 1.0);
    }
  `,

  uniforms() {
    return { uSpeed: { value: 0.5 }, uDensity: { value: 6.0 } };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uDensity.value = ctx.params.density;
  },
};
