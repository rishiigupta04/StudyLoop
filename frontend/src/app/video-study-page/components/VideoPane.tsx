import React, { useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAppFullscreen } from '@/hooks/useAppFullscreen';
import type { YouTubePlayerApi } from '@/hooks/useYouTubePlayer';
import type { VideoOutlineState } from '@/hooks/useVideoOutline';
import { PLAYBACK_RATES } from '@/lib/playerActions';
import { formatClock } from '@/lib/time';
import { activeChapterIndex, chapterReached, markerPercent, pickOutline, summaryView, type Lang } from '@/lib/outline';
import { IN_PROGRESS_STATUSES, type VideoStatus } from '@/services/transcriptService';

/** Every string in the Lecture Intelligence panel, EN + HI. */
const T = {
  title: { en: 'Lecture Intelligence', hi: 'लेक्चर इंटेलिजेंस' },
  summaryTab: { en: 'Structured Summary', hi: 'सारांश' },
  chaptersTab: { en: 'Chapters', hi: 'अध्याय' },
  active: { en: 'Now', hi: 'अभी' },
  waitingTranscript: {
    en: 'Chapters and the summary appear once the transcript is ready.',
    hi: 'Transcript तैयार होते ही अध्याय और सारांश यहाँ दिखेंगे।',
  },
  noTranscript: {
    en: "No transcript for this video, so there are no chapters or summary. Voice playback still works.",
    hi: 'इस वीडियो का transcript नहीं है, इसलिए अध्याय और सारांश नहीं बन सकते। Voice playback चलता रहेगा।',
  },
  generating: {
    en: 'Generating chapters and a summary from the transcript… (about a minute)',
    hi: 'Transcript से अध्याय और सारांश बन रहे हैं… (लगभग एक मिनट)',
  },
  failed: { en: "Couldn't generate chapters this time.", hi: 'इस बार अध्याय नहीं बन पाए।' },
  notGenerated: {
    en: 'No chapters yet for this video.',
    hi: 'इस वीडियो के अध्याय अभी नहीं बने हैं।',
  },
  retry: { en: 'Retry', hi: 'फिर से कोशिश करें' },
  generate: { en: 'Generate', hi: 'बनाएँ' },
  loading: { en: 'Loading…', hi: 'लोड हो रहा है…' },
  fellBack: {
    en: 'The English outline is missing for this video, showing Hindi.',
    hi: 'इस वीडियो का हिंदी सारांश नहीं बन पाया, English दिखा रहे हैं।',
  },
  lockedSections: {
    en: (n: number) => `${n} more section${n === 1 ? '' : 's'} unlock as you watch (no spoilers).`,
    hi: (n: number) => `देखते-देखते ${n} और हिस्से खुलेंगे (no spoilers)।`,
  },
  lockedBlurb: { en: 'Summary unlocks when you reach this chapter.', hi: 'इस अध्याय तक पहुँचने पर सारांश दिखेगा।' },
  jump: { en: 'Jump to', hi: 'यहाँ जाएँ:' },
} as const;

interface VideoPaneProps {
  activeTimestamp: string;
  onTimestampClick: (ts: string) => void;
  onOpenVoiceModal: () => void;
  player: YouTubePlayerApi;
  playerHostRef: React.RefObject<HTMLDivElement | null>;
  outline: VideoOutlineState;
  transcriptStatus: VideoStatus;
  language: Lang;
  spoilerGuard: boolean;
  /** the learner's high-water mark for this video (this session and earlier ones) */
  watchedS: number;
}

