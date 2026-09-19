import React from 'react';

const CITATION = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

/**
 * An answer with its [mm:ss] citations rendered as chips that seek the video (Tier 1b).
 * With the spoiler guard on (default), citations only point at transcript the learner has already watched
 * (the server enforces it); with it off they can point anywhere in the lecture.
 */
export default function AnswerText({ text, onSeek }: { text: string; onSeek?: (ts: string) => void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const ts = m[1];
    parts.push(
      onSeek ? (
        <button
          key={`${at}-${ts}`}
          type="button"
          onClick={() => onSeek(ts)}
          className="inline-flex items-center mx-0.5 px-1.5 py-px rounded-md bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-mono text-[11px] font-semibold align-baseline hover:bg-indigo-500/40 transition-colors"
          title={`Jump to ${ts}`}
          aria-label={`Jump to ${ts}`}
        >
          {ts}
        </button>
      ) : (
        <span key={`${at}-${ts}`} className="font-mono text-[11px] text-indigo-300">
          {ts}
        </span>
      )
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
