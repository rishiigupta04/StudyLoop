/**
 * Spoken answers.
 * - Hosted voice (roadmap D14): each sentence is fetched as MP3 from `/api/tts` (Sarvam Bulbul — Indian
 *   voices that read Hindi, English and Hinglish naturally) as soon as it closes, and played in order.
 * - Browser SpeechSynthesis fallback (no key on the server, or a sentence fails), with the async
 *   voice-list gotcha handled.
 * `createSpeechStream` speaks a streamed answer sentence by sentence (D8), so the first words play about
 * a second after the question instead of after the whole answer.
 */

import { hostedTtsAvailable, synthesize } from '@/services/speechService';

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
const active = new Set<{ cancel: () => void }>(); // for stopSpeaking(): every live stream

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

/** Speak one piece of text (hosted voice if available). */
export function speak(text: string, lang: 'en' | 'hi'): void {
  stopSpeaking();
  const s = createSpeechStream(lang);
  s.push(text);
  s.end();
}

export function stopSpeaking(): void {
  active.forEach((s) => s.cancel());
  active.clear();
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

interface Item {
  text: string;
  audio: Promise<Blob | null> | null; // null = browser voice
  abort?: AbortController;
}

export function createSpeechStream(lang: 'en' | 'hi', onIdle?: () => void): SpeechStream {
  const browserOk = 'speechSynthesis' in window;
  const queue: Item[] = [];
  let buffer = '';
  let ended = false;
  let cancelled = false;
  let playing = false;
  let idleFired = false;
  let current: HTMLAudioElement | null = null;

  const maybeIdle = () => {
    if (ended && !playing && queue.length === 0 && !idleFired) {
      idleFired = true;
      active.delete(handle);
      onIdle?.();
    }
  };

  const next = () => {
    playing = false;
    current = null;
    void pump();
  };

  const speakWithBrowser = async (text: string) => {
    if (!browserOk) return next();
    const u = await makeUtterance(text, lang);
    if (cancelled) return;
    u.onend = u.onerror = () => next();
    window.speechSynthesis.speak(u);
  };

  const pump = async () => {
    if (playing || cancelled) return;
    const item = queue.shift();
    if (!item) return maybeIdle();
    playing = true;
    const blob = item.audio ? await item.audio : null;
    if (cancelled) return;
    if (!blob) return speakWithBrowser(item.text); // no hosted voice for this one
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    current = el;
    el.onended = el.onerror = () => {
      URL.revokeObjectURL(url);
      next();
    };
    el.play().catch(() => {
      URL.revokeObjectURL(url);
      void speakWithBrowser(item.text); // autoplay blocked or bad audio: say it anyway
    });
  };

  const say = (sentence: string) => {
    const text = stripForSpeech(sentence);
    if (!text || cancelled) return;
    const item: Item = { text, audio: null };
    if (hostedTtsAvailable()) {
      item.abort = new AbortController();
      item.audio = synthesize(text, lang, item.abort.signal); // prefetch now; plays in order
    }
    queue.push(item);
    void pump();
  };

  const handle = {
    cancel() {
      cancelled = true;
      buffer = '';
      queue.splice(0).forEach((i) => i.abort?.abort());
      current?.pause();
      current = null;
      if (browserOk) window.speechSynthesis.cancel();
      active.delete(handle);
    },
  };
  active.add(handle);

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
      maybeIdle();
    },
    cancel: handle.cancel,
  };
}
