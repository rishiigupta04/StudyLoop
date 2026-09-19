import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/services/apiClient';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type Note,
  type NotePatch,
  type SummaryStatus,
} from '@/services/notesService';
import type { NoteEvent } from './useStudySocket';

export interface VideoNotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  /** note id → summary state of a voice note from this session (absent = settled / loaded from the DB) */
  summaryStatus: Record<string, SummaryStatus>;
  reload: () => Promise<void>;
  add: (text: string, atS: number) => Promise<boolean>;
  patch: (id: string, patch: NotePatch) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  onNoteEvent: (e: NoteEvent) => void;
}

const byTime = (a: Note, b: Note) => a.at_s - b.at_s;
const upsert = (list: Note[], n: Note) => [...list.filter((x) => x.id !== n.id), n].sort(byTime);
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * This video's notes (Tier 1e). Loaded over REST; voice notes stream in over the session socket
 * (`note.created` at once, `note.updated` when the summary lands). A voice note is written to the DB in
 * the background, so an edit or delete in the first moment can reach the server before the row does:
 * edits retry once, deletes wait for the save.
 */
export function useVideoNotes(videoId: string, sessionId: string): VideoNotesState {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<Record<string, SummaryStatus>>({});
  const aliveRef = useRef(videoId);
  const unsavedRef = useRef(new Set<string>()); // voice notes whose DB insert hasn't been confirmed
  const deleteWhenSavedRef = useRef(new Set<string>());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listNotes(videoId);
      if (aliveRef.current !== videoId) return;
      // keep voice notes that arrived over the socket but aren't in the DB yet
      setNotes((cur) => [...list, ...cur.filter((n) => unsavedRef.current.has(n.id) && !list.some((x) => x.id === n.id))].sort(byTime));
      setError(null);
    } catch (e) {
      if (aliveRef.current !== videoId) return;
      setError(e instanceof ApiError && e.status === 401 ? 'Sign in to see your notes.' : "Couldn't load your notes — is the server awake?");
    } finally {
      if (aliveRef.current === videoId) setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    aliveRef.current = videoId;
    setNotes([]);
    setSummaryStatus({});
    unsavedRef.current.clear();
    deleteWhenSavedRef.current.clear();
    void reload();
  }, [videoId, reload]);

  const onNoteEvent = useCallback(
    (e: NoteEvent) => {
      if (e.note.video_id !== aliveRef.current) return;
      const id = e.note.id;
      if (e.type === 'note.created') {
        unsavedRef.current.add(id);
        setNotes((cur) => upsert(cur, e.note));
        setSummaryStatus((s) => ({ ...s, [id]: 'pending' }));
        return;
      }
      unsavedRef.current.delete(id);
      if (deleteWhenSavedRef.current.delete(id)) {
        if (e.saved) void deleteNote(id).catch(() => toast.error("Couldn't delete that note."));
        return;
      }
      // merge: the summary only fills in; an edit the user made meanwhile is never overwritten
      setNotes((cur) =>
        cur.map((n) => (n.id === id ? { ...n, summary: n.summary ?? e.note.summary } : n))
      );
      setSummaryStatus((s) => ({ ...s, [id]: e.summary_status }));
      if (!e.saved) toast.error("That voice note couldn't be saved to your account — it's only on this page.");
    },
    []
  );

  const add = useCallback(
    async (text: string, atS: number) => {
      try {
        const note = await createNote({ video_id: videoId, at_s: Math.max(0, atS), text, session_id: sessionId });
        if (aliveRef.current === videoId) setNotes((cur) => upsert(cur, note));
        return true;
      } catch {
        toast.error("Couldn't save the note — is the server awake?");
        return false;
      }
    },
    [videoId, sessionId]
  );

  const patch = useCallback(async (id: string, p: NotePatch) => {
    let before: Note | undefined;
    setNotes((cur) => {
      before = cur.find((n) => n.id === id);
      return cur.map((n) => (n.id === id ? { ...n, ...p } : n)).sort(byTime); // optimistic
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const saved = await updateNote(id, p);
        setNotes((cur) => cur.map((n) => (n.id === id ? saved : n)));
        return true;
      } catch (e) {
        // a brand-new voice note may not be in the DB yet: give the background save a moment
        if (attempt === 0 && e instanceof ApiError && e.status === 404) {
          await sleep(1500);
          continue;
        }
        break;
      }
    }
    if (before) setNotes((cur) => cur.map((n) => (n.id === id ? before! : n)));
    toast.error("Couldn't update the note.");
    return false;
  }, []);

  const remove = useCallback(async (id: string) => {
    let removed: Note | undefined;
    setNotes((cur) => {
      removed = cur.find((n) => n.id === id);
      return cur.filter((n) => n.id !== id);
    });
    if (unsavedRef.current.has(id)) {
      deleteWhenSavedRef.current.add(id); // deleted once the background save confirms
      return;
    }
    try {
      await deleteNote(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return; // already gone
      if (removed) setNotes((cur) => upsert(cur, removed!));
      toast.error("Couldn't delete the note.");
    }
  }, []);

  return { notes, loading, error, summaryStatus, reload, add, patch, remove, onNoteEvent };
}
