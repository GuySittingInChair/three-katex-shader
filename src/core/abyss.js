import * as Tone from 'tone';
import { feedAnalysers } from './audioEngine.js';

// "Abyss": a generative deep-water instrument you steer by hand.
//
// Layers
//   drone     detuned saw pair + octave + sub, through a slowly moving low-pass
//   pad       a slow-attack chord that "blooms": staggered chord tones fade in over
//             the swell time, then release into the reverb tail
//   bells     sparse FM bell tones at random moments (bioluminescence), through a
//             ping-pong delay; how often is the `life` control
//   pressure  brown noise, low-passed — the weight of the water
//   space     one long reverb over everything; the sub stays dry so it doesn't smear
//
// Controls (all 0..1 except swell, in seconds):
//   depth     darker & deeper: lower filter cutoffs, more sub
//   bloom     how open the whole sound is (pad level, filter opening, more bells)
//   space     reverb amount
//   life      how often the bells sing
//   drift     how much the tones wander and detune
//   pressure  level of the water-noise bed
//   level     master volume
//   swell     length of a "Let it bloom" gesture, seconds
//
// Nothing here is a fixed loop: bell timing is a Poisson process, the drift is a
// sum of incommensurate slow sines, and each bloom picks the next chord of a
// i – VI – iv – v progression. Every macro is applied by one 100 ms tick, so
// the controls can be dragged at any time without clicks.
//
// The output goes to the speakers, to the audio-reactive analysers (so sketches
// move to it) and — being on the master bus — into the recorder.

export const MODES = {
  Aeolian: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
};
export const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const DEFAULTS = { depth: 0.7, bloom: 0.25, space: 0.7, life: 0.35, drift: 0.4, pressure: 0.35, level: 0.6, swell: 18 };

export const PRESETS = {
  Trench: { depth: 0.9, bloom: 0.1, space: 0.8, life: 0.15, drift: 0.3, pressure: 0.5, swell: 24 },
  Bloom: { depth: 0.65, bloom: 0.55, space: 0.75, life: 0.4, drift: 0.5, pressure: 0.3, swell: 18 },
  Bioluminescence: { depth: 0.5, bloom: 0.35, space: 0.6, life: 0.85, drift: 0.6, pressure: 0.2, swell: 14 },
  'Still water': { depth: 0.4, bloom: 0.2, space: 0.9, life: 0.05, drift: 0.15, pressure: 0.6, swell: 30 },
};

const PROGRESSION = [0, 5, 3, 4]; // i, VI, iv, v — scale degrees to build chords on
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };

