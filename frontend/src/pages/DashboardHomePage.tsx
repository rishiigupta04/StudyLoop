import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { PageState } from '@/components/PageHeader';
import VideoCard from '@/components/VideoCard';
import Icon from '@/components/ui/AppIcon';
import DashboardHero from '@/app/dashboard-home/components/DashboardHero';
import StudyTimeChart from '@/app/dashboard-home/components/StudyTimeChart';
import AIQuizWidget from '@/app/dashboard-home/components/AIQuizWidget';
import { DEMO_PREVIEW } from '@/lib/features';
import { formatClock } from '@/lib/time';
import { timeAgo, useUiLang } from '@/lib/uiLang';
import { ApiError } from '@/services/apiClient';
import { fetchDashboard, studyUrl, type Dashboard } from '@/services/libraryService';
import { noteText } from '@/services/notesService';

const T = {
  videos: { en: 'Lectures', hi: 'लेक्चर' },
  completed: { en: 'Completed', hi: 'पूरे देखे' },
  hours: { en: 'Hours watched', hi: 'घंटे देखे' },
  notes: { en: 'Notes', hi: 'नोट्स' },
  sessions: { en: 'Sessions this week', hi: 'इस हफ़्ते sessions' },
  continue: { en: 'Continue studying', hi: 'जारी रखें' },
  viewAll: { en: 'View library', hi: 'पूरी library' },
  recentNotes: { en: 'Recent notes', hi: 'हाल के नोट्स' },
  allNotes: { en: 'All notes', hi: 'सभी नोट्स' },
  noNotes: {
    en: 'No notes yet. While studying, hold ~ and say "note this down".',
    hi: 'अभी कोई नोट नहीं। पढ़ते समय ~ दबाकर "ye note kar lo" बोलें।',
  },
  emptyTitle: { en: 'Start with your first lecture', hi: 'अपने पहले लेक्चर से शुरू करें' },
  emptyBody: {
    en: 'Paste a YouTube link above, or try the demo lecture. Your progress, notes and questions show up here.',
    hi: 'ऊपर YouTube लिंक पेस्ट करें या demo लेक्चर आज़माएँ। आपकी progress, नोट्स और सवाल यहाँ दिखेंगे।',
  },
  errTitle: { en: "Couldn't load your dashboard", hi: 'Dashboard लोड नहीं हो पाया' },
  errAuth: { en: 'Sign in again to see your progress.', hi: 'Progress देखने के लिए फिर से sign in करें।' },
  errOffline: { en: 'The server may be waking up — try again in a moment.', hi: 'Server शायद जाग रहा है — थोड़ी देर में फिर कोशिश करें।' },
  retry: { en: 'Try again', hi: 'फिर से कोशिश करें' },
} as const;

export default function DashboardHomePage() {
  const [lang, setLang] = useUiLang();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<'auth' | 'offline' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchDashboard());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'auth' : 'offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = data
    ? [
        { icon: 'BookOpenIcon', label: T.videos[lang], value: String(data.stats.videos) },
        { icon: 'CheckBadgeIcon', label: T.completed[lang], value: String(data.stats.completed) },
        { icon: 'ClockIcon', label: T.hours[lang], value: data.stats.hours_watched.toFixed(1) },
        { icon: 'DocumentTextIcon', label: T.notes[lang], value: String(data.stats.notes) },
        { icon: 'MicrophoneIcon', label: T.sessions[lang], value: String(data.stats.sessions_7d) },
      ]
    : [];

  return (
    <AppLayout activeRoute="/dashboard-home">
      <div className="min-h-screen bg-obsidian px-4 sm:px-6 py-8 xl:px-10 2xl:px-16 max-w-screen-2xl w-full">
        <div className="flex justify-end mb-3">
          <div className="flex rounded-full border border-border/80 overflow-hidden text-[11px] font-semibold" role="group" aria-label="Language">
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`px-2.5 py-1 ${lang === l ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>
        </div>
        <DashboardHero lang={lang} />

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
        ) : !data ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-surface-card/70 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="glass-card rounded-2xl border border-border/70 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
                    <Icon name={s.icon} size={15} className="text-indigo-400" />
                    {s.label}
                  </div>
                  <p className="text-2xl font-black text-foreground tabular-nums mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {data.stats.videos === 0 ? (
              <PageState icon="SparklesIcon" title={T.emptyTitle[lang]} body={T.emptyBody[lang]} />
            ) : (
              <div className="mt-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-8">
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-bold text-foreground">{T.continue[lang]}</h2>
                      <Link to="/library" className="text-xs font-bold text-indigo-300 hover:text-cyan-300">
                        {T.viewAll[lang]} →
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data.recent.map((v) => (
                        <VideoCard key={v.video_id} video={v} lang={lang} compact />
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-bold text-foreground">{T.recentNotes[lang]}</h2>
                      <Link to="/notes" className="text-xs font-bold text-indigo-300 hover:text-cyan-300">
                        {T.allNotes[lang]} →
                      </Link>
                    </div>
                    {data.notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{T.noNotes[lang]}</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.notes.map((n) => (
                          <li key={n.id} className="glass-card rounded-2xl border border-border/60 p-3.5 flex gap-3">
                            <Link
                              to={studyUrl(n.video_id, n.at_s)}
                              className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-surface-elevated text-indigo-300 border border-indigo-500/20 hover:text-cyan-300 h-fit tabular-nums"
                            >
                              {formatClock(n.at_s)}
                            </Link>
                            <div className="min-w-0">
                              <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2">{noteText(n)}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {n.video_title || n.video_id} · {timeAgo(n.created_at, lang)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <div className="xl:col-span-1 flex flex-col gap-8">
                  <StudyTimeChart days={data.days} lang={lang} />
                  {DEMO_PREVIEW && <AIQuizWidget />}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