export default function VideoPane({
  onTimestampClick,
  onOpenVoiceModal,
  player,
  playerHostRef,
  outline,
  transcriptStatus,
  language,
  spoilerGuard,
  watchedS,
}: VideoPaneProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'chapters'>('chapters');

  const paneContainerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useAppFullscreen(paneContainerRef);

  const { doc, fellBack } = pickOutline(outline.outline, language);
  const chapters = doc?.chapters ?? [];
  const duration = player.duration || chapters[chapters.length - 1]?.end_s || 0;
  const progressPercent = duration > 0 ? Math.min(100, (player.currentTime / duration) * 100) : 0;
  const currentIdx = activeChapterIndex(chapters, player.currentTime);
  const parts = doc ? summaryView(doc, watchedS, spoilerGuard) : [];
  const seek = (s: number) => onTimestampClick(formatClock(s));

  const speeds = PLAYBACK_RATES.filter((r) => r >= 0.75);

  const renderState = () => {
    if (IN_PROGRESS_STATUSES.includes(transcriptStatus)) return <StateNote icon="ClockIcon" text={T.waitingTranscript[language]} />;
    if (transcriptStatus !== 'ready') return <StateNote icon="InformationCircleIcon" text={T.noTranscript[language]} />;
    if (outline.loading) return <StateNote icon="ArrowPathIcon" spin text={T.loading[language]} />;
    if (outline.status === 'generating')
      return (
        <div className="space-y-3">
          <StateNote icon="SparklesIcon" pulse text={T.generating[language]} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-surface-elevated/60 animate-pulse" />
          ))}
        </div>
      );
    const action = outline.status === 'failed' ? T.retry[language] : T.generate[language];
    return (
      <StateNote
        icon="ExclamationTriangleIcon"
        text={outline.status === 'failed' ? T.failed[language] : T.notGenerated[language]}
        action={{ label: action, busy: outline.requesting, onClick: () => void outline.generate(true) }}
      />
    );
  };

  return (
    <div
      ref={paneContainerRef}
      className={`flex flex-col h-full min-h-0 video-pane overflow-y-auto scrollbar-thin ${
        isFullscreen ? 'bg-obsidian p-4' : ''
      }`}
    >
      {/* YouTube Embed Container */}
      <div className="relative w-full bg-black flex items-center justify-center flex-shrink-0 max-h-[48vh] sm:max-h-[52vh] overflow-hidden">
        <div className="w-full aspect-video relative max-h-[48vh] sm:max-h-[52vh]">
          {/* Real YouTube IFrame player (useYouTubePlayer mounts into this host) */}
          <div ref={playerHostRef} className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
          {player.status !== 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
              {player.status === 'error' ? player.error : 'Loading player…'}
            </div>
          )}
        </div>
      </div>

      {/* Integrated Controls Bar with Voice Copilot Button & App Fullscreen Toggle */}
      <div className="bg-surface-card/90 border-b border-border/80 px-4 py-2.5 flex-shrink-0">
        {/* Progress bar */}
        <div className="mb-2.5 relative">
          <div
            className="h-1.5 bg-surface-elevated rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (duration > 0) player.seekTo(((e.clientX - r.left) / r.width) * duration);
            }}
          >
            <div
              className="h-full rounded-full bg-indigo-500 progress-bar-fill shadow-glow-indigo-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {/* Chapter markers (always shown: navigation is exempt from the no-spoiler rule) */}
          {duration > 0 &&
            chapters.map((ch, i) => (
              <button
                key={`marker-${ch.start_s}`}
                onClick={() => seek(ch.start_s)}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-obsidian transition-all duration-150 hover:scale-125 z-10"
                style={{
                  left: `${markerPercent(ch.start_s, duration)}%`,
                  background: i === currentIdx ? '#7C3AED' : '#64748B',
                }}
                title={`${formatClock(ch.start_s)} — ${ch.title}`}
                aria-label={`${T.jump[language]} ${ch.title} (${formatClock(ch.start_s)})`}
              />
            ))}
        </div>

        {/* Controls Row: Play/Pause, Voice Copilot, Speed, Fullscreen */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => player.seekTo(Math.max(0, player.getCurrentTime() - 10))}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title="Rewind 10s"
            >
              <Icon name="BackwardIcon" size={16} />
            </button>
            <button
              onClick={() => (player.isPlaying ? player.pause() : player.play())}
              className="p-2 rounded-xl btn-primary text-white mx-1 shadow-glow-indigo-sm"
              title={player.isPlaying ? 'Pause' : 'Play'}
            >
              <Icon name={player.isPlaying ? 'PauseIcon' : 'PlayIcon'} size={16} />
            </button>
            <button
              onClick={() => player.seekTo(Math.min(duration || Infinity, player.getCurrentTime() + 10))}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title="Forward 10s"
            >
              <Icon name="ForwardIcon" size={16} />
            </button>
            <button
              onClick={() => (player.muted ? player.unmute() : player.mute())}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
              title={player.muted ? 'Unmute' : 'Mute'}
            >
              <Icon name={player.muted ? 'SpeakerXMarkIcon' : 'SpeakerWaveIcon'} size={16} />
            </button>
          </div>

          <button
            onClick={onOpenVoiceModal}
            className="btn-primary px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-glow-indigo-sm ptt-pulse hover:scale-105 transition-transform"
            title="Hold ~ to ask voice question"
          >
            <Icon name="MicrophoneIcon" size={14} />
            <span>Voice Copilot</span>
            <kbd className="px-1.5 py-0.2 rounded bg-indigo-900/60 border border-indigo-400/40 text-indigo-200 font-mono text-[10px]">
              ~
            </kbd>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {formatClock(player.currentTime)} / {formatClock(duration)}
            </span>
            <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 border border-border/60">
              {speeds.map((s) => (
                <button
                  key={`speed-${s}`}
                  onClick={() => player.setRate(s)}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                    player.rate === s
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors ml-1"
              title={isFullscreen ? 'Exit Fullscreen' : 'Study Workspace Fullscreen (Keeps ~ PTT Active)'}
            >
              <Icon name={isFullscreen ? 'ArrowsPointingInIcon' : 'ArrowsPointingOutIcon'} size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Lecture Intelligence: chapters + structured summary generated from this video's transcript */}
      <div className="flex-1 p-4 bg-obsidian/30 min-h-[320px]">
        <div className="flex items-center justify-between gap-3 mb-4 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Icon name="SparklesIcon" size={18} className="text-indigo-400" />
            <h3 className="text-sm font-extrabold text-foreground tracking-tight">{T.title[language]}</h3>
          </div>

          <div className="flex items-center gap-1 bg-surface-card border border-border/80 rounded-xl p-1" role="tablist">
            {(['chapters', 'summary'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={tab === 'chapters' ? 'BookmarkIcon' : 'DocumentTextIcon'} size={14} />
                <span>
                  {tab === 'chapters' ? `${T.chaptersTab[language]}${chapters.length ? ` (${chapters.length})` : ''}` : T.summaryTab[language]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {!doc ? (
          renderState()
        ) : (
          <>
            {fellBack && <p className="text-[11px] text-amber-300/90 mb-3">{T.fellBack[language]}</p>}

            {activeTab === 'summary' && (
              <div className="space-y-4 pb-8">
                {doc.overview && <p className="text-xs text-foreground/85 leading-relaxed">{doc.overview}</p>}
                {parts.map((part, pi) => (
                  <div
                    key={`part-${part.start_s}-${pi}`}
                    className="glass-card rounded-2xl border border-indigo-500/20 p-4 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 mb-3 border-b border-border/50 pb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-glow-indigo-sm font-mono flex-shrink-0">
                          {pi + 1}
                        </span>
                        <h4 className="text-sm font-bold text-foreground truncate">{part.title}</h4>
                      </div>
                      <button
                        onClick={() => seek(part.start_s)}
                        className="text-xs font-mono font-semibold text-muted-foreground hover:text-cyan-400 bg-surface-elevated px-2 py-0.5 rounded flex-shrink-0"
                      >
                        {formatClock(part.start_s)} – {formatClock(part.end_s)}
                      </button>
                    </div>

                    <div className="space-y-3 pl-1">
                      {part.sections.map((sec) =>
                        sec.revealed ? (
                          <div key={`sec-${sec.start_s}`} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                                {sec.title}
                              </h5>
                              <button
                                onClick={() => seek(sec.start_s)}
                                className="text-[11px] font-mono font-bold text-indigo-400 hover:text-cyan-400 transition-colors flex items-center gap-0.5 flex-shrink-0"
                                aria-label={`${T.jump[language]} ${sec.title}`}
                              >
                                <Icon name="PlayIcon" size={10} />
                                {formatClock(sec.start_s)}
                              </button>
                            </div>
                            <ul className="space-y-1.5 pl-3">
                              {sec.bullets.map((b, bi) => (
                                <li key={bi} className="text-xs text-foreground/90 leading-relaxed flex items-start gap-2">
                                  <span className="text-indigo-400 font-bold text-sm leading-none">•</span>
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null
                      )}
                      {part.locked > 0 && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Icon name="EyeSlashIcon" size={12} />
                          {T.lockedSections[language](part.locked)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'chapters' && (
              <div className="space-y-2 pb-8">
                {chapters.map((ch, i) => {
                  const isActive = i === currentIdx;
                  const reached = chapterReached(ch, watchedS, spoilerGuard);
                  return (
                    <button
                      key={`ch-${ch.start_s}`}
                      onClick={() => seek(ch.start_s)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                        isActive
                          ? 'bg-indigo-500/10 border-indigo-500/40 shadow-glow-indigo-sm'
                          : 'bg-surface-card/60 border-border/60 hover:border-indigo-500/30 hover:bg-surface-card'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`text-xs font-mono font-extrabold px-2.5 py-1 rounded-lg tabular-nums flex-shrink-0 ${
                              isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-surface-elevated text-indigo-300 border border-indigo-500/20'
                            }`}
                          >
                            {formatClock(ch.start_s)}
                          </span>
                          <span className={`text-sm font-bold ${isActive ? 'text-foreground' : 'text-foreground/90'}`}>{ch.title}</span>
                        </div>
                        {isActive && (
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 flex-shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            {T.active[language]}
                          </span>
                        )}
                      </div>
                      {ch.summary &&
                        (reached ? (
                          <p className="text-xs text-muted-foreground mt-1 pl-1 leading-relaxed">{ch.summary}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/70 mt-1 pl-1 flex items-center gap-1.5">
                            <Icon name="EyeSlashIcon" size={11} />
                            {T.lockedBlurb[language]}
                          </p>
                        ))}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StateNote({
  icon,
  text,
  spin,
  pulse,
  action,
}: {
  icon: string;
  text: string;
  spin?: boolean;
  pulse?: boolean;
  action?: { label: string; busy: boolean; onClick: () => void };
}) {
  return (
    <div className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-border/60 bg-surface-card/60" role="status">
      <Icon
        name={icon}
        size={16}
        className={`text-indigo-400 flex-shrink-0 mt-0.5 ${spin ? 'animate-spin' : ''} ${pulse ? 'animate-pulse' : ''}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/85 leading-relaxed">{text}</p>
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.busy}
            className="mt-2 text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/40 disabled:opacity-50"
          >
            {action.busy ? '…' : action.label}
          </button>
        )}
      </div>
    </div>
  );
}
