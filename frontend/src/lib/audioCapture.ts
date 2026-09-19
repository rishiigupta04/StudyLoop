/**
 * Push-to-talk audio capture for hosted speech-to-text (roadmap D14). Records Opus/WebM with
 * MediaRecorder while ~ is held. The browser's SpeechRecognition runs alongside for live captions.
 *
 * Opening the mic takes ~50–300 ms, which would clip the first word of every command, so the stream
 * stays open between presses and is released after IDLE_RELEASE_MS without use (the browser's mic
 * indicator goes off then).
 */

const IDLE_RELEASE_MS = 90_000;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

let stream: MediaStream | null = null;
let opening: Promise<MediaStream | null> | null = null;
let releaseTimer: number | undefined;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;

export function captureSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
}

function mimeType(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

async function openStream(): Promise<MediaStream | null> {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
  if (!opening) {
    opening = navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((s) => (stream = s))
      .catch(() => null) // denied / no mic: the browser ASR path reports the error
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

function scheduleRelease(): void {
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    if (recorder?.state === 'recording') return scheduleRelease();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }, IDLE_RELEASE_MS);
}

/** Start recording (no-op if unsupported or the mic is unavailable). */
export async function startCapture(): Promise<boolean> {
  if (!captureSupported()) return false;
  window.clearTimeout(releaseTimer);
  const s = await openStream();
  if (!s) return false;
  if (recorder?.state === 'recording') recorder.stop();
  chunks = [];
  const type = mimeType();
  recorder = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  startedAt = performance.now();
  return true;
}

export interface Capture {
  blob: Blob;
  durationMs: number;
}

/** Stop and return the recording, or null if nothing was being recorded. */
export function stopCapture(): Promise<Capture | null> {
  const rec = recorder;
  recorder = null;
  scheduleRelease();
  if (!rec || rec.state !== 'recording') return Promise.resolve(null);
  return new Promise((resolve) => {
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      chunks = [];
      resolve(blob.size ? { blob, durationMs: performance.now() - startedAt } : null);
    };
    rec.stop();
  });
}

/** Abort without returning audio (modal closed, barge-in). */
export function abortCapture(): void {
  const rec = recorder;
  recorder = null;
  if (rec?.state === 'recording') {
    rec.onstop = null;
    rec.stop();
  }
  chunks = [];
  scheduleRelease();
}
