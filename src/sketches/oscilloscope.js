export default {
  name: 'Oscilloscope',
  description: 'A glowing CRT-style trace of the live audio waveform.',
  tags: ['audio', 'waveform', 'oscilloscope'],
  category: 'Waveforms',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'y(x) = \\tfrac{1}{2} + a \\cdot w\\big(\\lfloor 127x \\rfloor\\big)',

  params: {
    amplitude: { value: 1.2, min: 0.2, max: 3 },
    thickness: { value: 0.015, min: 0.005, max: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAmplitude;
    uniform float uThickness;
    uniform float uWave[128];
    varying vec2 vUv;

    float sampleAt(int target) {
      float result = 0.0;
      for (int i = 0; i < 128; i++) {
        if (i == target) result = uWave[i];
      }
      return result;
    }

    void main() {
      vec2 uv = vUv;

      float idx = uv.x * 127.0;
      int i0 = int(floor(idx));
      int i1 = i0 + 1;
      if (i1 > 127) i1 = 127;
      float frac = fract(idx);

      float s0 = sampleAt(i0);
      float s1 = sampleAt(i1);
      float sample = mix(s0, s1, frac);

      float targetY = 0.5 + sample * uAmplitude * 0.4;
      float dist = abs(uv.y - targetY);
      float glow = uThickness / (uThickness + dist * 40.0);

      vec3 scopeColor = vec3(0.25, 1.0, 0.55);
      vec3 color = scopeColor * glow;

      // Faint CRT grid.
      float gridX = smoothstep(0.98, 1.0, 1.0 - abs(fract(uv.x * 10.0) - 0.5) * 2.0);
      float gridY = smoothstep(0.98, 1.0, 1.0 - abs(fract(uv.y * 6.0) - 0.5) * 2.0);
      color += vec3(0.02, 0.08, 0.04) * max(gridX, gridY);

      color += vec3(0.0, 0.03, 0.02);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uAmplitude: { value: 1.2 },
      uThickness: { value: 0.015 },
      uWave: { value: new Array(128).fill(0) },
    };
  },

  update(ctx, state) {
    state.uniforms.uAmplitude.value = ctx.params.amplitude;
    state.uniforms.uThickness.value = ctx.params.thickness;

    const target = state.uniforms.uWave.value;
    if (ctx.audio?.enabled) {
      for (let i = 0; i < 128; i++) target[i] = ctx.audio.waveform[i];
    } else {
      for (let i = 0; i < 128; i++) {
        target[i] = Math.sin(i * 0.3 + ctx.time * 3.0) * 0.5
          + Math.sin(i * 0.07 + ctx.time * 1.3) * 0.3;
      }
    }
  },
};
