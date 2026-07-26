import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Chapter {
  id: string;
  time: string;
  timeSeconds: number;
  title: string;
}

const chapters: Chapter[] = [
  { id: 'ch-intro', time: '0:00', timeSeconds: 0, title: 'Introduction' },
  { id: 'ch-overview', time: '4:32', timeSeconds: 272, title: 'Course Overview' },
  { id: 'ch-thinking', time: '12:15', timeSeconds: 735, title: 'Algorithmic Thinking' },
  { id: 'ch-peak1d', time: '24:10', timeSeconds: 1450, title: 'Peak Finding (1D)' },
  { id: 'ch-peak2d', time: '38:45', timeSeconds: 2325, title: 'Peak Finding (2D)' },
  { id: 'ch-complexity', time: '52:30', timeSeconds: 3150, title: 'Complexity Analysis' },
  { id: 'ch-summary', time: '1:08:20', timeSeconds: 4100, title: 'Summary & Takeaways' },
];

const totalSeconds = 4800;

interface VideoPaneProps {
  activeTimestamp: string;
  onTimestampClick: (ts: string) => void;
}

export default function VideoPane({ activeTimestamp, onTimestampClick }: VideoPaneProps) {
  const [speed, setSpeed] = useState('1x');
  const [isMuted, setIsMuted] = useState(false);
  const [currentChapter, setCurrentChapter] = useState('ch-peak1d');

  const activeChapter = chapters.find((c) => c.id === currentChapter);
  const progressPercent = activeChapter ? (activeChapter.timeSeconds / totalSeconds) * 100 : 30;

  const speeds = ['0.75x', '1x', '1.25x', '1.5x', '2x'];

  return (
    <div className="flex flex-col h-full video-pane">
      {/* YouTube Embed */}
      <div className="relative" style={{ paddingBottom: '56.25%', flex: '0 0 auto' }}>
        <iframe
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?modestbranding=1&rel=0&showinfo=0"
          title="MIT 6.006 Introduction to Algorithms - Lecture 1"
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Custom Controls */}
      <div className="bg-secondary/80 border-b border-border px-4 py-2 flex-shrink-0">
        {/* Progress bar */}
        <div className="mb-2 relative">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden cursor-pointer">
            <div
              className="h-full rounded-full bg-primary progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Chapter markers on bar */}
          {chapters.map((ch) => (
            <button
              key={`marker-${ch.id}`}
              onClick={() => {
                setCurrentChapter(ch.id);
                onTimestampClick(ch.time);
              }}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background transition-all duration-150 hover:scale-125"
              style={{
                left: `${(ch.timeSeconds / totalSeconds) * 100}%`,
                background: ch.id === currentChapter ? 'var(--primary)' : 'var(--muted-foreground)',
              }}
              title={`${ch.time} — ${ch.title}`}
              aria-label={`Jump to ${ch.title} at ${ch.time}`}
            />
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95">
              <Icon name="BackwardIcon" size={16} />
            </button>
            <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95">
              <Icon name="ArrowUturnLeftIcon" size={16} />
            </button>
            <button className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150 active:scale-95 mx-1">
              <Icon name="PauseIcon" size={16} />
            </button>
            <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95">
              <Icon name="ArrowUturnRightIcon" size={16} />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
            >
              <Icon name={isMuted ? 'SpeakerXMarkIcon' : 'SpeakerWaveIcon'} size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {activeChapter?.time} / 1:20:00
            </span>
            {/* Speed selector */}
            <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
              {speeds.map((s) => (
                <button
                  key={`speed-${s}`}
                  onClick={() => setSpeed(s)}
                  className={`text-xs px-2 py-0.5 rounded transition-all duration-150 ${
                    speed === s
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Chapters
        </p>
        <div className="space-y-1">
          {chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                setCurrentChapter(ch.id);
                onTimestampClick(ch.time);
              }}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg chapter-marker border transition-all duration-150 ${
                ch.id === currentChapter
                  ? 'transcript-active border-primary/30' :'border-transparent hover:bg-muted/50'
              }`}
            >
              <span className={`text-xs font-mono tabular-nums flex-shrink-0 ${
                ch.id === currentChapter ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}>
                {ch.time}
              </span>
              <span className={`text-sm font-medium ${
                ch.id === currentChapter ? 'text-foreground' : 'text-secondary-foreground'
              }`}>
                {ch.title}
              </span>
              {ch.id === currentChapter && (
                <span className="ml-auto flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}