/**
 * Notes workspace across videos (Tier 2): search, filter, group, export. Pure functions (testable in Node).
 * Search is client-side full text over what the note says, what was said and the video title, in any
 * script: a Devanagari query matches Devanagari notes, a Latin one matches Latin/Hinglish ones.
 */
import { notesToMarkdown } from './notesExport';

export interface WorkspaceNote {
  id: string;
  video_id: string;
  at_s: number;
  raw_text: string;
  summary: string | null;
  is_auto: boolean;
  is_bookmarked: boolean;
  created_at: string | null;
}

export interface NoteFilter {
  query: string;
  videoId: string | null;
  starred: boolean;
}

export interface NoteGroup<N extends WorkspaceNote = WorkspaceNote> {
  video_id: string;
  title: string;
  notes: N[];
  /** most recent note in the group, for ordering */
  latest: string;
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase();

export function matchesNote(n: WorkspaceNote, title: string, f: NoteFilter): boolean {
  if (f.videoId && n.video_id !== f.videoId) return false;
  if (f.starred && !n.is_bookmarked) return false;
  const q = fold(f.query.trim());
  if (!q) return true;
  const hay = fold(`${n.summary ?? ''} ${n.raw_text} ${title}`);
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Filtered notes grouped per video; groups by most recent note first, notes by time in the video. */
export function groupNotes<N extends WorkspaceNote>(notes: N[], titles: Record<string, string | null | undefined>, f: NoteFilter): NoteGroup<N>[] {
  const groups = new Map<string, NoteGroup<N>>();
  for (const n of notes) {
    const title = titles[n.video_id] || n.video_id;
    if (!matchesNote(n, title, f)) continue;
    const g = groups.get(n.video_id) ?? { video_id: n.video_id, title, notes: [], latest: '' };
    g.notes.push(n);
    if ((n.created_at ?? '') > g.latest) g.latest = n.created_at ?? '';
    groups.set(n.video_id, g);
  }
  const out = [...groups.values()];
  out.forEach((g) => g.notes.sort((a, b) => a.at_s - b.at_s));
  return out.sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.title.localeCompare(b.title)));
}

/** One Markdown file for several videos: each video's section as in the per-video export. */
export function workspaceMarkdown(groups: NoteGroup[], exportedAt: Date): string {
  const total = groups.reduce((n, g) => n + g.notes.length, 0);
  const parts = groups.map((g) =>
    notesToMarkdown(g.notes, { videoId: g.video_id, title: g.title, exportedAt })
      .replace(/^# /, '## ')
      .trimEnd()
  );
  return [`# StudyLoop notes`, '', `${groups.length} video${groups.length === 1 ? '' : 's'} · ${total} note${total === 1 ? '' : 's'} · ${exportedAt.toISOString().slice(0, 10)}`, '', ...parts.flatMap((p) => [p, ''])].join('\n');
}
