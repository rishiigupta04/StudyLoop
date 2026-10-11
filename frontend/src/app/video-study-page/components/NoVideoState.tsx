import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/AppIcon';
import { readUiLang } from '@/lib/uiLang';
import { studyUrl } from '@/services/libraryService';
import { extractYouTubeId } from '@/services/transcriptService';

const T = {
  missingTitle: { en: 'Pick a lecture to study', hi: 'पढ़ने के लिए लेक्चर चुनें' },
  missingBody: {
    en: 'No video is selected. Paste a YouTube lecture link below, or open one from your library.',
    hi: 'कोई वीडियो चुना नहीं गया है। नीचे YouTube लेक्चर का लिंक पेस्ट करें, या library से खोलें।',
  },
  invalidTitle: { en: "That isn't a YouTube video link", hi: 'यह YouTube वीडियो का लिंक नहीं है' },
  invalidBody: {
    en: "The link in the address bar doesn't contain a valid YouTube video. Paste a youtube.com or youtu.be link below.",
    hi: 'Address bar के लिंक में सही YouTube वीडियो नहीं है। नीचे youtube.com या youtu.be का लिंक पेस्ट करें।',
  },
  placeholder: { en: 'Paste a YouTube video URL…', hi: 'YouTube वीडियो का URL पेस्ट करें…' },
  open: { en: 'Open', hi: 'खोलें' },
  fieldError: { en: "That doesn't look like a YouTube link", hi: 'यह YouTube लिंक नहीं लग रहा' },
  library: { en: 'Open my library', hi: 'मेरी library खोलें' },
} as const;

/**
 * The study page without a playable video: `?v=` is missing, or present but not a YouTube id. Says so,
 * instead of silently opening some other lecture, and lets the learner paste a link or go to the library.
 */
export default function NoVideoState({ invalidValue }: { invalidValue?: string }) {
  const navigate = useNavigate();
  const lang = readUiLang();
  const [url, setUrl] = useState('');
  const [fieldError, setFieldError] = useState(false);
  const invalid = Boolean(invalidValue);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(url);
    if (!id) {
      setFieldError(true);
      return;
    }
    navigate(studyUrl(id));
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 bg-obsidian">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-surface-card/60 p-6 sm:p-8 text-center space-y-5">
        <div
          className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center ${
            invalid ? 'bg-amber-500/15 border border-amber-500/40' : 'bg-indigo-600/20 border border-indigo-500/40'
          }`}
        >
          <Icon
            name={invalid ? 'ExclamationTriangleIcon' : 'PlayCircleIcon'}
            size={24}
            className={invalid ? 'text-amber-300' : 'text-indigo-300'}
          />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-foreground">{invalid ? T.invalidTitle[lang] : T.missingTitle[lang]}</h1>
          <p className="text-sm text-muted-foreground">{invalid ? T.invalidBody[lang] : T.missingBody[lang]}</p>
          {invalid && (
            <p className="text-xs text-muted-foreground/80 break-all font-mono" aria-label="The link that was given">
              {(invalidValue as string).slice(0, 120)}
            </p>
          )}
        </div>
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2" noValidate>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFieldError(false);
            }}
            placeholder={T.placeholder[lang]}
            aria-label={T.placeholder[lang]}
            aria-invalid={fieldError}
            className="input-field flex-1 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button type="submit" className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold text-white">
            {T.open[lang]}
          </button>
        </form>
        {fieldError && (
          <p className="text-xs text-amber-300" role="alert">
            {T.fieldError[lang]}
          </p>
        )}
        <Link to="/library" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300 hover:text-cyan-300">
          <Icon name="BookOpenIcon" size={16} />
          {T.library[lang]}
        </Link>
      </div>
    </div>
  );
}
