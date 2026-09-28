/**
 * Clip storage for the dev-only Collect page (Tier 1c).
 *
 * A recording session is 70–110 clips over ~20 minutes; losing them to a stray reload would cost a
 * speaker's whole sitting, so clips (audio blob included) live in IndexedDB and the page rebuilds
 * from there on load. If IndexedDB is unavailable (private window), everything falls back to memory
 * for the life of the tab and the page says so.
 */

import type { LangStyle } from './collectScenarios';

const DB_NAME = 'studyloop-collect';
const DB_VERSION = 1;
const CLIPS = 'clips';
const SESSIONS = 'sessions';

export type SttStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface ClipRecord {
  clip_id: string;
  session_id: string;
  speaker_id: string;
  recorded_at: string;
  scenario_id: string;
  /** the exact card text the speaker read, in the language they read it in */
  scenario: string;
  intended_intent: string;
  lang_style: LangStyle;
  /** position in the session queue — lets "re-record the last clip" find its card again */
  queue_index: number;
  mic: string;
  noise: string;
  lecture_playing: boolean;
  duration_ms: number;
  audio: Blob;
  audio_type: string;
  /** what the browser recognizer heard (the Tier 0 path) */
  browser_text: string;
  /** what POST /api/stt returned — Sarvam Saaras, or Groq Whisper when Sarvam fails (see stt_provider) */
  stt_text: string;
  stt_provider: string;
  stt_ms: number | null;
  stt_status: SttStatus;
  notes: string;
}

export interface SessionRecord {
  session_id: string;
  speaker_id: string;
  started_at: string;
  clips_per_intent: number;
  /** how far through the queue the speaker got, so a reload resumes on the same card */
  cursor: number;
  mic: string;
  noise: string;
  video_id: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memClips = new Map<string, ClipRecord>();
const memSessions = new Map<string, SessionRecord>();
let usingMemory = false;

export function storageIsMemoryOnly(): boolean {
  return usingMemory;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      usingMemory = true;
      return resolve(null);
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLIPS)) {
        db.createObjectStore(CLIPS, { keyPath: 'clip_id' }).createIndex('session_id', 'session_id');
      }
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'session_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      usingMemory = true;
      resolve(null);
    };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('no indexeddb'));
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function putClip(clip: ClipRecord): Promise<void> {
  memClips.set(clip.clip_id, clip);
  try {
    await run(CLIPS, 'readwrite', (s) => s.put(clip));
  } catch {
    usingMemory = true; // memClips already holds it
  }
}

/** Merge fields into a stored clip (the STT text lands after the speaker has moved on). */
export async function patchClip(clipId: string, patch: Partial<ClipRecord>): Promise<ClipRecord | null> {
  const current = memClips.get(clipId) ?? (await getClip(clipId));
  if (!current) return null;
  const next = { ...current, ...patch };
  await putClip(next);
  return next;
}

export async function getClip(clipId: string): Promise<ClipRecord | null> {
  const local = memClips.get(clipId);
  if (local) return local;
  try {
    return (await run<ClipRecord | undefined>(CLIPS, 'readonly', (s) => s.get(clipId))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteClip(clipId: string): Promise<void> {
  memClips.delete(clipId);
  try {
    await run(CLIPS, 'readwrite', (s) => s.delete(clipId));
  } catch {
    /* memory-only */
  }
}

export async function listClips(sessionId: string): Promise<ClipRecord[]> {
  let rows: ClipRecord[] = [];
  try {
    rows = await openDb().then(
      (db) =>
        new Promise<ClipRecord[]>((resolve, reject) => {
          if (!db) return reject(new Error('no indexeddb'));
          const tx = db.transaction(CLIPS, 'readonly');
          const req = tx.objectStore(CLIPS).index('session_id').getAll(sessionId);
          req.onsuccess = () => resolve(req.result as ClipRecord[]);
          req.onerror = () => reject(req.error);
        })
    );
  } catch {
    rows = [...memClips.values()].filter((c) => c.session_id === sessionId);
  }
  rows.forEach((c) => memClips.set(c.clip_id, c));
  return rows.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

export async function putSession(session: SessionRecord): Promise<void> {
  memSessions.set(session.session_id, session);
  try {
    await run(SESSIONS, 'readwrite', (s) => s.put(session));
  } catch {
    usingMemory = true;
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  let rows: SessionRecord[] = [];
  try {
    rows = await run<SessionRecord[]>(SESSIONS, 'readonly', (s) => s.getAll());
  } catch {
    rows = [...memSessions.values()];
  }
  return rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Drop a whole session (its clips too) — the operator has exported it and wants the space back. */
export async function deleteSession(sessionId: string): Promise<void> {
  const clips = await listClips(sessionId);
  await Promise.all(clips.map((c) => deleteClip(c.clip_id)));
  memSessions.delete(sessionId);
  try {
    await run(SESSIONS, 'readwrite', (s) => s.delete(sessionId));
  } catch {
    /* memory-only */
  }
}
