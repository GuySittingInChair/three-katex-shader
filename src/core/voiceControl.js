// Voice commands for the current sketch's params. Two independent halves:
// parseVoiceCommand() is a pure function (transcript + params schema/values
// in, an action out) so the matching logic is testable without a browser;
// createVoiceControl() is the thin Web Speech API wrapper that feeds it.

const RESET_WORDS = ['reset', 'default', 'defaults', 'restart'];
const CHAOS_WORDS = ['chaos', 'crazy', 'wild', 'nuts', 'insane', 'chaotic'];
const CALM_WORDS = ['calm', 'chill', 'settle', 'quiet', 'peaceful', 'gentle'];
const DOWN_WORDS = ['less', 'decrease', 'lower', 'slower', 'down', 'reduce', 'drop'];
const MAX_WORDS = ['max', 'maximum', 'full', 'highest'];
const MIN_WORDS = ['min', 'minimum', 'zero', 'lowest', 'none'];

function humanizeKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

function containsWord(text, words) {
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(text));
}

// Given what was heard plus the current sketch's params (schema for
// min/max, live values as the baseline to nudge from), returns one of:
//   { type: 'set', key, value }   — set one param to an absolute value
//   { type: 'bulk', direction }   — nudge every param toward max (+1) or min (-1)
//   { type: 'reset' }             — back to this sketch's defaults
//   { type: 'unrecognized' }      — heard something, matched nothing
// or null for empty input. Every action carries `heard` (the raw transcript)
// plus { type: 'action', key } for a sketch-declared action (see
// SketchManager.getActions()/runAction()) — matched by its label, e.g.
// { transform: { label: 'Transform 10%' } } answers to "transform".
// for UI feedback.
export function parseVoiceCommand(rawTranscript, paramsSchema, paramValues, actions) {
  const text = rawTranscript.toLowerCase().trim();
  if (!text) return null;
  const heard = rawTranscript;

  if (containsWord(text, RESET_WORDS)) return { type: 'reset', heard };
  if (containsWord(text, CHAOS_WORDS)) return { type: 'bulk', direction: 1, heard };
  if (containsWord(text, CALM_WORDS)) return { type: 'bulk', direction: -1, heard };

  for (const [key, action] of Object.entries(actions || {})) {
    const phrase = (action.label || key).toLowerCase();
    if (text.includes(phrase) || text.includes(key.toLowerCase())) {
      return { type: 'action', key, heard };
    }
  }

  const keys = Object.keys(paramsSchema || {});
  // Longest spoken phrase first, so "dye diffusion" claims the match before
  // any shorter accidental substring could.
  const candidates = keys
    .map((key) => ({ key, phrase: humanizeKey(key) }))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const { key, phrase } of candidates) {
    if (!text.includes(phrase)) continue;
    const def = paramsSchema[key];
    const current = paramValues?.[key] ?? def.value;
    const span = def.max - def.min;

    const numberMatch = text.match(/-?\d+(\.\d+)?/);
    if (numberMatch && (text.includes(' to ') || text.includes(' at '))) {
      return { type: 'set', key, value: parseFloat(numberMatch[0]), heard };
    }
    if (containsWord(text, MAX_WORDS)) return { type: 'set', key, value: def.max, heard };
    if (containsWord(text, MIN_WORDS)) return { type: 'set', key, value: def.min, heard };
    if (containsWord(text, DOWN_WORDS)) return { type: 'set', key, value: current - span * 0.15, heard };
    // Just naming the param, with no direction word, defaults to a nudge
    // up — the low-friction case: shouting "gravity!" reads as "more".
    return { type: 'set', key, value: current + span * 0.15, heard };
  }

  return { type: 'unrecognized', heard };
}

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export function isVoiceSupported() {
  return Boolean(SpeechRecognitionImpl);
}

// { onResult(transcript), onInterim(transcript), onStateChange(state, detail) }
// state is one of 'listening' | 'hearing' | 'stopped' | 'error'. Returns
// null if the browser has no Web Speech API at all (Firefox, most
// non-Chromium browsers). Note: Chrome's implementation streams your audio
// to Google's servers to transcribe it — it needs real internet access,
// not just a working mic; a sandboxed/offline environment will sit there
// silently with the mic light on and never produce a result.
export function createVoiceControl({ onResult, onInterim, onStateChange } = {}) {
  if (!SpeechRecognitionImpl) return null;

  const recognition = new SpeechRecognitionImpl();
  recognition.continuous = true;
  // Interim results are what make this debuggable: without them nothing
  // appears until Chrome decides a phrase is "final" (which in continuous
  // mode can take a while, or effectively never) — so a working mic and a
  // dead one look identical. With them, partial text streams in live.
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let manuallyStopped = true;

  recognition.onspeechstart = () => onStateChange?.('hearing');
  recognition.onspeechend = () => onStateChange?.('listening');

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0]?.transcript?.trim();
    if (!transcript) return;
    if (result.isFinal) onResult?.(transcript);
    else onInterim?.(transcript);
  };

  recognition.onerror = (event) => {
    // 'no-speech' fires constantly during normal silence between commands —
    // not an error worth surfacing, just let onend's auto-restart handle it.
    if (event.error === 'no-speech') return;
    onStateChange?.('error', event.error);
  };

  // Chrome silently ends continuous recognition after a period of silence
  // or a network hiccup — restart unless the user explicitly turned it off.
  recognition.onend = () => {
    if (manuallyStopped) {
      onStateChange?.('stopped');
      return;
    }
    try {
      recognition.start();
    } catch {
      // Already starting (onend can fire again before start() lands) — ignore.
    }
  };

  return {
    start() {
      manuallyStopped = false;
      try {
        recognition.start();
        onStateChange?.('listening');
      } catch (err) {
        onStateChange?.('error', err.message);
      }
    },
    stop() {
      manuallyStopped = true;
      recognition.stop();
    },
  };
}
