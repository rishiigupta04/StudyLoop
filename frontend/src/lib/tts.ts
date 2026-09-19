/**
 * Browser SpeechSynthesis with the async voice-list gotcha handled (project gotchas §6).
 * Tier 1b: `createSpeechStream` speaks a streamed answer sentence by sentence (roadmap D8), so the
 * first words play ~1 s after the question instead of after the whole answer.
 * Tier 1d adds the Hindi-voice fallback notice + hosted TTS option.
 */

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const now = window.speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    window.setTimeout(done, 1500); // some browsers never fire voiceschanged
  });
  return voicesReady;
}

export async function hasVoiceFor(lang: 'en' | 'hi'): Promise<boolean> {
  const voices = await loadVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith(lang));
}

/** Citations like [12:30] are for the screen (seek chips), not for the ear. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\s*[[【]\d{1,2}:\d{2}(?::\d{2})?[\]】]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function makeUtterance(text: string, lang: 'en' | 'hi'): Promise<SpeechSynthesisUtterance> {
  const voices = await loadVoices();
  const want = lang === 'hi' ? ['hi-in', 'hi'] : ['en-in', 'en-gb', 'en-us', 'en'];
  const voice = want.map((w) => voices.find((v) => v.lang.toLowerCase().startsWith(w))).find(Boolean);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  if (voice) u.voice = voice;
  return u;
}

export async function speak(text: string, lang: 'en' | 'hi'): Promise<void> {
  if (!('speechSynthesis' in window)) return;
  const clean = stripForSpeech(text);
  if (!clean) return;
  const u = await makeUtterance(clean, lang);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// a sentence ends at . ! ? or the Devanagari danda, followed by whitespace (so "1.5" and "e.g" don't split)
const SENTENCE_END = /[.!?।॥](?=\s)/;

export interface SpeechStream {
  /** Feed streamed answer text; complete sentences are spoken as soon as they close. */
  push: (delta: string) => void;
  /** No more text: speak the remainder. `onIdle` fires once everything has been spoken. */
  end: () => void;
  cancel: () => void;
}

export function createSpeechStream(lang: 'en' | 'hi', onIdle?: () => void): SpeechStream {
  const supported = 'speechSynthesis' in window;
  let buffer = '';
  let queued = 0;
  let ended = false;
  let cancelled = false;
  let idleFired = false;
  let chain: Promise<void> = Promise.resolve(); // keeps sentence order while voices load

  const maybeIdle = () => {
    if (ended && queued === 0 && !idleFired) {
      idleFired = true;
      onIdle?.();
    }
  };

  const say = (sentence: string) => {
    const clean = stripForSpeech(sentence);
    if (!supported || !clean || cancelled) return;
    queued += 1;
    chain = chain.then(async () => {
      if (cancelled) {
        queued -= 1;
        return;
      }
      const u = await makeUtterance(clean, lang);
      u.onend = u.onerror = () => {
        queued -= 1;
        maybeIdle();
      };
      window.speechSynthesis.speak(u); // queues natively behind earlier sentences
    });
  };

  return {
    push(delta) {
      if (cancelled) return;
      buffer += delta;
      for (let m = SENTENCE_END.exec(buffer); m; m = SENTENCE_END.exec(buffer)) {
        say(buffer.slice(0, m.index + 1));
        buffer = buffer.slice(m.index + 1);
      }
    },
    end() {
      if (!ended && buffer.trim()) say(buffer);
      buffer = '';
      ended = true;
      void chain.then(maybeIdle);
    },
    cancel() {
      cancelled = true;
      buffer = '';
      queued = 0;
      stopSpeaking();
    },
  };
}
