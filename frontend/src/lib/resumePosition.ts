/**
 * Where a lecture starts when the learner comes back.
 *
 * The server keeps the resume point (written behind the heartbeat, up to ~20 s late) and this browser keeps its
 * own copy every few seconds, so a failed fetch, a cold backend or a closed tab never costs the learner their
 * place. Whichever copy is NEWER wins, so a position saved on another device is still honoured. The copy is keyed
 * by user (two accounts on one browser never see each other's place) and cleared when a video is removed from the
 * library. Every storage access is guarded: storage can be blocked (private mode) and the app must work without it.
 */

const PREFIX = 'studyloop.pos.';
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

let scope = '';

/** Set by the auth provider whenever the signed-in user changes: keys the browser copy per user. */
export function setPositionScope(userId: string | null | undefined): void {
  scope = userId ? `${userId}.` : '';
}

const keyFor = (videoId: string): string => `${PREFIX}${scope}${videoId}`;

export interface LocalPosition {
  /** where the playhead was, seconds */
  t: number;
  /** the no-spoiler high-water mark, seconds (only ever rises) */
  mw: number;
  /** when it was saved (ms since epoch) */
  at: number;
  /** the video's duration when it was saved (0 = unknown): lets "finished" be recognised before the player knows it */
  d: number;
}

export interface ServerPosition {
  last_position_s: number;
  max_watched_s?: number;
  last_studied_at: string | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function saveLocalPosition(
  videoId: string,
  t: number,
  maxWatched: number,
  duration = 0,
  now: number = Date.now()
): void {
  if (!VIDEO_ID.test(videoId) || !Number.isFinite(t) || t < 0) return;
  const before = loadLocalPosition(videoId);
  const rec: LocalPosition = {
    t: Math.round(t * 10) / 10,
    mw: Math.max(num(maxWatched), before?.mw ?? 0), // a stale tab can never lower what was already seen
    at: now,
    d: duration > 0 ? duration : (before?.d ?? 0),
  };
  try {
    localStorage.setItem(keyFor(videoId), JSON.stringify(rec));
  } catch {
    /* private mode / quota: the server copy still works */
  }
}

export function loadLocalPosition(videoId: string): LocalPosition | null {
  if (!VIDEO_ID.test(videoId)) return null;
  try {
    const raw = localStorage.getItem(keyFor(videoId));
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<LocalPosition>;
    if (typeof r.t !== 'number' || !Number.isFinite(r.t) || r.t < 0) return null;
    return { t: r.t, mw: num(r.mw), at: num(r.at), d: num(r.d) };
  } catch {
    return null;
  }
}

/** Forget this browser's copy (the video was removed from the library: a re-watch starts from nothing). */
export function clearLocalPosition(videoId: string): void {
  if (!VIDEO_ID.test(videoId)) return;
  try {
    localStorage.removeItem(keyFor(videoId));
  } catch {
    /* nothing to clear */
  }
}

/** The position to resume at, in seconds (null = no usable position): the newer of the server and local copies. */
export function pickResumeSeconds(server: ServerPosition | null, local: LocalPosition | null): number | null {
  const s = server && Number.isFinite(server.last_position_s) && server.last_position_s > 0 ? server : null;
  if (!s) return local && local.t > 0 ? local.t : null;
  if (!local) return s.last_position_s;
  const serverAt = s.last_studied_at ? Date.parse(s.last_studied_at) : NaN;
  return Number.isFinite(serverAt) && serverAt > local.at ? s.last_position_s : local.t;
}

/** How far this learner has already watched: the highest mark either copy knows (it feeds the spoiler guard). */
export function pickMaxWatched(server: ServerPosition | null, local: LocalPosition | null): number {
  return Math.max(server?.max_watched_s ?? 0, local?.mw ?? 0);
}
