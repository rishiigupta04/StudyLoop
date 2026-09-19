import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchVideoStatus,
  requestOutline,
  type Outline,
  type OutlineStatus,
  type VideoStatusInfo,
} from '@/services/transcriptService';

export interface VideoOutlineState {
  /** null = not generated (yet): waiting on the transcript, or no AI service on the server */
  status: OutlineStatus | null;
  outline: Outline | null;
  /** the first status request hasn't answered yet */
  loading: boolean;
  /** true while a Generate / Retry request is in flight */
  requesting: boolean;
  generate: (retry?: boolean) => Promise<void>;
}

const POLL_MS = 8000;

/**
 * Chapters + structured summary for this video (Tier 2). The first `GET /api/videos/{id}` also starts
 * the server-side backfill for a video ingested before outlines existed. Updates then arrive with
 * `video.status` over the session socket; with the socket down, it polls while generating.
 * Only data for the current `videoId` is ever kept (switching videos clears it at once).
 */
export function useVideoOutline(videoId: string, pushed: VideoStatusInfo | null, socketOpen: boolean): VideoOutlineState {
  const [status, setStatus] = useState<OutlineStatus | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const aliveRef = useRef(videoId);

  const apply = useCallback(
    (s: VideoStatusInfo | null) => {
      if (!s || s.video_id !== videoId || aliveRef.current !== videoId) return; // never another video's data
      setStatus(s.outline_status ?? null);
      setOutline(s.outline_status === 'ready' ? (s.outline ?? null) : null);
    },
    [videoId]
  );

  const load = useCallback(async () => {
    const s = await fetchVideoStatus(videoId);
    apply(s);
    if (aliveRef.current === videoId) setLoading(false);
  }, [videoId, apply]);

  useEffect(() => {
    aliveRef.current = videoId;
    setStatus(null);
    setOutline(null);
    setLoading(true);
    void load();
  }, [videoId, load]);

  useEffect(() => {
    // a status event without outline fields (older server) must not wipe what we have
    if (pushed && 'outline_status' in pushed) apply(pushed);
  }, [pushed, apply]);

  useEffect(() => {
    if (socketOpen || status !== 'generating') return;
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [socketOpen, status, load]);

  const generate = useCallback(
    async (retry = true) => {
      setRequesting(true);
      const s = await requestOutline(videoId, retry);
      apply(s);
      if (aliveRef.current === videoId) setRequesting(false);
    },
    [videoId, apply]
  );

  return { status, outline, loading, requesting, generate };
}
