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
  },
];

const categories = ['All', 'Algorithms', 'Machine Learning', 'Computer Science', 'Physics', 'Web Dev', 'Starred'];

export default function LibraryPage() {
  const [videos, setVideos] = useState<LibraryVideo[]>(mockLibraryVideos);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const navigate = useNavigate();

  const filteredVideos = videos.filter((v) => {
    const matchesSearch =
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.channel.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedCategory === 'All') return matchesSearch;
    if (selectedCategory === 'Starred') return matchesSearch && v.isBookmarked;
    return matchesSearch && v.category === selectedCategory;
  });

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isBookmarked: !v.isBookmarked } : v))
    );
    toast.success('Bookmark updated!');
  };

  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;

    setIsIngesting(true);
    setTimeout(() => {
      setIsIngesting(false);
      setShowAddModal(false);
      setNewVideoUrl('');
      toast.success('Video processed & added to library!');
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
                Study Library
              </h1>
            </div>
            <p className="text-sm text-foreground-muted">
              {videos.length} videos indexed with TranscriptAPI & pgvector RAG
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-glow-indigo-sm flex items-center gap-2"
            >
              <Icon name="PlusIcon" size={18} />
              Add Video
            </button>
          </div>
        </div>

        {/* Library Stats Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Videos', val: videos.length, icon: 'PlayCircleIcon', color: 'text-indigo-400' },
            { label: 'Hours Watched', val: '28.5 hrs', icon: 'ClockIcon', color: 'text-cyan-400' },
            { label: 'Notes Captured', val: '67', icon: 'DocumentTextIcon', color: 'text-emerald-400' },
            { label: 'Starred Courseware', val: videos.filter((v) => v.isBookmarked).length, icon: 'StarIcon', color: 'text-amber-400' },
          ].map((stat, idx) => (
            <div key={`stat-${idx}`} className="glass-card rounded-2xl border border-indigo-500/15 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center flex-shrink-0">
                <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-xl font-extrabold text-foreground tabular-nums">{stat.val}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search & Category Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-8">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Icon name="MagnifyingGlassIcon" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by video title, topic or channel..."
              className="input-field w-full rounded-2xl pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Icon name="XMarkIcon" size={16} />
              </button>
            )}
          </div>

          {/* View Switcher */}
          <div className="flex items-center gap-1 bg-surface-card border border-border/80 rounded-2xl p-1 self-end md:self-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="Squares2X2Icon" size={16} />
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="ListBulletIcon" size={16} />
              List
            </button>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((cat) => (
            <button
              key={`cat-${cat}`}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                selectedCategory === cat
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
            <button onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }} className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold text-indigo-300">
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
                onClick={() => navigate('/video-study-page')}
                className="glass-card rounded-3xl border border-border/80 overflow-hidden cursor-pointer card-hover group flex flex-col justify-between"
              >
                <div>
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video overflow-hidden bg-black/40">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-transparent to-transparent" />

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
                    <p className="text-xs text-muted-foreground mb-4">{video.channel}</p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 pb-5 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Icon name="DocumentTextIcon" size={14} className="text-indigo-400" />
                      {video.notesCount} notes
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="ChatBubbleLeftRightIcon" size={14} className="text-cyan-400" />
                      {video.questionsCount} Q&A
                    </span>
                  </div>
                  <span className="font-bold text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Study →
                  </span>
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
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Duration: {video.duration}</span>
                    <span>Progress: {video.progressPercent}%</span>
                    <span>{video.notesCount} notes</span>
                  </div>
                </div>
                <button className="btn-primary px-4 py-2 rounded-xl text-xs font-bold text-white whitespace-nowrap self-end sm:self-center">
                  Continue Study
                </button>
              </div>
            ))}
          </div>
        )}

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
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">YouTube URL</label>
                    <input
                      type="url"
                      required
                      value={newVideoUrl}
                      onChange={(e) => setNewVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full input-field rounded-xl px-4 py-3 text-sm"
                    />
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
