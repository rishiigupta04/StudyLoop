import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import CursorOrb from '@/components/ui/CursorOrb';
import LandingDrawer from '@/components/landing/LandingDrawer';
import { useAuth } from '@/context/AuthContext';
import { extractYouTubeId } from '@/services/transcriptService';
import { studyUrl } from '@/services/libraryService';

// MIT 6.006 (Fall 2011) Lecture 1, Algorithmic Thinking / Peak Finding: the lecture the demo is verified on.
const DEMO_YOUTUBE_URL = 'https://www.youtube.com/watch?v=HtSuA80QTyo';

// A scripted illustration of a session: the timestamps and replies are examples, not a recording.
const DEMO_FRAMES = [
  {
    frameTitle: 'Example 1: Semantic seek',
    interactionType: 'Semantic seek',
    timestamp: '04:50',
    route: 'Route: semantic seek (whole video)',
    query: 'Bhai, peak finding ka algorithm kahan samjhaya tha?',
    response: 'Jumping to 04:50, where the one-dimensional peak-finding algorithm is introduced.',
    autoNote: 'Player action: seek to 04:50',
    footer: 'Seek searches the whole video',
    image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Example 2: Grounded Q&A',
    interactionType: 'Grounded Q&A',
    timestamp: '12:40',
    route: 'Route: Q&A from the transcript',
    query: 'Why do we move toward the larger neighbour when we look for a peak?',
    response:
      'Because a peak must exist on that side, so you can discard the other half and keep halving the search. [12:40]',
    autoNote: 'Cited moment: [12:40], already watched',
    footer: 'Spoiler guard: uses content up to 12:40',
    image: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Example 3: Player command',
    interactionType: 'Player command',
    timestamp: '12:30',
    route: 'Intent: SEEK_BACK (no LLM)',
    query: 'Thoda peeche jao, 10 second',
    response: 'Rewinding 10 seconds to 12:30.',
    autoNote: 'Player action: back 10 s to 12:30',
    footer: 'Classifier path, no LLM call',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
  },
  {
    frameTitle: 'Example 4: Voice note',
    interactionType: 'Voice note',
    timestamp: '18:05',
    route: 'Route: voice note',
    query: 'Take a note: peak finding in one dimension is O(log n)',
    response: 'Saved a note at 18:05. A short AI summary is added automatically.',
    autoNote: 'Note saved @ 18:05 (export: Markdown or PDF)',
    footer: 'Notes export to Markdown and PDF',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80',
  },
];

const ARCHITECTURE_STEPS = [
  {
    stepNum: '01',
    stage: 'Input capture',
    title: 'Hold ~ and speak',
    desc: 'The browser records while the ~ key is held (16 kHz audio) without pausing the video, then sends the clip to the StudyLoop server.',
    badge: '16 kHz audio',
    color: 'border-indigo-500/30 text-indigo-400',
  },
  {
    stepNum: '02',
    stage: 'Speech to text',
    title: 'Sarvam Saaras, Groq as fallback',
    desc: 'Hosted speech-to-text turns the clip into text: Sarvam Saaras (built for Hindi and code-mixed speech), then Groq Whisper, then the browser recogniser if both fail.',
    badge: 'Hosted STT',
    color: 'border-cyan-500/30 text-cyan-400',
  },
  {
    stepNum: '03',
    stage: 'Routing',
    title: 'Classifier or retrieval',
    desc: 'On the server, a trained DistilBERT classifier handles player commands. Topic seeks and questions go to hybrid retrieval (BGE-M3 embeddings plus keyword search) over the transcript.',
    badge: 'Server-side routing',
    color: 'border-emerald-500/30 text-emerald-400',
  },
  {
    stepNum: '04',
    stage: 'Answer',
    title: 'Cited answer, spoken back',
    desc: 'Answers use only what you have already watched (switchable), carry [mm:ss] citations that seek when clicked, and are spoken by Sarvam Bulbul with the browser voice as fallback.',
    badge: 'Bulbul TTS',
    color: 'border-purple-500/30 text-purple-400',
  },
];

