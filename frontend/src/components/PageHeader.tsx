import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { UiLang } from '@/lib/uiLang';

/** Page title bar shared by the Tier 2 pages, with the EN / हिं switch (same setting as the study page). */
export default function PageHeader({
  icon,
  title,
  subtitle,
  lang,
  setLang,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  lang: UiLang;
  setLang: (l: UiLang) => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="px-4 sm:px-6 py-5 border-b border-border/80 bg-surface-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0">
          <Icon name={icon} size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
        <div className="flex rounded-full border border-border/80 overflow-hidden text-[11px] font-semibold" role="group" aria-label="Language">
          {(['en', 'hi'] as UiLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2.5 py-1 transition-colors ${lang === l ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {l === 'en' ? 'EN' : 'हिं'}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** Loading / empty / error block used by the Tier 2 pages. */
export function PageState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-3xl border border-border/60 p-8 sm:p-10 text-center max-w-xl mx-auto mt-6" role="status">
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-4">
        <Icon name={icon} size={22} />
      </div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {body && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
