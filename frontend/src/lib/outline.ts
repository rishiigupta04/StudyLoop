/**
 * Chapters + structured summary (Tier 2): pure view logic, no React.
 *
 * The outline covers the whole lecture (a shared cache). What's shown follows the no-spoiler rule (D7):
 * - chapter titles and markers are always visible: they're navigation, and seeking is exempt;
 * - a chapter's one-line blurb shows once the learner has reached that chapter;
 * - a summary section shows once the learner has watched it to the end.
 * With the spoiler guard off, everything shows.
 */
import type { Outline, OutlineChapter, OutlineDoc, OutlineSection } from '@/services/transcriptService';

export type Lang = 'en' | 'hi';

/** A little slack: the learner who stops 5 s before a section ends has effectively watched it. */
export const WATCHED_GRACE_S = 5;

/** The outline in the UI language, or the other one if that language failed to generate. */
export function pickOutline(outline: Outline | null | undefined, lang: Lang): { doc: OutlineDoc | null; fellBack: boolean } {
  if (!outline) return { doc: null, fellBack: false };
  const own = outline[lang];
  if (own && own.chapters.length) return { doc: own, fellBack: false };
  const other = outline[lang === 'en' ? 'hi' : 'en'];
  return other && other.chapters.length ? { doc: other, fellBack: true } : { doc: null, fellBack: false };
}

/** Index of the chapter playing at time t (-1 before the first). */
export function activeChapterIndex(chapters: OutlineChapter[], t: number): number {
  let idx = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].start_s <= t + 0.5) idx = i;
    else break;
  }
  return idx;
}

export function chapterReached(ch: OutlineChapter, watched: number, guard: boolean): boolean {
  return !guard || ch.start_s <= watched + WATCHED_GRACE_S;
}

export interface SectionView extends OutlineSection {
  end_s: number;
  revealed: boolean;
}

export interface PartView {
  title: string;
  start_s: number;
  end_s: number;
  sections: SectionView[];
  /** sections still locked by the spoiler guard */
  locked: number;
}

/** Parts with each section's end time and whether it's revealed yet. */
export function summaryView(doc: OutlineDoc, watched: number, guard: boolean): PartView[] {
  const flat = doc.parts.flatMap((p) => p.sections.map((s) => ({ s, partEnd: p.end_s })));
  let k = 0;
  return doc.parts.map((p) => {
    const sections = p.sections.map((s) => {
      const next = flat[k + 1];
      const end_s = next && next.s.start_s > s.start_s ? Math.min(next.s.start_s, p.end_s) : p.end_s;
      k += 1;
      return { ...s, end_s, revealed: !guard || end_s <= watched + WATCHED_GRACE_S };
    });
    return { title: p.title, start_s: p.start_s, end_s: p.end_s, sections, locked: sections.filter((s) => !s.revealed).length };
  });
}

/** Marker position on the progress bar, in percent (clamped). */
export function markerPercent(startS: number, duration: number): number {
  if (!(duration > 0)) return 0;
  return Math.max(0, Math.min(100, (startS / duration) * 100));
}
