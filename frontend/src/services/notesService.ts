/**
 * Notes (Tier 1e) — the backend `notes` table via REST. Voice notes are created server-side and arrive
 * over the session socket as `note.created` / `note.updated`; this service lists them and handles typed
 * notes, edits and deletes.
 */

import { apiGet, apiSend } from './apiClient';

export interface Note {
  id: string;
  video_id: string;
  session_id: string | null;
  at_s: number;
  /** What was typed, or (voice notes) what was said. */
  raw_text: string;
  /** Voice notes: the LLM summary of the last ~60 s + what was said; or the user's own edit. */
  summary: string | null;
  /** true = a voice note (summary written by StudyLoop), false = typed */
  is_auto: boolean;
  is_bookmarked: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** `note.updated`: done | skipped (no transcript / no LLM) | failed | kept (the user's edit won). */
export type SummaryStatus = 'pending' | 'done' | 'skipped' | 'failed' | 'kept';

export type NotePatch = Partial<Pick<Note, 'raw_text' | 'summary' | 'is_bookmarked' | 'at_s'>>;

export async function listNotes(videoId?: string): Promise<Note[]> {
  const q = videoId ? `?video_id=${encodeURIComponent(videoId)}` : '';
  return (await apiGet<{ notes: Note[] }>(`/api/notes${q}`)).notes;
}

export async function createNote(input: {
  video_id: string;
  at_s: number;
  text: string;
  session_id?: string;
  is_bookmarked?: boolean;
}): Promise<Note> {
  return (await apiSend<Note>('POST', '/api/notes', input))!;
}

export async function updateNote(id: string, patch: NotePatch): Promise<Note> {
  return (await apiSend<Note>('PATCH', `/api/notes/${id}`, patch))!;
}

export async function deleteNote(id: string): Promise<void> {
  await apiSend('DELETE', `/api/notes/${id}`);
}

/** The text a note shows: the summary (or the user's edit of it), else what was typed/said. */
export function noteText(n: Pick<Note, 'summary' | 'raw_text'>): string {
  return (n.summary && n.summary.trim()) || n.raw_text;
}

/** Which column an edit writes: voice notes keep what was said in raw_text and edit the summary. */
export function editField(n: Pick<Note, 'is_auto'>): 'summary' | 'raw_text' {
  return n.is_auto ? 'summary' : 'raw_text';
}
