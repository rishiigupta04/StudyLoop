import React, { useState } from 'react';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import VoiceModal from './VoiceModal';
import Icon from '@/components/ui/AppIcon';

export default function VideoStudyLayout() {
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [activeTimestamp, setActiveTimestamp] = useState('24:10');

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="PlayCircleIcon" size={16} className="text-primary" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">Now Studying:</span>
          </div>
          <span className="text-sm font-semibold text-foreground truncate max-w-xs lg:max-w-lg">
            MIT 6.006 Introduction to Algorithms — Lecture 1
          </span>
          <span className="text-xs text-muted-foreground hidden md:block">· MIT OpenCourseWare</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full">Transcript Active</span>
          <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150">
            <Icon name="ShareIcon" size={16} />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150">
            <Icon name="Cog6ToothIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Video Pane */}
        <div className="flex-1 min-w-0 relative">
          <VideoPane
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
          />
          {/* Floating PTT Button */}
          <button
            onClick={() => setShowVoiceModal(true)}
            className="absolute bottom-6 right-6 w-14 h-14 rounded-full btn-orange shadow-glow-orange flex items-center justify-center ptt-pulse z-20"
            aria-label="Push to Talk — voice question"
          >
            <Icon name="MicrophoneIcon" size={22} className="text-white" />
          </button>
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-[400px] xl:w-[440px] 2xl:w-[480px] flex-shrink-0 border-l border-border overflow-hidden">
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