export default {
  name: 'Hyperbolic Tiling',
  description: 'A self-similar {7,3}-style tiling of the Poincaré disk, built from iterated angular folds and circle inversion.',
  tags: ['non-euclidean', 'hyperbolic', 'poincare-disk'],
  category: 'Non-Euclidean',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'ds^2 = \\dfrac{4(dx^2+dy^2)}{(1-x^2-y^2)^2}',

  params: {
    spin: { value: 0.15, min: -1, max: 1 },
    depth: { value: 9, min: 4, max: 14 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpin;
    uniform float uDepth;
    varying vec2 vUv;

    const float PI = 3.14159265359;
    const float P = 7.0;

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      float rot = uTime * uSpin;
      float ca = cos(rot);
      float sa = sin(rot);
      uv = mat2(ca, -sa, sa, ca) * uv;

      float r0 = length(uv);
      vec3 color = vec3(0.02, 0.02, 0.05);

      if (r0 < 0.995) {
        vec2 p = uv;
        float wedge = 2.0 * PI / P;
        int iterCount = 0;
        int maxIter = int(uDepth);

        for (int i = 0; i < 14; i++) {
          if (i >= maxIter) break;

          float a = atan(p.y, p.x);
          a = mod(a, wedge);
          if (a > wedge * 0.5) a = wedge - a;
          float len = length(p);
          p = vec2(cos(a), sin(a)) * len;

          vec2 center = vec2(0.62, 0.0);
          float invRadius = 0.45;
          vec2 diff = p - center;
          float d2 = dot(diff, diff);
          if (d2 > 0.0001) {
            p = center + diff * (invRadius * invRadius / d2);
          }

          iterCount++;
          if (length(p) < 0.02) break;
        }

        float t = float(iterCount) / uDepth;
        float hue = fract(t * 2.0 + 0.6);
        color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
        color *= smoothstep(1.0, 0.9, r0);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uSpin: { value: 0.15 }, uDepth: { value: 9.0 } };
  },

  update(ctx, state) {
    state.uniforms.uSpin.value = ctx.params.spin;
    state.uniforms.uDepth.value = ctx.params.depth;
  },
};
