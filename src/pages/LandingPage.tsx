import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import CursorOrb from '@/components/ui/CursorOrb';

const DEMO_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const DEMO_FRAMES = [
  {
    frameTitle: 'Interaction 1: Bilingual Concept Query',
    interactionType: '💡 Concept Q&A',
    timestamp: '12:10',
    lossValue: 'J(θ) = 4.82 (High Loss)',
    query: 'Bhai, Gradient Descent me initial learning rate alpha kitna select karein?',
    response: 'Typically α = 0.01 or 0.001 set karte hain to avoid divergence on the 3D loss surface.',
    autoNote: 'Saved note: α = 0.01 learning rate rule',
    image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Interaction 2: Semantic Topic Jump',
    interactionType: '⏭️ Jump to Concept',
    timestamp: '34:20',
    lossValue: 'J(θ) = 1.15 (Chain Rule)',
    query: 'Go to where Backpropagation and Chain Rule were explained',
    response: 'Jumping video player to 34:20 where Backpropagation ∂L/∂w = ∂L/∂a · ∂a/∂z is explained!',
    autoNote: 'Auto-Seek: Jumped to 34:20 (Backpropagation)',
    image: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Interaction 3: Hands-Free Voice Skipping',
    interactionType: '⏪ Skip 10 Seconds',
    timestamp: '34:10',
    lossValue: 'J(θ) = 1.18 (Rewound -10s)',
    query: 'Go back skip 10 seconds, missed that matrix multiply step',
    response: 'Skipping back 10 seconds to 34:10 for the weight matrix multiplication walkthrough.',
    autoNote: 'Player Action: Rewound -10s to 34:10',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Interaction 4: Notion & Flashcard Export',
    interactionType: '📝 1-Click Export',
    timestamp: '42:15',
    lossValue: 'J(θ) = 0.04 (Minimum)',
    query: 'Generate active recall quiz and export all notes to Notion!',
    response: 'Done! Synced 4 timestamped structured notes & 5 active recall flashcards directly to Notion.',
    autoNote: 'Notion Sync: 4 Notes & 5 Flashcards Exported',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80',
  },
];

const ARCHITECTURE_STEPS = [
  {
    stepNum: '01',
    stage: 'Input Capture',
    title: 'WebAudio & Press-to-Talk Listener',
    desc: 'Listens for global ~ key holding. Audio PCM buffers are sampled at 16kHz via WebAudio API without interrupting video player playback.',
    badge: '16kHz Audio Stream',
    color: 'border-indigo-500/30 text-indigo-400',
  },
  {
    stepNum: '02',
    stage: 'Dual Engine Switch',
    title: 'Local DistilBERT vs Cloud RAG Routing',
    desc: 'Fast player navigation commands (skip, rewind, timestamp jump) execute on-device via ONNX DistilBERT in < 45ms. Complex Q&A routes to Cloud BGE-M3 + Qwen2.5.',
    badge: 'Dual Routing Core',
    color: 'border-cyan-500/30 text-cyan-400',
  },
  {
    stepNum: '03',
    stage: 'Anti-Spoiler Filter',
    title: 'pgvector Timestamp Bounding Guard',
    desc: 'Cross-lingual BGE-M3 vector search applies a strict hard constraint T_segment <= T_current to prevent skipping or spoiling unwatched video sections.',
    badge: 'Anti-Spoiler Guardrail',
    color: 'border-emerald-500/30 text-emerald-400',
  },
  {
    stepNum: '04',
    stage: 'Output & Sync',
    title: 'Synchronized Voice & Notion Sync',
    desc: 'MeloTTS synthesizes accent-matched audio while HTML5 player seeks target timestamps and auto-logs structured notes into Notion.',
    badge: 'MeloTTS & Notion API',
    color: 'border-purple-500/30 text-purple-400',
  },
];

