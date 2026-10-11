import React from 'react';
import type { SpokenRange } from '@/hooks/useTildePTT';
import AnswerText from './AnswerText';

/**
 * The answer with the sentence being spoken right now highlighted: what you hear is what you see. Already-spoken
 * text stays readable, the rest waits a little dimmer. Without a range (not speaking) it is plain AnswerText.
 */
export default function SpokenText({
  text,
  range,
  onSeek,
  tone = 'dark',
}: {
  text: string;
  range: SpokenRange | null;
  onSeek?: (ts: string) => void;
  /** 'overlay' = light text on the fullscreen video */
  tone?: 'dark' | 'overlay';
}) {
  if (!range || range.end <= range.start || range.start >= text.length) return <AnswerText text={text} onSeek={onSeek} />;
  const now = tone === 'overlay' ? 'bg-white/15 text-white' : 'bg-indigo-400/20 text-foreground';
  return (
    <>
      <span className="opacity-75">
        <AnswerText text={text.slice(0, range.start)} onSeek={onSeek} />
      </span>
      <span className={`rounded px-0.5 -mx-0.5 transition-colors duration-200 ${now}`}>
        <AnswerText text={text.slice(range.start, range.end)} onSeek={onSeek} />
      </span>
      <span className="opacity-50">
        <AnswerText text={text.slice(range.end)} onSeek={onSeek} />
      </span>
    </>
  );
}
