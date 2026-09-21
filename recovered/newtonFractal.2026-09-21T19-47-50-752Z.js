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
    // Uniforms for time, resolution, zoom, warp, and UV coordinates
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uZoom;
    uniform float uWarp;
    varying vec2 vUv;

    // Complex number multiplication (a * b) using vec2 to represent complex numbers
    vec2 cMul(vec2 a, vec2 b) {
      return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
    }
    // Complex number division (a / b) with normalization
    vec2 cDiv(vec2 a, vec2 b) {
      float d = dot(b, b); // Denominator (magnitude squared)
      return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
    }

    void main() {
      // Convert UV coordinates to complex plane (-1 to 1)
      vec2 uv = (vUv - 0.5) * 2.0;
      // Account for aspect ratio distortion
      uv.x *= uResolution.x / uResolution.y;
      // Initialize complex number z with zoom scaling
      vec2 z = uv / uZoom;

      // Time-based wobble for dynamic distortion
      vec2 wobble = uWarp * vec2(cos(uTime * 0.3), sin(uTime * 0.3)) * 0.15;

      // Roots of z³ = 1 (cube roots of unity)
      vec2 r0 = vec2(1.0, 0.0);        // 1
      vec2 r1 = vec2(-0.5, 0.8660254); // e^(2πi/3)
      vec2 r2 = vec2(-0.5, -0.8660254); // e^(-2πi/3)

      float iterFrac = 0.0;            // Progress through iterations
      const int MAX_ITER = 40;         // Maximum Newton iterations
      int rootIndex = 0;               // Which root was found

      // Newton's method iteration for root-finding
      for (int i = 0; i < MAX_ITER; i++) {
        // Compute z² and z³ using complex multiplication
        vec2 z2 = cMul(z, z);
        vec2 z3 = cMul(z2, z);
        
        // Newton update formula: z = z - (z³ - 1)/(3z²)
        vec2 numerator = z3 - vec2(1.0, 0.0) + wobble; // f(z) = z³ - 1
        vec2 denom = 3.0 * z2;                         // f'(z) = 3z²
        
        // Prevent division by zero with small epsilon
        if (dot(denom, denom) < 1e-8) denom = vec2(1e-4, 0.0);
        
        z = z - cDiv(numerator, denom); // Update z
        
        // Track iteration progress
        iterFrac = float(i) / float(MAX_ITER);

        // Check convergence to roots
        if (length(z - r0) < 0.001) { rootIndex = 0; break; }
        if (length(z - r1) < 0.001) { rootIndex = 1; break; }
        if (length(z - r2) < 0.001) { rootIndex = 2; break; }
      }

      // Color palettes for each root
      vec3 hueA = vec3(0.95, 0.35, 0.25); // Root 0 (real axis)
      vec3 hueB = vec3(0.25, 0.85, 0.55); // Root 1 (upper complex)
      vec3 hueC = vec3(0.35, 0.45, 0.95); // Root 2 (lower complex)
      vec3 rootColor = rootIndex == 0 ? hueA : (rootIndex == 1 ? hueB : hueC);

      // Brightness decreases with iteration progress (convergence)
      float brightness = 1.0 - iterFrac;
      gl_FragColor = vec4(rootColor * brightness, 1.0); // Final color output
    }
  `,

  uniforms() {
    return { uZoom: { value: 1.2 }, uWarp: { value: 0.06 } };
  },

  update(ctx, state) {
    // Sync parameters to shader uniforms
    state.uniforms.uZoom.value = ctx.params.zoom;
    state.uniforms.uWarp.value = ctx.params.warp;
  },
};
