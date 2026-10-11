/**
 * One-tap revision sheet for a lecture: the big picture, the key points watched so far, the chapters, every
 * question asked (with its answer), the notes, and the moments worth rewatching, each linked back into the video.
 * A print-ready page ("Save as PDF"). Pure string building, like notesExport, so it stays testable.
 */

import type { OutlineDoc } from '@/services/transcriptService';
import { chapterReached, summaryView, type Lang } from './outline';
import { escapeHtml, momentUrl, type ExportNote } from './notesExport';
import { formatClock } from './time';

export interface RevisionQA {
  question: string;
  answer: string;
  /** where the learner was when they asked */
  at_s: number | null;
}

export interface RevisionInput {
  videoId: string;
  title: string;
  exportedAt: Date;
  language: Lang;
  /** the learner's high-water mark: key points and chapter blurbs past it stay hidden (no spoilers) */
  watchedS: number;
  durationS: number;
  spoilerGuard: boolean;
  outline: OutlineDoc | null;
  qa: RevisionQA[];
  notes: ExportNote[];
}

const T = {
  en: {
    sheet: 'Revision sheet',
    watched: (w: string, d: string) => `watched up to ${w}${d ? ` of ${d}` : ''}`,
    bigPicture: 'The big picture',
    keyPoints: 'Key points',
    locked: (n: number) => `${n} more section${n === 1 ? '' : 's'} unlock as you keep watching.`,
    chapters: 'Chapters',
    questions: 'Your questions',
    notes: 'Your notes',
    revisit: 'Revisit these moments',
    fromQuestion: 'From your question',
    bookmarked: 'Bookmarked note',
    empty: 'Nothing here yet.',
    footer: 'Made with StudyLoop. Timestamps open the lecture at that moment.',
  },
  hi: {
    sheet: 'Revision sheet',
    watched: (w: string, d: string) => `${w}${d ? ` / ${d}` : ''} तक देखा`,
    bigPicture: 'पूरी तस्वीर',
    keyPoints: 'मुख्य बातें',
    locked: (n: number) => `आगे देखने पर ${n} और हिस्से खुलेंगे।`,
    chapters: 'अध्याय',
    questions: 'आपके सवाल',
    notes: 'आपके notes',
    revisit: 'ये हिस्से दोबारा देखें',
    fromQuestion: 'आपके सवाल से',
    bookmarked: 'Bookmarked note',
    empty: 'अभी कुछ नहीं।',
    footer: 'StudyLoop से बनाया गया। समय पर click करके lecture वहीं से खुलेगा।',
  },
} as const;

const CITE = /[[【](\d{1,2}:\d{2}(?::\d{2})?)[\]】]/g;

function clockToS(clock: string): number {
  return clock.split(':').reduce((t, p) => t * 60 + Number(p), 0);
}

