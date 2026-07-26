import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Chapter {
  id: string;
  time: string;
  timeSeconds: number;
  title: string;
  summary?: string;
}

const chapters: Chapter[] = [
  { id: 'ch-intro', time: '0:00', timeSeconds: 0, title: 'Introduction & Course Goals', summary: 'Course structure, grading, and algorithmic problem solving.' },
  { id: 'ch-overview', time: '4:32', timeSeconds: 272, title: 'Course Overview & Prerequisites', summary: 'Pre-reqs: Python fluency and discrete math fundamentals.' },
  { id: 'ch-thinking', time: '12:15', timeSeconds: 735, title: 'Algorithmic Thinking & Procedure', summary: 'Defining algorithms as formal computational procedures.' },
  { id: 'ch-peak1d', time: '24:10', timeSeconds: 1450, title: 'Peak Finding (1D Array)', summary: 'Finding a[i] ≥ a[i-1] and a[i] ≥ a[i+1] via Divide & Conquer.' },
  { id: 'ch-peak2d', time: '38:45', timeSeconds: 2325, title: 'Peak Finding (2D Matrix)', summary: 'Greedy ascent vs 2D Divide & Conquer O(n log n) algorithm.' },
  { id: 'ch-complexity', time: '52:30', timeSeconds: 3150, title: 'Complexity Analysis (Asymptotic)', summary: 'Big-O, Big-Omega, Big-Theta bounds and operation counting.' },
  { id: 'ch-summary', time: '1:08:20', timeSeconds: 4100, title: 'Summary & Key Takeaways', summary: 'Comparing O(n) naive scan to O(log n) logarithmic reduction.' },
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
    <div className="flex flex-col h-full min-h-0 video-pane overflow-y-auto scrollbar-thin">
      {/* YouTube Embed Container with Viewport Max-Height Constraint */}
      <div className="relative w-full bg-black flex items-center justify-center flex-shrink-0 max-h-[48vh] sm:max-h-[52vh] overflow-hidden">
        <div className="w-full aspect-video relative max-h-[48vh] sm:max-h-[52vh]">
          <iframe
            src="https://www.youtube.com/embed/dQw4w9WgXcQ?modestbranding=1&rel=0&showinfo=0"
            title="MIT 6.006 Introduction to Algorithms - Lecture 1"
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>

      {/* Custom Controls Bar */}
      <div className="bg-surface-card/90 border-b border-border px-4 py-2.5 flex-shrink-0">
        {/* Progress bar */}
        <div className="mb-2.5 relative">
          <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden cursor-pointer">
            <div
              className="h-full rounded-full bg-indigo-500 progress-bar-fill shadow-glow-indigo-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Chapter markers on progress bar */}
          {chapters.map((ch) => (
            <button
              key={`marker-${ch.id}`}
              onClick={() => {
                setCurrentChapter(ch.id);
                onTimestampClick(ch.time);
              }}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-obsidian transition-all duration-150 hover:scale-125 z-10"
              style={{
                left: `${(ch.timeSeconds / totalSeconds) * 100}%`,
                background: ch.id === currentChapter ? '#7C3AED' : '#64748B',
              }}
              title={`${ch.time} — ${ch.title}`}
              aria-label={`Jump to ${ch.title} at ${ch.time}`}
            />
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title="Rewind 10s"
            >
              <Icon name="BackwardIcon" size={16} />
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title="Previous chapter"
            >
              <Icon name="ArrowUturnLeftIcon" size={16} />
            </button>
            <button
              className="p-2 rounded-xl btn-primary text-white mx-1 shadow-glow-indigo-sm"
              title="Pause"
            >
              <Icon name="PauseIcon" size={16} />
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title="Next chapter"
            >
              <Icon name="ArrowUturnRightIcon" size={16} />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <Icon name={isMuted ? 'SpeakerXMarkIcon' : 'SpeakerWaveIcon'} size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {activeChapter?.time} / 1:20:00
            </span>
            {/* Speed selector */}
            <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 border border-border/60">
              {speeds.map((s) => (
                <button
                  key={`speed-${s}`}
                  onClick={() => setSpeed(s)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                    speed === s
                      ? 'bg-indigo-600 text-white shadow-sm'
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

      {/* AI-Generated Chapters Section */}
      <div className="flex-1 p-4 bg-obsidian/20 min-h-[240px]">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Icon name="SparklesIcon" size={16} className="text-indigo-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              AI-Generated Chapters
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              7 Chapters
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Click timestamp to seek</span>
        </div>

        <div className="space-y-2 pb-16">
          {chapters.map((ch) => {
            const isActive = ch.id === currentChapter;
            return (
              <div
                key={ch.id}
                onClick={() => {
                  setCurrentChapter(ch.id);
                  onTimestampClick(ch.time);
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-500/10 border-indigo-500/40 shadow-glow-indigo-sm'
                    : 'bg-surface-card/60 border-border/60 hover:border-indigo-500/30 hover:bg-surface-card'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-xs font-mono font-extrabold px-2.5 py-1 rounded-lg tabular-nums ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-surface-elevated text-indigo-300 border border-indigo-500/20'
                      }`}
                    >
                      {ch.time}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        isActive ? 'text-foreground' : 'text-foreground/90'
                      }`}
                    >
                      {ch.title}
                    </span>
                  </div>

                  {isActive && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      Active
                    </span>
                  )}
                </div>

                {ch.summary && (
                  <p className="text-xs text-muted-foreground mt-1 pl-1 line-clamp-2 leading-relaxed">
                    {ch.summary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}