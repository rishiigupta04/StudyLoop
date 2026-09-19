import { useEffect, useState } from 'react';

export type UiLang = 'en' | 'hi';

/** The UI language the learner picked on the study page (EN / हिं), shared through localStorage. */
export function readUiLang(): UiLang {
  try {
    return localStorage.getItem('studyloop.lang') === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function useUiLang(): [UiLang, (l: UiLang) => void] {
  const [lang, setLang] = useState<UiLang>(readUiLang);
  useEffect(() => {
    try {
      localStorage.setItem('studyloop.lang', lang);
    } catch {
      /* private mode */
    }
  }, [lang]);
  return [lang, setLang];
}

/** "3 min ago" / "3 मिनट पहले" style relative time. */
export function timeAgo(iso: string | null | undefined, lang: UiLang, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  const [n, unit] =
    s < 60 ? [0, 'now'] : s < 3600 ? [Math.floor(s / 60), 'm'] : s < 86400 ? [Math.floor(s / 3600), 'h'] : [Math.floor(s / 86400), 'd'];
  if (unit === 'now') return lang === 'hi' ? 'अभी' : 'just now';
  const words = { m: ['min', 'मिनट'], h: ['h', 'घंटे'], d: ['d', 'दिन'] }[unit as 'm' | 'h' | 'd'];
  return lang === 'hi' ? `${n} ${words[1]} पहले` : `${n}${unit === 'm' ? ' ' : ''}${words[0]} ago`;
}
