import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { FollowUpContext } from '@/lib/followUps';
import { formatClock } from '@/lib/time';

/**
 * One-tap follow-ups under an answer: "Explain with an example", "Simpler", the other language, a jump to the
 * moment it relied on (or "Replay from …" after "I'm lost"). Students rarely know what to ask next.
 */

interface Chip {
  key: string;
  label: string;
  icon: string;
  /** a follow-up question, sent like anything the learner asks */
  ask?: string;
  /** or a jump in the video */
  seekS?: number;
}

// The asks are worded so both intent classifiers read them as questions with high confidence, and so the reply
// language is unambiguous ("in Hindi" / "in English" override Auto and the toggle).
const ASKS = {
  en: {
    example: { label: 'Explain with an example', ask: 'Can you explain that with an example?' },
    simpler: { label: 'Simpler', ask: 'Can you explain that more simply?' },
    other: { label: 'हिंदी में', ask: 'Explain that in Hindi' },
  },
  hi: {
    example: { label: 'Example दो', ask: 'इसे एक example देकर समझाओ' },
    simpler: { label: 'और आसान', ask: 'isko aur simple karke samjhao' },
    other: { label: 'In English', ask: 'Explain that in English' },
  },
} as const;

function chipsFor(ctx: FollowUpContext): Chip[] {
  const L = ASKS[ctx.language];
  const hi = ctx.language === 'hi';
  const chips: Chip[] = [];
  if (ctx.kind === 'recap' && ctx.replayFromS != null) {
    const at = formatClock(ctx.replayFromS);
    chips.push({ key: 'replay', label: hi ? `${at} से दोबारा देखें` : `Replay from ${at}`, icon: 'ArrowPathIcon', seekS: ctx.replayFromS });
  }
  chips.push(
    { key: 'example', label: L.example.label, icon: 'LightBulbIcon', ask: L.example.ask },
    { key: 'simpler', label: L.simpler.label, icon: 'SparklesIcon', ask: L.simpler.ask },
    { key: 'other', label: L.other.label, icon: 'LanguageIcon', ask: L.other.ask }
  );
  const first = ctx.citations[0];
  if (ctx.kind !== 'recap' && first) {
    const at = formatClock(first.start_s);
    chips.push({ key: 'jump', label: hi ? `${at} पर जाएँ` : `Jump to ${at}`, icon: 'PlayIcon', seekS: first.start_s });
  }
  return chips;
}

interface FollowUpsProps {
  ctx: FollowUpContext;
  onAsk: (text: string) => void;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  /** on the fullscreen caption: light-on-dark */
  variant?: 'panel' | 'overlay';
}

export default function FollowUps({ ctx, onAsk, onSeek, disabled, variant = 'panel' }: FollowUpsProps) {
  const chips = chipsFor(ctx);
  const cls =
    variant === 'overlay'
      ? 'border-white/15 bg-white/10 text-white/85 hover:bg-white/20 hover:text-white'
      : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/25 hover:text-white';
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ctx.language === 'hi' ? 'आगे पूछें' : 'Follow-up'}>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={disabled && !!c.ask}
          onClick={() => (c.ask ? onAsk(c.ask) : c.seekS != null && onSeek(c.seekS))}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${cls}`}
        >
          <Icon name={c.icon} size={11} />
          {c.label}
        </button>
      ))}
    </div>
  );
}
