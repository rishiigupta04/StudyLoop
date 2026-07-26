import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('MIT 6.006: Introduction to Algorithms');
  const [newTimestamp, setNewTimestamp] = useState('10:00');
  const [newCategory, setNewCategory] = useState<'Math' | 'Summary' | 'Key Takeaway' | 'Code'>('Key Takeaway');
  const [newTags, setNewTags] = useState('Algorithms, Notes');

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
    toast.success('Note deleted!');
  };

  const exportNoteToNotion = (note: NoteItem) => {
    awardXP(15, `Exported "${note.title}" to Notion!`);
    toast.success(`Note "${note.title}" exported to Notion! (+15 XP)`);
  };

  const exportAllNotes = () => {
    awardXP(50, 'Exported all notes to Notion & PDF!');
    toast.success('Exported all 67 timestamped notes to Notion & PDF! (+50 XP)');
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

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

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
    setShowAddModal(false);
    setNewTitle('');
    setNewContent('');
    awardXP(25, 'Created manual timestamped note!');
    toast.success('Created new study note! (+25 XP)');
  };

  const uniqueVideos = Array.from(new Set(notes.map((n) => n.videoTitle)));

  return (
    <div className="flex h-screen bg-obsidian text-foreground overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar activeRoute="/notes" />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="px-8 py-5 border-b border-border/80 bg-surface-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Icon name="DocumentTextIcon" size={22} />
              </div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Timestamped Study Notes
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-bold font-mono">
                {notes.length} Notes Saved
              </span>
            </div>
            <p className="text-xs text-foreground-muted">
              Auto-captured during video copilot sessions & linked to exact lecture timestamps.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2"
            >
              <Icon name="PlusIcon" size={16} />
              New Note
            </button>
            <button
              onClick={exportAllNotes}
              className="px-4 py-2.5 rounded-xl bg-surface-card border border-indigo-500/30 text-xs font-bold text-indigo-300 hover:bg-surface-elevated hover:border-indigo-500/60 transition-colors flex items-center gap-2"
            >
              <Icon name="ArrowUpOnSquareIcon" size={16} />
              Export All (Notion / PDF)
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

          {/* Filter Tabs & Video Select */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Video Course Selector */}
            <select
              value={selectedVideoFilter}
              onChange={(e) => setSelectedVideoFilter(e.target.value)}
              className="input-field rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer max-w-[220px] truncate"
            >
              <option value="all">All Course Videos ({notes.length})</option>
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
                📐 Math & Formulas
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

        {/* Notes Grid Display Area */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-20 bg-surface-card/40 border border-border/60 rounded-3xl p-8 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <Icon name="DocumentTextIcon" size={24} />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">No notes match your filters</h3>
              <p className="text-xs text-foreground-muted mb-6">
                Try searching with a different term or clear your active category filters.
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
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
              {filteredNotes.map((note) => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="p-6 rounded-3xl bg-surface-card border border-border/80 flex flex-col justify-between relative overflow-hidden card-hover group"
                >
                  <div>
                    {/* Note Card Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-xs font-bold text-indigo-400 truncate max-w-[200px]" title={note.videoTitle}>
                        {note.videoTitle}
                      </span>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => exportNoteToNotion(note)}
                        className="p-1.5 rounded-lg bg-surface-elevated hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/20 transition-colors flex items-center gap-1"
                        title="Export this note to Notion"
                      >
                        <Icon name="ArrowUpOnSquareIcon" size={14} />
                        <span className="text-[10px] font-semibold">Notion</span>
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
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Manual Add Note Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-lg p-6 rounded-3xl bg-surface-card border border-indigo-500/30 shadow-2xl relative"
            >
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Icon name="DocumentPlusIcon" size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Create Manual Timestamped Note</h3>
                  <p className="text-xs text-foreground-muted">Add a custom note linked to any lecture video.</p>
                </div>
              </div>

              <form onSubmit={handleCreateNote} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-muted-foreground mb-1">Note Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Learning Rate α Sensitivity Analysis"
                    className="w-full input-field rounded-xl px-4 py-2.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Course Video</label>
                    <select
                      value={newVideoTitle}
                      onChange={(e) => setNewVideoTitle(e.target.value)}
                      className="w-full input-field rounded-xl px-3 py-2.5 cursor-pointer truncate"
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
                      className="w-full input-field rounded-xl px-4 py-2.5 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-muted-foreground mb-1">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full input-field rounded-xl px-3 py-2.5 cursor-pointer"
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
                      className="w-full input-field rounded-xl px-4 py-2.5"
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
                    className="w-full input-field rounded-xl px-4 py-2.5"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-surface-elevated text-muted-foreground hover:text-foreground font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-6 py-2.5 rounded-xl font-bold text-white shadow-md"
                  >
                    Save Note (+25 XP)
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
