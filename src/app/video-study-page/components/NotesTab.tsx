import React, { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';

interface Note {
  id: string;
  timestamp: string;
  text: string;
  isAuto: boolean;
  isBookmarked: boolean;
  chapter: string;
}

const initialNotes: Note[] = [
  {
    id: 'note-001',
    timestamp: '24:10',
    text: 'Peak in 1D array: element ≥ its neighbors. Exists in every non-empty array.',
    isAuto: true,
    isBookmarked: true,
    chapter: 'Peak Finding (1D)',
  },
  {
    id: 'note-002',
    timestamp: '31:22',
    text: 'Divide & conquer: check middle → if a[m-1] > a[m], recurse left; if a[m+1] > a[m], recurse right; else a[m] is peak.',
    isAuto: true,
    isBookmarked: false,
    chapter: 'Peak Finding (1D)',
  },
  {
    id: 'note-003',
    timestamp: '36:45',
    text: 'T(n) = T(n/2) + O(1) → T(n) = O(log n)',
    isAuto: true,
    isBookmarked: true,
    chapter: 'Peak Finding (1D)',
  },
  {
    id: 'note-004',
    timestamp: '38:00',
    text: 'Remember: this only finds A peak, not THE peak. Multiple peaks can exist!',
    isAuto: false,
    isBookmarked: false,
    chapter: 'Peak Finding (2D)',
  },
  {
    id: 'note-005',
    timestamp: '52:30',
    text: 'Asymptotic notation: O, Ω, Θ — captures dominant term, ignores constants.',
    isAuto: true,
    isBookmarked: false,
    chapter: 'Complexity Analysis',
  },
];

export default function NotesTab() {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [newNoteText, setNewNoteText] = useState('');
  const [filter, setFilter] = useState<'all' | 'auto' | 'manual' | 'bookmarked'>('all');

  const filteredNotes = notes.filter((n) => {
    if (filter === 'auto') return n.isAuto;
    if (filter === 'manual') return !n.isAuto;
    if (filter === 'bookmarked') return n.isBookmarked;
    return true;
  });

  const addNote = () => {
    if (!newNoteText.trim()) return;
    const note: Note = {
      id: `note-${Date.now()}`,
      timestamp: '24:10',
      text: newNoteText.trim(),
      isAuto: false,
      isBookmarked: false,
      chapter: 'Peak Finding (1D)',
    };
    setNotes((prev) => [note, ...prev]);
    setNewNoteText('');
    toast.success('Note added!');
  };

  const toggleBookmark = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isBookmarked: !n.isBookmarked } : n))
    );
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    toast.success('Note deleted');
  };

  const filterOptions: { id: typeof filter; label: string; icon?: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'auto', label: 'Auto', icon: 'SparklesIcon' },
    { id: 'manual', label: 'Manual', icon: 'PencilSquareIcon' },
    { id: 'bookmarked', label: 'Starred', icon: 'StarIcon' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Add Note */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder="Add a note… (current: 24:10)"
          rows={2}
          className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none mb-2"
        />
        <button
          onClick={addNote}
          disabled={!newNoteText.trim()}
          className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 shadow-glow-indigo-sm"
        >
          <Icon name="PlusIcon" size={14} />
          Add Note
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-border flex-shrink-0">
        {filterOptions.map((opt) => (
          <button
            key={`filter-${opt.id}`}
            onClick={() => setFilter(opt.id)}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-150 ${
              filter === opt.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
            }`}
          >
            {opt.icon && (
              <Icon name={opt.icon as Parameters<typeof Icon>[0]['name']} size={12} className={filter === opt.id ? 'text-white' : 'text-indigo-400'} />
            )}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Icon name="DocumentTextIcon" size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No notes here yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first note above</p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className="bg-surface-card rounded-xl border border-border/80 p-3 group transition-all duration-150 hover:border-indigo-500/30"
            >
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-surface-elevated text-cyan-400 flex-shrink-0 tabular-nums">
                  {note.timestamp}
                </span>
                {note.isAuto ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                    <Icon name="SparklesIcon" size={10} className="text-indigo-400" />
                    <span>AI Auto</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                    <Icon name="PencilSquareIcon" size={10} className="text-cyan-400" />
                    <span>You</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground leading-relaxed mt-2 font-mono">{note.text}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-muted-foreground">{note.chapter}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={() => toggleBookmark(note.id)}
                    className={`p-1 rounded-md hover:bg-surface-elevated transition-all duration-150 ${
                      note.isBookmarked ? 'text-amber-400' : 'text-muted-foreground'
                    }`}
                    aria-label="Bookmark note"
                  >
                    <Icon name="StarIcon" size={14} className={note.isBookmarked ? 'text-amber-400 fill-amber-400' : ''} />
                  </button>
                  {!note.isAuto && (
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all duration-150"
                      aria-label="Delete note"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Export Bar */}
      <div className="p-3 border-t border-border flex-shrink-0">
        <p className="text-xs text-muted-foreground mb-2 font-medium">Export Notes:</p>
        <div className="flex gap-2">
          {[
            { id: 'export-notion', label: 'Notion', icon: 'ArrowUpOnSquareIcon', color: 'text-purple-400' },
            { id: 'export-pdf', label: 'PDF', icon: 'DocumentTextIcon', color: 'text-cyan-400' },
            { id: 'export-docs', label: 'Docs', icon: 'DocumentDuplicateIcon', color: 'text-emerald-400' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => toast.success(`${btn.label} export initiated!`)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 hover:bg-surface-elevated transition-all duration-150"
            >
              <Icon name={btn.icon as Parameters<typeof Icon>[0]['name']} size={12} className={btn.color} />
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}