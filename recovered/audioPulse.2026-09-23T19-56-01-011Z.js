export default {
  name: 'Audio Pulse',
  description: 'Bass/mid/treble-reactive rings with dynamic frequency patterns. Click "Enable Audio" to feed it real sound.',
  tags: ['audio', 'reactive'],
  category: 'Audio-Reactive',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'r(\\theta,t) = r_0 + b(t)\\sin(5\\theta) + m(t)\\sin(11\\theta) + h(t)\\sin(17\\theta)',

  params: {
    speed: { value: 1.0, min: 0, max: 5 },
    sensitivity: { value: 1.0, min: 0, max: 3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uSensitivity;
    uniform float uBass;
    uniform float uMid;
    uniform float uTreble;
    varying vec2 vUv;

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float r = length(uv);
      float a = atan(uv.y, uv.x);

      float wobble = uBass * sin(a * 5.0 + uTime * uSpeed)
                   + uMid * sin(a * 11.0 - uTime * uSpeed * 1.3)
                   + uTreble * sin(a * 17.0 + uTime * uSpeed * 0.7);
      wobble *= uSensitivity;

      float ringPos = r - 0.4 - 0.15 * wobble;
      float ring = smoothstep(0.02, 0.0, abs(ringPos));
      float glow = 0.03 / (0.02 + abs(ringPos));

      float hue = fract(uTime * 0.05 + uBass * 0.3 + r * 0.2);
      vec3 color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));

      vec3 final = color * (ring * 2.0 + glow * 0.3);
      gl_FragColor = vec4(final, 1.0);
    }
  `,

  uniforms() {
    return {
      uSpeed: { value: 1.0 },
      uSensitivity: { value: 1.0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
    };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uSensitivity.value = ctx.params.sensitivity;
    if (ctx.audio?.enabled) {
      state.uniforms.uBass.value = ctx.audio.bass;
      state.uniforms.uMid.value = ctx.audio.mid;
      state.uniforms.uTreble.value = ctx.audio.treble;
    } else {
      state.uniforms.uBass.value = 0.5 + 0.5 * Math.sin(ctx.time * 0.9);
      state.uniforms.uMid.value = 0.5 + 0.5 * Math.sin(ctx.time * 1.3 + 1.0);
      state.uniforms.uTreble.value = 0.5 + 0.5 * Math.sin(ctx.time * 1.7 + 2.0);
    }
  },
};
