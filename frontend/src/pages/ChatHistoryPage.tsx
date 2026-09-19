import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import PageHeader, { PageState } from '@/components/PageHeader';
import Icon from '@/components/ui/AppIcon';
import AnswerText from '@/app/video-study-page/components/AnswerText';
import { formatClock, parseClock } from '@/lib/time';
import { timeAgo, useUiLang } from '@/lib/uiLang';
import { ApiError } from '@/services/apiClient';
import { fetchChats, isConversation, studyUrl, type ChatSession } from '@/services/libraryService';

const T = {
  title: { en: 'Chat history', hi: 'Chat history' },
  subtitle: {
    en: 'What you asked each lecture, by voice or typed, with the answers and their timestamps.',
    hi: 'हर लेक्चर से आपने जो पूछा (voice या typed), जवाब और timestamps के साथ।',
  },
  search: { en: 'Search questions and answers', hi: 'सवाल-जवाब खोजें' },
  commands: { en: 'Show player commands', hi: 'Player commands भी दिखाएँ' },
  loading: { en: 'Loading your conversations…', hi: 'आपकी बातचीत लोड हो रही है…' },
  emptyTitle: { en: 'No conversations yet', hi: 'अभी कोई बातचीत नहीं' },
  emptyBody: {
    en: 'Open a lecture, hold ~ and ask something like "what is a peak?" or "ab tak kya hua?". Your questions and answers are kept here.',
    hi: 'कोई लेक्चर खोलें, ~ दबाकर पूछें जैसे "peak kya hai?" या "ab tak kya hua?"। आपके सवाल-जवाब यहाँ रहेंगे।',
  },
  noMatch: { en: 'Nothing matches.', hi: 'कुछ नहीं मिला।' },
  errTitle: { en: "Couldn't load your chat history", hi: 'Chat history लोड नहीं हो पाई' },
  errAuth: { en: 'Sign in again to see your history.', hi: 'History देखने के लिए फिर से sign in करें।' },
  errOffline: { en: 'The server may be waking up — try again in a moment.', hi: 'Server शायद जाग रहा है — थोड़ी देर में फिर कोशिश करें।' },
  retry: { en: 'Try again', hi: 'फिर से कोशिश करें' },
  turns: { en: (n: number) => `${n} question${n === 1 ? '' : 's'}`, hi: (n: number) => `${n} सवाल` },
  at: { en: 'at', hi: 'पर' },
  open: { en: 'Open lecture', hi: 'लेक्चर खोलें' },
  note: {
    en: 'Kept per viewing session: the last 30 turns of each.',
    hi: 'हर viewing session के आख़िरी 30 सवाल-जवाब रखे जाते हैं।',
  },
} as const;

export default function ChatHistoryPage() {
  const [lang, setLang] = useUiLang();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  const [error, setError] = useState<'auth' | 'offline' | null>(null);
  const [query, setQuery] = useState('');
  const [showCommands, setShowCommands] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await fetchChats(50));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'auth' : 'offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sessions ?? [])
      .map((s) => ({
        ...s,
        turns: s.turns.filter(
          (t) => (showCommands || isConversation(t)) && (!q || `${t.question} ${t.answer} ${s.video_title ?? ''}`.toLowerCase().includes(q))
        ),
      }))
      .filter((s) => s.turns.length > 0);
  }, [sessions, query, showCommands]);

  return (
    <AppLayout activeRoute="/chat-history">
      <div className="flex-1 flex flex-col min-h-screen bg-obsidian">
        <PageHeader icon="ChatBubbleLeftRightIcon" title={T.title[lang]} subtitle={T.subtitle[lang]} lang={lang} setLang={setLang} />

        <div className="px-4 sm:px-6 py-5 space-y-5 max-w-4xl w-full">
          {sessions && sessions.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={T.search[lang]}
                  aria-label={T.search[lang]}
                  className="w-full input-field rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/60"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showCommands} onChange={(e) => setShowCommands(e.target.checked)} className="accent-indigo-500" />
                {T.commands[lang]}
              </label>
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
          ) : sessions === null ? (
            <div className="space-y-3" aria-busy="true" aria-label={T.loading[lang]}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-surface-card/70 animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 || (shown.length === 0 && !query && !showCommands) ? (
            <PageState icon="ChatBubbleLeftRightIcon" title={T.emptyTitle[lang]} body={T.emptyBody[lang]} />
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{T.noMatch[lang]}</p>
          ) : (
            <>
              {shown.map((s) => (
                <section key={s.session_id} className="glass-card rounded-2xl border border-border/70 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-surface-card/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={`https://i.ytimg.com/vi/${s.video_id}/mqdefault.jpg`} alt="" className="w-16 aspect-video rounded-md object-cover flex-shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-foreground truncate">{s.video_title || s.video_id}</h2>
                        <p className="text-[11px] text-muted-foreground">
                          {timeAgo(s.started_at, lang)} · {T.turns[lang](s.turns.length)}
                          {s.language ? ` · ${s.language === 'hi' ? 'हिं' : 'EN'}` : ''}
                        </p>
                      </div>
                    </div>
                    <Link to={studyUrl(s.video_id)} className="text-xs font-bold text-indigo-300 hover:text-cyan-300 flex-shrink-0 flex items-center gap-1">
                      <Icon name="PlayIcon" size={12} />
                      {T.open[lang]}
                    </Link>
                  </div>
                  <ol className="divide-y divide-border/50">
                    {s.turns.map((t, i) => (
                      <li key={`${s.session_id}-${i}`} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{t.question}</p>
                          {t.at_s != null && (
                            <Link
                              to={studyUrl(s.video_id, t.at_s)}
                              className="text-[11px] font-mono font-bold text-indigo-400 hover:text-cyan-300 flex-shrink-0 tabular-nums"
                              title={`${T.at[lang]} ${formatClock(t.at_s)}`}
                            >
                              @{formatClock(t.at_s)}
                            </Link>
                          )}
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          <AnswerText
                            text={t.answer}
                            onSeek={(ts) => {
                              const secs = parseClock(ts);
                              if (!Number.isNaN(secs)) navigate(studyUrl(s.video_id, secs));
                            }}
                          />
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              <p className="text-[11px] text-muted-foreground text-center">{T.note[lang]}</p>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
