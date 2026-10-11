import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/ui/AppIcon';
import { initials, useAuth } from '@/context/AuthContext';
import { useUiLang, type UiLang } from '@/lib/uiLang';
import { getSttProvider, setSttProvider, type SttProvider } from '@/services/speechService';

type Text = { en: string; hi: string };

const T = {
  title: { en: 'Settings', hi: 'सेटिंग्स' },
  subtitle: { en: 'Your account, and how StudyLoop listens and speaks.', hi: 'आपका अकाउंट, और StudyLoop कैसे सुनता और बोलता है।' },
  account: { en: 'Account', hi: 'अकाउंट' },
  accountNote: {
    en: 'Your name and email come from your sign-in and cannot be changed here.',
    hi: 'आपका नाम और ईमेल साइन-इन से आते हैं, यहाँ बदले नहीं जा सकते।',
  },
  name: { en: 'Name', hi: 'नाम' },
  email: { en: 'Email', hi: 'ईमेल' },
  language: { en: 'Language', hi: 'भाषा' },
  languageNote: {
    en: 'The language of the interface and of the answers and summaries StudyLoop writes. The EN / हिं switch on the study page changes the same setting.',
    hi: 'इंटरफ़ेस की भाषा, और StudyLoop जो जवाब और सारांश लिखता है उसकी भाषा। Study page का EN / हिं switch यही setting बदलता है।',
  },
  stt: { en: 'Speech-to-text', hi: 'स्पीच-टू-टेक्स्ट' },
  sttNote: {
    en: 'Which service turns your push-to-talk voice into text. If the chosen one fails, the other takes over. Saved in this browser. Push-to-talk: hold ~ on the study page.',
    hi: 'आपकी push-to-talk आवाज़ को टेक्स्ट में कौन बदलता है। चुना हुआ fail हो जाए तो दूसरा संभाल लेता है। इस ब्राउज़र में सहेजा जाता है। Push-to-talk: study page पर ~ दबाकर रखें।',
  },
  sarvamDesc: { en: 'Built for Hindi, English and Hinglish. Uses Sarvam credit.', hi: 'हिंदी, अंग्रेज़ी और Hinglish के लिए बना। Sarvam क्रेडिट लगता है।' },
  groqDesc: { en: 'Whisper on Groq. Free.', hi: 'Groq पर Whisper। मुफ़्त।' },
  sttSarvam: { en: 'Speech-to-text: Sarvam', hi: 'Speech-to-text: Sarvam' },
  sttGroq: { en: 'Speech-to-text: Groq Whisper', hi: 'Speech-to-text: Groq Whisper' },
  signOut: { en: 'Sign out', hi: 'साइन आउट' },
  signOutNote: {
    en: 'You will need to sign in again to use StudyLoop.',
    hi: 'StudyLoop इस्तेमाल करने के लिए दोबारा साइन इन करना होगा।',
  },
  signedOut: { en: 'Signed out', hi: 'साइन आउट हो गए' },
  signOutFailed: { en: 'Could not sign out. Try again.', hi: 'साइन आउट नहीं हो पाया। फिर कोशिश करें।' },
} satisfies Record<string, Text>;

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-card border border-border/80 p-5 sm:p-6">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {note && <p className="text-xs text-muted-foreground leading-relaxed mt-1 mb-4">{note}</p>}
      {!note && <div className="mb-4" />}
      {children}
    </section>
  );
}

/** Radio-style option cards: one persisted choice, always visible, large enough to tap. */
function Choice<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { id: V; title: string; desc?: string }[];
  onChange: (id: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.id)}
            className={`text-left rounded-xl border p-4 transition-colors ${
              selected
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-border/80 bg-surface-elevated/40 hover:border-indigo-500/40'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-foreground">{o.title}</span>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  selected ? 'border-indigo-400 bg-indigo-500' : 'border-border'
                }`}
                aria-hidden="true"
              >
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
            </span>
            {o.desc && <span className="block text-xs text-muted-foreground leading-relaxed mt-1">{o.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [lang, setLang] = useUiLang();
  const [stt, setStt] = useState<SttProvider>(getSttProvider);
  const [signingOut, setSigningOut] = useState(false);
  const t = (text: Text) => text[lang];

  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email?.split('@')[0] || '';

  const chooseStt = (id: SttProvider) => {
    if (id === stt) return;
    setSttProvider(id);
    setStt(id);
    toast.success(t(id === 'sarvam' ? T.sttSarvam : T.sttGroq));
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success(t(T.signedOut));
      navigate('/', { replace: true });
    } catch {
      toast.error(t(T.signOutFailed));
      setSigningOut(false);
    }
  };

  return (
    <AppLayout activeRoute="/settings">
      <div className="flex-1 flex flex-col bg-obsidian">
        <PageHeader icon="Cog6ToothIcon" title={t(T.title)} subtitle={t(T.subtitle)} lang={lang} setLang={setLang} />

        <div className="flex-1 p-4 sm:p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            <Card title={t(T.account)} note={t(T.accountNote)}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-lg font-extrabold flex-shrink-0">
                  {initials(user)}
                </div>
                <dl className="min-w-0 space-y-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(T.name)}</dt>
                    <dd className="text-sm font-bold text-foreground truncate">{displayName || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(T.email)}</dt>
                    <dd className="text-sm text-foreground truncate">{user?.email ?? '-'}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card title={t(T.language)} note={t(T.languageNote)}>
              <Choice<UiLang>
                label={t(T.language)}
                value={lang}
                onChange={setLang}
                options={[
                  { id: 'en', title: 'English' },
                  { id: 'hi', title: 'हिन्दी' },
                ]}
              />
            </Card>

            <Card title={t(T.stt)} note={t(T.sttNote)}>
              <Choice<SttProvider>
                label={t(T.stt)}
                value={stt}
                onChange={chooseStt}
                options={[
                  { id: 'sarvam', title: 'Sarvam', desc: t(T.sarvamDesc) },
                  { id: 'groq', title: 'Groq', desc: t(T.groqDesc) },
                ]}
              />
            </Card>

            <Card title={t(T.signOut)} note={t(T.signOutNote)}>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full sm:w-auto px-5 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm font-bold text-red-300 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Icon name="ArrowRightOnRectangleIcon" size={18} />
                {t(T.signOut)}
              </button>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