const MODEL_BADGES = [
  { name: 'Whisper ASR', desc: 'Bilingual Hindi/English Speech Recognition', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { name: 'DistilBERT Local', desc: 'On-Device Sub-45ms NLU Intent Classifier', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { name: 'BGE-M3 RAG', desc: '1024-dim Vector Embeddings', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  { name: 'MeloTTS', desc: 'Fluent Accent-Matched Audio Output', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
];

const METRICS = [
  { value: '< 45ms', label: 'Local DistilBERT Intent Latency', icon: 'BoltIcon', color: 'text-indigo-400' },
  { value: '100%', label: 'Anti-Spoiler Grounded Precision', icon: 'ShieldCheckIcon', color: 'text-cyan-400' },
  { value: '1024-dim', label: 'Cross-Lingual Vector Index', icon: 'SparklesIcon', color: 'text-emerald-400' },
  { value: 'Bi-directional', label: 'English & Hinglish Voice AI', icon: 'GlobeAltIcon', color: 'text-purple-400' },
];

const SCENARIOS = [
  {
    icon: 'PencilSquareIcon',
    badge: 'Hands Occupied',
    title: 'Taking Handwritten Notes & Eating Lunch',
    desc: 'Hands busy with a pen or lunch bowl during a 3-hour MIT lecture? Just hold ~ to ask questions or request 30-second summaries without touching your keyboard.',
    example: '"Summarize the last 5 minutes of gradient descent in 3 bullet points"',
    color: 'border-indigo-500/30 bg-indigo-950/20 text-indigo-300',
  },
  {
    icon: 'LanguageIcon',
    badge: 'Bilingual Hinglish ASR',
    title: 'Ask Naturally in Mixed Hindi & English',
    desc: 'Don’t pause your train of thought trying to translate terms into rigid formal English. Ask in natural conversational Hinglish.',
    example: '"Ye cost function J(θ) local minima me trap ho gaya toh alpha kaise tuning karte hain?"',
    color: 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300',
  },
  {
    icon: 'PlayCircleIcon',
    badge: 'Voice Navigation',
    title: 'Hands-Free Timestamp Seeking',
    desc: 'Never scrub back and forth manually trying to find where a specific mathematical equation was explained.',
    example: '"Go to where backpropagation was explained"',
    color: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
  },
  {
    icon: 'ArrowUpOnSquareIcon',
    badge: '1-Click Export',
    title: 'Instant Notion & Anki Revision Sync',
    desc: 'All voice interactions, key takeaway summaries, and math formulas automatically log into timestamped structured cards.',
    example: '"Export gradient descent equations and quiz cards to Notion"',
    color: 'border-purple-500/30 bg-purple-950/20 text-purple-300',
  },
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
    tag: 'Sub-45ms Local DistilBERT Engine',
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
    q: 'What is Local DistilBERT Mode?',
    a: 'Local DistilBERT Mode runs a lightweight ONNX-quantized DistilBERT model directly inside your browser. Fast player control commands (such as "skip 10s", "pause", or "jump to backpropagation") execute on-device in under 45ms with 100% privacy and zero server roundtrips.',
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
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlayingGif, setIsPlayingGif] = useState(true);
  const [selectedEngine, setSelectedEngine] = useState<'local' | 'cloud'>('local');
  const [isAnnualBilling, setIsAnnualBilling] = useState(true);
  const navigate = useNavigate();

  // GIF-like Auto-playing Frame Timeline Loop
  useEffect(() => {
    if (!isPlayingGif) return;
    const interval = setInterval(() => {
      setActiveFrameIndex((prev) => (prev + 1) % DEMO_FRAMES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPlayingGif]);

  const handleProcessUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetUrl = urlInput.trim() || DEMO_YOUTUBE_URL;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      navigate('/video-study-page', { state: { videoUrl: targetUrl } });
    }, 900);
  };

  const currentFrame = DEMO_FRAMES[activeFrameIndex];

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
            <a href="#demo" className="hover:text-foreground transition-colors">Live Simulation</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">Architecture</a>
            <a href="#scenarios" className="hover:text-foreground transition-colors">Voice Commands</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
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
                  placeholder="Paste YouTube video URL..."
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

        {/* ── Frame-by-Frame Animated Conversation GIF Simulation ── */}
        <motion.div
          id="demo"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="max-w-5xl mx-auto mb-16 relative"
        >
          <div className="relative rounded-3xl overflow-hidden bg-surface-card border border-border/80 p-2 shadow-2xl">
            {/* Window Header with Frame Stepper Controls */}
            <div className="bg-[#151926] px-4 py-3 rounded-t-2xl flex flex-wrap items-center justify-between gap-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
                <span className="ml-2 text-xs font-mono text-muted-foreground hidden sm:inline-block">
                  studyloop.ai/video-study-page (Stanford CS229: Gradient Descent Loss Landscape)
                </span>
              </div>

              {/* Interactive GIF Timeline Frame Controller */}
              <div className="flex items-center gap-1.5 bg-obsidian border border-border/60 rounded-xl p-1">
                <button
                  onClick={() => setIsPlayingGif(!isPlayingGif)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-600/50 transition-colors"
                >
                  <Icon name={isPlayingGif ? 'PauseIcon' : 'PlayIcon'} size={12} />
                  <span>{isPlayingGif ? 'Auto Loop GIF' : 'Paused'}</span>
                </button>
                {DEMO_FRAMES.map((f, i) => (
                  <button
                    key={`frame-tab-${i}`}
                    onClick={() => {
                      setActiveFrameIndex(i);
                      setIsPlayingGif(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${activeFrameIndex === i
                        ? 'bg-cyan-500 text-black font-extrabold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
                      }`}
                  >
                    <span>{f.interactionType}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Video Mock Workspace with Frame-by-Frame Animated Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`frame-content-${activeFrameIndex}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="grid lg:grid-cols-3 gap-2 bg-[#0B0E17] p-3 rounded-b-2xl min-h-[420px] text-left relative overflow-hidden"
              >
                {/* Main Video Screen displaying 3D Gradient Descent Loss Landscape */}
                <div className="lg:col-span-2 relative rounded-xl overflow-hidden bg-black/80 border border-border/60 flex flex-col justify-between p-4 min-h-[320px]">
                  {/* High-Tech 3D Gradient Descent Loss Surface Image */}
                  <img
                    src={currentFrame.image}
                    alt="Gradient Descent 3D loss surface optimization landscape slide"
                    className="absolute inset-0 w-full h-full object-cover opacity-40 transition-opacity duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />

                  {/* Top HUD Overlay */}
                  <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
                    <span className="px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-xs font-bold font-mono">
                      Stanford CS229 Loss Surface @ {currentFrame.timestamp}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">
                      {currentFrame.lossValue}
                    </span>
                  </div>

                  {/* Frame Description Indicator */}
                  <div className="relative z-10 my-3">
                    <span className="px-3 py-1 rounded-lg bg-surface-card/90 border border-border text-[11px] font-bold text-foreground inline-block">
                      {currentFrame.frameTitle}
                    </span>
                  </div>

                  {/* Simulated PTT Speech Bubble in Active Frame */}
                  <div className="relative z-10 text-center py-2">
                    <div className="inline-flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-indigo-950/90 border border-indigo-500/40 shadow-xl max-w-lg mx-auto">
                      <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                        <Icon name="MicrophoneIcon" size={16} className="animate-pulse text-cyan-400" />
                        <span className="font-mono">User Speech (~ Held): "{currentFrame.query}"</span>
                      </div>
                      <div className="flex items-center gap-1 h-3.5">
                        {[40, 80, 30, 95, 60, 85, 45, 75, 35].map((h, i) => (
                          <div
                            key={`bar-${i}`}
                            className="w-1 bg-cyan-400 rounded-full animate-waveform"
                            style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Video Control Bar */}
                  <div className="relative z-10 flex items-center justify-between text-xs text-muted-foreground border-t border-white/10 pt-2">
                    <span className="font-mono text-cyan-300">{currentFrame.timestamp} / 52:30</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-foreground">Anti-Spoiler Bound: @ {currentFrame.timestamp}</span>
                    </div>
                  </div>
                </div>

                {/* AI Copilot Voice & Note Capture Panel for Active Frame */}
                <div className="rounded-xl bg-[#151926] border border-border/60 p-3.5 flex flex-col justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                      <Icon name="SparklesIcon" size={16} className="text-indigo-400" />
                      <span className="font-extrabold text-foreground">AI Voice Copilot</span>
                      <span className="ml-auto text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-500/30">
                        {currentFrame.interactionType}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-surface-elevated/60 border border-border/40">
                        <p className="text-[11px] font-bold text-indigo-300 mb-1">User Command:</p>
                        <p className="text-foreground text-xs leading-snug font-mono">"{currentFrame.query}"</p>
                      </div>

                      <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/30">
                        <p className="text-[11px] font-bold text-cyan-300 mb-1">AI Action & Answer:</p>
                        <p className="text-foreground-muted text-xs leading-relaxed">
                          {currentFrame.response}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Auto Note Saved Line */}
                  <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <Icon name="BookmarkIcon" size={14} />
                      {currentFrame.autoNote}
                    </span>
                    <span className="font-mono text-cyan-400 font-bold">@ {currentFrame.timestamp}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
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

      {/* ── System Architecture & Dual Engine Workflow Section ── */}
      <section id="architecture" className="py-20 px-6 max-w-7xl mx-auto border-t border-border/40">
        <div className="text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 block">
            System Architecture Workflow
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Dual Execution Engines: Local DistilBERT & Cloud RAG
          </h2>
          <p className="text-foreground-muted text-base max-w-3xl mx-auto">
            StudyLoop routes user commands through an on-device ONNX DistilBERT engine for instant &lt; 45ms player navigation, or a hybrid Cloud RAG engine for deep multi-lingual reasoning.
          </p>

          {/* Engine Selector Toggle */}
          <div className="inline-flex items-center gap-2 mt-8 p-1.5 rounded-2xl bg-surface-card border border-border/80">
            <button
              onClick={() => setSelectedEngine('local')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedEngine === 'local'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="BoltIcon" size={16} />
              <span>⚡ Local DistilBERT Engine (&lt; 45ms)</span>
            </button>
            <button
              onClick={() => setSelectedEngine('cloud')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedEngine === 'cloud'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="CloudIcon" size={16} />
              <span>🌐 Cloud BGE-M3 RAG Engine (Deep Reasoning)</span>
            </button>
          </div>
        </div>

        {/* Engine Highlights Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`engine-card-${selectedEngine}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="mb-14 p-8 rounded-3xl bg-surface-card border border-indigo-500/30 max-w-5xl mx-auto relative overflow-hidden"
          >
            {selectedEngine === 'local' ? (
              <div className="grid md:grid-cols-3 gap-6 text-left">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-xs font-bold">
                      ONNX DistilBERT-base-uncased
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      100% On-Device Privacy
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Local DistilBERT Intent Execution</h3>
                  <p className="text-foreground-muted text-sm leading-relaxed mb-4">
                    Player navigation commands such as <em>"skip 10s"</em>, <em>"pause lecture"</em>, or <em>"jump to backpropagation"</em> are parsed locally inside your browser in under 45ms without calling cloud APIs.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-mono text-cyan-300">
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">Intent: PLAYER_SEEK (-10s)</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">Latency: 38ms</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border font-bold text-emerald-400">Zero Cloud Bandwidth</span>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border flex flex-col justify-center text-xs space-y-2">
                  <p className="font-bold text-foreground mb-1">Supported Local Triggers:</p>
                  <p className="text-muted-foreground">• "Skip 10 seconds back"</p>
                  <p className="text-muted-foreground">• "Jump to backpropagation"</p>
                  <p className="text-muted-foreground">• "Bookmark equation θ := θ - α∇J"</p>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6 text-left">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-xs font-bold">
                      BGE-M3 + Qwen2.5 72B + pgvector
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                      Anti-Spoiler Guarded
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Cloud Hybrid Vector RAG Engine</h3>
                  <p className="text-foreground-muted text-sm leading-relaxed mb-4">
                    Complex conceptual queries in Hinglish or English pass through Whisper ASR and BGE-M3 1024-dim cross-lingual vector search, strictly bounded up to current video timestamp T_current.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-mono text-cyan-300">
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">Vector Dim: 1024</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border font-bold text-purple-400">Whisper Hinglish ASR</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border text-emerald-400">pgvector Bounded</span>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border flex flex-col justify-center text-xs space-y-2">
                  <p className="font-bold text-foreground mb-1">Supported Cloud RAG Triggers:</p>
                  <p className="text-muted-foreground">• "Why does large alpha oscillate?"</p>
                  <p className="text-muted-foreground">• "Explain saddle points intuition"</p>
                  <p className="text-muted-foreground">• "Export active recall quiz to Notion"</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 4-Step Architecture Flowchart Cards */}
        <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {ARCHITECTURE_STEPS.map((step, idx) => (
            <motion.div
              key={`arch-${step.stepNum}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="p-6 rounded-3xl bg-surface-card border border-border/80 text-left flex flex-col justify-between relative overflow-hidden card-hover"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl font-black text-indigo-500/30 font-mono">{step.stepNum}</span>
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${step.color}`}>
                    {step.badge}
                  </span>
                </div>
                <span className="text-xs font-bold text-indigo-400 block mb-1 uppercase tracking-wider">
                  {step.stage}
                </span>
                <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-foreground-muted text-xs leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Real-Life Hands-Free Study Scenarios Section ── */}
      <section id="scenarios" className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 mb-3 block">
            Daily Life Utility
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Hands-Free Study Commands for Real Life
          </h2>
          <p className="text-foreground-muted text-base max-w-2xl mx-auto">
            Watching 2-to-3 hour lectures while taking handwritten notes or eating lunch? Use instant voice triggers without stopping video flow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {SCENARIOS.map((scen, idx) => (
            <motion.div
              key={`scen-${idx}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="p-7 rounded-3xl bg-surface-card border border-border/80 flex flex-col justify-between relative overflow-hidden card-hover"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Icon name={scen.icon as Parameters<typeof Icon>[0]['name']} size={20} />
                  </div>
                  <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full border ${scen.color}`}>
                    {scen.badge}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{scen.title}</h3>
                <p className="text-foreground-muted text-sm leading-relaxed mb-6">{scen.desc}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0B0E17] border border-border/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Example Voice Command (Hold ~)
                </span>
                <p className="text-xs font-mono text-cyan-300 font-semibold">{scen.example}</p>
              </div>
            </motion.div>
          ))}
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

      {/* ── Pricing Section in Rupees (₹) ── */}
      <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto border-t border-border/40">
        <div className="text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 block">
            Simple Transparent Pricing
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Invest in Your Learning Velocity
          </h2>
          <p className="text-foreground-muted text-base max-w-2xl mx-auto">
            Choose the plan that fits your study routine. Upgrade or cancel anytime with a 14-day money-back guarantee.
          </p>

          {/* Annual vs Monthly Billing Toggle */}
          <div className="inline-flex items-center gap-3 mt-8 p-1.5 rounded-2xl bg-surface-card border border-border/80">
            <button
              onClick={() => setIsAnnualBilling(false)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${!isAnnualBilling ? 'bg-indigo-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnualBilling(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${isAnnualBilling ? 'bg-indigo-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <span>Annual Billing</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto items-stretch">
          {/* Free Tier Card */}
          <div className="p-8 rounded-3xl bg-surface-card border border-border/80 text-left flex flex-col justify-between relative overflow-hidden card-hover">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3.5 py-1 rounded-full bg-surface-elevated border border-border text-xs font-bold text-muted-foreground">
                  Starter Student
                </span>
                <span className="text-xs font-mono text-muted-foreground font-semibold">Free Forever</span>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground tracking-tight font-mono">₹0</span>
                  <span className="text-sm font-semibold text-muted-foreground">/ month</span>
                </div>
                <p className="text-xs text-foreground-muted mt-2">
                  Perfect for exploring AI video copilot sessions & timestamped notes.
                </p>
              </div>

              <ul className="space-y-3.5 text-xs text-foreground-muted mb-8 border-t border-border/50 pt-6">
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>10 Video Study Sessions per month</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Push-to-Talk (~) Voice Copilot (Standard Latency)</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Bilingual Hinglish & English Speech ASR</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Anti-Spoiler Grounded Guardrail</span>
                </li>
                <li className="flex items-center gap-3 text-muted-foreground/60">
                  <Icon name="XMarkIcon" size={16} className="text-muted-foreground shrink-0" />
                  <span>Sub-45ms Local DistilBERT Engine (Pro only)</span>
                </li>
                <li className="flex items-center gap-3 text-muted-foreground/60">
                  <Icon name="XMarkIcon" size={16} className="text-muted-foreground shrink-0" />
                  <span>1-Click Notion Sync & Anki Export (Pro only)</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
              className="w-full py-3.5 rounded-xl border border-border bg-surface-elevated hover:bg-surface-elevated/80 font-bold text-foreground text-sm transition-colors"
            >
              Get Started Free
            </button>
          </div>

          {/* Pro Tier Card */}
          <div className="p-8 rounded-3xl bg-surface-card border-2 border-indigo-500/60 text-left flex flex-col justify-between relative overflow-hidden card-hover shadow-2xl">
            {/* Popular Badge Ribbon */}
            <div className="absolute top-5 right-5">
              <span className="px-3.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[11px] font-extrabold shadow-md flex items-center gap-1">
                <Icon name="SparklesIcon" size={12} />
                Most Popular for Students
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-xs font-bold">
                  Scholar Pro
                </span>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground tracking-tight font-mono">
                    ₹{isAnnualBilling ? '399' : '499'}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">/ month</span>
                </div>
                <p className="text-xs text-foreground-muted mt-2">
                  {isAnnualBilling ? 'Billed annually at ₹4,788/year (Save 20%)' : 'Billed monthly. Cancel anytime.'}
                </p>
              </div>

              <ul className="space-y-3.5 text-xs text-foreground-muted mb-8 border-t border-border/50 pt-6">
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <strong className="text-foreground">Unlimited Video Study Sessions</strong>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <strong className="text-indigo-300">⚡ Sub-45ms Local DistilBERT Engine</strong>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Unlimited Push-to-Talk (~) & Hands-Free Commands</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Whisper-Hindi2Hinglish + BGE-M3 1024-dim RAG</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>Advanced pgvector Anti-Spoiler Index</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <strong className="text-emerald-300">📓 1-Click Notion Sync, Anki Cards & PDF Export</strong>
                </li>
                <li className="flex items-center gap-3">
                  <Icon name="CheckIcon" size={16} className="text-cyan-400 shrink-0" />
                  <span>AI Adaptive Active Recall Practice Quizzes</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-lg flex items-center justify-center gap-2"
            >
              <Icon name="SparklesIcon" size={18} />
              Upgrade to Scholar Pro
            </button>
          </div>
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
                className={`rounded-2xl transition-all duration-300 overflow-hidden ${isOpen
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
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${isOpen ? 'bg-cyan-400' : 'bg-indigo-500/40'
                        }`}
                    />
                    {faq.q}
                  </span>
                  <div
                    className={`p-2 rounded-xl transition-all duration-300 ${isOpen
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
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#architecture" className="hover:text-foreground">Architecture</a>
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
