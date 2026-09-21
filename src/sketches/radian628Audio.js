export default {
  name: 'Radian628 — Audio Reactive',
  description: 'The Radian628 warp with its integral frequency and fold amplitude driven by live mic bands — bass pushes the fold scale, treble pushes the warp\'s frequency.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'integral', 'audio'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\text{bass} \\to \\text{scale},\\quad \\text{treble} \\to k \\ \\text{in}\\!\\int\\! \\sin(kx+t)\\,dx',

  params: {
    iterations: { value: 16.0, min: 4.0, max: 32.0, step: 1.0 },
    baseScale: { value: 1.08, min: 1.01, max: 1.3, step: 0.01 },
    sensitivity: { value: 1.0, min: 0.0, max: 3.0, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIterations;
    uniform float uBaseScale;
    uniform float uSensitivity;
    uniform float uBass;
    uniform float uMid;
    uniform float uTreble;
    varying vec2 vUv;

    vec2 spatialTrigIntegral(vec2 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 p = uv;

      float angle = uTime * (0.05 + uMid * uSensitivity * 0.3);
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      float scale = uBaseScale + uBass * uSensitivity * 0.15;
      float freq = 2.0 + uTreble * uSensitivity * 4.0;

      for (float i = 0.0; i < 32.0; i++) {
        if (i >= uIterations) break;
        p = abs(p);
        p -= 0.15;
        p *= scale;
        p *= rot;

        vec2 intTerm = spatialTrigIntegral(p, freq + sin(uTime * 0.2), uTime * 0.5);
        p += intTerm * (0.06 + uBass * uSensitivity * 0.08);
      }

      vec2 colorIntR = spatialTrigIntegral(p + vec2(0.2, 0.0), 3.0, uTime * 0.4);
      vec2 colorIntG = spatialTrigIntegral(p + vec2(0.0, 0.4), 4.0, uTime * 0.3);
      vec2 colorIntB = spatialTrigIntegral(p + vec2(0.4, 0.2), 5.0, uTime * 0.2);

      vec3 color = vec3(
        length(p + colorIntR),
        length(p + colorIntG),
        length(p + colorIntB)
      );
      color = sin(color * (60.0 + uTreble * uSensitivity * 30.0)) * 0.5 + 0.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uIterations: { value: 16.0 },
      uBaseScale: { value: 1.08 },
      uSensitivity: { value: 1.0 },
      uBass: { value: 0.0 },
      uMid: { value: 0.0 },
      uTreble: { value: 0.0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uBaseScale.value = ctx.params.baseScale;
    state.uniforms.uSensitivity.value = ctx.params.sensitivity;
    state.uniforms.uBass.value = ctx.audio.bass;
    state.uniforms.uMid.value = ctx.audio.mid;
    state.uniforms.uTreble.value = ctx.audio.treble;
  },
};
