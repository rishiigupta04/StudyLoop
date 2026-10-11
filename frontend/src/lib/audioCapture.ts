/**
 * Push-to-talk audio capture for hosted speech-to-text (roadmap D14). Records Opus/WebM with
 * MediaRecorder while ~ is held. The browser's SpeechRecognition runs alongside for live captions.
 *
 * Opening the mic takes ~50–300 ms, which would clip the first word of every command, so the stream
 * stays open between presses and is released after IDLE_RELEASE_MS without use (the browser's mic
 * indicator goes off then).
 *
 * The first press of all can sit on the browser's permission prompt for as long as the user takes. A
 * start that is still waiting when the key is released (or the turn is aborted) is cancelled through
 * `startSeq`, so the recorder never starts after the fact and the mic does not stay hot.
 */

const IDLE_RELEASE_MS = 90_000;
const MAX_RECORD_MS = 40_000; // safety net: a recorder nobody stopped is cut and discarded
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

let stream: MediaStream | null = null;
let opening: Promise<MediaStream | null> | null = null;
let openingSince = 0;
let releaseTimer: number | undefined;
let maxTimer: number | undefined;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
/** bumped by every start / stop / abort: a start whose number is no longer current must not record */
let startSeq = 0;

/** Why the mic could not be opened (last attempt), for a plain message in the UI. */
export type CaptureProblem = 'denied' | 'no-mic' | 'busy' | 'error';
let problem: CaptureProblem | null = null;

let permissionState: PermissionState | 'unknown' = 'unknown';
let permissionWatched = false;

export function captureSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
}

/** The reason the last attempt to open the mic failed, or null (it opened, or was not tried). */
export function captureProblem(): CaptureProblem | null {
  return problem;
}

/**
 * True while a start is waiting on the browser's microphone permission prompt. Uses the Permissions API
 * where the browser knows 'microphone' (Chrome); elsewhere an open that has taken a while counts as a prompt.
 */
export function micPromptPending(): boolean {
  if (!opening) return false;
  if (permissionState === 'prompt') return true;
  if (permissionState === 'granted') return false;
  return performance.now() - openingSince > 600;
}

function watchPermission(): void {
  if (permissionWatched) return;
  permissionWatched = true;
  try {
    void navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((status) => {
        permissionState = status.state;
        status.onchange = () => {
          permissionState = status.state;
        };
      })
      .catch(() => undefined); // Firefox / Safari don't know 'microphone': stays 'unknown'
  } catch {
    /* no Permissions API */
  }
}

function classify(err: unknown): CaptureProblem {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no-mic';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'error';
}

function mimeType(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

async function openStream(): Promise<MediaStream | null> {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
  if (!opening) {
    openingSince = performance.now();
    opening = navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((s) => {
        problem = null;
        return (stream = s);
      })
      .catch((err) => {
        problem = classify(err); // denied / no mic / in use: the caller says so in plain words
        return null;
      })
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

/** Start recording (no-op if unsupported or the mic is unavailable). Resolves false if it did not start. */
export async function startCapture(): Promise<boolean> {
  if (!captureSupported()) return false;
  window.clearTimeout(releaseTimer);
  watchPermission();
  const seq = ++startSeq;
  const s = await openStream();
  if (seq !== startSeq) {
    // released or aborted while the permission prompt / mic open was pending: don't record afterwards
    scheduleRelease();
    return false;
  }
  if (!s) return false;
  if (recorder?.state === 'recording') recorder.stop();
  chunks = [];
  const type = mimeType();
  const rec = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  recorder = rec;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  startedAt = performance.now();
  window.clearTimeout(maxTimer);
  maxTimer = window.setTimeout(() => {
    if (recorder !== rec || rec.state !== 'recording') return;
    recorder = null;
    rec.onstop = null;
    rec.stop();
    chunks = [];
  }, MAX_RECORD_MS);
  return true;
}

export interface Capture {
  blob: Blob;
  durationMs: number;
}

/**
 * Stop and return the recording, or null if nothing was being recorded. A start that is still waiting
 * for the mic is cancelled here (null): the key is already up, recording after the grant would be wrong.
 */
export function stopCapture(): Promise<Capture | null> {
  const rec = recorder;
  recorder = null;
  startSeq += 1;
  window.clearTimeout(maxTimer);
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

/** Abort without returning audio (modal closed, barge-in, window lost focus). Also cancels a pending start. */
export function abortCapture(): void {
  const rec = recorder;
  recorder = null;
  startSeq += 1;
  window.clearTimeout(maxTimer);
  if (rec?.state === 'recording') {
    rec.onstop = null;
    rec.stop();
  }
  chunks = [];
  scheduleRelease();
}
