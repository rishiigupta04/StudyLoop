import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { PTTStage, SpokenRange } from '@/hooks/useTildePTT';
import type { Lang } from '@/hooks/useStudySocket';
import type { FollowUpContext } from '@/lib/followUps';
import FollowUps from './FollowUps';
import SpokenText from './SpokenText';

/**
 * The voice turn while the video is fullscreen: a small floating card in the bottom-left corner of the video, above
 * YouTube's control bar, instead of the full-screen VoiceModal. It shows that the mic is listening, what was heard,
 * and the answer as it is spoken, then fades out on its own so the lecture is never blocked.
 */

const T = {
  listening: { en: 'Listening… keep holding ~', hi: 'सुन रहा हूँ… ~ दबाए रखें' },
  thinking: { en: 'Thinking…', hi: 'सोच रहा हूँ…' },
  speaking: { en: 'Answering', hi: 'जवाब' },
  done: { en: 'Answer', hi: 'जवाब' },
  you: { en: 'You', hi: 'आप' },
  speakNow: { en: 'Speak now…', hi: 'अब बोलिए…' },
  waking: { en: 'Waking the voice server (up to a minute)…', hi: 'Voice server शुरू हो रहा है (एक मिनट तक)…' },
  reconnecting: { en: 'Reconnecting to the server…', hi: 'Server से फिर जुड़ रहा है…' },
  close: { en: 'Close', hi: 'बंद करें' },
} as const;

/** how long the finished answer stays on screen after it has been spoken (longer with follow-ups to pick from) */
const LINGER_MS = 5000;
const LINGER_WITH_CHIPS_MS = 9000;
/** a notice with no turn behind it (window lost focus, mic blocked) */
const NOTICE_MS = 6000;
const FADE_MS = 300;

interface VoiceCaptionProps {
  stage: PTTStage;
  recognizedText: string;
  aiResponse: string;
  answerSpoken: boolean;
  notice: string | null;
  connecting: 'waking' | 'reconnecting' | null;
  language: Lang;
  onSeekTimestamp?: (ts: string) => void;
  /** the card is done (faded out): close the turn */
  onDone: () => void;
  /** the sentence being spoken (highlighted) */
  spoken?: SpokenRange | null;
  /** one-tap follow-ups under a grounded answer */
  followUp?: FollowUpContext | null;
  onAsk?: (text: string) => void;
  onSeek?: (seconds: number) => void;
}

export default function VoiceCaption({
  stage,
  recognizedText,
  aiResponse,
  answerSpoken,
  notice,
  connecting,
  language,
  onSeekTimestamp,
  onDone,
  spoken = null,
  followUp = null,
  onAsk,
  onSeek,
}: VoiceCaptionProps) {
  const [leaving, setLeaving] = useState(false);
  const [hover, setHover] = useState(false); // the mouse is on the card (reading, about to tap a chip): stay
  const answerRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // fade out once the answer has been spoken (or a bare notice has been read); a new hold cancels the fade
  const finished = (stage === 'responding' && answerSpoken) || (stage === 'idle' && !!notice);
  const chips = stage === 'responding' && !!followUp && !!onAsk && !!onSeek;
  useEffect(() => {
    setLeaving(false);
    if (!finished || hover) return;
    const wait = stage === 'idle' ? NOTICE_MS : chips ? LINGER_WITH_CHIPS_MS : LINGER_MS;
    const fade = window.setTimeout(() => setLeaving(true), wait);
    const done = window.setTimeout(() => onDoneRef.current(), wait + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [finished, stage, aiResponse, hover, chips]);

  // keep the newest streamed words in view
  useEffect(() => {
    const el = answerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [aiResponse]);

  const speaking = stage === 'responding' && !answerSpoken;
  const label =
    stage === 'listening'
      ? T.listening[language]
      : stage === 'processing'
        ? T.thinking[language]
        : speaking
          ? T.speaking[language]
          : T.done[language];
  const heard = recognizedText.trim();

  return (
    // bottom-16/20: clear of YouTube's control bar, which appears when the mouse is over the video
    <div className="absolute left-3 sm:left-5 bottom-16 sm:bottom-20 z-30 w-[min(440px,calc(100%-1.5rem))] sm:w-[min(440px,42%)] pointer-events-auto">
      <div
        className={`rounded-2xl border border-white/10 bg-black/65 backdrop-blur-md shadow-2xl shadow-black/40 px-4 py-3 text-white fade-in ${
          leaving ? 'opacity-0 translate-y-1' : 'opacity-100'
        } transition-all duration-300`}
        role="status"
        aria-live="polite"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* status row */}
        <div className="flex items-center gap-2 mb-1.5">
          <StatusIcon stage={stage} speaking={speaking} />
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              stage === 'listening' ? 'text-red-300' : stage === 'processing' ? 'text-cyan-300' : 'text-indigo-300'
            }`}
          >
            {label}
          </span>
          <button
            onClick={onDone}
            className="ml-auto -mr-1 p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={T.close[language]}
            title={T.close[language]}
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>

        {connecting && (stage === 'listening' || stage === 'processing') && (
          <p className="text-xs text-amber-300 mb-1.5">{T[connecting][language]}</p>
        )}

        {/* what the learner said (live while ~ is held) */}
        {(heard || stage === 'listening') && (
          <p className="text-sm leading-snug text-white/75">
            <span className="font-semibold text-white/50 mr-1.5">{T.you[language]}:</span>
            {heard || <span className="italic text-white/45">{T.speakNow[language]}</span>}
          </p>
        )}

        {notice && <p className="text-xs text-amber-300 mt-1.5">{notice}</p>}

        {/* the answer, streamed as it is spoken */}
        {aiResponse && (
          <div
            ref={answerRef}
            className="mt-2 pt-2 border-t border-white/10 max-h-[28vh] overflow-y-auto scrollbar-thin text-[15px] leading-relaxed text-white"
          >
            <SpokenText text={aiResponse} range={spoken} onSeek={onSeekTimestamp} tone="overlay" />
          </div>
        )}

        {chips && (
          <div className="mt-2.5">
            <FollowUps ctx={followUp!} onAsk={onAsk!} onSeek={onSeek!} variant="overlay" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ stage, speaking }: { stage: PTTStage; speaking: boolean }) {
  if (stage === 'listening') {
    return (
      <span className="relative flex w-2.5 h-2.5">
        <span className="absolute inline-flex w-full h-full rounded-full bg-red-400 opacity-75 animate-ping" />
        <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-500" />
      </span>
    );
  }
  if (stage === 'processing') return <Icon name="ArrowPathIcon" size={13} className="text-cyan-300 animate-spin" />;
  if (speaking) {
    return (
      <span className="flex items-end gap-[2px] h-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-indigo-300 waveform-bar"
            style={{ height: `${6 + (i % 2) * 5}px`, animationDuration: `${0.45 + i * 0.12}s` }}
          />
        ))}
      </span>
    );
  }
  return <Icon name="SparklesIcon" size={13} className="text-indigo-300" />;
}
