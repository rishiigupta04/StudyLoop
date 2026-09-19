import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader, { PageState } from '@/components/PageHeader';
import VideoCard from '@/components/VideoCard';
import Icon from '@/components/ui/AppIcon';
import { useUiLang } from '@/lib/uiLang';
import { ApiError } from '@/services/apiClient';
import { fetchLibrary, removeFromLibrary, studyUrl, type LibraryVideo } from '@/services/libraryService';
import { extractYouTubeId } from '@/services/transcriptService';

type Filter = 'all' | 'in-progress' | 'completed';

const T = {
  title: { en: 'Library', hi: 'Library' },
  subtitle: {
    en: 'Every lecture you have studied, with your progress, chapters and notes.',
    hi: 'आपके पढ़े हुए सारे लेक्चर, आपकी progress, अध्याय और नोट्स के साथ।',
  },
  add: { en: 'Paste a YouTube link…', hi: 'YouTube लिंक पेस्ट करें…' },
  study: { en: 'Study', hi: 'पढ़ें' },
  badLink: { en: "That doesn't look like a YouTube link.", hi: 'यह YouTube लिंक नहीं लग रहा।' },
  search: { en: 'Search your library', hi: 'Library में खोजें' },
  all: { en: 'All', hi: 'सभी' },
  inProgress: { en: 'In progress', hi: 'जारी' },
  completed: { en: 'Completed', hi: 'पूरे' },
  loading: { en: 'Loading your library…', hi: 'आपकी library लोड हो रही है…' },
  emptyTitle: { en: 'Your library is empty', hi: 'आपकी library खाली है' },
  emptyBody: {
    en: 'Paste a YouTube lecture link above. Every video you study lands here, and you can resume it where you left off.',
    hi: 'ऊपर YouTube लेक्चर का लिंक पेस्ट करें। जो भी वीडियो आप पढ़ेंगे वो यहाँ आएगा, और आप वहीं से आगे देख पाएँगे।',
  },
  noMatch: { en: 'No videos match.', hi: 'कोई वीडियो नहीं मिला।' },
  errTitle: { en: "Couldn't load your library", hi: 'Library लोड नहीं हो पाई' },
  errAuth: { en: 'Sign in again to see your library.', hi: 'Library देखने के लिए फिर से sign in करें।' },
  errOffline: { en: 'The server may be waking up — try again in a moment.', hi: 'Server शायद जाग रहा है — थोड़ी देर में फिर कोशिश करें।' },
  retry: { en: 'Try again', hi: 'फिर से कोशिश करें' },
  removed: { en: 'Removed from your library (your notes are kept)', hi: 'Library से हटाया (आपके नोट्स रहेंगे)' },
  removeFailed: { en: "Couldn't remove it — try again.", hi: 'हटा नहीं पाए — फिर कोशिश करें।' },
  confirmRemove: {
    en: 'Remove this video from your library? Your notes stay.',
    hi: 'यह वीडियो library से हटाएँ? आपके नोट्स रहेंगे।',
  },
  count: { en: (n: number) => `${n} video${n === 1 ? '' : 's'}`, hi: (n: number) => `${n} वीडियो` },
} as const;

export default function LibraryPage() {
  const [lang, setLang] = useUiLang();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<LibraryVideo[] | null>(null);
  const [error, setError] = useState<'auth' | 'offline' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setVideos(await fetchLibrary());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'auth' : 'offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (videos ?? []).filter(
      (v) =>
        (filter === 'all' || v.status === filter) &&
        (!q || `${v.title ?? ''} ${v.channel ?? ''} ${v.overview?.en ?? ''} ${v.overview?.hi ?? ''}`.toLowerCase().includes(q))
    );
  }, [videos, filter, query]);

  const study = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(link);
    if (!id) {
      toast.error(T.badLink[lang]);
      return;
    }
    navigate(studyUrl(id));
  };

  const remove = async (v: LibraryVideo) => {
    if (!window.confirm(T.confirmRemove[lang])) return;
    const before = videos;
    setVideos((cur) => (cur ?? []).filter((x) => x.video_id !== v.video_id));
    try {
      await removeFromLibrary(v.video_id);
      toast.success(T.removed[lang]);
    } catch {
      setVideos(before);
      toast.error(T.removeFailed[lang]);
    }
  };

  return (
    <AppLayout activeRoute="/library">
      <div className="flex-1 flex flex-col min-h-screen bg-obsidian">
        <PageHeader
          icon="BookOpenIcon"
          title={T.title[lang]}
          subtitle={videos ? `${T.count[lang](videos.length)} · ${T.subtitle[lang]}` : T.subtitle[lang]}
          lang={lang}
          setLang={setLang}
        />

        <div className="px-4 sm:px-6 py-5 space-y-5 max-w-screen-2xl w-full">
          <form onSubmit={study} className="flex gap-2 max-w-2xl">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={T.add[lang]}
              className="flex-1 min-w-0 input-field rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/60"
              aria-label={T.add[lang]}
            />
            <button type="submit" className="btn-primary px-4 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-1.5">
              <Icon name="PlayIcon" size={16} />
              {T.study[lang]}
            </button>
          </form>

          {videos && videos.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-1 bg-surface-card border border-border/80 rounded-xl p-1 self-start" role="tablist">
                {(['all', 'in-progress', 'completed'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === f ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {f === 'all' ? T.all[lang] : f === 'completed' ? T.completed[lang] : T.inProgress[lang]}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={T.search[lang]}
                  aria-label={T.search[lang]}
                  className="w-full input-field rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/60"
                />
              </div>
            </div>
          )}

          {error ? (
            <PageState
              icon="ExclamationTriangleIcon"
              title={T.errTitle[lang]}
              body={error === 'auth' ? T.errAuth[lang] : T.errOffline[lang]}
              action={
                <button onClick={() => void load()} className="btn-primary px-4 py-2 rounded-xl text-sm font-bold text-white">
                  {T.retry[lang]}
                </button>
              }
            />
          ) : videos === null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4" aria-busy="true" aria-label={T.loading[lang]}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-72 rounded-2xl bg-surface-card/70 animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <PageState icon="BookOpenIcon" title={T.emptyTitle[lang]} body={T.emptyBody[lang]} />
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{T.noMatch[lang]}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {shown.map((v) => (
                <VideoCard key={v.video_id} video={v} lang={lang} onRemove={(x) => void remove(x)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
