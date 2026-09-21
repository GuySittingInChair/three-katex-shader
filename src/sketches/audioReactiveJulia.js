export default {
  name: 'Audio-Reactive Julia Set',
  description: 'A Julia set whose complex constant is driven by live bass/treble — Fractals meets Audio-Reactive.',
  tags: ['experiment', 'fractal', 'audio'],
  category: 'Audio-Reactive Fractal',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'z_{n+1} = z_n^2 + c(t),\\quad c(t) = c_0 + \\big(b(t){-}h(t)\\big)e^{i\\,\\omega t}',

  params: {
    speed: { value: 0.6, min: 0, max: 3 },
    sensitivity: { value: 1.0, min: 0, max: 3 },
    zoom: { value: 1.4, min: 0.4, max: 4 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpeed;
    uniform float uSensitivity;
    uniform float uZoom;
    uniform float uBass;
    uniform float uTreble;
    varying vec2 vUv;

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      uv /= uZoom;

      float wobble = (uBass - uTreble) * 0.35 * uSensitivity;
      float angle = uTime * uSpeed * 0.25;
      vec2 c = vec2(-0.55, 0.6) + vec2(cos(angle), sin(angle)) * (0.15 + wobble);

      vec2 z = uv;
      float iter = 0.0;
      const int MAX_ITER = 120;
      for (int i = 0; i < MAX_ITER; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 4.0) break;
        iter += 1.0;
      }

      float t = iter / float(MAX_ITER);
      float hue = fract(t * 1.5 + uBass * 0.3 + uTime * 0.02);
      vec3 color = (iter >= float(MAX_ITER) - 0.5)
        ? vec3(0.0)
        : 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uSpeed: { value: 0.6 },
      uSensitivity: { value: 1.0 },
      uZoom: { value: 1.4 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uSensitivity.value = ctx.params.sensitivity;
    state.uniforms.uZoom.value = ctx.params.zoom;
    if (ctx.audio?.enabled) {
      state.uniforms.uBass.value = ctx.audio.bass;
      state.uniforms.uTreble.value = ctx.audio.treble;
    } else {
      state.uniforms.uBass.value = 0.5 + 0.5 * Math.sin(ctx.time * 0.7);
      state.uniforms.uTreble.value = 0.5 + 0.5 * Math.sin(ctx.time * 1.1 + 2.0);
    }
  },
};
