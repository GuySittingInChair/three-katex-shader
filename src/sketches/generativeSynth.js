const SCALE = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5'];
const RING_COUNT = 8;

export default {
  name: 'Generative Synth',
  description: 'A self-playing pentatonic arpeggio with expanding pulse rings timed to each note.',
  tags: ['audio', 'synthesis', 'generative'],
  category: 'Synthesis',
  mode: 'shader',
  shaderLang: 'glsl',
  latex: 'p_{n+1} = p_n + \\Delta,\\quad \\Delta \\in \\{-2,-1,1,2\\} \\ \\text{(pentatonic walk)}',

  params: {
    noteInterval: { value: 0.4, min: 0.15, max: 1.2 },
    brightness: { value: 1.0, min: 0.3, max: 2 },
  },

  fragmentShader: `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBrightness;
    uniform float uNoteAge[8];
    uniform float uNoteHue[8];
    varying vec2 vUv;

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      float r = length(uv);

      vec3 color = vec3(0.01, 0.01, 0.03);

      for (int i = 0; i < 8; i++) {
        float age = uNoteAge[i];
        if (age > 3.0) continue;
        float radius = age * 0.9;
        float ringDist = abs(r - radius);
        float ring = 0.02 / (0.02 + ringDist * ringDist * 30.0);
        float fade = exp(-age * 1.1);
        vec3 hueColor = 0.5 + 0.5 * cos(6.2831 * (uNoteHue[i] + vec3(0.0, 0.33, 0.67)));
        color += hueColor * ring * fade * uBrightness;
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  uniforms() {
    return {
      uBrightness: { value: 1.0 },
      uNoteAge: { value: new Array(RING_COUNT).fill(999.0) },
      uNoteHue: { value: new Array(RING_COUNT).fill(0) },
    };
  },

  setup(ctx) {
    const Tone = ctx.audio?.Tone;
    const synth = Tone ? new Tone.Synth({ oscillator: { type: 'sine' }, volume: -10 }).toDestination() : null;
    return {
      synth,
      accum: 0,
      ringPos: 0,
      ringAge: new Array(RING_COUNT).fill(999),
      ringHue: new Array(RING_COUNT).fill(0),
      scaleIndex: Math.floor(SCALE.length / 2),
    };
  },

  update(ctx, state) {
    state.uniforms.uBrightness.value = ctx.params.brightness;

    state.accum += ctx.delta;
    if (state.accum >= ctx.params.noteInterval) {
      state.accum -= ctx.params.noteInterval;

      const step = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      state.scaleIndex = Math.max(0, Math.min(SCALE.length - 1, state.scaleIndex + step));
      const note = SCALE[state.scaleIndex];

      const Tone = ctx.audio?.Tone;
      if (state.synth && Tone && Tone.getContext().state === 'running') {
        state.synth.triggerAttackRelease(note, '8n');
      }

      state.ringPos = (state.ringPos + 1) % RING_COUNT;
      state.ringAge[state.ringPos] = 0;
      state.ringHue[state.ringPos] = state.scaleIndex / SCALE.length;
    }

    for (let i = 0; i < RING_COUNT; i++) {
      state.ringAge[i] += ctx.delta;
      state.uniforms.uNoteAge.value[i] = state.ringAge[i];
      state.uniforms.uNoteHue.value[i] = state.ringHue[i];
    }
  },

  dispose(ctx, state) {
    state.synth?.dispose();
  },
};
