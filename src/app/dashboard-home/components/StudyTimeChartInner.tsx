'use client';
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const studyData = [
  { day: 'Mon', minutes: 45, label: 'Mon' },
  { day: 'Tue', minutes: 90, label: 'Tue' },
  { day: 'Wed', minutes: 30, label: 'Wed' },
  { day: 'Thu', minutes: 110, label: 'Thu' },
  { day: 'Fri', minutes: 75, label: 'Fri' },
  { day: 'Sat', minutes: 140, label: 'Sat' },
  { day: 'Sun', minutes: 60, label: 'Today' },
];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const mins = payload[0].value;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-modal">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="text-sm font-bold text-primary">
        {hours > 0 ? `${hours}h ${remaining}m` : `${mins}m`}
      </p>
    </div>
  );
}

export default function StudyTimeChartInner() {
  const maxDay = studyData.reduce((a, b) => (a.minutes > b.minutes ? a : b));

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Study Time</h3>
          <p className="text-xs text-muted-foreground">This week / इस सप्ताह</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold text-foreground tabular-nums">8h 25m</p>
          <p className="text-xs text-success">+23% vs last week</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={studyData} barSize={20} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10, fontFamily: 'var(--font-sans)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}m`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(108, 63, 197, 0.08)', radius: 6 }} />
          <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
            {studyData.map((entry) => (
              <Cell
                key={`bar-${entry.day}`}
                fill={entry.day === maxDay.day ? 'var(--primary)' : 'var(--muted)'}
                opacity={entry.day === maxDay.day ? 1 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}