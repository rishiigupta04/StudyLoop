import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/ui/AppIcon';
import { useGamification } from '@/context/GamificationContext';

interface ChatTurn {
  id: string;
  userQuery: string;
  aiResponse: string;
  timestamp: string; // e.g. "18:45"
  seconds: number;
  engine: 'Local DistilBERT' | 'Cloud BGE-M3 RAG';
  language: 'Hinglish' | 'English';
  latency: string;
  savedAsNote: boolean;
  bookmarked: boolean;
}

interface ChatSession {
  id: string;
  videoTitle: string;
  videoUrl: string;
  channel: string;
  date: string;
  totalTurns: number;
  turns: ChatTurn[];
}

const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: 'session-1',
    videoTitle: 'Stanford CS229: Gradient Descent & Cost Functions',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    channel: 'Stanford Online',
    date: '2026-07-26',
    totalTurns: 4,
    turns: [
      {
        id: 'turn-1-1',
        userQuery: 'Bhai, Gradient Descent me initial learning rate alpha kitna select karein?',
        aiResponse: 'Typically α = 0.01 or 0.001 set karte hain to avoid divergence on the 3D loss surface. If alpha is too large, the update rule θ := θ - α ∇J(θ) will overshoot local minima.',
        timestamp: '12:10',
        seconds: 730,
        engine: 'Cloud BGE-M3 RAG',
        language: 'Hinglish',
        latency: '340ms',
        savedAsNote: true,
        bookmarked: true,
      },
      {
        id: 'turn-1-2',
        userQuery: 'Go to where Backpropagation and Chain Rule were explained',
        aiResponse: 'Jumping player to 34:20 where Backpropagation partial derivatives ∂L/∂w = ∂L/∂a · ∂a/∂z are derived!',
        timestamp: '34:20',
        seconds: 2060,
        engine: 'Local DistilBERT',
        language: 'English',
        latency: '38ms',
        savedAsNote: true,
        bookmarked: false,
      },
      {
        id: 'turn-1-3',
        userQuery: 'Go back skip 10 seconds, missed that matrix multiply step',
        aiResponse: 'Skipped back 10 seconds to 34:10 for weight matrix multiplication walkthrough.',
        timestamp: '34:10',
        seconds: 2050,
        engine: 'Local DistilBERT',
        language: 'English',
        latency: '42ms',
        savedAsNote: false,
        bookmarked: false,
      },
      {
        id: 'turn-1-4',
        userQuery: 'Why does momentum prevent trapping in local minima saddle points?',
        aiResponse: 'Momentum accumulates velocity vectors v_t = β v_{t-1} + (1-β) ∇J. When gradient ∇J drops to ~0 near flat saddle points, accumulated momentum carries updates past the plateau.',
        timestamp: '42:15',
        seconds: 2535,
        engine: 'Cloud BGE-M3 RAG',
        language: 'English',
        latency: '410ms',
        savedAsNote: true,
        bookmarked: true,
      },
    ],
  },
  {
    id: 'session-2',
    videoTitle: 'MIT 6.006: Introduction to Algorithms',
    videoUrl: 'https://www.youtube.com/watch?v=HtSuA80QTyo',
    channel: 'MIT OpenCourseWare',
    date: '2026-07-25',
    totalTurns: 3,
    turns: [
      {
        id: 'turn-2-1',
        userQuery: 'Ye 1D peak finding ka recursive logic kya hai?',
        aiResponse: 'Midpoint element A[n/2] ko left aur right neighbors se compare karte hain. Agar A[n/2-1] bada hai, toh peak left half me exists karti hai. Isse time complexity O(log n) aati hai.',
        timestamp: '15:20',
        seconds: 920,
        engine: 'Cloud BGE-M3 RAG',
        language: 'Hinglish',
        latency: '290ms',
        savedAsNote: true,
        bookmarked: true,
      },
      {
        id: 'turn-2-2',
        userQuery: 'Skip 30 seconds forward',
        aiResponse: 'Advancing player +30 seconds to 15:50.',
        timestamp: '15:50',
        seconds: 950,
        engine: 'Local DistilBERT',
        language: 'English',
        latency: '35ms',
        savedAsNote: false,
        bookmarked: false,
      },
      {
        id: 'turn-2-3',
        userQuery: 'Summarize 2D matrix peak finding algorithm in 2 points',
        aiResponse: '1. Find 1D max in central column j = m/2.\n2. Compare with row neighbors to recurse into left/right matrix halves in O(n log m) time.',
        timestamp: '28:40',
        seconds: 1720,
        engine: 'Cloud BGE-M3 RAG',
        language: 'English',
        latency: '380ms',
        savedAsNote: true,
        bookmarked: false,
      },
    ],
  },
  {
    id: 'session-3',
    videoTitle: 'Harvard CS50: Neural Networks & Backprop',
    videoUrl: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
    channel: 'Harvard edX',
    date: '2026-07-24',
    totalTurns: 2,
    turns: [
      {
        id: 'turn-3-1',
        userQuery: 'Explain activation functions ReLU vs Sigmoid vanishing gradient',
        aiResponse: 'Sigmoid squashes outputs into (0,1), causing derivative f\'(x) <= 0.25 to vanish during deep backprop. ReLU (max(0,x)) maintains derivative = 1 for positive inputs.',
        timestamp: '22:15',
        seconds: 1335,
        engine: 'Cloud BGE-M3 RAG',
        language: 'English',
        latency: '320ms',
        savedAsNote: true,
        bookmarked: true,
      },
      {
        id: 'turn-3-2',
        userQuery: 'Bookmark this formula ∂L/∂w',
        aiResponse: 'Saved timestamped equation ∂L/∂w = ∂L/∂a · ∂a/∂z to study notes!',
        timestamp: '25:00',
        seconds: 1500,
        engine: 'Local DistilBERT',
        language: 'English',
        latency: '40ms',
        savedAsNote: true,
        bookmarked: false,
      },
    ],
  },
];

