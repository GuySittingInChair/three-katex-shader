export default {
  name: 'Hyperbolic Tiling',
  description: 'The {7,3} tiling of the Poincaré disk: identical heptagons, three at every corner, shrinking towards a rim that is infinitely far away. Built by folding each pixel back into one triangle with mirror reflections.',
  tags: ['non-euclidean', 'hyperbolic', 'poincare-disk'],
  category: 'Non-Euclidean',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'ds^2 = \\dfrac{4(dx^2+dy^2)}{(1-x^2-y^2)^2}',

  params: {
    spin: { value: 0.15, min: -1, max: 1 },
    depth: { value: 9, min: 1, max: 30, step: 1 },
  },

  // see docs/wiki/shaders.md: one small program colours every pixel.
  // The tiling (2026-11-18 rewrite: the old fold used a mirror circle that
  // didn't meet the disk's rim at right angles, so it drew a flat green disk).
  // Every pixel is folded back into one thin triangle of the central heptagon
  // by mirror reflections: two straight mirrors through the centre, and one
  // circle mirror that meets the rim at right angles (in this geometry that
  // circle *is* a straight line). Counting the circle reflections tells us
  // how many rings of tiles out from the centre the pixel was.
  // see docs/wiki/sketches/hyperbolicTiling.md
  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSpin;
    uniform float uDepth;
    varying vec2 vUv;

    const float PI = 3.14159265359;
    const float P = 7.0;   // sides per tile
    const float Q = 3.0;   // tiles meeting at each corner

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      uv *= 1.05;

      float rot = uTime * uSpin;
      uv = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * uv;

      float r0 = length(uv);
      vec3 color = vec3(0.02, 0.02, 0.05);

      if (r0 < 1.0) {
        // The circle mirror: centre (c, 0), radius r, at right angles to the rim (c^2 = 1 + r^2),
        // meeting the straight mirror at angle PI/P with angle PI/Q.
        float cq = cos(PI / Q), sp = sin(PI / P);
        float c = cq / sqrt(cq * cq - sp * sp);
        float r = sqrt(c * c - 1.0);
        vec2 C = vec2(c, 0.0);

        vec2 p = uv;
        float wedge = PI / P;
        float rings = 0.0;     // circle reflections = rings of tiles crossed
        float flips = 0.0;     // every reflection, for the light/dark half-triangles
        bool done = false;
        for (int i = 0; i < 40; i++) {
          // Straight mirrors: fold the angle into [0, PI/P].
          float a = atan(p.y, p.x);
          float k = floor(a / (2.0 * wedge));
          a -= k * 2.0 * wedge;
          flips += k;
          if (a > wedge) { a = 2.0 * wedge - a; flips += 1.0; }
          p = vec2(cos(a), sin(a)) * length(p);

          // Circle mirror: if we're past the tile's edge, reflect back inside.
          vec2 d = p - C;
          float d2 = dot(d, d);
          if (d2 >= r * r) { done = true; break; }
          if (rings >= uDepth) break;
          p = C + d * (r * r / d2);
          rings += 1.0;
          flips += 1.0;
        }

        if (done) {
          float hue = fract(rings * 0.13 + 0.55);
          color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
          // Alternate half-triangles slightly lighter and darker.
          color *= mod(flips, 2.0) < 0.5 ? 1.0 : 0.82;
          // Dark tile edges, where the point sits close to the circle mirror.
          float edge = length(p - C) - r;
          color *= smoothstep(0.004, 0.02, edge);
        } else {
          color = vec3(0.04, 0.04, 0.09);   // further out than "depth" rings: left unpainted
        }
        // Fade into the rim, which is infinitely far away.
        color *= smoothstep(1.0, 0.97, r0);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uSpin: { value: 0.15 }, uDepth: { value: 9.0 } };
  },

  update(ctx, state) {
    state.uniforms.uSpin.value = ctx.params.spin;
    state.uniforms.uDepth.value = ctx.params.depth;
  },
};
