export default {
  name: 'Ulam Spiral',
  description: 'Integers wound into a square spiral, primes lit up — the diagonal stripes fall out for free.',
  tags: ['primes', 'spiral', 'number-theory'],
  category: 'Number Theory',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'U(x,y)=n\\ \\text{(spiral index)},\\quad \\mathrm{prime}(n) \\iff \\nexists\\, d \\mid n,\\ 1<d<n',

  params: {
    density: { value: 20, min: 4, max: 40 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDensity;
    varying vec2 vUv;

    // Closed-form: value at integer grid cell (x,y) on a square spiral
    // starting at 1 in the center, winding counter-clockwise.
    float ulamNumber(vec2 c) {
      float x = c.x;
      float y = c.y;
      if (x == 0.0 && y == 0.0) return 1.0;
      float k = max(abs(x), abs(y));
      float prev = (2.0 * k - 1.0) * (2.0 * k - 1.0);
      if (x == k && y > -k) {
        return prev + (k + y);
      } else if (y == k) {
        return prev + (3.0 * k - x);
      } else if (x == -k) {
        return prev + (5.0 * k - y);
      } else {
        return prev + (7.0 * k + x);
      }
    }

    bool isPrime(float n) {
      if (n < 2.0) return false;
      if (n == 2.0) return true;
      if (mod(n, 2.0) == 0.0) return false;
      float maxCheck = sqrt(n);
      for (int i = 0; i < 200; i++) {
        float d = 3.0 + float(i) * 2.0;
        if (d > maxCheck) break;
        if (mod(n, d) == 0.0) return false;
      }
      return true;
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec2 grid = uv * (uDensity * 0.5);
      vec2 cell = floor(grid + 0.5);
      vec2 local = grid - cell;
      float dist = max(abs(local.x), abs(local.y));

      float n = ulamNumber(cell);
      bool prime = isPrime(n);

      float pulse = prime ? (0.6 + 0.4 * sin(uTime + n * 0.01)) : 0.0;
      vec3 primeColor = vec3(0.4, 0.9, 1.0) * pulse;
      vec3 compositeColor = vec3(0.08, 0.08, 0.1);
      vec3 bg = vec3(0.03, 0.02, 0.06);

      float cellShade = smoothstep(0.5, 0.42, dist);
      vec3 color = mix(bg, prime ? primeColor : compositeColor, cellShade);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uDensity: { value: 20 } };
  },

  update(ctx, state) {
    state.uniforms.uDensity.value = ctx.params.density;
  },
};
