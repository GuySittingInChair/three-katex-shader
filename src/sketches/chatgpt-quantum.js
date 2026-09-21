import { TAU } from '../core/sketchHelpers.js';

export default {
  name: 'Radian628 — Abyssal Bloom (Hyper-Vibrant Log Spiral)',
  description: 'A rotationally folded Radian628 domain with logarithmic spiral warping, high-saturation spectral palette, and emissive bloom.',
  tags: ['fractal', '2d', 'radian628', 'glsl', 'domain-warp', 'log-spiral', 'vibrant'],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: '(r, \\theta) \\to (\\ln r \\cdot b - \\theta \\cdot n,\\ \\theta \\cdot n + \\ln r \\cdot b)',

  params: {
    baseFreq: { value: 2.2, min: 0.5, max: 6.0, step: 0.1 },
    warpAmt: { value: 0.35, min: 0.0, max: 0.6, step: 0.01 },
    iterations: { value: 20.0, min: 4.0, max: 28.0, step: 1.0 },
    spiralTightness: { value: 1.4, min: 0.5, max: 3.0, step: 0.05 },
    arms: { value: 5.0, min: 1.0, max: 12.0, step: 1.0 },
    colorSaturation: { value: 1.8, min: 0.5, max: 3.0, step: 0.1 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBaseFreq;
    uniform float uWarpAmt;
    uniform float uIterations;
    uniform float uSpiralTightness;
    uniform float uArms;
    uniform float uColorSaturation;

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

    vec2 logSpiralWarp(vec2 p, float t) {
      float r = length(p);
      float a = atan(p.y, p.x);

      float logR = log(r + 0.001) * uSpiralTightness;
      float spiralAngle = a * uArms + logR;

      float radial = sin(logR * 3.0 - t * 1.8) * cos(spiralAngle + t * 0.6);
      float angular = sin(spiralAngle * 2.0 + t * 1.1) * cos(a * 6.0 - t * 0.5);

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

        float r = length(p);
        float angle = atan(p.y, p.x);

        float logTerm = log(r + 0.001) * uSpiralTightness;
        angle += logTerm * 0.15;

        float sectors = uArms + 2.0 * sin(t * 0.25);
        angle = mod(angle + PI / sectors, TAU / sectors) - PI / sectors;

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

        orbit += exp(-10.0 * abs(length(p) - 0.42));
        orbit += exp(-14.0 * abs(p.x * p.y));

        p *= 0.91 + 0.035 * sin(t * 0.7 + i);
      }

      return p;
    }

// ------------------------------------------------------------
// Quantum-style complex wavefunction
// ------------------------------------------------------------

vec2 quantumWave(vec2 p, float t) {

  float r = length(p);
  float a = atan(p.y, p.x);

  vec2 psi = vec2(0.0);

  // Wave 1 — radial
  float phase1 =
      r * 13.0
      - t * 2.1;

  psi += vec2(
      cos(phase1),
      sin(phase1)
  ) * 0.65;


  // Wave 2 — angular
  float phase2 =
      a * uArms
      + r * 8.0
      + t * 1.3;

  psi += vec2(
      cos(phase2),
      sin(phase2)
  ) * 0.45;


  // Wave 3 — logarithmic spiral
  float logR =
      log(r + 0.001)
      * uSpiralTightness;

  float phase3 =
      logR * 11.0
      + a * uArms
      - t * 1.7;

  psi += vec2(
      cos(phase3),
      sin(phase3)
  ) * 0.35;


  // Wave 4 — opposing wave
  float phase4 =
      r * 21.0
      + a * (uArms + 3.0)
      + t * 0.9;

  psi += vec2(
      cos(phase4),
      sin(phase4)
  ) * 0.22;


  return psi;
}



    // High-saturation spectral rainbow palette driven by phase angles
    vec3 vibrantPalette(float t, float sat) {
      vec3 col = 0.5 + 0.5 * cos(TAU * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
      // Boost color saturation directly in RGB space
      vec3 gray = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
      return mix(gray, col, sat);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;

      float t = uTime;

      vec2 p = uv;
      p = logSpiralWarp(p, t);
      p *= 1.0 + 0.09 * sin(t * 0.35);

      float orbit;
      vec2 q = foldSpace(p, t, orbit);

      float r = length(q);
      float angle = atan(q.y, q.x);

      float interference = sin(r * 24.0 - angle * uArms + t * 1.8);
      interference *= sin(r * 11.0 + angle * (uArms + 2.0) - t * 1.1);

      // Phase cycle mapped over space and orbit trap intensity
      float colorPhase = r * 0.08 + orbit * 0.05 + atan(q.y, q.x) / TAU - t * 0.08;
      vec3 color = vibrantPalette(colorPhase, uColorSaturation);

      // Boost luminance along high-density orbit folds
      float orbitIntensity = smoothstep(0.1, 2.5, orbit);
      color *= 0.8 + 2.5 * orbitIntensity;

      // Electric interference veins with neon cyan/magenta tilt
      float veins = smoothstep(0.55, 0.98, abs(interference));
      vec3 veinColor = mix(vec3(1.0, 0.05, 0.65), vec3(0.0, 0.95, 1.0), sin(t + r) * 0.5 + 0.5);
      color += veins * veinColor * 1.6;

      // Bright core light emitting radially outward
      float coreGlow = exp(-1.8 * length(uv));
      color += coreGlow * vec3(0.2, 0.7, 1.0) * 0.9;

      // Intense specular-like highlights on tight fold orbits
      float highlights = pow(clamp(orbit * 0.08, 0.0, 1.0), 1.2);
      color += highlights * vec3(1.0, 0.98, 0.85) * 2.2;

      // ACES-inspired exposure/tone map to lift midtones without clipping
      color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);

      // Soft vignette around edges
      float vignette = 1.0 - 0.35 * smoothstep(0.4, 1.6, length(uv));
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uBaseFreq: { value: 2.2 },
      uWarpAmt: { value: 0.35 },
      uIterations: { value: 20.0 },
      uSpiralTightness: { value: 1.4 },
      uArms: { value: 5.0 },
      uColorSaturation: { value: 1.8 },
    };
  },

  update(ctx, state) {
    state.uniforms.uBaseFreq.value = ctx.params.baseFreq;
    state.uniforms.uWarpAmt.value = ctx.params.warpAmt;
    state.uniforms.uIterations.value = ctx.params.iterations;
    state.uniforms.uSpiralTightness.value = ctx.params.spiralTightness;
    state.uniforms.uArms.value = ctx.params.arms;
    state.uniforms.uColorSaturation.value = ctx.params.colorSaturation;
  },
};
