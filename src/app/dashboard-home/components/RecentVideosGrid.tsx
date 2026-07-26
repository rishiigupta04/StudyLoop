'use client';
import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

interface VideoCard {
  id: string;
  title: string;
  channel: string;
  progress: number;
  chapters: number;
  notes: number;
  lastStudied: string;
  language: 'EN' | 'HI' | 'Hinglish';
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
  thumbnail: "https://img.rocket.new/generatedImages/rocket_gen_img_1f91741a0-1779812637968.png",
  thumbnailAlt: 'MIT lecture hall with professor at whiteboard, algorithms course introduction slide'
},
{
  id: 'video-cs50-w3',
  title: 'CS50x 2024 — Week 3: Algorithms',
  channel: 'CS50',
  progress: 45,
  chapters: 6,
  notes: 7,
  lastStudied: '5 days ago',
  language: 'EN',
  status: 'in-progress',
  thumbnail: "https://img.rocket.new/generatedImages/rocket_gen_img_1027c8a14-1772295962606.png",
  thumbnailAlt: 'CS50 lecture with David Malan presenting sorting algorithms visualization'
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
  thumbnail: "https://images.unsplash.com/photo-1608190906424-37a9f68378b6",
  thumbnailAlt: 'Andrej Karpathy neural networks tutorial with code on dark background screen'
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
  thumbnail: "https://img.rocket.new/generatedImages/rocket_gen_img_1771bf747-1772627393499.png",
  thumbnailAlt: 'System design whiteboard diagram showing microservices architecture'
}];


const statusConfig = {
  completed: { label: 'Completed', color: 'bg-success/15 text-success border-success/20' },
  'in-progress': { label: 'In Progress', color: 'bg-highlight/15 text-highlight border-highlight/20' },
  'not-started': { label: 'Not Started', color: 'bg-muted text-muted-foreground border-border' }
};

const langConfig = {
  EN: 'lang-badge-en',
  HI: 'lang-badge-hi',
  Hinglish: 'lang-badge-hinglish'
};

export default function RecentVideosGrid() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recent Videos</h2>
          <p className="text-xs text-muted-foreground">हाल के वीडियो</p>
        </div>
        <Link
          href="/library"
          className="text-xs font-semibold text-primary hover:text-accent transition-colors duration-150 flex items-center gap-1">
          
          View Library
          <Icon name="ArrowRightIcon" size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recentVideos.map((video) =>
        <Link
          key={video.id}
          href="/video-study-page"
          className="block">
          
            <div className="bg-card rounded-xl border border-border overflow-hidden video-card-hover shadow-card group cursor-pointer">
              {/* Thumbnail */}
              <div className="relative h-36 bg-muted overflow-hidden">
                <img
                src={video.thumbnail}
                alt={video.thumbnailAlt}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://via.placeholder.com/320x180/1E293B/6C3FC5?text=${encodeURIComponent(video.channel)}`;
                }} />
              
                {/* Status badge overlay */}
                <div className="absolute top-2 right-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusConfig[video.status].color}`}>
                    {statusConfig[video.status].label}
                  </span>
                </div>
                {/* Language badge */}
                <div className="absolute bottom-2 left-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${langConfig[video.language]}`}>
                    {video.language}
                  </span>
                </div>
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                    <Icon name="PlayIcon" size={18} className="text-background ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground leading-snug mb-1 line-clamp-2 group-hover:text-primary transition-colors duration-150">
                  {video.title}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">{video.channel}</p>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-bold text-foreground tabular-nums">{video.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                    className={`h-full rounded-full progress-bar-fill ${
                    video.progress === 100 ? 'bg-success' : 'bg-primary'}`
                    }
                    style={{ width: `${video.progress}%` }} />
                  
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Icon name="BookmarkIcon" size={11} />
                      {video.chapters} ch
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Icon name="DocumentTextIcon" size={11} />
                      {video.notes} notes
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="ClockIcon" size={11} />
                    {video.lastStudied}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>);

}