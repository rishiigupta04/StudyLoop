import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { UiLang } from '@/lib/uiLang';

const T = {
  title: { en: 'Study time', hi: 'पढ़ाई का समय' },
  sub: { en: 'Last 7 days (voice sessions)', hi: 'पिछले 7 दिन (voice sessions)' },
  today: { en: 'Today', hi: 'आज' },
} as const;

function fmt(mins: number): string {
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-modal">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-sm font-bold text-primary">{fmt(payload[0].value)}</p>
    </div>
  );
}

/** Minutes per day from `study_sessions` (a session counts from hello to disconnect). */
export default function StudyTimeChartInner({ days, lang }: { days: { date: string; minutes: number }[]; lang: UiLang }) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const data = days.map((d, i) => ({
    ...d,
    label: i === days.length - 1 ? T.today[lang] : new Date(`${d.date}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short' }),
  }));
  const total = days.reduce((n, d) => n + d.minutes, 0);
  const max = Math.max(0, ...days.map((d) => d.minutes));

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">{T.title[lang]}</h3>
          <p className="text-xs text-muted-foreground">{T.sub[lang]}</p>
        </div>
        <p className="text-lg font-extrabold text-foreground tabular-nums">{fmt(total)}</p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} barSize={20} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}m`}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(108, 63, 197, 0.08)', radius: 6 }} />
          <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={`bar-${d.date}`}
                fill={max > 0 && d.minutes === max ? 'var(--primary)' : 'var(--muted)'}
                opacity={max > 0 && d.minutes === max ? 1 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
