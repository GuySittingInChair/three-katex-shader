export default {
  name: 'Oscilloscope',
  description: 'A glowing CRT-style trace of the live audio waveform.',
  tags: ['audio', 'waveform', 'oscilloscope'],
  category: 'Waveforms',
  mode: 'shader',
  shaderLang: 'glsl',

  latex: 'y(x) = \\tfrac{1}{2} + a \\cdot w\\big(\\lfloor 127x \\rfloor\\big)',

  params: {
    amplitude: {
      value: 1.2,
      min: 0.2,
      max: 3.0,
    },

    thickness: {
      value: 0.015,
      min: 0.005,
      max: 0.05,
    },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAmplitude;
    uniform float uThickness;
    uniform float uWave[128];

    varying vec2 vUv;

    float getWave(int index) {
      float value = 0.0;

      for (int i = 0; i < 128; i++) {
        if (i == index) {
          value = uWave[i];
        }
      }

      return value;
    }

    void main() {

      vec2 uv = vUv;

      // ------------------------------------------------------------
      // SAMPLE WAVEFORM
      // ------------------------------------------------------------

      float x = clamp(uv.x, 0.0, 1.0);

      float position = x * 127.0;

      int index0 = int(floor(position));
      int index1 = min(index0 + 1, 127);

      float t = fract(position);

      float wave0 = getWave(index0);
      float wave1 = getWave(index1);

      float wave = mix(wave0, wave1, t);

      // ------------------------------------------------------------
      // WAVEFORM POSITION
      // ------------------------------------------------------------

      float center = 0.5;

      float targetY =
          center +
          wave *
          uAmplitude *
          0.4;

      // ------------------------------------------------------------
      // DISTANCE FROM TRACE
      // ------------------------------------------------------------

      float distanceToTrace =
          abs(uv.y - targetY);

      float trace =
          uThickness /
          max(distanceToTrace, 0.0001);

      trace = clamp(trace, 0.0, 1.0);

      // Strong core
      float core =
          smoothstep(
            uThickness * 1.5,
            0.0,
            distanceToTrace
          );

      // Large glow
      float glow =
          exp(
            -distanceToTrace *
            80.0
          );

      // ------------------------------------------------------------
      // CRT GRID
      // ------------------------------------------------------------

      float verticalGrid =
          smoothstep(
            0.97,
            1.0,
            sin(uv.x * 40.0) * 0.5 + 0.5
          );

      float horizontalGrid =
          smoothstep(
            0.97,
            1.0,
            sin(uv.y * 24.0) * 0.5 + 0.5
          );

      float grid =
          max(
            verticalGrid,
            horizontalGrid
          );

      // ------------------------------------------------------------
      // COLORS
      // ------------------------------------------------------------

      vec3 background =
          vec3(
            0.005,
            0.015,
            0.008
          );

      vec3 gridColor =
          vec3(
            0.015,
            0.08,
            0.035
          );

      vec3 scopeColor =
          vec3(
            0.15,
            1.0,
            0.45
          );

      vec3 color =
          background;

      color +=
          gridColor *
          grid;

      color +=
          scopeColor *
          glow *
          0.35;

      color +=
          scopeColor *
          trace *
          0.35;

      color +=
          scopeColor *
          core *
          1.5;

      // ------------------------------------------------------------
      // CRT VIGNETTE
      // ------------------------------------------------------------

      vec2 centered =
          uv - 0.5;

      float vignette =
          1.0 -
          dot(centered, centered) *
          1.2;

      color *=
          clamp(
            vignette,
            0.0,
            1.0
          );

      gl_FragColor =
          vec4(
            color,
            1.0
          );
    }
  `,

  uniforms() {
    return {
      uAmplitude: {
        value: 1.2,
      },

      uThickness: {
        value: 0.015,
      },

      uWave: {
        value: new Float32Array(128),
      },
    };
  },

  update(ctx, state) {

    state.uniforms.uAmplitude.value =
      ctx.params.amplitude;

    state.uniforms.uThickness.value =
      ctx.params.thickness;

    const target =
      state.uniforms.uWave.value;

    // ------------------------------------------------------------
    // AUDIO
    // ------------------------------------------------------------

    if (
      ctx.audio &&
      ctx.audio.enabled &&
      ctx.audio.waveform
    ) {

      const waveform =
        ctx.audio.waveform;

      for (let i = 0; i < 128; i++) {

        let value =
          waveform[i] ?? 0;

        // Handle Uint8-style audio data:
        // 0 ... 255
        if (value > 1.0) {
          value =
            value / 127.5 - 1.0;
        }

        // Handle 0 ... 1 audio data
        else if (value >= 0.0) {
          value =
            value * 2.0 - 1.0;
        }

        target[i] =
          Math.max(
            -1.0,
            Math.min(1.0, value)
          );
      }

    }

    // ------------------------------------------------------------
    // PROCEDURAL FALLBACK
    // ------------------------------------------------------------

    else {

      for (let i = 0; i < 128; i++) {

        const x =
          i / 127.0;

        target[i] =
          Math.sin(
            x * 18.0 +
            ctx.time * 3.0
          ) * 0.25

          +

          Math.sin(
            x * 43.0 -
            ctx.time * 1.7
          ) * 0.12

          +

          Math.sin(
            x * 7.0 +
            ctx.time * 0.8
          ) * 0.25;
      }
    }
  },
};
