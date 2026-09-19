/* Minimal typings for browser APIs not in lib.dom: YouTube IFrame API + Web Speech recognition. */

declare namespace YT {
  const PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
  interface PlayerEvent {
    target: Player;
    data: number;
  }
  interface PlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: PlayerEvent) => void;
      onPlaybackRateChange?: (e: PlayerEvent) => void;
      onError?: (e: PlayerEvent) => void;
    };
  }
  class Player {
    constructor(el: HTMLElement | string, opts: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    setPlaybackRate(rate: number): void;
    getPlaybackRate(): number;
    getAvailablePlaybackRates(): number[];
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setVolume(v: number): void;
    getVolume(): number;
    loadVideoById(id: string, startSeconds?: number): void;
    cueVideoById(id: string, startSeconds?: number): void;
    getVideoData(): { title?: string; author?: string; video_id?: string };
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
