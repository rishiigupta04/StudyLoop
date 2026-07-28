import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import VoiceModal from './VoiceModal';
import Icon from '@/components/ui/AppIcon';
import { useTildePTT } from '@/hooks/useTildePTT';
import { useGamification } from '@/context/GamificationContext';

export default function VideoStudyLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { awardXP } = useGamification();
  const [activeTimestamp, setActiveTimestamp] = useState('24:10');

  useEffect(() => {
    if (location.state?.timestamp) {
      setActiveTimestamp(location.state.timestamp);
    }
  }, [location.state]);

  const ptt = useTildePTT({
    onSeekTimestamp: (ts) => setActiveTimestamp(ts),
  });

  const videoTitle = location.state?.videoTitle || 'MIT 6.006 Introduction to Algorithms — Lecture 1';

  const handleShareSession = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    awardXP(10, 'Shared Study Session!');
    toast.success('Study session link & active timestamp copied to clipboard! (+10 XP)');
  };

  const handleOpenSettings = () => {
    navigate('/settings');
  };

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
            {videoTitle}
          </span>
          <span className="text-xs text-muted-foreground hidden md:block">· MIT OpenCourseWare</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Transcript Active
          </span>
          <button
            onClick={() => ptt.startListening()}
            className="px-2.5 py-1 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-600/40 transition-colors shadow-glow-indigo-sm"
            title="Hold ~ or click to ask voice question"
          >
            <Icon name="MicrophoneIcon" size={14} className="text-indigo-400 ptt-pulse" />
            <span className="hidden sm:inline font-bold">Voice Copilot</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.2 text-[10px] font-mono rounded bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 font-semibold">~</kbd>
          </button>
          <button
            onClick={handleShareSession}
            className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Share Study Session Link"
            aria-label="Share Study Session Link"
          >
            <Icon name="ShareIcon" size={16} />
          </button>
          <button
            onClick={handleOpenSettings}
            className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Open Copilot Settings (/settings)"
            aria-label="Open Copilot Settings"
          >
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
            onOpenVoiceModal={() => ptt.startListening()}
          />
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col min-h-[500px] lg:min-h-full bg-obsidian/40">
          <AIAgentPanel
            activeTimestamp={activeTimestamp}
            onTimestampClick={(ts) => setActiveTimestamp(ts)}
            onOpenVoiceModal={() => ptt.startListening()}
          />
        </div>
      </div>

      {/* Voice Modal (Triggered via ~ Key or UI Button) */}
      {ptt.isOpen && (
        <VoiceModal
          stage={ptt.stage}
          recognizedText={ptt.recognizedText}
          aiResponse={ptt.aiResponse}
          activeStep={ptt.activeStep}
          onStartListening={ptt.startListening}
          onStopListening={ptt.stopListeningAndProcess}
          onClose={ptt.closeModal}
          onSeekTimestamp={(ts) => setActiveTimestamp(ts)}
        />
      )}
    </div>
  );
}