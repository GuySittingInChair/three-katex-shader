import { TAU } from '../core/sketchHelpers.js';

export default {
  name: 'Radian628 — Abyssal Bloom',
  description: 'A rotationally folded Radian628 domain with recursive polar warping, orbit accumulation, and spectral interference.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'domain-warp', 'polar', 'experimental'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '\\sum_{k=1}^{4} \\frac{\\sin(k\\theta + t)}{k}\\int \\cos(k r)\\,dr',

  params: {
    baseFreq: { value: 2.2, min: 0.5, max: 6.0, step: 0.1 },
    warpAmt: { value: 0.35, min: 0.0, max: 0.6, step: 0.01 },
    iterations: { value: 20.0, min: 4.0, max: 28.0, step: 1.0 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBaseFreq;
    uniform float uWarpAmt;
    uniform float uIterations;

    varying vec2 vUv;

    #define PI 3.14159265359
    #define TAU 6.28318530718

    vec2 trigIntegral(vec2 p, float freq, float phase) {
      return -cos(p * freq + phase) / freq;
    }

    vec2 radianField(vec2 p, float t) {
      vec2 field = vec2(0.0);
      float freq = uBaseFreq;
      float amp = 1.0;

      for (float k = 1.0; k <= 4.0; k += 1.0) {
        vec2 q = p;
        float a = t * 0.12 * k;

        mat2 rot = mat2(
          cos(a), -sin(a),
          sin(a),  cos(a)
        );

        q = rot * q;

        field += trigIntegral(
          q,
          freq,
          t * (0.35 + k * 0.11)
        ) * amp;

        freq *= 1.75;
        amp *= 0.47;
      }

      return field;
    }

    vec2 polarWarp(vec2 p, float t) {
      float r = length(p);
      float a = atan(p.y, p.x);

      float radial = sin(r * 9.0 - t * 1.8) * cos(r * 3.5 + t * 0.6);
      float angular = sin(a * 12.0 + t * 1.1) * cos(a * 6.0 - t * 0.5);

      float displacement = radial * angular;

      vec2 tangent = vec2(-p.y, p.x);
      if (r > 0.001) {
        tangent /= r;
      }

      p += tangent * displacement * uWarpAmt * 0.75;
      p *= 1.0 + displacement * uWarpAmt * 0.45;

      return p;
    }

    vec2 foldSpace(vec2 p, float t, out float orbit) {
      orbit = 0.0;

      for (float i = 0.0; i < 28.0; i++) {
        if (i >= uIterations)
          break;

        float angle = atan(p.y, p.x);
        float sectors = 6.0 + 2.0 * sin(t * 0.25);

        angle = mod(angle + PI / sectors, TAU / sectors) - PI / sectors;

        float r = length(p);

        p = vec2(cos(angle), sin(angle)) * r;
        p = abs(p);

        float fold = 0.42 + 0.12 * sin(t * 0.6 + i * 0.45);
        p -= fold;

        float d = dot(p, p);
        p /= max(d, 0.045);

        vec2 warp = radianField(
          p * (0.35 + i * 0.035),
          t + i * 0.31
        );

        p += warp * uWarpAmt * 1.35;

        orbit += exp(-12.0 * abs(length(p) - 0.42));
        orbit += exp(-18.0 * abs(p.x * p.y));

        p *= 0.91 + 0.035 * sin(t * 0.7 + i);
      }

      return p;
    }

    vec3 palette(float t) {
      vec3 a = vec3(0.5, 0.5, 0.5);
      vec3 b = vec3(0.5, 0.5, 0.5);
      vec3 c = vec3(1.0, 1.0, 1.0);
      vec3 d = vec3(0.00, 0.33, 0.67);
      return a + b * cos(TAU * (c * t + d));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      float t = uTime;

      vec2 p = uv;
      p = polarWarp(p, t);
      p *= 1.0 + 0.09 * sin(t * 0.35);

      float orbit;
      vec2 q = foldSpace(p, t, orbit);

      float r = length(q);
      float angle = atan(q.y, q.x);

      float interference = sin(r * 24.0 - angle * 9.0 + t * 1.8);
      interference *= sin(r * 11.0 + angle * 13.0 - t * 1.1);

      float colorPhase = length(q) * 0.15 + orbit * 0.1 - t * 0.05;
      vec3 color = palette(colorPhase);

      color *= 0.4 + 2.2 * smoothstep(0.05, 1.5, orbit);

      float veins = smoothstep(0.65, 0.99, abs(interference));
      color += veins * vec3(0.9, 0.2, 0.9) * 1.2;

      float coreGlow = exp(-2.2 * length(uv));
      color += coreGlow * vec3(0.15, 0.8, 1.0) * 0.6;

      float highlights = pow(clamp(orbit * 0.12, 0.0, 1.0), 1.5);
      color += highlights * vec3(1.0, 0.95, 0.8) * 1.8;

      color = pow(clamp(color, 0.0, 1.0), vec3(0.85));

      float vignette = 1.0 - 0.5 * smoothstep(0.3, 1.5, length(uv));
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uBaseFreq: { value: 2.2 },
      uWarpAmt: { value: 0.35 },
      uIterations: { value: 20.0 }
    };
  },

  update(ctx, state) {
    state.uniforms.uBaseFreq.value = ctx.params.baseFreq;
    state.uniforms.uWarpAmt.value = ctx.params.warpAmt;
    state.uniforms.uIterations.value = ctx.params.iterations;
  },
};
