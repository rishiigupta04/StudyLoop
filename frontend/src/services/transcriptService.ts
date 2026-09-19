/**
 * Transcript service — calls the StudyLoop backend, which ingests from TranscriptAPI server-side and
 * caches the result in the shared `videos` table (Tier 1a: no re-fetch = no credit).
 * TranscriptAPI works even for captions-disabled videos, so a missing transcript is an explained
 * failure (`failReason`), never a silent fallback to fake content (roadmap D10b).
 */

import { apiGet, apiPost } from './apiClient';

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
  | 'embed_error'
  | 'internal'
  | 'backend_unreachable';

/** Ingestion status machine (backend `video_repo`); progress arrives as `video.status` on the socket. */
export type VideoStatus =
  | 'pending'
  | 'fetching'
  | 'transcribing'
  | 'embedding'
  | 'ready'
  | 'unavailable'
  | 'failed';

export const IN_PROGRESS_STATUSES: VideoStatus[] = ['pending', 'fetching', 'transcribing', 'embedding'];

/** One `video.status` event / `GET /api/videos/{id}` body. */
export interface VideoStatusInfo {
  video_id: string;
  status: VideoStatus;
  has_transcript: boolean;
  fail_reason: TranscriptFailReason | null;
  retryable: boolean;
  title?: string | null;
  language?: string | null;
  source?: TranscriptSource | null;
  duration_s?: number | null;
  embed_model?: string | null;
  /** chapters + structured summary (Tier 2); null = not generated (yet) */
  outline_status?: OutlineStatus | null;
  outline?: Outline | null;
}

export type OutlineStatus = 'generating' | 'ready' | 'failed';

export interface OutlineChapter {
  start_s: number;
  end_s: number;
  title: string;
  summary: string;
}

export interface OutlineSection {
  start_s: number;
  title: string;
  bullets: string[];
}

export interface OutlinePart {
  title: string;
  start_s: number;
  end_s: number;
  sections: OutlineSection[];
}

/** One language of the outline, generated directly in that language. */
export interface OutlineDoc {
  overview: string;
  chapters: OutlineChapter[];
  parts: OutlinePart[];
}

/** Keyed by UI language; a language whose generation failed is missing. */
export type Outline = Partial<Record<'en' | 'hi', OutlineDoc>>;

export type TranscriptSource = 'creator' | 'youtube_asr' | 'api_generated';

export interface TranscriptResponse {
  video_id: string;
  status: VideoStatus;
  hasTranscript: boolean;
  language: string | null;
  source: TranscriptSource | null;
  transcript: TranscriptSegment[];
  metadata?: Partial<VideoMetadata> | null;
  length_seconds?: number | null;
  isHinglish?: boolean;
  failReason?: TranscriptFailReason | null;
  retryable?: boolean;
}

interface BackendTranscript {
  video_id: string;
  status: VideoStatus;
  has_transcript: boolean;
  language: string | null;
  source: TranscriptSource | null;
  segments: { text: string; start: number; duration: number }[];
  metadata: Partial<VideoMetadata> | null;
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
  embed_error: {
    en: 'The transcript loaded, but indexing it for search failed — retry.',
    hi: 'Transcript आ गया, पर search के लिए index नहीं हो पाया — retry करें।',
  },
  internal: { en: 'Something went wrong while preparing the transcript — retry.', hi: 'Transcript तैयार करते समय गड़बड़ हुई — retry करें।' },
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
    status: failReason === 'invalid_video' ? 'unavailable' : 'failed',
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
      status: data.status,
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

/** `GET /api/videos/{id}`: status + outline. Also starts ingestion / the outline backfill. Null if offline. */
export async function fetchVideoStatus(videoId: string): Promise<VideoStatusInfo | null> {
  try {
    return await apiGet<VideoStatusInfo>(`/api/videos/${videoId}`);
  } catch (err) {
    console.warn('[transcriptService] status request failed:', err);
    return null;
  }
}

/** Start chapters + summary for a ready video; `retry` skips the failed-run cooldown. Null if offline. */
export async function requestOutline(videoId: string, retry = false): Promise<VideoStatusInfo | null> {
  try {
    return await apiPost<VideoStatusInfo>(`/api/videos/${videoId}/outline`, { retry });
  } catch (err) {
    console.warn('[transcriptService] outline request failed:', err);
    return null;
  }
}

/**
 * Start (or join) server-side ingestion. `retry` skips the failed-ingest cooldown (the Retry button).
 * Progress streams over the session socket as `video.status`; this only returns the current status.
 */
export async function requestIngest(videoId: string, retry = false): Promise<VideoStatusInfo | null> {
  try {
    return await apiPost<VideoStatusInfo>('/api/videos', { video: videoId, retry });
  } catch (err) {
    console.warn('[transcriptService] ingest request failed:', err);
    return null;
  }
}
