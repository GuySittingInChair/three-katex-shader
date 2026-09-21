import * as THREE from 'three';

export default {
  name: 'Gradient Plane',
  description: 'Time-driven cosine palette across UV space.',
  tags: ['basic', 'shader'],
  category: 'Shaders',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'c(t) = \\tfrac12 + \\tfrac12\\cos(2\\pi(t + \\phi))',

  params: {
    speed: { value: 1.0, min: 0, max: 5 },
    scale: { value: 1.0, min: 0.1, max: 8 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uScale;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv * uScale;
      vec3 color = 0.5 + 0.5 * cos(uTime * uSpeed + uv.xyx * 6.2831 + vec3(0.0, 2.0, 4.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uSpeed: { value: 1.0 }, uScale: { value: 1.0 } };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uScale.value = ctx.params.scale;
  },
};
