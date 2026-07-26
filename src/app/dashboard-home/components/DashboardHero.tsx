import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';

const DUMMY_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

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
      navigate('/video-study-page');
    }, 1000);
  };

  const fillDummy = () => {
    setUrl(DUMMY_URL);
    toast?.success('Demo URL filled! Click "Start Studying" to continue.');
  };

  return (
    <div className="relative mb-6">
      {/* Background gradient card */}
      <div className="relative rounded-2xl overflow-hidden border border-border">
        <div className="absolute inset-0 gradient-purple-blue opacity-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 orb-purple opacity-30 pointer-events-none" />
        <div className="relative z-10 p-6 md:p-8">
          {/* Welcome Text */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">👋</span>
              <h1 className="text-2xl font-extrabold text-foreground">
                Welcome back, Arjun!
              </h1>
            </div>
            <p className="text-base text-muted-foreground">
              What will you study today?
            </p>
          </div>

          {/* URL Input */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Icon name="LinkIcon" size={18} />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e?.target?.value)}
                onKeyDown={(e) => e?.key === 'Enter' && handleStartStudying()}
                placeholder="Paste YouTube URL to start studying…"
                className="input-field w-full rounded-xl pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={fillDummy}
                className="px-4 py-3.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all duration-150 whitespace-nowrap"
              >
                Try Demo
              </button>
              <button
                onClick={handleStartStudying}
                disabled={isLoading}
                className="btn-orange px-6 py-3.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-60 whitespace-nowrap"
              >
                {isLoading ? (
                  <>
                    <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                    Processing…
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

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { icon: '🎤', label: 'Voice Q&A' },
              { icon: '📝', label: 'Auto Notes' },
              { icon: '⏱️', label: 'Timestamps' },
              { icon: '🌐', label: 'AI Voice Control' },
              { icon: '📤', label: 'Export to Notion' },
            ]?.map((feat) => (
              <span
                key={`feat-${feat?.label}`}
                className="text-xs text-muted-foreground px-3 py-1 rounded-full border border-border bg-muted/50 flex items-center gap-1.5"
              >
                <span>{feat?.icon}</span>
                {feat?.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}