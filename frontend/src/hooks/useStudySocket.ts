import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, getAccessToken } from '@/services/apiClient';
import type { PlayerAction } from '@/lib/playerActions';
import type { VideoStatusInfo } from '@/services/transcriptService';
import type { Note, SummaryStatus } from '@/services/notesService';

export type Lang = 'en' | 'hi';
/** 'unauthorized': the server rejected our token (close 4401) — reconnecting won't help, sign in again */
export type SocketStatus = 'connecting' | 'open' | 'closed' | 'unauthorized';

/** A transcript moment an answer relies on (seekable chip). */
export interface Citation {
  start_s: number;
}

export interface SendOptions {
  /** Streamed answer tokens (`answer.delta`) as they arrive. */
  onDelta?: (text: string) => void;
}

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
  | (TurnMeta & { type: 'answer.done'; text: string; citations?: Citation[]; cancelled?: boolean })
  | { type: 'error'; turn_id?: string; code: string; message: string };

/** Voice notes (Tier 1e): created at once, updated when the background summary lands. */
export type NoteEvent =
  | { type: 'note.created'; turn_id: string; note: Note; summary_status: SummaryStatus }
  | { type: 'note.updated'; note: Note; summary_status: SummaryStatus; saved: boolean };

export interface TurnResult {
  msg: ServerTurn;
  roundTripMs: number;
}

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || API_URL.replace(/^http/, 'ws');
const TURN_TIMEOUT_MS = 15000;
// First connect of this page: a sleeping free-tier backend can take ~30–60 s to wake, and the top bar says so.
const CONNECT_WAIT_MS = 60000;
// After the server has answered once, a drop is not a cold start: fail fast so the learner can ask again.
const RECONNECT_WAIT_MS = 8000;
/** `code` of the error a turn gets when the socket closes under it (the server has dropped the turn). */
export const CONNECTION_LOST = 'connection_lost';
const CONNECTION_LOST_MESSAGE = 'Connection lost — reconnecting. Ask again in a moment.';

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
  /** anti-spoiler Q&A (roadmap D7); false = the learner allows answers from the whole lecture */
  spoilerGuard?: boolean;
  getPlayback: () => { playback_s: number; max_watched_s: number };
  onNoteEvent?: (e: NoteEvent) => void;
}) {
  const { videoId, language, getPlayback } = opts;
  const onNoteEventRef = useRef(opts.onNoteEvent);
  onNoteEventRef.current = opts.onNoteEvent;
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(newId());
  const pendingRef = useRef(
    new Map<
      string,
      { resolve: (r: TurnResult) => void; t0: number; timer: number; onDelta?: (t: string) => void; arm: () => number; sock: WebSocket }
    >()
  );
  // true = the socket opened, false = it will not (sign-in needed / hook torn down)
  const openWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const languageRef = useRef(language);
  const spoilerGuardRef = useRef(opts.spoilerGuard ?? true);
  spoilerGuardRef.current = opts.spoilerGuard ?? true;
  const getPlaybackRef = useRef(getPlayback);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const statusRef = useRef<SocketStatus>('connecting');
  const everOpenRef = useRef(false); // has the server answered at all on this page? (cold start vs a drop)
  const updateStatus = (s: SocketStatus) => {
    statusRef.current = s;
    setStatus(s);
  };
  // transcript ingestion progress for this video, pushed as `video.status` (Tier 1a)
  const [videoStatus, setVideoStatus] = useState<VideoStatusInfo | null>(null);
  getPlaybackRef.current = getPlayback;

  // new video → new viewing session (yesterday's Q&A must not leak into today's)
  useEffect(() => {
    sessionIdRef.current = newId();
    setVideoStatus(null);
  }, [videoId]);

  useEffect(() => {
    let closedByUs = false;
    let retry = 0;
    let retryTimer: number | undefined;
    let heartbeat: number | undefined;

    // the socket closed under these turns: the server dropped them, so answer at once instead of at the 15 s timeout
    const failPending = (ws: WebSocket) => {
      pendingRef.current.forEach((p, id) => {
        if (p.sock !== ws) return;
        window.clearTimeout(p.timer);
        pendingRef.current.delete(id);
        p.resolve({
          msg: { type: 'error', turn_id: id, code: CONNECTION_LOST, message: CONNECTION_LOST_MESSAGE },
          roundTripMs: Math.round(performance.now() - p.t0),
        });
      });
    };

    const connect = () => {
      updateStatus('connecting');
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
            spoiler_guard: spoilerGuardRef.current,
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
          everOpenRef.current = true;
          updateStatus('open');
          openWaitersRef.current.splice(0).forEach((fn) => fn(true));
          heartbeat = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'playback', ...getPlaybackRef.current() }));
          }, 5000);
          return;
        }
        if (msg.type === 'video.status') {
          if (msg.video_id === videoId) setVideoStatus(msg as unknown as VideoStatusInfo);
          return;
        }
        if (msg.type === 'note.created' || msg.type === 'note.updated') {
          // before the turn bookkeeping: note.created carries the turn_id but doesn't end the turn
          onNoteEventRef.current?.(msg as unknown as NoteEvent);
          return;
        }
        const pending = msg.turn_id ? pendingRef.current.get(msg.turn_id) : undefined;
        if (msg.type === 'answer.delta') {
          if (pending) {
            window.clearTimeout(pending.timer);
            pending.timer = pending.arm(); // still streaming: the turn is alive
            pending.onDelta?.(String(msg.text ?? ''));
          }
          return;
        }
        if (pending && msg.turn_id) {
          window.clearTimeout(pending.timer);
          pendingRef.current.delete(msg.turn_id);
          pending.resolve({ msg: msg as unknown as ServerTurn, roundTripMs: Math.round(performance.now() - pending.t0) });
        }
      };
      ws.onclose = (ev) => {
        window.clearInterval(heartbeat);
        failPending(ws); // a drop mid-answer: don't leave the learner on a frozen answer for 15 s
        if (wsRef.current !== ws) return; // superseded (video switch): the newer socket owns the status
        if (ev.code === 4401) {
          updateStatus('unauthorized'); // bad/expired token: retrying with the same one is pointless
          openWaitersRef.current.splice(0).forEach((fn) => fn(false));
          return;
        }
        updateStatus('closed');
        if (closedByUs) {
          openWaitersRef.current.splice(0).forEach((fn) => fn(false));
          return;
        }
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
        if (wsRef.current?.readyState === WebSocket.OPEN && statusRef.current === 'open') return resolve(true);
        const waiter = (ok: boolean) => {
          window.clearTimeout(timer);
          resolve(ok);
        };
        const timer = window.setTimeout(
          () => {
            openWaitersRef.current = openWaitersRef.current.filter((w) => w !== waiter);
            resolve(false);
          },
          everOpenRef.current ? RECONNECT_WAIT_MS : CONNECT_WAIT_MS
        );
        openWaitersRef.current.push(waiter);
      }),
    []
  );

  const sendUtterance = useCallback(
    async (text: string, opts: SendOptions = {}): Promise<TurnResult> => {
      const turn_id = newId();
      const t0 = performance.now();
      const unauthorized = (): TurnResult => ({
        msg: { type: 'error', turn_id, code: 'unauthorized', message: 'Your session expired — please sign in again.' },
        roundTripMs: 0,
      });
      // a function, not a property read: the status can change during the await below
      const signedOut = () => statusRef.current === 'unauthorized';
      if (signedOut()) return unauthorized();
      if (!(await waitForOpen())) {
        if (signedOut()) return unauthorized();
        return {
          msg: { type: 'error', turn_id, code: 'offline', message: "Can't reach the StudyLoop server." },
          roundTripMs: Math.round(performance.now() - t0),
        };
      }
      return new Promise<TurnResult>((resolve) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          // closed again between the wait and the send
          return resolve({
            msg: { type: 'error', turn_id, code: CONNECTION_LOST, message: CONNECTION_LOST_MESSAGE },
            roundTripMs: Math.round(performance.now() - t0),
          });
        }
        const arm = () =>
          window.setTimeout(() => {
            pendingRef.current.delete(turn_id);
            resolve({ msg: { type: 'error', turn_id, code: 'timeout', message: 'The server took too long.' }, roundTripMs: TURN_TIMEOUT_MS });
          }, TURN_TIMEOUT_MS);
        pendingRef.current.set(turn_id, { resolve, t0: performance.now(), timer: arm(), onDelta: opts.onDelta, arm, sock: ws });
        ws.send(
          JSON.stringify({
            type: 'utterance',
            turn_id,
            text,
            language: languageRef.current,
            spoiler_guard: spoilerGuardRef.current,
            ...getPlaybackRef.current(),
          })
        );
      });
    },
    [waitForOpen]
  );

  const cancelTurn = useCallback(() => {
    // barge-in: tell the server to stop streaming stale answers (their answer.done comes back cancelled)
    const ws = wsRef.current;
    pendingRef.current.forEach((_, id) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'turn.cancel', turn_id: id })));
  }, []);

  // waking = no connection has worked yet on this page (the free-tier server is probably cold), as opposed to a drop
  const waking = status !== 'open' && status !== 'unauthorized' && !everOpenRef.current;

  return { status, waking, videoStatus, sessionId: sessionIdRef.current, sendUtterance, cancelTurn };
}
