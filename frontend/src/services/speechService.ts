/**
 * Hosted speech (roadmap D14): `/api/stt` (Sarvam Saaras → Groq Whisper) and `/api/tts` (Sarvam Bulbul).
 * Each returns null when the server has no provider (503) or fails, so callers keep the browser's own
 * SpeechRecognition / speechSynthesis. A 503 is remembered for the page's life (no retry per sentence).
 */

import { API_URL, getAccessToken } from './apiClient';

export interface SttResult {
  text: string;
  provider: string;
  ms: number;
  language: string | null;
}

const STT_TIMEOUT_MS = 7000;
let sttUnavailable = false;
let ttsUnavailable = false;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function hostedSttAvailable(): boolean {
  return !sttUnavailable;
}

export async function transcribeAudio(blob: Blob, language: 'en' | 'hi'): Promise<SttResult | null> {
  if (sttUnavailable) return null;
  const form = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('file', blob, `speech.${ext}`);
  form.append('language', language);
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

/** One sentence as MP3, or null (not configured / failed → speak it with the browser voice). */
export async function synthesize(text: string, language: 'en' | 'hi', signal?: AbortSignal): Promise<Blob | null> {
  if (ttsUnavailable) return null;
  try {
    const res = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ text, language }),
      signal,
    });
    if (res.status === 503) {
      ttsUnavailable = true;
      return null;
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}
