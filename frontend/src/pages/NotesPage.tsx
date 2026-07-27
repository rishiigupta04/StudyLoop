import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useGamification } from '@/context/GamificationContext';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  videoTitle: string;
  videoUrl: string;
  timestamp: string; // e.g. "24:10"
  seconds: number;
  category: 'Math' | 'Summary' | 'Key Takeaway' | 'Code';
  tags: string[];
  starred: boolean;
  createdAt: string;
}

const INITIAL_NOTES: NoteItem[] = [
  {
    id: 'note-1',
    title: 'Gradient Descent Optimization Rule',
    content: 'The weight parameter update rule is given by θ := θ - α ∇J(θ). Setting learning rate α too high causes divergence, while α too small leads to slow convergence.',
    videoTitle: 'Stanford CS229: Gradient Descent & Cost Functions',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    timestamp: '18:45',
    seconds: 1125,
    category: 'Math',
    tags: ['Machine Learning', 'Gradient Descent', 'Optimization'],
    starred: true,
    createdAt: '2026-07-26',
  },
  {
    id: 'note-2',
    title: '1D Peak Finding Divide & Conquer Complexity',
    content: 'Checking array midpoint A[n/2] in 1D array peak finding allows recursive reduction of search space by half. Total time complexity is O(log n).',
    videoTitle: 'MIT 6.006: Introduction to Algorithms',
    videoUrl: 'https://www.youtube.com/watch?v=HtSuA80QTyo',
    timestamp: '24:10',
    seconds: 1450,
    category: 'Key Takeaway',
    tags: ['Algorithms', 'Divide & Conquer', 'Complexity'],
    starred: true,
    createdAt: '2026-07-25',
  },
  {
    id: 'note-3',
    title: 'Escaping Saddle Points with Momentum',
    content: 'Saddle points exhibit zero gradients ∇J(θ) ≈ 0. Momentum updates (v_t = β v_{t-1} + (1-β) ∇J) maintain velocity to propel optimization past flat plateaus.',
    videoTitle: 'Stanford CS229: Gradient Descent & Cost Functions',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    timestamp: '28:30',
    seconds: 1710,
    category: 'Math',
    tags: ['Deep Learning', 'Momentum', 'Adam'],
    starred: false,
    createdAt: '2026-07-25',
  },
  {
    id: 'note-4',
    title: 'Backpropagation Chain Rule Derivation',
    content: 'Gradient computation across computational graphs propagates partial derivatives backward using the chain rule: ∂L/∂w = ∂L/∂a · ∂a/∂z · ∂z/∂w.',
    videoTitle: 'Harvard CS50: Neural Networks & Backprop',
    videoUrl: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
    timestamp: '34:20',
    seconds: 2060,
    category: 'Math',
    tags: ['Neural Networks', 'Backprop', 'Calculus'],
    starred: true,
    createdAt: '2026-07-24',
  },
  {
    id: 'note-5',
    title: 'Balanced Binary Search Trees & AVL Rotations',
    content: 'Left and right tree rotations preserve BST invariants while rebalancing height to guarantee O(log n) lookup, insertion, and deletion times.',
    videoTitle: 'IIT Kharagpur: Data Structures & Algorithms',
    videoUrl: 'https://www.youtube.com/watch?v=95s3hiZ_5_Q',
    timestamp: '15:40',
    seconds: 940,
    category: 'Key Takeaway',
    tags: ['Data Structures', 'Trees', 'AVL'],
    starred: false,
    createdAt: '2026-07-23',
  },
  {
    id: 'note-6',
    title: 'Python Memory Management & Reference Counting',
    content: 'Cpython uses reference counting coupled with a generational garbage collector to track object lifetimes and resolve cyclical references.',
    videoTitle: 'MIT 6.0001: Introduction to Computer Science',
    videoUrl: 'https://www.youtube.com/watch?v=k6U-i4gXkLM',
    timestamp: '41:15',
    seconds: 2475,
    category: 'Code',
    tags: ['Python', 'Memory', 'CPython'],
    starred: false,
    createdAt: '2026-07-22',
  },
];

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'starred' | 'math' | 'summary'>('all');
  const [selectedVideoFilter, setSelectedVideoFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'outline'>('grid');
  
  // Selection state for bulk operations
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  // Form states for manual creation / edit
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('MIT 6.006: Introduction to Algorithms');
  const [newTimestamp, setNewTimestamp] = useState('10:00');
  const [newCategory, setNewCategory] = useState<'Math' | 'Summary' | 'Key Takeaway' | 'Code'>('Key Takeaway');
  const [newTags, setNewTags] = useState('Algorithms, Notes');

  // Quiz Flashcards state
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const { awardXP } = useGamification();
  const navigate = useNavigate();

  // Filter logic
  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'starred' && n.starred) ||
      (activeTab === 'math' && n.category === 'Math') ||
      (activeTab === 'summary' && (n.category === 'Summary' || n.category === 'Key Takeaway'));

    const matchesVideo = selectedVideoFilter === 'all' || n.videoTitle === selectedVideoFilter;

    return matchesSearch && matchesTab && matchesVideo;
  });

  const toggleStar = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, starred: !n.starred } : n))
    );
    toast.success('Updated note star status!');
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNoteIds((prev) => prev.filter((i) => i !== id));
    toast.success('Note deleted!');
  };

  const handleToggleSelectNote = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllNotes = () => {
    if (selectedNoteIds.length === filteredNotes.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(filteredNotes.map((n) => n.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedNoteIds.length === 0) return;
    setNotes((prev) => prev.filter((n) => !selectedNoteIds.includes(n.id)));
    toast.success(`Deleted ${selectedNoteIds.length} notes!`);
    setSelectedNoteIds([]);
  };

  const handleBulkStar = () => {
    if (selectedNoteIds.length === 0) return;
    setNotes((prev) =>
      prev.map((n) => (selectedNoteIds.includes(n.id) ? { ...n, starred: true } : n))
    );
    toast.success(`Starred ${selectedNoteIds.length} notes!`);
  };

  const handleBulkExportNotion = () => {
    const count = selectedNoteIds.length || notes.length;
    awardXP(count * 10, `Exported ${count} notes to Notion!`);
    toast.success(`Exported ${count} selected notes to Notion! (+${count * 10} XP)`);
  };

  const exportAnkiCSV = () => {
    const csvContent = notes.map((n) => `"${n.title}","${n.content.replace(/"/g, '""')} @ ${n.timestamp}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studyloop_anki_deck.csv';
    a.click();
    awardXP(25, 'Exported Anki Spaced Repetition Deck!');
    toast.success('Exported Anki CSV Deck! (+25 XP)');
  };

  const copyMarkdownToClipboard = (note: NoteItem) => {
    const md = `### [${note.timestamp}] ${note.title}\n**Lecture**: ${note.videoTitle}\n\n${note.content}\n\n*Tags*: ${note.tags.join(', ')}`;
    navigator.clipboard.writeText(md);
    toast.success('Copied Markdown to clipboard!');
  };

  const handleNavigateToTimestamp = (note: NoteItem) => {
    navigate('/video-study-page', {
      state: {
        videoUrl: note.videoUrl,
        videoTitle: note.videoTitle,
        timestamp: note.timestamp,
        seconds: note.seconds,
      },
    });
    toast.info(`Seeking ${note.videoTitle} to timestamp ${note.timestamp}`);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    if (editingNote) {
      // Update existing note
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNote.id
            ? {
                ...n,
                title: newTitle.trim(),
                content: newContent.trim(),
                videoTitle: newVideoTitle,
                timestamp: newTimestamp.trim() || '00:00',
                category: newCategory,
                tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
              }
            : n
        )
      );
      toast.success('Updated note details!');
      setEditingNote(null);
    } else {
      // Create new note
      const createdNote: NoteItem = {
        id: `note-${Date.now()}`,
        title: newTitle.trim(),
        content: newContent.trim(),
        videoTitle: newVideoTitle,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        timestamp: newTimestamp.trim() || '00:00',
        seconds: 600,
        category: newCategory,
        tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
        starred: false,
        createdAt: new Date().toISOString().split('T')[0],
      };

      setNotes([createdNote, ...notes]);
      awardXP(25, 'Created manual timestamped note!');
      toast.success('Created new study note! (+25 XP)');
    }

    setShowAddModal(false);
    setNewTitle('');
    setNewContent('');
  };

  const openEditModal = (note: NoteItem) => {
    setEditingNote(note);
    setNewTitle(note.title);
    setNewContent(note.content);
    setNewVideoTitle(note.videoTitle);
    setNewTimestamp(note.timestamp);
    setNewCategory(note.category);
    setNewTags(note.tags.join(', '));
    setShowAddModal(true);
  };

  const openNewNoteModal = () => {
    setEditingNote(null);
    setNewTitle('');
    setNewContent('');
    setNewTimestamp('10:00');
    setNewCategory('Key Takeaway');
    setNewTags('Algorithms, Notes');
    setShowAddModal(true);
  };

  const uniqueVideos = Array.from(new Set(notes.map((n) => n.videoTitle)));

  return (
    <AppLayout activeRoute="/notes">
      <div className="flex-1 flex flex-col min-h-screen bg-obsidian">
        {/* Top Header */}
        <header className="px-6 py-6 border-b border-border/80 bg-surface-card/60 flex flex-col md:flex-row md:items-center justify-between gap-5 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3.5 mb-1.5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Icon name="DocumentTextIcon" size={22} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight leading-none">
                  Timestamped Study Notes
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-bold font-mono">
                  {notes.length} Notes Saved
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-foreground-muted pl-0 sm:pl-[58px] max-w-2xl leading-relaxed mt-1">
              Auto-captured during video copilot sessions & linked to exact lecture timestamps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setCurrentQuizIndex(0);
                setShowAnswer(false);
                setQuizScore(0);
                setShowQuizModal(true);
              }}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-xs font-bold text-white shadow-md hover:brightness-110 transition-all flex items-center gap-2"
            >
              <Icon name="SparklesIcon" size={16} />
              AI Flashcards Quiz
            </button>
            <button
              onClick={openNewNoteModal}
              className="btn-primary px-4 py-2.5 rounded-2xl text-xs font-bold text-white flex items-center gap-2 shadow-glow-indigo-sm"
            >
              <Icon name="PlusIcon" size={16} />
              New Note
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2.5 rounded-2xl bg-surface-card border border-indigo-500/30 text-xs font-bold text-indigo-300 hover:bg-surface-elevated hover:border-indigo-500/60 transition-colors flex items-center gap-2"
            >
              <Icon name="ArrowUpOnSquareIcon" size={16} />
              Export Hub
            </button>
          </div>
        </header>

        {/* Filter Controls & Search Bar */}
        <div className="px-8 py-4 border-b border-border/60 bg-[#121624] flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, formulas, or tags..."
              className="w-full input-field rounded-xl pl-10 pr-4 py-2 text-xs font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            )}
          </div>

          {/* View Mode & Filter Tabs */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Selector (Grid / Table / Outline) */}
            <div className="flex items-center bg-obsidian border border-border/80 rounded-xl p-1 gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Grid View"
              >
                <Icon name="Squares2X2Icon" size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Table View"
              >
                <Icon name="Bars3Icon" size={16} />
              </button>
              <button
                onClick={() => setViewMode('outline')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'outline' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Lectures Grouped Outline View"
              >
                <Icon name="ListBulletIcon" size={16} />
              </button>
            </div>

            {/* Video Course Selector */}
            <select
              value={selectedVideoFilter}
              onChange={(e) => setSelectedVideoFilter(e.target.value)}
              className="input-field rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Videos ({notes.length})</option>
              {uniqueVideos.map((v) => (
                <option key={`vid-opt-${v}`} value={v}>
                  {v}
                </option>
              ))}
            </select>

            {/* Filter Tabs */}
            <div className="flex items-center bg-obsidian border border-border/80 rounded-xl p-1 gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({notes.length})
              </button>
              <button
                onClick={() => setActiveTab('starred')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  activeTab === 'starred'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="StarIcon" size={12} className="text-amber-400" />
                <span>Starred</span>
              </button>
              <button
                onClick={() => setActiveTab('math')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'math'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📐 Math
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'summary'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📝 Summaries
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedNoteIds.length > 0 && (
          <div className="px-8 py-2.5 bg-indigo-950/80 border-b border-indigo-500/40 flex items-center justify-between text-xs text-indigo-200">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedNoteIds.length === filteredNotes.length}
                onChange={handleSelectAllNotes}
                className="rounded border-indigo-500/50 bg-obsidian cursor-pointer"
              />
              <span className="font-bold">{selectedNoteIds.length} notes selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkStar}
                className="px-3 py-1 rounded-lg bg-indigo-600/50 hover:bg-indigo-600 font-semibold border border-indigo-500/40"
              >
                ⭐ Star Selected
              </button>
              <button
                onClick={handleBulkExportNotion}
                className="px-3 py-1 rounded-lg bg-cyan-600/50 hover:bg-cyan-600 font-semibold border border-cyan-500/40 text-cyan-200"
              >
                📤 Notion Export
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1 rounded-lg bg-red-600/50 hover:bg-red-600 font-semibold border border-red-500/40 text-red-200"
              >
                🗑️ Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Notes Display Area (Grid / Table / Outline) */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-20 bg-surface-card/40 border border-border/60 rounded-3xl p-8 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <Icon name="DocumentTextIcon" size={24} />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">No notes match your search</h3>
              <p className="text-xs text-foreground-muted mb-6">
                Try searching with a different term or clear your active filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('all');
                  setSelectedVideoFilter('all');
                }}
                className="px-4 py-2 rounded-xl bg-surface-elevated text-xs font-bold text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/60"
              >
                Reset Filters
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* ── Executive High-Density Table View ── */
            <div className="bg-surface-card border border-border/80 rounded-3xl overflow-hidden max-w-7xl mx-auto shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#121624] border-b border-border/80 text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedNoteIds.length === filteredNotes.length}
                        onChange={handleSelectAllNotes}
                        className="rounded cursor-pointer"
                      />
                    </th>
                    <th className="p-4">Timestamp & Lecture</th>
                    <th className="p-4">Note Title</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Preview</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredNotes.map((note) => (
                    <tr key={`tbl-${note.id}`} className="hover:bg-surface-elevated/40 transition-colors group">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedNoteIds.includes(note.id)}
                          onChange={() => handleToggleSelectNote(note.id)}
                          className="rounded cursor-pointer"
                        />
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <button
                          onClick={() => handleNavigateToTimestamp(note)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-950 border border-indigo-500/30 text-cyan-300 font-mono font-bold hover:bg-indigo-900 transition-colors flex items-center gap-1"
                        >
                          <Icon name="PlayCircleIcon" size={14} className="text-indigo-400" />
                          <span>{note.timestamp}</span>
                        </button>
                        <span className="text-[11px] text-muted-foreground truncate block mt-1 max-w-[180px]">
                          {note.videoTitle}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-foreground max-w-[200px] truncate">
                        {note.title}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-[10px] font-bold text-indigo-300">
                          {note.category}
                        </span>
                      </td>
                      <td className="p-4 text-foreground-muted max-w-md truncate">
                        {note.content}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleStar(note.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-amber-400"
                            title="Star"
                          >
                            <Icon name="StarIcon" size={14} className={note.starred ? 'text-amber-400 fill-amber-400' : ''} />
                          </button>
                          <button
                            onClick={() => copyMarkdownToClipboard(note)}
                            className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-cyan-300"
                            title="Copy Markdown"
                          >
                            <Icon name="ClipboardDocumentIcon" size={14} />
                          </button>
                          <button
                            onClick={() => openEditModal(note)}
                            className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-indigo-300"
                            title="Edit"
                          >
                            <Icon name="PencilSquareIcon" size={14} />
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                            title="Delete"
                          >
                            <Icon name="TrashIcon" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : viewMode === 'outline' ? (
            /* ── Lectures Grouped Outline View ── */
            <div className="space-y-8 max-w-5xl mx-auto">
              {uniqueVideos.map((video) => {
                const videoNotes = filteredNotes.filter((n) => n.videoTitle === video);
                if (videoNotes.length === 0) return null;
                return (
                  <div key={`out-group-${video}`} className="p-6 rounded-3xl bg-surface-card border border-border/80">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                      <div className="flex items-center gap-3">
                        <Icon name="PlayCircleIcon" size={20} className="text-indigo-400" />
                        <h3 className="text-lg font-bold text-foreground">{video}</h3>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-bold font-mono">
                        {videoNotes.length} Notes
                      </span>
                    </div>

                    <div className="space-y-3">
                      {videoNotes.map((note) => (
                        <div
                          key={`out-note-${note.id}`}
                          className="p-4 rounded-2xl bg-[#0B0E17] border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-500/30 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => handleNavigateToTimestamp(note)}
                              className="px-2.5 py-1 rounded-xl bg-indigo-950 border border-indigo-500/40 text-cyan-300 font-mono font-bold text-xs shrink-0 hover:bg-indigo-900"
                            >
                              {note.timestamp}
                            </button>
                            <div>
                              <h4 className="font-bold text-foreground text-sm mb-1">{note.title}</h4>
                              <p className="text-xs text-foreground-muted leading-relaxed">{note.content}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              onClick={() => copyMarkdownToClipboard(note)}
                              className="p-1.5 rounded-lg bg-surface-card hover:bg-surface-elevated text-xs font-semibold text-muted-foreground hover:text-cyan-300 flex items-center gap-1 border border-border"
                            >
                              <Icon name="ClipboardDocumentIcon" size={14} />
                              <span>Copy MD</span>
                            </button>
                            <button
                              onClick={() => openEditModal(note)}
                              className="p-1.5 rounded-lg bg-surface-card hover:bg-surface-elevated text-xs font-semibold text-muted-foreground hover:text-indigo-300 border border-border"
                            >
                              <Icon name="PencilSquareIcon" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Default Grid View ── */
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {filteredNotes.map((note) => {
                const isSelected = selectedNoteIds.includes(note.id);
                return (
                  <motion.div
                    key={note.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className={`p-6 rounded-3xl bg-surface-card border transition-all duration-200 flex flex-col justify-between relative overflow-hidden card-hover group ${
                      isSelected ? 'border-indigo-500 bg-indigo-950/20 shadow-lg' : 'border-border/80'
                    }`}
                  >
                    <div>
                      {/* Checkbox Select & Note Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectNote(note.id)}
                            className="rounded border-border bg-obsidian cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-bold text-indigo-400 truncate max-w-[180px]" title={note.videoTitle}>
                            {note.videoTitle}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleStar(note.id)}
                          className="p-1 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-amber-400 transition-colors"
                          title={note.starred ? 'Unstar note' : 'Star note'}
                        >
                          <Icon
                            name="StarIcon"
                            size={16}
                            className={note.starred ? 'text-amber-400 fill-amber-400' : ''}
                          />
                        </button>
                      </div>

                      {/* Clickable Video Timestamp Navigation Button */}
                      <button
                        onClick={() => handleNavigateToTimestamp(note)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-xs font-bold font-mono text-cyan-300 hover:bg-indigo-900 transition-colors mb-3 group/ts"
                        title="Jump directly to lecture timestamp in Video Workspace"
                      >
                        <Icon name="PlayCircleIcon" size={14} className="text-indigo-400 group-hover/ts:scale-110 transition-transform" />
                        <span>{note.timestamp}</span>
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">▸ Seek</span>
                      </button>

                      {/* Note Title & Content */}
                      <h3 className="text-base font-bold text-foreground mb-2 leading-snug">{note.title}</h3>
                      <p className="text-xs text-foreground-muted leading-relaxed mb-4 font-sans whitespace-pre-wrap">
                        {note.content}
                      </p>

                      {/* Tag Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-[10px] font-bold text-indigo-300">
                          {note.category}
                        </span>
                        {note.tags.map((t) => (
                          <span key={`tag-${note.id}-${t}`} className="px-2 py-0.5 rounded-md bg-obsidian text-[10px] font-medium text-muted-foreground border border-border/40">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="text-[10px] font-mono">{note.createdAt}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyMarkdownToClipboard(note)}
                          className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-cyan-300 transition-colors"
                          title="Copy Markdown"
                        >
                          <Icon name="ClipboardDocumentIcon" size={14} />
                        </button>
                        <button
                          onClick={() => openEditModal(note)}
                          className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-indigo-300 transition-colors"
                          title="Edit Note"
                        >
                          <Icon name="PencilSquareIcon" size={14} />
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete note"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual Create / Edit Note Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-lg p-7 rounded-3xl bg-[#151926] border border-indigo-500/50 shadow-2xl relative text-left"
            >
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated border border-border/80 transition-colors"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Icon name={editingNote ? 'PencilSquareIcon' : 'DocumentPlusIcon'} size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {editingNote ? 'Edit Timestamped Note' : 'Create Timestamped Note'}
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    {editingNote ? 'Update note details & lecture links.' : 'Add a custom note linked to any lecture video.'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-muted-foreground mb-1">Note Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Learning Rate α Sensitivity Analysis"
                    className="w-full input-field rounded-xl px-4 py-2.5 bg-[#0B0E17]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Course Video</label>
                    <select
                      value={newVideoTitle}
                      onChange={(e) => setNewVideoTitle(e.target.value)}
                      className="w-full input-field rounded-xl px-3 py-2.5 cursor-pointer truncate bg-[#0B0E17]"
                    >
                      {uniqueVideos.map((v) => (
                        <option key={`modal-vid-${v}`} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Timestamp</label>
                    <input
                      type="text"
                      required
                      value={newTimestamp}
                      onChange={(e) => setNewTimestamp(e.target.value)}
                      placeholder="e.g. 18:45"
                      className="w-full input-field rounded-xl px-4 py-2.5 font-mono bg-[#0B0E17]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full input-field rounded-xl px-3 py-2.5 cursor-pointer bg-[#0B0E17]"
                    >
                      <option value="Math">📐 Math & Formulas</option>
                      <option value="Key Takeaway">💡 Key Takeaway</option>
                      <option value="Summary">📝 Summary</option>
                      <option value="Code">💻 Code</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Tags (Comma separated)</label>
                    <input
                      type="text"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      placeholder="Algorithms, Calculus"
                      className="w-full input-field rounded-xl px-4 py-2.5 bg-[#0B0E17]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-muted-foreground mb-1">Note Content</label>
                  <textarea
                    required
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Write key equations, takeaways, or concepts..."
                    className="w-full input-field rounded-xl px-4 py-2.5 bg-[#0B0E17]"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-surface-elevated border border-border text-muted-foreground hover:text-foreground font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-6 py-2.5 rounded-xl font-bold text-white shadow-md"
                  >
                    {editingNote ? 'Save Changes' : 'Create Note (+25 XP)'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Active Recall Flashcard Quiz Modal */}
      <AnimatePresence>
        {showQuizModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md p-7 rounded-3xl bg-[#151926] border border-indigo-500/50 shadow-2xl relative text-left"
            >
              <button
                onClick={() => setShowQuizModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated border border-border/80 transition-colors"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[10px] font-extrabold">
                  AI Active Recall Mode
                </span>
                <span className="text-xs font-mono text-muted-foreground ml-auto">
                  Card {currentQuizIndex + 1} of {notes.length}
                </span>
              </div>

              {/* Flashcard Question Body */}
              <div className="p-6 rounded-2xl bg-[#0B0E17] border border-border/80 text-center min-h-[180px] flex flex-col justify-center items-center mb-6 relative">
                <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider mb-2">
                  {notes[currentQuizIndex]?.videoTitle} @ {notes[currentQuizIndex]?.timestamp}
                </span>
                <h4 className="text-base font-bold text-foreground mb-3">
                  {notes[currentQuizIndex]?.title}
                </h4>

                {showAnswer ? (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-cyan-300 leading-relaxed font-sans bg-indigo-950 p-3 rounded-xl border border-indigo-500/40 w-full"
                  >
                    {notes[currentQuizIndex]?.content}
                  </motion.p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Tap below to reveal the AI explanation & equation summary...
                  </p>
                )}
              </div>

              {/* Card Flip & Next Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="flex-1 py-3 rounded-xl bg-surface-elevated border border-border font-bold text-xs text-foreground hover:bg-surface-elevated/80 transition-colors"
                >
                  {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </button>
                <button
                  onClick={() => {
                    setShowAnswer(false);
                    if (currentQuizIndex + 1 < notes.length) {
                      setCurrentQuizIndex(currentQuizIndex + 1);
                      setQuizScore((prev) => prev + 1);
                    } else {
                      awardXP(30, 'Completed AI Flashcards Quiz!');
                      toast.success(`Completed Active Recall Quiz! (+30 XP)`);
                      setShowQuizModal(false);
                    }
                  }}
                  className="btn-primary flex-1 py-3 rounded-xl font-bold text-xs text-white shadow-md"
                >
                  {currentQuizIndex + 1 < notes.length ? 'Next Card' : 'Finish Quiz (+30 XP)'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Multi-Format Export Hub Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md p-7 rounded-3xl bg-[#151926] border border-indigo-500/50 shadow-2xl relative text-left"
            >
              <button
                onClick={() => setShowExportModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated border border-border/80 transition-colors"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Icon name="ArrowUpOnSquareIcon" size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Multi-Format Export Hub</h3>
                  <p className="text-xs text-foreground-muted">Export all {notes.length} timestamped notes to your favorite tools.</p>
                </div>
              </div>

              <div className="space-y-3 text-xs mb-6">
                <button
                  onClick={() => {
                    handleBulkExportNotion();
                    setShowExportModal(false);
                  }}
                  className="w-full p-4 rounded-2xl bg-[#1E2235] hover:bg-[#252A42] border border-indigo-500/40 flex items-center justify-between text-left group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🚀</span>
                    <div>
                      <h4 className="font-bold text-foreground group-hover:text-indigo-300">Notion Database Sync</h4>
                      <p className="text-[11px] text-muted-foreground">Sync timestamped notes & math equations to Notion.</p>
                    </div>
                  </div>
                  <Icon name="ChevronRightIcon" size={16} className="text-muted-foreground group-hover:text-indigo-300" />
                </button>

                <button
                  onClick={() => {
                    exportAnkiCSV();
                    setShowExportModal(false);
                  }}
                  className="w-full p-4 rounded-2xl bg-[#1E2235] hover:bg-[#252A42] border border-cyan-500/40 flex items-center justify-between text-left group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🎴</span>
                    <div>
                      <h4 className="font-bold text-foreground group-hover:text-cyan-300">Anki Flashcards (.CSV)</h4>
                      <p className="text-[11px] text-muted-foreground">Export flashcard deck for spaced repetition review.</p>
                    </div>
                  </div>
                  <Icon name="ChevronRightIcon" size={16} className="text-muted-foreground group-hover:text-cyan-300" />
                </button>

                <button
                  onClick={() => {
                    window.print();
                    setShowExportModal(false);
                  }}
                  className="w-full p-4 rounded-2xl bg-[#1E2235] hover:bg-[#252A42] border border-emerald-500/40 flex items-center justify-between text-left group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <h4 className="font-bold text-foreground group-hover:text-emerald-300">Print / Save as PDF</h4>
                      <p className="text-[11px] text-muted-foreground">Generate printable PDF study cheat sheet.</p>
                    </div>
                  </div>
                  <Icon name="ChevronRightIcon" size={16} className="text-muted-foreground group-hover:text-emerald-300" />
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-elevated border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
