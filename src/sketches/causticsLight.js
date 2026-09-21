export default {
  name: 'Caustics',
  description:
    'Shimmering underwater light caustics from layered, sharpened sine interference — warped and lit by ' +
    'a Julia-set escape-time fractal (borrowed from the same iteration idea Newton Fractal uses), so the ' +
    'shimmer picks up self-similar filament detail instead of staying purely sinusoidal.',
  tags: ['optics', 'caustics', 'light', 'fractal'],
  category: 'Optics',
  mode: 'shader',
  shaderLang: 'glsl',
  latex:
    'C(\\mathbf{x},t) = \\sum_{k} \\Big(1 - |\\sin((\\mathbf{x}+\\lambda J)\\cdot\\omega_k + t)|\\Big)^{p}, ' +
    '\\quad z_{n+1} = z_n^2 + c(t)',

  params: {
    speed: { value: 0.8, min: 0, max: 2 },
    sharpness: { value: 6.0, min: 2, max: 12 },
    // How much the Julia-set escape field warps/tints the caustics — 0 is
    // the original pure-sine version, higher pulls in more fractal detail.
    fractalMix: { value: 0.6, min: 0, max: 1 },
    // How fast the Julia constant c orbits through parameter space, so the
    // fractal silhouette itself slowly morphs rather than sitting fixed.
    juliaSpeed: { value: 0.15, min: 0, max: 1 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpeed;
    uniform float uSharpness;
    uniform float uFractalMix;
    uniform float uJuliaSpeed;
    varying vec2 vUv;

    float causticLayer(vec2 uv, float freq, float speed, float rotation, float t) {
      float c = cos(rotation), s = sin(rotation);
      vec2 p = mat2(c, -s, s, c) * uv;
      float t1 = t * speed;
      float v = sin(p.x * freq + t1)
              + sin(p.y * freq - t1 * 1.3)
              + sin((p.x + p.y) * freq * 0.7 + t1 * 0.8);
      v *= 0.333;
      return pow(max(0.0, 1.0 - abs(v)), uSharpness);
    }

    // Smooth escape-time value for z -> z^2 + c, normalized to [0,1] (0
    // inside the set / never escaped). Same iteration this app's Newton
    // Fractal sketch runs, just the classic quadratic instead of z^3 - 1.
    float juliaEscape(vec2 z, vec2 c) {
      const int MAX_ITER = 40;
      float m2 = 0.0;
      int i;
      for (i = 0; i < MAX_ITER; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        m2 = dot(z, z);
        if (m2 > 4.0) break;
      }
      if (i >= MAX_ITER) return 0.0;
      float smoothI = float(i) - log2(max(log2(m2), 1e-4)) + 4.0;
      return clamp(smoothI / float(MAX_ITER), 0.0, 1.0);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      uv *= 3.0;

      float t = uTime * uSpeed;

      // Orbiting Julia constant — a classic trick for an evolving, never-
      // repeating fractal silhouette instead of one fixed shape.
      vec2 cJulia = vec2(0.35 * cos(uTime * uJuliaSpeed), 0.35 * sin(uTime * uJuliaSpeed * 0.7)) - vec2(0.2, 0.0);
      float julia = juliaEscape(uv * 0.5, cJulia);

      // The fractal field nudges where the caustic layers sample from —
      // near the Julia boundary (where escape time changes fastest) this
      // fractures the sine interference into self-similar filaments.
      vec2 warpDir = vec2(cos(t * 0.5), sin(t * 0.5));
      vec2 uvWarped = uv + uFractalMix * (julia - 0.3) * 0.8 * warpDir;

      float c1 = causticLayer(uvWarped, 3.0, 1.0, 0.4, t);
      float c2 = causticLayer(uvWarped, 4.2, 1.3, -0.7, t + 10.0);
      float c3 = causticLayer(uvWarped, 5.6, 0.7, 1.2, t + 20.0);

      float caustic = c1 + c2 * 0.8 + c3 * 0.6;
      caustic = clamp(caustic, 0.0, 2.2);
      // Fractal-edge glints: brighten caustic peaks extra where the Julia
      // escape value is high, so filament edges pick up highlights.
      caustic *= mix(1.0, 0.7 + 0.9 * julia, uFractalMix);

      vec3 deepWater = vec3(0.0, 0.08, 0.16);
      vec3 brightWater = vec3(0.4, 0.85, 0.95);
      vec3 color = deepWater + brightWater * caustic;

      // Subtle overall depth vignette so it reads as light falling into water.
      float vignette = 1.0 - 0.25 * length(vUv - 0.5);
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uSpeed: { value: 0.8 },
      uSharpness: { value: 6.0 },
      uFractalMix: { value: 0.6 },
      uJuliaSpeed: { value: 0.15 },
    };
  },

  update(ctx, state) {
    state.uniforms.uSpeed.value = ctx.params.speed;
    state.uniforms.uSharpness.value = ctx.params.sharpness;
    state.uniforms.uFractalMix.value = ctx.params.fractalMix;
    state.uniforms.uJuliaSpeed.value = ctx.params.juliaSpeed;
  },
};
