import { TAU } from '../core/sketchHelpers.js';

export default {
  name: 'Radian628 — Quantum Abyss',
  description:
    'A recursive complex-wave fractal combining Radian628 integration, logarithmic geometry, multi-frequency interference, probability-density fields, nonlinear phase feedback, and recursive inversion.',
  tags: [
    'fractal',
    '2d',
    'radian628',
    'glsl',
    'quantum',
    'wavefunction',
    'interference',
    'domain-warp',
    'log-spiral',
    'experimental'
  ],
  category: 'Fractals',
  mode: 'shader',
  shaderLang: 'glsl',

  latex:
    'z_{n+1}=F(z_n,\\Psi_n,|\\Psi_n|^2,t)',

  params: {

    baseFreq: {
      value: 2.8,
      min: 0.5,
      max: 8.0,
      step: 0.1
    },

    warpAmt: {
      value: 0.22,
      min: 0.0,
      max: 0.8,
      step: 0.01
    },

    iterations: {
      value: 18.0,
      min: 4.0,
      max: 32.0,
      step: 1.0
    },

    spiralTightness: {
      value: 1.6,
      min: 0.2,
      max: 4.0,
      step: 0.05
    },

    arms: {
      value: 6.0,
      min: 1.0,
      max: 16.0,
      step: 1.0
    },

    waveStrength: {
      value: 0.8,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },

    phaseFeedback: {
      value: 0.45,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },

    inversion: {
      value: 0.7,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },

    nonlinear: {
      value: 0.35,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },

    frequencyCount: {
      value: 6.0,
      min: 1.0,
      max: 8.0,
      step: 1.0
    },

    probability: {
      value: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },

    colorSaturation: {
      value: 1.25,
      min: 0.5,
      max: 3.0,
      step: 0.1
    }
  },

  fragmentShader: `

    uniform float uTime;
    uniform vec2 uResolution;

    uniform float uBaseFreq;
    uniform float uWarpAmt;
    uniform float uIterations;

    uniform float uSpiralTightness;
    uniform float uArms;

    uniform float uWaveStrength;
    uniform float uPhaseFeedback;

    uniform float uInversion;
    uniform float uNonlinear;

    uniform float uFrequencyCount;
    uniform float uProbability;

    uniform float uColorSaturation;

    varying vec2 vUv;

    #define PI 3.14159265359
    #define TAU 6.28318530718
    #define EPS 0.0001


    // ============================================================
    // Basic rotation
    // ============================================================

    mat2 rotation(float a) {

      float c = cos(a);
      float s = sin(a);

      return mat2(
        c, -s,
        s,  c
      );
    }


    // ============================================================
    // Radian628-style trigonometric integral
    // ============================================================

    vec2 trigIntegral(
      vec2 p,
      float freq,
      float phase
    ) {

      return
        -cos(
          p * freq +
          phase
        ) / max(freq, EPS);
    }


    // ============================================================
    // Multi-frequency Radian field
    //
    // Every frequency lives in its own rotating coordinate
    // system. This is where the recursive field gets its
    // complicated interference structure.
    // ============================================================

    vec2 radianField(
      vec2 p,
      float t,
      float iteration
    ) {

      vec2 field = vec2(0.0);

      float freq = uBaseFreq;
      float amplitude = 1.0;

      for (float k = 1.0; k <= 8.0; k += 1.0) {

        if (k > uFrequencyCount)
          break;

        float localAngle =
          t * (
            0.08 +
            k * 0.037
          )
          +
          iteration * 0.11;

        vec2 q =
          rotation(localAngle) *
          p;

        float localPhase =
          t * (
            0.25 +
            k * 0.071
          )
          +
          sin(iteration * 0.31 + k)
          * 0.7;

        vec2 contribution =
          trigIntegral(
            q,
            freq,
            localPhase
          );

        // Scale each harmonic according to a power law.
        contribution *=
          amplitude /
          pow(k, 0.72);

        field += contribution;

        freq *= 1.73;
        amplitude *= 0.49;
      }

      return field;
    }


    // ============================================================
    // Logarithmic spiral coordinate
    // ============================================================

    vec2 logarithmicCoordinates(
      vec2 p,
      float t
    ) {

      float r =
        length(p) + EPS;

      float angle =
        atan(p.y, p.x);

      float logR =
        log(r) *
        uSpiralTightness;

      float spiralPhase =
        logR +
        angle * uArms;

      float radialWave =
        sin(
          logR * 4.0 -
          t * 1.3
        );

      float angularWave =
        cos(
          spiralPhase * 1.7 +
          t * 0.7
        );

      float displacement =
        radialWave *
        angularWave;

      vec2 radial =
        p / r;

      vec2 tangent =
        vec2(
          -radial.y,
           radial.x
        );

      p +=
        tangent *
        displacement *
        uWarpAmt *
        0.55;

      p +=
        radial *
        displacement *
        uWarpAmt *
        0.25;

      return p;
    }


    // ============================================================
    // Complex wavefunction
    //
    // psi is represented as:
    //
    //     psi = (real, imaginary)
    //
    // Multiple waves interfere in the same domain.
    // ============================================================

    vec2 quantumWave(
      vec2 p,
      float t,
      float iteration
    ) {

      float r =
        length(p) + EPS;

      float angle =
        atan(p.y, p.x);

      float logR =
        log(r);

      vec2 psi =
        vec2(0.0);


      // ----------------------------------------------------------
      // Radial wave
      // ----------------------------------------------------------

      float phase1 =
        r * 13.0
        -
        t * 2.1
        +
        iteration * 0.17;

      psi +=
        vec2(
          cos(phase1),
          sin(phase1)
        )
        *
        0.65;


      // ----------------------------------------------------------
      // Angular wave
      // ----------------------------------------------------------

      float phase2 =
        angle * uArms
        +
        r * 8.0
        +
        t * 1.3;

      psi +=
        vec2(
          cos(phase2),
          sin(phase2)
        )
        *
        0.45;


      // ----------------------------------------------------------
      // Logarithmic spiral wave
      // ----------------------------------------------------------

      float phase3 =
        logR *
        11.0
        +
        angle *
        uArms
        -
        t * 1.7
        +
        iteration * 0.23;

      psi +=
        vec2(
          cos(phase3),
          sin(phase3)
        )
        *
        0.35;


      // ----------------------------------------------------------
      // High-frequency opposing wave
      // ----------------------------------------------------------

      float phase4 =
        r * 21.0
        +
        angle *
        (uArms + 3.0)
        +
        t * 0.9;

      psi +=
        vec2(
          cos(phase4),
          sin(phase4)
        )
        *
        0.22;


      // ----------------------------------------------------------
      // Nonlinear phase perturbation
      // ----------------------------------------------------------

      float chaos =
        sin(
          r * 17.0
          +
          angle * 4.0
          +
          t * 0.37
          +
          iteration * 0.51
        );

      float phase5 =
        r * 31.0
        -
        angle * 7.0
        +
        chaos *
        uNonlinear *
        3.0;

      psi +=
        vec2(
          cos(phase5),
          sin(phase5)
        )
        *
        0.12;


      return psi;
    }


    // ============================================================
    // Probability density
    //
    // |psi|²
    // ============================================================

    float probabilityDensity(
      vec2 psi
    ) {

      float probability =
        dot(
          psi,
          psi
        );

      probability =
        probability /
        (
          1.0 +
          probability
        );

      return probability;
    }


    // ============================================================
    // Quantum-style recursive fold
    // ============================================================

    vec2 quantumFold(
      vec2 p,
      float t,
      out float orbit,
      out float totalProbability,
      out float finalPhase
    ) {

      orbit = 0.0;

      totalProbability = 0.0;

      finalPhase = 0.0;


      for (float i = 0.0; i < 32.0; i++) {

        if (i >= uIterations)
          break;


        // --------------------------------------------------------
        // Polar coordinates
        // --------------------------------------------------------

        float r =
          length(p) + EPS;

        float angle =
          atan(p.y, p.x);


        // --------------------------------------------------------
        // Logarithmic coordinate
        // --------------------------------------------------------

        float logR =
          log(r)
          *
          uSpiralTightness;


        // --------------------------------------------------------
        // Competing symmetry fields
        // --------------------------------------------------------

        float sectorsA =
          uArms
          +
          1.5 *
          sin(
            t * 0.17 +
            i * 0.07
          );

        float sectorsB =
          uArms
          +
          2.0
          +
          1.2 *
          cos(
            t * 0.23 +
            i * 0.11
          );


        float foldedA =
          mod(
            angle +
            PI / sectorsA,
            TAU / sectorsA
          )
          -
          PI / sectorsA;


        float foldedB =
          mod(
            angle +
            PI / sectorsB,
            TAU / sectorsB
          )
          -
          PI / sectorsB;


        // The two symmetry states interfere.
        float symmetryMix =
          0.5 +
          0.5 *
          sin(
            r * 5.0
            -
            t * 0.8
            +
            i * 0.31
          );


        angle =
          mix(
            foldedA,
            foldedB,
            symmetryMix
          );


        p =
          vec2(
            cos(angle),
            sin(angle)
          )
          *
          r;


        // --------------------------------------------------------
        // Absolute fold
        // --------------------------------------------------------

        p =
          abs(p);


        // --------------------------------------------------------
        // Moving fold boundary
        // --------------------------------------------------------

        float fold =
          0.35
          +
          0.12 *
          sin(
            t * 0.6
            +
            i * 0.45
          );


        p -= fold;


        // --------------------------------------------------------
        // Radian628 multi-frequency field
        // --------------------------------------------------------

        vec2 field =
          radianField(
            p *
            (
              0.35 +
              i * 0.035
            ),
            t + i * 0.31,
            i
          );


        p +=
          field *
          uWarpAmt *
          1.15;


        // --------------------------------------------------------
        // Complex wavefunction
        // --------------------------------------------------------

        vec2 psi =
          quantumWave(
            p,
            t,
            i
          );


        // --------------------------------------------------------
        // Probability density
        // --------------------------------------------------------

        float probability =
          probabilityDensity(
            psi
          );


        totalProbability +=
          probability;


        // --------------------------------------------------------
        // Wavefunction phase
        // --------------------------------------------------------

        float phase =
          atan(
            psi.y,
            psi.x
          );


        finalPhase =
          phase;


        // --------------------------------------------------------
        // Phase feedback
        // --------------------------------------------------------

        float feedback =
          sin(
            probability * 12.0
            +
            length(field) * 3.0
            +
            phase * 2.0
            +
            t
          );


        // --------------------------------------------------------
        // Probability-driven displacement
        // --------------------------------------------------------

        vec2 radial =
          p /
          max(
            length(p),
            EPS
          );


        vec2 tangent =
          vec2(
            -radial.y,
             radial.x
          );


        p +=
          radial *
          probability *
          uWaveStrength *
          0.065;


        p +=
          tangent *
          feedback *
          uPhaseFeedback *
          0.045;


        // --------------------------------------------------------
        // Nonlinear self interaction
        // --------------------------------------------------------

        float nonlinearField =
          sin(
            probability *
            18.0
            +
            length(p) *
            7.0
            -
            phase * 3.0
          );


        p +=
          field *
          nonlinearField *
          uNonlinear *
          0.045;


        // --------------------------------------------------------
        // Radial inversion
        // --------------------------------------------------------

        float d =
          dot(
            p,
            p
          );


        float inverseScale =
          mix(
            1.0,
            max(
              d,
              0.025
            ),
            clamp(
              uInversion,
              0.0,
              1.5
            )
          );


        p /=
          inverseScale;


        // --------------------------------------------------------
        // Secondary nonlinear fold
        // --------------------------------------------------------

        p =
          abs(p);


        p -=
          0.27
          +
          field *
          0.06;


        // --------------------------------------------------------
        // Orbit traps
        // --------------------------------------------------------

        float radialTrap =
          exp(
            -8.0 *
            abs(
              length(p) -
              0.5
            )
          );


        float crossTrap =
          exp(
            -12.0 *
            abs(
              p.x *
              p.y
            )
          );


        float probabilityTrap =
          probability *
          exp(
            -5.0 *
            length(p)
          );


        orbit +=
          radialTrap;

        orbit +=
          crossTrap;

        orbit +=
          probabilityTrap;


        // --------------------------------------------------------
        // Recursive scale
        // --------------------------------------------------------

        float scale =
          0.92
          +
          0.04 *
          sin(
            t * 0.4
            +
            i * 0.7
            +
            probability * 3.0
          );


        p *= scale;
      }


      return p;
    }


    // ============================================================
    // Quantum spectral palette
    // ============================================================

    vec3 quantumPalette(
      float phase,
      float probability,
      float saturation
    ) {

      // Phase determines hue.
      float hue =
        phase / TAU;


      vec3 color =
        0.5
        +
        0.5 *
        cos(
          TAU *
          (
            hue
            +
            vec3(
              0.00,
              0.33,
              0.67
            )
          )
        );


      // Desaturate toward probability-field darkness.
      vec3 gray =
        vec3(
          dot(
            color,
            vec3(
              0.299,
              0.587,
              0.114
            )
          )
        );


      color =
        mix(
          gray,
          color,
          saturation
        );


      // Probability controls luminous energy.
      color *=
        0.12
        +
        probability *
        2.4;


      return color;
    }


    // ============================================================
    // Main
    // ============================================================

    void main() {

      // ----------------------------------------------------------
      // Screen coordinates
      // ----------------------------------------------------------

      vec2 uv =
        (vUv - 0.5)
        * 2.0;


      uv.x *=
        uResolution.x /
        uResolution.y;


      float t =
        uTime;


      // ----------------------------------------------------------
      // Initial domain
      // ----------------------------------------------------------

      vec2 p =
        uv;


      // Slow global breathing.
      p *=
        1.0
        +
        0.075 *
        sin(
          t * 0.31
        );


      // ----------------------------------------------------------
      // Logarithmic pre-warp
      // ----------------------------------------------------------

      p =
        logarithmicCoordinates(
          p,
          t
        );


      // ----------------------------------------------------------
      // Recursive quantum system
      // ----------------------------------------------------------

      float orbit;
      float totalProbability;
      float finalPhase;


      vec2 q =
        quantumFold(
          p,
          t,
          orbit,
          totalProbability,
          finalPhase
        );


      // ----------------------------------------------------------
      // Final coordinates
      // ----------------------------------------------------------

      float r =
        length(q) + EPS;


      float angle =
        atan(
          q.y,
          q.x
        );


      // ----------------------------------------------------------
      // Final wavefunction
      // ----------------------------------------------------------

      vec2 finalPsi =
        quantumWave(
          q,
          t,
          uIterations
        );


      float finalProbability =
        probabilityDensity(
          finalPsi
        );


      float phase =
        atan(
          finalPsi.y,
          finalPsi.x
        );


      // ----------------------------------------------------------
      // Quantum interference
      // ----------------------------------------------------------

      float interference =
        sin(
          phase * 7.0
          +
          r * 11.0
          -
          t * 1.2
        );


      interference *=
        sin(
          r * 19.0
          -
          angle * (
            uArms + 2.0
          )
          +
          t * 0.73
        );


      // ----------------------------------------------------------
      // Probability bands
      // ----------------------------------------------------------

      float bands =
        pow(
          clamp(
            finalProbability,
            0.0,
            1.0
          ),
          2.7
        );


      // ----------------------------------------------------------
      // Quantum spectral color
      // ----------------------------------------------------------

      float colorPhase =
        phase / TAU
        +
        orbit * 0.015
        +
        interference * 0.04
        +
        t * 0.018;


      vec3 color =
        quantumPalette(
          colorPhase,
          bands,
          uColorSaturation
        );


      // ----------------------------------------------------------
      // Orbit structures
      // ----------------------------------------------------------

      float orbitIntensity =
        smoothstep(
          0.15,
          2.8,
          orbit
        );


      color *=
        0.55
        +
        2.2 *
        orbitIntensity;


      // ----------------------------------------------------------
      // Interference veins
      // ----------------------------------------------------------

      float veins =
        smoothstep(
          0.55,
          0.97,
          abs(
            interference
          )
        );


      vec3 electricColor =
        mix(
          vec3(
            0.02,
            0.75,
            1.0
          ),
          vec3(
            1.0,
            0.05,
            0.7
          ),
          0.5 +
          0.5 *
          sin(
            phase +
            t
          )
        );


      color +=
        veins *
        electricColor *
        1.4;


      // ----------------------------------------------------------
      // Probability shells
      // ----------------------------------------------------------

      float shell =
        exp(
          -16.0 *
          abs(
            finalProbability -
            0.48
          )
        );


      color +=
        shell *
        vec3(
          0.15,
          0.55,
          0.95
        )
        *
        1.6;


      // ----------------------------------------------------------
      // Quantum core
      // ----------------------------------------------------------

      float coreRadius =
        length(uv);


      float core =
        exp(
          -18.0 *
          coreRadius
        );


      float coreWave =
        0.5 +
        0.5 *
        sin(
          coreRadius * 80.0
          -
          t * 4.0
        );


      color +=
        core *
        coreWave *
        vec3(
          0.65,
          0.85,
          1.0
        );


      // ----------------------------------------------------------
      // Probability haze
      // ----------------------------------------------------------

      float haze =
        exp(
          -1.8 *
          r
        )
        *
        finalProbability;


      color +=
        haze *
        vec3(
          0.015,
          0.08,
          0.16
        );


      // ----------------------------------------------------------
      // High-energy orbit highlights
      // ----------------------------------------------------------

      float highlights =
        pow(
          clamp(
            orbit *
            0.075,
            0.0,
            1.0
          ),
          1.4
        );


      color +=
        highlights *
        vec3(
          0.8,
          0.95,
          1.0
        )
        *
        2.0;


      // ----------------------------------------------------------
      // Dynamic exposure
      // ----------------------------------------------------------

      color *=
        0.85
        +
        0.2 *
        sin(
          t * 0.27
        );


      // ----------------------------------------------------------
      // ACES-inspired tone mapping
      // ----------------------------------------------------------

      color =
        (
          color *
          (
            2.51 *
            color +
            0.03
          )
        )
        /
        (
          color *
          (
            2.43 *
            color +
            0.59
          )
          +
          0.14
        );


      // ----------------------------------------------------------
      // Contrast
      // ----------------------------------------------------------

      color =
        pow(
          max(
            color,
            vec3(0.0)
          ),
          vec3(
            0.82
          )
        );


      // ----------------------------------------------------------
      // Vignette
      // ----------------------------------------------------------

      float vignette =
        1.0
        -
        0.32 *
        smoothstep(
          0.35,
          1.65,
          length(uv)
        );


      color *=
        vignette;


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
        value: 2.8
      },

      uWarpAmt: {
        value: 0.22
      },

      uIterations: {
        value: 18.0
      },

      uSpiralTightness: {
        value: 1.6
      },

      uArms: {
        value: 6.0
      },

      uWaveStrength: {
        value: 0.8
      },

      uPhaseFeedback: {
        value: 0.45
      },

      uInversion: {
        value: 0.7
      },

      uNonlinear: {
        value: 0.35
      },

      uFrequencyCount: {
        value: 6.0
      },

      uProbability: {
        value: 1.0
      },

      uColorSaturation: {
        value: 1.25
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

    state.uniforms.uSpiralTightness.value =
      ctx.params.spiralTightness;

    state.uniforms.uArms.value =
      ctx.params.arms;

    state.uniforms.uWaveStrength.value =
      ctx.params.waveStrength;

    state.uniforms.uPhaseFeedback.value =
      ctx.params.phaseFeedback;

    state.uniforms.uInversion.value =
      ctx.params.inversion;

    state.uniforms.uNonlinear.value =
      ctx.params.nonlinear;

    state.uniforms.uFrequencyCount.value =
      ctx.params.frequencyCount;

    state.uniforms.uProbability.value =
      ctx.params.probability;

    state.uniforms.uColorSaturation.value =
      ctx.params.colorSaturation;
  },
};
