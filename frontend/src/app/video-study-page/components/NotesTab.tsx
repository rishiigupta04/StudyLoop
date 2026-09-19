import React, { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import type { VideoNotesState } from '@/hooks/useVideoNotes';
import { editField, noteText, type Note } from '@/services/notesService';
import { formatClock } from '@/lib/time';
import { downloadText, notesToMarkdown, notesToPrintHtml, printHtml, safeFilename } from '@/lib/notesExport';

type Filter = 'all' | 'voice' | 'typed' | 'starred';

interface NotesTabProps {
  notes: VideoNotesState;
  currentTime: number;
  videoId: string;
  videoTitle: string;
  onSeek: (seconds: number) => void;
}

const FILTERS: { id: Filter; label: string; icon?: string; test: (n: Note) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'voice', label: 'Voice', icon: 'MicrophoneIcon', test: (n) => n.is_auto },
  { id: 'typed', label: 'Typed', icon: 'PencilSquareIcon', test: (n) => !n.is_auto },
  { id: 'starred', label: 'Starred', icon: 'StarIcon', test: (n) => n.is_bookmarked },
];

export default function NotesTab({ notes, currentTime, videoId, videoTitle, onSeek }: NotesTabProps) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const list = notes.notes.filter(FILTERS.find((f) => f.id === filter)!.test);

  const add = async () => {
    const text = draft.trim();
    if (!text || adding) return;
    setAdding(true);
    if (await notes.add(text, currentTime)) setDraft('');
    setAdding(false);
  };

  const saveEdit = async (n: Note) => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return toast.error('A note needs some text — delete it instead?');
    setEditing(null);
    if (text !== noteText(n)) await notes.patch(n.id, { [editField(n)]: text });
  };

  const meta = () => ({ videoId, title: videoTitle, exportedAt: new Date() });
  const exportMd = () => {
    downloadText(`${safeFilename(videoTitle || videoId)}-notes.md`, notesToMarkdown(notes.notes, meta()));
    toast.success(`Exported ${notes.notes.length} note${notes.notes.length === 1 ? '' : 's'} as Markdown`);
  };
  const exportPdf = () => printHtml(notesToPrintHtml(notes.notes, meta()));

  return (
    <div className="flex flex-col h-full">
      {/* Add Note */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add();
          }}
          placeholder={`Add a note at ${formatClock(currentTime)}…`}
          rows={2}
          aria-label="New note"
          className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none mb-2"
        />
        <button
          onClick={() => void add()}
          disabled={!draft.trim() || adding}
          className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 shadow-glow-indigo-sm"
        >
          <Icon name="PlusIcon" size={14} />
          {adding ? 'Saving…' : `Add note at ${formatClock(currentTime)}`}
        </button>
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Or hold <kbd className="font-mono px-1 rounded bg-surface-elevated border border-border">~</kbd> and say
          “note this down” / “ये नोट कर लो”
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-border flex-shrink-0" role="group" aria-label="Filter notes">
        {FILTERS.map((opt) => {
          const count = notes.notes.filter(opt.test).length;
          return (
            <button
              key={`filter-${opt.id}`}
              onClick={() => setFilter(opt.id)}
              aria-pressed={filter === opt.id}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-150 ${
                filter === opt.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
              }`}
            >
              {opt.icon && <Icon name={opt.icon} size={12} className={filter === opt.id ? 'text-white' : 'text-indigo-400'} />}
              <span>{opt.label}</span>
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {notes.loading && notes.notes.length === 0 ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-card/60 border border-border/60 animate-pulse" />
            ))}
          </div>
        ) : notes.error && notes.notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
            <p className="text-sm text-foreground">{notes.error}</p>
            <button onClick={() => void notes.reload()} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
              Try again
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Icon name="DocumentTextIcon" size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">
              {filter === 'all' ? 'No notes for this video yet' : `No ${FILTERS.find((f) => f.id === filter)!.label.toLowerCase()} notes`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Type one above, or say “note this down” while watching.</p>
          </div>
        ) : (
          list.map((n) => {
            const status = notes.summaryStatus[n.id];
            const said = n.is_auto && n.summary && n.raw_text && n.raw_text !== n.summary ? n.raw_text : null;
            const isEditing = editing?.id === n.id;
            return (
              <div
                key={n.id}
                className="bg-surface-card rounded-xl border border-border/80 p-3 group transition-all duration-150 hover:border-indigo-500/30"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSeek(n.at_s)}
                    className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-surface-elevated text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 flex-shrink-0 tabular-nums flex items-center gap-1"
                    title={`Jump to ${formatClock(n.at_s)}`}
                  >
                    <Icon name="PlayIcon" size={10} />
                    {formatClock(n.at_s)}
                  </button>
                  {n.is_auto ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                      <Icon name="MicrophoneIcon" size={10} className="text-indigo-400" />
                      Voice
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                      <Icon name="PencilSquareIcon" size={10} className="text-cyan-400" />
                      Typed
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => void notes.patch(n.id, { is_bookmarked: !n.is_bookmarked })}
                      className={`p-1 rounded-md hover:bg-surface-elevated ${n.is_bookmarked ? 'text-amber-400' : 'text-muted-foreground'}`}
                      aria-label={n.is_bookmarked ? 'Unstar note' : 'Star note'}
                      aria-pressed={n.is_bookmarked}
                    >
                      <Icon name="StarIcon" variant={n.is_bookmarked ? 'solid' : 'outline'} size={14} />
                    </button>
                    <button
                      onClick={() => setEditing({ id: n.id, text: noteText(n) })}
                      className="p-1 rounded-md hover:bg-surface-elevated text-muted-foreground hover:text-foreground"
                      aria-label="Edit note"
                    >
                      <Icon name="PencilIcon" size={14} />
                    </button>
                    <button
                      onClick={() => void notes.remove(n.id)}
                      className="p-1 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                      aria-label="Delete note"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-2">
                    <textarea
                      autoFocus
                      value={editing.text}
                      onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveEdit(n);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      rows={3}
                      aria-label="Edit note text"
                      className="input-field w-full rounded-lg px-2.5 py-2 text-xs text-foreground resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-1.5">
                      <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                        Cancel
                      </button>
                      <button onClick={() => void saveEdit(n)} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md px-2.5 py-1">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-foreground leading-relaxed mt-2 whitespace-pre-wrap">{noteText(n)}</p>
                    {status === 'pending' && (
                      <p className="text-[11px] text-indigo-300 mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Writing a summary from the last minute…
                      </p>
                    )}
                    {status === 'failed' && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">Summary unavailable right now — kept what you said.</p>
                    )}
                    {status === 'skipped' && !n.summary && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">No transcript here to summarize — kept what you said.</p>
                    )}
                    {said && <p className="text-[11px] text-muted-foreground mt-1.5 italic">You said: “{said}”</p>}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Export Bar */}
      <div className="p-3 border-t border-border flex-shrink-0">
        <div className="flex gap-2">
          <button
            onClick={exportMd}
            disabled={!notes.notes.length}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 hover:bg-surface-elevated transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon name="ArrowDownTrayIcon" size={12} className="text-emerald-400" />
            Markdown
          </button>
          <button
            onClick={exportPdf}
            disabled={!notes.notes.length}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 hover:bg-surface-elevated transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
            title="Opens the print dialog — choose “Save as PDF”"
          >
            <Icon name="DocumentTextIcon" size={12} className="text-cyan-400" />
            PDF
          </button>
        </div>
      </div>
    </div>
  );
}
