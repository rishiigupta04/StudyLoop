import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerControls } from '@/lib/playerActions';

let apiPromise: Promise<void> | null = null;

/** Load https://www.youtube.com/iframe_api exactly once per page. */
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      apiPromise = null;
      reject(new Error('Failed to load the YouTube IFrame API'));
    };
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export type PlayerStatus = 'loading' | 'ready' | 'error';

export interface YouTubePlayerApi extends PlayerControls {
  status: PlayerStatus;
  error: string | null;
  playerState: number; // YT.PlayerState
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  muted: boolean;
  title: string;
  /** furthest point actually reached while playing — the anti-spoiler high-water mark (roadmap D7) */
  maxWatched: () => number;
  /** raise the high-water mark to what earlier sessions reached (library resume point, Tier 2) */
  seedMaxWatched: (s: number) => void;
  /** lower the volume while push-to-talk is held so the mic doesn't hear the lecture (roadmap D8) */
  duck: () => void;
  unduck: () => void;
}

const POLL_MS = 500;

/**
 * Real YouTube IFrame player bound to a container element.
 * Usage: const player = useYouTubePlayer(containerRef, videoId)
 */
export function useYouTubePlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  videoId: string
): YouTubePlayerApi {
  const playerRef = useRef<YT.Player | null>(null);
  const maxWatchedRef = useRef(0);
  const duckedFromRef = useRef<number | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [title, setTitle] = useState('');

  // create the player once; later videoId changes load into the same player
  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    if (!host) return;
    const mount = document.createElement('div');
    host.appendChild(mount);

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT) return;
        playerRef.current = new window.YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, origin: window.location.origin },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              setStatus('ready');
              setDuration(e.target.getDuration() || 0);
              setMuted(e.target.isMuted());
              setTitle(e.target.getVideoData()?.title || '');
            },
            onStateChange: (e) => {
              setPlayerState(e.data);
              setDuration(e.target.getDuration() || 0);
              const t = e.target.getVideoData()?.title;
              if (t) setTitle(t);
            },
            onPlaybackRateChange: (e) => setRateState(e.target.getPlaybackRate()),
            onError: (e) => {
              const codes: Record<number, string> = {
                2: 'Invalid video ID',
                5: 'This video cannot be played in an HTML5 player',
                100: 'Video not found or private',
                101: 'The owner does not allow embedding this video',
                150: 'The owner does not allow embedding this video',
              };
              setError(codes[e.data] || `YouTube player error ${e.data}`);
              setStatus('error');
            },
          },
        });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // switch video without recreating the iframe
  useEffect(() => {
    const p = playerRef.current;
    if (!p || status !== 'ready') return;
    if (p.getVideoData()?.video_id !== videoId) {
      maxWatchedRef.current = 0;
      p.cueVideoById(videoId);
    }
  }, [videoId, status]);

  // poll time (the IFrame API has no timeupdate event)
  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime() || 0;
      setCurrentTime(t);
      if (p.getPlayerState() === 1) maxWatchedRef.current = Math.max(maxWatchedRef.current, t);
      setMuted(p.isMuted());
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [status]);

  const withPlayer = useCallback(<T,>(fn: (p: YT.Player) => T, fallback: T): T => {
    const p = playerRef.current;
    if (!p || status !== 'ready') return fallback;
    try {
      return fn(p);
    } catch {
      return fallback;
    }
  }, [status]);

  const controls = useMemo<PlayerControls>(
    () => ({
      play: () => withPlayer((p) => p.playVideo(), undefined),
      pause: () => withPlayer((p) => p.pauseVideo(), undefined),
      seekTo: (s: number) =>
        withPlayer((p) => {
          p.seekTo(s, true);
          setCurrentTime(s);
        }, undefined),
      getCurrentTime: () => withPlayer((p) => p.getCurrentTime() || 0, 0),
      getDuration: () => withPlayer((p) => p.getDuration() || 0, 0),
      setRate: (r: number) =>
        withPlayer((p) => {
          p.setPlaybackRate(r);
          setRateState(r);
        }, undefined),
      getRate: () => withPlayer((p) => p.getPlaybackRate() || 1, 1),
      mute: () =>
        withPlayer((p) => {
          p.mute();
          setMuted(true);
        }, undefined),
      unmute: () =>
        withPlayer((p) => {
          p.unMute();
          setMuted(false);
        }, undefined),
      setVolume: (v: number) => withPlayer((p) => p.setVolume(v), undefined),
      getVolume: () => withPlayer((p) => p.getVolume() ?? 100, 100),
    }),
    [withPlayer]
  );

  const duck = useCallback(() => {
    withPlayer((p) => {
      if (duckedFromRef.current !== null || p.getPlayerState() !== 1 || p.isMuted()) return;
      duckedFromRef.current = p.getVolume();
      p.setVolume(Math.min(15, duckedFromRef.current));
    }, undefined);
  }, [withPlayer]);

  const unduck = useCallback(() => {
    withPlayer((p) => {
      if (duckedFromRef.current === null) return;
      p.setVolume(duckedFromRef.current);
      duckedFromRef.current = null;
    }, undefined);
  }, [withPlayer]);

  return {
    ...controls,
    status,
    error,
    playerState,
    isPlaying: playerState === 1,
    currentTime,
    duration,
    rate,
    muted,
    title,
    maxWatched: () => maxWatchedRef.current,
    seedMaxWatched: (s: number) => {
      if (Number.isFinite(s) && s > maxWatchedRef.current) maxWatchedRef.current = s;
    },
    duck,
    unduck,
  };
}