const MODEL_BADGES = [
  { name: 'Sarvam Saaras', desc: 'Speech-to-text, Groq Whisper fallback', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { name: 'DistilBERT (INT8, ONNX)', desc: 'Player-command classifier on the server', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { name: 'BGE-M3', desc: 'Embeddings for seek and Q&A', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  { name: 'Sarvam Bulbul', desc: 'Spoken answers', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
];

// Honest numbers only: the accuracy is on a synthetic text test set, the latency is a local benchmark.
const METRICS = [
  { value: '~5-15 ms', label: 'Intent classification on the server CPU (local benchmark, one thread)', icon: 'BoltIcon', color: 'text-indigo-400' },
  { value: '~93 %', label: 'Intent accuracy on a synthetic text test set. Real-speech evaluation is in progress.', icon: 'ChartBarIcon', color: 'text-cyan-400' },
  { value: '3 languages', label: 'English, Hindi and Hinglish voice', icon: 'GlobeAltIcon', color: 'text-purple-400' },
  { value: '1024-dim', label: 'BGE-M3 embeddings for semantic seek and Q&A', icon: 'SparklesIcon', color: 'text-emerald-400' },
];

const SCENARIOS = [
  {
    icon: 'PencilSquareIcon',
    badge: 'Hands Occupied',
    title: 'Taking Handwritten Notes or Eating Lunch',
    desc: 'Hands busy with a pen during a long lecture? Hold ~ to ask a question or get a summary without reaching for the mouse.',
    example: '"Summarize what we have covered so far"',
    color: 'border-indigo-500/30 bg-indigo-950/20 text-indigo-300',
  },
  {
    icon: 'LanguageIcon',
    badge: 'English, Hindi, Hinglish',
    title: 'Ask Naturally in Mixed Hindi and English',
    desc: 'No need to translate terms into formal English. Speak the way you think, and read the answer in the language you pick.',
    example: '"Ye peak finding ka algorithm kaise kaam karta hai?"',
    color: 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300',
  },
  {
    icon: 'PlayCircleIcon',
    badge: 'Semantic Seek',
    title: 'Jump to a Topic Without Scrubbing',
    desc: 'Skip to the part about a topic. Semantic seek searches the whole video, so you never drag the timeline looking for it.',
    example: '"Skip to the part about binary search"',
    color: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
  },
  {
    icon: 'DocumentTextIcon',
    badge: 'Voice Notes',
    title: 'Timestamped Notes You Can Export',
    desc: 'Say "take a note" and the moment is saved with its timestamp and an automatic AI summary. Export your notes to Markdown or PDF.',
    example: '"Take a note: peak finding in one dimension is O(log n)"',
    color: 'border-purple-500/30 bg-purple-950/20 text-purple-300',
  },
];

const FEATURES = [
  {
    icon: 'MicrophoneIcon',
    title: 'Push-to-Talk Voice Copilot',
    desc: 'Hold the Tilde (~) key and speak in English, Hindi or Hinglish. Player commands such as play, pause, seek, speed and volume are classified by a trained model on the server and run straight away.',
    tag: 'Trained DistilBERT intents',
    color: 'from-indigo-600/20 to-purple-600/10 border-indigo-500/30',
    iconColor: 'text-indigo-400',
  },
  {
    icon: 'SparklesIcon',
    title: 'Grounded Q&A with Citations',
    desc: 'Answers come from the transcript and cite the moment they came from; click a [mm:ss] citation to seek there. By default they use only what you have watched, and a switch lets them use the whole lecture.',
    tag: 'BGE-M3 + [mm:ss] citations',
    color: 'from-cyan-600/20 to-blue-600/10 border-cyan-500/30',
    iconColor: 'text-cyan-400',
  },
  {
    icon: 'DocumentTextIcon',
    title: 'Timestamped Voice Notes',
    desc: 'Say "take a note" and it is saved at the current timestamp with an automatic AI summary. A notes workspace gathers them across videos, and each note exports to Markdown or PDF.',
    tag: 'Markdown and PDF export',
    color: 'from-emerald-600/20 to-teal-600/10 border-emerald-500/30',
    iconColor: 'text-emerald-400',
  },
  {
    icon: 'LanguageIcon',
    title: 'English and Hindi Interface',
    desc: 'Ask in mixed Hindi and English ("ye recursion algorithm kaise work karta hai?"). Switch the interface, answers and summaries between English and Hindi.',
    tag: 'EN / हिं',
    color: 'from-purple-600/20 to-pink-600/10 border-purple-500/30',
    iconColor: 'text-purple-400',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Paste a YouTube URL',
    desc: 'Paste a lecture link. StudyLoop fetches the transcript, indexes it for search, and generates chapters and a structured summary.',
  },
  {
    num: '02',
    title: 'Hold ~ and Talk',
    desc: 'Hold the Tilde (~) key while watching. Control playback, jump to a topic, ask a question or save a note, all by voice.',
  },
  {
    num: '03',
    title: 'Review and Export',
    desc: 'Review chapters, the summary and your timestamped notes, pick up where you left off from your library, and export notes to Markdown or PDF.',
  },
];

const FAQS = [
  {
    q: 'How does the Push-to-Talk (PTT) feature work?',
    a: 'Hold the Tilde (~) key while watching a video, speak your command or question, then release. Your browser asks for microphone access the first time. The clip is transcribed, routed on the server, and the result comes back: a player command runs immediately, and a question streams a cited answer.',
  },
  {
    q: 'How are player commands handled?',
    a: 'A DistilBERT intent classifier (INT8, ONNX) trained for this project runs on the server CPU, with a regex fallback. It maps commands like "skip 10 seconds", "pause" or "speed 1.5x" to player actions, taking roughly 5 to 15 ms in our local benchmarks, and the LLM is not involved on that path. On a synthetic text test set it scores about 93 %; evaluation on real recorded speech is still in progress, so treat that number as provisional.',
  },
  {
    q: 'What is the spoiler guard?',
    a: 'By default, answers are drawn only from the part of the transcript you have already watched, so later concepts are not spoiled. Semantic seek ("skip to the part about X") searches the whole video. A switch in the study page top bar lets answers and summaries use the whole lecture instead.',
  },
  {
    q: 'Can I ask questions in Hindi or Hinglish?',
    a: 'Yes. Speech is transcribed by Sarvam Saaras, which is built for Indian code-mixed speech, with Groq Whisper and your browser as fallbacks, and BGE-M3 handles search across languages. Hindi and Hinglish accuracy is still being evaluated, so expect the occasional mis-heard word. The interface and answers can be switched between English and Hindi.',
  },
  {
    q: 'Where does my audio go?',
    a: 'Your voice clip is sent to the StudyLoop server and on to a hosted speech provider (Sarvam, with Groq as the fallback) to be transcribed. Spoken answers are generated by Sarvam too. If both fail, the speech recogniser built into your browser is used as a last resort.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. StudyLoop is an MSc Data Science course project and has no paid plans.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const signedIn = !!session;
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlayingGif, setIsPlayingGif] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<'fast' | 'rag'>('fast');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isPlayingGif) return;
    const interval = setInterval(() => {
      setActiveFrameIndex((prev) => (prev + 1) % DEMO_FRAMES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlayingGif]);

  // The video id travels in the query string: it survives the sign-in redirect (router state does not).
  const handleProcessUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) {
      setUrlError('Paste a YouTube link first, or tap "Fill Demo".');
      return;
    }
    const id = extractYouTubeId(raw);
    if (!id) {
      setUrlError("That doesn't look like a YouTube link. Try https://www.youtube.com/watch?v=... or a youtu.be link.");
      return;
    }
    setUrlError(null);
    navigate(studyUrl(id));
  };

  const currentFrame = DEMO_FRAMES[activeFrameIndex];
  const primaryCta = signedIn
    ? { to: '/dashboard-home', label: 'Open app' }
    : { to: '/login?mode=signup', label: 'Get started' };

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
            <a href="#demo" className="hover:text-foreground transition-colors">Illustration</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#scenarios" className="hover:text-foreground transition-colors">Voice Commands</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {!signedIn && (
              <Link
                to="/login"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
            )}
            <Link
              to={primaryCta.to}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2"
            >
              <Icon name="SparklesIcon" size={16} />
              {primaryCta.label}
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="p-2 rounded-xl bg-surface-elevated text-muted-foreground hover:text-foreground border border-border"
              aria-label="Open navigation drawer"
            >
              <Icon name="Bars3Icon" size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Slide-out Mobile Landing Drawer */}
      <LandingDrawer isOpen={isMobileDrawerOpen} onClose={() => setIsMobileDrawerOpen(false)} signedIn={signedIn} />

      {/* ── Hero Section ── */}
      <section className="relative pt-36 pb-16 px-6 max-w-7xl mx-auto text-center">
        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1] mb-6"
        >
          Talk to Your YouTube Lectures with an{' '}
          <span className="gradient-text-hero">AI Voice Copilot</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl text-foreground-muted max-w-3xl mx-auto mb-10 leading-relaxed"
        >
          Hold down the <kbd className="px-2 py-1 rounded bg-surface-elevated border border-border text-indigo-300 font-mono text-sm shadow-inner">~ Tilde</kbd> key and speak in English, Hindi or Hinglish: control playback, skip to a topic, ask questions answered from what you have watched, and save voice notes.
        </motion.p>

        {/* Clean URL Processing Bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mb-10"
        >
          <form
            onSubmit={handleProcessUrl}
            noValidate
            className="relative flex flex-col sm:flex-row gap-3 p-2.5 rounded-2xl bg-surface-card border border-border/80 shadow-xl"
          >
            <div
              className={`relative flex-1 group rounded-xl border bg-[#151926] transition-all duration-300 ${
                urlError ? 'border-red-500/60' : 'border-border/80 hover:border-indigo-500/40'
              }`}
            >
              <div className="relative flex items-center rounded-[11px] overflow-hidden">
                <Icon name="LinkIcon" size={18} className="absolute left-4 text-indigo-400 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  placeholder="Paste YouTube video URL..."
                  aria-label="YouTube video URL"
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby={urlError ? 'hero-url-error' : undefined}
                  className="w-full bg-transparent border-0 pl-11 pr-4 py-3.5 text-sm text-foreground font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUrlInput(DEMO_YOUTUBE_URL);
                  setUrlError(null);
                }}
                className="px-3.5 py-3.5 rounded-xl bg-surface-card border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-indigo-500/40 transition-colors whitespace-nowrap"
              >
                Fill Demo
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 sm:flex-none px-6 py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Icon name="PlayIcon" size={18} />
                Start Studying
              </button>
            </div>
          </form>
          {urlError && (
            <p id="hero-url-error" role="alert" className="mt-3 text-sm text-red-400 flex items-start justify-center gap-1.5 text-left">
              <Icon name="ExclamationCircleIcon" size={16} className="mt-0.5 flex-shrink-0" />
              <span>{urlError}</span>
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Demo lecture: MIT 6.006, Lecture 1 (Algorithmic Thinking, Peak Finding).
            {!signedIn && ' You will be asked to sign in first.'}
          </p>
        </motion.div>

        {/* ── Frame-by-Frame Animated Conversation Illustration ── */}
        <motion.div
          id="demo"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="max-w-5xl mx-auto mb-16 relative"
        >
          <div className="relative rounded-3xl overflow-hidden bg-surface-card border border-border/80 p-2 shadow-2xl">
            {/* Window Header with Frame Stepper Controls */}
            <div className="bg-[#151926] px-3 sm:px-4 py-3 rounded-t-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/60">
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
                <span className="ml-2 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300">
                  Illustration, not a live recording
                </span>
              </div>

              {/* Touch-Scrollable Interactive Timeline Frame Controller */}
              <div className="flex items-center gap-1.5 bg-obsidian border border-border/60 rounded-xl p-1 overflow-x-auto sm:overflow-x-visible flex-wrap sm:flex-nowrap scrollbar-none max-w-full">
                <button
                  onClick={() => setIsPlayingGif(!isPlayingGif)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-600/50 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <Icon name={isPlayingGif ? 'PauseIcon' : 'PlayIcon'} size={14} />
                  <span>{isPlayingGif ? 'Auto Loop' : 'Paused'}</span>
                </button>
                {DEMO_FRAMES.map((f, i) => (
                  <button
                    key={`frame-tab-${i}`}
                    onClick={() => {
                      setActiveFrameIndex(i);
                      setIsPlayingGif(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                      activeFrameIndex === i
                        ? 'bg-cyan-500 text-black font-extrabold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated'
                    }`}
                  >
                    <span>{f.interactionType}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mock Workspace with Frame-by-Frame Animated Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`frame-content-${activeFrameIndex}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-2 bg-[#0B0E17] p-2.5 sm:p-3 rounded-b-2xl min-h-[420px] text-left relative overflow-hidden"
              >
                {/* Main Video Screen (decorative backdrop) */}
                <div className="lg:col-span-2 relative rounded-xl overflow-hidden bg-black/80 border border-border/60 flex flex-col justify-between p-3.5 sm:p-4 min-h-[300px] sm:min-h-[320px]">
                  <img
                    src={currentFrame.image}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-40 transition-opacity duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />

                  {/* Top HUD Overlay */}
                  <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 text-[11px] sm:text-xs font-bold font-mono truncate max-w-full">
                      Example lecture view @ {currentFrame.timestamp}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-[11px] sm:text-xs font-mono font-bold">
                      {currentFrame.route}
                    </span>
                  </div>

                  {/* Frame Description Indicator */}
                  <div className="relative z-10 my-3">
                    <span className="px-2.5 py-1 rounded-lg bg-surface-card/90 border border-border text-[11px] font-bold text-foreground inline-block">
                      {currentFrame.frameTitle}
                    </span>
                  </div>

                  {/* Simulated PTT Speech Bubble in Active Frame */}
                  <div className="relative z-10 text-center py-2">
                    <div className="inline-flex flex-col items-center gap-2 p-3 sm:p-3.5 rounded-2xl bg-indigo-950/90 border border-indigo-500/40 shadow-xl max-w-lg mx-auto w-full">
                      <div className="flex items-center justify-center gap-1.5 text-cyan-300 font-bold text-xs">
                        <Icon name="MicrophoneIcon" size={16} className="animate-pulse text-cyan-400 flex-shrink-0" />
                        <span className="font-mono leading-snug">You said (~ held): "{currentFrame.query}"</span>
                      </div>
                      <div className="flex items-center justify-center gap-1 h-3.5">
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
                  <div className="relative z-10 flex items-center justify-between gap-2 text-[11px] sm:text-xs text-muted-foreground border-t border-white/10 pt-2">
                    <span className="font-mono text-cyan-300">{currentFrame.timestamp}</span>
                    <span className="text-[10px] sm:text-[11px] font-bold text-foreground text-right">{currentFrame.footer}</span>
                  </div>
                </div>

                {/* Copilot Panel for Active Frame */}
                <div className="rounded-xl bg-[#151926] border border-border/60 p-3.5 flex flex-col justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                      <Icon name="SparklesIcon" size={16} className="text-indigo-400" />
                      <span className="font-extrabold text-foreground">Voice Copilot</span>
                      <span className="ml-auto text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-500/30">
                        {currentFrame.interactionType}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-surface-elevated/60 border border-border/40">
                        <p className="text-[11px] font-bold text-indigo-300 mb-1">You said:</p>
                        <p className="text-foreground text-xs leading-snug font-mono">"{currentFrame.query}"</p>
                      </div>

                      <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/30">
                        <p className="text-[11px] font-bold text-cyan-300 mb-1">Copilot:</p>
                        <p className="text-foreground-muted text-xs leading-relaxed">
                          {currentFrame.response}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Result Line */}
                  <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                      <Icon name="BookmarkIcon" size={14} className="flex-shrink-0" />
                      {currentFrame.autoNote}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            A scripted example of a session, not a live recording. Timestamps and replies are illustrative.
          </p>
        </motion.div>

        {/* ── Facts Grid ── */}
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
              <p className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight mb-1 font-mono break-words">
                {m.value}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Model Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto mb-16"
        >
          {MODEL_BADGES.map((b) => (
            <div
              key={`model-${b.name}`}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 max-w-full ${b.color}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
              <span className="font-bold">{b.name}</span>
              <span className="opacity-60 font-normal text-left">| {b.desc}</span>
            </div>
          ))}
        </motion.div>

        {/* Honest context line (replaces the old social-proof wall) */}
        <div className="pt-8 border-t border-border/40 max-w-5xl mx-auto">
          <p className="text-xs text-muted-foreground">
            StudyLoop is an MSc Data Science course project. It is not affiliated with YouTube or with any course provider.
          </p>
        </div>
      </section>

      {/* ── System Architecture: two paths ── */}
      <section id="architecture" className="py-20 px-6 max-w-7xl mx-auto border-t border-border/40">
        <div className="text-center mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 block">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Two Paths: Fast Commands and Grounded Answers
          </h2>
          <p className="text-foreground-muted text-base max-w-3xl mx-auto">
            Every spoken turn is routed on the server. Player commands go through a trained DistilBERT classifier and never touch an LLM; topic seeks and questions use retrieval over the transcript.
          </p>

          {/* Path Selector Toggle */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mt-8 p-1.5 rounded-2xl bg-surface-card border border-border/80 max-w-full">
            <button
              onClick={() => setSelectedEngine('fast')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedEngine === 'fast'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="BoltIcon" size={16} />
              <span>Fast path: player commands</span>
            </button>
            <button
              onClick={() => setSelectedEngine('rag')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${selectedEngine === 'rag'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon name="MagnifyingGlassIcon" size={16} />
              <span>Retrieval path: seek and Q&amp;A</span>
            </button>
          </div>
        </div>

        {/* Path Highlights Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`engine-card-${selectedEngine}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="mb-14 p-6 sm:p-8 rounded-3xl bg-surface-card border border-indigo-500/30 max-w-5xl mx-auto relative overflow-hidden"
          >
            {selectedEngine === 'fast' ? (
              <div className="grid md:grid-cols-3 gap-6 text-left">
                <div className="md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-xs font-bold">
                      DistilBERT, INT8, ONNX
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      Runs on the server CPU
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Trained Intent Classifier</h3>
                  <p className="text-foreground-muted text-sm leading-relaxed mb-4">
                    Commands such as <em>"skip 10 seconds"</em>, <em>"pause"</em> or <em>"speed 1.5x"</em> are classified on the server by a DistilBERT model trained for this project, with a regex fallback. The LLM is not involved on this path.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-mono text-cyan-300">
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">Intent: SEEK_BACK (-10 s)</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">~5-15 ms classify (local benchmark)</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border font-bold text-emerald-400">No LLM call</span>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border flex flex-col justify-center text-xs space-y-2">
                  <p className="font-bold text-foreground mb-1">Example commands:</p>
                  <p className="text-muted-foreground">• "Go back 10 seconds"</p>
                  <p className="text-muted-foreground">• "Speed 1.5x"</p>
                  <p className="text-muted-foreground">• "दस सेकंड पीछे जाओ"</p>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6 text-left">
                <div className="md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-xs font-bold">
                      BGE-M3 embeddings + keyword search
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                      Spoiler guard (switchable)
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Semantic Seek and Grounded Q&amp;A</h3>
                  <p className="text-foreground-muted text-sm leading-relaxed mb-4">
                    "Skip to the part about X" searches the whole video. Questions are answered from the transcript with [mm:ss] citations that seek when clicked, using only what you have already watched unless you switch the guard off.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-mono text-cyan-300">
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border">Vector dim: 1024</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border font-bold text-purple-400">Citations: [mm:ss]</span>
                    <span className="px-2.5 py-1 rounded-lg bg-obsidian border border-border text-emerald-400">Watched-only answers</span>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-[#0B0E17] border border-border flex flex-col justify-center text-xs space-y-2">
                  <p className="font-bold text-foreground mb-1">Example requests:</p>
                  <p className="text-muted-foreground">• "Skip to the part about binary search"</p>
                  <p className="text-muted-foreground">• "Why does moving toward the larger neighbour work?"</p>
                  <p className="text-muted-foreground">• "Summarize what we have covered so far"</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 4-Step Flowchart Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
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

      {/* ── Hands-Free Study Scenarios Section ── */}
      <section id="scenarios" className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 mb-3 block">
            Voice Commands
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Hands-Free Study Commands
          </h2>
          <p className="text-foreground-muted text-base max-w-2xl mx-auto">
            Watching a long lecture while taking handwritten notes or eating lunch? Hold ~ and use your voice without leaving the player.
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
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
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
                <p className="text-xs font-mono text-cyan-300 font-semibold break-words">{scen.example}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Problem vs Solution Card ── */}
      <section className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Long Lectures Are Hard to Navigate
          </h2>
          <p className="text-foreground-muted text-base max-w-2xl mx-auto">
            Rewinding, searching and note-taking pull you out of the lecture. StudyLoop keeps your hands on your notes and your voice on the video.
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
                Notes taken after the video miss precise timestamp context.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className="p-8 rounded-3xl bg-surface-card border border-indigo-500/30 relative overflow-hidden shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Icon name="CheckIcon" size={20} />
              </div>
              <h3 className="text-xl font-bold text-foreground">Voice Copilot with StudyLoop</h3>
            </div>
            <ul className="space-y-4 text-sm text-foreground-muted">
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                <span>Hold <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-indigo-300 font-mono text-xs">~</kbd> to command the player or ask a question without leaving it.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                Answers come from what you have already watched (a switch turns that off).
              </li>
              <li className="flex items-start gap-3">
                <span className="text-cyan-400 font-bold">✓</span>
                Voice notes keep their timestamp and export to Markdown or PDF.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 4-Card Feature Grid ── */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3 block">
            What It Does
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Everything You Need to Study from a Lecture Video
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
              className={`p-6 sm:p-8 rounded-3xl bg-gradient-to-br ${f.color} bg-surface-card border border-border/80 relative overflow-hidden transition-all duration-300`}
            >
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className={`p-3.5 rounded-2xl bg-surface-card border border-border ${f.iconColor}`}>
                  <Icon name={f.icon as Parameters<typeof Icon>[0]['name']} size={24} />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full border border-border bg-surface-card/60 text-muted-foreground text-center">
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
            How to Use StudyLoop
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
                className={`rounded-2xl transition-all duration-300 overflow-hidden ${isOpen
                  ? 'bg-surface-card border border-indigo-500/40'
                  : 'bg-surface-card/60 border border-border/80 hover:border-indigo-500/30'
                  }`}
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full p-5 sm:p-6 text-left font-bold text-base md:text-lg text-foreground flex items-center justify-between gap-4 select-none cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300 ${isOpen ? 'bg-cyan-400' : 'bg-indigo-500/40'
                        }`}
                    />
                    {faq.q}
                  </span>
                  <div
                    className={`p-2 rounded-xl flex-shrink-0 transition-all duration-300 ${isOpen
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
                      <div className="px-5 sm:px-6 pb-6 pt-2 text-sm md:text-base text-foreground-muted leading-relaxed border-t border-indigo-500/15">
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
        <div className="p-8 sm:p-12 rounded-3xl bg-surface-card border border-indigo-500/30 text-center relative overflow-hidden shadow-2xl">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Ready to Talk to Your Next Lecture?
          </h2>
          <p className="text-foreground-muted text-base max-w-xl mx-auto mb-8">
            StudyLoop is free while it is a course project. Hold ~ and ask.
          </p>
          <Link
            to={primaryCta.to}
            className="btn-primary inline-block px-8 py-4 rounded-2xl text-base font-bold text-white"
          >
            {primaryCta.label}
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-6 border-t border-border/40 text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <AppLogo size={24} />
            <span className="font-bold text-foreground">StudyLoop</span>
            <span>© 2026 MSc Data Science Team</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/video-study-page" className="hover:text-foreground">App Workspace</Link>
            <Link to="/dashboard-home" className="hover:text-foreground">Dashboard</Link>
            <a href="#architecture" className="hover:text-foreground">How it works</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
