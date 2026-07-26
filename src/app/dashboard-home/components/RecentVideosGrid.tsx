import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/AppIcon';

interface VideoCard {
  id: string;
  title: string;
  channel: string;
  progress: number;
  chapters: number;
  notes: number;
  lastStudied: string;
  language: 'EN';
  status: 'completed' | 'in-progress' | 'not-started';
  thumbnail: string;
  thumbnailAlt: string;
}

const recentVideos: VideoCard[] = [
  {
    id: 'video-mit-6006',
    title: 'MIT 6.006 Introduction to Algorithms — Lecture 1',
    channel: 'MIT OpenCourseWare',
    progress: 72,
    chapters: 8,
    notes: 12,
    lastStudied: '2 days ago',
    language: 'EN',
    status: 'in-progress',
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
    thumbnailAlt: 'MIT lecture hall with professor at whiteboard, algorithms course introduction slide',
  },
  {
    id: 'video-cs50-w3',
    title: 'CS50x 2024 — Week 3: Algorithms & Data Structures',
    channel: 'CS50',
    progress: 45,
    chapters: 6,
    notes: 7,
    lastStudied: '5 days ago',
    language: 'EN',
    status: 'in-progress',
    thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80',
    thumbnailAlt: 'CS50 lecture presenting sorting algorithms visualization',
  },
  {
    id: 'video-nn-karpathy',
    title: 'Neural Networks: Zero to Hero — Lecture 1',
    channel: 'Andrej Karpathy',
    progress: 100,
    chapters: 10,
    notes: 18,
    lastStudied: '1 week ago',
    language: 'EN',
    status: 'completed',
    thumbnail: 'https://images.unsplash.com/photo-1608190906424-37a9f68378b6?w=600&auto=format&fit=crop&q=80',
    thumbnailAlt: 'Andrej Karpathy neural networks tutorial with code on dark background screen',
  },
  {
    id: 'video-sysdesign-gaurav',
    title: 'System Design Interview Prep — Core Concepts',
    channel: 'Gaurav Sen',
    progress: 20,
    chapters: 5,
    notes: 3,
    lastStudied: '2 weeks ago',
    language: 'EN',
    status: 'in-progress',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
    thumbnailAlt: 'System design whiteboard diagram showing microservices architecture',
  },
];

const statusConfig = {
  completed: {
    label: 'Completed',
    icon: 'CheckIcon',
    color: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-md backdrop-blur-md',
  },
  'in-progress': {
    label: 'In Progress',
    icon: 'ClockIcon',
    color: 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50 shadow-md backdrop-blur-md',
  },
  'not-started': {
    label: 'Not Started',
    icon: 'PlayIcon',
    color: 'bg-slate-900/90 text-slate-300 border-slate-700/60 shadow-md backdrop-blur-md',
  },
};

export default function RecentVideosGrid() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recent Videos</h2>
        </div>
        <Link
          to="/library"
          className="text-xs font-semibold text-indigo-400 hover:text-cyan-400 transition-colors duration-150 flex items-center gap-1"
        >
          View Library
          <Icon name="ArrowRightIcon" size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recentVideos.map((video) => {
          const status = statusConfig[video.status];
          return (
            <Link key={video.id} to="/video-study-page" className="block">
              <div className="glass-card rounded-2xl border border-border/80 overflow-hidden card-hover group cursor-pointer">
                {/* Thumbnail */}
                <div className="relative h-40 bg-black/40 overflow-hidden">
                  <img
                    src={video.thumbnail}
                    alt={video.thumbnailAlt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian/90 via-transparent to-transparent" />

                  {/* High-Contrast Professional Status Badge Overlay */}
                  <div className="absolute top-3 right-3 z-10">
                    <span
                      className={`text-[11px] font-extrabold px-3 py-1 rounded-full border flex items-center gap-1.5 ${status.color}`}
                    >
                      <Icon name={status.icon as Parameters<typeof Icon>[0]['name']} size={12} />
                      <span>{status.label}</span>
                    </span>
                  </div>

                  {/* Language badge */}
                  <div className="absolute bottom-3 left-3 z-10">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 backdrop-blur-md">
                      {video.language}
                    </span>
                  </div>

                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-indigo-900/20 transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-12 h-12 rounded-full btn-primary flex items-center justify-center shadow-glow-indigo">
                      <Icon name="PlayIcon" size={20} className="text-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4">
                  <h3 className="text-sm font-bold text-foreground leading-snug mb-1 line-clamp-2 group-hover:text-indigo-300 transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">{video.channel}</p>

                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">Progress</span>
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {video.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full progress-bar-fill ${
                          video.progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${video.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Icon name="BookmarkIcon" size={12} className="text-indigo-400" />
                        {video.chapters} ch
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="DocumentTextIcon" size={12} className="text-cyan-400" />
                        {video.notes} notes
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Icon name="ClockIcon" size={12} />
                      {video.lastStudied}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}