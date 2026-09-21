export default {
  name: 'Inferno Cape',
  description: 'A cracked-obsidian, warped-flame procedural texture inspired by Old School RuneScape\'s Inferno cape — molten veins threading through dark rock, rising like living fire.',
  tags: ['procedural', 'fire', 'texture', 'noise', 'runescape-inspired'],
  category: 'Procedural Textures',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'f(\\mathbf{x}) = \\text{fbm}\\big(\\mathbf{x} + k\\cdot\\text{fbm}(\\mathbf{x} + \\text{fbm}(\\mathbf{x}))\\big)',

  params: {
    flow: { value: 0.22, min: 0.0, max: 0.6, step: 0.01 },
    turbulence: { value: 4.0, min: 1.0, max: 8.0, step: 0.1 },
    crackSharpness: { value: 14.0, min: 4.0, max: 30.0, step: 0.5 },
    glow: { value: 1.4, min: 0.5, max: 3.0, step: 0.05 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uFlow;
    uniform float uTurbulence;
    uniform float uCrackSharpness;
    uniform float uGlow;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.02;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = vUv - 0.5;
      uv.x *= uResolution.x / uResolution.y;

      // Flame rises: the sample domain drifts downward over time so the
      // pattern reads as flowing upward past the viewer.
      vec2 flow = vec2(0.0, uTime * uFlow);
      vec2 p = uv * 3.2 + flow;

      // Domain warping: fold the sample point through two nested fbm
      // fields for turbulent, self-similar licks instead of flat noise.
      vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
      vec2 r = vec2(
        fbm(p + uTurbulence * q + vec2(1.7, 9.2) - flow * 0.6),
        fbm(p + uTurbulence * q + vec2(8.3, 2.8) - flow * 0.6)
      );
      float f = fbm(p + uTurbulence * r);

      // Cracked-obsidian veins: sharp glowing lines threading through the
      // dark rock, brightened wherever the warped field crosses zero.
      float crack = 1.0 - abs(sin((f + r.x * 0.5) * uCrackSharpness));
      crack = pow(crack, 4.0);

      float heat = clamp(f * 0.7 + crack * 0.9, 0.0, 1.4);

      vec3 obsidian = vec3(0.03, 0.02, 0.025);
      vec3 embers   = vec3(0.55, 0.08, 0.02);
      vec3 flame    = vec3(1.0, 0.35, 0.03);
      vec3 core     = vec3(1.0, 0.85, 0.4);

      vec3 color = obsidian;
      color = mix(color, embers, smoothstep(0.15, 0.45, heat));
      color = mix(color, flame, smoothstep(0.45, 0.85, heat));
      color = mix(color, core, smoothstep(0.85, 1.3, heat));

      // Draped-cape vignette: brightest along a vertical spine, fading to
      // dark at the flanks, echoing the cape's silhouette without drawing one.
      float spine = 1.0 - smoothstep(0.0, 0.9, abs(uv.x) * 1.6 + abs(uv.y) * 0.15);
      color *= mix(0.55, 1.0, spine);

      // Slow overall flicker, like embers breathing.
      color *= uGlow * (0.92 + 0.08 * sin(uTime * 3.0 + f * 6.0));

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uFlow: { value: 0.22 },
      uTurbulence: { value: 4.0 },
      uCrackSharpness: { value: 14.0 },
      uGlow: { value: 1.4 },
    };
  },

  update(ctx, state) {
    state.uniforms.uFlow.value = ctx.params.flow;
    state.uniforms.uTurbulence.value = ctx.params.turbulence;
    state.uniforms.uCrackSharpness.value = ctx.params.crackSharpness;
    state.uniforms.uGlow.value = ctx.params.glow;
  },
};
