/**
 * Notes export (Tier 1e): Markdown download and a print-ready page for "Save as PDF". Pure string
 * builders + two tiny DOM helpers, so the formatting is testable without a browser.
 */

import { formatClock } from './time';

export interface ExportNote {
  at_s: number;
  raw_text: string;
  summary: string | null;
  is_auto: boolean;
  is_bookmarked: boolean;
}

export interface ExportMeta {
  videoId: string;
  title: string;
  /** e.g. new Date() — injected so output is deterministic in tests */
  exportedAt: Date;
}

export function momentUrl(videoId: string, atS: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(Math.max(0, atS))}s`;
}

function mainText(n: ExportNote): string {
  return (n.summary && n.summary.trim()) || n.raw_text.trim();
}

/** Voice notes also keep what was said, when it differs from the note text. */
function spoken(n: ExportNote): string | null {
  const said = n.raw_text.trim();
  return n.is_auto && n.summary && n.summary.trim() && said && said !== n.summary.trim() ? said : null;
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');
const date = (d: Date) => d.toISOString().slice(0, 10);

export function notesToMarkdown(notes: ExportNote[], meta: ExportMeta): string {
  const sorted = [...notes].sort((a, b) => a.at_s - b.at_s);
  const lines = [
    `# ${oneLine(meta.title) || meta.videoId} — notes`,
    '',
    `Video: https://www.youtube.com/watch?v=${meta.videoId}  `,
    `Exported from StudyLoop on ${date(meta.exportedAt)} · ${sorted.length} note${sorted.length === 1 ? '' : 's'}`,
    '',
  ];
  for (const n of sorted) {
    const star = n.is_bookmarked ? ' ⭐' : '';
    lines.push(`- **[${formatClock(n.at_s)}](${momentUrl(meta.videoId, n.at_s)})**${star} ${mdEscape(oneLine(mainText(n)))}`);
    const said = spoken(n);
    if (said) lines.push(`  - _You said:_ “${mdEscape(oneLine(said))}”`);
  }
  if (!sorted.length) lines.push('_No notes yet._');
  return lines.join('\n') + '\n';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function notesToPrintHtml(notes: ExportNote[], meta: ExportMeta): string {
  const sorted = [...notes].sort((a, b) => a.at_s - b.at_s);
  const title = escapeHtml(oneLine(meta.title) || meta.videoId);
  const items = sorted
    .map((n) => {
      const said = spoken(n);
      return `<li${n.is_bookmarked ? ' class="star"' : ''}>
  <a class="t" href="${escapeHtml(momentUrl(meta.videoId, n.at_s))}">${formatClock(n.at_s)}</a>
  <div><p>${escapeHtml(mainText(n))}</p>${said ? `<p class="said">You said: “${escapeHtml(said)}”</p>` : ''}</div>
</li>`;
    })
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — notes</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font: 11pt/1.5 system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 17pt; margin: 0 0 4pt; }
  .meta { color: #555; font-size: 9.5pt; margin: 0 0 14pt; }
  .meta a { color: #555; }
  ol { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 10pt; padding: 7pt 0; border-top: 1px solid #ddd; break-inside: avoid; }
  li.star .t::after { content: " ★"; color: #b7791f; }
  .t { font: 600 10pt ui-monospace, Consolas, monospace; color: #3730a3; text-decoration: none; min-width: 52pt; }
  p { margin: 0; white-space: pre-wrap; }
  .said { color: #666; font-size: 9.5pt; margin-top: 2pt; }
</style></head>
<body>
<h1>${title}</h1>
<p class="meta"><a href="https://www.youtube.com/watch?v=${escapeHtml(meta.videoId)}">youtube.com/watch?v=${escapeHtml(meta.videoId)}</a> · exported from StudyLoop on ${date(meta.exportedAt)} · ${sorted.length} note${sorted.length === 1 ? '' : 's'}</p>
${sorted.length ? `<ol>\n${items}\n</ol>` : '<p>No notes yet.</p>'}
</body></html>`;
}

export function safeFilename(s: string): string {
  return (s.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'notes').toLowerCase();
}

/** Browser: save text as a file. */
export function downloadText(filename: string, text: string, type = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Browser: print a standalone HTML page from a hidden iframe (the dialog offers "Save as PDF"). */
export function printHtml(html: string): void {
  const frame = Object.assign(document.createElement('iframe'), { title: 'print' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  frame.contentWindow!.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    window.setTimeout(() => frame.isConnected && frame.remove(), 60_000); // afterprint is unreliable
  }, 50);
}
