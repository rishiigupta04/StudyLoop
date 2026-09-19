/**
 * Library, resume point, dashboard and chat history (Tier 2) — all scoped to the signed-in user by the
 * backend. Resume points are written server-side behind the session socket's heartbeat.
 */

import { apiGet, apiSend } from './apiClient';
import type { Note } from './notesService';
import type { OutlineStatus, VideoStatus } from './transcriptService';

export type WatchStatus = 'not-started' | 'in-progress' | 'completed';

export interface LibraryVideo {
  video_id: string;
  title: string | null;
  channel: string | null;
  thumbnail_url: string;
  duration_s: number | null;
  last_position_s: number;
  max_watched_s: number;
  /** 0..1, null when the duration isn't known yet */
  progress: number | null;
  status: WatchStatus;
  last_studied_at: string | null;
  ingest_status: VideoStatus | null;
  has_transcript: boolean;
  outline_status: OutlineStatus | null;
  chapters: number;
  overview: Partial<Record<'en' | 'hi', string>> | null;
  notes: number;
}

export interface ResumePoint {
  video_id: string;
  last_position_s: number;
  max_watched_s: number;
  status: WatchStatus;
  last_studied_at: string | null;
}

export interface Dashboard {
  stats: { videos: number; completed: number; notes: number; sessions_7d: number; minutes_7d: number; hours_watched: number };
  days: { date: string; minutes: number }[];
  recent: LibraryVideo[];
  notes: (Note & { video_title: string | null })[];
}

export interface ChatTurn {
  question: string;
  answer: string;
  route: string | null;
  at_s: number | null;
  at: string | null;
}

export interface ChatSession {
  session_id: string;
  video_id: string;
  video_title: string | null;
  language: 'en' | 'hi' | null;
  started_at: string | null;
  last_seen_at: string | null;
  turns: ChatTurn[];
}

export async function fetchLibrary(): Promise<LibraryVideo[]> {
  return (await apiGet<{ videos: LibraryVideo[] }>('/api/library')).videos;
}

/** Null when offline: the video page then simply starts at 0 with a fresh high-water mark. */
export async function fetchResume(videoId: string): Promise<ResumePoint | null> {
  try {
    return await apiGet<ResumePoint>(`/api/library/${encodeURIComponent(videoId)}`);
  } catch {
    return null;
  }
}

export async function removeFromLibrary(videoId: string): Promise<void> {
  await apiSend('DELETE', `/api/library/${encodeURIComponent(videoId)}`);
}

export async function fetchDashboard(): Promise<Dashboard> {
  return apiGet<Dashboard>('/api/dashboard');
}

export async function fetchChats(limit = 30): Promise<ChatSession[]> {
  return (await apiGet<{ sessions: ChatSession[] }>(`/api/chats?limit=${limit}`)).sessions;
}

/** Player commands ("pause", "go back 10", "skip to X") and note acks aren't conversation. */
export function isConversation(t: Pick<ChatTurn, 'route'>): boolean {
  return t.route !== 'fast' && t.route !== 'seek' && t.route !== 'notes';
}

/** Where a study link should land: the resume point unless it's at the very start or the very end. */
export function resumeTarget(r: Pick<ResumePoint, 'last_position_s'> | null, durationS: number): number | null {
  if (!r) return null;
  const at = r.last_position_s;
  if (at < 15) return null;
  if (durationS > 0 && at > durationS - 20) return null;
  return at;
}

export function studyUrl(videoId: string, atS?: number | null): string {
  return `/video-study-page?v=${encodeURIComponent(videoId)}${atS != null ? `&t=${Math.floor(atS)}` : ''}`;
}
