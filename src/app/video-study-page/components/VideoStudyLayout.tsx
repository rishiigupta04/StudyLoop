import React, { useState } from 'react';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import VoiceModal from './VoiceModal';
import Icon from '@/components/ui/AppIcon';

export default function VideoStudyLayout() {
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [activeTimestamp, setActiveTimestamp] = useState('24:10');

  return (
    <div className="flex flex-col min-h-full flex-1 bg-obsidian">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/80 bg-surface-card/60 flex-shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="PlayCircleIcon" size={16} className="text-indigo-400" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">Now Studying:</span>
          </div>
          <span className="text-sm font-bold text-foreground truncate max-w-xs sm:max-w-md lg:max-w-lg">
            MIT 6.006 Introduction to Algorithms — Lecture 1
          </span>
          <span className="text-xs text-muted-foreground hidden md:block">· MIT OpenCourseWare</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Transcript Active
          </span>
          <button className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="ShareIcon" size={16} />
          </button>
          <button className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="Cog6ToothIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area — Responsive 2-Pane Layout */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
        {/* Left: Video Pane */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[480px] lg:min-h-full relative border-b lg:border-b-0 lg:border-r border-border/80">
          <VideoPane
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
            onOpenVoiceModal={() => setShowVoiceModal(true)}
          />
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col min-h-[500px] lg:min-h-full bg-obsidian/40">
          <AIAgentPanel
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
          />
        </div>
      </div>

      {/* Fixed Viewport FAB for Mobile/Quick Voice Access */}
      <button
        onClick={() => setShowVoiceModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full btn-primary shadow-glow-indigo flex items-center justify-center ptt-pulse z-40 lg:hidden"
        aria-label="Push to Talk — voice question"
        title="Hold down ~ or tap to ask voice question"
      >
        <Icon name="MicrophoneIcon" size={24} className="text-white" />
      </button>

      {/* Voice Modal */}
      {showVoiceModal && (
        <VoiceModal onClose={() => setShowVoiceModal(false)} />
      )}
    </div>
  );
}