import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/AppIcon';
import { formatClock } from '@/lib/time';
import { timeAgo, type UiLang } from '@/lib/uiLang';
import { resumeTarget, studyUrl, type LibraryVideo } from '@/services/libraryService';

const T = {
  untitled: { en: 'Untitled video', hi: 'बिना नाम का वीडियो' },
  resume: { en: 'Resume at', hi: 'यहाँ से देखें:' },
  start: { en: 'Start', hi: 'शुरू करें' },
  completed: { en: 'Completed', hi: 'पूरा देखा' },
  inProgress: { en: 'In progress', hi: 'जारी है' },
  notStarted: { en: 'Not started', hi: 'शुरू नहीं किया' },
  transcript: { en: 'Transcript', hi: 'Transcript' },
  noTranscript: { en: 'Playback only', hi: 'सिर्फ़ playback' },
  preparing: { en: 'Preparing…', hi: 'तैयार हो रहा है…' },
  chapters: { en: (n: number) => `${n} chapters`, hi: (n: number) => `${n} अध्याय` },
  notes: { en: (n: number) => `${n} note${n === 1 ? '' : 's'}`, hi: (n: number) => `${n} नोट्स` },
  remove: { en: 'Remove from library', hi: 'Library से हटाएँ' },
} as const;

export default function VideoCard({
  video,
  lang,
  onRemove,
  compact = false,
}: {
  video: LibraryVideo;
  lang: UiLang;
  onRemove?: (v: LibraryVideo) => void;
  compact?: boolean;
}) {
  const at = resumeTarget(video, video.duration_s ?? 0);
  const pct = Math.round((video.progress ?? 0) * 100);
  const statusLabel =
    video.status === 'completed' ? T.completed[lang] : video.status === 'in-progress' ? T.inProgress[lang] : T.notStarted[lang];
  const transcriptChip =
    video.ingest_status === 'ready'
      ? { dot: 'bg-emerald-400', label: T.transcript[lang] }
      : video.ingest_status === 'failed' || video.ingest_status === 'unavailable'
        ? { dot: 'bg-slate-400', label: T.noTranscript[lang] }
        : { dot: 'bg-amber-400 animate-pulse', label: T.preparing[lang] };
  const overview = video.overview?.[lang] || video.overview?.en || video.overview?.hi;

  return (
    <div className="group glass-card rounded-2xl border border-border/70 hover:border-indigo-500/40 transition-colors overflow-hidden flex flex-col">
      <Link to={studyUrl(video.video_id, at)} className="relative block aspect-video bg-black/40 overflow-hidden">
        <img
          src={video.thumbnail_url}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all"
        />
        {video.duration_s ? (
          <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">
            {formatClock(video.duration_s)}
          </span>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
      </Link>
      <div className="p-3.5 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={studyUrl(video.video_id, at)}
            className="text-sm font-bold text-foreground leading-snug line-clamp-2 hover:text-indigo-300"
            title={video.title || video.video_id}
          >
            {video.title || T.untitled[lang]}
          </Link>
          {onRemove && (
            <button
              onClick={() => onRemove(video)}
              className="p-1 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-60 group-hover:opacity-100 flex-shrink-0"
              title={T.remove[lang]}
              aria-label={T.remove[lang]}
            >
              <Icon name="TrashIcon" size={14} />
            </button>
          )}
        </div>
        {video.channel && !compact && <p className="text-[11px] text-muted-foreground -mt-1">{video.channel}</p>}
        {overview && !compact && <p className="text-xs text-foreground/75 leading-relaxed line-clamp-2">{overview}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold mt-auto pt-1">
          <span className="px-2 py-0.5 rounded-full bg-surface-elevated text-muted-foreground flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${transcriptChip.dot}`} />
            {transcriptChip.label}
          </span>
          {video.chapters > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300">{T.chapters[lang](video.chapters)}</span>
          )}
          {video.notes > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">{T.notes[lang](video.notes)}</span>
          )}
          <span className={`px-2 py-0.5 rounded-full ${video.status === 'completed' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-surface-elevated text-muted-foreground'}`}>
            {statusLabel}
            {video.progress != null && video.status !== 'completed' ? ` · ${pct}%` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{timeAgo(video.last_studied_at, lang)}</span>
          <Link to={studyUrl(video.video_id, at)} className="font-bold text-indigo-300 hover:text-cyan-300 flex items-center gap-1">
            <Icon name="PlayIcon" size={12} />
            {at != null ? `${T.resume[lang]} ${formatClock(at)}` : T.start[lang]}
          </Link>
        </div>
      </div>
    </div>
  );
}
