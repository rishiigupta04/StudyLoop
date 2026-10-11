/**
 * Hosted speech (roadmap D14): `/api/stt` (Sarvam Saaras → Groq Whisper) and `/api/tts` (Sarvam Bulbul).
 * Each returns null when the server has no provider (503) or fails, so callers keep the browser's own
 * SpeechRecognition / speechSynthesis. A 503 is remembered for the page's life (no retry per sentence).
 */

import { toWav16k } from '@/lib/wav';
import { API_URL, getAccessToken } from './apiClient';

export interface SttResult {
  text: string;
  provider: string;
  ms: number;
  language: string | null;
}

// Timeouts nest: the server gives each STT provider 4 s (Sarvam, then Groq), so the browser waits 10 s for
// the pair; a sentence of TTS that takes longer than 6 s is spoken by the browser voice instead.
const STT_TIMEOUT_MS = 10_000;
const TTS_TIMEOUT_MS = 6_000;
let sttUnavailable = false;
let ttsUnavailable = false;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function hostedSttAvailable(): boolean {
  return !sttUnavailable;
}

/**
 * Which hosted STT serves push-to-talk — the Sarvam | Groq switch in the study page's top bar.
 * Sarvam Saaras is the Indian code-mix model and spends Sarvam credit on every turn; Groq Whisper is
 * the free fallback. The server tries the chosen one first and keeps the other behind it, and
 * `STT_PROVIDERS` still decides what is allowed at all. Read on every call, so a flip applies to the
 * very next turn (the Collect page follows it too).
 */
export type SttProvider = 'sarvam' | 'groq';
const STT_KEY = 'studyloop.stt';

let sttProvider: SttProvider = (() => {
  try {
    return localStorage.getItem(STT_KEY) === 'groq' ? 'groq' : 'sarvam';
  } catch {
    return 'sarvam';
  }
})();

export function getSttProvider(): SttProvider {
  return sttProvider;
}

export function setSttProvider(provider: SttProvider): void {
  sttProvider = provider;
  try {
    localStorage.setItem(STT_KEY, provider);
  } catch {
    /* private mode: the choice holds for this tab */
  }
}

export async function transcribeAudio(blob: Blob, language: 'en' | 'hi'): Promise<SttResult | null> {
  if (sttUnavailable) return null;
  // Sarvam Saaras (the code-mix model) refuses WebM/Opus, so send WAV and keep Opus for storage.
  // If this browser can't decode it, post the original: the Groq fallback takes WebM.
  const upload = (await toWav16k(blob)) ?? blob;
  const form = new FormData();
  const ext = upload.type.includes('wav') ? 'wav' : upload.type.includes('ogg') ? 'ogg' : upload.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('file', upload, `speech.${ext}`);
  form.append('language', language);
  form.append('prefer', sttProvider);
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), STT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/stt`, { method: 'POST', body: form, headers: await authHeaders(), signal: ctl.signal });
    if (res.status === 503) {
      sttUnavailable = true;
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as SttResult;
  } catch {
    return null; // timeout / offline: the browser transcript is used
  } finally {
    window.clearTimeout(timer);
  }
}

export function hostedTtsAvailable(): boolean {
  return !ttsUnavailable;
}

/**
 * One sentence as MP3, or null (not configured / failed / slower than TTS_TIMEOUT_MS → speak it with the
 * browser voice). A hung request must not block the sentence queue behind it.
 */
export async function synthesize(text: string, language: 'en' | 'hi', signal?: AbortSignal): Promise<Blob | null> {
  if (ttsUnavailable) return null;
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TTS_TIMEOUT_MS);
  const onCallerAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort();
  else signal?.addEventListener('abort', onCallerAbort, { once: true });
  try {
    const res = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ text, language }),
      signal: ctl.signal,
    });
    if (res.status === 503) {
      ttsUnavailable = true;
      return null;
    }
    if (!res.ok) return null;
    const blob = await res.blob(); // inside the try: the timeout covers the body download too
    return blob.size ? blob : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
