import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IN_PROGRESS_STATUSES,
  fetchVideoTranscript,
  requestIngest,
  type TranscriptFailReason,
  type TranscriptSegment,
  type TranscriptSource,
  type VideoStatus,
  type VideoStatusInfo,
} from '@/services/transcriptService';

export interface VideoTranscriptState {
  status: VideoStatus;
  hasTranscript: boolean;
  failReason: TranscriptFailReason | null;
  retryable: boolean;
  segments: TranscriptSegment[];
  source: TranscriptSource | null;
  loading: boolean;
  retrying: boolean;
  retry: () => Promise<void>;
}

interface StatusView {
  status: VideoStatus;
  hasTranscript: boolean;
  failReason: TranscriptFailReason | null;
  retryable: boolean;
}

const POLL_MS = 5000;

/**
 * The video's transcript + ingestion status (Tier 1a). The first GET also starts ingestion on the
 * server. Status then streams in over the session socket (`pushed`); if the socket is down, it polls.
 * Segments are (re)loaded once the server says a transcript exists.
 */
export function useVideoTranscript(
  videoId: string,
  pushed: VideoStatusInfo | null,
  socketOpen: boolean
): VideoTranscriptState {
  const [view, setView] = useState<StatusView>({ status: 'pending', hasTranscript: false, failReason: null, retryable: false });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [source, setSource] = useState<TranscriptSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const aliveRef = useRef(videoId);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  segmentsRef.current = segments;

  const load = useCallback(async () => {
    const r = await fetchVideoTranscript(videoId);
    if (aliveRef.current !== videoId) return; // user switched videos meanwhile
    setView({ status: r.status, hasTranscript: r.hasTranscript, failReason: r.failReason ?? null, retryable: Boolean(r.retryable) });
    if (r.transcript.length) setSegments(r.transcript);
    setSource(r.source);
    setLoading(false);
  }, [videoId]);

  // new video: reset and load (this GET also kicks off server-side ingestion)
  useEffect(() => {
    aliveRef.current = videoId;
    setSegments([]);
    setSource(null);
    setLoading(true);
    setView({ status: 'pending', hasTranscript: false, failReason: null, retryable: false });
    void load();
  }, [videoId, load]);

  // pushed status wins as the newest word; fetch segments the moment a transcript exists
  useEffect(() => {
    if (!pushed || pushed.video_id !== videoId) return;
    setView({
      status: pushed.status,
      hasTranscript: pushed.has_transcript,
      failReason: pushed.fail_reason,
      retryable: pushed.retryable,
    });
    if (pushed.source) setSource(pushed.source);
    if (pushed.has_transcript && segmentsRef.current.length === 0) void load();
  }, [pushed, videoId, load]);

  // socket down (e.g. waking backend) while ingesting: fall back to polling
  const inProgress = IN_PROGRESS_STATUSES.includes(view.status);
  useEffect(() => {
    if (socketOpen || !inProgress) return;
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [socketOpen, inProgress, load]);

  const retry = useCallback(async () => {
    setRetrying(true);
    const s = await requestIngest(videoId, true);
    if (s && aliveRef.current === videoId) {
      setView({ status: s.status, hasTranscript: s.has_transcript, failReason: s.fail_reason, retryable: s.retryable });
    } else if (!s) {
      await load(); // backend unreachable: refresh the explained failure
    }
    setRetrying(false);
  }, [videoId, load]);

  return { ...view, segments, source, loading, retrying, retry };
}
