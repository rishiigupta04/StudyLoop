import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader, { PageState } from '@/components/PageHeader';
import Icon from '@/components/ui/AppIcon';
import { downloadText, notesToPrintHtml, printHtml, safeFilename } from '@/lib/notesExport';
import { groupNotes, workspaceMarkdown } from '@/lib/notesWorkspace';
import { formatClock } from '@/lib/time';
import { timeAgo, useUiLang, type UiLang } from '@/lib/uiLang';
import { ApiError } from '@/services/apiClient';
import { fetchLibrary, studyUrl } from '@/services/libraryService';
import { deleteNote, editField, listNotes, noteText, updateNote, type Note } from '@/services/notesService';

const T = {
  title: { en: 'Notes', hi: 'नोट्स' },
  subtitle: {
    en: 'All your notes across lectures. Click a timestamp to jump back to that moment.',
    hi: 'सारे लेक्चर के आपके नोट्स। Timestamp पर click करके उसी पल पर जाएँ।',
  },
  search: { en: 'Search notes (any language)', hi: 'नोट्स खोजें (किसी भी भाषा में)' },
  allVideos: { en: 'All videos', hi: 'सभी वीडियो' },
  starred: { en: 'Starred', hi: 'Starred' },
  exportMd: { en: 'Export Markdown', hi: 'Markdown export' },
  exportPdf: { en: 'PDF', hi: 'PDF' },
  pdfOne: { en: 'Pick one video to print it as PDF.', hi: 'PDF के लिए एक वीडियो चुनें।' },
  loading: { en: 'Loading your notes…', hi: 'आपके नोट्स लोड हो रहे हैं…' },
  emptyTitle: { en: 'No notes yet', hi: 'अभी कोई नोट नहीं' },
  emptyBody: {
    en: 'While studying, hold ~ and say "note this down" (or "ye note kar lo"), or type one in the Notes tab.',
    hi: 'पढ़ते समय ~ दबाकर "ye note kar lo" बोलें, या Notes tab में टाइप करें।',
  },
  noMatch: { en: 'No notes match.', hi: 'कोई नोट नहीं मिला।' },
  errTitle: { en: "Couldn't load your notes", hi: 'नोट्स लोड नहीं हो पाए' },
  errAuth: { en: 'Sign in again to see your notes.', hi: 'नोट्स देखने के लिए फिर से sign in करें।' },
  errOffline: { en: 'The server may be waking up — try again in a moment.', hi: 'Server शायद जाग रहा है — थोड़ी देर में फिर कोशिश करें।' },
  retry: { en: 'Try again', hi: 'फिर से कोशिश करें' },
  youSaid: { en: 'You said', hi: 'आपने कहा' },
  voice: { en: 'Voice', hi: 'Voice' },
  edit: { en: 'Edit', hi: 'Edit' },
  save: { en: 'Save', hi: 'Save' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  del: { en: 'Delete', hi: 'हटाएँ' },
  confirmDel: { en: 'Delete this note?', hi: 'यह नोट हटाएँ?' },
  failed: { en: "Couldn't save that — try again.", hi: 'Save नहीं हो पाया — फिर कोशिश करें।' },
  openVideo: { en: 'Open video', hi: 'वीडियो खोलें' },
  count: { en: (n: number) => `${n} note${n === 1 ? '' : 's'}`, hi: (n: number) => `${n} नोट्स` },
} as const;

export default function NotesPage() {
  const [lang, setLang] = useUiLang();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<'auth' | 'offline' | null>(null);
  const [query, setQuery] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, lib] = await Promise.all([listNotes(), fetchLibrary().catch(() => [])]);
      setNotes(list);
      setTitles(Object.fromEntries(lib.map((v) => [v.video_id, v.title])));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'auth' : 'offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupNotes(notes ?? [], titles, { query, videoId, starred }), [notes, titles, query, videoId, starred]);
  const videoOptions = useMemo(
    () => groupNotes(notes ?? [], titles, { query: '', videoId: null, starred: false }).map((g) => ({ id: g.video_id, title: g.title })),
    [notes, titles]
  );

  const replace = (n: Note) => setNotes((cur) => (cur ?? []).map((x) => (x.id === n.id ? n : x)));

  const patch = async (n: Note, fields: Partial<Note>) => {
    const before = n;
    replace({ ...n, ...fields });
    try {
      replace(await updateNote(n.id, fields));
      return true;
    } catch {
      replace(before);
      toast.error(T.failed[lang]);
      return false;
    }
  };

  const remove = async (n: Note) => {
    if (!window.confirm(T.confirmDel[lang])) return;
    setNotes((cur) => (cur ?? []).filter((x) => x.id !== n.id));
    try {
      await deleteNote(n.id);
    } catch {
      setNotes((cur) => [...(cur ?? []), n]);
      toast.error(T.failed[lang]);
    }
  };

  const exportMd = () => {
    const name = groups.length === 1 ? safeFilename(groups[0].title) : 'studyloop-notes';
    downloadText(`${name}.md`, workspaceMarkdown(groups, new Date()));
  };

  const exportPdf = () => {
    if (groups.length !== 1) {
      toast(T.pdfOne[lang]);
      return;
    }
    const g = groups[0];
    printHtml(notesToPrintHtml(g.notes, { videoId: g.video_id, title: g.title, exportedAt: new Date() }));
  };

  const total = groups.reduce((n, g) => n + g.notes.length, 0);

  return (
    <AppLayout activeRoute="/notes">
      <div className="flex-1 flex flex-col min-h-screen bg-obsidian">
        <PageHeader
          icon="DocumentTextIcon"
          title={T.title[lang]}
          subtitle={notes ? `${T.count[lang](notes.length)} · ${T.subtitle[lang]}` : T.subtitle[lang]}
          lang={lang}
          setLang={setLang}
        >
          {notes && notes.length > 0 && (
            <>
              <button
                onClick={exportMd}
                disabled={!total}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/40 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Icon name="ArrowDownTrayIcon" size={14} />
                {T.exportMd[lang]}
              </button>
              <button
                onClick={exportPdf}
                disabled={!total}
                title={groups.length !== 1 ? T.pdfOne[lang] : undefined}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border/80 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {T.exportPdf[lang]}
              </button>
            </>
          )}
        </PageHeader>

        <div className="px-4 sm:px-6 py-5 space-y-5 max-w-5xl w-full">
          {notes && notes.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={T.search[lang]}
                  aria-label={T.search[lang]}
                  className="w-full input-field rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/60"
                />
              </div>
              <select
                value={videoId ?? ''}
                onChange={(e) => setVideoId(e.target.value || null)}
                aria-label={T.allVideos[lang]}
                className="input-field rounded-xl px-3 py-2 text-sm text-foreground sm:max-w-xs"
              >
                <option value="">{T.allVideos[lang]}</option>
                {videoOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setStarred((s) => !s)}
                aria-pressed={starred}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1.5 ${
                  starred ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-border/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="StarIcon" variant={starred ? 'solid' : 'outline'} size={14} />
                {T.starred[lang]}
              </button>
            </div>
          )}

          {error ? (
            <PageState
              icon="ExclamationTriangleIcon"
              title={T.errTitle[lang]}
              body={error === 'auth' ? T.errAuth[lang] : T.errOffline[lang]}
              action={
                <button onClick={() => void load()} className="btn-primary px-4 py-2 rounded-xl text-sm font-bold text-white">
                  {T.retry[lang]}
                </button>
              }
            />
          ) : notes === null ? (
            <div className="space-y-3" aria-busy="true" aria-label={T.loading[lang]}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-surface-card/70 animate-pulse" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <PageState icon="DocumentTextIcon" title={T.emptyTitle[lang]} body={T.emptyBody[lang]} />
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{T.noMatch[lang]}</p>
          ) : (
            groups.map((g) => (
              <section key={g.video_id} className="glass-card rounded-2xl border border-border/70 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-surface-card/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={`https://i.ytimg.com/vi/${g.video_id}/mqdefault.jpg`} alt="" className="w-16 aspect-video rounded-md object-cover flex-shrink-0" />
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-foreground truncate">{g.title}</h2>
                      <p className="text-[11px] text-muted-foreground">{T.count[lang](g.notes.length)}</p>
                    </div>
                  </div>
                  <Link to={studyUrl(g.video_id)} className="text-xs font-bold text-indigo-300 hover:text-cyan-300 flex-shrink-0 flex items-center gap-1">
                    <Icon name="PlayIcon" size={12} />
                    {T.openVideo[lang]}
                  </Link>
                </div>
                <ul className="divide-y divide-border/50">
                  {g.notes.map((n) => (
                    <NoteRow key={n.id} note={n} lang={lang} onPatch={patch} onDelete={remove} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function NoteRow({
  note,
  lang,
  onPatch,
  onDelete,
}: {
  note: Note;
  lang: UiLang;
  onPatch: (n: Note, fields: Partial<Note>) => Promise<boolean>;
  onDelete: (n: Note) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const text = noteText(note);
  const said = note.is_auto && note.summary && note.raw_text.trim() !== note.summary.trim() ? note.raw_text : null;

  const save = async () => {
    const value = draft.trim();
    if (!value || value === text) {
      setEditing(false);
      return;
    }
    if (await onPatch(note, { [editField(note)]: value })) setEditing(false);
  };

  return (
    <li className="px-4 py-3 flex gap-3 group">
      <Link
        to={studyUrl(note.video_id, note.at_s)}
        className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-surface-elevated text-indigo-300 border border-indigo-500/20 hover:text-cyan-300 h-fit flex-shrink-0 tabular-nums"
      >
        {formatClock(note.at_s)}
      </Link>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full input-field rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => void save()} className="btn-primary px-3 py-1 rounded-lg text-xs font-bold text-white">
                {T.save[lang]}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground">
                {T.cancel[lang]}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{text}</p>
            {said && (
              <p className="text-xs text-muted-foreground mt-1">
                {T.youSaid[lang]}: “{said}”
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-2">
              {note.is_auto && (
                <span className="flex items-center gap-1">
                  <Icon name="MicrophoneIcon" size={11} />
                  {T.voice[lang]}
                </span>
              )}
              <span>{timeAgo(note.created_at, lang)}</span>
            </p>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex items-start gap-0.5 flex-shrink-0">
          <button
            onClick={() => void onPatch(note, { is_bookmarked: !note.is_bookmarked })}
            className={`p-1.5 rounded-lg ${note.is_bookmarked ? 'text-amber-400' : 'text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-amber-300'}`}
            aria-pressed={note.is_bookmarked}
            aria-label={T.starred[lang]}
          >
            <Icon name="StarIcon" variant={note.is_bookmarked ? 'solid' : 'outline'} size={15} />
          </button>
          <button
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            className="p-1.5 rounded-lg text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-foreground"
            aria-label={T.edit[lang]}
          >
            <Icon name="PencilSquareIcon" size={15} />
          </button>
          <button
            onClick={() => onDelete(note)}
            className="p-1.5 rounded-lg text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-red-400"
            aria-label={T.del[lang]}
          >
            <Icon name="TrashIcon" size={15} />
          </button>
        </div>
      )}
    </li>
  );
}
