/**
 * Player action contract — the JSON the backend's `action_executor` emits (and, from Tier 1c, the
 * ONNX classifier path too). One dispatcher maps it onto the YouTube IFrame API.
 */

/** Playback state to set after a seek: "go back 10 seconds and play", "pause and go back". */
export type Then = 'PLAY' | 'PAUSE';

export type PlayerAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK_TO'; seconds: number; then?: Then }
  | { type: 'SEEK_RELATIVE'; delta_s: number; then?: Then }
  /** fraction of the duration ("the middle" = 0.5, "75 percent"); offset_s shifts it ("the end" = 1, -30) */
  | { type: 'SEEK_FRACTION'; fraction: number; offset_s?: number; then?: Then }
  /** undo the last voice jump ("go back to where I was", "wapas wahin jao") */
  | { type: 'SEEK_PREVIOUS'; then?: Then }
  | { type: 'SET_RATE'; rate: number }
  | { type: 'RATE_STEP'; delta: number }
  | { type: 'MUTE' }
  | { type: 'UNMUTE' }
  | { type: 'VOLUME_STEP'; delta: number }
  | { type: 'VOLUME_SET'; level: number }
  | { type: 'STOP_SPEAKING' };

export interface PlayerControls {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setRate(rate: number): void;
  getRate(): number;
  mute(): void;
  unmute(): void;
  setVolume(v: number): void;
  getVolume(): number;
}

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Snap to a rate YouTube actually supports (it silently ignores others). */
export function nearestRate(rate: number): number {
  return PLAYBACK_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), 1);
}

/** Where the player was before the last voice seek — what "undo" returns to. One per page (one player). */
let positionBeforeLastSeek: number | null = null;

/** Seek within the video, remembering where we came from so a misheard jump can be undone hands-free. */
function seekRemembering(p: PlayerControls, target: number): void {
  const d = p.getDuration();
  const from = p.getCurrentTime();
  const to = clamp(target, 0, d > 0 ? d - 1 : Math.max(target, 0));
  if (Math.abs(to - from) > 1) positionBeforeLastSeek = from;
  p.seekTo(to);
}

export function executePlayerAction(p: PlayerControls, a: PlayerAction): void {
  switch (a.type) {
    case 'PLAY':
      return p.play();
    case 'PAUSE':
      return p.pause();
    case 'SEEK_TO':
      seekRemembering(p, a.seconds);
      break;
    case 'SEEK_RELATIVE':
      // applied to the LIVE time, not the time the server saw — avoids drift from network latency
      seekRemembering(p, p.getCurrentTime() + a.delta_s);
      break;
    case 'SEEK_FRACTION': {
      const d = p.getDuration();
      if (d > 0) seekRemembering(p, d * clamp(a.fraction, 0, 1) + (a.offset_s ?? 0));
      break;
    }
    case 'SEEK_PREVIOUS':
      // saying "undo" twice toggles back (seekRemembering stores where we are now)
      if (positionBeforeLastSeek !== null) seekRemembering(p, positionBeforeLastSeek);
      break;
    case 'SET_RATE':
      return p.setRate(nearestRate(a.rate));
    case 'RATE_STEP':
      return p.setRate(nearestRate(clamp(p.getRate() + a.delta, 0.25, 2)));
    case 'MUTE':
      return p.mute();
    case 'UNMUTE':
      return p.unmute();
    case 'VOLUME_STEP':
      p.unmute();
      return p.setVolume(clamp(p.getVolume() + a.delta, 0, 100));
    case 'VOLUME_SET':
      p.unmute();
      return p.setVolume(clamp(a.level, 0, 100));
    case 'STOP_SPEAKING':
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      return;
  }
  if ('then' in a && a.then === 'PLAY') p.play();
  else if ('then' in a && a.then === 'PAUSE') p.pause();
}

/** New video → nothing to undo (a position in the previous lecture means nothing here). */
export function resetSeekHistory(): void {
  positionBeforeLastSeek = null;
}