export function createAbyss() {
  const p = { ...DEFAULTS, root: 2, mode: 'Aeolian' }; // root 2 = D
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(p));

  let built = false;
  let running = false;
  let tickTimer = 0;
  let pingTimer = 0;
  let bloomStart = -1e9;
  let bloomLength = 1;
  let chordIndex = 0;
  const held = new Map(); // key -> note being held (hold-to-swell pad notes)
  let n; // nodes

  // MIDI note for scale degree `d` (may exceed 6, or be negative) in octave `oct`.
  function midiOf(d, oct) {
    const scale = MODES[p.mode];
    const octaveCarry = Math.floor(d / 7);
    const idx = ((d % 7) + 7) % 7;
    return 12 * (oct + 1) + p.root + scale[idx] + 12 * octaveCarry;
  }
  const hz = (midi) => Tone.Midi(midi).toFrequency();

  async function build() {
    n = {};
    n.out = new Tone.Gain(0);
    n.limiter = new Tone.Limiter(-2);
    n.out.connect(n.limiter);
    n.limiter.toDestination();
    feedAnalysers(n.limiter);

    n.bus = new Tone.Gain(1);
    n.verb = new Tone.Reverb({ decay: 16, preDelay: 0.09, wet: 0.6 });
    n.bus.connect(n.verb);
    n.verb.connect(n.out);

    // drone
    n.droneFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, rolloff: -24, Q: 0.6 });
    n.drone = new Tone.FatOscillator({ type: 'sawtooth', frequency: hz(midiOf(0, 2)), count: 3, spread: 14, volume: -22 }).start();
    n.droneHigh = new Tone.FatOscillator({ type: 'triangle', frequency: hz(midiOf(0, 3)), count: 2, spread: 9, volume: -28 }).start();
    n.drone.connect(n.droneFilter);
    n.droneHigh.connect(n.droneFilter);
    n.droneFilter.connect(n.bus);
    n.sub = new Tone.Oscillator({ type: 'sine', frequency: hz(midiOf(0, 1)), volume: -22 }).start();
    n.sub.connect(n.out); // dry: the reverb would smear the low end

    // water pressure
    n.noise = new Tone.Noise('brown').start();
    n.noiseFilter = new Tone.Filter(400, 'lowpass');
    n.noise.chain(n.noiseFilter, n.bus);
    n.noise.volume.value = -50;

    // pad: slow attack, very long release
    n.padFilter = new Tone.Filter({ type: 'lowpass', frequency: 900, rolloff: -24 });
    n.pad = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 12 });
    n.pad.set({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
      envelope: { attack: 6, decay: 2, sustain: 0.85, release: 14 },
      volume: -30,
    });
    n.pad.chain(n.padFilter, n.bus);

    // bells
    n.pingDelay = new Tone.PingPongDelay({ delayTime: 0.62, feedback: 0.5, wet: 0.45 });
    n.panner = new Tone.Panner(0);
    n.bell = new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 6 });
    n.bell.set({
      harmonicity: 3.01,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 3, sustain: 0, release: 5 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 2 },
      volume: -12,
    });
    n.bell.chain(n.panner, n.pingDelay, n.bus);
    n.panner.connect(n.bus);

    await n.verb.ready;
    built = true;
  }

  // ---- macros -> audio parameters ---------------------------------------
  function bloomEnvelope(now) {
    const u = (now - bloomStart) / (bloomLength * 1.6);
    if (u < 0 || u > 1) return 0;
    if (u < 0.25) return smooth(u / 0.25);
    if (u < 0.4) return 1;
    return Math.pow(1 - (u - 0.4) / 0.6, 1.5);
  }

  function currentBloom(now) {
    return Math.max(p.bloom, bloomEnvelope(now));
  }

  function tick() {
    if (!built) return;
    const t = performance.now() / 1000;
    const b = currentBloom(t);
    const d = p.depth;
    const dr = p.drift;
    const wob1 = Math.sin(t * 0.031 * (0.4 + 2 * dr));
    const wob2 = Math.sin(t * 0.047 * (0.4 + 2 * dr) + 1.3);
    const ramp = 0.3;

    n.droneFilter.frequency.rampTo(mix(700, 110, d) * (0.7 + 0.9 * b) * (1 + 0.3 * dr * wob1), ramp);
    n.padFilter.frequency.rampTo(mix(2600, 520, d) * (0.6 + 1.5 * b) * (1 + 0.25 * dr * wob2), ramp);
    n.noiseFilter.frequency.rampTo((250 + 900 * (1 - 0.6 * d)) * (1 + 0.4 * dr * wob2), ramp);

    // Gain staging, from measuring a recording: with the drone/sub at their first
    // levels the 50–200 Hz mass sat 10–25 dB above the pad and bells, so a bloom
    // barely registered. The pad now leads at the peak of a bloom.
    n.pad.volume.rampTo(-28 + 24 * b, ramp);
    n.drone.volume.rampTo(-30 + 6 * b, ramp);
    n.sub.volume.rampTo(-38 + 14 * d, ramp);
    n.noise.volume.rampTo(-58 + 46 * p.pressure, ramp);

    n.drone.spread = 8 + 30 * dr;
    n.verb.wet.rampTo(clamp01(0.25 + 0.65 * p.space + 0.1 * b), ramp);
    n.out.gain.rampTo(running ? p.level * 2 : 0, running ? 0.2 : 1.5);
  }

  // ---- bells (a Poisson process) -----------------------------------------
  function pingRate() {
    const b = currentBloom(performance.now() / 1000);
    return (0.02 + 0.5 * Math.pow(p.life, 1.5)) * (0.6 + 0.8 * b); // pings per second
  }

  function ring(degree, oct, vel = 0.6, pan = (Math.random() * 2 - 1) * 0.8) {
    if (!built) return;
    n.panner.pan.rampTo(pan, 0.05);
    n.bell.triggerAttackRelease(hz(midiOf(degree, oct)), 4, Tone.now(), vel);
  }

  function scheduleBell() {
    clearTimeout(pingTimer);
    const rate = pingRate();
    const wait = Math.min(25, Math.max(0.4, -Math.log(1 - Math.random()) / rate));
    pingTimer = setTimeout(() => {
      if (running) {
        // Chord tones far more likely than passing tones, so it stays consonant.
        const pool = [0, 0, 2, 2, 4, 4, 6, 1, 3];
        ring(pool[Math.floor(Math.random() * pool.length)], 5 + (Math.random() < 0.3 ? 1 : 0), 0.35 + Math.random() * 0.5);
      }
      if (running) scheduleBell();
    }, wait * 1000);
  }

  // ---- pad bloom ----------------------------------------------------------
  function chordNotes(degree) {
    // Stacked thirds from `degree`, plus the added 9th, from octave 3.
    return [0, 2, 4, 6, 8].map((k) => hz(midiOf(degree + k, 3)));
  }

  function retune() {
    if (!built) return;
    n.drone.frequency.rampTo(hz(midiOf(0, 2)), 3);
    n.droneHigh.frequency.rampTo(hz(midiOf(0, 3)), 3);
    n.sub.frequency.rampTo(hz(midiOf(0, 1)), 3);
  }

  const api = {
    params: p,
    get running() { return running; },
    get blooming() { return performance.now() / 1000 - bloomStart < bloomLength * 1.6; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async start() {
      await Tone.start();
      if (!built) await build();
      running = true;
      tick();
      clearInterval(tickTimer);
      tickTimer = setInterval(tick, 100);
      scheduleBell();
      emit();
    },

    stop() {
      running = false;
      clearTimeout(pingTimer);
      n?.pad.releaseAll();
      held.clear();
      tick(); // ramps the master to silence
      emit();
    },

    set(name, value) {
      p[name] = value;
      if (name === 'root' || name === 'mode') retune();
      emit();
    },

    applyPreset(name) {
      Object.assign(p, PRESETS[name]);
      emit();
    },

    // One slow swell: pad chord tones come in one after another over the swell
    // time while every macro opens, then everything settles back.
    bloomNow() {
      if (!running) return;
      bloomStart = performance.now() / 1000;
      bloomLength = p.swell;
      const degree = PROGRESSION[chordIndex++ % PROGRESSION.length];
      const hold = p.swell * 0.9;
      chordNotes(degree).forEach((f, i) => n.pad.triggerAttackRelease(f, hold, Tone.now() + i * p.swell * 0.11));
      emit();
    },

    ping() {
      if (running) ring(Math.floor(Math.random() * 5) * 2 % 7, 5, 0.7);
    },

    // Play: a bell at octave 5, or (pad = true) a held pad note at octave 3 that swells while held.
    noteOn(degree, pad = false, key = degree) {
      if (!running) return;
      if (pad) {
        const f = hz(midiOf(degree, 3));
        held.set(key, f);
        n.pad.triggerAttack(f);
      } else {
        ring(degree, 5, 0.75, 0);
      }
    },
    noteOff(key) {
      const f = held.get(key);
      if (f !== undefined) {
        n.pad.triggerRelease(f);
        held.delete(key);
      }
    },
  };
  return api;
}
