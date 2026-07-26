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
    desc: 'Hold down the Tilde (~) key while watching any video to ask questions in natural English or Hindi without pausing.',
    tag: 'Fast-Path Sub-150ms',
    color: 'from-indigo-600/20 to-purple-600/10 border-indigo-500/30',
    iconColor: 'text-indigo-400',
  },
  {
    icon: 'SparklesIcon',
    title: 'Anti-Spoiler Grounded RAG',
    desc: 'Powered by BGE-M3 cross-lingual embeddings. Answers are strictly bounded to content played up to your current playback timestamp.',
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
    q: 'How does the Push-to-Talk (PTT) Tilde (~) key feature work?',
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

  return (
    <div className="min-h-screen bg-obsidian text-foreground selection:bg-indigo-600/30 relative overflow-hidden">
      <CursorOrb />

      {/* Hero Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-hero opacity-80 pointer-events-none" />

      {/* ── Glass Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-navbar px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size={36} />
            <span className="font-black text-xl tracking-tight text-foreground">
              Study<span className="gradient-text-indigo">Loop</span>
            </span>
            <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v2.0 LangGraph
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#tech-stack" className="hover:text-foreground transition-colors">Architecture</a>
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
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-glow-indigo-sm flex items-center gap-2"
            >
              <Icon name="SparklesIcon" size={16} />
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative pt-36 pb-20 px-6 max-w-7xl mx-auto text-center">
        {/* Floating Badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-8 backdrop-blur-md"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>LangGraph Multi-Agent DAG Engine • Bilingual Voice PTT</span>
        </motion.div>

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

        {/* Try-It-Now URL Processing Bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <form onSubmit={handleProcessUrl} className="relative flex flex-col sm:flex-row gap-3 p-2 rounded-2xl glass-card border border-indigo-500/25 shadow-glow-indigo">
            <div className="relative flex-1 group rounded-xl p-[1px] bg-gradient-to-r from-indigo-500/40 via-cyan-500/40 to-indigo-500/40 shadow-glow-indigo-sm hover:shadow-glow-indigo transition-all duration-300">
              <div className="relative flex items-center bg-[#151926]/95 backdrop-blur-xl rounded-[11px] overflow-hidden">
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
                className="btn-primary px-6 py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 shadow-glow-indigo-sm"
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

        {/* Ambient AI Model Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto mb-16"
        >
          {MODEL_BADGES.map((b) => (
            <div
              key={`model-${b.name}`}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 backdrop-blur-md ${b.color}`}
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
          <div className="p-8 rounded-3xl glass-card border border-indigo-500/40 relative overflow-hidden shadow-glow-indigo-sm">
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
              className={`p-8 rounded-3xl bg-gradient-to-br ${f.color} glass-card border relative overflow-hidden transition-all duration-300`}
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
          {STEPS.map((step, idx) => (
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
              <div
                key={`faq-${idx}`}
                className="rounded-2xl bg-surface-card border border-border overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-6 text-left font-bold text-base text-foreground flex items-center justify-between gap-4"
                >
                  <span>{faq.q}</span>
                  <Icon
                    name={isOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                    size={20}
                    className="text-muted-foreground flex-shrink-0"
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-6 pb-6 text-sm text-foreground-muted leading-relaxed border-t border-border/40 pt-4"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="p-12 rounded-3xl glass-card border border-indigo-500/40 text-center relative overflow-hidden shadow-glow-indigo">
          <div className="absolute top-0 right-0 w-80 h-80 orb-indigo opacity-50" />
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Ready to Upgrade How You Learn from Videos?
          </h2>
          <p className="text-foreground-muted text-base max-w-xl mx-auto mb-8">
            Join thousands of students mastering courseware 3x faster with bilingual voice copilot.
          </p>
          <button
            onClick={() => { setAuthMode('signup'); setShowAuthModal(true); }}
            className="btn-primary px-8 py-4 rounded-2xl text-base font-bold text-white shadow-glow-indigo"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md p-8 rounded-3xl glass-card border border-indigo-500/30 relative"
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
                  className="btn-primary w-full py-3.5 rounded-xl font-bold text-white text-sm shadow-glow-indigo-sm"
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
