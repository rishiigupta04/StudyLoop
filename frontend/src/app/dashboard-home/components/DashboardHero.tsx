import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';

const DEMO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

export default function DashboardHero() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleStartStudying = () => {
    if (!url?.trim()) {
      toast?.error('Please paste a YouTube URL first');
      return;
    }
    if (!url?.includes('youtube.com') && !url?.includes('youtu.be')) {
      toast?.error('Please enter a valid YouTube URL');
      return;
    }
    setIsLoading(true);
    // BACKEND INTEGRATION: POST /api/videos/process { url } → videoId, metadata, transcript
    setTimeout(() => {
      setIsLoading(false);
      navigate('/video-study-page', { state: { videoUrl: url } });
    }, 900);
  };

  const fillDemo = () => {
    setUrl(DEMO_URL);
  };

  const featureBadges = [
    { icon: 'MicrophoneIcon', label: 'Push-to-Talk (~)', color: 'text-indigo-400' },
    { icon: 'ShieldCheckIcon', label: 'Anti-Spoiler RAG', color: 'text-cyan-400' },
    { icon: 'DocumentTextIcon', label: 'Auto Notes', color: 'text-emerald-400' },
    { icon: 'GlobeAltIcon', label: 'Hinglish ASR', color: 'text-amber-400' },
    { icon: 'ArrowUpOnSquareIcon', label: 'Notion Export', color: 'text-purple-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative mb-8"
    >
      {/* Background card with glassmorphism & ambient glowing orb */}
      <div className="relative rounded-3xl overflow-hidden glass-card border border-indigo-500/20 shadow-glow-indigo-sm">
        <div className="absolute top-0 right-0 w-80 h-80 orb-indigo opacity-40 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 orb-cyan opacity-20 pointer-events-none" />

        <div className="relative z-10 p-6 md:p-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Icon name="BoltIcon" size={18} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">
                AI Command Station
              </h1>
            </div>
            <p className="text-sm md:text-base text-foreground-muted">
              Paste any YouTube lecture link to initiate voice copilot & anti-spoiler vector search.
            </p>
          </div>

          {/* Futuristic Cyberpunk URL Input Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative group rounded-2xl p-[1px] bg-gradient-to-r from-indigo-500/40 via-cyan-500/40 to-indigo-500/40 shadow-glow-indigo-sm hover:shadow-glow-indigo transition-all duration-300">
              <div className="relative flex items-center bg-[#151926]/95 backdrop-blur-xl rounded-[15px] overflow-hidden">
                <div className="absolute left-4 text-indigo-400 group-focus-within:text-cyan-400 transition-colors pointer-events-none">
                  <Icon name="LinkIcon" size={18} />
                </div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e?.target?.value)}
                  onKeyDown={(e) => e?.key === 'Enter' && handleStartStudying()}
                  placeholder="Paste YouTube video URL to start studying…"
                  className="w-full bg-transparent border-0 pl-11 pr-4 py-3.5 text-sm text-foreground font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={fillDemo}
                className="px-4 py-3.5 rounded-2xl bg-surface-card border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 transition-colors whitespace-nowrap"
              >
                Fill Demo
              </button>
              <button
                type="button"
                onClick={handleStartStudying}
                disabled={isLoading}
                className="btn-primary px-6 py-3.5 rounded-2xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-60 whitespace-nowrap shadow-glow-indigo-sm"
              >
                {isLoading ? (
                  <>
                    <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                    Ingesting...
                  </>
                ) : (
                  <>
                    <Icon name="PlayIcon" size={16} />
                    Start Studying
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Professional Modern Capability Badges */}
          <div className="flex flex-wrap gap-2.5 mt-5">
            {featureBadges.map((feat) => (
              <span
                key={`feat-${feat.label}`}
                className="text-xs text-foreground/90 font-medium px-3.5 py-1.5 rounded-full border border-border/80 bg-surface-card/60 flex items-center gap-2 backdrop-blur-md hover:border-indigo-500/30 transition-colors"
              >
                <Icon name={feat.icon as Parameters<typeof Icon>[0]['name']} size={14} className={feat.color} />
                <span>{feat.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}