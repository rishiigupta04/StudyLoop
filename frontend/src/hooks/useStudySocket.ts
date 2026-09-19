import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from '@/services/apiClient';
import type { PlayerAction } from '@/lib/playerActions';

export type Lang = 'en' | 'hi';
/** 'unauthorized': the server rejected our token (close 4401) — reconnecting won't help, sign in again */
export type SocketStatus = 'connecting' | 'open' | 'closed' | 'unauthorized';

interface TurnMeta {
  turn_id: string;
  intent: string | null;
  confidence: number | null;
  route: string | null;
  normalized_text?: string | null;
  timings: Record<string, number>;
}
export type ServerTurn =
  | (TurnMeta & { type: 'action'; action: PlayerAction; message: string })
  | (TurnMeta & { type: 'answer.done'; text: string })
  | { type: 'error'; turn_id?: string; code: string; message: string };

export interface TurnResult {
  msg: ServerTurn;
  roundTripMs: number;
}

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || API_URL.replace(/^http/, 'ws');
const TURN_TIMEOUT_MS = 15000;
const CONNECT_WAIT_MS = 60000; // a sleeping free-tier backend can take ~30–60 s to wake

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * One WebSocket per viewing session (session_id = LangGraph thread_id, roadmap §2).
 * Reconnects with backoff; utterances sent while reconnecting wait for the socket.
 */
export function useStudySocket(opts: {
  videoId: string;
  language: Lang;
  getPlayback: () => { playback_s: number; max_watched_s: number };
}) {
  const { videoId, language, getPlayback } = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(newId());
  const pendingRef = useRef(new Map<string, { resolve: (r: TurnResult) => void; t0: number; timer: number }>());
  const openWaitersRef = useRef<Array<() => void>>([]);
  const languageRef = useRef(language);
  const getPlaybackRef = useRef(getPlayback);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  getPlaybackRef.current = getPlayback;

  // new video → new viewing session (yesterday's Q&A must not leak into today's)
  useEffect(() => {
    sessionIdRef.current = newId();
  }, [videoId]);

  useEffect(() => {
    let closedByUs = false;
    let retry = 0;
    let retryTimer: number | undefined;
    let heartbeat: number | undefined;

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(`${WS_URL}/ws/session`);
      wsRef.current = ws;

      ws.onopen = async () => {
        // fetched per connection, so a reconnect after an hour carries a refreshed token
        const token = await getAccessToken();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            type: 'hello',
            video_id: videoId,
            session_id: sessionIdRef.current,
            language: languageRef.current,
            ...(token ? { token } : {}),
          })
        );
      };
      ws.onmessage = (ev) => {
        let msg: { type: string; turn_id?: string } & Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'ready') {
          retry = 0;
          setStatus('open');
          openWaitersRef.current.splice(0).forEach((fn) => fn());
          heartbeat = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'playback', ...getPlaybackRef.current() }));
          }, 5000);
          return;
        }
        const pending = msg.turn_id ? pendingRef.current.get(msg.turn_id) : undefined;
        if (pending && msg.turn_id) {
          window.clearTimeout(pending.timer);
          pendingRef.current.delete(msg.turn_id);
          pending.resolve({ msg: msg as unknown as ServerTurn, roundTripMs: Math.round(performance.now() - pending.t0) });
        }
      };
      ws.onclose = (ev) => {
        window.clearInterval(heartbeat);
        if (ev.code === 4401) {
          setStatus('unauthorized'); // bad/expired token: retrying with the same one is pointless
          return;
        }
        setStatus('closed');
        if (closedByUs) return;
        retry += 1;
        retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** retry, 15000));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closedByUs = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeat);
      wsRef.current?.close();
    };
  }, [videoId]);

  // language toggle mid-session: one field, set from the UI, read everywhere
  useEffect(() => {
    languageRef.current = language;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'language', language }));
  }, [language]);

  const waitForOpen = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && status === 'open') return resolve(true);
        const timer = window.setTimeout(() => resolve(false), CONNECT_WAIT_MS);
        openWaitersRef.current.push(() => {
          window.clearTimeout(timer);
          resolve(true);
        });
      }),
    [status]
  );

  const sendUtterance = useCallback(
    async (text: string): Promise<TurnResult> => {
      const turn_id = newId();
      const t0 = performance.now();
      if (status === 'unauthorized') {
        return {
          msg: { type: 'error', turn_id, code: 'unauthorized', message: 'Your session expired — please sign in again.' },
          roundTripMs: 0,
        };
      }
      if (!(await waitForOpen())) {
        return {
          msg: { type: 'error', turn_id, code: 'offline', message: "Can't reach the StudyLoop server." },
          roundTripMs: Math.round(performance.now() - t0),
        };
      }
      return new Promise<TurnResult>((resolve) => {
        const timer = window.setTimeout(() => {
          pendingRef.current.delete(turn_id);
          resolve({ msg: { type: 'error', turn_id, code: 'timeout', message: 'The server took too long.' }, roundTripMs: TURN_TIMEOUT_MS });
        }, TURN_TIMEOUT_MS);
        pendingRef.current.set(turn_id, { resolve, t0: performance.now(), timer });
        wsRef.current!.send(
          JSON.stringify({ type: 'utterance', turn_id, text, language: languageRef.current, ...getPlaybackRef.current() })
        );
      });
    },
    [waitForOpen, status]
  );

  const cancelTurn = useCallback(() => {
    // barge-in: tell the server to stop streaming stale turns (meaningful once answers stream in Tier 1b)
    const ws = wsRef.current;
    pendingRef.current.forEach((_, id) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'turn.cancel', turn_id: id })));
  }, []);

  return { status, sessionId: sessionIdRef.current, sendUtterance, cancelTurn };
}
