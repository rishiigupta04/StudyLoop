import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import CursorOrb from '@/components/ui/CursorOrb';

const DEMO_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const MODEL_BADGES = [
  { name: 'Whisper ASR', desc: 'Bilingual Hindi/English Speech Recognition', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { name: 'Qwen2.5 LLM', desc: 'Reasoning & Grounded Answering', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { name: 'BGE-M3 RAG', desc: '1024-dim Vector Embeddings', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  { name: 'MeloTTS', desc: 'Fluent Accent-Matched Audio Output', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
];

const METRICS = [
  { value: '< 150ms', label: 'Voice PTT Response Latency', icon: 'BoltIcon', color: 'text-indigo-400' },
  { value: '100%', label: 'Anti-Spoiler Grounded Precision', icon: 'ShieldCheckIcon', color: 'text-cyan-400' },
  { value: '1024-dim', label: 'Cross-Lingual Vector Index', icon: 'SparklesIcon', color: 'text-emerald-400' },
  { value: 'Bi-directional', label: 'English & Hinglish Voice AI', icon: 'GlobeAltIcon', color: 'text-purple-400' },
];

const UNIVERSITIES = [
  { name: 'MIT OpenCourseWare', logo: '🏛️' },
  { name: 'Stanford Online', logo: '🌲' },
  { name: 'Harvard edX', logo: '🎓' },
  { name: 'IIT Kharagpur', logo: '🔬' },
  { name: 'NPTEL India', logo: '📚' },
];

const FEATURES = [
  {
    icon: 'MicrophoneIcon',
    title: 'Push-to-Talk Voice Copilot',
    desc: 'Hold down the Tilde (~) key while watching any video to ask questions in natural English or Hindi without pausing playback.',
    tag: 'Sub-150ms PTT Engine',
    color: 'from-indigo-600/20 to-purple-600/10 border-indigo-500/30',
    iconColor: 'text-indigo-400',
  },
  {
    icon: 'SparklesIcon',
    title: 'Anti-Spoiler Grounded RAG',
    desc: 'Powered by BGE-M3 cross-lingual embeddings. Answers are strictly bounded to content played up to your current timestamp.',
    tag: 'pgvector Anti-Spoiler',
    color: 'from-cyan-600/20 to-blue-600/10 border-cyan-500/30',
    iconColor: 'text-cyan-400',
  },
  {
    icon: 'DocumentTextIcon',
    title: 'Automated Timestamped Notes',
    desc: 'AI automatically captures key takeaways, equations, and definitions linked to video timestamps as you watch.',
    tag: '1-Click Notion/PDF Export',
    color: 'from-emerald-600/20 to-teal-600/10 border-emerald-500/30',
    iconColor: 'text-emerald-400',
  },
  {
    icon: 'LanguageIcon',
    title: 'Bilingual Hinglish Intelligence',
    desc: 'Ask questions in mixed Hindi/English ("ye recursion algorithm kaise work karta hai?") and receive fluent voice & text answers.',
    tag: 'Code-Mixed ASR',
    color: 'from-purple-600/20 to-pink-600/10 border-purple-500/30',
    iconColor: 'text-purple-400',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Paste YouTube URL',
    desc: 'Insert any lecture, tutorial, or course video URL. Our TranscriptAPI pipeline extracts rich timestamped transcripts instantly.',
  },
  {
    num: '02',
    title: 'Press ~ & Talk in Flow',
    desc: 'Hold the Tilde (~) key anytime while watching. Ask questions, request summaries, or jump timestamps hands-free.',
  },
  {
    num: '03',
    title: 'Master & Export Notes',
    desc: 'Review auto-generated timestamped notes, test yourself with AI quizzes, and export directly to Notion, PDF, or Markdown.',
  },
];

const FAQS = [
  {
    q: 'How does the Push-to-Talk (PTT) feature work?',
    a: 'Simply press and hold the Tilde (~) key on your keyboard while watching a video. Speak your command or question, then release the key. The AI voice agent will transcribe, process, and answer in real-time without disturbing video playback.',
  },
  {
    q: 'What is Anti-Spoiler RAG?',
    a: 'Traditional video AI tools search the entire transcript, often spoiling answers or concepts that appear later in the video. StudyLoop’s pgvector Anti-Spoiler guardrail strictly filters search bounds to segments played up to your current timestamp.',
  },
  {
    q: 'Can I ask questions in Hindi or Hinglish?',
    a: 'Yes! StudyLoop utilizes Whisper-Hindi2Hinglish for ASR and BGE-M3 for cross-lingual vector search. You can ask naturally in mixed Hindi/English and receive responses matched to your preferred spoken language.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes, StudyLoop includes 10 free video study sessions with full voice copilot, transcript ingestion, and Notion export capabilities.',
  },
];

export default function LandingPage() {
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isDemoActive, setIsDemoActive] = useState(false);
  const navigate = useNavigate();

  const handleProcessUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetUrl = urlInput.trim() || DEMO_YOUTUBE_URL;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      navigate('/video-study-page', { state: { videoUrl: targetUrl } });
    }, 900);
  };

  const triggerVoiceDemo = () => {
    setIsDemoActive(true);
    setTimeout(() => {
      setIsDemoActive(false);
    }, 4500);
  };

  return (
    <div className="min-h-screen bg-obsidian text-foreground selection:bg-indigo-600/30 relative overflow-hidden">
      <CursorOrb />

      {/* ── Clean Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0B0E17]/95 border-b border-border/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 cursor-pointer group" title="StudyLoop Home">
            <AppLogo size={36} />
            <span className="font-black text-xl tracking-tight text-foreground group-hover:text-indigo-400 transition-colors">
              Study<span className="gradient-text-indigo">Loop</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#demo" className="hover:text-foreground transition-colors">Live Demo</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">Workflow</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2"
            >
              <Icon name="SparklesIcon" size={16} />
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative pt-36 pb-16 px-6 max-w-7xl mx-auto text-center">
        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1] mb-6"
        >
          Talk to Any YouTube Video in Real Time with{' '}
          <span className="gradient-text-hero">AI Voice Copilot</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl text-foreground-muted max-w-3xl mx-auto mb-10 leading-relaxed"
        >
          Hold down the <kbd className="px-2 py-1 rounded bg-surface-elevated border border-border text-indigo-300 font-mono text-sm shadow-inner">~ Tilde</kbd> key to ask questions, jump timestamps, and generate notes while watching lectures—in Hindi or English.
        </motion.p>

        {/* Clean URL Processing Bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mb-10"
        >
          <form onSubmit={handleProcessUrl} className="relative flex flex-col sm:flex-row gap-3 p-2.5 rounded-2xl bg-surface-card border border-border/80 shadow-xl">
            <div className="relative flex-1 group rounded-xl border border-border/80 bg-[#151926] hover:border-indigo-500/40 transition-all duration-300">
              <div className="relative flex items-center rounded-[11px] overflow-hidden">
                <Icon name="LinkIcon" size={18} className="absolute left-4 text-indigo-400 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste YouTube video URL (e.g. MIT 6.006 Lecture)..."
                  className="w-full bg-transparent border-0 pl-11 pr-4 py-3.5 text-sm text-foreground font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUrlInput(DEMO_YOUTUBE_URL)}
                className="px-3.5 py-3.5 rounded-xl bg-surface-card border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 transition-colors whitespace-nowrap"
              >
                Fill Demo
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="btn-primary px-6 py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Icon name="ArrowPathIcon" size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon name="PlayIcon" size={18} />
                    Start Studying
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>

        {/* ── Clean Product Showcase Preview ── */}
        <motion.div
          id="demo"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="max-w-5xl mx-auto mb-16 relative"
        >
          <div className="relative rounded-3xl overflow-hidden bg-surface-card border border-border/80 p-2 shadow-2xl">
            {/* Top Mock Window Header */}
            <div className="bg-[#151926] px-4 py-3 rounded-t-2xl flex items-center justify-between border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
                <span className="ml-2 text-xs font-mono text-muted-foreground hidden sm:inline-block">
                  studyloop.ai/video-study-page (MIT 6.006 Lecture 1)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={triggerVoiceDemo}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isDemoActive
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Icon name="MicrophoneIcon" size={14} />
                  <span>{isDemoActive ? 'Listening (~ Active)...' : 'Test Voice PTT (~)'}</span>
                </button>
              </div>
            </div>

            {/* Video Mock Workspace Content */}
            <div className="grid lg:grid-cols-3 gap-2 bg-[#0B0E17] p-3 rounded-b-2xl min-h-[360px] text-left relative overflow-hidden">
              {/* Main Video Screen */}
              <div className="lg:col-span-2 relative rounded-xl overflow-hidden bg-black/60 border border-border/60 flex flex-col justify-between p-4 min-h-[260px]">
                <img
                  src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1000&auto=format&fit=crop&q=80"
                  alt="MIT 6.006 Lecture preview"
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
                    MIT 6.006 Algorithms @ 24:10
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    HD Transcript Indexed
                  </span>
                </div>

                {/* Simulated PTT Overlay Box */}
                <div className="relative z-10 my-auto text-center py-6">
                  {isDemoActive ? (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="inline-flex flex-col items-center gap-2 p-4 rounded-2xl bg-indigo-950 border border-indigo-500/40 shadow-xl"
                    >
                      <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                        <Icon name="MicrophoneIcon" size={16} className="animate-pulse" />
                        <span>Speech Captured: "What is 1D Peak Finding time complexity?"</span>
                      </div>
                      <div className="flex items-center gap-1 h-4">
                        {[40, 70, 30, 90, 50, 80, 40].map((h, i) => (
                          <div
                            key={`bar-${i}`}
                            className="w-1 bg-cyan-400 rounded-full animate-waveform"
                            style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <button
                      onClick={triggerVoiceDemo}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-card border border-border hover:border-indigo-500/40 text-xs font-bold text-foreground transition-all group"
                    >
                      <Icon name="PlayCircleIcon" size={18} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                      <span>Click to simulate Push-to-Talk voice query</span>
                    </button>
                  )}
                </div>

                <div className="relative z-10 flex items-center justify-between text-xs text-muted-foreground border-t border-white/10 pt-2">
                  <span className="font-mono text-cyan-300">24:10 / 52:30</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-foreground">Anti-Spoiler Guard: Active</span>
                  </div>
                </div>
              </div>

              {/* AI Copilot Side Chat Preview */}
              <div className="rounded-xl bg-[#151926] border border-border/60 p-3 flex flex-col justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                    <Icon name="SparklesIcon" size={16} className="text-indigo-400" />
                    <span className="font-extrabold text-foreground">AI Voice Copilot</span>
                    <span className="ml-auto text-[10px] font-mono text-emerald-400">150ms Latency</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="p-2.5 rounded-xl bg-surface-elevated/60 border border-border/40">
                      <p className="text-[11px] font-bold text-indigo-300 mb-0.5">User (Speech input via ~):</p>
                      <p className="text-foreground text-xs">"What is the complexity of 1D Peak Finding?"</p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30">
                      <p className="text-[11px] font-bold text-cyan-300 mb-0.5">AI Answer (Anti-Spoiler RAG):</p>
                      <p className="text-foreground-muted text-xs leading-relaxed">
                        In 1D arrays, divide & conquer checks array midpoints in <strong className="text-foreground">O(log n)</strong> time complexity.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 text-indigo-400">
                    <Icon name="BookmarkIcon" size={12} />
                    Auto-saved to notes
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">@ 24:10</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Impact Metrics Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-16">
          {METRICS.map((m) => (
            <div
              key={`metric-${m.label}`}
              className="p-5 rounded-2xl bg-surface-card border border-border/80 text-left relative overflow-hidden card-hover"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon name={m.icon as Parameters<typeof Icon>[0]['name']} size={20} className={m.color} />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mb-1 font-mono">
                {m.value}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {/* AI Model Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto mb-16"
        >
          {MODEL_BADGES.map((b) => (
            <div
              key={`model-${b.name}`}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 ${b.color}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span className="font-bold">{b.name}</span>
              <span className="opacity-60 font-normal">| {b.desc}</span>
            </div>
          ))}
        </motion.div>

        {/* University Social Proof Wall */}
        <div className="pt-8 border-t border-border/40 max-w-5xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6">
            Trusted by students studying courseware from
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-14 opacity-75">
            {UNIVERSITIES.map((u) => (
              <div key={`uni-${u.name}`} className="flex items-center gap-2 text-sm font-bold text-foreground-muted hover:opacity-100 transition-opacity">
                <span className="text-lg">{u.logo}</span>
                <span>{u.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem vs Solution Card ── */}
      <section className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Why 70% of YouTube Learning is Forgotten in 24 Hours
          </h2>
          <p className="text-foreground-muted text-base max-w-2xl mx-auto">
            Linear video viewing is passive. Without active recall during the moment of learning, key concepts vanish.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Problem Card */}
          <div className="p-8 rounded-3xl bg-surface-card border border-red-500/20 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <Icon name="XMarkIcon" size={20} />
              </div>
              <h3 className="text-xl font-bold text-foreground">Passive Video Viewing</h3>
            </div>
            <ul className="space-y-4 text-sm text-foreground-muted">
              <li className="flex items-start gap-3">
                <span className="text-red-400 font-bold">•</span>
                Rewinding manually disrupts focus and causes context loss.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 font-bold">•</span>
                Searching for explanations online leads to distraction rabbit holes.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-red-400 font-bold">•</span>
                Static notes taken after the video miss precise timestamp context.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className="p-8 rounded-3xl bg-surface-card border border-indigo-500/30 relative overflow-hidden shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Icon name="CheckIcon" size={20} />
              </div>
              <h3 className="text-xl font-bold text-foreground">Active Voice Copilot with StudyLoop</h3>
            </div>
            <ul className="space-y-4 text-sm text-foreground-muted">
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                Press <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-indigo-300 font-mono text-xs">~</kbd> to ask questions in flow while video continues playing.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                Anti-spoiler RAG answers strictly from what you’ve watched so far.
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                Automated timestamped notes exportable to Notion with 1 click.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 4-Card Feature Grid ── */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 block">
            Engineered for Deep Learning
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Everything You Need for Active Video Recall
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {FEATURES.map((f, i) => (
            <motion.div
              key={`feature-${f.title}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -6 }}
              className={`p-8 rounded-3xl bg-gradient-to-br ${f.color} bg-surface-card border border-border/80 relative overflow-hidden transition-all duration-300`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className={`p-3.5 rounded-2xl bg-surface-card border border-border ${f.iconColor}`}>
                  <Icon name={f.icon as Parameters<typeof Icon>[0]['name']} size={24} />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-border bg-surface-card/60 text-muted-foreground">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">{f.title}</h3>
              <p className="text-foreground-muted text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 3-Step Workflow ── */}
      <section id="how-it-works" className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 mb-3 block">
            Simple 3-Step Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            How StudyLoop Transforms Your Learning
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div key={`step-${step.num}`} className="p-8 rounded-3xl bg-surface-card border border-border relative">
              <span className="text-5xl font-black text-indigo-500/20 mb-4 block font-mono">
                {step.num}
              </span>
              <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
              <p className="text-foreground-muted text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ Accordion ── */}
      <section id="faq" className="py-20 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <motion.div
                key={`faq-${idx}`}
                initial={false}
                className={`rounded-2xl transition-all duration-300 overflow-hidden ${
                  isOpen
                    ? 'bg-surface-card border border-indigo-500/40'
                    : 'bg-surface-card/60 border border-border/80 hover:border-indigo-500/30'
                }`}
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-6 text-left font-bold text-base md:text-lg text-foreground flex items-center justify-between gap-4 select-none cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        isOpen ? 'bg-cyan-400' : 'bg-indigo-500/40'
                      }`}
                    />
                    {faq.q}
                  </span>
                  <div
                    className={`p-2 rounded-xl transition-all duration-300 ${
                      isOpen
                        ? 'bg-indigo-600 text-white rotate-180'
                        : 'bg-surface-elevated text-muted-foreground'
                    }`}
                  >
                    <Icon name="ChevronDownIcon" size={18} />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 pt-2 text-sm md:text-base text-foreground-muted leading-relaxed border-t border-indigo-500/15">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="p-12 rounded-3xl bg-surface-card border border-indigo-500/30 text-center relative overflow-hidden shadow-2xl">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Ready to Upgrade How You Learn from Videos?
          </h2>
          <p className="text-foreground-muted text-base max-w-xl mx-auto mb-8">
            Join thousands of students mastering courseware 3x faster with bilingual voice copilot.
          </p>
          <button
            onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
            className="btn-primary px-8 py-4 rounded-2xl text-base font-bold text-white"
          >
            Start Free Trial Now
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-6 border-t border-border/40 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AppLogo size={24} />
            <span className="font-bold text-foreground">StudyLoop</span>
            <span>© 2026 MSc Data Science Team</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/video-study-page" className="hover:text-foreground">App Workspace</Link>
            <Link to="/dashboard-home" className="hover:text-foreground">Dashboard</Link>
            <a href="#features" className="hover:text-foreground">Architecture</a>
          </div>
        </div>
      </footer>

      {/* ── Embedded Auth Modal ── */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md p-8 rounded-3xl bg-surface-card border border-border/80 shadow-2xl relative"
            >
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:text-foreground bg-surface-elevated"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <AppLogo size={32} />
                <h3 className="text-xl font-bold text-foreground">
                  {authMode === 'signup' ? 'Create StudyLoop Account' : 'Welcome Back'}
                </h3>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setShowAuthModal(false);
                  navigate('/dashboard-home');
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                  <input
                    type="email"
                    required
                    defaultValue="student@studyloop.ai"
                    className="w-full input-field rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Password</label>
                  <input
                    type="password"
                    required
                    defaultValue="password123"
                    className="w-full input-field rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full py-3.5 rounded-xl font-bold text-white text-sm"
                >
                  {authMode === 'signup' ? 'Sign Up' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-border text-center text-xs text-muted-foreground">
                {authMode === 'signup' ? (
                  <span>Already have an account? <button onClick={() => setAuthMode('login')} className="text-indigo-400 font-bold hover:underline">Sign In</button></span>
                ) : (
                  <span>Need an account? <button onClick={() => setAuthMode('signup')} className="text-indigo-400 font-bold hover:underline">Sign Up</button></span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
