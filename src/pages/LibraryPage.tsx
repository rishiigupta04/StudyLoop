import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

interface LibraryVideo {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  category: string;
  thumbnail: string;
  duration: string;
  progressPercent: number;
  lastTimestamp: string;
  status: 'completed' | 'in-progress' | 'not-started';
  lastStudiedAt: string;
  notesCount: number;
  questionsCount: number;
  isBookmarked: boolean;
  chapters: { time: string; title: string }[];
  topTakeaway: string;
}

interface CoursePlaylist {
  id: string;
  title: string;
  institution: string;
  videoCount: number;
  progressPercent: number;
  totalDuration: string;
  videoIds: string[];
}

const mockLibraryVideos: LibraryVideo[] = [
  {
    id: 'lib-001',
    videoId: 'dQw4w9WgXcQ',
    title: 'MIT 6.006 Introduction to Algorithms — Lecture 1: Peak Finding',
    channel: 'MIT OpenCourseWare',
    category: 'Algorithms',
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
    duration: '1:20:00',
    progressPercent: 65,
    lastTimestamp: '24:10',
    status: 'in-progress',
    lastStudiedAt: '2 hours ago',
    notesCount: 7,
    questionsCount: 12,
    isBookmarked: true,
    chapters: [
      { time: '0:00', title: 'Introduction & Course Goals' },
      { time: '4:32', title: 'Course Overview & Prerequisites' },
      { time: '12:15', title: 'Algorithmic Thinking' },
      { time: '24:10', title: 'Peak Finding (1D Array)' },
      { time: '38:45', title: 'Peak Finding (2D Matrix)' },
      { time: '52:30', title: 'Complexity Analysis' },
    ],
    topTakeaway: 'Peak in 1D array can be found in O(log n) time using Divide and Conquer.',
  },
  {
    id: 'lib-002',
    videoId: 'v9-1Y-3R-4c',
    title: 'Stanford CS229: Machine Learning — Lecture 1: Supervised Learning',
    channel: 'Stanford Online',
    category: 'Machine Learning',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
    duration: '1:15:30',
    progressPercent: 100,
    lastTimestamp: '1:15:30',
    status: 'completed',
    lastStudiedAt: 'Yesterday',
    notesCount: 14,
    questionsCount: 22,
    isBookmarked: true,
    chapters: [
      { time: '0:00', title: 'Supervised vs Unsupervised' },
      { time: '18:40', title: 'Linear Regression Formulation' },
      { time: '42:10', title: 'Gradient Descent Convergence' },
    ],
    topTakeaway: 'Gradient descent minimizes cost function J(θ) via batch or stochastic updates.',
  },
  {
    id: 'lib-003',
    videoId: 'a8-3B-7R-9d',
    title: 'MIT 6.006 Lecture 2: Data Structures & Dynamic Arrays',
    channel: 'MIT OpenCourseWare',
    category: 'Algorithms',
    thumbnail: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&auto=format&fit=crop&q=80',
    duration: '1:18:45',
    progressPercent: 40,
    lastTimestamp: '18:20',
    status: 'in-progress',
    lastStudiedAt: '3 days ago',
    notesCount: 5,
    questionsCount: 8,
    isBookmarked: false,
    chapters: [
      { time: '0:00', title: 'Sequence Interface' },
      { time: '22:15', title: 'Amortized Array Doubling' },
    ],
    topTakeaway: 'Array doubling yields O(1) amortized insertion time.',
  },
  {
    id: 'lib-004',
    videoId: 'c4-7X-9L-2m',
    title: 'Harvard CS50 — Lecture 3: Memory, Pointers & Garbage Collection',
    channel: 'Harvard edX',
    category: 'Computer Science',
    thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80',
    duration: '1:45:10',
    progressPercent: 85,
    lastTimestamp: '1:12:05',
    status: 'in-progress',
    lastStudiedAt: '4 days ago',
    notesCount: 11,
    questionsCount: 19,
    isBookmarked: true,
    chapters: [
      { time: '0:00', title: 'RAM Memory Addresses' },
      { time: '35:10', title: 'Pointers & Dereferencing (*)' },
      { time: '1:12:05', title: 'Malloc & Free Stack vs Heap' },
    ],
    topTakeaway: 'Heap memory allocated via malloc must be explicitly freed to prevent memory leaks.',
  },
  {
    id: 'lib-005',
    videoId: 'e9-2K-4M-1p',
    title: 'Quantum Mechanics Part 1: Wave Functions & Schrödinger Equation',
    channel: 'IIT Kharagpur NPTEL',
    category: 'Physics',
    thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
    duration: '55:20',
    progressPercent: 20,
    lastTimestamp: '11:04',
    status: 'in-progress',
    lastStudiedAt: '5 days ago',
    notesCount: 3,
    questionsCount: 5,
    isBookmarked: false,
    chapters: [
      { time: '0:00', title: 'Double Slit Experiment' },
      { time: '11:04', title: 'Wavefunction Probability Density' },
    ],
    topTakeaway: '|Ψ(x,t)|² represents the probability density of finding a particle at position x.',
  },
  {
    id: 'lib-006',
    videoId: 'f3-8N-1P-5q',
    title: 'React 19 & Next.js App Router Masterclass 2026',
    channel: 'CodeWithHarry',
    category: 'Web Dev',
    thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&auto=format&fit=crop&q=80',
    duration: '2:10:00',
    progressPercent: 100,
    lastTimestamp: '2:10:00',
    status: 'completed',
    lastStudiedAt: '1 week ago',
    notesCount: 19,
    questionsCount: 31,
    isBookmarked: true,
    chapters: [
      { time: '0:00', title: 'React Server Components (RSC)' },
      { time: '45:00', title: 'Server Actions & Mutations' },
      { time: '1:30:00', title: 'Suspense & Streaming' },
    ],
    topTakeaway: 'React Server Components execute 100% on the server, sending zero JavaScript to the client.',
  },
];

