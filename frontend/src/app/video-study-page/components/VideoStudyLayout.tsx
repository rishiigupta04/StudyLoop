import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import type { ChatMessage } from './QAChatTab';
import VoiceModal from './VoiceModal';
import Icon from '@/components/ui/AppIcon';
import { useTildePTT } from '@/hooks/useTildePTT';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useStudySocket, type Lang } from '@/hooks/useStudySocket';
import { useVideoTranscript } from '@/hooks/useVideoTranscript';
import { extractYouTubeId, IN_PROGRESS_STATUSES } from '@/services/transcriptService';
import { parseClock } from '@/lib/time';
import { executePlayerAction, resetSeekHistory } from '@/lib/playerActions';

// MIT 6.006 (Fall 2011) Lecture 1 — Algorithmic Thinking, Peak Finding. Matches the demo chapters.
const DEFAULT_VIDEO_ID = 'HtSuA80QTyo';
import { useGamification } from '@/context/GamificationContext';

export default function VideoStudyLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { awardXP } = useGamification();
  const [activeTimestamp, setActiveTimestamp] = useState('0:00');
  const [language, setLanguage] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('studyloop.lang') as Lang) || 'en';
    } catch {
      return 'en';
    }
  });

  // video: ?v=<id|url> → router state from the dashboard URL bar → demo lecture
  const queryVideo = new URLSearchParams(location.search).get('v');
  const videoId =
    extractYouTubeId(queryVideo || location.state?.videoUrl || location.state?.videoId || '') || DEFAULT_VIDEO_ID;

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const player = useYouTubePlayer(playerHostRef, videoId);
  const asr = useSpeechRecognition();
  const socket = useStudySocket({
    videoId,
    language,
    getPlayback: () => ({ playback_s: player.getCurrentTime(), max_watched_s: player.maxWatched() }),
  });

  // transcript ingestion (Tier 1a): status streams over the socket, segments feed the Transcript tab
  const transcript = useVideoTranscript(videoId, socket.videoStatus, socket.status === 'open');
  const transcriptChip =
    transcript.status === 'ready'
      ? null
      : IN_PROGRESS_STATUSES.includes(transcript.status)
        ? {
            dot: 'bg-amber-400 animate-pulse',
            label: transcript.status === 'transcribing' ? 'Transcribing…' : transcript.status === 'embedding' ? 'Indexing…' : 'Preparing transcript…',
            title: 'Getting the transcript ready for Q&A and smart seek. Voice playback works now.',
          }
        : {
            dot: 'bg-slate-400',
            label: 'Playback only',
            title: 'No usable transcript — see the Transcript tab for the reason. Voice playback still works.',
          };

  // Q&A chat (Tier 1b): typed questions stream in over the same socket; voice answers land here too
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  useEffect(() => setChat([]), [videoId]);
  const clockNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const patchChat = (id: string, patch: Partial<ChatMessage>) =>
    setChat((c) => c.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const sendChat = useCallback(
    async (text: string) => {
      const id = `${Date.now()}`;
      setChat((c) => [
        ...c,
        { id: `${id}-u`, role: 'user', text, time: clockNow(), via: 'typed' },
        { id: `${id}-a`, role: 'ai', text: '', time: clockNow(), via: 'typed', streaming: true },
      ]);
      setChatBusy(true);
      let streamed = '';
      const { msg } = await socket.sendUtterance(text, {
        onDelta: (d) => {
          streamed += d;
          patchChat(`${id}-a`, { text: streamed });
        },
      });
      if (msg.type === 'action') {
        executePlayerAction(player, msg.action); // typed commands ("pause", "go to 12:30") work too
        patchChat(`${id}-a`, { text: msg.message, streaming: false });
      } else if (msg.type === 'answer.done') {
        patchChat(`${id}-a`, { text: msg.text, streaming: false });
      } else {
        patchChat(`${id}-a`, { text: msg.message, streaming: false, isError: true });
      }
      setChatBusy(false);
    },
    [socket.sendUtterance, player]
  );

  const ptt = useTildePTT({
    language,
    asr,
    player,
    sendUtterance: socket.sendUtterance,
    cancelTurn: socket.cancelTurn,
    onTurn: (userText, reply, meta) => {
      if (meta.isAction) return; // player commands are confirmed in the voice modal, not logged as chat
      const id = `${Date.now()}-v`;
      setChat((c) => [
        ...c,
        { id: `${id}-u`, role: 'user', text: userText, time: clockNow(), via: 'voice' },
        { id: `${id}-a`, role: 'ai', text: reply, time: clockNow(), via: 'voice' },
      ]);
    },
  });

  const seekToTimestamp = useCallback(
    (ts: string) => {
      setActiveTimestamp(ts);
      const secs = parseClock(ts);
      if (!Number.isNaN(secs)) player.seekTo(secs);
    },
    [player]
  );

  // deep links like navigate('/video-study-page', { state: { timestamp: '24:10' } })
  useEffect(() => {
    if (location.state?.timestamp && player.status === 'ready') seekToTimestamp(location.state.timestamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, player.status]);

  useEffect(() => {
    try {
      localStorage.setItem('studyloop.lang', language);
    } catch {
      /* private mode */
    }
  }, [language]);

  useEffect(() => {
    if (ptt.error) toast.error(ptt.error);
  }, [ptt.error]);

  useEffect(() => resetSeekHistory(), [videoId]);

  // Dev only: drive the full voice pipeline with typed text (no mic needed), e.g. in the preview pane:
  //   await window.__studyloopSay('go back 30 seconds')
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __studyloopSay?: (text: string) => Promise<void> };
    w.__studyloopSay = ptt.processText;
    return () => {
      delete w.__studyloopSay;
    };
  }, [ptt.processText]);

  const videoTitle = player.title || location.state?.videoTitle || 'Loading video…';

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

        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {socket.status === 'unauthorized' ? (
            <button
              onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)}
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 text-red-300"
              title="The voice server rejected your session — sign in again"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Sign in again
            </button>
          ) : (
            <span
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5"
              title={socket.status === 'open' ? 'Voice server connected' : 'Waking up the voice server (can take up to a minute on the free tier)'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  socket.status === 'open' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
              />
              {socket.status === 'open' ? 'Voice ready' : 'Connecting…'}
            </span>
          )}
          {transcriptChip && (
            <span
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full hidden md:flex items-center gap-1.5"
              title={transcriptChip.title}
              role="status"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${transcriptChip.dot}`} />
              {transcriptChip.label}
            </span>
          )}
          <div className="flex rounded-full border border-border/80 overflow-hidden text-[11px] font-semibold" role="group" aria-label="Response language">
            {(['en', 'hi'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-2 py-1 transition-colors ${
                  language === l ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={language === l}
              >
                {l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>
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
            onTimestampClick={seekToTimestamp}
            onOpenVoiceModal={() => ptt.startListening()}
            player={player}
            playerHostRef={playerHostRef}
          />
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col min-h-[500px] lg:min-h-full bg-obsidian/40">
          <AIAgentPanel
            transcript={transcript}
            chat={chat}
            chatBusy={chatBusy}
            onSendChat={(t) => void sendChat(t)}
            currentTime={player.currentTime}
            language={language}
            onTimestampClick={seekToTimestamp}
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
          onSeekTimestamp={seekToTimestamp}
          meta={ptt.meta}
          asrSupported={asr.supported}
        />
      )}
    </div>
  );
}