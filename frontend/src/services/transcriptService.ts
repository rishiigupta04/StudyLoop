/**
 * Transcript service — calls the StudyLoop backend, which proxies TranscriptAPI server-side.
 * TranscriptAPI works even for captions-disabled videos, so a missing transcript is an explained
 * failure (`failReason`), never a silent fallback to fake content (roadmap D10b).
 */

import { apiGet } from './apiClient';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
  timestamp: string; // Formatted HH:MM:SS or MM:SS
}

export interface VideoMetadata {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

export type TranscriptFailReason =
  | 'invalid_video'
  | 'unavailable'
  | 'no_speech'
  | 'rate_limited'
  | 'credits_exhausted'
  | 'no_plan'
  | 'provider_auth'
  | 'provider_error'
  | 'timeout'
  | 'not_configured'
  | 'backend_unreachable';

export type TranscriptSource = 'creator' | 'youtube_asr' | 'api_generated';

export interface TranscriptResponse {
  video_id: string;
  hasTranscript: boolean;
  language: string | null;
  source: TranscriptSource | null;
  transcript: TranscriptSegment[];
  metadata?: VideoMetadata | null;
  length_seconds?: number | null;
  isHinglish?: boolean;
  failReason?: TranscriptFailReason | null;
  retryable?: boolean;
}

interface BackendTranscript {
  video_id: string;
  has_transcript: boolean;
  language: string | null;
  source: TranscriptSource | null;
  segments: { text: string; start: number; duration: number }[];
  metadata: VideoMetadata | null;
  length_seconds: number | null;
  fail_reason: TranscriptFailReason | null;
  retryable: boolean;
}

/** User-facing copy for each failure. Playback-only mode stays available in every case. */
export const TRANSCRIPT_FAIL_MESSAGES: Record<TranscriptFailReason, { en: string; hi: string }> = {
  invalid_video: { en: "That doesn't look like a YouTube video link.", hi: 'यह YouTube वीडियो का लिंक नहीं लग रहा।' },
  unavailable: {
    en: 'This video is private, live, removed or restricted — voice playback still works, but Q&A and smart seek are off.',
    hi: 'यह वीडियो private, live या restricted है — voice से playback चलेगा, पर Q&A और smart seek बंद हैं।',
  },
  no_speech: { en: 'No speech found in this video, so Q&A is off.', hi: 'इस वीडियो में बोली गई बात नहीं मिली, इसलिए Q&A बंद है।' },
  rate_limited: { en: 'Transcript service is busy — retry in a moment.', hi: 'Transcript service busy है — थोड़ी देर में retry करें।' },
  credits_exhausted: { en: 'Transcript credits are used up.', hi: 'Transcript credits खत्म हो गए हैं।' },
  no_plan: { en: 'Transcript service needs an active plan on the server.', hi: 'Server पर transcript service का plan active नहीं है।' },
  provider_auth: { en: 'Transcript service is misconfigured.', hi: 'Transcript service की setting गलत है।' },
  provider_error: { en: 'Transcript service had an error — retry.', hi: 'Transcript service में error आया — retry करें।' },
  timeout: { en: 'Transcribing took too long — retry.', hi: 'Transcript बनने में ज़्यादा समय लगा — retry करें।' },
  not_configured: { en: 'Transcript service is not configured on the server.', hi: 'Server पर transcript service set नहीं है।' },
  backend_unreachable: { en: "Can't reach the StudyLoop server — retry.", hi: 'StudyLoop server से connect नहीं हो पा रहा — retry करें।' },
};

/** Extract an 11-char YouTube video ID from any URL format (or return null). */
export function extractYouTubeId(urlOrId: string): string | null {
  const trimmed = (urlOrId || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?(?:.*&)?v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

/** Format seconds into H:MM:SS or M:SS */
export function formatSecondsToTimestamp(totalSecs: number): string {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = Math.floor(totalSecs % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/**
 * Fetch a video's transcript via the backend. Never throws: failures come back as
 * `hasTranscript: false` + `failReason` so the UI can drop into playback-only mode with a clear message.
 */
export async function fetchVideoTranscript(videoUrlOrId: string): Promise<TranscriptResponse> {
  const videoId = extractYouTubeId(videoUrlOrId);
  const empty = (failReason: TranscriptFailReason, retryable: boolean): TranscriptResponse => ({
    video_id: videoId || videoUrlOrId,
    hasTranscript: false,
    language: null,
    source: null,
    transcript: [],
    failReason,
    retryable,
  });
  if (!videoId) return empty('invalid_video', false);

  try {
    const data = await apiGet<BackendTranscript>(`/api/videos/${videoId}/transcript`);
    return {
      video_id: data.video_id,
      hasTranscript: data.has_transcript,
      language: data.language,
      source: data.source,
      isHinglish: Boolean(data.language?.includes('hi')),
      transcript: data.segments.map((s) => ({ ...s, timestamp: formatSecondsToTimestamp(s.start) })),
      metadata: data.metadata,
      length_seconds: data.length_seconds,
      failReason: data.fail_reason,
      retryable: data.retryable,
    };
  } catch (err) {
    console.warn('[transcriptService] backend unreachable:', err);
    return empty('backend_unreachable', true);
  }
}