/** Answer text with its [12:30] citations as links into the video. */
function answerHtml(text: string, videoId: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const at = m.index ?? 0;
    out += escapeHtml(text.slice(last, at));
    out += `<a class="cite" href="${escapeHtml(momentUrl(videoId, clockToS(m[1])))}">${m[1]}</a>`;
    last = at + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

const link = (videoId: string, s: number) =>
  `<a class="t" href="${escapeHtml(momentUrl(videoId, s))}">${formatClock(s)}</a>`;

// a summary cites every part of the lecture: its citations aren't "moments you needed"
const SUMMARY_ASK = /summar|recap|saransh|सारांश|tl;?dr/i;
const MOMENTS_PER_ANSWER = 2;

/** Moments worth rewatching: what answers relied on (their first two citations; summaries skipped) + bookmarked
 *  notes, in lecture order, near-duplicates merged. */
export function revisitMoments(qa: RevisionQA[], notes: ExportNote[]): { at_s: number; why: 'question' | 'bookmark'; text: string }[] {
  const items: { at_s: number; why: 'question' | 'bookmark'; text: string }[] = [];
  for (const q of qa) {
    if (SUMMARY_ASK.test(q.question)) continue;
    for (const m of [...q.answer.matchAll(CITE)].slice(0, MOMENTS_PER_ANSWER))
      items.push({ at_s: clockToS(m[1]), why: 'question', text: q.question });
  }
  for (const n of notes) {
    if (n.is_bookmarked) items.push({ at_s: n.at_s, why: 'bookmark', text: (n.summary || n.raw_text).trim() });
  }
  items.sort((a, b) => a.at_s - b.at_s);
  return items.filter((it, i) => i === 0 || it.at_s - items[i - 1].at_s >= 20); // within 20 s = the same moment
}

export function revisionSheetHtml(input: RevisionInput): string {
  const L = T[input.language];
  const { videoId, outline: doc } = input;
  const title = escapeHtml(input.title.trim() || videoId);
  const section = (h: string, body: string) => `<section><h2>${h}</h2>${body}</section>`;
  const out: string[] = [];

  if (doc?.overview) out.push(section(L.bigPicture, `<p>${escapeHtml(doc.overview)}</p>`));

  if (doc) {
    const parts = summaryView(doc, input.watchedS, input.spoilerGuard);
    const shown = parts
      .map((p) => {
        const secs = p.sections.filter((s) => s.revealed);
        if (!secs.length) return '';
        const items = secs
          .map(
            (s) =>
              `<li>${link(videoId, s.start_s)} <b>${escapeHtml(s.title)}</b><ul>${s.bullets
                .map((b) => `<li>${escapeHtml(b)}</li>`)
                .join('')}</ul></li>`
          )
          .join('');
        return `<h3>${escapeHtml(p.title)}</h3><ul class="kp">${items}</ul>`;
      })
      .join('');
    const locked = parts.reduce((n, p) => n + p.locked, 0);
    if (shown || locked)
      out.push(section(L.keyPoints, (shown || `<p class="muted">${L.empty}</p>`) + (locked ? `<p class="muted">${L.locked(locked)}</p>` : '')));

    if (doc.chapters.length) {
      const rows = doc.chapters
        .map((ch) => {
          const blurb = ch.summary && chapterReached(ch, input.watchedS, input.spoilerGuard) ? `<div class="muted">${escapeHtml(ch.summary)}</div>` : '';
          return `<li>${link(videoId, ch.start_s)}<div><b>${escapeHtml(ch.title)}</b>${blurb}</div></li>`;
        })
        .join('');
      out.push(section(L.chapters, `<ol class="rows">${rows}</ol>`));
    }
  }

  const qaHtml = input.qa
    .map(
      (q) =>
        `<li>${q.at_s != null ? link(videoId, q.at_s) : '<span class="t"></span>'}<div><p class="q">${escapeHtml(q.question)}</p><p>${answerHtml(q.answer, videoId)}</p></div></li>`
    )
    .join('');
  out.push(section(L.questions, qaHtml ? `<ol class="rows">${qaHtml}</ol>` : `<p class="muted">${L.empty}</p>`));

  const notes = [...input.notes].sort((a, b) => a.at_s - b.at_s);
  const notesHtml = notes
    .map((n) => `<li${n.is_bookmarked ? ' class="star"' : ''}>${link(videoId, n.at_s)}<div><p>${escapeHtml((n.summary || n.raw_text).trim())}</p></div></li>`)
    .join('');
  out.push(section(L.notes, notesHtml ? `<ol class="rows">${notesHtml}</ol>` : `<p class="muted">${L.empty}</p>`));

  const moments = revisitMoments(input.qa, input.notes);
  if (moments.length) {
    const rows = moments
      .map((m) => `<li>${link(videoId, m.at_s)}<div><span class="muted">${m.why === 'question' ? L.fromQuestion : L.bookmarked}:</span> ${escapeHtml(m.text)}</div></li>`)
      .join('');
    out.push(section(L.revisit, `<ol class="rows">${rows}</ol>`));
  }

  const watched = L.watched(formatClock(input.watchedS), input.durationS > 0 ? formatClock(input.durationS) : '');
  return `<!doctype html>
<html lang="${input.language}"><head><meta charset="utf-8"><title>${title} — ${L.sheet}</title>
<style>
  @page { margin: 16mm 15mm; }
  body { font: 10.5pt/1.5 system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 3pt; }
  h2 { font-size: 12.5pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 2px solid #4338ca; color: #312e81; }
  h3 { font-size: 10.5pt; margin: 8pt 0 3pt; }
  section { break-inside: auto; }
  .meta, .muted { color: #555; font-size: 9.5pt; }
  .meta a { color: #555; }
  p { margin: 0 0 4pt; }
  ul.kp { margin: 0 0 6pt; padding-left: 0; list-style: none; }
  ul.kp > li { margin: 4pt 0; break-inside: avoid; }
  ul.kp ul { margin: 2pt 0 0 58pt; padding-left: 12pt; }
  ol.rows { list-style: none; padding: 0; margin: 0; }
  ol.rows > li { display: flex; gap: 10pt; padding: 6pt 0; border-top: 1px solid #e3e3e3; break-inside: avoid; }
  li.star .t::after { content: " ★"; color: #b7791f; }
  .t { font: 600 9.5pt ui-monospace, Consolas, monospace; color: #3730a3; text-decoration: none; min-width: 48pt; display: inline-block; }
  .cite { font: 600 8.5pt ui-monospace, Consolas, monospace; color: #3730a3; text-decoration: none; background: #eef2ff; border-radius: 3px; padding: 0 2px; }
  .q { font-weight: 600; }
  footer { margin-top: 18pt; color: #777; font-size: 8.5pt; }
</style></head>
<body>
<h1>${title}</h1>
<p class="meta">${L.sheet} · <a href="https://www.youtube.com/watch?v=${escapeHtml(videoId)}">youtube.com/watch?v=${escapeHtml(videoId)}</a> · ${watched} · ${input.exportedAt.toISOString().slice(0, 10)}</p>
${out.join('\n')}
<footer>${L.footer}</footer>
</body></html>`;
}