const mockPlaylists: CoursePlaylist[] = [
  {
    id: 'pl-01',
    title: 'MIT 6.006: Introduction to Algorithms',
    institution: 'MIT OpenCourseWare',
    videoCount: 2,
    progressPercent: 52,
    totalDuration: '2:38:45',
    videoIds: ['lib-001', 'lib-003'],
  },
  {
    id: 'pl-02',
    title: 'Stanford CS229: Machine Learning Specialization',
    institution: 'Stanford Online',
    videoCount: 1,
    progressPercent: 100,
    totalDuration: '1:15:30',
    videoIds: ['lib-002'],
  },
];

const categories = ['All', 'Algorithms', 'Machine Learning', 'Computer Science', 'Physics', 'Web Dev', 'Starred'];

type SortOption = 'recent' | 'progress-high' | 'notes-high' | 'title-asc';
type StatusFilter = 'all' | 'in-progress' | 'completed';

export default function LibraryPage() {
  const [videos, setVideos] = useState<LibraryVideo[]>(mockLibraryVideos);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<LibraryVideo | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [dailyGoalMins, setDailyGoalMins] = useState(45);
  const [currentGoalMins] = useState(30);

  const navigate = useNavigate();

  // Filter & Sort Logic
  const filteredVideos = videos
    .filter((v) => {
      const matchesSearch =
        v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.channel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.topTakeaway.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        selectedCategory === 'All'
          ? true
          : selectedCategory === 'Starred'
            ? v.isBookmarked
            : v.category === selectedCategory;

      const matchesStatus =
        statusFilter === 'all' ? true : v.status === statusFilter;

      return matchesSearch && matchesCat && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'progress-high') return b.progressPercent - a.progressPercent;
      if (sortBy === 'notes-high') return b.notesCount - a.notesCount;
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      return 0; // default recent order
    });

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isBookmarked: !v.isBookmarked } : v))
    );
    toast.success('Bookmark state updated!');
  };

  const handleExportPlaylist = (plTitle: string) => {
    toast.success(`Exporting all notes from "${plTitle}" to Notion & PDF...`);
  };

  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;

    setIsIngesting(true);
    setTimeout(() => {
      setIsIngesting(false);
      setShowAddModal(false);
      setNewVideoUrl('');
      toast.success('Video processed with TranscriptAPI & pgvector!');
      navigate('/video-study-page');
    }, 1200);
  };

  return (
    <AppLayout activeRoute="/library">
      <div className="min-h-screen bg-obsidian px-6 py-8 xl:px-10 2xl:px-16 max-w-screen-2xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Icon name="BookOpenIcon" size={22} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
                Study Library & Courseware
              </h1>
            </div>
            <p className="text-sm text-foreground-muted">
              {videos.length} videos indexed with TranscriptAPI, BGE-M3 vector RAG & MeloTTS
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExportPlaylist('All Library Notes')}
              className="btn-ghost px-4 py-3 rounded-2xl text-xs font-bold text-indigo-300 flex items-center gap-2"
            >
              <Icon name="ArrowDownTrayIcon" size={16} />
              Batch Export Notes
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-glow-indigo-sm flex items-center gap-2"
            >
              <Icon name="PlusIcon" size={18} />
              Add Video
            </button>
          </div>
        </div>

        {/* Daily Study Goal Tracker & Metrics Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Daily Goal Card */}
          <div className="lg:col-span-1 glass-card rounded-3xl border border-indigo-500/20 p-5 relative overflow-hidden flex flex-col justify-between shadow-glow-indigo-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔥</span>
                <h3 className="text-sm font-bold text-foreground">Daily Study Goal</h3>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                5 Day Streak
              </span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-medium">
                <span>{currentGoalMins} / {dailyGoalMins} mins studied today</span>
                <span className="text-indigo-400 font-bold">{Math.round((currentGoalMins / dailyGoalMins) * 100)}%</span>
              </div>
              <div className="h-2.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-indigo-cyan rounded-full transition-all duration-500"
                  style={{ width: `${(currentGoalMins / dailyGoalMins) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              15 mins remaining today to keep your streak active!
            </p>
          </div>

          {/* Metrics Grid (3 stats) */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Indexed Videos', val: videos.length, icon: 'PlayCircleIcon', color: 'text-indigo-400' },
              { label: 'Total Hours', val: '28.5 hrs', icon: 'ClockIcon', color: 'text-cyan-400' },
              { label: 'Saved AI Notes', val: '67 notes', icon: 'DocumentTextIcon', color: 'text-emerald-400' },
            ].map((stat, idx) => (
              <div key={`stat-${idx}`} className="glass-card rounded-3xl border border-indigo-500/15 p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-surface-elevated flex items-center justify-center flex-shrink-0">
                  <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={20} className={stat.color} />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-foreground tabular-nums">{stat.val}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Structured Course Playlists Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <Icon name="FolderIcon" size={18} className="text-indigo-400" />
              <h2 className="text-lg font-bold text-foreground">Course Modules & Series</h2>
            </div>
            <span className="text-xs text-muted-foreground">{mockPlaylists.length} active playlists</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {mockPlaylists.map((pl) => (
              <div
                key={pl.id}
                className="glass-card rounded-2xl border border-border/80 p-5 flex items-center justify-between gap-4 hover:border-indigo-500/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {pl.institution}
                    </span>
                    <span className="text-xs text-muted-foreground">{pl.videoCount} videos • {pl.totalDuration}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground truncate mb-2">{pl.title}</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${pl.progressPercent}%` }} />
                    </div>
                    <span className="text-xs font-bold text-indigo-400">{pl.progressPercent}%</span>
                  </div>
                </div>
                <button
                  onClick={() => handleExportPlaylist(pl.title)}
                  className="btn-ghost p-2.5 rounded-xl text-indigo-300 hover:text-white flex-shrink-0"
                  title="Export Playlist Notes"
                >
                  <Icon name="ArrowDownTrayIcon" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Search, Filter & Sort Matrix */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-6">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md group rounded-2xl p-[1px] bg-gradient-to-r from-indigo-500/40 via-cyan-500/40 to-indigo-500/40 shadow-glow-indigo-sm hover:shadow-glow-indigo transition-all duration-300">
            <div className="relative flex items-center bg-[#151926]/95 backdrop-blur-xl rounded-[15px] overflow-hidden">
              <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-4 text-indigo-400 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, topic or key takeaways..."
                className="w-full bg-transparent border-0 pl-11 pr-10 py-3 text-sm text-foreground font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-4 text-muted-foreground hover:text-foreground">
                  <Icon name="XMarkIcon" size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Controls: Status Filter, Sort, View Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="input-field rounded-2xl px-3 py-2.5 text-xs text-foreground bg-surface-card border border-border"
            >
              <option value="all">All Statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="input-field rounded-2xl px-3 py-2.5 text-xs text-foreground bg-surface-card border border-border"
            >
              <option value="recent">Recently Studied</option>
              <option value="progress-high">Highest Progress</option>
              <option value="notes-high">Most Notes</option>
              <option value="title-asc">Title (A-Z)</option>
            </select>

            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-surface-card border border-border/80 rounded-2xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <Icon name="Squares2X2Icon" size={16} />
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <Icon name="ListBulletIcon" size={16} />
                List
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((cat) => (
            <button
              key={`cat-${cat}`}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-glow-indigo-sm'
                  : 'bg-surface-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-indigo-500/30'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Videos Grid / List Container */}
        {filteredVideos.length === 0 ? (
          <div className="p-16 text-center glass-card rounded-3xl border border-border">
            <Icon name="MagnifyingGlassIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-bold text-foreground mb-1">No videos found</h3>
            <p className="text-sm text-muted-foreground mb-6">Try adjusting your search query or category filters.</p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setStatusFilter('all'); }}
              className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold text-indigo-300"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video, idx) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="glass-card rounded-3xl border border-border/80 overflow-hidden cursor-pointer card-hover group flex flex-col justify-between"
              >
                <div onClick={() => navigate('/video-study-page')}>
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video overflow-hidden bg-black/40">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-transparent to-transparent" />

                    {/* Status Badge Overlay */}
                    <div className="absolute top-3 left-3 z-10">
                      <span
                        className={`text-[11px] font-extrabold px-3 py-1 rounded-full border flex items-center gap-1.5 ${video.status === 'completed'
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-md backdrop-blur-md'
                            : 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50 shadow-md backdrop-blur-md'
                          }`}
                      >
                        <Icon name={video.status === 'completed' ? 'CheckIcon' : 'ClockIcon'} size={12} />
                        <span>{video.status === 'completed' ? 'Completed' : 'In Progress'}</span>
                      </span>
                    </div>

                    {/* Duration Badge */}
                    <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-lg bg-obsidian/90 border border-border text-[11px] font-mono font-bold text-foreground">
                      {video.duration}
                    </span>

                    {/* Bookmark Star */}
                    <button
                      onClick={(e) => toggleBookmark(video.id, e)}
                      className="absolute top-3 right-3 p-2 rounded-xl bg-obsidian/80 border border-border text-muted-foreground hover:text-amber-400 transition-colors"
                    >
                      <Icon name="StarIcon" size={16} className={video.isBookmarked ? 'text-amber-400 fill-amber-400' : ''} />
                    </button>

                    {/* Play Hover Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-900/30 backdrop-blur-xs">
                      <div className="w-12 h-12 rounded-full btn-primary flex items-center justify-center shadow-glow-indigo">
                        <Icon name="PlayIcon" size={20} className="text-white ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1 bg-surface-elevated w-full">
                    <div className="h-full bg-indigo-500" style={{ width: `${video.progressPercent}%` }} />
                  </div>

                  {/* Card Body */}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-indigo-400 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                        {video.category}
                      </span>
                      <span className="text-xs text-muted-foreground">{video.lastStudiedAt}</span>
                    </div>

                    <h3 className="text-base font-bold text-foreground line-clamp-2 mb-2 group-hover:text-indigo-300 transition-colors">
                      {video.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">{video.channel}</p>

                    {/* Top Takeaway Snippet */}
                    <p className="text-xs text-foreground/80 bg-surface-elevated/40 p-2.5 rounded-xl border border-border/40 italic line-clamp-2">
                      "{video.topTakeaway}"
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 pb-5 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewVideo(video); }}
                      className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <Icon name="EyeIcon" size={14} />
                      Preview Chapters
                    </button>
                  </div>

                  <button
                    onClick={() => navigate('/video-study-page')}
                    className="font-bold text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1"
                  >
                    Resume @ {video.lastTimestamp} →
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVideos.map((video) => (
              <div
                key={video.id}
                onClick={() => navigate('/video-study-page')}
                className="glass-card rounded-2xl border border-border/80 p-4 flex flex-col sm:flex-row items-center gap-4 cursor-pointer hover:border-indigo-500/40 transition-all"
              >
                <img src={video.thumbnail} alt={video.title} className="w-full sm:w-40 aspect-video object-cover rounded-xl flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {video.category}
                    </span>
                    <span className="text-xs text-muted-foreground">• {video.channel}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground truncate mb-1">{video.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1 italic mb-2">"{video.topTakeaway}"</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Duration: {video.duration}</span>
                    <span>Progress: {video.progressPercent}%</span>
                    <span>{video.notesCount} notes</span>
                  </div>
                </div>
                <div className="flex gap-2 self-end sm:self-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setPreviewVideo(video); }}
                    className="btn-ghost px-3 py-2 rounded-xl text-xs font-semibold text-cyan-300"
                  >
                    Preview
                  </button>
                  <button className="btn-primary px-4 py-2 rounded-xl text-xs font-bold text-white whitespace-nowrap">
                    Resume @ {video.lastTimestamp}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Preview Drawer Modal */}
        <AnimatePresence>
          {previewVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-2xl p-8 rounded-3xl glass-card border border-indigo-500/30 relative max-h-[85vh] overflow-y-auto scrollbar-thin"
              >
                <button
                  onClick={() => setPreviewVideo(null)}
                  className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated"
                >
                  <Icon name="XMarkIcon" size={18} />
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {previewVideo.category}
                  </span>
                  <span className="text-xs text-muted-foreground">{previewVideo.channel}</span>
                </div>

                <h2 className="text-xl font-extrabold text-foreground mb-3">{previewVideo.title}</h2>

                {/* Key Takeaway Banner */}
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 mb-6">
                  <div className="flex items-center gap-2 mb-1 text-indigo-400 font-bold text-xs">
                    <Icon name="SparklesIcon" size={14} />
                    <span>AI Key Takeaway</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed italic">
                    "{previewVideo.topTakeaway}"
                  </p>
                </div>

                {/* Chapters List */}
                <div className="mb-6">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">
                    AI-Generated Chapters ({previewVideo.chapters.length})
                  </h3>
                  <div className="space-y-2">
                    {previewVideo.chapters.map((ch, idx) => (
                      <div
                        key={`prev-ch-${idx}`}
                        onClick={() => {
                          setPreviewVideo(null);
                          navigate('/video-study-page');
                        }}
                        className="flex items-center justify-between p-3 rounded-xl bg-surface-card border border-border/60 hover:border-indigo-500/40 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface-elevated text-indigo-300">
                            {ch.time}
                          </span>
                          <span className="text-sm font-semibold text-foreground">{ch.title}</span>
                        </div>
                        <span className="text-xs text-indigo-400 font-bold">Seek →</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      handleExportPlaylist(previewVideo.title);
                    }}
                    className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-300"
                  >
                    Export Notes
                  </button>
                  <button
                    onClick={() => {
                      setPreviewVideo(null);
                      navigate('/video-study-page');
                    }}
                    className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-glow-indigo-sm"
                  >
                    Resume Study @ {previewVideo.lastTimestamp}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Video Modal */}
        <AnimatePresence>
          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-lg p-8 rounded-3xl glass-card border border-indigo-500/30 relative"
              >
                <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated">
                  <Icon name="XMarkIcon" size={18} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Icon name="PlusIcon" size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Import Video to Library</h3>
                </div>

                <form onSubmit={handleAddVideo} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">YouTube URL</label>
                    <div className="relative group rounded-xl p-[1px] bg-gradient-to-r from-indigo-500/40 via-cyan-500/40 to-indigo-500/40 shadow-glow-indigo-sm hover:shadow-glow-indigo transition-all duration-300">
                      <div className="relative flex items-center bg-[#151926]/95 backdrop-blur-xl rounded-[11px] overflow-hidden">
                        <Icon name="LinkIcon" size={18} className="absolute left-4 text-indigo-400 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                        <input
                          type="url"
                          required
                          value={newVideoUrl}
                          onChange={(e) => setNewVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full bg-transparent border-0 pl-11 pr-4 py-3 text-sm text-foreground font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    TranscriptAPI will automatically extract captions and index 1024-dim BGE-M3 embeddings for RAG Q&A.
                  </p>
                  <button
                    type="submit"
                    disabled={isIngesting}
                    className="btn-primary w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-glow-indigo-sm flex items-center justify-center gap-2"
                  >
                    {isIngesting ? (
                      <>
                        <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                        Ingesting Transcript...
                      </>
                    ) : (
                      'Process & Start Studying'
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
