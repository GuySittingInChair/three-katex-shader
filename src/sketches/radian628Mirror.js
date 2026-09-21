export default {
  name: 'Radian628 — Mirror Tile',
  description: 'Radian628 with its fold swapped from a single abs() reflection to a repeating triangle-wave fold, tiling the integral warp into a seamless mirrored lattice.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'tiling'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'p \\to \\left| \\text{mod}(p + T,\\ 2T) - T \\right|',

  params: {
    tileSize: { value: 0.6, min: 0.2, max: 1.5, step: 0.02 },
    iterations: { value: 12.0, min: 3.0, max: 24.0, step: 1.0 },
    scale: { value: 1.15, min: 1.01, max: 1.5, step: 0.01 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uTileSize;
    uniform float uIterations;
    uniform float uScale;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    // Triangle-wave fold: mirrors p into [-T, T] repeatedly, instead of
    // abs()'s single fold about the origin.
    vec2 triFold(vec2 p, float t) {
      return abs(mod(p + t, 2.0 * t) - t);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      float angle = uTime * 0.04;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));

      for (float i = 0.0; i < 24.0; i++) {
        if (i >= uIterations) break;
        p = triFold(p, uTileSize);
        p -= uTileSize * 0.4;
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
    return { uTileSize: { value: 0.6 }, uIterations: { value: 12.0 }, uScale: { value: 1.15 } };
  },

  update(ctx, state) {
    state.uniforms.uTileSize.value = ctx.params.tileSize;
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
