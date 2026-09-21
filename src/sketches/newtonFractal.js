export default {
  name: 'Newton Fractal',
  description: "Newton's method root-finding on z³ − 1, colored by which root each pixel falls toward.",
  tags: ['fractal', 'complex', 'roots'],
  category: 'Algebraic Art',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'z_{n+1} = z_n - \\dfrac{z_n^3 - 1}{3z_n^2}',

  params: {
    zoom: { value: 1.2, min: 0.3, max: 3 },
    warp: { value: 0.06, min: 0, max: 0.3 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uZoom;
    uniform float uWarp;
    varying vec2 vUv;

    vec2 cMul(vec2 a, vec2 b) {
      return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
    }
    vec2 cDiv(vec2 a, vec2 b) {
      float d = dot(b, b);
      return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 z = uv / uZoom;

      vec2 wobble = uWarp * vec2(cos(uTime * 0.3), sin(uTime * 0.3)) * 0.15;

      vec2 r0 = vec2(1.0, 0.0);
      vec2 r1 = vec2(-0.5, 0.8660254);
      vec2 r2 = vec2(-0.5, -0.8660254);

      float iterFrac = 0.0;
      const int MAX_ITER = 40;
      int rootIndex = 0;
      for (int i = 0; i < MAX_ITER; i++) {
        vec2 z2 = cMul(z, z);
        vec2 z3 = cMul(z2, z);
        vec2 numerator = z3 - vec2(1.0, 0.0) + wobble;
        vec2 denom = 3.0 * z2;
        if (dot(denom, denom) < 1e-8) denom = vec2(1e-4, 0.0);
        z = z - cDiv(numerator, denom);
        iterFrac = float(i) / float(MAX_ITER);

        if (length(z - r0) < 0.001) { rootIndex = 0; break; }
        if (length(z - r1) < 0.001) { rootIndex = 1; break; }
        if (length(z - r2) < 0.001) { rootIndex = 2; break; }
      }

      vec3 hueA = vec3(0.95, 0.35, 0.25);
      vec3 hueB = vec3(0.25, 0.85, 0.55);
      vec3 hueC = vec3(0.35, 0.45, 0.95);
      vec3 rootColor = rootIndex == 0 ? hueA : (rootIndex == 1 ? hueB : hueC);

      float brightness = 1.0 - iterFrac;
      gl_FragColor = vec4(rootColor * brightness, 1.0);
    }
  `,

  uniforms() {
    return { uZoom: { value: 1.2 }, uWarp: { value: 0.06 } };
  },

  update(ctx, state) {
    state.uniforms.uZoom.value = ctx.params.zoom;
    state.uniforms.uWarp.value = ctx.params.warp;
  },
};
