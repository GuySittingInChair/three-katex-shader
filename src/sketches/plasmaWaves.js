export default {
  name: 'Plasma Waves',
  description: 'Layered sine interference, the classic plasma effect.',
  tags: ['shader', 'plasma'],
  category: 'Shaders',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'p(x,y,t) = \\sin(x{+}t) + \\sin(y{-}t) + \\sin(x{+}y{+}t) + \\sin(|\\mathbf{x}|{-}t)',

  params: {
    speed: { value: 1.0, min: 0, max: 5 },
    scale: { value: 3.0, min: 0.5, max: 12 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uScale;
    varying vec2 vUv;

    void main() {
      vec2 uv = (vUv - 0.5) * uScale;
      float t = uTime * uSpeed;
      float p = sin(uv.x + t)
              + sin(uv.y - t)
              + sin(uv.x + uv.y + t)
              + sin(length(uv) - t);
      vec3 color = 0.5 + 0.5 * cos(p * 3.1416 + vec3(0.0, 2.0, 4.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uSpeed: { value: 1.0 }, uScale: { value: 3.0 } };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
