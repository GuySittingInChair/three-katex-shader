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
    warpAmt: { value: 0.22, min: 0.0, max: 0.6, step: 0.01 },
    iterations: { value: 18.0, min: 4.0, max: 28.0, step: 1.0 },
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

    // ------------------------------------------------------------
    // Radian628-inspired trig integral
    // ------------------------------------------------------------

    vec2 trigIntegral(vec2 p, float freq, float phase) {
      return -cos(p * freq + phase) / freq;
    }


    // ------------------------------------------------------------
    // Multi-frequency recursive field
    // ------------------------------------------------------------

    vec2 radianField(vec2 p, float t) {

      vec2 field = vec2(0.0);

      float freq = uBaseFreq;
      float amp = 1.0;

      for (float k = 1.0; k <= 4.0; k += 1.0) {

        vec2 q = p;

        // Rotate each octave differently.
        float a = t * 0.08 * k;

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


    // ------------------------------------------------------------
    // Polar distortion
    // ------------------------------------------------------------

    vec2 polarWarp(vec2 p, float t) {

      float r = length(p);
      float a = atan(p.y, p.x);

      // Radial waves
      float radial =
          sin(r * 7.0 - t * 1.3) *
          cos(r * 2.5 + t * 0.4);

      // Angular interference
      float angular =
          sin(a * 9.0 + t * 0.7) *
          cos(a * 5.0 - t * 0.3);

      float displacement =
          radial * angular;

      // Tangential displacement
      vec2 tangent = vec2(-p.y, p.x);

      if (r > 0.001) {
        tangent /= r;
      }

      p += tangent * displacement * uWarpAmt * 0.55;

      // Radial breathing
      p *= 1.0 + displacement * uWarpAmt * 0.35;

      return p;
    }


    // ------------------------------------------------------------
    // Recursive folding
    // ------------------------------------------------------------

    vec2 foldSpace(vec2 p, float t, out float orbit) {

      orbit = 0.0;

      for (float i = 0.0; i < 28.0; i++) {

        if (i >= uIterations)
          break;

        // Kaleidoscopic-style angular folding
        float angle = atan(p.y, p.x);

        float sectors = 6.0 + 2.0 * sin(t * 0.17);

        angle =
          mod(angle + PI / sectors, TAU / sectors)
          - PI / sectors;

        float r = length(p);

        p = vec2(
          cos(angle),
          sin(angle)
        ) * r;

        // Box fold
        p = abs(p);

        // Moving fold boundary
        float fold =
          0.42 +
          0.10 * sin(t * 0.4 + i * 0.37);

        p -= fold;

        // Nonlinear radial inversion
        float d = dot(p, p);

        p /= max(d, 0.075);

        // Recursive trig displacement
        vec2 warp =
          radianField(
            p * (0.35 + i * 0.035),
            t + i * 0.31
          );

        p += warp * uWarpAmt;

        // Orbit trap.
        orbit +=
          exp(-7.0 * abs(length(p) - 0.42));

        orbit +=
          exp(-10.0 * abs(p.x * p.y));

        // Slowly changing scale
        p *= 0.92 + 0.025 * sin(t * 0.5 + i);
      }

      return p;
    }


    // ------------------------------------------------------------
    // Spectral color field
    // ------------------------------------------------------------

    vec3 spectral(float x, float y, float orbit, float t) {

      float r =
        sin(
          x * 4.7 +
          y * 2.3 +
          orbit * 5.0 +
          t * 0.35
        );

      float g =
        sin(
          x * 2.1 -
          y * 5.4 +
          orbit * 3.2 -
          t * 0.27
        );

      float b =
        sin(
          x * 6.1 +
          y * 1.7 -
          orbit * 7.0 +
          t * 0.18
        );

      vec3 color =
        vec3(r, g, b) * 0.5 + 0.5;

      // Increase contrast around orbit structures.
      color *=
        0.55 +
        1.45 * smoothstep(
          0.15,
          1.2,
          orbit
        );

      return color;
    }


    void main() {

      // ----------------------------------------------------------
      // Coordinates
      // ----------------------------------------------------------

      vec2 uv =
        (vUv - 0.5) * 2.0;

      uv.x *=
        uResolution.x /
        uResolution.y;

      float t = uTime;


      // ----------------------------------------------------------
      // Primary domain
      // ----------------------------------------------------------

      vec2 p = uv;

      p = polarWarp(p, t);

      // Large-scale domain breathing
      p *=
        1.0 +
        0.07 * sin(t * 0.23);


      // ----------------------------------------------------------
      // Recursive fractal
      // ----------------------------------------------------------

      float orbit;

      vec2 q =
        foldSpace(
          p,
          t,
          orbit
        );


      // ----------------------------------------------------------
      // Secondary interference field
      // ----------------------------------------------------------

      float r = length(q);

      float angle =
        atan(q.y, q.x);

      float interference =
        sin(
          r * 18.0
          - angle * 7.0
          + t * 1.2
        );

      interference *=
        sin(
          r * 7.0
          + angle * 11.0
          - t * 0.73
        );


      // ----------------------------------------------------------
      // Spectral base
      // ----------------------------------------------------------

      vec3 color =
        spectral(
          q.x,
          q.y,
          orbit,
          t
        );


      // ----------------------------------------------------------
      // Fractal veins
      // ----------------------------------------------------------

      float veins =
        smoothstep(
          0.72,
          0.98,
          abs(interference)
        );

      color +=
        veins *
        vec3(
          0.35,
          0.18,
          0.55
        );


      // ----------------------------------------------------------
      // Radial glow
      // ----------------------------------------------------------

      float centerGlow =
        exp(
          -3.5 *
          length(uv)
        );

      color +=
        centerGlow *
        vec3(
          0.12,
          0.04,
          0.18
        );


      // ----------------------------------------------------------
      // Orbit highlights
      // ----------------------------------------------------------

      color +=
        pow(
          clamp(orbit, 0.0, 1.0),
          2.0
        ) *
        vec3(
          0.25,
          0.45,
          0.55
        );


      // ----------------------------------------------------------
      // Contrast
      // ----------------------------------------------------------

      color =
        pow(
          clamp(color, 0.0, 1.0),
          vec3(0.72)
        );


      // ----------------------------------------------------------
      // Vignette
      // ----------------------------------------------------------

      float vignette =
        1.0 -
        0.28 *
        smoothstep(
          0.35,
          1.45,
          length(uv)
        );

      color *= vignette;


      gl_FragColor =
        vec4(
          color,
          1.0
        );
    }
  `,

  uniforms() {
    return {
      uBaseFreq: {
        value: 2.2
      },

      uWarpAmt: {
        value: 0.22
      },

      uIterations: {
        value: 18.0
      }
    };
  },

  update(ctx, state) {
    state.uniforms.uBaseFreq.value =
      ctx.params.baseFreq;

    state.uniforms.uWarpAmt.value =
      ctx.params.warpAmt;

    state.uniforms.uIterations.value =
      ctx.params.iterations;
  },
};
