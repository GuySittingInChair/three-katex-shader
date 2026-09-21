export default {
  name: 'Radian628 — Raymarched',
  description: 'Radian628\'s fold-and-integrate warp lifted into 3D: a Mandelbox-style folding distance estimator perturbed every iteration by the same trigonometric integral, raymarched from a fixed camera.',
  tags: ['fractal', '3d', 'raymarch', 'radian628', 'glsl', 'integral'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'p \\to p + \\varepsilon\\!\\int\\! \\sin(kp+t)\\,dp\\ \\ \\text{before folding}',

  params: {
    iterations: { value: 8.0, min: 2.0, max: 14.0, step: 1.0 },
    foldScale: { value: 2.0, min: 1.3, max: 3.0, step: 0.05 },
    warpAmt: { value: 0.05, min: 0.0, max: 0.3, step: 0.005 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIterations;
    uniform float uFoldScale;
    uniform float uWarpAmt;
    varying vec2 vUv;

    vec3 spatialTrigIntegral3(vec3 p, float freq, float time) {
      return -cos(p * freq + time) / freq;
    }

    // Pure Sierpinski-style fold-and-scale distance estimator — kept
    // numerically well-behaved so raymarching actually converges.
    float foldDE(vec3 p) {
      float scale = uFoldScale;
      float dr = 1.0;
      for (int i = 0; i < 14; i++) {
        if (float(i) >= uIterations) break;
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        p = p * scale - (scale - 1.0);
        dr *= abs(scale);
      }
      return length(p) / abs(dr);
    }

    // The Radian628 integral warp is applied once, as a smooth pre-distortion
    // of the sample point — not injected into the fold loop, which would
    // corrupt the derivative (dr) the distance estimate depends on.
    float mapDE(vec3 pos) {
      vec3 warp = spatialTrigIntegral3(pos, 2.0, uTime * 0.4) * uWarpAmt;
      return foldDE(pos + warp);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      vec3 ro = vec3(0.0, 0.0, 3.0);
      vec3 rd = normalize(vec3(uv, -1.8));

      float t = 0.0;
      float glow = 0.0;
      bool hit = false;
      for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        float d = mapDE(p);
        glow += 0.006 / (0.02 + d * d * 20.0);
        if (d < 0.001) { hit = true; break; }
        t += d * 0.5;
        if (t > 6.0) break;
      }
      glow = min(glow, 1.2);

      vec3 color = vec3(0.0);
      if (hit) {
        vec3 p = ro + rd * t;
        float hue = fract(length(p) * 0.6 + uTime * 0.05);
        color = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
        color *= 1.0 - t / 6.0;
      }
      color += glow * vec3(0.2, 0.08, 0.3);
      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return { uIterations: { value: 8.0 }, uFoldScale: { value: 2.0 }, uWarpAmt: { value: 0.05 } };
  },

  update(ctx, state) {
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uFoldScale.value = ctx.params.foldScale;
    state.uniforms.uWarpAmt.value = ctx.params.warpAmt;
  },
};
