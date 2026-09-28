/**
 * Push-to-talk audio as 16 kHz mono WAV, for `POST /api/stt`.
 *
 * MediaRecorder gives us WebM/Opus, which is the right thing to *store* — but Sarvam Saaras, the
 * code-mix model the bilingual path is built around, rejects it outright ("Invalid file type:
 * audio/webm;codecs=opus. Only ['audio/mpeg', …, 'audio/wav', …]"). Until this existed, every turn
 * silently fell through to the Groq fallback and Saaras had never once run.
 *
 * Decoding is Web Audio (which reads Opus natively), so there is no dependency and no transcode on the
 * server. 16 kHz mono is what both providers resample to anyway, and it keeps a 3 s clip near 96 kB.
 */

const TARGET_RATE = 16_000;

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === 'closed') ctx = new Ctor();
  return ctx;
}

/** Average the channels, then take every nth sample (the source is speech on a phone mic, not music). */
function toMono16k(buffer: AudioBuffer): Float32Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const ratio = buffer.sampleRate / TARGET_RATE;
  const length = Math.max(1, Math.floor(buffer.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const at = Math.min(buffer.length - 1, Math.round(i * ratio));
    let sum = 0;
    for (const ch of channels) sum += ch[at];
    out[i] = sum / channels.length;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Blob {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Convert recorded audio to 16 kHz mono WAV, or null if this browser can't decode it — the caller
 * then posts the original, which the Groq fallback accepts.
 */
export async function toWav16k(blob: Blob): Promise<Blob | null> {
  const audio = context();
  if (!audio) return null;
  try {
    const decoded = await audio.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length) return null;
    return encodeWav(toMono16k(decoded));
  } catch {
    return null; // unsupported container, or a truncated recording
  }
}
