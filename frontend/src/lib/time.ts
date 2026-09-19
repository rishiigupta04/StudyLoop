/** "1:02:03" | "12:30" | "45" → seconds (NaN if unparseable). */
export function parseClock(ts: string): number {
  const parts = ts.trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatClock(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
