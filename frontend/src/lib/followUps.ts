import type { Citation, Lang } from '@/hooks/useStudySocket';

/** What an answer needs for its follow-up chips (from answer.done). */
export interface FollowUpContext {
  kind: 'answer' | 'summary' | 'recap';
  /** the language the answer came in: the chips speak it too */
  language: Lang;
  citations: Citation[];
  /** a recap ("I'm lost"): where the part they lost starts */
  replayFromS?: number | null;
}

/** answer.done fields → chip context; null when the reply was a template / router line / cancelled (no chips). */
export function followUpContext(
  msg: {
    answer_kind?: string | null;
    language?: Lang;
    citations?: Citation[];
    replay_from_s?: number | null;
    cancelled?: boolean;
  },
  fallback: Lang
): FollowUpContext | null {
  const kind = msg.answer_kind;
  if (msg.cancelled || (kind !== 'answer' && kind !== 'summary' && kind !== 'recap')) return null;
  return { kind, language: msg.language ?? fallback, citations: msg.citations ?? [], replayFromS: msg.replay_from_s };
}
