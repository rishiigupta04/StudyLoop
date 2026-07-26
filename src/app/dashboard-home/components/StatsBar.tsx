import React from 'react';
import Icon from '@/components/ui/AppIcon';

const stats = [
  {
    id: 'stat-videos',
    icon: 'PlayCircleIcon',
    value: '14',
    label: 'Videos Studied',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    trend: '+2 this week',
    trendUp: true,
  },
  {
    id: 'stat-notes',
    icon: 'DocumentTextIcon',
    value: '67',
    label: 'Notes Captured',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    trend: '+8 today',
    trendUp: true,
  },
  {
    id: 'stat-streak',
    icon: 'FireIcon',
    value: '5',
    label: 'Study Streak',
    color: 'text-highlight',
    bgColor: 'bg-highlight/10',
    trend: '5 days 🔥',
    trendUp: true,
  },
  {
    id: 'stat-questions',
    icon: 'ChatBubbleLeftEllipsisIcon',
    value: '143',
    label: 'Questions Asked',
    color: 'text-success',
    bgColor: 'bg-success/10',
    trend: '+12 today',
    trendUp: true,
  },
];

export default function StatsBar() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="bg-card rounded-xl border border-border p-4 stat-card-hover shadow-card"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-9 h-9 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
              <Icon
                name={stat.icon as Parameters<typeof Icon>[0]['name']}
                size={18}
                className={stat.color}
              />
            </div>
            <span className={`text-xs font-medium ${stat.trendUp ? 'text-success' : 'text-destructive'}`}>
              {stat.trend}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground tabular-nums mb-0.5">{stat.value}</p>
          <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}