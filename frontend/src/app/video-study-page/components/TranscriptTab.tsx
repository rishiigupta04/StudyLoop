import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { Lang } from '@/hooks/useStudySocket';
import type { VideoTranscriptState } from '@/hooks/useVideoTranscript';
import { TRANSCRIPT_FAIL_MESSAGES, type VideoStatus } from '@/services/transcriptService';

interface TranscriptTabProps {
  transcript: VideoTranscriptState;
  currentTime: number;
  language: Lang;
  onTimestampClick: (ts: string) => void;
}

type Copy = { en: string; hi: string };

const PROGRESS_COPY: Partial<Record<VideoStatus, Copy & { sub?: Copy }>> = {
  pending: { en: 'Preparing transcript…', hi: 'Transcript तैयार हो रहा है…' },
  fetching: { en: 'Fetching transcript…', hi: 'Transcript लाया जा रहा है…' },
  transcribing: {
    en: 'Transcribing this video…',
    hi: 'इस वीडियो का transcript बनाया जा रहा है…',
    sub: {
      en: 'No captions available, so it is being generated. Long lectures can take a couple of minutes.',
      hi: 'Captions नहीं हैं, इसलिए transcript बनाया जा रहा है। लंबे lectures में कुछ मिनट लग सकते हैं।',
    },
  },
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Index of the segment playing at `t` (the last one starting at or before it), or -1. */
function activeIndex(starts: number[], t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function Spinner() {
  return <div className="w-8 h-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />;
}

export default function TranscriptTab({ transcript, currentTime, language, onTimestampClick }: TranscriptTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const { segments, status, failReason, retryable, retrying, retry, hasTranscript, source } = transcript;
  const hi = language === 'hi';

  const starts = useMemo(() => segments.map((s) => s.start), [segments]);
  const active = activeIndex(starts, currentTime + 0.25);

  const query = searchQuery.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      segments
        .map((s, i) => ({ ...s, i }))
        .filter((s) => !query || s.text.toLowerCase().includes(query) || s.timestamp.includes(query)),
    [segments, query]
  );

  // follow playback inside the list only (never scroll the page), and not while searching
  useEffect(() => {
    const list = listRef.current;
    const el = activeRef.current;
    if (!list || !el || query) return;
    list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [active, query]);

  const failure = failReason ? TRANSCRIPT_FAIL_MESSAGES[failReason] : null;
  const progress = PROGRESS_COPY[status];

  const retryButton = retryable && (
    <button
      onClick={() => void retry()}
      disabled={retrying}
      className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 text-xs font-semibold hover:bg-indigo-600/40 transition-colors disabled:opacity-50"
    >
      {retrying ? (hi ? 'कोशिश हो रही है…' : 'Retrying…') : hi ? 'फिर से कोशिश करें' : 'Retry'}
    </button>
  );

  // ---------------------------------------------------------------- no segments yet
  if (!segments.length) {
    if (progress && !failure) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3" role="status" aria-live="polite">
          <Spinner />
          <p className="text-sm font-medium text-foreground">{progress[language]}</p>
          {progress.sub && <p className="text-xs text-muted-foreground max-w-xs">{progress.sub[language]}</p>}
          <p className="text-xs text-muted-foreground">
            {hi ? 'तब तक voice से playback चलता रहेगा।' : 'Voice playback control works meanwhile.'}
          </p>
        </div>
      );
    }
    if (hasTranscript) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3" role="status">
          <Spinner />
          <p className="text-sm text-muted-foreground">{hi ? 'Transcript load हो रहा है…' : 'Loading transcript…'}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3" role="alert">
        <Icon name="ExclamationTriangleIcon" size={28} className="text-amber-400" />
        <p className="text-sm font-medium text-foreground">{hi ? 'Transcript उपलब्ध नहीं है' : 'No transcript for this video'}</p>
        {failure && <p className="text-xs text-muted-foreground max-w-xs">{failure[language]}</p>}
        <p className="text-xs text-muted-foreground">
          {hi ? 'Voice से play, pause, seek और speed चलते रहेंगे।' : 'Voice play, pause, seek and speed still work.'}
        </p>
        {retryButton}
      </div>
    );
  }

  // ---------------------------------------------------------------- segments
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border flex-shrink-0 space-y-2">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="MagnifyingGlassIcon" size={14} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={hi ? 'Transcript में खोजें…' : 'Search transcript…'}
            aria-label="Search transcript"
            className="input-field w-full rounded-lg pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <Icon name="XMarkIcon" size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {segments.length} {hi ? 'पंक्तियाँ' : 'lines'}
            {source && source !== 'creator' && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-surface-elevated">Auto-generated</span>
            )}
          </span>
          {status === 'embedding' && (
            <span className="flex items-center gap-1" role="status">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {hi ? 'Search के लिए index हो रहा है…' : 'Indexing for search…'}
            </span>
          )}
          {status === 'failed' && failure && (
            <span className="flex items-center gap-1.5 text-amber-300" title={failure[language]}>
              {hi ? 'Search index नहीं बना' : 'Search index failed'}
              {retryable && (
                <button onClick={() => void retry()} disabled={retrying} className="underline hover:text-amber-100 disabled:opacity-50">
                  Retry
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-1 relative">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Icon name="MagnifyingGlassIcon" size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">{hi ? 'कुछ नहीं मिला' : 'No results found'}</p>
            <p className="text-xs text-muted-foreground mt-1">{hi ? 'कोई और शब्द आज़माएँ' : 'Try a different search term'}</p>
          </div>
        ) : (
          filtered.map((seg) => {
            const isActive = seg.i === active;
            return (
              <div
                key={seg.i}
                ref={isActive ? activeRef : null}
                onClick={() => onTimestampClick(seg.timestamp)}
                className={`rounded-xl px-3 py-2 cursor-pointer transition-colors duration-200 border ${
                  isActive ? 'transcript-active border-primary/30' : 'border-transparent hover:bg-muted/40 hover:border-border'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md flex-shrink-0 tabular-nums ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {seg.timestamp}
                  </span>
                  <p className={`text-sm leading-relaxed flex-1 ${isActive ? 'text-foreground' : 'text-secondary-foreground'}`}>
                    {query
                      ? seg.text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi')).map((part, j) =>
                          part.toLowerCase() === query ? (
                            <mark key={j} className="bg-highlight/30 text-highlight rounded px-0.5">
                              {part}
                            </mark>
                          ) : (
                            <span key={j}>{part}</span>
                          )
                        )
                      : seg.text}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
