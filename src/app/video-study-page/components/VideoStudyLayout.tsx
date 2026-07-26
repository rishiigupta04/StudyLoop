import React, { useState } from 'react';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import VoiceModal from './VoiceModal';
import Icon from '@/components/ui/AppIcon';

export default function VideoStudyLayout() {
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [activeTimestamp, setActiveTimestamp] = useState('24:10');

  return (
    <div className="flex flex-col min-h-full flex-1 bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/50 flex-shrink-0 z-10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="PlayCircleIcon" size={16} className="text-indigo-400" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">Now Studying:</span>
          </div>
          <span className="text-sm font-semibold text-foreground truncate max-w-xs sm:max-w-md lg:max-w-lg">
            MIT 6.006 Introduction to Algorithms — Lecture 1
          </span>
          <span className="text-xs text-muted-foreground hidden md:block">· MIT OpenCourseWare</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full">
            Transcript Active
          </span>
          <button className="p-2 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="ShareIcon" size={16} />
          </button>
          <button className="p-2 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="Cog6ToothIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area — Responsive 2-Pane Layout (Mobile/Laptop: column with natural scrolling, Desktop: side-by-side) */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
        {/* Left: Video Pane */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[480px] lg:min-h-full relative border-b lg:border-b-0 lg:border-r border-border">
          <VideoPane
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
          />
          {/* Floating PTT Button */}
          <button
            onClick={() => setShowVoiceModal(true)}
            className="absolute bottom-4 right-4 w-12 h-12 md:w-14 md:h-14 rounded-full btn-primary shadow-glow-indigo flex items-center justify-center ptt-pulse z-20"
            aria-label="Push to Talk — voice question"
          >
            <Icon name="MicrophoneIcon" size={22} className="text-white" />
          </button>
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col min-h-[500px] lg:min-h-full bg-obsidian/40">
          <AIAgentPanel
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
          />
        </div>
      </div>

      {/* Voice Modal */}
      {showVoiceModal && (
        <VoiceModal onClose={() => setShowVoiceModal(false)} />
      )}
    </div>
  );
}