export default function ChatHistoryPage() {
  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>(INITIAL_SESSIONS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [engineFilter, setEngineFilter] = useState<'all' | 'local' | 'cloud' | 'starred' | 'hinglish'>('all');
  const [playingTurnAudioId, setPlayingTurnAudioId] = useState<string | null>(null);

  // New follow-up prompt state
  const [followUpQuery, setFollowUpQuery] = useState('');

  const { awardXP } = useGamification();
  const navigate = useNavigate();

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Filtered session list logic
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.videoTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.turns.some((t) => t.userQuery.toLowerCase().includes(searchQuery.toLowerCase()) || t.aiResponse.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesEngine =
      engineFilter === 'all' ||
      (engineFilter === 'local' && s.turns.some((t) => t.engine === 'Local DistilBERT')) ||
      (engineFilter === 'cloud' && s.turns.some((t) => t.engine === 'Cloud BGE-M3 RAG')) ||
      (engineFilter === 'hinglish' && s.turns.some((t) => t.language === 'Hinglish')) ||
      (engineFilter === 'starred' && s.turns.some((t) => t.bookmarked));

    return matchesSearch && matchesEngine;
  });

  const toggleTurnBookmark = (sessionId: string, turnId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              turns: s.turns.map((t) => (t.id === turnId ? { ...t, bookmarked: !t.bookmarked } : t)),
            }
          : s
      )
    );
    toast.success('Updated bookmark status!');
  };

  const saveTurnAsNote = (turn: ChatTurn) => {
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        turns: s.turns.map((t) => (t.id === turn.id ? { ...t, savedAsNote: true } : t)),
      }))
    );
    awardXP(15, `Converted "${turn.userQuery.slice(0, 20)}..." to Note!`);
    toast.success(`Turn converted to timestamped note in /notes! (+15 XP)`);
  };

  const playSynthesizedVoice = (turnId: string) => {
    if (playingTurnAudioId === turnId) {
      setPlayingTurnAudioId(null);
      toast.info('Audio playback paused');
      return;
    }

    setPlayingTurnAudioId(turnId);
    toast.success('Synthesizing audio output via MeloTTS...');

    setTimeout(() => {
      setPlayingTurnAudioId(null);
    }, 4500);
  };

  const deleteTurn = (sessionId: string, turnId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              totalTurns: s.totalTurns - 1,
              turns: s.turns.filter((t) => t.id !== turnId),
            }
          : s
      )
    );
    toast.success('Deleted chat turn!');
  };

  const deleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId && sessions.length > 1) {
      setActiveSessionId(sessions.find((s) => s.id !== sessionId)?.id || '');
    }
    toast.success('Session deleted from history!');
  };

  const handleNavigateToTimestamp = (videoUrl: string, videoTitle: string, timestamp: string, seconds: number) => {
    navigate('/video-study-page', {
      state: { videoUrl, videoTitle, timestamp, seconds },
    });
    toast.info(`Seeking ${videoTitle} to timestamp ${timestamp}`);
  };

  const handleSendFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpQuery.trim() || !activeSession) return;

    const isLocalCommand = followUpQuery.toLowerCase().includes('skip') || followUpQuery.toLowerCase().includes('jump') || followUpQuery.toLowerCase().includes('pause');

    const newTurn: ChatTurn = {
      id: `turn-${Date.now()}`,
      userQuery: followUpQuery.trim(),
      aiResponse: isLocalCommand
        ? `[⚡ Local DistilBERT <45ms]: Executed command "${followUpQuery.trim()}" on video player!`
        : `[🌐 Cloud RAG BGE-M3]: Analyzed concept query "${followUpQuery.trim()}" against video transcript embeddings!`,
      timestamp: '45:00',
      seconds: 2700,
      engine: isLocalCommand ? 'Local DistilBERT' : 'Cloud BGE-M3 RAG',
      language: followUpQuery.match(/(kaise|kya|bhai|batao|kar)/i) ? 'Hinglish' : 'English',
      latency: isLocalCommand ? '36ms' : '350ms',
      savedAsNote: false,
      bookmarked: false,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, totalTurns: s.totalTurns + 1, turns: [...s.turns, newTurn] }
          : s
      )
    );

    setFollowUpQuery('');
    awardXP(20, 'Asked follow-up voice query in chat history!');
    toast.success('AI Copilot processed follow-up query! (+20 XP)');
  };

  const exportSessionMarkdown = (session: ChatSession) => {
    const mdHeader = `# StudyLoop Copilot Session Log: ${session.videoTitle}\nDate: ${session.date}\n\n`;
    const mdBody = session.turns
      .map(
        (t) =>
          `### [${t.timestamp}] User (${t.language})\n*Query*: "${t.userQuery}"\n*Engine*: ${t.engine} (${t.latency})\n\n**AI Response**:\n${t.aiResponse}\n`
      )
      .join('\n---\n\n');

    const blob = new Blob([mdHeader + mdBody], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_log_${session.id}.md`;
    a.click();

    awardXP(20, 'Exported Chat Transcript Log!');
    toast.success(`Exported Chat Session Markdown! (+20 XP)`);
  };

  // Analytics Metrics
  const totalTurnsLogged = sessions.reduce((acc, s) => acc + s.turns.length, 0);
  const localTurnsCount = sessions.reduce((acc, s) => acc + s.turns.filter((t) => t.engine === 'Local DistilBERT').length, 0);
  const cloudTurnsCount = sessions.reduce((acc, s) => acc + s.turns.filter((t) => t.engine === 'Cloud BGE-M3 RAG').length, 0);
  const hinglishRatio = Math.round(
    (sessions.reduce((acc, s) => acc + s.turns.filter((t) => t.language === 'Hinglish').length, 0) / (totalTurnsLogged || 1)) * 100
  );

  return (
    <div className="flex h-screen bg-obsidian text-foreground overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar activeRoute="/chat-history" />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="px-8 py-5 border-b border-border/80 bg-surface-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Icon name="ChatBubbleLeftRightIcon" size={22} />
              </div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                Copilot Chat History & Analytics
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-bold font-mono">
                {totalTurnsLogged} Turns Logged
              </span>
            </div>
            <p className="text-xs text-foreground-muted">
              Bilingual voice Q&A logs, timestamp seeks, and AI reasoning traces across lecture sessions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => exportSessionMarkdown(activeSession)}
              className="px-4 py-2.5 rounded-xl bg-surface-card border border-indigo-500/30 text-xs font-bold text-indigo-300 hover:bg-surface-elevated hover:border-indigo-500/60 transition-colors flex items-center gap-2"
            >
              <Icon name="ArrowUpOnSquareIcon" size={16} />
              Export Session (.MD)
            </button>
          </div>
        </header>

        {/* AI Conversation Analytics Banner */}
        <div className="px-8 py-3 bg-[#121624] border-b border-border/60 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="BoltIcon" size={16} className="text-indigo-400" />
            <div>
              <span className="text-muted-foreground block text-[10px]">Local DistilBERT</span>
              <strong className="text-foreground font-mono">{localTurnsCount} Turns (&lt; 45ms)</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="CloudIcon" size={16} className="text-cyan-400" />
            <div>
              <span className="text-muted-foreground block text-[10px]">Cloud BGE-M3 RAG</span>
              <strong className="text-foreground font-mono">{cloudTurnsCount} Q&A Turns</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="LanguageIcon" size={16} className="text-purple-400" />
            <div>
              <span className="text-muted-foreground block text-[10px]">Bilingual Ratio</span>
              <strong className="text-purple-300 font-mono">{hinglishRatio}% Hinglish Speech</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="SparklesIcon" size={16} className="text-emerald-400" />
            <div>
              <span className="text-muted-foreground block text-[10px]">Saved to Notes</span>
              <strong className="text-emerald-300 font-mono">
                {sessions.reduce((acc, s) => acc + s.turns.filter((t) => t.savedAsNote).length, 0)} Key Formulas
              </strong>
            </div>
          </div>
        </div>

        {/* Master-Detail Split Screen */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Master Panel: Sessions List & Search */}
          <div className="w-full md:w-80 lg:w-96 border-r border-border/80 bg-[#121624] flex flex-col flex-shrink-0 overflow-hidden">
            {/* Search & Engine Filter */}
            <div className="p-4 border-b border-border/60 space-y-3">
              <div className="relative">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search queries or answers..."
                  className="w-full input-field rounded-xl pl-10 pr-4 py-2 text-xs font-medium bg-[#0B0E17]"
                />
              </div>

              {/* Filter Tabs */}
              <div className="grid grid-cols-5 gap-1 p-1 bg-obsidian rounded-xl border border-border/80 text-[10px] font-bold">
                <button
                  onClick={() => setEngineFilter('all')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    engineFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setEngineFilter('local')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    engineFilter === 'local' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ⚡ Local
                </button>
                <button
                  onClick={() => setEngineFilter('cloud')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    engineFilter === 'cloud' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🌐 Cloud
                </button>
                <button
                  onClick={() => setEngineFilter('hinglish')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    engineFilter === 'hinglish' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🌐 Hinglish
                </button>
                <button
                  onClick={() => setEngineFilter('starred')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    engineFilter === 'starred' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ⭐ Starred
                </button>
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
              {filteredSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => setActiveSessionId(session.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer text-left relative group ${
                      isActive
                        ? 'bg-indigo-950/40 border-indigo-500/60 shadow-md'
                        : 'bg-surface-card border-border/70 hover:border-indigo-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-indigo-400 truncate max-w-[180px]">
                        {session.channel}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">{session.date}</span>
                    </div>

                    <h3 className="text-xs font-bold text-foreground line-clamp-1 mb-2">
                      {session.videoTitle}
                    </h3>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono font-semibold text-cyan-300">
                        <Icon name="ChatBubbleLeftIcon" size={12} />
                        {session.turns.length} Turns
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-opacity"
                        title="Delete Session"
                      >
                        <Icon name="TrashIcon" size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Detail Panel: Full Conversation Log Inspector */}
          <div className="flex-1 flex flex-col bg-[#0B0E17] overflow-hidden text-left">
            {activeSession ? (
              <>
                {/* Session Header Banner */}
                <div className="px-8 py-4 bg-[#151926] border-b border-border/80 flex items-center justify-between gap-4 flex-shrink-0">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">
                      Lecture Chat Log • {activeSession.channel}
                    </span>
                    <h2 className="text-lg font-bold text-foreground truncate max-w-2xl">
                      {activeSession.videoTitle}
                    </h2>
                  </div>
                  <button
                    onClick={() =>
                      handleNavigateToTimestamp(
                        activeSession.videoUrl,
                        activeSession.videoTitle,
                        activeSession.turns[0]?.timestamp || '00:00',
                        activeSession.turns[0]?.seconds || 0
                      )
                    }
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 whitespace-nowrap"
                  >
                    <Icon name="PlayIcon" size={14} />
                    Open in Video Workspace
                  </button>
                </div>

                {/* Turns Timeline Log */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin">
                  {activeSession.turns.map((turn, idx) => {
                    const isAudioPlaying = playingTurnAudioId === turn.id;
                    return (
                      <motion.div
                        key={turn.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-6 rounded-3xl bg-[#151926] border border-border/80 relative space-y-4 shadow-lg"
                      >
                        {/* User Speech Query Bubble */}
                        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/60">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                              🎙️
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-indigo-300">User Speech (Held ~)</span>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold font-mono">
                                  {turn.language}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-foreground leading-snug font-mono">
                                "{turn.userQuery}"
                              </p>
                            </div>
                          </div>

                          {/* Clickable Lecture Seek Badge */}
                          <button
                            onClick={() =>
                              handleNavigateToTimestamp(
                                activeSession.videoUrl,
                                activeSession.videoTitle,
                                turn.timestamp,
                                turn.seconds
                              )
                            }
                            className="px-3 py-1 rounded-xl bg-indigo-950 border border-indigo-500/40 text-cyan-300 font-mono font-bold text-xs hover:bg-indigo-900 transition-colors flex items-center gap-1.5 shrink-0"
                            title="Seek video player to target timestamp"
                          >
                            <Icon name="PlayCircleIcon" size={14} className="text-indigo-400" />
                            <span>{turn.timestamp}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">▸ Seek</span>
                          </button>
                        </div>

                        {/* AI Copilot Answer & Engine Trace */}
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center font-bold text-xs shrink-0">
                            ✨
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-bold text-cyan-300">AI Voice Copilot</span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                    turn.engine === 'Local DistilBERT'
                                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/30'
                                      : 'bg-purple-950 text-purple-300 border-purple-500/30'
                                  }`}
                                >
                                  {turn.engine} ({turn.latency})
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-foreground-muted leading-relaxed font-sans whitespace-pre-wrap mb-4 bg-[#0B0E17] p-4 rounded-2xl border border-border/60">
                              {turn.aiResponse}
                            </p>

                            {/* Simulated MeloTTS Audio Waveform Indicator */}
                            {isAudioPlaying && (
                              <div className="mb-4 p-3 rounded-2xl bg-indigo-950 border border-indigo-500/40 flex items-center gap-3 animate-pulse">
                                <Icon name="SpeakerWaveIcon" size={16} className="text-cyan-300 animate-spin" />
                                <span className="text-xs font-mono text-cyan-300 font-bold">MeloTTS Audio Synthesis Playback...</span>
                                <div className="flex items-center gap-1 h-3 ml-auto">
                                  {[40, 80, 30, 95, 60, 85, 45].map((h, i) => (
                                    <div key={`wave-bar-${i}`} className="w-1 bg-cyan-400 rounded-full animate-bounce" style={{ height: `${h}%` }} />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Turn Footer Actions */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                              <span className="text-[10px] font-mono">Turn #{idx + 1}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => playSynthesizedVoice(turn.id)}
                                  className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                                    isAudioPlaying
                                      ? 'bg-cyan-600 text-white border-cyan-400'
                                      : 'bg-surface-elevated text-muted-foreground border-border hover:text-cyan-300'
                                  }`}
                                >
                                  <Icon name="SpeakerWaveIcon" size={14} />
                                  <span className="text-[10px] font-semibold">
                                    {isAudioPlaying ? 'Playing Audio...' : 'Synthesize Voice'}
                                  </span>
                                </button>
                                <button
                                  onClick={() => saveTurnAsNote(turn)}
                                  className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                                    turn.savedAsNote
                                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                                      : 'bg-surface-elevated text-muted-foreground border-border hover:text-emerald-300'
                                  }`}
                                >
                                  <Icon name="BookmarkIcon" size={14} />
                                  <span className="text-[10px] font-semibold">
                                    {turn.savedAsNote ? 'Saved in Notes' : 'Save as Note (+15 XP)'}
                                  </span>
                                </button>
                                <button
                                  onClick={() => toggleTurnBookmark(activeSession.id, turn.id)}
                                  className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-amber-400 transition-colors flex items-center gap-1"
                                >
                                  <Icon
                                    name="StarIcon"
                                    size={14}
                                    className={turn.bookmarked ? 'text-amber-400 fill-amber-400' : ''}
                                  />
                                </button>
                                <button
                                  onClick={() => deleteTurn(activeSession.id, turn.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                                  title="Delete Turn"
                                >
                                  <Icon name="TrashIcon" size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Follow-up Query Bar */}
                <div className="p-4 bg-[#151926] border-t border-border/80 flex-shrink-0">
                  <form onSubmit={handleSendFollowUp} className="flex gap-2 max-w-4xl mx-auto">
                    <input
                      type="text"
                      value={followUpQuery}
                      onChange={(e) => setFollowUpQuery(e.target.value)}
                      placeholder="Ask a follow-up voice question or test a player command (e.g. 'Why does large alpha oscillate?')..."
                      className="flex-1 input-field rounded-xl px-4 py-2.5 text-xs bg-[#0B0E17]"
                    />
                    <button
                      type="submit"
                      className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 whitespace-nowrap"
                    >
                      <Icon name="PaperAirplaneIcon" size={14} />
                      Send Follow-Up
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
                <p className="text-sm">Select a chat session on the left to inspect conversation turns.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
