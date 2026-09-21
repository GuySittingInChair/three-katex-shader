export default {
  name: 'Spectrum Bars',
  description: 'A classic frequency-bar analyzer with attack/decay smoothing.',
  tags: ['audio', 'spectrum', 'fft'],
  category: 'Spectra',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'h_i(t) = (1-s)\\,h_i(t{-}1) + s \\cdot |X_i(t)|',

  params: {
    heightScale: { value: 1.6, min: 0.5, max: 3 },
    smoothing: { value: 0.35, min: 0, max: 0.95 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uHeightScale;
    uniform float uSpectrum[64];
    varying vec2 vUv;

    float binAt(int target) {
      float result = 0.0;
      for (int i = 0; i < 64; i++) {
        if (i == target) result = uSpectrum[i];
      }
      return result;
    }

    void main() {
      vec2 uv = vUv;

      int bin = int(uv.x * 64.0);
      if (bin > 63) bin = 63;
      float magnitude = binAt(bin) * uHeightScale;

      float cellFrac = fract(uv.x * 64.0);
      float gap = smoothstep(0.0, 0.06, cellFrac) * smoothstep(0.0, 0.06, 1.0 - cellFrac);

      vec3 cool = vec3(0.1, 0.3, 0.9);
      vec3 hot = vec3(1.0, 0.35, 0.15);
      float h = clamp(uv.y / max(magnitude, 0.0001), 0.0, 1.0);
      vec3 barColor = mix(cool, hot, h);

      float lit = step(uv.y, magnitude);
      vec3 color = barColor * lit * gap;

      // Backdrop grid glow so empty space isn't pure black.
      color += vec3(0.02, 0.02, 0.05);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uHeightScale: { value: 1.6 },
      uSpectrum: { value: new Array(64).fill(0) },
    };
  },

  update(ctx, state) {
    state.uniforms.uHeightScale.value = ctx.params.heightScale;
    const smoothing = ctx.params.smoothing;
    const target = state.uniforms.uSpectrum.value;

    if (ctx.audio?.enabled) {
      for (let i = 0; i < 64; i++) {
        target[i] = target[i] * smoothing + ctx.audio.spectrum[i] * (1 - smoothing);
      }
    } else {
      for (let i = 0; i < 64; i++) {
        const fake = 0.35 + 0.3 * Math.sin(i * 0.35 + ctx.time * 1.6)
          + 0.15 * Math.sin(i * 0.9 - ctx.time * 2.3);
        const clamped = Math.max(0, fake);
        target[i] = target[i] * smoothing + clamped * (1 - smoothing);
      }
    }
  },
};
