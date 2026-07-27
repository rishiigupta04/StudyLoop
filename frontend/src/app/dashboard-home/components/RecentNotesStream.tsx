import React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';

interface DashboardNote {
  id: string;
  videoTitle: string;
  timestamp: string;
  text: string;
  timeAgo: string;
  isAuto: boolean;
}

const recentNotes: DashboardNote[] = [
  {
    id: 'note-d1',
    videoTitle: 'MIT 6.006 Intro to Algorithms',
    timestamp: '24:10',
    text: 'Peak in 1D array: element ≥ its neighbors. Exists in every non-empty array.',
    timeAgo: '2 hours ago',
    isAuto: true,
  },
  {
    id: 'note-d2',
    videoTitle: 'Stanford CS229 Machine Learning',
    timestamp: '42:10',
    text: 'Gradient descent update rule: θⱼ := θⱼ - α (∂/∂θⱼ) J(θ).',
    timeAgo: 'Yesterday',
    isAuto: true,
  },
  {
    id: 'note-d3',
    videoTitle: 'Harvard CS50 Memory & Pointers',
    timestamp: '1:12:05',
    text: 'Heap memory allocated via malloc must be explicitly freed to prevent memory leaks.',
    timeAgo: '3 days ago',
    isAuto: false,
  },
];

export default function RecentNotesStream() {
  const handleExport = (format: string) => {
    toast.success(`Exported ${recentNotes.length} recent notes to ${format}!`);
  };

  return (
    <div className="glass-card rounded-3xl border border-border/80 p-5 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="DocumentTextIcon" size={18} className="text-emerald-400" />
          <h3 className="text-sm font-extrabold text-foreground">Recent AI Notes Stream</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('Notion')}
            className="text-[11px] font-bold text-indigo-400 hover:text-white transition-colors"
          >
            Export Notion
          </button>
          <span className="text-muted-foreground text-xs">•</span>
          <button
            onClick={() => handleExport('PDF')}
            className="text-[11px] font-bold text-cyan-400 hover:text-white transition-colors"
          >
            PDF
          </button>
        </div>
      </div>

      {/* Notes Stream */}
      <div className="space-y-3 mb-4">
        {recentNotes.map((note) => (
          <div
            key={note.id}
            className="p-3.5 rounded-2xl bg-surface-card border border-border/60 hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-indigo-300 truncate max-w-[200px]">
                {note.videoTitle}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-surface-elevated text-cyan-400">
                  @{note.timestamp}
                </span>
                <span className="text-[11px] text-muted-foreground">{note.timeAgo}</span>
              </div>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed font-mono">
              {note.text}
            </p>
          </div>
        ))}
      </div>

      {/* Footer Link */}
      <Link
        to="/video-study-page"
        className="text-xs font-bold text-indigo-400 hover:text-cyan-400 transition-colors flex items-center justify-center gap-1 text-center w-full"
      >
        View All 67 Saved Notes →
      </Link>
    </div>
  );
}
