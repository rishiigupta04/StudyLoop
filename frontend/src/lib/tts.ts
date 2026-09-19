/**
 * Browser SpeechSynthesis with the async voice-list gotcha handled (project gotchas §6).
 * Tier 1d adds the Hindi-voice fallback notice + hosted TTS option; this is the minimal version.
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

export async function speak(text: string, lang: 'en' | 'hi'): Promise<void> {
  if (!('speechSynthesis' in window) || !text) return;
  const voices = await loadVoices();
  const want = lang === 'hi' ? ['hi-in', 'hi'] : ['en-in', 'en-gb', 'en-us', 'en'];
  const voice = want.map((w) => voices.find((v) => v.lang.toLowerCase().startsWith(w))).find(Boolean);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  if (voice) u.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
